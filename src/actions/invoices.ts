"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "./auth";
import { getCompanySettings } from "./settings";
import {
  invoiceSchema,
  paymentSchema,
  parseFormData,
  sanitizeSearchInput,
} from "@/lib/validations";
import type {
  Invoice,
  InvoiceItem,
  Payment,
  Customer,
  Project,
  Quotation,
  Profile,
} from "@/types/database";

export interface InvoiceWithRelations extends Invoice {
  customer?: Pick<Customer, "id" | "name" | "customer_id" | "email" | "phone" | "address" | "city"> | null;
  quotation?: Pick<Quotation, "id" | "quotation_number" | "title"> | null;
  project?: Pick<Project, "id" | "project_code" | "name"> | null;
  items?: InvoiceItem[];
  payments?: (Payment & { received_by_profile?: Pick<Profile, "full_name"> | null })[];
}

export async function getInvoices(params?: {
  search?: string;
  status?: string;
  customer_id?: string;
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
      customer:customers!invoices_customer_id_fkey(id, name, customer_id)
    `)
    .order("created_at", { ascending: false });

  if (params?.search) {
    const safe = sanitizeSearchInput(params.search);
    if (safe) {
      query = query.or(`invoice_number.ilike.%${safe}%`);
      // Note: searching across relation (customer.name) in PostgREST is complex without a view or rpc. 
      // We will stick to invoice_number for now.
    }
  }

  if (params?.status && params.status !== "all") {
    query = query.eq("status", params.status);
  }

  if (params?.customer_id) {
    query = query.eq("customer_id", params.customer_id);
  }

  const { data, error } = await query;
  if (error) return { data: null, error: error.message };

  return { data: data as InvoiceWithRelations[], error: null };
}

export async function getInvoice(
  id: string
): Promise<{ data: InvoiceWithRelations | null; error: string | null }> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("invoices")
    .select(`
      *,
      customer:customers!invoices_customer_id_fkey(id, name, customer_id, email, phone, address, city),
      project:projects!invoices_project_id_fkey(id, project_code, name),
      quotation:quotations!invoices_quotation_id_fkey(id, quotation_number, title),
      items:invoice_items(*),
      payments(
        *,
        received_by_profile:profiles!payments_received_by_fkey(full_name)
      )
    `)
    .eq("id", id)
    .single();

  if (error) return { data: null, error: error.message };

  const invoice = data as InvoiceWithRelations;
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
  if (!currentUser || !["admin", "manager"].includes(currentUser.role)) {
    return { data: null, error: "Unauthorized. Only admins and managers can create invoices." };
  }

  const parsed = parseFormData(invoiceSchema, formData);
  if (!parsed.success) {
    return { data: null, error: parsed.error };
  }

  const supabase = await createClient();
  const { data: settings } = await getCompanySettings();
  const prefix = settings?.invoice_prefix || "INV";

  // Generate sequence
  const { data: seqData, error: seqError } = await supabase.rpc(
    "next_sequence",
    { seq_name: "invoice", prefix }
  );

  const invoice_number = seqError
    ? `${prefix}-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`
    : (seqData as string);

  // Calculate totals
  const subtotal = parsed.data.items.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0);
  const discount = parsed.data.discount_amount || 0;
  const taxable_amount = Math.max(0, subtotal - discount);
  const tax_amount = (taxable_amount * parsed.data.tax_percent) / 100;
  const total_amount = taxable_amount + tax_amount;

  const insertData = {
    invoice_number,
    customer_id: parsed.data.customer_id,
    project_id: parsed.data.project_id,
    quotation_id: parsed.data.quotation_id,
    subtotal,
    tax_percent: parsed.data.tax_percent,
    tax_amount,
    discount_amount: discount,
    total_amount,
    due_date: parsed.data.due_date,
    notes: parsed.data.notes,
    created_by: currentUser.id,
  };

  const { data, error } = await supabase
    .from("invoices")
    .insert(insertData)
    .select("id")
    .single();

  if (error) return { data: null, error: error.message };

  const invoiceId = (data as { id: string }).id;

  // Insert items
  const itemsToInsert = parsed.data.items.map((item, index) => ({
    invoice_id: invoiceId,
    description: item.description,
    unit: item.unit,
    quantity: item.quantity,
    unit_price: item.unit_price,
    total_price: item.quantity * item.unit_price,
    sort_order: index,
  }));

  const { error: itemsError } = await supabase
    .from("invoice_items")
    .insert(itemsToInsert);

  if (itemsError) return { data: null, error: itemsError.message };

  revalidatePath("/billing");
  return { data: { id: invoiceId, invoice_number }, error: null };
}

export async function updateInvoiceStatus(id: string, status: string) {
  const currentUser = await getCurrentUser();
  if (!currentUser || !["admin", "manager"].includes(currentUser.role)) {
    return { error: "Unauthorized." };
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from("invoices")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/billing");
  revalidatePath(`/billing/${id}`);
  return { error: null };
}

export async function recordPayment(formData: FormData) {
  const currentUser = await getCurrentUser();
  if (!currentUser || !["admin", "manager"].includes(currentUser.role)) {
    return { error: "Unauthorized." };
  }

  const parsed = parseFormData(paymentSchema, formData);
  if (!parsed.success) {
    return { error: parsed.error };
  }

  const supabase = await createClient();

  // Validate invoice exists and check balance
  const { data: invoice, error: invoiceError } = await supabase
    .from("invoices")
    .select("balance_due, status")
    .eq("id", parsed.data.invoice_id)
    .single();

  if (invoiceError || !invoice) {
    return { error: "Invoice not found" };
  }

  if (parsed.data.amount > invoice.balance_due) {
    return { error: `Payment amount (${parsed.data.amount}) cannot exceed balance due (${invoice.balance_due})` };
  }

  // Insert payment
  const { error } = await supabase
    .from("payments")
    .insert({
      ...parsed.data,
      received_by: currentUser.id,
    });

  if (error) return { error: error.message };

  // Calculate new status based on new balance (balance_due is updated via generated column, but we update status here)
  const newBalance = invoice.balance_due - parsed.data.amount;
  let newStatus = invoice.status;
  
  if (newBalance <= 0) {
    newStatus = "paid";
  } else if (invoice.status === "draft" || invoice.status === "sent") {
    newStatus = "partially_paid";
  }

  if (newStatus !== invoice.status) {
    await supabase
      .from("invoices")
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq("id", parsed.data.invoice_id);
  }

  revalidatePath("/billing");
  revalidatePath(`/billing/${parsed.data.invoice_id}`);
  return { error: null };
}
