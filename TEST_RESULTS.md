# Test Results

Run against a live Supabase Postgres (`supabase_db_senthil-solar`) with the
project's own migrations and seed data, on 2026-08-24. Nothing below was
concluded by reading code alone; every defect has a reproduction that was
executed and every fix was re-executed afterwards.

```
ROLES TESTED                    8 / 8
WORKFLOWS EXERCISED            31
READ-VISIBILITY PROBES        312   (8 roles x 39 table/view reads)
WRITE / AUTHORISATION ASSERTS 195   (56 exploratory + 139 in the committed suite)
BUSINESS / FINANCIAL SCENARIOS 47
DEFECTS FOUND                  51
DEFECTS FIXED                  51
GAPS FOUND, NOT BUILT           7
PRODUCTION BLOCKERS            10 found, 10 fixed in code
                                1 remaining, in the production deployment
```

Counts are of assertions actually executed against a database or a browser, not
of scenarios considered. Three passes: 22 defects in the first, 20 in the
production-hardening pass, 9 more in the go-live pass — every one of the last
nine found by RUNNING the application in a production build, not by reading it.

Counts are of assertions actually executed against the database, not of
scenarios considered.

## A note on method

The first pass of the write-attack suite ran all twenty assertions inside a
single `SELECT ... UNION ALL` statement and reported that a worker could insert
into `cash_book`, grant themselves an advance, and mark attendance at an
unassigned site. **All three were false positives.** `auth_role()` is `STABLE`
and takes no arguments, so PostgreSQL evaluated it once for the whole statement
and reused one principal's role for every row.

Re-running each assertion in its own transaction showed those three were
correctly blocked all along — and that four *other* results were true. The
harness in `supabase/tests/rls_matrix.sql` now runs one principal per statement
and carries a comment explaining why. It is worth stating plainly: a security
test that batches principals will lie to you.

## 1. Role isolation — 8/8 roles

Full matrix in `ROLE_ACCESS_MATRIX.md`. Headline results:

| Test | Result |
|---|---|
| Field roles (engineer, supervisor, worker) reading invoices, payments, cash book, bank accounts, payroll | Denied, all four, all three roles |
| Engineer assigned to Site A reading Site B's row, attendance, expenses | Denied |
| Engineer assigned to Site A writing an expense or attendance on Site B | Denied by `WITH CHECK`, not merely hidden |
| Worker reading another worker's payslip or advance | Denied |
| Worker deleting audit rows | Denied — no DELETE policy exists on `audit_logs` |
| Client role reading companies, contracts, sites, expenses | Denied (portal not built; nothing is exposed) |
| Store manager reading invoices, payroll | Denied |
| Accountant changing company settings | Denied |
| Accountant writing `role_permissions` | Denied |

Site scoping is enforced by *assignment*, not by role name. In the seed data
the supervisor sees all three sites because he is the named `supervisor_id` on
all three — verified as correct, not as a leak.

## 2. Privilege escalation — 4 found, all P0

| Attack | Before | After |
|---|---|---|
| Worker: `UPDATE profiles SET role='owner' WHERE id=self` | **1 row — full takeover** | Blocked |
| Worker: `UPDATE profiles SET daily_rate=99999 WHERE id=self` | **1 row — sets own wage** | Blocked |
| Accountant: promote self to owner | **1 row** | Blocked |
| Manager: demote the owner to worker | **1 row** | Blocked |
| Manager: rewrite the owner's bank account number | **1 row** | Blocked |
| Supervisor: promote self to manager | **1 row** | Blocked |

Root cause: `profiles_update_self` is `USING (id = auth.uid())`, and RLS has no
column granularity — so the subject of a row owned every column on it. This was
reachable from a browser devtools `fetch()` with the user's own JWT; no
application bug was needed. Compounding it, `GOTRUE_DISABLE_SIGNUP=false` with
`handle_new_user()` provisioning an **active** worker profile meant a stranger
was two requests from owning the company.

