<?php
// Verejný web makléra pripravený serverom.
// Google, Facebook a WhatsApp dostanú titulok, popis, fotku, štruktúrované údaje (schema.org) aj obsah stránky.
// Prehliadač ho potom vykreslí ako doteraz (stranka.js) a údaje už nenačítava druhýkrát.
// Ak databáza neodpovedá, vráti sa obyčajná stranka.html, takže web kvôli serveru nikdy nespadne.

$APP = 'https://app.realitnytypek.sk/';

function e($v) { return htmlspecialchars((string)$v, ENT_QUOTES, 'UTF-8'); }
function cisti($v) { return strtolower(preg_replace('/[^A-Za-z0-9.-]/', '', (string)$v)); }
function cislo($n) { return number_format((float)$n, 0, ',', ' '); }
function skrat($t, $max) {
  $t = trim(preg_replace('/\s+/u', ' ', (string)$t));
  if ((function_exists('mb_strlen') ? mb_strlen($t, 'UTF-8') : strlen($t)) <= $max) return $t;
  $t = function_exists('mb_substr') ? mb_substr($t, 0, $max, 'UTF-8') : substr($t, 0, $max);
  return preg_replace('/\s+\S*$/u', '', $t) . '…';
}
function vypis($html, $kod = 200, $cache = 'public, max-age=60') {
  http_response_code($kod);
  header('Content-Type: text/html; charset=utf-8');
  header('Cache-Control: ' . $cache);
  echo $html;
  exit;
}

require __DIR__ . '/_cache.php';
$sablona = @file_get_contents(__DIR__ . '/stranka.html');
if ($sablona === false) { http_response_code(500); exit('Stránka sa nenašla.'); }
$cfg = @file_get_contents(__DIR__ . '/config.js') ?: '';
preg_match('/supabaseUrl:\s*"([^"]+)"/', $cfg, $u);
preg_match('/supabaseKey:\s*"([^"]+)"/', $cfg, $k);
$SB = $u ? $u[1] : '';

