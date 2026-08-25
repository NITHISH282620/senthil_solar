"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "./auth";
import { logFailure } from "@/lib/observability";
import { todayInIndia } from "@/lib/format";
import { isDuplicateKey } from "@/lib/utils";
import {
  expenseSchema,
  expenseApprovalSchema,
  parseFormData,
} from "@/lib/validations";
import type {
  Expense,
  Profile,
  Contract,
} from "@/types/database";

/** Matches auth_can_see_money() in the database. */
const MONEY_ROLES = ["owner", "manager", "accountant"];

export interface ExpenseWithRelations extends Expense {
  employee?: Pick<Profile, "id" | "full_name" | "employee_code"> | null;
  contract?: Pick<Contract, "id" | "contract_number" | "title"> | null;
}

export async function getExpenses(params?: {
  search?: string;
  status?: string;
  employee_id?: string;
}): Promise<{
  data: ExpenseWithRelations[] | null;
  error: string | null;
}> {
  const supabase = await createClient();
  const currentUser = await getCurrentUser();

  if (!currentUser) return { data: null, error: "Unauthorized" };

  let query = supabase
    .from("expenses")
    .select(`
      *,
      employee:profiles!expenses_paid_by_fkey(id, full_name, employee_code)
    `)
    .order("created_at", { ascending: false });

  if (currentUser.role === "worker") {
    query = query.eq("paid_by", currentUser.id);
  } else if (params?.employee_id) {
    query = query.eq("paid_by", params.employee_id);
  }

  if (params?.search) {
    query = query.or(`expense_number.ilike.%${params.search}%,title.ilike.%${params.search}%`);
  }

  if (params?.status && params.status !== "all") {
    query = query.eq("status", params.status);
  }

  const { data, error } = await query;
  if (error) return { data: null, error: error.message };

  return { data: data as ExpenseWithRelations[], error: null };
}

export async function getExpense(
  id: string
): Promise<{ data: ExpenseWithRelations | null; error: string | null }> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("expenses")
    .select(`
      *,
      employee:profiles!expenses_paid_by_fkey(id, full_name, employee_code),
      contract:contracts!expenses_contract_id_fkey(id, contract_number, title)
    `)
    .eq("id", id)
    .single();

  if (error) return { data: null, error: error.message };

  return { data: data as ExpenseWithRelations, error: null };
}

/**
 * Record spending from the field.
 *
 * This is the path for engineers and supervisors, whose RLS policy permits
 * inserting an expense against a site they are assigned to. It deliberately
 * does not touch the cash book: only money roles may write that ledger, and
 * an unapproved field claim is not yet a treasury movement.
 */
export async function createExpense(formData: FormData) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return { data: null, error: "Unauthorized" };

  const parsed = parseFormData(expenseSchema, formData);
  if (!parsed.success) return { data: null, error: parsed.error };

  const v = parsed.data;
  const supabase = await createClient();

  // See cash_book.request_key. Without this a retry on a weak site connection
  // books the same diesel twice against the same site.
  const requestKey = (formData.get("request_key") as string) || null;

  if (requestKey) {
    const { data: existing } = await supabase
      .from("expenses")
      .select("id, expense_number")
      .eq("request_key", requestKey)
      .maybeSingle();

    if (existing) {
      return { data: existing as { id: string; expense_number: string }, error: null };
    }
  }

  const { data: expenseNumber, error: seqError } = await supabase.rpc(
    "next_document_number",
    { p_doc_type: "expense", p_prefix: "EXP" }
  );

  if (seqError) {
    return { data: null, error: `Could not allocate an expense number: ${seqError.message}` };
  }

  // Money roles are recording spending that has already happened; everyone
  // else is making a claim that needs approving.
  const selfApproved = MONEY_ROLES.includes(currentUser.role);

  const { data, error } = await supabase
    .from("expenses")
    .insert({
      expense_number: expenseNumber as string,
      // contract_id and company_id are stamped from the site by a trigger.
      site_id: v.site_id,
      category: v.category,
      expense_date: v.expense_date,
      title: v.title,
      description: v.description,
      amount: v.amount,
      head_count: v.head_count,
      meal_type: v.meal_type,
      paid_by: currentUser.id,
      payment_mode: v.payment_mode,
      vendor_name: v.vendor_name,
      receipt_url: v.receipt_url,
      // Money roles recording spending are moving company cash from the box;
      // field staff are claiming back money they spent themselves. The two are
      // structurally identical rows and must never be added together — see
      // paid_from's comment in migration 0013.
      paid_from: selfApproved ? "company" : "employee",
      status: selfApproved ? "approved" : "pending",
      approved_by: selfApproved ? currentUser.id : null,
      approved_at: selfApproved ? new Date().toISOString() : null,
      created_by: currentUser.id,
      request_key: requestKey,
    })
    .select("id, expense_number")
    .single();

  if (isDuplicateKey(error, "expenses_request_key_uniq")) {
    const { data: existing } = await supabase
      .from("expenses").select("id, expense_number").eq("request_key", requestKey!).maybeSingle();
    if (existing) {
      return { data: existing as { id: string; expense_number: string }, error: null };
    }
  }

  if (error) return { data: null, error: error.message };

  revalidatePath("/expenses");
  revalidatePath("/dashboard");
  if (v.site_id) revalidatePath(`/sites/${v.site_id}`);

  return { data: data as { id: string; expense_number: string }, error: null };
}

