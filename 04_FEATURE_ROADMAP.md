# 04 — Feature Roadmap

Companion to `PROJECT_AUDIT.md`. Modules ranked by return on investment, with dependencies and effort.

---

## 1. Ranking Method

Each module is scored on four axes:

- **Money impact (1–5)** — does it stop cash leaking or reveal profit?
- **Frequency (1–5)** — how often is it used? Daily beats monthly beats yearly.
- **Effort (S/M/L/XL)** — S ≤ 3 days, M ≤ 1 week, L ≤ 2 weeks, XL > 2 weeks.
- **Unblocks** — how many other modules depend on it.

ROI is not just money impact. A daily-use module with medium impact beats a yearly module with high impact, because the daily one compounds and gets adopted. Adoption is the real risk in an SMB ERP rollout — software the field staff abandon in week two has zero ROI regardless of its feature list.

---

## 2. Master Ranking

| Rank | Module | Money | Freq | Effort | Unblocks | Phase |
|---|---|---|---|---|---|---|
| **0** | **Foundation repair** (build, RLS, sequences, hierarchy) | — | — | L | **everything** | 0 |
| **1** | Sites (+ stage pipeline) | 4 | 5 | M | 8 modules | 1 |
| **2** | Attendance (fixed, site-scoped, batch, geofence) | 5 | 5 | M | payroll, profit | 1 |
| **3** | Contracts (+ milestones) | 5 | 3 | M | invoicing, profit | 1 |
| **4** | Companies & contacts | 3 | 3 | S | contracts | 1 |
| **5** | Payroll engine | 5 | 4 | L | profit, cash flow | 2 |
| **6** | Salary advances | 5 | 4 | S | payroll | 2 |
| **7** | Expenses (site-attributed) | 4 | 5 | S | profit | 2 |
| **8** | Owner dashboard (real data) | 4 | 5 | M | — | 2 |
| **9** | Invoices (GST-correct) | 5 | 3 | M | payments, profit | 3 |
| **10** | Payment tracking & receivables | 5 | 4 | M | cash flow | 3 |
| **11** | Quotations + PDF + convert | 4 | 2 | M | contracts | 3 |
| **12** | Profitability engine | 5 | 4 | M | reports | 3 |
| **13** | Mobile field PWA (offline) | 4 | 5 | L | adoption | 4 |
| **14** | Site photos & work logs | 3 | 5 | M | client submissions | 4 |
| **15** | Materials & stock ledger | 4 | 4 | L | profit accuracy | 5 |
| **16** | Purchase orders | 4 | 3 | M | materials | 5 |
| **17** | Vendors | 3 | 2 | S | PO | 5 |
| **18** | Reports & exports | 4 | 3 | L | — | 6 |
| **19** | Cash flow dashboard | 4 | 3 | M | — | 6 |
| **20** | Notifications | 3 | 5 | M | — | 6 |
| **21** | RBAC (8 roles + permissions) | 3 | — | M | security | 6 |
| **22** | Documents hub | 2 | 3 | S | — | 6 |
| **23** | Inspections & completion certs | 2 | 2 | S | — | 7 |
| **24** | Customer portal | 2 | 2 | M | — | 7 |
| **25** | AI features | 3 | 2 | L | — | 8 |

---

## 3. Why This Order

### Phase 0 must come first — non-negotiable

The application does not build. Seven blockers in `PROJECT_AUDIT.md` §2 must be cleared before a single feature is written. Beyond that, the Company→Contract→Site hierarchy must be settled, because **every module below attaches to it**. Building materials, payroll, or invoicing on top of three competing job entities means building each one two or three times.

Phase 0 delivers no visible features. It is still the highest-ROI work in the plan, because it is the difference between a codebase that can absorb 25 modules and one that fights every addition.

### Why Attendance ranks above Payroll

Payroll is the bigger prize — wages are the largest cost line and it is 100% manual today. But payroll is **computed from attendance**, and attendance is currently broken (BLOCKER-5), unlinked to sites, and captured once per employee per day with no batch entry.

