// Service worker skenera – umožní pridať skener na plochu ako aplikáciu.
// Nič neukladá do vyrovnávacej pamäte: údaje sa vždy načítajú čerstvé zo siete.
self.addEventListener("install", function () { self.skipWaiting(); });
self.addEventListener("activate", function (e) { e.waitUntil(self.clients.claim()); });
self.addEventListener("fetch", function () { /* bez zásahu – prehliadač načíta zo siete */ });

// klik na upozornenie z chatu otvorí aplikáciu na chate
self.addEventListener("notificationclick", function (e) {
  e.notification.close();
  var url = (e.notification.data && e.notification.data.url) || "./#chat";
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (zoz) {
    for (var i = 0; i < zoz.length; i++) { if ("focus" in zoz[i]) { zoz[i].navigate ? zoz[i].navigate(url).catch(function () {}) : null; return zoz[i].focus(); } }
    return self.clients.openWindow(url);
  }));
});

// upozornenie zo skenera (nový súkromný inzerát) – príde aj keď je aplikácia zatvorená
self.addEventListener("push", function (e) {
  var d = {};
  try { d = e.data ? e.data.json() : {}; } catch (x) { d = { title: "Realitný týpek", body: e.data ? e.data.text() : "" }; }
  e.waitUntil(self.registration.showNotification(d.title || "Realitný týpek", {
    body: d.body || "", icon: "ikona-192.png", badge: "favicon-32.png", tag: d.tag || undefined, renotify: !!d.tag,
    data: { url: d.url || "./#inzeraty" }
  }));
});
