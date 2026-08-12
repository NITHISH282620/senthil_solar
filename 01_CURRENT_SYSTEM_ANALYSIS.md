# 01 — Current System Analysis

Companion to `PROJECT_AUDIT.md`. This document is the factual inventory: what exists, where it lives, and how it connects. Judgements and recommendations live in the other documents.

---

## 1. Stack

| Layer | Technology | Version | Notes |
|---|---|---|---|
| Framework | Next.js | 16.2.10 | App Router, route groups, Server Actions |
| Runtime | React | 19.2.4 | Server Components by default |
| Language | TypeScript | ^5 | `strict` per `tsconfig.json` |
| Database | Supabase (Postgres) | — | 18 SQL migrations, RLS on all tables |
| Auth | Supabase Auth | `@supabase/ssr` ^0.12.0 | Cookie-based SSR sessions |
| Styling | Tailwind CSS | v4 | via `@tailwindcss/postcss` |
| Components | shadcn/ui + Radix + Base UI | — | 24 primitives in `src/components/ui/` |
| Forms | react-hook-form + Zod | ^7.80 / ^4.4.3 | Zod also used server-side |
| Charts | recharts | ^3.9.2 | **installed, zero usage** |
| URL state | nuqs | ^2.9.0 | used on list pages |
| Toasts | sonner | ^2.0.7 | |
| Dates | date-fns | ^4.4.0 | |
| Icons | lucide-react | ^1.23.0 | |
| Command palette | cmdk | ^1.1.1 | **installed, `command.tsx` exists, zero usage** |

**`node_modules` is empty.** Dependencies are not installed; nothing can currently be built. `AGENTS.md` requires reading `node_modules/next/dist/docs/` before writing code — that path does not exist until `npm install` is run.

**No version control.** The working directory is not a git repository.

---

## 2. Directory Map

```
src/
├── actions/              11 files — the entire API surface (Server Actions)
│   ├── attendance.ts     attendance + leave requests
│   ├── auth.ts           login/logout/reset + getCurrentUser()
│   ├── customers.ts      v1 CRM
│   ├── documents.ts      Supabase Storage upload/delete + audit
│   ├── employees.ts      profile CRUD (uses service-role for creation)
│   ├── expenses.ts       expense claims + approval
│   ├── invoices.ts       invoices, items, payments
│   ├── projects.ts       v2 project CRUD + assignments
│   ├── quotations.ts     v1 quotations
│   ├── settings.ts       company settings
│   └── work-orders.ts    v1 work orders
│
├── app/
│   ├── (auth)/           login, forgot-password
│   ├── (dashboard)/      12 route folders
│   ├── auth/callback     PKCE exchange
│   ├── auth/logout       route handler
│   ├── layout.tsx        root
│   └── page.tsx          redirects
│
├── components/
│   ├── forms/            8 form components
│   ├── layout/           dashboard-shell, header, sidebar
│   ├── shared/           13 domain components
│   └── ui/               24 shadcn primitives
│
├── lib/
│   ├── supabase/         server, client, middleware, admin
│   ├── constants.ts      enums + labels + colours
│   ├── format.ts         currency, date, number formatting
│   ├── utils.ts          cn()
│   └── validations.ts    23 Zod schemas + parseFormData()
│
├── types/database.ts     606 lines, hand-written
└── middleware.ts         auth-only gate

supabase/migrations/      18 .sql files
```

**Root-level scripts** (all committed, none referenced by `package.json`): `fix_migrations.js`, `seed_users.ts`, `test_signup.ts`, `validate_env.ts`, `verify_migration.ts`. Plus a committed `tsconfig.tsbuildinfo` (293 KB).

---

## 3. Database Schema — Full Inventory

25 tables across 18 migrations.

### 3.1 Identity and configuration

**`profiles`** (m001, extended m006/m012) — extends `auth.users`
`id` (PK → auth.users), `employee_id` (unique), `full_name`, `email`, `phone`, `role`, `department`, `designation`, `date_of_joining`, `salary`, `bank_account_no`, `bank_ifsc`, `bank_name`, `aadhar_number`, `emergency_contact_*`, `address`, `avatar_url`, `is_active`, `manager_id` (self-FK), `employee_type`, `daily_rate`, `ot_rate_per_hour`, `monthly_salary`, timestamps.

