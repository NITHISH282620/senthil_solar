import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * A key identifying one submission intent, for idempotent money writes.
 *
 * Generated once when a form is opened and reused for every retry of that same
 * submission, so a lost response, a refresh or a back-button resubmit is
 * recognised as the same transaction rather than becoming a second one.
 * Regenerate it only after a submission has actually succeeded.
 */
export function newRequestKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/** True when a Postgres error is a unique-constraint violation on `index`. */
export function isDuplicateKey(
  error: { code?: string; message?: string } | null,
  index: string,
): boolean {
  if (!error) return false;
  return error.code === "23505" && (error.message ?? "").includes(index);
}
