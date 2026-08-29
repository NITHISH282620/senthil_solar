import "server-only";
import { createClient } from "@/lib/supabase/server";

type EventType = "turn" | "proposal" | "confirmed" | "executed" | "rejected" | "failed";

interface InsertEventArgs {
  sessionId: string;
  userId: string;
  eventType: EventType;
  proposalId?: number;
  inputText?: string;
  inputLocale?: string;
  toolName?: string;
  toolArgs?: Record<string, unknown>;
  summary?: string;
  requestKey?: string;
  resultTable?: string;
  resultId?: string;
  error?: string;
  modelUsed?: string;
}

/**
 * One row per agent event. See the migration comment on ai_agent_events for
 * why this exists alongside audit_logs rather than instead of it.
 */
export async function logAgentEvent(args: InsertEventArgs): Promise<{ id: number | null; error: string | null }> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("ai_agent_events")
    .insert({
      session_id: args.sessionId,
      user_id: args.userId,
      proposal_id: args.proposalId ?? null,
      event_type: args.eventType,
      input_text: args.inputText ?? null,
      input_locale: args.inputLocale ?? null,
      tool_name: args.toolName ?? null,
      tool_args: args.toolArgs ?? null,
      summary: args.summary ?? null,
      request_key: args.requestKey ?? null,
      result_table: args.resultTable ?? null,
      result_id: args.resultId ?? null,
      error: args.error ?? null,
      model_used: args.modelUsed ?? null,
    })
    .select("id")
    .single();

  if (error) return { id: null, error: error.message };
  return { id: (data as { id: number }).id, error: null };
}

/** Fetches a proposal row, checked against the requesting user so one owner can never confirm another's proposal. */
export async function getProposalEvent(proposalId: number, userId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ai_agent_events")
    .select("*")
    .eq("id", proposalId)
    .eq("user_id", userId)
    .eq("event_type", "proposal")
    .maybeSingle();

  if (error) return { data: null, error: error.message };
  if (!data) return { data: null, error: "Proposal not found." };
  return {
    data: data as {
      id: number;
      session_id: string;
      user_id: string;
      tool_name: string;
      tool_args: Record<string, unknown>;
      request_key: string;
      summary: string;
    },
    error: null,
  };
}

/** True if this proposal has already been responded to — confirm/reject must be a one-time transition. */
export async function proposalAlreadyDecided(proposalId: number): Promise<boolean> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("ai_agent_events")
    .select("id", { count: "exact", head: true })
    .eq("proposal_id", proposalId)
    .in("event_type", ["confirmed", "executed", "rejected", "failed"]);
  return (count ?? 0) > 0;
}
