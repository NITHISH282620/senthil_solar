"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "./auth";
import type {
  Expense,
  Profile,
  Contract,
} from "@/types/database";

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

export async function createExpense(formData: FormData) {
  // Stubbed out for now
  return { error: "Not implemented" };
}

export async function updateExpenseStatus(
  expenseId: string,
  newStatus: string,
  rejectionReason?: string
) {
  // Stubbed out for now
  return { error: "Not implemented" };
}
