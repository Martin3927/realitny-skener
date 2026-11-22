import os
from playwright.sync_api import sync_playwright
# Editor osobného webu: hotové vzhľady, Grafika, Animácie, striedavé slová, bežiaci pás a striedanie fotiek v úvode.
URL=os.environ.get("TYPEK_URL", "http://localhost:8000/index.html"); SH=os.environ.get("TYPEK_SNIMKY", "/tmp/typek-snimky/"); ok=[]; errs=[]
def check(n,c): ok.append(("OK   " if c else "ZLE  ")+n)
ED=URL.replace("index.html", "web-editor.html")
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={"width":1440,"height":1000}); pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(URL); pg.wait_for_selector("#l-email"); pg.fill("#l-email","admin@test.sk"); pg.fill("#l-heslo","Test12345"); pg.click("#f-login button[type=submit]")
    pg.wait_for_selector("#obsah", timeout=20000); pg.wait_for_timeout(800)
    pg.goto(ED); pg.wait_for_selector("#site .hero", timeout=20000); pg.wait_for_timeout(1200)
    S="TYPEK_WEB.W.S"; cls=lambda: pg.evaluate("document.querySelector('#site').className")
    check("Hotové vzhľady: 5 tlačidiel", pg.locator("#vzhlady .vzh").count() == 5)
    check("nový web nemá žiadny vzhľad označený", pg.locator('#vzhlady .vzh[aria-pressed="true"]').count() == 0)
    check("nový web je bez grafických tried (%s)" % cls(), not any(x in cls() for x in ["gk-", "dv-", "vz-", "nd-", "rv-", "hv-", "bt-", " zi"]))
    pg.click('[data-vzhlad="zivy"]'); pg.wait_for_timeout(600)
    c=cls()
    check("Živý: triedy na webe (%s)" % c, all(x in c for x in ["gk-tien", "dv-vlna", "vz-bodky", "nd-grad", "rv-zoom", "bt-pulz", "zi"]))
    check("Živý: písmo a tlačidlá", pg.evaluate(S+".font") == "moderne" and pg.evaluate(S+".btn") == "pill" and pg.evaluate(S+".r") == 20)
    check("Živý je označený", pg.locator('[data-vzhlad="zivy"][aria-pressed="true"]').count() == 1)
    # ručné doladenie
    pg.click('[data-gx="gfx.dv|sikmy"]'); pg.wait_for_timeout(400)
    check("Predel Šikmý", "dv-sikmy" in cls() and "dv-vlna" not in cls())
    check("po doladení už vzhľad nie je označený", pg.locator('#vzhlady .vzh[aria-pressed="true"]').count() == 0)
    pg.click('[data-gx="gfx.vzor|off"]'); pg.click('[data-gx="an.hover|ram"]'); pg.click('[data-gx="an.btn|lesk"]'); pg.click('[data-gx="an.speed|rychle"]'); pg.wait_for_timeout(400)
    c=cls()
    check("Vzor žiadny, rám, lesk, rýchla (%s)" % c, "vz-" not in c and "hv-ram" in c and "bt-lesk" in c and "sp-rychle" in c)
    pg.click('[data-gx="gfx.karty|"]'); pg.wait_for_timeout(300)
    check("Karty podľa šablóny", "gk-" not in cls())
    # bežiaci pás
    pg.check('[data-check="gfx.pas"]'); pg.wait_for_timeout(500)
    check("Bežiaci pás na webe", pg.locator("#site .pas span").count() >= 6)
    pg.fill("#f-gfx-pasTx", "Predaj, Výkup, Odhad zdarma"); pg.wait_for_timeout(700)
    check("vlastné heslá v páse", pg.locator("#site .pas .pas-in > div:first-child span").all_text_contents() == ["Predaj", "Výkup", "Odhad zdarma"])
    # striedavé slová
    pg.fill("#f-heroRot", "byt, rodinný dom, pozemok"); pg.wait_for_timeout(700)
    check("Striedavé slová pod nadpisom", pg.locator("#site .rotl span").count() == 3 and pg.locator("#site .rotl span.on").count() == 1)
    prve=pg.locator("#site .rotl span.on").text_content()
    pg.wait_for_timeout(3600)
    check("slová sa striedajú (%s → %s)" % (prve, pg.locator("#site .rotl span.on").text_content()), pg.locator("#site .rotl span.on").text_content() != prve)
    # úvod s fotkou: striedanie fotiek, efekt, šípka
    pg.click('[data-tpl="luxus"]'); pg.wait_for_timeout(700)
    pg.click('[data-hm="ponuky"]'); pg.wait_for_timeout(600)
    check("Striedať fotky ponúk: viac fotiek v úvode", pg.locator("#site .hm-sl img").count() >= 2 and pg.locator("#site .hm-sl img.on").count() == 1)
    pg.click('[data-gx="gfx.foto|vineta"]'); pg.check('[data-check="heroSipka"]'); pg.wait_for_timeout(500)
    check("Efekt na fotke a šípka nadol", "hf-vineta" in cls() and pg.locator("#site .hsip").count() == 1)
    pg.locator("#site").screenshot(path=SH+"web_grafika.png")
    # vypnuté animácie: voľby pohybu zmiznú, pás stojí
    pg.click('#animSeg [data-an="0"]'); pg.wait_for_timeout(500)
    check("vypnuté animácie skryjú voľby pohybu", pg.locator("#fAn .chip").count() == 0)
    check("pás bez animácie", pg.evaluate("getComputedStyle(document.querySelector('#site .pas-in')).animationName") == "none")
    pg.click('#animSeg [data-an="1"]'); pg.wait_for_timeout(400)
    # uloženie a opätovné načítanie
    pg.wait_for_timeout(2500); pg.reload(); pg.wait_for_selector("#site .hero", timeout=20000); pg.wait_for_timeout(1500)
    c=cls()
    check("po obnovení ostáva nastavenie (%s)" % c, "dv-sikmy" in c and "hv-ram" in c and "hf-vineta" in c and pg.evaluate(S+".heroRot") == "byt, rodinný dom, pozemok" and pg.evaluate(S+".gfx.pas") is True)
    b.close()
print("\n".join(ok)); print(errs or "bez chýb JS")
