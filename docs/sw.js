// Service worker Realitného týpka – aplikácia sa dá pridať na plochu a spúšťa sa rýchlo.
// Súbory aplikácie (skripty, štýly, obrázky, písma) si pamätá v zariadení: ukáže ich hneď a novšie si stiahne na pozadí.
// Úvodná stránka ide vždy najprv zo siete (nová verzia sa prejaví hneď); zapamätaná sa použije len bez internetu
// alebo keď server neodpovie do 4 sekúnd.
// Údaje (inzeráty, ponuky, chat, klienti…) sa tu NEUKLADAJÚ – idú vždy čerstvé zo servera.
var PAMAT = "typek-subory-1";
var SUBORY = /\.(?:js|css|png|jpe?g|webp|svg|gif|ico|woff2?)$/i;
var PISMA = /^https:\/\/fonts\.(?:googleapis|gstatic)\.com$/;
var CAKAT_NA_SIET = 4000;

function nic() {}
function dobra(res) { return res && res.status === 200 && (res.type === "basic" || res.type === "cors") && !res.redirected; }

// pri inštalácii si hneď zapamätá úvodnú stránku a súbory, ktoré načítava – už ďalšie spustenie je rýchle
function predpriprav() {
  var koren = new URL("./", self.registration.scope).href;
  return fetch(koren, { cache: "no-cache" }).then(function (res) {
    if (!dobra(res)) return;
    return res.clone().text().then(function (html) {
      var adresy = [], m, re = /(?:src|href)="([^"#]+\.(?:js|css|png)(?:\?[^"]*)?)"/g;
      while ((m = re.exec(html))) {
        var u = new URL(m[1], koren);
        if (u.origin === self.location.origin && !/\/sw\.js$/.test(u.pathname) && adresy.indexOf(u.href) < 0) adresy.push(u.href);
      }
      return caches.open(PAMAT).then(function (c) {
        return Promise.all([c.put(koren, res)].concat(adresy.map(function (a) {
          return fetch(a, { cache: "no-cache" }).then(function (r) { if (dobra(r)) return c.put(a, r); }).catch(nic);
        })));
      });
    });
  });
}

self.addEventListener("install", function (e) {
  self.skipWaiting();
  e.waitUntil(predpriprav().catch(nic));
});
self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (mena) {
    return Promise.all(mena.filter(function (n) { return n.indexOf("typek-") === 0 && n !== PAMAT; }).map(function (n) { return caches.delete(n); }));
  }).then(function () { return self.clients.claim(); }));
});

// po stiahnutí novej verzie (napr. app.js?v=…) zmaže starú verziu toho istého súboru
function uprac(pamat, url) {
  var u = new URL(url);
  if (!u.searchParams.has("v")) return Promise.resolve();
  return pamat.keys().then(function (kluce) {
    return Promise.all(kluce.filter(function (k) {
      var x = new URL(k.url);
      return x.origin === u.origin && x.pathname === u.pathname && k.url !== url;
    }).map(function (k) { return pamat.delete(k); }));
  });
}

// súbor: zapamätaný hneď, zo siete na pozadí (pri ďalšom spustení už bude nový)
function subor(e, vlastny) {
  var r = e.request, pamat = caches.open(PAMAT);
  var siet = fetch(r, vlastny ? { cache: "no-cache" } : undefined).then(function (res) {
    if (dobra(res)) {
      var kopia = res.clone();
      e.waitUntil(pamat.then(function (c) { return c.put(r, kopia).then(function () { return uprac(c, r.url); }); }).catch(nic));
    }
    return res;
  });
  e.waitUntil(siet.catch(nic));
  return pamat.then(function (c) { return c.match(r); }).catch(nic).then(function (ulozeny) { return ulozeny || siet; });
}

// úvodná stránka aplikácie: najprv sieť, bez internetu (alebo keď server dlho mlčí) zapamätaná
function uvod(e) {
  var r = e.request, kluc = new URL("./", self.registration.scope).href, pamat = caches.open(PAMAT);
  var siet = fetch(r).then(function (res) {
    if (dobra(res) && res.type === "basic") {
      var kopia = res.clone();
      e.waitUntil(pamat.then(function (c) { return c.put(kluc, kopia); }).catch(nic));
    }
    return res;
  });
  e.waitUntil(siet.catch(nic));
  var ulozena = pamat.then(function (c) { return c.match(kluc); }).catch(nic);
  return new Promise(function (ok, chyba) {
    var hotovo = false;
    function daj(res) { if (!hotovo && res) { hotovo = true; ok(res); } }
    siet.then(function (res) {
      if (res.ok || res.type === "opaqueredirect") return daj(res);
      ulozena.then(function (u) { daj(u || res); });           // chyba servera – radšej zapamätaná
    }, function (err) {
      ulozena.then(function (u) { if (u) daj(u); else if (!hotovo) { hotovo = true; chyba(err); } });
    });
    setTimeout(function () { ulozena.then(daj); }, CAKAT_NA_SIET);
  });
}

self.addEventListener("fetch", function (e) {
  var r = e.request;
  if (r.method !== "GET") return;
  var u = new URL(r.url);
  if (u.origin === self.location.origin) {
    if (r.mode === "navigate") {
      var koren = new URL(self.registration.scope).pathname;
      if (u.pathname === koren || u.pathname === koren + "index.html") e.respondWith(uvod(e));
      return;                                                   // ostatné stránky (web makléra, ponuka…) bez zásahu
    }
    if (SUBORY.test(u.pathname) && !/\/sw\.js$/.test(u.pathname)) e.respondWith(subor(e, true));
    return;
  }
  if (PISMA.test(u.origin)) e.respondWith(subor(e, false));    // písma Google
});

// klik na upozornenie z chatu otvorí aplikáciu na chate
self.addEventListener("notificationclick", function (e) {
  e.notification.close();
  var url = (e.notification.data && e.notification.data.url) || "./#chat";
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (zoz) {
    for (var i = 0; i < zoz.length; i++) { if ("focus" in zoz[i]) { zoz[i].navigate ? zoz[i].navigate(url).catch(function () {}) : null; return zoz[i].focus(); } }
    return self.clients.openWindow(url);
  }));
});

// upozornenie do mobilu – príde aj keď je aplikácia zatvorená:
// nový súkromný inzerát (skener), nová správa v chate a nový kontakt z webu (server)
var SAFARI = /AppleWebKit/.test(self.navigator.userAgent) && !/Chrome|Chromium|CriOS|Edg|Android/.test(self.navigator.userAgent);
self.addEventListener("push", function (e) {
  var d = {};
  try { d = e.data ? e.data.json() : {}; } catch (x) { d = { title: "Realitný týpek", body: e.data ? e.data.text() : "" }; }
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (zoz) {
    // správu práve otvorená aplikácia ukáže sama (obálka v chate); Safari však vyžaduje upozornenie pri každej správe
    var vidno = zoz.some(function (c) { return c.visibilityState === "visible"; });
    if (vidno && d.druh === "spravy" && !SAFARI) return;
    return self.registration.showNotification(d.title || "Realitný týpek", {
      body: d.body || "", icon: "typek-ikona-192.png?v=202610251300", badge: "typek-odznak-96.png?v=202610251300", tag: d.tag || undefined, renotify: !!d.tag,
      data: { url: d.url || "./#inzeraty" }
    });
  }));
});
