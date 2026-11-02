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


def hlavicka(head, nazov, popis, adresa, css=''):
    h = head
    h = re.sub(r'<title>.*?</title>', '<title>%s</title>' % nazov, h, count=1)
    h = re.sub(r'<meta name="description" content="[^"]*">', '<meta name="description" content="%s">' % popis, h, count=1)
    h = h.replace('<meta property="og:url" content="https://realitnytypek.sk/">',
                  '<meta property="og:url" content="%s">\n<link rel="canonical" href="%s">' % (adresa, adresa))
    h = re.sub(r'<meta property="og:title" content="[^"]*">', '<meta property="og:title" content="%s">' % nazov, h, count=1)
    h = re.sub(r'<meta property="og:description" content="[^"]*">', '<meta property="og:description" content="%s">' % popis, h, count=1)
    k = h.rindex('</style>')
    return h[:k] + CSS + css + h[k:] + '</head>\n'


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
    return (c[:a] + ''.join(vyber) + c[b:]).replace('<div class="pk-grid">', '<div class="pk-grid pk-grid--%d">' % len(karty), 1)


def nahrad(text, stare, nove, pocet=1):
    """Nahradí presne `pocet` výskytov – keď sa hlavná stránka zmení a text nesedí, generovanie skončí chybou."""
    assert text.count(stare) == pocet, 'nesedí (%d×): %s' % (text.count(stare), stare[:90])
    return text.replace(stare, nove)


def zadarmo_bez_viac():
    z = S['zadarmo']
    i = z.index('<div style="margin-top: 20px; border-radius: 26px; background: #EEE6D6')
    z = z[:i].rstrip('\n') + '\n</section>\n\n'
    return z.replace('padding: 110px 24px 0">', 'padding: 0 24px 0">', 1)


