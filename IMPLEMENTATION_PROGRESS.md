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

## Phase 6 — Site crew, GST correctness (§32 walkthrough)

**Status: complete.** `npm run verify` green.

Walking the §32 end-to-end scenario found the blocker that mattered most:
**nothing wrote `site_assignments`.** Attendance is site-scoped and offers only
the sites a person is assigned to, so with no way to assign anyone, no worker
could ever mark a day — and with no attendance there is no payroll and no
labour cost on any site. Added assignment actions and a crew manager on the
site page. Re-activates a prior assignment instead of stacking duplicates, and
removal is soft so historic attendance and payroll allocations still resolve.

**GST was wrong for every out-of-state client.** `createInvoice` always split
CGST/SGST and never set `is_interstate`. Nothing would have caught it: the
`invoice_gst_mode_consistent` constraint only checks that the amounts are
internally consistent, which they were. It now compares the client's state code
against ours and charges IGST across state lines, falling back to intra-state
when either code is unknown rather than guessing.

---

## Phase 7 — Static verification sweep (§23, §29)

**Status: complete.** `npm run verify` green.

Rather than eyeballing, I cross-checked the code against the schema
mechanically: every `.from()` table, every `.eq/.order/.is/.in` column, and
every `.insert/.update` payload key against the real column list. Tables and
filter columns all resolve. Two payload mismatches surfaced, one real:

- **The audit trail was silently empty.** `logAudit` wrote `entity_type`,
  `entity_id` and `details` — the columns are `table_name`, `record_id`,
  `new_values` — and passed `action` values (`document_upload`) that the CHECK
  constraint rejects. Every audit insert failed, and because the result was
  never inspected, nothing said so. §23 asks for an audit trail; there was
  none. Fixed, and failures are now logged rather than swallowed.
- The payroll hit was a false positive from the matcher spanning two
  statements.

**Documents were hard-deleted** despite having `deleted_at`, against §23. Now a
soft delete; the stored file is deliberately left in place, since removing it
would make the soft delete unrecoverable. `getDocuments` filters withdrawn rows.

---

## Known-remaining (carried forward, not lost)

- **Infrastructure, not code:** Supabase project, Vercel env vars, migrations
  applied, first account becomes owner. Until then production shows
  "Setup required".
- **RLS is written but unverified** (§5, §26.5–8). 482 lines exist in
  `20260812000600_rls.sql`; no policy has been executed against a live database.
- **Materials, vendors, purchase orders** have full schemas and no UI (§17, §18).
- **Owner dashboard** is still the inherited placeholder (§19).

---

## Phase — Production hardening (2026-08-24 / 25)

Ran the full loop from the brief: security blocker, complete authorisation
attack suite, ledger reconciliation, TDS, payroll allocation, attendance to
payroll, expense accounting, pending-expense rule, a whole simulated day,
owner and mobile experience, data-integrity invariants, failure testing,
deployment check.

**Provisioning.** Proved the signup hole rather than assuming it:
`POST /auth/v1/signup` returned HTTP 200 with a usable token. Closed at two
layers — `supabase/config.toml` (which did not exist, so every stack ran on
permissive defaults) and a database trigger, so the invariant survives a
dashboard change. The first discriminator I tried, a marker in
`raw_app_meta_data`, **broke the owner's own provisioning path**: GoTrue writes
`app_metadata` in an UPDATE after the INSERT, so at trigger time an
admin-created user is identical to a signup. Caught by capturing what the
trigger actually receives. Replaced with `employee_invitations`, which records
authorisation before the account exists.

**Authorisation.** `supabase/tests/authz_attacks.sql`: 130 attack assertions
across 8 roles and every verb on every sensitive table, plus 9 legitimate
actions that must keep working. 130 blocked, 9 allowed.

**Money.** Ledger cases A–E reconcile to the paisa. Case D produced the one
genuine gap: an overpayment was recorded and displayed nowhere, so the owner
would bill the client again for money already banked. Client credit is now a
stated rule, a view, and a control on the invoice.

