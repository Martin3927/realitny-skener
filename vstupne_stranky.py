#!/usr/bin/env python3
"""Samostatné stránky predajného webu pre platené reklamy.

    docs/web/skener.html      → https://realitnytypek.sk/skener
    docs/web/osobny-web.html  → https://realitnytypek.sk/osobny-web

Skladajú sa z hlavnej stránky docs/web/index.html (rovnaké štýly, skripty, formulár aj sekcie),
len bez menu a bez častí, ktoré s témou reklamy nesúvisia. Po zmene hlavnej stránky ich stačí
znova vygenerovať:  python3 vstupne_stranky.py
Pekné adresy bez .html zariaďuje .htaccess v nasadení (.github/workflows/nasadenie.yml).
"""
import os
import re

KOREN = os.path.dirname(os.path.abspath(__file__))
WEB = os.path.join(KOREN, 'docs', 'web')
t = open(os.path.join(WEB, 'index.html'), encoding='utf8').read()


def medzi(a, b):
    i = t.index(a)
    return t[i:t.index(b, i)]


HEAD = t[:t.index('</head>')]
TELO_ZAC = t[t.index('<body>'):t.index('<!-- NAV -->')]
S = {
    'hero': medzi('<!-- HERO -->', '<!-- SKENER -->'),
    'skener': medzi('<!-- SKENER -->', '<!-- OSOBNY WEB -->'),
    'web': medzi('<!-- OSOBNY WEB -->', '<!-- SPRÁVA PONÚK A SOCIÁLNE SIETE -->'),
    'funkcie': medzi('<!-- SPRÁVA PONÚK A SOCIÁLNE SIETE -->', '<!-- PRIBEH -->'),
    'cennik': medzi('<!-- CENNÍK: BALÍKY -->', '<!-- OD ZACIATKU -->'),
    'zadarmo': medzi('<!-- K SKENERU ZADARMO -->', '<!-- PRIPRAVUJEME -->'),
    'cta': medzi('<!-- CTA -->', '<!-- NA WEBE PRACUJEME -->'),
}
i = t.index('<!-- SÚHLAS S COOKIES -->')
j = t.index('<script>', i)
COOKIES = t[i:j]
SKRIPTY = t[j:]

CSS = '''
/* ===== samostatné stránky pre reklamy (vstupne_stranky.py) */
.lp-cta{min-height:46px;padding:0 20px;font-size:15px}
@media (max-width: 420px){.lp-wm{display:none}}
@media (min-width: 680px){.pk-grid--2{grid-template-columns:repeat(2,minmax(0,1fr));max-width:920px;margin-left:auto;margin-right:auto}}
@media (min-width: 1140px){.pk-grid--2{grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}.pk-grid--2 .pk{padding:28px 26px 30px}.pk-grid--2 .pk h3{font-size:30px}.pk-grid--2 .pk-suma{font-size:46px}.pk-grid--2 .pk .btn{font-size:16px}}
.faq{max-width:860px;margin:44px auto 0;display:flex;flex-direction:column;gap:10px}
.faq details{border-radius:20px;background:#FFFDF8;box-shadow:0 1px 0 rgba(30,42,53,.05),0 18px 34px -30px rgba(30,42,53,.5)}
.faq summary{list-style:none;cursor:pointer;position:relative;padding:20px 64px 20px 24px;font-size:17px;font-weight:700;line-height:1.4;color:#1E2A35}
.faq summary::-webkit-details-marker{display:none}
.faq summary::after{content:'+';position:absolute;right:20px;top:50%;width:30px;height:30px;margin-top:-15px;border-radius:99px;background:#EEE6D6;color:#4A6074;display:grid;place-items:center;font-size:20px;font-weight:700;line-height:1;transition:transform .25s ease,background .25s ease}
.faq details[open] summary::after{transform:rotate(45deg);background:#DB9522;color:#1E2A35}
.faq summary:focus-visible{outline:3px solid #DB9522;outline-offset:2px;border-radius:20px}
.faq p{margin:0;padding:0 24px 22px;font-size:16px;line-height:1.6;color:#3A4B5A}
'''


def hlavicka(head, nazov, popis, adresa):
    h = head
    h = re.sub(r'<title>.*?</title>', '<title>%s</title>' % nazov, h, count=1)
    h = re.sub(r'<meta name="description" content="[^"]*">', '<meta name="description" content="%s">' % popis, h, count=1)
    h = h.replace('<meta property="og:url" content="https://realitnytypek.sk/">',
                  '<meta property="og:url" content="%s">\n<link rel="canonical" href="%s">' % (adresa, adresa))
    h = re.sub(r'<meta property="og:title" content="[^"]*">', '<meta property="og:title" content="%s">' % nazov, h, count=1)
    h = re.sub(r'<meta property="og:description" content="[^"]*">', '<meta property="og:description" content="%s">' % popis, h, count=1)
    k = h.rindex('</style>')
    return h[:k] + CSS + h[k:] + '</head>\n'


