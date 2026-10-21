#!/usr/bin/env python3
"""Spustí nové zmeny databázy (supabase/migrations/NNN_*.sql) v Supabase.

* Ktoré súbory už bežali, si pamätá tabuľka supabase_migrations.nasadene_subory.
* Súbory 001 – 030 boli nasadené ručne ešte pred zavedením tohto skriptu,
  preto sa pri prvom behu iba zapíšu ako nasadené (nespúšťajú sa znova).
* Každý nový súbor beží celý naraz – ak v ňom niečo zlyhá, nezmení sa nič a nasadenie skončí chybou.

Prostredie: SUPABASE_ACCESS_TOKEN (osobný prístupový kľúč zo supabase.com), SUPABASE_PROJEKT (id projektu).
Na lokálny test: LOKALNE=1 (spúšťa cez psql na lokálnej databáze).
"""
import json, os, re, subprocess, sys, urllib.request, urllib.error
from datetime import datetime, timezone
from pathlib import Path

PRIECINOK = Path(__file__).resolve().parent.parent / "supabase" / "migrations"
UZ_NASADENE_DO = 30  # súbory s číslom do 030 už v databáze sú


def q(sql):
    if os.environ.get("LOKALNE"):
        r = subprocess.run(["psql", "-h", "127.0.0.1", "-p", "54322", "-U", "postgres", "-d", os.environ.get("LOKALNA_DB", "typek"),
                            "-v", "ON_ERROR_STOP=1", "-tA", "-c", sql], capture_output=True, text=True)
        if r.returncode:
            raise RuntimeError(r.stderr.strip())
        return [{"riadok": x} for x in r.stdout.strip().splitlines() if x]
    req = urllib.request.Request(
        f"https://api.supabase.com/v1/projects/{os.environ['SUPABASE_PROJEKT']}/database/query",
        data=json.dumps({"query": sql}).encode(), method="POST",
        headers={"Authorization": "Bearer " + os.environ["SUPABASE_ACCESS_TOKEN"], "Content-Type": "application/json",
                 "User-Agent": "realitny-typek-nasadenie"})
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return json.loads(r.read() or b"[]")
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"HTTP {e.code}: {e.read().decode(errors='replace')[:2000]}")


def lit(s):
    return "'" + s.replace("'", "''") + "'"


def main():
    q("create table if not exists supabase_migrations.nasadene_subory (subor text primary key, nasadene timestamptz not null default now())")
    rows = q("select subor from supabase_migrations.nasadene_subory")
    hotove = {r.get("subor") or r.get("riadok") for r in rows}
    subory = sorted(p for p in PRIECINOK.glob("*.sql") if re.match(r"^\d{3}_", p.name))
    nove = 0
    for p in subory:
        if p.name in hotove:
            continue
        cislo = int(p.name[:3])
        if cislo <= UZ_NASADENE_DO:
            q(f"insert into supabase_migrations.nasadene_subory (subor) values ({lit(p.name)}) on conflict do nothing")
            continue
        print(f"▶ Spúšťam {p.name}")
        verzia = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
        sql = p.read_text(encoding="utf-8")
        # celý súbor + záznam o nasadení v jednej dávke (zlyhá všetko alebo nič)
        q("begin;\n" + sql + "\n;\n"
          f"insert into supabase_migrations.nasadene_subory (subor) values ({lit(p.name)});\n"
          f"insert into supabase_migrations.schema_migrations (version, name) values ({lit(verzia)}, {lit(p.stem)}) on conflict do nothing;\n"
          "commit;")
        print(f"✔ {p.name} je v databáze")
        nove += 1
    print(f"Hotovo – nových zmien: {nove}")
    uloz_kluc_githubu()


def uloz_kluc_githubu():
    """Kľúč GitHubu (tajomstvo GH_SPUSTANIE_TOKEN), ktorým Supabase spúšťa skener presne každých 10 minút, uloží do Vaultu."""
    tok = (os.environ.get("GH_SPUSTANIE_TOKEN") or "").strip()
    if not tok:
        print("Kľúč GH_SPUSTANIE_TOKEN nie je nastavený – presné spúšťanie zo Supabase sa preskočí.")
        return
    if not re.fullmatch(r"[A-Za-z0-9_]{20,255}", tok):
        raise RuntimeError("GH_SPUSTANIE_TOKEN má neočakávaný tvar")
    q("do $$ declare v uuid; begin "
      "select id into v from vault.secrets where name = 'gh_spustanie_token'; "
      f"if v is null then perform vault.create_secret({lit(tok)}, 'gh_spustanie_token', 'GitHub – spúšťanie skenera'); "
      f"else perform vault.update_secret(v, {lit(tok)}); end if; end $$;")
    print("✔ Kľúč na spúšťanie skenera je uložený v Supabase")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"::error::Zmena v databáze zlyhala: {e}")
        sys.exit(1)
