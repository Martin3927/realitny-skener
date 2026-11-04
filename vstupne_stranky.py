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
    'funkcie': medzi('<!-- SPRÁVA PONÚK A SOCIÁLNE SIETE -->', '<!-- ZVONČEK -->'),
    'cennik': medzi('<!-- CENNÍK: BALÍKY -->', '<!-- OD ZACIATKU -->'),
    'zadarmo': medzi('<!-- K SKENERU ZADARMO -->', '<!-- CTA -->'),
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
<div class="soc">
<span class="soc-t">Sleduj nás</span>
<a class="soc-a" href="https://www.instagram.com/realitnytypek/" target="_blank" rel="noopener" aria-label="Realitný týpek na Instagrame" title="Instagram"><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2.5" y="2.5" width="19" height="19" rx="5.5"></rect><circle cx="12" cy="12" r="4.2"></circle><circle cx="17.4" cy="6.6" r="1.1" fill="currentColor" stroke="none"></circle></svg></a>
<a class="soc-a" href="https://www.facebook.com/realitnytypek" target="_blank" rel="noopener" aria-label="Realitný týpek na Facebooku" title="Facebook"><svg width="19" height="19" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M14 8.5V6.8c0-.8.5-1.3 1.4-1.3H17V2.2C16.6 2.1 15.4 2 14.2 2 11.6 2 10 3.6 10 6.4v2.1H7v3.7h3V22h4v-9.8h2.9l.5-3.7H14z"></path></svg></a>
</div>
<div style="display: flex; flex-wrap: wrap; align-items: center; gap: 12px 20px">
<a href="./">Hlavná stránka</a>
<a href="mailto:info@realitnytypek.sk">info@realitnytypek.sk</a>
<a href="podmienky.html">Podmienky používania</a>
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
    i = z.find('<div style="margin-top: 20px; border-radius: 26px; background: #EEE6D6')
    if i >= 0:  # pás „A mnoho ďalšieho“ (na hlavnej stránke už nie je)
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
STITOK = '<svg width="%d" height="%d" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 12l-8 8-9-9V3h8z"></path><circle cx="7.5" cy="7.5" r="1.5"></circle></svg>'
SIPKA = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"></path></svg>'
INFO = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><path d="M12 11v5M12 7.6v.2"></path></svg>'
GLOBUS = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><path d="M3 12h18M12 3c2.8 3 2.8 15 0 18M12 3c-2.8 3-2.8 15 0 18"></path></svg>'
# tlačidlo, ktoré otvorí okno „Osobný web makléra“ (#web-info)
WI = 'type="button" data-web-info aria-haspopup="dialog" aria-controls="web-info"'


