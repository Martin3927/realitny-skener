import os
from playwright.sync_api import sync_playwright
URL=os.environ.get("TYPEK_URL", "http://localhost:8000/index.html"); SH=os.environ.get("TYPEK_SNIMKY", "/tmp/typek-snimky/"); ok=[]; errs=[]
def check(n,c): ok.append(("OK   " if c else "ZLE  ")+n)
with sync_playwright() as p:
    b=p.chromium.launch()
    for vp, m in (({"width":1300,"height":900},"desk"), ({"width":390,"height":844},"mobil")):
        pg=b.new_page(viewport=vp); pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.goto(URL); pg.wait_for_selector("#l-email"); pg.fill("#l-email","admin@test.sk" if False else "admin@test.sk"); pg.fill("#l-heslo","Test12345"); pg.click("#f-login button[type=submit]")
        pg.wait_for_selector("#obsah", timeout=20000); pg.wait_for_timeout(1000)
        pg.goto(URL+"#inzeraty"); pg.wait_for_selector(".card", timeout=20000); pg.wait_for_timeout(600)
        t=pg.locator('#stats [data-v="sukr24"]')
        check(m+": dlaždica (%s)" % t.inner_text().replace("\n"," "), t.count()==1 and "súkromní za 24 h" in t.inner_text().lower())
        n=int(t.locator("b").inner_text())
        t.click(); pg.wait_for_timeout(600)
        ids=pg.locator(".card").evaluate_all("e=>e.map(x=>x.dataset.id)")
        check(m+": po kliknutí %d kariet = %d" % (len(ids), n), len(ids)==n and "nehnutelnosti:a3" in ids)
        check(m+": dlaždica označená", t.get_attribute("aria-pressed")=="true")
        check(m+": filter Súkromní + 24 h", pg.eval_on_selector("#f-novost","e=>e.value")=="1")
        check(m+": bez posúvania", pg.evaluate("document.documentElement.scrollWidth")<=vp["width"])
        pg.locator("#stats").screenshot(path=SH+"stats_"+m+".png")
        pg.close()
    b.close()
print("\n".join(ok)); print(errs or "bez chýb JS")
