import os
import subprocess
from playwright.sync_api import sync_playwright
# Stav nehnuteľnosti v dopyte a rubrika Mimo ponuky (Klienti → štvrtý pohľad): zápis, párovanie s dopytmi,
# kontakt na majiteľa len pre makléra nehnuteľnosti a admina, zvonček kolegovi, archív.
URL=os.environ.get("TYPEK_URL", "http://localhost:8000/index.html"); SH=os.environ.get("TYPEK_SNIMKY", "/tmp/typek-snimky/"); ok=[]; errs=[]
def sql(q): return subprocess.run(["psql","-h","127.0.0.1","-p","54322","-U","postgres","-d","typek","-tAc",q],capture_output=True,text=True).stdout.strip()
def check(n,c): ok.append(("OK   " if c else "ZLE  ")+n)
JANA="22222222-2222-2222-2222-222222222222"; PETER="33333333-3333-3333-3333-333333333333"

sql("""insert into nehnutelnosti (makler_id, nazov, stav, transakcia, kategoria, typ, cena, obec, okres, izby, plocha_uzitkova, stav_objektu) values
       ('%s', 'Byt pôvodný', 'aktivne', 'predaj', 'byty', '3-izbový byt', 110000, 'Smižany', 'Spišská Nová Ves', 3, 70, 'pôvodný stav'),
       ('%s', 'Byt nový', 'aktivne', 'predaj', 'byty', '3-izbový byt', 125000, 'Smižany', 'Spišská Nová Ves', 3, 72, 'novostavba')""" % (JANA, JANA))

def prihlas(b, email, vp):
    pg=b.new_page(viewport=vp); pg.on("pageerror", lambda e: errs.append(str(e))); pg.on("dialog", lambda d: d.accept())
    pg.goto(URL); pg.wait_for_selector("#l-email"); pg.fill("#l-email",email); pg.fill("#l-heslo","Test12345"); pg.click("#f-login button[type=submit]")
    pg.wait_for_selector("#obsah", timeout=20000); pg.wait_for_timeout(1500)
    return pg

