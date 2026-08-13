"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "./auth";
import { sanitizeSearchInput } from "@/lib/validations";
import type {
  Invoice,
  InvoiceItem,
  Payment,
  Company,
  Contract,
  Profile,
} from "@/types/database";

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

  const subtotal = items.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0);
  const taxable_amount = Math.max(0, subtotal - discount_amount);
  const cgst_amount = (taxable_amount * (gst_percent / 2)) / 100;
  const sgst_amount = cgst_amount;
  const igst_amount = 0;

  const insertData = {
    invoice_number,
    company_id,
    contract_id: contract_id || null,
    subtotal,
    discount_amount,
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

export async function addPayment(formData: FormData) {
  // simplified
  return { data: null, error: "Not implemented in simplified rewrite" };
}

export async function deletePayment(id: string) {
  // simplified
  return { error: "Not implemented in simplified rewrite" };
}
