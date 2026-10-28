<?php
// Mapa stránok pre Google: zverejnené weby maklérov a ich ponuky, web kancelárie s podstránkami a článkami.
// Na app.realitnytypek.sk sú weby bez vlastnej domény, na vlastnej doméne len web tej domény.
require __DIR__ . '/_mapa.php';
$weby = zverejnene_weby();
if ($weby === null) { http_response_code(503); header('Retry-After: 600'); exit; }
header('Content-Type: application/xml; charset=utf-8');
header('Cache-Control: public, max-age=600');
function x($v) { return htmlspecialchars((string)$v, ENT_XML1 | ENT_QUOTES, 'UTF-8'); }
function den($t) { $c = strtotime((string)$t); return $c ? gmdate('Y-m-d', $c) : ''; }
echo '<?xml version="1.0" encoding="UTF-8"?>' . "\n" . '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' . "\n";
foreach ($weby as $w) {
  if (!is_array($w) || empty($w['adresa'])) continue;
  $d = (string)($w['domena'] ?? '');
  if ($domena !== '' ? $d !== $domena : $d !== '') continue;
  $zaklad = $d !== '' ? 'https://' . $d . '/' : $APP . 'stranka.html?m=' . rawurlencode((string)$w['adresa']);
  $spoj = $d !== '' ? '?p=' : '&p=';
  $lm = den($w['upravene'] ?? '');
  echo '<url><loc>' . x($zaklad) . '</loc>' . ($lm ? '<lastmod>' . $lm . '</lastmod>' : '') . '<priority>1.0</priority></url>' . "\n";
  // web kancelárie: podstránky a články (zoznam ukladá editor pri zverejnení)
  if (!empty($w['kancelaria'])) {
    $str = function ($s, $c = '') use ($d, $zaklad) { return $d !== '' ? $zaklad . $s . ($c !== '' ? '/' . rawurlencode($c) : '') : $zaklad . '&s=' . $s . ($c !== '' ? '&c=' . rawurlencode($c) : ''); };
    foreach ((array)($w['stranky'] ?? []) as $s) {
      if (!is_string($s) || !preg_match('/^(ponuky|predane|o-nas|sluzby|vykup|tim|kariera|blog|kontakt)$/', $s)) continue;
      echo '<url><loc>' . x($str($s)) . '</loc>' . ($lm ? '<lastmod>' . $lm . '</lastmod>' : '') . '<priority>' . ($s === 'ponuky' ? '0.9' : '0.7') . '</priority></url>' . "\n";
    }
    foreach ((array)($w['clanky'] ?? []) as $a) {
      if (!is_array($a) || !preg_match('/^[a-z0-9-]{1,80}$/', (string)($a['slug'] ?? ''))) continue;
      $la = den($a['dt'] ?? '');
      echo '<url><loc>' . x($str('blog', $a['slug'])) . '</loc>' . ($la ? '<lastmod>' . $la . '</lastmod>' : '') . '<priority>0.6</priority></url>' . "\n";
    }
  }
  foreach ((array)($w['ponuky'] ?? []) as $p) {
    if (!is_array($p) || empty($p['id'])) continue;
    $lp = den($p['upravene'] ?? '');
    echo '<url><loc>' . x($zaklad . $spoj . (int)$p['id']) . '</loc>' . ($lp ? '<lastmod>' . $lp . '</lastmod>' : '') . '<priority>0.8</priority></url>' . "\n";
  }
}
echo '</urlset>' . "\n";