- `role ∈ {admin, manager, supervisor, employee}` (m012 widened from 3 to 4)
- Both `salary` and `monthly_salary` exist — m012 added the latter and copied values, but never dropped the former. Application code writes `salary`; forms collect `monthly_salary`.
- No PAN, no PF/ESI, no trade/skill classification, no leaving date, no photo.

**`company_settings`** (m002, extended m016) — single seeded row
Branding, GST/PAN, bank, five number prefixes, `tax_rate`, `shift_start_time`, `shift_end_time`, `ot_after_hours`, `financial_year_start_month`, `default_geofence_radius`.

**`sequences`** (m003) — `name` (PK), `current_value`
Seeded with `employee, customer, quotation, work_order, invoice, expense`; m011 adds `project_code`, m016 adds `submission_code`. Driven by `next_sequence(seq_name, prefix)` — **broken, see PROJECT_AUDIT BLOCKER-3**.

### 3.2 Generation 1 — Retail CRM (migrations 004–010)

**`customers`** — `customer_id` (unique), name, email, phone, alternate_phone, address, city/state/pincode, `gst_number`, `source`, `assigned_to`, `status ∈ {active,inactive,prospect}`, notes, created_by.

**`quotations`** / **`quotation_items`** — quotation_number, `customer_id`, title, `system_capacity_kw`, `panel_type`, `inverter_type`, subtotal/tax/discount/total, `status ∈ {draft,sent,approved,rejected,expired,converted}`, valid_until, approved_by. Items: description, unit, quantity, unit_price, total_price, sort_order.

**`work_orders`** / **`work_order_assignments`** / **`work_order_updates`** — work_order_number, customer_id, quotation_id, type, priority, `status ∈ {pending,scheduled,in_progress,on_hold,completed,cancelled}`, scheduled_date, started_at, completed_at, site_address, site_lat/lng, estimated/actual hours.

**`invoices`** / **`invoice_items`** / **`payments`** — invoice_number, customer_id, **work_order_id, quotation_id, and (m015) project_id** — three optional parents. subtotal/tax/discount/total/amount_paid, `balance_due` GENERATED, `status ∈ {draft,sent,partially_paid,paid,overdue,cancelled}`, due_date. m015 adds billing period, `tds_deducted`, `net_receivable`. Payments: amount, method, date, reference, received_by, `tds_on_payment`.

**`expenses`** / **`expense_items`** — expense_number, employee_id, category, title, total_amount, status, `work_order_id`, approved_by/at, receipt_url. m015 adds `project_id` (renamed `site_id` in m017), `date`, `head_count`, `meal_type`, `rejection_reason`, and rewrites the category CHECK to the 10 field-ops categories.

**`attendance`** (m009, heavily extended m013/m017) — employee_id, date, check_in, check_out, `status ∈ {present,absent,half_day,leave,holiday}`, `location_lat/lng` (legacy), notes. m013 adds `project_id`, `check_in_gps_lat/lng`, `check_in_photo_url`, `check_out_gps_lat/lng`, `working_hours`, `overtime_hours`, `is_late`, `marked_by`, `is_offline_entry`, `is_manually_corrected`, `correction_reason`. m017 renames `project_id`→`site_id` and re-adds `working_hours` (**collision — see BLOCKER-4**).

**`leave_requests`** — employee_id, leave_type, from/to date, reason, status, approved_by.

**`documents`** — name, file_url, file_type, file_size, category, `entity_type` + `entity_id` (polymorphic, unenforced), uploaded_by.

**`audit_logs`** — user_id, `action ∈ {document_upload, document_delete, other}`, entity_type, entity_id, `details` JSONB.

**`handle_new_user()`** (m010) — `SECURITY DEFINER` trigger on `auth.users` insert. First user becomes `admin`; everyone else `employee`. Correctly written.

### 3.3 Generation 2 — Field Operations (migrations 011–016)

