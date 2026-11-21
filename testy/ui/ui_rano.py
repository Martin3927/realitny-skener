import os, subprocess
from playwright.sync_api import sync_playwright
# Ranný prehľad kancelárie: administrátor ho otvorí z upozornenia (#rano) alebo v Môj profil, vypne ho vypínačom; maklér ho nemá.
URL=os.environ.get("TYPEK_URL", "http://localhost:8000/index.html"); SH=os.environ.get("TYPEK_SNIMKY", "/tmp/typek-snimky/"); ok=[]; errs=[]
def sql(q): return subprocess.run(["psql","-h","127.0.0.1","-p","54322","-U","postgres","-d","typek","-tAc",q],capture_output=True,text=True).stdout.strip()
def check(n,c): ok.append(("OK   " if c else "ZLE  ")+n)
K=sql("select kancelaria_id from makleri where email = 'admin@test.sk'"); I1=sql("select id from inzeraty order by id limit 1")
sql("""insert into aktivity (inzerat_id, makler_id, typ, vysledok, vytvorene, kancelaria_id)
       select '%s', '22222222-2222-2222-2222-222222222222', 'hovor', 'Volať neskôr', ((now() at time zone 'Europe/Bratislava')::date - 1 + time '10:00') at time zone 'Europe/Bratislava', %s
       from generate_series(1, 3)""" % (I1, K))
def prihlas(b, vp, email):
    pg=b.new_context(viewport=vp).new_page(); pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(URL); pg.wait_for_selector("#l-email"); pg.fill("#l-email",email); pg.fill("#l-heslo","Test12345"); pg.click("#f-login button[type=submit]")
    pg.wait_for_selector("#obsah", timeout=20000); pg.wait_for_timeout(1500); return pg
with sync_playwright() as p:
    b=p.chromium.launch()
    pg=prihlas(b, {"width":1300,"height":900}, "admin@test.sk")
    pg.goto(URL+"#rano"); pg.wait_for_selector("#rano-okno .rano-mriezka", timeout=10000); pg.wait_for_timeout(300)
    t=pg.inner_text("#rano-okno")
    check("odkaz z upozornenia otvorí prehľad", "Včera" in t and "Dnes" in t)
    check("včera 3 hovory a Jana v tabuľke", pg.locator("#rano-okno .rano-c").first.inner_text().startswith("3") and "Jana" in pg.inner_text("#rano-okno .rano-tab"))
    pg.locator("#rano-okno .todo-karta").screenshot(path=SH+"rano.png")
    pg.click('#rano-okno .rano-c:has-text("hovorov")'); pg.wait_for_timeout(1000)
    check("klik na číslo otvorí sekciu (Výkon)", pg.locator("#rano-okno").count() == 0 and pg.evaluate("location.hash") == "#vykon")
    pg.click('[data-act="profil"]'); pg.wait_for_selector("#box-rano", timeout=8000)
    check("v profile je vypínač, zapnutý", pg.locator("#rano-zap").is_checked())
    pg.click("#rano-zap"); pg.wait_for_timeout(1000)
    check("vypnutie uložené", sql("select upozornenia->>'rano' from makleri where email = 'admin@test.sk'") == "false")
    pj=prihlas(b, {"width":390,"height":844}, "jana@test.sk")
    pj.goto(URL+"#rano"); pj.wait_for_timeout(1200)
    check("maklér prehľad nemá", pj.locator("#rano-okno").count() == 0 and pj.locator(".rano-karta").count() == 0)
    pj.click('[data-act="profil"]'); pj.wait_for_timeout(800)
    check("maklér nemá vypínač v profile", pj.locator("#box-rano").count() == 0)
    b.close()
print("\n".join(ok)); print(errs or "bez chýb JS")
