"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "./auth";
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
      status: selfApproved ? "approved" : "pending",
      approved_by: selfApproved ? currentUser.id : null,
      approved_at: selfApproved ? new Date().toISOString() : null,
      created_by: currentUser.id,
    })
    .select("id, expense_number")
    .single();

  if (error) return { data: null, error: error.message };

  revalidatePath("/expenses");
  revalidatePath("/dashboard");
  if (v.site_id) revalidatePath(`/sites/${v.site_id}`);

  return { data: data as { id: string; expense_number: string }, error: null };
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
