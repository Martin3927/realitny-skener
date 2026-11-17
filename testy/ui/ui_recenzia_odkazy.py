import os, urllib.parse
from playwright.sync_api import sync_playwright
# Prosba o recenziu: klient ju môže napísať na web, na Google alebo na Facebook. Odkazy nastavuje administrátor (migrácia 133).
URL=os.environ.get("TYPEK_URL", "http://localhost:8000/index.html"); SH=os.environ.get("TYPEK_SNIMKY", "/tmp/typek-snimky/"); ok=[]; errs=[]
def check(n,c): ok.append(("OK   " if c else "ZLE  ")+n)
def prihlas(b, vp, email):
    pg=b.new_context(viewport=vp).new_page(); pg.on("pageerror", lambda e: errs.append(str(e))); pg.on("dialog", lambda d: d.accept())
    pg.goto(URL); pg.wait_for_selector("#l-email"); pg.fill("#l-email",email); pg.fill("#l-heslo","Test12345"); pg.click("#f-login button[type=submit]")
    pg.wait_for_selector("#obsah", timeout=20000); pg.wait_for_timeout(1500); return pg
def sprava(pg):
    pg.locator('[data-rec-posli="wa"]').evaluate("a => a.onclick()")
    return urllib.parse.unquote(pg.get_attribute('[data-rec-posli="wa"]', "href") or "")
with sync_playwright() as p:
    b=p.chromium.launch()
    pg=prihlas(b, {"width":1300,"height":900}, "admin@test.sk")
    pg.goto(URL+"#recenzie"); pg.wait_for_selector(".rec-poziadat", timeout=10000); pg.wait_for_timeout(800)
    kde=pg.locator(".rec-poziadat [data-rec-kde]")
    check("tri možnosti, kde napísať recenziu", kde.count()==3)
    check("predvolene na náš web", kde.nth(0).get_attribute("aria-pressed")=="true")
    check("Google bez odkazu sa nedá vybrať", kde.nth(1).is_disabled())
    check("Facebook bez odkazu sa nedá vybrať", kde.nth(2).is_disabled())
    check("správa vedie na formulár recenzie", "recenzia.html?m=" in sprava(pg))
    pg.click(".rec-odkazy summary"); pg.wait_for_timeout(300)
    pg.fill('#f-rec-odkazy [name="google"]', "g.page/r/abc123/review")
    pg.fill('#f-rec-odkazy [name="facebook"]', "https://www.facebook.com/testkancelaria/reviews")
    pg.click('#f-rec-odkazy button[type=submit]'); pg.wait_for_timeout(1500)
    check("po uložení sa dá vybrať Google", not pg.locator('.rec-poziadat [data-rec-kde="google"]').is_disabled())
    check("po uložení sa dá vybrať Facebook", not pg.locator('.rec-poziadat [data-rec-kde="facebook"]').is_disabled())
    check("odkaz sa doplnil o https", pg.input_value('#f-rec-odkazy [name="google"]')=="https://g.page/r/abc123/review")
    pg.click('.rec-poziadat [data-rec-kde="google"]'); pg.wait_for_timeout(500)
    s=sprava(pg)
    check("správa s odkazom na Google", "https://g.page/r/abc123/review" in s and "na Googli" in s)
    pg.click('.rec-poziadat [data-rec-kde="facebook"]'); pg.wait_for_timeout(500)
    s=sprava(pg)
    check("správa s odkazom na Facebook", "facebook.com/testkancelaria/reviews" in s and "na Facebooku" in s)
    pg.locator(".rec-box").first.screenshot(path=SH+"recenzia_odkazy.png")
    # odkaz mimo Google sa neuloží
    pg.fill('#f-rec-odkazy [name="google"]', "https://zle.example/recenzia")
    pg.click('#f-rec-odkazy button[type=submit]'); pg.wait_for_timeout(1500)
    pg.goto(URL+"#domov"); pg.wait_for_timeout(600); pg.goto(URL+"#recenzie"); pg.wait_for_selector(".rec-poziadat", timeout=10000); pg.wait_for_timeout(800)
    pg.click('.rec-poziadat [data-rec-kde="google"]'); pg.wait_for_timeout(500)
    check("cudzí odkaz sa neuložil", "https://g.page/r/abc123/review" in sprava(pg))
    # maklér odkazy vidí a použije, ale nenastavuje
    pm=prihlas(b, {"width":390,"height":844}, "jana@test.sk")
    pm.goto(URL+"#recenzie"); pm.wait_for_selector(".rec-poziadat", timeout=10000); pm.wait_for_timeout(800)
    check("maklér nemá formulár s odkazmi", pm.locator("#f-rec-odkazy").count()==0)
    check("maklér môže vybrať Google", not pm.locator('.rec-poziadat [data-rec-kde="google"]').is_disabled())
    check("mobil bez posúvania do strany", pm.evaluate("document.documentElement.scrollWidth")<=390)
    b.close()
print("\n".join(ok)); print(errs or "bez chýb JS")
