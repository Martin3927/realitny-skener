import os
import json
import subprocess
from playwright.sync_api import sync_playwright
# Prvé kroky nového makléra (Domov), pondelkový prehľad e-mailom (Môj profil), prehľad prvých krokov v Správe zákazníkov
# a údaje pre pondelkový e-mail a sekciu Hľadám pre svojich klientov v databáze.
URL=os.environ.get("TYPEK_URL", "http://localhost:8000/index.html"); SH=os.environ.get("TYPEK_SNIMKY", "/tmp/typek-snimky/"); ok=[]; errs=[]
def sql(q): return subprocess.run(["psql","-h","127.0.0.1","-p","54322","-U","postgres","-d","typek","-tAc",q],capture_output=True,text=True).stdout.strip()
def check(n,c): ok.append(("OK   " if c else "ZLE  ")+n)
JANA="22222222-2222-2222-2222-222222222222"
sql("update makleri set foto = null, telefon = null, obce = '{}' where id = '%s'; delete from push_odbery where makler_id = '%s'; delete from aktivity where makler_id = '%s'" % (JANA, JANA, JANA))

# ---- databáza: údaje pre pondelkový e-mail a komu ide
d=json.loads(sql("select public._tyzden_maklera('%s')" % JANA) or "null")
check("pondelkový e-mail: údaje makléra (%s)" % (d and list(d.keys())), d is not None and d.get("meno") == "Jana Nováková" and "skener" in d and "pripomienky_pocet" in d)
komu=sql("select string_agg(email, ',') from public._tyzden_na_odoslanie()")
check("pondelkový e-mail ide aj Jane (%s)" % komu, "jana@test.sk" in komu)

# ---- databáza: dopyty na webe – len so zapnutou sekciou a bez mena, kontaktu a popisu
sql("insert into weby (makler_id, adresa, koncept, zverejnene, zverejnene_kedy, kancelaria_id) values ('%s', 'jana-test', '{\"on\":{\"hladam\":false}}', '{\"on\":{\"hladam\":false}}', now(), 1) on conflict do nothing" % JANA)
sql("insert into dopyty (makler_id, kancelaria_id, transakcia, kategorie, obce, cena_do, izby_od, izby_do, popis) values ('%s', 1, 'predaj', '{byty}', '{\"Spišská Nová Ves\"}', 150000, 3, 3, 'TAJNE Eva Horvatova 0905')" % JANA)
vyp=sql("set role anon; select public.verejny_web('jana-test', false)->'dopyty'").splitlines()[-1]
check("sekcia vypnutá: verejný web nedostane dopyty (%s)" % vyp, vyp.strip() == "[]")
sql("update weby set zverejnene = '{\"on\":{\"hladam\":true}}' where adresa = 'jana-test'")
zap=sql("set role anon; select public.verejny_web('jana-test', false)->'dopyty'").splitlines()[-1]
check("sekcia zapnutá: dopyt na webe (%s)" % zap[:120], '"Spišská Nová Ves"' in zap and "150000" in zap)
check("na webe nie je popis ani meno klienta", "TAJNE" not in zap and "Horvatova" not in zap)