Fixed by `guard_profile_privileged_columns()` (trigger, because RLS cannot
express it) plus provisioning self-signups dormant.

Regression check: the owner can still set pay and roles, a manager can still
correct a colleague's phone number, and a worker can still edit their own
contact details. All verified allowed.

## 3. Money — the arithmetic

| Scenario | Result |
|---|---|
| A: full payment ₹5,90,000 against a ₹5,90,000 invoice | Correct — `paid`, balance 0 |
| B: partial ₹2,00,000 | Correct — `partially_paid`, balance ₹3,90,000 |
| C: advance before any invoice exists | DB accepts it; **no UI path** — gap, see below |
| D: client overpays | **Was hard-rejected**; excess now held on account |
| E: one payment across three invoices | **Not supported** — gap |
| F: payment reversed | Correct — balance restored by trigger |
| G: void the cash-book side of a payment | **Was broken** — invoice still said `paid` while the cash vanished. Fixed |
| TDS: client withholds 2% under s.194C | **Was broken** — every corporate invoice stuck `partially_paid` forever. Fixed |

The TDS defect was the most business-damaging of the money bugs. Indian
corporates deduct 2% TDS on contractor payments as a matter of law, so *every
single MNC invoice* would have sat in receivables as part-paid, and the owner
would have chased clients for money already remitted to the government.

Verified after fix: ₹5,90,000 invoice, ₹5,80,000 received, ₹10,000 TDS →
`balance_due 0.00`, status `paid`.

## 4. Payroll and attendance

| Scenario | Result |
|---|---|
| One man, one day, marked present at two sites | **Paid ₹1,400 for one day's work.** Now pays ₹700, cost split 0.5/0.5 across the two sites |
| Mark a present day `half_day` | **Still paid a full day** — `updateAttendanceStatus` wrote `status`, payroll reads `day_fraction`. Now 0.50 |
| Mark a day `absent` | **Still paid** — now 0.00 |
| Approve leave | **Never reached payroll at all.** Now writes the leave days; unpaid leave earns 0 |
| Supervisor marks crew attendance | **No code path existed.** Added `markCrewAttendance` |
| Attendance for a future date | Was accepted; now rejected |
| Attendance in a period payroll has paid | Correctly refused by `guard_locked_attendance` |
| Advance recovery, oldest first, capped at gross | Correct |
| Advance recovery never pushes a payslip negative | Correct |
| Wages actually paid out | **Never recorded** — cash in hand overstated by the whole wage bill. Added `payPayroll` |

## 5. Profitability reconciliation

Known dataset on an empty site: revenue ₹10,00,000; materials ₹4,00,000, fuel
₹20,000, transport ₹30,000, other ₹10,000 approved, plus ₹1,50,000 labour left
**pending approval**.

- Site P&L, contract roll-up and the sum of its sites' costs agree to the paisa.
- An expense on Site C never appeared against Site A or B.
- But the ₹1,50,000 pending expense was silently excluded, so the site showed a
  **54% margin when the true figure was 39%**. The cost is real; it is simply
  waiting for a signature. Added a `pending_cost` column to the site and
  contract views so committed-but-unapproved spend cannot quietly flatter a
  margin the owner prices his next job from.

## 6. Quotations

- `subtotal` and `gst_amount` were accepted **from the browser**, and
  `total_amount` is `GENERATED` from them — a forged form post could price a
  quotation at any figure while the printed line items said something else.
  Both are now derived server-side from the validated items.
- `updateQuotation` deleted the line items *before* inserting their
  replacements, so a failed insert left the quotation with no priced work.
  Order reversed.
- GST mode on invoices is correct: our state code 33 against a client in 33
  produces CGST+SGST; against a client in 29 (Karnataka) it produces IGST.

## 7. Audit trail

Verified by writing a change and reading the row back, not by observing that a
function was called:

```
user_id        | 3e94b30d-…   (the owner)
user_role      | owner
action         | update
table_name     | profiles
record_id      | b7aa058d-…   (the worker)
created_at     | 2026-08-24 04:09:37+00
old_values     | daily_rate 750.00
new_values     | daily_rate 1234.00
changed_fields | {daily_rate}
```

