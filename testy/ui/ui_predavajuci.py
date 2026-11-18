import os
import subprocess, sys
from playwright.sync_api import sync_playwright

URL = os.environ.get("TYPEK_URL", "http://localhost:8000/index.html")
SH = os.environ.get("TYPEK_SNIMKY", "/tmp/typek-snimky/")
ok, errs = [], []
subprocess.run(["mkdir", "-p", SH])


def sql(q):
    return subprocess.run(["psql", "-h", "127.0.0.1", "-p", "54322", "-U", "postgres", "-d", "typek", "-tAc", q], capture_output=True, text=True).stdout.strip()


def check(nazov, podm):
    ok.append(("OK   " if podm else "ZLE  ") + nazov)


def login(pg, email="admin@test.sk"):
    pg.goto(URL)
    pg.wait_for_selector("#l-email")
    pg.fill("#l-email", email); pg.fill("#l-heslo", "Test12345")
    pg.click("#f-login button[type=submit]")
    pg.wait_for_selector("#obsah", timeout=20000)
    pg.wait_for_timeout(1500)


def nova(b, vp, email):
    pg = b.new_context(viewport=vp).new_page()
    pg.on("pageerror", lambda e: errs.append(email + ": " + str(e)))
    pg.on("dialog", lambda d: d.accept())
    login(pg, email)
    return pg


