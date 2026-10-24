<?php
// Krátka pamäť pre stranka.php, sitemap.php a robots.php: súkromný priečinok mimo verejného webu (nie spoločný /tmp hostingu).
// Ak sa priečinok nedá vytvoriť, stránky fungujú ďalej bez pamäte.
function typek_cache_dir() {
  static $dir = null;
  if ($dir !== null) return $dir;
  $dir = '';
  $d = dirname(__DIR__) . '/.typek-cache';
  if (!@is_dir($d)) @mkdir($d, 0700);
  if (@is_dir($d) && !@is_link($d) && @fileowner($d) === @getmyuid() && @is_writable($d)) $dir = $d;
  return $dir;
}
function typek_cache_citaj($kluc, $ttl) {
  $d = typek_cache_dir();
  if ($d === '') return null;
  $f = $d . '/' . preg_replace('/[^a-z0-9_-]/', '', $kluc) . '.json';
  if (!@is_file($f) || @is_link($f) || @fileowner($f) !== @getmyuid() || time() - (int)@filemtime($f) >= $ttl) return null;
  $t = @file_get_contents($f);
  return $t === false ? null : $t;
}
function typek_cache_zapis($kluc, $obsah) {
  $d = typek_cache_dir();
  if ($d === '') return;
  $f = $d . '/' . preg_replace('/[^a-z0-9_-]/', '', $kluc) . '.json';
  $tmp = $f . '.' . getmypid() . '.' . mt_rand() . '.tmp';
  if (@file_put_contents($tmp, $obsah, LOCK_EX) !== false) { @chmod($tmp, 0600); if (!@rename($tmp, $f)) @unlink($tmp); }
}
