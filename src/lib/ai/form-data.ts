/**
 * Every existing money-writing action takes a `FormData`, because it was
 * built for an HTML form. The agent's arguments arrive as a plain object
 * from the model instead. This adapts one to the other so the agent calls
 * the exact same `createExpense`/`createCashEntry`/`addPayment`/
 * `recordClientCredit` functions the forms call — same validation, same
 * RLS, same idempotency — rather than re-implementing any of it.
 */
export function toFormData(
  values: Record<string, string | number | boolean | undefined | null>
): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined || value === null) continue;
    if (typeof value === "boolean") {
      if (value) fd.set(key, "on"); // matches the checkbox() zod helper's expectation
      continue;
    }
    fd.set(key, String(value));
  }
  return fd;
}
