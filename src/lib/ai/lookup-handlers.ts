import "server-only";
import { getEmployees } from "@/actions/employees";
import { getSiteOptions } from "@/actions/sites";
import { getCompanies } from "@/actions/companies";
import { getInvoices } from "@/actions/invoices";
import { getCashSummary } from "@/actions/cash-book";
import { getDashboardToday } from "@/actions/dashboard";
import { sanitizeSearchInput } from "@/lib/validations";

/**
 * Read-only tool execution. Every one of these runs immediately — no
 * confirmation, because nothing is written. Each just calls an existing,
 * already-RLS-scoped server action and shrinks its result to what the model
 * needs to resolve a name into a real id, never more (an employee's phone
 * number or an invoice's full line items would be a bigger leak than the
 * tool needs to do its job).
 */

const MAX_MATCHES = 8;

export async function lookupEmployee(query: string) {
  const safe = sanitizeSearchInput(query);
  const { data, error } = await getEmployees({ search: safe, status: "active" });
  if (error) return { error };
  return {
    matches: (data ?? []).slice(0, MAX_MATCHES).map((e) => ({
      id: e.id,
      name: e.full_name,
      code: e.employee_code,
      role: e.role,
    })),
  };
}

export async function lookupSite(query: string) {
  const { data, error } = await getSiteOptions();
  if (error) return { error };
  const q = query.trim().toLowerCase();
  const matches = (data ?? []).filter(
    (s) =>
      s.name.toLowerCase().includes(q) ||
      s.site_code.toLowerCase().includes(q) ||
      (s.company_name ?? "").toLowerCase().includes(q)
  );
  return {
    matches: matches.slice(0, MAX_MATCHES).map((s) => ({
      id: s.id,
      name: s.name,
      code: s.site_code,
      company: s.company_name,
    })),
  };
}

export async function lookupCompany(query: string) {
  const safe = sanitizeSearchInput(query);
  const { data, error } = await getCompanies({ search: safe, status: "active" });
  if (error) return { error };
  return {
    matches: (data ?? []).slice(0, MAX_MATCHES).map((c) => ({
      id: c.id,
      name: c.name,
      code: c.company_code,
    })),
  };
}

export async function lookupInvoice(args: { company_id?: string; query?: string }) {
  const safe = args.query ? sanitizeSearchInput(args.query) : undefined;
  const { data, error } = await getInvoices({
    company_id: args.company_id,
    search: safe,
  });
  if (error) return { error };

  // "Open" — the model resolves a payment to something with money still owed,
  // never to an invoice already settled or cancelled.
  const open = (data ?? []).filter(
    (i) => Number(i.balance_due) > 0 && i.status !== "cancelled"
  );

  return {
    matches: open.slice(0, MAX_MATCHES).map((i) => ({
      id: i.id,
      invoice_number: i.invoice_number,
      company: i.company?.name ?? null,
      balance_due: Number(i.balance_due),
      status: i.status,
    })),
  };
}

export async function getTodaySummary() {
  const [{ data: cash, error: cashError }, { data: today, error: todayError }] =
    await Promise.all([getCashSummary(), getDashboardToday()]);

  if (cashError) return { error: cashError };
  if (todayError) return { error: todayError };

  return {
    cash_in_hand: cash?.balance ?? 0,
    in_today: cash?.todayIn ?? 0,
    out_today: cash?.todayOut ?? 0,
    clients_owe: Number(today?.total_outstanding ?? 0),
    active_sites: today?.active_sites ?? 0,
    workers_present_today: today?.workers_present_today ?? 0,
  };
}
