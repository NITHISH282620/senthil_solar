"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "./auth";

/**
 * Reading the audit trail.
 *
 * The trail itself has always been written — triggers on profiles, companies,
 * contracts, sites, attendance, advances, payroll lines, expenses, the cash
 * book, invoices, payments and purchase orders capture who, what, when, and
 * the before and after values. Nothing in the application ever read it back,
 * so "review the audit trail" — the last step of the owner's day — had no
 * screen. audit_logs is owner-only under RLS, and has no UPDATE or DELETE
 * policy at all, so what is shown here cannot have been edited.
 */
export interface AuditEntry {
  id: number;
  user_id: string | null;
  user_role: string | null;
  action: string;
  table_name: string;
  record_id: string | null;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  changed_fields: string[] | null;
  created_at: string;
  actor_name?: string | null;
}

export async function getAuditTrail(params?: {
  table?: string;
  action?: string;
  from?: string;
  limit?: number;
}): Promise<{ data: AuditEntry[] | null; error: string | null }> {
  const currentUser = await getCurrentUser();
  if (!currentUser || currentUser.role !== "owner") {
    return { data: null, error: "Unauthorized. The audit trail is the owner's." };
  }

  const supabase = await createClient();

  let query = supabase
    .from("audit_logs")
    .select("*")
    .order("id", { ascending: false })
    .limit(Math.min(params?.limit ?? 100, 500));

  if (params?.table && params.table !== "all") {
    query = query.eq("table_name", params.table);
  }
  if (params?.action && params.action !== "all") {
    query = query.eq("action", params.action);
  }
  if (params?.from) {
    query = query.gte("created_at", params.from);
  }

  const { data, error } = await query;
  if (error) return { data: null, error: error.message };

  const rows = (data ?? []) as AuditEntry[];
  if (rows.length === 0) return { data: rows, error: null };

  // A row that only says which UUID acted is not something anyone can review.
  const actorIds = [...new Set(rows.map((r) => r.user_id).filter(Boolean))] as string[];

  if (actorIds.length > 0) {
    const { data: people } = await supabase
      .from("v_directory")
      .select("id, full_name")
      .in("id", actorIds);

    const byId = new Map(
      ((people ?? []) as { id: string; full_name: string }[]).map((p) => [p.id, p.full_name])
    );
    for (const row of rows) {
      row.actor_name = row.user_id ? (byId.get(row.user_id) ?? null) : null;
    }
  }

  return { data: rows, error: null };
}
