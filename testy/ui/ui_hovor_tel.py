import os
import subprocess
from playwright.sync_api import sync_playwright
URL=os.environ.get("TYPEK_URL", "http://localhost:8000/index.html"); ok=[]; errs=[]
def sql(q): return subprocess.run(["psql","-h","127.0.0.1","-p","54322","-U","postgres","-d","typek","-tAc",q],capture_output=True,text=True).stdout.strip()
def check(n,c): ok.append(("OK   " if c else "ZLE  ")+n)
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={"width":1300,"height":900}); pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(URL); pg.wait_for_selector("#l-email"); pg.fill("#l-email","peter@test.sk"); pg.fill("#l-heslo","Test12345"); pg.click("#f-login button[type=submit]")
    pg.wait_for_selector("#obsah", timeout=20000); pg.wait_for_timeout(1200)
    pg.goto(URL+"#inzeraty"); pg.wait_for_selector(".card", timeout=20000); pg.wait_for_timeout(500)
    k=pg.locator('.card[data-id="bazos:d1"]'); k.locator('[data-act="hovor"]').click(); pg.wait_for_timeout(300)
    check("pole telefón vo formulári hovoru", k.locator('input[name="telefon"]').count()==1)
    check("pri inzeráte s číslom pole nie je", pg.locator('.card[data-id="bazos:b2"] input[name="telefon"]').count()==0)
    k.locator('select[name="vysledok"]').select_option("Volať neskôr"); k.locator('input[name="telefon"]').fill("+421 948 777 888")
    k.locator('textarea[name="poznamka"]').fill("volať v piatok"); k.locator('button[type="submit"]').click(); pg.wait_for_timeout(1500)
    check("číslo uložené", sql("select telefon from telefony where inzerat_id='bazos:d1'")=="+421 948 777 888")
    check("hovor zapísaný", sql("select count(*) from aktivity where inzerat_id='bazos:d1' and typ='hovor'")=="1")
    check("karta ukazuje číslo", "948 777 888" in pg.locator('.card[data-id="bazos:d1"]').inner_text())
    pg.goto(URL+"#klienti"); pg.wait_for_selector(".pred-box", timeout=10000); pg.wait_for_timeout(500)
    check("predávajúci v Klientoch", pg.locator('.pred-karta:has-text("Mária")').count()==1 and "Volať neskôr" in pg.locator('.pred-karta:has-text("Mária")').inner_text())
    b.close()
print("\n".join(ok)); print(errs or "bez chýb JS")
