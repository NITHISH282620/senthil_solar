# PROJECT AUDIT — Sentil Solar Ops

**Audit date:** 2026-08-08
**Auditor scope:** every file in the repository (135 source files, 18 migrations)
**Verdict:** **The application does not currently build and could not run correctly if it did.** The repository is a partially-completed second architecture layered on top of an abandoned first architecture, with a third architecture (`sites`) present in the database but with zero application code.

No code was changed during this audit.

---

## 1. Executive Summary

The project has been rewritten twice without ever completing a migration:

| Generation | Intent | Evidence | State |
|---|---|---|---|
| **v1 — Retail solar shop** | Customer → Quotation → Work Order → Invoice | migrations 001–010, `customers`/`quotations`/`work_orders` actions + pages | Code complete, **orphaned from navigation** |
| **v2 — Field ops** | Project → Attendance/Expenses/Work Logs → Payroll | migrations 011–016, `projects` action + pages | Half-built; payroll/work-logs/advances have tables but **no code** |
| **v3 — Site pivot** | Project → Site → everything | migrations 017–018 | **Schema only. Zero lines of application code reference `sites`.** |

Each generation renamed the central entity without retiring the previous one. The result is three competing "job" concepts (`work_orders`, `projects`, `sites`), two competing customer concepts (`customers` table vs. `projects.client_company` free-text), and a validation layer that was rewritten for v2 while v1 actions still import from it.

**The good news:** the foundations that are hardest to get right — Next.js App Router structure, Supabase SSR cookie handling, server-action patterns, the shadcn/Tailwind design system, and the general shape of the RLS model — are sound and worth keeping. The problem is not the technology choices. It is that ~40% of the domain model was never wired up, and the schema drifted out from under the code.

**Recommendation:** do not continue forward-building on this base. Execute a controlled consolidation (Phase 0 in `07_IMPLEMENTATION_PHASES.md`) that fixes the build, collapses the three architectures into the one the business actually needs (Company → Contract → Site), and only then add the missing 15 modules.

---

## 2. Build-Blocking and Runtime-Blocking Defects

These are ordered by severity. Every one was verified by static analysis of the actual files.

### BLOCKER-1 — The project does not typecheck. 10 schemas are imported but do not exist.

`src/lib/validations.ts` was rewritten for the v2 "field ops" pivot. The v1 schemas were deleted, but the v1 actions still import them:

| Missing schema | Imported by |
|---|---|
| `createCustomerSchema` | `src/actions/customers.ts` |
| `createWorkOrderSchema`, `updateWorkOrderSchema`, `workOrderStatusSchema`, `workOrderUpdateSchema` | `src/actions/work-orders.ts` |
| `quotationDataSchema`, `quotationLineItemSchema`, `quotationStatusSchema` | `src/actions/quotations.ts` |
| `leaveRequestSchema`, `leaveStatusSchema` | `src/actions/attendance.ts` |

`next build` will fail. There is no way this code has been successfully compiled in its current state.

### BLOCKER-2 — `node_modules` is empty. Dependencies are not installed.

`npm install` has not been run (or was wiped). Nothing can be built or tested until it is. Note that `AGENTS.md` instructs reading `node_modules/next/dist/docs/` before writing code — **that directory does not currently exist**, so this instruction cannot be honoured until dependencies are restored. This must be done before Phase 1 coding begins.

### BLOCKER-3 — `next_sequence()` silently returns NULL for every authenticated user.

`supabase/migrations/00003_create_sequences.sql`:

```sql
CREATE OR REPLACE FUNCTION next_sequence(seq_name TEXT, prefix TEXT DEFAULT '')
RETURNS TEXT AS $$
...
  UPDATE sequences SET current_value = current_value + 1
  WHERE name = seq_name
  RETURNING current_value INTO next_val;
```

The function is **not `SECURITY DEFINER`**, so it executes as the calling role (`authenticated`). The `sequences` table has RLS enabled with **only a SELECT policy** — there is no UPDATE policy. The `UPDATE` therefore matches zero rows, `next_val` stays `NULL`, and the function returns `NULL`.

Every caller then does this:

```ts
const { data: seqData, error: seqError } = await supabase.rpc("next_sequence", {...});
const project_code = seqError ? `PRJ-...fallback...` : (seqData as string);
```

