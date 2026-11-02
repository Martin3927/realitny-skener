#!/usr/bin/env python3
"""Pomocník pre zálohu (.github/workflows/zaloha.yml).

  zaloha.py sql                       – SQL, ktoré spočíta riadky vo všetkých tabuľkách (aj pre lokálnu obnovu)
  zaloha.py pocty <subor.tsv>         – spočíta riadky v ostrej databáze (cez Supabase API) a uloží ich
  zaloha.py buckety                   – vypíše priečinky úložiska súborov (storage.buckets)
  zaloha.py porovnaj <zive> <obnova>  – porovná počty riadkov ostrej databázy a obnovenej zálohy

Do výpisu (verejný log GitHubu) nikdy nejdú údaje z tabuliek – len názvy tabuliek a rozdiely v počtoch.
Prostredie: SUPABASE_ACCESS_TOKEN, SUPABASE_PROJEKT.
"""
import json, os, sys, urllib.request, urllib.error

POCTY_SQL = """
select format('%s.%s', table_schema, table_name) as t,
       (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', table_schema, table_name),
                                            false, true, '')))[1]::text::bigint as n
from information_schema.tables
where table_type = 'BASE TABLE'
  and (table_schema = 'public' or (table_schema, table_name) in (('auth','users'), ('storage','objects'), ('storage','buckets')))
order by 1
""".strip()

# tabuľky, ktoré sa menia stále (skener, návštevy webu, plánovač) – malý rozdiel medzi spočítaním a zálohou je v poriadku
ZIVE = ("inzeraty", "archiv", "odhady", "aktivity", "cas_", "web_", "zobrazenia", "radar", "stav_skenera",
        "asistent_pouzitie", "pripomienky", "historia_zmien", "skener_")


def q(sql):
    req = urllib.request.Request(
        f"https://api.supabase.com/v1/projects/{os.environ.get('SUPABASE_PROJEKT') or 'uwxziqapghlyktwpipjd'}/database/query",
        data=json.dumps({"query": sql}).encode(), method="POST",
        headers={"Authorization": "Bearer " + os.environ["SUPABASE_ACCESS_TOKEN"].strip(),
                 "Content-Type": "application/json", "User-Agent": "realitny-typek-zaloha"})
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return json.loads(r.read() or b"[]")
    except urllib.error.HTTPError as e:
        raise SystemExit(f"Supabase API: HTTP {e.code}: {e.read().decode(errors='replace')[:500]}")


def nacitaj(cesta):
    out = {}
    for riadok in open(cesta, encoding="utf-8"):
        if "\t" in riadok:
            t, n = riadok.rstrip("\n").split("\t", 1)
            out[t] = int(n or 0)
    return out


def main():
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    cmd = sys.argv[1]
    if cmd == "sql":
        print(POCTY_SQL)
    elif cmd == "pocty":
        rows = q(POCTY_SQL)
        with open(sys.argv[2], "w", encoding="utf-8") as f:
            for r in rows:
                f.write(f"{r['t']}\t{r['n']}\n")
        print(f"Tabuliek: {len(rows)}, riadkov spolu: {sum(int(r['n']) for r in rows)}")
    elif cmd == "buckety":
        for r in q("select id from storage.buckets order by id"):
            print(r["id"])
    elif cmd == "porovnaj":
        zive, obnova = nacitaj(sys.argv[2]), nacitaj(sys.argv[3])
        chyby, rozdiely = [], []
        for t, n in sorted(zive.items()):
            m = obnova.get(t)
            if m is None:
                chyby.append(f"{t}: v obnovenej databáze chýba")
            elif m != n:
                tolerancia = max(5, n // 50) if any(k in t for k in ZIVE) else 0
                (rozdiely if abs(m - n) <= tolerancia else chyby).append(f"{t}: rozdiel {m - n:+d}")
        print(f"Porovnaných tabuliek: {len(zive)}, riadkov v ostrej: {sum(zive.values())}, v obnovenej: {sum(obnova.get(t, 0) for t in zive)}")
        for r in rozdiely:
            print("  (v poriadku, tabuľka sa mení stále)", r)
        for c in chyby:
            print("::error::Obnova nesedí –", c)
        if chyby:
            sys.exit(1)
        print("Obnova sedí.")
    else:
        raise SystemExit(__doc__)


if __name__ == "__main__":
    main()
