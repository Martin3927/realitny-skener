import os
import subprocess
from playwright.sync_api import sync_playwright
def sql(q): return subprocess.run(["psql","-h","127.0.0.1","-p","54322","-U","postgres","-d","typek","-tAqc",q],capture_output=True,text=True).stdout.strip()
subprocess.run(["bash", os.path.join(os.path.dirname(__file__), "..", "prostredie", "sqlas.sh"), "jana@test.sk", "select prevziat('bazos:b2'); select prevziat('bazos:c2')"], capture_output=True)
sql("""update inzeraty set suvisiace='[{"id":"reality:r1","portal":"reality","url":"https://x","predajca":"Realitka XY","rk":true}]' where id='bazos:c1';
 update prevzatia set upravene=now()-interval '23 hours' where inzerat_id='bazos:b2';
 update prevzatia set upravene=now()-interval '5 hours' where inzerat_id='bazos:c2';
 insert into pripomienky(makler_id,inzerat_id,cas,poznamka,druh,kancelaria_id) values ('22222222-2222-2222-2222-222222222222','bazos:c3',now()-interval '10 minutes','Nedvíha – skús znova','volat',1)""")

URL=os.environ.get("TYPEK_URL", "http://localhost:8000/index.html"); ok=[]; errs=[]
def check(n,c): ok.append(("OK   " if c else "ZLE  ")+n)
def prihlas(b, mail, vp):
    pg=b.new_page(viewport=vp); pg.on("pageerror", lambda e: errs.append(str(e))); pg.on("dialog", lambda d: d.accept("Moje domy"))
    pg.goto(URL); pg.wait_for_selector("#l-email"); pg.fill("#l-email",mail); pg.fill("#l-heslo","Test12345"); pg.click("#f-login button[type=submit]")
    pg.wait_for_selector("#obsah", timeout=20000); pg.wait_for_timeout(800)
    pg.goto(URL+"#inzeraty"); pg.wait_for_selector(".card", timeout=20000); pg.wait_for_timeout(700); return pg