There is **no error** — just a `NULL` result — so the fallback never triggers. `project_code` becomes `NULL`, and the insert fails on the `NOT NULL` constraint.

**Consequence:** creating a project, invoice, quotation, or expense is impossible. Only employee creation works, because `createEmployee` uses the service-role admin client, which bypasses RLS.

### BLOCKER-4 — Migration 017 cannot execute on a database where 013 has run.

`00017_architecture_pivot_sites.sql` line 39:

```sql
ALTER TABLE attendance ADD COLUMN working_hours NUMERIC(4,2) DEFAULT 1.0;
```

Migration 013 already added `working_hours NUMERIC(5,2)`. There is no `IF NOT EXISTS`. Postgres raises `column "working_hours" of relation "attendance" already exists` and the migration aborts.

Compounding problems in the same file:
- `uuid_generate_v4()` is used (migrations 001–016 use `gen_random_uuid()`), but **no `CREATE EXTENSION "uuid-ossp"` exists anywhere in the repo.**
- `moddatetime(updated_at)` is used as a trigger function, but **no `CREATE EXTENSION moddatetime` exists**, and every other table uses the hand-rolled `update_updated_at_column()`.
- `ALTER TABLE attendance ADD CONSTRAINT attendance_site_id_fkey FOREIGN KEY (site_id) REFERENCES sites(id)` will fail validation against any pre-existing rows, whose renamed `project_id` values point at `projects`, not `sites`. Same defect for `expenses` and `work_logs`.

**This migration has almost certainly never run successfully.** The database is in an indeterminate state relative to the migration files, which is itself a critical operational risk.

### BLOCKER-5 — `checkIn()` upserts against a constraint that no longer exists.

`src/actions/attendance.ts:91` — `{ onConflict: "employee_id,date" }`.

That constraint was dropped in migration 013 and replaced with a partial unique index on `(employee_id, project_id, date)`, then again in 017 with `(employee_id, site_id, date)`. PostgREST will return `there is no unique or exclusion constraint matching the ON CONFLICT specification`. **Attendance check-in is broken** — the single most-used feature for field staff.

The same action writes to `location_lat`/`location_lng` (the legacy v1 columns) rather than `check_in_gps_lat`/`check_in_gps_lng`, so GPS data lands in dead columns that no report reads.

### BLOCKER-6 — `parseFormData` stringifies everything; schemas expect numbers and booleans.

`src/lib/validations.ts`:

```ts
formData.forEach((value, key) => { raw[key] = String(value); });
const result = schema.safeParse(raw);
```

Every value becomes a string. But the schemas use `z.number()` and `z.boolean()`, which **do not coerce** in Zod. Any submitted form containing a numeric field fails validation with `Expected number, received string`.

Affected fields include `total_amount`, `tax_percent`, `discount_amount`, `amount`, `daily_rate`, `monthly_salary`, `ot_rate_per_hour`, `rate_amount`, `quantity`, `unit_price`, `head_count`, `geofence_radius_m`, `progress_percent`, `workers_present_count`, and every `z.boolean()` in `submissionSchema`.

**Effectively every create/update form in the application is non-functional.** The fix is one line (`z.coerce.number()`), but it must be applied consistently.

### BLOCKER-7 — `createEmployee` writes a field that its schema does not produce.

`src/actions/employees.ts:136` inserts `salary: v.salary`, and line 187 reads `v.salary` again. Neither `createEmployeeSchema` nor `updateEmployeeSchema` defines a `salary` field — they define `daily_rate`, `monthly_salary`, and `ot_rate_per_hour`. This is both a type error (contributing to BLOCKER-1) and a logic error.

Worse: **`daily_rate`, `monthly_salary`, `ot_rate_per_hour`, `bank_name`, and `aadhar_number` are validated but never written to the database.** They are silently dropped on insert.

**Consequence:** wage rates can never be stored, so payroll can never be calculated. The single most valuable feature the client asked for is blocked at the data-entry step.

---

## 3. Architecture

### 3.1 What is genuinely good

