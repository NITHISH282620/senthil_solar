"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "./auth";
import { getCompanySettings } from "./settings";
import {
  paymentSchema,
  parseFormData,
  sanitizeSearchInput,
} from "@/lib/validations";
import type {
  Invoice,
  InvoiceItem,
  Payment,
  Company,
  Contract,
  Profile,
} from "@/types/database";

/**
 * payments.payment_method and cash_book.payment_mode use different
 * vocabularies; cash_book has no cheque, which settles through the bank.
 */
const CASH_BOOK_MODE = {
  cash: "cash",
  bank_transfer: "bank",
  cheque: "bank",
  upi: "upi",
  card: "card",
} as const;

/** Shape of a line item as posted by the invoice form (JSON-encoded in FormData). */
type InvoiceItemInput = {
  description: string;
  unit: string | null;
  quantity: number;
  unit_price: number;
};

export interface InvoiceWithRelations extends Invoice {
  company?: Pick<Company, "id" | "name" | "company_code" | "billing_address" | "city"> | null;
  contract?: Pick<Contract, "id" | "contract_number" | "title"> | null;
  items?: InvoiceItem[];
  payments?: (Payment & { received_by_profile?: Pick<Profile, "full_name"> | null })[];
}

export async function getInvoices(params?: {
  search?: string;
  status?: string;
  company_id?: string;
}): Promise<{
  data: InvoiceWithRelations[] | null;
  error: string | null;
}> {
  const supabase = await createClient();
  const currentUser = await getCurrentUser();

  if (!currentUser) return { data: null, error: "Unauthorized" };

  let query = supabase
    .from("invoices")
    .select(`
      *,
      company:companies!invoices_company_id_fkey(id, name, company_code)
    `)
    .order("created_at", { ascending: false });

  if (params?.search) {
    const safe = sanitizeSearchInput(params.search);
    if (safe) {
      query = query.or(`invoice_number.ilike.%${safe}%`);
    }
  }

  if (params?.status && params.status !== "all") {
    query = query.eq("status", params.status);
  }

  if (params?.company_id) {
    query = query.eq("company_id", params.company_id);
  }

  const { data, error } = await query;
  if (error) return { data: null, error: error.message };

  return { data: data as unknown as InvoiceWithRelations[], error: null };
}

export async function getInvoice(
  id: string
): Promise<{ data: InvoiceWithRelations | null; error: string | null }> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("invoices")
    .select(`
      *,
      company:companies!invoices_company_id_fkey(id, name, company_code, billing_address, city),
      contract:contracts!invoices_contract_id_fkey(id, contract_number, title),
      items:invoice_items(*),
      payments(
        *,
        received_by_profile:profiles!payments_received_by_fkey(full_name)
      )
    `)
    .eq("id", id)
    .single();

  if (error) return { data: null, error: error.message };

  const invoice = data as unknown as InvoiceWithRelations;
  if (invoice.items) {
    invoice.items.sort((a, b) => a.sort_order - b.sort_order);
  }
  if (invoice.payments) {
    invoice.payments.sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }

  return { data: invoice, error: null };
}

