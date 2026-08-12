# 07 — Implementation Phases

Companion to `PROJECT_AUDIT.md`. The sequenced delivery plan, with acceptance criteria and exit gates.

---

## Ground Rules

1. **No phase starts until the previous phase's exit gate passes.** The current state of this project is precisely what happens when that rule is ignored — three architectures, none finished.
2. **Every phase ends with working, deployed, demonstrable software.** No phase leaves the system less usable than it was.
3. **Tests ship with the feature**, not after.
4. **Migrations go through the Supabase CLI only.** Pasting into the SQL editor is what created BLOCKER-4.
5. **Every legacy table is retired explicitly**, not left to rot. If a phase replaces something, the phase also removes it.

---

## Phase 0 — Foundation Repair
**2–3 weeks · no new features · highest ROI work in the plan**

Nothing can be built on the current base. This phase makes the codebase capable of absorbing 25 modules.

### 0.1 Stop the bleeding (Day 1)

| Task | Detail |
|---|---|
| **`git init` + initial commit** | There is no version control. Everything else is unsafe until this exists |
| **Rotate the Supabase service-role key** | SEC-4 — `.env.local` is in an unversioned working tree; treat as exposed |
| `npm install` | Restore `node_modules` |
| **Read `node_modules/next/dist/docs/`** | Required by `AGENTS.md`. Validate every framework pattern in `06_ARCHITECTURE_PLAN.md` before coding. Correct that document where the bundled docs differ |
| Delete dangerous scripts | `fix_migrations.js`, `test_signup.ts`, `seed_users.ts`, `verify_migration.ts`, `tsconfig.tsbuildinfo` |

### 0.2 Make it build (Days 2–4)

| Blocker | Fix |
|---|---|
| **BLOCKER-1** | Restore the 10 missing schemas: `createCustomerSchema`, `createWorkOrderSchema`, `updateWorkOrderSchema`, `workOrderStatusSchema`, `workOrderUpdateSchema`, `quotationDataSchema`, `quotationLineItemSchema`, `quotationStatusSchema`, `leaveRequestSchema`, `leaveStatusSchema` |
| **BLOCKER-6** | `z.number()` → `z.coerce.number()`, `z.boolean()` → `z.coerce.boolean()` across every schema |
| **BLOCKER-7** | Remove `v.salary`; write `daily_rate`, `monthly_salary`, `ot_rate_per_hour`, `bank_name`, `aadhar_number` in `createEmployee` and `updateEmployee` |
| Type errors | `npm run typecheck` must pass with zero errors |

**Gate 0.2:** `npm run build` succeeds.

### 0.3 Establish database ground truth (Days 5–8)

The live database does not match the migration files. This must be resolved before any schema work.

1. `pg_dump --schema-only` from the live project
2. Diff against migrations 001–018; document every discrepancy
3. Determine whether 017 and 018 ever applied (they almost certainly did not — BLOCKER-4)
4. Full data backup
5. **Squash into `00001_baseline.sql`** reflecting verified actual state; archive originals to `supabase/migrations/_archive/`
6. Confirm a clean `supabase db reset` reproduces the baseline exactly

**Gate 0.3:** a fresh local database built from migrations is byte-identical to production schema.

### 0.4 Fix what is broken at runtime (Days 9–12)

| Blocker | Fix |
|---|---|
| **BLOCKER-3** | `next_document_number()` — `SECURITY DEFINER`, FY-aware, raises on failure instead of returning NULL |
| **BLOCKER-5** | Attendance upsert targets a constraint that actually exists; write to `check_in_*` columns, not legacy `location_*` |
| **R1** | Replace recursive `profiles` policies with `auth_role()` / `auth_has_role()` `SECURITY DEFINER` functions |
| **R2** | Rewrite all 40+ policies to use the claim functions |
| **U10** | IST timezone helper; remove all six `toISOString().split("T")[0]` occurrences |
| **U3/U4** | Fix dead sidebar links; restore navigation to customers, quotations, work-orders |
| **D1/D2/D3** | `CREATE EXTENSION pgcrypto`; standardise on `gen_random_uuid()` and `set_updated_at()` |

### 0.5 Introduce the architecture (Days 13–18)

- `services/`, `repositories/`, `lib/auth/`, `lib/errors/` scaffolding
- `getSessionUser()` with React `cache()` — fixes S3
- `requireRole()` / `requireSiteAccess()` — replaces 23 copy-pasted guards
- `withAction()` wrapper with user-safe error mapping — fixes U11
- **Route-level RBAC in middleware** — closes SEC-1
- Generated `database.gen.ts`, replacing the hand-written types
- Mandatory pagination in every repository — fixes S1/S2
- `loading.tsx` / `error.tsx` / `not-found.tsx` throughout — fixes U5

