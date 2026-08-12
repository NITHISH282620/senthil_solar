# 06 — Architecture Plan

Companion to `PROJECT_AUDIT.md`. Target technical architecture and the conventions that keep it coherent as 25 modules land.

---

## ⚠️ Prerequisite: verify against the bundled Next.js docs

`AGENTS.md` states that this Next.js build has breaking changes versus public documentation and that the relevant guide in `node_modules/next/dist/docs/` must be read before writing code.

**`node_modules` is currently empty, so that directory does not exist.** Every framework-level pattern in this document — Server Actions, caching directives, middleware, route handlers, `useActionState` — must be validated against the bundled docs immediately after `npm install` and before Phase 0 coding begins. Where this document and the bundled docs disagree, **the bundled docs win** and this document should be corrected.

Patterns below are marked **[verify]** where they depend on framework specifics most likely to have changed.

---

## 1. Keep / Change

| Decision | Verdict | Reasoning |
|---|---|---|
| Next.js App Router | **Keep** | Correctly used; route groups are clean |
| Server Actions as the only API | **Keep** | Right call for a single-client app. No REST layer to version or document |
| Supabase (Postgres + Auth + Storage) | **Keep** | RLS is the right security model; managed Postgres suits the team size |
| `@supabase/ssr` cookie handling | **Keep** | `src/lib/supabase/*` is correct as written |
| shadcn/ui + Tailwind v4 | **Keep** | 24 solid primitives already built |
| Zod validation | **Keep**, fix coercion | Sound choice, broken usage (BLOCKER-6) |
| Hand-written `types/database.ts` | **Replace** | Generate from the DB; it has already drifted |
| Role checks copy-pasted 23× | **Replace** | Single `requireRole()` helper |
| RLS via correlated subquery | **Replace** | `SECURITY DEFINER` claim functions |
| No service layer | **Add** | Actions are doing transport, auth, validation, business logic, and persistence at once |
| No caching | **Add** | Everything is dynamic today |
| No tests | **Add** | Non-negotiable before a schema migration of this size |

---

## 2. Layered Architecture

The current code collapses five concerns into each action function. Separate them:

```
┌──────────────────────────────────────────────────────────┐
│  PRESENTATION      app/**, components/**                 │
│  Server Components fetch · Client Components interact    │
├──────────────────────────────────────────────────────────┤
│  ACTIONS           actions/**                            │
│  auth guard → validate → call service → revalidate       │
│  Thin. No business logic. No direct queries.             │
├──────────────────────────────────────────────────────────┤
│  SERVICES          services/**                           │
│  Business rules. Payroll maths, GST split, stage         │
│  transitions, profitability. Pure and testable.          │
├──────────────────────────────────────────────────────────┤
│  DATA              repositories/**                       │
│  Query construction, pagination, embeds. One place per   │
│  entity where PostgREST syntax lives.                    │
├──────────────────────────────────────────────────────────┤
│  DATABASE          Postgres + RLS + triggers + views     │
│  Constraints, generated columns, roll-up views, audit    │
└──────────────────────────────────────────────────────────┘
```

**The rule that matters:** business logic goes in `services/`, and services take plain data in and return plain data out. `calculatePayroll(attendance[], employee, advances[]) → PayrollLine` is a pure function that can be unit-tested without a database. That is how payroll gets to be trustworthy.

### 2.1 Target directory structure

```
src/
├── actions/            thin server actions, one file per domain
├── services/           business logic — pure, unit-tested
│   ├── payroll/        calculate, allocate-to-sites, recover-advances
│   ├── billing/        gst-split, totals, overdue, ageing
│   ├── profitability/  site, contract, company roll-ups
│   ├── attendance/     geofence, day-fraction, overtime
│   └── inventory/      stock-on-hand, valuation, allocation
├── repositories/       data access, one file per entity
├── lib/
│   ├── supabase/       unchanged — this part is correct
│   ├── auth/           requireRole, requireSiteAccess, getSessionUser
│   ├── errors/         AppError taxonomy + user-safe messages
│   ├── validation/     schemas split per domain
│   ├── format/         currency, date (IST), number
│   └── constants/      generated from DB lookups
├── components/
│   ├── ui/             unchanged
│   ├── shared/         cross-domain
│   └── {domain}/       co-located feature components
├── types/
│   └── database.gen.ts GENERATED — never hand-edited
└── middleware.ts       auth + route-level RBAC
```

---

## 3. Core Patterns

### 3.1 Cached session — fixes S3

`getCurrentUser()` currently re-queries `profiles` on every call: layout, page, and each action, 3–6 identical round-trips per request.

```ts
// lib/auth/session.ts
import { cache } from "react";

export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("profiles")
    .select("id, full_name, email, role, is_active")
    .eq("id", user.id)
    .single();

  return data ?? null;
});
```

