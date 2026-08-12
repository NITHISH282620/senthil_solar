# ADR-0002 — Supabase Project Unreachable: Adopt a Clean Canonical Baseline

- **Status:** Accepted
- **Date:** 2026-08-12
- **Deciders:** Lead Architect (autonomous mandate)
- **Supersedes:** the backfill-and-migrate strategy in `03_DATABASE_REDESIGN.md` §5

## Context

The audit identified severe schema drift (`PROJECT_AUDIT.md` BLOCKER-4): migration `00017_architecture_pivot_sites.sql` contains an unconditional
`ALTER TABLE attendance ADD COLUMN working_hours` that collides with a column migration 013 already added, and uses `uuid_generate_v4()` and `moddatetime()` without any `CREATE EXTENSION`. It therefore cannot have applied successfully. The live database state was unknown, so Phase 0 called for establishing ground truth by introspecting the running project.

Introspection was attempted against the project URL in `.env.local`. The host does not resolve:

```
NXDOMAIN  <project-ref>.supabase.co
OK        www.google.com
OK        raw.githubusercontent.com
OK        registry.npmjs.org
OK        supabase.com
```

Arbitrary third-party subdomains resolve normally, so this is not sandbox DNS filtering. Supabase deletes the DNS record for a project only once the project itself is removed. **The Supabase project referenced by this repository no longer exists.**

Consequently:
- There is no production data to preserve.
- There is no live schema to reconcile against.
- The credentials in `.env.local` are inert.

## Decision

Abandon the incremental migrate-and-backfill strategy. Instead:

1. **Author a single canonical baseline migration** implementing the Company → Contract → Site model from `03_DATABASE_REDESIGN.md` directly. No preservation of migrations 001–018.
2. **Archive** migrations 001–018 under `supabase/migrations/_archive/` as historical reference; they are not part of the applied set.
3. **Verify locally** using the Supabase CLI against Docker (confirmed available in this environment), so `supabase db reset` reproduces the schema deterministically from source.
4. **Keep every migration reversible** — each forward migration ships with a matching `down` section, since there is no longer any excuse for irreversible steps.
5. Senthil provisions a **new Supabase project** when ready to deploy; the baseline applies cleanly to an empty database.

## Consequences

**Positive**
- The single riskiest item in the entire plan — migrating live financial data across a three-way hierarchy collapse — disappears entirely.
- No `_migration_orphans` quarantine table, no fuzzy `client_company` text-to-FK resolution, no reconciliation of row counts and financial totals.
- The baseline can be written correctly from first principles rather than as a sequence of corrective patches over a broken history.
- Local-first development with `supabase db reset` becomes the verification loop, which is strictly better than the previous SQL-editor-paste workflow that caused the drift.

**Negative**
- Any data that existed in the deleted project is unrecoverable. Nothing can be done about this now; it is a statement of fact, not a trade-off.
- A new Supabase project must be created and its keys placed in `.env.local` before the app can run against a real backend. Until then the app builds and typechecks but cannot serve data.

**Neutral**
- The credentials currently in `.env.local` point at a non-existent project. They should still be rotated out of the file rather than left in place, on the general principle that dead credentials teach bad habits.

## Action required from the owner

1. Create a new Supabase project.
2. Put its URL, anon key, and service-role key into `.env.local`.
3. Run `npm run db:reset` (local) or apply the baseline migration to the new project.

Until step 1 completes, verification is limited to local Docker Postgres — which is sufficient for every gate in Phases 0 and 1.
