import "server-only";

/**
 * A thin client over an OpenAI-compatible Chat Completions endpoint —
 * nothing upstream of this file (system-prompt.ts, tools.ts, the /api/agent
 * routes) knows or cares who's actually serving the model. That's
 * deliberate: the long-term preferred target is a self-hosted open model
 * (Qwen3 4B/8B, non-thinking mode for ordinary commands), but this sandbox
 * and the app's Vercel deployment both have no GPU, so nothing here can
 * actually run a self-hosted model today. Groq is the default because it
 * hosts the same class of open-weight model (Llama, Qwen) behind this exact
 * API shape for free, and is fast enough that the voice agent doesn't feel
 * like it's thinking — a genuine drop-in for a future self-hosted vLLM or
 * Ollama endpoint, not a placeholder that needs replacing later.
 *
 * To point this at a self-hosted server instead: set CHAT_MODEL_BASE_URL to
 * that server's `/v1/chat/completions` URL and CHAT_MODEL_API_KEY to
 * whatever it expects (vLLM/Ollama's OpenAI-compat servers accept any
 * non-empty bearer token by default). No code change. See
 * VOICE_AGENT_ARCHITECTURE.md for the hardware a self-hosted Qwen3-8B needs
 * and why that has to be a separate always-on server, not this deployment.
 *
 * Two models, not one:
 *  - CHAT_MODEL_FAST for every ordinary turn — intent classification and
 *    slot extraction is a small, well-scoped task; a small model is both
 *    cheaper and lower-latency, which matters when the owner is standing
 *    there holding a phone. (Qwen3, run this way, is used in non-thinking
 *    mode for exactly this reason.)
 *  - CHAT_MODEL_STRONG only when resolving a tool call's arguments fails
 *    (an ambiguous or unusual sentence) — a second, more capable pass
 *    instead of silently guessing. (The self-hosted equivalent is Qwen3
 *    with reasoning enabled, reserved for genuinely complex queries.)
 */

const BASE_URL = process.env.CHAT_MODEL_BASE_URL ?? "https://api.groq.com/openai/v1/chat/completions";
const FAST_MODEL = process.env.CHAT_MODEL_FAST ?? process.env.GROQ_MODEL_FAST ?? "llama-3.1-8b-instant";
const STRONG_MODEL = process.env.CHAT_MODEL_STRONG ?? process.env.GROQ_MODEL_STRONG ?? "llama-3.3-70b-versatile";

export interface GroqMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_call_id?: string;
  tool_calls?: GroqToolCall[];
}

export interface GroqToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

interface GroqResponse {
  choices: {
    message: {
      role: "assistant";
      content: string | null;
      tool_calls?: GroqToolCall[];
    };
  }[];
}

export class GroqConfigError extends Error {}

function requireApiKey(): string {
  const key = process.env.CHAT_MODEL_API_KEY ?? process.env.GROQ_API_KEY;
  if (!key) {
    throw new GroqConfigError(
      "No chat model is configured (CHAT_MODEL_API_KEY / GROQ_API_KEY unset). The voice agent has no model to call until one is."
    );
  }
  return key;
}

export async function callGroq(params: {
  messages: GroqMessage[];
  tools?: readonly unknown[];
  strong?: boolean;
}): Promise<{ content: string | null; toolCalls: GroqToolCall[] }> {
  const apiKey = requireApiKey();

  const res = await fetch(BASE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: params.strong ? STRONG_MODEL : FAST_MODEL,
      messages: params.messages,
      tools: params.tools,
      tool_choice: params.tools ? "auto" : undefined,
      temperature: 0.1, // this extracts structured intent, not prose — low variance is correct
    }),
    // A voice agent that hangs is worse than one that fails fast and lets
    // the owner retry.
    signal: AbortSignal.timeout(20_000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Groq request failed (${res.status}): ${body.slice(0, 500)}`);
  }

  const json = (await res.json()) as GroqResponse;
  const message = json.choices[0]?.message;
  return {
    content: message?.content ?? null,
    toolCalls: message?.tool_calls ?? [],
  };
}

const VISION_MODEL = process.env.CHAT_MODEL_VISION ?? "llama-3.2-11b-vision-preview";

/**
 * One-shot image → text call for receipt/bill OCR. Same swappable-endpoint
 * story as callGroq: the long-term preferred target is a self-hosted vision
 * model (the spec names Gemma's vision variant as a candidate, sized to
 * whatever hardware actually gets provisioned — see
 * VOICE_AGENT_ARCHITECTURE.md), reached over this same CHAT_MODEL_BASE_URL
 * once that server also exposes a vision-capable model at
 * CHAT_MODEL_VISION.
 */
export async function callVisionExtract(params: {
  imageDataUrl: string;
  prompt: string;
}): Promise<{ content: string | null }> {
  const apiKey = requireApiKey();

  const res = await fetch(BASE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: VISION_MODEL,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: params.prompt },
            { type: "image_url", image_url: { url: params.imageDataUrl } },
          ],
        },
      ],
      temperature: 0.1,
    }),
    signal: AbortSignal.timeout(25_000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Vision request failed (${res.status}): ${body.slice(0, 500)}`);
  }

  const json = (await res.json()) as GroqResponse;
  return { content: json.choices[0]?.message?.content ?? null };
}