**`projects`** / **`project_assignments`** (→ renamed `site_assignments` in m017) / **`project_documents`**
`project_code`, name, **`client_company` (TEXT — not a FK)**, client contact fields, district, site address/GPS/geofence, scope, `rate_type ∈ {per_unit,per_day,lump_sum}`, `rate_amount`, `rate_unit`, dates, progress, `status ∈ {not_started,in_progress,completed,billed,closed}`, `total_workers_required`. m017 **drops** district, site_address, site_gps_*, geofence, all dates, progress, and total_workers_required — moving them to `sites`.

**`work_logs`** / **`work_log_photos`** (m014) — daily proof-of-work per project/site: description, category, workers present, materials used, problems, weather, remarks; `UNIQUE(project_id, date)`. m017 renames to `site_id` and adds `status ∈ {draft,submitted,approved,locked}`.

**`salary_advances`** (m015) — employee_id, project_id, amount, date, reason, given_by, `status ∈ {pending,partially_deducted,fully_deducted}`, `amount_deducted`, `deducted_in_payroll_id` (FK to payroll).

**`payroll`** (m015) — employee_id, month, year, present_days, overtime_hours, daily_rate_used, ot_rate_used, gross_salary, total_advance_deduction, other_deductions, bonus, net_salary, is_paid, paid_date/method/reference; `UNIQUE(employee_id, month, year)`.

**`submissions`** (m015) — client-reporting bundles: project, period, include-flags, invoice_id, cover_note, file_url, format, submitted flags.

### 3.4 Generation 3 — Site pivot (migrations 017–018)

**`sites`** (m017) — project_id (FK, cascade), name, district, address, gps_lat/lng, total_workers_required, start/expected_end/actual_end dates, progress_percent, `status VARCHAR(50) DEFAULT 'planning'` (**no CHECK constraint — any string accepted**).

**`cash_transfers`** (m018) — petty-cash ledger: from_user_id, to_user_id, amount, date, `transaction_type ∈ {advance,settlement,return,adjustment}`, polymorphic `reference_type`/`reference_id`, notes.

### 3.5 Tables with zero application code

Verified by enumerating every `.from("…")` call in `src/`:

`sites` · `site_assignments` · `cash_transfers` · `payroll` · `salary_advances` · `submissions` · `work_logs` · `work_log_photos`

Eight tables. Zod schemas exist for `payroll`, `salary_advances`, `work_logs`, and `submissions` — the intent was recorded, the implementation never happened.

### 3.6 Actual query distribution

| Table | `.from()` calls | Table | `.from()` calls |
|---|---|---|---|
| profiles | 11 | company_settings | 3 |
| quotations | 7 | work_order_assignments | 2 |
| invoices | 6 | project_assignments | 2 |
| work_orders | 5 | work_order_updates | 1 |
| customers | 5 | payments | 1 |
| attendance | 5 | invoice_items | 1 |
| quotation_items | 4 | expense_items | 1 |
| projects | 4 | audit_logs | 1 |
| expenses | 4 | *(8 tables)* | **0** |
| documents | 4 | | |
| leave_requests | 3 | | |

---

## 4. Authentication and Authorization

### 4.1 Flow

1. `src/middleware.ts` matches all paths except static assets, delegates to `updateSession()`.
2. `src/lib/supabase/middleware.ts` creates an SSR client, calls `supabase.auth.getUser()` (correct — validates the JWT rather than trusting the cookie), then routes:
   - no user + not an auth route + not root → `/login`
   - root → `/dashboard` or `/login`
   - user + auth route → `/dashboard`
3. `(dashboard)/layout.tsx` calls `getCurrentUser()`; redirects to `/login` if null.
4. `getCurrentUser()` (`actions/auth.ts`) calls `auth.getUser()` then `SELECT * FROM profiles WHERE id = user.id`. If no profile row, redirects to `/unauthorized`.

### 4.2 Authorization model — three layers, one of them real

| Layer | Mechanism | Effective? |
|---|---|---|
| **Middleware** | Authentication only | **No role checks at all** |
| **Sidebar** | `navItems[].roles.includes(user.role)` | Cosmetic — hides links, does not block routes |
| **Server Actions** | `if (!currentUser \|\| !["admin","manager"].includes(currentUser.role))` — 23 occurrences | Real, but **write-path only** |
| **RLS** | 40+ policies | Real, but flawed (see PROJECT_AUDIT §4.2) |