MENU = '''<!-- NAV -->
<header id="top" class="hdr">
<nav aria-label="Hlavné menu" style="max-width: 1200px; margin: 0 auto; padding: 22px 24px; display: flex; align-items: center; justify-content: space-between; gap: 16px">
<a href="./" style="display: flex; align-items: center; gap: 12px; text-decoration: none; color: #1E2A35" title="Hlavná stránka Realitného týpka">
<img src="typek-head.png?v=202610251300" alt="" width="50" height="50" style="display: block; flex: none; width: 50px; height: 50px">
<span class="wm lp-wm" style="font-size: 24px"><span class="wm-a">Realitný</span> <span class="wm-b">týpek</span></span>
</a>
<a class="btn btn-ink lp-cta" href="#pristup">Vyskúšať zadarmo</a>
</nav>
</header>

'''

PATA = '''<!-- FOOTER -->
<footer style="max-width: 1200px; margin: 0 auto; padding: 10px 24px 48px; display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 18px; font-size: 14px; color: #4A6074">
<div style="display: flex; align-items: center; gap: 12px">
<img src="typek-head.png?v=202610251300" alt="" width="40" height="40" style="display: block; flex: none; width: 40px; height: 40px">
<span><span class="wm" style="font-size: 15px"><span class="wm-a">Realitný</span> <span class="wm-b">týpek</span></span> – softvér od realitnej kancelárie <a href="https://www.alphareality.sk/">Alpha Reality</a></span>
</div>
<div style="display: flex; flex-wrap: wrap; gap: 20px">
<a href="./">Hlavná stránka</a>
<a href="mailto:info@realitnytypek.sk">info@realitnytypek.sk</a>
<a href="ochrana-udajov.html">Ochrana osobných údajov</a>
<button type="button" class="linkbtn" data-ck-act="reopen">Nastavenia cookies</button>
<span>© 2026 Realitný týpek</span>
</div>
</footer>

'''


def otazky(zoznam):
    h = ['''<!-- ČASTÉ OTÁZKY -->
<section id="otazky" style="max-width: 1200px; margin: 0 auto; padding: 100px 24px 0">
<div style="text-align: center">
<div style="font-size: 13px; font-weight: 700; letter-spacing: 0.12em; color: #4A6074">ČASTÉ OTÁZKY</div>
<h2 style="margin: 14px 0 0; font-size: clamp(34px, 4.4vw, 56px); line-height: 1.02; letter-spacing: -0.03em; font-weight: 800">Čo ťa môže zaujímať</h2>
</div>
<div class="faq">''']
    for q, a in zoznam:
        h.append('<details><summary>%s</summary><p>%s</p></details>' % (q, a))
    h.append('</div>\n</section>\n\n')
    return '\n'.join(h)


def cennik(karty):
    c = S['cennik']
    vsetky = re.findall(r'<article class="pk[^"]*">.*?</article>\n?', c, re.S)
    assert len(vsetky) == 4, len(vsetky)
    vyber = [k for k in vsetky if any('data-bal="%s"' % b in k for b in karty)]
    assert len(vyber) == len(karty)
    a = c.index('<div class="pk-grid">') + len('<div class="pk-grid">\n')
    b = c.index('</div>\n</div>\n\n<div class="pk-pata">')
    return (c[:a] + ''.join(vyber) + c[b:]).replace('<div class="pk-grid">', '<div class="pk-grid pk-grid--2">', 1)


def zadarmo_bez_viac():
    z = S['zadarmo']
    i = z.index('<div style="margin-top: 20px; border-radius: 26px; background: #EEE6D6')
    z = z[:i].rstrip('\n') + '\n</section>\n\n'
    return z.replace('padding: 110px 24px 0">', 'padding: 0 24px 0">', 1)


