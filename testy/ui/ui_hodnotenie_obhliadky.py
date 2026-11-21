import os, subprocess, urllib.parse, re
from playwright.sync_api import sync_playwright
# Hodnotenie obhliadky: maklér pošle kupujúcemu odkaz, kupujúci ohodnotí (verejná stránka), administrátor schváli → report majiteľa.
URL=os.environ.get("TYPEK_URL", "http://localhost:8000/index.html"); SH=os.environ.get("TYPEK_SNIMKY", "/tmp/typek-snimky/"); ok=[]; errs=[]
def sql(q): return subprocess.run(["psql","-h","127.0.0.1","-p","54322","-U","postgres","-d","typek","-tAc",q],capture_output=True,text=True).stdout.strip()
def check(n,c): ok.append(("OK   " if c else "ZLE  ")+n)
def stranka(n): return URL.replace("index.html", n)
JANA="22222222-2222-2222-2222-222222222222"
sql("""insert into nehnutelnosti (makler_id, nazov, stav, transakcia, kategoria, typ, cena, obec, okres, historia_cien)
       values ('%s', 'Byt Smižany', 'aktivne', 'predaj', 'byty', '3-izbový byt', 120000, 'Smižany', 'Spišská Nová Ves', '[]')""" % JANA)
BYT=sql("select id from nehnutelnosti where nazov = 'Byt Smižany'")
sql("insert into nehnutelnosti_interne (nehnutelnost_id, majitel_meno, report_token) values (%s, 'Ján Majiteľ', 'reporttokenreporttoken0001')" % BYT)
sql("insert into obhliadky (nehnutelnost_id, makler_id, cas, klient_meno, klient_telefon) values (%s, '%s', now() - interval '1 day', 'Karol Kupec', '0905 123 456')" % (BYT, JANA))
def prihlas(b, vp, email):
    pg=b.new_context(viewport=vp).new_page(); pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(URL); pg.wait_for_selector("#l-email"); pg.fill("#l-email",email); pg.fill("#l-heslo","Test12345"); pg.click("#f-login button[type=submit]")
    pg.wait_for_selector("#obsah", timeout=20000); pg.wait_for_timeout(1500); return pg
with sync_playwright() as p:
    b=p.chromium.launch()
    pj=prihlas(b, {"width":1300,"height":900}, "jana@test.sk")
    pj.goto(URL+"#nehnutelnosti/"+BYT); pj.wait_for_selector("#pd-obhliadky .obh", timeout=15000); pj.wait_for_timeout(400)
    pj.click('[data-obh-hod="odkaz"]'); pj.wait_for_selector("#pd-obhliadky .obh-hod a.wa", timeout=8000)
    wa=urllib.parse.unquote(pj.get_attribute("#pd-obhliadky .obh-hod a.wa", "href") or "")
    m=re.search(r"hodnotenie\.html\?t=([0-9a-f]+)", wa)
    check("WhatsApp kupujúcemu s odkazom na hodnotenie", "421905123456" in wa and m is not None and "Karol" in wa)
    tok=m.group(1) if m else ""
    # kupujúci na verejnej stránke
    pk=b.new_context(viewport={"width":390,"height":844}).new_page(); pk.on("pageerror", lambda e: errs.append(str(e)))
    pk.goto(stranka("hodnotenie.html?t="+tok)); pk.wait_for_selector("#f:not([hidden])", timeout=10000)
    check("stránka ukazuje ponuku bez mena kupujúceho", "Byt Smižany" in pk.inner_text("#ob") and "Kupec" not in pk.inner_text("body"))
    pk.click('#hv [data-i="4"]'); pk.fill('[name="pacilo"]', "Pekný výhľad"); pk.fill('[name="nepacilo"]', "Malá kuchyňa")
    pk.screenshot(path=SH+"hodnotenie_kupujuci.png", full_page=True)
    pk.click('#f button[type=submit]'); pk.wait_for_timeout(1500)
    check("poďakovanie po odoslaní", "Ďakujeme" in pk.inner_text("#obsah"))
    pk.goto(stranka("hodnotenie.html?t="+tok)); pk.wait_for_timeout(1500)
    check("druhý raz už nejde", "už poslali" in pk.inner_text("#obsah"))
    # maklérka vidí hodnotenie, schváliť nemôže
    pj.goto(URL+"#domov"); pj.wait_for_timeout(800); pj.reload(); pj.wait_for_selector("#obsah", timeout=20000); pj.wait_for_timeout(1500)
    pj.goto(URL+"#nehnutelnosti/"+BYT); pj.wait_for_selector("#pd-obhliadky .obh-hod", timeout=15000); pj.wait_for_timeout(400)
    t=pj.inner_text("#pd-obhliadky .obh-hod")
    check("maklérka vidí hodnotenie a stav čaká", "Malá kuchyňa" in t and "čaká na schválenie" in t and pj.locator('[data-obh-hod="schvalit"]').count() == 0)
    rep=sql("select report_majitela('reporttokenreporttoken0001') -> 'obhliadky' -> 0 -> 'hodnotenie'")
    check("pred schválením nie je v reporte (%s)" % rep, rep in ("", "null"))
    # administrátor schváli
    pa=prihlas(b, {"width":1300,"height":900}, "admin@test.sk")
    pa.goto(URL+"#nehnutelnosti/"+BYT); pa.wait_for_selector('[data-obh-hod="schvalit"]', timeout=15000)
    pa.locator("#pd-obhliadky").screenshot(path=SH+"hodnotenie_schvalit.png")
    pa.click('[data-obh-hod="schvalit"]'); pa.wait_for_timeout(1500)
    check("po schválení „v reporte majiteľa“", "v reporte majiteľa" in pa.inner_text("#pd-obhliadky .obh-hod"))
    pr=b.new_context(viewport={"width":390,"height":844}).new_page(); pr.on("pageerror", lambda e: errs.append(str(e)))
    pr.goto(stranka("report.html?t=reporttokenreporttoken0001")); pr.wait_for_timeout(2500)
    check("majiteľ v reporte vidí hodnotenie", "hodnotenie záujemcu" in pr.inner_text("body") and "Malá kuchyňa" in pr.inner_text("body"))
    check("verejná stránka bez posúvania do strany", pk.evaluate("document.documentElement.scrollWidth") <= 390)
    b.close()
print("\n".join(ok)); print(errs or "bez chýb JS")
