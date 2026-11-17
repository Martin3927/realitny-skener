#!/bin/bash
# Čistá testovacia databáza: základ Supabase + všetky migrácie + testovacie dáta
set -e
T=$(cd "$(dirname "$0")/.." && pwd); REPO=$(cd "$T/.." && pwd)
export PGHOST=127.0.0.1 PGPORT=54322 PGUSER=postgres
bash "$T/prostredie/spusti.sh" >/dev/null
pkill -x postgrest 2>/dev/null || true; sleep 0.3
psql -d postgres -qc "drop database if exists typek with (force)" && createdb typek
psql -d typek -q -v ON_ERROR_STOP=1 -f "$T/prostredie/supabase_zaklad.sql" >/dev/null 2>&1
for f in "$REPO"/supabase/migrations/[0-9]*.sql; do
  psql -d typek -q -v ON_ERROR_STOP=1 -f "$f" >/dev/null 2>/tmp/typek-mig.err || { echo "CHYBA v migrácii $(basename "$f")"; cat /tmp/typek-mig.err; exit 1; }
done
[ -f "$REPO/supabase/seed/lokality.sql" ] && psql -d typek -q -f "$REPO/supabase/seed/lokality.sql" >/dev/null 2>&1 || true
psql -d typek -q -v ON_ERROR_STOP=1 -f "$T/prostredie/seed.sql" >/dev/null
psql -d typek -qc "update makleri set novinky_videne = now() + interval '1 hour'"
bash "$T/prostredie/spusti.sh" >/dev/null