try {
  $host = cisti(preg_replace('/:\d+$/', '', (string)($_SERVER['HTTP_HOST'] ?? '')));
  $vlastna = $host !== '' && !preg_match('/(^|\.)realitnytypek\.sk$|github\.io$|^localhost$|^127\./', $host);
  $m = '';
  if ($vlastna) {
    // na vlastnej doméne makléra sa ukazuje vždy len jeho web (?m= sa ignoruje)
    $m = preg_replace('/^www\./', '', $host);
  } else {
    $m = cisti($_GET['m'] ?? '');
    if ($m === '') {
      $prvy = explode('&', (string)($_SERVER['QUERY_STRING'] ?? ''))[0];
      if ($prvy !== '' && strpos($prvy, '=') === false) $m = cisti($prvy);
    }
  }
  $p = (int)preg_replace('/\D/', '', (string)($_GET['p'] ?? ''));
  $nahlad = ($_GET['nahlad'] ?? '') === '1';
  // náhľad rozpracovaného webu vidí len prihlásený maklér (načíta si ho prehliadač), vyhľadávače nie
  if ($nahlad || $m === '') { header('X-Robots-Tag: noindex'); vypis($sablona, 200, 'no-cache'); }

  // adresa webu (napr. jana-kovacova) alebo doména makléra; čokoľvek iné rovno „nenašla sa“ – bez dotazu do databázy a bez zápisu na disk
  $platna = (bool)preg_match('/^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/', $m)
    || (strlen($m) <= 253 && (bool)preg_match('/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/', $m));
  if (!$platna) {
    header('X-Robots-Tag: noindex');
    vypis(str_replace('<title>Realitný maklér</title>', '<title>Stránka sa nenašla</title>', $sablona), 404, 'no-store');
  }

  // údaje zverejneného webu (na 30 sekúnd sa pamätajú, aby bol web rýchly)
  $kluc = 'web-' . md5($m);
  $d = null; $zPamate = false;
  $ulozene = typek_cache_citaj($kluc, 30);
  if ($ulozene !== null) { $zPamate = true; $d = json_decode($ulozene, true); }
  header('X-Typek-Cache: ' . ($zPamate ? 'hit' : (typek_cache_dir() === '' ? 'off' : 'miss')));
  if (!$zPamate) {
    if (!$u || !$k) vypis($sablona, 200, 'no-store');
    $telo = json_encode(['p_adresa' => $m, 'p_nahlad' => false]);
    $hl = ['Content-Type: application/json', 'apikey: ' . $k[1]];
    $odpoved = false; $kod = 0;
    if (function_exists('curl_init')) {
      $c = curl_init($u[1] . '/rest/v1/rpc/verejny_web');
      curl_setopt_array($c, [CURLOPT_POST => true, CURLOPT_POSTFIELDS => $telo, CURLOPT_HTTPHEADER => $hl, CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 4, CURLOPT_CONNECTTIMEOUT => 3]);
      $odpoved = curl_exec($c);
      $kod = (int)curl_getinfo($c, CURLINFO_HTTP_CODE);
      curl_close($c);
    }
    if ($odpoved === false || $kod !== 200) vypis($sablona, 200, 'no-store');
    $d = json_decode($odpoved, true);
    // pamätá sa aj „web neexistuje“, aby náhodné adresy nezaťažovali databázu
    typek_cache_zapis($kluc, is_array($d) ? $odpoved : 'null');
    // pamäť platí 30 s – staršie súbory (najmä neexistujúce adresy) sa občas zmažú
    if (mt_rand(1, 20) === 1) typek_cache_uprac('web-', 300);
  }
  if (!is_array($d)) {
    // web neexistuje alebo nie je zverejnený
    header('X-Robots-Tag: noindex');
    vypis(str_replace('<title>Realitný maklér</title>', '<title>Stránka sa nenašla</title>', $sablona), 404, 'no-store');
  }

  // ---------------------------------------------------------------- údaje webu
  $web = is_array($d['web'] ?? null) ? $d['web'] : [];
  $mk = is_array($d['makler'] ?? null) ? $d['makler'] : [];
  $kanc = is_array($d['kancelaria'] ?? null) ? $d['kancelaria'] : [];
  $meno = trim((string)($web['name'] ?? '')) ?: (string)($mk['meno'] ?? '');
  $zena = ($mk['pohlavie'] ?? '') === 'zena';
  $rola = $zena ? 'Realitná maklérka' : 'Realitný maklér';
  $area = trim((string)($web['area'] ?? ''));
  $kancelaria = trim((string)($web['office'] ?? '')) ?: (string)($kanc['nazov'] ?? '');
  $telefon = trim((string)($web['phone'] ?? '')) ?: (string)($mk['telefon'] ?? '');
  $email = trim((string)($web['email'] ?? '')) ?: (string)($mk['email'] ?? '');
  $share = is_array($web['share'] ?? null) ? $web['share'] : [];
  $about = is_array($web['about'] ?? null) ? $web['about'] : [];
  $tpl = (string)($web['tpl'] ?? 'susedska');
  $heroTx = is_array($web['heroTx'] ?? null) ? $web['heroTx'] : [];
  $lead = is_array($heroTx[$tpl] ?? null) ? trim((string)($heroTx[$tpl]['l'] ?? '')) : '';
  $domena = (string)($d['domena'] ?? '');
  $adresa = (string)($d['adresa'] ?? $m);
  $kanon = $domena !== '' ? 'https://' . $domena . '/' : $APP . 'stranka.html?m=' . rawurlencode($adresa);
  $odkazPonuky = function ($id) use ($domena, $kanon) { return $kanon . ($domena !== '' ? '?p=' : '&p=') . (int)$id; };
  $fotkaUrl = function ($f) use ($SB) {
    if (is_string($f)) return strpos($f, 'data:') === 0 ? '' : $f;
    if (is_array($f) && !empty($f['url'])) return (string)$f['url'];
    if (is_array($f) && !empty($f['cesta']) && $SB) return $SB . '/storage/v1/object/public/ponuky/' . $f['cesta'];
    return '';
  };
  $AI = ['dom-novostavba', 'dom-rodinny', 'dom-zahrada', 'dom-obyvacka', 'luxus-obyvacka', 'byt-obyvacka', 'byt-dom', 'byt-tehla', 'byt-centrum', 'mesto-namestie', 'mesto-letecky', 'pozemok', 'chata', 'chata-krb', 'chatka'];
  $aiN = in_array($web['heroAiImg'] ?? '', $AI, true) ? $web['heroAiImg'] : ($tpl === 'mestska' ? 'mesto-namestie' : ($tpl === 'luxus' ? 'luxus-obyvacka' : 'dom-novostavba'));
  $fotkaMaklera = (string)($web['photo'] ?? '');
  if ($fotkaMaklera === '' || strpos($fotkaMaklera, 'data:') === 0) $fotkaMaklera = (string)($mk['foto'] ?? '');
  if (strpos($fotkaMaklera, 'data:') === 0) $fotkaMaklera = '';
  $obrazok = (string)($web['heroImg'] ?? '') ?: ($fotkaMaklera ?: $APP . 'img/web/og/' . $aiN . '.jpg');

  $cena = function ($x) {
    $rent = ($x['transakcia'] ?? '') === 'prenajom';
    if (($x['stav'] ?? '') === 'predane') return 'Predané';
    if (($x['zobrazit_cenu'] ?? true) === false || !isset($x['cena'])) return ($x['typ_ceny'] ?? '') === 'na vyžiadanie' ? 'Cena na vyžiadanie' : 'Cena dohodou';
    return cislo($x['cena']) . ' €' . ($rent ? ' / mes.' : '');
  };
  $nazovP = function ($x) { return trim((string)($x['nazov'] ?? '')) ?: trim(($x['typ'] ?? 'Nehnuteľnosť') . ', ' . ($x['obec'] ?? ''), ', '); };
  $param = function ($x) {
    $poz = ($x['kategoria'] ?? '') === 'pozemky';
    $pl = $poz ? ($x['plocha_pozemku'] ?? null) : ($x['plocha_uzitkova'] ?? ($x['plocha_zastavana'] ?? ($x['plocha_pozemku'] ?? null)));
    $iz = (int)($x['izby'] ?? 0);
    return array_values(array_filter([trim(implode(' – ', array_filter([(string)($x['obec'] ?? ''), (string)($x['cast_obce'] ?? '')]))),
      $pl ? cislo($pl) . ' m²' : '', ($iz && !$poz) ? $iz . ($iz === 1 ? ' izba' : ($iz < 5 ? ' izby' : ' izieb')) : '']));
  };
  $ponuky = array_values(array_filter((array)($d['ponuky'] ?? []), 'is_array'));
  $predane = array_values(array_filter((array)($d['predane'] ?? []), 'is_array'));

  $titul = trim((string)($share['title'] ?? '')) ?: ($meno ? $meno . ' | ' : '') . $rola . ($area ? ', ' . $area : '');
  $popis = trim((string)($share['desc'] ?? '')) ?: ($lead ?: 'Predaj, kúpa a prenájom nehnuteľností' . ($area ? ' v regióne ' . $area : '') . '.');
  $url = $kanon;
  $ld = [
    '@context' => 'https://schema.org', '@type' => 'RealEstateAgent', 'name' => $meno ?: $rola, 'url' => $kanon,
    'description' => $popis,
  ];
  if ($telefon) $ld['telephone'] = $telefon;
  if ($email) $ld['email'] = $email;
  if ($fotkaMaklera) $ld['image'] = $fotkaMaklera;
  if ($area) $ld['areaServed'] = $area;
  if ($kancelaria) $ld['parentOrganization'] = ['@type' => 'Organization', 'name' => $kancelaria];
  if ($ponuky) {
    $ld['makesOffer'] = array_map(function ($x) use ($odkazPonuky, $nazovP) {
      $o = ['@type' => 'Offer', 'url' => $odkazPonuky($x['id'] ?? 0), 'itemOffered' => ['@type' => 'Accommodation', 'name' => $nazovP($x)]];
      if (($x['zobrazit_cenu'] ?? true) !== false && isset($x['cena'])) { $o['price'] = (float)$x['cena']; $o['priceCurrency'] = 'EUR'; }
      return $o;
    }, array_slice($ponuky, 0, 30));
  }

  // ---------------------------------------------------------------- obsah stránky (kým sa načíta prehliadač)
  $obsah = '';
  $zvolena = null;
  if ($p) foreach (array_merge($ponuky, $predane) as $x) { if ((int)($x['id'] ?? 0) === $p) { $zvolena = $x; break; } }
  if ($zvolena) {
    $x = $zvolena;
    $titul = $nazovP($x) . ' – ' . $cena($x) . ($meno ? ' | ' . $meno : '');
    $prm = $param($x);
    $text = (string)($x['intro'] ?? '') ?: (string)($x['popis'] ?? '');
    $popis = implode(' · ', $prm) . ($text ? ($prm ? '. ' : '') . skrat($text, 170) : '');
    $url = $odkazPonuky($p);
    $fotky = array_values(array_filter(array_map($fotkaUrl, (array)($x['fotky'] ?? []))));
    // ponuka bez fotiek neukáže cudziu fotku, ale fotku makléra alebo logo
    $obrazok = $fotky[0] ?? ($fotkaMaklera ?: ((string)($web['logo'] ?? '') ?: (string)($kanc['logo'] ?? '')));
    $ld = ['@context' => 'https://schema.org', '@type' => 'RealEstateListing', 'name' => $nazovP($x), 'url' => $url, 'description' => skrat($text, 400) ?: $popis];
    if ($fotky) $ld['image'] = array_slice($fotky, 0, 5);
    if (($x['zobrazit_cenu'] ?? true) !== false && isset($x['cena']) && ($x['stav'] ?? '') !== 'predane') $ld['offers'] = ['@type' => 'Offer', 'price' => (float)$x['cena'], 'priceCurrency' => 'EUR'];
    $ld['provider'] = ['@type' => 'RealEstateAgent', 'name' => $meno, 'url' => $kanon] + ($telefon ? ['telephone' => $telefon] : []);
    $obsah = '<article class="ssr"><p><a href="' . e($kanon) . '">← ' . e($meno ?: 'Späť na web') . '</a></p><h1>' . e($nazovP($x)) . '</h1><p><b>' . e($cena($x)) . '</b>' . ($prm ? ' · ' . e(implode(' · ', $prm)) : '') . '</p>' .
      ($fotky ? '<img src="' . e($fotky[0]) . '" alt="' . e($nazovP($x)) . '" width="760" style="max-width:100%;height:auto;border-radius:12px">' : '') .
      '<p>' . nl2br(e(skrat((string)($x['popis'] ?? '') ?: $text, 1500))) . '</p>' .
      ($telefon || $email ? '<p>Kontakt: ' . e($meno) . ($telefon ? ', <a href="tel:' . e(preg_replace('/[^\d+]/', '', $telefon)) . '">' . e($telefon) . '</a>' : '') . ($email ? ', <a href="mailto:' . e($email) . '">' . e($email) . '</a>' : '') . '</p>' : '') . '</article>';
  } else {
    $zoznam = '';
    foreach (array_slice($ponuky, 0, 30) as $x) {
      $zoznam .= '<li><a href="' . e($odkazPonuky($x['id'] ?? 0)) . '">' . e($nazovP($x)) . '</a> – ' . e($cena($x)) . ($param($x) ? ' · ' . e(implode(' · ', $param($x))) : '') . '</li>';
    }
    $obsah = '<article class="ssr"><h1>' . e($meno) . '</h1><p>' . e($rola . ($area ? ' · ' . $area : '') . ($kancelaria ? ' · ' . $kancelaria : '')) . '</p>' .
      '<p>' . e($popis) . '</p>' .
      ($zoznam ? '<h2>Aktuálne ponuky</h2><ul>' . $zoznam . '</ul>' : '') .
      (trim((string)($about['text'] ?? '')) ? '<h2>' . e(trim((string)($about['title'] ?? '')) ?: 'O mne') . '</h2><p>' . nl2br(e(skrat((string)$about['text'], 1200))) . '</p>' : '') .
      ($telefon || $email ? '<h2>Kontakt</h2><p>' . ($telefon ? '<a href="tel:' . e(preg_replace('/[^\d+]/', '', $telefon)) . '">' . e($telefon) . '</a>' : '') . ($telefon && $email ? ' · ' : '') . ($email ? '<a href="mailto:' . e($email) . '">' . e($email) . '</a>' : '') . '</p>' : '') .
      '</article>';
  }

  $jf = JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_HEX_TAG | JSON_HEX_AMP;
  $hlava = '<link rel="canonical" href="' . e($url) . '">' . "\n" .
    '<meta property="og:type" content="website">' . "\n" . '<meta property="og:locale" content="sk_SK">' . "\n" .
    ($meno ? '<meta property="og:site_name" content="' . e($meno) . '">' . "\n" : '') .
    '<meta property="og:title" content="' . e($titul) . '">' . "\n" . '<meta property="og:description" content="' . e($popis) . '">' . "\n" .
    '<meta property="og:url" content="' . e($url) . '">' . "\n" .
    ($obrazok && strpos($obrazok, 'data:') !== 0 ? '<meta property="og:image" content="' . e($obrazok) . '">' . "\n" : '') .
    '<meta name="twitter:card" content="summary_large_image">' . "\n" .
    '<script type="application/ld+json">' . json_encode($ld, $jf) . '</script>' . "\n" .
    '<script type="application/json" id="web-data">' . json_encode($d, $jf) . '</script>' . "\n" .
    '<style>.ssr{opacity:0;animation:ssrUkaz .2s 2.5s forwards;max-width:760px;margin:32px auto;padding:0 16px;font:16px/1.6 system-ui,-apple-system,"Segoe UI",sans-serif;color:#1E2A35}.ssr h1{font-size:30px;line-height:1.2;margin:0 0 8px}.ssr h2{font-size:21px;margin:28px 0 8px}.ssr a{color:#8A5A2B}@keyframes ssrUkaz{to{opacity:1}}</style>' . "\n";

  $html = $sablona;
  $html = str_replace('<title>Realitný maklér</title>', '<title>' . e($titul) . '</title>', $html);
  $html = preg_replace_callback('/<meta name="description" content="[^"]*">/', function () use ($popis, $hlava) {
    return '<meta name="description" content="' . e($popis) . '">' . "\n" . $hlava;
  }, $html, 1);
  $html = str_replace('<div class="nacitavam">Načítavam…</div>', $obsah, $html);
  vypis($html, 200, 'public, max-age=30');
} catch (Throwable $t) {
  vypis($sablona, 200, 'no-store');
}
