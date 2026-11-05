#!/usr/bin/env python3
"""Odhad hodnoty (realitnytypek.sk/odhad) – vygeneruje:
  1. docs/web/odhad/obce.js – kraje, okresy a obce SR zo supabase/seed/lokality.sql
     (Bratislava I–V a Košice I–IV s mestskými časťami ako v skeneri, samotné „Bratislava“ a „Košice“ sa nevypisujú),
  2. podstránku pre každý okres celého Slovenska docs/web/odhad/<okres>/index.html (Bratislava a Košice ako jedno mesto),
  3. zoznam okresov (odkazy na podstránky) na hlavnej stránke aj na každej podstránke medzi <!-- OKRESY --> a <!-- /OKRESY -->,
  4. docs/web/odhad/sitemap.xml (na spustenie, keď sa zruší noindex).

Podstránky sa robia z docs/web/odhad/index.html – po každej zmene hlavnej stránky spustiť:  python3 odhad_generuj.py
Podstránky ručne neupravovať (pri ďalšom generovaní sa prepíšu).
"""
import html
import json
import pathlib
import re
import shutil
import unicodedata

KOREN = pathlib.Path(__file__).resolve().parent
SEED = KOREN / "supabase" / "seed" / "lokality.sql"
PRIECINOK = KOREN / "docs" / "web" / "odhad"
WEB = "https://realitnytypek.sk/odhad/"

# ---------------------------------------------------------------- obce
riadok = re.compile(r"\('(obec|cast)', '((?:[^']|'')*)', '((?:[^']|'')*)', '((?:[^']|'')*)', (?:'[^']*'|null), [^,]+, [^,]+, (true|false)")
kraje, mesta = {}, {}
for m in riadok.finditer(SEED.read_text(encoding="utf-8")):
    typ, nazov, okres, kraj, mesto = (x.replace("''", "'") for x in m.groups())
    if typ == "obec" and okres in ("Bratislava", "Košice"):
        continue
    kraje.setdefault(kraj, {}).setdefault(okres, []).append(nazov)
    if mesto == "true":
        mesta.setdefault(okres, []).append(nazov)
okresov = sum(len(k) for k in kraje.values())
assert len(kraje) == 8 and okresov == 79, (len(kraje), okresov)
(PRIECINOK / "obce.js").write_text(
    "/* Kraje, okresy a obce SR pre Odhad hodnoty – generuje odhad_generuj.py zo supabase/seed/lokality.sql, ručne neupravovať. */\n"
    "window.ODHAD_OBCE = " + json.dumps(kraje, ensure_ascii=False, separators=(",", ":"), sort_keys=True) + ";\n",
    encoding="utf-8")

# ---------------------------------------------------------------- stránky okresov (Bratislava a Košice ako jedno mesto)
def slug(t):
    t = unicodedata.normalize("NFD", t.lower())
    t = "".join(c for c in t if unicodedata.category(c) != "Mn")
    return re.sub(r"[^a-z0-9]+", "-", t).strip("-")

def triedenie(t):   # slovenská abeceda približne (ch za h, diakritika hneď za písmenom)
    t = t.lower().replace("ch", "h~")
    return [(unicodedata.normalize("NFD", c)[0], c) for c in t]

stranky = []   # (slug, nazov, v_kom, kraj, [okresy], obce, priklad)
for kraj in sorted(kraje, key=triedenie):
    zlucene = {}
    for okres in kraje[kraj]:
        hl = re.match(r"^(Bratislava|Košice) [IV]+$", okres)
        kluc = hl.group(1) if hl else okres
        zlucene.setdefault(kluc, []).append(okres)
    for nazov, okr in zlucene.items():
        obce = sorted({o for x in okr for o in kraje[kraj][x]}, key=triedenie)
        if nazov in ("Bratislava", "Košice"):
            v_kom = "v\u00a0Bratislave" if nazov == "Bratislava" else "v\u00a0Košiciach"
            priklad = obce[0]
            nazov_okresu = nazov
        else:
            v_kom = "v\u00a0okrese " + nazov
            priklad = nazov if nazov in obce else (sorted(mesta.get(nazov, []), key=triedenie) or obce)[0]
            nazov_okresu = "okres " + nazov
        stranky.append((slug(nazov), nazov, v_kom, kraj, sorted(okr), obce, priklad, nazov_okresu))
assert len(stranky) == 72, len(stranky)

def zoznam_okresov(aktivny=None):
    bloky = []
    for kraj in sorted(kraje, key=triedenie):
        odkazy = "".join(
            f'<a href="{WEB}{s[0]}/"' + (' aria-current="page"' if s[0] == aktivny else "") + f">{html.escape(s[1])}</a>"
            for s in sorted((x for x in stranky if x[3] == kraj), key=lambda x: triedenie(x[1])))
        bloky.append(f'<div class="okresy-kraj"><h3>{html.escape(kraj)}</h3><div class="okresy-odkazy">{odkazy}</div></div>')
    # zbalené – názvy okresov sa ukážu až po kliknutí (vyhľadávače ich vidia aj tak)
    return ('<!-- OKRESY – generuje odhad_generuj.py -->\n<section class="sekcia sekcia-okresy" id="okresy">\n  <div class="obal">\n'
            '    <details class="okresy-obal"><summary>Odhad hodnoty nehnuteľnosti na celom Slovensku – podľa okresov</summary>\n'
            '    <div class="okresy">' + "".join(bloky) + "</div></details>\n  </div>\n</section>\n<!-- /OKRESY -->")

