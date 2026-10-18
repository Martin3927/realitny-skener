// Service worker skenera – umožní pridať skener na plochu ako aplikáciu.
// Nič neukladá do vyrovnávacej pamäte: údaje sa vždy načítajú čerstvé zo siete.
self.addEventListener("install", function () { self.skipWaiting(); });
self.addEventListener("activate", function (e) { e.waitUntil(self.clients.claim()); });
self.addEventListener("fetch", function () { /* bez zásahu – prehliadač načíta zo siete */ });
