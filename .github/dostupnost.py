#!/usr/bin/env python3
"""Strážca dostupnosti Realitného týpka (spúšťa dostupnost.yml každých 10 minút).

Skúsi predajný web, aplikáciu, portál, databázu a funkcie Supabase. Každú službu skúša dvakrát (s pauzou),
aby chvíľkový výpadok siete nevyvolal poplach. Výsledok nahlási do databázy (dostupnost_hlasenie) – tá po 2. zlyhaní
po sebe pošle hlavnému správcovi upozornenie do mobilu a zvonček, po oprave „opäť funguje“. Keď treba upozorniť
alebo keď je nedostupná samotná databáza, pošle e-mail cez SMTP z tajomstiev GitHubu (tie isté ako skener).
"""
import json
import os
import smtplib
import sys
import time
from email.mime.text import MIMEText

import requests

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://uwxziqapghlyktwpipjd.supabase.co").rstrip("/")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY", "")
SKENER_KLUC = os.environ.get("SKENER_KLUC", "")
HLAVICKY = {"User-Agent": "Mozilla/5.0 (RealitnyTypek strazca dostupnosti)"}

# názov, adresa, očakávaný stav, text, ktorý musí odpoveď obsahovať (prázdne = hocijaký)
SLUZBY = [
    ("Predajný web", "https://realitnytypek.sk/", (200,), "Realitný"),
    ("Aplikácia", "https://app.realitnytypek.sk/", (200,), "Realitný"),
    ("Portál Týpkove nehnuteľnosti", "https://realitnytypek.sk/nehnutelnosti/", (200,), "nehnuteľnosti"),
    ("Databáza (Supabase)", SUPABASE_URL + "/auth/v1/health", (200,), ""),
    # funkcia bez kľúča odpovie 401 – znamená, že beží
    ("Funkcie (Supabase)", SUPABASE_URL + "/functions/v1/pripomienky", (401,), ""),
]


def skus(url, stavy, text):
    h = dict(HLAVICKY)
    if url.startswith(SUPABASE_URL):
        h["apikey"] = SUPABASE_KEY
    try:
        r = requests.get(url, headers=h, timeout=25, allow_redirects=True)
    except requests.RequestException as e:
        return False, type(e).__name__ + ": " + str(e)[:120]
    if r.status_code not in stavy:
        return False, f"HTTP {r.status_code}"
    telo = r.content.decode("utf-8", "replace")
    if text and text not in telo:
        return False, f"HTTP {r.status_code}, ale stránka nemá očakávaný obsah ({len(telo)} znakov)"
    return True, ""


def over_vsetko():
    vysledky = []
    for nazov, url, stavy, text in SLUZBY:
        ok, chyba = skus(url, stavy, text)
        if not ok:
            time.sleep(40)          # druhý pokus – chvíľkový výpadok nie je porucha
            ok, chyba = skus(url, stavy, text)
        vysledky.append({"sluzba": nazov, "ok": ok, "chyba": chyba})
        print(("OK   " if ok else "CHYBA") + f"  {nazov}" + (f" – {chyba}" if chyba else ""))
    return vysledky


def nahlas(vysledky):
    r = requests.post(f"{SUPABASE_URL}/rest/v1/rpc/dostupnost_hlasenie", json={"p_kluc": SKENER_KLUC, "p_stav": vysledky}, timeout=60,
                      headers={"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}", "Content-Type": "application/json"})
    if r.status_code >= 300:
        raise RuntimeError(f"databáza: {r.status_code} {r.text[:200]}")
    return r.json() if r.text else {}


def posli_email(predmet, text):
    host, user, heslo = os.environ.get("SMTP_HOST"), os.environ.get("SMTP_USER"), os.environ.get("SMTP_PASS")
    komu = [x.strip() for x in (os.environ.get("EMAIL_TO") or "").split(",") if x.strip()]
    if not (host and user and heslo and komu):
        print("E-mail: SMTP alebo EMAIL_TO nie je nastavené – upozornenie je len v Týpkovi.")
        return
    od = os.environ.get("EMAIL_FROM") or user
    m = MIMEText(text, "plain", "utf-8")
    m["Subject"], m["From"], m["To"] = predmet, f"Realitný týpek – strážca <{od}>", ", ".join(komu)
    try:
        port = int(os.environ.get("SMTP_PORT", "465"))
        if port == 465:
            with smtplib.SMTP_SSL(host, port, timeout=30) as s:
                s.login(user, heslo)
                s.sendmail(od, komu, m.as_string())
        else:
            with smtplib.SMTP(host, port, timeout=30) as s:
                s.starttls()
                s.login(user, heslo)
                s.sendmail(od, komu, m.as_string())
        print("E-mail odoslaný: " + ", ".join(komu))
    except Exception as e:  # noqa
        print(f"E-mail sa nepodarilo odoslať: {e}")


def main():
    vysledky = over_vsetko()
    zle = [v for v in vysledky if not v["ok"]]
    try:
        odpoved = nahlas(vysledky)
    except Exception as e:  # noqa – databáza nedostupná: aspoň e-mail
        print(f"Hlásenie do databázy zlyhalo: {e}")
        if zle:
            posli_email("⚠️ Týpek: výpadok (databáza nedostupná)",
                        "Strážca dostupnosti nedokázal zapísať hlásenie do databázy.\n\nNefunguje:\n" +
                        "\n".join(f"- {v['sluzba']}: {v['chyba']}" for v in zle) + "\n\nSkontroluj Supabase a hosting.")
        sys.exit(1 if zle else 0)
    upoz = odpoved.get("upozornit") or []
    obn = odpoved.get("obnovene") or []
    if upoz:
        posli_email("⚠️ Týpek: " + ("; ".join(upoz) if len(upoz) < 3 else f"{len(upoz)} služby nefungujú"),
                    "Strážca dostupnosti hlási poruchu (2 kontroly po sebe zlyhali):\n\n" + "\n".join("- " + x for x in upoz) +
                    "\n\nUpozornenie je aj v Týpkovi (zvonček a mobil). Ďalšie pri trvajúcej poruche najskôr o 3 hodiny.")
    if obn:
        print("Opäť funguje: " + "; ".join(obn))
    print(json.dumps(odpoved, ensure_ascii=False))
    sys.exit(1 if zle else 0)


if __name__ == "__main__":
    main()
