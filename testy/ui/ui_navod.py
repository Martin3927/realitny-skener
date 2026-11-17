import os
from playwright.sync_api import sync_playwright
URL=os.environ.get("TYPEK_URL", "http://localhost:8000/index.html"); SH=os.environ.get("TYPEK_SNIMKY", "/tmp/typek-snimky/"); ok=[]; errs=[]
def check(n,c): ok.append(("OK   " if c else "ZLE  ")+n)
IOS="Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1"
AND="Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36"
with sync_playwright() as p:
    b=p.chromium.launch()
    for ua, m in ((AND,"android"),(IOS,"iphone")):
        ctx=b.new_context(viewport={"width":390,"height":844}, user_agent=ua); pg=ctx.new_page(); pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.goto(URL); pg.wait_for_selector("#l-email"); pg.fill("#l-email","jana@test.sk"); pg.fill("#l-heslo","Test12345"); pg.click("#f-login button[type=submit]")
        pg.wait_for_selector("#obsah", timeout=20000); pg.wait_for_timeout(1000)
        # z menu → Pomoc
        pg.click('[data-act="menu"]'); pg.wait_for_timeout(400)
        pg.locator('#menu-sheet [data-pomoc="mobil"]').click(); pg.wait_for_selector("#navod-mobil")
        t=pg.inner_text("#navod-mobil")
        check(m+": návod otvorený, správny telefón", ("Safari" in t and "Zdieľať" in t) if m=="iphone" else ("Chrome" in t and "Inštalovať" in t))
        check(m+": adresa skenera v návode", "localhost:8000/" in t)
        check(m+": bez posúvania do strany", pg.evaluate("document.documentElement.scrollWidth")<=390)
        pg.locator("#navod-mobil .nm-karta").screenshot(path=SH+"navod_"+m+".png")
        pg.click('[data-nm-sys="%s"]' % ("android" if m=="iphone" else "ios")); pg.wait_for_timeout(300)
        t2=pg.inner_text("#navod-mobil")
        check(m+": prepnutie na druhý telefón", ("Chrome" in t2) if m=="iphone" else ("Safari" in t2))
        pg.click('[data-nm="upozornenia"]'); pg.wait_for_timeout(800)
        check(m+": tlačidlo vedie na Upozornenia v profile", pg.locator("#box-push").count()==1 and pg.locator("#navod-mobil").count()==0)
        pg.locator('#box-push [data-prof="mobil"]').click(); pg.wait_for_timeout(300)
        check(m+": odkaz z boxu upozornení", pg.locator("#navod-mobil").count()==1)
        pg.keyboard.press("Escape"); pg.wait_for_timeout(200)
        check(m+": Esc zavrie", pg.locator("#navod-mobil").count()==0)
        ctx.close()
    b.close()
print("\n".join(ok)); print(errs or "bez chýb JS")
