<?php
// Stránka pre predávajúcich v Týpkových nehnuteľnostiach na adrese /nehnutelnosti/predat
// (odhad ceny, cenová mapa a formulár Chcem predať). Server doplní názov a popis pre vyhľadávače a zdieľanie,
// zvyšok vykreslí portal.js. Odkazy na súbory sa prepíšu na absolútne, aby fungovali aj s lomkou na konci adresy.

function vypis($html, $kod = 200, $cache = 'public, max-age=300') {
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

$titul = 'Predať nehnuteľnosť – odhad ceny a cenová mapa · Týpkove nehnuteľnosti';
$popis = 'Zistite orientačnú cenu bytu, domu alebo pozemku podľa ponúk v okolí a nechajte si poradiť od makléra, ktorý vo vašej obci pôsobí.';
$url = 'https://realitnytypek.sk/nehnutelnosti/predat';

try {
  $html = preg_replace_callback('/<title>[^<]*<\/title>/', function () use ($titul) {
    return '<title>' . htmlspecialchars($titul, ENT_QUOTES, 'UTF-8') . '</title>';
  }, $sablona, 1);
  $html = preg_replace_callback('/<meta property="og:title" content="[^"]*">/', function () use ($titul) {
    return '<meta property="og:title" content="' . htmlspecialchars($titul, ENT_QUOTES, 'UTF-8') . '">';
  }, $html, 1);
  $html = preg_replace_callback('/<meta property="og:description" content="[^"]*">/', function () use ($popis) {
    return '<meta property="og:description" content="' . htmlspecialchars($popis, ENT_QUOTES, 'UTF-8') . '">';
  }, $html, 1);
  $html = preg_replace_callback('/<meta name="description" content="[^"]*">/', function () use ($popis, $url) {
    return '<meta name="description" content="' . htmlspecialchars($popis, ENT_QUOTES, 'UTF-8') . '">' . "\n" .
      '<link rel="canonical" href="' . htmlspecialchars($url, ENT_QUOTES, 'UTF-8') . '">' . "\n" .
      '<meta property="og:url" content="' . htmlspecialchars($url, ENT_QUOTES, 'UTF-8') . '">';
  }, $html, 1);
  vypis(is_string($html) ? $html : $sablona);
} catch (Throwable $t) {
  vypis($sablona, 200, 'no-store');
}
