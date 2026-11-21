import os, subprocess
from playwright.sync_api import sync_playwright
# Zdieľanie úloh v ToDo Liste: Jana zdieľa úlohu s administrátorom (Peter bez ToDo Listu sa ponúknuť nedá),
# administrátor ju vidí v „Od kolegov“, upraví a odklikne, Jana vidí, kto ju splnil; kolega sa môže odobrať; zdieľanie aj z okna „Do ToDo“.
URL=os.environ.get("TYPEK_URL", "http://localhost:8000/index.html"); SH=os.environ.get("TYPEK_SNIMKY", "/tmp/typek-snimky/"); ok=[]; errs=[]
def sql(q): return subprocess.run(["psql","-h","127.0.0.1","-p","54322","-U","postgres","-d","typek","-tAc",q],capture_output=True,text=True).stdout.strip()
def check(n,c): ok.append(("OK   " if c else "ZLE  ")+n)
JANA="22222222-2222-2222-2222-222222222222"; ADMIN="11111111-1111-1111-1111-111111111111"
sql("update makleri set pristup = array_append(pristup, 'todo') where id = '%s'" % JANA)
sql("""insert into nehnutelnosti (makler_id, nazov, stav, transakcia, kategoria, typ, cena, obec, okres, historia_cien)
       values ('%s', 'Byt Zdieľanie', 'aktivne', 'predaj', 'byty', '2-izbový byt', 99000, 'Levoča', 'Levoča', '[]')""" % JANA)
BYT=sql("select id from nehnutelnosti where nazov = 'Byt Zdieľanie'")
def prihlas(b, email, w=1300, h=900):
    pg=b.new_context(viewport={"width":w,"height":h}).new_page(); pg.on("pageerror", lambda e: errs.append(str(e))); pg.on("dialog", lambda d: d.accept())
    pg.goto(URL); pg.wait_for_selector("#l-email"); pg.fill("#l-email", email); pg.fill("#l-heslo","Test12345"); pg.click("#f-login button[type=submit]")
    pg.wait_for_selector("#obsah", timeout=20000); pg.wait_for_timeout(1500)
    return pg
