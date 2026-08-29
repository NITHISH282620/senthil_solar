import "server-only";
import { createClient } from "@/lib/supabase/server";

/**
 * Sliding-window limits against ai_agent_events itself, not an in-memory
 * counter — this runs on Vercel's serverless functions, where in-memory
 * state does not survive between invocations or is not shared across
 * instances. A DB count is slower than a memory read but is the only count
 * that is actually correct here.
 */
const TURN_LIMIT_PER_MINUTE = 20;
const PROPOSAL_LIMIT_PER_MINUTE = 10;

export async function checkTurnRateLimit(
  userId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const since = new Date(Date.now() - 60_000).toISOString();

  const { count, error } = await supabase
    .from("ai_agent_events")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", since);

  if (error) return { ok: false, error: error.message };
  if ((count ?? 0) >= TURN_LIMIT_PER_MINUTE) {
    return { ok: false, error: "Too many requests to the assistant in the last minute. Wait a moment and try again." };
  }
  return { ok: true };
}

export async function checkProposalRateLimit(
  userId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const since = new Date(Date.now() - 60_000).toISOString();

  const { count, error } = await supabase
    .from("ai_agent_events")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("event_type", "proposal")
    .gte("created_at", since);

  if (error) return { ok: false, error: error.message };
  if ((count ?? 0) >= PROPOSAL_LIMIT_PER_MINUTE) {
    return { ok: false, error: "Too many financial actions proposed in the last minute. Wait a moment and try again." };
  }
  return { ok: true };
}
