<?php
// Pokyny pre vyhľadávače. Na vlastnej doméne makléra je celý web verejný,
// na app.realitnytypek.sk len weby maklérov (softvér, náhľady a súkromné odkazy sa neindexujú).
require __DIR__ . '/_mapa.php';
header('Content-Type: text/plain; charset=utf-8');
header('Cache-Control: public, max-age=3600');
if ($domena !== '') {
  echo "User-agent: *\nAllow: /\nDisallow: /*nahlad=1\n\nSitemap: https://" . $domena . "/sitemap.xml\n";
  exit;
}
echo "User-agent: *\n";
foreach (['/$', '/index.html', '/web-editor.html', '/web-kancelarie.html', '/report.html', '/sprava.html', '/letak.html', '/recenzia.html', '/ponuka.html', '/zdielaj.php', '/odhlasit.php', '/potvrdit.php', '/*nahlad=1'] as $z) echo 'Disallow: ' . $z . "\n";
echo "Allow: /stranka.html\n\n";
// roboty sociálnych sietí smú otvoriť stránku ponuky, aby pri zdieľaní ukázali fotku, názov a cenu
// (vo vyhľadávačoch ostáva ponuka skrytá – stránka má noindex)
foreach (['facebookexternalhit', 'Facebot', 'meta-externalagent', 'WhatsApp', 'LinkedInBot', 'Twitterbot', 'TelegramBot', 'Viber', 'Slackbot', 'Discordbot', 'SkypeUriPreview'] as $b) echo 'User-agent: ' . $b . "\n";
foreach (['/$', '/index.html', '/web-editor.html', '/web-kancelarie.html', '/report.html', '/sprava.html', '/letak.html', '/recenzia.html', '/odhlasit.php', '/potvrdit.php', '/*nahlad=1'] as $z) echo 'Disallow: ' . $z . "\n";
echo "Allow: /ponuka.html\nAllow: /zdielaj.php\nAllow: /stranka.html\n\nSitemap: " . $APP . "sitemap.xml\n";
