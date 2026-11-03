#!/usr/bin/env python3
"""Pomocník pre zálohu (.github/workflows/zaloha.yml).

  zaloha.py sql                       – SQL, ktoré spočíta riadky vo všetkých tabuľkách (aj pre lokálnu obnovu)
  zaloha.py pocty <subor.tsv>         – spočíta riadky v ostrej databáze (cez Supabase API) a uloží ich
  zaloha.py pripojenie                – dočasná rola CLI, adresa databázy do $GITHUB_ENV (DB_URL, skrytá v logoch)
  zaloha.py nastavenia <priečinok>    – nastavenia mimo výpisu: plánovač, pravidlá súborov, rozšírenia, nastavenia projektu
  zaloha.py tajne <priečinok>         – kľúče z Vaultu (len do exportu zašifrovaného kľúčom používateľa)
  zaloha.py subory <priečinok> [--archiv <zoznam.tsv> <nove> [--cely]]
                                      – stiahne súbory z verejných priečinkov úložiska; s --archiv z archívu skenera
                                        len to, čo v zozname ešte nie je (nové fotky idú do <nove>, nový zoznam
                                        do <zoznam.tsv>.novy); --cely stiahne celý archív a nové ešte prepojí do <nove>
  zaloha.py buckety                   – vypíše priečinky úložiska súborov (storage.buckets)
  zaloha.py porovnaj <zive> <obnova>  – porovná počty riadkov ostrej databázy a obnovenej zálohy

Do výpisu (verejný log GitHubu) nikdy nejdú údaje z tabuliek – len názvy tabuliek a rozdiely v počtoch.
Prostredie: SUPABASE_ACCESS_TOKEN, SUPABASE_PROJEKT.
"""
import json, os, re, subprocess, sys, time, urllib.request, urllib.error

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


REF = os.environ.get("SUPABASE_PROJEKT") or "uwxziqapghlyktwpipjd"
REGION = os.environ.get("SUPABASE_REGION") or "eu-central-1"


def api(method, cesta, telo=None, ticho=False):
    req = urllib.request.Request(
        f"https://api.supabase.com/v1/projects/{REF}{cesta}",
        data=None if telo is None else json.dumps(telo).encode(), method=method,
        headers={"Authorization": "Bearer " + os.environ["SUPABASE_ACCESS_TOKEN"].strip(),
                 "Content-Type": "application/json", "User-Agent": "realitny-typek-zaloha"})
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return json.loads(r.read() or b"null")
    except urllib.error.HTTPError as e:
        raise SystemExit("" if ticho else f"Supabase API {method} {cesta}: HTTP {e.code}: {e.read().decode(errors='replace')[:500]}")


def q(sql):
    return api("POST", "/database/query", {"query": sql}) or []


def pripojenie():
    """Dočasná rola CLI (platí pár minút) + adresa cez pooler (GitHub nemá IPv6).
    Rola len na čítanie nestačí – pg_dump od Supabase CLI sa prepína na rolu postgres (SET ROLE).
    Záloha s ňou len číta (pg_dump), nič nemení."""
    from urllib.parse import quote
    rola = api("POST", "/cli/login-role", {"read_only": False})
    print(f"::add-mask::{rola['password']}")
    print(f"::add-mask::{quote(rola['password'], safe='')}")
    # adresu poolera kľúč nemusí smieť čítať (database_pooling_config_read) – vtedy skúsime známe adresy v regióne
    hosty = []
    try:
        pool = api("GET", "/config/database/pooler", ticho=True) or []
        hosty = [x["db_host"] for x in pool if x.get("database_type") == "PRIMARY" and x.get("db_host")]
    except SystemExit:
        pass
    hosty += [f"aws-{i}-{REGION}.pooler.supabase.com" for i in (1, 0)]
    for host in dict.fromkeys(hosty):
        # 5432 = režim relácie (pg_dump potrebuje celé spojenie, nie transakčný režim na 6543)
        url = f"postgresql://{rola['role']}.{REF}:{quote(rola['password'], safe='')}@{host}:5432/postgres?sslmode=require"
        r = subprocess.run(["psql", url, "-tAc", "select 1"], capture_output=True, text=True, timeout=60,
                           env={**os.environ, "PGCONNECT_TIMEOUT": "15"})
        if r.stdout.strip() == "1":
            print(f"Databáza cez {host}")
            return url
        print(f"{host}: {(r.stderr.strip().splitlines() or ['?'])[-1][:200]}")
    raise SystemExit("K databáze sa nedá pripojiť cez pooler.")


