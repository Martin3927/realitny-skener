#!/usr/bin/env python3
"""Vygeneruje obce.py – obce a nastavenia portálov pre všetkých 79 okresov SR.

Zdroj obcí: supabase/seed/lokality.sql (rovnaký zoznam ako v tabuľke lokality).
Spustenie:  python obce_generuj.py
Nastavenia portálov overené 2. 11. 2026 na všetkých 79 okresoch (Nehnuteľnosti.sk, Reality.sk, TopReality.sk, Bazoš).
"""
import math
import re
import unicodedata
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent

# rovnaké poradie ako oficiálne kódy okresov (kraj × 100 + poradie) – TopReality ich používa ako „region“
KRAJE = [
    ("Bratislavský kraj", ["Bratislava I", "Bratislava II", "Bratislava III", "Bratislava IV", "Bratislava V", "Malacky", "Pezinok", "Senec"]),
    ("Trnavský kraj", ["Dunajská Streda", "Galanta", "Hlohovec", "Piešťany", "Senica", "Skalica", "Trnava"]),
    ("Trenčiansky kraj", ["Bánovce nad Bebravou", "Ilava", "Myjava", "Nové Mesto nad Váhom", "Partizánske", "Považská Bystrica", "Prievidza", "Púchov", "Trenčín"]),
    ("Nitriansky kraj", ["Komárno", "Levice", "Nitra", "Nové Zámky", "Šaľa", "Topoľčany", "Zlaté Moravce"]),
    ("Žilinský kraj", ["Bytča", "Čadca", "Dolný Kubín", "Kysucké Nové Mesto", "Liptovský Mikuláš", "Martin", "Námestovo", "Ružomberok", "Turčianske Teplice", "Tvrdošín", "Žilina"]),
    ("Banskobystrický kraj", ["Banská Bystrica", "Banská Štiavnica", "Brezno", "Detva", "Krupina", "Lučenec", "Poltár", "Revúca", "Rimavská Sobota", "Veľký Krtíš", "Zvolen", "Žarnovica", "Žiar nad Hronom"]),
    ("Prešovský kraj", ["Bardejov", "Humenné", "Kežmarok", "Levoča", "Medzilaborce", "Poprad", "Prešov", "Sabinov", "Snina", "Stará Ľubovňa", "Stropkov", "Svidník", "Vranov nad Topľou"]),
    ("Košický kraj", ["Gelnica", "Košice I", "Košice II", "Košice III", "Košice IV", "Košice-okolie", "Michalovce", "Rožňava", "Sobrance", "Spišská Nová Ves", "Trebišov"]),
]
MESTA = {**{f"Bratislava {r}": "Bratislava" for r in ("I", "II", "III", "IV", "V")},
         **{f"Košice {r}": "Košice" for r in ("I", "II", "III", "IV")}, "Košice-okolie": "Košice"}
# Bazoš: PSČ, ktoré pozná (95050, 94001 a chýbajúce PSČ vráti celé Slovensko), okruh v km a názov okresu v zozname
PSC = {"Nitra": "94901", "Nové Zámky": "94002", "Šaľa": "92701"}
OKRUH = {"Spišská Nová Ves": 25, "Levoča": 20, **{f"Bratislava {r}": 20 for r in ("I", "II", "III", "IV", "V")},
         **{f"Košice {r}": 15 for r in ("I", "II", "III", "IV")}}
BAZOS = {"Nové Mesto nad Váhom": "Nové Mesto n.Váhom", **{f"Bratislava {r}": "Bratislava" for r in ("I", "II", "III", "IV", "V")},
         **{f"Košice {r}": "Košice" for r in ("I", "II", "III", "IV")}}

# mestské časti a miestne názvy, ktoré sa v inzerátoch objavujú namiesto obce (ručne)
CASTI = {
    "Spišská Nová Ves": {"Novoveská Huta": "Spišská Nová Ves", "Ferčekovce": "Spišská Nová Ves", "Biele Vody": "Mlynky",
                         "Košiarny briežok": "Smižany", "Čingov": "Smižany", "Podlesok": "Hrabušice",
                         "Hnilci": "Hnilec", "Hnilca": "Hnilec"},   # skloňovanie by sa inak zamenilo s Hnilčíkom
}


def bez(s):
    return "".join(c for c in unicodedata.normalize("NFKD", s) if not unicodedata.combining(c)).lower()


def km(a, b, c, d):
    p = math.pi / 180
    x = math.sin((c - a) * p / 2) ** 2 + math.cos(a * p) * math.cos(c * p) * math.sin((d - b) * p / 2) ** 2
    return 12742 * math.asin(math.sqrt(x))