def stranka(subor, bal, nazov, popis, adresa, telo):
    html = (hlavicka(HEAD, nazov, popis, adresa)
            + TELO_ZAC.replace('<body>', '<body data-bal="%s">' % bal, 1)
            + MENU + telo + S['cta'] + PATA + COOKIES + SKRIPTY)
    # na samostatnej stránke nie sú odkazy na časti hlavnej stránky
    for chyba in ['href="#osobny-web"', 'href="#nahlad"', 'href="#pribeh"', 'href="#pripravujeme"', 'href="#funkcie"', 'href="#zadarmo"']:
        if chyba in telo and chyba[7:-1] not in re.findall(r'<section id="([^"]+)"', telo):
            raise SystemExit('%s: odkaz %s vedie mimo stránky' % (subor, chyba))
    open(os.path.join(WEB, subor), 'w', encoding='utf8').write(html)
    print(subor, len(html) // 1024, 'kB', re.findall(r'<section id="([^"]+)"', html))


# ---------------------------------------------------------------- Realitný skener
stranka('skener.html', 'skener',
        'Realitný skener – nové inzeráty súkromníkov ako prvý | Realitný týpek',
        'Týpek cez deň každých 10 minút prejde Bazoš, Nehnuteľnosti.sk, Reality.sk a TopReality a nový inzerát súkromníka ti hneď pošle do mobilu. 21 € mesačne s DPH, 30 dní zadarmo.',
        'https://realitnytypek.sk/skener',
        S['hero'] + S['skener'] + zadarmo_bez_viac() + cennik(['skener', 'jednotlivec']) + otazky([
            ('Z ktorých portálov skener berie inzeráty?',
             'Z Bazoša, Nehnuteľností.sk, Reality.sk a TopReality. Cez deň ich Týpek prejde každých 10 minút v okresoch, ktoré si vyberieš.'),
            ('Ako sa dozviem, že pribudol nový inzerát?',
             'Inzerát sa ukáže navrchu skenera a do mobilu ti príde upozornenie. Prevezmeš ho jedným klikom a môžeš volať.'),
            ('Čo keď skener používa viac maklérov v kancelárii?',
             'Kto inzerát prevezme, toho je. Kolegovia hneď vidia, že je tvoj, takže nikto nevolá tomu istému majiteľovi dvakrát.'),
            ('Koľko okresov môžem sledovať?',
             'Koľko chceš. Prvý okres je za 21 € mesačne s DPH, každý ďalší za 2 € mesačne.'),
            ('Musím niečo inštalovať?',
             'Nie. Týpek je webová aplikácia, funguje na počítači aj v mobile. Do mobilu si ho pridáš ako ikonu a upozornenia ti budú chodiť ako správy.'),
            ('Môžem to najprv vyskúšať?',
             'Áno, 30 dní zadarmo. Potom platíš mesačne, ceny sú vždy s DPH. Keď zaplatíš na rok dopredu, máš mesiac zdarma.'),
        ]))

# ---------------------------------------------------------------- Osobný web makléra
web = S['web'].replace('padding: 0 24px 110px">', 'padding: 24px 24px 110px">', 1)
web = re.sub(r'<h2( style="[^"]*">Tvoj vlastný realitný web\. Bez programátora\.)</h2>', r'<h1\1</h1>', web, count=1)
assert '<h1 ' in web
stranka('osobny-web.html', 'web',
        'Osobný web makléra bez programátora | Realitný týpek',
        'Vlastný realitný web s ponukami, recenziami, doménou a hostingom. Ponuky aj web si upravuješ sám. 57 € mesačne s DPH, Realitný skener k nemu za polovicu, 30 dní zadarmo.',
        'https://realitnytypek.sk/osobny-web',
        web + S['funkcie'] + cennik(['web', 'jednotlivec']) + otazky([
            ('Potrebujem programátora alebo grafika?',
             'Nie. Šablónu, farbu, fotku aj texty si nastavíš sám v Týpkovi. Web vyzerá dobre na počítači aj v mobile.'),
            ('Ako sa na web dostanú moje ponuky?',
             'Samé. Ponuku pridáš alebo upravíš v Týpkovi a na webe je to hneď. Fotky, cenu, stav aj texty zmeníš kedykoľvek.'),
            ('Čo keď už mám vlastnú doménu?',
             'Pripojíš ju k webu, alebo ti vybavíme novú. Doména s HTTPS a hosting 1 GB sú v cene webu.'),
            ('Kam mi prídu správy z webu?',
             'Rovno do Týpka a upozornenie aj do mobilu, takže ti žiadny záujemca neujde.'),
            ('Môžem mať k webu aj Realitný skener?',
             'Áno, s osobným webom máš Realitný skener za polovicu – od 10,50 € mesačne s DPH. Spolu je to balík Jednotlivec.'),
            ('Môžem to najprv vyskúšať?',
             'Áno, 30 dní zadarmo. Potom platíš mesačne, ceny sú vždy s DPH. Keď zaplatíš na rok dopredu, máš mesiac zdarma.'),
        ]))
