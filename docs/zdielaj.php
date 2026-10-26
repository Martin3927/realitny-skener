<?php
// Náhľad pri zdieľaní webu makléra a jeho ponúk (Facebook, WhatsApp, Messenger, LinkedIn…).
// Roboty sociálnych sietí nespúšťajú JavaScript, preto im fotku, názov a popis pripraví server.
// .htaccess sem posiela roboty, ktoré otvárajú stranka.html; človeka rovno presmeruje na web.
header('Content-Type: text/html; charset=utf-8');
header('Vary: User-Agent');

$APP = 'https://app.realitnytypek.sk/';
function cisti($v) { return strtolower(preg_replace('/[^A-Za-z0-9.-]/', '', (string)$v)); }
function e($v) { return htmlspecialchars((string)$v, ENT_QUOTES, 'UTF-8'); }
function cislo($n) { return number_format((float)$n, 0, ',', ' '); }
function skrat($t, $max) {
  $t = trim(preg_replace('/\s+/u', ' ', (string)$t));
  $dlzka = function_exists('mb_strlen') ? mb_strlen($t, 'UTF-8') : strlen($t);
  if ($dlzka <= $max) return $t;
  $t = function_exists('mb_substr') ? mb_substr($t, 0, $max, 'UTF-8') : substr($t, 0, $max);
  return preg_replace('/\s+\S*$/u', '', $t) . '…';
}

$m = cisti($_GET['m'] ?? '');
if ($m === '') {
  $prvy = explode('&', (string)($_SERVER['QUERY_STRING'] ?? ''))[0];
  if ($prvy !== '' && strpos($prvy, '=') === false) $m = cisti($prvy);
}
$p = (int)preg_replace('/\D/', '', (string)($_GET['p'] ?? ''));
$ciel = $APP . 'stranka.html?m=' . rawurlencode($m) . ($p ? '&p=' . $p : '');

// človek, ktorý otvoril tento súbor priamo, ide rovno na web
$ua = (string)($_SERVER['HTTP_USER_AGENT'] ?? '');
$robot = preg_match('/facebookexternalhit|facebot|whatsapp|twitterbot|linkedinbot|slackbot|telegrambot|discordbot|viber|skypeuripreview|pinterest|redditbot|vkshare|snapchat|iframely|embedly|applebot|mastodon|bot\b|crawler|spider/i', $ua);
if (!$robot && empty($_GET['ukaz'])) { header('Cache-Control: private, no-store'); header('Location: ' . $ciel, true, 302); exit; }

// údaje zverejneného webu z databázy (rovnaké, aké vidí každý návštevník)
$cfg = @file_get_contents(__DIR__ . '/config.js') ?: '';
preg_match('/supabaseUrl:\s*"([^"]+)"/', $cfg, $u);
preg_match('/supabaseKey:\s*"([^"]+)"/', $cfg, $k);
$d = null;
if ($m !== '' && $u && $k) {
  $telo = json_encode(['p_adresa' => $m, 'p_nahlad' => false]);
  $hlavicky = ['Content-Type: application/json', 'apikey: ' . $k[1]];
  $adresa = $u[1] . '/rest/v1/rpc/verejny_web';
  $odpoved = false;
  if (function_exists('curl_init')) {
    $c = curl_init($adresa);
    curl_setopt_array($c, [CURLOPT_POST => true, CURLOPT_POSTFIELDS => $telo, CURLOPT_HTTPHEADER => $hlavicky, CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 6, CURLOPT_CONNECTTIMEOUT => 4]);
    $odpoved = curl_exec($c);
    curl_close($c);
  } else {
    $odpoved = @file_get_contents($adresa, false, stream_context_create(['http' => ['method' => 'POST', 'header' => implode("\r\n", $hlavicky), 'content' => $telo, 'timeout' => 6]]));
  }
  $d = $odpoved ? json_decode($odpoved, true) : null;
  if (!is_array($d)) $d = null;
}
// keď sa údaje nepodarilo načítať, náhľad sa neukladá, aby sa pri ďalšom zdieľaní skúsil znova
header($d ? 'Cache-Control: public, max-age=600' : 'Cache-Control: no-store');

$web = ($d && is_array($d['web'] ?? null)) ? $d['web'] : [];
$mk = ($d && is_array($d['makler'] ?? null)) ? $d['makler'] : [];
$meno = trim((string)($web['name'] ?? '')) ?: (string)($mk['meno_cele'] ?? $mk['meno'] ?? '');
$zena = ($mk['pohlavie'] ?? '') === 'zena';
$area = trim((string)($web['area'] ?? ''));
$share = is_array($web['share'] ?? null) ? $web['share'] : [];
$titul = trim((string)($share['title'] ?? '')) ?: ($meno ? $meno . ' | ' : '') . 'Realitn' . ($zena ? 'á maklérka' : 'ý maklér') . ($area ? ', ' . $area : '');
$popis = trim((string)($share['desc'] ?? '')) ?: 'Predaj, kúpa a prenájom nehnuteľností' . ($area ? ' v regióne ' . $area : '') . '.';

