import os
import subprocess
from playwright.sync_api import sync_playwright
URL=os.environ.get("TYPEK_URL", "http://localhost:8000/index.html"); SH=os.environ.get("TYPEK_SNIMKY", "/tmp/typek-snimky/"); ok=[]; errs=[]
def check(n,c): ok.append(("OK   " if c else "ZLE  ")+n)
def sql(q): return subprocess.run(["psql","-h","127.0.0.1","-p","54322","-U","postgres","-d","typek","-tAqc",q],capture_output=True,text=True).stdout.strip()
sql("update stav_skenera set meta = jsonb_set(coalesce(meta,'{}'), '{posledna_kontrola}', to_jsonb(now()::text)) where id=1")
sql("update skener_strazca set zlyhania=3, prve_zlyhanie=now()-interval '35 minutes', posledna_chyba='RuntimeError: databáza skener_ulozit: 400 out of range'")
def otvor(b, mail, vp):
    pg=b.new_page(viewport=vp); pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(URL); pg.wait_for_selector("#l-email"); pg.fill("#l-email",mail); pg.fill("#l-heslo","Test12345"); pg.click("#f-login button[type=submit]")
    pg.wait_for_selector("#obsah", timeout=20000); pg.wait_for_timeout(800)
    pg.goto(URL+"#inzeraty"); pg.wait_for_selector(".card", timeout=20000); pg.wait_for_timeout(600); return pg
with sync_playwright() as p:
    b=p.chromium.launch()
    for vp,m in (({"width":1300,"height":900},"desk"),({"width":390,"height":844},"mobil")):
        pg=otvor(b,"admin@test.sk",vp)
        s=pg.locator(".sk-stav.zle")
        check(m+": admin vidí pruh (%s)" % (s.first.inner_text().replace("\n"," ")[:120] if s.count() else "-"), s.count()==1 and "Posledné 3 kontroly skenera zlyhali" in s.inner_text() and "out of range" in s.inner_text())
        check(m+": tlačidlo Opraviť", s.locator('[data-sk="oprav"]').count()==1)
        check(m+": bez posúvania", pg.evaluate("document.documentElement.scrollWidth")<=vp["width"])
        s.screenshot(path=SH+"strazca_"+m+".png"); pg.close()
    pg=otvor(b,"jana@test.sk",{"width":1300,"height":900})
    check("maklérka pruh nevidí", pg.locator(".sk-stav").count()==0); pg.close()
    sql("update skener_strazca set zlyhania=1")
    pg=otvor(b,"admin@test.sk",{"width":1300,"height":900})
    check("po 1 zlyhaní bez pruhu", pg.locator(".sk-stav").count()==0); pg.close()
    b.close()
sql("update skener_strazca set zlyhania=0, prve_zlyhanie=null, upozornene=null")
print("\n".join(ok)); print(errs or "bez chýb JS")
