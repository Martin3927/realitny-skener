import os, subprocess
from playwright.sync_api import sync_playwright
# Hľadať v celom Týpkovi: 🔍 v hlavičke, Ctrl+K a „/“; telefón v hocijakom tvare, meno klienta, majiteľ ponuky, obec.
URL=os.environ.get("TYPEK_URL", "http://localhost:8000/index.html"); SH=os.environ.get("TYPEK_SNIMKY", "/tmp/typek-snimky/"); ok=[]; errs=[]
def sql(q): return subprocess.run(["psql","-h","127.0.0.1","-p","54322","-U","postgres","-d","typek","-tAc",q],capture_output=True,text=True).stdout.strip()
def check(n,c): ok.append(("OK   " if c else "ZLE  ")+n)
ADMIN="11111111-1111-1111-1111-111111111111"
sql("""insert into nehnutelnosti (makler_id, nazov, stav, transakcia, kategoria, typ, cena, obec, okres, izby, plocha_uzitkova, historia_cien)
       values ('%s', 'Byt Tarča', 'aktivne', 'predaj', 'byty', '3-izbový byt', 120000, 'Spišská Nová Ves', 'Spišská Nová Ves', 3, 70, '[]')""" % ADMIN)
BYT=sql("select id from nehnutelnosti where nazov = 'Byt Tarča'")
sql("insert into nehnutelnosti_interne (nehnutelnost_id, majitel_meno, majitel_telefon) values (%s, 'Ján Majiteľ', '0911 222 333')" % BYT)
sql("insert into dopyty (makler_id, transakcia, kategorie, obce, cena_do) values ('%s', 'predaj', '{byty}', '{Smižany}', 130000)" % ADMIN)
DOPYT=sql("select max(id) from dopyty")
sql("insert into dopyty_kontakty (dopyt_id, meno, telefon) values (%s, 'Karol Kupec', '0905 123 456')" % DOPYT)
TEL=sql("select telefon from telefony limit 1"); INZ=sql("select inzerat_id from telefony limit 1")
def prihlas(b, vp, email):
    pg=b.new_context(viewport=vp).new_page(); pg.on("pageerror", lambda e: errs.append(str(e))); pg.on("dialog", lambda d: d.accept())
    pg.goto(URL); pg.wait_for_selector("#l-email"); pg.fill("#l-email",email); pg.fill("#l-heslo","Test12345"); pg.click("#f-login button[type=submit]")
    pg.wait_for_selector("#obsah", timeout=20000); pg.wait_for_timeout(1500); return pg
def hladaj(pg, q):
    pg.fill("#hladaj-okno input", q); pg.wait_for_timeout(500); return pg.inner_text("#hladaj-okno .hladaj-vysl")
with sync_playwright() as p:
    b=p.chromium.launch()
    pg=prihlas(b, {"width":1300,"height":900}, "admin@test.sk")
    pg.click('[data-act="hladaj"]'); pg.wait_for_selector("#hladaj-okno input")
    check("🔍 otvorí hľadanie s kurzorom v poli", pg.evaluate("document.activeElement.matches('#hladaj-okno input')"))
    # telefón predajcu zo skenera v inom tvare (bez predvoľby, s medzerami)
    d=TEL.replace("+421","0"); q=d[:4]+" "+d[4:7]+" "+d[7:]
    t=hladaj(pg, q)
    check("telefón nájde predajcu zo skenera (%s)" % q, "Skener" in t or "Predávajúci" in t)
    t=hladaj(pg, "Kupec")
    check("meno nájde klienta", "Klienti" in t and "Karol Kupec" in t)
    t=hladaj(pg, "0911222333")
    check("telefón majiteľa nájde ponuku", "Ponuky" in t and "Byt Tarča" in t)
    t=hladaj(pg, "tarca")
    check("hľadá aj bez diakritiky", "Byt Tarča" in t)
    pg.locator("#hladaj-okno").screenshot(path=SH+"hladaj.png")
    hladaj(pg, "Ján Majiteľ")
    pg.press("#hladaj-okno input", "Enter"); pg.wait_for_timeout(1500)
    check("Enter otvorí prvý výsledok (ponuku)", pg.locator("#hladaj-okno").count() == 0 and pg.locator(".ponuka-detail").count() == 1)
    pg.keyboard.press("Control+k"); pg.wait_for_selector("#hladaj-okno input")
    check("Ctrl+K otvorí hľadanie", pg.locator("#hladaj-okno").count() == 1)
    hladaj(pg, "Kupec"); pg.click('#hladaj-okno [data-hl="dopyt"]'); pg.wait_for_timeout(1500)
    check("klik otvorí klienta", pg.locator(".dopyt-detail").count() == 1)
    pg.keyboard.press("/"); pg.wait_for_selector("#hladaj-okno input")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(200)
    check("„/“ otvorí a Escape zavrie", pg.locator("#hladaj-okno").count() == 0)
    t=None
    pg.click('[data-act="hladaj"]'); pg.wait_for_selector("#hladaj-okno input"); t=hladaj(pg, "xyzxyz")
    check("nič sa nenašlo", "Nič sa nenašlo" in t)
    # maklér bez sekcie Klienti klientov nevidí
    sql("update makleri set pristup = array_remove(pristup, 'klienti') where email = 'peter@test.sk'")
    pp=prihlas(b, {"width":390,"height":844}, "peter@test.sk")
    pp.click('[data-act="hladaj"]'); pp.wait_for_selector("#hladaj-okno input"); t=pp.fill("#hladaj-okno input", "Kupec"); pp.wait_for_timeout(600)
    check("bez sekcie Klienti nevidí klientov", "Karol Kupec" not in pp.inner_text("#hladaj-okno .hladaj-vysl"))
    check("mobil bez posúvania do strany", pp.evaluate("document.documentElement.scrollWidth") <= 390)
    pp.screenshot(path=SH+"hladaj_mobil.png")
    b.close()
print("\n".join(ok)); print(errs or "bez chýb JS")
