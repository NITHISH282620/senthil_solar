#!/usr/bin/env bash
#
# Run SQL against the production database.
#
# The Supabase CLI has no way to execute arbitrary SQL against a linked project
# — `supabase db` offers only diff, dump, push, pull and reset. So the test
# suites and the schema verification need a real psql, and this machine has no
# postgres client installed. It does have Docker, and the postgres image is
# already on disk, so psql runs from there on the host network.
#
# The connection string comes from the environment and is never printed, never
# written to a file, and never passed on a command line another process could
# read from `ps`.
#
#   Supabase Dashboard -> Project Settings -> Database -> Connection string
#   -> "Session pooler" (works from IPv4 networks; the direct db host does not)
#
#   export PROD_DB_URL='postgresql://postgres.<ref>:<password>@<host>:5432/postgres'
#   ./scripts/psql-prod.sh supabase/tests/authz_attacks.sql
#   ./scripts/psql-prod.sh -c "select count(*) from v_integrity_check;"
#
set -euo pipefail

if [ -z "${PROD_DB_URL:-}" ]; then
  cat >&2 <<'MSG'
PROD_DB_URL is not set.

  Supabase Dashboard -> Project Settings -> Database -> Connection string
  -> Session pooler, then:

    export PROD_DB_URL='postgresql://postgres.<ref>:<password>@<host>:5432/postgres'

Use the session pooler, not the direct `db.<ref>.supabase.co` host — that one
is IPv6-only and unreachable from most networks, including this one.
MSG
  exit 1
fi

# Refuse to run against anything that is not the intended project, so a stale
# shell cannot point this at the wrong database.
EXPECTED_REF="znwvqdyrvtteirpjecfx"
case "$PROD_DB_URL" in
  *"$EXPECTED_REF"*) ;;
  *) echo "PROD_DB_URL does not mention project $EXPECTED_REF. Refusing." >&2; exit 1 ;;
esac

IMAGE="postgres:15-alpine"
docker image inspect "$IMAGE" >/dev/null 2>&1 || docker pull "$IMAGE"

if [ "${1:-}" = "-c" ]; then
  shift
  exec docker run --rm --network host -i \
    -e PGCONN="$PROD_DB_URL" "$IMAGE" \
    sh -c 'psql "$PGCONN" -v ON_ERROR_STOP=1 -qtA -c "$0"' "$*"
fi

[ -f "${1:-}" ] || { echo "usage: $0 <file.sql> | $0 -c \"SQL\"" >&2; exit 1; }

# The file is piped in, so the container needs no mount and no path juggling.
docker run --rm --network host -i \
  -e PGCONN="$PROD_DB_URL" "$IMAGE" \
  sh -c 'psql "$PGCONN"' < "$1"
