import os, subprocess
from playwright.sync_api import sync_playwright
# „Tento byt sa už predával“: karta inzerátu v skeneri ukáže starší zmiznutý inzerát toho istého bytu (zhoda fotiek).
URL=os.environ.get("TYPEK_URL", "http://localhost:8000/index.html"); SH=os.environ.get("TYPEK_SNIMKY", "/tmp/typek-snimky/"); ok=[]; errs=[]
def sql(q): return subprocess.run(["psql","-h","127.0.0.1","-p","54322","-U","postgres","-d","typek","-tAc",q],capture_output=True,text=True).stdout.strip()
def check(n,c): ok.append(("OK   " if c else "ZLE  ")+n)
sql("""insert into nastavenia (kluc, hodnota) values ('skener_kluc_hash', encode(extensions.digest('testkluc', 'sha256'), 'hex')) on conflict (kluc) do update set hodnota = excluded.hodnota""")
sql("""insert into inzeraty (id, portal, portaly, url, nazov, typ, izby, cena, plocha, cena_m2, obec, okres, predajca, predajca_typ, popis, prvy_krat, naposledy, aktivny) values
  ('bazos:stary', 'bazos', '{bazos}', 'https://x/stary', 'Byt Mier 3i', 'byt', 3, 135000, 68, 1985, 'Spišská Nová Ves', 'Spišská Nová Ves', 'RK Domov', 'rk', 'x', now() - interval '90 days', now() - interval '40 days', false),
  ('nehnutelnosti:novy', 'nehnutelnosti', '{nehnutelnosti}', 'https://x/novy', 'Predám 3-izbový byt Mier', 'byt', 3, 119000, 67, 1776, 'Spišská Nová Ves', 'Spišská Nová Ves', 'Peter', 'sukromny', 'x', now() - interval '2 days', now(), true)""")
sql("insert into archiv (inzerat_id, popis, fotky) values ('bazos:stary', 'x', '{a/1.jpg,a/2.jpg}'), ('nehnutelnosti:novy', 'x', '{c/1.jpg,c/2.jpg}')")
sql("""select skener_ulozit_odtlacky('testkluc', '[{"id":"bazos:stary","h":["1000","2000"]},{"id":"nehnutelnosti:novy","h":["1003","2007"]}]')""")
sql("select skener_prepocitaj_predtym('testkluc')")
with sync_playwright() as p:
    b=p.chromium.launch()
    pg=b.new_context(viewport={"width":1300,"height":900}).new_page(); pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(URL); pg.wait_for_selector("#l-email"); pg.fill("#l-email","jana@test.sk"); pg.fill("#l-heslo","Test12345"); pg.click("#f-login button[type=submit]")
    pg.wait_for_selector("#obsah", timeout=20000); pg.wait_for_timeout(1500)
    pg.goto(URL+"#inzeraty"); k='#obsah .card[data-id="nehnutelnosti:novy"]'; pg.wait_for_selector(k, timeout=15000)
    t=(pg.inner_text(k+" .predtym") if pg.locator(k+" .predtym").count() else "").replace("\u00a0", " ").replace("\u202f", " ")
    check("na karte „Tento byt sa už predával“", "Tento byt sa už predával" in t)
    check("predošlá cena, rozdiel a realitka", "135 000" in t and "-12 %" in t and "realitka" in t and "RK Domov" in t)
    check("odkaz na staršiu kartu", pg.locator(k+' .predtym a[href="#inzeraty/bazos%3Astary"]').count() == 1)
    pg.locator(k).screenshot(path=SH+"predtym.png")
    b.close()
print("\n".join(ok)); print(errs or "bez chýb JS")
