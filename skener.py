#!/usr/bin/env python3
"""
Realitný skener Alpha Reality
Sleduje Bazoš, Nehnuteľnosti.sk, Reality.sk a TopReality.sk v okresoch Spišská Nová Ves a Levoča,
rozlišuje súkromných predajcov od RK, hľadá podhodnotené ponuky a posiela emailové upozornenia.

Spustenie:  python skener.py            (bežná kontrola – prvé strany výsledkov)
            python skener.py --plny     (prejde všetky strany)
            python skener.py --bez-emailu
"""
import json
import os
import re
import smtplib
import statistics
import sys
import time
import unicodedata
from datetime import datetime, timedelta, timezone
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from html import escape, unescape
from pathlib import Path
from urllib.parse import quote_plus

import requests
from bs4 import BeautifulSoup

from obce import CASTI, OBCE

ROOT = Path(__file__).resolve().parent
CONFIG = json.loads((ROOT / "config.json").read_text(encoding="utf-8"))
DATA_FILE = ROOT / "docs" / "data.json"
OUT_DIR = ROOT / "vystup"

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/130.0 Safari/537.36")
SESSION = requests.Session()
SESSION.headers.update({"User-Agent": UA, "Accept-Language": "sk-SK,sk;q=0.9"})

NOW = datetime.now(timezone.utc)
NOW_ISO = NOW.isoformat(timespec="seconds")
TYPY = set(CONFIG["typy"])
OKRESY = CONFIG["okresy"]
PAUZA = float(CONFIG.get("pauza_medzi_poziadavkami_s", 1.0))

LOG = []


def log(*a):
    msg = " ".join(str(x) for x in a)
    LOG.append(msg)
    print(msg, flush=True)


# ---------------------------------------------------------------- pomocné

def bez_diakritiky(s):
    s = unicodedata.normalize("NFKD", s or "")
    return "".join(c for c in s if not unicodedata.combining(c)).lower()


OBEC_NA_OKRES = {}
for _okres, _obce in OBCE.items():
    for _o in _obce:
        OBEC_NA_OKRES[_o] = _okres
for _cast, _obec in CASTI.items():
    if _obec:
        OBEC_NA_OKRES[_cast] = OBEC_NA_OKRES.get(_obec)
# Vyhľadávanie obcí v texte: najdlhšie názvy najskôr, porovnanie bez diakritiky
_OBCE_PATTERNS = sorted(
    ((n, re.compile(r"\b" + re.escape(bez_diakritiky(n)).replace(r"\-", r"[\s-]*") + r"\b"))
     for n in OBEC_NA_OKRES),
    key=lambda x: -len(x[0]),
)


def _kmen(nazov):
    slova = re.split(r"[\s-]+", bez_diakritiky(nazov))
    casti = []
    for w in slova:
        k = w[:-1] if len(w) >= 5 else w
        casti.append(re.escape(k) + r"\w{0,4}")
    return re.compile(r"\b" + r"[\s-]+".join(casti) + r"\b")


# druhé kolo: skloňované tvary („v Odoríne“, „v Spišských Vlachoch“)
_OBCE_KMENE = [(n, _kmen(n)) for n, _ in _OBCE_PATTERNS]


def normalizuj_obec(nazov):
    """Vráti oficiálny názov obce, ak patrí do sledovaných okresov."""
    if not nazov:
        return None
    b = bez_diakritiky(nazov).strip()
    for n, _ in _OBCE_PATTERNS:
        if bez_diakritiky(n) == b:
            return CASTI.get(n, n) if n in CASTI else n
    return None


def najdi_obec_v_texte(text):
    b = bez_diakritiky(text)
    # "Obec: X" má prednosť
    m = re.search(r"obec:\s*([^\n,]+)", b)
    if m:
        for n, pat in _OBCE_PATTERNS:
            if pat.search(m.group(1)):
                return CASTI.get(n, n) if n in CASTI else n
    for zoznam in (_OBCE_PATTERNS, _OBCE_KMENE):
        for n, pat in zoznam:
            # "Spišská Nová Ves" sa často spomína len ako okres/orientačný bod – zvoľ ju až keď nič iné
            if n in ("Spišská Nová Ves", "Levoča"):
                continue
            if pat.search(b):
                return CASTI.get(n, n) if n in CASTI else n
    # mesto berieme len vtedy, keď nie je spomenuté ako okres alebo orientačný bod („10 km od SNV“)
    pats = {"Spišská Nová Ves": [dict(_OBCE_PATTERNS)["Spišská Nová Ves"], re.compile(r"\bsnv\b"),
                                 re.compile(r"\bspisskej novej vsi\b")],
            "Levoča": [dict(_OBCE_PATTERNS)["Levoča"], re.compile(r"\blevoci\b|\blevoce\b")]}
    for n, zoznam in pats.items():
        for pat in zoznam:
            for m in pat.finditer(b):
                pred = b[max(0, m.start() - 28):m.start()]
                if not re.search(r"okres\w*|\bod\b|\bpri\b|blizk|nedalek|smer|\bkm\b|minut", pred):
                    return n
    return None


_CACHE = os.environ.get("SKENER_CACHE")  # len pre vývoj: ukladá stiahnuté stránky


def get(url, **kw):
    if _CACHE:
        import hashlib
        f = Path(_CACHE) / (hashlib.md5(url.encode()).hexdigest() + ".html")
        if f.exists():
            return f.read_text(encoding="utf-8")
        h = _get(url, **kw)
        if h:
            f.parent.mkdir(parents=True, exist_ok=True)
            f.write_text(h, encoding="utf-8")
        return h
    return _get(url, **kw)


def _get(url, **kw):
    for pokus in range(3):
        try:
            r = SESSION.get(url, timeout=30, **kw)
            time.sleep(PAUZA)
            if r.status_code == 200:
                return r.text
            log(f"  ! {r.status_code} {url}")
            if r.status_code in (403, 429):
                time.sleep(10 * (pokus + 1))
        except requests.RequestException as e:
            log(f"  ! chyba spojenia {url}: {e}")
            time.sleep(5 * (pokus + 1))
    return None


def cislo(s):
    if s is None:
        return None
    s = unescape(str(s)).replace("\xa0", " ")
    m = re.search(r"\d[\d \.]*(?:,\d+)?", s)
    if not m:
        return None
    t = m.group(0).replace(" ", "")
    if "," in t:
        t = t.replace(".", "").replace(",", ".")
    elif re.fullmatch(r"\d{1,3}(\.\d{3})+", t):
        t = t.replace(".", "")
    try:
        return float(t)
    except ValueError:
        return None


def cena_z_textu(s):
    if not s:
        return None
    b = bez_diakritiky(s)
    if any(x in b for x in ("dohodou", "v texte", "info v rk", "na vyziadanie", "ponuknite")):
        return None
    s = re.sub(r"(?<=\d),(?=\d{3}\b)", "", s)  # 137,950 € = 137 950 €
    v = cislo(s)
    if v is None or v < 500:
        return None
    return int(round(v))


# ---------------------------------------------------------------- typ, izby, plocha

def typ_z_textu(text):
    b = bez_diakritiky(text)
    if re.search(r"\bgaraz|\bgarazov|garazove statie|parkovacie miesto", b):
        return "garaz"
    if re.search(r"\bchat[aky]?\b|chalup|\bzrub|drevenic|rekreacn\w* (dom|objekt|chat)|zahradn\w* chat", b):
        return "chata"
    if re.search(r"\bbyt\b|\bbyty\b|garson|izbov\w* byt|\d\s*-?\s*izb|apartman|mezonet|\bloft\b", b):
        return "byt"
    if re.search(r"\bpozem|zahrad|orna poda|\blúk|\bluka|\blesn\w* pozem|stavebn\w* pozem|\bparcel", b):
        return "pozemok"
    if re.search(r"rodinn\w* dom|\bdom\b|\bdomu\b|\bvila\b|bungalov|dvojdom|radov\w* dom|novostavb\w* rd|\brd\b", b):
        return "dom"
    return None


