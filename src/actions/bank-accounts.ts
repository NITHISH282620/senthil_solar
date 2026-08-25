"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "./auth";
import { bankAccountSchema, parseFormData } from "@/lib/validations";
import type { BankAccount } from "@/types/database";

/**
 * The company's own bank accounts.
 *
 * The table and its RLS have existed since the first migration and nothing ever
 * read or wrote them. That was not cosmetic: cash_book carries
 *   CHECK (payment_mode <> 'bank' OR bank_account_id IS NOT NULL)
 * so with no bank account on file, every payment by bank transfer or cheque
 * failed on a raw constraint violation — and bank transfer is the default in
 * the payment dialog and the normal way a corporate client pays. Money in and
 * money out through a bank were both unrecordable.
 */
export async function getBankAccounts(): Promise<{
  data: BankAccount[] | null;
  error: string | null;
}> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return { data: null, error: "Unauthorized" };

  const supabase = await createClient();

  // RLS already limits this to owner, manager and accountant.
  const { data, error } = await supabase
    .from("bank_accounts")
    .select("*")
    .is("deleted_at", null)
    .eq("is_active", true)
    .order("is_primary", { ascending: false })
    .order("bank_name");

  if (error) return { data: null, error: error.message };
  return { data: data as BankAccount[], error: null };
}

export async function createBankAccount(formData: FormData) {
  const currentUser = await getCurrentUser();
  if (!currentUser || currentUser.role !== "owner") {
    return { error: "Unauthorized. Only the owner can add a bank account." };
  }

  const parsed = parseFormData(bankAccountSchema, formData);
  if (!parsed.success) return { error: parsed.error };

  const supabase = await createClient();
  const v = parsed.data;

  // Exactly one account may be primary; the schema enforces it with a partial
  // unique index, so stand the old one down first rather than colliding.
  if (v.is_primary) {
    await supabase
      .from("bank_accounts")
      .update({ is_primary: false })
      .eq("is_primary", true)
      .is("deleted_at", null);
  }

  const { error } = await supabase.from("bank_accounts").insert({
    account_name: v.account_name,
    bank_name: v.bank_name,
    account_number: v.account_number,
    ifsc: v.ifsc.toUpperCase(),
    branch: v.branch,
    account_type: v.account_type,
    opening_balance: v.opening_balance,
    is_primary: v.is_primary,
  });

  if (error) return { error: error.message };

  revalidatePath("/settings");
  revalidatePath("/cash");
  return { error: null };
}

/**
 * Retire an account. Never deleted: cash_book and payments reference it, and
 * the history of where money actually went has to stay readable.
 */
export async function deactivateBankAccount(id: string) {
  const currentUser = await getCurrentUser();
  if (!currentUser || currentUser.role !== "owner") {
    return { error: "Unauthorized. Only the owner can retire a bank account." };
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from("bank_accounts")
    .update({ is_active: false, is_primary: false })
    .eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/settings");
  return { error: null };
}