def skener_hero():
    # hneď v úvode: s osobným webom je skener za polovicu + tlačidlo s infom o webe
    return nahrad(S['hero'], '14 dní zadarmo</span>\n</div>',
                  '14 dní zadarmo</span>\n</div>\n'
                  '<button ' + WI + ' class="hero-web rise d5"><span class="wi-ic">' + (STITOK % (19, 19)) + '</span>'
                  '<span class="hero-web-t"><strong>S osobným webom makléra máš skener za polovicu</strong>'
                  '<span>len 10,50 € mesačne s DPH<span class="hero-web-a">Čo je osobný web?' + SIPKA + '</span></span></span></button>')


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
          '<a class="pc-shot" href="soft-skener.webp?v=202611021700" target="_blank" rel="noopener" title="Otvoriť náhľad vo veľkom"><img src="soft-skener.webp?v=202611021700" alt="Realitný skener na počítači: nové inzeráty súkromníkov s tlačidlami Prevziať, '
          'Zapísať hovor, SMS poslaná a Pripomenúť" width="1800" height="1125" loading="lazy"></a>\n'
          '</div>\n'
          '<p class="pc-pozn">Skutočný skener na počítači aj v mobile. Inzeráty na ukážke sú vymyslené.</p>\n'
          '</div>\n')
    s = nahrad(s, '<p style="margin: 22px 0 0; font-size: 13px; color: #8EA2B3; text-align: center">Skutočný skener a upozornenia v mobile. '
                  'Inzeráty a mená na ukážke sú vymyslené.</p>\n</div>\n</div>\n</section>',
               '</div>\n' + pc + '</div>\n</section>')
    # pod cenou: s osobným webom za polovicu + tlačidlo s infom o webe
    s = nahrad(s, '<p class="sk-dph">Konečná cena s DPH, s osobným webom polovičná. Pozor, konkurencia často uvádza ceny bez DPH.</p>',
               '<button ' + WI + ' class="sk-web"><span class="wi-ic">' + (STITOK % (19, 19)) + '</span>'
               '<span class="sk-web-t"><strong>S osobným webom makléra len 10,50 € mesačne</strong>'
               '<span>Skener máš k webu za polovicu.<span class="sk-web-a">Čo je osobný web?' + SIPKA + '</span></span></span></button>\n'
               '<p class="sk-dph">Konečná cena s DPH. Pozor, konkurencia často uvádza ceny bez DPH.</p>')
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
               '<button ' + WI + ' class="pk-wi"><span class="pk-sw"><span data-m>S osobným webom za polovicu: 10,50 €</span>'
               '<span data-y>S osobným webom za polovicu: 115,50 €</span></span>' + INFO + '</button>'
               '<span class="okr-st"><span class="okr-st-l">Počet okresov<small>vyberieš ich v objednávke</small></span><span class="okr-st-c">'
               '<button type="button" data-okr-krok="-1" aria-label="Odobrať okres" disabled>−</button><output data-okr-pocet aria-live="polite">1</output>'
               '<button type="button" data-okr-krok="1" aria-label="Pridať okres">+</button></span></span></div>')
    c = nahrad(c, LI % 'Upozornenie hneď v mobile', LI % 'Upozornenie hneď v mobile' + LI % 'Pripomínač, aby si nezabudol zavolať')
    c = nahrad(c, '<span>Kataster a mapa, kalendár a chat zadarmo</span>', '<span>Kataster a mapa aj kalendár zadarmo</span>')
    # balík s osobným webom makléra + odkaz na stránku osobného webu
    c = nahrad(c, '<h3>Jednotlivec</h3><p>Skener aj vlastný web pre makléra, ktorý chce všetko.</p>',
               '<h3>Jednotlivec</h3><p>Realitný skener spolu s osobným webom makléra. Skener máš k webu za polovicu.</p>'
               '<button ' + WI + ' class="pk-link">Čo všetko má osobný web? →</button>')
    # správa celej realitnej kancelárie
    c = nahrad(c, '<h3>Realitná kancelária</h3><p>Celý softvér pre váš tím, pripravený na mieru.</p>',
               '<h3>Realitná kancelária</h3><p>Správa celej realitnej kancelárie v jednom softvéri, pripravená na mieru.</p>')
    return c


def skener_objednavka():
    # Bratislava I–V a Košice I–IV: skúšobnú dobu na ne zatiaľ nezapíname (skener ich neprejde celé) – v objednávke „po dohode“
    velky = lambda o: re.match(r'^(Bratislava|Košice) [IV]+$', o)
    moznosti = ''.join('<optgroup label="%s">%s</optgroup>' % (k, ''.join(
        ('<option value="%s">%s – po dohode</option>' % (o, o)) if velky(o) else '<option>%s</option>' % o for o in okr)) for k, okr in KRAJE)
    return '''<!-- CTA: OBJEDNÁVKA -->
<section id="pristup" style="max-width: 1200px; margin: 0 auto; padding: 110px 24px 90px">
<div class="obj-obal">
<div class="obj-uvod">
<span class="obj-badge">14 DNÍ ZADARMO</span>
<h2 style="margin: 16px 0 0; font-size: clamp(32px, 3.6vw, 48px); line-height: 1.04; letter-spacing: -0.035em; font-weight: 800">Objednaj si skener.<br>Prvých 14 dní zadarmo.</h2>
<p style="margin: 18px 0 0; font-size: 18px; line-height: 1.55; color: #3A4B5A">Vyber si balík a okresy, ktoré ti má Týpek strážiť. Prvých 14 dní neplatíš nič, potom platíš mesačne len za to, čo používaš. Ozveme sa ti osobne.</p>
<ul class="obj-plusy"><li>%(f)sVšetky kraje a okresy Slovenska</li><li>%(f)sĎalší okres len za 2 € mesačne</li><li>%(f)sS osobným webom skener za polovicu</li><li>%(f)sZmena balíka kedykoľvek</li></ul>
<div class="obj-typek"><img class="mfloat" src="typek.png?v=202610251300" alt="Maskot Realitný týpek" style="display: block; width: 100%%; height: auto; filter: drop-shadow(0 18px 22px rgba(30,42,53,.25))"></div>
</div>
<form id="rt-obj" class="obj" novalidate aria-label="Objednávka">
<fieldset class="obj-fs">
<legend class="obj-k"><span class="obj-n">1</span>Balík</legend>
<div class="obj-bal">
<label class="obj-b"><input type="radio" name="bal" value="skener" checked><span><b>Realitný skener</b><small data-obj-bc="skener">21 € mesačne</small></span></label>
<label class="obj-b"><input type="radio" name="bal" value="jednotlivec"><span><b>Skener + osobný web</b><small data-obj-bc="jednotlivec">67,50 € mesačne</small><em>SKENER −50 %%</em></span></label>
<label class="obj-b"><input type="radio" name="bal" value="kancelaria"><span><b>Realitná kancelária</b><small>cena na mieru</small></span></label>
</div>
<p class="obj-web">%(st)s<span><strong>S osobným webom máš skener za polovicu</strong> – 10,50 € namiesto 21 € mesačne.</span><button %(wi)s class="obj-web-b">Čo je osobný web?</button></p>
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

''' % {'m': moznosti, 'f': FAJKA % (16, 16, '2.6'), 'st': STITOK % (18, 18), 'wi': WI} + okno_web() + MOBIL_LISTA