export async function createInvoice(formData: FormData) {
  const currentUser = await getCurrentUser();
  if (!currentUser || !["owner", "manager"].includes(currentUser.role)) {
    return { data: null, error: "Unauthorized. Only admins and managers can create invoices." };
  }

  // Very simplified creation for now to bypass complex schema changes in validation
  // Real app should parse with proper validation schema
  const company_id = formData.get("company_id") as string;
  const contract_id = formData.get("contract_id") as string | null;
  const gst_percent = Number(formData.get("gst_percent") || 18);
  const discount_amount = Number(formData.get("discount_amount") || 0);
  const itemsStr = formData.get("items") as string;
  // Both are collected by the form; without reading them here the due date was
  // dropped on every invoice, which left ageing and overdue tracking blind.
  const due_date = (formData.get("due_date") as string) || null;
  const notes = (formData.get("notes") as string) || null;

  if (!company_id || !itemsStr) {
    return { data: null, error: "Missing required fields" };
  }

  const items: InvoiceItemInput[] = JSON.parse(itemsStr);

  const supabase = await createClient();
  const prefix = "INV";

  const { data: seqData, error: seqError } = await supabase.rpc(
    "next_document_number",
    { p_doc_type: "invoice", p_prefix: prefix }
  );

  const invoice_number = seqError
    ? `${prefix}-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`
    : (seqData as string);

  // Indian GST splits by place of supply: same state as ours means CGST+SGST,
  // a different state means IGST. Always writing CGST/SGST produced a filing
  // that is wrong for every out-of-state client, and the table's
  // invoice_gst_mode_consistent constraint permits it because the amounts are
  // still internally consistent — so nothing would have complained.
  const [{ data: settings }, { data: client }] = await Promise.all([
    getCompanySettings(),
    supabase
      .from("companies")
      .select("state_code")
      .eq("id", company_id)
      .single(),
  ]);

  const ourStateCode = (settings as { state_code?: string | null } | null)?.state_code ?? null;
  const clientStateCode =
    (client as { state_code?: string | null } | null)?.state_code ?? null;

  // Unknown state codes fall back to intra-state, the common case, rather than
  // guessing at IGST.
  const isInterstate =
    !!ourStateCode && !!clientStateCode && ourStateCode !== clientStateCode;

  const subtotal = items.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0);
  const taxable_amount = Math.max(0, subtotal - discount_amount);
  const totalGst = (taxable_amount * gst_percent) / 100;

  const cgst_amount = isInterstate ? 0 : totalGst / 2;
  const sgst_amount = isInterstate ? 0 : totalGst / 2;
  const igst_amount = isInterstate ? totalGst : 0;

  const insertData = {
    invoice_number,
    company_id,
    contract_id: contract_id || null,
    due_date,
    notes,
    subtotal,
    discount_amount,
    place_of_supply_state_code: clientStateCode,
    is_interstate: isInterstate,
    cgst_amount,
    sgst_amount,
    igst_amount,
    status: "draft",
    created_by: currentUser.id,
  };

  const { data, error } = await supabase
    .from("invoices")
    .insert(insertData)
    .select()
    .single();

  if (error) {
    return { data: null, error: error.message };
  }

  // Insert items
  const itemsToInsert = items.map((item, index) => ({
    invoice_id: data.id,
    description: item.description,
    unit: item.unit,
    quantity: item.quantity,
    unit_price: item.unit_price,
    gst_percent,
    sort_order: index,
  }));

  const { error: itemsError } = await supabase
    .from("invoice_items")
    .insert(itemsToInsert);

  if (itemsError) {
    await supabase.from("invoices").delete().eq("id", data.id);
    return { data: null, error: itemsError.message };
  }

  revalidatePath("/billing");
  return { data, error: null };
}

/**
 * Issue a draft invoice to the client.
 *
 * Until this existed there was no transition out of 'draft' anywhere in the
 * application, and every invoice was created as a draft. Three reports read
 * only non-draft invoices — v_receivables_ageing, the dashboard's
 * total_outstanding and its overdue count — so the owner's single most
 * important question, "who owes me money?", always answered zero however many
 * invoices had been raised.
 */
export async function issueInvoice(id: string) {
  const currentUser = await getCurrentUser();
  if (!currentUser || !["owner", "manager", "accountant"].includes(currentUser.role)) {
    return { error: "Unauthorized. Only the owner, a manager or an accountant can issue an invoice." };
  }

  const supabase = await createClient();

  const { data: invoice, error: fetchError } = await supabase
    .from("invoices")
    .select("id, status, due_date, total_amount")
    .eq("id", id)
    .is("deleted_at", null)
    .single();

  if (fetchError || !invoice) return { error: "Invoice not found." };

  const inv = invoice as {
    status: string;
    due_date: string | null;
    total_amount: number;
  };

  if (inv.status !== "draft") {
    return { error: `This invoice is already ${inv.status}.` };
  }
  if (Number(inv.total_amount) <= 0) {
    return { error: "An invoice with no value cannot be issued." };
  }

  // An invoice with no due date can never age, so ageing would stay blind in a
  // different way. Default to the 30 days the trade works on.
  const dueDate =
    inv.due_date ??
    new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);

  const { error } = await supabase
    .from("invoices")
    .update({ status: "sent", due_date: dueDate })
    .eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/billing");
  revalidatePath(`/billing/${id}`);
  revalidatePath("/dashboard");
  return { error: null };
}

/**
 * Cancel an invoice raised in error. Cancelling is not deleting: the number
 * stays allocated, because GST numbering must not have holes in it.
 */
