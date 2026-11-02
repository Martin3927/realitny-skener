#!/bin/bash
# Skúšobná databáza Týpka: prehrá všetky migrácie (každý súbor v jednej transakcii ako pri nasadení)
# do lokálneho Postgresu s náhradami za časti Supabase (auth, storage, vault, cron, net).
# Stĺpce a pravidlá sú zhodné s ostrou databázou (overené 2. 11. 2026 odtlačkami); 8 funkcií sa líši len komentármi.
#
# Spustenie (Postgres 16, port 54329, socket /tmp/pg):
#   mkdir -p /tmp/pg && initdb -D /tmp/pg/data -U postgres -A trust && pg_ctl -D /tmp/pg/data -o '-p 54329 -k /tmp/pg' -l /tmp/pg/log start
#   supabase/test/prehraj.sh            # databáza „typek"
#   psql -h /tmp/pg -p 54329 -U postgres -d typek -f supabase/test/scenar_kancelarie.sql   # dve kancelárie, pokusy o prienik
# Prihlásený používateľ v teste: set role authenticated; set request.jwt.claim.sub = '<uuid makléra>';
TU="$(cd "$(dirname "$0")" && pwd)"
P="psql -h ${PGHOST:-/tmp/pg} -p ${PGPORT:-54329} -U postgres -q"
DB=${1:-typek}
$P -c "drop database if exists $DB" -c "create database $DB" >/dev/null
$P -d $DB -v ON_ERROR_STOP=1 -f "$TU/supabase_nahrady.sql" >/dev/null 2>&1 || { echo "náhrady zlyhali"; exit 1; }
for f in "$TU"/../migrations/*.sql; do
  out=$($P -d $DB -v ON_ERROR_STOP=1 -1 -f "$f" 2>&1 | grep -E "ERROR|FATAL")
  if [ -n "$out" ]; then echo "== $(basename "$f")"; echo "$out" | head -3; exit 2; fi
done
$P -d $DB -v ON_ERROR_STOP=1 -f "$TU/rucne_funkcie.sql" >/dev/null || exit 3
echo "VŠETKO PREŠLO ($(ls "$TU"/../migrations/*.sql | wc -l) súborov)"