/**
 * Pay an employee back for money they spent on the company's behalf.
 *
 * 'reimbursed' existed in the schema and in the status badge, and nothing ever
 * set it. An approved claim was therefore recognised as a site cost and then
 * never paid: cash in hand was overstated by every claim ever approved, and the
 * supervisor who bought the diesel was never paid back by the system that
 * recorded him doing it.
 *
 * Reimbursement is the moment company cash actually moves, so this is where the
 * cash-book entry belongs — not at approval, which only recognises the cost.
 */
export async function reimburseExpense(
  expenseId: string,
  paymentMode: "cash" | "upi" | "bank" | "card" = "cash",
  bankAccountId?: string,
) {
  const currentUser = await getCurrentUser();
  if (!currentUser || !MONEY_ROLES.includes(currentUser.role)) {
    return { error: "Unauthorized. Only the owner, a manager or an accountant can reimburse." };
  }

  const supabase = await createClient();

  const { data: expense, error: fetchError } = await supabase
    .from("expenses")
    .select("id, expense_number, amount, status, paid_from, paid_by, site_id, title")
    .eq("id", expenseId)
    .is("deleted_at", null)
    .single();

  if (fetchError || !expense) return { error: "Expense not found." };

  const e = expense as {
    expense_number: string;
    amount: number;
    status: string;
    paid_from: string;
    paid_by: string | null;
    site_id: string | null;
    title: string;
  };

  if (e.paid_from !== "employee") {
    return {
      error: "This was paid from company cash, so there is nobody to reimburse.",
    };
  }
  if (e.status === "reimbursed") return { error: "This claim has already been reimbursed." };
  if (e.status !== "approved") {
    return { error: `Approve this claim before reimbursing it (it is ${e.status}).` };
  }
  if (paymentMode === "bank" && !bankAccountId) {
    return { error: "Choose which bank account the reimbursement goes from." };
  }

  // The cash movement is written first: marking the claim reimbursed and then
  // failing to record the cash would tell the employee they had been paid while
  // the ledger disagreed.
  const { data: cashRow, error: cashError } = await supabase
    .from("cash_book")
    .insert({
      entry_date: todayInIndia(),
      direction: "out",
      amount: e.amount,
      payment_mode: paymentMode,
      bank_account_id: bankAccountId ?? null,
      site_id: e.site_id,
      is_office: e.site_id === null,
      // Deliberately no category: the cost was already recognised against the
      // site when the claim was approved, and giving this entry an expense
      // category would let createCashEntry's mirroring logic count it twice.
      description: `Reimbursement of ${e.expense_number} — ${e.title}`,
      reference_table: "expenses",
      reference_id: expenseId,
      handled_by: currentUser.id,
      created_by: currentUser.id,
    })
    .select("id")
    .single();

  if (cashError) {
    logFailure("reimburseExpense.cashBook", cashError.message, {
      expense: e.expense_number,
      amount: e.amount,
      payee: e.paid_by,
    });
    return { error: `Reimbursement could not be posted to the cash book: ${cashError.message}` };
  }

  const { error } = await supabase
    .from("expenses")
    .update({ status: "reimbursed" })
    .eq("id", expenseId);

  if (error) {
    await supabase.from("cash_book").delete().eq("id", (cashRow as { id: string }).id);
    return { error: error.message };
  }

  revalidatePath("/expenses");
  revalidatePath(`/expenses/${expenseId}`);
  revalidatePath("/cash");
  revalidatePath("/dashboard");
  return { error: null };
}

/**
 * Approve or reject a claim. Approval is what admits the amount into site
 * profitability, since v_site_financials counts only approved and reimbursed
 * expenses — so this is a financial act, not just a status change.
 */
export async function updateExpenseStatus(
  expenseId: string,
  newStatus: string,
  rejectionReason?: string
) {
  const currentUser = await getCurrentUser();
  if (!currentUser || !MONEY_ROLES.includes(currentUser.role)) {
    return { error: "Unauthorized. Only the owner, a manager or an accountant can approve expenses." };
  }

  const parsed = expenseApprovalSchema.safeParse({
    status: newStatus,
    rejection_reason: rejectionReason,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid status." };
  }

  // The table has a check constraint requiring a reason on rejection; catch it
  // here so the user gets a sentence rather than a constraint violation.
  if (parsed.data.status === "rejected" && !parsed.data.rejection_reason) {
    return { error: "Give a reason for rejecting this expense." };
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from("expenses")
    .update({
      status: parsed.data.status,
      approved_by: currentUser.id,
      approved_at: new Date().toISOString(),
      rejection_reason:
        parsed.data.status === "rejected" ? parsed.data.rejection_reason : null,
    })
    .eq("id", expenseId);

  if (error) return { error: error.message };

  revalidatePath("/expenses");
  revalidatePath(`/expenses/${expenseId}`);
  revalidatePath("/dashboard");
  return { error: null };
}
