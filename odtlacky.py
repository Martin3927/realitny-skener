"""Odtlačky fotiek z archívu skenera – na rozpoznanie bytu, ktorý sa už predával („Tento byt sa už predával“).

Pre každý archivovaný inzerát bez odtlačkov stiahne najviac 6 fotiek z verejného úložiska (priečinok „archiv“),
spočíta 64-bitový rozdielový odtlačok (dHash 9×8) a uloží ho do databázy. Potom databáza prepočíta zhody
aktívnych inzerátov so staršími zmiznutými (skener_prepocitaj_predtym).

Spúšťa sa v GitHub Actions (odtlacky.yml). Premenné: SUPABASE_URL, SUPABASE_KEY, SKENER_KLUC.
  python odtlacky.py            – dávky do vyčerpania alebo do časového limitu
  python odtlacky.py --vsetky   – na konci prepočíta zhody všetkých aktívnych inzerátov
"""
import io
import os
import sys
import time

import requests
from PIL import Image

DB_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
DB_KEY = os.environ.get("SUPABASE_KEY", "")
KLUC = os.environ.get("SKENER_KLUC", "")
LIMIT_S = int(os.environ.get("ODTLACKY_LIMIT_S", "900"))
SESSION = requests.Session()
SESSION.headers["User-Agent"] = "RealitnyTypek-odtlacky/1.0"


def log(t):
    print(time.strftime("%H:%M:%S"), t, flush=True)


def rpc(fn, **args):
    for pokus in range(3):
        try:
            r = SESSION.post(f"{DB_URL}/rest/v1/rpc/{fn}", json=args, timeout=300,
                             headers={"apikey": DB_KEY, "Authorization": f"Bearer {DB_KEY}", "Content-Type": "application/json"})
            if r.status_code < 300:
                return r.json() if r.text else None
            if r.status_code < 500 or pokus == 2:
                raise RuntimeError(f"databáza {fn}: {r.status_code} {r.text[:300]}")
        except (requests.ConnectionError, requests.Timeout) as e:
            if pokus == 2:
                raise RuntimeError(f"databáza {fn}: nedostupná ({str(e)[:200]})")
        time.sleep(5 + pokus * 10)


def dhash(obsah):
    """64-bitový rozdielový odtlačok: obrázok zmenšený na 9×8 v odtieňoch sivej, bit = svetlejší pixel vľavo."""
    im = Image.open(io.BytesIO(obsah)).convert("L").resize((9, 8), Image.LANCZOS)
    px = list(im.getdata())
    h = 0
    for r in range(8):
        for c in range(8):
            h = (h << 1) | (1 if px[r * 9 + c] > px[r * 9 + c + 1] else 0)
    return h - (1 << 64) if h >= (1 << 63) else h   # do stĺpca bigint (so znamienkom)


def stiahni(url):
    try:
        r = SESSION.get(url, timeout=30)
        if r.status_code == 200 and len(r.content) > 1000:
            return r.content
    except Exception:  # noqa – jedna zlá fotka nevadí
        pass
    return None


def odtlacky(fotky, portal):
    """Najviac 4 fotky: najprv z portálu (nemíňa prenos dát Supabase), keď už nie je, z nášho archívu."""
    out = []
    for i in range(min(4, max(len(fotky or []), len(portal or [])))):
        obsah = stiahni(portal[i]) if portal and i < len(portal) else None
        if obsah is None and fotky and i < len(fotky):
            obsah = stiahni(f"{DB_URL}/storage/v1/object/public/archiv/{fotky[i]}")
        if obsah is None:
            continue
        try:
            out.append(str(dhash(obsah)))
        except Exception as e:  # noqa
            log(f"  ! fotka {i + 1}: {str(e)[:120]}")
        time.sleep(0.2)
    return out


def main():
    if not (DB_URL and DB_KEY and KLUC):
        log("Chýba SUPABASE_URL, SUPABASE_KEY alebo SKENER_KLUC.")
        return 1
    zaciatok, spolu = time.time(), 0
    while time.time() - zaciatok < LIMIT_S:
        davka = rpc("skener_fotky_na_odtlacky", p_kluc=KLUC, p_pocet=100) or []
        if not davka:
            break
        vysledok = [{"id": x["id"], "h": odtlacky(x.get("fotky"), x.get("portal"))} for x in davka]
        rpc("skener_ulozit_odtlacky", p_kluc=KLUC, p=vysledok)
        spolu += len(vysledok)
        log(f"Odtlačky: {len(vysledok)} inzerátov (spolu {spolu})")
    # raz týždenne (nedeľa v noci) sa prepočítajú všetky aktívne – medzitým mohli pribudnúť odtlačky starších inzerátov
    t = time.gmtime()
    n = rpc("skener_prepocitaj_predtym", p_kluc=KLUC, p_vsetky="--vsetky" in sys.argv or (t.tm_wday == 6 and t.tm_hour == 0) or spolu > 300)
    log(f"Hotovo: odtlačky {spolu} inzerátov, už predávaný byt rozpoznaný pri {n} aktívnych inzerátoch.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