- **Next.js 16 App Router with route groups** — `(auth)` and `(dashboard)` cleanly separate the shells. Correct use of async server components.
- **Supabase SSR cookie handling** — `src/lib/supabase/{server,client,middleware}.ts` follow the current `@supabase/ssr` pattern correctly, including the `getAll`/`setAll` contract and the try/catch around Server Component cookie writes. This is the part people most often get wrong, and it is right here.
- **Server Actions as the entire API surface** — no REST layer to maintain, type-safe end to end, correct `"use server"` placement. This is the right call for this application and should be kept.
- **Consistent action return shape** — `{ data, error }` everywhere makes call sites uniform and predictable.
- **`sanitizeSearchInput()`** — someone correctly identified that PostgREST `.or()` filters are injectable and wrote a mitigation. Good instinct.
- **Service-role isolation** — `createAdminClient()` is separate, documented, and used only where genuinely required (auth user creation).
- **Design system** — 24 shadcn/ui primitives, Tailwind v4, dark mode via `next-themes`, `tw-animate-css`. Coherent and modern.
- **Generated column for `balance_due`** — `GENERATED ALWAYS AS (total_amount - amount_paid) STORED` is the correct way to keep a derived financial field honest. Do more of this.
- **Auto-provisioning trigger** — `handle_new_user()` is correctly `SECURITY DEFINER` with a pinned `search_path`, and the first-user-becomes-admin bootstrap is a nice touch.

### 3.2 The three-architecture problem

This is the single most important structural finding.

```
v1 (dead but present)         v2 (partial)            v3 (schema only)
─────────────────────         ────────────            ────────────────
customers ──┐                 projects                sites
            ├─ quotations     ├─ project_assignments  └─ site_assignments
            ├─ work_orders    ├─ work_logs
            └─ invoices       ├─ payroll
                              ├─ salary_advances
                              └─ submissions
```

- `projects.client_company` is a **TEXT field**, not a foreign key to `customers`. The two customer concepts cannot be joined. Reporting "revenue per company" is impossible today.
- `work_orders` and `projects` both model "a job", with separate assignment tables, separate status enums, and separate detail pages.
- `invoices` has `work_order_id`, `quotation_id`, **and** `project_id` — three optional parents, no constraint enforcing exactly one. Profitability roll-ups cannot be computed reliably.
- `expenses` has `work_order_id` **and** (post-015) `project_id`, renamed to `site_id` in 017. The application code still writes `work_order_id` only.

### 3.3 Seven tables exist in the database with zero application code

Verified by grepping every `.from("…")` call in `src/`:

| Table | Migration | Query calls in `src/` |
|---|---|---|
| `sites` | 017 | **0** |
| `site_assignments` | 017 | **0** |
| `cash_transfers` | 018 | **0** |
| `payroll` | 015 | **0** |
| `salary_advances` | 015 | **0** |
| `submissions` | 015 | **0** |
| `work_logs` / `work_log_photos` | 014 | **0** |

Zod schemas exist for most of these (`generatePayrollSchema`, `salaryAdvanceSchema`, `workLogSchema`, `submissionSchema`) — so the intent was there — but no action, no page, no component was ever written. This is roughly one-third of the intended v2 feature set, fully specified and fully unimplemented.

### 3.4 Dead navigation and orphaned modules

`src/components/layout/sidebar.tsx` links to:
- `/documents` — **no such page exists** → 404
- `/reports` — **no such page exists** → 404

And it does *not* link to modules that *do* exist and are fully built:
- `/customers` (list, detail, new, edit — all present)
- `/quotations` (list, detail, new, edit — all present)
- `/work-orders` (list, detail, new, edit, kanban, timeline — all present)

So the sidebar advertises two features that don't exist while hiding three that do. A user cannot reach the quotation module at all without typing the URL.

### 3.5 The dashboard is a placeholder

`src/app/(dashboard)/dashboard/page.tsx` renders six stat cards. Five of them are hardcoded to the string `"—"`. Only "Active Employees" issues a real query. The three "Quick Action" cards are `<Card>` elements with `cursor-pointer` and **no `onClick` or `<Link>`** — they are decorative.

The client's stated requirement is that every screen answers *what needs attention, what is pending, what is overdue, what is costing money, what is making money.* The current dashboard answers none of these.

---

## 4. Database Design

### 4.1 Schema-level problems

