// verejný web realitnej kancelárie: načítanie zverejneného webu, podstránky, formuláre, návštevy, meranie po súhlase
(function () {
  "use strict";
  var CFG = window.SKENER_CONFIG, T = window.TYPEK_WEB, KC = window.TYPEK_KANC, K = KC.K;
  var sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey);
  var q = new URLSearchParams(location.search);
  var vlastna = !/realitnytypek\.sk$|github\.io$|localhost|^127\./.test(location.hostname);
  var subor = /kancelaria\.html$/.test(location.pathname) ? "kancelaria.html" : "stranka.html";
  var adresa = vlastna ? location.hostname.replace(/^www\./, "") : q.get("m") || "";
  var nahlad = q.get("nahlad") === "1";
  var site = document.getElementById("site");
  var STR = KC.STRANKY.map(function (x) { return x[0]; }).concat(["ponuka"]);
  function chyba(t) { site.innerHTML = '<div class="nacitavam">' + t + "</div>"; }

  // ktorá podstránka: na vlastnej doméne z cesty (/ponuky, /blog/nazov-clanku), inak z ?s= a ?c=
  function zAdresy() {
    // starší odkaz na ponuku (napr. z e-mailu strážcu): ?p=123
    var pid = String(q.get("p") || "").replace(/\D/g, "");
    if (pid) return { page: "ponuka", sub: pid };
    if (vlastna && subor !== "kancelaria.html") {
      var m = location.pathname.match(/^\/([a-z-]+)(?:\/([^\/]+))?\/?$/);
      if (m && STR.indexOf(m[1]) >= 0) return { page: m[1], sub: m[2] ? decodeURIComponent(m[2]) : "" };
      return { page: "domov", sub: "" };
    }
    var s = String(q.get("s") || "");
    return { page: STR.indexOf(s) >= 0 ? s : "domov", sub: String(q.get("c") || "") };
  }

  // odkiaľ návštevník prišiel (bez cookies)
  function zdrojNavstevy() {
    var g = function (k) { return String(q.get(k) || "").toLowerCase(); }, z = g("z"), us = g("utm_source"), um = g("utm_medium");
    if (z === "qr" || us === "qr" || um === "qr") return "qr";
    if (z === "email" || um === "email" || us === "newsletter") return "email";
    if (/instagram|^ig$/.test(us)) return "instagram";
    if (/facebook|^fb$|^meta$/.test(us)) return "facebook";
    if (/google/.test(us) || q.get("gclid")) return "google";
    var r = ""; try { r = document.referrer ? new URL(document.referrer).hostname.toLowerCase() : ""; } catch (e) { r = ""; }
    if (r && r !== location.hostname) {
      if (/(^|\.)instagram\.com$/.test(r)) return "instagram";
      if (/(^|\.)(facebook\.com|fb\.com|fb\.me|messenger\.com)$/.test(r)) return "facebook";
      if (/(^|\.)(mail\.google\.com|outlook\.live\.com|outlook\.office\.com|mail\.yahoo\.com|posta\.sk|centrum\.sk)$/.test(r)) return "email";
      if (/(^|\.)google\.[a-z.]+$/.test(r)) return "google";
      if (/(^|\.)(bing\.com|seznam\.cz|duckduckgo\.com|yahoo\.com|zoznam\.sk|azet\.sk|ecosia\.org)$/.test(r)) return "vyhladavac";
      return "iny";
    }
    if (q.get("fbclid")) return "facebook";
    return "priamo";
  }
  var ZDROJ = zdrojNavstevy();
  if (q.has("z")) { try { q.delete("z"); var qs = q.toString(); history.replaceState(null, "", location.pathname + (qs ? "?" + qs : "") + location.hash); } catch (e) { /* nič */ } }

  // Google Analytics a Meta Pixel kancelárie – len po súhlase „Prijať všetky“
  var MER = false;
  function skript(src) { var x = document.createElement("script"); x.async = true; x.src = src; document.head.appendChild(x); }
  function zapniMeranie() {
    var t = KC.trk(); if (MER || !t.any) return; MER = true;
    if (t.ga) { window.dataLayer = window.dataLayer || []; window.gtag = function () { window.dataLayer.push(arguments); }; window.gtag("js", new Date()); window.gtag("config", t.ga); skript("https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(t.ga)); }
    if (t.fb && !window.fbq) { var f = window.fbq = function () { if (f.callMethod) f.callMethod.apply(f, arguments); else f.queue.push(arguments); }; if (!window._fbq) window._fbq = f; f.push = f; f.loaded = true; f.version = "2.0"; f.queue = [];
      window.fbq("init", t.fb); window.fbq("track", "PageView"); skript("https://connect.facebook.net/en_US/fbevents.js"); }
  }
  function udalost(ga, fb, par) { if (!MER) return; var t = KC.trk(); try { if (t.ga && window.gtag) window.gtag("event", ga, par || {}); if (t.fb && window.fbq) window.fbq("track", fb, par || {}); } catch (e) { /* nič */ } }

  if (!adresa) return chyba("Stránka sa nenašla.");

  function titul(page, sub) {
    var S = K.S, meno = S.k.name || "Realitná kancelária";
    if (page === "ponuka") { var x = KC.najdiPonuku(sub); if (x) return x.t + (x.bezCeny || x.stav === "predane" ? "" : " – " + KC.fmt(x.p) + " €" + (x.rent ? " / mes." : "")) + " | " + meno; }
    if (page === "tim" && sub) { var m = KC.makleriWeb().find(function (y) { return KC.slugM(y) === sub; }); if (m) return KC.menoM(m) + " – " + KC.rolaM(m) + " | " + meno; }
    if (page === "blog" && sub) { var a = KC.clanky().find(function (x) { return KC.slugC(x) === sub; }); if (a) return a.t + " | " + meno; }
    var st = KC.STRANKY.find(function (x) { return x[0] === page; });
    if (st && page !== "domov") return st[1] + " | " + meno;
    return S.share.title || meno + " | Realitná kancelária" + (S.hero.eb && !/realitná kancelária/i.test(S.hero.eb) ? ", " + S.hero.eb : "");
  }

  var vlozene = document.getElementById("web-data"), nacitanie;
  try { nacitanie = vlozene && !nahlad ? Promise.resolve({ data: JSON.parse(vlozene.textContent) }) : null; } catch (e) { nacitanie = null; }
  (nacitanie || sb.rpc("verejny_web", { p_adresa: adresa, p_nahlad: nahlad })).then(function (r) {
    if (r.error) throw r.error;
    var d = r.data;
    if (!d) return chyba(nahlad ? "Náhľad uvidíš, keď si v rovnakom prehliadači prihlásený v Realitnom týpkovi." : "Táto stránka zatiaľ nie je zverejnená.");
    if (d.druh !== "kancelaria") { location.replace("stranka.html" + location.search); return; }
    var poz = zAdresy();
    KC.init({ root: site, scroller: window, editor: false, adresa: d.nahlad ? adresa : (d.adresa || adresa), domena: d.domena || "", vlastna: vlastna && subor !== "kancelaria.html", subor: subor, nahlad: !!d.nahlad, page: poz.page, sub: poz.sub });
    K.S = KC.merge(d.web || {}); K.D = d;
    if (!d.nahlad && !vlastna && q.get("m") && d.adresa && d.adresa !== String(adresa).toLowerCase()) {
      try { q.set("m", d.adresa); history.replaceState(null, "", location.pathname + "?" + q.toString() + location.hash); } catch (e) { /* nič */ }
    }
    try { if (localStorage.getItem("typek-web-cookies")) K.UI.ck = false; } catch (e) { /* nič */ }
    if (poz.page === "ponuka" && q.get("p")) { var px = KC.najdiPonuku(poz.sub); if (px) { K.sub = KC.subPonuky(px); try { history.replaceState(null, "", KC.href("ponuka", K.sub)); } catch (e) { /* nič */ } } }
    document.getElementById("nahladPas").hidden = !d.nahlad;

    K.hooks.odoslat = function (o) {
      return T.overenie(adresa, o.zdroj).then(function (ov) {
        T.overeniePouzite(o.zdroj);
        return sb.rpc("web_kontakt", { p_adresa: adresa, p_zdroj: o.zdroj, p_kontakt: o.kontakt, p_meno: o.meno || null, p_co: o.co || null, p_ponuka: o.ponuka || null,
          p_dopyt: o.dopyt || null, p_overenie: { ts: ov.ts, n: ov.n, med: o.med || "" }, p_komu: /^[0-9a-f-]{36}$/.test(o.komu || "") ? o.komu : null });
      }).then(function (x) { if (x.error) throw new Error(x.error.message || "Správu sa nepodarilo odoslať."); return x.data; });
    };
    K.hooks.nacitajPonuku = function (id) { return sb.rpc("verejna_ponuka", { p_id: id }).then(function (x) { if (x.error) throw x.error; return x.data; }); };
    K.hooks.poOdoslani = function (f) { if (!d.nahlad) udalost("generate_lead", "Lead", { content_name: f }); };
    K.hooks.klik = function (typ) {
      if (d.nahlad) return;
      udalost("contact", "Contact", { method: typ });
      var k = "typek-klik-" + adresa + "-" + typ;
      try { if (sessionStorage.getItem(k)) return; sessionStorage.setItem(k, "1"); } catch (e) { /* nič */ }
      sb.rpc("zaznamenat_klik_webu", { p_adresa: adresa, p_typ: typ, p_ponuka: null }).then(function () {});
    };
    K.hooks.suhlas = function (volba) {
      try { localStorage.setItem("typek-web-cookies", volba); } catch (e) { /* nič */ }
      if (volba === "vsetky" && !d.nahlad) zapniMeranie();
    };
    K.hooks.poNavigacii = function (page, sub) {
      try { history.pushState({ page: page, sub: sub }, "", KC.href(page, sub)); } catch (e) { /* nič */ }
      document.title = titul(page, sub);
      if (MER && window.gtag) try { window.gtag("event", "page_view", { page_location: location.href, page_title: document.title }); } catch (e) { /* nič */ }
    };
    window.addEventListener("popstate", function () { q = new URLSearchParams(location.search); var p = zAdresy(); KC.go(p.page, p.sub, "", true); document.title = titul(p.page, p.sub); });

    // titulok, popis a ikona
    document.title = titul(K.page, K.sub);
    var popis = K.S.share.desc || (K.S.hero.slides[0] && K.S.hero.slides[0].l) || "Predaj, kúpa, prenájom a výkup nehnuteľností.";
    document.querySelector('meta[name="description"]').setAttribute("content", popis);
    var logo = K.S.k.logo;
    if (logo) {
      var li = new Image(); li.crossOrigin = "anonymous";
      li.onload = function () {
        try { var n = 64, c = document.createElement("canvas"), g = c.getContext("2d"), k = Math.min(n / li.naturalWidth, n / li.naturalHeight), w = li.naturalWidth * k, h = li.naturalHeight * k;
          c.width = c.height = n; var P = KC.pal(); g.fillStyle = P.dark ? P.bg : "#1E2A35"; g.beginPath(); if (g.roundRect) g.roundRect(0, 0, n, n, 14); else g.rect(0, 0, n, n); g.fill();
          var k2 = k * 0.82; w = li.naturalWidth * k2; h = li.naturalHeight * k2; g.drawImage(li, (n - w) / 2, (n - h) / 2, w, h); document.getElementById("ikona").href = c.toDataURL("image/png"); } catch (e) { /* nič */ }
      };
      li.src = /^(https?:|data:)/.test(logo) ? logo : logo;
    }
    document.documentElement.style.background = KC.pal().bg; document.body.style.background = KC.pal().bg;
    KC.render();
    if (K.S.anim === "on") KC.sched();
    try { if (!d.nahlad && localStorage.getItem("typek-web-cookies") === "vsetky") zapniMeranie(); } catch (e) { /* nič */ }
    if (!d.nahlad) { try { if (!sessionStorage.getItem("typek-web-" + adresa)) { sessionStorage.setItem("typek-web-" + adresa, "1"); sb.rpc("zaznamenat_navstevu_webu", { p_adresa: adresa, p_zdroj: ZDROJ }).then(function () {}); } } catch (e) { /* nič */ } }
    // Google recenzie: raz za deň ich server obnoví (staré údaje sa zatiaľ ukážu)
    var g = d.google; if (!d.nahlad && g && g.kedy && Date.now() - Date.parse(g.kedy) > 20 * 3600e3) {
      sb.functions.invoke("google-recenzie", { body: { akcia: "obnovit" } }).then(function (x) { if (x && x.data && x.data.google) { K.D.google = x.data.google; KC.render(); } }, function () { /* nič */ });
    }
  }).catch(function () { chyba("Stránku sa nepodarilo načítať. Skúste to o chvíľu znova."); });
})();