# Archív skenera: fotky súkromných inzerátov. Pribúdajú, nemenia sa – na hostingu je preto jedna kópia
# (zalohy/archiv), do ktorej sa dohrávajú len nové fotky. Zoznam toho, čo na hostingu už je, je v archiv-zoznam.tsv.
ARCHIV = "archiv"


def nacitaj_zoznam(cesta):
    """archiv-zoznam.tsv: cesta v archíve <TAB> veľkosť v bajtoch."""
    out = {}
    if cesta and os.path.exists(cesta):
        for riadok in open(cesta, encoding="utf-8"):
            if "\t" in riadok:
                n, s = riadok.rstrip("\n").rsplit("\t", 1)
                out[n] = int(s or -1)
    return out


def stiahni_verejne(ciel, zoznam=None, nove=None, cely=False):
    """Súbory z verejných priečinkov úložiska cez verejnú adresu (kľúč na to netreba).
    Súkromné priečinky (prílohy chatu, dokumenty) zapíše do $GITHUB_ENV ako SUKROMNE – tie skúsi workflow cez CLI.
    So zoznamom (archív na hostingu) stiahne z archívu skenera len fotky, ktoré na hostingu ešte nie sú, do <nove>;
    s cely=True stiahne celý archív do <ciel>/archiv (export) a nové fotky do <nove> len prepojí."""
    from concurrent.futures import ThreadPoolExecutor
    from urllib.parse import quote
    rows = q("""select o.bucket_id as b, o.name as n, coalesce((o.metadata->>'size')::bigint, -1) as s, k.public as p
                from storage.objects o join storage.buckets k on k.id = o.bucket_id order by 1, 2""")
    verejne = [r for r in rows if r["p"]]
    sukromne = sorted({r["b"] for r in rows if not r["p"]})
    if os.environ.get("GITHUB_ENV"):
        with open(os.environ["GITHUB_ENV"], "a", encoding="utf-8") as f:
            f.write(f"SUKROMNE={' '.join(sukromne)}\n")

    prirastkovo = nove is not None
    na_hostingu = nacitaj_zoznam(zoznam) if prirastkovo else {}

    def je_nova(r):
        return r["b"] == ARCHIV and (r["n"] not in na_hostingu or (r["s"] != -1 and na_hostingu[r["n"]] != r["s"]))

    if prirastkovo and not cely:
        # z archívu len nové; ostatné priečinky celé (ponuky, weby – fotky sa v nich menia aj mažú)
        verejne = [r for r in verejne if r["b"] != ARCHIV or je_nova(r)]

    def jeden(r):
        cast = [x for x in r["n"].split("/") if x]
        if not cast or any(x in (".", "..") for x in cast):
            return r["b"], "zlý názov"
        if prirastkovo and not cely and r["b"] == ARCHIV:
            cesta = os.path.join(nove, *cast)
        else:
            cesta = os.path.join(ciel, r["b"], *cast)
        os.makedirs(os.path.dirname(cesta), exist_ok=True)
        url = f"https://{REF}.supabase.co/storage/v1/object/public/{r['b']}/" + "/".join(quote(x) for x in cast)
        for pokus in range(4):
            try:
                with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "realitny-typek-zaloha"}),
                                            timeout=120) as resp, open(cesta, "wb") as f:
                    while True:
                        kus = resp.read(1 << 16)
                        if not kus:
                            break
                        f.write(kus)
                if r["s"] in (-1, os.path.getsize(cesta)):
                    return r["b"], None
                chyba = "nesedí veľkosť"
            except urllib.error.HTTPError as e:
                chyba = f"HTTP {e.code}"
                if e.code in (400, 404):  # v úložisku naozaj nie je – nemá zmysel skúšať znova
                    break
            except Exception as e:  # noqa: BLE001 – stačí zapísať a skúsiť znova
                chyba = type(e).__name__
            time.sleep(2 * (pokus + 1))
        if os.path.exists(cesta) and chyba:
            os.remove(cesta)
        return r["b"], chyba

    with ThreadPoolExecutor(6) as ex:
        vysledky = list(ex.map(jeden, verejne))
    zle = [v for v in vysledky if v[1]]
    for b in sorted({r["b"] for r in verejne}):
        n = sum(1 for v in vysledky if v[0] == b)
        if prirastkovo and b == ARCHIV and not cely:
            print(f"{b}: {n - sum(1 for v in zle if v[0] == b)} z {n} nových súborov (ostatné už sú na hostingu)")
        else:
            print(f"{b}: {n - sum(1 for v in zle if v[0] == b)} z {n} súborov")
    if zle:
        from collections import Counter
        druhy = ", ".join(f"{c}: {n}×" for c, n in Counter(c for _, c in zle).most_common())
        print(f"::warning::Nepodarilo sa stiahnuť {len(zle)} súborov ({druhy}) – HTTP 400/404 = súbor v úložisku už nie je")

    if prirastkovo:
        # nové fotky archívu (stiahnuté v poriadku) → <nove>; nový zoznam = čo už na hostingu je + tieto
        # (zlyhané v zozname nebudú, skúsia sa nabudúce). Zoznam sa na hosting nahrá až po nahratí fotiek.
        os.makedirs(nove, exist_ok=True)
        novy = dict(na_hostingu)
        pocet = velkost = 0
        for r, (_, chyba) in zip(verejne, vysledky):
            if r["b"] != ARCHIV or chyba or not je_nova(r):
                continue
            cast = [x for x in r["n"].split("/") if x]
            if cely:  # export: celý archív je v <ciel>/archiv, nové sa len prepoja (bez druhej kópie)
                ciel_nove = os.path.join(nove, *cast)
                os.makedirs(os.path.dirname(ciel_nove), exist_ok=True)
                if not os.path.exists(ciel_nove):
                    os.link(os.path.join(ciel, ARCHIV, *cast), ciel_nove)
            sub = os.path.join(nove, *cast)
            novy[r["n"]] = os.path.getsize(sub)
            pocet += 1
            velkost += novy[r["n"]]
        with open(zoznam + ".novy", "w", encoding="utf-8") as f:
            for n in sorted(novy):
                f.write(f"{n}\t{novy[n]}\n")
        spolu = sum(max(s, 0) for s in novy.values())
        print(f"Archív skenera: {pocet} nových fotiek ({velkost / 1048576:.1f} MB), na hostingu potom spolu "
              f"{len(novy)} ({spolu / 1048576:.0f} MB)")
        if os.environ.get("GITHUB_ENV"):
            with open(os.environ["GITHUB_ENV"], "a", encoding="utf-8") as f:
                f.write(f"ARCHIV_NOVE={pocet}\nARCHIV_NOVE_MB={velkost / 1048576:.1f}\n"
                        f"ARCHIV_SPOLU={len(novy)}\nARCHIV_SPOLU_MB={spolu / 1048576:.0f}\n")

    if len(zle) > max(3, len(verejne) // 50):
        sys.exit(1)


NASTAVENIA_SQL = r"""
select 1 as p, 0 as z, '-- rozšírenia' as s
union all select 1, 1, format('create extension if not exists %I with schema %I;', e.extname, n.nspname)
  from pg_extension e join pg_namespace n on n.oid = e.extnamespace where e.extname <> 'plpgsql'
union all select 2, 0, '-- pravidlá prístupu k súborom a realtime (CLI ich do schema.sql nedáva)'
union all select 2, 1, format(E'drop policy if exists %I on %I.%I;\ncreate policy %I on %I.%I as %s for %s to %s%s%s;',
    policyname, schemaname, tablename, policyname, schemaname, tablename, permissive, cmd,
    (select string_agg(case when r = 'public' then 'public' else quote_ident(r) end, ', ') from unnest(roles) r),
    coalesce(' using (' || qual || ')', ''), coalesce(' with check (' || with_check || ')', ''))
  from pg_policies where schemaname in ('storage', 'realtime')
union all select 3, 0, '-- vlastné triggery na tabuľkách auth a storage'
union all select 3, 1, pg_get_triggerdef(t.oid) || ';'
  from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_proc p on p.oid = t.tgfoid
  where c.relnamespace in ('auth'::regnamespace, 'storage'::regnamespace) and p.pronamespace = 'public'::regnamespace and not t.tgisinternal
union all select 4, 0, '-- realtime'
union all select 4, 1, format('do $x$ begin alter publication %I add table %I.%I; exception when duplicate_object then null; end $x$;',
    pubname, schemaname, tablename)
  from pg_publication_tables where pubname = 'supabase_realtime'
union all select 5, 0, '-- plánovač (pg_cron): ' || (select count(*) from cron.job) || ' úloh'
union all select 5, 1 + jobid::int, case when jobname is null then format('select cron.schedule(%L, %L);', schedule, command)
    else format('select cron.schedule(%L, %L, %L);', jobname, schedule, command) end
    || case when not active then format(' select cron.alter_job(job_id := (select max(jobid) from cron.job where command = %L), active := false);', command) else '' end
  from cron.job
order by 1, 2, 3
"""

VAULT_SQL = "select name, description, decrypted_secret from vault.decrypted_secrets order by name"


def redigovat(o):
    """V nastaveniach z API skryje heslá a kľúče (do zálohy nepatria)."""
    if isinstance(o, dict):
        return {k: ("***" if isinstance(v, str) and v and re.search(r"secret|pass|key|token|private", k, re.I)
                    else redigovat(v)) for k, v in o.items()}
    if isinstance(o, list):
        return [redigovat(x) for x in o]
    return o


def nastavenia(ciel):
    os.makedirs(ciel, exist_ok=True)
    riadky = [r["s"] for r in q(NASTAVENIA_SQL)]
    with open(os.path.join(ciel, "nastavenia.sql"), "w", encoding="utf-8") as f:
        f.write("-- Nastavenia databázy mimo schema.sql – spustiť po obnove roles/schema/data.\n")
        f.write("\n".join(riadky) + "\n")
    info = {
        "vault_mena": [r["name"] for r in q("select name from vault.secrets order by name")],
        "pocty": q("""select (select count(*) from cron.job) as cron,
                             (select count(*) from pg_policies where schemaname in ('storage','realtime')) as pravidla_suborov,
                             (select count(*) from storage.buckets) as priecinky"""),
        "vlastne_domeny": [r["domena"] for r in q("select distinct domena from public.weby where coalesce(domena, '') <> '' order by 1")],
    }
    # nastavenia projektu v Supabase cez Management API – čo kľúč smie čítať
    nedostupne = []
    for meno, cesta in [("auth", "/config/auth"), ("funkcie", "/functions"), ("tajomstva_funkcii", "/secrets"),
                        ("postgrest", "/postgrest"), ("uloziste", "/config/storage"), ("projekt", "")]:
        try:
            data = api("GET", cesta, ticho=True)
        except SystemExit:
            nedostupne.append(meno)
            continue
        if meno == "tajomstva_funkcii":  # hodnoty nie, len mená
            data = sorted(x.get("name") for x in data or [])
        info[meno] = redigovat(data)
    info["nedostupne_cez_api"] = nedostupne
    with open(os.path.join(ciel, "nastavenia.json"), "w", encoding="utf-8") as f:
        json.dump(info, f, ensure_ascii=False, indent=2, default=str)
    print(f"Nastavenia: {len(riadky)} riadkov SQL, cron {info['pocty'][0]['cron']}, pravidlá súborov "
          f"{info['pocty'][0]['pravidla_suborov']}; z API nedostupné: {', '.join(nedostupne) or 'nič'}")
    return info


def tajne(ciel):
    """Hodnoty z Vaultu (napr. kľúč pre upozornenia v mobile) – len do exportu zašifrovaného kľúčom používateľa."""
    os.makedirs(ciel, exist_ok=True)
    with open(os.path.join(ciel, "vault.sql"), "w", encoding="utf-8") as f:
        f.write("-- TAJNÉ: kľúče z Vaultu Supabase. Po obnove spustiť v novej databáze.\n")
        for r in q(VAULT_SQL):
            f.write("select vault.create_secret(%s, %s, %s);\n" % (lit(r["decrypted_secret"] or ""), lit(r["name"]), lit(r["description"] or "")))
    print("Kľúče z Vaultu uložené (len do zašifrovaného exportu).")


def lit(s):
    return "'" + str(s).replace("'", "''") + "'"


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
    elif cmd == "pripojenie":
        url = pripojenie()
        with open(os.environ["GITHUB_ENV"], "a", encoding="utf-8") as f:
            f.write(f"DB_URL={url}\n")
        print("Dočasné pripojenie je pripravené.")
    elif cmd == "nastavenia":
        nastavenia(sys.argv[2])
    elif cmd == "tajne":
        tajne(sys.argv[2])
    elif cmd == "subory":
        arg = sys.argv[3:]
        if arg and arg[0] == "--archiv":
            stiahni_verejne(sys.argv[2], zoznam=arg[1], nove=arg[2], cely="--cely" in arg[3:])
        else:
            stiahni_verejne(sys.argv[2])
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