| # | Problem | Impact |
|---|---|---|
| D1 | No `CREATE EXTENSION` for `uuid-ossp` or `moddatetime` despite both being used | Migrations 017/018 fail on a clean project |
| D2 | Mixed UUID defaults (`gen_random_uuid()` vs `uuid_generate_v4()`) | Inconsistency; unnecessary extension dependency |
| D3 | Mixed `updated_at` mechanisms (`update_updated_at_column()` vs `moddatetime`) | Two ways to do one thing |
| D4 | Mixed types for the same concept: `VARCHAR(50)` status in 017/018, `TEXT` + CHECK everywhere else | Inconsistent constraint enforcement |
| D5 | Status values as inline CHECK constraints on 14 tables | Adding a status requires a migration + a redeploy; no single source of truth shared with TypeScript |
| D6 | `UNIQUE(employee_id, site_id, date)` where `site_id` is nullable | NULLs are distinct in Postgres → unlimited duplicate attendance rows for unassigned entries |
| D7 | Both a partial unique index (013) and a table constraint (017) on attendance | Redundant, conflicting |
| D8 | **No soft deletes anywhere.** No `deleted_at` on any table | Client explicitly requires soft deletes (requirement 24). A mis-click permanently destroys a contract and cascades to its sites |
| D9 | `audit_logs.action` CHECK restricts to `document_upload`, `document_delete`, `other` | Cannot audit financial changes — the only ones that matter. Only `documents.ts` writes audit rows |
| D10 | `NUMERIC` without precision on all GPS columns; `NUMERIC(10,8)`/`(11,8)` only on `sites` | Inconsistent; wasted storage |
| D11 | No `CHECK` that an invoice has exactly one parent among work_order/quotation/project | Orphaned or multiply-parented invoices |
| D12 | No storage bucket migration; no RLS policies on `storage.objects` | Buckets must be created by hand. **Uploaded documents may be world-readable** depending on manual bucket config — unverifiable from the repo |
| D13 | No `updated_at` on `attendance`, `payments`, `documents`, `audit_logs`, `cash_transfers` | Cannot detect tampering or sync offline edits |
| D14 | Sequence numbering is global, not financial-year scoped, and not gap-free | GST filings in India expect per-FY sequential invoice numbering |

### 4.2 RLS problems

| # | Problem | Impact |
|---|---|---|
| R1 | **Recursive policy on `profiles`.** `profiles_admin_all` does `SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN (...)` — a policy on `profiles` that queries `profiles` | Postgres raises `infinite recursion detected in policy for relation "profiles"` (42P17). Any admin write to `profiles` through the anon key fails. Currently masked because `createEmployee` uses the service-role client |
| R2 | The `EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN (...))` subquery is **repeated 40+ times** across 18 migrations | Every row of every query re-executes this subquery. At 100+ sites × 50 workers × 30 days of attendance this becomes the dominant query cost |
| R3 | Supervisor policies check only `role = 'supervisor'`, not project/site membership. Comments say "for their assigned project" — the SQL does not | **Any supervisor can mark attendance for any worker at any site.** Direct payroll-fraud vector |
| R4 | `documents_select_all` is `USING (auth.uid() IS NOT NULL)` | Every authenticated user, including day-wage workers, can read every uploaded document — Aadhaar cards, bank details, client contracts |
| R5 | `work_order_updates_insert` checks `auth.uid() = employee_id` but not that the user is assigned to the work order | Anyone can post updates to any work order |
| R6 | `work_log_photos_insert` is `WITH CHECK (auth.uid() IS NOT NULL)` | Anyone can attach photos to anyone's work log |
| R7 | `sequences` has SELECT-only policy but the function needs UPDATE | See BLOCKER-3 |
| R8 | `audit_logs_insert` is `WITH CHECK (auth.uid() IS NOT NULL)` with no immutability guard | Users can forge audit entries; no UPDATE/DELETE denial policy |
| R9 | Several `FOR ALL` policies specify only `USING` with no `WITH CHECK` | Postgres reuses `USING` for `WITH CHECK`, which happens to be correct here — but it is implicit and fragile |

### 4.3 Missing entities

The client's brief names 25 modules. These entities have **no table at all**:

`companies` (as distinct from retail customers) · `company_contacts` · `contracts` · `contract_milestones` · `payment_schedules` · `vendors` · `purchase_orders` · `purchase_order_items` · `goods_receipts` · `materials` (item master) · `material_stock` · `material_transfers` · `material_allocations` · `site_photos` (typed before/during/after) · `site_stage_history` · `notifications` · `bank_accounts` · `roles`/`permissions` · `report_definitions` · `inspections`

---

## 5. Business Logic

### 5.1 Duplicated logic

| Logic | Duplicated in |
|---|---|
| Role check `["admin","manager"].includes(role)` | **23 occurrences** across 11 action files, plus 40+ times in SQL |
| Sequence-generation + fallback block | 4 action files, byte-identical, all broken the same way (BLOCKER-3) |
| Subtotal → discount → tax → total arithmetic | `invoices.ts` and `quotations.ts`, independently implemented |
| Invoice `amount_paid` recalculation | Once in the `update_invoice_payment_status()` **trigger**, once in `recordPayment()` **application code** — the two can race, and the app's status transition reads a pre-trigger snapshot |
| `new Date().toISOString().split("T")[0]` for "today" | 6 occurrences; all use UTC, so after 17:30 IST the "today" is wrong. **Evening check-outs will be recorded against the wrong date** |
| Status → colour maps | `src/lib/constants.ts` and again inside `status-badge.tsx` |

### 5.2 Missing business rules

- **No attendance → payroll link.** `payroll` has `present_days` and `daily_rate_used`, but nothing computes them. The client's requirement "attendance should automatically calculate salary" is entirely unimplemented.
- **No advance → payroll deduction.** `salary_advances.amount_deducted` and `deducted_in_payroll_id` exist; nothing writes them.
- **No profitability calculation anywhere.** Revenue − material − salary − expenses is not computed at site, contract, or company level. This requires the cost-allocation model that does not exist.
- **No quotation → contract conversion.** `quotations.status` includes `'converted'`; nothing sets it.
- **No overdue detection.** `invoices.status` includes `'overdue'`; no scheduled job or query transitions to it. `due_date` is stored and never compared.
- **No GST split.** Single `tax_percent` field. Indian invoicing requires CGST/SGST for intra-state and IGST for inter-state, derived from place-of-supply. Cannot file GSTR-1 from this data.
- **No TDS reconciliation.** `tds_deducted` and `tds_on_payment` columns exist, unused by any code.
- **No geofence enforcement.** `geofence_radius_m` and `default_geofence_radius` are stored; no code compares check-in GPS to site GPS. Workers can clock in from home.
- **No leave → attendance propagation.** `updateLeaveStatus` has a comment admitting approved leave does not create attendance rows. Payroll would count approved leave as absence.
- **No offline support.** `is_offline_entry` column exists; no service worker, no local queue, no PWA manifest. The client's field staff work at remote industrial sites with poor connectivity.

---

## 6. Scalability

The client's brief specifies "one company may assign 10, 25, 50, 100+ sites."

| # | Bottleneck | Detail | Breaks at roughly |
|---|---|---|---|
| S1 | **No pagination anywhere.** `DEFAULT_PAGE_SIZE` is defined in `constants.ts` and never used. `.range()` appears zero times | Every list page `SELECT`s the entire table and renders every row | 500–1,000 rows |
| S2 | **Client-side filtering after full fetch.** `getProjects()` fetches all projects with all assignments, then filters in JS | Transfers the whole table to filter to the user's 3 sites | 200+ sites |
| S3 | **`getCurrentUser()` re-queries `profiles` on every call** — layout, page, and each action in a request | 3–6 identical round-trips per page load. Not wrapped in React `cache()` | Immediately (latency) |
| S4 | **RLS subquery re-execution** (R2) | 40+ policies each run a `profiles` lookup per row | 10k+ attendance rows |
| S5 | Attendance grows at workers × sites × days | 50 workers × 100 sites × 365 days ≈ 1.8M rows/yr with no partitioning and no archival | Year 1 |
| S6 | No caching strategy | Zero use of `unstable_cache`, route segment config, or `revalidate`. Everything is dynamic | Under concurrent load |
| S7 | No composite indexes for the real access patterns | e.g. attendance-by-site-and-month, expenses-by-contract-and-period | 100k+ rows |
| S8 | Aggregations would be computed in JS | No SQL views or RPCs for roll-ups; profitability would fetch all rows and reduce client-side | 10k+ cost rows |
| S9 | Single-tenant assumption baked in | `company_settings` is a single seeded row. Fine today, blocks SaaS resale later | On any multi-tenant ambition |