Who, what, when, which record, before and after — all present, across twelve
audited tables. `audit_logs` has INSERT and SELECT policies and **no UPDATE or
DELETE policy at all**, so history cannot be rewritten; a worker's `DELETE FROM
audit_logs` affected zero rows. The trail was, however, read by nothing in the
application — the owner's "review the audit trail" step had no screen. Added.

## 8. Dates

App code computed "today" as `new Date().toISOString().slice(0,10)` — the UTC
date — while every date the database derives uses `AT TIME ZONE 'Asia/Kolkata'`.
Between midnight and 05:30 IST the two disagreed: the dashboard's "cash in
today" and the cash page's own total were computed for different days, and an
early-morning site check-in was filed against the previous day. Replaced with a
shared `todayInIndia()` across 8 call sites.

## What could not be tested

- **Inventory lifecycle** (purchase → GRN → stock → site issue → consumption →
  return → damage). The nine tables and their RLS exist and enforce correctly,
  but no application code touches them, so there is no lifecycle to exercise.
- **Client portal.** The role exists and is correctly denied everything; there
  is no client-facing screen.
- **Browser-level testing.** No dev server was run; server actions were audited
  by reading them and their effects were exercised directly against the
  database. The findings above are all at the data and action layer.

---

# Production hardening pass (2026-08-24 / 25)

## 9. Provisioning — proven, not assumed

The brief said not to assume the configuration was correct. It was not:

```
POST http://127.0.0.1:54321/auth/v1/signup
  {"email":"attacker@evil.test","password":"..."}
→ HTTP 200, with a usable access_token (MAILER_AUTOCONFIRM=true)
```

With that token, through the public REST API, a stranger could read:

| Table | Rows returned |
|---|---|
| company_settings | 1 — **GST number, PAN, registered address, phone** |
| roles | 8 |
| expense_categories | 20 |
| site_stages | 7 |
| every business table | 0 |

The zeroes are the earlier dormant-provisioning fix holding. The rest is what
remained.

**A wrong fix, caught by measuring.** The obvious guard is to require a marker
in `raw_app_meta_data`, a column only the admin API can write. It rejected the
owner's own provisioning path. Capturing what the trigger actually receives
showed why:

```
admin createUser({app_metadata:{provisioned_by:'owner'}})
→ trigger sees: {"provider":"email","providers":["email"]}
```

GoTrue applies `app_metadata` in an UPDATE *after* the INSERT, so at BEFORE
INSERT an admin-created user is indistinguishable from a signup. Replaced with
`employee_invitations`: authorisation is recorded before the account exists, the
table is owner-only under RLS, and invitations are single use.

Verified all three directions, and again on a virgin database:

| | Result |
|---|---|
| Stranger self-registers | Refused |
| Owner invites, then provisions | Created, active, with the intended role |
| Un-invited address via the admin API | Refused |
| First account on a fresh deploy | Becomes the owner |

## 10. Authorisation attack suite — 130 assertions

`supabase/tests/authz_attacks.sql`, one transaction per assertion.

| Group | Assertions | Result |
|---|---:|---|
| Self-promotion to owner (7 non-owner roles) | 7 | all blocked |
| Raising own pay | 7 | all blocked |
| Changing another employee's role | 7 | all blocked |
| Reading the owner's bank details | 7 | all blocked |
| Minting an invitation (creating a second owner) | 7 | all blocked |
| Deleting or rewriting audit history | 14 | all blocked |
| Money tables × SELECT/INSERT/UPDATE/DELETE (5 roles) | 75 | all blocked |
| Site boundary, read and write | 5 | all blocked |
| Worker boundary | 3 | all blocked |
| Owner recoverability (demote/deactivate/delete last owner) | 3 | all blocked |
| **Legitimate actions that must keep working** | 9 | all allowed |

## 11. Ledger reconciliation

| Case | Expected | Result |
|---|---|---|
| A: ₹2,00,000 against ₹10,00,000 of invoices | receivable ₹8,00,000 | exact |
| B: a further ₹2,00,000 | INV1 paid, INV2 ₹6,00,000 | exact |
| C: ₹6,00,000 | all paid, receivable ₹0 | exact |
| D: ₹50,000 overpaid | must not vanish | **was invisible** — now credit |
| E: payment reversed | balances restored | exact, status returned to `sent` |
| Contract roll-up | agrees with its invoices | exact |

**Case D was the real finding.** The overpayment was recorded correctly as an
unallocated receipt and surfaced on no screen and in no report — findable only
by writing SQL. The owner would have billed the client again for money already
in his bank. The rule is now stated in migration 0011, shown beside the invoice
it could settle, and applied by re-pointing the receipt so the cash appears in
the cash book exactly once. Verified: ₹4,50,000 in, ₹4,30,000 allocated,
₹20,000 still on account.

## 12. TDS

Invoice ₹1,00,000, TDS ₹2,000, bank receipt ₹98,000:

| Figure | Value |
|---|---|
| Invoice value | ₹1,00,000 |
| TDS withheld | ₹2,000 |
| Actual bank receipt | ₹98,000 |
| Outstanding | ₹0 |
| Status | paid |

Separately readable, certificate reference retained on the payment, out of
receivables entirely, and reversal restores the full balance with TDS falling
back to zero.

## 13. Payroll allocation — the invariant

**Model, chosen to match the schema.** The business records days, not hours:
`attendance.day_fraction` is the unit and `overtime_hours` is separate. So a
day is normalised across the sites a person served:

```
daily wage ₹1,400, marked present at Site A and Site B
→ Site A 0.5 day = ₹700, Site B 0.5 day = ₹700, paid ₹1,400
```

**The invariant:** `SUM(site allocations) = that payslip's labour cost`,
enforced in `generatePayroll` by giving the rounding remainder to the largest
share, and checked continuously by `v_integrity_check`.

