"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "./auth";
import { siteSchema, parseFormData, sanitizeSearchInput } from "@/lib/validations";
import type { Site, Company, Contract } from "@/types/database";

const WRITE_ROLES = ["owner", "manager"];

export interface SiteWithRelations extends Site {
  company?: Pick<Company, "id" | "name" | "company_code"> | null;
  contract?: Pick<Contract, "id" | "contract_number" | "title"> | null;
  engineer?: { id: string; full_name: string } | null;
  supervisor?: { id: string; full_name: string } | null;
}

/** Minimal shape for the site pickers that appear on every money form. */
export interface SiteOption {
  id: string;
  name: string;
  site_code: string;
  company_name: string | null;
}

export async function getSites(params?: {
  search?: string;
  stage?: string;
  status?: string;
  contract_id?: string;
  company_id?: string;
}): Promise<{ data: SiteWithRelations[] | null; error: string | null }> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return { data: null, error: "Unauthorized" };

  const supabase = await createClient();

  let query = supabase
    .from("sites")
    .select(
      `*,
       company:companies(id, name, company_code),
       contract:contracts(id, contract_number, title),
       engineer:profiles!sites_site_engineer_id_fkey(id, full_name),
       supervisor:profiles!sites_supervisor_id_fkey(id, full_name)`
    )
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (params?.search) {
    const safe = sanitizeSearchInput(params.search);
    if (safe) {
      query = query.or(`name.ilike.%${safe}%,site_code.ilike.%${safe}%`);
    }
  }
  if (params?.stage && params.stage !== "all") query = query.eq("stage", params.stage);
  if (params?.status && params.status !== "all") query = query.eq("status", params.status);
  if (params?.contract_id) query = query.eq("contract_id", params.contract_id);
  if (params?.company_id) query = query.eq("company_id", params.company_id);

  const { data, error } = await query;
  if (error) return { data: null, error: error.message };

  return { data: data as SiteWithRelations[], error: null };
}

export async function getSite(
  id: string
): Promise<{ data: SiteWithRelations | null; error: string | null }> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return { data: null, error: "Unauthorized" };

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("sites")
    .select(
      `*,
       company:companies(id, name, company_code),
       contract:contracts(id, contract_number, title),
       engineer:profiles!sites_site_engineer_id_fkey(id, full_name),
       supervisor:profiles!sites_supervisor_id_fkey(id, full_name)`
    )
    .eq("id", id)
    .single();

  if (error) return { data: null, error: error.message };
  return { data: data as SiteWithRelations, error: null };
}

/**
 * Active sites for the pickers on the money, expense and attendance forms.
 * Deliberately tiny — these load on every quick-entry sheet.
 */
export async function getSiteOptions(): Promise<{
  data: SiteOption[] | null;
  error: string | null;
}> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return { data: null, error: "Unauthorized" };

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("sites")
    .select("id, name, site_code, company:companies(name)")
    .is("deleted_at", null)
    .in("status", ["active", "on_hold"])
    .order("name");

  if (error) return { data: null, error: error.message };

  const rows = (data ?? []) as unknown as {
    id: string;
    name: string;
    site_code: string;
    company: { name: string } | null;
  }[];

  return {
    data: rows.map((r) => ({
      id: r.id,
      name: r.name,
      site_code: r.site_code,
      company_name: r.company?.name ?? null,
    })),
    error: null,
  };
}

export async function createSite(formData: FormData) {
  const currentUser = await getCurrentUser();
  if (!currentUser || !WRITE_ROLES.includes(currentUser.role)) {
    return { data: null, error: "Unauthorized. Only the owner or a manager can create sites." };
  }

  const parsed = parseFormData(siteSchema, formData);
  if (!parsed.success) return { data: null, error: parsed.error };

  const supabase = await createClient();

  // company_id is NOT NULL and is normally maintained by trigger from the
  // contract; supply it up front so the insert itself is valid.
  const { data: contract, error: contractError } = await supabase
    .from("contracts")
    .select("company_id")
    .eq("id", parsed.data.contract_id)
    .single();

  if (contractError || !contract) {
    return { data: null, error: "Parent contract not found." };
  }

  const { data: siteCode, error: seqError } = await supabase.rpc(
    "next_document_number",
    { p_doc_type: "site", p_prefix: "SITE" }
  );

  if (seqError) {
    return { data: null, error: `Could not allocate a site code: ${seqError.message}` };
  }

  const { data, error } = await supabase
    .from("sites")
    .insert({
      ...parsed.data,
      site_code: siteCode as string,
      company_id: (contract as { company_id: string }).company_id,
      created_by: currentUser.id,
    })
    .select("id, site_code")
    .single();

  if (error) return { data: null, error: error.message };

  revalidatePath("/sites");
  revalidatePath(`/contracts/${parsed.data.contract_id}`);
  return { data: data as { id: string; site_code: string }, error: null };
}

