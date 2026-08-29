# Owner Voice Agent — architecture

Status date: 2026-08-29. Owner-only feature: every route behind this checks
`getCurrentUser().role === "owner"` before doing anything else, including
before any network call to a model.

## The one rule everything else follows

**The model decides which tool to call. The server decides whether the
action is allowed.** The model never has database access, never sees a
table name, and never gets to execute anything directly. It gets a fixed
list of tool schemas (`src/lib/ai/tools.ts`) and nothing else. Every
mutation tool the model can "call" only *resolves and validates* what it
would do — the actual write happens in a separate step, after the owner has
seen the resolved result and explicitly confirmed it, through the exact
same server actions the existing UI forms already use
(`createExpense`, `createCashEntry`, `addPayment`, `recordClientCredit`).
Nothing about RLS, role checks, or business validation was rebuilt for the
agent — it is a new caller of code that already existed and was already
trusted.

## Request flow

```
owner speaks/types
  → browser: Web Speech API transcribes locally (no server round-trip for ASR)
  → POST /api/agent/turn  { sessionId, message, history, locale }
       - auth: must be owner, or 403 before any model call
       - rate limit: checked against ai_agent_events, not in-memory
         (this runs on Vercel serverless — in-memory state isn't durable
         across invocations)
       - logs a 'turn' event
       - calls the chat model with the tool schemas
       - loop (max 5 iterations):
           - no tool call  → return { kind: "message", text }
           - read-only tool (find_*, get_today_summary) → execute now,
             feed the result back to the model, keep looping
           - mutation tool (propose_*) → resolveProposal() turns fuzzy
             model args into a fully-resolved, re-validated set of real
             ids and a human-readable summary in the owner's own
             language; logs a 'proposal' event; returns it to the client
             WITHOUT executing anything
  → client renders the confirmation card verbatim from `proposal.summary`
  → owner taps Confirm
  → POST /api/agent/confirm { proposalEventId }
       - re-fetches the proposal FROM THE DATABASE by id — the client
         cannot smuggle a different amount/id in on confirm, because
         confirm never trusts anything the client sends except which
         proposal to act on
       - refuses if already decided (idempotent — a retried tap doesn't
         double-execute)
       - calls the real server action (createExpense / createCashEntry /
         addPayment / recordClientCredit) with the exact FormData built
         from the resolved args, plus the request_key generated at
         proposal time
       - logs 'confirmed' then 'executed' (or 'failed')
  → owner taps Cancel  → POST /api/agent/reject → logs 'rejected', writes nothing
```

Read-only questions ("how much cash do we have") never touch the
confirmation flow — they execute inside the loop and come back as a plain
answer.

## Tool layer

| Tool | Kind | Wraps |
|---|---|---|
| `find_employee` / `find_site` / `find_company` / `find_invoice` | read-only | `getEmployees`, `getSiteOptions`, `getCompanies`, `getInvoices` |
| `get_today_summary` | read-only | `getCashSummary`, `getDashboardToday` |
| `propose_expense` | mutation | `createExpense` |
| `propose_cash_entry` | mutation | `createCashEntry` (worker advances, salary, misc cash) |
| `propose_invoice_payment` | mutation | `addPayment` |
| `propose_client_credit` | mutation | `recordClientCredit` |

The model is instructed (`src/lib/ai/system-prompt.ts`) to never invent an
id — every `site_id`, `employee_id`, `company_id`, `invoice_id` it passes to
a `propose_*` tool must have come from a `find_*` call earlier in the same
conversation. `resolveProposal()` (`src/lib/ai/mutation-handlers.ts`)
re-verifies every id against the database regardless — a `site_id` that
doesn't exist, or that the model hallucinated, is rejected before a
proposal is ever created, not trusted because the model claimed it came
from `find_site`.

Amounts, dates, categories and free text are zod-revalidated
(`src/lib/ai/tools.ts`) against the same shapes the existing form schemas
enforce (`cashEntrySchema`, `paymentSchema`, `expenseSchema` in
`src/lib/validations.ts`), independent of whatever the model actually sent.

## Audit trail

