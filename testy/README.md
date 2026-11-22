# Testy

Automatické testy Realitného týpka. Na GitHube bežia samé pri každej zmene aplikácie (`docs/`), databázy (`supabase/migrations/`), skenera (`skener.py`) alebo testov – workflow **Testy**.

- `prostredie/` – lokálna náhrada Supabase: PostgreSQL + PostgREST + malá brána (`gateway.py`), ktorá podáva aplikáciu z `docs/` a prihlasuje testovacích maklérov. Všetky údaje sú vymyslené.
- `skener_test.py` – testy jadra skenera (duplicity medzi portálmi, porovnanie cien, typ predajcu); bez databázy: `python3 testy/skener_test.py`.
- `db/*.sql` – testy databázy (upozornenia, strážca prevádzky, oddelenie kancelárií, predĺženie prevzatia…).
- `ui/ui_*.py` – testy rozhrania v prehliadači (Playwright), na počítači aj v mobile.

Každý test beží na čistej databáze: základ Supabase, všetky migrácie a `prostredie/seed.sql`.

## Spustenie u seba

Potrebné: PostgreSQL 16, PostgREST 12, Python 3 s balíkom `playwright` (`python3 -m playwright install chromium`).

```bash
bash testy/prostredie/spusti.sh       # databáza, PostgREST a brána na http://localhost:8000
bash testy/spusti_testy.sh            # všetky testy
bash testy/spusti_testy.sh ui_okolie  # len jeden
```

Testovací makléri (heslo `Test12345`): `admin@test.sk` (admin), `jana@test.sk`, `peter@test.sk`.

Test zlyhá, keď vypíše riadok `ZLE`, spadne alebo stránka nahlási chybu v JavaScripte.
