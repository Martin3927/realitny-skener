import os
import subprocess
from playwright.sync_api import sync_playwright

URL = os.environ.get("TYPEK_URL", "http://localhost:8000/index.html"); SH = os.environ.get("TYPEK_SNIMKY", "/tmp/typek-snimky/")
ok, errs = [], []


def sql(q):
    return subprocess.run(["psql", "-h", "127.0.0.1", "-p", "54322", "-U", "postgres", "-d", "typek", "-tAc", q], capture_output=True, text=True).stdout.strip()


def check(n, c): ok.append(("OK   " if c else "ZLE  ") + n)


with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_context(viewport={"width": 1300, "height": 900}).new_page()
    pg.on("pageerror", lambda e: errs.append(str(e))); pg.on("dialog", lambda d: d.accept())
    pg.goto(URL); pg.wait_for_selector("#l-email"); pg.fill("#l-email", "jana@test.sk"); pg.fill("#l-heslo", "Test12345"); pg.click("#f-login button[type=submit]")
    pg.wait_for_selector("#obsah", timeout=20000); pg.wait_for_timeout(1500)

    # skener: Petrove 3 inzeráty sú medzi súkromnými
    pg.goto(URL + "#inzeraty"); pg.wait_for_selector(".card", timeout=20000); pg.wait_for_timeout(600)
    check("pred označením: c1 je v zozname", pg.locator('.card[data-id="bazos:c1"]').count() == 1)

    # Klienti → Predávajúci → Peter → Je to RK
    pg.goto(URL + "#klienti"); pg.wait_for_timeout(800); pg.click('[data-kl-pohlad="predavajuci"]'); pg.wait_for_selector(".pred-box")
    check("filter Realitky je prázdny", "Realitky 0" in pg.inner_text(".pred-box .seg"))
    pg.locator('.pred-karta:has-text("Peter")').click(); pg.wait_for_selector(".pred-detail")
    pg.wait_for_timeout(500); pg.screenshot(path=SH + "rk_detail_pred.png")
    pg.click('[data-predd="je-rk"]'); pg.wait_for_selector(".pred-box", timeout=10000); pg.wait_for_timeout(600)
    check("databáza: 3 inzeráty RK", sql("select count(*) from oznacenia where predajca_typ='rk'") == "3")
    check("Peter zmizol zo zoznamu predávajúcich", pg.locator('.pred-karta:has-text("Peter")').count() == 0)
    check("Realitky 1", "Realitky 1" in pg.inner_text(".pred-box .seg"))
    pg.click('[data-predf="rk"]'); pg.wait_for_timeout(300)
    check("Peter je v Realitkách", pg.locator('.pred-karta:has-text("Peter")').count() == 1)
    pg.screenshot(path=SH + "rk_zoznam.png", full_page=True)

    # skener: c1–c3 zmizli zo súkromných
    pg.goto(URL + "#inzeraty"); pg.wait_for_selector(".card", timeout=20000); pg.wait_for_timeout(600)
    rk = [i for i in ["bazos:c1", "bazos:c2", "bazos:c3"] if pg.locator('.card[data-id="%s"] [data-act="oznac-zrus"]' % i).count() == 1]
    check("skener: c1–c3 označené ako RK (%d)" % len(rk), len(rk) == 3)
    pg.locator('.card[data-id="bazos:c1"]').screenshot(path=SH + "rk_karta.png")

    # zrušenie v Klientoch
    pg.goto(URL + "#klienti"); pg.wait_for_timeout(800)
    if pg.locator('[data-predf="rk"]').count() == 0: pg.click('[data-kl-pohlad="predavajuci"]'); pg.wait_for_selector(".pred-box")
    pg.click('[data-predf="rk"]'); pg.wait_for_timeout(300)
    pg.locator('.pred-karta:has-text("Peter")').click(); pg.wait_for_selector(".pred-detail")
    check("detail realitky: poznámka", "Realitná kancelária." in pg.inner_text(".pred-detail"))
    pg.click('[data-predd="nie-rk"]'); pg.wait_for_timeout(1200)
    check("Nie je RK: inzeráty späť", sql("select count(*) from oznacenia where predajca_typ='rk'") == "0")
    check("detail má znova Je to RK", pg.locator('[data-predd="je-rk"]').count() == 1)

    # skener: Je to RK pri b2 presunie aj b1 (rovnaké číslo)
    pg.goto(URL + "#inzeraty"); pg.wait_for_selector(".card", timeout=20000); pg.wait_for_timeout(600)
    pg.locator('.card[data-id="bazos:b2"] [data-act="oznac-rk"]').click(); pg.wait_for_timeout(1500)
    toast = pg.inner_text("#toast")
    check("toast spomína ďalší inzerát (%s)" % toast, "ďalším inzerátom" in toast)
    check("skener: b1 aj b2 presunuté medzi RK", all(pg.locator('.card[data-id="%s"] [data-act="oznac-zrus"]' % i).count() == 1 for i in ["bazos:b1", "bazos:b2"]))
    b.close()

print("\n".join(ok)); print(errs or "bez chýb JS")
