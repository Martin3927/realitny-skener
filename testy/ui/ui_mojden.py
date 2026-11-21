import os, subprocess
from playwright.sync_api import sync_playwright
# Môj deň na mape: dnešná obhliadka (presne podľa ponuky) a stretnutie (približne podľa obce v mieste), poradie podľa času, navigácia.
URL=os.environ.get("TYPEK_URL", "http://localhost:8000/index.html"); SH=os.environ.get("TYPEK_SNIMKY", "/tmp/typek-snimky/"); ok=[]; errs=[]
def sql(q): return subprocess.run(["psql","-h","127.0.0.1","-p","54322","-U","postgres","-d","typek","-tAc",q],capture_output=True,text=True).stdout.strip()
def check(n,c): ok.append(("OK   " if c else "ZLE  ")+n)
ADMIN="11111111-1111-1111-1111-111111111111"
sql("""insert into nehnutelnosti (makler_id, nazov, stav, transakcia, kategoria, typ, cena, obec, okres, ulica, izby, plocha_uzitkova, historia_cien, lat, lon)
       values ('%s', 'Byt Tarča', 'aktivne', 'predaj', 'byty', '3-izbový byt', 120000, 'Spišská Nová Ves', 'Spišská Nová Ves', 'Javorová', 3, 70, '[]', 48.9443, 20.5667)""" % ADMIN)
BYT=sql("select id from nehnutelnosti where nazov = 'Byt Tarča'")
KANC=sql("select kancelaria_id from makleri where id = '%s'" % ADMIN)
# obhliadka o 3 hodiny, stretnutie o hodinu (má byť prvé), a jedno zajtra
sql("insert into obhliadky (nehnutelnost_id, makler_id, cas, klient_meno, klient_telefon) values (%s, '%s', date_trunc('day', now()) + interval '10 hours', 'Eva Nová', '0905 111 222')" % (BYT, ADMIN))
sql("insert into udalosti (makler_id, nazov, zaciatok, koniec, typ, miesto, kancelaria_id) values ('%s', 'Podpis zmluvy u notára', date_trunc('day', now()) + interval '8 hours', date_trunc('day', now()) + interval '9 hours', 'stretnutie', 'Námestie Majstra Pavla, Levoča', %s)" % (ADMIN, KANC))
sql("insert into udalosti (makler_id, nazov, zaciatok, koniec, typ, miesto, kancelaria_id) values ('%s', 'Fotenie bytu', date_trunc('day', now()) + interval '1 day 10 hours', null, 'stretnutie', 'Smižany', %s)" % (ADMIN, KANC))
with sync_playwright() as p:
    b=p.chromium.launch()
    pg=b.new_context(viewport={"width":1300,"height":900}, locale="sk-SK", timezone_id="Europe/Bratislava").new_page(); pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.route("https://*.tile.openstreetmap.org/**", lambda r: r.fulfill(status=200, content_type="image/png", body=b""))
    pg.goto(URL); pg.wait_for_selector("#l-email"); pg.fill("#l-email","admin@test.sk"); pg.fill("#l-heslo","Test12345"); pg.click("#f-login button[type=submit]")
    pg.wait_for_selector("#obsah", timeout=20000); pg.wait_for_timeout(1500)
    check("tlačidlo na prehľade", pg.locator('.kal-domov [data-moj-den]').count() == 1)
    pg.click('.kal-domov [data-moj-den]'); pg.wait_for_selector("#mojden-okno .md-zast", timeout=15000); pg.wait_for_timeout(800)
    z=pg.locator("#mojden-okno .md-zast")
    check("dve dnešné zastávky (%d)" % z.count(), z.count() == 2)
    check("poradie podľa času: najprv notár", "notára" in z.nth(0).inner_text() and "Obhliadka" in z.nth(1).inner_text())
    check("obe sú na mape (%d bodov)" % pg.locator("#mojden-okno .md-pin").count(), pg.locator("#mojden-okno .md-pin").count() == 2)
    check("stretnutie podľa obce je označené ako približné", "približne" in z.nth(0).inner_text() and pg.locator("#mojden-okno .md-pin.pribl").count() == 1)
    check("pri obhliadke klient a telefón", "Eva Nová" in z.nth(1).inner_text() and z.nth(1).locator('a[href^="tel:"]').count() == 1)
    nav=z.nth(1).locator('a:has-text("Navigovať")').get_attribute("href") or ""
    check("navigácia na presné súradnice ponuky", "destination=48.9443%2C20.5667" in nav)
    tr=pg.locator("#mojden-okno .md-trasa").get_attribute("href") or ""
    check("celá trasa s medzizastávkou", "waypoints=" in tr and "destination=48.9443" in tr)
    pg.screenshot(path=SH+"mojden.png")
    pg.click('#mojden-okno [data-md-den]:has-text("Zajtra")'); pg.wait_for_timeout(1200)
    check("zajtra: fotenie v Smižanoch", pg.locator("#mojden-okno .md-zast").count() == 1 and "Fotenie" in pg.inner_text("#mojden-okno .md-zoz"))
    pg.keyboard.press("Escape"); pg.wait_for_timeout(200)
    check("Escape zavrie", pg.locator("#mojden-okno").count() == 0)
    pg.goto(URL+"#kalendar"); pg.wait_for_timeout(1500)
    check("tlačidlo aj v kalendári", pg.locator('.kal [data-moj-den]').count() == 1)
    pm=b.new_context(viewport={"width":390,"height":844}, locale="sk-SK", timezone_id="Europe/Bratislava").new_page(); pm.on("pageerror", lambda e: errs.append(str(e)))
    pm.route("https://*.tile.openstreetmap.org/**", lambda r: r.fulfill(status=200, content_type="image/png", body=b""))
    pm.goto(URL); pm.wait_for_selector("#l-email"); pm.fill("#l-email","admin@test.sk"); pm.fill("#l-heslo","Test12345"); pm.click("#f-login button[type=submit]")
    pm.wait_for_selector("#obsah", timeout=20000); pm.wait_for_timeout(1500)
    pm.click('.kal-domov [data-moj-den]'); pm.wait_for_selector("#mojden-okno .md-zast", timeout=15000); pm.wait_for_timeout(600)
    check("mobil bez posúvania do strany", pm.evaluate("document.documentElement.scrollWidth") <= 390)
    pm.screenshot(path=SH+"mojden_mobil.png")
    b.close()
print("\n".join(ok)); print(errs or "bez chýb JS")
