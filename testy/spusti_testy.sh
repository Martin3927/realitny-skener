#!/bin/bash
# Spustí testy rozhrania (každý na čistej databáze). Použitie: testy/spusti_testy.sh [ui_nazov ...]
# Test zlyhá, keď vypíše riadok „ZLE“, spadne, alebo stránka hlási chybu v JavaScripte.
T=$(cd "$(dirname "$0")" && pwd)
mkdir -p "${TYPEK_SNIMKY:-/tmp/typek-snimky}"
if [ $# -gt 0 ]; then testy=("$@"); else testy=($(cd "$T/ui" && ls ui_*.py | sed 's/\.py$//')); fi
zle=0; suhrn=""
# databázové testy (len pri spustení všetkých)
if [ $# -eq 0 ]; then
  for f in "$T"/db/*.sql; do
    [ -f "$f" ] || continue; t=$(basename "$f" .sql)
    bash "$T/prostredie/reset.sh" > /tmp/typek-reset.log 2>&1 || { echo "❌ db/$t: databázu sa nepodarilo pripraviť"; cat /tmp/typek-reset.log; exit 1; }
    if vystup=$(psql -h 127.0.0.1 -p 54322 -U postgres -d typek -q -v ON_ERROR_STOP=1 -f "$f" 2>&1); then
      suhrn+="✅ db/$t"$'\n'; echo "✅ db/$t"
    else
      zle=$((zle + 1)); suhrn+="❌ db/$t"$'\n'; echo "❌ db/$t"; grep -E "ERROR|assert" <<< "$vystup" | head -5 | sed 's/^/     /'
    fi
  done
fi
for t in "${testy[@]}"; do
  t=${t%.py}
  if ! bash "$T/prostredie/reset.sh" > /tmp/typek-reset.log 2>&1; then echo "❌ $t: databázu sa nepodarilo pripraviť"; cat /tmp/typek-reset.log; exit 1; fi
  vystup=$(timeout 600 python3 "$T/ui/$t.py" 2>&1); kod=$?
  ok=$(grep -c '^OK' <<< "$vystup"); chyby=$(grep -c '^ZLE' <<< "$vystup")
  if [ $kod -ne 0 ] || [ "$chyby" -gt 0 ] || ! grep -q 'bez chýb JS' <<< "$vystup"; then
    zle=$((zle + 1)); suhrn+="❌ $t (v poriadku $ok, zle $chyby)"$'\n'
    echo "❌ $t"; grep -E '^ZLE|Error|Traceback|^\[' <<< "$vystup" | head -8 | sed 's/^/     /'
  else
    suhrn+="✅ $t ($ok kontrol)"$'\n'; echo "✅ $t ($ok kontrol)"
  fi
done
echo; echo "$suhrn"
[ -n "$GITHUB_STEP_SUMMARY" ] && { echo "### Testy rozhrania"; echo; echo "$suhrn" | sed 's/^/- /'; } >> "$GITHUB_STEP_SUMMARY"
[ $zle -eq 0 ] && echo "Všetky testy prešli." || { echo "Zlyhalo testov: $zle"; exit 1; }