Two bugs found here. Independently rounded shares gave 333.33 × 3 = 999.99 on a
₹1,000 line. And normalising across three sites gave
`0.99999999999999999999` days rather than 1 — hidden by downstream rounding,
so it would have surfaced as a report showing 0.9999999 where 1 belonged. Both
fixed; a four-site supervisor now reads exactly 0.2500 × 4 = 1.0000.

## 14. Attendance → payroll matrix

Daily-wage worker at ₹700, OT ₹100/h, across one month:

| Day | Marked | Paid |
|---|---|---|
| present | 1.0 | ₹700 |
| half_day | 0.5 | ₹350 |
| absent | 0 | ₹0 |
| holiday | not counted | ₹0 |
| present + 3h OT | 1.0 | ₹700 + ₹300 |
| site transfer | 1.0 | ₹700, on the new site |
| **two sites, one day** | 1.0 total | ₹700, split 0.5/0.5 |

Recorded 6.5 raw days, paid 5.5, labour landing 4.0 and 1.5 on the two sites —
sums to ₹3,850 exactly.

Monthly-salary employee, ₹31,000 over a 31-day month: present 2 + approved paid
leave 1 = 3 paid days = ₹3,000. **Unpaid leave and absence pay nothing, and
approved leave is not absence.**

## 15. Expense accounting — every size, every ledger

₹5 tea · ₹10 water · ₹20 parking · ₹100 fuel · ₹200 advance · ₹500 transport ·
₹25,000 materials · ₹1,00,000 vendor payment:

```
cash out            ₹1,25,835
site cost           ₹1,25,635
advance (a debt)    ₹     200
                    ─────────
reconciled          ₹1,25,835   ✓
```

Contract cost equals site cost. No financial row unaudited. ₹5 is tracked as
rigorously as ₹1,00,000.

## 16. The pending-expense rule

