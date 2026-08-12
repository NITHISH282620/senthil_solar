# 02 — Business Gap Analysis

Companion to `PROJECT_AUDIT.md`. This document scores the current system against the client's stated business model and all 25 required modules.

---

## 1. The Business the Software Must Serve

The client is a **Solar EPC contractor**, not a shop. He does not sell panels to walk-in customers. He wins contracts from large organisations and executes them across many geographically dispersed sites.

**The defining characteristic: one contract fans out into 10–100+ sites, and every site independently accumulates workers, attendance, expenses, materials, and progress.**

Money flows in at the *contract* level (milestone invoices to the client company) but flows out at the *site* level (wages, food, fuel, materials). Profit is only knowable if every rupee spent can be attributed to a site, and every site rolls up to a contract, and every contract rolls up to a company.

### 1.1 Required workflow

```
Company → Contract → Sites → Engineer → Workers → Attendance
   → Materials Purchase → Transport → Installation → Inspection
   → Completion → Invoice → Payment Received → Workers Paid → Profit
```

### 1.2 The current system's model

```
customers → quotations → work_orders → invoices        (v1, orphaned)
projects (client_company as free TEXT) → attendance     (v2, partial)
projects → sites                                        (v3, schema only)
```

### 1.3 The four structural mismatches

| # | Required | Present | Consequence |
|---|---|---|---|
| **M1** | A `company` is a durable business relationship with contacts, GST, credit terms, and many contracts over years | `customers` (retail CRM) **and** `projects.client_company` (free TEXT). Not linked | Cannot answer "what is our total business with Tata?" |
| **M2** | A `contract` holds value, milestones, payment schedule, penalties, and **contains many sites** | No contract entity. `projects` conflates contract and site; m017 tried to split it and stopped halfway | Cannot track contract value vs. billed vs. received |
| **M3** | A `site` is the unit of execution with its own stage pipeline, crew, costs, and photos | `sites` table exists with **zero application code** and no stage CHECK constraint | The core operational object is unusable |
| **M4** | Every cost must carry a site attribution so profit is computable | `expenses.work_order_id` (written by code) vs `site_id` (in schema); wages have no site link at all | **Profitability cannot be computed at any level** |

M4 is the most commercially damaging. The client's entire reason for wanting this software is to know which sites make money. The current data model cannot answer that question even in principle.

---

## 2. Module-by-Module Gap Matrix

Scoring: **✅ Complete** · **🟡 Partial** · **🔴 Schema only** · **❌ Absent**

