# ADR-0002 — No Existing Database State: Adopt a Clean Canonical Baseline

- **Status:** Accepted (revised 2026-08-12 after direct verification)
- **Date:** 2026-08-12
- **Deciders:** Lead Architect (autonomous mandate)
- **Supersedes:** the backfill-and-migrate strategy in `03_DATABASE_REDESIGN.md` §5

## Correction to the first revision of this ADR

The first version of this document asserted that the Supabase project had been
**deleted**, based on its hostname returning `NXDOMAIN` across repeated attempts
while unrelated third-party domains resolved normally.

**That conclusion was wrong.** The project exists. It was almost certainly
*paused* — Supabase suspends idle free-tier projects and withdraws their DNS
record, which is indistinguishable from deletion by DNS alone. Signing in to the
dashboard restored it, and the host now resolves and serves HTTP.

The decision below is unchanged, but it now rests on verified evidence rather
than an incorrect inference. The distinction matters: "deleted" and "empty"
imply very different risks, and only one of them was true.

## Context

The audit identified severe schema drift (`PROJECT_AUDIT.md` BLOCKER-4).
Migration `00017_architecture_pivot_sites.sql` contains an unconditional
`ALTER TABLE attendance ADD COLUMN working_hours` colliding with a column
migration 013 already added, and uses `uuid_generate_v4()` and `moddatetime()`
with no `CREATE EXTENSION`. It cannot have applied cleanly.

Two Supabase projects are now in play:

| Project | Status |
|---|---|
| `hebgjskikjfbfdkesxaq` (original) | Alive, responds to REST |
| `znwvqdyrvtteirpjecfx` (newly created by the owner) | Alive |

The original project was probed for all 27 tables defined across migrations
001–018, using its publishable key:

```
EXISTS  (0)
MISSING (27): profiles, company_settings, sequences, customers, quotations,
              quotation_items, work_orders, invoices, invoice_items, payments,
              expenses, expense_items, attendance, leave_requests, documents,
              audit_logs, projects, project_assignments, project_documents,
              work_logs, work_log_photos, salary_advances, payroll,
              submissions, sites, site_assignments, cash_transfers
```

Every table returns PostgREST `PGRST205` — the relation does not exist. **The
migrations were never applied to this project.** There is no schema and no data.

## Decision

Abandon the incremental migrate-and-backfill strategy:

1. **Author a single canonical baseline migration** implementing the
   Company → Contract → Site model from `03_DATABASE_REDESIGN.md` directly.
2. **Archive** migrations 001–018 under `supabase/migrations/_archive/` as
   historical reference. They are not part of the applied set and never were.
3. **Verify locally** with the Supabase CLI against Docker (confirmed available),
   so `supabase db reset` reproduces the schema deterministically from source.
4. **Keep every migration reversible** — each forward migration ships with a
   matching down section.
5. Target the **new project** (`znwvqdyrvtteirpjecfx`). Both are empty, so the
   choice is arbitrary on technical grounds; the new one is the owner's active
   workspace and avoids confusion with stale credentials.

## Consequences

**Positive**
- The riskiest item in the plan — migrating live financial data across a
  three-way hierarchy collapse — does not exist. No `_migration_orphans`
  quarantine, no fuzzy `client_company` text-to-FK resolution, no financial
  reconciliation.
- The baseline is written correctly from first principles rather than as
  corrective patches over a broken history.
- Local-first development via `supabase db reset` replaces the SQL-editor-paste
  workflow that produced the drift.

**Negative**
- None material. There was no data to lose.

**Neutral**
- The original project can be deleted once the new one is confirmed working,
  removing the ambiguity of two live projects with similar names.

## Verification method (for future reference)

DNS resolution alone is **not** sufficient evidence about a Supabase project's
existence, because paused projects lose their DNS record. To determine real
state, probe the REST endpoint for known tables and inspect the error codes:

- `PGRST205` / "does not exist" → table absent
- `401` with "No API key found" → project alive, key missing
- `401` with "Secret API key required" → project alive, endpoint needs the
  secret key (the OpenAPI root does; table endpoints accept the publishable key)

## Action required from the owner

1. Use the new project's URL and keys (see `/setup-required` in the running app
   for the exact variable names).
2. Apply the Phase 1 baseline migration once authored.
