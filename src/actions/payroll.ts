"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "./auth";
import type { PayrollRun, PayrollLine, Profile } from "@/types/database";

/** Matches auth_can_see_money(); payroll is company-wide financial data. */
const PAYROLL_ROLES = ["owner", "manager", "accountant"];
const FINALISE_ROLES = ["owner"];

export interface PayrollLineWithEmployee extends PayrollLine {
  employee?: Pick<Profile, "id" | "full_name" | "employee_code"> | null;
}

/** One employee's month, assembled from attendance before any money is written. */
interface ComputedLine {
  employee_id: string;
  wage_mode: "monthly" | "daily" | "piece_rate";
  present_days: number;
  paid_leave_days: number;
  overtime_hours: number;
  rate_used: number | null;
  ot_rate_used: number | null;
  basic_amount: number;
  overtime_amount: number;
  advance_deduction: number;
  /** Per-site split, so labour lands on the right site's P&L. */
  allocations: { site_id: string; days: number; overtime_hours: number }[];
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export async function getPayrollRuns(): Promise<{
  data: PayrollRun[] | null;
  error: string | null;
}> {
  const currentUser = await getCurrentUser();
  if (!currentUser || !PAYROLL_ROLES.includes(currentUser.role)) {
    return { data: null, error: "Unauthorized" };
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("payroll_runs")
    .select("*")
    .is("deleted_at", null)
    .order("period_year", { ascending: false })
    .order("period_month", { ascending: false });

  if (error) return { data: null, error: error.message };
  return { data: data as PayrollRun[], error: null };
}

export async function getPayrollRun(id: string): Promise<{
  data: { run: PayrollRun; lines: PayrollLineWithEmployee[] } | null;
  error: string | null;
}> {
  const currentUser = await getCurrentUser();
  if (!currentUser || !PAYROLL_ROLES.includes(currentUser.role)) {
    return { data: null, error: "Unauthorized" };
  }

  const supabase = await createClient();

  const [{ data: run, error: runError }, { data: lines, error: linesError }] =
    await Promise.all([
      supabase.from("payroll_runs").select("*").eq("id", id).single(),
      supabase
        .from("payroll_lines")
        .select("*, employee:profiles(id, full_name, employee_code)")
        .eq("payroll_run_id", id),
    ]);

  if (runError) return { data: null, error: runError.message };
  if (linesError) return { data: null, error: linesError.message };

  return {
    data: {
      run: run as PayrollRun,
      lines: (lines ?? []) as PayrollLineWithEmployee[],
    },
    error: null,
  };
}

/**
 * Build a draft payroll for a month from attendance.
 *
 * Nothing here is entered by hand: days come from attendance, rates from the
 * employee's profile, and deductions from their outstanding advances. Rates
 * are snapshotted onto the line so a later rate change cannot rewrite a
 * payslip that has already been issued.
 *
 * Regenerating a draft replaces its lines. A finalised run is immutable.
 */
export async function generatePayroll(month: number, year: number) {
  const currentUser = await getCurrentUser();
  if (!currentUser || !PAYROLL_ROLES.includes(currentUser.role)) {
    return { data: null, error: "Unauthorized." };
  }

  if (month < 1 || month > 12) return { data: null, error: "Invalid month." };
  if (year < 2000 || year > 2100) return { data: null, error: "Invalid year." };

  const supabase = await createClient();

  // A finalised run has already moved money and locked its attendance.
  const { data: existingRun } = await supabase
    .from("payroll_runs")
    .select("id, status")
    .eq("period_month", month)
    .eq("period_year", year)
    .is("deleted_at", null)
    .maybeSingle();

  const existing = existingRun as { id: string; status: string } | null;
  if (existing && existing.status !== "draft") {
    return {
      data: null,
      error: `Payroll for ${month}/${year} is already ${existing.status} and cannot be regenerated.`,
    };
  }

  // ── Gather the inputs ────────────────────────────────────────────────────
  const [
    { data: attendance, error: attError },
    { data: employees, error: empError },
    { data: advances, error: advError },
  ] = await Promise.all([
    supabase
      .from("v_attendance_monthly")
      .select("employee_id, site_id, present_days, leave_days, overtime_hours")
      .eq("period_month", month)
      .eq("period_year", year),
    supabase
      .from("profiles")
      .select("id, wage_mode, monthly_salary, daily_rate, ot_rate_per_hour")
      .eq("is_active", true)
      .is("deleted_at", null),
    supabase
      .from("salary_advances")
      .select("employee_id, balance")
      .in("status", ["outstanding", "partially_recovered"])
      .is("deleted_at", null),
  ]);

  if (attError) return { data: null, error: attError.message };
  if (empError) return { data: null, error: empError.message };
  if (advError) return { data: null, error: advError.message };

  const attendanceRows = (attendance ?? []) as {
    employee_id: string;
    site_id: string | null;
    present_days: number | null;
    leave_days: number | null;
    overtime_hours: number | null;
  }[];

  if (attendanceRows.length === 0) {
    return {
      data: null,
      error: `No attendance recorded for ${month}/${year}, so there is nothing to pay.`,
    };
  }

  const employeeById = new Map(
    ((employees ?? []) as {
      id: string;
      wage_mode: "monthly" | "daily" | "piece_rate";
      monthly_salary: number | null;
      daily_rate: number | null;
      ot_rate_per_hour: number | null;
    }[]).map((e) => [e.id, e])
  );

  const advanceBalance = new Map<string, number>();
  for (const a of (advances ?? []) as { employee_id: string; balance: number }[]) {
    advanceBalance.set(
      a.employee_id,
      (advanceBalance.get(a.employee_id) ?? 0) + Number(a.balance)
    );
  }

  // ── Compute every line before writing anything ───────────────────────────
  const daysInMonth = new Date(year, month, 0).getDate();
  const byEmployee = new Map<string, ComputedLine>();

  for (const row of attendanceRows) {
    const employee = employeeById.get(row.employee_id);
    if (!employee) continue; // inactive or deleted since the attendance was marked

    const presentDays = Number(row.present_days ?? 0);
    const leaveDays = Number(row.leave_days ?? 0);
    const overtimeHours = Number(row.overtime_hours ?? 0);

    let line = byEmployee.get(row.employee_id);
    if (!line) {
      line = {
        employee_id: row.employee_id,
        wage_mode: employee.wage_mode,
        present_days: 0,
        paid_leave_days: 0,
        overtime_hours: 0,
        rate_used:
          employee.wage_mode === "monthly"
            ? employee.monthly_salary
            : employee.daily_rate,
        ot_rate_used: employee.ot_rate_per_hour,
        basic_amount: 0,
        overtime_amount: 0,
        advance_deduction: 0,
        allocations: [],
      };
      byEmployee.set(row.employee_id, line);
    }

    line.present_days += presentDays;
    line.paid_leave_days += leaveDays;
    line.overtime_hours += overtimeHours;

    if (row.site_id) {
      line.allocations.push({
        site_id: row.site_id,
        days: presentDays,
        overtime_hours: overtimeHours,
      });
    }
  }

  for (const line of byEmployee.values()) {
    const employee = employeeById.get(line.employee_id)!;

    if (line.wage_mode === "monthly") {
      // Pro-rated against calendar days, so a part-month is paid in proportion.
      const salary = Number(employee.monthly_salary ?? 0);
      const paidDays = Math.min(
        line.present_days + line.paid_leave_days,
        daysInMonth
      );
      line.basic_amount = round2((salary * paidDays) / daysInMonth);
    } else if (line.wage_mode === "daily") {
      const rate = Number(employee.daily_rate ?? 0);
      line.basic_amount = round2(rate * line.present_days);
    } else {
      // Piece rate needs production figures this module does not collect yet;
      // the line is created at zero so the person is visible rather than
      // silently dropped from the run.
      line.basic_amount = 0;
    }

    line.overtime_amount = round2(
      line.overtime_hours * Number(employee.ot_rate_per_hour ?? 0)
    );

    // Never recover more than is owed, and never push a payslip negative.
    const gross = line.basic_amount + line.overtime_amount;
    const owed = advanceBalance.get(line.employee_id) ?? 0;
    line.advance_deduction = round2(Math.max(0, Math.min(owed, gross)));
  }

  const computed = [...byEmployee.values()];

  // ── Write the run ────────────────────────────────────────────────────────
  let runId: string;

  if (existing) {
    runId = existing.id;
    // Replacing a draft: cascade clears the old lines and their allocations.
    const { error: clearError } = await supabase
      .from("payroll_lines")
      .delete()
      .eq("payroll_run_id", runId);
    if (clearError) return { data: null, error: clearError.message };
  } else {
    const { data: created, error: createError } = await supabase
      .from("payroll_runs")
      .insert({
        period_month: month,
        period_year: year,
        status: "draft",
        created_by: currentUser.id,
      })
      .select("id")
      .single();

    if (createError) return { data: null, error: createError.message };
    runId = (created as { id: string }).id;
  }

  const { data: insertedLines, error: lineError } = await supabase
    .from("payroll_lines")
    .insert(
      computed.map((c) => ({
        payroll_run_id: runId,
        employee_id: c.employee_id,
        wage_mode: c.wage_mode,
        present_days: c.present_days,
        paid_leave_days: c.paid_leave_days,
        overtime_hours: c.overtime_hours,
        rate_used: c.rate_used,
        ot_rate_used: c.ot_rate_used,
        basic_amount: c.basic_amount,
        overtime_amount: c.overtime_amount,
        advance_deduction: c.advance_deduction,
      }))
    )
    .select("id, employee_id");

  if (lineError) return { data: null, error: lineError.message };

  // Allocate each line's pay across the sites the person actually worked, so
  // labour cost reaches v_site_financials.
  const lineIdByEmployee = new Map(
    ((insertedLines ?? []) as { id: string; employee_id: string }[]).map((l) => [
      l.employee_id,
      l.id,
    ])
  );

  const allocations: {
    payroll_line_id: string;
    site_id: string;
    days_worked: number;
    overtime_hours: number;
    allocated_amount: number;
  }[] = [];

  for (const c of computed) {
    const lineId = lineIdByEmployee.get(c.employee_id);
    if (!lineId) continue;

    const totalDays = c.allocations.reduce((s, a) => s + a.days, 0);
    const payable = c.basic_amount + c.overtime_amount;
    if (totalDays <= 0) continue;

    // Merge repeated visits to the same site into one allocation row, since
    // the table is unique per (line, site).
    const bySite = new Map<string, { days: number; ot: number }>();
    for (const a of c.allocations) {
      const acc = bySite.get(a.site_id) ?? { days: 0, ot: 0 };
      acc.days += a.days;
      acc.ot += a.overtime_hours;
      bySite.set(a.site_id, acc);
    }

    for (const [siteId, acc] of bySite) {
      allocations.push({
        payroll_line_id: lineId,
        site_id: siteId,
        days_worked: acc.days,
        overtime_hours: acc.ot,
        allocated_amount: round2((payable * acc.days) / totalDays),
      });
    }
  }

  if (allocations.length > 0) {
    const { error: allocError } = await supabase
      .from("payroll_site_allocations")
      .insert(allocations);
    if (allocError) return { data: null, error: allocError.message };
  }

  const totals = computed.reduce(
    (acc, c) => {
      const gross = c.basic_amount + c.overtime_amount;
      acc.gross += gross;
      acc.deductions += c.advance_deduction;
      acc.net += gross - c.advance_deduction;
      return acc;
    },
    { gross: 0, deductions: 0, net: 0 }
  );

  await supabase
    .from("payroll_runs")
    .update({
      total_gross: round2(totals.gross),
      total_deductions: round2(totals.deductions),
      total_net: round2(totals.net),
      employee_count: computed.length,
    })
    .eq("id", runId);

  revalidatePath("/payroll");
  return {
    data: { id: runId, employee_count: computed.length },
    error: null,
  };
}

/**
 * Finalise a run: recover the advances it deducted, and lock the attendance
 * it was computed from so a paid period cannot be edited afterwards.
 *
 * Recovery is applied oldest advance first, which is what the business
 * expects and keeps the ledger predictable.
 */
export async function finalisePayroll(runId: string) {
  const currentUser = await getCurrentUser();
  if (!currentUser || !FINALISE_ROLES.includes(currentUser.role)) {
    return { error: "Unauthorized. Only the owner can finalise payroll." };
  }

  const supabase = await createClient();

  const { data: run, error: runError } = await supabase
    .from("payroll_runs")
    .select("id, status, period_month, period_year")
    .eq("id", runId)
    .single();

  if (runError || !run) return { error: "Payroll run not found." };

  const r = run as {
    id: string;
    status: string;
    period_month: number;
    period_year: number;
  };

  if (r.status !== "draft") {
    return { error: `This run is already ${r.status}.` };
  }

  const { data: lines, error: linesError } = await supabase
    .from("payroll_lines")
    .select("employee_id, advance_deduction")
    .eq("payroll_run_id", runId);

  if (linesError) return { error: linesError.message };

  // Apply each employee's deduction across their outstanding advances.
  for (const line of (lines ?? []) as {
    employee_id: string;
    advance_deduction: number;
  }[]) {
    let remaining = Number(line.advance_deduction);
    if (remaining <= 0) continue;

    const { data: advances } = await supabase
      .from("salary_advances")
      .select("id, amount, amount_recovered, balance")
      .eq("employee_id", line.employee_id)
      .in("status", ["outstanding", "partially_recovered"])
      .is("deleted_at", null)
      .order("advance_date", { ascending: true });

    for (const advance of (advances ?? []) as {
      id: string;
      amount_recovered: number;
      balance: number;
    }[]) {
      if (remaining <= 0) break;

      const take = Math.min(remaining, Number(advance.balance));
      if (take <= 0) continue;

      // status is maintained by the sync_advance_status trigger.
      const { error: updateError } = await supabase
        .from("salary_advances")
        .update({
          amount_recovered: round2(Number(advance.amount_recovered) + take),
        })
        .eq("id", advance.id);

      if (updateError) return { error: updateError.message };
      remaining = round2(remaining - take);
    }
  }

  // Lock the source attendance for the period.
  const periodStart = `${r.period_year}-${String(r.period_month).padStart(2, "0")}-01`;
  const periodEnd = new Date(r.period_year, r.period_month, 0)
    .toISOString()
    .slice(0, 10);

  await supabase
    .from("attendance")
    .update({ is_locked: true })
    .gte("date", periodStart)
    .lte("date", periodEnd)
    .eq("is_locked", false);

  const { error } = await supabase
    .from("payroll_runs")
    .update({
      status: "finalised",
      finalised_at: new Date().toISOString(),
      finalised_by: currentUser.id,
    })
    .eq("id", runId);

  if (error) return { error: error.message };

  revalidatePath("/payroll");
  revalidatePath(`/payroll/${runId}`);
  revalidatePath("/dashboard");
  return { error: null };
}

/**
 * Outstanding advance balance per employee, keyed by id. A plain object
 * rather than a Map, so it crosses the server boundary cleanly.
 */
export async function getAdvanceBalances(): Promise<{
  data: Record<string, number> | null;
  error: string | null;
}> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return { data: null, error: "Unauthorized" };

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("salary_advances")
    .select("employee_id, balance")
    .in("status", ["outstanding", "partially_recovered"])
    .is("deleted_at", null);

  if (error) return { data: null, error: error.message };

  const balances: Record<string, number> = {};
  for (const row of (data ?? []) as { employee_id: string; balance: number }[]) {
    balances[row.employee_id] =
      (balances[row.employee_id] ?? 0) + Number(row.balance);
  }

  return { data: balances, error: null };
}