| # | Module | Status | What exists | What is missing |
|---|---|---|---|---|
| 1 | **Company Management** | 🟡 | `customers` table with GST, contacts, address; full CRUD + 4 pages | No `companies` entity distinct from retail customers; no multiple contacts per company; **no payment terms / credit limit**; no company→contract link; **orphaned from sidebar** |
| 2 | **Contracts** | ❌ | Nothing. `projects` is closest but has no contract value, milestones, or payment schedule | Entire entity: contract value, start/deadline, payment schedule, milestones, documents, penalties, retention %, notes, **1→many sites** |
| 3 | **Site Management** | 🔴 | `sites` table (m017) with GPS, address, progress, dates | **Zero code.** No capacity_kw, no site photos, no engineer FK, no customer FK, no stage pipeline (Planning→Material Ordered→Delivered→Installation→Testing→Commissioned→Completed), no `status` CHECK constraint |
| 4 | **Employee Management** | 🟡 | `profiles` with Aadhaar, bank, daily_rate, monthly_salary, employee_type, joining date | **Wage fields are validated but never written to the DB** (BLOCKER-7). No PAN, no trade/skill (electrician/helper/supervisor/engineer), no leaving date, no document attachments, no PF/ESI |
| 5 | **Attendance** | 🟡 | Table with GPS, photo URL, OT hours, marked_by, offline flag; self check-in/out UI | **Check-in is broken** (BLOCKER-5). No site linkage in code, no half-day/holiday/OT entry, no batch marking (schema written, unused), no geofence enforcement, **no salary calculation** |
| 6 | **Salary System** | 🔴 | `payroll` table with all the right columns | **Zero code.** No monthly/daily/piece-rate engines, no attendance→salary calculation, no salary sheet generation, no payslips |
| 7 | **Advance Payments** | 🔴 | `salary_advances` table with `amount_deducted`, `deducted_in_payroll_id` | **Zero code.** No recording UI, no automatic deduction from payroll, no balance tracking, no loan recovery schedule |
| 8 | **Expense Management** | 🟡 | 10 field categories, approval flow, receipts, food head-count/meal-type | **Not linked to site in code** (writes `work_order_id`). No company/contract attribution. Create action and schema are mutually incompatible. No expense-vs-budget view |
| 9 | **Material Inventory** | ❌ | Nothing | Item master (panels, inverters, MC4, DC/AC cable, mounting, earthing, fasteners, consumables), stock ledger, site allocation, transfers, damaged stock, reorder levels |
| 10 | **Purchase Orders** | ❌ | Nothing | PO header/lines, vendor, expected delivery, goods receipt, partial receipt, pending tracking, PO→bill matching |
| 11 | **Vendor Management** | ❌ | Nothing | Vendor master, GST, contacts, payment terms, purchase history, outstanding payable |
| 12 | **Quotations** | 🟡 | Full CRUD, line items, tax/discount, 6 statuses incl. `converted`, 4 pages | **No PDF generation.** No company logo/terms on output. No convert-to-contract action (`converted` status is never set). Orphaned from sidebar. Broken imports (BLOCKER-1) |
| 13 | **Invoices** | 🟡 | Full CRUD, items, GENERATED `balance_due`, print view, payment recording | **No CGST/SGST/IGST split** — single `tax_percent`, cannot file GSTR-1. No overdue automation. Three competing parent FKs. TDS columns unused. No e-invoice/IRN, no HSN/SAC codes |
| 14 | **Payment Tracking** | 🟡 | `payments` linked to invoice, method, reference, TDS column | No bank account entity. No company/contract-level receivables view. No expected-vs-received schedule. No ageing buckets. No reminders |
| 15 | **Cash Flow** | 🔴 | `cash_transfers` petty-cash ledger (m018) | **Zero code.** No money-in/money-out dashboard, no net cash, no monthly profit, no bank balance, no forecast |
| 16 | **Profitability** | ❌ | Nothing | Per-site, per-contract, per-company P&L. Requires the cost-allocation model (M4) that does not exist |
| 17 | **Site Photos** | 🟡 | `work_log_photos` with GPS and caption | **Zero code.** No before/during/after typing, no site gallery, no per-stage photo requirements |
| 18 | **Documents** | 🟡 | `documents` (polymorphic) + `project_documents`; Storage upload/delete with audit | **Sidebar links to `/documents` — the page does not exist (404).** No storage RLS policies committed. All authenticated users can read every document (R4) |
| 19 | **Notifications** | ❌ | Nothing | No table, no delivery (in-app/email/WhatsApp), no triggers for salary pending, attendance missing, low stock, payment due, invoice overdue, contract deadline |
| 20 | **Dashboard** | 🟡 | Page exists with 6 stat cards | **5 of 6 values are the hardcoded string `"—"`.** Quick-action cards have no click handlers. No revenue, profit, pending payments, active sites, attendance today, outstanding invoices, cash flow, top customers, or site progress |
| 21 | **Reports** | ❌ | Nothing. `recharts` is installed and unused | **Sidebar links to `/reports` — the page does not exist (404).** No salary/attendance/profit/expense/material/contract/company/site/payment/GST reports. No Excel or PDF export |
| 22 | **Mobile Field Experience** | ❌ | Responsive Tailwind classes on some pages | No mobile navigation (fixed desktop sidebar). No PWA manifest, no service worker, **no offline support** despite the `is_offline_entry` column. No camera capture. GPS captured but never validated |
| 23 | **Roles** | 🟡 | 4 roles: admin, manager, supervisor, employee | Missing: accountant, engineer, store manager, customer portal. **No page-level authorization** (SEC-1). Supervisor RLS ignores site assignment (SEC-2) |
| 24 | **Security** | 🟡 | RLS on all 25 tables; service-role isolated; `getUser()` used correctly | **No soft deletes** (explicitly required). Audit log covers only documents and is forgeable. No activity history. No backup policy. No permission matrix. Recursive `profiles` policy (R1) |
| 25 | **AI Features** | ❌ | Nothing | Manpower suggestion, delay prediction, material estimation, auto-quotation, expense anomaly detection, cash-flow prediction, invoice reminder drafting, daily summaries |

### 2.1 Score

| Status | Count | Modules |
|---|---|---|
| ✅ Complete | **0** | — |
| 🟡 Partial | **11** | 1, 4, 5, 8, 12, 13, 14, 17, 18, 20, 23, 24 |
| 🔴 Schema only | **4** | 3, 6, 7, 15 |
| ❌ Absent | **9** | 2, 9, 10, 11, 16, 19, 21, 22, 25 |