Feeding a payroll engine from bad attendance data produces confidently wrong salary sheets, which is worse than the current spreadsheet — the owner will stop trusting the system immediately and never come back. Fix the input, then build the engine.

Attendance is also the highest-frequency screen in the entire product: 50 workers × 100 sites, every single day. It is where adoption is won or lost.

### Why Sites ranks first among features

Eight modules hang off `sites`: attendance, expenses, materials, photos, work logs, inspections, payroll allocation, and profitability. It is the join point for the entire operational side. It also already has a table (m017) — it needs the code, the stage pipeline, and the contract parent.

### Why Materials waits until Phase 5

Materials genuinely matter — panels and inverters are high-value and untracked stock walks away. But:
- It is the largest single module (item master + locations + ledger + transfers + allocation).
- It requires disciplined data entry that the client's team has never done before.
- Profitability is *already* ~75% accurate from labour + expenses alone, since those dominate an EPC contractor's controllable spend.

Ship profitability with labour and expenses first, then improve its accuracy with materials once the team has built the habit of using the system daily.

### Why AI is last

Every AI feature in the brief — manpower prediction, delay forecasting, material estimation, expense anomaly detection, cash-flow prediction — requires **historical data that does not exist yet**. Predicting delays needs completed sites with real timelines. Detecting expense anomalies needs a baseline of normal expenses. There is no shortcut: these features are worthless until the operational modules have been running for 6–12 months.

The two exceptions that can ship early are the ones that need no history: **invoice reminder drafting** and **daily project summaries**. Both are text generation over current-state data. They are pulled forward into Phase 6 as part of Notifications.

---

## 4. Module Specifications

### Phase 1 — Operational Spine

#### 1.1 Sites `M`
Full CRUD, list with map/grid/kanban-by-stage views, detail page with tabs (Overview · Crew · Attendance · Expenses · Photos · Materials · Documents).

- Stage pipeline with `site_stage_history` written on every transition
- Auto-progress: `progress_percent` derived from stage sequence, manually overridable
- Bulk site creation — critical: a 100-site contract cannot be entered one at a time. Needs CSV import and a "generate N sites" template
- Engineer and supervisor assignment
- Geofence radius per site

**Acceptance:** create a contract with 50 sites via CSV in under 5 minutes; move a site through all 7 stages with full history.

#### 1.2 Attendance `M`
- **Batch marking**: one screen, one site, one date, all assigned workers, tap to cycle Present → Half → Absent → Leave. This is the single most important UX in the product
- Self check-in/out with GPS + geofence validation and optional selfie
- `within_geofence` and `distance_from_site_m` computed on write
- Supervisor marking restricted to assigned sites (fixes SEC-2)
- Correction workflow with mandatory reason, `is_corrected` flag
- Monthly grid view per site and per employee

**Acceptance:** mark 50 workers at one site in under 30 seconds; out-of-geofence check-in is flagged, not blocked.

#### 1.3 Contracts `M`
Contract CRUD, value, dates, payment terms, retention, penalty terms. Milestone builder with trigger types. Site list with roll-up progress. Document attachments.

**Acceptance:** contract shows value, sites, aggregate progress, invoiced-to-date, and unbilled balance.

#### 1.4 Companies `S`
Company CRUD with GST, state code (drives IGST vs CGST/SGST), payment terms, credit limit, TDS applicability. Multiple contacts with exactly one primary. Contract history and outstanding balance on the detail page.

### Phase 2 — Money Out

#### 2.1 Payroll engine `L`
Three wage modes — monthly, daily, piece-rate — driven off locked attendance.

```
daily:      present_days × daily_rate + overtime_hours × ot_rate
monthly:    (monthly_salary ÷ working_days_in_month) × (present + paid_leave)
piece_rate: units_completed × piece_rate
gross     = basic + overtime + bonus
net       = gross − advances − penalties − other
```

