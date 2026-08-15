"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "./auth";
import {
  contractSchema,
  parseFormData,
  sanitizeSearchInput,
} from "@/lib/validations";
import type { Contract, Company } from "@/types/database";

const WRITE_ROLES = ["owner", "manager"];

export interface ContractWithRelations extends Contract {
  company?: Pick<Company, "id" | "name" | "company_code">;
  _count?: {
    sites: number;
    quotations: number;
  };
}

/**
 * Fetch all contracts with filtering
 */
export async function getContracts(params?: {
  search?: string;
  status?: string;
  company_id?: string;
}): Promise<{
  data: ContractWithRelations[] | null;
  error: string | null;
}> {
  const supabase = await createClient();
  const currentUser = await getCurrentUser();

  if (!currentUser) return { data: null, error: "Unauthorized" };

  let query = supabase
    .from("contracts")
    .select(`
      *,
      company:companies(id, name, company_code)
    `)
    .order("created_at", { ascending: false });

  if (params?.search) {
    const safe = sanitizeSearchInput(params.search);
    if (safe) {
      query = query.or(
        `title.ilike.%${safe}%,contract_number.ilike.%${safe}%`
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

  return { data: data as ContractWithRelations[], error: null };
}

/**
 * Get a single contract by ID with all relations
 */
export async function getContract(
  id: string
): Promise<{ data: ContractWithRelations | null; error: string | null }> {
  const supabase = await createClient();
  const currentUser = await getCurrentUser();

  if (!currentUser) return { data: null, error: "Unauthorized" };

  const { data, error } = await supabase
    .from("contracts")
    .select(`
      *,
      company:companies(id, name, company_code)
    `)
    .eq("id", id)
    .single();

  if (error) {
    return { data: null, error: error.message };
  }

  return { data: data as ContractWithRelations, error: null };
}

/**
 * Create a contract. The contract number comes from the same FY-scoped
 * allocator every other document uses.
 */
export async function createContract(formData: FormData) {
  const currentUser = await getCurrentUser();
  if (!currentUser || !WRITE_ROLES.includes(currentUser.role)) {
    return { data: null, error: "Unauthorized. Only the owner or a manager can create contracts." };
  }

  const parsed = parseFormData(contractSchema, formData);
  if (!parsed.success) {
    return { data: null, error: parsed.error };
  }

  const supabase = await createClient();

  const { data: contractNumber, error: seqError } = await supabase.rpc(
    "next_document_number",
    { p_doc_type: "contract", p_prefix: "CON" }
  );

  if (seqError) {
    return { data: null, error: `Could not allocate a contract number: ${seqError.message}` };
  }

  const { data, error } = await supabase
    .from("contracts")
    .insert({
      ...parsed.data,
      contract_number: contractNumber as string,
      created_by: currentUser.id,
    })
    .select("id, contract_number")
    .single();

  if (error) {
    return { data: null, error: error.message };
  }

  revalidatePath("/contracts");
  return { data: data as { id: string; contract_number: string }, error: null };
}

export async function updateContract(id: string, formData: FormData) {
  const currentUser = await getCurrentUser();
  if (!currentUser || !WRITE_ROLES.includes(currentUser.role)) {
    return { error: "Unauthorized. Only the owner or a manager can edit contracts." };
  }

  const parsed = parseFormData(contractSchema, formData);
  if (!parsed.success) {
    return { error: parsed.error };
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from("contracts")
    .update(parsed.data)
    .eq("id", id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/contracts");
  revalidatePath(`/contracts/${id}`);
  return { error: null };
}

/**
 * Turn an accepted quotation into a contract without re-keying anything.
 *
 * The quotation carries the commercial terms the client already agreed to, so
 * they become the contract's opening terms; anything left blank falls back to
 * the client company's standing terms. The quotation is then marked
 * 'converted' so it cannot be converted a second time.
 */
export async function convertQuotationToContract(quotationId: string) {
  const currentUser = await getCurrentUser();
  if (!currentUser || !WRITE_ROLES.includes(currentUser.role)) {
    return { data: null, error: "Unauthorized. Only the owner or a manager can create contracts." };
  }

  const supabase = await createClient();

  const { data: quotation, error: qError } = await supabase
    .from("quotations")
    .select(
      "id, company_id, title, description, capacity_kw, total_amount, status, payment_terms, terms, valid_until"
    )
    .eq("id", quotationId)
    .is("deleted_at", null)
    .single();

  if (qError || !quotation) {
    return { data: null, error: "Quotation not found." };
  }

  const q = quotation as {
    id: string;
    company_id: string;
    title: string;
    description: string | null;
    capacity_kw: number | null;
    total_amount: number | null;
    status: string;
    payment_terms: string | null;
    terms: string | null;
  };

  if (q.status === "converted") {
    const { data: existing } = await supabase
      .from("contracts")
      .select("id, contract_number")
      .eq("quotation_id", q.id)
      .is("deleted_at", null)
      .maybeSingle();

    return {
      data: existing as { id: string; contract_number: string } | null,
      error: "This quotation has already been converted into a contract.",
    };
  }

  if (q.status !== "approved") {
    return {
      data: null,
      error: "Only an approved quotation can be converted into a contract.",
    };
  }

  // Fall back to the client's standing commercial terms.
  const { data: company } = await supabase
    .from("companies")
    .select("payment_terms_days, retention_percent")
    .eq("id", q.company_id)
    .single();

  const terms = (company ?? {}) as {
    payment_terms_days?: number;
    retention_percent?: number;
  };

  const { data: contractNumber, error: seqError } = await supabase.rpc(
    "next_document_number",
    { p_doc_type: "contract", p_prefix: "CON" }
  );

  if (seqError) {
    return { data: null, error: `Could not allocate a contract number: ${seqError.message}` };
  }

  const { data: contract, error: cError } = await supabase
    .from("contracts")
    .insert({
      contract_number: contractNumber as string,
      company_id: q.company_id,
      quotation_id: q.id,
      title: q.title,
      scope_description: q.description,
      contract_value: q.total_amount ?? 0,
      total_capacity_kw: q.capacity_kw,
      payment_terms_days: terms.payment_terms_days ?? 30,
      retention_percent: terms.retention_percent ?? 0,
      status: "draft",
      created_by: currentUser.id,
    })
    .select("id, contract_number")
    .single();

  if (cError) {
    return { data: null, error: cError.message };
  }

  const created = contract as { id: string; contract_number: string };

  // Close the loop on the quotation. A failure here would leave a contract
  // that could be created twice, so undo the contract rather than proceed.
  const { error: statusError } = await supabase
    .from("quotations")
    .update({ status: "converted" })
    .eq("id", q.id);

  if (statusError) {
    await supabase.from("contracts").delete().eq("id", created.id);
    return { data: null, error: statusError.message };
  }

  revalidatePath("/quotations");
  revalidatePath(`/quotations/${q.id}`);
  revalidatePath("/contracts");
  return { data: created, error: null };
}
