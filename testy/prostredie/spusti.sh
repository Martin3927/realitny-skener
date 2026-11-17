#!/bin/bash
# Spustí lokálnu databázu (PostgreSQL), PostgREST a bránu, ktorá napodobňuje Supabase (ak ešte nebežia).
# Premenné: PG_BIN (priečinok s pg_ctl), PGDATA_TEST, PG_USER_OS (používateľ, pod ktorým beží postgres), POSTGREST
set -e
T=$(cd "$(dirname "$0")/.." && pwd); REPO=$(cd "$T/.." && pwd)
PG_BIN=${PG_BIN:-$(ls -d /usr/lib/postgresql/*/bin | sort -V | tail -1)}
PGDATA_TEST=${PGDATA_TEST:-/tmp/typek-pgdata}
POSTGREST=${POSTGREST:-postgrest}
U=${PG_USER_OS:-$(id -un)}; [ "$U" = root ] && U=postgres
as_pg() { if [ "$(id -un)" = "$U" ]; then bash -c "$1"; else sudo -u "$U" bash -c "$1" 2>/dev/null || su "$U" -c "$1"; fi; }
mkdir -p /tmp/pgsock && chown "$U" /tmp/pgsock 2>/dev/null || true
if ! psql -h 127.0.0.1 -p 54322 -U postgres -tAc "select 1" >/dev/null 2>&1; then
  if [ ! -f "$PGDATA_TEST/PG_VERSION" ]; then
    mkdir -p "$PGDATA_TEST" && chown "$U" "$PGDATA_TEST" 2>/dev/null || true
    as_pg "$PG_BIN/initdb -D $PGDATA_TEST -U postgres --auth=trust -E UTF8 --locale=C.UTF-8 >/dev/null"
  fi
  as_pg "$PG_BIN/pg_ctl -D $PGDATA_TEST -o '-p 54322 -k /tmp/pgsock -c listen_addresses=127.0.0.1' -l /tmp/typek-pg.log -w start >/dev/null"
fi
cat > /tmp/typek-pgrst.conf <<EOF
db-uri = "postgres://authenticator:auth@127.0.0.1:54322/typek"
db-schemas = "public"
db-anon-role = "anon"
jwt-secret = "$(python3 "$T/prostredie/gateway.py" secret)"
server-port = 3000
db-max-rows = 1000
EOF
if psql -h 127.0.0.1 -p 54322 -U postgres -d typek -tAc "select 1" >/dev/null 2>&1 && ! curl -s -o /dev/null http://127.0.0.1:3000/; then
  nohup "$POSTGREST" /tmp/typek-pgrst.conf > /tmp/typek-pgrst.log 2>&1 &
fi
if ! curl -s -o /dev/null http://127.0.0.1:8000/index.html; then
  DOCS="$REPO/docs" nohup python3 "$T/prostredie/gateway.py" > /tmp/typek-gw.log 2>&1 &
fi
for i in $(seq 1 40); do curl -s -o /dev/null http://127.0.0.1:8000/index.html && break; sleep 0.25; done
psql -h 127.0.0.1 -p 54322 -U postgres -d typek -tAc "notify pgrst, 'reload schema'" >/dev/null 2>&1 || true
echo "prostredie beží"