// obrázok webu: úvodná fotka, fotka makléra, inak ilustračná fotka (JPG verzia pre sociálne siete)
$AI = ['dom-novostavba', 'dom-rodinny', 'dom-zahrada', 'dom-obyvacka', 'luxus-obyvacka', 'byt-obyvacka', 'byt-dom', 'byt-tehla', 'byt-centrum', 'mesto-namestie', 'mesto-letecky', 'pozemok', 'chata', 'chata-krb', 'chatka'];
$tpl = (string)($web['tpl'] ?? '');
$aiN = in_array($web['heroAiImg'] ?? '', $AI, true) ? $web['heroAiImg'] : ($tpl === 'mestska' ? 'mesto-namestie' : ($tpl === 'luxus' ? 'luxus-obyvacka' : 'dom-novostavba'));
$fotkaMaklera = (string)($web['photo'] ?? '');
if (strpos($fotkaMaklera, 'data:') === 0) $fotkaMaklera = '';
$foto = (string)($web['heroImg'] ?? '') ?: ($fotkaMaklera ?: ((string)($mk['foto'] ?? '') ?: $APP . 'img/web/og/' . $aiN . '.jpg'));

// konkrétna ponuka
if ($p && $d) {
  foreach (array_merge((array)($d['ponuky'] ?? []), (array)($d['predane'] ?? [])) as $x) {
    if ((int)($x['id'] ?? 0) !== $p) continue;
    $poz = ($x['kategoria'] ?? '') === 'pozemky';
    $rent = ($x['transakcia'] ?? '') === 'prenajom';
    $nazov = trim((string)($x['nazov'] ?? '')) ?: trim(($x['typ'] ?? 'Nehnuteľnosť') . ', ' . ($x['obec'] ?? ''), ', ');
    if (($x['stav'] ?? '') === 'predane') $cena = 'Predané';
    elseif (($x['zobrazit_cenu'] ?? true) === false || !isset($x['cena'])) $cena = ($x['typ_ceny'] ?? '') === 'na vyžiadanie' ? 'Cena na vyžiadanie' : 'Cena dohodou';
    else $cena = cislo($x['cena']) . ' €' . ($rent ? ' / mes.' : '');
    $pl = $poz ? ($x['plocha_pozemku'] ?? null) : ($x['plocha_uzitkova'] ?? ($x['plocha_zastavana'] ?? ($x['plocha_pozemku'] ?? null)));
    $iz = (int)($x['izby'] ?? 0);
    $obec = trim(implode(' – ', array_filter([(string)($x['obec'] ?? ''), (string)($x['cast_obce'] ?? '')])));
    $param = array_filter([$obec, $pl ? cislo($pl) . ' m²' : '', ($iz && !$poz) ? $iz . ($iz === 1 ? ' izba' : ($iz < 5 ? ' izby' : ' izieb')) : '']);
    $text = skrat((string)($x['intro'] ?? '') ?: (string)($x['popis'] ?? ''), 170);
    $titul = $nazov . ' – ' . $cena;
    $popis = implode(' · ', $param) . ($text ? ($param ? '. ' : '') . $text : '');
    $f = is_array($x['fotky'] ?? null) && count($x['fotky']) ? $x['fotky'][0] : null;
    // ponuka bez fotiek nikdy neukáže cudziu (ilustračnú) fotku, ale fotku makléra alebo logo
    $kanc = is_array($d['kancelaria'] ?? null) ? $d['kancelaria'] : [];
    $foto = $fotkaMaklera ?: ((string)($mk['foto'] ?? '') ?: ((string)($web['logo'] ?? '') ?: (string)($kanc['logo'] ?? '')));
    if (is_string($f) && $f !== '') $foto = $f;
    elseif (is_array($f) && !empty($f['url'])) $foto = $f['url'];
    elseif (is_array($f) && !empty($f['cesta']) && $u) $foto = $u[1] . '/storage/v1/object/public/ponuky/' . $f['cesta'];
    break;
  }
}
?><!doctype html>
<html lang="sk">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title><?= e($titul) ?></title>
<meta name="description" content="<?= e($popis) ?>">
<meta property="og:type" content="website">
<meta property="og:locale" content="sk_SK">
<?php if ($meno): ?><meta property="og:site_name" content="<?= e($meno) ?>">
<?php endif; ?>
<meta property="og:title" content="<?= e($titul) ?>">
<meta property="og:description" content="<?= e($popis) ?>">
<meta property="og:url" content="<?= e($ciel) ?>">
<?php if ($foto && strpos($foto, 'data:') !== 0): ?><meta property="og:image" content="<?= e($foto) ?>">
<?php endif; ?>
<meta name="twitter:card" content="summary_large_image">
<link rel="canonical" href="<?= e($ciel) ?>">
</head>
<body>
<h1><?= e($titul) ?></h1>
<p><?= e($popis) ?></p>
<p><a href="<?= e($ciel) ?>">Otvoriť</a></p>
</body>
</html>