- Draft run → review/adjust → finalise (locks attendance) → mark paid
- `payroll_site_allocations` splits each worker's cost across the sites they worked, from their attendance distribution. **This is what makes labour cost per site possible**
- Payslip PDF per worker; bank transfer sheet export

**Acceptance:** generate a month's payroll for 50 workers in under 10 seconds; every rupee traceable to attendance rows; site allocations sum exactly to gross.

#### 2.2 Salary advances `S`
Record advance, choose recovery mode (full next payroll or instalments), automatic deduction during payroll generation, running balance per worker, outstanding-advances report.

**Acceptance:** an advance given mid-month is deducted automatically in that month's payroll and the balance reaches zero without manual intervention.

#### 2.3 Expenses `S`
Rework to attach to `site_id` with trigger-stamped contract and company. Quick-entry mobile flow: category → amount → photo → submit, four taps. Approval queue with bulk approve. Food expenses capture head count and meal type.

#### 2.4 Owner dashboard `M`
Replace all `"—"` placeholders. Answers the five questions:

| Question | Widgets |
|---|---|
| What needs attention? | Stalled sites, missing attendance today, pending approvals |
| What is pending? | Unbilled work, undelivered POs, unapproved expenses |
| What is overdue? | Overdue invoices, sites past planned end, contract deadlines |
| What is costing money? | Month spend by category, labour cost trend, top-cost sites |
| What is making money? | Revenue MTD, gross profit, margin by contract, top companies |

Plus: active sites, attendance today, worker count, cash position.

### Phase 3 — Money In

#### 3.1 Invoices `M`
Correct Indian GST: CGST/SGST for intra-state, IGST for inter-state, derived from company state code vs. company's own state. HSN/SAC per line. TDS and retention. Milestone-linked generation. Professional PDF with logo and terms. Automatic overdue transition via scheduled job.

**Acceptance:** an invoice to a same-state company splits CGST/SGST; a different-state company gets IGST; the GSTR-1 export reconciles.

#### 3.2 Payments & receivables `M`
Record against invoice with bank account. Ageing buckets (0–30/31–60/61–90/90+). Receivables by company and contract. Expected-vs-received against payment schedule. Payment reminder generation.

#### 3.3 Quotations `M`
Restore missing schemas, re-parent to companies, add professional PDF (logo, GST, terms, taxes, discount, line items for products/installation/transport/labour), and the **convert-to-contract** action that sets `status = 'converted'` and pre-populates the contract.

#### 3.4 Profitability `M`
Views from `03_DATABASE_REDESIGN.md` §4 surfaced as screens: per-site, per-contract, per-company P&L. Revenue − material − labour − expenses = profit, with drill-down to source rows. Margin ranking to expose loss-making sites.

**Acceptance:** the owner can see, in two taps from the dashboard, which of 100 sites are losing money and why.

### Phase 4 — Field Adoption

#### 4.1 Mobile PWA `L`
Manifest, service worker, installable. Bottom navigation. Offline queue in IndexedDB for attendance, expenses, and photos, with background sync and conflict resolution on reconnect (`source = 'offline_sync'`). Camera capture with GPS EXIF. Large tap targets for gloved hands in sunlight.

**Acceptance:** a supervisor marks attendance for 40 workers with the phone in airplane mode; data syncs correctly on reconnection.

#### 4.2 Site photos & work logs `M`
Before/during/after gallery per site and per stage. Daily work log: description, category, workers present, materials used, problems, weather. Approval workflow (draft → submitted → approved → locked). Client submission bundle export.

### Phase 5 — Supply Chain

#### 5.1 Materials & stock `L`
Item master for the nine solar categories with specs (wattage, capacity, brand). Append-only `stock_ledger` — stock on hand is always `SUM(quantity_delta)`, never a mutable counter. Locations for warehouse, site, and vehicle. Transfers, site consumption, damage recording. Low-stock alerts against reorder level.

#### 5.2 Purchase orders `M`
PO with lines against materials, vendor, expected delivery, site destination. Goods receipt with partial delivery. Auto-post receipts to `stock_ledger`. Pending-delivery tracking.

