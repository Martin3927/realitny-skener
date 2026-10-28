/* Spoločné pomôcky verejných stránok (ponuka, leták, report) – Realitný týpek · Alpha Reality */
(function () {
  var CFG = window.SKENER_CONFIG || {};
  var nf = new Intl.NumberFormat("sk-SK");
  var sb = window.supabase && CFG.supabaseUrl ? window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey) : null;

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; });
  }
  function eur(n) { return nf.format(Math.round(Number(n))) + " €"; }
  function rpc(fn, args) {
    if (sb) return sb.rpc(fn, args).then(function (r) { if (r.error) throw r.error; return r.data; });
    return fetch(CFG.supabaseUrl + "/rest/v1/rpc/" + fn, {
      method: "POST", headers: { apikey: CFG.supabaseKey, "Content-Type": "application/json" }, body: JSON.stringify(args || {}),
    }).then(function (r) {
      return r.text().then(function (t) {
        var d = null; try { d = t ? JSON.parse(t) : null; } catch (e) { /* nie JSON */ }
        if (!r.ok) throw new Error((d && d.message) || "Údaje sa nepodarilo načítať (" + r.status + ").");
        return d;
      });
    });
  }
  function fotkaUrl(f) {
    if (!f) return "";
    if (f.url) return f.url;
    return CFG.supabaseUrl + "/storage/v1/object/public/ponuky/" + f.cesta;
  }
  function nazov(p) { return p.nazov || [p.typ || "Nehnuteľnosť", p.obec].filter(Boolean).join(", "); }
  function lokalita(p) { return [p.ulica, p.cast_obce, p.obec].filter(Boolean).join(", ") + (p.okres && p.okres !== p.obec ? ", okres " + p.okres : ""); }
  function cena(p) {
    if (p.zobrazit_cenu === false || p.cena == null) return p.typ_ceny === "na vyžiadanie" ? "Cena na vyžiadanie" : "Cena dohodou";
    if (p.typ_ceny === "dohodou") return eur(p.cena) + " · dohodou";
    return eur(p.cena) + (p.typ_ceny && p.typ_ceny !== "za nehnuteľnosť" && p.typ_ceny !== "na vyžiadanie" ? " " + p.typ_ceny : "");
  }
  function cenaM2(p) {
    var pl = p.kategoria === "pozemky" ? p.plocha_pozemku : p.plocha_uzitkova;
    if (!p.cena || !pl || p.zobrazit_cenu === false || p.transakcia === "prenajom" || (p.typ_ceny && p.typ_ceny !== "za nehnuteľnosť")) return "";
    return nf.format(Math.round(p.cena / pl)) + " €/m²";
  }
  var CISELNE = [["plocha_uzitkova", "Úžitková plocha", " m²"], ["plocha_zastavana", "Zastavaná plocha", " m²"], ["plocha_pozemku", "Pozemok", " m²"],
    ["izby", "Izby", ""], ["poschodie", "Poschodie", ""], ["pocet_podlazi", "Podlažia", ""], ["rok_vystavby", "Rok výstavby", ""]];
  var TEXTOVE = [["stav_objektu", "Stav"], ["konstrukcia", "Konštrukcia"], ["vlastnictvo", "Vlastníctvo"], ["kurenie", "Kúrenie"], ["energ_certifikat", "Energetický certifikát"]];
  function parametre(p) {
    var out = [];
    CISELNE.forEach(function (k) {
      var v = p[k[0]]; if (v === null || v === undefined || v === "") return;
      if (k[0] === "poschodie") v = Number(v) === 0 ? "prízemie" : v + (p.pocet_podlazi ? " z " + p.pocet_podlazi : "");
      else if (k[0] === "rok_vystavby") v = String(v);   // rok bez medzery (1985, nie 1 985)
      else v = nf.format(v) + k[2];
      if (k[0] === "pocet_podlazi" && p.poschodie !== null && p.poschodie !== undefined && p.poschodie !== "") return;
      out.push([k[1], v]);
    });
    TEXTOVE.forEach(function (k) { if (p[k[0]]) out.push([k[1], p[k[0]]]); });
    if ((p.orientacia || []).length) out.push(["Orientácia", p.orientacia.join(", ")]);
    if (p.cena_energie) out.push(["Energie", p.cena_energie]);
    return out;
  }
  function telOdkaz(t) { return String(t || "").replace(/[^\d+]/g, ""); }
  function waOdkaz(t) {
    var c = telOdkaz(t); if (c.indexOf("+") === 0) c = c.slice(1); else if (c.indexOf("00") === 0) c = c.slice(2); else if (c.indexOf("0") === 0) c = "421" + c.slice(1);
    return c;
  }
  function avatar(m, px) {
    var ini = String((m && m.meno) || "?").split(/\s+/).filter(function (x) { return !/\.$/.test(x); }).map(function (x) { return x.charAt(0); }).slice(0, 2).join("").toUpperCase();
    if (m && m.foto) return '<img class="v-av" style="width:' + px + "px;height:" + px + 'px" src="' + esc(m.foto) + '" alt="">';
    return '<span class="v-av v-av-ini" style="width:' + px + "px;height:" + px + "px;font-size:" + Math.round(px * 0.38) + 'px">' + esc(ini) + "</span>";
  }
  function param(n) { return new URLSearchParams(location.search).get(n); }
  function datum(iso, cas) {
    var d = new Date(iso);
    return d.toLocaleDateString("sk-SK", { day: "numeric", month: "numeric", year: "numeric" }) + (cas ? " " + d.toLocaleTimeString("sk-SK", { hour: "2-digit", minute: "2-digit" }) : "");
  }
  function verejnyOdkaz(id) { return new URL("ponuka.html?id=" + id, location.href).href; }

  // vzhľad kancelárie (logo a farba z nastavení administrátora) – aj na verejných stránkach
  function hexRgb(h) { h = String(h).replace("#", ""); return [0, 2, 4].map(function (i) { return parseInt(h.slice(i, i + 2), 16); }); }
  function zmiesaj(a, b, t) { var x = hexRgb(a), y = hexRgb(b); return "#" + x.map(function (v, i) { return Math.round(v + (y[i] - v) * t).toString(16).padStart(2, "0"); }).join(""); }
  var SCH = { zlata: ["#dab967", "#a8862f"], typek: ["#db9522", "#8a5a2b"], modra: ["#4c8df6", "#2560c4"], smaragd: ["#2fb380", "#16845a"], vinova: ["#c4566a", "#9a2d42"],
    oranzova: ["#f08a2c", "#b85c0c"], fialova: ["#8d73ee", "#6247cc"], grafit: ["#a3adbb", "#566170"] };
  function aplikujVzhlad(v) {
    if (!v) return;
    var f = v.schema === "vlastna" && /^#[0-9a-f]{6}$/i.test(v.farba || "") ? [v.farba, zmiesaj(v.farba, "#000000", 0.3)] : SCH[v.schema];
    if (f && v.schema !== "typek") {
      var st = document.createElement("style");
      st.textContent = ":root{--gold:" + f[1] + ";--gold-strong:" + f[0] + ";--gold-soft:" + zmiesaj(f[0], "#ffffff", 0.84) + "}" +
        '@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--gold:' + f[0] + ";--gold-soft:" + zmiesaj("#1f2228", f[0], 0.18) + "}}";
      document.head.appendChild(st);
    }
    if (v.logo) document.querySelectorAll('img[src^="logo.png"]').forEach(function (i) { i.src = v.logo; if (v.nazov) i.alt = v.nazov; });
    aplikujKancelariu(v);
    nastavMeranie(v.meranie);
  }

  // ---------------------------------------------------------------- meranie návštevnosti (Google Analytics, Meta Pixel)
  // ID nastaví administrátor vo Vzhľade kancelárie. Zapne sa len na stránkach s <body data-meranie>
  // a až po súhlase návštevníka s cookies; bez súhlasu sa nič nenačíta a nič sa neposiela.
  var MER = { ga: "", fb: "", zapnute: false };
  function suhlas() { try { return localStorage.getItem("typek-cookies") || ""; } catch (e) { return ""; } }
  function ulozSuhlas(v) { try { localStorage.setItem("typek-cookies", v); } catch (e) { /* bez úložiska */ } }
  function skript(src) { var x = document.createElement("script"); x.async = true; x.src = src; document.head.appendChild(x); }
  function nastavMeranie(m) {
    m = m || {};
    var ga = /^G-[A-Z0-9]{4,14}$/.test(String(m.ga || "")) ? m.ga : "", fb = /^\d{8,20}$/.test(String(m.fb || "")) ? m.fb : "";
    MER.ga = ga; MER.fb = fb;
    if (!document.body || !document.body.hasAttribute("data-meranie") || (!ga && !fb)) return;
    if (/[?&]nahlad=1(&|$)/.test(location.search)) return;   // náhľad makléra sa nemeria
    var odkaz = document.querySelector("[data-cookies]"); if (odkaz) odkaz.hidden = false;
    if (suhlas() === "vsetky") zapniMeranie(); else if (!suhlas()) listaCookies();
  }
  function zapniMeranie() {
    if (MER.zapnute) return; MER.zapnute = true;
    if (MER.ga) { window.dataLayer = window.dataLayer || []; window.gtag = function () { window.dataLayer.push(arguments); }; window.gtag("js", new Date()); window.gtag("config", MER.ga); skript("https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(MER.ga)); }
    if (MER.fb && !window.fbq) {
      var f = window.fbq = function () { if (f.callMethod) f.callMethod.apply(f, arguments); else f.queue.push(arguments); };
      if (!window._fbq) window._fbq = f; f.push = f; f.loaded = true; f.version = "2.0"; f.queue = [];
      window.fbq("init", MER.fb); window.fbq("track", "PageView"); skript("https://connect.facebook.net/en_US/fbevents.js");
    }
    (MER.cakajuce || []).forEach(function (u) { udalost(u[0], u[1]); }); MER.cakajuce = [];
  }
  // druh: „ponuka“ (pozretie ponuky) alebo „zaujem“ (odoslaný formulár)
  function udalost(druh, par) {
    par = par || {};
    if (!MER.zapnute) { (MER.cakajuce = MER.cakajuce || []).push([druh, par]); return; }
    try {
      if (druh === "ponuka") {
        if (MER.ga && window.gtag) window.gtag("event", "view_item", { currency: "EUR", value: par.cena || 0, items: [{ item_id: String(par.id), item_name: par.nazov || "" }] });
        if (MER.fb && window.fbq) window.fbq("track", "ViewContent", { content_ids: [String(par.id)], content_type: "product", content_name: par.nazov || "", value: par.cena || 0, currency: "EUR" });
      } else if (druh === "zaujem") {
        if (MER.ga && window.gtag) window.gtag("event", "generate_lead", { form: par.formular || "", item_id: String(par.id || "") });
        if (MER.fb && window.fbq) window.fbq("track", "Lead", { content_name: par.formular || "", content_ids: [String(par.id || "")] });
      }
    } catch (e) { /* meranie nesmie nič pokaziť */ }
  }
  function listaCookies() {
    if (document.getElementById("v-cookies")) return;
    var d = document.createElement("div"); d.className = "v-cookies"; d.id = "v-cookies"; d.setAttribute("role", "dialog"); d.setAttribute("aria-label", "Nastavenie cookies");
    d.innerHTML = "<p><b>Používame cookies.</b> Nevyhnutné zabezpečujú fungovanie stránky. S vaším súhlasom použijeme aj analytické a marketingové " +
      "(Google Analytics, Meta Pixel), aby sme vedeli, čo vás zaujíma, a mohli vám ukázať ďalšie vhodné ponuky.</p>" +
      '<div class="v-cookies-btn"><button type="button" class="v-btn" data-ck="nevyhnutne">Len nevyhnutné</button><button type="button" class="v-btn tmave" data-ck="vsetky">Prijať všetky</button></div>';
    d.addEventListener("click", function (e) {
      var b = e.target.closest("[data-ck]"); if (!b) return;
      ulozSuhlas(b.dataset.ck); d.remove(); document.body.classList.remove("ma-cookies");
      if (b.dataset.ck === "vsetky") zapniMeranie();
    });
    document.body.appendChild(d); document.body.classList.add("ma-cookies");
  }
  document.addEventListener("click", function (e) {
    if (!e.target.closest("[data-cookies]")) return;
    e.preventDefault(); try { localStorage.removeItem("typek-cookies"); } catch (x) { /* nič */ }
    if (MER.zapnute) { location.reload(); return; }   // už načítané skripty sa dajú vypnúť len znovunačítaním
    listaCookies();
  });

  // údaje kancelárie z nastavení (Vzhľad a značka kancelárie): názov, obchodné meno, web a kde pôsobí.
  // Stránky majú v HTML predvolený text; prvky s data-kanc sa podľa nastavení prepíšu, takže každá kancelária vidí seba.
  var KANC = {}, KANC_NACITANE = false;
  function webAdresa(u) {
    u = String(u || "").trim(); if (!u) return "";
    if (!/^https?:\/\//i.test(u)) u = "https://" + u;
    return /^https?:\/\/[^\s"'<>]+$/i.test(u) ? u : "";
  }
  function webText(u) { return String(u || "").replace(/^https?:\/\//i, "").replace(/\/$/, ""); }
  function aplikujKancelariu(k) {
    if (k && (k.nazov || k.web || k.firma || k.region)) {
      KANC_NACITANE = true;
      ["nazov", "firma", "web", "region"].forEach(function (x) { KANC[x] = k[x] ? String(k[x]).trim() : ""; });
    }
    if (!KANC_NACITANE) return;
    var hod = { nazov: KANC.nazov, firma: KANC.firma || KANC.nazov, region: KANC.region }, w = webAdresa(KANC.web);
    document.querySelectorAll("[data-kanc]").forEach(function (el) { var v = hod[el.getAttribute("data-kanc")]; if (v && el.textContent !== v) el.textContent = v; });
    document.querySelectorAll("[data-kanc-cast]").forEach(function (el) {
      var x = el.getAttribute("data-kanc-cast"), ukaz = !!(x === "web" ? w : hod[x]);
      if (el.hidden === ukaz) el.hidden = !ukaz;
    });
    if (w) document.querySelectorAll("[data-kanc-web]").forEach(function (a) {
      if (a.getAttribute("href") !== w) a.setAttribute("href", w);
      if (a.hasAttribute("data-kanc-web-text") && a.textContent !== webText(w)) a.textContent = webText(w);
    });
    if (KANC.nazov) document.querySelectorAll('img[src^="logo.png"], img[data-kanc-logo]').forEach(function (i) { if (i.alt !== KANC.nazov) i.alt = KANC.nazov; });
  }
  // aktuálne údaje kancelárie pre texty skladané v JavaScripte (titulok, „Váš maklér · …“)
  function kanc() {
    var el = document.querySelector('[data-kanc="nazov"]');
    return { nazov: KANC.nazov || (el && el.textContent.trim()) || "Realitná kancelária", firma: KANC.firma || KANC.nazov || "",
      web: webAdresa(KANC.web), webText: webText(webAdresa(KANC.web)), region: KANC.region || "" };
  }
  try { aplikujVzhlad(JSON.parse(localStorage.getItem("typek-vzhlad") || "null")); } catch (e) { /* bez úložiska */ }
  function vzhladZoServera() {
    rpc("vzhlad_kancelarie", {}).then(function (v) {
      try { localStorage.setItem("typek-vzhlad", JSON.stringify(v || {})); } catch (e) { /* nič */ }
      aplikujVzhlad(v);
    }).catch(function () {});
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", vzhladZoServera); else vzhladZoServera();
  // logá vložené neskôr (napr. leták) sa prepnú tiež
  new MutationObserver(function () {
    var v = null; try { v = JSON.parse(localStorage.getItem("typek-vzhlad") || "null"); } catch (e) { /* nič */ }
    if (v && v.logo) document.querySelectorAll('img[src^="logo.png"]').forEach(function (i) { i.src = v.logo; });
    aplikujKancelariu(null);   // texty s údajmi kancelárie vložené neskôr
  }).observe(document.documentElement, { childList: true, subtree: true });

  // ochrana formulárov proti robotom (rovnaká ako na webe makléra): prehliadač nájde číslo, pri ktorom
  // SHA-256 z „typek1|adresa|formulár|čas|číslo“ začína štyrmi nulami; server to overí a každé riešenie prijme raz
  var K256 = [0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2];
  var SHA_W = new Array(64);
  function sha256Zaciatok(t) {
    var n = t.length, l = ((n + 9 + 63) >> 6) << 4, m = new Array(l), i, j;
    for (i = 0; i < l; i++) m[i] = 0;
    for (i = 0; i < n; i++) m[i >> 2] |= (t.charCodeAt(i) & 0xff) << (24 - (i & 3) * 8);
    m[n >> 2] |= 0x80 << (24 - (n & 3) * 8); m[l - 1] = n * 8;
    var h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a, h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19, w = SHA_W;
    for (j = 0; j < l; j += 16) {
      var a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
      for (i = 0; i < 64; i++) {
        if (i < 16) w[i] = m[j + i] | 0;
        else { var x = w[i - 15], y = w[i - 2]; w[i] = (((x >>> 7) | (x << 25)) ^ ((x >>> 18) | (x << 14)) ^ (x >>> 3)) + w[i - 7] + (((y >>> 17) | (y << 15)) ^ ((y >>> 19) | (y << 13)) ^ (y >>> 10)) + w[i - 16] | 0; }
        var t1 = h + (((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7))) + ((e & f) ^ (~e & g)) + K256[i] + w[i] | 0;
        var t2 = (((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10))) + ((a & b) ^ (a & c) ^ (b & c)) | 0;
        h = g; g = f; f = e; e = d + t1 | 0; d = c; c = b; b = a; a = t1 + t2 | 0;
      }
      h0 = h0 + a | 0; h1 = h1 + b | 0; h2 = h2 + c | 0; h3 = h3 + d | 0; h4 = h4 + e | 0; h5 = h5 + f | 0; h6 = h6 + g | 0; h7 = h7 + h | 0;
    }
    return h0 >>> 0;
  }
  var POW = {};
  function overenie(adresa, zdroj) {
    var a = String(adresa || "").trim().toLowerCase().replace(/[^\x20-\x7e]/g, ""), now = Math.floor(Date.now() / 1000), c = POW[zdroj];
    if (c && c.a === a && now - c.ts < 1500) return c.p;
    var pred = "typek1|" + a + "|" + zdroj + "|" + now + "|", n = 0;
    var p = new Promise(function (res) {
      (function krok() {
        var t0 = Date.now();
        while (Date.now() - t0 < 25) { for (var i = 0; i < 400; i++, n++) { var k = n.toString(36); if ((sha256Zaciatok(pred + k) >>> 16) === 0) return res({ ts: String(now), n: k }); } }
        setTimeout(krok, 0);
      })();
    });
    POW[zdroj] = { a: a, ts: now, p: p };
    return p;
  }
  function overeniePouzite(zdroj) { delete POW[zdroj]; }

  window.TYPEK = { CFG: CFG, sb: sb, nf: nf, esc: esc, eur: eur, rpc: rpc, fotkaUrl: fotkaUrl, nazov: nazov, lokalita: lokalita, cena: cena, cenaM2: cenaM2,
    parametre: parametre, telOdkaz: telOdkaz, waOdkaz: waOdkaz, avatar: avatar, param: param, datum: datum, verejnyOdkaz: verejnyOdkaz,
    overenie: overenie, overeniePouzite: overeniePouzite, kanc: kanc, aplikujKancelariu: aplikujKancelariu, udalost: udalost };
})();
