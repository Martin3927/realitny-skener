<?php
// spoločné pre sitemap.php a robots.php: kde sme (naša adresa alebo vlastná doména makléra) a zoznam zverejnených webov
$APP = 'https://app.realitnytypek.sk/';
$host = strtolower(preg_replace('/:\d+$/', '', (string)($_SERVER['HTTP_HOST'] ?? '')));
$vlastna = $host !== '' && !preg_match('/(^|\.)realitnytypek\.sk$|github\.io$|^localhost$|^127\./', $host);
$domena = $vlastna ? preg_replace('/^www\./', '', $host) : '';

function zverejnene_weby() {
  $subor = rtrim((string)@sys_get_temp_dir(), '/') . '/typek-mapa.json';
  if (@is_file($subor) && time() - (int)@filemtime($subor) < 600) {
    $d = json_decode((string)@file_get_contents($subor), true);
    if (is_array($d)) return $d;
  }
  $cfg = @file_get_contents(__DIR__ . '/config.js') ?: '';
  preg_match('/supabaseUrl:\s*"([^"]+)"/', $cfg, $u);
  preg_match('/supabaseKey:\s*"([^"]+)"/', $cfg, $k);
  if (!$u || !$k || !function_exists('curl_init')) return null;
  $c = curl_init($u[1] . '/rest/v1/rpc/verejne_weby_mapa');
  curl_setopt_array($c, [CURLOPT_POST => true, CURLOPT_POSTFIELDS => '{}', CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 6, CURLOPT_CONNECTTIMEOUT => 4,
    CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'apikey: ' . $k[1]]]);
  $o = curl_exec($c);
  $kod = (int)curl_getinfo($c, CURLINFO_HTTP_CODE);
  curl_close($c);
  if ($o === false || $kod !== 200) return null;
  $d = json_decode($o, true);
  if (!is_array($d)) return null;
  @file_put_contents($subor, $o, LOCK_EX);
  return $d;
}
