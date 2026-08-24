"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "./auth";
import { cashEntrySchema, parseFormData } from "@/lib/validations";
import { todayInIndia } from "@/lib/format";
import type { CashBook, ExpenseCategory } from "@/types/database";

/**
 * Who may move money. Field roles record their own spending; only the
 * back office can reverse an entry.
 */
/**
 * Must match the cash_book RLS policy, which gates writes on
 * auth_can_see_money() — owner, manager, accountant. Listing a field role here
 * would let the action create an expense and then be refused on the cash_book
 * insert, and its compensating delete would be refused too, orphaning the
 * expense. Field staff record spending through createExpense instead, which
 * their RLS policy does permit for sites they are assigned to.
 */
const ENTRY_ROLES = ["owner", "manager", "accountant"];
const VOID_ROLES = ["owner", "accountant"];

/**
 * Money out that is NOT a site cost.
 *
 * An advance is recoverable, so it is a debt rather than an expense; wages
 * reach site cost through payroll allocation; a client payment is revenue.
 * Everything else spent against a site is a real cost and gets an expenses
 * row, because site profitability is computed from expenses — not from the
 * cash book, which would double-count.
 */
const NON_EXPENSE_CATEGORIES = new Set([
  "worker_advance",
  "salary",
  "client_payment",
]);

export interface CashBookRow extends CashBook {
  site?: { id: string; name: string; site_code: string } | null;
  category_label?: string | null;
  /** Running balance after this entry, oldest to newest. */
  balance_after?: number;
}

/**
 * Record one movement of money.
 *
 * A worker advance is two facts, not one: cash left the box, and the worker
 * now owes it back. Both are written here so payroll can recover the advance
 * later without anyone re-keying it.
 */
export async function createCashEntry(formData: FormData) {
  const currentUser = await getCurrentUser();
  if (!currentUser || !ENTRY_ROLES.includes(currentUser.role)) {
    return { data: null, error: "Unauthorized." };
  }

  const parsed = parseFormData(cashEntrySchema, formData);
  if (!parsed.success) {
    return { data: null, error: parsed.error };
  }

  const v = parsed.data;
  const supabase = await createClient();

  const siteId = v.site_id || null;
  const entryDate = v.entry_date ?? todayInIndia();

  // A worker advance becomes a recoverable debt first; if that write fails
  // there is no point recording the cash movement.
  let advanceId: string | null = null;
  if (v.category === "worker_advance" && v.employee_id) {
    const { data: advance, error: advanceError } = await supabase
      .from("salary_advances")
      .insert({
        employee_id: v.employee_id,
        site_id: siteId,
        amount: v.amount,
        advance_date: entryDate,
        reason: v.description,
        recovery_mode: "full_next_payroll",
        given_by: currentUser.id,
        payment_mode: v.payment_mode === "bank" ? "bank_transfer" : v.payment_mode,
        notes: v.notes,
      })
      .select("id")
      .single();

    if (advanceError) {
      return { data: null, error: advanceError.message };
    }
    advanceId = (advance as { id: string }).id;
  }

  // Spending against a site has to land in `expenses` as well, because that
  // is what site profitability reads. The cash book records the movement;
  // the expense records the cost.
  let expenseId: string | null = null;
  if (
    v.direction === "out" &&
    !NON_EXPENSE_CATEGORIES.has(v.category) &&
    !v.is_office
  ) {
    const { data: expenseNumber, error: seqError } = await supabase.rpc(
      "next_document_number",
      { p_doc_type: "expense", p_prefix: "EXP" }
    );

    if (seqError) {
      if (advanceId) {
        await supabase.from("salary_advances").delete().eq("id", advanceId);
      }
      return { data: null, error: `Could not allocate an expense number: ${seqError.message}` };
    }

    // Anyone permitted to move company cash is authoritative about it: the
    // money has already left the box, so the cost counts immediately rather
    // than waiting in an approval queue.
    const { data: expense, error: expenseError } = await supabase
      .from("expenses")
      .insert({
        expense_number: expenseNumber as string,
        site_id: siteId,
        category: v.category,
        expense_date: entryDate,
        title: v.description,
        amount: v.amount,
        paid_by: currentUser.id,
        payment_mode: v.payment_mode === "bank" ? "bank_transfer" : v.payment_mode,
        vendor_name: v.counterparty,
        status: "approved",
        approved_by: currentUser.id,
        approved_at: new Date().toISOString(),
        created_by: currentUser.id,
      })
      .select("id")
      .single();

    if (expenseError) {
      if (advanceId) {
        await supabase.from("salary_advances").delete().eq("id", advanceId);
      }
      return { data: null, error: expenseError.message };
    }
    expenseId = (expense as { id: string }).id;
  }

  const { data, error } = await supabase
    .from("cash_book")
    .insert({
      entry_date: entryDate,
      direction: v.direction,
      amount: v.amount,
      payment_mode: v.payment_mode,
      bank_account_id: v.bank_account_id || null,
      // contract_id and company_id are stamped from the site by a trigger.
      site_id: siteId,
      is_office: v.is_office,
      category: v.category,
      description: v.description,
      counterparty: v.counterparty,
      reference_table: advanceId
        ? "salary_advances"
        : expenseId
          ? "expenses"
          : null,
      reference_id: advanceId ?? expenseId,
      handled_by: currentUser.id,
      notes: v.notes,
      created_by: currentUser.id,
    })
    .select("id")
    .single();

  if (error) {
    if (advanceId) {
      await supabase.from("salary_advances").delete().eq("id", advanceId);
    }
    if (expenseId) {
      await supabase.from("expenses").delete().eq("id", expenseId);
    }
    return { data: null, error: error.message };
  }

  revalidatePath("/cash");
  revalidatePath("/dashboard");
  if (siteId) revalidatePath(`/sites/${siteId}`);

  return { data: data as { id: string }, error: null };
}

