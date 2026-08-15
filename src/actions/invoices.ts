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
        *
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

  const { data, error } = await supabase
    .from("payments")
    .insert({
      invoice_id: inv.id,
      company_id: inv.company_id,
      contract_id: inv.contract_id,
      bank_account_id: v.bank_account_id || null,
      direction: "inbound",
      amount: v.amount,
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

  // Mirror into the cash book. cash_book requires either a site or the office
  // flag, and only accepts cash/upi/bank/card.
  const { error: cashError } = await supabase.from("cash_book").insert({
    entry_date: v.payment_date,
    direction: "in",
    amount: v.amount,
    payment_mode: CASH_BOOK_MODE[v.payment_method],
    bank_account_id: v.bank_account_id || null,
    site_id: inv.site_id,
    contract_id: inv.contract_id,
    company_id: inv.company_id,
    is_office: inv.site_id === null,
    description: `Payment received against invoice ${inv.invoice_number}`,
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