with sync_playwright() as p:
    b=p.chromium.launch()
    pj=prihlas(b, "jana@test.sk")
    pj.goto(URL+"#poznamky"); pj.wait_for_selector(".poz-box .poz-rychla", timeout=10000)
    pj.click('[data-poz="viac"]'); pj.wait_for_selector(".poz-form .poz-zdiel")
    cipy=pj.inner_text(".poz-form .poz-zdiel")
    check("ponúkne kolegu s ToDo Listom, nie Petra ani seba", "Martin Testovací" in cipy and "Peter" not in cipy and "Jana" not in cipy)
    pj.fill('.poz-form [name="text"]', "Pripraviť zmluvu pre Novákovcov"); pj.fill('.poz-form [name="skupina"]', "Ponuky")
    pj.click('.poz-form [data-poz-zdiel="%s"]' % ADMIN)
    check("čip kolegu sa označí", pj.get_attribute('.poz-form [data-poz-zdiel="%s"]' % ADMIN, "aria-pressed") == "true")
    pj.click(".poz-form [data-ulozit]"); pj.wait_for_timeout(1200)
    check("uložené so zdieľaním", sql("select zdielane::text from poznamky where text like 'Pripraviť zmluvu%'") == "{%s}" % ADMIN)
    pj.fill(".poz-rychla input", "Moja súkromná úloha"); pj.press(".poz-rychla input", "Enter"); pj.wait_for_timeout(1000)
    t=pj.inner_text(".poz-box")
    check("v zozname vidno, s kým je zdieľaná", "👥 Martin Testovací" in t)
    check("filter Zdieľané", pj.locator("[data-pozzdiel]").count() == 1)
    pj.click("[data-pozzdiel]"); pj.wait_for_timeout(300)
    t=pj.inner_text(".poz-box")
    check("filter ukáže len zdieľané", "Pripraviť zmluvu" in t and "Moja súkromná" not in t)
    pj.click("[data-pozzdiel]")
    # administrátor
    pa=prihlas(b, "admin@test.sk")
    pa.goto(URL+"#poznamky"); pa.wait_for_selector(".poz-box .poz-rychla", timeout=10000); pa.wait_for_timeout(500)
    t=pa.inner_text(".poz-box")
    check("kolega vidí zdieľanú úlohu, nie súkromnú", "Pripraviť zmluvu" in t and "Moja súkromná" not in t)
    check("je v skupine Od kolegov s autorom", "Od kolegov" in t and "od Jana Nováková" in t)
    pol=pa.locator(".poz-pol", has_text="Pripraviť zmluvu")
    check("kolega nemá zmazať, má odobrať sa", pol.locator('[data-poz="zmaz"]').count() == 0 and pol.locator('[data-poz="odober"]').count() == 1)
    pol.locator('[data-poz="uprav"]').click(); pa.wait_for_selector(".poz-uprava")
    check("úprava bez skupiny a zdieľania, s menom autora", pa.locator('.poz-uprava [name="skupina"]').count() == 0 and pa.locator(".poz-uprava .poz-zdiel").count() == 0
          and "zdieľa Jana Nováková" in pa.inner_text(".poz-uprava"))
    pa.fill('.poz-uprava [name="text"]', "Pripraviť zmluvu – Novákovci"); pa.click(".poz-uprava [data-ulozit]"); pa.wait_for_timeout(1000)
    check("kolega zmenil text, skupina ostala", sql("select text || '|' || skupina from poznamky where text like 'Pripraviť zmluvu%'") == "Pripraviť zmluvu – Novákovci|Ponuky")
    pa.screenshot(path=SH+"todo_zdielanie_kolega.png", full_page=True)
    pa.locator(".poz-pol", has_text="Pripraviť zmluvu").locator('[data-poz="hotovo"]').click(); pa.wait_for_timeout(1200)
    check("kolega odklikol – zapísané kto", sql("select hotovo_kto::text from poznamky where text like 'Pripraviť zmluvu%'") == ADMIN)
    # Jana vidí, kto úlohu splnil
    pj.goto(URL+"#domov"); pj.wait_for_timeout(500); pj.goto(URL+"#poznamky"); pj.reload(); pj.wait_for_selector(".poz-box .poz-rychla", timeout=15000); pj.wait_for_timeout(800)
    pj.click('[data-pozstav="hotove"]'); pj.wait_for_timeout(300)
    check("autorka vidí, kto ju splnil", "Martin Testovací" in pj.locator(".poz-pol", has_text="Pripraviť zmluvu").inner_text())
    pj.locator(".poz-pol", has_text="Pripraviť zmluvu").locator('[data-poz="hotovo"]').click(); pj.wait_for_timeout(1000)
    # administrátor sa odoberie
    pa.reload(); pa.wait_for_selector(".poz-box .poz-rychla", timeout=15000); pa.wait_for_timeout(800)
    pa.locator(".poz-pol", has_text="Pripraviť zmluvu").locator('[data-poz="odober"]').click(); pa.wait_for_timeout(1000)
    check("po odobratí ju kolega nevidí", pa.locator(".poz-pol", has_text="Pripraviť zmluvu").count() == 0 and sql("select cardinality(zdielane) from poznamky where text like 'Pripraviť zmluvu%'") == "0")
    # okno „Do ToDo“ pri ponuke
    pj.goto(URL+"#nehnutelnosti/"+BYT); pj.wait_for_selector(".ponuka-detail .todo-pri", timeout=15000); pj.wait_for_timeout(400)
    pj.click('.ponuka-detail .todo-pri [data-todo-pridaj]'); pj.wait_for_selector("#todo-okno .poz-zdiel")
    pj.fill('#todo-okno [name="text"]', "Dohodnúť obhliadku s Martinom"); pj.click('#todo-okno [data-poz-zdiel="%s"]' % ADMIN)
    pj.locator("#todo-okno .todo-karta").screenshot(path=SH+"todo_zdielanie_okno.png")
    pj.click('#todo-okno [type="submit"]'); pj.wait_for_timeout(1200)
    r=sql("select zdielane::text || '|' || (odkaz->>'t') from poznamky where text = 'Dohodnúť obhliadku s Martinom'")
    check("z okna Do ToDo zdieľaná a prepojená s ponukou (%s)" % r, r == "{%s}|ponuka" % ADMIN)
    check("v sekcii ponuky vidno zdieľanie", "👥 Martin Testovací" in pj.inner_text(".ponuka-detail .todo-pri"))
    # mobil
    pm=prihlas(b, "admin@test.sk", 390, 844)
    pm.goto(URL+"#poznamky"); pm.wait_for_selector(".poz-box .poz-rychla", timeout=10000); pm.wait_for_timeout(500)
    check("mobil bez posúvania do strany", pm.evaluate("document.documentElement.scrollWidth") <= 390)
    pm.screenshot(path=SH+"todo_zdielanie_mobil.png", full_page=True)
    b.close()
print("\n".join(ok)); print(errs or "bez chýb JS")