sablona = (PRIECINOK / "index.html").read_text(encoding="utf-8")
okresy_re = re.compile(r"<!-- OKRESY.*?<!-- /OKRESY -->", re.S)
assert okresy_re.search(sablona), "v index.html chýbajú značky <!-- OKRESY --> a <!-- /OKRESY -->"
hlavna = okresy_re.sub(lambda m: zoznam_okresov(), sablona)
(PRIECINOK / "index.html").write_text(hlavna, encoding="utf-8")

def nahrad(t, stare, nove, pocet=1):
    assert t.count(stare) >= 1, stare[:70]
    return t.replace(stare, nove, pocet)

# staré podstránky (priečinky so súborom index.html) zmazať, aby nezostali okresy, ktoré už neexistujú
for d in PRIECINOK.iterdir():
    if d.is_dir() and (d / "index.html").exists():
        shutil.rmtree(d)

for sl, nazov, v_kom, kraj, okr, obce, priklad, nazov_okresu in stranky:
    t = okresy_re.sub(lambda m: zoznam_okresov(sl), sablona)
    for subor in ("odhad.css", "obce.js", "odhad.js", "typek-head.png", "typek.webp", "ochrana-udajov.html"):
        t = re.sub(r'(src|href)="' + re.escape(subor), r'\1="../' + subor, t)
    t = t.replace('href="./"', 'href="../"')   # logo vedie na úvod odhadu
    t = t.replace('href="../pisma/', 'href="../../pisma/')   # spoločné písma realitnytypek.sk/pisma
    url = WEB + sl + "/"
    titul = f"Odhad hodnoty nehnuteľnosti {nazov} – zadarmo | Týpkove nehnuteľnosti"
    popis = (f"Koľko stojí byt, dom alebo pozemok {v_kom}? Vyplňte pár údajov a maklér, ktorý tu pôsobí, vám približnú hodnotu "
             "oznámi do 24 hodín v pracovné dni. Zadarmo a nezáväzne.")
    t = re.sub(r"<title>[^<]*</title>", "<title>" + html.escape(titul) + "</title>", t, count=1)
    t = re.sub(r'<meta name="description" content="[^"]*">', '<meta name="description" content="' + html.escape(popis) + '">', t, count=1)
    t = re.sub(r'<link rel="canonical" href="[^"]*">', f'<link rel="canonical" href="{url}">', t, count=1)
    t = re.sub(r'<meta property="og:url" content="[^"]*">', f'<meta property="og:url" content="{url}">', t, count=1)
    t = re.sub(r'<meta property="og:title" content="[^"]*">',
               '<meta property="og:title" content="' + html.escape(f"Koľko dnes stojí vaša nehnuteľnosť {v_kom}?") + '">', t, count=1)
    t = nahrad(t, "<body>", '<body data-okresy="' + html.escape("|".join(okr)) + '">')
    t = nahrad(t, '<p class="stitok">Odhad hodnoty nehnuteľnosti · zadarmo</p>',
               f'<p class="stitok">Odhad hodnoty nehnuteľnosti · {html.escape(nazov_okresu)} · zadarmo</p>')
    t = nahrad(t, '<h1 id="nadpis">Koľko dnes stojí <span class="zv">vaša nehnuteľnosť</span>?</h1>',
               f'<h1 id="nadpis">Koľko dnes stojí <span class="zv">vaša nehnuteľnosť</span> {html.escape(v_kom)}?</h1>')
    obce_html = ", ".join(html.escape(o) for o in obce)
    sekcia = (f'<section class="sekcia sekcia-obce" aria-labelledby="obce-n">\n  <div class="obal obal-uzky">\n'
              f'    <p class="stitok stitok-svetly">{html.escape(kraj)}</p>\n'
              f'    <h2 id="obce-n" class="nadpis">Odhad hodnoty bytu, domu aj pozemku {html.escape(v_kom)}</h2>\n'
              f'    <p class="obce-text">Žiadosť odovzdáme maklérovi, ktorý vo vašej obci alebo v okolí pôsobí a pozná tunajšie ceny. '
              f'Odhad pripravíme pre {"mestské časti" if nazov in ("Bratislava", "Košice") else "obce"}: {obce_html}.</p>\n  </div>\n</section>\n\n')
    t = nahrad(t, '<section class="sekcia" id="ako"', sekcia + '<section class="sekcia" id="ako"')
    ciel = PRIECINOK / sl
    ciel.mkdir(exist_ok=True)
    (ciel / "index.html").write_text(t, encoding="utf-8")

mapa = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">', f"  <url><loc>{WEB}</loc></url>"]
mapa += [f"  <url><loc>{WEB}{s[0]}/</loc></url>" for s in stranky]
mapa.append("</urlset>")
(PRIECINOK / "sitemap.xml").write_text("\n".join(mapa) + "\n", encoding="utf-8")
print(f"obce.js: 79 okresov, {sum(len(o) for k in kraje.values() for o in k.values())} obcí; podstránky: {len(stranky)}; sitemap.xml")