export async function cancelInvoice(id: string, reason: string) {
  const currentUser = await getCurrentUser();
  if (!currentUser || !["owner", "manager"].includes(currentUser.role)) {
    return { error: "Unauthorized. Only the owner or a manager can cancel an invoice." };
  }

  if (!reason.trim()) {
    return { error: "Give a reason for cancelling this invoice." };
  }

  const supabase = await createClient();

  const { data: invoice, error: fetchError } = await supabase
    .from("invoices")
    .select("id, status, amount_received, notes")
    .eq("id", id)
    .is("deleted_at", null)
    .single();

  if (fetchError || !invoice) return { error: "Invoice not found." };

  const inv = invoice as { status: string; amount_received: number; notes: string | null };

  if (Number(inv.amount_received) > 0) {
    return {
      error:
        "Money has already been received against this invoice. Reverse the payments first.",
    };
  }
  if (inv.status === "cancelled") return { error: "This invoice is already cancelled." };

  const { error } = await supabase
    .from("invoices")
    .update({
      status: "cancelled",
      notes: `${inv.notes ? inv.notes + "\n" : ""}Cancelled: ${reason.trim()}`,
    })
    .eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/billing");
  revalidatePath(`/billing/${id}`);
  revalidatePath("/dashboard");
  return { error: null };
}

export async function deleteInvoice(id: string) {
  const currentUser = await getCurrentUser();
  if (!currentUser || currentUser.role !== "owner") {
    return { error: "Unauthorized. Only admins can delete invoices." };
  }

  const supabase = await createClient();
  
  const { error } = await supabase
    .from("invoices")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/billing");
  return { error: null };
}

/**
 * Record a client payment against an invoice.
 *
 * The database owns the arithmetic: a trigger recomputes the invoice's
 * amount_received and status, and another rejects anything that would overpay.
 * This only has to write the payment row and mirror it into the cash book so
 * the money shows up in the running balance.
 */
export async function addPayment(formData: FormData) {
  const currentUser = await getCurrentUser();
  if (!currentUser || !["owner", "manager", "accountant"].includes(currentUser.role)) {
    return { data: null, error: "Unauthorized. Only the owner, a manager or an accountant can record payments." };
  }

  const parsed = parseFormData(paymentSchema, formData);
  if (!parsed.success) {
    return { data: null, error: parsed.error };
  }

  const v = parsed.data;
  const supabase = await createClient();

  // Carry the invoice's lineage onto the payment so receivables and site
  // profitability stay attributable.
  const { data: invoice, error: invError } = await supabase
    .from("invoices")
    .select("id, company_id, contract_id, site_id, balance_due, invoice_number")
    .eq("id", v.invoice_id)
    .is("deleted_at", null)
    .single();

  if (invError || !invoice) {
    return { data: null, error: "Invoice not found." };
  }

  const inv = invoice as {
    id: string;
    company_id: string;
    contract_id: string | null;
    site_id: string | null;
    balance_due: number;
    invoice_number: string;
  };

  // A client who transfers more than the invoice owes is a real and common
  // event — a rounded-up round figure, or one transfer covering the next bill
  // too. The database refuses a payment larger than the balance, so before
  // this the money physically sat in the bank while the books denied it
  // existed. Settle the invoice with what it can absorb and carry the rest as
  // an unallocated credit on the client's account, which is what an
  // accountant would do by hand.
  const balanceDue = Number(inv.balance_due);
  const settles = Math.min(v.amount, balanceDue);
  const onAccount = Math.round((v.amount - settles) * 100) / 100;

  if (settles <= 0) {
    return {
      data: null,
      error: "This invoice is already fully settled. Record the money as a client advance instead.",
    };
  }

  const { data, error } = await supabase
    .from("payments")
    .insert({
      invoice_id: inv.id,
      company_id: inv.company_id,
      contract_id: inv.contract_id,
      bank_account_id: v.bank_account_id || null,
      direction: "inbound",
      amount: settles,
      payment_date: v.payment_date,
      payment_method: v.payment_method,
      reference_number: v.reference_number,
      tds_deducted: v.tds_deducted,
      notes: v.notes,
      received_by: currentUser.id,
      created_by: currentUser.id,
    })
    .select("id")
    .single();

  if (error) {
    return { data: null, error: error.message };
  }

  const payment = data as { id: string };

  // The excess is attached to the client, not to any invoice, so it shows up
  // as credit to set against their next bill.
  if (onAccount > 0) {
    const { error: creditError } = await supabase.from("payments").insert({
      invoice_id: null,
      company_id: inv.company_id,
      contract_id: inv.contract_id,
      bank_account_id: v.bank_account_id || null,
      direction: "inbound",
      amount: onAccount,
      payment_date: v.payment_date,
      payment_method: v.payment_method,
      reference_number: v.reference_number,
      notes: `Overpayment on ${inv.invoice_number}, held on account.${v.notes ? " " + v.notes : ""}`,
      received_by: currentUser.id,
      created_by: currentUser.id,
    });

    if (creditError) {
      await supabase.from("payments").delete().eq("id", payment.id);
      return { data: null, error: `Overpayment could not be held on account: ${creditError.message}` };
    }
  }

  // Mirror into the cash book. cash_book requires either a site or the office
  // flag, and only accepts cash/upi/bank/card.
  const { error: cashError } = await supabase.from("cash_book").insert({
    entry_date: v.payment_date,
    direction: "in",
    // The full amount landed in the account, settlement and credit together.
    amount: settles + onAccount,
    payment_mode: CASH_BOOK_MODE[v.payment_method],
    bank_account_id: v.bank_account_id || null,
    site_id: inv.site_id,
    contract_id: inv.contract_id,
    company_id: inv.company_id,
    is_office: inv.site_id === null,
    description:
      onAccount > 0
        ? `Payment received against invoice ${inv.invoice_number} (₹${onAccount.toFixed(2)} held on account)`
        : `Payment received against invoice ${inv.invoice_number}`,
    reference_table: "payments",
    reference_id: payment.id,
    handled_by: currentUser.id,
    created_by: currentUser.id,
  });

  if (cashError) {
    // Keep the two ledgers consistent rather than leaving money unexplained.
    await supabase.from("payments").delete().eq("id", payment.id);
    return { data: null, error: `Payment could not be posted to the cash book: ${cashError.message}` };
  }

  revalidatePath("/billing");
  revalidatePath(`/billing/${inv.id}`);
  revalidatePath("/dashboard");
  return { data: payment, error: null };
}

