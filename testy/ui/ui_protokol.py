import os, subprocess, urllib.parse, re, base64
from playwright.sync_api import sync_playwright
# Odovzdávací protokol: maklérka založí protokol pri ponuke, zapíše merač s fotkou a kľúče, obe strany sa podpíšu prstom,
# po uzavretí sa protokol nedá meniť; verejná stránka protokol.html je pripravená na tlač / PDF.
URL=os.environ.get("TYPEK_URL", "http://localhost:8000/index.html"); SH=os.environ.get("TYPEK_SNIMKY", "/tmp/typek-snimky/"); ok=[]; errs=[]
def sql(q): return subprocess.run(["psql","-h","127.0.0.1","-p","54322","-U","postgres","-d","typek","-tAc",q],capture_output=True,text=True).stdout.strip()
def check(n,c): ok.append(("OK   " if c else "ZLE  ")+n)
def stranka(n): return URL.replace("index.html", n)
JANA="22222222-2222-2222-2222-222222222222"
sql("""insert into nehnutelnosti (makler_id, nazov, stav, transakcia, kategoria, typ, cena, obec, okres, ulica, historia_cien)
       values ('%s', 'Byt Protokol Levoča', 'predane', 'predaj', 'byty', '2-izbový byt', 99000, 'Levoča', 'Levoča', 'Nová', '[]')""" % JANA)
BYT=sql("select id from nehnutelnosti where nazov = 'Byt Protokol Levoča'")
sql("insert into nehnutelnosti_interne (nehnutelnost_id, majitel_meno, majitel_telefon, ulica_interna) values (%s, 'Ján Majiteľ', '0905 111 222', 'Nová 12, Levoča')" % BYT)
PNG=base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEklEQVR4nGP4z8CAFTEMNQkAVpg/wYd0XQgAAAAASUVORK5CYII=")
def podpis(pg, sel):
    bx=pg.locator(sel).bounding_box(); x=bx["x"]; y=bx["y"]+bx["height"]/2
    pg.mouse.move(x+30, y); pg.mouse.down()
    for i in range(1, 12): pg.mouse.move(x+30+i*18, y+(12 if i % 2 else -12), steps=2)
    pg.mouse.up()
