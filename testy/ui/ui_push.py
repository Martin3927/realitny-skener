import os
import subprocess, json
from playwright.sync_api import sync_playwright
URL=os.environ.get("TYPEK_URL", "http://localhost:8000/index.html"); SH=os.environ.get("TYPEK_SNIMKY", "/tmp/typek-snimky/"); ok=[]; errs=[]
def sql(q): return subprocess.run(["psql","-h","127.0.0.1","-p","54322","-U","postgres","-d","typek","-tAc",q],capture_output=True,text=True).stdout.strip()
def check(n,c): ok.append(("OK   " if c else "ZLE  ")+n)
def prihlas(ctx, email):
    pg=ctx.new_page(); pg.on("pageerror", lambda e: errs.append(str(e))); pg.on("dialog", lambda d: d.accept())
    pg.goto(URL); pg.wait_for_selector("#l-email"); pg.fill("#l-email",email); pg.fill("#l-heslo","Test12345"); pg.click("#f-login button[type=submit]")
    pg.wait_for_selector("#obsah", timeout=20000); pg.wait_for_timeout(1200); return pg
with sync_playwright() as p:
    b=p.chromium.launch()
    ctx=b.new_context(viewport={"width":390,"height":844}, permissions=["notifications"])
    ctx.add_init_script("Object.defineProperty(Notification, 'permission', {get: () => 'default'}); Notification.requestPermission = async () => 'granted';")
    pg=prihlas(ctx,"jana@test.sk")
    pg.click('[data-act="profil"]'); pg.wait_for_selector("#box-push"); pg.wait_for_timeout(1500)
    t=pg.inner_text("#box-push")
    check("box v profile: %s" % t.replace("\n"," | ")[:150], "Upozornenia do mobilu" in t and "Zapnúť upozornenia" in t)
    check("text: všetky inzeráty zo sledovaných okresov (bez obcí)", "sledovaných okresov" in t)
    pg.click("#push-zap"); pg.wait_for_timeout(1200)
    check("bez kľúčov: hláška pripravujú sa (%s)" % pg.inner_text("#toast"), "pripravujú" in pg.inner_text("#toast"))
    sql("insert into nastavenia (kluc, hodnota) values ('vapid_public', 'BElv7gW3y1nKd3x0E4m0e7rS9sZb6kYc4QJ9pT0a8nV2hX5sUqWfM1oLrN3iC7dG6jB4eA2yZ8tKwP0vH9uR5c') on conflict do nothing")
    r=pg.evaluate("""async () => { const c = window.supabase.createClient; return 1 }""")
    # odber priamo cez RPC (headless Chromium nemá službu upozornení)
    res=pg.evaluate("""async () => {
      const ses = JSON.parse(Object.entries(localStorage).find(([k]) => k.includes('auth-token'))[1]);
      const call = (fn, body) => fetch('/rest/v1/rpc/' + fn, {method:'POST', headers:{'Content-Type':'application/json', apikey:'x', Authorization:'Bearer ' + ses.access_token}, body: JSON.stringify(body)}).then(r => r.status + ' ' + r.statusText);
      const a = await call('ulozit_push_odber', {p_endpoint:'https://fcm.googleapis.com/fcm/send/abc', p_p256dh:'BPk', p_auth:'xyz', p_zariadenie:'Android'});
      const b = await call('ulozit_push_odber', {p_endpoint:'http://zly', p_p256dh:'BPk', p_auth:'xyz', p_zariadenie:'x'});
      const k = await fetch('/rest/v1/rpc/push_kluc', {method:'POST', headers:{'Content-Type':'application/json', apikey:'x', Authorization:'Bearer ' + ses.access_token}, body:'{}'}).then(r => r.json());
      return [a, b, k];
    }""")
    check("uloženie odberu %s / zlý odber %s" % (res[0], res[1]), res[0].startswith("20") and res[1].startswith("400"))
    check("aplikácia dostane verejný kľúč", str(res[2]).startswith("BElv7"))
    check("odber patrí Jane", sql("select m.email from push_odbery p join makleri m on m.id=p.makler_id") == "jana@test.sk")
    # Moje obce zmenia text
    pg.fill("#obec-nova","Levoča"); pg.click("#obec-pridat"); pg.wait_for_timeout(1500)
    check("text po pridaní obce: Vašich obcí", "Vašich obcí (1: Levoča)" in pg.inner_text("#box-push"))
    pg.locator("#box-push").screenshot(path=SH+"push_box.png")
    # iPhone v Safari (bez PushManager, nie z plochy)
    ctx2=b.new_context(viewport={"width":390,"height":844}, user_agent="Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1")
    ctx2.add_init_script("delete window.PushManager;")
    pi=prihlas(ctx2,"peter@test.sk")
    pi.click('[data-act="profil"]'); pi.wait_for_selector("#box-push"); pi.wait_for_timeout(1000)
    check("iPhone: návod Pridať na plochu", "Pridať na plochu" in pi.inner_text("#box-push"))
    pi.locator("#box-push").screenshot(path=SH+"push_iphone.png")
    # novinka vedie na upozornenia
    pi.evaluate("1")
    b.close()
print("\n".join(ok)); print(errs or "bez chýb JS")