### 0.6 Safety net (Days 19–21)

- Vitest + Playwright + pgTAP configured
- CI: typecheck → lint → unit → RLS → build, blocking
- Unit tests for restored validation schemas and guards
- **pgTAP tests for every existing RLS policy** — these become the regression net for the whole redesign
- E2E: login → dashboard → create employee → mark attendance
- Sentry, structured logging, `/api/health`
- Staging environment

### Exit Gate — Phase 0

- [ ] Repository under git with CI passing
- [ ] `npm run verify` green
- [ ] Service-role key rotated
- [ ] Local DB reproduces production schema exactly
- [ ] Every blocker BLOCKER-1 … BLOCKER-7 closed
- [ ] SEC-1 closed; R1/R2 closed
- [ ] Existing features (employees, attendance, expenses, invoices) demonstrably work end-to-end
- [ ] RLS test suite covers 100% of existing policies
- [ ] Deployed to staging

---

## Phase 1 — Operational Spine
**3–4 weeks · Companies → Contracts → Sites → Attendance**

### 1.1 Companies (Week 1)
Migration for `companies` + `company_contacts`. Backfill from `customers`. Repository, service, actions, UI (list, detail, form). Multiple contacts, exactly one primary. State code captured — it drives GST later.

**Retire:** `customers` → `_legacy_customers`.

### 1.2 Contracts (Week 1–2)
Migration for `contracts` + `contract_milestones`. Backfill from `projects`, resolving `client_company` free text to real `company_id` FKs, creating placeholder companies where no match exists. Unresolvable rows go to `_migration_orphans` for manual review — never silently dropped.

Contract detail: value, dates, terms, retention, penalties, milestone builder, site roll-up.

### 1.3 Sites (Week 2–3)
Migration for `sites` (re-parented to `contracts`), `site_stages`, `site_stage_history`, `site_assignments`, `site_photos`. The `stamp_site_lineage()` trigger — **this is the keystone for all future profitability**.

- CRUD + list with kanban-by-stage, table, and map views
- **Bulk creation: CSV import and "generate N sites" template.** A 100-site contract cannot be entered one form at a time
- Stage transitions with history
- Engineer/supervisor assignment
- Detail page with tabs

**Retire:** `projects`, `project_assignments`, `project_documents`.

### 1.4 Attendance (Week 3–4)
Rebuild on the new schema: `site_id NOT NULL`, day fractions, geofence computation, source tracking, `is_locked`.

- **Batch marking screen** — the highest-frequency UX in the product. "All Present" + "Copy Yesterday", segmented control per row, 50 workers in under 30 seconds
- Self check-in/out with GPS validation and optional photo
- Supervisor scope enforced via `requireSiteAccess` **and** RLS
- Correction workflow with mandatory reason
- Monthly grid per site and per employee

### Exit Gate — Phase 1
- [ ] Contract with 50 sites created via CSV in under 5 minutes
- [ ] Site moves through all 7 stages with complete history
- [ ] 50 workers marked at one site in under 30 seconds
- [ ] Out-of-geofence check-in flagged (not blocked) and recorded
- [ ] Supervisor cannot mark attendance for an unassigned site — verified by pgTAP
- [ ] Every attendance and expense row carries stamped `site_id`, `contract_id`, `company_id`
- [ ] Legacy customers/projects retired; zero orphaned rows
- [ ] Owner demo delivered

---

## Phase 2 — Money Out
**3–4 weeks · Payroll · Advances · Expenses · Dashboard**

### 2.1 Salary advances (Week 1, first)
Built before payroll because payroll consumes it. Recording, recovery modes, running balance, outstanding report.

### 2.2 Payroll engine (Week 1–3)
The largest single service in the system, and the one that must be most correct.

- `payroll_runs`, `payroll_lines`, `payroll_site_allocations`
- Three wage modes: monthly, daily, piece-rate
- Overtime from `company_settings.ot_after_hours`
- Automatic advance recovery
- **Site allocation** — splits each worker's cost across the sites they worked, from attendance distribution. This is what makes labour-cost-per-site possible
- Draft → review → finalise (locks attendance) → paid
- Payslip PDF, bank transfer sheet export

**Non-negotiable:** the payroll service reaches **100% branch coverage** with hand-computed expected values before it touches real wages. Every rule — day fractions, half-days, paid leave, overtime thresholds, instalment recovery, rounding — gets an explicit test.