`cache()` deduplicates within a single request. One query per request instead of six. **[verify]** against bundled docs.

### 3.2 One authorization helper — replaces 23 copies

```ts
// lib/auth/guards.ts
export async function requireRole(...roles: Role[]): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new AppError("UNAUTHENTICATED", "Please sign in.");
  if (!user.is_active) throw new AppError("FORBIDDEN", "Account is inactive.");
  if (roles.length && !roles.includes(user.role))
    throw new AppError("FORBIDDEN", "You do not have access to this.");
  return user;
}

export async function requireSiteAccess(siteId: string): Promise<SessionUser> {
  const user = await requireRole();
  if (["owner", "manager", "accountant"].includes(user.role)) return user;
  const ok = await siteRepo.isAssigned(siteId, user.id);
  if (!ok) throw new AppError("FORBIDDEN", "You are not assigned to this site.");
  return user;
}
```

`requireSiteAccess` is what closes SEC-2 at the application layer, mirroring `auth_can_access_site()` in RLS. **Both layers enforce it** — RLS is the backstop, the guard gives a good error message.

### 3.3 Standard action shape

```ts
"use server";

export async function createSite(input: unknown): Promise<ActionResult<{ id: string }>> {
  return withAction(async () => {
    const user = await requireRole("owner", "manager");
    const data = createSiteSchema.parse(input);           // throws ZodError
    const site = await siteService.create(data, user);    // business logic
    revalidateTag(`contract:${data.contract_id}`);
    revalidateTag("sites");
    return { id: site.id };
  });
}
```

`withAction` is a single wrapper that catches `ZodError`, `AppError`, and `PostgrestError`, maps each to a user-safe message, logs the original with a correlation id, and returns the uniform `ActionResult`. This closes U11/SEC — raw Postgres errors stop reaching the browser.

```ts
type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; code: ErrorCode; fieldErrors?: Record<string,string> };
```

### 3.4 Validation — fixing BLOCKER-6

The one-line root cause and its fix:

```ts
// Before — parseFormData stringifies, z.number() rejects strings
total_amount: z.number().positive()

// After
total_amount: z.coerce.number().positive()
is_active:    z.coerce.boolean()
head_count:   z.coerce.number().int().min(1).optional()
```

Better still: **stop using `FormData` for complex forms.** Client components already hold typed state. Pass a typed object to the action and validate with the same schema on both sides. Keep `FormData` only for genuinely progressive-enhancement forms (login).

Schemas split per domain under `lib/validation/` and are the single source of truth shared by client form, server action, and inferred TypeScript type.

### 3.5 Repositories with mandatory pagination — fixes S1/S2

```ts
// repositories/sites.ts
export async function list(params: SiteListParams): Promise<Paginated<SiteRow>> {
  const { page = 1, pageSize = 25 } = params;
  const from = (page - 1) * pageSize;

  let q = supabase
    .from("sites")
    .select("id, site_code, name, stage, progress_percent, contract:contracts(title)",
            { count: "exact" })
    .is("deleted_at", null)
    .range(from, from + pageSize - 1);          // ← never optional

  if (params.contractId) q = q.eq("contract_id", params.contractId);
  if (params.stage)      q = q.eq("stage", params.stage);
  if (params.search)     q = q.ilike("name", `%${escapeLike(params.search)}%`);

  const { data, count, error } = await q;
  if (error) throw new RepositoryError(error);
  return { rows: data, total: count ?? 0, page, pageSize };
}
```

Rules: every list is paginated · every filter is applied in SQL, never in JS after fetch (fixes the `getProjects` anti-pattern) · `select()` names columns explicitly, never `*` · soft-delete filter is always present.

### 3.6 Caching

Nothing is cached today. Tag-based invalidation, keyed to the entity hierarchy: **[verify]**

| Data | Strategy |
|---|---|
| Company settings, lookups (stages, categories, roles) | Long-lived cache, tag-invalidated on settings change |
| Dashboard aggregates | 60s revalidate + tag invalidation on write |
| List pages | Tag-based (`sites`, `contracts`) |
| Detail pages | Entity tag (`site:{id}`) |
| Attendance today, notifications | No cache — always fresh |
| Reports | Cache by parameter hash, 5 min |

Writes invalidate the entity tag and its parents: saving a site invalidates `site:{id}`, `sites`, and `contract:{contractId}`.

### 3.7 Generated types

```json
// package.json
"db:types": "supabase gen types typescript --project-id $PROJECT_ID > src/types/database.gen.ts"
```

Run in CI; fail the build if the committed file differs from freshly generated output. This makes schema drift a build error instead of a runtime surprise — exactly the class of bug that produced BLOCKER-1 and Q2.

---

## 4. Security Architecture

Defence in depth, four layers. Every one is currently missing or flawed.

