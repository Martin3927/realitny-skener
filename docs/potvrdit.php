<?php
// Potvrdenie strážcu ponúk z e-mailu (dvojité prihlásenie: e-maily s ponukami chodia až po potvrdení).
// GET ukáže tlačidlo (odkazy v e-mailoch otvárajú aj antivírusy, preto sa nepotvrdzuje hneď), POST potvrdí.
header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: no-store');
header('X-Robots-Tag: noindex');
header("Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");
function e($v) { return htmlspecialchars((string)$v, ENT_QUOTES, 'UTF-8'); }

$t = preg_replace('/[^a-f0-9]/', '', strtolower((string)($_GET['t'] ?? $_POST['t'] ?? '')));
$stav = 'otazka';
$makler = '';
if (strlen($t) < 20) $stav = 'zly';
elseif (($_SERVER['REQUEST_METHOD'] ?? '') === 'POST') {
  $cfg = @file_get_contents(__DIR__ . '/config.js') ?: '';
  preg_match('/supabaseUrl:\s*"([^"]+)"/', $cfg, $u);
  preg_match('/supabaseKey:\s*"([^"]+)"/', $cfg, $k);
  $stav = 'chyba';
  if ($u && $k && function_exists('curl_init')) {
    $c = curl_init($u[1] . '/rest/v1/rpc/potvrdit_strazcu');
    curl_setopt_array($c, [CURLOPT_POST => true, CURLOPT_POSTFIELDS => json_encode(['p_token' => $t]), CURLOPT_RETURNTRANSFER => true,
      CURLOPT_TIMEOUT => 8, CURLOPT_CONNECTTIMEOUT => 4, CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'apikey: ' . $k[1]]]);
    $o = curl_exec($c);
    $kod = (int)curl_getinfo($c, CURLINFO_HTTP_CODE);
    curl_close($c);
    $d = ($o !== false && $kod === 200) ? json_decode($o, true) : null;
    if (is_array($d)) { $stav = !empty($d['ok']) ? 'hotovo' : (!empty($d['stary']) ? 'stary' : 'zly'); $makler = (string)($d['makler'] ?? ''); }
  }
  if ($stav === 'chyba') http_response_code(503);
}
?><!doctype html>
<html lang="sk">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Strážca ponúk</title>
<style>
body{margin:0;background:#F7F2E8;color:#1E2A35;font:16px/1.55 system-ui,-apple-system,"Segoe UI",Arial,sans-serif}
main{max-width:460px;margin:12vh auto 40px;padding:0 16px}
.karta{background:#fff;border:1px solid #E6DCCB;border-radius:18px;padding:28px 24px}
h1{font-size:23px;line-height:1.25;margin:0 0 10px}
p{margin:0 0 14px;color:#3D4752}
button{font:inherit;font-weight:700;background:#1E2A35;color:#fff;border:0;border-radius:999px;padding:12px 22px;cursor:pointer;min-height:44px}
button:focus-visible{outline:3px solid #DB9522;outline-offset:2px}
.male{font-size:13px;color:#6B7480;margin-top:18px}
</style>
</head>
<body>
<main><div class="karta">
<?php if ($stav === 'hotovo'): ?>
  <h1>Strážca ponúk je zapnutý</h1>
  <p>Ďakujeme. Keď<?= $makler ? ' ' . e($makler) : '' ?> pridá novú ponuku, ktorá zodpovedá tomu, čo hľadáte, príde vám e-mailom. Najviac raz za 12 hodín.</p>
  <p class="male">Odhlásiť sa môžete kedykoľvek odkazom na konci každého e-mailu.</p>
<?php elseif ($stav === 'stary'): ?>
  <h1>Odkaz už vypršal</h1>
  <p>Platil 30 dní. Ak chcete nové ponuky e-mailom, prihláste sa znova na webe makléra.</p>
<?php elseif ($stav === 'zly'): ?>
  <h1>Odkaz neplatí</h1>
  <p>Strážca ponúk je pravdepodobne už vypnutý. Ak chcete nové ponuky e-mailom, prihláste sa znova na webe makléra.</p>
<?php elseif ($stav === 'chyba'): ?>
  <h1>Teraz sa to nepodarilo</h1>
  <p>Skúste to prosím o chvíľu znova.</p>
  <form method="post" action="potvrdit.php?t=<?= e($t) ?>"><button type="submit">Skúsiť znova</button></form>
<?php else: ?>
  <h1>Potvrdiť strážcu ponúk?</h1>
  <p>Po potvrdení vám budú e-mailom chodiť nové ponuky, ktoré zodpovedajú tomu, čo hľadáte. Najviac raz za 12 hodín, odhlásiť sa dá jedným klikom.</p>
  <form method="post" action="potvrdit.php?t=<?= e($t) ?>"><button type="submit">Áno, posielajte mi ponuky</button></form>
  <p class="male">Ak ste sa na webe neprihlásili vy, stránku zavrite. Bez potvrdenia vám nič nepríde.</p>
<?php endif; ?>
</div></main>
</body>
</html>