#### 5.3 Vendors `S`
Master with GST, terms, bank details. Purchase history and outstanding payable. Rating.

### Phase 6 — Intelligence & Control

#### 6.1 Reports `L`
Salary · Attendance · Profit · Expense · Material · Contract · Company · Site · Payment · GST. Each with date range, entity filter, and Excel + PDF export. Built on the SQL views, not application aggregation.

#### 6.2 Cash flow `M`
Money in vs. money out by month. Salary, expenses, purchases, receipts. Net cash and bank position. 90-day forward projection from payment schedules and known commitments.

#### 6.3 Notifications `M`
Trigger-generated in-app notifications for all 10 types. Bell with unread count. Daily digest email. Includes the two zero-history AI features: **invoice reminder drafting** and **daily project summaries**.

#### 6.4 RBAC `M`
Eight roles, `role_permissions` matrix, scope enforcement (`all` / `assigned_sites` / `own`). **Route-level authorization in middleware** — closes SEC-1. Permission-aware navigation.

#### 6.5 Documents `S`
Build the `/documents` page the sidebar already links to. Category filter, entity linking, preview, versioning. **Storage RLS policies** — closes SEC-3.

### Phase 7 — Extended

Inspections with per-stage checklists and completion certificates. Customer portal (read-only site progress, photos, invoices) using the `customer` role.

### Phase 8 — AI

Once 6–12 months of data exists: manpower suggestion from historical site-type-to-crew ratios · delay prediction from stage-duration history · material estimation from kW-to-BOM history · auto-quotation from similar past jobs · expense anomaly detection against category baselines · cash-flow prediction from payment-behaviour history.

---

## 5. Dependency Graph

```
Phase 0 (foundation)
   │
   ├─► Companies ──► Contracts ──► Sites ──┬──► Attendance ──► Payroll ──► Profitability
   │                                        │         │             │            ▲
   │                                        │         └── Advances ─┘            │
   │                                        ├──► Expenses ───────────────────────┤
   │                                        ├──► Photos / Work logs              │
   │                                        └──► Materials ──► Profitability ────┘
   │                                                  ▲
   │                                        Vendors ─► POs
   │
   └─► Invoices ──► Payments ──► Cash flow ──► Reports ──► AI
          ▲
     Quotations
```

**Critical path:** Foundation → Sites → Attendance → Payroll → Profitability. Everything the client most wants sits on this single chain, which is why Phases 0–3 are sequential and should not be parallelised across the same developer.

---

## 6. Effort Summary

| Phase | Focus | Effort | Cumulative |
|---|---|---|---|
| 0 | Foundation repair | 2–3 weeks | 3 wks |
| 1 | Operational spine | 3–4 weeks | 7 wks |
| 2 | Money out | 3–4 weeks | 11 wks |
| 3 | Money in | 3–4 weeks | 15 wks |
| 4 | Field adoption | 2–3 weeks | 18 wks |
| 5 | Supply chain | 3–4 weeks | 22 wks |
| 6 | Intelligence & control | 3–4 weeks | 26 wks |
| 7 | Extended | 2 weeks | 28 wks |
| 8 | AI | 2–3 weeks | 31 wks |

**~7 months for one experienced full-stack developer.** Roughly 4 months with two developers after Phase 1, since Phases 2 and 3 (money out / money in) can then run in parallel on separate branches.

---

## 7. First Value Milestones

The client should not wait 7 months to see anything. Deliverable checkpoints:

| Week | The owner can... |
|---|---|
| 3 | Log in to a system that builds and works |
| 7 | Create a contract with 50 sites and see live crew and progress |
| 8 | See today's attendance across every site on his phone |
| 11 | Generate a month's payroll automatically from attendance |
| 15 | See profit per site and per contract |
| 18 | Run the entire operation from a phone, offline-capable |
| 22 | Track every panel from PO to site consumption |
| 26 | Export every report his accountant and clients ask for |
