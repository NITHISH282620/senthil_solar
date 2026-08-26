# Production Setup

The exact procedure to put Sentil Solar Ops into production. No secrets appear
in this file and none should be added to it.

Written after the application was verified against a real database and a real
browser, and after the hosted project itself was inspected directly — see
"Verified production state".

---

## Verified production state (2026-08-26)

The project was **paused**, not deleted. It has been resumed and is live. An
earlier report concluded it did not exist; that was wrong — a paused Supabase
project drops its DNS record, which is indistinguishable from a deleted one
from outside. Corrected here.

Measured directly against the resumed project:

| | State |
|---|---|
| Project | **exists, active** — `znwvqdyrvtteirpjecfx` |
| Auth endpoint | live, GoTrue v2.195.0 |
| Storage endpoint | live, **0 buckets** |
| Database schema | **empty — 0 of 16 migrations applied.** PostgREST reports every application table absent, and `next_document_number` missing |
| Existing business data | none found through the API — nothing to protect, and nothing to lose |
| Public signup | **ENABLED** (`disable_signup: false`) |
| `SUPABASE_SECRET_KEY` | **not set** in `.env.local` |
| Vercel | **deployed and live** at `senthil-solar.vercel.app`, `NEXT_PUBLIC_*` configured |
| Deployed code | **20 commits behind**, predating every fix from all three hardening passes |

So production is a working deployment of the original code, pointed at an empty
database, with the signup door open. Nobody can use it — there is no `profiles`
table for a session to resolve against — and it would be unsafe the moment a
schema appeared underneath the old code.

The whole of this has been rehearsed: all 16 migrations were applied to a
pristine database and the full suite run there — 130 attacks blocked, 9
legitimate operations allowed, 0 integrity violations, and the §9 and §10
money and payroll flows reconciling exactly. Production is in that same
pristine state, so `scripts/go-live.sh` walks a path already proven.

Run it:

```bash
./scripts/go-live.sh
```

It links to the existing project, backs up first, shows you the migration list
and waits for confirmation, pushes, then verifies. Four things follow that no
script can do: turn signup off, create the storage bucket, set
`SUPABASE_SECRET_KEY` on Vercel, and push the code.

## 1. Supabase project

**The project already exists. Do not create another.**

```bash
npx supabase login                       # opens a browser for the access token
npx supabase link --project-ref znwvqdyrvtteirpjecfx
```

If it ever pauses again (free tier pauses on inactivity), the symptom is exactly
what was seen here: DNS stops resolving and every check reports the project
missing. Resume it in the dashboard rather than concluding it is gone.

## 2. Migrations

Sixteen migrations, `20260812000100` through `20260824000800`. They have been
verified to apply **in order, cleanly, to a completely empty database**, so a
new project takes all sixteen and an existing one takes whatever it is missing.

```bash
npx supabase migration list              # compare local against remote FIRST
```

Read that output before doing anything else. Three cases:

* **Remote is empty or behind** — apply the missing ones:
  ```bash
  npx supabase db push
  ```
* **Remote is level** — nothing to do.
* **Remote has migrations local does not, or the same version with different
  content** — stop. Do not push, do not reset. Diff it and write a forward
  migration:
  ```bash
  npx supabase db diff --linked --schema public > /tmp/drift.sql
  ```

Never run `supabase db reset` against a linked production project. It drops
everything.

### Back up first

A push that fails halfway is much easier to live with when there is a backup.

```bash
npx supabase db dump --linked -f backup-pre-migration.sql --data-only
npx supabase db dump --linked -f schema-pre-migration.sql
```

Paid plans keep automatic daily backups (Dashboard → Database → Backups);
confirm one exists and note its timestamp. On the free plan the dump above is
the only backup you have, so take it.

Record before you begin: project ref, current migration list, the dump
filenames, and the time.

## 3. Environment variables

Set these in **Vercel → Project → Settings → Environment Variables**, for
Production (and Preview if you use it). Never commit them.

| Variable | Where it comes from | Exposed to the browser |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → Data API → Project URL | yes |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Project Settings → API Keys → publishable | yes, and safe — RLS protects it |
| `SUPABASE_SECRET_KEY` | Project Settings → API Keys → secret | **no. Server only.** |
| `NEXT_PUBLIC_APP_URL` | the production URL, e.g. `https://ops.example.com` | yes |

`SUPABASE_SECRET_KEY` bypasses row level security completely. It is used by
`createAdminClient()` for creating employee accounts and for banning a
deactivated user's sign-in, and by nothing else. If it ever appears in a client
bundle, rotate it in the Supabase dashboard immediately.

`NEXT_PUBLIC_*` values are **inlined at build time**, not read at runtime.
Setting them after a build has run is not enough — redeploy. A deployment with
them missing does not crash: it renders `/setup-required` naming exactly which
ones are absent (verified).

## 4. Auth configuration

Dashboard → Authentication:

* **Providers → Email → "Allow new users to sign up": OFF.** This is the
  security invariant. `supabase/config.toml` carries `enable_signup = false`
  for local and CI, and the database refuses uninvited accounts regardless —
  this is the outer door of three.
* **URL Configuration → Site URL**: the production URL.
* **Redirect URLs**: add `https://<your-domain>/auth/callback`. Password reset
  links break without it.
* Email templates: optional, but the default sender is Supabase's shared one
  and is rate limited. Configure SMTP before relying on password resets.