def izby_z_textu(text):
    b = bez_diakritiky(text)
    if "garson" in b:
        return 1
    m = re.search(r"\b([1-6])\s*[-–]?\s*(?:izb|i\b|izbovy|izbak)", b)
    if m:
        return int(m.group(1))
    m = re.search(r"\b([1-6])\s*\+\s*(?:1|kk)\b", b)
    if m:
        return int(m.group(1))
    return None


IZBY_NEHN = {
    "STUDIO_APARTMENT": 1, "ONE_ROOM_APARTMENT": 1, "TWO_ROOM_APARTMENT": 2,
    "THREE_ROOM_APARTMENT": 3, "FOUR_ROOM_APARTMENT": 4, "FIVE_PLUS_ROOM_APARTMENT": 5,
}

ROZSAH = {"byt": (12, 300), "dom": (35, 400), "pozemok": (40, 2_000_000),
          "chata": (10, 250), "garaz": (8, 150)}

DOPYT = re.compile(r"^\W*(hladam|hladame|kupim|kupime|mam zaujem|mame zaujem|dopyt|dostali sme dopyt|vymenim)\b|\bkupa\b|"
                   r"dostali sme dopyt|hladame pre (nasho |nasich )?klient")


MIMO = re.compile(r"\b(v |pri )?(poprad\w*|kezmar\w*|kosic\w*|presov\w*|gelnic\w*|roznav\w*|svit\w*|"
                  r"spisska bela|spisskej belej|stara lubovn\w*|sabinov\w*|spisska stara ves)\b")


def je_dopyt(nazov):
    """Inzeráty typu „Hľadám byt“ / „Kúpim pozemok“ nie sú ponuky na predaj."""
    return bool(DOPYT.search(bez_diakritiky(nazov or "")))


PODA = re.compile(r"orn\w* pod|polnohosp|\bluk|pasien|\btrval\w* trav|\bles\b|lesn|ovocn\w* sad|\bsad\b|"
                  r"\bpoda\b|\bpody\b|\bpodu\b|\bttp\b|investicn\w* pozemok|agro")


def podtyp_pozemku(text, plocha=None, sub=None):
    if sub:
        if sub in ("ARABLE_LAND", "MEADOW_AND_PASTURE", "FOREST_LAND", "ORCHARD", "OTHER_AGRICULTURAL_LAND"):
            return "poda"
        if sub in ("GARDEN", "RECREATIONAL_LAND"):
            return "zahrada"
        return "stavebny"
    b = bez_diakritiky(text or "")
    if PODA.search(b) or (plocha and plocha > 10000 and "stavebn" not in b):
        return "poda"
    if re.search(r"zahrad|rekreacn|chatov", b) and not re.search(r"stavebn|rodinn\w* dom|\brd\b|vystavb", b):
        return "zahrada"
    return "stavebny"


PODTYP_NAZOV = {"stavebny": "stavebné pozemky", "poda": "poľnohosp. pôda", "zahrada": "záhrady"}

_M2 = r"(\d{1,3}(?:[ \.]\d{3})+|\d+(?:[,\.]\d+)?)\s*(m2|m²|m\^2|m 2|metrov|ha\b|hektár|arov|ar\b)"


def plocha_z_textu(text, typ):
    if not text or not typ:
        return None
    b = bez_diakritiky(text)
    lo, hi = ROZSAH[typ]
    kandidati = []
    for m in re.finditer(_M2, b):
        v = cislo(m.group(1))
        if v is None:
            continue
        jedn = m.group(2)
        if jedn.startswith("ha") or jedn.startswith("hekt"):
            v *= 10000
        elif jedn.startswith("ar"):
            v *= 100
        okolie = b[max(0, m.start() - 45):m.start()]
        za = b[m.end():m.end() + 25]
        if typ in ("dom", "chata") and re.search(r"^\W{0,3}(\w+\W+){0,2}(pozem|zahrad|parcel|dvor)", za):
            okolie += " pozem"
        kandidati.append((v, okolie))
    kandidati = [(v, o) for v, o in kandidati if lo <= v <= hi]
    if not kandidati:
        return None
    if typ in ("dom", "chata"):
        for v, o in kandidati:
            if re.search(r"uzitk|obytn|podlahov|zastavan\w* plocha domu|rozloh\w* domu", o):
                return v
        for v, o in kandidati:
            if not re.search(r"pozem|zahrad|parcel|dvor", o):
                return v
        return None
    if typ == "pozemok":
        for v, o in kandidati:
            if re.search(r"pozem|vymer|rozloh|parcel|plocha", o):
                return v
        return max(v for v, _ in kandidati)
    return kandidati[0][0]


# ---------------------------------------------------------------- súkromný vs RK

SUKROMNY_SIGNALY = re.compile(
    r"bez rk|bez realit|nie rk|nie som rk|nevolat\w*.{0,20}(rk|realit)|realitky nevol|"
    r"rk nevol|realitn\w* kancelarie nevol|sukromn\w* (osob|predaj|inzer)|priamo od majitel|"
    r"od majitela|predam svoj|predavam svoj|predam nas|predavame nas|majitel predava|bez provizi"
)
RK_SIGNALY = re.compile(
    r"realitn\w* kancel|\brk\b|makler|maklerk|provizi|real estate|\breality\b|s\.r\.o|"
    r"exkluzivne (ponuk|na predaj|v ponuke)|ponukame (vam )?na predaj|ponukame vam|"
    r"v zastupeni|sprostredkovan|nasa spolocnost|nasa kancelar|pre nasich klientov|hladame pre klienta|"
    r"\bdopyt\b|kupime|\bponukame\b|\bpnukame\b|mame pre vas|mame v ponuke|nasa ponuka|vasa realitn|"
    r"\b3d prehliadk|virtualn\w* prehliadk|obhliadk\w* (je )?mozn\w* (po )?dohod\w* s maklerom"
)
MENO_RK = re.compile(r"realit|reality|real\b|s\.\s?r\.\s?o|a\.s\.|estate|invest|home|\brk\b|maklér|makler|group|property|consulting|servis")


def klasifikuj_text(text):
    b = bez_diakritiky(text)
    if SUKROMNY_SIGNALY.search(b):
        return "sukromny", "v texte uvádza, že nie je RK"
    m = RK_SIGNALY.search(b)
    if m:
        return "rk", f"v texte: „{m.group(0)}“"
    return None, None


# ---------------------------------------------------------------- BAZOŠ

BAZOS_KAT = {"byt": "byt", "dom": "dom", "pozemok": "pozemok", "chata": "chata", "garaz": "garaz"}
BAZOS_HLADANIA = [("05201", 25), ("05401", 20)]  # PSČ SNV a Levoča s okruhom v km


def bazos_strana(kat, psc, okruh, offset):
    cesta = f"/predam/{kat}/" + (f"{offset}/" if offset else "")
    url = (f"https://reality.bazos.sk{cesta}?hledat=&rubriky=reality&hlokalita={psc}"
           f"&humkreis={okruh}&cenaod=&cenado=&order=")
    h = get(url)
    if not h:
        return [], 0
    s = BeautifulSoup(h, "html.parser")
    celkom = 0
    m = re.search(r"Zobrazen\w+ \d+-\d+ inzerátov z ([\d ]+)", h)
    if m:
        celkom = int(m.group(1).replace(" ", ""))
    vysledky = []
    for blok in s.select("div.inzeraty"):
        a = blok.select_one("h2.nadpis a")
        if not a:
            continue
        mid = re.search(r"/inzerat/(\d+)/", a["href"])
        if not mid:
            continue
        lok = blok.select_one(".inzeratylok")
        lok_txt = lok.get_text("\n", strip=True).split("\n") if lok else []
        okres = lok_txt[0] if lok_txt else ""
        psc_inz = lok_txt[1] if len(lok_txt) > 1 else ""
        popis = blok.select_one(".popis")
        cena = blok.select_one(".inzeratycena")
        img = blok.select_one("img.obrazek")
        datum = re.search(r"\[(\d{1,2})\.(\d{1,2})\. (\d{4})\]", str(blok))
        uzivatel = re.search(r"odeslatakci\('rating','(\d+)','\d+','([^']*)'", str(blok))
        top = bool(blok.select_one(".ztop"))
        vysledky.append({
            "pid": mid.group(1),
            "url": "https://reality.bazos.sk" + a["href"],
            "nazov": a.get_text(strip=True),
            "popis": popis.get_text("\n", strip=True) if popis else "",
            "cena_txt": cena.get_text(strip=True) if cena else "",
            "okres": okres,
            "psc": psc_inz,
            "foto": img["src"] if img else None,
            "datum": f"{datum.group(3)}-{int(datum.group(2)):02d}-{int(datum.group(1)):02d}" if datum else None,
            "uzivatel_id": uzivatel.group(1) if uzivatel else None,
            "uzivatel": requests.utils.unquote(uzivatel.group(2)).replace("+", " ") if uzivatel else None,
            "top": top,
        })
    return vysledky, celkom