with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={"width":1300,"height":900}); pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(URL); pg.wait_for_selector("#l-email"); pg.fill("#l-email","jana@test.sk"); pg.fill("#l-heslo","Test12345"); pg.click("#f-login button[type=submit]")
    pg.wait_for_selector("#obsah", timeout=20000); pg.wait_for_timeout(1500)
    pg.goto(URL+"#domov"); pg.wait_for_timeout(1500)
    pk=pg.locator(".prve-kroky")
    check("Domov: karta Prvé kroky", pk.count() == 1)
    polozky=pg.locator(".pk-zoznam li").count(); hotove=pg.locator(".pk-zoznam li.hotovo").count()
    check("Prvé kroky: %d krokov, %d hotový (zverejnený web)" % (polozky, hotove), polozky == 5 and hotove == 1)
    check("výzva na profil sa nezdvojuje", pg.locator(".profil-vyzva").count() == 0)
    pk.screenshot(path=SH+"prve_kroky.png")
    # prvý krok otvorí profil, tam je pondelkový prehľad
    pg.locator(".pk-zoznam li.dalsi [data-krok]").click(); pg.wait_for_timeout(800)
    check("Urobiť teraz otvorí Môj profil", pg.locator("#f-tel").count() == 1)
    t=pg.locator("#tyzden-zap")
    check("Môj profil: Pondelkový prehľad e-mailom je zapnutý", t.count() == 1 and t.is_checked())
    pg.locator("#box-tyzden").screenshot(path=SH+"tyzden_profil.png")
    t.click(); pg.wait_for_timeout(1000)
    check("vypnutie sa uloží (%s)" % sql("select upozornenia->>'tyzden' from makleri where id='%s'" % JANA), sql("select upozornenia->>'tyzden' from makleri where id='%s'" % JANA) == "false")
    komu=sql("select string_agg(email, ',') from public._tyzden_na_odoslanie()")
    check("vypnutý prehľad sa Jane neposiela", "jana@test.sk" not in komu)
    t.click(); pg.wait_for_timeout(1000)
    check("zapnutie sa uloží", sql("select upozornenia->>'tyzden' from makleri where id='%s'" % JANA) == "true")
    # splnené kroky sa odškrtnú
    sql("update makleri set obce = '{\"Spišská Nová Ves\"}' where id = '%s'" % JANA)
    sql("insert into push_odbery (makler_id, endpoint, p256dh, auth) values ('%s', 'https://push.example/jana', 'x', 'y')" % JANA)
    pg.goto(URL+"#domov"); pg.reload(); pg.wait_for_selector("#obsah", timeout=20000); pg.wait_for_timeout(2500)
    hotove=pg.locator(".pk-zoznam li.hotovo").count()
    check("obce a upozornenia sa odškrtli (%d hotové)" % hotove, hotove == 3)
    pg.locator("[data-krok-skryt]").click(); pg.wait_for_timeout(500)
    check("Skryť: karta zmizne", pg.locator(".prve-kroky").count() == 0)
    pg.reload(); pg.wait_for_selector("#obsah", timeout=20000); pg.wait_for_timeout(2000)
    check("skrytá ostane aj po obnovení", pg.locator(".prve-kroky").count() == 0)
    # mobil
    m=b.new_page(viewport={"width":390,"height":844}, is_mobile=True, has_touch=True); m.on("pageerror", lambda e: errs.append(str(e)))
    m.goto(URL); m.wait_for_selector("#l-email"); m.fill("#l-email","peter@test.sk"); m.fill("#l-heslo","Test12345"); m.click("#f-login button[type=submit]")
    m.wait_for_selector("#obsah", timeout=20000); m.goto(URL+"#domov"); m.wait_for_timeout(2000)
    check("mobil: Prvé kroky aj pre Petra", m.locator(".prve-kroky").count() == 1)
    sirka=m.evaluate("document.documentElement.scrollWidth")
    check("mobil: bez vodorovného posúvania (%d)" % sirka, sirka <= 392)
    m.locator(".prve-kroky").screenshot(path=SH+"prve_kroky_mobil.png")
    # Správa zákazníkov → Prvé kroky (hlavný správca)
    a=b.new_page(viewport={"width":1300,"height":900}); a.on("pageerror", lambda e: errs.append(str(e)))
    a.goto(URL); a.wait_for_selector("#l-email"); a.fill("#l-email","admin@test.sk"); a.fill("#l-heslo","Test12345"); a.click("#f-login button[type=submit]")
    a.wait_for_selector("#obsah", timeout=20000); a.wait_for_timeout(800)
    a.goto(URL.replace("index.html", "sprava.html") + "#kroky"); a.wait_for_timeout(2500)
    check("Správa: záložka Prvé kroky", a.locator('.sp-zalozky a[href="#kroky"][aria-current="page"]').count() == 1)
    check("Správa: bez zákazníkov prázdny stav", a.locator(".sp-prazdne").count() == 1)
    a.locator('[data-pkv="1"]').click(); a.wait_for_timeout(500)
    riadky=a.locator(".sp-riadok.sp-pk:not(.sp-th)").count()
    check("Správa: aj vlastná kancelária – %d maklérov" % riadky, riadky == 3)
    check("Správa: Jana má zelené kroky", a.locator(".sp-riadok.sp-pk:has-text('Jana Nováková') .pk-body i.ok").count() >= 3)
    a.screenshot(path=SH+"sprava_kroky.png", full_page=True)
    b.close()
print("\n".join(ok)); print(errs or "bez chýb JS")
