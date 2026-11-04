# Skener na vlastnom serveri (VPS Websupport)

Skener a strážca dostupnosti budú bežať na vlastnom serveri namiesto serverov GitHubu. GitHub ostáva pre kód,
nasadzovanie a zálohy. Supabase ostáva pre dáta. Celé to trvá asi 15 minút.

## 1. Objednať server
- Websupport → Servery → VPS → **Linux Starter** (2 jadrá, 1 GB RAM, 24 GB) alebo najprv 7-dňová skúška.
- Systém: **Ubuntu 24.04 Minimal**.
- Heslo k serveru si ulož do správcu hesiel.

## 2. Kód z GitHubu
GitHub → repozitár realitny-skener → **Settings → Actions → Runners → New self-hosted runner** → Linux.
V časti „Configure“ je príkaz `./config.sh --url … --token XXXXXXXX`. Skopíruj len **XXXXXXXX** (platí 1 hodinu).

## 3. Spustiť inštaláciu
Vo WebAdmine otvor konzolu servera (alebo sa pripoj cez SSH ako root) a vlož jeden riadok – namiesto KOD daj kód z kroku 2:

```
curl -fsSL https://raw.githubusercontent.com/Martin3927/realitny-skener/main/server/instalacia.sh | bash -s -- KOD
```

Na konci napíše „Hotovo“. Na GitHube v Settings → Actions → Runners uvidíš runner so stavom **Idle**.

## 4. Prepnúť skener na server
GitHub → **Settings → Secrets and variables → Actions → Variables → New repository variable**:
- Name: `SKENER_BEZEC`
- Value: `typek`

Od tej chvíle beží skener aj strážca dostupnosti na tvojom serveri. Späť na servery GitHubu: premennú zmaž.

## 5. Po pár dňoch bez problémov
- Repozitár prepnúť na súkromný: Settings → General → Danger Zone → Change visibility → Private.
  (Na verejnom repozitári vlastný server nenechávať dlho – GitHub to neodporúča.)
- V config.json zapnúť `"bazos_celoslovensky": true` (ak už nie je) – Bazoš sa potom číta pre celé Slovensko naraz
  a z jednej IP adresy servera zvládne aj 20 okresov.

## Keď niečo nejde
- Skener 30 minút nebeží → príde ti upozornenie do mobilu („⚠️ Skener nebeží“). Najčastejšie je server vypnutý
  alebo reštartovaný – po zapnutí sa runner spustí sám.
- Runner na GitHube „Offline“ → vo WebAdmine server reštartovať. Ak nepomôže, krok 2 a 3 zopakovať (skript sa dá
  spustiť znova, nič nepokazí).
- Okamžitý návrat na GitHub: zmazať premennú `SKENER_BEZEC`.