Stating it exposed that two different things shared one table and one status
column. **Petty cash** is company money already out of the box — nothing to
approve. An **expense claim** is an employee's own money — pending, then
approved (a cost, and now a debt), then reimbursed (cash finally leaves).

Two defects fell out:

* `reimbursed` existed in the schema and in the status badge and **nothing ever
  set it**. Approved claims were recognised as cost and never paid, so cash in
  hand was overstated by every claim ever approved.
* `v_employee_dues` reported the **owner** as owed ₹13,12,900 — his own petty
  cash, structurally identical to a supervisor's diesel claim. Found by building
  the view and reading its first output.

## 17. A full contractor day

1 MNC · 1 contract of ₹2,00,00,000 · 10 sites · 1 engineer · 3 supervisors ·
20 workers · 2 vendors. Morning attendance, six kinds of spending, a worker
moved between sites, a progress update, and a ₹5,00,000 receipt.

| | Hand-calculated | System |
|---|---|---|
| Money in | ₹5,00,000 | ₹5,00,000 |
| Money out | ₹28,370 | ₹28,370 |
| Net | ₹4,71,630 | ₹4,71,630 |
| People present | 22 | 22 |
| Absent | 2 | 2 |
| Active sites | 10 | 10 |
| Site 4 cost | ₹28,170 | ₹28,170 |
| cash out = cost + advance | — | RECONCILED |

## 18. Owner experience — using the UI only

Logged in as the owner in a real browser and tried to answer the fourteen
questions. Eleven were answered from the dashboard. Three were not:

| Question | Before | Now |
|---|---|---|
| Who is absent? | only a present count | absent count beside it |
| What do I owe my people? | `v_employee_dues` existed, nothing read it | a tile |
| What credit am I holding? | `v_client_credit` existed, nothing read it | a tile |

The last two are the same mistake twice — building the query and never putting
it on a screen. Today's cash now carries yesterday's beside it, so "is today
normal?" needs no navigation.

## 19. Mobile — a real browser at 375×812

| Check | Result |
|---|---|
| Horizontal overflow, 7 main pages | none |
| Console errors | none |
| Money In / Out / Advance | reachable without scrolling |
| ₹100 fuel, end to end | cash entry + approved site cost, with an idempotency key |
| Crew attendance, 5 people | one action, `day_fraction` derived by trigger |

**The defect this found.** Selecting a site showed
`dd702525-dcad-4a68-b348-b3cbaf2fcb43`. Base UI's `Select.Value` renders the raw
value unless `Select.Root` is given `items` — it does not read the chosen item's
text the way Radix did. Nothing passed `items`, so **all 21 selects in the
application** displayed their underlying value. Harmless for a status filter
showing "fuel"; unusable for the pickers keyed by UUID. Fixed once in the
wrapper.

## 20. Failure and retry

The forms disable their button while submitting, which handles a fast
double-click and nothing else. Against a lost response, a refresh, or a retry
after a timeout, each money write created a second transaction.

Now keyed per submission intent behind a partial unique index:

| Retry | Result |
|---|---|
| Cash entry submitted twice | 1 row, ₹100 |
| **Partial** payment retried (balance would absorb a second) | 1 row, ₹10,000 |
| Expense claim retried | 1 row, ₹500 |
| A genuinely new entry | goes through |
| Rows with no key | unaffected — the index is partial |

## 21. Deployment check

| Check | Result |
|---|---|
| All 16 migrations against an **empty** database | applied cleanly |
| Bootstrap: first account becomes owner | verified |
| Second account without an invitation | refused |
| Invited account, correct role, active | verified |
| Integrity on a fresh deploy | 0 violations |
| Secrets in the repository | none — no `.env` tracked, no keys in source |
| `npm run verify` | passes |

**What could not be verified.** This environment has no outbound network, so
the hosted Supabase project in `.env.local` is unreachable. Production login,
the Vercel build and production database connectivity were not tested, and the
production project has **not** received migrations 0009–0016. See
`PRODUCTION_READINESS.md` — this is the remaining blocker.

---

# Go-live pass (2026-08-25)

