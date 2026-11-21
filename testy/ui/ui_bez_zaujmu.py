import os, subprocess
from playwright.sync_api import sync_playwright
# Ponuka bez záujmu: 60 dní bez obhliadky → štítok v zozname, porovnanie s podobnými ponukami zo skenera, návrh rozhovoru v AI asistentovi.
URL=os.environ.get("TYPEK_URL", "http://localhost:8000/index.html"); SH=os.environ.get("TYPEK_SNIMKY", "/tmp/typek-snimky/"); ok=[]; errs=[]
def sql(q): return subprocess.run(["psql","-h","127.0.0.1","-p","54322","-U","postgres","-d","typek","-tAc",q],capture_output=True,text=True).stdout.strip()
def check(n,c): ok.append(("OK   " if c else "ZLE  ")+n)
ADMIN="11111111-1111-1111-1111-111111111111"
sql("""insert into nehnutelnosti (makler_id, nazov, stav, transakcia, kategoria, typ, cena, obec, okres, izby, plocha_uzitkova, historia_cien)
       values ('%s', 'Byt Smižany drahý', 'aktivne', 'predaj', 'byty', '3-izbový byt', 150000, 'Smižany', 'Spišská Nová Ves', 3, 70, '[]'),
              ('%s', 'Byt čerstvý', 'aktivne', 'predaj', 'byty', '2-izbový byt', 90000, 'Smižany', 'Spišská Nová Ves', 2, 50, '[]')""" % (ADMIN, ADMIN))
sql("update nehnutelnosti set vytvorene = now() - interval '60 days' where nazov = 'Byt Smižany drahý'")
BYT=sql("select id from nehnutelnosti where nazov = 'Byt Smižany drahý'")
for i, (cena, pl) in enumerate([(105000, 68), (112000, 72), (118000, 70), (99000, 66)]):
    sql("""insert into inzeraty (id, portal, portaly, url, nazov, typ, izby, cena, plocha, cena_m2, obec, okres, predajca, predajca_typ, popis, prvy_krat, naposledy, aktivny)
           values ('bazos:bz%d', 'bazos', '{bazos}', 'https://reality.bazos.sk/inzerat/bz%d/', 'Predám 3-izbový byt Smižany %d', 'byt', 3, %d, %d, %d, 'Smižany', 'Spišská Nová Ves', 'Predajca', 'sukromny', 'Byt', now() - interval '5 days', now(), true)""" % (i, i, i, cena, pl, cena // pl))
with sync_playwright() as p:
    b=p.chromium.launch()
    pg=b.new_context(viewport={"width":1300,"height":900}).new_page(); pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(URL); pg.wait_for_selector("#l-email"); pg.fill("#l-email","admin@test.sk"); pg.fill("#l-heslo","Test12345"); pg.click("#f-login button[type=submit]")
    pg.wait_for_selector("#obsah", timeout=20000); pg.wait_for_timeout(1500)
    pg.goto(URL+"#nehnutelnosti"); pg.wait_for_timeout(2500)
    check("v zozname štítok bez obhliadky (%d)" % pg.locator(".bz-stitok").count(), pg.locator(".bz-stitok").count() == 1 and "60 dní" in pg.locator(".bz-stitok").first.inner_text())
    pg.goto(URL+"#nehnutelnosti/"+BYT); pg.wait_for_selector(".ponuka-detail .bez-zaujmu", timeout=15000)
    t=pg.inner_text(".ponuka-detail .bez-zaujmu")
    check("60 dní bez obhliadky", "60 dní bez obhliadky" in t)
    check("4 podobné ponuky v obci", "4" in pg.inner_text(".bez-zaujmu .bz-cisla > div:first-child") and "Smižany" in t)
    check("naša cena nad trhom", "nad trhom" in t and pg.locator(".bez-zaujmu .bz-cisla .zle").count() == 1)
    check("cena podľa mediánu", "cena podľa mediánu" in t)
    pg.locator(".ponuka-detail .bez-zaujmu").screenshot(path=SH+"bez_zaujmu.png")
    pg.click('.bez-zaujmu [data-bz-ai]'); pg.wait_for_timeout(1500)
    check("AI asistent: Rozhovor o cene s údajmi z porovnania", pg.evaluate("location.hash") == "#asistent" and "Smižany" in (pg.input_value('#obsah textarea, #obsah input[name="detail"]') if pg.locator('#obsah textarea, #obsah input[name="detail"]').count() else pg.inner_text("#obsah")))
    pg.goto(URL+"#nehnutelnosti/"+sql("select id from nehnutelnosti where nazov = 'Byt čerstvý'")); pg.wait_for_selector(".ponuka-detail", timeout=15000); pg.wait_for_timeout(500)
    check("nová ponuka nie je bez záujmu", pg.locator(".ponuka-detail .bez-zaujmu").count() == 0)
    b.close()
print("\n".join(ok)); print(errs or "bez chýb JS")
