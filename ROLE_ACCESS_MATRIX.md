# Role Access Matrix

Every cell below was produced by executing the query or write as that role
against the running database, with `SET LOCAL ROLE authenticated` and the
role's own JWT claim — not by reading policy source. The harness lives in
`supabase/tests/rls_matrix.sql`.

Legend: **Y** allowed · **·** denied · **own** only their own rows ·
**site** only sites they are assigned to or named on · **—** feature not built

Last verified: 2026-08-25, against migrations through
`20260824000800_dashboard_gaps.sql`. Re-verified by
`supabase/tests/authz_attacks.sql` — 130 attack assertions blocked, 9
legitimate actions allowed.

## Reading

| Capability | Owner | Manager | Accountant | Engineer | Supervisor | Store | Worker | Client |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| Clients (companies) | Y | Y | Y | · | · | · | · | · |
| Contracts | Y | Y | Y | · | · | · | · | · |
| Quotations | Y | Y | Y | · | · | · | · | · |
| Invoices | Y | Y | Y | · | · | · | · | · |
| Client payments | Y | Y | Y | · | · | · | · | · |
| Cash book | Y | Y | Y | · | · | · | · | · |
| Bank accounts | Y | Y | Y | · | · | · | · | · |
| Expenses | Y | Y | Y | site | site | · | own | · |
| Worker advances | Y | Y | Y | own | own | own | own | · |
| Payslips | Y | Y | Y | own | own | own | own | · |
| Site list | Y | Y | Y | site | site | · | site | · |
| **Site revenue / profit / margin** | Y | Y | Y | · | · | · | · | · |
| Site cost (expenses at their site) | Y | Y | Y | site | site | · | site | · |
| Attendance | Y | Y | Y | site | site | · | own+site | · |
| Staff roster — names, phone, trade | Y | Y | Y | site | site | own | site | own |
| **Staff pay, bank, Aadhaar** | Y | · | · | · | · | · | own | · |
| Company settings (GST, PAN, address) | Y | Y | Y | · | · | · | · | · |
| Shift / OT / geofence rules | Y | Y | Y | Y | Y | Y | Y | · |
| Audit trail | Y | · | · | · | · | · | · | · |
| Material catalogue | Y | Y | Y | Y | Y | Y | Y | · |
| Client credit held | Y | Y | Y | · | · | · | · | · |
| What the business owes staff | Y | Y | Y | · | · | · | · | · |
| Purchase orders / GRN | Y | Y | Y | · | · | Y | · | · |
| Documents | Y | scoped | scoped | site | site | scoped | own | · |

## Writing

| Capability | Owner | Manager | Accountant | Engineer | Supervisor | Store | Worker | Client |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| Create client / contract / quotation | Y | Y | · | · | · | · | · | · |
| Issue invoice | Y | Y | Y | · | · | · | · | · |
| Cancel invoice | Y | Y | · | · | · | · | · | · |
| Record client payment | Y | Y | Y | · | · | · | · | · |
| Reverse a payment | Y | · | Y | · | · | · | · | · |
| Cash book entry | Y | Y | Y | · | · | · | · | · |
| Void a cash entry | Y | · | Y | · | · | · | · | · |
| Record an expense | Y | Y | Y | site | site | · | own | · |
| Approve an expense | Y | Y | Y | · | · | · | · | · |
| Give a worker advance | Y | Y | Y | · | · | · | · | · |
| Create / edit sites | Y | Y | · | · | · | · | · | · |
| Move a site's stage | Y | Y | · | site | site | · | · | · |
| Assign crew to a site | Y | Y | · | · | · | · | · | · |
| Mark own attendance | Y | Y | Y | Y | Y | Y | Y | · |
| Mark **crew** attendance | Y | Y | · | site | site | · | · | · |
| Approve leave | Y | Y | · | · | · | · | · | · |
| Generate payroll | Y | Y | Y | · | · | · | · | · |
| Finalise / pay payroll | Y | · | · | · | · | · | · | · |
| Create employees | Y | · | · | · | · | · | · | · |
| **Change anyone's role** | Y | · | · | · | · | · | · | · |
| **Change anyone's pay** | Y | · | · | · | · | · | · | · |
| Edit own contact details | Y | Y | Y | Y | Y | Y | Y | Y |
| Company settings | Y | · | · | · | · | · | · | · |
| Stock movements | Y | Y | · | site | site | Y | · | · |
| Reimburse an expense claim | Y | Y | Y | · | · | · | · | · |
| Allocate client credit | Y | Y | Y | · | · | · | · | · |
| **Invite an employee account** | Y | · | · | · | · | · | · | · |
| Deactivate an employee | Y | · | · | · | · | · | · | · |
| Delete anything | Y | · | · | · | · | · | · | · |

## Notes on specific cells

**Site revenue is invisible to the field.** `allocated_value` lives in
`site_commercials`, a separate table behind `auth_can_see_money()`. Field roles
read the site row but get NULL for revenue, gross profit and margin. Before
this, a worker could read the contract value of the site he stood on.

**Staff pay is owner-only.** A manager may maintain a colleague's contact
details but cannot see or set pay, and cannot touch the owner's row at all.
Enforced by `guard_profile_privileged_columns()`, because RLS is row-level and
cannot express a column restriction.

**Supervisor site access is by assignment, not by role.** In the test data
Murugan sees all three sites because he is the named `supervisor_id` on all
three. An engineer assigned to one site is denied the other two, on read and
on write, verified individually.

**Store Manager has no application.** The nine supply-chain tables and their
policies exist and enforce correctly, but no server action or page uses them.
The role can log in and do nothing. See `BUSINESS_GAP_ANALYSIS.md`.

**Client has no portal.** The role exists and is correctly denied everything.
There is no client-facing screen, so nothing is exposed — and nothing is
offered. See `BUSINESS_GAP_ANALYSIS.md`.

**Company settings are readable by everyone**, including the GST, PAN and CIN
numbers. The policy is `USING (true)`. Low severity — these appear on every
invoice the company issues — but it is wider than it needs to be.

**No account exists that the owner did not invite.** `auth.users` inserts are
refused without an unconsumed `employee_invitations` row, which only the owner
can write. The one exception is the very first account on a fresh deployment,
which becomes the owner — otherwise a new install could never be started.

**The last owner cannot be removed.** Demoting, deactivating or soft-deleting
the only active owner is refused. Without this, one mistaken edit locks the
business out of its own system with no principal able to restore anyone.

**A deactivated employee cannot sign in.** Deactivation bans the auth account,
and `getCurrentUser` turns away any dormant or deleted profile — previously they
could hold a session and browse an application full of blank screens.

**Company settings are no longer world-readable.** GST, PAN, CIN and the
registered address were visible to every authenticated user, including a
self-registered stranger. Field staff read `v_work_settings` instead, which
carries only the shift, overtime and geofence rules.

**Documents are scoped by entity type**: site documents follow site access,
commercial documents follow money access, and anything marked confidential is
visible only to the owner and to the employee it describes.
