"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "./auth";
import {
  leaveRequestSchema,
  leaveStatusSchema,
  parseFormData,
} from "@/lib/validations";
import type { Attendance, LeaveRequest, Profile } from "@/types/database";

export interface AttendanceWithProfile extends Attendance {
  employee?: Pick<Profile, "full_name" | "employee_code"> | null;
}

export interface LeaveRequestWithProfile extends LeaveRequest {
  employee?: Pick<Profile, "full_name" | "employee_code"> | null;
}

// ─── Attendance ─────────────────────────────────────────────────────────────

export async function getAttendance(params?: {
  employee_id?: string;
  month?: string; // Format: YYYY-MM
  date?: string;  // Format: YYYY-MM-DD
}): Promise<{
  data: AttendanceWithProfile[] | null;
  error: string | null;
}> {
  const supabase = await createClient();
  const currentUser = await getCurrentUser();

  if (!currentUser) return { data: null, error: "Unauthorized" };

  let query = supabase
    .from("attendance")
    .select(`
      *,
      employee:profiles!attendance_employee_id_fkey(full_name, employee_code)
    `)
    .order("date", { ascending: false });

  if (currentUser.role === "worker") {
    query = query.eq("employee_id", currentUser.id);
  } else if (params?.employee_id) {
    query = query.eq("employee_id", params.employee_id);
  }

  if (params?.date) {
    query = query.eq("date", params.date);
  } else if (params?.month) {
    // Example: "2023-10"
    const startDate = `${params.month}-01`;
    // Create end date by adding 1 month and subtracting 1 day via string manipulation or simple JS
    const dateObj = new Date(`${params.month}-01`);
    dateObj.setMonth(dateObj.getMonth() + 1);
    dateObj.setDate(0); // last day of month
    const endDate = dateObj.toISOString().split("T")[0];
    
    query = query.gte("date", startDate).lte("date", endDate);
  }

  const { data, error } = await query;
  if (error) return { data: null, error: error.message };

  return { data: data as AttendanceWithProfile[], error: null };
}

export async function checkIn(location_lat?: number, location_lng?: number) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return { error: "Unauthorized" };

  const supabase = await createClient();
  const today = new Date().toISOString().split("T")[0];
  const now = new Date().toISOString();

  // Upsert attendance for today
  const { error } = await supabase
    .from("attendance")
    .upsert(
      {
        employee_id: currentUser.id,
        date: today,
        check_in_at: now,
        status: "present",
        check_in_lat: location_lat || null,
        check_in_lng: location_lng || null,
      },
      { onConflict: "employee_id,date" }
    );

  if (error) return { error: error.message };

  revalidatePath("/attendance/my-attendance");
  return { error: null };
}

export async function checkOut() {
  const currentUser = await getCurrentUser();
  if (!currentUser) return { error: "Unauthorized" };

  const supabase = await createClient();
  const today = new Date().toISOString().split("T")[0];
  const now = new Date().toISOString();

  // Ensure they have checked in today
  const { data: existing, error: fetchError } = await supabase
    .from("attendance")
    .select("id")
    .eq("employee_id", currentUser.id)
    .eq("date", today)
    .single();

  if (fetchError || !existing) {
    return { error: "You must check in first." };
  }

  const { error } = await supabase
    .from("attendance")
    .update({ check_out_at: now })
    .eq("id", existing.id);

  if (error) return { error: error.message };

  revalidatePath("/attendance/my-attendance");
  return { error: null };
}

export async function updateAttendanceStatus(id: string, status: string, notes?: string) {
  const currentUser = await getCurrentUser();
  if (!currentUser || !["owner", "manager"].includes(currentUser.role)) {
    return { error: "Unauthorized." };
  }

  const supabase = await createClient();
  const updates: Record<string, unknown> = { status };
  if (notes) updates.notes = notes;

  const { error } = await supabase
    .from("attendance")
    .update(updates)
    .eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/attendance");
  return { error: null };
}

// ─── Leave Requests ─────────────────────────────────────────────────────────

export async function getLeaveRequests(params?: {
  employee_id?: string;
  status?: string;
}): Promise<{
  data: LeaveRequestWithProfile[] | null;
  error: string | null;
}> {
  const supabase = await createClient();
  const currentUser = await getCurrentUser();

  if (!currentUser) return { data: null, error: "Unauthorized" };

  let query = supabase
    .from("leave_requests")
    .select(`
      *,
      employee:profiles!leave_requests_employee_id_fkey(full_name, employee_code)
    `)
    .order("created_at", { ascending: false });

  if (currentUser.role === "worker") {
    query = query.eq("employee_id", currentUser.id);
  } else if (params?.employee_id) {
    query = query.eq("employee_id", params.employee_id);
  }

  if (params?.status && params.status !== "all") {
    query = query.eq("status", params.status);
  }

  const { data, error } = await query;
  if (error) return { data: null, error: error.message };

  return { data: data as LeaveRequestWithProfile[], error: null };
}

export async function submitLeaveRequest(formData: FormData) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return { error: "Unauthorized" };

  const parsed = parseFormData(leaveRequestSchema, formData);
  if (!parsed.success) return { error: parsed.error };

  const supabase = await createClient();

  const { error } = await supabase
    .from("leave_requests")
    .insert({
      employee_id: currentUser.id,
      ...parsed.data,
    });

  if (error) return { error: error.message };

  revalidatePath("/attendance/leaves");
  return { error: null };
}

export async function updateLeaveStatus(id: string, formData: FormData) {
  const currentUser = await getCurrentUser();
  if (!currentUser || !["owner", "manager"].includes(currentUser.role)) {
    return { error: "Unauthorized." };
  }

  const parsed = parseFormData(leaveStatusSchema, formData);
  if (!parsed.success) return { error: parsed.error };

  const supabase = await createClient();

  // If approved, we optionally might want to insert 'leave' records into attendance table 
  // for the days covered. For this implementation, we will just approve the request.
  
  const { error } = await supabase
    .from("leave_requests")
    .update({
      status: parsed.data.status,
      approved_by: currentUser.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/attendance/leaves");
  return { error: null };
}