# okno s infom o osobnom webe – otvoria ho tlačidlá s data-web-info (úvod, karta skenera, cenník, objednávka, otázky)
SABLONY = [('susedska-zlata', 'Susedská', 'Zlatá', '#DB9522'), ('galeria-more', 'Galéria', 'Morská', '#1D6F8F'),
           ('vizitka-atrament', 'Vizitka', 'Atramentová', '#1E2A35'), ('luxus-sivomodra', 'Luxusná', 'Sivomodrá', '#4A6074'),
           ('rodinna-smaragd', 'Rodinná', 'Smaragdová', '#1F6B57'), ('mestska-tehla', 'Mestská', 'Tehlová', '#A8482E')]
for _k, *_ in SABLONY:
    for _p in ('', '-m'):
        assert os.path.exists(os.path.join(WEB, 'sablony', _k + _p + '.webp')), 'chýba šablóna ' + _k + _p


def okno_web():
    fajka = '<span class="wi-ck">' + (FAJKA % (12, 12, '3.2')) + '</span>'
    vyhody = ['Vlastná doména s HTTPS a hosting 1 GB v cene', 'Ponuky upravíš v Týpkovi a na webe sú hneď',
              'Dopyty z webu ti prídu rovno do mobilu', 'Recenzie spokojných klientov', 'AI na úpravu textov k ponukám',
              'Príspevky na Facebook a Instagram', '1 realitný článok mesačne']
    cipy = ''.join('<button type="button" class="wi-opt" aria-pressed="%s" data-wi-sab="%s" data-wi-f="%s"><i style="background: %s"></i>%s</button>'
                   % ('true' if i == 0 else 'false', k, f, c, n) for i, (k, n, f, c) in enumerate(SABLONY))
    return '''<!-- OKNO: OSOBNÝ WEB MAKLÉRA -->
<dialog id="web-info" class="wi" aria-labelledby="wi-h">
<button type="button" class="wi-x" data-wi-zavri aria-label="Zavrieť okno">×</button>
<div class="wi-in">
<div class="wi-hl">
<span class="wi-ey">%(gl)sOSOBNÝ WEB MAKLÉRA</span>
<h2 id="wi-h">Tvoj vlastný realitný web. Bez programátora.</h2>
<p>Vyberieš si šablónu a farbu, pridáš fotku a pár viet o sebe. Ponuky, recenzie aj kontakt sa na webe naplnia samé z Týpka.</p>
</div>
<p class="wi-zl">%(st)s<span><strong>S osobným webom máš skener za polovicu</strong> – 10,50 € namiesto 21 € mesačne s DPH.</span></p>
<div class="wi-nh">
<div class="wi-pv">
<div class="wi-okno">
<div class="wi-lista" aria-hidden="true"><span class="wi-bodky"><i></i><i></i><i></i></span><span class="wi-adr">www.[tvojemeno].sk</span></div>
<div class="wi-scr"><img data-wi-pc alt="Ukážka šablóny Susedská osobného webu makléra" width="1120" height="700"><span class="wi-nazov" data-wi-nazov aria-live="polite">Susedská · Zlatá</span></div>
</div>
<div class="wi-tel" aria-hidden="true"><img data-wi-m alt="" width="480" height="960"></div>
</div>
<div class="wi-sab" role="group" aria-label="Vyber šablónu">%(cipy)s</div>
<p class="wi-pozn">6 šablón, 8 farieb a viac ako 20 sekcií, ktoré si zapneš jedným prepínačom. Skutočné šablóny z Týpka, meno a ponuky na ukážke sú vymyslené.</p>
<a class="wi-viac wi-viac--m" href="osobny-web">Všetky šablóny a farby %(sp)s</a>
</div>
<ul class="wi-ul">%(ul)s</ul>
<div class="wi-pata">
<div class="wi-cena"><small>Skener + osobný web</small><span class="wi-cena-r"><b>67,50 €</b><span>mesačne s DPH</span></span>
<span class="wi-cena-d">web 57 € + skener 10,50 € (−50 %%) · ročne 742,50 €, mesiac zdarma</span></div>
<div class="wi-akc">
<a class="btn btn-acc" href="#pristup" data-bal="jednotlivec" data-wi-objednat>Chcem skener + osobný web</a>
<a class="wi-viac" href="osobny-web">Všetky šablóny a farby %(sp)s</a>
</div>
</div>
</div>
</dialog>

''' % {'gl': GLOBUS, 'st': STITOK % (18, 18), 'sp': SIPKA, 'cipy': cipy,
       'ul': ''.join('<li>%s<span>%s</span></li>' % (fajka, v) for v in vyhody)}


