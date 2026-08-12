"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "./auth";
import {
  expenseSchema,
  parseFormData,
  sanitizeSearchInput,
} from "@/lib/validations";
import type {
  Expense,
  ExpenseItem,
  Profile,
  Project,
} from "@/types/database";

export interface ExpenseWithRelations extends Expense {
  employee?: Pick<Profile, "id" | "full_name" | "employee_id"> | null;
  project?: Pick<Project, "id" | "project_code" | "name"> | null;
  items?: ExpenseItem[];
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
      employee:profiles!expenses_employee_id_fkey(id, full_name, employee_id)
    `)
    .order("created_at", { ascending: false });

  // RLS will naturally filter expenses for standard employees, but we enforce here too
  if (currentUser.role === "employee") {
    query = query.eq("employee_id", currentUser.id);
  } else if (params?.employee_id) {
    query = query.eq("employee_id", params.employee_id);
  }

  if (params?.search) {
    const safe = sanitizeSearchInput(params.search);
    if (safe) {
      query = query.or(`expense_number.ilike.%${safe}%,title.ilike.%${safe}%`);
    }
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
      employee:profiles!expenses_employee_id_fkey(id, full_name, employee_id),
      project:projects!expenses_project_id_fkey(id, project_code, name),
      items:expense_items(*)
    `)
    .eq("id", id)
    .single();

  if (error) return { data: null, error: error.message };

  const expense = data as ExpenseWithRelations;
  if (expense.items) {
    expense.items.sort((a, b) => a.sort_order - b.sort_order);
  }

  return { data: expense, error: null };
}

export async function createExpense(formData: FormData) {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return { data: null, error: "Unauthorized" };
  }

  const parsed = parseFormData(expenseSchema, formData);
  if (!parsed.success) {
    return { data: null, error: parsed.error };
  }

  const supabase = await createClient();

  // Generate sequence
  const { data: seqData, error: seqError } = await supabase.rpc(
    "next_sequence",
    { seq_name: "expense", prefix: "EXP" }
  );

  const expense_number = seqError
    ? `EXP-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`
    : (seqData as string);

  // Calculate totals
  const total_amount = parsed.data.items.reduce((sum, item) => sum + item.amount, 0);

  const insertData = {
    expense_number,
    employee_id: currentUser.id,
    category: parsed.data.category,
    title: parsed.data.title,
    description: parsed.data.description,
    total_amount,
    project_id: parsed.data.project_id,
  };

  const { data, error } = await supabase
    .from("expenses")
    .insert(insertData)
    .select("id")
    .single();

  if (error) return { data: null, error: error.message };

  const expenseId = (data as { id: string }).id;

  // Insert items
  const itemsToInsert = parsed.data.items.map((item, index) => ({
    expense_id: expenseId,
    description: item.description,
    amount: item.amount,
    sort_order: index,
  }));

  const { error: itemsError } = await supabase
    .from("expense_items")
    .insert(itemsToInsert);

  if (itemsError) return { data: null, error: itemsError.message };

  revalidatePath("/expenses");
  return { data: { id: expenseId, expense_number }, error: null };
}

export async function updateExpenseStatus(id: string, status: string) {
  const currentUser = await getCurrentUser();
  if (!currentUser || !["admin", "manager"].includes(currentUser.role)) {
    return { error: "Unauthorized. Only admins and managers can approve expenses." };
  }

  const supabase = await createClient();

  const updates: Record<string, unknown> = {
    status,
    updated_at: new Date().toISOString(),
  };

  if (status === "approved" || status === "rejected") {
    updates.approved_by = currentUser.id;
    updates.approved_at = new Date().toISOString();
  }

  const { error } = await supabase
    .from("expenses")
    .update(updates)
    .eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/expenses");
  revalidatePath(`/expenses/${id}`);
  return { error: null };
}
