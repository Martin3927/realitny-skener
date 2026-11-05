#!/usr/bin/env python3
"""Písma Týpka na vlastnom serveri (bez Google Fonts – návštevník neposiela IP adresu Googlu).

Stiahne z Google Fonts všetky rodiny, ktoré používajú stránky a šablóny webov maklérov,
ponechá len latinku a rozšírenú latinku (slovenčina, čeština, maďarčina…) a uloží:
  docs/pisma/pisma.css + *.woff2       (app.realitnytypek.sk a vlastné domény maklérov)
  docs/web/pisma/pisma.css + *.woff2   (realitnytypek.sk)
Stránky načítajú len pisma.css; prehliadač si stiahne iba tie súbory písma, ktoré stránka naozaj použije.

Spustenie (len keď pribudne nové písmo):  python3 pisma_stiahni.py
"""
import hashlib, os, re, shutil, sys, urllib.request

KORENE = ["docs/pisma", "docs/web/pisma"]
RODINY = [
    "Bricolage+Grotesque:opsz,wght@12..96,400..800",   # nadpisy Týpka a šablóny webov
    "Instrument+Sans:wght@400..700",                    # text Týpka a šablóny webov
    "Montserrat:wght@600..900",                         # „týpek“ v logu, aplikácia
    "Public+Sans:wght@400..800",                        # aplikácia, šablóna Jednoduché
    "Young+Serif",                                      # šablóny webov
    "Archivo:wght@400..900",                            # šablóna Výrazné
    "Cormorant+Garamond:wght@500;600;700",              # šablóna Luxusné
    "Nunito:wght@500..800",                             # šablóna Priateľské
]
SUBSETY = ("latin", "latin-ext")
UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"


def stiahni(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=30) as r:
        return r.read()


def main():
    url = "https://fonts.googleapis.com/css2?" + "&".join("family=" + r for r in RODINY) + "&display=swap"
    css = stiahni(url).decode("utf-8")
    bloky = re.findall(r"/\*\s*([a-z0-9-]+)\s*\*/\s*@font-face\s*\{([^}]*)\}", css)
    if not bloky:
        sys.exit("Google Fonts nevrátil žiadne písma")
    tmp = KORENE[0] + ".novy"
    shutil.rmtree(tmp, ignore_errors=True)
    os.makedirs(tmp)
    subory, vystup = {}, ["/* Písma Týpka – vlastné kópie písiem z Google Fonts (licencia SIL Open Font License). Vytvára pisma_stiahni.py. */"]
    for subset, telo in bloky:
        if subset not in SUBSETY:
            continue
        rodina = re.search(r"font-family:\s*'([^']+)'", telo).group(1)
        zdroj = re.search(r"url\((https://[^)]+\.woff2)\)", telo).group(1)
        if zdroj not in subory:
            nazov = re.sub(r"[^a-z0-9]+", "-", rodina.lower()).strip("-") + "-" + subset + "-" + hashlib.sha1(zdroj.encode()).hexdigest()[:6] + ".woff2"
            with open(os.path.join(tmp, nazov), "wb") as f:
                f.write(stiahni(zdroj))
            subory[zdroj] = nazov
        telo = telo.replace("url(" + zdroj + ")", "url(" + subory[zdroj] + ")")
        telo = "\n".join("  " + r.strip() for r in telo.strip().splitlines() if r.strip())
        vystup.append("/* " + rodina + " – " + subset + " */\n@font-face {\n" + telo + "\n}")
    with open(os.path.join(tmp, "pisma.css"), "w", encoding="utf-8") as f:
        f.write("\n".join(vystup) + "\n")
    for k in KORENE:
        shutil.rmtree(k, ignore_errors=True)
        shutil.copytree(tmp, k)
    shutil.rmtree(tmp)
    velkost = sum(os.path.getsize(os.path.join(KORENE[0], s)) for s in os.listdir(KORENE[0]))
    print(f"{len(subory)} súborov písma, {len(vystup) - 1} @font-face, spolu {velkost // 1024} kB → " + ", ".join(KORENE))


if __name__ == "__main__":
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    main()
