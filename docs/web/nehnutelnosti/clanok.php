<?php
// Článok v Týpkových nehnuteľnostiach na peknej adrese /nehnutelnosti/clanky/nazov-clanku (.htaccess sem posiela s=nazov-clanku).
// Server doplní názov, úvod a fotku pre náhľad pri zdieľaní a vloží článok do stránky.
// Adresa je o priečinok hlbšie, preto sa odkazy na súbory stránky prepíšu na absolútne (/nehnutelnosti/…).

$SUPA = 'https://uwxziqapghlyktwpipjd.supabase.co';
$KLUC = 'sb_publishable_ukjo7DCX1FMYly7NU4gtxg_suIF66nf';
$WEB = 'https://realitnytypek.sk/nehnutelnosti/';

function e($v) { return htmlspecialchars((string)$v, ENT_QUOTES, 'UTF-8'); }
function vypis($html, $kod = 200, $cache = 'public, max-age=60') {
  http_response_code($kod);
  header('Content-Type: text/html; charset=utf-8');
  header('Cache-Control: ' . $cache);
  header('X-Robots-Tag: noindex');
  echo $html;
  exit;
}

$sablona = @file_get_contents(__DIR__ . '/index.html');
if ($sablona === false) { http_response_code(500); exit('Stránka sa nenašla.'); }
// relatívne odkazy → absolútne (stránka je na /nehnutelnosti/clanky/…)
$sablona = str_replace(['="../', '="./', 'href="portal.css', 'src="portal.js'], ['="/', '="/nehnutelnosti/', 'href="/nehnutelnosti/portal.css', 'src="/nehnutelnosti/portal.js'], $sablona);
$TITUL = '<title>Týpkove nehnuteľnosti – ponuky realitných kancelárií a maklérov</title>';

try {
  $slug = strtolower(substr((string)($_GET['s'] ?? ''), 0, 100));
  if (!preg_match('/^[a-z0-9-]{1,100}$/', $slug) || !function_exists('curl_init')) vypis($sablona, 200, 'no-store');

  $c = curl_init($SUPA . '/rest/v1/rpc/portal_clanok');
  curl_setopt_array($c, [CURLOPT_POST => true, CURLOPT_POSTFIELDS => json_encode(['p_slug' => $slug]),
    CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'apikey: ' . $KLUC], CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 4, CURLOPT_CONNECTTIMEOUT => 3]);
  $odpoved = curl_exec($c);
  $kod = (int)curl_getinfo($c, CURLINFO_HTTP_CODE);
  curl_close($c);
  if ($odpoved === false || $kod !== 200) vypis($sablona, 200, 'no-store');

  $a = json_decode($odpoved, true);
  if (!is_array($a) || ($a['slug'] ?? '') !== $slug) {
    vypis(str_replace($TITUL, '<title>Článok sa nenašiel · Týpkove nehnuteľnosti</title>', $sablona), 404, 'public, max-age=60');
  }

  $nadpis = trim((string)($a['nadpis'] ?? '')) ?: 'Článok';
  $perex = trim((string)($a['perex'] ?? ''));
  $foto = (string)($a['foto'] ?? '');
  if ($foto !== '' && !preg_match('#^https://#', $foto)) $foto = preg_match('/^[a-z0-9-]{2,60}$/', $foto) ? 'https://app.realitnytypek.sk/img/web/' . $foto . '.webp' : '';
  if ($foto === '') $foto = 'https://realitnytypek.sk/typek.png';
  $url = $WEB . 'clanky/' . $slug;

  $jf = JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_HEX_TAG | JSON_HEX_AMP;
  $hlava = '<link rel="canonical" href="' . e($url) . '">' . "\n" .
    '<meta property="og:image" content="' . e($foto) . '">' . "\n" .
    '<meta property="og:url" content="' . e($url) . '">' . "\n" .
    '<meta name="twitter:card" content="summary_large_image">' . "\n" .
    '<script type="application/json" id="clanok-data">' . json_encode($a, $jf) . '</script>';

  $html = $sablona;
  $html = str_replace($TITUL, '<title>' . e($nadpis) . ' · Týpkove nehnuteľnosti</title>', $html);
  $html = preg_replace('/<meta property="og:type" content="[^"]*">/', '<meta property="og:type" content="article">', $html, 1);
  $html = preg_replace('/<meta property="og:title" content="[^"]*">/', '<meta property="og:title" content="' . e($nadpis) . '">', $html, 1);
  $html = preg_replace('/<meta property="og:description" content="[^"]*">/', '<meta property="og:description" content="' . e($perex) . '">', $html, 1);
  $html = preg_replace_callback('/<meta name="description" content="[^"]*">/', function () use ($perex, $hlava) {
    return '<meta name="description" content="' . e($perex) . '">' . "\n" . $hlava;
  }, $html, 1);
  vypis($html);
} catch (Throwable $t) {
  vypis($sablona, 200, 'no-store');
}