def bazos_detail(url):
    h = get(url)
    if not h:
        return None
    s = BeautifulSoup(h, "html.parser")
    p = s.select_one("div.popisdetail")
    return p.get_text("\n", strip=True) if p else None


def skenuj_bazos(plny, max_stran):
    vysledky = {}
    for typ in TYPY:
        kat = BAZOS_KAT[typ]
        for psc, okruh in BAZOS_HLADANIA:
            offset, strana = 0, 0
            while True:
                riadky, celkom = bazos_strana(kat, psc, okruh, offset)
                strana += 1
                for r in riadky:
                    r["typ"] = typ
                    vysledky.setdefault(r["pid"], r)
                if not riadky or offset + 20 >= celkom or (not plny and strana >= max_stran) or strana >= 40:
                    break
                offset += 20
    log(f"Bazoš: {len(vysledky)} inzerátov v okolí")
    return list(vysledky.values())


# ---------------------------------------------------------------- NEHNUTEĽNOSTI.SK / REALITY.SK

NEHN_OKRES = {"Spišská Nová Ves": "okres-spisska-nova-ves", "Levoča": "okres-levoca"}
NEHN_TYP = {"APARTMENTS": "byt", "HOUSES": "dom", "LANDS": "pozemok", "COTTAGES_AND_CABINS": "chata"}


def flight_data(h):
    chunks = re.findall(r'self\.__next_f\.push\(\[1,"(.*?)"\]\)</script>', h, re.S)
    out = []
    for c in chunks:
        try:
            out.append(json.loads('"' + c + '"'))
        except json.JSONDecodeError:
            pass
    return "".join(out)


def nehn_strana(okres_slug, strana):
    url = f"https://www.nehnutelnosti.sk/vysledky/{okres_slug}/predaj?order=NEWEST&page={strana}"
    h = get(url)
    if not h:
        return []
    data = flight_data(h)
    dec = json.JSONDecoder()
    vysledky, videne = [], set()
    for m in re.finditer(r'\{"advertisement":\{', data):
        try:
            obj, _ = dec.raw_decode(data, m.start())
        except json.JSONDecodeError:
            continue
        ad = obj.get("advertisement", {})
        if not ad.get("id") or ad["id"] in videne:
            continue
        videne.add(ad["id"])
        vysledky.append(ad)
    return vysledky


def skenuj_nehnutelnosti(plny, max_stran):
    vysledky = []
    for okres in OKRESY:
        strana = 1
        while True:
            ads = nehn_strana(NEHN_OKRES[okres], strana)
            for ad in ads:
                ad["_okres"] = okres
            vysledky += ads
            if len(ads) < 30 or (not plny and strana >= max_stran) or strana >= 40:
                break
            strana += 1
    log(f"Nehnuteľnosti.sk: {len(vysledky)} inzerátov")
    return vysledky


REALITY_OKRES = {"Spišská Nová Ves": "okres-spisska-nova-ves", "Levoča": "okres-levoca"}


def skenuj_reality(plny, max_stran):
    vysledky = []
    for okres in OKRESY:
        strana = 1
        while True:
            url = f"https://www.reality.sk/{REALITY_OKRES[okres]}/predaj/" + (f"?page={strana}" if strana > 1 else "")
            h = get(url)
            if not h:
                break
            s = BeautifulSoup(h, "html.parser")
            bloky = s.select("div.offer[data-offer-id]")
            for b in bloky:
                a = b.select_one("a[href]")
                t = b.select_one("h2.offer-title")
                params = b.select_one("p.offer-params")
                cena = b.select_one("p.offer-price")
                loc = b.select_one("a.offer-location")
                rk = b.select_one(".logos__rk-logo img")
                img = b.select_one("img[data-lazy-src]")
                cena_txt = ""
                if cena:
                    cena_txt = cena.find(string=True, recursive=False) or cena.get_text(" ", strip=True)
                vysledky.append({
                    "pid": b["data-offer-id"],
                    "url": "https://www.reality.sk" + a["href"] if a else None,
                    "nazov": t.get_text(" ", strip=True) if t else "",
                    "params": params.get_text(" ", strip=True) if params else "",
                    "cena_txt": cena_txt.strip(),
                    "obec_txt": loc.get_text(" ", strip=True).replace("Reality ", "") if loc else "",
                    "rk": (rk.get("title") or "RK").split("|")[0].strip() if rk else None,
                    "foto": img["data-lazy-src"] if img else None,
                    "okres": okres,
                })
            if len(bloky) < 24 or (not plny and strana >= max(1, max_stran - 1)) or strana >= 40:
                break
            strana += 1
    log(f"Reality.sk: {len(vysledky)} inzerátov")
    return vysledky


# ---------------------------------------------------------------- TOPREALITY.SK

TOPR_OKRES = {"Spišská Nová Ves": ("810", "d810-Okres Spišská Nová Ves"), "Levoča": ("704", "d704-Okres Levoča")}


def skenuj_topreality(plny, max_stran):
    vysledky = []
    for okres in OKRESY:
        reg, obec_param = TOPR_OKRES[okres]
        q = (f"?form=1&obec={quote_plus(obec_param)}&region%5B0%5D={reg}&sort=id_desc"
             f"&n_search=search&searchType=string")
        strana = 1
        while True:
            cesta = "/vyhladavanie-nehnutelnosti.html" if strana == 1 else f"/vyhladavanie-nehnutelnosti-{strana}.html"
            h = get("https://www.topreality.sk" + cesta + q)
            if not h:
                break
            s = BeautifulSoup(h, "html.parser")
            bloky = s.select("div.row.estate[data-idinz]")
            for e in bloky:
                a = e.select_one("h2.card-title a")
                loc = e.select_one(".location")
                pr = e.select_one("strong.price")
                plochy = {}
                for sp in e.select(".areas span.tooltip-area"):
                    trieda = " ".join(sp.get("class", []))
                    v = cislo(sp.select_one(".value").get_text(" ", strip=True)) if sp.select_one(".value") else None
                    for k in ("area-floor", "area-building", "area-plot"):
                        if k in trieda:
                            plochy[k] = v
                linky = [x.get_text(" ", strip=True) for x in e.select(".links li a")]
                rk = e.select_one('a[href*="realitne-kancelarie"]')
                profi = e.select_one(".tooltip-overena") is not None
                img = e.select_one("img[data-src]")
                datum = e.select_one("li.date")
                vysledky.append({
                    "pid": e["data-idinz"],
                    "url": a["href"] if a else None,
                    "nazov": a.get_text(" ", strip=True) if a else "",
                    "lokalita": loc.get_text(" ", strip=True) if loc else "",
                    "cena_txt": pr.get_text(" ", strip=True) if pr else "",
                    "plochy": plochy,
                    "kategoria": linky[0] if linky else "",
                    "rk": rk.get_text(" ", strip=True) if rk else ("PROFI klient" if profi else None),
                    "foto": ("https://www.topreality.sk" + img["data-src"]) if img and img["data-src"].startswith("/") else (img["data-src"] if img else None),
                    "datum": datum.get_text(strip=True) if datum else None,
                    "okres": okres,
                })
            celkom = re.search(r"<strong>(\d+)</strong> inzerátov", h)
            celkom = int(celkom.group(1)) if celkom else 0
            if not bloky or strana * 15 >= celkom or (not plny and strana >= max_stran) or strana >= 60:
                break
            strana += 1
    log(f"TopReality.sk: {len(vysledky)} inzerátov")
    return vysledky


