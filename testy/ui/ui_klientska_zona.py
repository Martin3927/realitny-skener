import os
import json
import subprocess
from playwright.sync_api import sync_playwright
# Klientska zóna: prepínače kancelárie (Klienti → Klientska zóna), výnimka pri ponuke, zóna kupujúceho pri dopyte,
# verejná stránka kupujúceho (zona.html) a report majiteľa (report.html) podľa prepínačov.
URL=os.environ.get("TYPEK_URL", "http://localhost:8000/index.html"); SH=os.environ.get("TYPEK_SNIMKY", "/tmp/typek-snimky/"); ok=[]; errs=[]
def sql(q): return subprocess.run(["psql","-h","127.0.0.1","-p","54322","-U","postgres","-d","typek","-tAc",q],capture_output=True,text=True).stdout.strip()
def check(n,c): ok.append(("OK   " if c else "ZLE  ")+n)
def stranka(n): return URL.replace("index.html", n)
JANA="22222222-2222-2222-2222-222222222222"

sql("""insert into nehnutelnosti (makler_id, nazov, stav, transakcia, kategoria, typ, cena, obec, okres, izby, plocha_uzitkova, historia_cien)
       values ('%s', 'Byt Smižany', 'aktivne', 'predaj', 'byty', '3-izbový byt', 120000, 'Smižany', 'Spišská Nová Ves', 3, 70, '[["2026-10-01", 125000], ["2026-11-01", 120000]]'),
              ('%s', 'Dom Levoča', 'aktivne', 'predaj', 'domy', 'Rodinný dom', 210000, 'Levoča', 'Levoča', 5, 140, '[]')""" % (JANA, JANA))
BYT=sql("select id from nehnutelnosti where nazov = 'Byt Smižany'"); DOM=sql("select id from nehnutelnosti where nazov = 'Dom Levoča'")
sql("insert into nehnutelnosti_interne (nehnutelnost_id, majitel_meno, majitel_email, report_token) values (%s, 'Ján Majiteľ', 'majitel@test.sk', 'reporttokenreporttoken0001')" % BYT)
sql("""insert into obhliadky (nehnutelnost_id, makler_id, cas, klient_meno, vysledok, spatna_vazba)
       values (%s, '%s', now() - interval '2 days', 'Karol Kupec', 'zvazuje', 'Páči sa, ale cena je vysoká.')""" % (BYT, JANA))
sql("insert into dopyty (makler_id, transakcia, kategorie, obce, cena_do) values ('%s', 'predaj', '{byty}', '{Smižany}', 130000)" % JANA)
DOPYT=sql("select max(id) from dopyty")
sql("insert into dopyty_kontakty (dopyt_id, meno, telefon, email) values (%s, 'Karol Kupec', '0905 123 456', 'karol@test.sk')" % DOPYT)

def prihlas(b, email, vp):
    pg=b.new_page(viewport=vp); pg.on("pageerror", lambda e: errs.append(str(e))); pg.on("dialog", lambda d: d.accept())
    pg.goto(URL); pg.wait_for_selector("#l-email"); pg.fill("#l-email",email); pg.fill("#l-heslo","Test12345"); pg.click("#f-login button[type=submit]")
    pg.wait_for_selector("#obsah", timeout=20000); pg.wait_for_timeout(1500)
    return pg

