import os
from playwright.sync_api import sync_playwright
URL=os.environ.get("TYPEK_URL", "http://localhost:8000/index.html"); ok=[]; errs=[]
def check(n,c): ok.append(("OK   " if c else "ZLE  ")+n)
with sync_playwright() as p:
    b=p.chromium.launch()
    for vp,m in (({"width":1300,"height":900},"desk"),({"width":390,"height":844},"mobil")):
        ctx=b.new_context(viewport=vp, geolocation={"latitude":49.0255,"longitude":20.5886}, permissions=["geolocation"])
        pg=ctx.new_page(); pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.goto(URL); pg.wait_for_selector("#l-email"); pg.fill("#l-email","jana@test.sk"); pg.fill("#l-heslo","Test12345"); pg.click("#f-login button[type=submit]")
        pg.wait_for_selector("#obsah", timeout=20000); pg.wait_for_timeout(800)
        pg.goto(URL+"#inzeraty"); pg.wait_for_selector(".card", timeout=20000); pg.wait_for_timeout(600)
        pg.locator('.pohlady [data-pohlad]').filter(has_text="okolo mňa").click(); pg.wait_for_timeout(2500)
        bar=pg.locator(".okolie-bar"); check(m+": lišta Okolo mňa", bar.count()==1); print(m, bar.inner_text().replace("\n"," ") if bar.count() else pg.locator("#obsah").inner_text()[:300])
        km=pg.locator(".okolie-km").all_inner_texts(); print(m, km[:5]); check(m+": vzdialenosti na kartách", len(km)>0)
        vals=[float(t.split()[1].replace(",",".")) if t.split()[1][0].isdigit() else 0 for t in km]
        check(m+": zoradené od najbližšieho", vals==sorted(vals))
        pg.locator('[data-okolie="mapa"]').click(); pg.wait_for_timeout(2500)
        check(m+": mapa s bodmi", pg.locator("#okolie-mapa .leaflet-interactive").count()>=2)
        pg.screenshot(path="" + os.environ.get("TYPEK_SNIMKY", "/tmp/typek-snimky/") + "okolie_%s.png"%m, full_page=False)
        check(m+": bez posúvania do strany", pg.evaluate("document.documentElement.scrollWidth")<=vp["width"])
        ctx.close()
    # zamietnutá poloha
    ctx=b.new_context(viewport={"width":1300,"height":900}); pg=ctx.new_page(); pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(URL); pg.wait_for_selector("#l-email"); pg.fill("#l-email","jana@test.sk"); pg.fill("#l-heslo","Test12345"); pg.click("#f-login button[type=submit]")
    pg.wait_for_selector("#obsah", timeout=20000); pg.goto(URL+"#inzeraty"); pg.wait_for_selector(".card", timeout=20000)
    pg.select_option("#f-okolie","10"); pg.wait_for_timeout(17000)
    t=pg.locator("#obsah").inner_text(); check("bez povolenia: zrozumiteľná správa", "polohu" in t.lower() or "poloh" in t.lower()); print(t[:200])
    ctx.close(); b.close()
print("\n".join(ok)); print(errs or "bez chýb JS")