with sync_playwright() as p:
    b=p.chromium.launch()
    # ---- Peter zapíše klienta, ktorý chce novostavbu
    pe=prihlas(b,"peter@test.sk",{"width":1300,"height":900})
    pe.goto(URL+"#klienti"); pe.wait_for_timeout(1500)
    pe.locator('[data-kl-pohlad="dopyty"]').click(); pe.wait_for_timeout(600)
    check("Klienti: štyri pohľady vrátane Mimo ponuky", pe.locator("[data-kl-pohlad]").count() == 4 and pe.locator('[data-kl-pohlad="mimo"]').count() == 1)
    pe.locator('[data-dop="novy"]').click(); pe.wait_for_timeout(500)
    pe.fill('[data-k="meno"]', "Karol Kupec"); pe.fill('[data-k="telefon"]', "0905 123 456")
    pe.locator('[data-dcipy="kategorie"] .cip[data-hodnota="byty"]').click(); pe.wait_for_timeout(300)
    check("dopyt: čipy Stav nehnuteľnosti", pe.locator('[data-dcipy="stavy"] .cip').count() == 8)
    pe.fill('[data-d="cena_do"]', "130000")
    check("náhľad pred stavom: sedia 2 ponuky", "sedí 2 ponuky" in pe.locator("#dopyt-nahlad").inner_text())
    pe.locator('[data-dcipy="stavy"] .cip[data-hodnota="novostavba"]').click(); pe.wait_for_timeout(300)
    check("náhľad po výbere novostavby: sedí 1 ponuka", "sedí 1 ponuka" in pe.locator("#dopyt-nahlad").inner_text())
    pe.locator('[data-df="ulozit"]').click(); pe.wait_for_timeout(2000)
    check("stav sa uložil (%s)" % sql("select stavy from dopyty order by id desc limit 1"), sql("select stavy from dopyty order by id desc limit 1") == "{novostavba}")
    check("detail dopytu: novostavba v popise, sedí len Byt nový", "novostavba" in pe.locator(".dopyt-detail").inner_text() and pe.locator(".dd-ponuka").count() == 1 and "Byt nový" in pe.locator(".dd-ponuka").inner_text())
    check("detail dopytu: sekcia Mimo ponuky (zatiaľ nič)", pe.locator("#dd-mimo").count() == 1 and "(0)" in pe.locator("#dd-mimo h4").inner_text())

    # ---- Jana pridá nehnuteľnosť mimo ponuky
    j=prihlas(b,"jana@test.sk",{"width":1300,"height":900})
    j.goto(URL+"#klienti"); j.wait_for_timeout(1500)
    j.locator('[data-kl-pohlad="mimo"]').click(); j.wait_for_timeout(600)
    check("Mimo ponuky: prázdny zoznam a tlačidlo Pridať", j.locator("[data-mimo-nova]").count() == 1 and j.locator(".mimo-karta").count() == 0)
    j.locator("[data-mimo-nova]").click(); j.wait_for_timeout(400)
    j.locator('[data-mcip="kategoria"] .cip[data-hodnota="byty"]').click(); j.wait_for_timeout(300)
    j.locator('[data-mcip="typ"] .cip[data-hodnota="3-izbový byt"]').click(); j.wait_for_timeout(300)
    j.locator('[data-mcip="stav_objektu"] .cip[data-hodnota="novostavba"]').click(); j.wait_for_timeout(300)
    j.fill("#mlok-q", "Smiž"); j.wait_for_selector("[data-mlok]", timeout=8000); j.locator("[data-mlok]").first.click(); j.wait_for_timeout(300)
    check("obec zo zoznamu doplní okres", "Spišská Nová Ves" in j.locator("#mlok-okres").inner_text())
    j.fill('[data-m="cena"]', "128000"); j.fill('[data-m="plocha"]', "74"); j.fill('[data-m="izby"]', "3")
    j.fill('[data-m="popis"]', "Majiteľ zvažuje predaj na jar.")
    j.fill('[data-mk="meno"]', "Ján Tichý"); j.fill('[data-mk="telefon"]', "0911 222 333"); j.fill('[data-mk="poznamka"]', "Volať po 17:00")
    check("náhľad: hľadá ju 1 klient", "hľadá 1 klient" in j.locator("#mimo-nahlad").inner_text())
    j.screenshot(path=SH+"mimo_formular.png", full_page=True)
    j.locator('[data-mf="ulozit"]').click(); j.wait_for_timeout(2200)
    check("uložené v databáze (%s)" % sql("select typ || ', ' || obec || ', ' || okres || ', ' || cena || ', ' || stav_objektu from mimo_ponuky"),
          sql("select typ || '|' || obec || '|' || okres || '|' || cena::int || '|' || stav_objektu from mimo_ponuky") == "3-izbový byt|Smižany|Spišská Nová Ves|128000|novostavba")
    check("karta: kontakt na majiteľa a klient, ktorý ju hľadá", j.locator(".mimo-karta").count() == 1 and "Ján Tichý" in j.locator(".mimo-kontakt").inner_text() and "Hľadá ju 1 klient" in j.locator(".mimo-zhody").inner_text())
    check("meno cudzieho klienta Jana nevidí", "Karol" not in j.locator(".mimo-karta").inner_text() and "Klient makléra Peter" in j.locator(".mimo-zhody").inner_text())
    j.screenshot(path=SH+"mimo_zoznam.png", full_page=True)
    n=sql("select count(*) from pripomienky where makler_id = '%s' and druh = 'zhoda' and poznamka like '%%mimo ponuky pre vášho klienta%%Karol Kupec%%'" % PETER)
    check("Peter dostal upozornenie do zvončeka (%s)" % n, n == "1")

    # ---- Peter: vidí nehnuteľnosť pri dopyte, kontakt na majiteľa nie
    pe.reload(); pe.wait_for_selector("#obsah", timeout=20000); pe.wait_for_timeout(2500)
    pe.goto(URL+"#klienti"); pe.wait_for_timeout(800)
    pe.locator('[data-kl-pohlad="dopyty"]').click(); pe.wait_for_timeout(600)
    check("zoznam dopytov: štítok mimo ponuky", "1 mimo ponuky" in pe.locator(".dopyt-karta").first.inner_text())
    pe.locator(".dopyt-karta").first.click(); pe.wait_for_timeout(800)
    check("dopyt: Mimo ponuky, ktoré sedia (1), bez kontaktu", "(1)" in pe.locator("#dd-mimo h4").inner_text() and "Ján Tichý" not in pe.locator("#dd-mimo").inner_text() and "0911" not in pe.content())
    pe.locator("[data-mimo-otvor]").first.click(); pe.wait_for_timeout(800)
    check("kolega: karta bez kontaktu a bez úprav", pe.locator(".mimo-karta").count() == 1 and pe.locator(".mimo-kontakt").count() == 0 and pe.locator("[data-mimo-uprav]").count() == 0)
    check("kolega: svojho klienta vidí menom", "Karol Kupec" in pe.locator(".mimo-zhody").inner_text())

    # ---- mobil
    m=prihlas(b,"jana@test.sk",{"width":390,"height":844})
    m.goto(URL+"#klienti"); m.wait_for_timeout(1500)
    m.locator('[data-kl-pohlad="mimo"]').click(); m.wait_for_timeout(700)
    check("mobil: bez vodorovného posúvania", m.evaluate("document.documentElement.scrollWidth") <= 390)
    m.screenshot(path=SH+"mimo_mobil.png", full_page=True); m.close()

    # ---- úprava a archív
    j.locator("[data-mimo-uprav]").first.click(); j.wait_for_timeout(500)
    check("úprava: formulár predvyplnený", j.locator('[data-m="cena"]').input_value() == "128000" and j.locator('[data-mk="meno"]').input_value() == "Ján Tichý")
    j.fill('[data-m="cena"]', "126000"); j.locator('[data-mf="ulozit"]').click(); j.wait_for_timeout(2000)
    check("úprava ceny (%s), kontakt ostal" % sql("select cena::int from mimo_ponuky"), sql("select cena::int from mimo_ponuky") == "126000" and sql("select telefon from mimo_ponuky_kontakty") == "0911 222 333")
    j.locator('[data-mimo-stav="archiv"]').first.click(); j.wait_for_timeout(1800)
    check("archív: zmizne z aktívnych a nepáruje", sql("select stav from mimo_ponuky") == "archiv" and j.locator(".mimo-karta").count() == 0)
    j.locator('[data-mimof-stav="archiv"]').click(); j.wait_for_timeout(500)
    check("archív: dá sa vrátiť alebo zmazať", j.locator('[data-mimo-stav="aktivna"]').count() == 1 and j.locator('[data-mimo-stav="zmazat"]').count() == 1)
    b.close()
print("\n".join(ok)); print(errs or "bez chýb JS")
