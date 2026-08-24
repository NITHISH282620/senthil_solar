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
import { todayInIndia } from "@/lib/format";

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
    .select("*")
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

  const rows = (data ?? []) as AttendanceWithProfile[];
  if (rows.length === 0) return { data: rows, error: null };

  // Names are resolved through v_directory rather than an embedded profiles
  // join: RLS on profiles admits only self and back office, so a supervisor's
  // attendance sheet came back with every name blank. v_directory exposes no
  // compensation, banking or KYC.
  const { data: people } = await supabase
    .from("v_directory")
    .select("id, full_name, employee_code")
    .in("id", [...new Set(rows.map((r) => r.employee_id))]);

  const byId = new Map(
    ((people ?? []) as { id: string; full_name: string; employee_code: string }[]).map(
      (p) => [p.id, p]
    )
  );

  for (const row of rows) {
    const person = byId.get(row.employee_id);
    row.employee = person
      ? { full_name: person.full_name, employee_code: person.employee_code }
      : null;
  }

  return { data: rows, error: null };
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
  const today = todayInIndia();
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
  const today = todayInIndia();
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

  // Overtime is what the payroll engine multiplies by ot_rate_per_hour, and
  // nothing else in the system ever writes it — so derive it here from the
  // configured threshold instead of leaving every day at the 0 default.
  const { data: settings } = await supabase
    .from("company_settings")
    .select("ot_after_hours")
    .limit(1)
    .maybeSingle();

  const otAfterHours = Number(
    (settings as { ot_after_hours?: number | null } | null)?.ot_after_hours ?? 8
  );
  const overtimeHours =
    workedHours === null
      ? 0
      : Math.max(0, Math.round((workedHours - otAfterHours) * 100) / 100);

  const { error } = await supabase
    .from("attendance")
    .update({
      check_out_at: now,
      worked_hours: workedHours,
      overtime_hours: overtimeHours,
    })
    .eq("id", row.id);

  if (error) return { error: error.message };

  revalidatePath("/attendance/my-attendance");
  revalidatePath("/attendance");
  return { error: null };
}

/**
 * Mark a whole crew's day at one site, in one call.
 *
 * Before this there was no way for a supervisor to record attendance for
 * anyone but themselves: checkIn() is self-service and updateAttendanceStatus
 * was owner/manager only. The supervisor's core duty had no code path, even
 * though the RLS policy has always permitted it for their own sites — so the
 * day was recorded on paper and payroll ran on nothing.
 *
 * The whole crew is written in one upsert because a supervisor standing in a
 * field on a phone will not tap through thirty individual forms.
 */
export async function markCrewAttendance(
  siteId: string,
  date: string,
  entries: { employee_id: string; status: string; overtime_hours?: number }[]
) {
  const currentUser = await getCurrentUser();
  if (
    !currentUser ||
    !["owner", "manager", "supervisor", "engineer"].includes(currentUser.role)
  ) {
    return { error: "Unauthorized. Only site supervisors and above can mark attendance." };
  }

  if (!siteId) return { error: "Choose which site this is for." };
  if (!entries.length) return { error: "Nobody to mark." };

  // Attendance for a day that has not happened is not a record of anything,
  // and it would be picked up by payroll as though it were.
  if (date > todayInIndia()) {
    return { error: "Attendance cannot be marked for a future date." };
  }

  const allowed = new Set(["present", "absent", "half_day", "leave", "holiday", "week_off"]);
  for (const e of entries) {
    if (!allowed.has(e.status)) return { error: `Unknown attendance status: ${e.status}` };
  }

  const supabase = await createClient();

  // day_fraction is derived by trigger from status, so it is deliberately not
  // sent here — the two can never drift apart again.
  const { error } = await supabase.from("attendance").upsert(
    entries.map((e) => ({
      employee_id: e.employee_id,
      site_id: siteId,
      date,
      status: e.status,
      overtime_hours: Math.max(0, Number(e.overtime_hours ?? 0)),
      source: "supervisor",
      marked_by: currentUser.id,
    })),
    { onConflict: "employee_id,site_id,date" }
  );

  // RLS refuses a site the caller does not run, and the locked-attendance
  // trigger refuses a period payroll has already paid.
  if (error) return { error: error.message };

  revalidatePath("/attendance");
  revalidatePath(`/sites/${siteId}`);
  return { error: null };
}

export async function updateAttendanceStatus(id: string, status: string, notes?: string) {
  const currentUser = await getCurrentUser();
  if (
    !currentUser ||
    !["owner", "manager", "supervisor", "engineer"].includes(currentUser.role)
  ) {
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

  const { data: request, error: fetchError } = await supabase
    .from("leave_requests")
    .select("id, employee_id, from_date, to_date, is_paid, leave_type, status")
    .eq("id", id)
    .is("deleted_at", null)
    .single();

  if (fetchError || !request) return { error: "Leave request not found." };

  const leave = request as {
    employee_id: string;
    from_date: string;
    to_date: string;
    is_paid: boolean;
    status: string;
  };

  if (leave.status !== "pending") {
    return { error: `This request has already been ${leave.status}.` };
  }

  const { error } = await supabase
    .from("leave_requests")
    .update({
      status: parsed.data.status,
      approved_by: currentUser.id,
      approved_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) return { error: error.message };

  // Approving leave used to change nothing but this row. Payroll is built
  // from attendance, so granted leave never reached it: a monthly-salary
  // employee was pro-rated down for days the owner had actually approved,
  // and unpaid leave was never deducted either. Write the days the approval
  // implies, so the payslip matches the decision.
  if (parsed.data.status === "approved") {
    const { data: sites } = await supabase
      .from("site_assignments")
      .select("site_id")
      .eq("employee_id", leave.employee_id)
      .eq("is_active", true)
      .is("deleted_at", null)
      .limit(1);

    const siteId = (sites as { site_id: string }[] | null)?.[0]?.site_id;

    // attendance.site_id is NOT NULL, so someone with no current posting
    // cannot have leave days written. Tell the truth rather than half-apply.
    if (!siteId) {
      return {
        error:
          "Leave approved, but it could not be posted to attendance: this employee is not assigned to a site. Assign them, then re-approve.",
      };
    }

    const rows: {
      employee_id: string;
      site_id: string;
      date: string;
      status: string;
      day_fraction: number;
      source: string;
      marked_by: string;
      notes: string;
    }[] = [];

    for (
      let d = new Date(`${leave.from_date}T00:00:00Z`);
      d <= new Date(`${leave.to_date}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() + 1)
    ) {
      rows.push({
        employee_id: leave.employee_id,
        site_id: siteId,
        date: d.toISOString().slice(0, 10),
        status: "leave",
        // Paid leave counts as a paid day; unpaid leave earns nothing.
        day_fraction: leave.is_paid ? 1 : 0,
        source: "admin",
        marked_by: currentUser.id,
        notes: "Approved leave",
      });
    }

    const { error: attendanceError } = await supabase
      .from("attendance")
      .upsert(rows, { onConflict: "employee_id,site_id,date" });

    if (attendanceError) {
      return {
        error: `Leave approved, but attendance could not be posted: ${attendanceError.message}`,
      };
    }
  }

  revalidatePath("/attendance/leaves");
  revalidatePath("/attendance");
  revalidatePath("/payroll");
  return { error: null };
}
