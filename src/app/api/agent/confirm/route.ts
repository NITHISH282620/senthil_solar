import { getCurrentUser } from "@/actions/auth";
import { getProposalEvent, logAgentEvent, proposalAlreadyDecided } from "@/lib/ai/events";
import { executeProposal } from "@/lib/ai/mutation-handlers";
import type { MutationToolName } from "@/lib/ai/types";

export const dynamic = "force-dynamic";

/**
 * The only route that actually writes money. It re-fetches the proposal
 * from the database rather than trusting anything the client sends back
 * except the proposal's id — a tampered confirmation payload (a changed
 * amount, a swapped invoice_id) has no effect, because the args executed
 * here are the ones resolveProposal already validated and stored, not
 * whatever the browser posts.
 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user || user.role !== "owner") {
    return Response.json({ error: "The voice assistant is available to the owner only." }, { status: 403 });
  }

  let body: { proposalEventId?: number };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const proposalId = Number(body.proposalEventId);
  if (!Number.isInteger(proposalId) || proposalId <= 0) {
    return Response.json({ error: "Invalid proposal." }, { status: 400 });
  }

  const { data: proposal, error: fetchError } = await getProposalEvent(proposalId, user.id);
  if (fetchError || !proposal) {
    return Response.json({ error: fetchError ?? "Proposal not found." }, { status: 404 });
  }

  // A retried confirm (lost response, double tap) must not execute twice.
  // executeProposal itself is idempotent via request_key too, but checking
  // here avoids a second write attempt — and a second audit trail entry —
  // for what is very obviously the same tap.
  if (await proposalAlreadyDecided(proposalId)) {
    return Response.json({ error: "This action was already confirmed or rejected." }, { status: 409 });
  }

  await logAgentEvent({
    sessionId: proposal.session_id,
    userId: user.id,
    eventType: "confirmed",
    proposalId,
    toolName: proposal.tool_name,
    requestKey: proposal.request_key,
  });

  const result = await executeProposal(
    proposal.tool_name as MutationToolName,
    proposal.tool_args,
    proposal.request_key
  );

  if (!result.ok) {
    await logAgentEvent({
      sessionId: proposal.session_id,
      userId: user.id,
      eventType: "failed",
      proposalId,
      toolName: proposal.tool_name,
      requestKey: proposal.request_key,
      error: result.error,
    });
    return Response.json({ error: result.error }, { status: 422 });
  }

  await logAgentEvent({
    sessionId: proposal.session_id,
    userId: user.id,
    eventType: "executed",
    proposalId,
    toolName: proposal.tool_name,
    requestKey: proposal.request_key,
    resultTable: result.table,
    resultId: result.id,
  });

  return Response.json({ ok: true, table: result.table, id: result.id });
}