# mobil: lišta s objednávkou dole, keď je úvod preč (skryje sa pri objednávke, v okne a pri lište cookies)
MOBIL_LISTA = '''<div class="mcta" data-mcta>
<span class="mcta-t"><b>Skener od 21 € mesačne</b><small>s DPH · 14 dní zadarmo</small></span>
<a class="btn btn-acc" href="#pristup">Objednať</a>
</div>

'''


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
@media (max-width: 560px){.obj-plus{border-radius:20px;padding:6px 16px 6px 6px}.obj-plus small{flex-basis:100%;padding:0 0 4px 44px;text-align:left}}
@media (max-width: 480px){.rise.d1{font-size:13px !important;gap:8px !important}.rise.d1>span{white-space:nowrap}}
@media (max-width: 440px){.obj-sum .seg{flex-direction:column;gap:2px;min-height:50px;padding:4px 6px}.obj-sum .seg small{font-size:10.5px}}
/* ===== s osobným webom za polovicu – tlačidlá, ktoré otvoria okno #web-info */
.wi-ic{flex:none;width:38px;height:38px;border-radius:12px;background:#DB9522;color:#1E2A35;display:grid;place-items:center}
.hero-web,.sk-web{display:flex;align-items:center;gap:14px;border:0;font:inherit;text-align:left;cursor:pointer;transition:background .2s,box-shadow .2s}
.hero-web{width:fit-content;max-width:100%;box-sizing:border-box;margin-top:26px;padding:10px 18px 10px 10px;border-radius:20px;background:#F2E4C6;color:#1E2A35;font-size:15px;line-height:1.4}
.hero-web:hover{background:#EEDDB8;box-shadow:0 16px 30px -22px rgba(30,42,53,.55)}
.hero-web-t,.sk-web-t{flex:1 1 200px;min-width:0;display:flex;flex-direction:column}
.hero-web-t>span,.sk-web-t>span{display:flex;flex-wrap:wrap;align-items:center;gap:2px 14px}
.hero-web strong{display:block;font-weight:800}
.hero-web-a,.sk-web-a{display:inline-flex;align-items:center;gap:6px;font-weight:800;white-space:nowrap}
.hero-web-a{color:#8A5A2B}
.hero-web-a svg,.sk-web-a svg{transition:transform .2s}
.hero-web:hover .hero-web-a svg,.sk-web:hover .sk-web-a svg{transform:translateX(3px)}
.sk-web{padding:12px 16px 12px 12px;border-radius:18px;background:rgba(219,149,34,.13);box-shadow:inset 0 0 0 1.5px rgba(219,149,34,.42);color:#C9D4DD;font-size:14.5px;line-height:1.45}
.sk-web:hover{background:rgba(219,149,34,.22)}
.sk-web strong{display:block;font-size:16px;color:#F7F2E8}
.sk-web-a{color:#DB9522}
.pk-wi{align-self:flex-start;display:inline-flex;align-items:center;gap:6px;margin-top:6px;padding:5px 10px 5px 12px;border:0;border-radius:999px;background:#F2E4C6;color:#8A5A2B;font:inherit;font-size:13.5px;font-weight:800;line-height:1.35;text-align:left;cursor:pointer;transition:background .2s}
.pk-wi:hover{background:#EEDDB8}
.pk-wi svg{flex:none}
button.pk-link{padding:0;border:0;background:none;font:inherit;font-size:14.5px;font-weight:800;text-align:left;cursor:pointer}
.obj-b em{align-self:flex-start;margin-top:4px;padding:2px 8px;border-radius:999px;background:#F2E4C6;color:#8A5A2B;font-size:11px;font-style:normal;font-weight:800;letter-spacing:.04em}
.obj-b input:checked+span em{background:#DB9522;color:#1E2A35}
.obj-web{display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px;margin:2px 0 0;padding:10px 14px;border-radius:14px;background:#F2E4C6;color:#1E2A35;font-size:14px;line-height:1.45}
.obj-web svg{flex:none;color:#8A5A2B}
.obj-web>span{flex:1 1 220px;min-width:0}
.obj-web-b,.faq-web{padding:0;border:0;background:none;font:inherit;font-weight:800;color:#8A5A2B;text-decoration:underline;text-underline-offset:3px;cursor:pointer}
.faq-web{margin-left:4px}
.hero-web:focus-visible,.sk-web:focus-visible,.pk-wi:focus-visible,button.pk-link:focus-visible,.obj-web-b:focus-visible,.faq-web:focus-visible{outline:3px solid #DB9522;outline-offset:3px}
/* ===== okno Osobný web makléra */
html.wi-otv{overflow:hidden}
.wi{width:min(1120px,calc(100vw - 32px));max-width:none;max-height:calc(100dvh - 32px);padding:0;border:0;border-radius:36px;background:#FFFDF8;color:#1E2A35;box-shadow:0 60px 120px -50px rgba(11,17,23,.85);overflow:hidden}
.wi[open]{display:flex;flex-direction:column;animation:wi-in .4s cubic-bezier(.2,.7,.2,1)}
.wi::backdrop{background:rgba(30,42,53,.62);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px)}
.wi[open]::backdrop{animation:wi-bd .3s ease}
@keyframes wi-in{from{opacity:0;transform:translateY(26px) scale(.98)}}
@keyframes wi-bd{from{opacity:0}}
@keyframes wi-fade{from{opacity:0}}
@media (prefers-reduced-motion: reduce){html:not(.pohyb-vzdy) .wi[open]{animation:wi-fade .25s ease}}
.wi-x{position:absolute;top:16px;right:16px;z-index:4;width:44px;height:44px;padding:0;border:0;border-radius:99px;background:#EEE6D6;color:#1E2A35;font:inherit;font-size:28px;line-height:1;cursor:pointer;display:grid;place-items:center;box-shadow:0 0 0 4px #FFFDF8;transition:background .2s,color .2s}
.wi-x:hover{background:#1E2A35;color:#F7F2E8}
.wi-x:focus-visible,.wi-opt:focus-visible,.wi-viac:focus-visible{outline:3px solid #DB9522;outline-offset:2px}
.wi-in{min-height:0;overflow:auto;overscroll-behavior:contain;padding:clamp(22px,3.4vw,44px);display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.12fr);grid-template-areas:"hl nh" "zl nh" "ul nh" "pa pa";grid-template-rows:auto auto 1fr auto;gap:18px clamp(26px,3.4vw,48px);align-items:start}
.wi-hl{grid-area:hl;padding-right:8px}
.wi-ey{display:inline-flex;align-items:center;gap:8px;padding:6px 12px;border-radius:999px;background:#1E2A35;color:#DB9522;font-size:12px;font-weight:700;letter-spacing:.1em}
.wi-hl h2{margin:14px 0 0;font-family:'Bricolage Grotesque','Instrument Sans',sans-serif;font-size:clamp(27px,2.6vw,36px);line-height:1.05;letter-spacing:-.03em;font-weight:800;text-wrap:balance}
.wi-hl p{margin:12px 0 0;font-size:16px;line-height:1.6;color:#3A4B5A}
.wi-zl{grid-area:zl;display:flex;gap:10px;align-items:center;margin:0;padding:11px 14px;border-radius:14px;background:#DB9522;color:#1E2A35;font-size:15px;line-height:1.4}
.wi-zl svg{flex:none}
.wi-ul{grid-area:ul;list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:9px}
.wi-ul li{display:flex;gap:10px;align-items:flex-start;font-size:15px;line-height:1.4;color:#1E2A35}
.wi-ck{flex:none;width:20px;height:20px;margin-top:1px;border-radius:99px;background:#F2E4C6;color:#8A5A2B;display:grid;place-items:center}
.wi-nh{grid-area:nh;align-self:center;min-width:0;display:flex;flex-direction:column;gap:16px;padding-top:30px}
.wi-pata{grid-area:pa;display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:14px 28px;padding:16px 16px 16px 22px;border-radius:24px;background:#1E2A35;color:#F7F2E8}
.wi-cena{display:flex;flex-direction:column;gap:2px;min-width:0}
.wi-cena small{font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#8EA2B3}
.wi-cena-r{display:flex;flex-wrap:wrap;align-items:baseline;gap:0 10px}
.wi-cena-r b{font-family:'Bricolage Grotesque','Instrument Sans',sans-serif;font-size:32px;line-height:1.05;font-weight:800;letter-spacing:-.02em;color:#DB9522}
.wi-cena-r span{font-size:14.5px;font-weight:700;color:#F7F2E8}
.wi-cena-d{font-size:13px;line-height:1.4;color:#C9D4DD}
.wi-akc{display:flex;flex-wrap:wrap;align-items:center;gap:10px 22px}
.wi-akc .btn{min-height:54px;margin:0;padding:0 28px;font-size:16px;font-weight:800}
.wi-viac{display:inline-flex;align-items:center;gap:6px;color:#F2E4C6;font-size:15px;font-weight:800;text-decoration:none}
.wi-viac:hover{text-decoration:underline;text-underline-offset:3px}
.wi-viac--m{display:none;align-self:flex-start;color:#8A5A2B}
.wi-pv{position:relative;padding:0 30px 34px 0}
.wi-okno{border-radius:18px;overflow:hidden;background:#1E2A35;box-shadow:0 40px 70px -40px rgba(30,42,53,.75)}
.wi-lista{display:flex;align-items:center;gap:10px;padding:9px 12px;background:#EEE6D6}
.wi-bodky{display:flex;gap:5px}.wi-bodky i{width:9px;height:9px;border-radius:9px;background:#C9D4DD}
.wi-adr{flex:1;min-width:0;padding:5px 12px;border-radius:8px;background:#FFFDF8;font-size:12px;color:#4A6074;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.wi-scr{position:relative;aspect-ratio:1120/700;background:#F7F2E8}
.wi-scr img,.wi-tel img{display:block;width:100%;height:100%;object-fit:cover;object-position:50% 0;transition:opacity .3s ease}
.wi-nazov{position:absolute;left:12px;top:12px;padding:6px 12px;border-radius:999px;background:rgba(30,42,53,.84);color:#F7F2E8;font-size:12px;font-weight:700;pointer-events:none}
.wi-tel{position:absolute;right:0;bottom:0;width:23%;min-width:84px;max-width:150px;aspect-ratio:480/960;padding:5px;box-sizing:border-box;border-radius:22px;background:#0B1117;box-shadow:0 30px 50px -24px rgba(11,17,23,.8)}
.wi-tel img{border-radius:17px;background:#F7F2E8}
.wi-mizne{opacity:.25}
.wi-sab{display:flex;flex-wrap:wrap;gap:8px}
.wi-opt{display:inline-flex;align-items:center;gap:8px;min-height:40px;padding:0 14px 0 11px;border-radius:999px;border:1.5px solid #E2D8C4;background:#FFFDF8;color:#1E2A35;font:inherit;font-size:14px;font-weight:700;cursor:pointer;transition:background .2s,border-color .2s,color .2s}
.wi-opt i{flex:none;width:12px;height:12px;border-radius:99px;box-shadow:0 0 0 2px #FFFDF8}
.wi-opt:hover{border-color:#4A6074}
.wi-opt[aria-pressed="true"]{background:#1E2A35;border-color:#1E2A35;color:#F7F2E8}
.wi-opt[aria-pressed="true"] i{box-shadow:0 0 0 2px #1E2A35,0 0 0 3.5px #F7F2E8}
.wi-pozn{margin:0;font-size:13px;line-height:1.5;color:#4A6074}
@media (max-width: 900px){
.wi-in{grid-template-columns:minmax(0,1fr);grid-template-areas:"hl" "zl" "nh" "ul" "pa";grid-template-rows:none;padding-bottom:0}
.wi-hl{padding-right:52px}.wi-nh{align-self:stretch;padding-top:6px}.wi-viac--m{display:inline-flex}
.wi-pata{position:sticky;bottom:0;z-index:3;margin:4px calc(-1*clamp(22px,3.4vw,44px)) 0;padding:12px clamp(22px,3.4vw,44px) calc(14px + env(safe-area-inset-bottom));border-radius:24px 24px 0 0;gap:10px 18px;box-shadow:0 -18px 34px -24px rgba(11,17,23,.7)}
.wi-pata .wi-viac,.wi-cena small,.wi-cena-d{display:none}
.wi-cena-r b{font-size:26px}
}
@media (max-width: 640px){.wi{width:100%;max-height:94dvh;margin:auto 0 0;border-radius:28px 28px 0 0}.wi-x{top:12px;right:12px}.wi-pv{padding:0 20px 26px 0}.wi-akc{flex:1 1 100%}.wi-akc .btn{width:100%;min-height:52px}.wi-opt{min-height:38px;padding:0 12px 0 10px;font-size:13.5px}}
/* ===== mobil: lišta s objednávkou dole */
.mcta{display:none}
@media (max-width: 760px){
.mcta{position:fixed;left:10px;right:10px;bottom:calc(10px + env(safe-area-inset-bottom));z-index:45;display:flex;align-items:center;gap:12px;padding:7px 7px 7px 18px;border-radius:999px;background:#1E2A35;color:#F7F2E8;box-shadow:0 24px 50px -18px rgba(11,17,23,.8);transform:translateY(160%);visibility:hidden;transition:transform .4s cubic-bezier(.2,.7,.2,1),visibility .4s}
.mcta.mcta-on{transform:none;visibility:visible}
.mcta-t{flex:1;min-width:0;display:flex;flex-direction:column;line-height:1.25}
.mcta-t b{font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mcta-t small{font-size:12px;color:#C9D4DD}
.mcta .btn{flex:none;width:auto;min-height:46px;margin:0;padding:0 22px;font-size:15px;font-weight:800}
.rt>footer{padding-bottom:110px !important}
}
@media (max-width: 760px) and (prefers-reduced-motion: reduce){html:not(.pohyb-vzdy) .mcta{transition:opacity .25s,visibility .25s;transform:none;opacity:0}html:not(.pohyb-vzdy) .mcta.mcta-on{opacity:1}}
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
        p_kancelaria:b==='kancelaria'?kanc:null,p_pocet_maklerov:b==='kancelaria'&&pm>0?pm:null,p_odkial:window.TYPEK_ODKIAL||null})})
    .then(function(r){if(!r.ok)return r.json().catch(function(){return {};}).then(function(j){throw new Error((j&&j.message)||r.status);});
      note.classList.add('obj-ok');
      note.textContent='Ďakujeme, objednávku máme! '+BN[b]+', '+okresy(ok.length)+': '+ok.join(', ')+'. Na tvoj e-mail sme poslali odkaz – registráciu dokončíš za minútu a prvých 14 dní máš zadarmo. Ak e-mail nevidíš, pozri aj nevyžiadanú poštu.';
      E.meno.value=E.telefon.value=E.email.value=E.kancelaria.value=E.pocet.value='';})
    .catch(function(err){note.classList.remove('obj-ok');note.classList.add('obj-zle');
      note.textContent=/prilis_vela/.test(err&&err.message)?'Z tohto zariadenia prišlo veľa objednávok naraz. Skús to prosím o hodinu alebo nám napíš na info@realitnytypek.sk.'
        :'Objednávku sa nepodarilo odoslať. Skús to prosím znova alebo nám napíš na info@realitnytypek.sk.';})
    .then(function(){BUSY=false;btn.disabled=false;});
  });
})();

/* OKNO „Osobný web makléra“: otvoria ho tlačidlá data-web-info, šablóny sa načítajú až pri prvom otvorení */
(function(){
  var d=document,dl=d.getElementById('web-info'),H=d.documentElement;
  var bb=[].slice.call(d.querySelectorAll('[data-web-info]'));
  if(!dl||typeof dl.showModal!=='function'){bb.forEach(function(b){b.addEventListener('click',function(){location.href='osobny-web';});});return;}
  var pc=dl.querySelector('[data-wi-pc]'),mo=dl.querySelector('[data-wi-m]'),naz=dl.querySelector('[data-wi-nazov]'),
      cc=[].slice.call(dl.querySelectorAll('[data-wi-sab]')),idx=-1,T=null,spat=null,dole=false,
      pohyb=H.classList.contains('pohyb-vzdy')||!(window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches);
  function img(el,src){if(el.getAttribute('src')===src)return;el.classList.add('wi-mizne');el.onload=function(){el.classList.remove('wi-mizne');};el.src=src;}
  function ukaz(i){
    idx=(i+cc.length)%%cc.length;var c=cc[idx],k=c.getAttribute('data-wi-sab'),n=c.textContent,f=c.getAttribute('data-wi-f');
    cc.forEach(function(x){x.setAttribute('aria-pressed',x===c?'true':'false');});
    img(pc,'sablony/'+k+'.webp');img(mo,'sablony/'+k+'-m.webp');
    pc.alt='Ukážka šablóny '+n+' osobného webu makléra';naz.textContent=n+' · '+f;
    var nx=cc[(idx+1)%%cc.length].getAttribute('data-wi-sab');(new Image()).src='sablony/'+nx+'.webp';
  }
  function stop(){if(T){clearInterval(T);T=null;}}
  function auto(){stop();if(pohyb)T=setInterval(function(){ukaz(idx+1);},3200);}
  function zavri(){stop();H.classList.remove('wi-otv');if(dl.open)dl.close();}
  function otvor(){spat=d.activeElement;if(idx<0)ukaz(0);dl.showModal();H.classList.add('wi-otv');dl.querySelector('.wi-in').scrollTop=0;auto();}
  bb.forEach(function(b){b.addEventListener('click',function(e){e.preventDefault();otvor();});});
  cc.forEach(function(c,i){c.addEventListener('click',function(){stop();ukaz(i);});});
  dl.querySelector('[data-wi-zavri]').addEventListener('click',zavri);
  // klik na tmavé pozadie okno zavrie (len keď klik začal aj skončil mimo okna)
  dl.addEventListener('pointerdown',function(e){dole=e.target===dl;});
  dl.addEventListener('click',function(e){if(e.target===dl&&dole)zavri();dole=false;});
  dl.addEventListener('close',function(){stop();H.classList.remove('wi-otv');if(spat&&spat.focus&&!dl._skok)spat.focus();dl._skok=false;});
  // „Chcem skener + osobný web“: vyberie balík v objednávke (rieši to skript objednávky) a zroluje k nej
  dl.querySelector('[data-wi-objednat]').addEventListener('click',function(){dl._skok=true;zavri();});
})();

/* MOBIL: lišta s objednávkou dole – ukáže sa po úvode, skryje sa pri objednávke, v okne a kým svieti lišta cookies */
(function(){
  var d=document,li=d.querySelector('[data-mcta]'),obj=d.getElementById('pristup'),dl=d.getElementById('web-info'),
      ck=d.querySelector('[data-ck="banner"]'),vObj=false,cak=false;
  if(!li||!obj)return;
  function upd(){cak=false;var on=(window.scrollY||0)>560&&!vObj&&!(dl&&dl.open)&&!(ck&&!ck.hidden);li.classList.toggle('mcta-on',on);}
  function plan(){if(!cak){cak=true;requestAnimationFrame(upd);}}
  if('IntersectionObserver' in window)new IntersectionObserver(function(e){vObj=e[0].isIntersecting;plan();},{rootMargin:'0px 0px -12%% 0px'}).observe(obj);
  addEventListener('scroll',plan,{passive:true});addEventListener('resize',plan);
  if(dl)dl.addEventListener('close',plan);
  d.addEventListener('click',function(){setTimeout(plan,60);});
  plan();
})();
</script>
''' % (m.group(1), m.group(2))


stranka('skener.html', 'skener',
        'Realitný skener – nové inzeráty súkromníkov ako prvý | Realitný týpek',
        'Týpek cez deň každých 10 minút prejde Bazoš, Nehnuteľnosti.sk, Reality.sk a TopReality a nový inzerát súkromníka ti hneď pošle do mobilu. 21 € mesačne s DPH, s osobným webom za polovicu, 14 dní zadarmo.',
        'https://realitnytypek.sk/skener',
        skener_hero() + skener_sekcia() + skener_zadarmo() + skener_cennik() + otazky([
            ('Z ktorých portálov skener berie inzeráty?',
             'Z Bazoša, Nehnuteľností.sk, Reality.sk a TopReality. Cez deň ich Týpek prejde každých 10 minút v okresoch, ktoré si vyberieš.'),
            ('Ako sa dozviem, že pribudol nový inzerát?',
             'Inzerát sa ukáže navrchu skenera a do mobilu ti príde upozornenie. Uvidíš ho skôr ako konkurencia, takže voláš a píšeš majiteľovi ako prvý.'),
            ('Čo keď mi predávajúci povie, aby som zavolal neskôr?',
             'Pri inzeráte si nastavíš pripomienku. Keď ti povie „zavolajte podvečer“, Týpek ti v ten čas pripomenie, že máš volať, aj upozornením v mobile.'),
            ('Koľko okresov môžem sledovať?',
             'Koľko chceš, z celého Slovenska. V objednávke si vyberieš hlavný okres za 21 € mesačne s DPH a ďalšie pridáš tlačidlom +, každý za 2 € mesačne.'),
            ('Je skener lacnejší, keď mám aj osobný web?',
             'Áno. S osobným webom makléra máš Realitný skener za polovicu – 10,50 € namiesto 21 € mesačne s DPH. '
             'Spolu je to balík Jednotlivec za 67,50 € mesačne. <button ' + WI + ' class="faq-web">Čo je osobný web makléra?</button>'),
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