```
1. Middleware   authenticate + route-level RBAC     ← SEC-1: missing entirely
2. Action guard requireRole / requireSiteAccess     ← exists, copy-pasted, write-path only
3. RLS          auth_has_role / auth_can_access_site ← SEC-2/3: role-only, no site scope
4. Constraints  CHECK, FK, generated columns        ← partial
```

### 4.1 Route-level RBAC — closes SEC-1

```ts
// middleware.ts
const ROUTE_ACCESS: Array<[RegExp, Role[]]> = [
  [/^\/payroll/,    ["owner", "accountant"]],
  [/^\/invoices/,   ["owner", "manager", "accountant"]],
  [/^\/employees/,  ["owner", "manager"]],
  [/^\/settings/,   ["owner"]],
  [/^\/reports/,    ["owner", "manager", "accountant"]],
  [/^\/inventory/,  ["owner", "manager", "store_manager"]],
];
```

Role comes from a **JWT custom claim** set by a Supabase auth hook, not a database lookup — middleware runs on every request and must not query. The claim is refreshed on role change by forcing a token refresh.

### 4.2 Other security work

| Item | Action |
|---|---|
| Service-role key | **Rotate immediately** (SEC-4). Restrict `createAdminClient()` to auth-user creation only; add a lint rule banning its import outside `lib/auth/` |
| Storage | Commit bucket creation + RLS policies as migrations. Private buckets, signed URLs with short TTL |
| Audit | Generic trigger on all financial tables writing to `audit_logs`. No UPDATE/DELETE policy — append-only |
| Soft delete | `deleted_at` on every table; every read filters it; restore action for owner |
| Rate limiting | Login and password-reset throttling |
| Passwords | Minimum 10 characters |
| Search | Replace `sanitizeSearchInput` with proper `escapeLike()` + parameterised filters |

---

## 5. Testing

Zero tests today, and a large schema migration ahead. This is the highest-risk gap after the build blockers.

| Layer | Tool | Coverage target | What |
|---|---|---|---|
| Services | Vitest | **90%** | Payroll maths, GST split, profitability, geofence, advance recovery |
| Repositories | Vitest + test DB | 60% | Pagination, filters, soft-delete |
| Actions | Vitest | 70% | Auth guards, validation, error mapping |
| RLS | pgTAP / SQL | **100% of policies** | Each role × each table × each operation |
| E2E | Playwright | Critical paths | Login → contract → site → attendance → payroll → invoice → payment |

**The payroll service must reach 100% branch coverage before it touches real wages.** Every rule — daily vs monthly vs piece rate, overtime thresholds, half-days, paid leave, advance recovery, instalments, rounding — gets a test with a hand-computed expected value.

**RLS tests are equally non-negotiable.** A missing policy is invisible until it is a breach. `pgTAP` can assert "a `worker` cannot SELECT from `payroll_lines` belonging to another employee" as an executable test.

---

## 6. Data Integrity

Push invariants into the database wherever possible — the database is the only layer that cannot be bypassed.

| Invariant | Mechanism |
|---|---|
| Invoice totals correct | Generated columns |
| Advance never over-recovered | `CHECK (amount_recovered <= amount)` |
| PO never over-received | `CHECK (quantity_received <= quantity)` |
| GST mode consistent | `CHECK` — IGST xor CGST+SGST |
| One primary contact per company | Partial unique index |
| One attendance per employee/site/day | `UNIQUE` with `site_id NOT NULL` |
| Cost lineage always populated | `stamp_site_lineage()` trigger |
| Stage transitions recorded | Trigger writes `site_stage_history` |
| Attendance immutable after payroll | `is_locked` + policy |
| Nothing hard-deleted | `deleted_at` + revoked DELETE |

Multi-step writes (invoice + items, payroll run + lines + allocations) go through **Postgres functions**, so they are atomic. PostgREST cannot do multi-table transactions from the client; two sequential inserts from an action can leave an invoice with no line items. `createInvoice` has exactly this bug today.

---

## 7. Performance

| Concern | Approach |
|---|---|
| RLS overhead | `STABLE SECURITY DEFINER` functions instead of per-row subqueries |
| Aggregations | SQL views; materialised + `pg_cron` refresh past ~500 sites |
| List queries | Mandatory pagination, explicit columns, covering indexes |
| Search | `pg_trgm` GIN indexes instead of unbounded `ILIKE` |
| Session lookups | React `cache()` deduplication |
| Attendance volume | Partition by year past ~2M rows; schema is partition-ready |
| Images | Client-side compression, thumbnails in lists, `next/image` |
| Bundle | Server Components by default; `"use client"` only at genuine interaction boundaries |

**Budgets:** dashboard TTFB < 500 ms · list page < 800 ms · attendance save < 300 ms · payroll for 100 employees < 10 s · profitability report < 2 s.