**Integrity.** `v_integrity_check` states eleven invariants as one query, and
`supabase/tests/integrity.sql` injects defects to prove the check catches them —
a vacuously empty check is worse than none, because it reassures.

**Idempotency.** Money writes now carry a key per submission intent behind a
partial unique index. Proven with a partial payment retry, where the invoice
balance would have absorbed a second receipt and only the key stops it.

**Interface.** Base UI's `Select.Value` renders the raw value unless `items` is
supplied. Nothing passed it, so all 21 selects showed their underlying value —
including a bare UUID wherever options are keyed by id. Fixed once in the
wrapper by deriving `items` from the children.

Full evidence in `TEST_RESULTS.md`; readiness and the remaining blocker in
`PRODUCTION_READINESS.md`.


---

## Phase — Go-live execution (2026-08-25)

Ran the deployment-hardening loop against a **production build**, driven through
a real browser.

**The deployment target does not exist.** Outbound network now works, which the
previous pass could not confirm. With it working, the finding changed: the
Supabase project in `.env.local` has no DNS record at all — checked three ways,
while `supabase.co` resolves. A paused project still resolves. This one is
deleted, or the reference is wrong. There is no production database, and no
Supabase or Vercel credentials on this machine to create or link one.

**Nine defects, none of them visible in the source.** Three of them formed a
chain that stopped the business at successive links: quotations could not be
created (a schema rejecting the `null` it emits), an approved quotation could
not become a contract (two mutually exclusive render conditions), and sites
could not be created without assigning both an engineer and a supervisor (empty
strings reaching uuid columns). Then: bank payments were impossible because
`bank_accounts` had no UI while the payment dialog defaulted to Bank Transfer;
client money arriving outside an invoice had nowhere to go; landing on
`/unauthorized` silently signed the user out, because Next prefetches links and
logout answered GET; seven routes rendered fully for a worker; `/unauthorized`
carried two meanings; and money failures left no server-side trace.

**What passed.** All sixteen migrations apply cleanly to an empty database, and
the bootstrap path works there — first account becomes owner, uninvited accounts
are refused, invited ones arrive active with the intended role. Sections 9, 10,
11, 12 and 13 all verified in the production build. 130/130 attacks blocked.
Zero integrity violations. No secrets in the tree or in git history.

Verdict and the exact remaining work: `PRODUCTION_READINESS.md`. Procedure:
`PRODUCTION_SETUP.md`.


---

## Phase — Go-live execution (2026-08-26)

**Corrected first:** the Supabase project was paused, not deleted. A paused
project drops its DNS record, which from outside is indistinguishable from
deletion. Resumed by the owner and verified live.

**Inspecting the go-live script before running it found three defects in it**,
which is the reason for inspecting scripts before running them:

* `supabase db execute` does not exist — the CLI's only `db` subcommands are
  diff, dump, push, pull and reset. Both the verification step and the
  instructions for running the suites against production were commands that
  would have simply failed. Replaced with `scripts/psql-prod.sh`, which runs a
  real psql from the postgres image on the host network, since this machine has
  no postgres client and the database container cannot reach the pooler.
* `backups/` was not gitignored, and the repository is public — a production
  data dump was one `git add -A` from being published.
* Nothing asserted the hardcoded project ref still matched `.env.local`.

`verify-deploy.sql` also gained a check the procedure lacked: the app has been
deployed and reachable since 15 August, so `auth.users` may hold accounts
created before any schema existed. Those accounts now have no profile, and
"first account becomes owner" keys off `profiles` being empty — so the owner
would be whoever is created next, not whoever was there first.

**Done in production:** 22 commits pushed; Vercel built and deployed `e3aed79`
to Production; mobile verified at 375/390/412; secrets clean including the
newly pushed history.

**Still blocked, needing credentials this machine does not have:** migrations
(0/16 applied), the storage bucket, disabling public signup, and
`SUPABASE_SECRET_KEY` on Vercel.

Rehearsed rather than guessed: all 16 migrations applied to a pristine database
with the full suite passing there — 130 blocked, 9 allowed, 0 violations, money
and payroll reconciling exactly.
