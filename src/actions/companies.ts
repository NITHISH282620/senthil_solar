"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "./auth";
import {
  createCompanySchema,
  parseFormData,
  sanitizeSearchInput,
} from "@/lib/validations";
import type { Company, CompanyContact } from "@/types/database";

type CompanyWithContacts = Company & { contacts: CompanyContact[] | null };

export async function getCompanies(params?: {
  search?: string;
  status?: string;
}): Promise<{
  data: (Company & { primary_contact?: CompanyContact | null })[] | null;
  error: string | null;
}> {
  const supabase = await createClient();

  let query = supabase
    .from("companies")
    .select("*, contacts:company_contacts(*)")
    .order("created_at", { ascending: false });

  if (params?.search) {
    const safe = sanitizeSearchInput(params.search);
    if (safe) {
      query = query.or(
        `name.ilike.%${safe}%,company_code.ilike.%${safe}%,city.ilike.%${safe}%`
      );
    }
  }

  if (params?.status && params.status !== "all") {
    query = query.eq("status", params.status);
  }

  const { data, error } = await query;

  if (error) {
    return { data: null, error: error.message };
  }

  // Map the nested contacts to extract the primary contact for the UI
  const mappedData = (data as CompanyWithContacts[]).map((c) => {
    const primary = c.contacts?.find((ct) => ct.is_primary) || c.contacts?.[0] || null;
    return {
      ...c,
      primary_contact: primary,
    };
  });

  return {
    data: mappedData,
    error: null,
  };
}

export async function getCompany(
  id: string
): Promise<{ data: (Company & { contacts: CompanyContact[] }) | null; error: string | null }> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("companies")
    .select("*, contacts:company_contacts(*)")
    .eq("id", id)
    .single();

  if (error) {
    return { data: null, error: error.message };
  }

  return { data: data as Company & { contacts: CompanyContact[] }, error: null };
}

export async function createCompany(formData: FormData) {
  const currentUser = await getCurrentUser();
  if (!currentUser || !["owner", "manager"].includes(currentUser.role)) {
    return { data: null, error: "Unauthorized. Only admins and managers can create companies." };
  }

  const parsed = parseFormData(createCompanySchema, formData);
  if (!parsed.success) {
    return { data: null, error: parsed.error };
  }

  const {
    primary_contact_name,
    primary_contact_email,
    primary_contact_phone,
    ...companyFields
  } = parsed.data;

  const supabase = await createClient();

  // Generate company code using database sequence
  const { data: seqData, error: seqError } = await supabase.rpc(
    "next_document_number",
    { p_doc_type: "company", p_prefix: "CMP" }
  );

  const company_code = seqError
    ? `CMP-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`
    : (seqData as string);

  const companyData = {
    company_code,
    ...companyFields,
    created_by: currentUser.id,
  };

  const { data, error } = await supabase
    .from("companies")
    .insert(companyData)
    .select("id")
    .single();

  if (error) {
    return { data: null, error: error.message };
  }

  const companyId = (data as { id: string }).id;

  // Insert primary contact
  if (primary_contact_name) {
    await supabase.from("company_contacts").insert({
      company_id: companyId,
      is_primary: true,
      name: primary_contact_name,
      email: primary_contact_email,
      phone: primary_contact_phone,
    });
  }

  revalidatePath("/companies");
  return { data: { id: companyId, company_code }, error: null };
}

export async function updateCompany(id: string, formData: FormData) {
  const currentUser = await getCurrentUser();
  if (!currentUser || !["owner", "manager"].includes(currentUser.role)) {
    return { error: "Unauthorized." };
  }

  const parsed = parseFormData(createCompanySchema, formData);
  if (!parsed.success) {
    return { error: parsed.error };
  }

  const {
    primary_contact_name,
    primary_contact_email,
    primary_contact_phone,
    ...companyFields
  } = parsed.data;

  const supabase = await createClient();

  const { error } = await supabase
    .from("companies")
    .update(companyFields)
    .eq("id", id);

  if (error) {
    return { error: error.message };
  }

  // Update primary contact
  const { data: contacts } = await supabase.from("company_contacts").select("id").eq("company_id", id).eq("is_primary", true).limit(1);
  if (contacts && contacts.length > 0) {
    await supabase.from("company_contacts").update({
      name: primary_contact_name,
      email: primary_contact_email,
      phone: primary_contact_phone,
    }).eq("id", contacts[0].id);
  } else if (primary_contact_name) {
    await supabase.from("company_contacts").insert({
      company_id: id,
      is_primary: true,
      name: primary_contact_name,
      email: primary_contact_email,
      phone: primary_contact_phone,
    });
  }

  revalidatePath("/companies");
  revalidatePath(`/companies/${id}`);
  return { error: null };
}