def stranka(subor, bal, nazov, popis, adresa, telo, cta=None, css='', js=''):
    skripty = SKRIPTY
    if js:
        k = skripty.rindex('</body>')
        skripty = skripty[:k] + js + skripty[k:]
    html = (hlavicka(HEAD, nazov, popis, adresa, css)
            + TELO_ZAC.replace('<body>', '<body data-bal="%s">' % bal, 1)
            + MENU + telo + (S['cta'] if cta is None else cta) + PATA + COOKIES + skripty)
    # na samostatnej stránke nie sú odkazy na časti hlavnej stránky
    for chyba in ['href="#osobny-web"', 'href="#nahlad"', 'href="#pribeh"', 'href="#pripravujeme"', 'href="#funkcie"', 'href="#zadarmo"']:
        if chyba in telo and chyba[7:-1] not in re.findall(r'<section id="([^"]+)"', telo):
            raise SystemExit('%s: odkaz %s vedie mimo stránky' % (subor, chyba))
    open(os.path.join(WEB, subor), 'w', encoding='utf8').write(html)
    print(subor, len(html) // 1024, 'kB', re.findall(r'<section id="([^"]+)"', html))


# ---------------------------------------------------------------- Realitný skener
# Stránka /skener je len o skeneri: bez správ od kolegov a bez chatu, s náhľadom na počítači, pripomínačom,
# počítadlom okresov v cenníku, balíkom s osobným webom, balíkom pre celú kanceláriu a objednávkou s okresmi.

# všetkých 79 okresov SR podľa krajov (názvy presne ako v tabuľke lokality v Supabase)
KRAJE = [
    ('Bratislavský kraj', ['Bratislava I', 'Bratislava II', 'Bratislava III', 'Bratislava IV', 'Bratislava V', 'Malacky', 'Pezinok', 'Senec']),
    ('Trnavský kraj', ['Dunajská Streda', 'Galanta', 'Hlohovec', 'Piešťany', 'Senica', 'Skalica', 'Trnava']),
    ('Trenčiansky kraj', ['Bánovce nad Bebravou', 'Ilava', 'Myjava', 'Nové Mesto nad Váhom', 'Partizánske', 'Považská Bystrica', 'Prievidza', 'Púchov', 'Trenčín']),
    ('Nitriansky kraj', ['Komárno', 'Levice', 'Nitra', 'Nové Zámky', 'Šaľa', 'Topoľčany', 'Zlaté Moravce']),
    ('Žilinský kraj', ['Bytča', 'Čadca', 'Dolný Kubín', 'Kysucké Nové Mesto', 'Liptovský Mikuláš', 'Martin', 'Námestovo', 'Ružomberok', 'Turčianske Teplice', 'Tvrdošín', 'Žilina']),
    ('Banskobystrický kraj', ['Banská Bystrica', 'Banská Štiavnica', 'Brezno', 'Detva', 'Krupina', 'Lučenec', 'Poltár', 'Revúca', 'Rimavská Sobota', 'Veľký Krtíš', 'Zvolen', 'Žarnovica', 'Žiar nad Hronom']),
    ('Prešovský kraj', ['Bardejov', 'Humenné', 'Kežmarok', 'Levoča', 'Medzilaborce', 'Poprad', 'Prešov', 'Sabinov', 'Snina', 'Stará Ľubovňa', 'Stropkov', 'Svidník', 'Vranov nad Topľou']),
    ('Košický kraj', ['Gelnica', 'Košice I', 'Košice II', 'Košice III', 'Košice IV', 'Košice-okolie', 'Michalovce', 'Rožňava', 'Sobrance', 'Spišská Nová Ves', 'Trebišov']),
]
assert sum(len(o) for _, o in KRAJE) == 79

FAJKA = '<svg width="%d" height="%d" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="%s" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"></path></svg>'
ZVONCEK = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15z"></path><path d="M10 20.5a2.2 2.2 0 0 0 4 0"></path></svg>'
MONITOR = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="12" rx="2"></rect><path d="M8 20h8M12 16v4"></path></svg>'
LI = '<li><span class="pk-ck">' + (FAJKA % (12, 12, '3.2')) + '</span><span>%s</span></li>'


def skener_sekcia():
    s = S['skener']
    # bez správy od Tiny – na zamknutom mobile je len upozornenie skenera
    s = re.sub(r'<div class="zm-n zm-n2">.*?</div>\n', '', s, count=1, flags=re.S)
    s = nahrad(s, 'Zamknutý mobil s dvoma upozorneniami z Realitného týpka: nový súkromný inzerát na 2-izbový byt v centre mesta a správa od Tiny.',
               'Zamknutý mobil s upozornením z Realitného týpka: nový súkromný inzerát na 2-izbový byt v centre mesta.')
    assert 'Tina' not in s and 'Tiny' not in s, 'zostala zmienka o Tine'
    # 3. krok bez kolegov: si prvý pred konkurenciou
    s = nahrad(s, '<strong>Prevezmeš a voláš</strong>kolegovia vidia, že je tvoj. Zapíšeš hovor, pošleš SMS, otvoríš kataster.',
               '<strong>Voláš a píšeš ako prvý</strong>Inzerát uvidíš skôr ako konkurencia, takže majiteľovi voláš a píšeš ako prvý. To ti omnoho zvyšuje šancu na predaj.')
    # pripomínač pod krokmi
    s = nahrad(s, '</ol>\n<div class="wapp">',
               '</ol>\n<div class="pripo"><span class="pripo-ic">' + ZVONCEK + '</span><span class="pripo-t"><strong>Pripomínač, aby si nezabudol zavolať</strong>'
               'Predávajúci povie „zavolajte podvečer“? Pri inzeráte si jedným klikom nastavíš pripomienku a Týpek ti v ten čas pripomenie, '
               'komu máš volať – aj upozornením v mobile.</span></div>\n<div class="wapp">')
    # náhľad na počítači pod mobilmi (cez celú šírku tmavej karty)
    pc = ('<div class="pc-nahlad">\n'
          '<div class="pc-hl"><div><span class="pc-ey">' + MONITOR + 'NA POČÍTAČI</span>'
          '<h3>Takto vyzerá skener na počítači</h3></div>'
          '<p>Všetko vidíš naraz: nový inzerát, telefón predajcu, hovor, SMS, pripomienku aj kataster.</p></div>\n'
          '<div class="pc-okno">\n'
          '<div class="pc-lista" aria-hidden="true"><span class="pc-bodky"><i></i><i></i><i></i></span>'
          '<span class="pc-adr">app.realitnytypek.sk · Realitný skener</span>'
          '<span class="pc-skut">' + (FAJKA % (14, 14, '2.6')) + 'Skutočný softvér</span></div>\n'
          '<a class="pc-shot" href="soft-skener.webp?v=202611021500" target="_blank" rel="noopener" title="Otvoriť náhľad vo veľkom"><img src="soft-skener.webp?v=202611021500" alt="Realitný skener na počítači: nové inzeráty súkromníkov s tlačidlami Prevziať, '
          'Zapísať hovor, SMS poslaná a Pripomenúť" width="1800" height="1125" loading="lazy"></a>\n'
          '</div>\n'
          '<p class="pc-pozn">Skutočný skener na počítači aj v mobile. Inzeráty na ukážke sú vymyslené.</p>\n'
          '</div>\n')
    s = nahrad(s, '<p style="margin: 22px 0 0; font-size: 13px; color: #8EA2B3; text-align: center">Skutočný skener a upozornenia v mobile. '
                  'Inzeráty a mená na ukážke sú vymyslené.</p>\n</div>\n</div>\n</section>',
               '</div>\n' + pc + '</div>\n</section>')
    assert 'koleg' not in s.lower(), 'v sekcii skenera ostali kolegovia'
    return s


def skener_zadarmo():
    z = zadarmo_bez_viac()
    # bez chatu s kolegami – ostáva kataster a kalendár
    i = z.rindex('<div class="feat fx"', 0, z.index('Chat s kolegami'))
    j = z.index('</div>\n</section>', i)
    z = z[:i] + z[j:]
    z = nahrad(z, 'Kataster a mapu, kalendár aj chat s kolegami máš k skeneru zadarmo.', 'Kataster a mapu aj kalendár máš k skeneru zadarmo.')
    z = nahrad(z, '<div class="feat-grid" style="margin-top: 48px">', '<div class="feat-grid fg2" style="margin-top: 48px">')
    assert 'koleg' not in z.lower() and z.count('class="feat fx"') == 2
    return z


def skener_cennik():
    c = cennik(['skener', 'jednotlivec', 'kancelaria'])
    # skener: počítadlo okresov – cena sa hneď prepočíta (prvý okres 21 €, každý ďalší +2 € mesačne)
    c = nahrad(c, '<b data-m>21 €</b><b data-y>231 €</b>', '<b data-m data-okr-c="m">21 €</b><b data-y data-okr-c="y">231 €</b>')
    c = nahrad(c, '<span data-m>1 okres, každý ďalší +2 € mesačne</span><span data-y>1 okres, každý ďalší +22 € ročne</span>',
               '<span data-m><span data-okr-t>1 okres</span>, každý ďalší +2 € mesačne</span><span data-y><span data-okr-t>1 okres</span>, každý ďalší +22 € ročne</span>')
    c = nahrad(c, '<span data-m>Ročne 231 € – mesiac zdarma</span><span data-y>Ušetríš 21 € oproti mesačnej platbe</span></span></span></div>',
               '<span data-m>Ročne <span data-okr-c="y">231 €</span> – mesiac zdarma</span><span data-y>Ušetríš <span data-okr-c="m">21 €</span> oproti mesačnej platbe</span></span></span>'
               '<span class="okr-st"><span class="okr-st-l">Počet okresov<small>vyberieš ich v objednávke</small></span><span class="okr-st-c">'
               '<button type="button" data-okr-krok="-1" aria-label="Odobrať okres" disabled>−</button><output data-okr-pocet aria-live="polite">1</output>'
               '<button type="button" data-okr-krok="1" aria-label="Pridať okres">+</button></span></span></div>')
    c = nahrad(c, LI % 'Upozornenie hneď v mobile', LI % 'Upozornenie hneď v mobile' + LI % 'Pripomínač, aby si nezabudol zavolať')
    c = nahrad(c, '<span>Kataster a mapa, kalendár a chat zadarmo</span>', '<span>Kataster a mapa aj kalendár zadarmo</span>')
    # balík s osobným webom makléra + odkaz na stránku osobného webu
    c = nahrad(c, '<h3>Jednotlivec</h3><p>Skener aj vlastný web pre makléra, ktorý chce všetko.</p>',
               '<h3>Jednotlivec</h3><p>Realitný skener spolu s osobným webom makléra. Skener máš k webu za polovicu.</p>'
               '<a class="pk-link" href="osobny-web">Pozri, ako vyzerá osobný web →</a>')
    # správa celej realitnej kancelárie
    c = nahrad(c, '<h3>Realitná kancelária</h3><p>Celý softvér pre váš tím, pripravený na mieru.</p>',
               '<h3>Realitná kancelária</h3><p>Správa celej realitnej kancelárie v jednom softvéri, pripravená na mieru.</p>')
    return c


def skener_objednavka():
    moznosti = ''.join('<optgroup label="%s">%s</optgroup>' % (k, ''.join('<option>%s</option>' % o for o in okr)) for k, okr in KRAJE)
    return '''<!-- CTA: OBJEDNÁVKA -->
<section id="pristup" style="max-width: 1200px; margin: 0 auto; padding: 110px 24px 90px">
<div class="obj-obal">
<div class="obj-uvod">
<span class="obj-badge">14 DNÍ ZADARMO</span>
<h2 style="margin: 16px 0 0; font-size: clamp(32px, 3.6vw, 48px); line-height: 1.04; letter-spacing: -0.035em; font-weight: 800">Objednaj si skener.<br>Prvých 14 dní zadarmo.</h2>
<p style="margin: 18px 0 0; font-size: 18px; line-height: 1.55; color: #3A4B5A">Vyber si balík a okresy, ktoré ti má Týpek strážiť. Prvých 14 dní neplatíš nič, potom platíš mesačne len za to, čo používaš. Ozveme sa ti osobne.</p>
<ul class="obj-plusy"><li>%(f)sVšetky kraje a okresy Slovenska</li><li>%(f)sĎalší okres len za 2 € mesačne</li><li>%(f)sZmena balíka kedykoľvek</li></ul>
<div class="obj-typek"><img class="mfloat" src="typek.png?v=202610251300" alt="Maskot Realitný týpek" style="display: block; width: 100%%; height: auto; filter: drop-shadow(0 18px 22px rgba(30,42,53,.25))"></div>
</div>
<form id="rt-obj" class="obj" novalidate aria-label="Objednávka">
<fieldset class="obj-fs">
<legend class="obj-k"><span class="obj-n">1</span>Balík</legend>
<div class="obj-bal">
<label class="obj-b"><input type="radio" name="bal" value="skener" checked><span><b>Realitný skener</b><small data-obj-bc="skener">21 € mesačne</small></span></label>
<label class="obj-b"><input type="radio" name="bal" value="jednotlivec"><span><b>Skener + osobný web</b><small data-obj-bc="jednotlivec">67,50 € mesačne</small></span></label>
<label class="obj-b"><input type="radio" name="bal" value="kancelaria"><span><b>Realitná kancelária</b><small>cena na mieru</small></span></label>
</div>
</fieldset>
<fieldset class="obj-fs">
<legend class="obj-k"><span class="obj-n">2</span>Okresy, ktoré ti Týpek stráži</legend>
<div class="obj-f"><label class="obj-l" for="obj-okr-0">Hlavný okres</label>
<select id="obj-okr-0" class="obj-in" data-okr required><option value="">Vyber hlavný okres</option>%(m)s</select></div>
<div class="obj-dalsie" data-obj-dalsie></div>
<button type="button" class="obj-plus" data-obj-plus><i aria-hidden="true">+</i>Pridať ďalší okres <small data-obj-plus-c>+2 € mesačne</small></button>
</fieldset>
<fieldset class="obj-fs">
<legend class="obj-k"><span class="obj-n">3</span>Kontakt</legend>
<div class="obj-2" data-obj-kanc hidden>
<label class="obj-f"><span class="obj-l">Názov kancelárie</span><input class="obj-in" name="kancelaria" autocomplete="organization" maxlength="160"></label>
<label class="obj-f"><span class="obj-l">Počet maklérov</span><input class="obj-in" name="pocet" type="number" min="1" max="500" inputmode="numeric" placeholder="napr. 5"></label>
</div>
<div class="obj-2">
<label class="obj-f"><span class="obj-l">Meno a priezvisko</span><input class="obj-in" name="meno" autocomplete="name" maxlength="120" required></label>
<label class="obj-f"><span class="obj-l">Telefón</span><input class="obj-in" name="telefon" type="tel" autocomplete="tel" maxlength="30" placeholder="0900 123 456" required></label>
</div>
<label class="obj-f"><span class="obj-l">E-mail</span><input class="obj-in" name="email" type="email" autocomplete="email" maxlength="200" placeholder="meno@realitka.sk" required></label>
</fieldset>
<div class="obj-sum">
<div class="obj-sum-c"><small>Po 14 dňoch zadarmo</small><b data-obj-suma>21 €</b><span data-obj-det>mesačne s DPH · skener 21 €</span></div>
<div class="seg-wrap" role="group" aria-label="Platba"><button type="button" class="seg seg-on" aria-pressed="true" data-calc="pay" data-key="m">Mesačne</button><button type="button" class="seg" aria-pressed="false" data-calc="pay" data-key="y">Ročne <small>mesiac zdarma</small></button></div>
</div>
<button type="submit" class="btn btn-acc obj-odosli">Objednať – 14 dní zadarmo</button>
<p id="rt-note" class="obj-note" aria-live="polite">Žiadny spam. Údaje použijeme len na vybavenie objednávky – viac v <a href="ochrana-udajov.html">Ochrane osobných údajov</a>.</p>
</form>
</div>
</section>

''' % {'m': moznosti, 'f': FAJKA % (16, 16, '2.6')}


SKENER_CSS = '''/* ===== /skener: pripomínač, náhľad na počítači, tri balíky, počítadlo okresov, objednávka */
.pripo{display:flex;gap:14px;align-items:flex-start;padding:14px 16px;border-radius:18px;background:rgba(219,149,34,.13);box-shadow:inset 0 0 0 1.5px rgba(219,149,34,.42)}
.pripo-ic{flex:none;width:40px;height:40px;border-radius:12px;background:#DB9522;color:#1E2A35;display:grid;place-items:center;transform-origin:50% 10%}
.pripo-t{min-width:0;font-size:14.5px;line-height:1.5;color:#C9D4DD}
.pripo-t strong{display:block;font-size:16px;color:#F7F2E8}
@keyframes zvon{0%,78%,100%{transform:none}82%{transform:rotate(14deg)}86%{transform:rotate(-12deg)}90%{transform:rotate(8deg)}94%{transform:rotate(-4deg)}}
.vid .pripo-ic{animation:zvon 4.5s ease-in-out infinite}
@media (prefers-reduced-motion: reduce){html:not(.pohyb-vzdy) .pripo-ic{animation:none}}
.pc-nahlad{flex:1 1 100%;min-width:0;display:flex;flex-direction:column;gap:18px;padding-top:34px;border-top:1px solid rgba(247,242,232,.12)}
.pc-hl{display:flex;flex-wrap:wrap;align-items:flex-end;justify-content:space-between;gap:10px 32px}
.pc-ey{display:inline-flex;align-items:center;gap:8px;color:#DB9522;font-size:12px;font-weight:700;letter-spacing:.1em}
.pc-hl h3{margin:8px 0 0;font-size:clamp(24px,2.6vw,32px);line-height:1.1;letter-spacing:-.02em;font-weight:800;color:#F7F2E8}
.pc-hl p{margin:0;max-width:440px;font-size:16px;line-height:1.5;color:#C9D4DD}
.pc-okno{border-radius:22px;background:#2F4152;padding:10px;box-shadow:0 50px 90px -46px rgba(0,0,0,.85)}
.pc-lista{display:flex;align-items:center;gap:10px;padding:4px 6px 12px}
.pc-bodky{flex:none;display:flex;gap:6px}.pc-bodky i{width:11px;height:11px;border-radius:9px;background:#4A6074}
.pc-adr{flex:1 1 120px;min-width:0;padding:6px 12px;border-radius:8px;background:#1E2A35;color:#C9D4DD;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pc-skut{flex:none;display:inline-flex;align-items:center;gap:6px;padding:5px 10px;border-radius:999px;background:#DB9522;color:#1E2A35;font-size:12px;font-weight:800;white-space:nowrap}
.pc-shot{display:block;border-radius:14px;overflow:hidden;background:#F5F4F0;aspect-ratio:1800/1125;cursor:zoom-in}
.pc-shot img{display:block;width:100%;height:auto}
.pc-pozn{margin:0;font-size:13px;color:#8EA2B3;text-align:center}
@media (max-width: 520px){.pc-skut{display:none}.pc-okno{border-radius:16px;padding:6px}.pc-lista{padding:2px 4px 8px}.pc-shot{border-radius:10px}}
@media (min-width: 680px){.pk-grid--3{grid-template-columns:repeat(2,minmax(0,1fr))}.pk-grid--3>.pk:nth-child(3){grid-column:1/-1}}
@media (min-width: 1000px){.pk-grid--3{grid-template-columns:repeat(3,minmax(0,1fr));gap:18px}.pk-grid--3>.pk:nth-child(3){grid-column:auto}}
.pk-link{align-self:flex-start;margin-top:4px;color:#DB9522;font-size:14.5px;font-weight:800;text-decoration:none}
.pk-link:hover{color:#F2E4C6;text-decoration:underline}
.okr-st{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:12px;padding:7px 7px 7px 14px;border-radius:999px;background:#F2E4C6}
.okr-st-l{display:flex;flex-direction:column;font-size:13.5px;font-weight:800;line-height:1.25;color:#1E2A35}
.okr-st-l small{font-size:11.5px;font-weight:600;color:#8A5A2B}
.okr-st-c{flex:none;display:inline-flex;align-items:center;gap:4px}
.okr-st button{width:36px;height:36px;padding:0;border-radius:99px;border:0;background:#1E2A35;color:#F7F2E8;font:inherit;font-size:20px;font-weight:800;line-height:1;cursor:pointer;display:grid;place-items:center;transition:background .2s,opacity .2s}
.okr-st button:hover{background:#4A6074}
.okr-st button:disabled{opacity:.3;cursor:default;background:#1E2A35}
.okr-st output{min-width:30px;text-align:center;font-family:'Bricolage Grotesque',sans-serif;font-size:18px;font-weight:800;font-variant-numeric:tabular-nums}
.obj-obal{border-radius:40px;background:#EEE6D6;padding:clamp(20px,4.5vw,56px);display:flex;flex-wrap:wrap;align-items:flex-start;gap:34px 48px}
.obj-uvod{flex:1 1 320px;min-width:0;display:flex;flex-direction:column}
.obj-badge{align-self:flex-start;display:inline-flex;padding:6px 14px;border-radius:999px;background:#1E2A35;color:#DB9522;font-size:13px;font-weight:800;letter-spacing:.08em}
.obj-plusy{list-style:none;margin:22px 0 0;padding:0;display:flex;flex-direction:column;gap:10px}
.obj-plusy li{display:flex;align-items:center;gap:10px;font-size:15.5px;font-weight:700;color:#1E2A35}
.obj-plusy svg{flex:none;width:26px;height:26px;padding:5px;box-sizing:border-box;border-radius:99px;background:#DB9522;color:#1E2A35}
.obj-typek{width:100%;max-width:230px;margin:30px auto 0}
@media (max-width: 860px){.obj-typek{display:none}}
.obj{flex:1.5 1 440px;min-width:0;display:flex;flex-direction:column;gap:22px;padding:clamp(18px,3vw,32px);border-radius:28px;background:#FFFDF8;box-shadow:0 1px 0 rgba(30,42,53,.05),0 34px 64px -44px rgba(30,42,53,.6)}
.obj-fs{min-width:0;margin:0;padding:0;border:0;display:flex;flex-direction:column;gap:12px}
.obj-k{display:flex;align-items:center;gap:10px;padding:0;margin:0 0 12px;font-family:'Bricolage Grotesque','Instrument Sans',sans-serif;font-size:19px;font-weight:800;letter-spacing:-.01em;color:#1E2A35}
.obj-n{flex:none;width:28px;height:28px;border-radius:99px;background:#1E2A35;color:#DB9522;display:grid;place-items:center;font-size:14px}
.obj-bal{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
.obj-b{position:relative;display:block;cursor:pointer}
.obj-b input{position:absolute;opacity:0;pointer-events:none}
.obj-b span{display:flex;flex-direction:column;gap:3px;height:100%;box-sizing:border-box;padding:12px 14px;border-radius:16px;border:1.5px solid #E2D8C4;background:#FFFDF8;transition:background .2s,border-color .2s,color .2s}
.obj-b b{font-size:15px;line-height:1.25}
.obj-b small{font-size:13px;font-weight:700;color:#4A6074}
.obj-b:hover span{border-color:#4A6074}
.obj-b input:checked+span{background:#1E2A35;border-color:#1E2A35;color:#F7F2E8}
.obj-b input:checked+span small{color:#DB9522}
.obj-b input:focus-visible+span{outline:3px solid #DB9522;outline-offset:2px}
.obj-f{display:flex;flex-direction:column;gap:6px;min-width:0}
.obj-l{font-size:13.5px;font-weight:700;color:#3A4B5A}
.obj-in{width:100%;min-width:0;box-sizing:border-box;min-height:50px;padding:0 14px;border-radius:14px;border:1.5px solid #C9D4DD;background:#FFFDF8;font:inherit;font-size:16px;color:#1E2A35}
.obj-in:focus{outline:3px solid #DB9522;outline-offset:1px;border-color:#1E2A35}
select.obj-in{-webkit-appearance:none;appearance:none;padding-right:42px;cursor:pointer;background:#FFFDF8 url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%234A6074' stroke-width='2.4' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E") no-repeat right 14px center}
.obj-in.obj-chyba{border-color:#B4432F;box-shadow:0 0 0 3px rgba(180,67,47,.15)}
.obj-dalsie{display:flex;flex-direction:column;gap:8px}
.obj-dalsie:not(:empty)::before{content:'Ďalšie okresy';font-size:13.5px;font-weight:700;color:#3A4B5A}
.obj-r{display:flex;gap:8px;align-items:center}
.obj-r .obj-in{flex:1}
.obj-x{flex:none;width:46px;height:46px;padding:0;border:0;border-radius:14px;background:#EEE6D6;color:#4A6074;font:inherit;font-size:24px;line-height:1;cursor:pointer;transition:background .2s,color .2s}
.obj-x:hover{background:#1E2A35;color:#F7F2E8}
.obj-plus{align-self:flex-start;display:inline-flex;flex-wrap:wrap;align-items:center;gap:4px 10px;min-height:46px;padding:5px 18px 5px 6px;border-radius:999px;border:1.5px dashed #4A6074;background:transparent;color:#1E2A35;font:inherit;font-size:15px;font-weight:800;cursor:pointer;transition:background .2s,border-color .2s}
.obj-plus:hover{background:#F2E4C6;border-color:#1E2A35}
.obj-plus:disabled{opacity:.4;cursor:default}
.obj-plus i{flex:none;width:34px;height:34px;border-radius:99px;background:#DB9522;color:#1E2A35;display:grid;place-items:center;font-style:normal;font-size:22px;font-weight:800;line-height:1}
.obj-plus small{font-size:13px;font-weight:700;color:#8A5A2B}
.obj-2{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
.obj-sum{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:14px 20px;padding:16px 18px;border-radius:20px;background:#1E2A35;color:#F7F2E8}
.obj-sum-c{display:flex;flex-direction:column;gap:2px;min-width:0}
.obj-sum-c small{font-size:12.5px;font-weight:700;letter-spacing:.04em;color:#8EA2B3;text-transform:uppercase}
.obj-sum-c b{font-family:'Bricolage Grotesque','Instrument Sans',sans-serif;font-size:34px;line-height:1.05;font-weight:800;letter-spacing:-.02em;color:#DB9522;font-variant-numeric:tabular-nums}
.obj-sum-c span{font-size:13.5px;line-height:1.4;color:#C9D4DD}
.obj-sum .seg-wrap{flex:0 0 auto;min-width:280px}
.obj-sum .seg small{white-space:nowrap}
.obj-odosli{width:100%;min-height:56px;font-size:17px;font-weight:800}
.obj-note{margin:-8px 0 0;font-size:14px;line-height:1.55;color:#4A6074}
.obj-note.obj-zle{color:#B4432F;font-weight:700}
.obj-note.obj-ok{padding:12px 14px;border-radius:14px;background:#E3E9DF;color:#2E5A3A;font-weight:700}
@media (max-width: 560px){.obj-bal,.obj-2{grid-template-columns:minmax(0,1fr)}.obj-sum .seg-wrap{flex:1 1 100%;min-width:0}.obj-obal{border-radius:28px}.obj{border-radius:22px}}
'''


def skener_js():
    m = re.search(r"var SB='([^']+)',SBK='([^']+)'", SKRIPTY)
    assert m, 'v skripte chýba adresa Supabase'
    return '''<script>
/* OBJEDNÁVKA (/skener): balík, hlavný okres + ďalšie cez tlačidlo +, počítadlo okresov v cenníku, súhrn ceny s DPH */
(function(){
  var d=document,f=d.getElementById('rt-obj');if(!f)return;
  var SB='%s',SBK='%s';
  var CEN={sk:21,web:57,okr:2};
  var MOD={skener:['skener'],jednotlivec:['skener','web','ponuky','domena','email','kataster','kalendar','chat'],
    kancelaria:['kancelaria','skener','web','ponuky','klienti','domena','email','kataster','kalendar','chat']};
  var BN={skener:'Realitný skener',jednotlivec:'Skener + osobný web',kancelaria:'Realitná kancelária'};
  var hl=d.getElementById('obj-okr-0'),zoz=f.querySelector('[data-obj-dalsie]'),plus=f.querySelector('[data-obj-plus]'),note=d.getElementById('rt-note'),RID=0,BUSY=false;
  function $$(q,r){return [].slice.call((r||d).querySelectorAll(q));}
  function eur(n){var r=Math.round(n*100)/100,p=r.toFixed(2).split('.'),i=p[0].replace(/\\B(?=(\\d{3})+(?!\\d))/g,' ');return (p[1]==='00'?i:i+','+p[1])+' €';}
  function rocne(){var o=d.querySelector('.pk-obal');return !!o&&o.getAttribute('data-pay')==='y';}
  function bal(){var r=f.querySelector('input[name="bal"]:checked');return r?r.value:'skener';}
  function sel(){return $$('select[data-okr]',f);}
  function okresy(n){return n+' '+(n===1?'okres':n<5?'okresy':'okresov');}
  function prepocet(){
    var ss=sel(),k=ss.length,y=rocne(),m=y?11:1,b=bal(),bc={skener:CEN.sk,jednotlivec:CEN.web+CEN.sk/2};
    // okres vybraný v jednom poli sa v ostatných nedá vybrať druhýkrát
    var vyb=ss.map(function(s){return s.value;});
    ss.forEach(function(s){$$('option',s).forEach(function(o){if(o.value)o.disabled=o.value!==s.value&&vyb.indexOf(o.value)>-1;});});
    var M=CEN.sk+CEN.okr*(k-1);
    $$('[data-okr-pocet]').forEach(function(e){e.textContent=k;});
    $$('[data-okr-t]').forEach(function(e){e.textContent=okresy(k);});
    $$('[data-okr-c="m"]').forEach(function(e){e.textContent=eur(M);});
    $$('[data-okr-c="y"]').forEach(function(e){e.textContent=eur(M*11);});
    $$('[data-okr-krok="-1"]').forEach(function(e){e.disabled=k<=1;});
    $$('[data-okr-krok="1"]').forEach(function(e){e.disabled=k>=79;});
    plus.disabled=k>=79;
    plus.querySelector('[data-obj-plus-c]').textContent='+'+eur(CEN.okr*m)+(y?' ročne':' mesačne');
    $$('[data-obj-bc]',f).forEach(function(e){e.textContent=eur(bc[e.getAttribute('data-obj-bc')]*m)+(y?' ročne':' mesačne');});
    f.querySelector('[data-obj-kanc]').hidden=b!=='kancelaria';
    var su=f.querySelector('[data-obj-suma]'),de=f.querySelector('[data-obj-det]');
    if(b==='kancelaria'){su.textContent='Na mieru';de.textContent='podľa veľkosti tímu · skener pre '+okresy(k);}
    else{su.textContent=eur((bc[b]+CEN.okr*(k-1))*m);
      de.textContent=(y?'ročne':'mesačne')+' s DPH · '+(b==='jednotlivec'?'web '+eur(CEN.web*m)+' + skener '+eur(CEN.sk/2*m):'skener '+eur(CEN.sk*m))
        +(k>1?' + '+(k-1)+' × '+eur(CEN.okr*m)+' za ďalšie okresy':'');}
  }
  function pridaj(fokus){
    if(sel().length>=79)return;
    var i=++RID,w=d.createElement('div'),s=hl.cloneNode(true),l=d.createElement('label'),x=d.createElement('button');
    w.className='obj-r';s.id='obj-okr-'+i;s.required=false;s.classList.remove('obj-chyba');s.removeAttribute('aria-invalid');s.value='';
    s.options[0].textContent='Vyber ďalší okres';
    l.className='sr';l.htmlFor=s.id;l.textContent='Ďalší okres';
    x.type='button';x.className='obj-x';x.setAttribute('aria-label','Odobrať okres');x.textContent='×';
    x.addEventListener('click',function(){zoz.removeChild(w);prepocet();plus.focus();});
    s.addEventListener('change',function(){s.classList.remove('obj-chyba');prepocet();});
    w.appendChild(l);w.appendChild(s);w.appendChild(x);zoz.appendChild(w);prepocet();
    if(fokus)s.focus();
  }
  function uber(){var r=zoz.lastElementChild;if(r){zoz.removeChild(r);prepocet();}}
  plus.addEventListener('click',function(){pridaj(true);});
  hl.addEventListener('change',function(){hl.classList.remove('obj-chyba');prepocet();});
  $$('[data-okr-krok]').forEach(function(b){b.addEventListener('click',function(){if(b.getAttribute('data-okr-krok')==='1')pridaj(false);else uber();});});
  $$('input[name="bal"]',f).forEach(function(r){r.addEventListener('change',prepocet);});
  // tlačidlá v cenníku („Chcem skener“, „Chcem balík Jednotlivec“, „Chcem ponuku na mieru“) vyberú balík v objednávke
  $$('a[data-bal]').forEach(function(a){a.addEventListener('click',function(){var r=f.querySelector('input[name="bal"][value="'+a.getAttribute('data-bal')+'"]');if(r){r.checked=true;prepocet();}});});
  $$('[data-calc]').forEach(function(b){b.addEventListener('click',prepocet);});
  f.addEventListener('input',function(e){var t=e.target;if(t&&t.classList){t.classList.remove('obj-chyba');t.removeAttribute('aria-invalid');}});
  prepocet();
  function chyba(el,txt){note.classList.remove('obj-ok');note.classList.add('obj-zle');note.textContent=txt;if(el){el.classList.add('obj-chyba');el.setAttribute('aria-invalid','true');el.focus();}}
  f.addEventListener('submit',function(e){e.preventDefault();if(BUSY)return;
    var b=bal(),E=f.elements,meno=E.meno.value.trim(),tel=E.telefon.value.trim(),em=E.email.value.trim(),kanc=E.kancelaria.value.trim(),pm=parseInt(E.pocet.value,10);
    var ok=sel().map(function(s){return s.value;}).filter(function(v,i,a){return v&&a.indexOf(v)===i;});
    if(!hl.value)return chyba(hl,'Vyber prosím hlavný okres, ktorý ti má Týpek strážiť.');
    if(b==='kancelaria'&&!kanc)return chyba(E.kancelaria,'Napíš prosím názov kancelárie.');
    if(!meno)return chyba(E.meno,'Napíš prosím svoje meno a priezvisko.');
    if(tel.replace(/\\D/g,'').length<9)return chyba(E.telefon,'Napíš prosím telefónne číslo, napríklad 0900 123 456.');
    if(!em||!E.email.checkValidity())return chyba(E.email,'Zadaj prosím platný e-mail, napríklad meno@realitka.sk.');
    var btn=f.querySelector('button[type="submit"]');BUSY=true;btn.disabled=true;
    note.classList.remove('obj-zle','obj-ok');note.textContent='Odosielam objednávku…';
    fetch(SB+'/rest/v1/rpc/web_ziadost',{method:'POST',headers:{'apikey':SBK,'Content-Type':'application/json'},
      body:JSON.stringify({p_email:em,p_moduly:MOD[b],p_okresy:ok.length,p_platba:rocne()?'rocne':'mesacne',p_okresy_zoznam:ok,p_meno:meno,p_telefon:tel,
        p_kancelaria:b==='kancelaria'?kanc:null,p_pocet_maklerov:b==='kancelaria'&&pm>0?pm:null})})
    .then(function(r){if(!r.ok)return r.json().catch(function(){return {};}).then(function(j){throw new Error((j&&j.message)||r.status);});
      note.classList.add('obj-ok');
      note.textContent='Ďakujeme, objednávku máme! '+BN[b]+', '+okresy(ok.length)+': '+ok.join(', ')+'. Prvých 14 dní je zadarmo, ozveme sa ti osobne.';
      E.meno.value=E.telefon.value=E.email.value=E.kancelaria.value=E.pocet.value='';})
    .catch(function(err){note.classList.remove('obj-ok');note.classList.add('obj-zle');
      note.textContent=/prilis_vela/.test(err&&err.message)?'Z tohto zariadenia prišlo veľa objednávok naraz. Skús to prosím o hodinu alebo nám napíš na info@realitnytypek.sk.'
        :'Objednávku sa nepodarilo odoslať. Skús to prosím znova alebo nám napíš na info@realitnytypek.sk.';})
    .then(function(){BUSY=false;btn.disabled=false;});
  });
})();
</script>
''' % (m.group(1), m.group(2))


stranka('skener.html', 'skener',
        'Realitný skener – nové inzeráty súkromníkov ako prvý | Realitný týpek',
        'Týpek cez deň každých 10 minút prejde Bazoš, Nehnuteľnosti.sk, Reality.sk a TopReality a nový inzerát súkromníka ti hneď pošle do mobilu. 21 € mesačne s DPH, 14 dní zadarmo.',
        'https://realitnytypek.sk/skener',
        S['hero'] + skener_sekcia() + skener_zadarmo() + skener_cennik() + otazky([
            ('Z ktorých portálov skener berie inzeráty?',
             'Z Bazoša, Nehnuteľností.sk, Reality.sk a TopReality. Cez deň ich Týpek prejde každých 10 minút v okresoch, ktoré si vyberieš.'),
            ('Ako sa dozviem, že pribudol nový inzerát?',
             'Inzerát sa ukáže navrchu skenera a do mobilu ti príde upozornenie. Uvidíš ho skôr ako konkurencia, takže voláš a píšeš majiteľovi ako prvý.'),
            ('Čo keď mi predávajúci povie, aby som zavolal neskôr?',
             'Pri inzeráte si nastavíš pripomienku. Keď ti povie „zavolajte podvečer“, Týpek ti v ten čas pripomenie, že máš volať, aj upozornením v mobile.'),
            ('Koľko okresov môžem sledovať?',
             'Koľko chceš, z celého Slovenska. V objednávke si vyberieš hlavný okres za 21 € mesačne s DPH a ďalšie pridáš tlačidlom +, každý za 2 € mesačne.'),
            ('Musím niečo inštalovať?',
             'Nie. Týpek je webová aplikácia, funguje na počítači aj v mobile. Do mobilu si ho pridáš ako ikonu a upozornenia ti budú chodiť ako správy.'),
            ('Môžem to najprv vyskúšať?',
             'Áno, 14 dní zadarmo. Potom platíš mesačne, ceny sú vždy s DPH. Keď zaplatíš na rok dopredu, máš mesiac zdarma.'),
        ]),
        cta=skener_objednavka(), css=SKENER_CSS, js=skener_js())

# ---------------------------------------------------------------- Osobný web makléra
web = S['web'].replace('padding: 0 24px 110px">', 'padding: 24px 24px 110px">', 1)
web = re.sub(r'<h2( style="[^"]*">Tvoj vlastný realitný web\. Bez programátora\.)</h2>', r'<h1\1</h1>', web, count=1)
assert '<h1 ' in web
stranka('osobny-web.html', 'web',
        'Osobný web makléra bez programátora | Realitný týpek',
        'Vlastný realitný web s ponukami, recenziami, doménou a hostingom. Ponuky aj web si upravuješ sám. 57 € mesačne s DPH, Realitný skener k nemu za polovicu, 14 dní zadarmo.',
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
             'Áno, 14 dní zadarmo. Potom platíš mesačne, ceny sú vždy s DPH. Keď zaplatíš na rok dopredu, máš mesiac zdarma.'),
        ]))