### 2.3 Expenses (Week 3)
Re-attach to `site_id` with stamped lineage. Four-tap mobile quick entry. Bulk approval queue. Head count and meal type for food.

### 2.4 Owner dashboard (Week 4)
Replace every `"—"`. The five-questions layout from `05_UI_UX_IMPROVEMENTS.md` §4.1. Needs-attention block first. Real queries against the new views.

### Exit Gate — Phase 2
- [ ] Payroll for 50 workers generated in under 10 seconds
- [ ] Every rupee traceable to source attendance rows
- [ ] Site allocations sum exactly to gross pay
- [ ] Mid-month advance auto-deducted; balance reaches zero unaided
- [ ] Payroll service at 100% branch coverage
- [ ] Finalised payroll locks its attendance rows
- [ ] Expense logged in four taps on a phone
- [ ] Dashboard shows only real data
- [ ] Owner signs off on a real month's payroll run against his manual calculation

---

## Phase 3 — Money In
**3–4 weeks · Invoices · Payments · Quotations · Profitability**

### 3.1 Invoices with correct GST (Week 1–2)
CGST/SGST vs IGST derived from company state code. HSN/SAC per line. TDS and retention. Generated columns for all totals. Milestone-linked generation. Professional PDF. Scheduled overdue transition.

**Multi-table writes (invoice + items) move into a Postgres function** — the current `createInvoice` can leave an invoice with no line items if the second insert fails.

### 3.2 Payments & receivables (Week 2)
Bank accounts. Payments against invoices. Ageing buckets. Receivables by company and contract. Expected-vs-received against milestone schedule.

### 3.3 Quotations (Week 3)
Re-parent to companies. Professional PDF with logo, GST, terms, and sections for products/installation/transport/labour. **Convert-to-contract** action — sets `status = 'converted'` and pre-populates the contract.

### 3.4 Profitability (Week 4)
`v_site_financials` and `v_contract_financials` surfaced as screens. Per-site, per-contract, per-company P&L with drill-down. Margin ranking exposing loss-making sites.

### Exit Gate — Phase 3
- [ ] Same-state invoice splits CGST/SGST; different-state produces IGST
- [ ] GST report reconciles against invoice data
- [ ] Invoice creation is atomic — no orphaned invoices without items
- [ ] Overdue transition runs automatically
- [ ] Quotation converts to contract with data carried over
- [ ] Owner sees profit per site for all sites, two taps from home
- [ ] Profitability figures reconcile to source rows within ₹1

---

## Phase 4 — Field Adoption
**2–3 weeks · PWA · Offline · Photos · Work Logs**

Deliberately placed after the value modules: there is no point making a system installable before it does anything worth installing.

### 4.1 Mobile PWA (Week 1–2)
Manifest, service worker, installable. Bottom tab navigation with context-aware FAB. IndexedDB offline queue for attendance, expenses, and photos. Background sync with conflict resolution (`source = 'offline_sync'`). Camera capture with GPS EXIF and client-side compression. 48px minimum tap targets, AAA contrast for outdoor use.

### 4.2 Site photos & work logs (Week 2–3)
Before/during/after galleries per site and stage. Daily work log with approval workflow (draft → submitted → approved → locked). Client submission bundle export.

### Exit Gate — Phase 4
- [ ] Installable to home screen on Android
- [ ] 40 workers marked in airplane mode; syncs correctly on reconnect
- [ ] Conflicting offline edits resolved without data loss
- [ ] Photos captured with GPS, compressed, uploaded on reconnect
- [ ] Supervisor completes a full day's work on a phone without opening a browser
- [ ] Field trial with two real supervisors for one week

---

## Phase 5 — Supply Chain
**3–4 weeks · Vendors · Purchase Orders · Materials**

### 5.1 Vendors (Week 1) — small, unblocks POs
### 5.2 Materials & stock ledger (Week 1–3)
Item master for the nine solar categories with specs. **Append-only `stock_ledger`** — stock on hand is always `SUM(quantity_delta)`, never a mutable counter. Locations for warehouse/site/vehicle. Transfers, site consumption, damage. Low-stock alerts.

### 5.3 Purchase orders (Week 3–4)
PO with lines, vendor, expected delivery, site destination. Goods receipt with partial delivery. Receipts auto-post to `stock_ledger`. Pending-delivery tracking.

### 5.4 Profitability accuracy
Material cost now flows into `v_site_financials`, completing the picture.