**Gap:** no page-level read guard. Navigating directly to `/employees`, `/billing`, or `/settings` as an `employee` renders the page. Whether data appears depends entirely on whether that table's RLS SELECT policy happens to be restrictive — and most are `USING (auth.uid() IS NOT NULL)`, i.e. open to all authenticated users.

### 4.3 Roles

Four roles exist: `admin`, `manager`, `supervisor`, `employee`. The client's brief requires eight: Owner, Manager, Accountant, Engineer, Supervisor, Store Manager, Worker, Customer.

`supervisor` is defined in the CHECK constraint and referenced in three RLS policies, but those policies check only that the user *has* the supervisor role — never that they are assigned to the site in question. There is no `accountant`, `engineer`, `store_manager`, or customer-portal role.

---

## 5. Application Workflows — As Implemented

### 5.1 Working end-to-end (v1, but unreachable from the UI)

**Customer → Quotation → Work Order → Invoice → Payment**
All four modules have list, detail, new, and edit pages plus complete actions. `work-order-kanban.tsx` and `work-order-timeline.tsx` are genuinely nice components. The invoice module has a print view (`billing/[id]/print/`).

Blocked by: BLOCKER-1 (quotation/work-order/customer schemas missing), BLOCKER-3 (numbering returns NULL), BLOCKER-6 (numeric form fields), and the sidebar not linking to any of them.

### 5.2 Partially implemented (v2)

**Project management** — CRUD + employee assignment work in shape, but `getProjects()` filters on `project_assignments` (renamed to `site_assignments` in m017) and on `projects.district` (dropped in m017). Both queries now reference non-existent objects.

**Attendance** — self check-in/check-out and admin status override exist. Broken by BLOCKER-5 (upsert constraint), writes to legacy GPS columns, has no site linkage, no batch marking, no geofence check, no photo capture.

**Expenses** — submit + approve/reject works in shape. But `createExpense` reads `parsed.data.items` while `expenseSchema` defines no `items` field and *does* require `project_id`, `date`, and `total_amount` — which the form never sends. Guaranteed validation failure.

**Documents** — Supabase Storage upload/delete with audit logging. The only place `audit_logs` is written.

### 5.3 Not implemented at all

Payroll · salary advances · work logs · site management · cash transfers · client submissions · reports · notifications · materials · purchase orders · vendors · profitability · cash flow · dashboards with real data.

---

## 6. API Design

There is no REST or GraphQL layer. **All server communication is via Next.js Server Actions** in `src/actions/`. This is a deliberate and good choice.

**Conventions observed:**
- Every file starts `"use server"`.
- Reads return `{ data: T | null, error: string | null }`.
- Writes return `{ error: string | null }`, sometimes `{ data: {...}, error }`.
- Auth check first, Zod parse second, query third, `revalidatePath()` last.
- Related data fetched via PostgREST embedding with explicit FK hints: `customer:customers!invoices_customer_id_fkey(...)`.

**Problems:**
- No shared `requireRole()` helper — the same 3-line guard is copy-pasted 23 times.
- No shared sequence-generation helper — copy-pasted 4 times, broken identically in all 4.
- No pagination parameters on any list action.
- `revalidatePath()` calls are inconsistent — some actions revalidate the list but not the detail page.
- No `useActionState`/`useOptimistic`; forms manage loading with `useState` and call actions imperatively.
- Errors are returned as raw `error.message` from Postgres, which leaks schema details to the client.

---

## 7. UI Inventory

### 7.1 Routes

| Route | Pages | Reachable from sidebar? |
|---|---|---|
| `/dashboard` | 1 | ✅ |
| `/projects` | list, new, `[id]`, `[id]/edit` | ✅ |
| `/attendance` | list, `my-attendance`, `leaves` | ✅ |
| `/expenses` | list, new, `[id]` | ✅ |
| `/billing` | list, new, `[id]`, `[id]/print` | ✅ (admin/manager) |
| `/employees` | list, new, `[id]`, `[id]/edit` | ✅ (admin/manager) |
| `/settings` | 1 | ✅ (admin) |
| `/customers` | list, new, `[id]`, `[id]/edit` | ❌ **orphaned** |
| `/quotations` | list, new, `[id]`, `[id]/edit` | ❌ **orphaned** |
| `/work-orders` | list, new, `[id]`, `[id]/edit` | ❌ **orphaned** |
| `/documents` | **does not exist** | ⚠️ sidebar links here → 404 |
| `/reports` | **does not exist** | ⚠️ sidebar links here → 404 |
| `/unauthorized` | 1 | n/a |