def nacitaj():
    riadky = []
    vzor = re.compile(r"\('(obec|cast)', '((?:[^']|'')*)', '((?:[^']|'')*)', '(?:[^']|'')*', (null|'\d+'), ([\d.]+|null), ([\d.]+|null)")
    for line in (ROOT / "supabase" / "seed" / "lokality.sql").read_text(encoding="utf-8").splitlines():
        m = vzor.match(line.strip())
        if m:
            t, n, o, psc, lat, lon = m.groups()
            riadky.append(dict(typ=t, nazov=n.replace("''", "'"), okres=o.replace("''", "'"), psc=None if psc == "null" else psc.strip("'"),
                               lat=None if lat == "null" else float(lat), lon=None if lon == "null" else float(lon)))
    return riadky


def main():
    R = nacitaj()
    obce = defaultdict(list)
    for r in R:
        if r["typ"] == "obec" and r["okres"] not in ("Bratislava", "Košice"):
            obce[r["okres"]].append(r)
        elif r["typ"] == "cast":
            obce[r["okres"]].append(r)
    mesto = {r["nazov"]: r for r in R if r["typ"] == "obec"}
    OKR, OBC = {}, {}
    for ki, (kraj, zoz) in enumerate(KRAJE):
        for oi, o in enumerate(zoz):
            m = mesto[MESTA.get(o, o)]
            if o in OKRUH:
                okruh = OKRUH[o]
            else:
                d = max(km(m["lat"], m["lon"], x["lat"], x["lon"]) for x in obce[o])
                okruh = min(50, max(10, int(math.ceil((d + 3) / 5) * 5)))
            lat = [x["lat"] for x in obce[o]]
            lon = [x["lon"] for x in obce[o]]
            OKR[o] = {"kraj": kraj, "kod": str((ki + 1) * 100 + oi + 1), "slug": "okres-" + re.sub(r"[^a-z0-9]+", "-", bez(o)).strip("-"),
                      "mesto": MESTA.get(o, o), "psc": PSC.get(o, m["psc"]), "okruh": okruh, "bazos": BAZOS.get(o, o),
                      "stred": (round(sum(lat) / len(lat), 4), round(sum(lon) / len(lon), 4)),
                      "box": (round(min(lat) - 0.06, 3), round(max(lat) + 0.06, 3), round(min(lon) - 0.08, 3), round(max(lon) + 0.08, 3))}
            nazvy = {x["nazov"] for x in obce[o]} | ({MESTA[o]} if o in MESTA and o != "Košice-okolie" else set())
            OBC[o] = sorted(nazvy, key=lambda n: (n != OKR[o]["mesto"], bez(n), n))
            if o not in MESTA:
                assert OBC[o][0] == o, o
    assert len(OKR) == 79 and all(v["psc"] for v in OKR.values())
    # PSČ mestských častí Bratislavy a Košíc (Bazoš ich obe mestá vedie ako jeden okres) – pri spoločnom PSČ väčšina
    psc_casti = defaultdict(lambda: defaultdict(int))
    for r in R:
        if r["typ"] == "cast" and r["psc"]:
            psc_casti[r["psc"]][r["okres"]] += 1
    PSC_MESTA = {p: max(v, key=lambda k: (v[k], -int(OKR[k]["kod"]))) for p, v in sorted(psc_casti.items())}

    v = ['"""Obce a nastavenia portálov pre všetkých 79 okresov SR.',
         "",
         "VYGENEROVANÉ skriptom obce_generuj.py zo supabase/seed/lokality.sql – ručne neupravovať, zmeny patria do obce_generuj.py.",
         "OKRESY_SR[okres]: kraj, kod (oficiálny kód okresu = region na TopReality), slug (Nehnuteľnosti.sk a Reality.sk),",
         "  mesto (okresné mesto), psc + okruh (vyhľadávanie na Bazoši, km), bazos (názov okresu v zozname Bazoša),",
         "  stred (stred obcí), box (rozsah súradníc obcí s rezervou: lat od, lat do, lon od, lon do).",
         '"""', "",
         "OKRESY_SR = {"]
    for o, d in OKR.items():
        v.append(f"    {o!r}: {d!r},")
    v += ["}", "", "# obce okresu (pri Bratislave a Košiciach mestské časti); okresné mesto je prvé", "OBCE = {"]
    for o, zoz in OBC.items():
        v.append(f"    {o!r}: {zoz!r},")
    v += ["}", "", "# mestské časti a miestne názvy, ktoré sa v inzerátoch objavujú namiesto obce: okres → {názov: obec}", f"CASTI = {CASTI!r}", "",
          "# PSČ mestských častí Bratislavy a Košíc → okres (Bazoš uvádza len „Bratislava“ alebo „Košice“)", f"PSC_MESTA = {PSC_MESTA!r}", ""]
    (ROOT / "obce.py").write_text("\n".join(v), encoding="utf-8")
    print(f"obce.py: {len(OKR)} okresov, {sum(len(x) for x in OBC.values())} obcí a mestských častí")


if __name__ == "__main__":
    main()