Run against a **production build** — `next build` then `next start`, not the dev
server — driven through a real browser. Nine defects, and not one of them was
visible in the source.

## 22. The deployment target

| Check | Result |
|---|---|
| Outbound network | **Works now** — supabase.com, api.supabase.com, vercel.com, npm all respond |
| Project in `.env.local` | **No DNS record**, checked three ways, while `supabase.co` resolves |
| A paused project | still resolves and answers "paused" — so this is deleted, or the ref is wrong |
| Supabase CLI | available via npx 2.115.0, **not logged in**, no access token |
| Vercel | **no CLI, no token, project not linked** (no `.vercel`) |
| Git remote | `github.com/NITHISH282620/senthil_solar` |

The previous report inferred the network was blocked. It is not. Re-tested with
working access, the real finding is that **there is no production database to
deploy to**, and no credentials to create or link one.

## 23. Defects found by running the production build

| # | Defect | How it presented |
|---|---|---|
| 1 | `optionalText/Date/Number` used `.optional()`, which rejects `null` — while the same helpers **emit** `null` | `Invalid input: expected string, received null`. **No quotation could be created**, so no contract, so no work |
| 2 | Convert-to-Contract was unreachable | The actions block showed for draft/sent; the button renders only when approved. Mutually exclusive — **an accepted quotation could never become a contract** |
| 3 | Empty-string UUIDs reached Postgres | `invalid input syntax for type uuid: ""`. **No site could be created** without assigning both an engineer and a supervisor |
| 4 | `bank_accounts` had no UI at all | `cash_book` refuses a bank entry without one, and the payment dialog **defaulted to Bank Transfer** — the normal way an MNC pays failed on a raw constraint name |
| 5 | Client money had nowhere to go | Advance before invoicing, or extra after settlement: dialog disabled, action refuses. **Money in the bank the system would not take** |
| 6 | `GET /auth/logout` signed the user out, and the control was a `<Link>` | Next prefetches links in the viewport — **landing on `/unauthorized` logged you out** before touching anything. Also logout CSRF |
| 7 | Seven routes rendered fully for a worker | RLS meant no data leaked (verified: 0 rows, 0 rupees, 0 names) — but an empty Billing page tells a worker he has access and the business has no invoices |
| 8 | `/unauthorized` meant two different things | "Your account is broken" shown to a worker who simply is not the owner |
| 9 | Money failures left no server-side trace | User saw a toast; the operator had no invoice id, amount, message or timestamp to diagnose from |

Defects 1, 2 and 3 are a chain: each one alone stops the business at a
different link, and all three sat in code that reads correctly.

## 24. Section 9 — the full business chain, in production

Every step through the UI, verified in the database after each:

```
client            CMP/2026-27/0003  Go-Live Test Client Pvt Ltd, state 33
quotation         QT/2026-27/0003   Rs 10,00,000 + 18% = Rs 11,80,000  (totals derived server-side)
sent → approved → converted
contract          CON/2026-27/0003  Rs 11,80,000
sites             SITE/…/0007 Rs 5,00,000 · SITE/…/0008 Rs 6,80,000
bank account      HDFC0001234, primary
invoice           INV/2026-27/0006  Rs 4,00,000, issued
attendance        crew marked at two sites, one day
payroll           July 2026 draft built from attendance
audit trail       every change above, with before and after
```

## 25. Section 10 — financial reconciliation, through the UI

| Step | Expected | Result |
|---|---|---|
| Invoice raised | Rs 4,00,000 outstanding | ✓ |
| Pay Rs 2,00,000 | Rs 2,00,000 outstanding, `partially_paid` | ✓ |
| Pay Rs 2,00,000 | Rs 0 outstanding, `paid` | ✓ |
| Client sends Rs 50,000 more | **must not disappear** | held as credit, in the cash book, invoice untouched ✓ |

## 26. Section 11 — payroll across two sites, in production

One worker, Rs 1,400/day, marked present at both Go-Live sites on one calendar
day, through the crew sheet:

```
attendance recorded   2 rows, raw 2.00 days
payslip               1.00 day, basic Rs 1,400, gross Rs 1,400
Go-Live Unit A        Rs 700.00  (0.50 day)
Go-Live Unit B        Rs 700.00  (0.50 day)
invariant             PASS — allocations 1,400.00 = payslip cost 1,400.00
                      PASS — paid Rs 1,400, not Rs 2,800
```

## 27. Section 12 — mobile, production build, 375×812

Twelve pages: no horizontal overflow, no console errors, no raw UUIDs. The one
UUID that did appear was in the audit trail's change values; it now renders as
a short `#7a5fec49` reference rather than 36 characters of noise.

## 28. Section 13 — failure and retry

| Test | Result |
|---|---|
| Save clicked twice in one tick | **one** cash entry |
| Worker types nine restricted URLs | all redirect to `/dashboard` |
| Session survives the whole sweep | ✓ — it did not before defect 6 was fixed |
| Unconfigured deployment | `/setup-required` naming the missing variables, HTTP 200, not a 500 |

## 29. Section 15 — deployment

| Check | Result |
|---|---|
| All 16 migrations against an empty database | applied cleanly, in order |
| First account on a fresh deploy | becomes the owner, active |
| Second account without an invitation | refused |
| Invited account | created active with the intended role |
| Integrity on a fresh deploy | 0 violations |
| Production build with no env vars | graceful `/setup-required` |
| `NEXT_PUBLIC_*` in the client bundle | the Supabase URL never reaches it |
| Secrets in the tree or git history | none |
| Server Actions origin check | Vercel sets `X-Forwarded-Host`; no config needed, and adding `allowedOrigins` would weaken CSRF for no gain |


---

# Go-live execution (2026-08-26)

## 30. What was verified against the real production project

| Check | Method | Result |
|---|---|---|
| Project exists and is active | DNS + auth/storage/REST endpoints | **PASS** — GoTrue v2.195.0 |
| Correct project targeted | ref parsed from `.env.local` vs script constant | **PASS** — both `znwvqdyrvtteirpjecfx` |
| Application schema | PostgREST, 10 tables probed | **0/16 migrations** — every table absent, `next_document_number` missing |
| Existing business data | PostgREST | none found. `auth.users` not readable without the service key |
| Storage buckets | `/storage/v1/bucket` | `[]` — none |
| Public signup | `/auth/v1/settings` | **enabled** (`disable_signup: false`) |
| Vercel deployment | GitHub deployments API | **PASS** — `e3aed79`, environment Production, state success |
| Live site | HTTP | `/login` 200, auth path works ("Invalid login credentials" on a bad login) |
| Mobile 375 / 390 / 412 | real browser on the production URL | **PASS** — no overflow, no UUIDs, no console errors |
| Secrets | tree + all pushed history + served HTML | **PASS** |

## 31. What could not be run against production, and why

`supabase db` has no subcommand for executing SQL against a linked project, and
this machine has no database credentials — no access token, no database
password, no service key. The direct `db.<ref>.supabase.co` host is IPv6-only
and unreachable here; the session pooler is reachable but needs the password.

So these are **REHEARSAL VERIFIED** only, on a pristine database built from the
16 migrations — the exact state production is in:

* 16/16 migrations applied cleanly, in order
* 48 tables, 15 views, 106 RLS policies, 92 functions, 102 triggers
* 130 attacks blocked, 0 allowed, 9/9 legitimate operations, 0 skipped
* 11/11 financial invariants, 0 violations
* bootstrap: first account becomes owner; uninvited signup refused; invited
  account active with the intended role; invitation single-use
* §9 money: ₹4,00,000 → ₹2,00,000 outstanding → ₹0 → ₹50,000 held as credit
* §10 payroll: one man, one day, two sites → ₹1,400 total, ₹700 + ₹700

`scripts/psql-prod.sh` exists so these can be run against production the moment
`PROD_DB_URL` is available.