### 7.2 Shell

`dashboard-shell.tsx` composes `sidebar.tsx` + `header.tsx`. The sidebar is a fixed-width column (264px expanded, 68px collapsed) with a collapse toggle and tooltips. **There is no mobile treatment** — no `Sheet`-based drawer, no bottom tab bar, no responsive breakpoint switch, despite `sheet.tsx` being available.

### 7.3 Components

- **`ui/`** — 24 shadcn primitives. Complete and consistent. `command.tsx`, `calendar.tsx`, `progress.tsx`, `switch.tsx`, `checkbox.tsx` are present; `command.tsx` is unused.
- **`forms/`** — 8 forms, all client components using controlled `useState` + `<form action={handler}>`. All affected by BLOCKER-6.
- **`shared/`** — `stat-card`, `status-badge`, `page-header`, `empty-state`, `document-vault`, `payment-modal`, `assignment-modal`, `work-order-kanban`, `work-order-timeline`, `expense-actions`, `quotation-actions`, plus two `*-wrapper` client boundaries.

### 7.4 Missing infrastructure

Zero `loading.tsx`, `error.tsx`, and `not-found.tsx` files across the entire `src/app` tree. No Suspense boundaries. No PWA manifest, no service worker, no offline handling.

---

## 8. Business Logic Locations

| Logic | Where it lives | Correctness |
|---|---|---|
| Invoice totals | `actions/invoices.ts` `createInvoice()` | subtotal → less discount → tax on net → total. Correct, but duplicated in quotations |
| `balance_due` | Postgres GENERATED column | Correct |
| `amount_paid` | `update_invoice_payment_status()` trigger **and** `recordPayment()` | Duplicated, racy |
| Invoice status transitions | `recordPayment()` in JS | Reads pre-trigger state |
| Expense totals | `createExpense()` sums items | Sound, but the schema has no items array |
| Attendance status | Hardcoded `'present'` on check-in | No half-day, OT, or geofence logic |
| Payroll | **nowhere** | Not implemented |
| Advance recovery | **nowhere** | Not implemented |
| Profitability | **nowhere** | Not implemented |
| Overdue detection | **nowhere** | No job compares `due_date` to today |
| GST split (CGST/SGST/IGST) | **nowhere** | Single `tax_percent` only |
| Number sequences | `next_sequence()` SQL function | Broken (BLOCKER-3) |
| "Today" | `new Date().toISOString().split("T")[0]` × 6 | **UTC — wrong for IST after 17:30** |

---

## 9. Configuration

**`.env` variables:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_APP_URL`. `.env.local` exists in the working tree; `.gitignore` lists it, but with no git repository there is no history to verify against.

**`next.config.ts`** — minimal (280 bytes).
**`components.json`** — shadcn config.
**`eslint.config.mjs`** — `eslint-config-next` defaults; `npm run lint` has no `--max-warnings` gate.
**`package.json` scripts** — `dev`, `build`, `start`, `lint`. No `test`, no `typecheck`, no `db:migrate`, no `db:types`.

There is no CI, no Dockerfile, no deployment configuration, and no documented migration runner — migrations appear to have been applied by pasting into the Supabase SQL editor, which explains the drift described in BLOCKER-4.

---

## 10. Summary Metrics

| Metric | Value |
|---|---|
| Source files | 135 |
| Server Actions files | 11 |
| Pages | 30 |
| React components | 45 (24 primitives + 21 domain) |
| SQL migrations | 18 |
| Database tables | 25 |
| Tables with zero code | 8 |
| RLS policies | 40+ |
| Zod schemas defined | 23 |
| Zod schemas imported but missing | 10 |
| Duplicated role-check blocks | 23 (TS) + 40+ (SQL) |
| Tests | 0 |
| `loading`/`error`/`not-found` boundaries | 0 |
| Business modules required by client | 25 |
| Business modules substantially complete | 3 |