`ai_agent_events` (migration `20260829000100_ai_agent_events.sql`) is
**not** a replacement for `audit_logs` — the underlying tables' own
triggers still write to `audit_logs` exactly as before, for every write
this feature makes. `ai_agent_events` is the trail of what the *agent*
proposed and how the owner responded: every row is one of `turn`,
`proposal`, `confirmed`, `executed`, `rejected`, `failed`, append-only, RLS
restricted to the owner's own rows (`auth_is_owner() AND user_id =
auth.uid()`), no UPDATE or DELETE policy. A `proposal` row's `tool_args`
is the FULLY RESOLVED arguments (real ids, not what the model literally
said) — so reviewing this table answers "what did the agent actually
propose to do", not "what did the model say".

## Idempotency

Every proposal gets a `request_key` at the moment it's created
(`newRequestKey()`), before the owner has even seen the confirmation card.
That same key is passed to the underlying server action on execution. If
the confirm request is retried (lost response, double tap, a flaky mobile
connection retrying automatically), the underlying action's existing
`request_key` unique-index handling — already built for the regular UI
forms — returns the original row instead of creating a second one.
`/api/agent/confirm` also checks `proposalAlreadyDecided()` before
attempting execution at all, as a second, cheaper line of defense against
double-execution.

## Model layer — self-hosted vs. hosted

`src/lib/ai/groq-client.ts` talks to a plain OpenAI-compatible Chat
Completions endpoint over `fetch` — nothing above it (tools, prompts, API
routes) knows or cares who's serving the model. Endpoint and model names
are all environment variables:

| Env var | Purpose | Default |
|---|---|---|
| `CHAT_MODEL_BASE_URL` | Chat Completions endpoint | Groq's |
| `CHAT_MODEL_API_KEY` (or `GROQ_API_KEY`) | Bearer token | — required |
| `CHAT_MODEL_FAST` | Model for ordinary turns | `llama-3.1-8b-instant` |
| `CHAT_MODEL_STRONG` | Model for a failed/ambiguous resolution | `llama-3.3-70b-versatile` |
| `CHAT_MODEL_VISION` | Model for receipt OCR | `llama-3.2-11b-vision-preview` |

**Why Groq is the default, not a self-hosted model, today:** this
development sandbox and the app's Vercel deployment both have no GPU.
Vercel serverless functions cannot run a multi-gigabyte model no matter
which one is chosen — self-hosting, for this product, always means a
*separate, always-on server* that Vercel calls over HTTP, functionally the
same shape as calling Groq, just with a different host. That is a real
infrastructure decision (a GPU box costs money whether rented or bought)
that needs the owner's sign-off, not something to silently provision.
Groq hosts the same class of open-weight model (Llama, Qwen) behind this
exact API shape for free, which is why it's wired as the default: it's a
genuine placeholder for "a self-hosted OpenAI-compatible endpoint", not
throwaway code that needs replacing later.

**The preferred self-hosted target, if/when a GPU server is provisioned:**

| Stage | Preferred model | Notes |
|---|---|---|
| Agent (intent + tool calls) | **Qwen3 4B or 8B**, non-thinking mode for ordinary commands, reasoning enabled only for genuinely ambiguous ones | Drop-in via `CHAT_MODEL_BASE_URL` pointed at a vLLM/Ollama server exposing Qwen3 |
| ASR | **AI4Bharat IndicConformer** (Tamil/Indic accuracy, code-switching) with Whisper large-v3-turbo as an English/fallback path | Not wired yet — today's ASR is the browser's own Web Speech API (see below) |
| Vision (receipt OCR) | A vision-capable open model sized to whatever GPU is actually provisioned (Gemma's vision variant is a reasonable candidate; the spec's "don't blindly install a huge model" applies directly here) | `CHAT_MODEL_VISION` against the same self-hosted endpoint once it serves a vision model |
| TTS | **AI4Bharat IndicF5** for Tamil/Indic speech | Not wired yet — today's TTS is the browser's own SpeechSynthesis |

**Indicative hardware for Qwen3-8B + a vision model, self-hosted:** a
single GPU with ≥24GB VRAM (e.g. an RTX 4090, L4, or A10) comfortably runs
Qwen3-8B in bf16/int8 with room for a vision model alongside it at
interactive latency via vLLM; Qwen3-4B fits far more modest hardware
(≥12GB VRAM) if 8B's quality isn't needed. IndicConformer and IndicF5 are
both far smaller and can share the same box. This needs to run as an
always-on server (a cloud GPU instance — RunPod, Lambda, a reserved cloud
VM — or on-prem hardware at the office), reachable over HTTPS from Vercel;
ballpark cost for a modest always-on cloud GPU instance capable of this is
roughly $200–600/month depending on provider and GPU tier, or $0 marginal
cost if suitable hardware is already owned and kept on. **This is a cost
and ops decision for the owner, not something this session provisions.**

## ASR/TTS — what's actually implemented today

Web Speech API, built into Chrome for Android (the S24 Ultra's default
browser): `SpeechRecognition` for voice input (`ta-IN` / `en-IN`),
`speechSynthesis` for spoken replies. Zero added infrastructure, zero API
key, zero added latency beyond what Chrome's own recognition takes. This
is what `src/components/shared/voice-agent/use-speech.ts` wires up, and
it's real and testable right now — not a placeholder. Its ceiling is real
too: accuracy on heavy Tamil/English code-switching in a single sentence
is noticeably worse than a purpose-built Indic ASR model, which is exactly
the gap IndicConformer is meant to close later.

## What was explicitly NOT built, and why

- **Bixby / Google Assistant integration.** These are separate native
  platform projects — a Bixby capsule requires a Samsung developer account
  and capsule submission through Bixby Studio (JS/Kotlin, not a web app);
  Google's third-party Conversational Actions platform (the thing that
  would have let a phrase like "Hey Google, ask SolarOps...") was
  discontinued by Google in 2023 and no longer accepts new integrations.
  Neither is reachable from a Next.js web app, and building either is a
  separate, multi-week platform integration effort with its own developer
  account, review process, and (for Bixby) a private beta/certification
  step. Not attempted here rather than faked.
- **A second business-logic layer.** Every mutation goes through the exact
  server action the UI forms already call. There is no parallel
  "AI version" of expense/payment/cash-entry logic to keep in sync.

## Files

- `src/lib/ai/types.ts` — shared types, tool name lists
- `src/lib/ai/tools.ts` — tool JSON Schemas (sent to the model) + zod
  re-validation (trusted, run on whatever the model actually returns)
- `src/lib/ai/system-prompt.ts` — the model's entire instruction set
- `src/lib/ai/groq-client.ts` — the swappable model client (chat + vision)
- `src/lib/ai/lookup-handlers.ts` — read-only tool execution
- `src/lib/ai/mutation-handlers.ts` — resolve (validate + summarize) and
  execute (call the real action) for every mutation tool
- `src/lib/ai/rate-limit.ts` — sliding-window limits against `ai_agent_events`
- `src/lib/ai/events.ts` — the append-only event log
- `src/lib/ai/form-data.ts` — adapts plain objects to the `FormData` shape
  every existing action expects
- `src/app/api/agent/turn/route.ts` — the only route that calls the model
- `src/app/api/agent/confirm/route.ts` — the only route that writes money
- `src/app/api/agent/reject/route.ts`
- `src/app/api/agent/ocr/route.ts` — receipt photo → extracted fields, never auto-applied
- `src/components/shared/voice-agent/*` — mic button, chat panel,
  confirmation card, OCR review card, Web Speech wrapper
- `supabase/migrations/20260829000100_ai_agent_events.sql`

## Production blockers

1. **No `CHAT_MODEL_API_KEY` / `GROQ_API_KEY` is set anywhere yet** — local
   `.env.local`, or production's Vercel env vars. Until one is, every
   `/api/agent/turn` and `/api/agent/ocr` call returns a clean 503 with an
   explanation — verified in this session — rather than crashing, but the
   feature is inert. A free Groq key (console.groq.com) is enough to make
   it functional; no payment method required for the free tier.
2. **The `ai_agent_events` migration has not been applied to production.**
   It was applied and fully tested against the local Supabase instance
   (see VOICE_AGENT_TEST_RESULTS.md) but this session's write access was
   refused for the production database by the environment's own auto-mode
   safety classifier when attempted directly — this needs the user (or a
   session with that permission) to run
   `PROD_DB_URL=... ./scripts/psql-prod.sh supabase/migrations/20260829000100_ai_agent_events.sql`,
   the same pattern every prior migration in this project used.
3. **This code has not been pushed to production** pending the two items
   above and the user's review — unlike the i18n feature, this touches
   financial-mutation-adjacent code and deserved an explicit go-ahead
   before shipping, not just a clean local test run.
