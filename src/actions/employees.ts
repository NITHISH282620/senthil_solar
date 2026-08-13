"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "./auth";
import {
  createEmployeeSchema,
  updateEmployeeSchema,
  parseFormData,
  sanitizeSearchInput,
} from "@/lib/validations";
import type { Profile } from "@/types/database";

/** The form still speaks in employee types; profiles.wage_mode is the column. */
const WAGE_MODE_BY_EMPLOYEE_TYPE = {
  daily_wage: "daily",
  monthly_salary: "monthly",
} as const;

/**
 * Fetch all employees with optional search & filters
 */
export async function getEmployees(params?: {
  search?: string;
  role?: string;
  department?: string;
  status?: string;
}): Promise<{ data: Profile[] | null; error: string | null }> {
  const supabase = await createClient();

  let query = supabase
    .from("profiles")
    .select("*")
    .order("created_at", { ascending: false });

  if (params?.search) {
    const safe = sanitizeSearchInput(params.search);
    if (safe) {
      query = query.or(
        `full_name.ilike.%${safe}%,email.ilike.%${safe}%,employee_code.ilike.%${safe}%`
      );
    }
  }

  if (params?.role && params.role !== "all") {
    query = query.eq("role", params.role);
  }

  if (params?.department && params.department !== "all") {
    query = query.eq("department", params.department);
  }

  if (params?.status === "active") {
    query = query.eq("is_active", true);
  } else if (params?.status === "inactive") {
    query = query.eq("is_active", false);
  }

  const { data, error } = await query;

  if (error) {
    return { data: null, error: error.message };
  }

  return { data: data as Profile[], error: null };
}

/**
 * Get a single employee by ID
 */
export async function getEmployee(
  id: string
): Promise<{ data: Profile | null; error: string | null }> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    return { data: null, error: error.message };
  }

  return { data: data as Profile, error: null };
}

/**
 * Create a new employee (Admin only)
 */
export async function createEmployee(formData: FormData) {
  const currentUser = await getCurrentUser();
  if (!currentUser || currentUser.role !== "owner") {
    return { data: null, error: "Unauthorized. Only admins can create employees." };
  }

  const parsed = parseFormData(createEmployeeSchema, formData);
  if (!parsed.success) {
    return { data: null, error: parsed.error };
  }

  const v = parsed.data;

  // Use admin client to create auth user (bypasses RLS)
  const adminSupabase = createAdminClient();

  const { data: authData, error: authError } =
    await adminSupabase.auth.admin.createUser({
      email: v.email,
      password: v.password,
      email_confirm: true,
    });

  if (authError) {
    return { data: null, error: authError.message };
  }

  // The handle_new_user trigger already created the profile row and allocated
  // its employee_code, so fill in the rest rather than inserting a second row.
  const { data: profileRow, error: profileError } = await adminSupabase
    .from("profiles")
    .update({
      full_name: v.full_name,
      phone: v.phone,
      role: v.role,
      department: v.department,
      designation: v.designation,
      date_of_joining: v.date_of_joining,
      wage_mode: WAGE_MODE_BY_EMPLOYEE_TYPE[v.employee_type],
      daily_rate: v.daily_rate,
      monthly_salary: v.monthly_salary,
      ot_rate_per_hour: v.ot_rate_per_hour,
      bank_account_no: v.bank_account_no,
      bank_ifsc: v.bank_ifsc,
      bank_name: v.bank_name,
      aadhaar_number: v.aadhar_number,
      address: v.address,
      emergency_contact_name: v.emergency_contact_name,
      emergency_contact_phone: v.emergency_contact_phone,
      reports_to: v.manager_id,
      is_active: true,
      updated_at: new Date().toISOString(),
    })
    .eq("id", authData.user.id)
    .select("employee_code")
    .single();

  if (profileError) {
    await adminSupabase.auth.admin.deleteUser(authData.user.id);
    return { data: null, error: profileError.message };
  }

  revalidatePath("/employees");
  return {
    data: {
      id: authData.user.id,
      employee_code: (profileRow as { employee_code: string }).employee_code,
    },
    error: null,
  };
}

/**
 * Update an employee profile
 */
export async function updateEmployee(id: string, formData: FormData) {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return { error: "Unauthorized." };
  }

  if (currentUser.role !== "owner" && currentUser.id !== id) {
    return { error: "Unauthorized. Only admins can edit other employees." };
  }

  const parsed = parseFormData(updateEmployeeSchema, formData);
  if (!parsed.success) {
    return { error: parsed.error };
  }

  const v = parsed.data;
  const supabase = await createClient();

  const updates: Record<string, unknown> = {
    full_name: v.full_name,
    phone: v.phone,
    department: v.department,
    designation: v.designation,
    address: v.address,
    emergency_contact_name: v.emergency_contact_name,
    emergency_contact_phone: v.emergency_contact_phone,
    updated_at: new Date().toISOString(),
  };

  if (currentUser.role === "owner") {
    if (v.role) updates.role = v.role;
    if (v.employee_type)
      updates.wage_mode = WAGE_MODE_BY_EMPLOYEE_TYPE[v.employee_type];
    updates.daily_rate = v.daily_rate;
    updates.monthly_salary = v.monthly_salary;
    updates.ot_rate_per_hour = v.ot_rate_per_hour;
    updates.bank_account_no = v.bank_account_no;
    updates.bank_ifsc = v.bank_ifsc;
    updates.bank_name = v.bank_name;
    updates.aadhaar_number = v.aadhar_number;
    if (v.date_of_joining) updates.date_of_joining = v.date_of_joining;
    updates.reports_to = v.manager_id;
    updates.is_active = v.is_active;
  }

  const { error } = await supabase
    .from("profiles")
    .update(updates)
    .eq("id", id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/employees");
  revalidatePath(`/employees/${id}`);
  return { error: null };
}

/**
 * Toggle employee active status
 */
export async function toggleEmployeeStatus(id: string, isActive: boolean) {
  const currentUser = await getCurrentUser();
  if (!currentUser || currentUser.role !== "owner") {
    return { error: "Unauthorized." };
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from("profiles")
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/employees");
  return { error: null };
}

/**
 * Get managers list for dropdown
 */
export async function getManagers(): Promise<{
  data: { id: string; full_name: string; employee_code: string }[] | null;
  error: string | null;
}> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, employee_code")
    .in("role", ["owner", "manager"])
    .eq("is_active", true)
    .order("full_name");

  if (error) return { data: null, error: error.message };
  return {
    data: data as { id: string; full_name: string; employee_code: string }[],
    error: null,
  };
}
