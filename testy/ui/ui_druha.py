import os
import subprocess
from playwright.sync_api import sync_playwright
def sql(q): return subprocess.run(["psql","-h","127.0.0.1","-p","54322","-U","postgres","-d","typek","-tAqc",q],capture_output=True,text=True).stdout.strip()
sql("""update prevzatia set prevzate=now()-interval '3 days' where inzerat_id='bazos:b1';
 insert into inzeraty_ai(inzerat_id, verdikt, istota, dovod) values ('bazos:c2','rk',95,'Text menuje realitnú kanceláriu X')
   on conflict (inzerat_id) do update set verdikt='rk', istota=95""")
subprocess.run(["bash", os.path.join(os.path.dirname(__file__), "..", "prostredie", "sqlas.sh"), "jana@test.sk", "select prevziat('bazos:b2')"], capture_output=True)

URL=os.environ.get("TYPEK_URL", "http://localhost:8000/index.html"); ok=[]; errs=[]
def check(n,c): ok.append(("OK   " if c else "ZLE  ")+n)
odpovede=[]
def prihlas(b, mail, vp):
    pg=b.new_page(viewport=vp); pg.on("pageerror", lambda e: errs.append(str(e)))
    def dlg(d):
        if d.type=="prompt": d.accept("Domy tím")
        else: d.accept()
    pg.on("dialog", dlg)
    pg.goto(URL); pg.wait_for_selector("#l-email"); pg.fill("#l-email",mail); pg.fill("#l-heslo","Test12345"); pg.click("#f-login button[type=submit]")
    pg.wait_for_selector("#obsah", timeout=20000); pg.wait_for_timeout(800)
    pg.goto(URL+"#inzeraty"); pg.wait_for_selector(".card", timeout=20000); pg.wait_for_timeout(800); return pg
with sync_playwright() as p:
    b=p.chromium.launch()
    pg=prihlas(b,"jana@test.sk",{"width":390,"height":844})
    k=pg.locator('.card[data-id="bazos:b2"]')
    check("bez hovoru: SMS sa nedá, výzva zavolať", k.locator('.sms-btn').count()==0 and "Najprv zavolaj" in k.inner_text())
    nb=k.locator('[data-act="nedviha"]'); check("mobil: Nedvíha viditeľné", nb.count()==1 and nb.is_visible())
    nb.click(); pg.wait_for_timeout(1500)
    check("toast Nedvíha", "Nedvíha" in pg.locator("#toast").inner_text())
    check("stav karty Volané: Nedvíha", "Nedvíha" in pg.locator('.card[data-id="bazos:b2"] .status').inner_text())
    k=pg.locator('.card[data-id="bazos:b2"]')
    check("po hovore: tlačidlo Poslať SMS", k.locator('.sms-btn').count()==1 and "Najprv zavolaj" not in k.inner_text())
    # AI realitka
    pg.locator('.seg[data-seg="predajca"] button[data-v="rk"]').click(); pg.wait_for_timeout(400)
    c2=pg.locator('.card[data-id="bazos:c2"]')
    check("c2 (AI 95 %) je medzi RK", c2.count()==1 and "podľa AI" in c2.locator(".pill.rk").first.inner_text())
    c2.locator('[data-act="viac"]').click(); pg.wait_for_timeout(200)
    c2=pg.locator('.card[data-id="bazos:c2"]'); c2.locator('[data-act="oznac-sukr"]').click(); pg.wait_for_timeout(1200)
    check("po Nie je RK zmizol z RK", pg.locator('.card[data-id="bazos:c2"]').count()==0)
    pg.locator('.seg[data-seg="predajca"] button[data-v="sukr"]').click(); pg.wait_for_timeout(400)
    check("c2 späť medzi súkromnými", pg.locator('.card[data-id="bazos:c2"]').count()==1)
    check("mobil bez posúvania", pg.evaluate("document.documentElement.scrollWidth")<=390)
    pg.close()
    pg=prihlas(b,"admin@test.sk",{"width":1300,"height":900})
    pg.locator('.seg[data-seg="typ"] button[data-v="dom"]').click(); pg.wait_for_timeout(300)
    pg.locator("[data-pohlad-uloz]").click(); pg.wait_for_timeout(1500)
    check("admin uložil tímový pohľad", pg.locator(".pohlad.tim").count()==1)
    pg.goto(URL+"#vykon"); pg.wait_for_timeout(2500)
    t=pg.locator("#obsah").inner_text()
    check("Výkon: Držia bez hovoru", "Držia inzeráty bez hovoru" in t and pg.locator("select[data-vykon-presun]").count()>=1)
    pg.locator(".drzia-tbl").screenshot(path="" + os.environ.get("TYPEK_SNIMKY", "/tmp/typek-snimky/") + "drzia.png")
    pg.locator("select[data-vykon-presun]").first.select_option("__volny"); pg.wait_for_timeout(1500)
    check("presun z Výkonu", "voľný" in pg.locator("#toast").inner_text())
    pg.close()
    pg=prihlas(b,"peter@test.sk",{"width":1300,"height":900}); pg.wait_for_timeout(800)
    check("maklér vidí tímový pohľad", pg.locator(".pohlad.tim").count()==1 and pg.locator(".pohlad.tim .pohlad-x").count()==0)
    pg.close(); b.close()
print("\n".join(ok)); print(errs or "bez chýb JS")
