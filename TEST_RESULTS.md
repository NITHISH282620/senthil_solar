# Test Results

Run against a live Supabase Postgres (`supabase_db_senthil-solar`) with the
project's own migrations and seed data, on 2026-08-24. Nothing below was
concluded by reading code alone; every defect has a reproduction that was
executed and every fix was re-executed afterwards.

```
ROLES TESTED                    8 / 8
WORKFLOWS EXERCISED            24
READ-VISIBILITY PROBES        312   (8 roles x 39 table/view reads)
WRITE / AUTHORISATION ASSERTS  56   (each in its own transaction)
BUSINESS EDGE CASES            28
DEFECTS FOUND                  22
DEFECTS FIXED                  22
GAPS FOUND, NOT BUILT           8
PRODUCTION BLOCKERS             4 found, 4 fixed in code
                                1 remaining in deployment config
```

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
