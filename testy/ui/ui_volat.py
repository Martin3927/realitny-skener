import os
import subprocess
from playwright.sync_api import sync_playwright
URL=os.environ.get("TYPEK_URL", "http://localhost:8000/index.html"); SH=os.environ.get("TYPEK_SNIMKY", "/tmp/typek-snimky/"); ok=[]; errs=[]; toasty=[]
def sql(q): return subprocess.run(["psql","-h","127.0.0.1","-p","54322","-U","postgres","-d","typek","-tAc",q],capture_output=True,text=True).stdout.strip()
def check(n,c): ok.append(("OK   " if c else "ZLE  ")+n)
sql("delete from pripomienky; delete from aktivity; delete from prevzatia; insert into telefony (inzerat_id, kancelaria_id, telefon, zadal) values ('bazos:d1',1,'0905 111 222','22222222-2222-2222-2222-222222222222') on conflict (inzerat_id, kancelaria_id) do update set telefon=excluded.telefon")
def prihlas(b, mail, vp):
    pg=b.new_page(viewport=vp); pg.add_init_script("Object.defineProperty(Notification, 'permission', {get: () => 'default'});"); pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.add_init_script("window._t=[];document.addEventListener('DOMContentLoaded',function(){var t=document.getElementById('toast');if(t)new MutationObserver(function(){window._t.push(t.textContent)}).observe(t,{childList:true,characterData:true,subtree:true});});")
    pg.goto(URL); pg.wait_for_selector("#l-email"); pg.fill("#l-email",mail); pg.fill("#l-heslo","Test12345"); pg.click("#f-login button[type=submit]")
    pg.wait_for_selector("#obsah", timeout=20000); pg.wait_for_timeout(1000); return pg
with sync_playwright() as p:
    b=p.chromium.launch()
    pg=prihlas(b,"jana@test.sk",{"width":1300,"height":900})
    pg.goto(URL+"#inzeraty"); pg.wait_for_selector(".card", timeout=20000); pg.wait_for_timeout(500)
    k=pg.locator('.card[data-id="bazos:d1"]'); k.locator('[data-act="hovor"]').click(); pg.wait_for_timeout(300)
    k.locator('select[name="vysledok"]').select_option("Nedvíha"); k.locator('button[type="submit"]').click()
    pg.wait_for_timeout(1500); t=" ".join(pg.evaluate("window._t"))
    check("toast: %s" % t, "Hovor je zapísaný. 📞" in t and "pripomeniem zavolať znova" in t)
    pg.wait_for_timeout(1200)
    check("pripomienka v databáze", sql("select count(*) from pripomienky where druh='volat' and zrusena is null")=="1")
    pg.click("#zvon-btn"); pg.wait_for_timeout(600)
    r=pg.locator('.prip:has-text("Znova zavolať")')
    check("v zvončeku: %s" % (r.first.inner_text().replace("\n"," | ")[:150] if r.count() else "-"), r.count()==1 and "📞" in r.inner_text())
    check("bez „Email odoslaný“", "Email odoslaný" not in r.inner_text())
    check("tlačidlo Zavolať s číslom", r.locator('a[href="tel:0905111222"]').count()==1)
    r.screenshot(path=SH+"volat_zvon.png")
    # splatná pripomienka → toast v aplikácii a „Po termíne“
    pg.reload(); pg.wait_for_selector("#obsah", timeout=20000); pg.wait_for_timeout(1500)   # zvonček zatvorený
    # termín príde až po otvorení zvončeka (ako v skutočnosti – pripomienka na zajtra ráno)
    sql("update pripomienky set cas = now() + interval '3 seconds' where druh='volat' and zrusena is null"); pg.wait_for_timeout(4000)
    pg.evaluate("window._t=[]; document.dispatchEvent(new Event('visibilitychange'))"); pg.wait_for_timeout(2500)
    ts=" ".join(pg.evaluate("window._t"))
    check("splatná: toast v aplikácii (%s)" % ts[:90], "Znova zavolať" in ts)
    check("zvonček má odznak", pg.locator("#zvon-n:not([hidden])").count()==1)   # odznak pred otvorením zvončeka
    pg.close()
    # mobil
    pg=prihlas(b,"jana@test.sk",{"width":390,"height":844}); pg.click("#zvon-btn"); pg.wait_for_timeout(600)
    r=pg.locator('.prip:has-text("Znova zavolať")')
    check("mobil: riadok bez posúvania", r.count()==1 and pg.evaluate("document.documentElement.scrollWidth")<=390)
    r.screenshot(path=SH+"volat_zvon_mobil.png")
    # Hotovo
    r.locator('[data-prip-act="hotovo"]').click(); pg.wait_for_timeout(1000)
    check("Hotovo funguje", sql("select count(*) from pripomienky where druh='volat' and hotovo is not null")=="1")
    pg.close()
    # admin: nový prepínač upozornení
    pg=prihlas(b,"admin@test.sk",{"width":1300,"height":900}); pg.goto(URL+"#makleri"); pg.wait_for_timeout(1500); pg.click('[data-mk-otvor="22222222-2222-2222-2222-222222222222"]'); pg.wait_for_timeout(1000)
    c=pg.locator('[data-upoz="pripomienky"]')
    check("admin vidí prepínač (%d×)" % c.count(), c.count()==1 and "znova zavolať" in c.inner_text().lower())
    c.first.click(); pg.wait_for_timeout(1000)
    check("prepínač ukladá", sql("select count(*) from makleri where upozornenia->>'pripomienky'='false'")=="1")
    pg.click('[data-act="profil"]'); pg.wait_for_selector("#box-push"); pg.wait_for_timeout(1200)
    check("v profile popis upozornení", pg.locator('#box-push:has-text("znova zavolať predajcovi")').count()==1)
    pg.close(); b.close()
print("\n".join(ok)); print(errs or "bez chýb JS")
