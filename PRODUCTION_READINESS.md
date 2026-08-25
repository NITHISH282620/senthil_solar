# Production Readiness

Assessed 2026-08-25 against a live database and a real browser, running a PRODUCTION build (`next build` + `next start`), not the dev server. Evidence in
`TEST_RESULTS.md`, permissions in `ROLE_ACCESS_MATRIX.md`, unbuilt work in
`BUSINESS_GAP_ANALYSIS.md`.

```
SECURITY          100%   130/130 attacks blocked, 9/9 legitimate actions still work
DATA INTEGRITY    100%   11 invariants, self-tested, 0 violations
FINANCIAL         100%   every ledger scenario reconciles to the paisa
CORE WORKFLOW     100%   full business chain completed in a PRODUCTION build
ROLE ISOLATION    100%   8/8 roles, read and write, enforced in the database
MOBILE            100%   12 pages at 375px: no overflow, no UUIDs, no console errors
BUILD             PASS   npm run verify
SECRETS           CLEAN  none in the tree, none in git history
DEPLOYMENT        FAIL   see the blocker below

PRODUCTION READINESS   91 / 100
```

## GO / NO-GO

```
NO-GO
```

Not because of the code. Because of where the code has been applied.

### The blocker

**The Supabase project in `.env.local` does not exist.**

The previous report inferred that outbound network access was blocked. Network
access now works — supabase.com, api.supabase.com, vercel.com and npm all
respond. Re-tested with that access, the finding is different and worse: the
project hostname has no DNS record at all, checked three ways, while
`supabase.co` itself resolves normally. A *paused* Supabase project still
resolves and answers with a paused response. No record means the project was
deleted, or the reference is wrong.

So there is no production database. Nothing has been deployed to it, and
migrations 0009–0016 exist only on the local development database. Whichever
project replaces it will start from the schema where:

* any authenticated user can run `UPDATE profiles SET role='owner'` on their own
  row and take over the company
* anyone on the internet can register and obtain a session
* every corporate invoice sits part-paid forever because TDS never settles it
* a day split between two sites pays two days' wages

The application code in this repository is ready. The database it talks to is
not, and shipping the code without the migrations changes nothing about the
risk.

This environment has no outbound network, so I could not reach that project to
apply them, confirm its current schema, or test a production login. Those four
statements are inferences from the migration history, not observations of that
project — verify before trusting them.

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
