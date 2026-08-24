"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "./auth";
import {
  quotationDataSchema,
  quotationLineItemSchema,
  quotationStatusSchema,
  sanitizeSearchInput,
} from "@/lib/validations";
import { z } from "zod";
import type { Quotation, QuotationItem, Company } from "@/types/database";

export interface QuotationWithRelations extends Quotation {
  company?: Pick<Company, "id" | "name" | "company_code"> | null;
  quotation_items?: QuotationItem[];
}

/**
 * The money on a quotation, derived from its line items.
 *
 * Kept in one place so the create and update paths cannot drift, and so the
 * figures are never whatever the browser happened to send.
 */
function quotationTotals(
  items: { quantity: number; unit_price: number }[],
  discountAmount: number,
  gstPercent: number
) {
  const round2 = (n: number) => Math.round(n * 100) / 100;

  const subtotal = round2(
    items.reduce((sum, i) => sum + i.quantity * i.unit_price, 0)
  );
  // A discount cannot take the taxable value below zero, and GST is charged
  // on what is actually payable.
  const discount = round2(Math.min(Math.max(0, discountAmount), subtotal));
  const gstAmount = round2(((subtotal - discount) * gstPercent) / 100);

  return { subtotal, discount_amount: discount, gst_amount: gstAmount };
}

/**
 * Fetch all quotations with company name
 */
export async function getQuotations(params?: {
  search?: string;
  status?: string;
  company_id?: string;
}): Promise<{
  data: QuotationWithRelations[] | null;
  error: string | null;
}> {
  const supabase = await createClient();

  let query = supabase
    .from("quotations")
    .select("*, company:companies!quotations_company_id_fkey(id, name, company_code)")
    .order("created_at", { ascending: false });

  if (params?.search) {
    const safe = sanitizeSearchInput(params.search);
    if (safe) {
      query = query.or(
        `title.ilike.%${safe}%,quotation_number.ilike.%${safe}%`
      );
    }
  }

  if (params?.status && params.status !== "all") {
    query = query.eq("status", params.status);
  }

  if (params?.company_id) {
    query = query.eq("company_id", params.company_id);
  }

  const { data, error } = await query;

  if (error) {
    return { data: null, error: error.message };
  }

  return { data: data as QuotationWithRelations[], error: null };
}

/**
 * Get single quotation with items
 */
export async function getQuotation(
  id: string
): Promise<{ data: QuotationWithRelations | null; error: string | null }> {
  const supabase = await createClient();

  const { data: quotation, error } = await supabase
    .from("quotations")
    .select("*, company:companies!quotations_company_id_fkey(id, name, company_code)")
    .eq("id", id)
    .single();

  if (error) {
    return { data: null, error: error.message };
  }

  // Fetch items separately
  const { data: items } = await supabase
    .from("quotation_items")
    .select("*")
    .eq("quotation_id", id)
    .order("sort_order");

  const result = {
    ...(quotation as QuotationWithRelations),
    quotation_items: (items as QuotationItem[]) ?? [],
  };

  return { data: result, error: null };
}

/**
 * Create quotation with line items
 */
export async function createQuotation(
  quotationData: Record<string, unknown>,
  items: { description: string; unit: string; quantity: number; unit_price: number; line_total: number; sort_order: number }[]
) {
  const currentUser = await getCurrentUser();
  if (!currentUser || !["owner", "manager"].includes(currentUser.role)) {
    return { data: null, error: "Unauthorized." };
  }

  // Validate quotation data
  const parsedQuotation = quotationDataSchema.safeParse(quotationData);
  if (!parsedQuotation.success) {
    return { data: null, error: parsedQuotation.error.issues[0]?.message ?? "Invalid quotation data." };
  }

  // Validate line items
  const itemsSchema = z.array(quotationLineItemSchema).min(1, "At least one line item is required");
  const parsedItems = itemsSchema.safeParse(items);
  if (!parsedItems.success) {
    return { data: null, error: parsedItems.error.issues[0]?.message ?? "Invalid line items." };
  }

  const supabase = await createClient();

  // Generate quotation number using database sequence
  const { data: seqData, error: seqError } = await supabase.rpc(
    "next_document_number",
    { p_doc_type: "quotation", p_prefix: "QT" }
  );

  const quotation_number = seqError
    ? `QT-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`
    : (seqData as string);

  // Recompute the money from the line items rather than trusting what the
  // browser posted. subtotal and gst_amount arrived straight from the client
  // and total_amount is GENERATED from them, so a forged form post could have
  // priced a quotation at any figure it liked while the printed line items
  // said something else entirely.
  const totals = quotationTotals(
    parsedItems.data,
    parsedQuotation.data.discount_amount,
    parsedQuotation.data.gst_percent
  );

  const insertData = {
    ...parsedQuotation.data,
    ...totals,
    quotation_number,
    created_by: currentUser.id,
  };

  // Create quotation
  const { data: quotation, error: qError } = await supabase
    .from("quotations")
    .insert(insertData)
    .select("id")
    .single();

  if (qError) {
    return { data: null, error: qError.message };
  }

  const quotationId = (quotation as { id: string }).id;

  // Insert items
  const itemsWithId = parsedItems.data.map((item) => ({
    ...item,
    quotation_id: quotationId,
  }));

  const { error: iError } = await supabase
    .from("quotation_items")
    .insert(itemsWithId);

  if (iError) {
    // Cleanup quotation on item insert failure
    await supabase.from("quotations").delete().eq("id", quotationId);
    return { data: null, error: iError.message };
  }

  revalidatePath("/quotations");
  return { data: { id: quotationId, quotation_number }, error: null };
}

