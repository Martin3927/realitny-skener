// verejný web makléra: načítanie zverejneného webu, formuláre, návštevy
(function () {
  "use strict";
  var CFG = window.SKENER_CONFIG, T = window.TYPEK_WEB, W = T.W;
  var sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey);
  var q = new URLSearchParams(location.search);
  // adresa: stranka.html?m=jana-kovacova, stranka.html?jana-kovacova alebo vlastná doména
  // na vlastnej doméne makléra sa ukazuje vždy jeho web (parameter m sa ignoruje)
  var vlastna = !/realitnytypek\.sk$|github\.io$|localhost|^127\./.test(location.hostname);
  var adresa = vlastna ? location.hostname.replace(/^www\./, "") : q.get("m") || (location.search.replace(/^\?/, "").split("&")[0].indexOf("=") < 0 ? location.search.replace(/^\?/, "").split("&")[0] : "");
  var nahlad = q.get("nahlad") === "1";
  var site = document.getElementById("site");
  function chyba(t) { site.innerHTML = '<div class="nacitavam">' + t + "</div>"; }

  // odkiaľ návštevník prišiel (bez cookies): QR kód z letáku či tabule, sociálne siete, vyhľadávač, e-mail, priamo
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
      if (/(^|\.)(mail\.google\.com|outlook\.live\.com|outlook\.office\.com|mail\.yahoo\.com|posta\.sk|centrum\.sk)$|^com\.google\.android\.gm$/.test(r)) return "email";
      if (/(^|\.)google\.[a-z.]+$|^com\.google\.android\.googlequicksearchbox$/.test(r)) return "google";
      if (/(^|\.)(bing\.com|seznam\.cz|duckduckgo\.com|yahoo\.com|zoznam\.sk|azet\.sk|ecosia\.org)$/.test(r)) return "vyhladavac";
      return "iny";
    }
    if (q.get("fbclid")) return "facebook";
    return "priamo";
  }
  var ZDROJ = zdrojNavstevy();
  // značka ?z=qr sa po prečítaní z adresy odstráni, aby sa pri zdieľaní odkazu nešírila ďalej
  if (q.has("z")) { try { q.delete("z"); var qs = q.toString(); history.replaceState(null, "", location.pathname + (qs ? "?" + qs : "") + location.hash); } catch (e) { /* nič */ } }

  // voliteľné meracie nástroje makléra (Google Analytics, Meta Pixel) – načítajú sa len po súhlase „Prijať všetky“
  var MER = false;
  function skript(src) { var x = document.createElement("script"); x.async = true; x.src = src; document.head.appendChild(x); }
  function zapniMeranie() {
    var t = T.trk ? T.trk() : { any: false }; if (MER || !t.any) return; MER = true;
    if (t.ga) { window.dataLayer = window.dataLayer || []; window.gtag = function () { window.dataLayer.push(arguments); }; window.gtag("js", new Date()); window.gtag("config", t.ga); skript("https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(t.ga)); }
    if (t.fb && !window.fbq) { var f = window.fbq = function () { if (f.callMethod) f.callMethod.apply(f, arguments); else f.queue.push(arguments); }; if (!window._fbq) window._fbq = f; f.push = f; f.loaded = true; f.version = "2.0"; f.queue = [];
      window.fbq("init", t.fb); window.fbq("track", "PageView"); skript("https://connect.facebook.net/en_US/fbevents.js"); }
  }
  function udalost(ga, fb, par) { if (!MER) return; var t = T.trk(); try { if (t.ga && window.gtag) window.gtag("event", ga, par || {}); if (t.fb && window.fbq) window.fbq("track", fb, par || {}); } catch (e) { /* nič */ } }
  if (!adresa) return chyba("Stránka sa nenašla.");

  // údaje pripravené serverom (stranka.php) ušetria jedno načítanie; náhľad sa vždy načíta s prihlásením
  var vlozene = document.getElementById("web-data"), nacitanie;
  try { nacitanie = vlozene && !nahlad ? Promise.resolve({ data: JSON.parse(vlozene.textContent) }) : null; } catch (e) { nacitanie = null; }
  (nacitanie || sb.rpc("verejny_web", { p_adresa: adresa, p_nahlad: nahlad })).then(function (r) {
    if (r.error) throw r.error;
    var d = r.data;
    if (!d) return chyba(nahlad ? "Náhľad uvidíš, keď si v rovnakom prehliadači prihlásený v Realitnom týpkovi." : "Táto stránka zatiaľ nie je zverejnená.");
    // web realitnej kancelárie má vlastnú šablónu (na vlastnej doméne aj s podstránkou z cesty, napr. /ponuky)
    if (d.druh === "kancelaria") {
      var kq = new URLSearchParams(location.search), kc = location.pathname.match(/^\/([a-z-]+)(?:\/([^\/]+))?\/?$/);
      if (vlastna && kc && kc[1] !== "stranka.html") { kq.set("s", kc[1]); if (kc[2]) kq.set("c", decodeURIComponent(kc[2])); }
      location.replace((vlastna ? "/" : "") + "kancelaria.html" + (kq.toString() ? "?" + kq.toString() : ""));
      return;
    }
    var m = d.makler || {}, s = T.merge(d.web || {});
    if (!s.name) s.name = m.meno_cele || m.meno || "";
    if (!s.phone) s.phone = m.telefon || "";
    if (!s.email) s.email = m.email || "";
    if (!s.photo && m.foto) s.photo = m.foto;
    W.S = s;
    if (!d.nahlad) { W.adresa = d.adresa || adresa; W.domena = d.domena || ""; }
    W.formAdresa = adresa;
    // stará adresa webu (napr. z vytlačeného QR kódu) → v prehliadači sa ukáže nová
    if (!vlastna && q.get("m") && d.adresa && d.adresa !== String(adresa).toLowerCase()) {
      try { q.set("m", d.adresa); history.replaceState(null, "", location.pathname + "?" + q.toString() + location.hash); } catch (e) { /* nič */ }
    }
    W.CTX = { ponuky: (d.ponuky || []).map(T.prevod), predane: (d.predane || []).map(T.prevod), recenzie: d.recenzie, makler: m, ukazka: false };
    try { if (localStorage.getItem("typek-web-cookies")) W.CK.bar = false; } catch (e) { /* nič */ }
    W.odoslat = function (o) {
      // neviditeľná ochrana: prehliadač vyrieši malú úlohu, server ju overí (každé riešenie platí raz)
      return T.overenie(adresa, o.zdroj).then(function (ov) {
        T.overeniePouzite(o.zdroj);
        return sb.rpc("web_kontakt", { p_adresa: adresa, p_zdroj: o.zdroj, p_kontakt: o.kontakt, p_meno: o.meno || null, p_co: o.co || null, p_ponuka: o.ponuka || null,
          p_dopyt: o.dopyt || null, p_overenie: { ts: ov.ts, n: ov.n, med: o.med || "" } });
      }).then(function (x) { if (x.error) throw new Error(x.error.message || "Správu sa nepodarilo odoslať."); return x.data; });
    };
    document.getElementById("nahladPas").hidden = !d.nahlad;
    // náhľad na počítači s vypnutými animáciami: vysvetlenie a tlačidlo, ktorým si ich maklér zobrazí
    if (d.nahlad && W.S.anim && T.bezPohybu && T.bezPohybu() && !W.vzdyPohyb) {
      var pas = document.getElementById("nahladPas"), bt = document.createElement("button");
      pas.appendChild(document.createTextNode(" Animácie nevidíš, lebo ich máš vypnuté v nastaveniach počítača. "));
      bt.type = "button"; bt.textContent = "Ukázať animácie"; bt.style.cssText = "font:inherit;font-weight:700;border:0;border-radius:999px;padding:3px 12px;background:#1E2A35;color:#F7F2E8;cursor:pointer";
      bt.addEventListener("click", function () { try { localStorage.setItem("typek-web-pohyb", "1"); } catch (e) { /* nič */ } W.vzdyPohyb = true; W.INTRO = true; T.render(); bt.remove(); });
      pas.appendChild(bt);
    }
    // titulok, popis a ikona pre prehliadač aj zdieľanie
    var titul = s.share.title || (s.name + " | Realitn" + (m.pohlavie === "zena" ? "á maklérka" : "ý maklér") + (s.area ? ", " + s.area : ""));
    document.title = titul; W.titulDomov = titul;
    var popis = s.share.desc || T.heroTx().l || ("Predaj, kúpa a prenájom nehnuteľností v regióne " + s.area + ".");
    document.querySelector('meta[name="description"]').setAttribute("content", popis);
    // značky pre zdieľanie (ak ich už pripravil server, nedopĺňajú sa druhýkrát)
    if (!document.querySelector('meta[property="og:title"]')) [["og:title", titul], ["og:description", popis], ["og:image", s.heroImg || s.photo && !/^data:/.test(s.photo) && s.photo || T.aiSrc(T.heroAi(s.tpl === "mestska" ? "mesto" : "dom"))]].forEach(function (x) {
      if (!x[1]) return; var el = document.createElement("meta"); el.setAttribute("property", x[0]); el.setAttribute("content", x[1]); document.head.appendChild(el);
    });
    if (s.logo) {
      var li = new Image(); li.crossOrigin = "anonymous";
      li.onload = function () {
        try { var n = 64, c = document.createElement("canvas"), g = c.getContext("2d"), k = Math.min(n / li.naturalWidth, n / li.naturalHeight), w = li.naturalWidth * k, h = li.naturalHeight * k;
          c.width = c.height = n; g.drawImage(li, (n - w) / 2, (n - h) / 2, w, h); document.getElementById("ikona").href = c.toDataURL("image/png"); } catch (e) { /* nič */ }
      };
      li.src = s.logo;
    }
    else { var P = T.pal(); document.getElementById("ikona").href = "data:image/svg+xml," + encodeURIComponent(T.favSvg(P).replace("<svg ", '<svg xmlns="http://www.w3.org/2000/svg" ')); }
    document.documentElement.style.background = T.pal().bg; document.body.style.background = T.pal().bg;
    W.poDetaile = function (x) { if (x.id && !d.nahlad) { sb.rpc("zaznamenat_zobrazenie", { p_id: x.id }).then(function () {}); udalost("view_item", "ViewContent", { content_ids: [String(x.id)], content_type: "product" }); } };
    // kliky na telefón, WhatsApp a e-mail (každý druh pri tej istej ponuke sa v jednej návšteve ráta raz)
    W.klik = function (typ, ponuka) {
      if (d.nahlad) return;
      udalost("contact", "Contact", { method: typ });
      var k = "typek-klik-" + adresa + "-" + typ + "-" + (ponuka || 0);
      try { if (sessionStorage.getItem(k)) return; sessionStorage.setItem(k, "1"); } catch (e) { /* nič */ }
      sb.rpc("zaznamenat_klik_webu", { p_adresa: adresa, p_typ: typ, p_ponuka: ponuka || null }).then(function () {});
    };
    W.poOdoslani = function (f) { if (!d.nahlad) udalost("generate_lead", "Lead", { content_name: f }); };
    W.poSuhlase = function (volba) { if (volba === "vsetky" && !d.nahlad) zapniMeranie(); };
    try { if (!d.nahlad && localStorage.getItem("typek-web-cookies") === "vsetky") zapniMeranie(); } catch (e) { /* nič */ }
    T.napoj(site);
    // ponuka z odkazu: stranka.html?m=adresa&p=ID alebo #p-ID
    var hm = location.hash.match(/^#p-(\d+)$/), pid = hm ? hm[1] : String(q.get("p") || "").replace(/\D/g, "");
    var i = pid ? W.CTX.ponuky.findIndex(function (x) { return String(x.id) === pid; }) : -1;
    if (i < 0 && pid) { var j = W.CTX.predane.findIndex(function (x) { return String(x.id) === pid; }); if (j >= 0) { W.CTX.ponuky = W.CTX.ponuky.concat([W.CTX.predane[j]]); i = W.CTX.ponuky.length - 1; } }
    if (i >= 0) W.PAGE = { v: "detail", i: i };
    T.render();
    if (!d.nahlad) { try { if (!sessionStorage.getItem("typek-web-" + adresa)) { sessionStorage.setItem("typek-web-" + adresa, "1"); sb.rpc("zaznamenat_navstevu_webu", { p_adresa: adresa, p_zdroj: ZDROJ }).then(function () {}); } } catch (e) { /* nič */ } }
  }).catch(function () { chyba("Stránku sa nepodarilo načítať. Skúste to o chvíľu znova."); });
})();