# ---------------------------------------------------------------- normalizácia

def zaznam(**kw):
    z = {
        "id": None, "portal": None, "portaly": [], "url": None, "nazov": "", "typ": None, "izby": None,
        "cena": None, "plocha": None, "cena_m2": None, "obec": None, "okres": None,
        "predajca": None, "predajca_typ": None, "predajca_dovod": None, "foto": None, "popis": "",
        "publikovane": None, "podtyp": None, "lat": None, "lon": None, "ulica": None,
    }
    z.update(kw)
    if z["plocha"]:
        lo, hi = ROZSAH[z["typ"]]
        if not lo <= z["plocha"] <= hi:
            z["plocha"] = None
    if z["typ"] == "pozemok" and not z["podtyp"]:
        z["podtyp"] = podtyp_pozemku(z["nazov"] + " " + (z["popis"] or ""), z["plocha"])
    if z["typ"] == "byt" and not z["izby"]:
        z["izby"] = izby_z_textu(z["nazov"] + " " + (z["popis"] or ""))
    if z["cena"] and z["plocha"]:
        z["cena_m2"] = round(z["cena"] / z["plocha"], 1)
    return z


def norm_bazos(r, pocty_uzivatelov):
    if r["okres"] not in OKRESY or je_dopyt(r["nazov"]):
        return None
    text = r["nazov"] + "\n" + r.get("popis_plny", r["popis"])
    typ = r["typ"]
    # Bazoš kategória je spoľahlivá, len chaty/domy sa niekedy prelínajú
    t2 = typ_z_textu(r["nazov"])
    if typ in ("dom", "chata") and t2 in ("dom", "chata"):
        typ = t2
    if typ not in TYPY:
        return None
    if typ_z_textu(text) is None:
        return None  # nesúvisí s nehnuteľnosťou (napr. stavebný materiál)
    obec = najdi_obec_v_texte(text)
    if obec and OBEC_NA_OKRES.get(obec) != r["okres"]:
        obec = None
    if not obec and MIMO.search(bez_diakritiky(r["nazov"])):
        return None  # Bazoš ho zaradil k nám, ale nehnuteľnosť je inde

    meno = r.get("uzivatel") or ""
    druh, dovod = klasifikuj_text(text)
    pocet = pocty_uzivatelov.get(r.get("uzivatel_id"), 0)
    if MENO_RK.search(bez_diakritiky(meno)):
        ptyp, dovod = "rk", f"meno predajcu: {meno}"
    elif druh == "sukromny":
        ptyp = "sukromny"
    elif druh == "rk":
        ptyp = "rk"
    elif pocet >= 4:
        ptyp, dovod = "rk", f"predajca má {pocet} realitných inzerátov"
    else:
        ptyp, dovod = "asi_sukromny", "Bazoš – bez znakov realitky"
    return zaznam(
        id=f"bazos:{r['pid']}", portal="bazos", portaly=["bazos"], url=r["url"], nazov=r["nazov"], typ=typ,
        cena=cena_z_textu(r["cena_txt"]), plocha=plocha_z_textu(text, typ), obec=obec, okres=r["okres"],
        predajca=meno or None, predajca_typ=ptyp, predajca_dovod=dovod, foto=r["foto"],
        popis=r.get("popis_plny", r["popis"])[:1500], publikovane=r["datum"],
    )


def gps_z_lokality(loc):
    """Presná poloha inzerátu, ak ju portál posiela (realitná mapa). Hľadá dvojicu súradníc v údajoch o lokalite."""
    def najdi(o, h=0):
        if h > 3 or not isinstance(o, dict):
            return None
        for a, b in (("latitude", "longitude"), ("lat", "lon"), ("lat", "lng")):
            x, y = o.get(a), o.get(b)
            if isinstance(x, (int, float)) and isinstance(y, (int, float)):
                return float(x), float(y)
        for v in o.values():
            r = najdi(v, h + 1) if isinstance(v, dict) else None
            if r:
                return r
        return None
    r = najdi(loc or {})
    if r and 47.6 < r[0] < 49.7 and 16.8 < r[1] < 22.6:   # len body na Slovensku
        return round(r[0], 6), round(r[1], 6)
    return None, None


def norm_nehn(ad):
    par = ad.get("parameters", {})
    cat = par.get("category", {})
    main, sub = cat.get("mainValue"), cat.get("subValue", "")
    typ = NEHN_TYP.get(main)
    if main == "OBJECTS" and "GARAGE" in (sub or ""):
        typ = "garaz"
    if typ not in TYPY or je_dopyt(ad.get("title")):
        return None
    loc = ad.get("location", {})
    okres = (loc.get("district") or "").replace("okres ", "") or ad["_okres"]
    if okres not in OKRESY:
        return None
    obec = normalizuj_obec(loc.get("city"))
    adv = ad.get("advertiser") or {}
    if adv.get("type") == "PRIVATE_PERSON":
        druh, dovod = klasifikuj_text(ad.get("title", ""))
        ptyp = "asi_sukromny" if druh == "rk" else "sukromny"
        dovod = "portál: súkromná osoba" + (f" (ale {dovod})" if druh == "rk" else "")
        meno = adv.get("name")
    else:
        ptyp = "rk"
        meno = (adv.get("parent") or {}).get("name") or adv.get("name")
        dovod = "portál: realitná kancelária" if adv.get("type") in ("AGENT", "AGENCY") else f"portál: {adv.get('type')}"
    price = ad.get("price") or {}
    cena = price.get("priceNum") or cena_z_textu(price.get("price"))
    if cena and cena < 500:
        cena = None
    sef = ad.get("sefName") or ""
    fotky = ad.get("photos") or []
    return zaznam(
        id=f"un:{ad['id']}", portal="nehnutelnosti", portaly=["nehnutelnosti"],
        url=f"https://www.nehnutelnosti.sk/detail/{ad['id']}/{sef}", nazov=ad.get("title", ""), typ=typ,
        izby=IZBY_NEHN.get(sub), cena=int(cena) if cena else None, plocha=par.get("area"), obec=obec, okres=okres,
        predajca=meno, predajca_typ=ptyp, predajca_dovod=dovod, foto=fotky[0]["url"] if fotky else None,
        publikovane=(ad.get("createdAt") or "")[:10] or None,
        podtyp=podtyp_pozemku(ad.get("title", ""), par.get("area"), sub) if typ == "pozemok" else None,
        lat=gps_z_lokality(loc)[0], lon=gps_z_lokality(loc)[1],
        ulica=(loc.get("street") or loc.get("streetName") or None) if isinstance(loc.get("street") or loc.get("streetName"), str) else None,
    )


def norm_reality(r):
    text = r["nazov"] + " " + r["params"]
    typ = typ_z_textu(r["params"]) or typ_z_textu(r["nazov"])
    if typ not in TYPY or je_dopyt(r["nazov"]):
        return None
    obec = normalizuj_obec(r["obec_txt"])
    plocha = None
    m = re.search(r"\|\s*([\d \.,]+)\s*m", unescape(r["params"]))
    if m:
        plocha = cislo(m.group(1))
    return zaznam(
        id=f"un:{r['pid']}", portal="reality", portaly=["reality"], url=r["url"], nazov=r["nazov"], typ=typ,
        cena=cena_z_textu(r["cena_txt"]), plocha=plocha, obec=obec, okres=r["okres"],
        predajca=r["rk"], predajca_typ="rk" if r["rk"] else "sukromny",
        predajca_dovod="portál: logo RK" if r["rk"] else "portál: bez RK", foto=r["foto"],
        izby=izby_z_textu(r["params"]) if typ == "byt" else None,
    )


