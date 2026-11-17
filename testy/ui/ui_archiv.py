import os
import subprocess
from playwright.sync_api import sync_playwright
URL=os.environ.get("TYPEK_URL", "http://localhost:8000/index.html"); SH=os.environ.get("TYPEK_SNIMKY", "/tmp/typek-snimky/"); ok=[]; errs=[]
def sql(q): return subprocess.run(["psql","-h","127.0.0.1","-p","54322","-U","postgres","-d","typek","-tAc",q],capture_output=True,text=True).stdout.strip()
def check(n,c): ok.append(("OK   " if c else "ZLE  ")+n)
sql("update archiv set popis = 'Predám garáž na Tarči, 18 m², elektrina. Pôvodný text.', parametre = '{\"Lokalita\":\"052 01\",\"Cena\":\"15 000 €\",\"Videlo\":\"30 ľudí\"}', fotky_portal = '{https://www.bazos.sk/img/1/111/a2.jpg}' where inzerat_id = 'bazos:a2'")
sql("update archiv set popis = 'Predám garáž na Tarči, 18 m², elektrina, nová brána. Volajte 0905 111 222.' where inzerat_id = 'bazos:a2'")
sql("update inzeraty set aktivny = false where id = 'bazos:a2'")
with sync_playwright() as p:
    b=p.chromium.launch()
    for vp, meno in (({"width":1300,"height":900},"desk"), ({"width":390,"height":844},"mobil")):
        ctx=b.new_context(viewport=vp, permissions=["clipboard-read","clipboard-write"]); pg=ctx.new_page(); pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.goto(URL); pg.wait_for_selector("#l-email"); pg.fill("#l-email","jana@test.sk"); pg.fill("#l-heslo","Test12345"); pg.click("#f-login button[type=submit]")
        pg.wait_for_selector("#obsah", timeout=20000); pg.wait_for_timeout(1200)
        pg.goto(URL+"#klienti"); pg.wait_for_selector(".pred-box", timeout=10000)
        pg.locator('.pred-karta:has-text("0905 111 222")').click(); pg.wait_for_selector(".pred-detail"); pg.wait_for_timeout(1500)
        bloky=pg.locator("details.arch-blok")
        check(meno+": bloky s textom (%d)" % bloky.count(), bloky.count() >= 2)
        g=pg.locator('details.arch-blok[data-arch="bazos:a2"]'); g.locator(":scope > summary").click(); pg.wait_for_timeout(300)
        t=g.inner_text()
        check(meno+": nový text + zmiznutý inzerát", "nová brána" in t and "na portáli nie je, ale máme ho" in t)
        check(meno+": parametre bez Videlo", "Cena: 15 000 €" in t and "Videlo" not in t)
        g.locator("details.arch-hist summary").click(); pg.wait_for_timeout(200)
        check(meno+": predchádzajúce znenie", "Pôvodný text" in g.inner_text())
        g.locator("[data-kopiruj-text]").click(); pg.wait_for_timeout(500)
        schranka=pg.evaluate("navigator.clipboard.readText()")
        print(repr(schranka[:200])); check(meno+": skopírovaný text (%d znakov)" % len(schranka), "nová brána" in schranka)
        check(meno+": bez posúvania do strany", pg.evaluate("document.documentElement.scrollWidth") <= vp["width"])
        g.screenshot(path=SH+"archiv_"+meno+".png")
        # skener: detail inzerátu má kopírovanie
        pg.goto(URL+"#inzeraty/bazos:b2"); pg.wait_for_selector(".card", timeout=15000); pg.wait_for_timeout(500)
        if pg.locator('.card[data-id="bazos:b2"] .d-popis').count() == 0:   # odkaz na inzerát otvára detail rovno
            viac=pg.locator('.card[data-id="bazos:b2"] [data-act="viac"]')
            if viac.is_visible(): viac.click(); pg.wait_for_timeout(200)   # na mobile je Detail pod „⋯ Viac“
            pg.locator('.card[data-id="bazos:b2"] [data-act="detail"]').click(); pg.wait_for_timeout(1500)
        check(meno+": skener detail – Kopírovať text", pg.locator('.card[data-id="bazos:b2"] [data-kopiruj-text]').count() == 1)
        ctx.close()
    b.close()
print("\n".join(ok)); print(errs or "bez chýb JS")