/**
 * Update quotation and its items
 */
export async function updateQuotation(
  id: string,
  quotationData: Record<string, unknown>,
  items: { description: string; unit: string; quantity: number; unit_price: number; line_total: number; sort_order: number }[]
) {
  const currentUser = await getCurrentUser();
  if (!currentUser || !["owner", "manager"].includes(currentUser.role)) {
    return { error: "Unauthorized." };
  }

  // Validate quotation data
  const parsedQuotation = quotationDataSchema.safeParse(quotationData);
  if (!parsedQuotation.success) {
    return { error: parsedQuotation.error.issues[0]?.message ?? "Invalid quotation data." };
  }

  // Validate line items
  const itemsSchema = z.array(quotationLineItemSchema).min(1, "At least one line item is required");
  const parsedItems = itemsSchema.safeParse(items);
  if (!parsedItems.success) {
    return { error: parsedItems.error.issues[0]?.message ?? "Invalid line items." };
  }

  const supabase = await createClient();

  // A quotation the client has already accepted is a commercial commitment;
  // repricing it in place would rewrite the terms of a live deal.
  const { data: existing } = await supabase
    .from("quotations")
    .select("status")
    .eq("id", id)
    .single();

  const status = (existing as { status: string } | null)?.status;
  if (status === "converted" || status === "approved") {
    return {
      error: `This quotation has been ${status}. Raise a revision instead of editing it.`,
    };
  }

  const totals = quotationTotals(
    parsedItems.data,
    parsedQuotation.data.discount_amount,
    parsedQuotation.data.gst_percent
  );

  const { error: qError } = await supabase
    .from("quotations")
    .update({ ...parsedQuotation.data, ...totals })
    .eq("id", id);

  if (qError) {
    return { error: qError.message };
  }

  // Insert the replacements first, then drop the originals. The other order
  // left the quotation with no line items at all whenever the insert failed —
  // the error was reported, but the priced work had already been deleted.
  const { data: inserted, error: iError } = await supabase
    .from("quotation_items")
    .insert(parsedItems.data.map((item) => ({ ...item, quotation_id: id })))
    .select("id");

  if (iError) {
    return { error: iError.message };
  }

  const keepIds = ((inserted ?? []) as { id: string }[]).map((r) => r.id);

  const { error: deleteError } = await supabase
    .from("quotation_items")
    .delete()
    .eq("quotation_id", id)
    .not("id", "in", `(${keepIds.join(",")})`);

  if (deleteError) {
    return { error: `The quotation was updated but the old lines remain: ${deleteError.message}` };
  }

  revalidatePath("/quotations");
  revalidatePath(`/quotations/${id}`);
  return { error: null };
}

/**
 * Update quotation status
 */
export async function updateQuotationStatus(
  id: string,
  status: string
) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return { error: "Unauthorized." };

  // Validate status
  const parsed = quotationStatusSchema.safeParse({ status });
  if (!parsed.success) {
    return { error: "Invalid status value." };
  }

  // Only admin can approve
  if (parsed.data.status === "approved" && currentUser.role !== "owner") {
    return { error: "Only admins can approve quotations." };
  }

  const supabase = await createClient();

  const updates: Record<string, unknown> = {
    status: parsed.data.status,
    updated_at: new Date().toISOString(),
  };

  if (parsed.data.status === "approved") {
    updates.approved_by = currentUser.id;
  }

  const { error } = await supabase
    .from("quotations")
    .update(updates)
    .eq("id", id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/quotations");
  revalidatePath(`/quotations/${id}`);
  return { error: null };
}

/**
 * Get all client companies for dropdown
 */
export async function getCompaniesForDropdown(): Promise<{
  data: { id: string; name: string; company_code: string }[] | null;
  error: string | null;
}> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("companies")
    .select("id, name, company_code")
    .is("deleted_at", null)
    .order("name");

  if (error) return { data: null, error: error.message };
  return {
    data: data as { id: string; name: string; company_code: string }[],
    error: null,
  };
}