export async function updateSite(id: string, formData: FormData) {
  const currentUser = await getCurrentUser();
  if (!currentUser || !WRITE_ROLES.includes(currentUser.role)) {
    return { error: "Unauthorized. Only the owner or a manager can edit sites." };
  }

  const parsed = parseFormData(siteSchema, formData);
  if (!parsed.success) return { error: parsed.error };

  const supabase = await createClient();

  const { error } = await supabase.from("sites").update(parsed.data).eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/sites");
  revalidatePath(`/sites/${id}`);
  return { error: null };
}

/**
 * Move a site to a new stage. The database records the transition history
 * itself, so this only has to set the stage and progress.
 */
export async function updateSiteStage(
  id: string,
  stage: string,
  progressPercent?: number
) {
  const currentUser = await getCurrentUser();
  if (
    !currentUser ||
    !["owner", "manager", "engineer", "supervisor"].includes(currentUser.role)
  ) {
    return { error: "Unauthorized." };
  }

  const supabase = await createClient();

  const updates: Record<string, unknown> = { stage };
  if (typeof progressPercent === "number") {
    updates.progress_percent = Math.max(0, Math.min(100, progressPercent));
  }
  if (stage === "completed") {
    updates.actual_end_date = new Date().toISOString().slice(0, 10);
  }

  const { error } = await supabase.from("sites").update(updates).eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/sites");
  revalidatePath(`/sites/${id}`);
  return { error: null };
}

// ─── Site assignments ───────────────────────────────────────────────────────
//
// Nothing wrote this table before, which made attendance unreachable: check-in
// is site-scoped and offers only the sites a person is assigned to, so with no
// assignments no worker could ever mark a day.

export interface SiteAssignmentRow {
  id: string;
  employee_id: string;
  role_on_site: string;
  assigned_date: string;
  employee: { id: string; full_name: string; employee_code: string } | null;
}

export async function getSiteAssignments(siteId: string): Promise<{
  data: SiteAssignmentRow[] | null;
  error: string | null;
}> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return { data: null, error: "Unauthorized" };

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("site_assignments")
    .select(
      "id, employee_id, role_on_site, assigned_date, employee:profiles(id, full_name, employee_code)"
    )
    .eq("site_id", siteId)
    .eq("is_active", true)
    .is("deleted_at", null)
    .order("assigned_date", { ascending: false });

  if (error) return { data: null, error: error.message };
  return { data: data as unknown as SiteAssignmentRow[], error: null };
}

/** Matches site_assignments_write, which gates on auth_is_back_office(). */
const ASSIGN_ROLES = ["owner", "manager"];

export async function assignToSite(
  siteId: string,
  employeeId: string,
  roleOnSite: string
) {
  const currentUser = await getCurrentUser();
  if (!currentUser || !ASSIGN_ROLES.includes(currentUser.role)) {
    return { error: "Unauthorized. Only the owner or a manager can assign people to sites." };
  }

  if (!siteId || !employeeId) {
    return { error: "Choose a person to assign." };
  }

  const supabase = await createClient();

  // Re-activate a previous assignment rather than stacking duplicates.
  const { data: existing } = await supabase
    .from("site_assignments")
    .select("id, is_active")
    .eq("site_id", siteId)
    .eq("employee_id", employeeId)
    .is("deleted_at", null)
    .maybeSingle();

  const prior = existing as { id: string; is_active: boolean } | null;

  if (prior) {
    if (prior.is_active) {
      return { error: "That person is already assigned to this site." };
    }
    const { error } = await supabase
      .from("site_assignments")
      .update({
        is_active: true,
        removed_date: null,
        role_on_site: roleOnSite,
        assigned_date: new Date().toISOString().slice(0, 10),
      })
      .eq("id", prior.id);

    if (error) return { error: error.message };
  } else {
    const { error } = await supabase.from("site_assignments").insert({
      site_id: siteId,
      employee_id: employeeId,
      role_on_site: roleOnSite,
      created_by: currentUser.id,
    });

    if (error) return { error: error.message };
  }

  revalidatePath(`/sites/${siteId}`);
  return { error: null };
}

/**
 * Take someone off a site. Kept as a soft removal so past attendance and
 * payroll allocations still make sense against the assignment history.
 */
export async function removeFromSite(assignmentId: string, siteId: string) {
  const currentUser = await getCurrentUser();
  if (!currentUser || !ASSIGN_ROLES.includes(currentUser.role)) {
    return { error: "Unauthorized." };
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from("site_assignments")
    .update({
      is_active: false,
      removed_date: new Date().toISOString().slice(0, 10),
    })
    .eq("id", assignmentId);

  if (error) return { error: error.message };

  revalidatePath(`/sites/${siteId}`);
  return { error: null };
}

export async function getSiteStages(): Promise<{
  data: { code: string; label: string; sequence_no: number; color: string | null }[] | null;
  error: string | null;
}> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("site_stages")
    .select("code, label, sequence_no, color")
    .order("sequence_no");

  if (error) return { data: null, error: error.message };
  return {
    data: data as { code: string; label: string; sequence_no: number; color: string | null }[],
    error: null,
  };
}