with sync_playwright() as p:
    b=p.chromium.launch()
    for vp,m in (({"width":1300,"height":900},"desk"),({"width":390,"height":844},"mobil")):
        pg=prihlas(b,"jana@test.sk",vp)
        mp=pg.locator(".moja-praca")
        check(m+": panel Moja práca dnes", mp.count()==1)
        t=mp.inner_text(); print(m, "MP:", t.replace("\n"," | ")[:400])
        check(m+": prvý prevzatý je ten, čo sa uvoľní najskôr", "uvoľnia hore" in mp.inner_text())
        mp.screenshot(path="" + os.environ.get("TYPEK_SNIMKY", "/tmp/typek-snimky/") + "mp_%s.png" % m)
        # súvisiace
        s=pg.locator('.card[data-id="bazos:c1"] .suv-row')
        check(m+": súvisiaca RK na c1", s.count()==1 and "realitka" in s.inner_text())
        # ⋯ Viac
        k=pg.locator('.card[data-id="bazos:b2"]')
        det=k.locator('[data-act="detail"]')
        if m=="mobil":
            check("mobil: Detail skrytý pod Viac", not det.is_visible())
            k.locator('[data-act="viac"]').click(); pg.wait_for_timeout(200); k=pg.locator('.card[data-id="bazos:b2"]')
            check("mobil: po Viac vidno Detail", k.locator('[data-act="detail"]').is_visible())
        else:
            check("desk: Detail viditeľný, Viac skrytý", det.is_visible() and not k.locator('[data-act="viac"]').is_visible())
        # Ešte riešim
        rb=k.locator('[data-act="riesim"]'); check(m+": tlačidlo Ešte riešim", rb.count()==1 and rb.is_visible())
        k.screenshot(path="" + os.environ.get("TYPEK_SNIMKY", "/tmp/typek-snimky/") + "karta_%s.png" % m)
        if m=="desk":
            rb.click(); pg.wait_for_timeout(200)
            f=pg.locator('.card[data-id="bazos:b2"] form[data-form="riesim"]'); check("formulár Ešte riešim", f.count()==1)
            f.locator("textarea").fill("Predajca sa ozve v piatok"); f.locator('button[type="submit"]').click(); pg.wait_for_timeout(1200)
            check("toast predĺžené", "Predĺžené" in pg.locator("#toast").inner_text())
            pg.locator('.card[data-id="bazos:b2"] [data-act="hist"]').click(); pg.wait_for_timeout(800)
            check("v histórii predĺženie", "predĺžil prevzatie" in pg.locator('.card[data-id="bazos:b2"] .history').inner_text())
            # pohľady
            pv=pg.locator(".pohlady"); print("POHLADY:", pv.inner_text().replace("\n"," | "))
            pg.locator('.pohlady [data-pohlad]').filter(has_text="Súkromní za 24 h").click(); pg.wait_for_timeout(400)
            check("pohľad Súkromní 24 h aktívny", pg.locator('.pohlady [data-pohlad][aria-pressed="true"]').inner_text()=="🆕 Súkromní za 24 h")
            pg.select_option("#f-typ" if pg.locator("#f-typ").count() else "#f-okres", index=1) if False else pg.locator('.seg[data-seg="typ"] button[data-v="dom"]').click()
            pg.wait_for_timeout(300)
            check("tlačidlo Uložiť filter viditeľné", pg.locator("[data-pohlad-uloz]").is_visible())
            pg.locator("[data-pohlad-uloz]").click(); pg.wait_for_timeout(1200)
            check("uložený pohľad", pg.locator('.pohlady .pohlad.moj').count()==1 and "Moje domy" in pg.locator('.pohlady .pohlad.moj').inner_text())
            pg.locator(".pohlady").screenshot(path="" + os.environ.get("TYPEK_SNIMKY", "/tmp/typek-snimky/") + "pohlady.png")
            # hovor s číslom v poznámke na d1 (nemá telefón)
            pg.locator('.pohlady [data-pohlad]').filter(has_text="Moje").first.click(); pg.wait_for_timeout(300)
        check(m+": bez posúvania do strany", pg.evaluate("document.documentElement.scrollWidth")<=vp["width"])
        pg.close()
    pg=prihlas(b,"jana@test.sk",{"width":1300,"height":900})
    check("pohľad ostal po prihlásení", pg.locator('.pohlady .pohlad.moj').count()==1)
    c=pg.locator('.card[data-id="bazos:d1"]')
    if c.count():
        c.locator('[data-act="hovor"]').click(); pg.wait_for_timeout(200)
        f=pg.locator('.card[data-id="bazos:d1"] form[data-form="hovor"]'); f.locator('select[name="vysledok"]').select_option("Nedvíha")
        f.locator('textarea[name="poznamka"]').fill("manžel 0905 111 222"); f.locator('button[type="submit"]').click(); pg.wait_for_timeout(1500)
        check("telefón z poznámky na karte", "0905 111 222" in pg.locator('.card[data-id="bazos:d1"] .tel-row').inner_text())
    else: check("d1 karta", False)
    pg.close()
    pg=prihlas(b,"admin@test.sk",{"width":1300,"height":900})
    pg.goto(URL+"#vykon"); pg.wait_for_timeout(1500)
    pg.locator('[data-obd="7_dni"]').click(); pg.wait_for_timeout(1500)
    t=pg.locator(".vykon").inner_text()
    check("výkon: Ešte riešim stĺpec", "EŠTE RIEŠIM" in t.upper()); check("výkon: nevyužití súkromníci", "súkromných nikto neriešil" in t)
    pg.locator(".vykon-sum").first.screenshot(path="" + os.environ.get("TYPEK_SNIMKY", "/tmp/typek-snimky/") + "vykon.png")
    pg.close(); b.close()
print("\n".join(ok)); print(errs or "bez chýb JS")