## 5. Signup and provisioning, as designed

There is exactly one way an account comes into being:

```
owner → creates the employee → invitation row → auth user → role → site access → login
```

`createEmployee()` writes an `employee_invitations` row and then calls the admin
API. A `BEFORE INSERT` trigger on `auth.users` refuses any account without an
unconsumed invitation, and invitations are single use. The only exception is
the very first account on an empty database, which becomes the owner — a fresh
deployment has to be startable.

## 6. Storage

Document upload uses Supabase Storage. Create the bucket the application
expects and keep it private; access is mediated by the app, not by public URLs.

```bash
# Dashboard → Storage → New bucket → name it as used in src/actions/documents.ts,
# public: OFF
```

## 7. The first owner

On a new project, sign in once with the account that should own the business.
Being first makes it the owner, active, automatically.

```
1. Dashboard → Authentication → Users → Add user (email + password, auto-confirm)
2. Sign in to the app once.
3. Verify:  select role, is_active from profiles;   → owner, true
```

Then, before anything else, in the app:

* **Settings → GST state code.** It decides CGST+SGST against IGST on every
  invoice. Left unset the system falls back to intra-state, which is wrong for
  every out-of-state client and produces an unfilable GSTR-1.
* **Settings → Bank accounts.** At least one, or no payment by bank transfer or
  cheque can be recorded at all — the cash book refuses a bank entry with no
  account to attach it to.

## 8. Employees

Owner → Employees → New. Set the role, the pay basis and the rate at creation:
payroll reads `daily_rate` and `monthly_salary` straight from the profile, and
an employee created without them earns zero on every run, silently.

Then assign them to sites (Sites → the site → crew). Attendance is site-scoped;
someone with no assignment cannot be marked present anywhere.

## 9. Vercel

```bash
npx vercel link
npx vercel env ls                        # confirm all four variables, Production
npx vercel --prod
```

Framework preset: Next.js. Build command `next build`, output `.next`, both
defaults. Node 20 or later.

Server Actions compare the `Origin` header against `Host`/`X-Forwarded-Host`.
Vercel sets `X-Forwarded-Host` correctly, so nothing is needed. Behind a custom
reverse proxy that rewrites the host, and only then, add
`serverActions.allowedOrigins` in `next.config.ts` — it weakens CSRF protection,
so do not add it speculatively.

## 10. Deploy

```bash
npm run verify                           # typecheck, lint, build
npx vercel --prod
```

## 11. Smoke test

Against the production URL, signed in as the owner:

```
[ ] login
[ ] dashboard shows cash, outstanding, sites, workers present
[ ] Settings shows the GST state code and one bank account
[ ] create a client
[ ] create a quotation, mark sent, approve, convert to contract
[ ] create a site under that contract
[ ] create an employee, assign to the site
[ ] mark the crew's attendance
[ ] record a Rs 100 expense from the dashboard
[ ] raise an invoice, issue it, record a part payment
[ ] confirm "Clients owe" on the dashboard matches the balance
[ ] build a payroll draft for a past month
[ ] open the audit trail and find the changes above
```

Then run the suites against production and require the stated results:

```bash
psql "$PROD_DB_URL" -f supabase/tests/authz_attacks.sql   # 130 BLOCKED, 9 ALLOWED
psql "$PROD_DB_URL" -f supabase/tests/integrity.sql       # part 1 empty
```

Do not seed `supabase/tests/seed_roles.sql` into production — it creates test
users. Run the attack suite against a staging copy, or accept that it needs one
account per role and clean them up afterwards.

## 12. Rollback

**The application.** Vercel keeps every deployment:

```bash
npx vercel rollback <previous-deployment-url>
```

Instant, and it does not touch the database.

**The database.** Migrations 0009–0016 are additive — new tables, columns,
triggers, views and policies — with one exception: 0009 drops
`sites.allocated_value` after copying it into `site_commercials`. So rolling the
schema back is not symmetrical with rolling the app back.

* **App-only problem**: roll back the deployment. Leave the database alone. The
  older application does not use the new objects, except that it will look for
  `sites.allocated_value`, which is gone. So a rollback past 0009 needs the
  column restored:
  ```sql
  ALTER TABLE sites ADD COLUMN allocated_value NUMERIC(14,2) NOT NULL DEFAULT 0;
  UPDATE sites s SET allocated_value = c.allocated_value
    FROM site_commercials c WHERE c.site_id = s.id;
  ```
  That re-exposes site revenue to field staff, which is the defect 0009 exists
  to fix. Treat it as an emergency measure, not a resting state.
* **Migration problem**: restore from the dump taken in step 2.
  ```bash
  psql "$PROD_DB_URL" -f schema-pre-migration.sql
  psql "$PROD_DB_URL" -f backup-pre-migration.sql
  ```
* **Never** `supabase db reset` against production.

Decide the rollback trigger before deploying: what specifically would make you
roll back, and who calls it.

## Verifying afterwards

```sql
-- must return no rows
select * from v_integrity_check;

-- must be exactly one, active
select count(*) from profiles where role = 'owner' and is_active;

-- must be off in the dashboard; this only proves the database's own guard
insert into auth.users (id, email) values (gen_random_uuid(), 'probe@test');
-- expected: ERROR ... Accounts are created by the owner, not by signing up
```
