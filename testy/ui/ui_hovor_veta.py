import os, subprocess, json, datetime
from playwright.sync_api import sync_playwright
# Hovor jednou vetou: maklér napíše/nadiktuje vetu, AI (tu podstrčená odpoveď) vyplní výsledok, poznámku a pripomienku; uloží maklér.
URL=os.environ.get("TYPEK_URL", "http://localhost:8000/index.html"); SH=os.environ.get("TYPEK_SNIMKY", "/tmp/typek-snimky/"); ok=[]; errs=[]
def sql(q): return subprocess.run(["psql","-h","127.0.0.1","-p","54322","-U","postgres","-d","typek","-tAc",q],capture_output=True,text=True).stdout.strip()
def check(n,c): ok.append(("OK   " if c else "ZLE  ")+n)
INZ=sql("select z.id from inzeraty z where z.predajca_typ <> 'rk' and z.aktivny and not exists (select 1 from prevzatia p where p.inzerat_id = z.id) order by z.prvy_krat desc limit 1")
DEN=(datetime.date.today()+datetime.timedelta(days=3)).isoformat()
poslane=[]
def ai(route):
    poslane.append(json.loads(route.request.post_data or "{}"))
    route.fulfill(status=200, content_type="application/json", body=json.dumps({"vysledok": "Volať neskôr", "poznamka": "Predajca ešte rozmýšľa, chce 150 000 €.", "cena": 150000,
        "pripomienka": {"datum": DEN, "cas": "14:00", "text": "Zavolať znova predajcovi"}, "telefon": None}))
with sync_playwright() as p:
    b=p.chromium.launch()
    pg=b.new_context(viewport={"width":1300,"height":900}).new_page(); pg.on("pageerror", lambda e: errs.append(str(e))); pg.on("dialog", lambda d: d.accept())
    pg.route("**/functions/v1/ai-skener", ai)
    pg.goto(URL); pg.wait_for_selector("#l-email"); pg.fill("#l-email","admin@test.sk"); pg.fill("#l-heslo","Test12345"); pg.click("#f-login button[type=submit]")
    pg.wait_for_selector("#obsah", timeout=20000); pg.wait_for_timeout(1500)
    pg.goto(URL+"#inzeraty"); karta='#obsah .card[data-id="%s"]' % INZ; pg.wait_for_selector(karta, timeout=15000)
    pg.click(karta+' [data-act="hovor"]'); pg.wait_for_selector(karta+' form[data-form="hovor"] .hv-veta')
    check("vo formulári hovoru je pole jednou vetou", pg.locator(karta+' [name="veta"]').count() == 1)
    pg.fill(karta+' [name="veta"]', "rozmysla chce stopatdesiat tisic zavolaj vo stvrtok poobede")
    pg.click(karta+' [data-hv="ai"]'); pg.wait_for_timeout(1200)
    check("AI dostala vetu aj inzerát", poslane and poslane[-1].get("inzerat") == INZ and "rozmysla" in poslane[-1].get("veta", ""))
    f=karta+' form[data-form="hovor"]'
    check("výsledok vyplnený", pg.input_value(f+' [name="vysledok"]') == "Volať neskôr")
    check("poznámka vyplnená", "150 000" in pg.input_value(f+' [name="poznamka"]'))
    check("ponúkne pripomienku (zapnutú)", pg.locator(f+' [name="prip_zap"]').count() == 1 and pg.locator(f+' [name="prip_zap"]').is_checked())
    check("veta ostala v poli", "rozmysla" in pg.input_value(f+' [name="veta"]'))
    pg.locator(karta).screenshot(path=SH+"hovor_veta.png")
    pg.click(f+' button[type=submit]'); pg.wait_for_timeout(2000)
    check("hovor uložený (%s)" % sql("select vysledok || ' / ' || poznamka from aktivity where inzerat_id = '%s' and typ = 'hovor' order by id desc limit 1" % INZ),
          sql("select vysledok from aktivity where inzerat_id = '%s' and typ = 'hovor' order by id desc limit 1" % INZ) == "Volať neskôr")
    pr=sql("select to_char(cas at time zone 'Europe/Bratislava', 'YYYY-MM-DD HH24:MI') || ' ' || poznamka from pripomienky where inzerat_id = '%s' order by id desc limit 1" % INZ)
    check("pripomienka nastavená (%s)" % pr, pr.startswith(DEN + " 14:00") and "Zavolať znova" in pr)
    # bez práva na AI pole nie je
    sql("update makleri set pristup = array_remove(pristup, 'asistent') where email = 'jana@test.sk'")
    pj=b.new_context(viewport={"width":390,"height":844}).new_page(); pj.on("pageerror", lambda e: errs.append(str(e)))
    pj.goto(URL); pj.wait_for_selector("#l-email"); pj.fill("#l-email","jana@test.sk"); pj.fill("#l-heslo","Test12345"); pj.click("#f-login button[type=submit]")
    pj.wait_for_selector("#obsah", timeout=20000); pj.wait_for_timeout(1500)
    INZ2=sql("select z.id from inzeraty z where z.predajca_typ <> 'rk' and z.aktivny and not exists (select 1 from prevzatia p where p.inzerat_id = z.id) order by z.prvy_krat desc limit 1")
    pj.goto(URL+"#inzeraty"); k2='#obsah .card[data-id="%s"]' % INZ2; pj.wait_for_selector(k2, timeout=15000)
    if pj.locator(k2+' [data-act="viac"]').is_visible(): pj.click(k2+' [data-act="viac"]')
    pj.click(k2+' [data-act="hovor"]'); pj.wait_for_selector(k2+' form[data-form="hovor"]')
    check("bez AI nie je pole jednou vetou", pj.locator(k2+' .hv-veta').count() == 0)
    check("mobil bez posúvania do strany", pj.evaluate("document.documentElement.scrollWidth") <= 390)
    b.close()
print("\n".join(ok)); print(errs or "bez chýb JS")
