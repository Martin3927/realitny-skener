import os, subprocess, urllib.parse
from playwright.sync_api import sync_playwright
# Výročie obchodu: administrátor zapne v Nastaveniach tímu; pri predanej ponuke je pripravený pozdrav majiteľovi.
URL=os.environ.get("TYPEK_URL", "http://localhost:8000/index.html"); SH=os.environ.get("TYPEK_SNIMKY", "/tmp/typek-snimky/"); ok=[]; errs=[]
def sql(q): return subprocess.run(["psql","-h","127.0.0.1","-p","54322","-U","postgres","-d","typek","-tAc",q],capture_output=True,text=True).stdout.strip()
def check(n,c): ok.append(("OK   " if c else "ZLE  ")+n)
ADMIN="11111111-1111-1111-1111-111111111111"
sql("""insert into nehnutelnosti (makler_id, nazov, stav, transakcia, kategoria, typ, cena, obec, okres, historia_cien)
       values ('%s', 'Byt Tarča', 'predane', 'predaj', 'byty', '3-izbový byt', 120000, 'Spišská Nová Ves', 'Spišská Nová Ves', '[]')""" % ADMIN)
BYT=sql("select id from nehnutelnosti where nazov = 'Byt Tarča'")
sql("update nehnutelnosti set predane_kedy = now() - interval '1 year' + interval '3 days' where id = %s" % BYT)
sql("insert into nehnutelnosti_interne (nehnutelnost_id, majitel_meno, majitel_telefon, majitel_email) values (%s, 'Ján Novák', '0905 111 222', 'jan@test.sk')" % BYT)
with sync_playwright() as p:
    b=p.chromium.launch()
    pg=b.new_context(viewport={"width":1300,"height":900}).new_page(); pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(URL); pg.wait_for_selector("#l-email"); pg.fill("#l-email","admin@test.sk"); pg.fill("#l-heslo","Test12345"); pg.click("#f-login button[type=submit]")
    pg.wait_for_selector("#obsah", timeout=20000); pg.wait_for_timeout(1500)
    pg.goto(URL+"#nehnutelnosti/"+BYT); pg.wait_for_selector(".ponuka-detail", timeout=15000); pg.wait_for_timeout(600)
    check("vypnuté: pri predanej ponuke nie je výročie", pg.locator(".ponuka-detail .vyrocie").count() == 0)
    pg.goto(URL+"#makleri"); pg.wait_for_timeout(1500); pg.click(".mk-tim-nast summary"); pg.wait_for_timeout(300)
    check("v Nastaveniach tímu vypínač, vypnutý", pg.locator("#vyrocia-zap").count() == 1 and not pg.is_checked("#vyrocia-zap"))
    pg.click("#vyrocia-zap"); pg.wait_for_timeout(1000)
    check("zapnutie uložené", sql("select hodnota from nastavenia_kancelarie where kluc = 'vyrocia'") == "1")
    pg.goto(URL+"#nehnutelnosti/"+BYT); pg.wait_for_selector(".ponuka-detail .vyrocie", timeout=15000)
    t=pg.inner_text(".ponuka-detail .vyrocie")
    check("výročie o 3 dni a meno majiteľa", "o 3 dni" in t and "Ján Novák" in t)
    wa=urllib.parse.unquote(pg.get_attribute(".ponuka-detail .vyrocie a.wa", "href") or "")
    check("WhatsApp majiteľovi s pozdravom", "421905111222" in wa.replace("+", "") and "pred rokom" in wa and "Byt Tarča" in wa)
    check("aj SMS a e-mail", pg.locator('.ponuka-detail .vyrocie a[href^="sms:"]').count() == 1 and pg.locator('.ponuka-detail .vyrocie a[href^="mailto:jan%40test.sk"]').count() == 1)
    pg.locator(".ponuka-detail .vyrocie").screenshot(path=SH+"vyrocie.png")
    b.close()
print("\n".join(ok)); print(errs or "bez chýb JS")