with sync_playwright() as p:
    b = p.chromium.launch()
    # ---- Jana na počítači: skener ukáže známeho predajcu
    pg = nova(b, {"width": 1400, "height": 950}, "jana@test.sk")
    pg.goto(URL + "#inzeraty"); pg.wait_for_selector(".card", timeout=20000); pg.wait_for_timeout(800)
    a3 = pg.locator('.card[data-id="nehnutelnosti:a3"]')
    t = a3.inner_text()
    check("karta a3: známy predajca", "Známy predajca" in t)
    check("karta a3: 2 ďalšie inzeráty", "má ešte 2 inzeráty" in t)
    check("karta a3: kto naposledy volal", "Jana Nováková" in t and "Nemá záujem o RK" in t)
    c1 = pg.locator('.card[data-id="bazos:c1"]').inner_text()
    check("karta c1: možno realitka", "možno realitka" in c1)
    d1 = pg.locator('.card[data-id="bazos:d1"]').inner_text()
    check("karta d1 bez čísla: bez riadku", "Známy predajca" not in d1)
    a3.screenshot(path=SH + "karta_a3.png")

    # klik na „Celá história“ otvorí detail v Klientoch
    a3.locator("[data-pred-otvor]").click(); pg.wait_for_selector(".pred-detail", timeout=10000)
    d = pg.inner_text(".pred-detail")
    check("detail: 3 inzeráty", "Inzeráty (3)" in d)
    check("detail: história s hovorom", "Nemá záujem o RK" in d and "Predáva sám" in d)
    check("detail: zmiznutý inzerát je v zozname", "zmizol" in d)
    pg.wait_for_timeout(900); pg.screenshot(path=SH + "detail_desk.png", full_page=True)

    # uloženie mena, poznámky a nevolať
    pg.fill('#f-pred [name="meno"]', "Ján Testovací")
    pg.fill('#f-pred [name="poznamka"]', "Predáva aj garáž, volať po Novom roku")
    pg.check('#f-pred [name="nevolat"]')
    pg.click('#f-pred [type="submit"]'); pg.wait_for_timeout(1200)
    check("uložené v databáze", sql("select meno||'|'||nevolat from predajcovia where telefon='0905111222'") == "Ján Testovací|true")
    check("detail ukazuje Nevolať", "Nevolať." in pg.inner_text(".pred-detail"))
    check("bez tlačidla Zavolať pri nevolať", pg.locator('.pred-detail .pd-akcie a[href^="tel:"]').count() == 0)
    check("Jana nemá mazanie (len admin)", pg.locator('[data-predd="vymazat"]').count() == 0)

    # späť na zoznam, filter a hľadanie
    pg.click('[data-predd="spat"]'); pg.wait_for_selector(".pred-box")
    karty = pg.locator(".pred-karta")
    check("zoznam: 3 súkromní predávajúci (RK nie)", karty.count() == 3)
    pg.click('[data-predf="nevolat"]'); pg.wait_for_timeout(300)
    check("filter Nevolať", pg.locator(".pred-karta").count() == 1)
    pg.click('[data-predf="vsetci"]'); pg.wait_for_timeout(300)
    pg.fill("#pred-q", "+421 907 333"); pg.wait_for_timeout(700)
    check("hľadanie podľa čísla v inom tvare", pg.locator(".pred-karta").count() == 1 and "Eva" in pg.inner_text(".pred-box"))
    pg.fill("#pred-q", ""); pg.wait_for_timeout(700)
    pg.screenshot(path=SH + "zoznam_desk.png", full_page=True)

    # prepínač späť na dopyty
    pg.click('[data-kl-pohlad="dopyty"]'); pg.wait_for_timeout(500)
    check("prepínač na dopyty", "Klienti a dopyty" in pg.inner_text("#obsah"))
    pg.click('[data-kl-pohlad="predavajuci"]'); pg.wait_for_selector(".pred-box")

    # skener po uložení: nevolať na karte
    pg.goto(URL + "#inzeraty"); pg.wait_for_selector(".card", timeout=20000); pg.wait_for_timeout(800)
    check("karta a2: Nevolať", "Nevolať" in pg.locator('.card[data-id="bazos:a2"]').inner_text())

    # V skeneri z detailu
    pg.locator('.card[data-id="bazos:b2"] [data-pred-otvor]').click(); pg.wait_for_selector(".pred-detail")
    pg.locator('[data-pred-inz="bazos:b1"]').click(); pg.wait_for_selector(".card", timeout=10000); pg.wait_for_timeout(500)
    check("V skeneri otvorí jeden inzerát", pg.locator(".card").count() == 1 and pg.locator('.card[data-id="bazos:b1"]').count() == 1)

    # Do ponuky z detailu (Jana má b1 prevzatý)
    pg.goto(URL + "#klienti"); pg.wait_for_timeout(800)
    if pg.locator('[data-kl-pohlad="predavajuci"]').count(): pg.click('[data-kl-pohlad="predavajuci"]')
    pg.wait_for_selector(".pred-box"); pg.locator('.pred-karta:has-text("Eva")').click(); pg.wait_for_selector(".pred-detail")
    check("Do ponuky pri prevzatom inzeráte", pg.locator('[data-pred-do-ponuky="bazos:b1"]').count() == 1)
    check("Do ponuky nie pri cudzom/neprevzatom", pg.locator('[data-pred-do-ponuky="bazos:b2"]').count() == 0)
    pg.click('[data-pred-do-ponuky="bazos:b1"]'); pg.wait_for_timeout(1500)
    check("formulár ponuky predvyplnený", pg.locator(".ponuka-form").count() == 1)
    pg.screenshot(path=SH + "do_ponuky.png")

    # ---- Peter na mobile
    pm = nova(b, {"width": 390, "height": 844}, "peter@test.sk")
    pm.goto(URL + "#klienti"); pm.wait_for_timeout(800)
    pm.click('[data-kl-pohlad="predavajuci"]'); pm.wait_for_selector(".pred-box")
    pm.wait_for_timeout(900); pm.screenshot(path=SH + "zoznam_mobil.png", full_page=True)
    sirka = pm.evaluate("document.documentElement.scrollWidth")
    check("mobil: bez vodorovného posúvania (%s px)" % sirka, sirka <= 390)
    pm.locator(".pred-karta").first.click(); pm.wait_for_selector(".pred-detail")
    pm.wait_for_timeout(900); pm.screenshot(path=SH + "detail_mobil.png", full_page=True)
    check("mobil detail bez posúvania", pm.evaluate("document.documentElement.scrollWidth") <= 390)
    pm.goto(URL + "#inzeraty"); pm.wait_for_selector(".card", timeout=20000); pm.wait_for_timeout(600)
    pm.locator('.card[data-id="nehnutelnosti:a3"]').screenshot(path=SH + "karta_mobil.png")

    # Peter bez prístupu k skeneru – žiadny prepínač
    sql("update makleri set pristup = '{klienti,chat}' where email='peter@test.sk'")
    pm.reload(); pm.wait_for_timeout(2500)
    pm.goto(URL + "#klienti"); pm.wait_for_timeout(1200)
    check("bez skenera: žiadny prepínač Predávajúci", pm.locator('[data-kl-pohlad="predavajuci"]').count() == 0 and "Klienti a dopyty" in pm.inner_text("#obsah"))
    sql("update makleri set pristup = default where email='peter@test.sk'")

    # ---- admin: vymazanie na žiadosť
    pa = nova(b, {"width": 1300, "height": 900}, "admin@test.sk")
    pa.goto(URL + "#klienti"); pa.wait_for_timeout(800)
    pa.click('[data-kl-pohlad="predavajuci"]'); pa.wait_for_selector(".pred-box")
    pa.locator('.pred-karta:has-text("Peter")').click(); pa.wait_for_selector(".pred-detail")
    pa.click('[data-predd="vymazat"]'); pa.wait_for_selector(".pred-box", timeout=10000); pa.wait_for_timeout(500)
    check("admin vymazal Petra", pa.locator('.pred-karta:has-text("Peter")').count() == 0 and pa.locator(".pred-karta").count() == 2)
    pa.goto(URL + "#inzeraty"); pa.wait_for_selector(".card", timeout=20000); pa.wait_for_timeout(600)
    check("číslo zmizlo aj z karty v skeneri", "0911" not in pa.locator('.card[data-id="bazos:c1"]').inner_text())
    b.close()

print("\n".join(ok))
print(errs or "bez chýb JS")
