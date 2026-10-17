#!/usr/bin/env python3
"""Jednorazovo nahrá doterajšie inzeráty (aj s dátumom, kedy ich skener prvý raz videl) do databázy.
Použitie: SUPABASE_URL=... SUPABASE_KEY=... SKENER_KLUC=... python nahrat_zalohu.py seed_data.json"""
import json, sys
import skener

if not skener.POUZI_DB:
    sys.exit("Chýba SUPABASE_URL, SUPABASE_KEY alebo SKENER_KLUC.")
stav = json.load(open(sys.argv[1], encoding="utf-8"))
skener.uloz_stav(stav)
print("Nahraných inzerátov:", len(stav["inzeraty"]))
