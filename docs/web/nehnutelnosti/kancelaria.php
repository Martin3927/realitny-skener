<?php
// Stránka realitnej kancelárie v Týpkových nehnuteľnostiach na peknej adrese /nehnutelnosti/kancelaria/alpha
// (.htaccess sem posiela k=alpha). Server doplní názov kancelárie pre náhľad pri zdieľaní; zvyšok vykreslí portal.js.
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
$sablona = str_replace(['="../', '="./', 'href="portal.css', 'src="portal.js'], ['="/', '="/nehnutelnosti/', 'href="/nehnutelnosti/portal.css', 'src="/nehnutelnosti/portal.js'], $sablona);
$TITUL = '<title>Týpkove nehnuteľnosti – ponuky realitných kancelárií a maklérov</title>';

try {
  $id = strtolower(substr((string)($_GET['k'] ?? ''), 0, 40));
  if (!preg_match('/^[a-z0-9_-]{1,40}$/', $id) || !function_exists('curl_init')) vypis($sablona, 200, 'no-store');

  $c = curl_init($SUPA . '/rest/v1/rpc/portal_kancelaria');
  curl_setopt_array($c, [CURLOPT_POST => true, CURLOPT_POSTFIELDS => json_encode(['p_id' => $id]),
    CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'apikey: ' . $KLUC], CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 4, CURLOPT_CONNECTTIMEOUT => 3]);
  $odpoved = curl_exec($c);
  $kod = (int)curl_getinfo($c, CURLINFO_HTTP_CODE);
  curl_close($c);
  if ($odpoved === false || $kod !== 200) vypis($sablona, 200, 'no-store');

  $a = json_decode($odpoved, true);
  if (!is_array($a)) vypis(str_replace($TITUL, '<title>Kancelária sa nenašla · Týpkove nehnuteľnosti</title>', $sablona), 404);

  $k = is_array($a['kancelaria'] ?? null) ? $a['kancelaria'] : [];
  $nazov = trim((string)($k['nazov'] ?? '')) ?: 'Realitná kancelária';
  $popis = 'Ponuky, makléri a recenzie kancelárie ' . $nazov . ' v Týpkových nehnuteľnostiach.';
  $logo = (string)($k['logo'] ?? '');
  if (!preg_match('#^https://#', $logo)) $logo = 'https://realitnytypek.sk/typek.png';
  $url = $WEB . 'kancelaria/' . $id;

  $hlava = '<link rel="canonical" href="' . e($url) . '">' . "\n" .
    '<meta property="og:image" content="' . e($logo) . '">' . "\n" .
    '<meta property="og:url" content="' . e($url) . '">';
  $html = str_replace($TITUL, '<title>' . e($nazov) . ' · Týpkove nehnuteľnosti</title>', $sablona);
  $html = preg_replace('/<meta property="og:title" content="[^"]*">/', '<meta property="og:title" content="' . e($nazov) . ' · Týpkove nehnuteľnosti">', $html, 1);
  $html = preg_replace('/<meta property="og:description" content="[^"]*">/', '<meta property="og:description" content="' . e($popis) . '">', $html, 1);
  $html = preg_replace_callback('/<meta name="description" content="[^"]*">/', function () use ($popis, $hlava) {
    return '<meta name="description" content="' . e($popis) . '">' . "\n" . $hlava;
  }, $html, 1);
  vypis($html);
} catch (Throwable $t) {
  vypis($sablona, 200, 'no-store');
}
