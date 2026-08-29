import { getCurrentUser } from "@/actions/auth";
import { getProposalEvent, logAgentEvent, proposalAlreadyDecided } from "@/lib/ai/events";

export const dynamic = "force-dynamic";

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

  if (await proposalAlreadyDecided(proposalId)) {
    return Response.json({ ok: true }); // already settled one way or another — cancelling again is a no-op, not an error
  }

  await logAgentEvent({
    sessionId: proposal.session_id,
    userId: user.id,
    eventType: "rejected",
    proposalId,
    toolName: proposal.tool_name,
    requestKey: proposal.request_key,
  });

  return Response.json({ ok: true });
}
