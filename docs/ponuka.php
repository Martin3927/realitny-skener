<?php
// Stránka ponuky pripravená serverom (.htaccess sem posiela ponuka.html).
// Facebook, WhatsApp, Messenger a LinkedIn nespúšťajú JavaScript – bez tohto by pri zdieľaní ukázali len logo.
// Server preto do hlavičky doplní názov, cenu, popis a prvú fotku ponuky a údaje vloží do stránky,
// aby ich prehliadač nemusel načítavať druhýkrát. Ak databáza neodpovedá, vráti sa obyčajná ponuka.html.

$APP = 'https://app.realitnytypek.sk/';

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

require __DIR__ . '/_cache.php';
$sablona = @file_get_contents(__DIR__ . '/ponuka.html');
if ($sablona === false) { http_response_code(500); exit('Stránka sa nenašla.'); }

try {
  $id = (int)preg_replace('/\D/', '', substr((string)($_GET['id'] ?? ''), 0, 12));
  // náhľad (aj nezverejnenej ponuky) si načíta prihlásený maklér sám – server ho nepripravuje
  if ($id <= 0 || ($_GET['nahlad'] ?? '') === '1') vypis($sablona, 200, 'no-cache');

  $cfg = @file_get_contents(__DIR__ . '/config.js') ?: '';
  preg_match('/supabaseUrl:\s*"([^"]+)"/', $cfg, $u);
  preg_match('/supabaseKey:\s*"([^"]+)"/', $cfg, $k);
  if (!$u || !$k) vypis($sablona, 200, 'no-store');

  // údaje ponuky sa na 30 sekúnd pamätajú (zdieľanie v skupine = veľa robotov naraz)
  $kluc = 'ponuka-' . $id;
  $odpoved = typek_cache_citaj($kluc, 30);
  if ($odpoved === null) {
    if (!function_exists('curl_init')) vypis($sablona, 200, 'no-store');
    $c = curl_init($u[1] . '/rest/v1/rpc/verejna_ponuka');
    curl_setopt_array($c, [CURLOPT_POST => true, CURLOPT_POSTFIELDS => json_encode(['p_id' => $id]),
      CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'apikey: ' . $k[1]], CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 4, CURLOPT_CONNECTTIMEOUT => 3]);
    $odpoved = curl_exec($c);
    $kod = (int)curl_getinfo($c, CURLINFO_HTTP_CODE);
    curl_close($c);
    if ($odpoved === false || $kod !== 200) vypis($sablona, 200, 'no-store');
    typek_cache_zapis($kluc, $odpoved);
    if (mt_rand(1, 20) === 1) typek_cache_uprac('ponuka-', 300);
  }
  $p = json_decode($odpoved, true);
  if (!is_array($p) || (int)($p['id'] ?? 0) !== $id) {
    // ponuka neexistuje alebo už nie je zverejnená – prehliadač ukáže vlastnú správu
    vypis(str_replace('<title>Ponuka nehnuteľnosti · Alpha Reality</title>', '<title>Ponuka už nie je dostupná</title>', $sablona), 404, 'public, max-age=30');
  }

  // ---------------------------------------------------------------- texty pre náhľad pri zdieľaní
  $kanc = is_array($p['kanc'] ?? null) ? $p['kanc'] : [];
  $kn = trim((string)($kanc['nazov'] ?? '')) ?: 'Realitná kancelária';
  $nazov = trim((string)($p['nazov'] ?? '')) ?: trim(($p['typ'] ?? 'Nehnuteľnosť') . ', ' . ($p['obec'] ?? ''), ', ');
  $stav = (string)($p['stav'] ?? '');
  $rent = ($p['transakcia'] ?? '') === 'prenajom';
  if ($stav === 'predane') $cena = $rent ? 'Prenajaté' : 'Predané';
  elseif (($p['zobrazit_cenu'] ?? true) === false || !isset($p['cena'])) $cena = ($p['typ_ceny'] ?? '') === 'na vyžiadanie' ? 'Cena na vyžiadanie' : 'Cena dohodou';
  else $cena = cislo($p['cena']) . ' €' . ($rent ? ' / mesiac' : '');
  if ($stav === 'rezervovane') $cena .= ' · rezervované';

  $poz = ($p['kategoria'] ?? '') === 'pozemky';
  $pl = $poz ? ($p['plocha_pozemku'] ?? null) : ($p['plocha_uzitkova'] ?? ($p['plocha_pozemku'] ?? null));
  $iz = (int)($p['izby'] ?? 0);
  $lok = implode(', ', array_filter([(string)($p['cast_obce'] ?? ''), (string)($p['obec'] ?? '')]));
  $param = array_values(array_filter([$lok, $pl ? cislo($pl) . ' m²' : '', ($iz && !$poz) ? $iz . ($iz === 1 ? ' izba' : ($iz < 5 ? ' izby' : ' izieb')) : '']));
  $text = (string)($p['intro'] ?? '') ?: (string)($p['popis'] ?? '');

  $titul = $nazov . ' – ' . $cena;
  $popis = implode(' · ', $param) . ($text ? ($param ? '. ' : '') . skrat($text, 170) : '');
  if ($popis === '') $popis = 'Nehnuteľnosť v ponuke – ' . $kn . '.';
  $url = $APP . 'ponuka.html?id=' . $id;

  $fotka = '';
  foreach ((array)($p['fotky'] ?? []) as $f) {
    if (is_array($f) && !empty($f['url']) && preg_match('#^https://#', (string)$f['url'])) { $fotka = (string)$f['url']; break; }
    if (is_array($f) && !empty($f['cesta'])) { $fotka = $u[1] . '/storage/v1/object/public/ponuky/' . implode('/', array_map('rawurlencode', explode('/', (string)$f['cesta']))); break; }
  }
  if ($fotka === '') $fotka = $APP . 'logo.png';

  $jf = JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_HEX_TAG | JSON_HEX_AMP;
  $hlava = '<meta property="og:title" content="' . e($titul) . '">' . "\n" .
    '<meta property="og:description" content="' . e($popis) . '">' . "\n" .
    '<meta property="og:image" content="' . e($fotka) . '">' . "\n" .
    '<meta property="og:image:alt" content="' . e($nazov) . '">' . "\n" .
    '<meta property="og:url" content="' . e($url) . '">' . "\n" .
    '<meta property="og:type" content="website">' . "\n" . '<meta property="og:locale" content="sk_SK">' . "\n" .
    '<meta property="og:site_name" content="' . e($kn) . '">' . "\n" .
    '<meta name="twitter:card" content="summary_large_image">' . "\n" .
    '<script type="application/json" id="ponuka-data">' . json_encode($p, $jf) . '</script>';

  $html = $sablona;
  $html = str_replace('<title>Ponuka nehnuteľnosti · Alpha Reality</title>', '<title>' . e($nazov) . ' · ' . e($kn) . '</title>', $html);
  $html = preg_replace('/<meta property="og:(title|image)" content="[^"]*">\n?/', '', $html);
  $html = preg_replace_callback('/<meta name="description" content="[^"]*">/', function () use ($popis, $hlava) {
    return '<meta name="description" content="' . e($popis) . '">' . "\n" . $hlava;
  }, $html, 1);
  vypis($html, 200, 'public, max-age=30');
} catch (Throwable $t) {
  vypis($sablona, 200, 'no-store');
}
