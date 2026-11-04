#!/usr/bin/env python3
"""Zoznam krajov, okresov a obcí pre stránku Odhad hodnoty (docs/web/odhad/obce.js).

Zdroj: supabase/seed/lokality.sql (obce a mestské časti SR). Bratislava a Košice sú rozdelené na okresy
Bratislava I–V a Košice I–IV s mestskými časťami (rovnako ako v skeneri), samotné „Bratislava“ a „Košice“ sa nevypisujú.
Spustenie po zmene zoznamu obcí:  python3 odhad_obce_generuj.py
"""
import json
import pathlib
import re

KOREN = pathlib.Path(__file__).resolve().parent
SEED = KOREN / "supabase" / "seed" / "lokality.sql"
CIEL = KOREN / "docs" / "web" / "odhad" / "obce.js"

riadok = re.compile(r"\('(obec|cast)', '((?:[^']|'')*)', '((?:[^']|'')*)', '((?:[^']|'')*)'")
kraje = {}
for m in riadok.finditer(SEED.read_text(encoding="utf-8")):
    typ, nazov, okres, kraj = (x.replace("''", "'") for x in m.groups())
    if typ == "obec" and okres in ("Bratislava", "Košice"):
        continue
    kraje.setdefault(kraj, {}).setdefault(okres, []).append(nazov)

pocet = sum(len(o) for k in kraje.values() for o in k.values())
okresov = sum(len(k) for k in kraje.values())
assert len(kraje) == 8 and okresov == 79, (len(kraje), okresov)
CIEL.write_text(
    "/* Kraje, okresy a obce SR pre Odhad hodnoty – generuje odhad_obce_generuj.py zo supabase/seed/lokality.sql, ručne neupravovať. */\n"
    "window.ODHAD_OBCE = " + json.dumps(kraje, ensure_ascii=False, separators=(",", ":"), sort_keys=True) + ";\n",
    encoding="utf-8")
print(f"{CIEL.relative_to(KOREN)}: {len(kraje)} krajov, {okresov} okresov, {pocet} obcí a mestských častí")
