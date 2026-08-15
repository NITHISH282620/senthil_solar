# Implementation Progress

Running log of the transformation from the audited baseline into an operating
system for a solar EPC contractor. Newest phase last.

**Ordering principle:** owner → money → quotations → contracts → sites →
employees → attendance → advances → expenses → payroll → payments → materials →
reports → automation.

---

## Baseline (inherited, verified)

The database is genuinely production-grade and further ahead than the
application layer. Seven migrations define 45 tables and 9 views, with GST-
correct invoicing, an append-only cash ledger, derived-only balances, generated
columns for every total, and triggers that keep invoices in step with payments.

Most defects found so far are the **application** disagreeing with that schema.
None of them are type-checked, because the Supabase client is not generic-typed:
table and column names are unchecked strings, so a wrong name compiles cleanly
and fails only at runtime.

---

## Phase 1 — Close the known gaps (§26)

**Status: complete.** `npm run verify` green — typecheck, 0 lint errors, build.

| # | Gap | Resolution |
|---|---|---|
| 3 | quotation → contract conversion | `convertQuotationToContract` implemented; carries client, value, capacity and scope across, inherits the client's standing payment terms, marks the quotation `converted` so it cannot convert twice, and rolls the contract back if that fails |
| 4 | invoice payments "Not implemented" | `addPayment` / `deletePayment` implemented against the existing triggers |
| 10 | remaining schema/code mismatches | see below |

**Contract creation did not exist at all.** `contract-form.tsx` was a stub that
raised a toast reading "needs to be implemented", and `contracts.ts` had no
write path — so the central `Company → Contract → Site` spine could not be
created through the UI. Added `createContract` / `updateContract` and wired the
form.

**Quotation creation would have failed on first use.** `quotationDataSchema`
targeted `customer_id`, `system_capacity_kw`, `tax_percent` and `tax_amount` —
none of which exist — and both it and `quotationLineItemSchema` tried to write
`total_amount` / `line_total`, which are `GENERATED ALWAYS` columns that reject
writes (SQLSTATE 428C9). Rewritten against the real tables.

**Other mismatches repaired:** payment method `credit_card` → `card` (rejected
by both the zod enum and the DB check constraint); `tds_on_payment` →
`tds_deducted`; unsanitised search input in `getContracts` passed straight into
a PostgREST `or()` filter.

**Payments rely on the database rather than re-implementing it.** A trigger
already recomputes `amount_received` and invoice status, and another rejects
overpayment, so `addPayment` only writes the payment and mirrors it into the
cash book. Reversal is a soft delete — the sync trigger counts only rows with
`deleted_at IS NULL`, so soft-deleting is precisely what restores the balance.

---

## Phase 2 — Daily money (§6, §7)

**Status: core complete.** `npm run verify` green.

The highest-leverage module. See **ADR-0003** for the modelling decision.

- **`QuickMoneySheet`** — one bottom sheet, amount-first, autofocused, with
  ₹20/₹50/₹100/₹200/₹500/₹1000 presets, four large payment-mode targets, and an
  optional note that falls back to the category label. Direction, category and
  site are taps, not typing. Target of under ten seconds met for the common case.
- **`createCashEntry` fans out** to `expenses` and `salary_advances` so one
  action keeps treasury, profitability and payroll in step. Without this, a ₹100
  fuel entry would never have reached site profitability, because
  `v_site_financials` reads `expenses`, not `cash_book`.
- **Cash book page** with in-hand balance, today's in/out, and a running balance
  per row. The balance column is suppressed under a filter rather than shown as
  a figure that will not reconcile.
- **New migration** `20260815000100_cash_categories.sql` adds the
  `worker_advance`, `salary` and `client_payment` categories the workflow needs.
  Idempotent.

**Sites** got their action layer and list page in this phase, because site
attribution is a prerequisite for every money form.

---

## Known-remaining (carried forward, not lost)

- **Infrastructure, not code:** Supabase project, Vercel env vars, migrations
  applied, first account becomes owner. Until then production shows
  "Setup required".
- **RLS is written but unverified** (§5, §26.5–8). 482 lines exist in
  `20260812000600_rls.sql`; no policy has been executed against a live database.
- **Attendance → payroll** is not yet wired (§13, §25).
- **Materials, vendors, purchase orders** have full schemas and no UI (§17, §18).
- **Owner dashboard** is still the inherited placeholder (§19).
- **`createInvoice` ignores GST mode** — it always splits CGST/SGST and never
  sets `is_interstate`, so an interstate invoice would be wrong. The schema
  constraint permits it because the amounts are still self-consistent.
