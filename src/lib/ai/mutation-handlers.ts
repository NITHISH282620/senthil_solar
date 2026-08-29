import "server-only";
import { randomUUID } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { getBankAccounts } from "@/actions/bank-accounts";
import { createExpense } from "@/actions/expenses";
import { createCashEntry } from "@/actions/cash-book";
import { addPayment, recordClientCredit } from "@/actions/invoices";
import { formatCurrency, todayInIndia } from "@/lib/format";
import { toFormData } from "./form-data";
import type { Locale } from "@/lib/i18n/locale";
import type { MutationToolName } from "./types";
import {
  proposeExpenseArgsSchema,
  proposeCashEntryArgsSchema,
  proposeInvoicePaymentArgsSchema,
  proposeClientCreditArgsSchema,
} from "./tools";

/**
 * Turns a model tool call into a Proposal: fully-resolved arguments (a real
 * site_id, a real bank_account_id if one is needed) plus a summary sentence
 * in the owner's own language. Nothing is written yet — resolveProposal only
 * reads. The actual write happens in executeProposal, and only after the
 * owner has confirmed.
 */
export async function resolveProposal(
  toolName: MutationToolName,
  rawArgs: unknown,
  locale: Locale
): Promise<{ args: Record<string, unknown>; summary: string } | { error: string }> {
  switch (toolName) {
    case "propose_expense":
      return resolveExpense(rawArgs, locale);
    case "propose_cash_entry":
      return resolveCashEntry(rawArgs, locale);
    case "propose_invoice_payment":
      return resolveInvoicePayment(rawArgs, locale);
    case "propose_client_credit":
      return resolveClientCredit(rawArgs, locale);
  }
}

/** Runs the real, already-validated server action. Only called after confirmation. */
export async function executeProposal(
  toolName: MutationToolName,
  args: Record<string, unknown>,
  requestKey: string
): Promise<{ ok: true; table: string; id: string } | { ok: false; error: string }> {
  switch (toolName) {
    case "propose_expense": {
      const fd = toFormData({ ...args, request_key: requestKey } as Record<string, string>);
      const { data, error } = await createExpense(fd);
      if (error || !data) return { ok: false, error: error ?? "Could not record the expense." };
      return { ok: true, table: "expenses", id: data.id };
    }
    case "propose_cash_entry": {
      const fd = toFormData({ ...args, request_key: requestKey } as Record<string, string>);
      const { data, error } = await createCashEntry(fd);
      if (error || !data) return { ok: false, error: error ?? "Could not record the entry." };
      return { ok: true, table: "cash_book", id: data.id };
    }
    case "propose_invoice_payment": {
      const fd = toFormData({ ...args, request_key: requestKey } as Record<string, string>);
      const { data, error } = await addPayment(fd);
      if (error || !data) return { ok: false, error: error ?? "Could not record the payment." };
      return { ok: true, table: "payments", id: data.id };
    }
    case "propose_client_credit": {
      const fd = toFormData({ ...args, request_key: requestKey } as Record<string, string>);
      const { error } = await recordClientCredit(fd);
      if (error) return { ok: false, error };
      // recordClientCredit doesn't hand back an id; the request_key is what
      // ties this execution row to the payments row it created.
      return { ok: true, table: "payments", id: requestKey };
    }
  }
}

// ─── bank account resolution, shared by the two tools that can need one ─────

async function resolvePrimaryBankAccount(
  explicitId: string | undefined,
  locale: Locale
): Promise<{ id: string; label: string } | { error: string }> {
  const { data, error } = await getBankAccounts();
  if (error) return { error };
  const accounts = data ?? [];

  if (explicitId) {
    const match = accounts.find((a) => a.id === explicitId);
    if (!match) {
      return {
        error:
          locale === "ta"
            ? "அந்த வங்கிக் கணக்கு கிடைக்கவில்லை."
            : "That bank account could not be found.",
      };
    }
    return { id: match.id, label: `${match.bank_name} ••${match.account_number.slice(-4)}` };
  }

  if (accounts.length === 0) {
    return {
      error:
        locale === "ta"
          ? "செயலில் உள்ள வங்கிக் கணக்கு எதுவும் இல்லை. அமைப்புகளில் ஒன்றைச் சேர்க்கவும்."
          : "There is no active bank account. Add one in Settings first.",
    };
  }

  // getBankAccounts() already orders is_primary first.
  const primary = accounts[0];
  return { id: primary.id, label: `${primary.bank_name} ••${primary.account_number.slice(-4)}` };
}

