import os
from playwright.sync_api import sync_playwright
URL=os.environ.get("TYPEK_URL", "http://localhost:8000/index.html"); SH=os.environ.get("TYPEK_SNIMKY", "/tmp/typek-snimky/"); ok=[]; errs=[]
def check(n,c): ok.append(("OK   " if c else "ZLE  ")+n)
def prihlas(b, vp, email):
    pg=b.new_context(viewport=vp).new_page(); pg.on("pageerror", lambda e: errs.append(str(e))); pg.on("dialog", lambda d: d.accept())
    pg.goto(URL); pg.wait_for_selector("#l-email"); pg.fill("#l-email",email); pg.fill("#l-heslo","Test12345"); pg.click("#f-login button[type=submit]")
    pg.wait_for_selector("#obsah", timeout=20000); pg.wait_for_timeout(1500); return pg
with sync_playwright() as p:
    b=p.chromium.launch()
    pg=prihlas(b, {"width":1300,"height":900}, "jana@test.sk")
    pg.goto(URL+"#klienti"); pg.wait_for_selector(".pred-box", timeout=10000); pg.wait_for_timeout(600)
    tl=pg.locator("[data-kl-pohlad]")
    check("predvolene Predávajúci", pg.locator(".pred-box").count()==1)
    check("Predávajúci sú prvý", tl.nth(0).get_attribute("data-kl-pohlad")=="predavajuci")
    check("prvý je zvolený", tl.nth(0).get_attribute("aria-pressed")=="true")
    check("veľké tlačidlá ako v Schránkovaní (Predávajúci, Dopyty, Mimo ponuky, Klientska zóna)", pg.locator(".sch-pohlad.kl-pohlad .sp-ik").count()==4)
    check("počet predávajúcich v tlačidle", "3 predávajúcich" in tl.nth(0).inner_text())
    pg.locator(".kl-pohlad").screenshot(path=SH+"prepinac_desk.png")
    pg.click('[data-kl-pohlad="dopyty"]'); pg.wait_for_timeout(800)
    check("prepnutie na dopyty", "Klienti a dopyty" in pg.inner_text("#obsah"))
    check("dopyty majú počet", "aktívn" in pg.locator('[data-kl-pohlad="dopyty"]').inner_text())
    pg.click('[data-dop="novy"]'); pg.wait_for_timeout(800); pg.go_back(); pg.wait_for_timeout(800)
    check("späť z nového dopytu ostane v dopytoch", "Klienti a dopyty" in pg.inner_text("#obsah"))
    pm=prihlas(b, {"width":390,"height":844}, "peter@test.sk")
    pm.goto(URL+"#klienti"); pm.wait_for_selector(".pred-box", timeout=10000); pm.wait_for_timeout(600)
    pm.screenshot(path=SH+"prepinac_mobil.png")
    check("mobil bez posúvania", pm.evaluate("document.documentElement.scrollWidth")<=390)
    b.close()
print("\n".join(ok)); print(errs or "bez chýb JS")
