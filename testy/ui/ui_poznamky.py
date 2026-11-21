import os
from playwright.sync_api import sync_playwright
# Tvoje poznámky: súkromný zoznam úloh – pridať, odkliknúť hotovo, upraviť, skupiny, hľadanie, zmazať; kolega ich nevidí (migrácia 139).
URL=os.environ.get("TYPEK_URL", "http://localhost:8000/index.html"); SH=os.environ.get("TYPEK_SNIMKY", "/tmp/typek-snimky/"); ok=[]; errs=[]
def check(n,c): ok.append(("OK   " if c else "ZLE  ")+n)
def prihlas(b, vp, email):
    pg=b.new_context(viewport=vp).new_page(); pg.on("pageerror", lambda e: errs.append(str(e))); pg.on("dialog", lambda d: d.accept())
    pg.goto(URL); pg.wait_for_selector("#l-email"); pg.fill("#l-email",email); pg.fill("#l-heslo","Test12345"); pg.click("#f-login button[type=submit]")
    pg.wait_for_selector("#obsah", timeout=20000); pg.wait_for_timeout(1500); return pg
def otvorene(pg): return pg.locator(".poz-pol:not(.poz-uprava)").count()
with sync_playwright() as p:
    b=p.chromium.launch()
    pg=prihlas(b, {"width":1300,"height":900}, "jana@test.sk")
    check("dlaždica na prehľade", pg.locator('[data-domov="poznamky"]').count()==1)
    check("v bočnom menu", pg.locator('.bocne [data-tab="poznamky"]').count()==1)
    pg.click('.bocne [data-tab="poznamky"]'); pg.wait_for_selector(".poz-box .poz-rychla", timeout=10000)
    check("prázdny zoznam s vysvetlením", pg.locator(".poz-prazdne").count()==1)
    # rýchle pridanie Enterom, hneď ďalšia
    pg.fill(".poz-rychla input", "Zavolať majiteľovi bytu"); pg.press(".poz-rychla input", "Enter"); pg.wait_for_timeout(900)
    check("pridaná poznámka", "Zavolať majiteľovi bytu" in pg.inner_text(".poz-zoznam"))
    check("po pridaní sa dá písať ďalej", pg.evaluate("document.activeElement && document.activeElement.matches('.poz-rychla input')"))
    pg.keyboard.type("Kúpiť toner"); pg.keyboard.press("Enter"); pg.wait_for_timeout(900)
    check("dve poznámky", otvorene(pg)==2)
    # celý formulár: skupina, termín v minulosti, dôležité, podrobnosti s odkazom
    pg.click('[data-poz="viac"]'); pg.wait_for_selector(".poz-form")
    pg.fill('.poz-form [name="text"]', "Pripraviť zmluvu")
    pg.fill('.poz-form [name="skupina"]', "Klienti")
    pg.fill('.poz-form [name="termin"]', "2026-01-05")
    pg.check('.poz-form [name="dolezite"]')
    pg.fill('.poz-form [name="detail"]', "Vzor je na https://example.com/vzor")
    pg.click('.poz-form button[type=submit]'); pg.wait_for_timeout(1000)
    check("skupina Klienti v zozname", pg.locator('details.poz-skup[data-sk="Klienti"]').count()==1)
    check("dôležitá poznámka hore", "Pripraviť zmluvu" in pg.locator(".poz-pol").first.inner_text())
    check("po termíne je červený", pg.locator(".poz-pol.dolezite .poz-chip.po").count()==1)
    check("súhrn ukazuje po termíne", "1 po termíne" in pg.inner_text(".poz-suhrn"))
    check("odkaz v podrobnostiach sa dá otvoriť", pg.locator('.poz-detail a[href="https://example.com/vzor"]').count()==1)
    pg.locator(".poz-box").screenshot(path=SH+"poznamky.png")
    # filter skupiny: nová poznámka dostane vybranú skupinu
    pg.click('[data-pozsk="Klienti"]'); pg.wait_for_timeout(300)
    check("filter skupiny", otvorene(pg)==1)
    pg.fill(".poz-rychla input", "Poslať klientovi ponuky"); pg.press(".poz-rychla input", "Enter"); pg.wait_for_timeout(900)
    check("nová poznámka v zvolenej skupine", otvorene(pg)==2)
    pg.click('[data-pozsk="*"]'); pg.wait_for_timeout(300)
    # odkliknúť hotovo
    riadok=pg.locator(".poz-pol", has_text="Kúpiť toner")
    riadok.locator('[data-poz="hotovo"]').click(); pg.wait_for_timeout(1300)
    check("hotová zmizla zo zoznamu Na spravenie", pg.locator(".poz-pol", has_text="Kúpiť toner").count()==0)
    check("počet na spravenie klesol", pg.inner_text(".poz-suhrn").startswith("3"))
    pg.click('[data-pozstav="hotove"]'); pg.wait_for_timeout(300)
    check("je medzi hotovými a prečiarknutá", pg.locator(".poz-pol.hotovo", has_text="Kúpiť toner").count()==1)
    check("hotová má dátum", pg.locator(".poz-pol.hotovo .poz-chip.ok").count()==1)
    pg.locator(".poz-pol", has_text="Kúpiť toner").locator('[data-poz="hotovo"]').click(); pg.wait_for_timeout(1000)
    pg.click('[data-pozstav="otvorene"]'); pg.wait_for_timeout(300)
    check("vrátená späť medzi nespravené", pg.locator(".poz-pol", has_text="Kúpiť toner").count()==1)
    # úprava
    pg.locator(".poz-pol", has_text="Kúpiť toner").locator('[data-poz="uprav"]').click(); pg.wait_for_selector(".poz-uprava")
    pg.fill('.poz-uprava [name="text"]', "Kúpiť toner do tlačiarne"); pg.click('.poz-uprava button[type=submit]'); pg.wait_for_timeout(1000)
    check("úprava uložená", pg.locator(".poz-pol", has_text="Kúpiť toner do tlačiarne").count()==1)
    # hľadanie bez diakritiky
    pg.fill(".poz-hladaj", "zmluv"); pg.wait_for_timeout(300)
    check("hľadanie", otvorene(pg)==1 and pg.evaluate("document.activeElement.matches('.poz-hladaj')"))
    pg.fill(".poz-hladaj", ""); pg.wait_for_timeout(300)
    # zbalenie skupiny si pamätá
    pg.click('details.poz-skup[data-sk="Klienti"] summary'); pg.wait_for_timeout(200)
    pg.goto(URL+"#domov"); pg.wait_for_timeout(800); pg.goto(URL+"#poznamky"); pg.wait_for_selector(".poz-box .poz-rychla", timeout=10000); pg.wait_for_timeout(500)
    check("zbalená skupina ostala zbalená", pg.locator('details.poz-skup[data-sk="Klienti"]').get_attribute("open") is None)
    # zmazať
    pg.locator(".poz-pol", has_text="Kúpiť toner do tlačiarne").locator('[data-poz="zmaz"]').click(); pg.wait_for_timeout(1000)
    check("zmazaná", pg.locator(".poz-pol", has_text="Kúpiť toner").count()==0)
    # prehľad: dlaždica s počtom
    pg.goto(URL+"#domov"); pg.wait_for_timeout(1200)
    t=pg.inner_text('[data-domov="poznamky"]')
    check("dlaždica ukazuje počet na spravenie", "3 na spravenie" in t and "1 po termíne" in t)
    # kolega ani administrátor Janine poznámky nevidia
    pa=prihlas(b, {"width":1300,"height":900}, "admin@test.sk")
    pa.goto(URL+"#poznamky"); pa.wait_for_selector(".poz-box .poz-rychla", timeout=10000); pa.wait_for_timeout(500)
    check("administrátor nevidí cudzie poznámky", pa.locator(".poz-prazdne").count()==1 and "Zavolať" not in pa.inner_text(".poz-box"))
    # mobil
    pm=prihlas(b, {"width":390,"height":844}, "jana@test.sk")
    pm.goto(URL+"#poznamky"); pm.wait_for_selector(".poz-box .poz-rychla", timeout=10000); pm.wait_for_timeout(600)
    check("mobil: poznámky sú tam", "Pripraviť zmluvu" in pm.inner_text(".poz-box") or pm.locator('details.poz-skup[data-sk="Klienti"]').count()==1)
    check("mobil bez posúvania do strany", pm.evaluate("document.documentElement.scrollWidth")<=390)
    pm.click('[data-poz="viac"]'); pm.wait_for_selector(".poz-form"); pm.wait_for_timeout(300)
    check("mobil: formulár bez posúvania do strany", pm.evaluate("document.documentElement.scrollWidth")<=390)
    pm.screenshot(path=SH+"poznamky_mobil.png", full_page=True)
    b.close()
print("\n".join(ok)); print(errs or "bez chýb JS")
