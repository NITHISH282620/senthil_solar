/**
 * Server-side record of operations that must never fail quietly.
 *
 * Every money action already returns its error to the caller, which the UI
 * toasts — the user is told. But nothing reached the server log, so when the
 * owner rings up to say "the payment didn't save", there was nothing to look
 * at: no invoice id, no amount, no database message, no time. A failure the
 * user saw and the operator cannot reconstruct is a silent failure from the
 * only perspective that can fix it.
 *
 * Structured single-line JSON, because that is what Vercel's log search can
 * actually filter on. No amounts of personal data beyond the ids needed to
 * find the row again.
 */
export function logFailure(
  operation: string,
  message: string,
  context: Record<string, unknown> = {},
): void {
  console.error(
    JSON.stringify({
      level: "error",
      at: new Date().toISOString(),
      operation,
      message,
      ...context,
    }),
  );
}

/**
 * Something recovered from, but worth knowing about — a compensating delete
 * that ran, a fallback that fired. Not an error; still evidence.
 */
export function logWarning(
  operation: string,
  message: string,
  context: Record<string, unknown> = {},
): void {
  console.warn(
    JSON.stringify({
      level: "warn",
      at: new Date().toISOString(),
      operation,
      message,
      ...context,
    }),
  );
}
