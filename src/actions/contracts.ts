"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "./auth";
import type { Contract, Company } from "@/types/database";

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
    // Basic search filtering (PostgREST ilike on foreign tables is limited, doing basic local text match)
    query = query.or(`title.ilike.%${params.search}%,contract_number.ilike.%${params.search}%`);
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
