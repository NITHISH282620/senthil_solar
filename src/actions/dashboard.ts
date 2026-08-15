"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "./auth";

/** Mirrors v_dashboard_today, which answers the owner's morning questions. */
export interface DashboardToday {
  active_sites: number;
  workers_present_today: number;
  sites_missing_attendance: number;
  cash_in_today: number;
  cash_out_today: number;
  fuel_cost_today: number;
  pending_expense_approvals: number;
  total_outstanding: number;
  overdue_invoices: number;
  delayed_sites: number;
  contracts_due_this_week: number;
}

export interface SiteProfit {
  site_id: string;
  site_code: string;
  site_name: string;
  stage: string;
  status: string;
  progress_percent: number;
  revenue_allocated: number;
  material_cost: number;
  labour_cost: number;
  expense_cost: number;
  total_cost: number;
  gross_profit: number;
  margin_percent: number | null;
  assigned_workers: number;
}

export interface ReceivableRow {
  invoice_id: string;
  invoice_number: string;
  company_name: string;
  due_date: string | null;
  balance_due: number;
  days_overdue: number;
  ageing_bucket: string;
}

/**
 * The owner's home screen in one round trip. The view is a single row of
 * scalar sub-selects, deliberately, so this never fans out into twelve
 * queries on every page load.
 */
export async function getDashboardToday(): Promise<{
  data: DashboardToday | null;
  error: string | null;
}> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return { data: null, error: "Unauthorized" };

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("v_dashboard_today")
    .select("*")
    .single();

  if (error) return { data: null, error: error.message };
  return { data: data as DashboardToday, error: null };
}

/**
 * Per-site P&L, worst margin first — the owner needs the losing sites at the
 * top, not the best ones.
 */
export async function getSiteProfitability(params?: {
  limit?: number;
  activeOnly?: boolean;
}): Promise<{ data: SiteProfit[] | null; error: string | null }> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return { data: null, error: "Unauthorized" };

  const supabase = await createClient();

  let query = supabase
    .from("v_site_financials")
    .select("*")
    .order("gross_profit", { ascending: true });

  if (params?.activeOnly !== false) query = query.eq("status", "active");
  if (params?.limit) query = query.limit(params.limit);

  const { data, error } = await query;
  if (error) return { data: null, error: error.message };

  return { data: data as SiteProfit[], error: null };
}

export async function getSiteProfit(
  siteId: string
): Promise<{ data: SiteProfit | null; error: string | null }> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return { data: null, error: "Unauthorized" };

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("v_site_financials")
    .select("*")
    .eq("site_id", siteId)
    .maybeSingle();

  if (error) return { data: null, error: error.message };
  return { data: data as SiteProfit | null, error: null };
}

/** Outstanding client money, most overdue first. */
export async function getReceivables(limit = 10): Promise<{
  data: ReceivableRow[] | null;
  error: string | null;
}> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return { data: null, error: "Unauthorized" };

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("v_receivables_ageing")
    .select("invoice_id, invoice_number, company_name, due_date, balance_due, days_overdue, ageing_bucket")
    .order("days_overdue", { ascending: false })
    .limit(limit);

  if (error) return { data: null, error: error.message };
  return { data: data as ReceivableRow[], error: null };
}

/**
 * Money actually in hand, derived from the whole ledger. Kept separate from
 * v_dashboard_today, which reports today's movement rather than the balance.
 */
export async function getCashInHand(): Promise<{
  data: number;
  error: string | null;
}> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return { data: 0, error: "Unauthorized" };

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("cash_book")
    .select("direction, amount")
    .is("deleted_at", null);

  if (error) return { data: 0, error: error.message };

  const balance = ((data ?? []) as { direction: string; amount: number }[]).reduce(
    (sum, r) => sum + (r.direction === "in" ? Number(r.amount) : -Number(r.amount)),
    0
  );

  return { data: balance, error: null };
}

/** Counts for the owner's "needs attention" row. */
export async function getAttentionCounts(): Promise<{
  data: { pendingQuotations: number; draftInvoices: number; outstandingAdvances: number };
  error: string | null;
}> {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return {
      data: { pendingQuotations: 0, draftInvoices: 0, outstandingAdvances: 0 },
      error: "Unauthorized",
    };
  }

  const supabase = await createClient();

  const [quotations, invoices, advances] = await Promise.all([
    supabase
      .from("quotations")
      .select("id", { count: "exact", head: true })
      .in("status", ["draft", "sent"])
      .is("deleted_at", null),
    supabase
      .from("invoices")
      .select("id", { count: "exact", head: true })
      .eq("status", "draft")
      .is("deleted_at", null),
    supabase
      .from("salary_advances")
      .select("id", { count: "exact", head: true })
      .in("status", ["outstanding", "partially_recovered"])
      .is("deleted_at", null),
  ]);

  return {
    data: {
      pendingQuotations: quotations.count ?? 0,
      draftInvoices: invoices.count ?? 0,
      outstandingAdvances: advances.count ?? 0,
    },
    error: null,
  };
}
