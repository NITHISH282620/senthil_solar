/**
 * Shared types for the Owner Voice Agent.
 *
 * The model never sees these as TypeScript — it sees the JSON Schemas in
 * `tools.ts`. This file is what the SERVER trusts once a tool call comes
 * back, after `tools.ts`'s zod schemas have validated it.
 */

export type ChatRole = "user" | "assistant";

export interface ChatTurn {
  role: ChatRole;
  content: string;
}

/** Tools that only read data. Executed immediately, no confirmation. */
export const READONLY_TOOLS = [
  "find_employee",
  "find_site",
  "find_company",
  "find_invoice",
  "get_today_summary",
] as const;

/** Tools that write money or a claim against money. Always confirmed first. */
export const MUTATION_TOOLS = [
  "propose_expense",
  "propose_cash_entry",
  "propose_invoice_payment",
  "propose_client_credit",
] as const;

export type ReadonlyToolName = (typeof READONLY_TOOLS)[number];
export type MutationToolName = (typeof MUTATION_TOOLS)[number];
export type ToolName = ReadonlyToolName | MutationToolName;

export function isMutationTool(name: string): name is MutationToolName {
  return (MUTATION_TOOLS as readonly string[]).includes(name);
}

/** What a mutation tool call resolves to before the owner has confirmed anything. */
export interface Proposal {
  proposalEventId: number;
  requestKey: string;
  toolName: MutationToolName;
  /** Fully-resolved args — fuzzy names already turned into real ids. */
  args: Record<string, unknown>;
  /** Human-readable, in the request's own language, for the confirmation card. */
  summary: string;
}

/** What the /turn endpoint hands back to the client for one model turn. */
export type AgentTurnResult =
  | { kind: "message"; text: string }
  | { kind: "proposal"; proposal: Proposal }
  | { kind: "error"; error: string };
