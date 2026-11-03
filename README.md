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
| Stránka pre maklérov (`docs/`) | GitHub Pages, adresa skener.alphareality.sk | zadarmo |
| Databáza, prihlásenia, práva (`supabase/`) | Supabase (EÚ – Frankfurt) | zadarmo |
| Kontrola portálov (`skener.py`) | GitHub Actions, každých 10 min cez deň (každá tretia kontrola prejde 3 strany, ostatné len prvú), v noci plná kontrola | zadarmo |

Práva kontroluje databáza (nie stránka), takže maklér bez povolenia sa k podhodnoteným ponukám nedostane ani technicky.

## Záloha
Supabase na bezplatnom pláne nezálohuje nič, preto beží vlastná záloha (`.github/workflows/zaloha.yml`):
- **databáza** (všetky tabuľky, používatelia, pravidlá prístupu, funkcie) – každú noc a pred každou zmenou databázy
  (ak posledná záloha nie je mladšia ako 2 h; keď záloha zlyhá, zmena sa nespustí),
- **nastavenia** (plánovač, pravidlá prístupu k súborom, rozšírenia, zoznam funkcií, DNS) – spolu s databázou,
- **súbory** (fotky ponúk, archív skenera, weby) a **kód** (celý repozitár s históriou) – každú nedeľu,
- uložené na hosting Websupport do `/realitnytypek.sk/zalohy` (mimo webu, z internetu nedostupné):
  60 posledných záloh databázy, 4 zálohy súborov. Stiahnuť sa dajú cez SFTP prístup k hostingu (ten istý ako pri nasadení).
- Voliteľne zašifrovaná kópia v GitHube: v *Settings → Secrets and variables → Actions* pridať `ZALOHA_HESLO`
  (heslo si treba uložiť aj inde – bez neho sa kópia neotvorí). Otvára sa 7-Zipom.
- Súkromné priečinky (prílohy chatu, dokumenty ponúk) sa zálohujú, až keď kľúč `SUPABASE_ACCESS_TOKEN`
  dostane právo *API gateway keys: read*.
- Ručne: *Actions → Záloha → Run workflow* (dá sa zaškrtnúť aj súbory a skúška obnovy).

- Export pre majiteľa na stiahnutie: *Run workflow* s verejným kľúčom age (`pre_kluc`) – navyše s kľúčmi z Vaultu.

**Obnova** – plán podľa toho, čo sa pokazilo, je v `.github/OBNOVA.txt` (je aj v každej zálohe). Nikdy rovno do ostrej databázy. Záloha sa najprv obnoví do prázdnej databázy
(postup v `README.txt` v každej zálohe), skontroluje sa a až potom sa vrátia potrebné údaje.
Pri zmene `zaloha.yml` sa spraví plná záloha aj skúšobná obnova do prázdnej databázy s porovnaním počtu riadkov.

## Nastavenia
- `config.json` – sledované okresy, typy, portály, od koľkých % je ponuka podhodnotená, kto dostáva emaily.
- Emailové upozornenia: v repozitári *Settings → Secrets and variables → Actions* doplniť
  `SMTP_HOST`, `SMTP_PORT` (465), `SMTP_USER`, `SMTP_PASS`, `EMAIL_TO` (adresy oddelené čiarkou).

## Obmedzenia
- Rozlíšenie súkromný/RK je odhad (na Bazoši niektoré realitky inzerujú ako súkromníci → „Asi súkromný“).
- Odhad ceny porovnáva ponuky medzi sebou, nie skutočné predajné ceny, a nevie o stave nehnuteľnosti.
- Ak portál zmení vzhľad stránky, skener môže prestať čítať daný portál – ostatné bežia ďalej a chyba sa zobrazí v päte stránky.
