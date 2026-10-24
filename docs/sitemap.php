<?php
// Mapa stránok pre Google: zverejnené weby maklérov a ich ponuky.
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
  foreach ((array)($w['ponuky'] ?? []) as $p) {
    if (!is_array($p) || empty($p['id'])) continue;
    $lp = den($p['upravene'] ?? '');
    echo '<url><loc>' . x($zaklad . $spoj . (int)$p['id']) . '</loc>' . ($lp ? '<lastmod>' . $lp . '</lastmod>' : '') . '<priority>0.8</priority></url>' . "\n";
  }
}
echo '</urlset>' . "\n";
