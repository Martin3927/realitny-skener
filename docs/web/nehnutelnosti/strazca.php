<?php
// Strážca ponúk Týpkových nehnuteľností: potvrdenie (dvojité prihlásenie) a odhlásenie z odkazu v e-maile.
// GET ukáže tlačidlo (odkazy v e-mailoch otvárajú aj antivírusy, preto sa nič nedeje hneď), POST to vykoná.
// Odhlásenie jedným klikom z poštového programu (List-Unsubscribe-Post) prichádza rovno ako POST.
header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: no-store');
header('X-Robots-Tag: noindex');
header("Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; img-src https://realitnytypek.sk; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");
function e($v) { return htmlspecialchars((string)$v, ENT_QUOTES, 'UTF-8'); }

$SUPA = 'https://uwxziqapghlyktwpipjd.supabase.co';
$KLUC = 'sb_publishable_ukjo7DCX1FMYly7NU4gtxg_suIF66nf';

$t = preg_replace('/[^a-f0-9]/', '', strtolower((string)($_GET['t'] ?? $_POST['t'] ?? '')));
$a = ($_GET['a'] ?? $_POST['a'] ?? '') === 'odhlasit' ? 'odhlasit' : 'potvrdit';
$stav = 'otazka';
$popis = '';
if (strlen($t) < 20) $stav = 'zly';
elseif (($_SERVER['REQUEST_METHOD'] ?? '') === 'POST') {
  $stav = 'chyba';
  if (function_exists('curl_init')) {
    $c = curl_init($SUPA . '/rest/v1/rpc/' . ($a === 'odhlasit' ? 'portal_strazca_odhlasit' : 'portal_strazca_potvrdit'));
    curl_setopt_array($c, [CURLOPT_POST => true, CURLOPT_POSTFIELDS => json_encode(['p_token' => $t]), CURLOPT_RETURNTRANSFER => true,
      CURLOPT_TIMEOUT => 8, CURLOPT_CONNECTTIMEOUT => 4, CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'apikey: ' . $KLUC]]);
    $o = curl_exec($c);
    $kod = (int)curl_getinfo($c, CURLINFO_HTTP_CODE);
    curl_close($c);
    $d = ($o !== false && $kod === 200) ? json_decode($o, true) : null;
    if (is_array($d)) { $stav = !empty($d['ok']) ? 'hotovo' : (!empty($d['stary']) ? 'stary' : 'zly'); $popis = (string)($d['popis'] ?? ''); }
  }
  if ($stav === 'chyba') http_response_code(503);
}
$ciel = 'strazca.php?a=' . $a . '&t=' . $t;
?><!doctype html>
<html lang="sk">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Strážca ponúk · Týpkove nehnuteľnosti</title>
<style>
body{margin:0;background:#F7F2E8;color:#1E2A35;font:16px/1.55 system-ui,-apple-system,"Segoe UI",Arial,sans-serif}
main{max-width:480px;margin:10vh auto 40px;padding:0 16px}
.logo{display:flex;align-items:center;gap:10px;margin:0 0 18px;color:#15191C;text-decoration:none;font-weight:900;font-size:19px;letter-spacing:-.03em}
.logo img{width:40px;height:40px;border-radius:12px}
.logo span{color:#DB9522}
.karta{background:#FFFDF8;border-radius:26px;padding:28px 24px;box-shadow:0 24px 44px -34px rgba(30,42,53,.45)}
h1{font-size:24px;line-height:1.2;margin:0 0 10px;letter-spacing:-.02em}
p{margin:0 0 14px;color:#3A4B5A}
.co{display:block;margin:0 0 16px;padding:12px 14px;border-radius:14px;background:#F7F2E8;font-weight:700;color:#1E2A35}
button,.btn{display:inline-block;font:inherit;font-weight:700;background:#DB9522;color:#1E2A35;border:0;border-radius:999px;padding:12px 22px;cursor:pointer;min-height:48px;text-decoration:none}
.btn.ink{background:#1E2A35;color:#F7F2E8}
button:focus-visible,.btn:focus-visible{outline:3px solid #1E2A35;outline-offset:2px}
.male{font-size:13px;color:#4A6074;margin-top:18px}
</style>
</head>
<body>
<main>
<a class="logo" href="/nehnutelnosti/"><img src="https://realitnytypek.sk/typek-head.png" alt="">Týpkove&nbsp;<span>nehnuteľnosti</span></a>
<div class="karta">
<?php if ($stav === 'hotovo' && $a === 'potvrdit'): ?>
  <h1>Strážca ponúk je zapnutý</h1>
  <?php if ($popis): ?><span class="co"><?= e($popis) ?></span><?php endif; ?>
  <p>Ďakujeme. Keď pribudne alebo zlacnie ponuka, ktorá zodpovedá tomu, čo hľadáte, príde vám e-mailom. Najviac raz za 12 hodín.</p>
  <a class="btn ink" href="/nehnutelnosti/">Pozrieť ponuky</a>
  <p class="male">Odhlásiť sa môžete kedykoľvek odkazom na konci každého e-mailu.</p>
<?php elseif ($stav === 'hotovo'): ?>
  <h1>Strážca ponúk je vypnutý</h1>
  <?php if ($popis): ?><span class="co"><?= e($popis) ?></span><?php endif; ?>
  <p>Už vám nepošleme žiadne e-maily s ponukami. Ak si to rozmyslíte, strážcu si zapnete znova pri ponukách.</p>
  <a class="btn ink" href="/nehnutelnosti/">Pozrieť ponuky</a>
<?php elseif ($stav === 'stary'): ?>
  <h1>Odkaz už vypršal</h1>
  <p>Platil 30 dní. Ak chcete nové ponuky e-mailom, zapnite si strážcu znova pri ponukách.</p>
  <a class="btn ink" href="/nehnutelnosti/">Pozrieť ponuky</a>
<?php elseif ($stav === 'zly'): ?>
  <h1>Odkaz neplatí</h1>
  <p>Strážca ponúk je pravdepodobne už vypnutý. Ak chcete nové ponuky e-mailom, zapnite si ho znova pri ponukách.</p>
  <a class="btn ink" href="/nehnutelnosti/">Pozrieť ponuky</a>
<?php elseif ($stav === 'chyba'): ?>
  <h1>Teraz sa to nepodarilo</h1>
  <p>Skúste to prosím o chvíľu znova.</p>
  <form method="post" action="<?= e($ciel) ?>"><button type="submit">Skúsiť znova</button></form>
<?php elseif ($a === 'odhlasit'): ?>
  <h1>Vypnúť strážcu ponúk?</h1>
  <p>Už vám nebudú chodiť e-maily s novými ponukami.</p>
  <form method="post" action="<?= e($ciel) ?>"><button type="submit" class="btn ink">Áno, vypnúť strážcu</button></form>
<?php else: ?>
  <h1>Potvrdiť strážcu ponúk?</h1>
  <p>Po potvrdení vám budú e-mailom chodiť nové a zlacnené ponuky, ktoré zodpovedajú tomu, čo hľadáte. Najviac raz za 12 hodín, odhlásiť sa dá jedným klikom.</p>
  <form method="post" action="<?= e($ciel) ?>"><button type="submit">Áno, posielajte mi ponuky</button></form>
  <p class="male">Ak ste sa neprihlásili vy, stránku zavrite. Bez potvrdenia vám nič nepríde.</p>
<?php endif; ?>
</div></main>
</body>
</html>
