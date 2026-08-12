"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "./auth";
import {
  createCustomerSchema,
  parseFormData,
  sanitizeSearchInput,
} from "@/lib/validations";
import type { Customer } from "@/types/database";

/**
 * Fetch all customers with optional search & filters
 */
export async function getCustomers(params?: {
  search?: string;
  status?: string;
  source?: string;
}): Promise<{
  data: (Customer & { assigned_profile?: { full_name: string } | null })[] | null;
  error: string | null;
}> {
  const supabase = await createClient();

  let query = supabase
    .from("customers")
    .select("*, assigned_profile:profiles!customers_assigned_to_fkey(full_name)")
    .order("created_at", { ascending: false });

  if (params?.search) {
    const safe = sanitizeSearchInput(params.search);
    if (safe) {
      query = query.or(
        `name.ilike.%${safe}%,phone.ilike.%${safe}%,email.ilike.%${safe}%,customer_id.ilike.%${safe}%,city.ilike.%${safe}%`
      );
    }
  }

  if (params?.status && params.status !== "all") {
    query = query.eq("status", params.status);
  }

  if (params?.source && params.source !== "all") {
    query = query.eq("source", params.source);
  }

  const { data, error } = await query;

  if (error) {
    return { data: null, error: error.message };
  }

  return {
    data: data as (Customer & { assigned_profile?: { full_name: string } | null })[],
    error: null,
  };
}

/**
 * Get a single customer by ID
 */
export async function getCustomer(
  id: string
): Promise<{ data: Customer | null; error: string | null }> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("customers")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    return { data: null, error: error.message };
  }

  return { data: data as Customer, error: null };
}

/**
 * Create a new customer
 */
export async function createCustomer(formData: FormData) {
  const currentUser = await getCurrentUser();
  if (!currentUser || !["admin", "manager"].includes(currentUser.role)) {
    return { error: "Unauthorized. Only admins and managers can create customers." };
  }

  const parsed = parseFormData(createCustomerSchema, formData);
  if (!parsed.success) {
    return { error: parsed.error };
  }

  const v = parsed.data;
  const supabase = await createClient();

  // Generate customer ID using database sequence
  const { data: seqData, error: seqError } = await supabase.rpc(
    "next_sequence",
    { seq_name: "customer", prefix: "CUST" }
  );

  const customer_id = seqError
    ? `CUST-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`
    : (seqData as string);

  const customerData: Record<string, unknown> = {
    customer_id,
    ...v,
    created_by: currentUser.id,
  };

  const { data, error } = await supabase
    .from("customers")
    .insert(customerData)
    .select("id")
    .single();

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/customers");
  return { data: { id: (data as { id: string }).id, customer_id }, error: null };
}

/**
 * Update a customer
 */
export async function updateCustomer(id: string, formData: FormData) {
  const currentUser = await getCurrentUser();
  if (!currentUser || !["admin", "manager"].includes(currentUser.role)) {
    return { error: "Unauthorized." };
  }

  const parsed = parseFormData(createCustomerSchema, formData);
  if (!parsed.success) {
    return { error: parsed.error };
  }

  const supabase = await createClient();

  const updates: Record<string, unknown> = {
    ...parsed.data,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("customers")
    .update(updates)
    .eq("id", id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/customers");
  revalidatePath(`/customers/${id}`);
  return { error: null };
}

/**
 * Get all employees for assignment dropdowns
 */
export async function getEmployeesForAssignment(): Promise<{
  data: { id: string; full_name: string; employee_id: string }[] | null;
  error: string | null;
}> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, employee_id")
    .eq("is_active", true)
    .order("full_name");

  if (error) return { data: null, error: error.message };
  return {
    data: data as { id: string; full_name: string; employee_id: string }[],
    error: null,
  };
}