---

## 7. Security

Beyond the RLS findings in §4.2:

| # | Finding | Severity |
|---|---|---|
| SEC-1 | **`src/middleware.ts` performs authentication only — no authorization.** Role gating exists only in the sidebar (`item.roles.includes(user.role)`), which is cosmetic. A worker who types `/employees` or `/billing` reaches the page; only the server action's own role check stops writes, and **read pages have no guard at all** | **High** |
| SEC-2 | Supervisor RLS ignores site membership (R3) — payroll fraud vector | **High** |
| SEC-3 | All authenticated users can read all documents (R4) — Aadhaar, PAN, bank details, client contracts | **High** |
| SEC-4 | `.env.local` is present in the working tree. `.gitignore` covers it, but the repo **is not a git repository**, so there is no history protection and no way to verify a key was never committed. Treat the service-role key as potentially exposed and rotate it | **High** |
| SEC-5 | No rate limiting on `loginAction` or `forgotPasswordAction` | Medium |
| SEC-6 | `sanitizeSearchInput` strips `.,()!` but not `*`, `:`, `%`, or backslash. Wildcards still reach `ilike` | Medium |
| SEC-7 | Audit log is effectively unused (D9) and forgeable (R8). Client requires audit logs (requirement 24) | Medium |
| SEC-8 | Password minimum is 6 characters (`createEmployeeSchema`) | Medium |
| SEC-9 | `logoutAction` is invoked from a plain `<form action={...}>` with no CSRF token beyond Next's built-in Server Action protection — acceptable, but the logout GET route at `src/app/auth/logout/route.ts` should be verified as POST-only | Low |
| SEC-10 | No storage RLS policies committed (D12) | Unknown — must be verified against the live project |
| SEC-11 | `middleware.ts` `setAll` drops cookie `options` on the `request.cookies.set` call | Low |

---

## 8. Code Quality and Technical Debt

**Quality signals that are positive:** consistent file organisation, meaningful section comments (`// ─── Attendance ───`), typed action returns, one component per file, sensible naming.

**Debt:**

| # | Item |
|---|---|
| Q1 | **Zero tests.** No test file, no test runner, no CI |
| Q2 | `src/types/database.ts` (606 lines) is **hand-written**, not generated by `supabase gen types`. It has already drifted — it still describes `project_id` on tables renamed to `site_id` |
| Q3 | `any` used to bypass typing: `const updates: any` (attendance, expenses), `(result as any).data.id` (forms) |
| Q4 | `tsconfig.tsbuildinfo` (293 KB) is committed |
| Q5 | Three one-off scripts committed at root: `fix_migrations.js`, `test_signup.ts`, `seed_users.ts`, `validate_env.ts`, `verify_migration.ts`. `fix_migrations.js` **rewrites migration files in place with regex** — an actively dangerous tool to leave in a repo |
| Q6 | README is the untouched `create-next-app` boilerplate |
| Q7 | **No `loading.tsx`, `error.tsx`, or `not-found.tsx` anywhere** (0 files). No Suspense boundaries. Every navigation is a blocking wait with no feedback, and any thrown error shows the default Next error page |
| Q8 | Migration comments contain unresolved developer deliberation, e.g. 009: *"Wait, employees might need to view work order documents if assigned?"* — shipped as-is |
| Q9 | Commented-out and contradictory constraint logic left in migrations (015: *"This would need manual mapping…"*) |
| Q10 | Empty `catch` blocks and `catch (err)` with an unused binding |
| Q11 | No structured logging, no error reporting integration |
| Q12 | `INVOICE_STATUSES` in `constants.ts` omits `'cancelled'`, which the DB CHECK allows — filter dropdowns can never show cancelled invoices |
| Q13 | Not a git repository. **No version control at all.** This is the highest-priority process fix |

---

## 9. UI/UX

Detailed treatment is in `05_UI_UX_IMPROVEMENTS.md`. Headline findings:

- **Dashboard shows no real data** (§3.5) — the owner's primary screen is a mock-up.
- **Desktop-first sidebar layout.** The client's stated requirement is that the owner runs the business from a phone and that workers clock in from the field. There is a `sheet.tsx` primitive available but the shell is a fixed 64/68px sidebar; there is no bottom navigation, no mobile-optimised data entry, and no PWA manifest.
- **No global search / command palette**, despite `cmdk` being installed and a `command.tsx` component existing unused.
- **Click depth is high.** Recording a site expense today would be: Dashboard → Expenses → New → fill 8 fields → submit. The brief demands "the fewest clicks possible."
- **No empty-state guidance on first run** — `empty-state.tsx` exists but a brand-new install shows blank tables with no "create your first contract" path.
- **No bulk operations.** Marking attendance for 50 workers means 50 separate interactions. `batchAttendanceSchema` was written for this and never used.
- **No optimistic UI.** No use of `useOptimistic` or `useActionState`; forms use manual `useState` loading flags.
- **Currency/date formatting** is centralised in `src/lib/format.ts` — good — but timezone handling is UTC-based and wrong for IST (§5.1).

---

## 10. Consolidated Risk Register

| ID | Risk | Likelihood | Impact | Priority |
|---|---|---|---|---|
| BLOCKER-1..7 | Application does not build or run | Certain | Total | **P0** |
| Q13 | No version control | Certain | Severe — no rollback, no history | **P0** |
| SEC-4 | Service-role key possibly exposed | Unknown | Severe — full DB access | **P0** |
| BLOCKER-4 | DB state unknown vs. migration files | High | Severe — cannot deploy safely | **P0** |
| SEC-1/2/3 | Authorization gaps | Certain | Severe — data leakage, payroll fraud | **P1** |
| §3.2 | Three competing architectures | Certain | Severe — every new feature costs 3× | **P1** |
| §5.2 | No payroll, no profitability | Certain | Severe — the client's core need | **P1** |
| S1–S4 | No pagination, N+1 patterns | High at scale | High | **P2** |
| D8/D9 | No soft deletes, no real audit | Certain | High — irreversible data loss | **P2** |
| Q1 | No tests | Certain | High — no regression safety during rewrite | **P2** |

---

## 11. What to Keep, Refactor, and Retire

**Keep as-is:** `src/lib/supabase/*`, `src/components/ui/*` (all 24 primitives), `src/lib/format.ts`, `src/lib/utils.ts`, the Server-Action pattern, the `(auth)`/`(dashboard)` route-group structure, `handle_new_user()`.

**Refactor:** `validations.ts` (add coercion, restore missing schemas, split per-domain) · `middleware.ts` (add route-level RBAC) · `constants.ts` (derive from DB enums) · sidebar (mobile nav, fix dead links) · dashboard (real queries) · all action files (extract shared auth/sequence/role helpers) · `types/database.ts` (replace with generated types).

**Retire:** `work_orders` + `work_order_assignments` + `work_order_updates` (superseded by sites and site tasks) · `fix_migrations.js` · `test_signup.ts` · `seed_users.ts` · `verify_migration.ts` · `tsconfig.tsbuildinfo` · the `projects`/`sites` split in its current form (becomes `contracts`/`sites`).

**Migrate carefully:** `customers` → `companies` + `company_contacts` · `projects` → `contracts` (with `client_company` TEXT resolved to a `company_id` FK) · `quotations` → keep, re-parent to `companies`, add contract conversion.

---

## 12. Companion Documents

| Document | Contents |
|---|---|
| `01_CURRENT_SYSTEM_ANALYSIS.md` | File-by-file inventory, full schema map, auth/role/workflow trace |
| `02_BUSINESS_GAP_ANALYSIS.md` | All 25 required modules scored against current state |
| `03_DATABASE_REDESIGN.md` | Target schema, full DDL, RLS model, migration strategy |
| `04_FEATURE_ROADMAP.md` | Modules ranked by ROI with effort estimates |
| `05_UI_UX_IMPROVEMENTS.md` | Mobile-first IA, screen-by-screen redesign, interaction patterns |
| `06_ARCHITECTURE_PLAN.md` | Target technical architecture, patterns, conventions |
| `07_IMPLEMENTATION_PHASES.md` | Sequenced delivery plan with acceptance criteria |
