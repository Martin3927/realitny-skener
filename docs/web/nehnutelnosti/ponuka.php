<?php
// Detail ponuky v Týpkových nehnuteľnostiach pripravený serverom (.htaccess sem posiela /nehnutelnosti/123-nazov-ponuky).
// Facebook, WhatsApp a Messenger nespúšťajú JavaScript – server preto doplní názov, cenu, popis a prvú fotku
// a údaje vloží do stránky, aby ich prehliadač nenačítaval druhýkrát. Keď databáza neodpovedá, vráti sa obyčajná stránka.

$SUPA = 'https://uwxziqapghlyktwpipjd.supabase.co';
$KLUC = 'sb_publishable_ukjo7DCX1FMYly7NU4gtxg_suIF66nf';
$WEB = 'https://realitnytypek.sk/nehnutelnosti/';

function e($v) { return htmlspecialchars((string)$v, ENT_QUOTES, 'UTF-8'); }
function cislo($n) { return number_format((float)$n, 0, ',', ' '); }
function skrat($t, $max) {
  $t = trim(preg_replace('/\s+/u', ' ', (string)$t));
  if ((function_exists('mb_strlen') ? mb_strlen($t, 'UTF-8') : strlen($t)) <= $max) return $t;
  $t = function_exists('mb_substr') ? mb_substr($t, 0, $max, 'UTF-8') : substr($t, 0, $max);
  return preg_replace('/\s+\S*$/u', '', $t) . '…';
}
function vypis($html, $kod = 200, $cache = 'public, max-age=30') {
  http_response_code($kod);
  header('Content-Type: text/html; charset=utf-8');
  header('Cache-Control: ' . $cache);
  header('X-Robots-Tag: noindex');
  echo $html;
  exit;
}

$sablona = @file_get_contents(__DIR__ . '/index.html');
if ($sablona === false) { http_response_code(500); exit('Stránka sa nenašla.'); }
$TITUL = '<title>Týpkove nehnuteľnosti – ponuky realitných kancelárií a maklérov</title>';

try {
  $id = (int)preg_replace('/\D/', '', substr((string)($_GET['id'] ?? ''), 0, 12));
  if ($id <= 0 || !function_exists('curl_init')) vypis($sablona, 200, 'no-store');

  $c = curl_init($SUPA . '/rest/v1/rpc/portal_ponuka');
  curl_setopt_array($c, [CURLOPT_POST => true, CURLOPT_POSTFIELDS => json_encode(['p_id' => $id]),
    CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'apikey: ' . $KLUC], CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 4, CURLOPT_CONNECTTIMEOUT => 3]);
  $odpoved = curl_exec($c);
  $kod = (int)curl_getinfo($c, CURLINFO_HTTP_CODE);
  curl_close($c);
  if ($odpoved === false || $kod !== 200) vypis($sablona, 200, 'no-store');

  $p = json_decode($odpoved, true);
  if (!is_array($p) || (int)($p['id'] ?? 0) !== $id) {
    // ponuka nie je (už) na portáli – prehliadač ukáže vlastnú správu a podobné ponuky
    vypis(str_replace($TITUL, '<title>Ponuka už nie je dostupná · Týpkove nehnuteľnosti</title>', $sablona), 404, 'public, max-age=30');
  }

  // ---------------------------------------------------------------- texty pre náhľad pri zdieľaní
  $kanc = is_array($p['kanc'] ?? null) ? $p['kanc'] : [];
  $kn = trim((string)($kanc['nazov'] ?? '')) ?: 'Realitná kancelária';
  $nazov = trim((string)($p['nazov'] ?? '')) ?: trim(($p['typ'] ?? 'Nehnuteľnosť') . ', ' . ($p['obec'] ?? ''), ', ');
  $rent = ($p['transakcia'] ?? '') === 'prenajom';
  if (!isset($p['cena']) || $p['cena'] === null) $cena = ($p['typ_ceny'] ?? '') === 'na vyžiadanie' ? 'Cena na vyžiadanie' : 'Cena dohodou';
  else $cena = cislo($p['cena']) . ' €' . ($rent ? ' / mesiac' : '');
  if (($p['stav'] ?? '') === 'rezervovane') $cena .= ' · rezervované';

  $poz = ($p['kategoria'] ?? '') === 'pozemky';
  $pl = $poz ? ($p['plocha_pozemku'] ?? null) : ($p['plocha_uzitkova'] ?? ($p['plocha_pozemku'] ?? null));
  $lok = implode(', ', array_filter([(string)($p['cast_obce'] ?? ''), (string)($p['obec'] ?? '')]));
  $param = array_values(array_filter([$lok, $pl ? cislo($pl) . ' m²' : '']));
  $text = (string)($p['intro'] ?? '') ?: (string)($p['popis'] ?? '');
  $titul = $nazov . ' – ' . $cena;
  $popis = implode(' · ', $param) . ($text ? ($param ? '. ' : '') . skrat($text, 170) : '');
  if ($popis === '') $popis = 'Ponuka nehnuteľnosti – ' . $kn . '.';
  $slug = preg_replace('/[^a-z0-9-]/', '', (string)($p['slug'] ?? '')) ?: 'ponuka';
  $url = $WEB . $id . '-' . $slug;

  $fotka = '';
  foreach ((array)($p['fotky'] ?? []) as $f) {
    if (is_array($f) && !empty($f['url']) && preg_match('#^https://#', (string)$f['url'])) { $fotka = (string)$f['url']; break; }
    if (is_array($f) && !empty($f['cesta'])) { $fotka = $SUPA . '/storage/v1/object/public/ponuky/' . implode('/', array_map('rawurlencode', explode('/', (string)$f['cesta']))); break; }
  }
  if ($fotka === '') $fotka = 'https://realitnytypek.sk/typek.png';

  $jf = JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_HEX_TAG | JSON_HEX_AMP;
  $hlava = '<link rel="canonical" href="' . e($url) . '">' . "\n" .
    '<meta property="og:image" content="' . e($fotka) . '">' . "\n" .
    '<meta property="og:image:alt" content="' . e($nazov) . '">' . "\n" .
    '<meta property="og:url" content="' . e($url) . '">' . "\n" .
    '<meta name="twitter:card" content="summary_large_image">' . "\n" .
    '<script type="application/json" id="ponuka-data">' . json_encode($p, $jf) . '</script>';

  $html = $sablona;
  $html = str_replace($TITUL, '<title>' . e($nazov) . ' · ' . e($kn) . ' · Týpkove nehnuteľnosti</title>', $html);
  $html = preg_replace('/<meta property="og:title" content="[^"]*">/', '<meta property="og:title" content="' . e($titul) . '">', $html, 1);
  $html = preg_replace('/<meta property="og:description" content="[^"]*">/', '<meta property="og:description" content="' . e($popis) . '">', $html, 1);
  $html = preg_replace_callback('/<meta name="description" content="[^"]*">/', function () use ($popis, $hlava) {
    return '<meta name="description" content="' . e($popis) . '">' . "\n" . $hlava;
  }, $html, 1);
  vypis($html, 200, 'public, max-age=30');
} catch (Throwable $t) {
  vypis($sablona, 200, 'no-store');
}