def norm_topreality(r):
    typ = typ_z_textu(r["kategoria"]) or typ_z_textu(r["nazov"])
    if typ not in TYPY or je_dopyt(r["nazov"]):
        return None
    lok = r["lokalita"]
    m = re.search(r"([^,()]+?)\s*\(([^)]+)\)\s*$", lok)
    obec_txt = m.group(1) if m else lok.split(",")[-1]
    obec = normalizuj_obec(obec_txt.strip()) or najdi_obec_v_texte(r["nazov"])
    pl = r["plochy"]
    if typ == "pozemok":
        plocha = pl.get("area-plot") or pl.get("area-floor")
    else:
        plocha = pl.get("area-floor") or pl.get("area-building")
    if r["rk"]:
        ptyp, meno, dovod = "rk", r["rk"], "portál: profil RK"
    else:
        druh, dovod = klasifikuj_text(r["nazov"])
        ptyp = "asi_sukromny" if druh == "rk" else "sukromny"
        meno, dovod = None, ("portál: bez RK" + (f" (ale {dovod})" if druh == "rk" else ""))
    d = r.get("datum")
    pub = None
    if d and re.fullmatch(r"\d{1,2}\.\d{1,2}\.\d{4}", d):
        dd, mm, yy = d.split(".")
        pub = f"{yy}-{int(mm):02d}-{int(dd):02d}"
    return zaznam(
        id=f"topreality:{r['pid']}", portal="topreality", portaly=["topreality"], url=r["url"], nazov=r["nazov"],
        typ=typ, cena=cena_z_textu(r["cena_txt"]), plocha=plocha, obec=obec, okres=r["okres"],
        predajca=meno, predajca_typ=ptyp, predajca_dovod=dovod, foto=r["foto"], publikovane=pub,
        izby=izby_z_textu(r["kategoria"] + " " + r["nazov"]) if typ == "byt" else None,
        podtyp=podtyp_pozemku(r["kategoria"] + " " + r["nazov"], plocha) if typ == "pozemok" else None,
    )


# ---------------------------------------------------------------- stav, porovnanie

# ---- úložisko: databáza Supabase (ostrá prevádzka) alebo lokálny súbor docs/data.json (test)
DB_URL = (os.environ.get("SUPABASE_URL") or "").rstrip("/")
DB_KEY = os.environ.get("SUPABASE_KEY") or ""
SKENER_KLUC = os.environ.get("SKENER_KLUC") or ""
POUZI_DB = bool(DB_URL and DB_KEY and SKENER_KLUC)
STLPCE = ["id", "portal", "portaly", "url", "nazov", "typ", "podtyp", "izby", "cena", "plocha", "cena_m2", "obec",
          "okres", "predajca", "predajca_typ", "predajca_dovod", "foto", "popis", "publikovane", "prvy_krat",
          "naposledy", "aktivny", "duplikat_z", "dalsie_odkazy", "historia_cien", "lat", "lon", "ulica"]
_POVODNE = {}  # odtlačky riadkov z databázy – posielame len zmenené


def _rpc(fn, **args):
    r = requests.post(f"{DB_URL}/rest/v1/rpc/{fn}", json=args, timeout=120,
                      headers={"apikey": DB_KEY, "Authorization": f"Bearer {DB_KEY}", "Content-Type": "application/json"})
    if r.status_code >= 300:
        raise RuntimeError(f"databáza {fn}: {r.status_code} {r.text[:300]}")
    return r.json() if r.text else None


def _riadok(z):
    r = {k: z.get(k) for k in STLPCE}
    for k in ("prvy_krat", "naposledy"):
        if r[k]:
            r[k] = datetime.fromisoformat(str(r[k]).replace("Z", "+00:00")).astimezone(timezone.utc).isoformat(timespec="seconds")
    r["portaly"] = r["portaly"] or []
    r["dalsie_odkazy"] = r["dalsie_odkazy"] or []
    r["historia_cien"] = r["historia_cien"] or []
    if r["plocha"] is not None:
        r["plocha"] = float(r["plocha"])
    if r["cena_m2"] is not None:
        r["cena_m2"] = float(r["cena_m2"])
    return r


def _odtlacok(z):
    o = z.get("odhad")
    if o:
        o = {"median": float(o["median"]), "rozdiel_pct": float(o["rozdiel_pct"]), "skupina": o["skupina"],
             "n": int(o["n"]), "jednotka": o["jednotka"]}
    return json.dumps([_riadok(z), o, bool(z.get("podhodnotene"))], sort_keys=True, ensure_ascii=False, default=str)


def nacitaj_stav():
    if POUZI_DB:
        inzeraty, od = {}, 0
        while True:
            davka = _rpc("skener_nacitat", p_kluc=SKENER_KLUC, p_od=od, p_pocet=500)
            for r in davka:
                inzeraty[r["id"]] = r
            if len(davka) < 500:
                break
            od += 500
        meta = _rpc("skener_meta", p_kluc=SKENER_KLUC, p_meta=None) or {}
        for z in inzeraty.values():
            z["odhad"] = z.pop("_odhad", None)
            _POVODNE[z["id"]] = _odtlacok(z)
        log(f"Databáza: načítaných {len(inzeraty)} inzerátov")
        return {"meta": meta, "inzeraty": inzeraty}
    if DATA_FILE.exists():
        return json.loads(DATA_FILE.read_text(encoding="utf-8"))
    return {"meta": {}, "inzeraty": {}}