---

## 8. Background Jobs

Several requirements need scheduled execution, which the app has no mechanism for today. Use **Supabase `pg_cron` + Edge Functions**.

| Job | Schedule | Purpose |
|---|---|---|
| Mark invoices overdue | Daily 00:30 IST | `due_date < today AND status IN ('sent','partially_paid')` |
| Missing-attendance alert | Daily 19:00 IST | Active sites with no attendance today |
| Low-stock alert | Daily 08:00 | `stock_on_hand < reorder_level` |
| Payment-due reminders | Daily 09:00 | Invoices due in 3 days |
| Contract-deadline alerts | Daily 09:00 | Deadlines within 7 days |
| Refresh materialised views | Every 15 min | Dashboard aggregates |
| Daily summary digest | Daily 20:00 | Per-site summary to owner |
| Backup verification | Daily | Confirm PITR is healthy |

---

## 9. Operations

**Currently absent: version control, CI, environments, deployment config, monitoring.**

| Item | Target |
|---|---|
| **Version control** | `git init` **before any other work**. Trunk-based with short-lived branches, conventional commits |
| CI | GitHub Actions: typecheck → lint → unit → RLS tests → build. Blocking |
| Environments | `local` (Supabase CLI) → `staging` → `production`, separate Supabase projects |
| Migrations | Supabase CLI only. **No more SQL-editor paste** — that is what caused BLOCKER-4 |
| Deployment | Vercel, preview per PR |
| Secrets | Platform env vars; `.env.local` never committed; documented rotation |
| Monitoring | Sentry for errors; Supabase dashboard for DB; uptime check on `/api/health` |
| Backups | Supabase PITR + weekly verified restore drill |
| Logging | Structured JSON with correlation ids; never log PII or amounts at info level |

### 9.1 Scripts to add

```json
{
  "typecheck": "tsc --noEmit",
  "test": "vitest run",
  "test:rls": "supabase test db",
  "e2e": "playwright test",
  "db:migrate": "supabase migration up",
  "db:types": "supabase gen types typescript --local > src/types/database.gen.ts",
  "db:reset": "supabase db reset",
  "verify": "npm run typecheck && npm run lint && npm run test"
}
```

### 9.2 Repository hygiene

Delete: `fix_migrations.js` (regex-rewrites migrations in place — actively dangerous), `test_signup.ts`, `seed_users.ts`, `verify_migration.ts`, `tsconfig.tsbuildinfo`. Replace `validate_env.ts` with a Zod-validated `lib/env.ts` that fails fast at boot. Rewrite the `create-next-app` boilerplate README as real project documentation.

---

## 10. Architectural Decisions

| # | Decision | Rationale | Rejected alternative |
|---|---|---|---|
| AD-1 | Server Actions, no REST | Single client, type-safe, less surface | tRPC — unnecessary indirection here |
| AD-2 | RLS as the security backstop | Cannot be bypassed by an application bug | App-only auth — one missed guard is a breach |
| AD-3 | `SECURITY DEFINER` claim functions | Fixes recursion and per-row cost together | Correlated subqueries — the current, broken approach |
| AD-4 | Denormalised cost lineage | Turns profitability into an index scan | Joins at query time — too slow at 1.8M rows |
| AD-5 | Append-only stock ledger | Auditable, reconstructible, no lost updates | Mutable `quantity_on_hand` counter |
| AD-6 | Pure service layer | Payroll maths must be unit-testable | Logic in actions — untestable, what exists now |
| AD-7 | Generated DB types | Drift becomes a build error | Hand-written types — already drifted (Q2) |
| AD-8 | Soft delete universally | Client requires it; enables Undo | Hard delete — irreversible in a financial system |
| AD-9 | Lookup tables over CHECK | Business extends statuses without migrations | CHECK constraints — a migration per new status |
| AD-10 | PWA, not native | One codebase, instant updates, no store | React Native — doubles the work for this team |
| AD-11 | Single-tenant now, tenant-ready schema | Avoid unused complexity, keep the door open | Full multi-tenancy — premature |
| AD-12 | Supabase over self-hosted | No DBA on the team | Self-hosted Postgres — operational burden |

---

## 11. Migration Approach

**Strangler pattern, not a big-bang rewrite.** The new hierarchy is built alongside the old, modules are cut over one at a time, and legacy tables are retired only after their replacement is verified in production.

```
Phase 0   Fix build · git init · squash migrations to a verified baseline
          Introduce services/, repositories/, guards, error handling
          Rotate keys · add CI · add tests for what exists

Phase 1+  Per module:
            new schema (forward migration)
            → repository → service → action → UI
            → backfill → verify → retire legacy table
```

Each module cutover is independently revertible. At no point is the system in a state where the client cannot use it — which matters, because they are running a live business on it.