// ─── propose_expense ──────────────────────────────────────────────────────

async function resolveExpense(rawArgs: unknown, locale: Locale) {
  const parsed = proposeExpenseArgsSchema.safeParse(rawArgs);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid expense." };
  const v = parsed.data;

  if (!v.is_office && !v.site_id) {
    return {
      error:
        locale === "ta"
          ? "இது எந்த சைட்டுக்கானது என்று கூறுங்கள், அல்லது ஆபிஸ் செலவு எனக் குறிப்பிடுங்கள்."
          : "Say which site this is for, or that it's an office expense.",
    };
  }

  let siteName: string | null = null;
  if (v.site_id) {
    const supabase = await createClient();
    const { data: site } = await supabase
      .from("sites")
      .select("id, name")
      .eq("id", v.site_id)
      .is("deleted_at", null)
      .maybeSingle();
    if (!site) {
      return {
        error: locale === "ta" ? "அந்த சைட் கிடைக்கவில்லை." : "That site could not be found.",
      };
    }
    siteName = (site as { name: string }).name;
  }

  const args: Record<string, unknown> = {
    site_id: v.site_id,
    category: v.category,
    title: v.title,
    amount: v.amount,
    payment_mode: v.payment_mode,
    vendor_name: v.vendor_name,
    expense_date: v.expense_date ?? todayInIndia(),
  };

  const amountStr = formatCurrency(v.amount);
  const summary =
    locale === "ta"
      ? `${amountStr} செலவு — ${v.title}${siteName ? ` (${siteName})` : " (ஆபிஸ்)"}${v.vendor_name ? `, ${v.vendor_name}-க்கு` : ""}. இதைப் பதிவு செய்யவா?`
      : `Record an expense of ${amountStr} for ${v.title}${siteName ? ` at ${siteName}` : " (office)"}${v.vendor_name ? `, paid to ${v.vendor_name}` : ""}?`;

  return { args, summary };
}

// ─── propose_cash_entry ───────────────────────────────────────────────────

async function resolveCashEntry(rawArgs: unknown, locale: Locale) {
  const parsed = proposeCashEntryArgsSchema.safeParse(rawArgs);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid entry." };
  const v = parsed.data;

  if (!v.is_office && !v.site_id) {
    return {
      error:
        locale === "ta"
          ? "இது எந்த சைட்டுக்கானது என்று கூறுங்கள், அல்லது ஆபிஸ் என்று குறிப்பிடுங்கள்."
          : "Say which site this is for, or that it's an office entry.",
    };
  }

  let bankAccountId: string | undefined;
  let bankLabel: string | null = null;
  if (v.payment_mode === "bank") {
    const resolved = await resolvePrimaryBankAccount(v.bank_account_id, locale);
    if ("error" in resolved) return { error: resolved.error };
    bankAccountId = resolved.id;
    bankLabel = resolved.label;
  }

  let employeeName: string | null = null;
  if (v.category === "worker_advance" && v.employee_id) {
    const supabase = await createClient();
    const { data: emp } = await supabase
      .from("profiles")
      .select("id, full_name")
      .eq("id", v.employee_id)
      .maybeSingle();
    if (!emp) {
      return {
        error: locale === "ta" ? "அந்த பணியாளர் கிடைக்கவில்லை." : "That employee could not be found.",
      };
    }
    employeeName = (emp as { full_name: string }).full_name;
  }

  const args: Record<string, unknown> = {
    direction: v.direction,
    amount: v.amount,
    category: v.category,
    payment_mode: v.payment_mode,
    site_id: v.site_id,
    is_office: v.is_office,
    description: v.description,
    counterparty: v.counterparty,
    employee_id: v.employee_id,
    bank_account_id: bankAccountId,
    entry_date: v.entry_date ?? todayInIndia(),
  };

  const amountStr = formatCurrency(v.amount);
  const directionWord = locale === "ta" ? (v.direction === "in" ? "வரவு" : "செலவு") : v.direction === "in" ? "in" : "out";
  const summary =
    locale === "ta"
      ? `${amountStr} ${directionWord} — ${v.description}${employeeName ? ` (${employeeName}-க்கு முன்பணம்)` : ""}${bankLabel ? `, ${bankLabel} வழியாக` : ""}. உறுதிப்படுத்தவா?`
      : `${v.direction === "in" ? "Money in" : "Money out"}: ${amountStr} — ${v.description}${employeeName ? ` (advance to ${employeeName})` : ""}${bankLabel ? `, via ${bankLabel}` : ""}. Confirm?`;

  return { args, summary };
}

