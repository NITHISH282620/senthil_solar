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

/**
 * Sites this person is currently assigned to. Attendance is site-scoped, so
 * check-in needs to know which one — and the answer is usually exactly one.
 */
export async function getMyAssignedSites(): Promise<{
  data: { id: string; name: string; site_code: string }[] | null;
  error: string | null;
}> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return { data: null, error: "Unauthorized" };

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("site_assignments")
    .select("site:sites(id, name, site_code)")
    .eq("employee_id", currentUser.id)
    .eq("is_active", true)
    .is("deleted_at", null);

  if (error) return { data: null, error: error.message };

  const rows = (data ?? []) as unknown as {
    site: { id: string; name: string; site_code: string } | null;
  }[];

  return { data: rows.flatMap((r) => (r.site ? [r.site] : [])), error: null };
}

/**
 * Check in at a site.
 *
 * attendance.site_id is NOT NULL and the day is unique per
 * (employee, site, date) — deliberately, so one person can legitimately
 * appear at two sites in a day without the row collapsing. The geofence
 * verdict is computed by a trigger from the coordinates passed here.
 */
export async function checkIn(
  siteId: string,
  location_lat?: number,
  location_lng?: number
) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return { error: "Unauthorized" };

  if (!siteId) {
    return { error: "Choose which site you are at." };
  }

  const supabase = await createClient();
  const today = new Date().toISOString().split("T")[0];
  const now = new Date().toISOString();

  const { error } = await supabase.from("attendance").upsert(
    {
      employee_id: currentUser.id,
      site_id: siteId,
      date: today,
      check_in_at: now,
      status: "present",
      day_fraction: 1.0,
      source: "self",
      marked_by: currentUser.id,
      check_in_lat: location_lat ?? null,
      check_in_lng: location_lng ?? null,
    },
    { onConflict: "employee_id,site_id,date" }
  );

  if (error) return { error: error.message };

  revalidatePath("/attendance/my-attendance");
  revalidatePath("/attendance");
  return { error: null };
}

export async function checkOut() {
  const currentUser = await getCurrentUser();
  if (!currentUser) return { error: "Unauthorized" };

  const supabase = await createClient();
  const today = new Date().toISOString().split("T")[0];
  const now = new Date().toISOString();

  // A person can legitimately have several rows today, one per site, so close
  // the most recent one still open rather than assuming there is exactly one.
  const { data: existing, error: fetchError } = await supabase
    .from("attendance")
    .select("id, check_in_at")
    .eq("employee_id", currentUser.id)
    .eq("date", today)
    .is("check_out_at", null)
    .is("deleted_at", null)
    .order("check_in_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (fetchError) return { error: fetchError.message };
  if (!existing) {
    return { error: "You have no open check-in today." };
  }

  const row = existing as { id: string; check_in_at: string | null };

  // Hours worked drive payroll, so derive them here rather than leaving the
  // column null for the payroll run to guess at.
  const workedHours = row.check_in_at
    ? Math.max(
        0,
        Math.round(
          ((new Date(now).getTime() - new Date(row.check_in_at).getTime()) /
            3_600_000) *
            100
        ) / 100
      )
    : null;

  const { error } = await supabase
    .from("attendance")
    .update({ check_out_at: now, worked_hours: workedHours })
    .eq("id", row.id);

  if (error) return { error: error.message };

  revalidatePath("/attendance/my-attendance");
  revalidatePath("/attendance");
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
