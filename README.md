# Realitný skener – Alpha Reality

Sleduje Bazoš, Nehnuteľnosti.sk, Reality.sk a TopReality.sk v okresoch **Spišská Nová Ves** a **Levoča**
(byty, domy, pozemky, chaty, garáže). Makléri s ním pracujú na **skener.alphareality.sk**.

## Čo vedia makléri
- prihlásiť sa vlastným účtom (účty vytvára administrátor),
- **prevziať** inzerát pod svoje meno – ostatní ho vidia ako prevzatý,
- **zapísať hovor** (výsledok + poznámka), odkliknúť **SMS poslaná** a **Email poslaný**,
- pozrieť **históriu** inzerátu (kto, kedy, čo),
- viesť **schránkovanie** – ručné záznamy (lokalita, druh, cena, telefón, stav, poznámky).

## Čo vie administrátor navyše
- vidí **podhodnotené ponuky** (porovnanie ceny/m² s mediánom) a môže ich sprístupniť vybraným maklérom,
- **presúva** inzeráty a záznamy schránkovania medzi maklérmi,
- pridáva maklérov, mení im heslo, rolu, deaktivuje účty.

## Ako to beží
| Časť | Kde | Cena |
|---|---|---|
| Stránka pre maklérov (`app/`) | GitHub Pages, adresa skener.alphareality.sk | zadarmo |
| Databáza, prihlásenia, práva (`supabase/`) | Supabase (EÚ – Frankfurt) | zadarmo |
| Kontrola portálov (`skener.py`) | GitHub Actions, každých 30 min 6:00–22:30, v noci plná kontrola | zadarmo |

Práva kontroluje databáza (nie stránka), takže maklér bez povolenia sa k podhodnoteným ponukám nedostane ani technicky.

## Nastavenia
- `config.json` – sledované okresy, typy, portály, od koľkých % je ponuka podhodnotená, kto dostáva emaily.
- Emailové upozornenia: v repozitári *Settings → Secrets and variables → Actions* doplniť
  `SMTP_HOST`, `SMTP_PORT` (465), `SMTP_USER`, `SMTP_PASS`, `EMAIL_TO` (adresy oddelené čiarkou).

## Obmedzenia
- Rozlíšenie súkromný/RK je odhad (na Bazoši niektoré realitky inzerujú ako súkromníci → „Asi súkromný“).
- Odhad ceny porovnáva ponuky medzi sebou, nie skutočné predajné ceny, a nevie o stave nehnuteľnosti.
- Ak portál zmení vzhľad stránky, skener môže prestať čítať daný portál – ostatné bežia ďalej a chyba sa zobrazí v päte stránky.