/**
 * Reverse a payment. Financial records are soft-deleted, never destroyed —
 * the invoice trigger only counts rows with deleted_at IS NULL, so soft
 * deletion is what restores the balance.
 */
export interface ClientCredit {
  company_id: string;
  company_name: string;
  company_code: string;
  credit_available: number;
  credit_entries: number;
  oldest_credit_date: string;
}

/**
 * Money clients have paid that is not yet set against any invoice.
 *
 * This exists because the alternative was worse than losing the money: it was
 * recorded, in the cash book and in the bank, but surfaced on no screen and in
 * no report. The owner would bill a client again for money he already held.
 */
export async function getClientCredits(): Promise<{
  data: ClientCredit[] | null;
  error: string | null;
}> {
  const currentUser = await getCurrentUser();
  if (!currentUser || !["owner", "manager", "accountant"].includes(currentUser.role)) {
    return { data: null, error: "Unauthorized" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("v_client_credit")
    .select("*")
    .order("credit_available", { ascending: false });

  if (error) return { data: null, error: error.message };
  return { data: data as ClientCredit[], error: null };
}

export interface CreditEntry {
  payment_id: string;
  amount: number;
  payment_date: string;
  payment_method: string;
  reference_number: string | null;
  notes: string | null;
}

/** The individual receipts making up a client's credit. */
export async function getClientCreditDetail(companyId: string): Promise<{
  data: CreditEntry[] | null;
  error: string | null;
}> {
  const currentUser = await getCurrentUser();
  if (!currentUser || !["owner", "manager", "accountant"].includes(currentUser.role)) {
    return { data: null, error: "Unauthorized" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("v_client_credit_detail")
    .select("payment_id, amount, payment_date, payment_method, reference_number, notes")
    .eq("company_id", companyId)
    .order("payment_date");

  if (error) return { data: null, error: error.message };
  return { data: data as CreditEntry[], error: null };
}

/**
 * Set a client's unallocated credit against one of their invoices.
 *
 * Allocation re-points the existing receipt rather than creating a new one:
 * the cash arrived once and must appear in the cash book once. Where the credit
 * is larger than the invoice can absorb, the row is split so the remainder
 * stays on account.
 */
export async function applyCreditToInvoice(paymentId: string, invoiceId: string) {
  const currentUser = await getCurrentUser();
  if (!currentUser || !["owner", "manager", "accountant"].includes(currentUser.role)) {
    return { error: "Unauthorized. Only the owner, a manager or an accountant can allocate credit." };
  }

  const supabase = await createClient();

  const [{ data: credit, error: creditError }, { data: invoice, error: invoiceError }] =
    await Promise.all([
      supabase
        .from("payments")
        .select("id, company_id, amount, payment_date, payment_method, bank_account_id, reference_number, notes")
        .eq("id", paymentId)
        .is("invoice_id", null)
        .is("deleted_at", null)
        .eq("direction", "inbound")
        .single(),
      supabase
        .from("invoices")
        .select("id, company_id, contract_id, balance_due, invoice_number, status")
        .eq("id", invoiceId)
        .is("deleted_at", null)
        .single(),
    ]);

  if (creditError || !credit) return { error: "That credit entry no longer exists." };
  if (invoiceError || !invoice) return { error: "Invoice not found." };

  const c = credit as {
    company_id: string;
    amount: number;
    payment_date: string;
    payment_method: string;
    bank_account_id: string | null;
    reference_number: string | null;
    notes: string | null;
  };
  const inv = invoice as {
    company_id: string;
    contract_id: string | null;
    balance_due: number;
    invoice_number: string;
    status: string;
  };

  // Credit belongs to the client who paid it. Moving it between clients would
  // silently rewrite two account balances.
  if (c.company_id !== inv.company_id) {
    return { error: "That credit belongs to a different client." };
  }
  if (inv.status === "cancelled") {
    return { error: "This invoice is cancelled." };
  }

  const balance = Number(inv.balance_due);
  if (balance <= 0) {
    return { error: `${inv.invoice_number} is already settled.` };
  }

  const creditAmount = Number(c.amount);
  const applied = Math.min(creditAmount, balance);
  const remainder = Math.round((creditAmount - applied) * 100) / 100;

  if (remainder > 0) {
    // Split: shrink the credit to what stays on account, and write the applied
    // portion against the invoice.
    const { error: shrinkError } = await supabase
      .from("payments")
      .update({ amount: remainder })
      .eq("id", paymentId);

    if (shrinkError) return { error: shrinkError.message };

    const { error: applyError } = await supabase.from("payments").insert({
      invoice_id: invoiceId,
      company_id: inv.company_id,
      contract_id: inv.contract_id,
      bank_account_id: c.bank_account_id,
      direction: "inbound",
      amount: applied,
      payment_date: c.payment_date,
      payment_method: c.payment_method,
      reference_number: c.reference_number,
      notes: `Credit applied to ${inv.invoice_number}`,
      received_by: currentUser.id,
      created_by: currentUser.id,
    });

    if (applyError) {
      // Restore the credit so the client's balance is never understated.
      await supabase.from("payments").update({ amount: creditAmount }).eq("id", paymentId);
      return { error: applyError.message };
    }
  } else {
    // The whole credit fits: point it at the invoice. No new cash movement, so
    // no cash-book entry — the money was banked when it arrived.
    const { error } = await supabase
      .from("payments")
      .update({
        invoice_id: invoiceId,
        contract_id: inv.contract_id,
        notes: `${c.notes ? c.notes + " · " : ""}Credit applied to ${inv.invoice_number}`,
      })
      .eq("id", paymentId);

    if (error) return { error: error.message };
  }

  revalidatePath("/billing");
  revalidatePath(`/billing/${invoiceId}`);
  revalidatePath("/dashboard");
  return { error: null };
}

export async function deletePayment(id: string) {
  const currentUser = await getCurrentUser();
  if (!currentUser || !["owner", "accountant"].includes(currentUser.role)) {
    return { error: "Unauthorized. Only the owner or an accountant can reverse a payment." };
  }

  const supabase = await createClient();

  const { data: payment, error: fetchError } = await supabase
    .from("payments")
    .select("id, invoice_id")
    .eq("id", id)
    .is("deleted_at", null)
    .single();

  if (fetchError || !payment) {
    return { error: "Payment not found." };
  }

  const now = new Date().toISOString();

  const { error } = await supabase
    .from("payments")
    .update({ deleted_at: now })
    .eq("id", id);

  if (error) return { error: error.message };

  // Withdraw the matching cash-book line so the balance follows.
  await supabase
    .from("cash_book")
    .update({ deleted_at: now })
    .eq("reference_table", "payments")
    .eq("reference_id", id)
    .is("deleted_at", null);

  const invoiceId = (payment as { invoice_id: string | null }).invoice_id;

  revalidatePath("/billing");
  if (invoiceId) revalidatePath(`/billing/${invoiceId}`);
  revalidatePath("/dashboard");
  return { error: null };
}
