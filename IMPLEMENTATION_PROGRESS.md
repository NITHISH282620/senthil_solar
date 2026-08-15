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

## Phase 3 — Owner dashboard, sites, profitability (§11, §16, §19, §20)

**Status: complete.** `npm run verify` green; 30 routes build.

- **Owner dashboard rebuilt** to the business-first layout: cash in hand,
  in/out today, what clients owe, active sites, workers present — then a
  "needs attention" grid (overdue invoices, sites past deadline, sites missing
  attendance, expenses to approve, open quotations, advances outstanding), then
  site profitability and receivables. Every tile is a link into the work.
  Reads `v_dashboard_today`, a single row of scalar sub-selects, so the whole
  header costs one round trip rather than twelve.
- **Field roles get a different dashboard entirely.** A worker or supervisor
  sees their attendance and expense entry, never company money. RLS is the real
  boundary; this avoids rendering tiles that would come back empty anyway.
- **Site profitability** (`v_site_financials`) surfaced on both the dashboard
  (worst margin first — the losing sites are what the owner needs) and each
  site page, broken into materials / labour / site expenses against allocated
  revenue.
- **Sites** now have list, detail, new and edit pages, plus stage and status
  handling. Quick money entry is embedded on the site page, pre-locked to that
  site.

---

## Phase 4 — Expenses, RLS alignment (§5, §15, §26.5–8)

**Status: complete.** See the commit for detail.

Static RLS review: all 46 tables enable RLS and carry policies; money tables
gate on `auth_can_see_money()` (owner, manager, accountant), so field roles are
excluded as §5 requires. **Still unexecuted against a live database.**

That review caught a bug from Phase 2: `createCashEntry` allowed engineers and
supervisors, but `cash_book_write` does not. Such a user would have created the
expense, been refused on the cash book, and been refused again on the
compensating delete — orphaning an expense that silently inflated site cost.
Entry roles now mirror the policy; field staff use `createExpense` instead.

Both expense functions were stubs. Implemented, along with a rewrite of the
stale `expenseSchema` (it targeted `project_id`/`date` and hardcoded categories
that are not rows in `expense_categories`).

---

## Phase 5 — Attendance and payroll (§12, §13, §14, §25)

**Status: complete.** `npm run verify` green.

**Check-in was broken in two ways at once.** `attendance.site_id` is `NOT NULL`
and the day is unique per `(employee_id, site_id, date)`, but `checkIn` sent no
site and upserted on `employee_id,date` — so it violated a NOT NULL constraint
and named a constraint that does not exist. Check-in is now site-scoped, picks
up the person's active assignments, and captures GPS on a best-effort basis
(a refused permission must not stop someone marking attendance). Check-out
closes the most recent still-open row rather than assuming one row per day, and
derives `worked_hours`, which payroll consumes.

**Payroll engine** (`generatePayroll`) builds a month from attendance with
nothing keyed by hand: days from `v_attendance_monthly`, rates from the
profile, deductions from outstanding advances. Rates are snapshotted onto each
line, so a later rate change cannot rewrite an issued payslip. Pay is allocated
across the sites the person actually worked, via `payroll_site_allocations` —
this is what carries labour into `v_site_financials`.

**Finalising** recovers advances oldest-first, capped at both what is owed and
the gross (a payslip can never go negative), then locks the month's attendance.
Owner-only, and irreversible by design.

The §14 loop now closes end to end: ₹300 advance → `salary_advances` →
`advance_deduction` on the payslip → recovered on finalise.

---

## Known-remaining (carried forward, not lost)

- **Infrastructure, not code:** Supabase project, Vercel env vars, migrations
  applied, first account becomes owner. Until then production shows
  "Setup required".
- **RLS is written but unverified** (§5, §26.5–8). 482 lines exist in
  `20260812000600_rls.sql`; no policy has been executed against a live database.
- **Materials, vendors, purchase orders** have full schemas and no UI (§17, §18).
- **Owner dashboard** is still the inherited placeholder (§19).
- **`createInvoice` ignores GST mode** — it always splits CGST/SGST and never
  sets `is_interstate`, so an interstate invoice would be wrong. The schema
  constraint permits it because the amounts are still self-consistent.