### Exit Gate — Phase 5
- [ ] Panel traceable from PO → receipt → warehouse → transfer → site consumption
- [ ] Stock on hand reconciles to a physical count
- [ ] Partial receipts handled; over-receipt rejected by constraint
- [ ] Low-stock alerts fire against reorder levels
- [ ] Site profitability now includes material cost

---

## Phase 6 — Intelligence & Control
**3–4 weeks · Reports · Cash Flow · Notifications · RBAC · Documents**

### 6.1 Reports (Week 1–2)
All ten report types, each with date range, entity filter, and Excel + PDF export. Built on SQL views.

### 6.2 Cash flow (Week 2)
Money in vs out by month. Net cash, bank position, 90-day forward projection.

### 6.3 Notifications (Week 3)
All 10 trigger types. Bell with unread count. Daily digest. Includes the two zero-history AI features — **invoice reminder drafting** and **daily project summaries** — which need no historical data.

### 6.4 RBAC (Week 3–4)
Eight roles, `role_permissions` matrix, scope enforcement (`all` / `assigned_sites` / `own`). Permission-derived navigation. Full RLS rewrite against the matrix.

### 6.5 Documents (Week 4)
Build the `/documents` page the sidebar has linked to since day one. **Storage RLS policies** — closes SEC-3. Private buckets with signed URLs.

### Exit Gate — Phase 6
- [ ] All 10 reports export to Excel and PDF
- [ ] Accountant completes month-end using only exports
- [ ] All 8 roles enforced at middleware, action, and RLS layers
- [ ] pgTAP asserts every role × table × operation combination
- [ ] A worker cannot read another employee's payroll or bank details
- [ ] Documents are private; access requires a signed URL

---

## Phase 7 — Extended
**2 weeks**

Inspections with per-stage checklists and completion certificates. Customer portal — read-only site progress, photos, and invoices via the `customer` role.

---

## Phase 8 — AI
**2–3 weeks, and only after 6–12 months of live data**

Manpower suggestion · delay prediction · material estimation · auto-quotation · expense anomaly detection · cash-flow prediction. Each requires historical data that will not exist until the operational modules have been running for two or three quarters.

**Do not attempt these earlier.** A delay-prediction model with no completed-site history produces confident nonsense, and the owner's trust in the system is the hardest thing to rebuild.

---

## Timeline

| Phase | Weeks | Cumulative | Milestone |
|---|---|---|---|
| 0 | 3 | 3 | It builds and runs |
| 1 | 4 | 7 | Contracts, sites, attendance |
| 2 | 4 | 11 | **Automatic payroll** |
| 3 | 4 | 15 | **Profit per site** |
| 4 | 3 | 18 | Runs on a phone, offline |
| 5 | 4 | 22 | Materials tracked |
| 6 | 4 | 26 | Reports and control |
| 7 | 2 | 28 | Inspections, portal |
| 8 | 3 | 31 | AI |

**~7 months, one experienced full-stack developer.** Roughly 4–5 months with two developers: Phases 2 and 3 can run in parallel after Phase 1, as can 5 and 6.

---

## Risk Register

| Risk | Mitigation |
|---|---|
| **Backfill loses or mangles data** | Full backup; transactional migration; `_migration_orphans` table; pre/post row-count and financial-total reconciliation; staging rehearsal first |
| **Payroll computes wrong wages** | 100% branch coverage; parallel run against manual calculation for one full month before cutover |
| **Field staff reject the app** | Phase 4 field trial with two real supervisors; attendance UX prioritised above everything else |
| **Live business disrupted during rewrite** | Strangler pattern; every phase ends deployable; legacy retired only after replacement is verified |
| **Scope creep** | Exit gates are binary. Nothing enters a phase mid-flight |
| **Bundled Next.js docs contradict the plan** | Read them in Phase 0 Day 1; correct `06_ARCHITECTURE_PLAN.md` before coding |
| **Owner unavailable for sign-off** | Sign-off is an explicit gate item on Phases 1, 2, and 4 — schedule it in advance |
| **Single developer, no bus factor** | Conventional commits, ADRs, tests as documentation, CI reproducible from a clean clone |

---

## What Happens First

If only one thing is done this week:

```
1.  git init && git add -A && git commit -m "chore: baseline before audit remediation"
2.  Rotate the Supabase service-role key
3.  npm install
4.  Read node_modules/next/dist/docs/
5.  Fix BLOCKER-1 (the 10 missing schemas) so the project builds
```

Steps 1 and 2 take fifteen minutes and remove the two risks that cannot be undone later.
