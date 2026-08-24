# Business Gap Analysis

What the contractor's business needs that the software does not yet do, ranked
by return. Written after testing the running system, so it lists what is
actually missing rather than what was once planned. The original pre-build
planning document is `02_BUSINESS_GAP_ANALYSIS.md`; this one supersedes it as
the live view.

Ranking: **HIGH ROI** — the business is measurably worse without it ·
**MEDIUM** — saves real time · **LOW** — nice to have · **FUTURE** — needs
scale or process the business does not have yet.

## Implemented in this pass

These were gaps until now. Each is listed because it changed what the owner can
actually do, not merely how it looks.

| Gap | Why it mattered |
|---|---|
| **Invoices could not be issued** | Every invoice was created `draft`, and ageing, outstanding and overdue all skip drafts. "Who owes me money?" answered ₹0 no matter how much had been billed. |
| **Supervisors could not mark crew attendance** | The role's entire purpose had no code path. Attendance stayed on paper and payroll ran on nothing. |
| **Wages were never recorded as paid** | Cash in hand overstated reality by the whole monthly wage bill, and nobody could tell which workers had been paid. |
| **The audit trail could not be read** | Twelve triggers wrote it; nothing read it. The owner's stated end-of-day step had no screen. |
| **Pending spend was invisible in profitability** | A ₹1,50,000 labour bill awaiting a signature made a 39% site look like 54% — and the owner prices the next job from that number. |
| **Bulk crew attendance** | One tap per person, one submit for the crew, seeded from what is already marked. The attendance page also now admits supervisors and engineers, who were locked out of the page whose work is theirs. |
| **Client overpayments were refused outright** | The money was in the bank and the books denied it. Now held on account. |

## HIGH ROI — build next

### 1. Payables: what the contractor owes
Nothing tracks money owed *out*. Vendors, material bills, equipment hire and
subcontractor dues live in the owner's head. The dashboard answers "who owes
me?" but cannot answer "what must I pay this week?", which is the question that
decides whether he can take the next job. `vendors` already exists; this needs a
bill table, an ageing view and a dashboard tile. **Largest single gap.**

### 2. Inventory — the whole module
Nine tables (`materials`, `stock_locations`, `stock_ledger`, purchase requests,
purchase orders, goods receipts) exist with correct RLS and are touched by no
application code. Consequences today:
- The Store Manager role can log in and do nothing.
- `v_site_financials.material_cost` is always ₹0 — the ledger it reads is never
  written. Materials do reach site cost, but only as ad-hoc expenses, so the
  panel that went to Site A cannot be told from the one that went to Site B.
- Nothing detects a shortage before the crew is standing idle on a roof.

Not built here: it is a module, not a fix, and building it speculatively
against untested assumptions about how this contractor actually runs his store
would be worse than leaving the tables clean. Start with receive-and-issue —
GRN in, site consumption out — and leave purchase orders until that is used.

### 3. Payment follow-up
`v_receivables_ageing` now returns real rows (it could not before). What is
missing is the act of chasing: a "remind" action producing WhatsApp-ready text
with the invoice number, amount and days overdue. Indian contractors chase
payment on WhatsApp, not by email. Small build, direct effect on cash.

### 4. Daily business summary
One end-of-day screen: money in, money out, per-site cost, who worked, advances
given, what needs attention tomorrow. Every number already exists —
`v_dashboard_today`, `v_cash_position`, `v_site_financials`. This is a
composition, not new data, and it is what makes the owner open the app at
night rather than at month end.

## MEDIUM ROI

| Item | Note |
|---|---|
| Duplicate a quotation | Solar quotes repeat with small changes. `supersedes_id` and `version` already exist for revisions. |
| One payment across several invoices | A client settling three bills with one transfer must currently be split by hand. |
| Client advance before invoicing | `payments.invoice_id` is already nullable and the trigger handles it; only the UI requires an invoice. |
| Expense receipt photo | `receipt_url` exists on the table; nothing uploads to it. Cash reconciliation without receipts is trust-based. |
| Reopen a finalised payroll | A mistake found after finalising currently needs a database change. |
| Recurring monthly expenses | Rent, EMI, telephone re-keyed every month. |
| Overdue and delay alerts | The dashboard shows counts; nothing reaches the owner when he is not looking at it. |
| Site delay warning | `planned_end_date` is stored and `delayed_sites` computed, but only ever shown as a number. |

## LOW ROI

Quotation templates · one-click repeat site · bulk site creation ·
company-settings hardening (GST/PAN/CIN readable by any authenticated user) ·
worker reassignment UI (the action exists) · export to Excel.

## FUTURE

| Item | Why not yet |
|---|---|
| Client portal | The role exists and is correctly denied everything. Worth building only once several clients ask; today they phone. |
| Bank statement reconciliation | Needs bank feeds or statement import; the cash book must be trusted first. |
| Bulk payment import | Same. |
| GSTR-1 export | The data is now GST-correct — intra-state splits CGST+SGST, inter-state uses IGST, and TDS settles properly. Filing is still the accountant's job in their own software. |
| Offline attendance capture | `source` already allows `offline_sync`. Needs a mobile client. |
| Piece-rate payroll | The engine computes piece-rate lines at zero deliberately; nothing collects production figures. |

## Two things worth saying plainly

**Materials are the largest cost in a solar job and the system cannot see them
properly.** They reach site profitability as expenses, so margins are not
wrong — but the owner cannot answer "how many panels are at Tiruppur?" or
"where did the 40 that left the warehouse go?". That is the gap most likely to
cost real money through quiet leakage, and it is item 2 above.

**The system is now honest about money it knows about.** Receivables, payroll,
advances, TDS, voids and site costs all reconcile, and the audit trail proves
who changed what. The remaining risk is money the system is never told about —
vendor bills and stock — not money it gets wrong.
