import { randomUUID } from "crypto";
import { getCurrentUser } from "@/actions/auth";
import { isLocale, DEFAULT_LOCALE } from "@/lib/i18n/locale";
import { callGroq, GroqConfigError, type GroqMessage } from "@/lib/ai/groq-client";
import { buildSystemPrompt } from "@/lib/ai/system-prompt";
import { TOOL_DEFINITIONS, findQuerySchema, findInvoiceArgsSchema } from "@/lib/ai/tools";
import {
  lookupEmployee,
  lookupSite,
  lookupCompany,
  lookupInvoice,
  getTodaySummary,
} from "@/lib/ai/lookup-handlers";
import { resolveProposal, newRequestKey } from "@/lib/ai/mutation-handlers";
import { isMutationTool, type ChatTurn, type MutationToolName } from "@/lib/ai/types";
import { logAgentEvent } from "@/lib/ai/events";
import { checkTurnRateLimit, checkProposalRateLimit } from "@/lib/ai/rate-limit";

export const dynamic = "force-dynamic";

const MAX_HISTORY_TURNS = 12;
const MAX_MESSAGE_LENGTH = 2000;
const MAX_TOOL_ITERATIONS = 5;

/**
 * The only route that talks to the model. Everything a non-owner might try
 * against this feature is refused here, before a single token is sent
 * anywhere — a Worker or Engineer never reaches Groq, never mind the
 * database, because getCurrentUser().role is checked first and the RLS
 * policy on ai_agent_events would refuse the very first log write anyway
 * even if this check were somehow bypassed.
 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user || user.role !== "owner") {
    return Response.json({ error: "The voice assistant is available to the owner only." }, { status: 403 });
  }

  const rateCheck = await checkTurnRateLimit(user.id);
  if (!rateCheck.ok) {
    return Response.json({ error: rateCheck.error }, { status: 429 });
  }

  let body: { sessionId?: string; message?: string; history?: ChatTurn[]; locale?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const message = (body.message ?? "").trim();
  if (!message) {
    return Response.json({ error: "Say or type something first." }, { status: 400 });
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    return Response.json({ error: "That message is too long." }, { status: 400 });
  }

  const locale = isLocale(body.locale) ? body.locale : DEFAULT_LOCALE;
  const sessionId = body.sessionId && /^[0-9a-f-]{36}$/i.test(body.sessionId) ? body.sessionId : randomUUID();
  const history = Array.isArray(body.history) ? body.history.slice(-MAX_HISTORY_TURNS) : [];

  await logAgentEvent({
    sessionId,
    userId: user.id,
    eventType: "turn",
    inputText: message,
    inputLocale: locale,
  });

  const messages: GroqMessage[] = [
    { role: "system", content: buildSystemPrompt(user.full_name) },
    ...history.map((h): GroqMessage => ({ role: h.role, content: h.content })),
    { role: "user", content: message },
  ];

  let strong = false;

  try {
    for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
      const result = await callGroq({ messages, tools: TOOL_DEFINITIONS, strong });

      if (result.toolCalls.length === 0) {
        return Response.json({
          kind: "message",
          text: result.content ?? "",
          sessionId,
        });
      }

      // One tool call per turn keeps the confirmation flow unambiguous — the
      // model cannot smuggle a second, unconfirmed mutation in behind a
      // lookup in the same step.
      const call = result.toolCalls[0];
      messages.push({ role: "assistant", content: result.content ?? "", tool_calls: [call] });

      let args: unknown;
      try {
        args = JSON.parse(call.function.arguments || "{}");
      } catch {
        messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify({ error: "Could not parse arguments." }) });
        continue;
      }

      if (isMutationTool(call.function.name)) {
        const proposalCheck = await checkProposalRateLimit(user.id);
        if (!proposalCheck.ok) {
          return Response.json({ error: proposalCheck.error }, { status: 429 });
        }

        const resolved = await resolveProposal(call.function.name, args, locale);

        if ("error" in resolved) {
          // Feed the failure back to the model as data, not a crash — it can
          // ask the owner a clarifying question in its next reply.
          messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify({ error: resolved.error }) });
          strong = true; // an unresolved reference is exactly the ambiguous case the stronger model is for
          continue;
        }

        const requestKey = newRequestKey();
        const { id: proposalId, error: logError } = await logAgentEvent({
          sessionId,
          userId: user.id,
          eventType: "proposal",
          toolName: call.function.name,
          toolArgs: resolved.args,
          summary: resolved.summary,
          requestKey,
          modelUsed: strong ? "strong" : "fast",
        });

        if (logError || proposalId === null) {
          return Response.json({ error: "Could not prepare that action. Try again." }, { status: 500 });
        }

        return Response.json({
          kind: "proposal",
          sessionId,
          proposal: {
            proposalEventId: proposalId,
            requestKey,
            toolName: call.function.name as MutationToolName,
            args: resolved.args,
            summary: resolved.summary,
          },
        });
      }

      // Read-only tool: execute now, feed the result back, keep looping.
      const toolResult = await runReadonlyTool(call.function.name, args);
      messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(toolResult) });
    }

    return Response.json({
      kind: "message",
      text:
        locale === "ta"
          ? "இதை தெளிவுபடுத்த முடியவில்லை. மீண்டும் எளிமையாகச் சொல்ல முடியுமா?"
          : "I couldn't work that out. Could you say it a simpler way?",
      sessionId,
    });
  } catch (err) {
    if (err instanceof GroqConfigError) {
      return Response.json({ error: err.message }, { status: 503 });
    }
    return Response.json({ error: "The assistant is temporarily unavailable. Try again shortly." }, { status: 502 });
  }
}

async function runReadonlyTool(name: string, args: unknown): Promise<unknown> {
  switch (name) {
    case "find_employee": {
      const parsed = findQuerySchema.safeParse(args);
      if (!parsed.success) return { error: "Invalid query." };
      return lookupEmployee(parsed.data.query);
    }
    case "find_site": {
      const parsed = findQuerySchema.safeParse(args);
      if (!parsed.success) return { error: "Invalid query." };
      return lookupSite(parsed.data.query);
    }
    case "find_company": {
      const parsed = findQuerySchema.safeParse(args);
      if (!parsed.success) return { error: "Invalid query." };
      return lookupCompany(parsed.data.query);
    }
    case "find_invoice": {
      const parsed = findInvoiceArgsSchema.safeParse(args);
      if (!parsed.success) return { error: "Invalid query." };
      return lookupInvoice(parsed.data);
    }
    case "get_today_summary":
      return getTodaySummary();
    default:
      return { error: "Unknown tool." };
  }
}
