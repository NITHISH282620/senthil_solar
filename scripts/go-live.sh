#!/usr/bin/env bash
#
# Go-live for Sentil Solar Ops.
#
# Every step here has been rehearsed: all 16 migrations were applied to a
# pristine database and the full suite run against it — 130 attacks blocked,
# 9 legitimate operations allowed, 0 integrity violations. Production is in
# exactly that pristine state, so this is a rehearsed path rather than a guess.
#
# It needs credentials this machine does not have, which is the only reason it
# is a script for you to run instead of work already done.
#
#   ./scripts/go-live.sh
#
# Stops at the first failure. Runs nothing destructive.

set -euo pipefail

REF="znwvqdyrvtteirpjecfx"        # the EXISTING project. Do not change it.
say() { printf '\n\033[1m== %s\033[0m\n' "$1"; }
ok()  { printf '   ok  %s\n' "$1"; }
die() { printf '\n   STOP: %s\n\n' "$1" >&2; exit 1; }

say "0. The target is the project .env.local already points at"
ENV_REF=$(sed -n 's#.*https://\([a-z0-9]\{20\}\)\.supabase\.co.*#\1#p' .env.local | head -1)
[ -n "$ENV_REF" ] || die "could not read a project ref out of .env.local"
[ "$ENV_REF" = "$REF" ] || die "this script targets $REF but .env.local points at $ENV_REF — resolve that first"
ok "both agree: $REF"

say "1. Supabase CLI and login"
command -v npx >/dev/null || die "npx not found"
if [ ! -f "$HOME/.supabase/access-token" ] && [ -z "${SUPABASE_ACCESS_TOKEN:-}" ]; then
  echo "   Not logged in — a browser will open."
  npx --yes supabase@latest login
fi
ok "authenticated"

say "2. Link to the EXISTING project (never create a new one)"
npx --yes supabase@latest link --project-ref "$REF"
ok "linked to $REF"

say "3. Back up before touching anything"
mkdir -p backups
STAMP=$(date +%Y%m%d-%H%M%S)
echo "   The CLI will ask for the database password (Dashboard -> Project"
echo "   Settings -> Database). backups/ is gitignored — this repo is public."
npx --yes supabase@latest db dump --linked -f "backups/schema-$STAMP.sql"           || die "schema dump failed"
npx --yes supabase@latest db dump --linked -f "backups/data-$STAMP.sql" --data-only || die "data dump failed"
ok "backups/schema-$STAMP.sql and backups/data-$STAMP.sql"
echo "   (an empty data dump is expected — the remote schema has no tables yet)"

say "4. What is already applied? READ THIS BEFORE CONTINUING"
npx --yes supabase@latest migration list
cat <<'NOTE'

   As last inspected, remote had NO application tables at all: PostgREST
   reported every table absent and next_document_number missing. If the list
   above shows migrations already applied, or ones this repository does not
   have, STOP and reconcile by hand. Never push over drift.

NOTE
read -r -p "   Remote is empty or strictly behind local, and you want to push? [yes/NO] " a
[ "$a" = "yes" ] || die "nothing applied"

say "5. Apply the migrations"
npx --yes supabase@latest db push
ok "migrations applied"

say "6. Verify the schema landed — every line must say OK"
# `supabase db` has no way to execute SQL against a linked project: its only
# subcommands are diff, dump, push, pull and reset. scripts/psql-prod.sh runs
# a real psql instead.
if [ -z "${PROD_DB_URL:-}" ]; then
  cat <<'PW'

   Set PROD_DB_URL to verify, and to run the suites afterwards:
     Dashboard -> Project Settings -> Database -> Connection string
     -> Session pooler (the direct db.<ref> host is IPv6-only)

     export PROD_DB_URL='postgresql://postgres.<ref>:<password>@<host>:5432/postgres'

PW
  die "PROD_DB_URL not set — migrations are applied, but unverified"
fi
./scripts/psql-prod.sh scripts/verify-deploy.sql

cat <<'NEXT'

== Database done. Four things remain that no script can do:

   a) Dashboard -> Authentication -> Providers -> Email
        turn OFF "Allow new users to sign up".
        It is ON right now. The database refuses uninvited accounts anyway,
        but this is the outer door and it is standing open.

   b) Dashboard -> Storage -> New bucket
        create the documents bucket, PUBLIC OFF. There are no buckets today.

   c) Vercel -> Settings -> Environment Variables (Production)
        add SUPABASE_SECRET_KEY (Supabase -> Project Settings -> API Keys ->
        secret). It is absent, and employee creation and deactivation both
        need it. Then REDEPLOY: NEXT_PUBLIC_* are inlined at build time.

   d) git push origin main
        The live deployment is 20 commits behind and predates every fix from
        the three hardening passes.

   Then: create the first owner (Authentication -> Users -> Add user), sign in
   once — being first makes that account the owner — and set the GST state code
   and one bank account in Settings.

   Finally, run the suites against production and require
   130 BLOCKED / 9 ALLOWED / 0 violations:
     ./scripts/psql-prod.sh supabase/tests/seed_roles.sql     # test principals
     ./scripts/psql-prod.sh supabase/tests/rls_matrix.sql
     ./scripts/psql-prod.sh supabase/tests/authz_attacks.sql
     ./scripts/psql-prod.sh supabase/tests/integrity.sql

   The seed creates one test user per role. Remove them afterwards:
     ./scripts/psql-prod.sh supabase/tests/cleanup_test_data.sql

NEXT