// ─── propose_invoice_payment ──────────────────────────────────────────────

async function resolveInvoicePayment(rawArgs: unknown, locale: Locale) {
  const parsed = proposeInvoicePaymentArgsSchema.safeParse(rawArgs);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid payment." };
  const v = parsed.data;

  const supabase = await createClient();
  const { data: invoice } = await supabase
    .from("invoices")
    .select("id, invoice_number, balance_due, company:companies(name)")
    .eq("id", v.invoice_id)
    .is("deleted_at", null)
    .maybeSingle();

  if (!invoice) {
    return {
      error: locale === "ta" ? "அந்த இன்வாய்ஸ் கிடைக்கவில்லை." : "That invoice could not be found.",
    };
  }
  const inv = invoice as unknown as {
    invoice_number: string;
    balance_due: number;
    company: { name: string } | null;
  };

  const args: Record<string, unknown> = {
    invoice_id: v.invoice_id,
    amount: v.amount,
    payment_method: v.payment_method,
    payment_date: v.payment_date ?? todayInIndia(),
    reference_number: v.reference_number,
    tds_deducted: v.tds_deducted,
  };

  const amountStr = formatCurrency(v.amount);
  const overpays = v.amount > Number(inv.balance_due);
  const summary =
    locale === "ta"
      ? `${amountStr} பணம் பெறப்பட்டதாக இன்வாய்ஸ் ${inv.invoice_number} (${inv.company?.name ?? ""})-க்கு பதிவு செய்யவா?${overpays ? " மீதி தொகை கிரெடிட்டாக வைக்கப்படும்." : ""}`
      : `Record ${amountStr} received against invoice ${inv.invoice_number} (${inv.company?.name ?? ""})?${overpays ? " The extra will be held as credit on the client's account." : ""}`;

  return { args, summary };
}

// ─── propose_client_credit ────────────────────────────────────────────────

async function resolveClientCredit(rawArgs: unknown, locale: Locale) {
  const parsed = proposeClientCreditArgsSchema.safeParse(rawArgs);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid entry." };
  const v = parsed.data;

  const supabase = await createClient();
  const { data: company } = await supabase
    .from("companies")
    .select("id, name")
    .eq("id", v.company_id)
    .is("deleted_at", null)
    .maybeSingle();

  if (!company) {
    return {
      error: locale === "ta" ? "அந்த நிறுவனம் கிடைக்கவில்லை." : "That company could not be found.",
    };
  }

  let bankAccountId: string | undefined;
  let bankLabel: string | null = null;
  if (v.payment_method === "bank_transfer") {
    const resolved = await resolvePrimaryBankAccount(v.bank_account_id, locale);
    if ("error" in resolved) return { error: resolved.error };
    bankAccountId = resolved.id;
    bankLabel = resolved.label;
  }

  const args: Record<string, unknown> = {
    company_id: v.company_id,
    amount: v.amount,
    payment_method: v.payment_method,
    payment_date: v.payment_date ?? todayInIndia(),
    reference_number: v.reference_number,
    bank_account_id: bankAccountId,
  };

  const amountStr = formatCurrency(v.amount);
  const companyName = (company as { name: string }).name;
  const summary =
    locale === "ta"
      ? `${companyName}-இடமிருந்து ${amountStr} பெறப்பட்டது, இன்னும் எந்த இன்வாய்ஸுக்கும் செலுத்தப்படவில்லை${bankLabel ? `, ${bankLabel} வழியாக` : ""}. கிரெடிட்டாக வைக்கவா?`
      : `${amountStr} received from ${companyName}, not yet against any invoice${bankLabel ? `, via ${bankLabel}` : ""}. Hold it as credit on their account?`;

  return { args, summary };
}

export function newRequestKey(): string {
  return `agent_${randomUUID()}`;
}
