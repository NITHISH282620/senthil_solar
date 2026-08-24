# Production Readiness

Assessed 2026-08-24 against a live database. Evidence in `TEST_RESULTS.md`,
permissions in `ROLE_ACCESS_MATRIX.md`, unbuilt work in
`BUSINESS_GAP_ANALYSIS.md`.

```
PRODUCTION READINESS   74 / 100
PRODUCTION BLOCKERS     0 remaining in code  ·  1 remaining in deployment config
```

Before this pass it was not deployable at any score: any authenticated user
could make themselves the owner in one request.

## Score

| Area | Score | Why |
|---|:--:|---|
| Authorisation | 18/20 | Site scoping and financial isolation are enforced in the database and verified per role. Escalation paths closed. `company_settings` is still world-readable to any authenticated user. |
| Money correctness | 17/20 | Receivables, TDS, payroll, advances and the cash book now reconcile. No payables ledger, and one payment still cannot settle several invoices. |
| Audit and traceability | 9/10 | Twelve tables audited with before/after state, immutable, now readable. Stock movements are not traceable because stock is not implemented. |
| Attendance and payroll | 16/20 | Multi-site days, half days, leave and advance recovery are correct. No payroll reopening; piece-rate pays zero by design. |
| Operational completeness | 8/20 | Inventory, client portal, payables, reminders and the daily summary do not exist. |
| Deployment safety | 6/10 | Signup is open on the running stack. The application now provisions dormant, but the platform setting is still wrong. |

## The one remaining blocker is not in the code

`GOTRUE_DISABLE_SIGNUP=false` and `GOTRUE_MAILER_AUTOCONFIRM=true` on the
running stack mean anyone can register. Migration 0009 makes that harmless —
new accounts are created inactive and `auth_role()` requires `is_active`, so a
self-registered user can read nothing — but defence in depth says shut the door
as well as locking the room behind it.

There is no `supabase/config.toml` in the repository, so this setting is not
version-controlled. Before going live:

1. In the Supabase dashboard, **Authentication → Providers → Email**, turn off
   "Allow new users to sign up".
2. Commit a `supabase/config.toml` with `[auth] enable_signup = false` so local
   stacks match production.
3. Set `SUPABASE_SECRET_KEY` in the deployment environment — employee creation
   uses the service-role client and fails without it.

Employees are created by the owner through `createEmployee`, which uses the
admin API. Nothing depends on public signup.

## What is now safe

- **No path to privilege escalation.** Role, pay, employment status, banking
  and KYC are owner-only, enforced by trigger because RLS cannot express column
  restrictions. Six escalation attempts, all blocked, all re-verified.
- **Field staff cannot see money.** Not company financials, not other people's
  pay, and — since this pass — not the contract value or margin of the site
  they stand on.
- **Site boundaries hold on write as well as read.** An engineer's attempt to
  write an expense or attendance at an unassigned site is refused by
  `WITH CHECK`, not merely hidden from a listing.
- **History cannot be rewritten.** `audit_logs`, `site_events` and
  `stock_ledger` have no UPDATE or DELETE policy for anyone, the owner included.
- **The books reconcile.** Payments, TDS, voids, advances, payroll and the cash
  book agree; site costs roll up to contracts exactly.

## What to do before the first real rupee

1. Turn off public signup (above).
2. **Set the company's GST state code** in Settings. It decides CGST+SGST
   against IGST on every invoice. Unset, the system falls back to intra-state,
   which is wrong for every out-of-state client and produces an unfilable
   GSTR-1.
3. **Set each employee's pay basis and rate.** Payroll reads `daily_rate` and
   `monthly_salary` straight from the profile; an employee created without them
   earns zero on every run, silently.
4. **Create at least one bank account** if any money will move by transfer —
   `cash_book` refuses a `bank` entry without one.
5. Decide who holds the accountant role. Accountant can reverse payments and
   void cash entries; manager cannot.

## Known limits to accept or schedule

| Limit | Impact | Suggested |
|---|---|---|
| Inventory not implemented | Materials are recorded as expenses, so cost is captured, but there is no stock, no reorder alert, and `material_cost` is always zero | Schedule — see gap analysis |
| No payables ledger | "Which bills do I need to pay?" is unanswerable | Schedule |
| No client portal | Clients phone instead | Optional |
| One payment cannot span several invoices | Accountant records it against one and holds the rest on account | Acceptable for now |
| Finalised payroll cannot be reopened | A mistake found after finalising needs a database change | Schedule |
| Piece-rate staff compute to zero | Deliberate — the module collects no production figures. The person appears on the run rather than vanishing from it | Acceptable |
| `company_settings` readable by all | GST, PAN and CIN exposed to any authenticated user. These appear on every invoice the company issues | Low |
| No automated test suite in CI | `supabase/tests/rls_matrix.sql` must be run by hand | Schedule |

## Running the checks

```bash
npm run verify        # typecheck, lint, build

docker exec -i supabase_db_senthil-solar psql -U postgres -d postgres \
  < supabase/tests/seed_roles.sql
docker exec -i supabase_db_senthil-solar psql -U postgres -d postgres \
  < supabase/tests/rls_matrix.sql
```

Every line under PRIVILEGE ESCALATION must read `BLOCKED`, and `site_revenue`
must read `0` for engineer, supervisor, store manager, worker and client.