with sync_playwright() as p:
    b=p.chromium.launch()
    pj=b.new_context(viewport={"width":1300,"height":900}).new_page(); pj.on("pageerror", lambda e: errs.append(str(e)))
    pj.on("dialog", lambda d: d.accept())
    pj.goto(URL); pj.wait_for_selector("#l-email"); pj.fill("#l-email","jana@test.sk"); pj.fill("#l-heslo","Test12345"); pj.click("#f-login button[type=submit]")
    pj.wait_for_selector("#obsah", timeout=20000); pj.wait_for_timeout(1500)
    pj.goto(URL+"#nehnutelnosti/"+BYT); pj.wait_for_selector("#pd-protokoly", timeout=15000)
    check("sekcia protokolu pri ponuke", "Odovzdávací protokol" in pj.inner_text("#pd-protokoly"))
    # nový protokol a hneď zatvorený bez zmien → nezostane
    pj.click("[data-prot-novy]"); pj.wait_for_selector("#prot-okno", timeout=8000)
    pj.click("#prot-okno [data-prot-zavri] >> nth=0"); pj.wait_for_timeout(1200)
    check("prázdny nový protokol sa po zatvorení zmaže", sql("select count(*) from odovzdavacie_protokoly") == "0" and pj.locator("#prot-okno").count() == 0)
    # nový protokol – predvyplnené údaje
    pj.click("[data-prot-novy]"); pj.wait_for_selector("#prot-okno", timeout=8000)
    f="#prot-okno "
    check("predvyplnený majiteľ a adresa", pj.input_value(f+'[name="odovzdavajuci"]') == "Ján Majiteľ" and pj.input_value(f+'[name="miesto"]') == "Nová 12, Levoča"
          and pj.input_value(f+'[name="odovzdavajuci_kontakt"]') == "0905 111 222")
    check("byt má predvolené 4 merače", pj.locator(f+".prot-merac").count() == 4)
    check("štítky strán podľa druhu", "Predávajúci (odovzdáva)" in pj.inner_text(f+".prot-fs") and "Kupujúci (preberá)" in pj.inner_text(f+".prot-fs"))
    pj.fill(f+'[name="preberajuci"]', "Karol Kupec"); pj.fill(f+'[name="preberajuci_kontakt"]', "karol@example.sk")
    pj.fill(f+'.prot-merac[data-i="0"] [data-m="cislo"]', "123456"); pj.fill(f+'.prot-merac[data-i="0"] [data-m="stav"]', "4521,3")
    pj.set_input_files(f+'[data-m-foto="0"]', files=[{"name":"elektromer.png","mimeType":"image/png","buffer":PNG}])
    pj.wait_for_selector(f+'[data-m-nahlad="0"] img', timeout=8000)
    check("fotka merača sa pridala", pj.locator(f+'[data-m-nahlad="0"] img').count() == 1)
    check("číslo merača ostalo po prekreslení", pj.input_value(f+'.prot-merac[data-i="0"] [data-m="cislo"]') == "123456")
    pj.fill(f+'.prot-kluc[data-i="0"] [data-k="co"]', "Vchodové dvere"); pj.fill(f+'.prot-kluc[data-i="0"] [data-k="pocet"]', "3")
    pj.click(f+"[data-prot-kluc-pridaj]"); pj.fill(f+'.prot-kluc[data-i="1"] [data-k="co"]', "Pivnica")
    pj.fill(f+'[name="stav"]', "Byt je vypratý a čistý.")
    # uzavrieť bez podpisov nejde
    pj.click(f+"[data-prot-uzavriet]"); pj.wait_for_timeout(500)
    check("bez podpisu sa neuzavrie", pj.locator("#prot-okno").count() == 1 and sql("select count(*) from odovzdavacie_protokoly where podpisane is not null") == "0")
    podpis(pj, f+'[data-prot-pad="o"]'); podpis(pj, f+'[data-prot-pad="p"]')
    pj.locator("#prot-okno .prot-karta").screenshot(path=SH+"protokol_editor.png")
    pj.click(f+"[data-prot-uzavriet]"); pj.wait_for_selector("#prot-okno", state="detached", timeout=8000); pj.wait_for_timeout(600)
    r=sql("""select podpisane is not null, jsonb_array_length(meradla), meradla->0->>'cislo', meradla->0->>'foto' like kancelaria_id||'/'||token||'/%', jsonb_array_length(kluce),
             (kluce->1->>'pocet'), podpis_odovzdavajuci like 'data:image/png;base64,%', podpis_preberajuci like 'data:image/png;base64,%', length(podpis_preberajuci) < 300000 from odovzdavacie_protokoly""")
    check("uložené a podpísané (%s)" % r, r == "t|1|123456|t|2|1|t|t|t")
    sek=pj.inner_text("#pd-protokoly")
    check("v zozname podpísaný protokol", "Podpísaný" in sek and "Karol Kupec" in sek and pj.locator("[data-prot-upravit]").count() == 0)
    wa=urllib.parse.unquote(pj.get_attribute('#pd-protokoly a.wa', "href") or "")
    tok=sql("select token from odovzdavacie_protokoly")
    check("WhatsApp predávajúcemu s odkazom na PDF", "421905111222" in wa and ("protokol.html?t="+tok) in wa)
    mail=urllib.parse.unquote(pj.get_attribute('#pd-protokoly a[href^="mailto:karol"]', "href") or "")
    check("e-mail kupujúcemu", "Odovzdávací protokol" in mail and tok in mail)
    check("Kupujúcemu / Predávajúcemu v správnom tvare", "Predávajúcemu:" in sek and "Kupujúcemu:" in sek)
    pj.locator("#pd-protokoly").screenshot(path=SH+"protokol_sekcia.png")
    # po podpise sa nedá meniť ani cez databázu
    chyba=subprocess.run(["psql","-h","127.0.0.1","-p","54322","-U","postgres","-d","typek","-tAc",
        "set role authenticated; select set_config('request.jwt.claims', '{\"sub\":\"%s\",\"role\":\"authenticated\"}', false); select protokol_ulozit((select id from odovzdavacie_protokoly), '{\"stav\":\"x\"}')" % JANA],
        capture_output=True, text=True).stderr
    check("podpísaný sa nedá meniť", "už podpísaný" in chyba)
    # verejná stránka pre obe strany
    pk=b.new_context(viewport={"width":390,"height":844}).new_page(); pk.on("pageerror", lambda e: errs.append(str(e)))
    pk.goto(stranka("protokol.html?t="+tok)); pk.wait_for_selector("#lista:not([hidden])", timeout=10000)
    t=pk.inner_text("#list")
    check("PDF stránka: strany, merač, kľúče", "ODOVZDÁVACÍ PROTOKOL" in t.upper() and "Karol Kupec" in t and "Ján Majiteľ" in t and "4521,3" in t and "Vchodové dvere" in t and "4 ks" in t)
    check("PDF stránka: oba podpisy, nie návrh", pk.locator(".podpis img").count() == 2 and "NÁVRH" not in t)
    check("PDF stránka bez kontaktov strán", "karol@example.sk" not in t and "111 222" not in t)
    check("PDF stránka bez posúvania celej stránky do strany", pk.evaluate("document.documentElement.scrollWidth") <= 390)
    pk.screenshot(path=SH+"protokol_pdf_mobil.png", full_page=True)
    pd=b.new_context(viewport={"width":1000,"height":1300}).new_page(); pd.goto(stranka("protokol.html?t="+tok)); pd.wait_for_selector("#lista:not([hidden])", timeout=10000)
    pd.screenshot(path=SH+"protokol_pdf.png", full_page=True)
    pd.emulate_media(media="print"); pd.wait_for_timeout(300)
    check("pri tlači sa lišta skryje", not pd.locator("#lista").is_visible())
    pd.pdf(path=SH+"protokol.pdf", format="A4", print_background=True)
    pz=b.new_context().new_page(); pz.goto(stranka("protokol.html?t="+"a"*36)); pz.wait_for_timeout(1500)
    check("neplatný odkaz", "nenašiel" in pz.inner_text("#list"))
    b.close()
print("\n".join(ok)); print(errs or "bez chýb JS")
