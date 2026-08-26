# Production Readiness

Assessed 2026-08-25 against a live database and a real browser, running a PRODUCTION build (`next build` + `next start`), not the dev server. Evidence in
`TEST_RESULTS.md`, permissions in `ROLE_ACCESS_MATRIX.md`, unbuilt work in
`BUSINESS_GAP_ANALYSIS.md`.

Three tiers of evidence, never mixed:

* **LOCAL VERIFIED** — the development database and a production build served
  from this machine.
* **REHEARSAL VERIFIED** — a pristine database built only from the 16
  migrations, which is exactly the state production was in.
* **PRODUCTION VERIFIED** — the live Supabase project and the live Vercel
  deployment.

```
                          LOCAL      REHEARSAL   PRODUCTION
Supabase project active     —            —          PASS
Correct project targeted    —            —          PASS   znwvqdyrvtteirpjecfx
Migrations 16/16          PASS         PASS         NOT APPLIED  (0/16)
Schema: 48 tables         PASS         PASS         absent
RLS 130 blocked / 9 ok    PASS         PASS         not run (no db credentials)
Financial 11/11           PASS         PASS         not run (no db credentials)
Core workflow             PASS         PASS         not testable (no schema)
Storage bucket              —            —          FAIL   0 buckets
Public signup disabled    PASS         PASS         FAIL   still enabled
Vercel latest commit        —            —          PASS   e3aed79, Production
Production env vars         —            —          PARTIAL  secret key absent
Mobile 375/390/412        PASS           —          PASS   login page
Secrets                   PASS           —          PASS   incl. pushed history
Build                     PASS           —          PASS
```

## GO / NO-GO

```
NO-GO
```

Not because of the code. Because of where the code has been applied.

### The blockers

The Supabase project was **paused**, not deleted — resumed and verified live on
2026-08-26. The earlier "project does not exist" was wrong: a paused project
drops its DNS record and is indistinguishable from a deleted one from outside.

With it live, the real state is measurable, and it is four things:

1. **The production database is empty.** Zero of sixteen migrations applied —
   PostgREST reports every application table absent and `next_document_number`
   missing. Not "behind"; unmigrated.
2. **Public signup is enabled** on the project right now
   (`disable_signup: false`).
3. ~~The deployed code is 20 commits behind~~ **DONE** — 22 commits pushed and
   Vercel deployed `e3aed79` to Production successfully. `SUPABASE_SECRET_KEY`
   is still absent, so employee creation and deactivation cannot work.
4. **No storage bucket exists**, so document upload has nowhere to write.

Three of the four still cannot be done from here: applying migrations needs a
Supabase access token or the database password, and changing auth settings,
creating buckets and setting a Vercel variable all need dashboard access. This
machine has none of those. The code deployment was possible and has been done.

What *has* been done is the rehearsal. All 16 migrations were applied to a
pristine database — the same state production is in — and the full suite run
there: 130 attacks blocked, 9 legitimate operations allowed, 0 integrity
violations, the §9 money flow reconciling to the paisa and the §10 payroll
splitting 700/700 from a single 1,400 day. `scripts/go-live.sh` walks that
proven path.

### Minimum work to reach GO

Full procedure in `PRODUCTION_SETUP.md`. In short:

1. **Decide which Supabase project this is** — create one, or find the correct
   existing reference. This is step one; there is nothing to push to yet.
   ```bash
   npx supabase login && npx supabase projects list
   npx supabase link --project-ref <ref>
   npx supabase migration list      # compare before pushing
   npx supabase db push
   ```
   All 16 migrations have been proven to apply cleanly, in order, to a
   completely empty database, and the bootstrap path was verified there too:
   first account becomes the owner, an uninvited second account is refused, an
   invited one is created active with the intended role.

2. **Confirm they landed**, by running the three committed suites against
   production and requiring: 130 BLOCKED, 9 ALLOWED, 0 integrity violations.
   ```bash
   psql "$PROD_DB_URL" -f supabase/tests/authz_attacks.sql
   psql "$PROD_DB_URL" -f supabase/tests/integrity.sql
   ```

3. **Turn off signup in the Supabase dashboard** (Authentication → Providers →
   Email → "Allow new users to sign up"). `supabase/config.toml` now carries
   `enable_signup = false` for local and CI, and the database refuses
   uninvited accounts regardless — but the platform switch is the outer door.

4. **Set `SUPABASE_SECRET_KEY`** in the deployment environment. Employee
   creation and the deactivation ban both use the service-role client and fail
   without it.

5. **Confirm the owner account exists and is active** in production, and that
   `guard_last_owner` cannot be tripped — there must be at least one active
   owner before anyone else is invited.

Once 1–5 are done and step 2 passes against production, this is a GO.

## What is now safe

* **No path to privilege escalation.** Role, pay, employment status, banking and
  KYC are owner-only, enforced by trigger because RLS cannot express a column
  restriction. 130 attack assertions, all blocked, re-run after every change.
* **No account exists that the owner did not ask for.** Enforced in the database
  by an invitation the owner must write first, not only by a platform setting.
* **The owner cannot be locked out.** The last active owner cannot be demoted,
  deactivated or deleted.
* **A leaver is turned away at the door.** Deactivation bans the auth account and
  `getCurrentUser` refuses a dormant profile.
* **Field staff cannot see money** — not company financials, not other people's
  pay, and not the contract value or margin of the site they stand on.
* **History cannot be rewritten.** `audit_logs`, `site_events` and `stock_ledger`
  have no UPDATE or DELETE policy for anyone, the owner included.
* **The books reconcile**, and say so continuously: `v_integrity_check` is one
  query over eleven invariants, and its own test proves it catches violations
  rather than being vacuously empty.
* **Money cannot be recorded twice** by a retry, a refresh or a lost response.

## Score, honestly

| Area | Score | Why not full marks |
|---|:--:|---|
| Authorisation | 20/20 | — |
| Money correctness | 20/20 | — |
| Data integrity | 10/10 | — |
| Attendance and payroll | 19/20 | No payroll reopening; piece-rate pays zero by design. |
| Operational completeness | 12/20 | Inventory, payables, client portal and notifications do not exist. Bank accounts and client credit now do. |
| Deployment safety | 5/10 | The target project does not exist. No CI runs the suites. |

The 12 points missing from operational completeness are not defects. They are
`BUSINESS_GAP_ANALYSIS.md` — work that has not been built, ranked by what it
would be worth. The largest is payables.

## Before the first real rupee

1. Set the company's **GST state code** in Settings. It decides CGST+SGST against
   IGST on every invoice; unset, the system falls back to intra-state, which is
   wrong for every out-of-state client and produces an unfilable GSTR-1.
2. Set each employee's **pay basis and rate**. Payroll reads them straight from
   the profile; an employee created without them earns zero, silently.
3. Create at least one **bank account** if money will move by transfer — the cash
   book refuses a `bank` entry without one.
4. Decide who holds **accountant**. Accountant can reverse payments and void cash
   entries; manager cannot.

## Running the checks

```bash
npm run verify

Q="docker exec -i supabase_db_senthil-solar psql -U postgres -d postgres"
$Q < supabase/tests/seed_roles.sql
$Q < supabase/tests/rls_matrix.sql      # site_revenue must be 0 for field roles
$Q < supabase/tests/authz_attacks.sql   # 130 BLOCKED, 9 ALLOWED
$Q < supabase/tests/integrity.sql       # part 1 empty, part 2 catches all four
$Q < supabase/tests/idempotency.sql     # run WITHOUT ON_ERROR_STOP
```

None of these run in CI yet. They should.