with sync_playwright() as p:
    b=p.chromium.launch()
    # ---- administrátor: prepínače kancelárie
    a=prihlas(b,"admin@test.sk",{"width":1300,"height":900})
    a.goto(URL+"#klienti"); a.wait_for_timeout(1500)
    check("Klienti: tretí pohľad Klientska zóna", a.locator('[data-kl-pohlad="zona"]').count() == 1)
    a.locator('[data-kl-pohlad="zona"]').click(); a.wait_for_timeout(800)
    check("zóna: prepínače predávajúceho (%d) a kupujúceho (%d)" % (a.locator("[data-kz-p]").count(), a.locator("[data-kz-k]").count()),
          a.locator("[data-kz-p]").count() == 9 and a.locator("[data-kz-k]").count() == 5)
    check("predvolene: spätná väzba zapnutá, automatika vypnutá", a.locator('[data-kz-p="spatna_vazba"]').is_checked() and not a.locator('[data-kz-k="automaticky"]').is_checked())
    a.screenshot(path=SH+"zona_nastavenia.png", full_page=True)
    a.locator('[data-kz-p="spatna_vazba"]').click(); a.wait_for_timeout(1200)
    ulozene=sql("select hodnota::jsonb->'predavajuci'->>'spatna_vazba' from nastavenia_kancelarie where kancelaria_id = 1 and kluc = 'klientska_zona'")
    check("vypnutie spätnej väzby sa uloží (%s)" % ulozene, ulozene == "false" and not a.locator('[data-kz-p="spatna_vazba"]').is_checked())
    a.locator('[data-kz-p="obhliadky"]').click(); a.wait_for_timeout(1200)
    check("vypnuté obhliadky zamknú závislé prepínače", a.locator('[data-kz-p="terminy"]').is_disabled())
    a.locator('[data-kz-p="obhliadky"]').click(); a.wait_for_timeout(1200)
    a.close()

    # ---- report majiteľa bez spätnej väzby
    r=b.new_page(viewport={"width":1100,"height":900}); r.on("pageerror", lambda e: errs.append(str(e)))
    r.goto(stranka("report.html")+"?t=reporttokenreporttoken0001"); r.wait_for_selector(".r-staty", timeout=15000)
    txt=r.locator("#obsah").inner_text()
    check("report: spätná väzba je skrytá", "cena je vysoká" not in txt and "Obhliadky a spätná väzba" not in txt and "Obhliadky" in txt)
    check("report: čísla ostali (5 dlaždíc)", r.locator(".r-stat").count() == 5)
    r.close()

    # ---- maklérka: výnimka pri ponuke a zóna kupujúceho pri dopyte
    j=prihlas(b,"jana@test.sk",{"width":1300,"height":900})
    j.goto(URL+"#klienti"); j.wait_for_timeout(1500)
    j.locator('[data-kl-pohlad="zona"]').click(); j.wait_for_timeout(600)
    check("maklér prepínače kancelárie vidí, ale nemení", j.locator('[data-kz-p="zobrazenia"]').is_disabled())
    j.locator('[data-kl-pohlad="dopyty"]').click(); j.wait_for_timeout(600)
    j.locator(".dopyt-karta").first.click(); j.wait_for_timeout(800)
    check("dopyt: sekcia Klientska zóna kupujúceho", j.locator("#dd-zona").count() == 1 and j.locator('[data-dd="zona-vytvor"]').count() == 1)
    j.locator('[data-dd="zona-vytvor"]').click(); j.wait_for_timeout(1800)
    TOK=sql("select zona_token from dopyty_kontakty where dopyt_id = %s" % DOPYT)
    check("odkaz pre klienta je vytvorený", len(TOK) == 36 and TOK in j.locator("#dd-zona input").input_value())
    check("poslať odkaz: WhatsApp, SMS, Email", j.locator("[data-dd-zona]").count() == 3)
    check("ponuka ešte nie je v zóne", j.locator(".dd-zona-r .chip.na").count() == 1)
    j.locator("[data-zona-ponuka]").first.click(); j.wait_for_timeout(1800)
    check("Do zóny: ponuka je v zóne klienta (%s)" % sql("select stav from dopyty_ponuky where dopyt_id = %s" % DOPYT),
          sql("select stav from dopyty_ponuky where dopyt_id = %s" % DOPYT) == "poslana" and j.locator(".dd-zona-r .chip.won").count() == 1)
    j.locator("#dd-zona").scroll_into_view_if_needed(); j.screenshot(path=SH+"zona_dopyt.png", full_page=True)

    # ---- klient: verejná stránka zóny (počítač aj mobil)
    for vp,m in (({"width":1100,"height":900},"desk"),({"width":390,"height":844},"mobil")):
        k=b.new_page(viewport=vp); k.on("pageerror", lambda e: errs.append(str(e)))
        k.goto(stranka("zona.html")+"?t="+TOK); k.wait_for_selector(".z-karta", timeout=15000)
        check(m+": klient vidí 1 ponuku a pozdrav menom", k.locator(".z-karta").count() == 1 and "Karol" in k.locator(".z-pozdrav").inner_text())
        check(m+": telefón klienta na stránke nie je", "0905 123 456" not in k.content())
        check(m+": bez vodorovného posúvania", k.evaluate("document.documentElement.scrollWidth") <= vp["width"])
        if m == "desk":
            k.locator('.z-r[data-r="obhliadka"]').click(); k.wait_for_timeout(300)
            check("Chcem obhliadku otvorí pole na správu", k.locator("#z-sprava").count() == 1)
            k.fill("#z-sprava", "V sobotu doobeda."); k.locator("[data-posli]").click(); k.wait_for_timeout(1500)
            check("žiadosť o obhliadku je odoslaná", k.locator('.z-r[data-r="obhliadka"][aria-pressed="true"]').count() == 1 and k.locator(".z-ok").count() == 1)
        else:
            check("mobil: reakcia z počítača je vidieť", k.locator('.z-r[data-r="obhliadka"][aria-pressed="true"]').count() == 1)
        k.screenshot(path=SH+"zona_klient_%s.png" % m, full_page=True); k.close()
    check("reakcia je v databáze (%s)" % sql("select reakcia || ' / ' || sprava from dopyty_ponuky where dopyt_id = %s" % DOPYT),
          sql("select reakcia from dopyty_ponuky where dopyt_id = %s" % DOPYT) == "obhliadka")
    n=sql("select count(*) from pripomienky where makler_id = '%s' and druh = 'zhoda' and poznamka like '%%Karol Kupec chce obhliadku%%'" % JANA)
    check("maklérka dostala upozornenie do zvončeka (%s)" % n, n == "1")

    # maklérka vidí reakciu pri dopyte a v prehľade zóny
    j.reload(); j.wait_for_selector("#obsah", timeout=20000); j.wait_for_timeout(2500)
    j.goto(URL+"#klienti"); j.wait_for_timeout(800)
    j.locator('[data-kl-pohlad="zona"]').click(); j.wait_for_timeout(800)
    check("prehľad zóny: posledná reakcia klienta", j.locator(".kz-reakcia").count() == 1 and "Chce obhliadku" in j.locator(".kz-reakcia").inner_text())
    j.locator(".kz-reakcia").click(); j.wait_for_timeout(800)
    check("dopyt: reakcia a správa klienta pri ponuke", "Chce obhliadku" in j.locator(".dd-zona-r").inner_text() and "V sobotu doobeda." in j.locator(".dd-zona-r").inner_text())
    check("dopyt: kedy klient zónu otvoril", "naposledy otvoril" in j.locator("#dd-zona").inner_text())

    # výnimka pri ponuke: tomuto majiteľovi spätnú väzbu ukázať
    j.locator(".dd-p-telo").first.click(); j.wait_for_timeout(1000)
    j.locator('[data-pdn="report"]').click(); j.wait_for_timeout(600)
    check("ponuka: prepínače „čo uvidí predávajúci“", j.locator("#pd-zona [data-kzp]").count() == 8 and not j.locator('#pd-zona [data-kzp="spatna_vazba"]').is_checked())
    j.locator('#pd-zona [data-kzp="spatna_vazba"]').click(); j.wait_for_timeout(1500)
    vyn=sql("select zona::text from nehnutelnosti_interne where nehnutelnost_id = %s" % BYT)
    check("výnimka pri ponuke sa uloží (%s)" % vyn, json.loads(vyn or "null") == {"spatna_vazba": True} and j.locator('#pd-zona [data-kzp="spatna_vazba"]').is_checked())
    check("ponuka: štítok výnimky a návrat na nastavenie kancelárie", j.locator('[data-pdn="kz-predv"]').count() == 1)
    j.locator("#pd-report").screenshot(path=SH+"zona_ponuka.png")
    r=b.new_page(viewport={"width":1100,"height":900}); r.on("pageerror", lambda e: errs.append(str(e)))
    r.goto(stranka("report.html")+"?t=reporttokenreporttoken0001"); r.wait_for_selector(".r-staty", timeout=15000)
    check("report: tento majiteľ spätnú väzbu vidí", "cena je vysoká" in r.locator("#obsah").inner_text())
    r.screenshot(path=SH+"zona_report.png", full_page=True)
    j.locator('[data-pdn="kz-predv"]').click(); j.wait_for_timeout(1500)
    check("návrat na nastavenie kancelárie", sql("select zona is null from nehnutelnosti_interne where nehnutelnost_id = %s" % BYT) == "t")

    # vypnutá zóna predávajúceho: report nič neukáže
    sql("""update nastavenia_kancelarie set hodnota = (hodnota::jsonb || '{"predavajuci":{"zapnute":false}}')::text where kancelaria_id = 1 and kluc = 'klientska_zona'""")
    r.reload(); r.wait_for_selector(".v-mk", timeout=15000)
    r.screenshot(path=SH+"zona_report_vypnuty.png")
    check("vypnutá zóna: report je prázdny, ostane kontakt na makléra", "vypnutý" in r.locator("#obsah").inner_text() and r.locator(".r-staty").count() == 0 and "Jana" in r.locator("#obsah").inner_text())
    r.close()
    b.close()
print("\n".join(ok)); print(errs or "bez chýb JS")