**Zero of 25 modules are complete.** And of the 11 partials, every one is currently non-functional because of the build blockers.

---

## 3. Workflow Gap Trace

Walking the client's stated workflow step by step against what the software can actually do today:

| Step | Supported? | Detail |
|---|---|---|
| Company gives contract | ❌ | No contract entity |
| Contract contains multiple sites | ❌ | `sites` exists but has no contract parent (parents to `projects`) and no code |
| Assign Site Engineer | ❌ | No engineer role; `site_assignments` has no code |
| Assign Workers | 🟡 | `assignEmployeeToProject()` works, but targets the renamed table |
| Track Attendance | 🔴 | Check-in broken; no site linkage |
| Purchase Materials | ❌ | No PO, no vendor, no inventory |
| Transport Materials | ❌ | No transfer/logistics entity |
| Installation | 🔴 | `work_logs` schema exists, no code |
| Inspection | ❌ | No inspection entity or checklist |
| Completion | 🟡 | Status field exists; no completion certificate, no sign-off |
| Invoice | 🟡 | Works in shape; no GST split, wrong parent hierarchy |
| Receive Payment | 🟡 | Works in shape; no receivables view |
| Pay Workers | 🔴 | `payroll` schema only |
| Calculate Profit | ❌ | Structurally impossible today |

**4 of 14 steps have any working code. None of the money-out or profit steps work.**

---

## 4. The Five Questions Every Screen Must Answer

The client's UX requirement is that every screen answers these. Current state:

| Question | Answerable today? | What is needed |
|---|---|---|
| **What needs attention?** | ❌ | Notifications, exception queues, stalled-site detection |
| **What is pending?** | 🟡 | Expense approvals and leave requests only; no unified inbox |
| **What is overdue?** | ❌ | `due_date` and `expected_end_date` are stored but never compared to today |
| **What is costing money?** | ❌ | No cost roll-up at any level |
| **What is making money?** | ❌ | No revenue attribution, no profitability |

---

## 5. Business Impact Ranking

Ordered by the cost to the business of *not* having it, which drives the roadmap in `04_FEATURE_ROADMAP.md`.

### Tier 1 — Direct, measurable money leakage

| Gap | Business cost |
|---|---|
| **No profitability per site/contract** | The owner cannot tell which of 100 sites lose money. On thin EPC margins this is the difference between a profitable year and a loss |
| **No payroll from attendance** | Wages are the largest cost line. Manual calculation across 50+ daily-wage workers is error-prone and slow; overpayment is invisible |
| **No advance recovery** | Advances given and never deducted are pure loss. The table was built for exactly this and does nothing |
| **No material inventory** | Panels and inverters are high-value. Untracked stock walks away, and over-ordering ties up cash |
| **No receivables tracking** | Cash-flow crises come from unbilled work and unchased invoices. Nothing surfaces either |

### Tier 2 — Operational friction and compliance risk

| Gap | Business cost |
|---|---|
| **Broken attendance check-in** | The most-used daily function is non-functional; falls back to paper |
| **No GST split** | Invoices cannot be filed as-is. Real compliance exposure |
| **No mobile/offline** | Field staff at remote industrial sites cannot record anything; data arrives days late and degraded |
| **No reports/export** | Every client submission and every accountant handover is manual |
| **No document access control** | Aadhaar and bank details readable by every worker |

### Tier 3 — Scale and growth

| Gap | Business cost |
|---|---|
| No contract entity | Cannot bid or manage multi-site awards, which is the client's actual business |
| No vendor/PO | Payables invisible; no purchase history for negotiation |
| No notifications | Deadlines and dues are missed by default |
| No customer portal | Client companies chase by phone |
| No AI features | Nice-to-have; genuinely valuable only once the data model above exists and is populated |

---

## 6. What This Means for Sequencing

Three conclusions follow directly from this analysis and drive `07_IMPLEMENTATION_PHASES.md`:

1. **Nothing can be built until the build is fixed and the hierarchy is settled.** Adding a materials module on top of three competing job entities means building it three times or building it wrong. Phase 0 is not optional.

2. **The cost-allocation model is the keystone.** Profitability (16), Cash Flow (15), Reports (21), and the Dashboard (20) are all *derived* from having every cost row carry `(company_id, contract_id, site_id)`. Get that right once in the schema redesign and four modules become straightforward queries.

3. **Payroll is the highest-ROI single module** — it is the largest cost line, it is currently 100% manual, the schema is already ~80% correct, and it depends only on attendance being fixed. It should be the first *new* feature delivered after the foundation.