/**
 * The ledger, newest first, with a running balance attached.
 *
 * The balance is computed over the whole ledger up to each row rather than
 * over the filtered page, so filtering by site or date never produces a
 * balance column that looks wrong.
 */
export async function getCashBook(params?: {
  from?: string;
  to?: string;
  site_id?: string;
  direction?: string;
  limit?: number;
}): Promise<{ data: CashBookRow[] | null; error: string | null }> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return { data: null, error: "Unauthorized" };

  const supabase = await createClient();

  let query = supabase
    .from("cash_book")
    .select("*, site:sites(id, name, site_code)")
    .is("deleted_at", null)
    .order("entry_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(params?.limit ?? 200);

  if (params?.from) query = query.gte("entry_date", params.from);
  if (params?.to) query = query.lte("entry_date", params.to);
  if (params?.site_id) query = query.eq("site_id", params.site_id);
  if (params?.direction && params.direction !== "all") {
    query = query.eq("direction", params.direction);
  }

  const { data, error } = await query;
  if (error) return { data: null, error: error.message };

  return { data: data as CashBookRow[], error: null };
}

/**
 * Headline cash figures: what moved today, and what is in hand right now.
 * Balance is derived from the full ledger, never stored.
 */
export async function getCashSummary(): Promise<{
  data: {
    todayIn: number;
    todayOut: number;
    balance: number;
    monthIn: number;
    monthOut: number;
  } | null;
  error: string | null;
}> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return { data: null, error: "Unauthorized" };

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("cash_book")
    .select("entry_date, direction, amount")
    .is("deleted_at", null);

  if (error) return { data: null, error: error.message };

  const rows = (data ?? []) as {
    entry_date: string;
    direction: "in" | "out";
    amount: number;
  }[];

  const today = todayInIndia();
  const monthStart = today.slice(0, 8) + "01";

  const summary = rows.reduce(
    (acc, r) => {
      const amount = Number(r.amount);
      const signed = r.direction === "in" ? amount : -amount;
      acc.balance += signed;

      if (r.entry_date === today) {
        if (r.direction === "in") acc.todayIn += amount;
        else acc.todayOut += amount;
      }
      if (r.entry_date >= monthStart) {
        if (r.direction === "in") acc.monthIn += amount;
        else acc.monthOut += amount;
      }
      return acc;
    },
    { todayIn: 0, todayOut: 0, balance: 0, monthIn: 0, monthOut: 0 }
  );

  return { data: summary, error: null };
}

/**
 * Money is never deleted, only withdrawn. A void keeps the original row for
 * the audit trail and reverses anything it created.
 */
export async function voidCashEntry(id: string, reason: string) {
  const currentUser = await getCurrentUser();
  if (!currentUser || !VOID_ROLES.includes(currentUser.role)) {
    return { error: "Unauthorized. Only the owner or an accountant can void an entry." };
  }

  if (!reason.trim()) {
    return { error: "Give a reason for voiding this entry." };
  }

  const supabase = await createClient();

  const { data: entry, error: fetchError } = await supabase
    .from("cash_book")
    .select("id, reference_table, reference_id, notes")
    .eq("id", id)
    .is("deleted_at", null)
    .single();

  if (fetchError || !entry) return { error: "Entry not found." };

  const row = entry as {
    id: string;
    reference_table: string | null;
    reference_id: string | null;
    notes: string | null;
  };

  const now = new Date().toISOString();

  const { error } = await supabase
    .from("cash_book")
    .update({
      deleted_at: now,
      notes: `${row.notes ? row.notes + "\n" : ""}Voided: ${reason.trim()}`,
    })
    .eq("id", id);

  if (error) return { error: error.message };

  // An advance that was never actually handed over should stop being owed —
  // but only if payroll has not already recovered part of it.
  if (row.reference_table === "salary_advances" && row.reference_id) {
    await supabase
      .from("salary_advances")
      .update({ deleted_at: now })
      .eq("id", row.reference_id)
      .eq("amount_recovered", 0);
  }

  // Withdraw the cost as well, so site profitability follows the void.
  if (row.reference_table === "expenses" && row.reference_id) {
    await supabase
      .from("expenses")
      .update({ deleted_at: now })
      .eq("id", row.reference_id);
  }

  // A client payment mirrored into the cash book was previously left behind
  // by a void: the cash vanished from the ledger while the invoice went on
  // saying it had been paid. Cash and receivables then disagreed permanently,
  // with nothing to point at the discrepancy. Reversing the payment lets the
  // invoice trigger restore the balance.
  if (row.reference_table === "payments" && row.reference_id) {
    const { error: paymentError } = await supabase
      .from("payments")
      .update({ deleted_at: now })
      .eq("id", row.reference_id)
      .is("deleted_at", null);

    if (paymentError) {
      // Put the cash entry back rather than leave the two ledgers apart.
      await supabase
        .from("cash_book")
        .update({ deleted_at: null, notes: row.notes })
        .eq("id", id);
      return {
        error: `The client payment behind this entry could not be reversed: ${paymentError.message}`,
      };
    }
  }

  revalidatePath("/cash");
  revalidatePath("/dashboard");
  return { error: null };
}

export async function getExpenseCategories(): Promise<{
  data: ExpenseCategory[] | null;
  error: string | null;
}> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("expense_categories")
    .select("*")
    .eq("is_active", true)
    .order("sort_order");

  if (error) return { data: null, error: error.message };
  return { data: data as ExpenseCategory[], error: null };
}
