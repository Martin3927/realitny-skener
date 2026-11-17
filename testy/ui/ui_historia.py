import os
from playwright.sync_api import sync_playwright
URL=os.environ.get("TYPEK_URL", "http://localhost:8000/index.html"); ok=[]; errs=[]
import subprocess
def sql(q): return subprocess.run(["psql","-h","127.0.0.1","-p","54322","-U","postgres","-d","typek","-tAqc",q],capture_output=True,text=True).stdout.strip()
J="22222222-2222-2222-2222-222222222222"; P="33333333-3333-3333-3333-333333333333"
# príprava: d1 – vypršal a skener ho spojil s iným; c1 – admin ho presunul na Petra; b2 – Jana ho uvoľnila sama
sql(f"""insert into aktivity (inzerat_id, makler_id, typ, poznamka, vytvorene) values
 ('bazos:d1','{J}','prevzatie',null,now()-interval '3 days'),
 ('bazos:d1','{J}','uvolnenie','automaticky – 24 hodín bez zápisu',now()-interval '2 days'),
 ('bazos:b2','{J}','prevzatie',null,now()-interval '2 days'),
 ('bazos:b2','{J}','uvolnenie',null,now()-interval '5 hours'),
 ('bazos:c1','{J}','prevzatie',null,now()-interval '2 days'),
 ('bazos:c1','11111111-1111-1111-1111-111111111111','presun','Jana Nováková → Peter Kováč',now()-interval '1 hour');
 insert into prevzatia (inzerat_id, makler_id, prevzate, upravene) values ('bazos:c1','{P}',now()-interval '1 hour',now()-interval '1 hour')
   on conflict (inzerat_id, kancelaria_id) do update set makler_id=excluded.makler_id;
 update inzeraty set duplikat_z='bazos:c3' where id='bazos:d1';""")
def check(n,c): ok.append(("OK   " if c else "ZLE  ")+n)
def prihlas(b, mail, vp):
    pg=b.new_page(viewport=vp); pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(URL); pg.wait_for_selector("#l-email"); pg.fill("#l-email",mail); pg.fill("#l-heslo","Test12345"); pg.click("#f-login button[type=submit]")
    pg.wait_for_selector("#obsah", timeout=20000); pg.wait_for_timeout(800)
    pg.goto(URL+"#inzeraty"); pg.wait_for_selector(".card", timeout=20000); pg.wait_for_timeout(600); return pg
def riadky(pg): return {i: pg.locator('.card[data-id="%s"] .hp-riadok' % i).inner_text() for i in pg.locator(".card").evaluate_all("e=>e.map(x=>x.dataset.id)") if pg.locator('.card[data-id="%s"] .hp-riadok' % i).count()}
with sync_playwright() as p:
    b=p.chromium.launch()
    for vp,m in (({"width":1300,"height":900},"desk"),({"width":390,"height":844},"mobil")):
        pg=prihlas(b,"jana@test.sk",vp)
        btn=pg.locator('.seg[data-seg="praca"] button[data-v="historia"]')
        check(m+": tlačidlo História (%s)" % btn.inner_text().replace("\n"," "), btn.count()==1)
        btn.click(); pg.wait_for_timeout(600)
        ids=pg.locator(".card").evaluate_all("e=>e.map(x=>x.dataset.id)")
        r=riadky(pg)
        for k,v in r.items(): print(m, k, "|", v)
        check(m+": vypršaný a zlúčený d1 je v histórii", "bazos:d1" in ids and "uvoľnil sa sám" in r.get("bazos:d1","") and "spojil s iným" in r.get("bazos:d1",""))
        check(m+": presunutý c1", "presunutý na Peter" in r.get("bazos:c1","") and "teraz ho má Peter" in r.get("bazos:c1",""))
        check(m+": uvoľnený b2", "uvoľnil si ho" in r.get("bazos:b2",""))
        check(m+": prvý je naposledy stratený (c1)", ids[:1]==["bazos:c1"])
        check(m+": pri voľnom je Prevziať", pg.locator('.card[data-id="bazos:d1"] [data-act="prevziat"]').count()==1)
        check(m+": bez posúvania", pg.evaluate("document.documentElement.scrollWidth")<=vp["width"])
        pg.locator('.card[data-id="bazos:d1"]').screenshot(path="" + os.environ.get("TYPEK_SNIMKY", "/tmp/typek-snimky/") + "hist_%s.png" % m)
        pg.close()
    # admin – história Jany
    pg=prihlas(b,"admin@test.sk",{"width":1300,"height":900})
    pg.select_option("#f-kto","22222222-2222-2222-2222-222222222222"); pg.wait_for_timeout(300)
    pg.locator('.seg[data-seg="praca"] button[data-v="historia"]').click(); pg.wait_for_timeout(600)
    r=riadky(pg)
    check("admin vidí históriu Jany (%d)" % len(r), "bazos:d1" in r and r["bazos:d1"].startswith("🕘 Mal ho"))
    pg.select_option("#f-kto",""); pg.wait_for_timeout(500)
    check("admin vlastná história prázdna – hláška", "V histórii zatiaľ nič nie je" in pg.locator(".empty").inner_text() if pg.locator(".empty").count() else len(riadky(pg))>=0)
    pg.close(); b.close()
print("\n".join(ok)); print(errs or "bez chýb JS")