def uloz_stav(stav):
    if POUZI_DB:
        zmenene = [z for z in stav["inzeraty"].values() if _POVODNE.get(z["id"]) != _odtlacok(z)]
        for i in range(0, len(zmenene), 250):
            davka = zmenene[i:i + 250]
            odhady = [dict(z["odhad"], inzerat_id=z["id"], podhodnotene=bool(z.get("podhodnotene")))
                      for z in davka if z.get("odhad")]
            _rpc("skener_ulozit", p_kluc=SKENER_KLUC, p_inzeraty=[_riadok(z) for z in davka], p_odhady=odhady)
        _rpc("skener_meta", p_kluc=SKENER_KLUC, p_meta=stav["meta"])
        log(f"Databáza: uložených {len(zmenene)} zmenených inzerátov")
        return
    DATA_FILE.parent.mkdir(parents=True, exist_ok=True)
    DATA_FILE.write_text(json.dumps(stav, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


def obnov_naposledy(e):
    """Čas „naposledy videný“ obnovíme najviac raz za 12 h – stačí na zistenie zmiznutých (3 dni)
    a databáza tak nedostáva pri každej kontrole stovky zbytočných zmien."""
    try:
        if NOW - datetime.fromisoformat(str(e.get("naposledy"))) < timedelta(hours=12):
            return e["naposledy"]
    except (TypeError, ValueError):
        pass
    return NOW_ISO


def kluc_duplicity(z):
    if not z.get("cena") or not z.get("plocha"):
        return None
    return (z["typ"], z["okres"], int(z["cena"]))


def izby_skupina(z):
    i = z.get("izby")
    if not i:
        return "?"
    return str(min(i, 4)) + ("+" if i >= 4 else "")


def velkost_pozemku(m2):
    if m2 < 1500:
        return "do 1 500 m²"
    if m2 < 5000:
        return "1 500–5 000 m²"
    return "nad 5 000 m²"


def vyhodnot_ceny(inzeraty):
    """Pre každý aktívny inzerát porovná cenu za m² s mediánom podobných ponúk."""
    prah = CONFIG["podhodnotene_o_percent"]
    min_n = CONFIG["min_porovnatelnych"]
    aktivne = [z for z in inzeraty.values() if z.get("aktivny") and not z.get("duplikat_z")]

    def hodnota(z):
        if z["typ"] == "garaz":
            return z.get("cena")
        return z.get("cena_m2")

    def platne(z):
        v = hodnota(z)
        if not v or not z.get("cena") or z["cena"] < 2000:
            return False
        if z["typ"] != "garaz" and not z.get("plocha"):
            return False
        if z["typ"] == "garaz" and re.search(r"parkovac|statie|stojisk", bez_diakritiky(z["nazov"])):
            return False
        if re.search(r"podiel|spoluvlastn|\b1/2\b|\b1/3\b|\b1/4\b", bez_diakritiky(z["nazov"] + " " + (z.get("popis") or ""))):
            return False  # predaj podielu – cena za m² nie je porovnateľná
        lo, hi = ROZSAH[z["typ"]]
        return z["typ"] == "garaz" or lo <= z["plocha"] <= hi

    def skupiny(z):
        t = z["typ"]
        if t == "byt":
            iz = izby_skupina(z)
            return [(f"byt {iz}-izb, {z['obec']}", lambda x: x["typ"] == "byt" and izby_skupina(x) == iz and x["obec"] == z["obec"]),
                    (f"byt {iz}-izb, okres {z['okres']}", lambda x: x["typ"] == "byt" and izby_skupina(x) == iz and x["okres"] == z["okres"]),
                    (f"byty, okres {z['okres']}", lambda x: x["typ"] == "byt" and x["okres"] == z["okres"])]
        if t == "pozemok":
            pt = z.get("podtyp") or "stavebny"
            pas = velkost_pozemku(z["plocha"])
            nazov = f"{PODTYP_NAZOV[pt]} {pas}"
            rovnaky = lambda x: (x["typ"] == "pozemok" and (x.get("podtyp") or "stavebny") == pt
                                 and velkost_pozemku(x["plocha"]) == pas)
        else:
            nazov = {"dom": "domy", "chata": "chaty", "garaz": "garáže"}[t]
            rovnaky = lambda x: x["typ"] == t
        return [(f"{nazov}, {z['obec']}", lambda x: rovnaky(x) and x["obec"] == z["obec"]),
                (f"{nazov}, okres {z['okres']}", lambda x: rovnaky(x) and x["okres"] == z["okres"]),
                (f"{nazov}, oba okresy", rovnaky)]

    zaklad = [z for z in aktivne if platne(z)]
    prahy = CONFIG.get("podhodnotene_o_percent_podla_typu", {})
    for z in inzeraty.values():
        z["odhad"] = None
        z["podhodnotene"] = False
        if not z.get("aktivny") or not platne(z):
            continue
        for nazov, f in skupiny(z):
            if nazov.endswith(", None"):
                continue  # obec nie je známa – porovnaj s okresom
            hodnoty = [hodnota(x) for x in zaklad if x["id"] != z["id"] and f(x)]
            if len(hodnoty) >= min_n:
                med = statistics.median(hodnoty)
                rozdiel = round((hodnota(z) - med) / med * 100, 1)
                z["odhad"] = {"median": round(med, 1), "rozdiel_pct": rozdiel, "skupina": nazov,
                              "n": len(hodnoty), "jednotka": "€" if z["typ"] == "garaz" else "€/m²"}
                p = prahy.get(z["typ"], prah)
                z["podhodnotene"] = rozdiel <= -p and not re.search(r"rezervovan|predane|predany|predana", bez_diakritiky(z["nazov"]))
                break


# ---------------------------------------------------------------- email

def email_html(nove_sukr, podhodn, znizenia, dashboard_url):
    def riadok(z, extra=""):
        cena = f"{z['cena']:,} €".replace(",", " ") if z.get("cena") else "cena neuvedená"
        pl = f" · {z['plocha']:g} m²" if z.get("plocha") else ""
        m2 = f" · {z['cena_m2']:,.0f} €/m²".replace(",", " ") if z.get("cena_m2") and z["typ"] != "garaz" else ""
        odh = ""
        if z.get("odhad"):
            r = z["odhad"]["rozdiel_pct"]
            farba = "#1a9d51" if r < 0 else "#6b6e74"
            odh = (f"<br><span style='color:{farba};font-weight:600'>{r:+.0f} % oproti mediánu</span> "
                   f"<span style='color:#888'>({escape(z['odhad']['skupina'])}, {z['odhad']['n']} ponúk)</span>")
        predajca = {"sukromny": "Súkromný predajca", "asi_sukromny": "Pravdepodobne súkromný",
                    "rk": "RK"}[z["predajca_typ"]]
        if z.get("predajca"):
            predajca += f" – {escape(z['predajca'])}"
        portaly = ", ".join({"bazos": "Bazoš", "nehnutelnosti": "Nehnuteľnosti.sk", "reality": "Reality.sk",
                             "topreality": "TopReality.sk"}[p] for p in z["portaly"])
        return (f"<tr><td style='padding:12px 0;border-bottom:1px solid #eee'>"
                f"<a href='{escape(z['url'])}' style='color:#1f2a37;font-weight:700;font-size:15px;text-decoration:none'>{escape(z['nazov'])}</a><br>"
                f"<span style='color:#4e4e4e'>{escape(z['obec'] or 'okres ' + z['okres'])} · <b>{cena}</b>{pl}{m2}</span><br>"
                f"<span style='color:#888;font-size:13px'>{predajca} · {portaly}</span>{extra}{odh}</td></tr>")

    def sekcia(nadpis, polozky, fn=riadok):
        if not polozky:
            return ""
        return (f"<h2 style='font-size:17px;color:#a8862f;margin:24px 0 4px'>{nadpis} ({len(polozky)})</h2>"
                f"<table width='100%' cellspacing='0' cellpadding='0'>{''.join(fn(z) for z in polozky)}</table>")

    def riadok_zniz(z):
        h = z["historia_cien"]
        stara = h[-2][1]
        return riadok(z, f"<br><span style='color:#1a9d51;font-weight:600'>Znížená cena: z {stara:,} €</span>".replace(",", " "))

    link = (f"<p style='margin:24px 0'><a href='{escape(dashboard_url)}' style='background:#dab967;color:#1f2a37;"
            f"padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:700'>Otvoriť prehľad všetkých inzerátov</a></p>"
            if dashboard_url else "")
    return (f"<div style='font-family:Arial,sans-serif;max-width:640px;margin:0 auto;color:#1f2a37'>"
            f"<div style='border-bottom:3px solid #dab967;padding-bottom:8px'><b style='font-size:20px'>Realitný skener</b>"
            f" <span style='color:#888'>Alpha Reality · {datetime.now().strftime('%d.%m.%Y %H:%M')}</span></div>"
            f"{sekcia('Nové súkromné inzeráty', nove_sukr)}"
            f"{sekcia('Podhodnotené ponuky', podhodn)}"
            f"{sekcia('Súkromní predajcovia znížili cenu', znizenia, riadok_zniz)}"
            f"{link}<p style='color:#aaa;font-size:12px'>Okresy {', '.join(OKRESY)}. Odhad ceny je orientačný – porovnáva cenu za m² s mediánom podobných aktuálnych ponúk.</p></div>")


def posli_email(predmet, html):
    host = os.environ.get("SMTP_HOST")
    user = os.environ.get("SMTP_USER")
    heslo = os.environ.get("SMTP_PASS")
    prijemcovia = [x.strip() for x in (os.environ.get("EMAIL_TO") or ",".join(CONFIG["email"]["prijemcovia"])).split(",") if x.strip()]
    OUT_DIR.mkdir(exist_ok=True)
    (OUT_DIR / "posledny_email.html").write_text(html, encoding="utf-8")
    if not (host and user and heslo):
        log("Email: SMTP nie je nastavené – náhľad uložený do vystup/posledny_email.html")
        return False
    port = int(os.environ.get("SMTP_PORT", "465"))
    od = os.environ.get("EMAIL_FROM") or user
    msg = MIMEMultipart("alternative")
    msg["Subject"] = predmet
    msg["From"] = f"Realitný skener <{od}>"
    msg["To"] = ", ".join(prijemcovia)
    msg.attach(MIMEText(html, "html", "utf-8"))
    try:
        if port == 465:
            with smtplib.SMTP_SSL(host, port, timeout=30) as s:
                s.login(user, heslo)
                s.sendmail(od, prijemcovia, msg.as_string())
        else:
            with smtplib.SMTP(host, port, timeout=30) as s:
                s.starttls()
                s.login(user, heslo)
                s.sendmail(od, prijemcovia, msg.as_string())
        log(f"Email odoslaný: {', '.join(prijemcovia)}")
        return True
    except Exception as e:  # noqa
        log(f"Email sa nepodarilo odoslať: {e}")
        return False


# ---------------------------------------------------------------- ARCHÍV (popis + fotky, ostanú aj po zmazaní inzerátu)

def _fotka_b64(url):
    """Stiahne fotku, zmenší na max. 1000 px a vráti JPEG v base64 (alebo None)."""
    import base64, io
    try:
        r = SESSION.get(url, timeout=30)
        if r.status_code != 200 or len(r.content) < 2000:
            return None
        from PIL import Image
        im = Image.open(io.BytesIO(r.content)).convert("RGB")
        im.thumbnail((900, 900))
        buf = io.BytesIO()
        im.save(buf, "JPEG", quality=72, optimize=True)
        return base64.b64encode(buf.getvalue()).decode()
    except Exception:  # noqa
        return None


_TEL_MOBIL = re.compile(r"(?<![\d])(?:(?:\+|00)\s*421[\s/.-]*|0)\s*(9\d{2})[\s/.-]*(\d{3})[\s/.-]*(\d{3})(?![\d])")
_TEL_PEVNA = re.compile(r"(?<![\d])(?:(?:\+|00)\s*421[\s/.-]*|0)([2-5]\d)[\s/.-]*(\d{3})[\s.-]?(\d{2})[\s.-]?(\d{2})(?![\d])")


def najdi_telefon(text):
    """Telefónne čísla, ktoré predajca napísal do textu inzerátu (napr. „volajte 0905 123 456“)."""
    if not text:
        return None
    cisla = []
    for m in _TEL_MOBIL.finditer(text):
        c = f"0{m.group(1)} {m.group(2)} {m.group(3)}"
        if c not in cisla:
            cisla.append(c)
    for m in _TEL_PEVNA.finditer(text):
        c = f"0{m.group(1)}/{m.group(2)} {m.group(3)}{m.group(4)}"
        if c not in cisla:
            cisla.append(c)
    return ", ".join(cisla[:2]) or None


def archiv_bazos(url):
    h = get(url)
    if not h:
        return None
    s = BeautifulSoup(h, "html.parser")
    popis = s.select_one("div.popisdetail")
    pid = re.search(r"/inzerat/(\d+)/", url).group(1)
    cisla = sorted({int(n) for n in re.findall(r"https://www\.bazos\.sk/img/(\d+)/\d+/" + pid + r"\.jpg", h)})
    fotky = [f"https://www.bazos.sk/img/{n}/{pid[-3:]}/{pid}.jpg" for n in cisla]
    par = {}
    lv = s.select_one(".listadvlevo")
    if lv:
        t = lv.get_text("\n", strip=True).split("\n")
        for i, x in enumerate(t):
            if x.endswith(":") and i + 1 < len(t) and "zobraz" not in t[i + 1]:
                par[x.rstrip(":")] = t[i + 1]
    return {"popis": popis.get_text("\n", strip=True) if popis else None, "parametre": par, "fotky_portal": fotky}


def archiv_nehnutelnosti(inzerat_id):
    ad_id = inzerat_id.split(":", 1)[1]
    h = get(f"https://www.nehnutelnosti.sk/detail/{ad_id}/x")
    if not h:
        return None
    d = flight_data(h)
    dec = json.JSONDecoder()
    obj = None
    for m in re.finditer(r'\{"id":"' + re.escape(ad_id) + '"', d):
        try:
            o, _ = dec.raw_decode(d, m.start())
            if "parameters" in o and "media" in o:
                obj = o
                break
        except json.JSONDecodeError:
            continue
    if not obj:
        return None
    popis = obj.get("description") or ""
    ref = re.fullmatch(r"\$([0-9a-f]+)", popis)
    if ref:
        m = re.search(r"(?:^|\n)" + ref.group(1) + r":T([0-9a-f]+),", d)
        popis = d[m.end():].encode("utf-8")[:int(m.group(1), 16)].decode("utf-8", "ignore") if m else ""
    par = dict(obj.get("parameters") or {})
    par.pop("price", None)
    par["lokalita"] = (obj.get("location") or {}).get("name")
    adv = obj.get("advertiser") or {}
    par["predajca"] = adv.get("name")
    fotky = [f.get("mediumUrl") or f.get("largeUrl") for f in ((obj.get("media") or {}).get("photos") or [])]
    return {"popis": popis or None, "parametre": par, "fotky_portal": [f for f in fotky if f]}


def archiv_topreality(url, pid):
    h = get(url)
    if not h:
        return None
    s = BeautifulSoup(h, "html.parser")
    popis = s.select_one(".description")
    par = {"vlastnosti": [re.sub(r"\s+", " ", li.get_text(" ", strip=True)).replace(" m 2", " m²")
                          for li in s.select(".properties li")][:25]}
    cisla = sorted({int(n) for n in re.findall(r"/topfoto/t/\d+/" + pid + r"-(\d+)-\d+\.jpg", h)})
    fotky = [f"https://www.topreality.sk/topfoto/t/{pid[:3]}/{pid}-{n}-18.jpg" for n in cisla]
    return {"popis": popis.get_text("\n", strip=True) if popis else None, "parametre": par, "fotky_portal": fotky}


def archivuj(plny):
    """Uloží popis a fotky inzerátov, ktoré ešte nie sú v archíve (najprv súkromné a rozpracované)."""
    if not POUZI_DB:
        return
    zoznam = _rpc("skener_na_archiv", p_kluc=SKENER_KLUC, p_pocet=150 if plny else 40) or []
    if not zoznam:
        return
    start, hotovo, fotiek = time.time(), 0, 0
    for z in zoznam:
        if time.time() - start > (20 if plny else 7) * 60:
            break
        try:
            if z["id"].startswith("bazos:"):
                a = archiv_bazos(z["url"])
            elif z["id"].startswith("un:"):
                a = archiv_nehnutelnosti(z["id"])
            elif z["id"].startswith("topreality:"):
                a = archiv_topreality(z["url"], z["id"].split(":", 1)[1])
            else:
                a = None
            if not a:
                continue
            telo = {"inzerat_id": z["id"], **a, "fotky": []}
            if z.get("sukromny"):
                telo["telefon"] = najdi_telefon((a.get("popis") or "") + "\n" + json.dumps(a.get("parametre") or {}, ensure_ascii=False))
            if z.get("fotky"):
                for u in a["fotky_portal"][:8]:
                    f = _fotka_b64(u)
                    if f:
                        telo["fotky"].append(f)
                    time.sleep(0.3)
            r = requests.post(f"{DB_URL}/functions/v1/archiv", json=telo, timeout=120,
                              headers={"apikey": DB_KEY, "Authorization": f"Bearer {DB_KEY}", "x-kluc": SKENER_KLUC})
            if r.status_code == 200:
                hotovo += 1
                fotiek += r.json().get("fotky", 0)
            else:
                log(f"  ! archív {z['id']}: {r.status_code} {r.text[:150]}")
        except Exception as e:  # noqa
            log(f"  ! archív {z['id']}: {e}")
    log(f"Archív: uložených {hotovo} inzerátov, {fotiek} fotiek")


# ---------------------------------------------------------------- hlavný beh

def main():
    args = set(sys.argv[1:])
    stav = nacitaj_stav()
    inzeraty = stav["inzeraty"]
    meta = stav["meta"]
    prvy_beh = not inzeraty
    posledny_plny = meta.get("posledny_plny")
    plny = ("--plny" in args or prvy_beh or not posledny_plny
            or NOW - datetime.fromisoformat(posledny_plny) > timedelta(hours=20))
    max_stran = int(CONFIG.get("stranok_pri_beznej_kontrole", 3))
    portaly = set(CONFIG["portaly"])
    log(f"Skener štart {NOW_ISO} | {'PLNÝ' if plny else 'bežný'} beh | v databáze {len(inzeraty)} inzerátov")

    najdene = []
    chyby = []

    def bezpecne(nazov, fn):
        try:
            return fn()
        except Exception as e:  # noqa – jeden pokazený portál nesmie zastaviť ostatné
            chyby.append(f"{nazov}: {e}")
            log(f"! {nazov} zlyhal: {e}")
            return []

    if "nehnutelnosti" in portaly:
        for ad in bezpecne("Nehnuteľnosti.sk", lambda: skenuj_nehnutelnosti(plny, max_stran)):
            z = norm_nehn(ad)
            if z:
                najdene.append(z)
    if "reality" in portaly:
        for r in bezpecne("Reality.sk", lambda: skenuj_reality(plny, max_stran)):
            z = norm_reality(r)
            if z:
                najdene.append(z)
    if "topreality" in portaly:
        for r in bezpecne("TopReality.sk", lambda: skenuj_topreality(plny, max_stran)):
            z = norm_topreality(r)
            if z:
                najdene.append(z)
    if "bazos" in portaly:
        surove = bezpecne("Bazoš", lambda: skenuj_bazos(plny, max_stran))
        pocty = {}
        for r in surove:
            if r.get("uzivatel_id"):
                pocty[r["uzivatel_id"]] = pocty.get(r["uzivatel_id"], 0) + 1
        # celý popis stiahneme len pri nových inzerátoch z našich okresov
        detailov = 0
        for r in surove:
            if r["okres"] not in OKRESY:
                continue
            existujuci = inzeraty.get(f"bazos:{r['pid']}")
            if existujuci and existujuci.get("popis"):
                r["popis_plny"] = existujuci["popis"]
            elif detailov < 700:
                d = bezpecne("Bazoš detail", lambda: bazos_detail(r["url"]))
                detailov += 1
                if d:
                    r["popis_plny"] = d
            z = norm_bazos(r, pocty)
            if z:
                najdene.append(z)
        log(f"Bazoš: stiahnutých detailov {detailov}")

    # --- zlúčenie do databázy
    nove, znizenia = [], []
    videne_teraz = set()
    for z in najdene:
        zid = z["id"]
        if zid in videne_teraz:
            # rovnaký inzerát na Nehnuteľnosti.sk aj Reality.sk
            e = inzeraty[zid]
            for p in z["portaly"]:
                if p not in e["portaly"]:
                    e["portaly"].append(p)
            continue
        videne_teraz.add(zid)
        e = inzeraty.get(zid)
        if e is None:
            z.update({"prvy_krat": NOW_ISO, "naposledy": NOW_ISO, "historia_cien": [[NOW_ISO[:10], z["cena"]]] if z["cena"] else [],
                      "aktivny": True, "duplikat_z": None})
            inzeraty[zid] = z
            nove.append(z)
        else:
            stara_cena = e.get("cena")
            ponechaj = {k: e[k] for k in ("prvy_krat", "historia_cien", "portaly") if k in e}
            # Reality.sk má menej údajov než Nehnuteľnosti.sk – neprepisuj lepšie údaje horšími
            if z["portal"] == "reality" and e.get("portal") == "nehnutelnosti":
                if "reality" not in e["portaly"]:
                    e["portaly"].append("reality")
                e["naposledy"], e["aktivny"] = obnov_naposledy(e), True
                continue
            for k, v in z.items():
                if v not in (None, "", []) or k in ("cena", "cena_m2"):
                    e[k] = v
            e.update(ponechaj)
            for p in z["portaly"]:
                if p not in e["portaly"]:
                    e["portaly"].append(p)
            e["naposledy"], e["aktivny"] = obnov_naposledy(e), True
            if z["cena"] and z["cena"] != stara_cena:
                e.setdefault("historia_cien", []).append([NOW_ISO[:10], z["cena"]])
                if stara_cena and z["cena"] < stara_cena:
                    znizenia.append(e)

    # --- zmiznuté inzeráty (vyhodnocuje sa len po plnom behu)
    if plny:
        hranica = NOW - timedelta(days=int(CONFIG.get("dni_kym_inzerat_zmizne", 3)))
        for e in inzeraty.values():
            if datetime.fromisoformat(e["naposledy"]) < hranica:
                e["aktivny"] = False

    # --- duplicity medzi portálmi (rovnaký typ, okres, cena a plocha)
    podla_kluca = {}
    for e in inzeraty.values():
        e["dalsie_odkazy"] = []
    for e in sorted(inzeraty.values(), key=lambda x: x["prvy_krat"]):
        if not e.get("aktivny"):
            continue
        k = kluc_duplicity(e)
        e["duplikat_z"] = None
        if not k:
            continue
        povodny = next((x for x in podla_kluca.get(k, []) if abs(x["plocha"] - e["plocha"]) <= 0.03 * x["plocha"]), None)
        if povodny:
            e["duplikat_z"] = povodny["id"]
            for p in e["portaly"]:
                if p not in povodny["portaly"]:
                    povodny["portaly"].append(p)
            if [e["portal"], e["url"]] not in povodny.setdefault("dalsie_odkazy", []):
                povodny["dalsie_odkazy"].append([e["portal"], e["url"]])
            # ak aspoň jeden portál hovorí RK, je to RK
            if e["predajca_typ"] == "rk" and povodny["predajca_typ"] != "rk":
                povodny["predajca_typ"], povodny["predajca_dovod"] = "rk", f"na {e['portal']} inzeruje RK ({e.get('predajca') or ''})".strip()
                povodny["predajca"] = povodny.get("predajca") or e.get("predajca")
        else:
            podla_kluca.setdefault(k, []).append(e)

    vyhodnot_ceny(inzeraty)

    # --- email
    ec = CONFIG["email"]
    nove_ok = [z for z in nove if not z.get("duplikat_z")]
    nove_sukr = [z for z in nove_ok if ec["posielat_sukromne"] and z["predajca_typ"] in ("sukromny", "asi_sukromny")]
    podhodn = [z for z in nove_ok if z.get("podhodnotene") and (ec["posielat_podhodnotene_aj_od_rk"] or z["predajca_typ"] != "rk")
               and z not in nove_sukr]
    zniz = [z for z in znizenia if ec["posielat_znizenie_ceny_sukromnych"] and z["predajca_typ"] != "rk" and not z.get("duplikat_z")]
    log(f"Nové: {len(nove)} (z toho súkromné {len(nove_sukr)}, podhodnotené {len(podhodn)}), zníženia cien súkromných: {len(zniz)}")

    meta.update({
        "posledna_kontrola": NOW_ISO,
        "posledny_plny": NOW_ISO if plny else meta.get("posledny_plny"),
        "okresy": OKRESY,
        "pocet_aktivnych": sum(1 for z in inzeraty.values() if z.get("aktivny") and not z.get("duplikat_z")),
        "chyby": chyby,
        "podhodnotene_o_percent": CONFIG["podhodnotene_o_percent"],
    })
    if prvy_beh:
        meta["spusteny"] = NOW_ISO
    uloz_stav(stav)

    try:
        archivuj(plny)
    except Exception as e:  # noqa – archív nesmie zastaviť upozornenia
        log(f"! archív zlyhal: {e}")

    if "--bez-emailu" in args:
        posli = False
    elif prvy_beh:
        posli = False
        log("Prvý beh – databáza naplnená, email sa neposiela (inak by prišli stovky starých inzerátov).")
    else:
        posli = bool(nove_sukr or podhodn or zniz)
    html = email_html(nove_sukr, podhodn, zniz, os.environ.get("DASHBOARD_URL", ""))
    if posli:
        casti = []
        if nove_sukr:
            casti.append(f"{len(nove_sukr)}× súkromný")
        if podhodn:
            casti.append(f"{len(podhodn)}× podhodnotené")
        if zniz:
            casti.append(f"{len(zniz)}× zníženie ceny")
        posli_email("Skener: " + ", ".join(casti), html)
    else:
        OUT_DIR.mkdir(exist_ok=True)
        (OUT_DIR / "posledny_email.html").write_text(html, encoding="utf-8")
    log("Hotovo.")


if __name__ == "__main__":
    main()
