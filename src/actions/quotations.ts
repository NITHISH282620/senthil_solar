"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "./auth";
import {
  lineNegotiationSchema,
  negotiateQuotationSchema,
  quotationDataSchema,
  quotationLineItemSchema,
  quotationStatusSchema,
  sanitizeSearchInput,
} from "@/lib/validations";
import { z } from "zod";
import type { Quotation, QuotationItem, Company, Site } from "@/types/database";

/**
 * The one place "what did the client actually agree to" is computed —
 * v_quotation_totals (line-item sum when any line was negotiated,
 * otherwise the quotation-level negotiated_amount, otherwise the ask).
 * Every page reads this instead of re-deriving the rule.
 */
export interface QuotationTotals {
  our_total: number;
  client_agreed_total: number;
  difference: number;
  has_line_negotiation: boolean;
}

export interface QuotationWithRelations extends Quotation, Partial<QuotationTotals> {
  company?: Pick<Company, "id" | "name" | "company_code"> | null;
  site?: Pick<Site, "id" | "name" | "site_code"> | null;
  quotation_items?: QuotationItem[];
}

async function getQuotationTotalsMap(
  supabase: Awaited<ReturnType<typeof createClient>>,
  quotationIds: string[]
): Promise<Map<string, QuotationTotals>> {
  if (quotationIds.length === 0) return new Map();

  const { data } = await supabase
    .from("v_quotation_totals")
    .select("quotation_id, our_total, client_agreed_total, difference, has_line_negotiation")
    .in("quotation_id", quotationIds);

  const rows = (data ?? []) as (QuotationTotals & { quotation_id: string })[];
  return new Map(rows.map((r) => [r.quotation_id, r]));
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
  site_id?: string;
}): Promise<{
  data: QuotationWithRelations[] | null;
  error: string | null;
}> {
  const supabase = await createClient();

  let query = supabase
    .from("quotations")
    .select(
      "*, company:companies!quotations_company_id_fkey(id, name, company_code), site:sites!quotations_site_id_fkey(id, name, site_code)"
    )
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

  if (params?.site_id) {
    query = query.eq("site_id", params.site_id);
  }

  const { data, error } = await query;

  if (error) {
    return { data: null, error: error.message };
  }

  const rows = data as QuotationWithRelations[];
  const totalsMap = await getQuotationTotalsMap(supabase, rows.map((r) => r.id));

  return {
    data: rows.map((r) => ({ ...r, ...totalsMap.get(r.id) })),
    error: null,
  };
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
    .select(
      "*, company:companies!quotations_company_id_fkey(id, name, company_code), site:sites!quotations_site_id_fkey(id, name, site_code)"
    )
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

  const totalsMap = await getQuotationTotalsMap(supabase, [id]);

  const result = {
    ...(quotation as QuotationWithRelations),
    ...totalsMap.get(id),
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
    .select("status, negotiated_amount")
    .eq("id", id)
    .single();

  const existingRow = existing as { status: string; negotiated_amount: number | null } | null;
  const status = existingRow?.status;
  if (status === "converted" || status === "approved") {
    return {
      error: `This quotation has been ${status}. Raise a revision instead of editing it.`,
    };
  }

  // The owner changing the ask and the client negotiating it are different
  // business events — the full edit form's delete-all/insert-all on line
  // items would otherwise silently wipe recorded client-agreed prices the
  // moment the owner tweaked, say, the title. Once any negotiation exists,
  // a revision is the correct path (createRevisedQuotation), not an edit.
  const { count: negotiatedLineCount } = await supabase
    .from("quotation_items")
    .select("id", { count: "exact", head: true })
    .eq("quotation_id", id)
    .not("client_unit_price", "is", null);

  if (existingRow?.negotiated_amount != null || (negotiatedLineCount ?? 0) > 0) {
    return {
      error:
        "The client has already agreed to a price on this quotation. Raise a revision instead of editing it.",
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

  // A quotation tied to a site prices that site's work. Once it's approved,
  // the client-agreed figure (or the ask, if bargaining never happened)
  // becomes the site's revenue — this is what makes v_site_financials
  // correct without requiring a contract at all.
  if (parsed.data.status === "approved") {
    await syncSiteValueFromQuotation(supabase, id);
  }

  revalidatePath("/quotations");
  revalidatePath(`/quotations/${id}`);
  return { error: null };
}

/**
 * A site's revenue is the SUM of every approved/converted quotation linked
 * to it, not one overwritten figure — this is what lets a client's later
 * additional work become a second quotation against the same site instead
 * of a rewrite of the first one's approved amount. Recomputes from scratch
 * (rather than incrementing) so it can never drift from what's actually
 * approved right now. A no-op if this quotation has no site_id — most of
 * the app's quotations are still the company-only kind that convert to a
 * contract instead.
 */
async function syncSiteValueFromQuotation(
  supabase: Awaited<ReturnType<typeof createClient>>,
  quotationId: string
) {
  const { data: quotation } = await supabase
    .from("quotations")
    .select("site_id")
    .eq("id", quotationId)
    .single();

  const siteId = (quotation as { site_id: string | null } | null)?.site_id;
  if (!siteId) return;

  const { data: siteQuotations } = await supabase
    .from("quotations")
    .select("id")
    .eq("site_id", siteId)
    .in("status", ["approved", "converted"])
    .is("deleted_at", null);

  const ids = ((siteQuotations ?? []) as { id: string }[]).map((q) => q.id);
  const totalsMap = await getQuotationTotalsMap(supabase, ids);
  const currentProjectValue = [...totalsMap.values()].reduce(
    (sum, t) => sum + t.client_agreed_total,
    0
  );

  await supabase
    .from("site_commercials")
    .upsert(
      { site_id: siteId, allocated_value: currentProjectValue },
      { onConflict: "site_id" }
    );
}

/**
 * Record what the client actually agreed to pay, after bargaining — distinct
 * from total_amount, the owner's ask. Allowed on a sent or approved
 * quotation (updateQuotation already locks the full edit form at that
 * point, but the negotiated price is exactly what changes after that).
 */
export async function recordNegotiatedAmount(
  quotationId: string,
  amount: number,
  notes?: string | null
) {
  const currentUser = await getCurrentUser();
  if (!currentUser || !["owner", "manager"].includes(currentUser.role)) {
    return { error: "Unauthorized." };
  }

  const parsed = negotiateQuotationSchema.safeParse({
    negotiated_amount: amount,
    negotiated_notes: notes,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid amount." };
  }

  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("quotations")
    .select("status")
    .eq("id", quotationId)
    .single();

  const status = (existing as { status: string } | null)?.status;
  if (status !== "sent" && status !== "approved") {
    return { error: "Record the client's price once the quotation has been sent." };
  }

  const { error } = await supabase
    .from("quotations")
    .update({
      negotiated_amount: parsed.data.negotiated_amount,
      negotiated_notes: parsed.data.negotiated_notes,
      negotiated_at: new Date().toISOString(),
    })
    .eq("id", quotationId);

  if (error) return { error: error.message };

  if (status === "approved") {
    await syncSiteValueFromQuotation(supabase, quotationId);
  }

  revalidatePath(`/quotations/${quotationId}`);
  revalidatePath("/payments");
  return { error: null };
}

/**
 * Record what the client agreed to for ONE line — the per-line counterpart
 * to recordNegotiatedAmount, for the real case where a client accepts some
 * lines and haggles others. Never touches unit_price, the ask; writes only
 * client_unit_price on that one row. Same status window as the
 * quotation-level version (sent or approved).
 */
export async function recordLineNegotiation(itemId: string, clientUnitPrice: number) {
  const currentUser = await getCurrentUser();
  if (!currentUser || !["owner", "manager"].includes(currentUser.role)) {
    return { error: "Unauthorized." };
  }

  const parsed = lineNegotiationSchema.safeParse({ client_unit_price: clientUnitPrice });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid amount." };
  }

  const supabase = await createClient();

  const { data: item } = await supabase
    .from("quotation_items")
    .select("quotation_id")
    .eq("id", itemId)
    .single();

  const quotationId = (item as { quotation_id: string } | null)?.quotation_id;
  if (!quotationId) return { error: "Line item not found." };

  const { data: quotation } = await supabase
    .from("quotations")
    .select("status")
    .eq("id", quotationId)
    .single();

  const status = (quotation as { status: string } | null)?.status;
  if (status !== "sent" && status !== "approved") {
    return { error: "Record the client's price once the quotation has been sent." };
  }

  const { error } = await supabase
    .from("quotation_items")
    .update({ client_unit_price: parsed.data.client_unit_price })
    .eq("id", itemId);

  if (error) return { error: error.message };

  if (status === "approved") {
    await syncSiteValueFromQuotation(supabase, quotationId);
  }

  revalidatePath(`/quotations/${quotationId}`);
  revalidatePath("/quotations");
  revalidatePath("/payments");
  return { error: null };
}

/**
 * Re-quote loop: a client rejected the price, so raise a new draft version
 * rather than editing the rejected one in place (updateQuotation refuses
 * that anyway once it's left draft/sent). Reuses the version/supersedes_id
 * columns that have existed since the schema was written but were never
 * wired to an action.
 */
export async function createRevisedQuotation(quotationId: string) {
  const currentUser = await getCurrentUser();
  if (!currentUser || !["owner", "manager"].includes(currentUser.role)) {
    return { data: null, error: "Unauthorized." };
  }

  const supabase = await createClient();

  const { data: original, error: fetchError } = await supabase
    .from("quotations")
    .select(
      "company_id, site_id, version, title, description, capacity_kw, panel_type, inverter_type, gst_percent, discount_amount, warranty_terms, payment_terms, terms, valid_from, valid_until, notes"
    )
    .eq("id", quotationId)
    .single();

  if (fetchError || !original) {
    return { data: null, error: "Quotation not found." };
  }

  const { data: items } = await supabase
    .from("quotation_items")
    .select("section, description, hsn_sac_code, unit, quantity, unit_price, sort_order")
    .eq("quotation_id", quotationId)
    .order("sort_order");

  const o = original as {
    company_id: string;
    site_id: string | null;
    version: number;
    gst_percent: number;
    discount_amount: number;
  };

  // Recomputed from the copied items, same as createQuotation — the ask can
  // move between versions (that's the point of a revision), so nothing
  // trusts the original's stored totals.
  const totals = quotationTotals(
    ((items ?? []) as { quantity: number; unit_price: number }[]),
    o.discount_amount,
    o.gst_percent
  );

  const { data: quotationNumber, error: seqError } = await supabase.rpc(
    "next_document_number",
    { p_doc_type: "quotation", p_prefix: "QT" }
  );

  if (seqError) {
    return { data: null, error: `Could not allocate a quotation number: ${seqError.message}` };
  }

  const { data: revised, error: insertError } = await supabase
    .from("quotations")
    .insert({
      ...(original as Record<string, unknown>),
      ...totals,
      quotation_number: quotationNumber as string,
      version: o.version + 1,
      supersedes_id: quotationId,
      status: "draft",
      created_by: currentUser.id,
    })
    .select("id")
    .single();

  if (insertError) {
    return { data: null, error: insertError.message };
  }

  const revisedId = (revised as { id: string }).id;

  if (items && items.length > 0) {
    const { error: itemsError } = await supabase.from("quotation_items").insert(
      (items as Record<string, unknown>[]).map((item) => ({
        ...item,
        quotation_id: revisedId,
      }))
    );

    if (itemsError) {
      await supabase.from("quotations").delete().eq("id", revisedId);
      return { data: null, error: itemsError.message };
    }
  }

  revalidatePath("/quotations");
  revalidatePath(`/quotations/${quotationId}`);
  if (o.site_id) revalidatePath(`/sites/${o.site_id}`);

  return { data: { id: revisedId, quotation_number: quotationNumber as string }, error: null };
}

interface VersionHistoryRow {
  id: string;
  quotation_number: string;
  version: number;
  status: string;
  supersedes_id: string | null;
}

/**
 * Walk the version chain both directions from one quotation — every
 * rejected/expired predecessor stays visible (createRevisedQuotation never
 * deletes them), and any later revision. Bounded to guard against bad data
 * ever forming a cycle.
 */
export async function getQuotationVersionHistory(
  quotationId: string
): Promise<{ data: VersionHistoryRow[] | null; error: string | null }> {
  const supabase = await createClient();
  const MAX_HOPS = 25;

  const byId = new Map<string, VersionHistoryRow>();

  const { data: start, error } = await supabase
    .from("quotations")
    .select("id, quotation_number, version, status, supersedes_id")
    .eq("id", quotationId)
    .single();

  if (error || !start) return { data: null, error: error?.message ?? "Not found" };

  const row = start as VersionHistoryRow;
  byId.set(row.id, row);

  // Backward: this quotation's predecessors.
  let cursor: string | null = row.supersedes_id;
  for (let i = 0; cursor && i < MAX_HOPS; i++) {
    const { data } = await supabase
      .from("quotations")
      .select("id, quotation_number, version, status, supersedes_id")
      .eq("id", cursor)
      .single();
    if (!data) break;
    const r = data as VersionHistoryRow;
    byId.set(r.id, r);
    cursor = r.supersedes_id;
  }

  // Forward: anything that supersedes a version already found, repeated
  // until nothing new turns up (there is at most one direct successor per
  // version in practice, but this holds even if that ever changes).
  let frontier = [...byId.keys()];
  for (let i = 0; frontier.length > 0 && i < MAX_HOPS; i++) {
    const { data } = await supabase
      .from("quotations")
      .select("id, quotation_number, version, status, supersedes_id")
      .in("supersedes_id", frontier);
    const next = ((data ?? []) as VersionHistoryRow[]).filter((r) => !byId.has(r.id));
    if (next.length === 0) break;
    next.forEach((r) => byId.set(r.id, r));
    frontier = next.map((r) => r.id);
  }

  if (byId.size <= 1) return { data: [], error: null };

  return {
    data: [...byId.values()].sort((a, b) => a.version - b.version),
    error: null,
  };
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
