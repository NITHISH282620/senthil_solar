"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "./auth";

/** Mirrors v_dashboard_today, which answers the owner's morning questions. */
export interface DashboardToday {
  active_sites: number;
  workers_present_today: number;
  /** Absence is what costs a day of progress, so it is reported, not implied. */
  workers_absent_today: number;
  workers_on_leave_today: number;
  sites_missing_attendance: number;
  cash_in_today: number;
  cash_out_today: number;
  cash_in_yesterday: number;
  cash_out_yesterday: number;
  fuel_cost_today: number;
  pending_expense_approvals: number;
  total_outstanding: number;
  overdue_invoices: number;
  /** Approved claims not yet reimbursed, plus wages finalised but not handed over. */
  owed_to_employees: number;
  /** Client money banked and not yet set against any invoice. */
  client_credit_held: number;
  delayed_sites: number;
  contracts_due_this_week: number;
}

export interface SiteProfit {
  site_id: string;
  site_code: string;
  site_name: string;
  company_id: string | null;
  contract_id: string | null;
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
  /** What the client has actually paid against this site so far. */
  client_received: number;
  last_payment_date: string | null;
  /** revenue_allocated - client_received. What's still owed. */
  client_balance_due: number;
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

export interface PaymentsLedgerRow extends SiteProfit {
  company_name: string | null;
  contract_number: string | null;
}

/**
 * The digital replacement for the owner's old paper ledger — Name / Approved
 * / Advance / Balance, one row per site, across every contract at once.
 * Sites owed the most float to the top by default so the ones needing a
 * follow-up call are the ones he sees first.
 */
export async function getPaymentsLedger(params?: {
  contractId?: string;
  companyId?: string;
}): Promise<{ data: PaymentsLedgerRow[] | null; error: string | null }> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return { data: null, error: "Unauthorized" };

  const supabase = await createClient();

  let query = supabase
    .from("v_site_financials")
    .select("*")
    .eq("status", "active")
    .order("client_balance_due", { ascending: false, nullsFirst: false });

  if (params?.contractId) query = query.eq("contract_id", params.contractId);
  if (params?.companyId) query = query.eq("company_id", params.companyId);

  const { data, error } = await query;
  if (error) return { data: null, error: error.message };

  const rows = (data ?? []) as SiteProfit[];
  if (rows.length === 0) return { data: [], error: null };

  const companyIds = [...new Set(rows.map((r) => r.company_id).filter(Boolean))] as string[];
  const contractIds = [...new Set(rows.map((r) => r.contract_id).filter(Boolean))] as string[];

  const [{ data: companies }, { data: contracts }] = await Promise.all([
    companyIds.length
      ? supabase.from("companies").select("id, name").in("id", companyIds)
      : Promise.resolve({ data: [] }),
    contractIds.length
      ? supabase.from("contracts").select("id, contract_number").in("id", contractIds)
      : Promise.resolve({ data: [] }),
  ]);

  const companyById = new Map(
    ((companies ?? []) as { id: string; name: string }[]).map((c) => [c.id, c.name])
  );
  const contractById = new Map(
    ((contracts ?? []) as { id: string; contract_number: string }[]).map((c) => [
      c.id,
      c.contract_number,
    ])
  );

  return {
    data: rows.map((r) => ({
      ...r,
      company_name: r.company_id ? companyById.get(r.company_id) ?? null : null,
      contract_number: r.contract_id ? contractById.get(r.contract_id) ?? null : null,
    })),
    error: null,
  };
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



export async function getSenthilDashboardMetrics() {
  const currentUser = await getCurrentUser();
  if (!currentUser) return { data: null, error: "Unauthorized" };

  const supabase = await createClient();

  const [{ data: contracts }, { data: payments }, { count: activeSitesCount }, { data: recentPayments }, { data: sitesData }] = await Promise.all([
    supabase.from("contracts").select("contract_value").is("deleted_at", null),
    supabase.from("payments").select("amount").eq("direction", "inbound").is("deleted_at", null),
    supabase.from("sites").select("id", { count: "exact", head: true }).eq("status", "active").is("deleted_at", null),
    supabase.from("payments").select("id, amount, payment_date, notes, payment_method, company_id").eq("direction", "inbound").is("deleted_at", null).order("payment_date", { ascending: false }).limit(6),
    supabase.from("sites").select("id, name, status, company_id, contracts(contract_value)").eq("status", "active").is("deleted_at", null)
  ]);

  const totalContracted = (contracts ?? []).reduce((sum, c) => sum + Number(c.contract_value || 0), 0);
  const totalAdvances = (payments ?? []).reduce((sum, p) => sum + Number(p.amount || 0), 0);
  const totalUnpaid = totalContracted - totalAdvances;
  
  // For recent payments, we need company names
  const companyIds = [...new Set((recentPayments ?? []).map(p => p.company_id).filter(Boolean))] as string[];
  const { data: companies } = await (companyIds.length > 0 ? supabase.from("companies").select("id, name").in("id", companyIds) : Promise.resolve({ data: [] }));
  
  const companyMap = new Map((companies ?? []).map(c => [c.id, c.name]));
  
  const formattedRecent = (recentPayments ?? []).map(p => ({
    id: p.id,
    amount: p.amount,
    date: p.payment_date,
    notes: p.notes,
    method: p.payment_method,
    company_name: p.company_id ? companyMap.get(p.company_id) || "Unknown Client" : "Unknown Client"
  }));
  
  // For site balances, we need all payments per company
  const siteCompanyIds = [...new Set((sitesData ?? []).map(s => s.company_id).filter(Boolean))] as string[];
  const { data: allPayments } = await (siteCompanyIds.length > 0 ? supabase.from("payments").select("company_id, amount").eq("direction", "inbound").in("company_id", siteCompanyIds).is("deleted_at", null) : Promise.resolve({ data: [] }));
  
  const paymentsByCompany = new Map<string, number>();
  (allPayments ?? []).forEach(p => {
    if (p.company_id) {
        paymentsByCompany.set(p.company_id, (paymentsByCompany.get(p.company_id) || 0) + Number(p.amount || 0));
    }
  });
  
  const siteBalances = (sitesData ?? []).map(site => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const contractVal = (site.contracts && Array.isArray(site.contracts) && site.contracts.length > 0) ? Number(site.contracts[0].contract_value || 0) : ((site.contracts as any)?.contract_value || 0);
    const paymentsReceived = site.company_id ? paymentsByCompany.get(site.company_id) || 0 : 0;
    
    return {
        site_id: site.id,
        site_name: site.name,
        contract_value: contractVal,
        payments_received: paymentsReceived,
        balance_due: contractVal - paymentsReceived
    };
  }).sort((a, b) => b.balance_due - a.balance_due).slice(0, 5);

  return {
    data: {
        totalContracted,
        totalAdvances,
        totalUnpaid,
        activeSitesCount: activeSitesCount || 0,
        recentPayments: formattedRecent,
        siteBalances
    },
    error: null
  };
}
