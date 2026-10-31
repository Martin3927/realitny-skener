/* Týpkove nehnuteľnosti – zoznam ponúk, filtre, mapa a detail ponuky s dopytom maklérovi.
   Údaje: verejné funkcie portal_ponuky, portal_ponuka a portal_kontakt (Supabase, migrácia 085). */
(function () {
  "use strict";

  var SUPA = "https://uwxziqapghlyktwpipjd.supabase.co";
  var KLUC = "sb_publishable_ukjo7DCX1FMYly7NU4gtxg_suIF66nf";
  var OSM = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
  var LEAFLET = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/";

  // ---------------------------------------------------------------- pomocníci
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  function esc(v) { return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  var nf = new Intl.NumberFormat("sk-SK", { maximumFractionDigits: 0 });
  var nf1 = new Intl.NumberFormat("sk-SK", { maximumFractionDigits: 1 });
  function eur(n) { return nf.format(Math.round(Number(n))) + " €"; }
  function norm(s) { return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim(); }
  function sklon(n, a, b, c) { return n === 1 ? a : n >= 2 && n <= 4 ? b : c; }
  function pocetPonuk(n) { return nf.format(n) + " " + sklon(n, "ponuka", "ponuky", "ponúk"); }
  var MALO_POHYBU = window.matchMedia("(prefers-reduced-motion: reduce)").matches && !document.documentElement.classList.contains("pohyb-vzdy");
  var mobil = function () { return window.matchMedia("(max-width: 860px)").matches; };
  function uloz(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* súkromné okno */ } }
  function citaj(k, d) { try { var v = JSON.parse(localStorage.getItem(k) || "null"); return v == null ? d : v; } catch (e) { return d; } }

  var IC = {
    pin: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>',
    srdce: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M12 20s-7.5-4.6-9.3-9.2C1.5 7.6 3.6 4.5 7 4.5c2 0 3.6 1.1 5 3 1.4-1.9 3-3 5-3 3.4 0 5.5 3.1 4.3 6.3C19.5 15.4 12 20 12 20z"/></svg>',
    vlavo: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
    vpravo: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>',
    x: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    lupa: '<svg class="lupa" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>',
    filtre: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/></svg>',
    foto: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="6" width="18" height="14" rx="3"/><circle cx="12" cy="13" r="3.5"/><path d="M8.5 6l1.5-2h4l1.5 2"/></svg>',
    plocha: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9V4h5M20 15v5h-5M15 4h5v5M9 20H4v-5"/></svg>',
    izby: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round" aria-hidden="true"><path d="M3 18v-6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6M3 18h18M3 18v2M21 18v2M6 10V6h12v4"/></svg>',
    pozemok: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3c-3 0-5 2.4-5 5 0 2 1.2 3.5 3 4.3V21h4v-8.7c1.8-.8 3-2.3 3-4.3 0-2.6-2-5-5-5z"/></svg>',
    schody: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 20h5v-5h5v-5h5V5h3"/></svg>',
    stav: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18v3h3l6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.5-.5-.5-2.5z"/></svg>',
    rok: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
    ok: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    tel: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/></svg>',
    mail: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="M4 7l8 6 8-6"/></svg>',
    zdielat: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 15V3M7 8l5-5 5 5"/><path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/></svg>',
    kocka: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M12 12l8-4.5M12 12v9M12 12L4 7.5"/></svg>',
    web: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></svg>',
    domcek: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 11 12 4l9 7M5 9.5V20h14V9.5"/></svg>',
    sipka: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
    video: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="6" width="13" height="12" rx="3"/><path d="M16 10.5l5-3v9l-5-3"/></svg>',
  };
  var KAT = [
    ["byty", "Byty", "Byt", '<path d="M5 21V4h10v17M15 9h4v12M3 21h18M8 8h1M11 8h1M8 12h1M11 12h1M8 16h1M11 16h1"/>'],
    ["domy", "Domy", "Dom", '<path d="M3 11 12 4l9 7M5 9.5V20h14V9.5M10 20v-5h4v5"/>'],
    ["pozemky", "Pozemky", "Pozemok", '<path d="M3 20h18M6 20v-4M6 16c-2 0-2.5-2-1.5-3.2C3.6 11.4 5 9 6 9s2.4 2.4 1.5 3.8C8.5 14 8 16 6 16zM12 20l3-9 3 9M13 17h4"/>'],
    ["chaty", "Chaty a chalupy", "Chata", '<path d="M2 12 12 4l10 8M5 10v10h14V10M9 20v-5h6v5M12 4v-1"/>'],
    ["priestory", "Priestory", "Priestor", '<path d="M3 9l1.5-5h15L21 9M3 9h18M3 9c0 1.7 1.3 3 3 3s3-1.3 3-3c0 1.7 1.3 3 3 3s3-1.3 3-3c0 1.7 1.3 3 3 3s3-1.3 3-3M5 12v8h14v-8M10 20v-4h4v4"/>'],
    ["objekty", "Objekty", "Objekt", '<path d="M3 21V10l6 3V10l6 3V6l6 3v12zM3 21h18"/>'],
    ["garaze", "Garáže", "Garáž", '<path d="M3 21V9l9-5 9 5v12M7 21v-8h10v8M7 16h10"/>'],
  ];
  var KAT_M = {}; KAT.forEach(function (k) { KAT_M[k[0]] = k; });
  // farba krúžku s piktogramom na mape (podľa druhu nehnuteľnosti)
  var KAT_FARBA = { byty: "#4A6074", domy: "#1E2A35", pozemky: "#2E7D5B", chaty: "#8A5A2B", priestory: "#2F4152", objekty: "#3A4B5A", garaze: "#5E7387" };
  function katFarba(k) { return KAT_FARBA[k] || "#1E2A35"; }
  function katIkona(k, s) { return '<svg width="' + (s || 18) + '" height="' + (s || 18) + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ((KAT_M[k] || KAT[1])[3]) + "</svg>"; }

  // ---------------------------------------------------------------- adresy (pekné na realitnytypek.sk, inde ?id=)
  var PEKNE = /(^|\.)realitnytypek\.sk$/.test(location.hostname);
  var ROOT = location.pathname.replace(/\/clanky\/[a-z0-9-]{1,100}\/?$/, "/").replace(/\/\d{1,10}(?:-[a-z0-9-]*)?\/?$/, "/").replace(/[^/]*$/, "");
  function clanokZAdresy() {
    var m = location.pathname.match(/\/clanky\/([a-z0-9-]{1,100})\/?$/);
    if (m) return m[1];
    var q = new URLSearchParams(location.search).get("clanok");
    return q && /^[a-z0-9-]{1,100}$/.test(q) ? q : "";
  }
  function odkazClanku(c) { return PEKNE ? ROOT + "clanky/" + c.slug : ROOT + "?clanok=" + c.slug; }
  function fotoClanku(f, maly) {
    if (!f) return "";
    if (/^https:\/\//.test(f)) return f;
    return /^[a-z0-9-]{2,60}$/.test(f) ? "https://app.realitnytypek.sk/img/web/" + f + (maly ? "-m" : "") + ".webp" : "";
  }
  function idZAdresy() {
    if (clanokZAdresy()) return 0;
    var m = location.pathname.match(/\/(\d{1,10})(?:-[a-z0-9-]*)?\/?$/);
    if (m) return Number(m[1]);
    var q = new URLSearchParams(location.search).get("id");
    return q && /^\d{1,10}$/.test(q) ? Number(q) : 0;
  }
  function odkaz(p) { return PEKNE ? ROOT + p.id + "-" + (p.slug || "ponuka") : ROOT + "?id=" + p.id; }

  // ---------------------------------------------------------------- údaje ponuky na zobrazenie
  function fotkaUrl(f) {
    if (!f) return "";
    if (typeof f === "string") return f;
    if (f.url && /^https:\/\//.test(f.url)) return f.url;
    return f.cesta ? SUPA + "/storage/v1/object/public/ponuky/" + String(f.cesta).split("/").map(encodeURIComponent).join("/") : "";
  }
  function fotky(p) { return (Array.isArray(p.fotky) ? p.fotky : []).map(fotkaUrl).filter(Boolean); }
  function nazov(p) { return (p.nazov || "").trim() || [p.typ || (KAT_M[p.kategoria] || [])[2] || "Nehnuteľnosť", p.obec].filter(Boolean).join(", "); }
  function lokalita(p) { return [p.cast_obce && p.cast_obce !== p.obec ? p.cast_obce : "", p.obec].filter(Boolean).join(", "); }
  function plocha(p) { return p.kategoria === "pozemky" ? (p.plocha_pozemku || null) : (p.plocha_uzitkova || p.plocha_pozemku || null); }
  function izby(p) {
    if (p.izby) return Number(p.izby);
    var t = String(p.typ || ""), m = t.match(/(\d)\s*-?\s*izb/);
    if (m) return Number(m[1]);
    if (/garsónka/i.test(t)) return 1;
    if (/5 a viac/.test(t)) return 5;
    return null;
  }
  function izbyText(n) { return n + " " + sklon(n, "izba", "izby", "izieb"); }
  function jeNova(p) { return p.vytvorene && Date.now() - Date.parse(p.vytvorene) < 7 * 864e5; }
  var PRIPONA = { "za m²": " / m²", "za mesiac": " / mesiac", "za mesiac + energie": " / mesiac + energie", "za rok": " / rok" };
  function cenaText(p) {
    if (p.cena == null || p.cena === "") return p.typ_ceny === "na vyžiadanie" ? "Cena na vyžiadanie" : "Cena dohodou";
    return eur(p.cena) + (PRIPONA[p.typ_ceny] || (p.typ_ceny === "dohodou" ? " · dohodou" : ""));
  }
  function cenaZaM2(p) {
    var pl = plocha(p);
    if (p.cena == null || !pl || (p.typ_ceny && p.typ_ceny !== "za nehnuteľnosť") || p.transakcia === "prenajom") return "";
    return eur(p.cena / pl) + "/m²";
  }
  function kratkaCena(p) {
    var c = Number(p.cena);
    if (p.cena == null || !c) return p.typ_ceny === "na vyžiadanie" ? "Na vyžiadanie" : "Dohodou";
    if (p.transakcia === "prenajom" || c < 10000) return nf.format(c) + " €";
    if (c >= 1e6) return nf1.format(c / 1e6) + " mil. €";
    return nf.format(Math.round(c / 1000)) + " tis. €";
  }
  function inicialy(meno) { return String(meno || "?").split(/\s+/).filter(function (x) { return x && !/\.$/.test(x); }).slice(0, 2).map(function (x) { return x.charAt(0); }).join("").toUpperCase() || "?"; }
  function avatar(m, velky) {
    var foto = m && m.foto && /^data:image\//.test(m.foto) ? m.foto : "";
    return '<span class="avatar' + (velky ? " v" : "") + '" aria-hidden="true">' + (foto ? '<img src="' + esc(foto) + '" alt="">' : esc(inicialy(m && (m.meno || m.meno_cele)))) + "</span>";
  }

  // ---------------------------------------------------------------- spojenie s databázou
  function rpc(fn, args) {
    return fetch(SUPA + "/rest/v1/rpc/" + fn, {
      method: "POST", headers: { apikey: KLUC, "Content-Type": "application/json" }, body: JSON.stringify(args || {}),
    }).then(function (r) {
      return r.text().then(function (t) {
        var d = null; try { d = t ? JSON.parse(t) : null; } catch (e) { d = null; }
        // naše správy z databázy sú po slovensky; technické chyby (napr. chýbajúca funkcia) nahradí zrozumiteľná veta
        if (!r.ok) throw new Error(d && d.message && ["22023", "54000", "42501", "P0001"].indexOf(d.code) >= 0 ? d.message : "Ponuky sa teraz nedajú načítať. Skúste to o chvíľu znova.");
        return d;
      });
    });
  }

  // ---------------------------------------------------------------- stav a filtre
  var S = { ponuky: [], makleri: {}, kancelarie: {}, detaily: {}, nacitane: false, chyba: "", vyber: [], obl: citaj("typek-oblubene", []), mapa: null, piny: {}, detail: null, zoznamY: 0 };
  var F0 = { t: "", k: "", q: "", cod: "", cdo: "", pod: "", izby: "", stav: "", vyb: [], d3: false, zor: "nove", pohlad: "zoznam", obl: false, m: "" };
  var F = Object.assign({}, F0);
  var ZORADENIE = [["nove", "Najnovšie"], ["lacne", "Najlacnejšie"], ["drahe", "Najdrahšie"], ["velke", "Najväčšie"]];
  var STAVY = [["novostavba", "Novostavba"], ["rekonstrukcia", "Po rekonštrukcii"], ["povodny", "Pôvodný stav"]];
  var VYBAVENIE = ["balkón", "lodžia", "terasa", "záhrada", "garáž", "parkovacie miesto", "výťah", "pivnica"];

  function citajFiltre() {
    var u = new URLSearchParams(location.search);
    F = Object.assign({}, F0);
    ["t", "k", "q", "cod", "cdo", "pod", "izby", "stav", "zor", "pohlad", "m"].forEach(function (k) { if (u.get(k)) F[k] = u.get(k).slice(0, 80); });
    if (!/^[0-9a-f-]{36}$/.test(F.m)) F.m = "";
    F.vyb = (u.get("vyb") || "").split(",").filter(function (v) { return VYBAVENIE.indexOf(v) >= 0; });
    F.d3 = u.get("d3") === "1"; F.obl = u.get("obl") === "1";
    if (["predaj", "prenajom"].indexOf(F.t) < 0) F.t = "";
    if (!KAT_M[F.k]) F.k = "";
    if (["zoznam", "mapa"].indexOf(F.pohlad) < 0) F.pohlad = "zoznam";
    if (!ZORADENIE.some(function (z) { return z[0] === F.zor; })) F.zor = "nove";
    ["cod", "cdo", "pod", "izby"].forEach(function (k) { if (!/^\d{1,9}$/.test(F[k])) F[k] = ""; });
  }
  function adresaZoznamu() {
    var u = new URLSearchParams();
    Object.keys(F0).forEach(function (k) {
      var v = F[k], d = F0[k];
      if (k === "vyb") { if (v.length) u.set(k, v.join(",")); return; }
      if (typeof d === "boolean") { if (v) u.set(k, "1"); return; }
      if (v !== d && v !== "") u.set(k, v);
    });
    if (document.documentElement.classList.contains("pohyb-vzdy")) u.set("pohyb", "1");
    var qs = u.toString();
    return ROOT + (qs ? "?" + qs : "");
  }
  function pocetFiltrov() {
    return ["cod", "cdo", "pod", "izby", "stav"].filter(function (k) { return F[k]; }).length + F.vyb.length + (F.d3 ? 1 : 0);
  }
  function vyhovuje(p, bezKategorie) {
    if (F.obl && S.obl.indexOf(p.id) < 0) return false;
    if (F.m && p.makler !== F.m) return false;
    if (F.t && p.transakcia !== F.t) return false;
    if (!bezKategorie && F.k && p.kategoria !== F.k) return false;
    if (F.q) {
      var n = norm(F.q);
      if (norm([p.obec, p.cast_obce, p.okres, p.nazov, p.typ].join(" ")).indexOf(n) < 0) return false;
    }
    var c = p.cena == null ? null : Number(p.cena);
    if (F.cod && !(c >= Number(F.cod))) return false;
    if (F.cdo && !(c != null && c <= Number(F.cdo))) return false;
    if (F.pod && !(plocha(p) >= Number(F.pod))) return false;
    if (F.izby && !(izby(p) >= Number(F.izby))) return false;
    if (F.stav) {
      var s = String(p.stav_objektu || "");
      if (F.stav === "novostavba" && !/novostavba|výstavbe|developer/.test(s)) return false;
      if (F.stav === "rekonstrukcia" && !/rekonštrukcia/.test(s)) return false;
      if (F.stav === "povodny" && !/pôvodný|na rekonštrukciu/.test(s)) return false;
    }
    if (F.vyb.length && !F.vyb.every(function (v) { return (p.vybavenie || []).indexOf(v) >= 0; })) return false;
    if (F.d3 && !p.prehliadka) return false;
    return true;
  }
  function zorad(zoz) {
    var c = function (p) { return p.cena == null ? null : Number(p.cena); };
    var nove = function (a, b) { return String(b.vytvorene).localeCompare(String(a.vytvorene)) || b.id - a.id; };
    return zoz.slice().sort(function (a, b) {
      if (F.zor === "lacne" || F.zor === "drahe") {
        var x = c(a), y = c(b);
        if (x == null && y == null) return nove(a, b);
        if (x == null) return 1; if (y == null) return -1;
        return F.zor === "lacne" ? x - y : y - x;
      }
      if (F.zor === "velke") return (plocha(b) || 0) - (plocha(a) || 0) || nove(a, b);
      return nove(a, b);
    });
  }

  // ---------------------------------------------------------------- hľadanie v úvode
  function cenyDo() {
    return F.t === "prenajom" ? [300, 500, 700, 1000, 1500] : [50000, 80000, 100000, 150000, 200000, 300000, 500000];
  }
  function kresliHladanie() {
    var f = $("#hladanie"); if (!f) return;
    var zakl = S.ponuky.filter(function (p) { return !F.t || p.transakcia === F.t; });
    var pocty = {}; zakl.forEach(function (p) { pocty[p.kategoria] = (pocty[p.kategoria] || 0) + 1; });
    var kat = KAT.filter(function (k) { return pocty[k[0]] || ["byty", "domy", "pozemky"].indexOf(k[0]) >= 0 || F.k === k[0]; });
    var n = S.vyber.length;
    f.style.minHeight = "";
    f.innerHTML =
      '<div class="hl-rad">' +
        '<div class="seg" data-seg="t" role="group" aria-label="Kúpa alebo prenájom"><span class="jazdec"></span>' +
          [["", "Všetko"], ["predaj", "Kúpa"], ["prenajom", "Prenájom"]].map(function (x) { return '<button type="button" data-t="' + x[0] + '" aria-pressed="' + (F.t === x[0]) + '">' + x[1] + "</button>"; }).join("") +
        "</div>" +
        '<div class="kat" role="group" aria-label="Druh nehnuteľnosti">' +
          '<button type="button" data-k="" aria-pressed="' + (!F.k) + '">' + katIkona("domy") + "Všetko <small>" + zakl.length + "</small></button>" +
          kat.map(function (k) { return '<button type="button" data-k="' + k[0] + '" aria-pressed="' + (F.k === k[0]) + '">' + katIkona(k[0]) + k[1] + " <small>" + (pocty[k[0]] || 0) + "</small></button>"; }).join("") +
        "</div>" +
      "</div>" +
      '<div class="hl-rad">' +
        '<div class="hl-pole">' + IC.lupa + '<input class="hl-vstup" id="hl-q" type="search" enterkeyhint="search" autocomplete="off" placeholder="Obec, mestská časť alebo okres" aria-label="Obec, mestská časť alebo okres" aria-autocomplete="list" aria-controls="navrhy" value="' + esc(F.q) + '">' +
          '<div class="navrhy" id="navrhy" role="listbox" hidden></div></div>' +
        '<select class="hl-vyber" id="hl-cena" aria-label="Najvyššia cena"><option value="">Cena do: bez obmedzenia</option>' +
          cenyDo().map(function (c) { return '<option value="' + c + '"' + (String(c) === F.cdo ? " selected" : "") + ">do " + eur(c) + (F.t === "prenajom" ? " / mesiac" : "") + "</option>"; }).join("") +
          (F.cdo && cenyDo().indexOf(Number(F.cdo)) < 0 ? '<option value="' + esc(F.cdo) + '" selected>do ' + eur(F.cdo) + "</option>" : "") +
        "</select>" +
        '<button class="btn btn-zlate" type="submit"><span>Zobraziť <span class="cislo" id="hl-pocet">' + nf.format(n) + '</span> <span id="hl-slovo">' + sklon(n, "ponuku", "ponuky", "ponúk") + "</span></span></button>" +
      "</div>";
    posunJazdce(f);
  }
  var JAZDCE = {};
  function posunJazdce(koren) {
    $$(".seg", koren).forEach(function (s) {
      var a = $('[aria-pressed="true"]', s), j = $(".jazdec", s), kluc = s.dataset.seg || "";
      if (!j) return;
      if (!a) { j.style.opacity = "0"; return; }
      var w = a.offsetWidth, x = a.offsetLeft, st = JAZDCE[kluc];
      if (!w) return;
      if (st && !j.dataset.umiestneny) {
        // nový jazdec po prekreslení: najprv na starú polohu bez animácie, potom plynulo na novú
        j.style.transition = "none"; j.style.width = st.w + "px"; j.style.transform = "translateX(" + st.x + "px)";
        void j.offsetWidth; j.style.transition = "";
      }
      j.dataset.umiestneny = "1"; j.style.opacity = "";
      j.style.width = w + "px"; j.style.transform = "translateX(" + x + "px)";
      JAZDCE[kluc] = { w: w, x: x };
    });
  }
  function animujCislo(el, ciel) {
    if (!el) return;
    var od = Number(String(el.textContent).replace(/\D/g, "")) || 0;
    if (od === ciel || MALO_POHYBU) { el.textContent = nf.format(ciel); return; }
    var t0 = performance.now(), d = 450;
    (function krok(t) {
      var k = Math.min(1, (t - t0) / d), e = 1 - Math.pow(1 - k, 3);
      el.textContent = nf.format(Math.round(od + (ciel - od) * e));
      if (k < 1) requestAnimationFrame(krok);
    })(t0);
  }

  // návrhy obcí v hľadaní
  var navrhAkt = -1;
  function navrhyObci(q) {
    var n = norm(q), m = {};
    if (!n) return [];
    S.ponuky.forEach(function (p) {
      [[p.obec, "obec"], [p.cast_obce, "časť"], [p.okres ? "okres " + p.okres : "", "okres"]].forEach(function (x) {
        if (!x[0] || norm(x[0]).indexOf(n) < 0) return;
        var k = x[0]; m[k] = m[k] || { text: k, hodnota: x[1] === "okres" ? p.okres : k, n: 0 }; m[k].n++;
      });
    });
    return Object.keys(m).map(function (k) { return m[k]; }).sort(function (a, b) { return norm(a.text).indexOf(n) - norm(b.text).indexOf(n) || b.n - a.n; }).slice(0, 8);
  }
  function kresliNavrhy() {
    var box = $("#navrhy"), inp = $("#hl-q"); if (!box || !inp) return;
    var zoz = navrhyObci(inp.value);
    if (!zoz.length || document.activeElement !== inp) { box.hidden = true; inp.setAttribute("aria-expanded", "false"); return; }
    var n = norm(inp.value);
    box.innerHTML = zoz.map(function (x, i) {
      var t = esc(x.text), z = norm(x.text).indexOf(n);
      if (z >= 0) t = esc(x.text.slice(0, z)) + "<mark>" + esc(x.text.slice(z, z + inp.value.trim().length)) + "</mark>" + esc(x.text.slice(z + inp.value.trim().length));
      return '<button type="button" role="option" data-navrh="' + esc(x.hodnota) + '" class="' + (i === navrhAkt ? "akt" : "") + '"><span>' + t + "</span><small>" + pocetPonuk(x.n) + "</small></button>";
    }).join("");
    box.hidden = false; inp.setAttribute("aria-expanded", "true");
  }

  // ---------------------------------------------------------------- lišta nad výsledkami
  function kresliListu() {
    var el = $("#lista-in"), n = S.vyber.length, pf = pocetFiltrov();
    el.innerHTML = '<h2 id="ponuky-nadpis">' + (F.obl ? "Obľúbené" : "Ponuky") + " <small>" + (S.nacitane ? pocetPonuk(n) : "načítavam…") + "</small></h2>" +
      '<div class="seg svetly" data-seg="pohlad" role="group" aria-label="Zobrazenie"><span class="jazdec"></span>' +
        '<button type="button" data-pohlad="zoznam" aria-pressed="' + (F.pohlad === "zoznam") + '">Zoznam</button>' +
        '<button type="button" data-pohlad="mapa" aria-pressed="' + (F.pohlad === "mapa") + '">Mapa</button></div>' +
      '<select class="zoradit" id="zoradit" aria-label="Zoradiť">' + ZORADENIE.map(function (z) { return '<option value="' + z[0] + '"' + (F.zor === z[0] ? " selected" : "") + ">" + z[1] + "</option>"; }).join("") + "</select>" +
      '<button class="btn btn-filtre" type="button" data-akcia="filtre">' + IC.filtre + "Filtre" + (pf ? '<span class="tn-pocet">' + pf + "</span>" : "") + "</button>";
    posunJazdce(el);
    // čipy aktívnych filtrov
    var c = [];
    if (F.obl) c.push(["obl", "Len obľúbené"]);
    if (F.m) c.push(["m", "Maklér: " + ((S.makleri[F.m] || {}).meno || "vybraný")]);
    if (F.t) c.push(["t", F.t === "predaj" ? "Kúpa" : "Prenájom"]);
    if (F.k) c.push(["k", KAT_M[F.k][1]]);
    if (F.q) c.push(["q", "„" + F.q + "“"]);
    if (F.cod) c.push(["cod", "od " + eur(F.cod)]);
    if (F.cdo) c.push(["cdo", "do " + eur(F.cdo)]);
    if (F.pod) c.push(["pod", "od " + nf.format(F.pod) + " m²"]);
    if (F.izby) c.push(["izby", izbyText(Number(F.izby)) + " a viac"]);
    if (F.stav) c.push(["stav", (STAVY.filter(function (s) { return s[0] === F.stav; })[0] || ["", F.stav])[1]]);
    F.vyb.forEach(function (v) { c.push(["vyb:" + v, v.charAt(0).toUpperCase() + v.slice(1)]); });
    if (F.d3) c.push(["d3", "3D prehliadka"]);
    $("#cipy-filtrov").innerHTML = c.map(function (x) { return '<button type="button" class="cip-f" data-zrus="' + esc(x[0]) + '" aria-label="Zrušiť filter ' + esc(x[1]) + '">' + esc(x[1]) + "<span>" + IC.x + "</span></button>"; }).join("") +
      (c.length > 1 ? '<button type="button" class="cip-f cip-zrus" data-zrus="vsetko">Zrušiť všetko</button>' : "");
  }

  // ---------------------------------------------------------------- karty ponúk
  function odznaky(p) {
    return (jeNova(p) ? '<span class="odz odz-nove">Nové</span>' : "") +
      (p.stav === "rezervovane" ? '<span class="odz odz-rez">Rezervované</span>' : "") +
      (p.znizena ? '<span class="odz odz-ink">Znížená cena</span>' : "") +
      (p.exkluzivne ? '<span class="odz odz-svetle">Exkluzívne</span>' : "") +
      (p.prehliadka ? '<span class="odz odz-svetle">' + IC.kocka + "3D</span>" : "");
  }
  function parametre(p) {
    var x = [], pl = plocha(p), iz = izby(p);
    if (pl) x.push(IC.plocha + nf.format(pl) + " m²");
    if (iz && ["byty", "domy", "chaty"].indexOf(p.kategoria) >= 0) x.push(IC.izby + izbyText(iz));
    if (p.kategoria !== "pozemky" && p.plocha_pozemku && p.plocha_pozemku !== pl) x.push(IC.pozemok + "pozemok " + nf.format(p.plocha_pozemku) + " m²");
    return x.length ? '<div class="parametre">' + x.map(function (h) { return "<span>" + h + "</span>"; }).join("") + "</div>" : "";
  }
  function jeObl(id) { return S.obl.indexOf(id) >= 0; }
  function srdce(p) { return '<button type="button" class="srdce" data-obl="' + p.id + '" aria-pressed="' + jeObl(p.id) + '" aria-label="' + (jeObl(p.id) ? "Odobrať z obľúbených" : "Uložiť medzi obľúbené") + '">' + IC.srdce + "</button>"; }
  function karta(p, i) {
    var F_ = fotky(p), m = S.makleri[p.makler] || {}, k = S.kancelarie[p.kancelaria] || {}, m2 = cenaZaM2(p);
    var foto = F_.length
      ? '<div class="pas" data-pas>' + F_.map(function (u, j) { return '<img src="' + esc(u) + '" alt="' + (j ? "" : esc(nazov(p))) + '" loading="lazy" decoding="async" draggable="false">'; }).join("") + "</div>" +
        (F_.length > 1 ? '<button type="button" class="sipka l" data-listuj="-1" aria-label="Predchádzajúca fotka">' + IC.vlavo + '</button><button type="button" class="sipka p" data-listuj="1" aria-label="Ďalšia fotka">' + IC.vpravo + "</button>" +
          '<div class="bodky" aria-hidden="true">' + F_.map(function (_, j) { return '<i class="' + (j ? "" : "on") + '"></i>'; }).join("") + "</div>" : "") +
        (p.pocet_fotiek > 1 ? '<span class="pocet-fotiek">' + IC.foto + p.pocet_fotiek + "</span>" : "")
      : '<div class="bez-foto"><img src="../typek.png" alt="" loading="lazy"></div>';
    return '<article class="karta nastup" data-id="' + p.id + '" style="--rd:' + Math.min(i, 8) * 60 + 'ms">' +
      '<div class="karta-foto">' + foto + '<div class="odznaky">' + odznaky(p) + "</div>" + srdce(p) + "</div>" +
      '<div class="karta-telo">' +
        '<div class="karta-cena"><b>' + esc(cenaText(p)) + "</b>" + (m2 ? "<small>" + esc(m2) + "</small>" : "") + "</div>" +
        '<h3><a href="' + esc(odkaz(p)) + '" data-ponuka="' + p.id + '">' + esc(nazov(p)) + "</a></h3>" +
        (lokalita(p) ? '<div class="karta-lok">' + IC.pin + esc(lokalita(p)) + "</div>" : "") +
        parametre(p) +
        '<div class="karta-pata">' + avatar(m) + "<span><b>" + esc(m.meno || "Maklér") + "</b>" + esc(k.nazov || "Realitná kancelária") + "</span></div>" +
      "</div></article>";
  }
  function kostry(n) {
    var h = ""; for (var i = 0; i < n; i++) h += '<div class="kostra" aria-hidden="true"><i class="f"></i><i class="r c"></i><i class="r"></i><i class="r k"></i></div>';
    return h;
  }
  function kresliKarty() {
    var g = $("#mriezka");
    g.setAttribute("aria-busy", S.nacitane ? "false" : "true");
    if (!S.nacitane) { g.innerHTML = S.chyba ? prazdne("Ponuky sa nepodarilo načítať", S.chyba, '<button class="btn btn-ink" type="button" data-akcia="znova">Skúsiť znova</button>') : kostry(6); return; }
    if (!S.vyber.length) {
      if (F.obl && !S.obl.length) g.innerHTML = prazdne("Zatiaľ nemáte obľúbené ponuky", "Ťuknite na srdiečko pri ponuke a uložíte si ju sem. Zostane uložená v tomto prehliadači.", '<button class="btn btn-ink" type="button" data-zrus="obl">Zobraziť všetky ponuky</button>');
      else if (!S.ponuky.length) g.innerHTML = prazdne("Ponuky práve pribúdajú", "Makléri a kancelárie sem pridávajú svoje ponuky. Pozrite sa sem znova o pár dní.", "");
      else g.innerHTML = prazdne("Takú ponuku zatiaľ nemáme", "Skúste zmeniť alebo zrušiť niektorý filter.", '<button class="btn btn-ink" type="button" data-zrus="vsetko">Zrušiť filtre</button>');
      return;
    }
    g.innerHTML = S.vyber.map(karta).join("");
  }
  function prazdne(nadpis, text, tl) {
    return '<div class="prazdne"><img src="../typek.png" alt="" width="150" height="170"><h3>' + esc(nadpis) + "</h3><p>" + esc(text) + "</p>" + (tl || "") + "</div>";
  }

  // listovanie fotiek v karte
  function aktualizujBodky(pas) {
    var b = $$(".bodky i", pas.parentNode); if (!b.length) return;
    var i = Math.round(pas.scrollLeft / Math.max(1, pas.clientWidth));
    b.forEach(function (x, j) { x.classList.toggle("on", j === i); });
  }
  document.addEventListener("scroll", function (e) {
    var t = e.target;
    if (t && t.matches && t.matches("[data-pas]")) aktualizujBodky(t);
  }, true);

  // ---------------------------------------------------------------- celý zoznam
  function prepocitaj(bezHladania) {
    S.vyber = zorad(S.ponuky.filter(function (p) { return vyhovuje(p); }));
    if (!bezHladania) kresliHladanie();
    else {
      animujCislo($("#hl-pocet"), S.vyber.length);
      var sl = $("#hl-slovo"); if (sl) sl.textContent = sklon(S.vyber.length, "ponuku", "ponuky", "ponúk");
    }
    kresliListu();
    kresliKarty();
    var split = $("#split"), mo = $("#mapa-obal");
    split.classList.toggle("s-mapou", F.pohlad === "mapa");
    mo.hidden = F.pohlad !== "mapa";
    if (F.pohlad === "mapa") kresliMapu();
    $$('.tn-nav [data-nav="mapa"]').forEach(function (a) { a.setAttribute("aria-current", String(F.pohlad === "mapa" && !S.detail)); });
    $$('.tn-nav [data-akcia="oblubene"]').forEach(function (a) { a.setAttribute("aria-pressed", String(F.obl)); });
    if (!S.detail) history.replaceState(history.state, "", adresaZoznamu() + (location.hash || ""));
  }
  var prepocitajNeskor = (function () { var t; return function (bh) { clearTimeout(t); t = setTimeout(function () { prepocitaj(bh); }, 140); }; })();

  function nacitajPonuky() {
    if (S.nacitanie) return S.nacitanie;
    S.chyba = "";
    S.nacitanie = rpc("portal_ponuky").then(function (d) {
      d = d || {};
      S.ponuky = Array.isArray(d.ponuky) ? d.ponuky : [];
      S.makleri = d.makleri || {}; S.kancelarie = d.kancelarie || {};
      S.nacitane = true;
      // obľúbené, ktoré už nie sú v ponuke, sa ticho upracú
      var ids = S.ponuky.map(function (p) { return p.id; });
      S.obl = S.obl.filter(function (id) { return ids.indexOf(id) >= 0; }); uloz("typek-oblubene", S.obl); kresliPocetObl();
    }, function (e) { S.chyba = e.message; S.nacitanie = null; throw e; });
    return S.nacitanie;
  }

  // ---------------------------------------------------------------- mapa (Leaflet z cdnjs, rovnako ako v aplikácii)
  var leafletP = null;
  function nacitajLeaflet() {
    if (window.L) return Promise.resolve();
    if (leafletP) return leafletP;
    leafletP = new Promise(function (ok, chyba) {
      var c = document.createElement("link"); c.rel = "stylesheet"; c.href = LEAFLET + "leaflet.min.css"; document.head.appendChild(c);
      var s = document.createElement("script"); s.src = LEAFLET + "leaflet.min.js"; s.onload = ok; s.onerror = function () { leafletP = null; chyba(new Error("Mapu sa nepodarilo načítať.")); };
      document.head.appendChild(s);
    });
    return leafletP;
  }
  function kresliMapu() {
    nacitajLeaflet().then(function () {
      if (F.pohlad !== "mapa" || S.detail) return;
      if (!S.mapa) {
        S.mapa = L.map("mapa", { zoomControl: true, scrollWheelZoom: true, tap: false });
        L.tileLayer(OSM, { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(S.mapa);
        S.vrstva = L.layerGroup().addTo(S.mapa);
        S.mapa.on("click", function () { zavriMapovuKartu(); });
      }
      S.vrstva.clearLayers(); S.piny = {};
      var zoz = S.vyber.filter(function (p) { return p.lat != null && p.lon != null; });
      zoz.forEach(function (p) {
        var m = L.marker([p.lat, p.lon], {
          icon: L.divIcon({ className: "pin-obal", html: '<div class="pin' + (jeObl(p.id) ? " obl" : "") + '" data-pin="' + p.id + '" style="--kc:' + katFarba(p.kategoria) + '"><span class="pin-ic">' + katIkona(p.kategoria, 15) + "</span>" + esc(kratkaCena(p)) + "</div>", iconSize: null }),
          title: nazov(p), riseOnHover: true,
        });
        m.on("click", function (e) { if (e.originalEvent) L.DomEvent.stopPropagation(e.originalEvent); vyberNaMape(p.id); });
        m.addTo(S.vrstva); S.piny[p.id] = m;
      });
      setTimeout(function () {
        S.mapa.invalidateSize();
        if (zoz.length) S.mapa.fitBounds(L.latLngBounds(zoz.map(function (p) { return [p.lat, p.lon]; })).pad(0.2), { maxZoom: 14, animate: !MALO_POHYBU });
        else S.mapa.setView([48.72, 19.6], 7);
      }, 30);
      // legenda: druhy, ktoré sú práve na mape
      var druhy = {}; zoz.forEach(function (p) { if (KAT_M[p.kategoria]) druhy[p.kategoria] = 1; });
      var leg = $(".mapa-legenda", $("#mapa-obal"));
      if (!leg) { leg = document.createElement("div"); leg.className = "mapa-legenda"; leg.setAttribute("aria-hidden", "true"); $("#mapa-obal").appendChild(leg); }
      leg.innerHTML = KAT.filter(function (k) { return druhy[k[0]]; }).map(function (k) { return '<span><i style="--kc:' + katFarba(k[0]) + '">' + katIkona(k[0], 13) + "</i>" + esc(k[1]) + "</span>"; }).join("");
      var bez = S.vyber.length - zoz.length, info = $(".mapa-info", $("#mapa-obal"));
      if (!info) { info = document.createElement("div"); info.className = "mapa-info"; $("#mapa-obal").appendChild(info); }
      info.hidden = !bez;
      info.textContent = bez ? pocetPonuk(bez) + " bez polohy na mape" : "";
    }, function (e) { toast(e.message); });
  }
  function zvyrazniPin(id, zap) {
    var m = S.piny[id]; if (!m || !m.getElement()) return;
    var el = m.getElement(); el.classList.toggle("akt-z", zap);
    var p = $(".pin", el); if (p) p.classList.toggle("akt", zap);
  }
  function vyberNaMape(id) {
    var p = S.ponuky.filter(function (x) { return x.id === id; })[0]; if (!p) return;
    if (mobil()) {
      zavriMapovuKartu();
      var d = document.createElement("div"); d.className = "mapa-karta";
      d.innerHTML = karta(p, 0).replace("karta nastup", "karta") ;
      var x = document.createElement("button"); x.type = "button"; x.className = "zavriet"; x.setAttribute("aria-label", "Zavrieť"); x.innerHTML = IC.x;
      x.addEventListener("click", function (e) { e.stopPropagation(); zavriMapovuKartu(); });
      d.appendChild(x);
      $("#mapa-obal").appendChild(d);
      Object.keys(S.piny).forEach(function (k) { zvyrazniPin(Number(k), Number(k) === id); });
      return;
    }
    var f = fotky(p)[0];
    L.popup({ offset: [0, -36], closeButton: true, autoPanPadding: [30, 30], maxWidth: 260 })
      .setLatLng([p.lat, p.lon])
      .setContent('<a class="mp" href="' + esc(odkaz(p)) + '" data-ponuka="' + p.id + '">' + (f ? '<img src="' + esc(f) + '" alt="">' : '<span class="mp-bez"></span>') +
        "<div><b>" + esc(cenaText(p)) + "</b><span>" + esc(nazov(p)) + "</span><span>" + esc(lokalita(p)) + "</span></div></a>")
      .openOn(S.mapa);
    // Leaflet nepustí klik z okna ďalej – odkaz sa napojí priamo
    var okno = S.mapa._popup && S.mapa._popup.getElement && S.mapa._popup.getElement(), mp = okno && $(".mp", okno);
    if (mp) mp.addEventListener("click", function (e) {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
      e.preventDefault(); S.mapa.closePopup();
      chodNa(odkaz(p), function () { ukazDetail(p.id); });
    });
    var k = $('.karta[data-id="' + id + '"]', $("#mriezka"));
    if (k) { k.scrollIntoView({ behavior: MALO_POHYBU ? "auto" : "smooth", block: "nearest" }); k.classList.add("akt"); setTimeout(function () { k.classList.remove("akt"); }, 1400); }
  }
  function zavriMapovuKartu() {
    $$(".mapa-karta").forEach(function (x) { x.remove(); });
    Object.keys(S.piny).forEach(function (k) { zvyrazniPin(Number(k), false); });
  }

  // ---------------------------------------------------------------- panel filtrov
  function otvorFiltre() {
    zavriPanel();
    var z = document.createElement("div"); z.className = "zaclona"; z.dataset.panel = "1";
    var p = document.createElement("div"); p.className = "panel"; p.setAttribute("role", "dialog"); p.setAttribute("aria-modal", "true"); p.setAttribute("aria-labelledby", "panel-nadpis"); p.dataset.panel = "1";
    var volby = function (pole, zoz) {
      return '<div class="volby" data-volby="' + pole + '">' + zoz.map(function (x) { var on = pole === "vyb" ? F.vyb.indexOf(x[0]) >= 0 : F[pole] === x[0]; return '<button type="button" data-hodnota="' + esc(x[0]) + '" aria-pressed="' + on + '">' + esc(x[1]) + "</button>"; }).join("") + "</div>";
    };
    p.innerHTML = '<div class="panel-hlava"><h2 id="panel-nadpis">Filtre</h2><button type="button" class="x" data-akcia="zavriet" aria-label="Zavrieť">' + IC.x + "</button></div>" +
      '<div class="panel-telo">' +
        "<fieldset><legend>Zoradiť</legend>" + volby("zor", ZORADENIE) + "</fieldset>" +
        "<fieldset><legend>Ponuka</legend>" + volby("t", [["", "Všetko"], ["predaj", "Kúpa"], ["prenajom", "Prenájom"]]) + "</fieldset>" +
        "<fieldset><legend>Druh</legend>" + volby("k", [["", "Všetko"]].concat(KAT.map(function (k) { return [k[0], k[1]]; }))) + "</fieldset>" +
        '<fieldset><legend>Cena</legend><div class="od-do"><label>Od (€)<input class="vstup" inputmode="numeric" data-pole="cod" value="' + esc(F.cod) + '" placeholder="0"></label><label>Do (€)<input class="vstup" inputmode="numeric" data-pole="cdo" value="' + esc(F.cdo) + '" placeholder="bez obmedzenia"></label></div></fieldset>' +
        '<fieldset><legend>Plocha</legend><div class="od-do"><label>Aspoň (m²)<input class="vstup" inputmode="numeric" data-pole="pod" value="' + esc(F.pod) + '" placeholder="0"></label></div></fieldset>' +
        "<fieldset><legend>Počet izieb</legend>" + volby("izby", [["", "Hocikoľko"], ["1", "1+"], ["2", "2+"], ["3", "3+"], ["4", "4+"], ["5", "5+"]]) + "</fieldset>" +
        "<fieldset><legend>Stav</legend>" + volby("stav", [["", "Hocijaký"]].concat(STAVY)) + "</fieldset>" +
        "<fieldset><legend>Vybavenie</legend>" + volby("vyb", VYBAVENIE.map(function (v) { return [v, v.charAt(0).toUpperCase() + v.slice(1)]; })) + "</fieldset>" +
        '<fieldset><legend>Ďalšie</legend><label class="prepinac-r">Len s 3D prehliadkou<input type="checkbox" class="prepinac" data-pole="d3"' + (F.d3 ? " checked" : "") + "></label></fieldset>" +
      "</div>" +
      '<div class="panel-pata"><button type="button" class="btn btn-jemne" data-akcia="zrusit-filtre">Zrušiť všetko</button><button type="button" class="btn btn-zlate" data-akcia="zavriet"><span>Zobraziť <span class="cislo" id="panel-pocet">' + nf.format(S.vyber.length) + "</span></span></button></div>";
    document.body.appendChild(z); document.body.appendChild(p);
    document.body.style.overflow = "hidden";
    S.panelFokus = document.activeElement;
    setTimeout(function () { var x = $(".x", p); if (x) x.focus(); }, 30);
  }
  function zavriPanel() {
    var bol = $$("[data-panel]").length;
    $$("[data-panel]").forEach(function (x) { x.remove(); });
    document.body.style.overflow = "";
    if (bol && S.panelFokus && S.panelFokus.focus) S.panelFokus.focus();
  }
  function aktualizujPanel() {
    var p = $(".panel"); if (!p) return;
    $$("[data-volby]", p).forEach(function (v) {
      var pole = v.dataset.volby;
      $$("button", v).forEach(function (b) { b.setAttribute("aria-pressed", String(pole === "vyb" ? F.vyb.indexOf(b.dataset.hodnota) >= 0 : F[pole] === b.dataset.hodnota)); });
    });
    animujCislo($("#panel-pocet"), S.vyber.length);
  }

  // ---------------------------------------------------------------- obľúbené
  function kresliPocetObl() {
    var el = $("#pocet-obl"); if (!el) return;
    var n = S.obl.length, bolo = el.textContent;
    el.hidden = !n; el.textContent = n;
    if (String(n) !== bolo && n) { el.classList.remove("pop"); void el.offsetWidth; el.classList.add("pop"); }
  }
  function prepniObl(id, btn) {
    var i = S.obl.indexOf(id);
    if (i >= 0) S.obl.splice(i, 1); else S.obl.unshift(id);
    S.obl = S.obl.slice(0, 200);
    uloz("typek-oblubene", S.obl);
    var on = i < 0;
    $$('[data-obl="' + id + '"]').forEach(function (b) {
      b.setAttribute("aria-pressed", String(on));
      if (b.classList.contains("srdce")) b.setAttribute("aria-label", on ? "Odobrať z obľúbených" : "Uložiť medzi obľúbené");
      var t = $(".t-obl", b); if (t) t.textContent = on ? "Uložené" : "Uložiť";
    });
    if (btn) { btn.classList.remove("buch"); void btn.offsetWidth; btn.classList.add("buch"); }
    var pin = S.piny[id] && S.piny[id].getElement() && $(".pin", S.piny[id].getElement()); if (pin) pin.classList.toggle("obl", on);
    kresliPocetObl();
    toast(on ? "Uložené medzi obľúbené" : "Odobrané z obľúbených");
    if (F.obl && !S.detail) prepocitaj(true);
  }

  // ---------------------------------------------------------------- toast
  var toastT;
  function toast(t) {
    var el = $("#toast"); el.textContent = t; el.classList.add("on");
    clearTimeout(toastT); toastT = setTimeout(function () { el.classList.remove("on"); }, 2400);
  }

  // ================================================================ DETAIL PONUKY
  var P = null, galeriaI = 0;
  var POLIA = [
    ["plocha_uzitkova", "Úžitková plocha", "m2"], ["plocha_zastavana", "Zastavaná plocha", "m2"], ["plocha_pozemku", "Plocha pozemku", "m2"],
    ["izby", "Počet izieb", ""], ["poschodie", "Poschodie", "posch"], ["pocet_podlazi", "Počet podlaží", ""], ["rok_vystavby", "Rok výstavby", "rok"],
    ["vlastnictvo", "Vlastníctvo", ""], ["stav_objektu", "Stav", ""], ["konstrukcia", "Konštrukcia", ""], ["energ_certifikat", "Energetický certifikát", ""],
    ["kurenie", "Kúrenie", ""], ["orientacia", "Orientácia", "pole"], ["cena_energie", "Energie", ""], ["cislo", "Číslo ponuky", ""],
  ];
  function hodnotaPola(p, d) {
    var v = p[d[0]];
    if (v == null || v === "" || (Array.isArray(v) && !v.length)) return "";
    if (d[2] === "m2") return nf.format(v) + " m²";
    if (d[2] === "posch") return Number(v) === 0 ? "prízemie" : v + ". poschodie" + (p.pocet_podlazi ? " z " + p.pocet_podlazi : "");
    if (d[2] === "rok") return String(v);
    if (d[2] === "pole") return v.join(", ");
    return String(v);
  }
  function fakty(p) {
    var x = [], pl = plocha(p), iz = izby(p);
    if (pl) x.push([IC.plocha, p.kategoria === "pozemky" ? "Pozemok" : "Plocha", nf.format(pl) + " m²"]);
    if (iz && ["byty", "domy", "chaty"].indexOf(p.kategoria) >= 0) x.push([IC.izby, "Izby", String(iz)]);
    if (p.kategoria !== "pozemky" && p.plocha_pozemku && p.plocha_pozemku !== pl) x.push([IC.pozemok, "Pozemok", nf.format(p.plocha_pozemku) + " m²"]);
    if (p.poschodie != null && p.kategoria === "byty") x.push([IC.schody, "Poschodie", Number(p.poschodie) === 0 ? "prízemie" : p.poschodie + (p.pocet_podlazi ? " z " + p.pocet_podlazi : "")]);
    if (p.stav_objektu) x.push([IC.stav, "Stav", p.stav_objektu]);
    if (p.rok_vystavby) x.push([IC.rok, "Rok výstavby", String(p.rok_vystavby)]);
    return x.length ? '<div class="fakty">' + x.map(function (f, i) { return '<div class="fakt" data-rv style="--rd:' + i * 70 + 'ms"><span class="ic">' + f[0] + "</span><span><small>" + esc(f[1]) + "</small><b>" + esc(f[2]) + "</b></span></div>"; }).join("") + "</div>" : "";
  }
  function galeria(F_) {
    if (!F_.length) return '<div class="galeria g0"><img src="../typek.png" alt=""></div>';
    var n = Math.min(F_.length, 5), trieda = n < 5 ? " g" + n : "";
    return '<div class="galeria' + trieda + '">' + F_.slice(0, n).map(function (u, i) {
      return '<button type="button" data-foto="' + i + '" aria-label="Otvoriť fotku ' + (i + 1) + " z " + F_.length + '"><img src="' + esc(u) + '" alt="" ' + (i ? 'loading="lazy"' : 'fetchpriority="high"') + ' decoding="async">' +
        (i === n - 1 && F_.length > n ? '<span class="viac">+ ďalších ' + (F_.length - n) + " " + sklon(F_.length - n, "fotka", "fotky", "fotiek") + "</span>" : "") + "</button>";
    }).join("") + "</div>" +
    '<div class="galeria-m"><div class="pas" data-pas-d>' + F_.map(function (u, i) { return '<img src="' + esc(u) + '" alt="" data-foto="' + i + '"' + (i ? ' loading="lazy"' : "") + ' decoding="async">'; }).join("") + "</div>" +
      '<span class="pocitadlo" id="pocitadlo">1 / ' + F_.length + "</span></div>";
  }
  function kresliDetail() {
    var el = $("#detail"), p = P, F_ = fotky(p), m = p.makler || {}, k = p.kanc || {}, m2 = cenaZaM2(p);
    var meno = m.meno_cele || m.meno || "Maklér", kn = k.nazov || "Realitná kancelária";
    var par = POLIA.map(function (d) { return [d[1], hodnotaPola(p, d)]; }).filter(function (x) { return x[1]; });
    var tel = String(m.telefon || "").trim(), mail = String(m.email || "").trim();
    var vp = /^https?:\/\//.test(p.virtualna_prehliadka || "") ? p.virtualna_prehliadka : "", vid = /^https?:\/\//.test(p.video || "") ? p.video : "";
    var kat = KAT_M[p.kategoria];
    var h = '<div class="detail"><div class="obal">' +
      '<div class="omrvinky"><a class="spat" href="' + esc(S.zoznamUrl || ROOT) + '" data-akcia="spat">' + IC.vlavo + "Späť na ponuky</a>" +
        "<span>" + (kat ? esc(kat[1]) : "Ponuky") + (p.obec ? " · " + esc(p.obec) : "") + "</span></div>" +
      galeria(F_) +
      '<div class="d-grid"><div>' +
        '<div class="d-hlava"><div class="odznaky">' + odznaky(Object.assign({}, p, { prehliadka: !!vp })) + "</div>" +
          "<h1>" + esc(nazov(p)) + "</h1>" +
          (lokalita(p) || p.okres ? '<div class="d-lok">' + IC.pin + esc([p.ulica, lokalita(p)].filter(Boolean).join(", ")) + (p.okres ? " · okres " + esc(p.okres) : "") + "</div>" : "") +
          '<div class="d-cena" id="d-cena"><b>' + esc(cenaText(p)) + "</b>" + (m2 ? "<small>" + esc(m2) + "</small>" : "") + "</div>" +
          (p.text_k_cene ? '<div class="d-text-cena">' + esc(p.text_k_cene) + "</div>" : "") +
        "</div>" +
        fakty(p) +
        (p.intro || p.popis ? '<section class="d-blok" data-rv><h2>Popis</h2>' + (p.intro ? '<p class="d-intro">' + esc(p.intro) + "</p>" : "") +
          (p.popis ? '<div class="d-popis' + (p.popis.length > 700 ? " zbal" : "") + '" id="d-popis">' + esc(p.popis) + "</div>" +
            (p.popis.length > 700 ? '<button type="button" class="btn btn-jemne btn-male citaj" data-akcia="citaj">Čítať celý popis</button>' : "") : "") + "</section>" : "") +
        (vp || vid ? '<section class="d-blok" data-rv><h2>Prehliadka</h2><div class="media-tl">' +
          (vp ? '<a class="btn btn-ink" href="' + esc(vp) + '" target="_blank" rel="noopener">' + IC.kocka + "3D prehliadka</a>" : "") +
          (vid ? '<a class="btn btn-obrys" href="' + esc(vid) + '" target="_blank" rel="noopener">' + IC.video + "Video</a>" : "") + "</div></section>" : "") +
        (par.length ? '<section class="d-blok" data-rv><h2>Parametre</h2><dl class="tab-par">' + par.map(function (x) { return "<div><dt>" + esc(x[0]) + "</dt><dd>" + esc(x[1]) + "</dd></div>"; }).join("") + "</dl></section>" : "") +
        ((p.vybavenie || []).length ? '<section class="d-blok" data-rv><h2>Vybavenie</h2><div class="vybavenie">' + p.vybavenie.map(function (v) { return "<span>" + IC.ok + esc(v) + "</span>"; }).join("") + "</div></section>" : "") +
        (p.lat != null && p.lon != null ? '<section class="d-blok" data-rv><h2>Poloha</h2><div class="d-mapa"><div id="d-mapa" class="mapa-svetla"></div></div><p class="pozn">Poloha na mape je orientačná. Presnú adresu vám povie maklér.</p></section>' : "") +
      "</div>" +
      '<aside class="bok" aria-label="Maklér a kontakt">' +
        '<div class="makler"><div class="makler-hl">' + avatar(m, true) + "<span><small>Ponuku má na starosti</small><b>" + esc(meno) + "</b></span></div>" +
          '<div class="kanc-logo">' + (k.logo && /^https:\/\//.test(k.logo) ? '<img src="' + esc(k.logo) + '" alt="' + esc(kn) + '">' : "") + "<span><b>" + esc(kn) + "</b>" + (k.web && /^https?:\/\//.test(k.web) ? ' · <a href="' + esc(k.web) + '" target="_blank" rel="noopener">web kancelárie</a>' : "") + "</span></div>" +
          '<div class="makler-akcie">' +
            (tel ? '<button type="button" class="btn btn-ink" data-akcia="telefon" data-tel="' + esc(tel) + '">' + IC.tel + "Zobraziť telefón</button>" : "") +
            (mail ? '<a class="btn btn-obrys" href="mailto:' + esc(mail) + "?subject=" + encodeURIComponent("Ponuka: " + nazov(p)) + '">' + IC.mail + "E-mail</a>" : "") +
          "</div>" +
          '<div class="zdielat-r" style="margin-top:8px"><button type="button" class="btn btn-jemne btn-male" data-obl="' + p.id + '" aria-pressed="' + jeObl(p.id) + '">' + IC.srdce + '<span class="t-obl">' + (jeObl(p.id) ? "Uložené" : "Uložiť") + '</span></button><button type="button" class="btn btn-jemne btn-male" data-akcia="zdielat">' + IC.zdielat + "Zdieľať</button></div>" +
        "</div>" +
        '<div class="zaujem" id="zaujem">' + formular() + "</div>" +
      "</aside></div>" +
      '<section class="podobne" id="podobne" hidden></section>' +
      "</div></div>" +
      '<div class="d-lista" id="d-lista"><div><small>' + esc(kat ? kat[2] : "Ponuka") + "</small><b>" + esc(cenaText(p)) + "</b></div>" +
        (tel ? '<a class="tel" href="tel:' + esc(tel.replace(/[^\d+]/g, "")) + '" aria-label="Zavolať maklérovi">' + IC.tel + "</a>" : "") +
        '<a class="btn btn-zlate" href="#zaujem" data-akcia="k-formularu">Mám záujem</a></div>';
    el.innerHTML = h;
    napojDetail();
  }

  // formulár záujmu → portal_kontakt (dopyt príde maklérovi do Týpka)
  var Z = { zdroj: "obhliadka", posiela: false, chyba: "", hotovo: false, v: {} };
  var ZDROJE = [["obhliadka", "Obhliadka"], ["kontakt", "Otázka"], ["callback", "Zavolajte mi"]];
  function formular() {
    var m = (P.makler || {}), meno = (m.meno || "maklér").split(" ")[0];
    if (Z.hotovo) {
      return '<div class="hotovo" role="status"><svg width="64" height="64" viewBox="0 0 64 64" fill="none" aria-hidden="true"><circle cx="32" cy="32" r="25" stroke="#DB9522" stroke-width="4"/><path d="M21 33l7.5 7.5L43 25" stroke="#F7F2E8" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
        "<h3>Správa je odoslaná</h3><p>" + esc(m.meno_cele || m.meno || "Maklér") + " ju už má v Týpkovi a ozve sa vám čo najskôr.</p>" +
        '<button type="button" class="btn btn-jemne btn-male" data-akcia="dalsia-sprava">Napísať ďalšiu správu</button></div>';
    }
    var cb = Z.zdroj === "callback", v = Z.v;
    var plac = { obhliadka: "Kedy sa vám obhliadka hodí? (nepovinné)", kontakt: "Na čo sa chcete opýtať?", callback: "Kedy vám môžeme zavolať? (nepovinné)" }[Z.zdroj];
    var tl = { obhliadka: "Chcem obhliadku", kontakt: "Odoslať otázku", callback: "Zavolajte mi" }[Z.zdroj];
    return '<h2>Máte záujem?</h2>' +
      '<div class="seg" data-seg="zdroj" role="group" aria-label="Čo potrebujete"><span class="jazdec"></span>' + ZDROJE.map(function (z) { return '<button type="button" data-zdroj="' + z[0] + '" aria-pressed="' + (Z.zdroj === z[0]) + '">' + z[1] + "</button>"; }).join("") + "</div>" +
      '<form class="form" id="form-zaujem" novalidate>' +
        '<label>Meno<input name="meno" autocomplete="name" maxlength="80" value="' + esc(v.meno || "") + '"></label>' +
        "<label>" + (cb ? "Telefón" : "Telefón alebo e-mail") + '<input name="kontakt" maxlength="120" required ' + (cb ? 'type="tel" inputmode="tel" autocomplete="tel"' : 'type="text" autocomplete="tel"') + ' value="' + esc(v.kontakt || "") + '"></label>' +
        '<label>Správa<textarea name="co" rows="3" maxlength="1500" placeholder="' + esc(plac) + '">' + esc(v.co || "") + "</textarea></label>" +
        '<input class="med" name="web" tabindex="-1" autocomplete="off" aria-hidden="true">' +
        (Z.chyba ? '<p class="chyba" role="alert">' + esc(Z.chyba) + "</p>" : "") +
        '<button class="btn btn-zlate" type="submit"' + (Z.posiela ? " disabled" : "") + ">" + (Z.posiela ? '<span class="toci" aria-hidden="true"></span>Odosielam…' : tl) + "</button>" +
        '<p class="form-pozn">Správu dostane ' + esc(meno === "maklér" ? "maklér" : meno) + " z kancelárie " + esc((P.kanc || {}).nazov || "") + ". Vaše údaje použije iba na to, aby sa vám ozval.</p>" +
      "</form>";
  }
  function kresliFormular(fokus) {
    var box = $("#zaujem"); if (!box) return;
    box.innerHTML = formular(); posunJazdce(box);
    var f = $("#form-zaujem");
    if (f) f.addEventListener("focusin", function () { overenie("ponuka-" + P.id, Z.zdroj); }, { once: true });
    if (fokus) { var x = $('[name="' + fokus + '"]', box); if (x) x.focus(); }
  }
  function odosliFormular(f) {
    var kontakt = f.kontakt.value.trim(), meno = f.meno.value.trim(), co = f.co.value.trim(), med = f.web.value, zdroj = Z.zdroj;
    Z.v = { meno: meno, kontakt: kontakt, co: co };
    if (kontakt.length < 5) { Z.chyba = zdroj === "callback" ? "Napíšte telefónne číslo." : "Napíšte telefón alebo e-mail, aby sa vám maklér mohol ozvať."; kresliFormular("kontakt"); return; }
    if (zdroj === "callback" && kontakt.indexOf("@") >= 0) { Z.chyba = "Na zavolanie napíšte telefónne číslo."; kresliFormular("kontakt"); return; }
    if (zdroj === "kontakt" && !co) { Z.chyba = "Napíšte, na čo sa chcete opýtať."; kresliFormular("co"); return; }
    Z.chyba = ""; Z.posiela = true; kresliFormular();
    overenie("ponuka-" + P.id, zdroj).then(function (ov) {
      delete POW[zdroj];
      return rpc("portal_kontakt", { p_id: P.id, p_zdroj: zdroj, p_kontakt: kontakt, p_meno: meno || null, p_co: co || null, p_overenie: { ts: ov.ts, n: ov.n, med: med } });
    }).then(function () {
      Z.posiela = false; Z.hotovo = true; Z.v = {}; kresliFormular();
    }, function (e) {
      Z.posiela = false; Z.chyba = e.message; kresliFormular();
    });
  }

  // ochrana formulára proti robotom (rovnaká ako na stránke ponuky): SHA-256 z „typek1|adresa|formulár|čas|číslo“ začína štyrmi nulami
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

  function napojDetail() {
    posunJazdce($("#detail"));
    var f = $("#form-zaujem");
    if (f) f.addEventListener("focusin", function () { overenie("ponuka-" + P.id, Z.zdroj); }, { once: true });
    var pas = $("[data-pas-d]");
    if (pas) pas.addEventListener("scroll", function () {
      var i = Math.round(pas.scrollLeft / Math.max(1, pas.clientWidth)), c = $("#pocitadlo");
      if (c) c.textContent = (i + 1) + " / " + fotky(P).length;
    }, { passive: true });
    // mapa polohy
    if (P.lat != null && P.lon != null) {
      nacitajLeaflet().then(function () {
        var el = $("#d-mapa"); if (!el || !P) return;
        var m = L.map(el, { scrollWheelZoom: false, dragging: !L.Browser.mobile, tap: false }).setView([P.lat, P.lon], 15);
        L.tileLayer(OSM, { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(m);
        L.marker([P.lat, P.lon], { icon: L.divIcon({ className: "pin-obal", html: '<div class="pin-d" style="--kc:' + katFarba(P.kategoria) + '">' + katIkona(P.kategoria, 22) + "</div>", iconSize: null }), keyboard: false }).addTo(m);
        S.dMapa = m;
      }, function () { /* mapa sa nenačítala – zvyšok stránky funguje */ });
    }
    // spodná lišta na mobile: ukáže sa, keď cena zmizne z obrazovky a formulár ešte nie je vidieť
    if ("IntersectionObserver" in window) {
      var lista = $("#d-lista"), cenaV = true, formV = false;
      var io = new IntersectionObserver(function (zaz) {
        zaz.forEach(function (z) { if (z.target.id === "d-cena") cenaV = z.isIntersecting; else formV = z.isIntersecting; });
        if (lista) lista.classList.toggle("on", !cenaV && !formV);
      });
      [$("#d-cena"), $("#zaujem")].forEach(function (x) { if (x) io.observe(x); });
      S.dIo = io;
    }
    odkryvaj($("#detail"));
    kresliPodobne();
  }
  function kresliPodobne() {
    var box = $("#podobne"); if (!box || !P) return;
    nacitajPonuky().then(function () {
      if (!P || !$("#podobne")) return;
      var c = Number(P.cena) || 0;
      var zoz = S.ponuky.filter(function (p) { return p.id !== P.id; }).map(function (p) {
        var s = (p.kategoria === P.kategoria ? 3 : 0) + (p.transakcia === P.transakcia ? 2 : 0) + (p.obec && p.obec === P.obec ? 1 : 0) +
          (c && p.cena && Math.abs(p.cena - c) / c < 0.3 ? 1 : 0);
        return { p: p, s: s };
      }).sort(function (a, b) { return b.s - a.s || String(b.p.vytvorene).localeCompare(String(a.p.vytvorene)); }).slice(0, 8).map(function (x) { return x.p; });
      if (!zoz.length) { box.hidden = true; return; }
      box.hidden = false;
      box.innerHTML = '<div class="podobne-hl"><h2>Mohlo by vás zaujať</h2><div class="kar-sipky"><button type="button" data-kar="-1" aria-label="Posunúť doľava">' + IC.vlavo + '</button><button type="button" data-kar="1" aria-label="Posunúť doprava">' + IC.vpravo + "</button></div></div>" +
        '<div class="karusel" id="karusel">' + zoz.map(karta).join("") + "</div>";
    }, function () { box.hidden = true; });
  }

  // galéria na celú obrazovku
  function otvorGaleriu(i) {
    var F_ = fotky(P); if (!F_.length) return;
    galeriaI = Math.max(0, Math.min(F_.length - 1, i));
    var lb = document.createElement("div"); lb.className = "lightbox"; lb.id = "lightbox"; lb.setAttribute("role", "dialog"); lb.setAttribute("aria-modal", "true"); lb.setAttribute("aria-label", "Fotky ponuky");
    lb.innerHTML = '<div class="lb-hore"><span id="lb-poc"></span><button type="button" class="x" data-akcia="lb-zavriet" aria-label="Zavrieť">' + IC.x + "</button></div>" +
      '<div class="lb-scena" id="lb-scena"><img id="lb-img" alt=""><button type="button" class="lb-sipka l" data-lb="-1" aria-label="Predchádzajúca">' + IC.vlavo + '</button><button type="button" class="lb-sipka p" data-lb="1" aria-label="Ďalšia">' + IC.vpravo + "</button></div>" +
      '<div class="lb-nahlady" id="lb-nahlady">' + F_.map(function (u, j) { return '<button type="button" data-lb-i="' + j + '" aria-label="Fotka ' + (j + 1) + '"><img src="' + esc(u) + '" alt="" loading="lazy"></button>'; }).join("") + "</div>";
    document.body.appendChild(lb); document.body.style.overflow = "hidden";
    S.lbFokus = document.activeElement;
    ukazFotku(galeriaI);
    $(".x", lb).focus();
    // potiahnutie prstom
    var sc = $("#lb-scena"), x0 = null;
    sc.addEventListener("pointerdown", function (e) { x0 = e.clientX; });
    sc.addEventListener("pointerup", function (e) { if (x0 == null) return; var d = e.clientX - x0; x0 = null; if (Math.abs(d) > 50) ukazFotku(galeriaI + (d < 0 ? 1 : -1)); });
  }
  function ukazFotku(i) {
    var F_ = fotky(P), n = F_.length; if (!n) return;
    galeriaI = (i + n) % n;
    var img = $("#lb-img"); if (!img) return;
    var nove = img.cloneNode(); nove.src = F_[galeriaI]; nove.alt = nazov(P) + " – fotka " + (galeriaI + 1); img.replaceWith(nove);
    $("#lb-poc").textContent = (galeriaI + 1) + " / " + n;
    $$("#lb-nahlady button").forEach(function (b, j) { b.setAttribute("aria-current", String(j === galeriaI)); if (j === galeriaI) b.scrollIntoView({ block: "nearest", inline: "center", behavior: MALO_POHYBU ? "auto" : "smooth" }); });
    [galeriaI + 1, galeriaI - 1].forEach(function (j) { var u = F_[(j + n) % n]; if (u) { var p = new Image(); p.src = u; } });
  }
  function zavriGaleriu() {
    var lb = $("#lightbox"); if (!lb) return;
    lb.remove(); document.body.style.overflow = "";
    if (S.lbFokus && S.lbFokus.focus) S.lbFokus.focus();
  }

  // ================================================================ VYHĽADAJ MAKLÉRA
  var MK = { zoznam: [], kancelarie: {}, q: "", nacitanie: null };
  function nacitajMaklerov() {
    if (MK.nacitanie) return MK.nacitanie;
    MK.nacitanie = rpc("portal_makleri").then(function (d) {
      MK.zoznam = (d && Array.isArray(d.makleri)) ? d.makleri : []; MK.kancelarie = (d && d.kancelarie) || {};
      kresliMaklerov();
    }, function () { MK.nacitanie = null; });
    return MK.nacitanie;
  }
  function kresliMaklerov() {
    var sek = $("#makleri"), g = $("#mk-mriezka"); if (!sek || !g) return;
    sek.hidden = !MK.zoznam.length;
    var q = norm(MK.q);
    var zoz = MK.zoznam.filter(function (m) { return !q || norm([m.meno, m.oblast, (MK.kancelarie[m.kancelaria] || {}).nazov].join(" ")).indexOf(q) >= 0; });
    if (!zoz.length) { g.innerHTML = '<div class="mk-nic">Takého makléra tu zatiaľ nemáme. Skúste iné meno, kanceláriu alebo oblasť.</div>'; return; }
    g.innerHTML = zoz.map(function (m, i) {
      var k = MK.kancelarie[m.kancelaria] || {}, foto = /^(data:image\/|https:\/\/)/.test(m.foto || "") ? m.foto : "";
      return '<article class="mk" data-rv style="--rd:' + Math.min(i, 6) * 70 + 'ms">' +
        '<div class="mk-hl"><span class="mk-foto">' + (foto ? '<img src="' + esc(foto) + '" alt="" loading="lazy">' : esc(inicialy(m.meno))) + "</span>" +
          "<span><b>" + esc(m.meno) + "</b><small>" + esc(k.nazov || "Realitná kancelária") + "</small></span></div>" +
        '<div class="mk-cipy">' + (m.ponuk ? "<span>" + IC.domcek + pocetPonuk(m.ponuk) + "</span>" : "") +
          (m.oblast ? "<span>" + IC.pin + esc(m.oblast) + "</span>" : "") +
          (m.roky ? "<span>" + m.roky + " " + sklon(m.roky, "rok", "roky", "rokov") + " v realitách</span>" : "") + "</div>" +
        '<div class="mk-akcie">' +
          (m.ponuk ? '<button type="button" class="btn btn-ink" data-mk-ponuky="' + esc(m.id) + '">Ponuky makléra</button>' : "") +
          (m.telefon ? '<button type="button" class="btn btn-obrys" data-akcia="telefon" data-tel="' + esc(m.telefon) + '">' + IC.tel + "Telefón</button>" : "") +
          (m.web ? '<a class="btn btn-jemne" href="' + esc(m.web) + '" target="_blank" rel="noopener">' + IC.web + "Web makléra</a>" : "") +
          (m.email && !m.telefon ? '<a class="btn btn-obrys" href="mailto:' + esc(m.email) + '">' + IC.mail + "E-mail</a>" : "") +
        "</div></article>";
    }).join("");
    odkryvaj(g);
  }

  // ================================================================ ČLÁNKY
  var CL = { zoznam: [], detaily: {}, vsetky: false, nacitanie: null };
  function nacitajClanky() {
    if (CL.nacitanie) return CL.nacitanie;
    CL.nacitanie = rpc("portal_clanky", { p_limit: 48 }).then(function (d) {
      CL.zoznam = Array.isArray(d) ? d : [];
      kresliClanky();
    }, function () { CL.nacitanie = null; });
    return CL.nacitanie;
  }
  function datumText(d) { var x = new Date(d); return isNaN(x) ? "" : x.toLocaleDateString("sk-SK", { day: "numeric", month: "long", year: "numeric" }); }
  function kartaClanku(c, i) {
    var f = fotoClanku(c.foto, true);
    return '<a class="cl" href="' + esc(odkazClanku(c)) + '" data-clanok="' + esc(c.slug) + '" data-rv style="--rd:' + Math.min(i, 5) * 80 + 'ms">' +
      '<span class="cl-foto">' + (f ? '<img src="' + esc(f) + '" alt="" loading="lazy">' : "") + "</span>" +
      '<span class="cl-telo"><small>' + esc(datumText(c.datum)) + "</small><h3>" + esc(c.nadpis) + "</h3>" + (c.perex ? "<p>" + esc(c.perex) + "</p>" : "") +
      '<span class="cl-dalej">Čítať ďalej ' + IC.sipka + "</span></span></a>";
  }
  function kresliClanky() {
    var sek = $("#clanky"), g = $("#cl-mriezka"); if (!sek || !g) return;
    sek.hidden = !CL.zoznam.length;
    var n = CL.vsetky ? CL.zoznam.length : 6;
    g.innerHTML = CL.zoznam.slice(0, n).map(kartaClanku).join("") +
      (CL.zoznam.length > n ? '<div class="cl-viac"><button type="button" class="btn btn-ink" data-akcia="vsetky-clanky">Všetky články (' + CL.zoznam.length + ")</button></div>" : "");
    odkryvaj(g);
  }
  // text článku: odseky oddelené prázdnym riadkom, „## “ = medzinadpis, riadky s „- “ = zoznam
  function textClanku(t) {
    return String(t || "").split(/\n{2,}/).map(function (blok) {
      blok = blok.trim(); if (!blok) return "";
      var r = blok.split("\n");
      if (/^## /.test(r[0])) return "<h2>" + esc(r[0].slice(3).trim()) + "</h2>" + (r.length > 1 ? textClanku(r.slice(1).join("\n")) : "");
      if (r.every(function (x) { return /^[-•] /.test(x.trim()); })) return "<ul>" + r.map(function (x) { return "<li>" + esc(x.trim().slice(2)) + "</li>"; }).join("") + "</ul>";
      return "<p>" + r.map(esc).join("<br>") + "</p>";
    }).join("");
  }
  function ukazClanok(slug) {
    if (!S.detail) { S.zoznamY = window.scrollY; S.zoznamUrl = $("#zoznam").hidden ? S.zoznamUrl : adresaZoznamu(); }
    odidZDetailu();
    S.detail = "c:" + slug;
    $("#zoznam").hidden = true;
    var el = $("#detail"); el.hidden = false;
    window.scrollTo(0, 0);
    var vlozene = $("#clanok-data"), data = null;
    if (vlozene) { try { data = JSON.parse(vlozene.textContent); } catch (e) { data = null; } vlozene.remove(); }
    if (data && data.slug === slug) return zobrazClanok(data);
    if (CL.detaily[slug]) return zobrazClanok(CL.detaily[slug]);
    el.innerHTML = '<div class="detail"><div class="obal"><div class="clanok"><div class="clanok-foto"></div>' + kostry(1) + "</div></div></div>";
    rpc("portal_clanok", { p_slug: slug }).then(function (c) {
      if (S.detail !== "c:" + slug) return;
      if (!c) {
        document.title = "Článok sa nenašiel · Týpkove nehnuteľnosti";
        el.innerHTML = '<div class="detail"><div class="obal">' + prazdne("Tento článok sa nenašiel", "Možno bol presunutý alebo zmazaný. Pozrite si ďalšie články.", '<a class="btn btn-ink" href="' + esc(ROOT) + '" data-nav="clanky">Všetky články</a>') + "</div></div>";
        return;
      }
      zobrazClanok(c);
    }, function (e) {
      if (S.detail !== "c:" + slug) return;
      el.innerHTML = '<div class="detail"><div class="obal">' + prazdne("Článok sa nepodarilo načítať", e.message, '<a class="btn btn-ink" href="' + esc(ROOT) + '" data-akcia="spat">Späť</a>') + "</div></div>";
    });
  }
  function zobrazClanok(c) {
    CL.detaily[c.slug] = c;
    document.title = c.nadpis + " · Týpkove nehnuteľnosti";
    var f = fotoClanku(c.foto);
    $("#detail").innerHTML = '<div class="detail"><div class="obal"><article class="clanok">' +
      '<div class="omrvinky"><a class="spat" href="' + esc(S.zoznamUrl || ROOT) + '" data-akcia="spat">' + IC.vlavo + "Späť</a><span>Články</span></div>" +
      (f ? '<div class="clanok-foto"><img src="' + esc(f) + '" alt="" fetchpriority="high"></div>' : "") +
      '<div class="clanok-meta"><span>' + esc(datumText(c.datum)) + "</span>" + (c.autor ? "<span>" + esc(c.autor) + "</span>" : "") + "</div>" +
      "<h1>" + esc(c.nadpis) + "</h1>" + (c.perex ? '<p class="clanok-perex">' + esc(c.perex) + "</p>" : "") +
      '<div class="clanok-text">' + textClanku(c.text) + "</div>" +
      '<div class="clanok-pata"><a class="btn btn-zlate" href="' + esc(ROOT) + '#ponuky" data-nav="ponuky">Pozrieť ponuky</a>' +
        '<button type="button" class="btn btn-jemne" data-akcia="zdielat">' + IC.zdielat + "Zdieľať</button></div>" +
      '</article><section class="podobne" id="dalsie-clanky" hidden></section></div></div>';
    nacitajClanky().then(function () {
      var box = $("#dalsie-clanky"); if (!box || S.detail !== "c:" + c.slug) return;
      var ine = CL.zoznam.filter(function (x) { return x.slug !== c.slug; }).slice(0, 3);
      if (!ine.length) return;
      box.hidden = false;
      box.innerHTML = '<div class="podobne-hl"><h2>Ďalšie články</h2></div><div class="cl-mriezka">' + ine.map(kartaClanku).join("") + "</div>";
      odkryvaj(box);
    });
  }

  // ================================================================ CHCEM BYŤ MAKLÉR
  var ZM = { posiela: false, chyba: "", hotovo: false, v: {} };
  var PRAX = [["zaciatok", "Začínam"], ["prax", "Mám prax v realitách"], ["kancelaria", "Mením kanceláriu"]];
  function formularMakler() {
    if (ZM.hotovo) {
      return '<div class="hotovo" role="status"><svg width="64" height="64" viewBox="0 0 64 64" fill="none" aria-hidden="true"><circle cx="32" cy="32" r="25" stroke="#DB9522" stroke-width="4"/><path d="M21 33l7.5 7.5L43 25" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
        "<h3>Ďakujeme, máme to</h3><p>Ozveme sa vám čo najskôr a dohodneme sa na stretnutí alebo telefonáte.</p>" +
        '<button type="button" class="btn btn-ink btn-male" data-akcia="zavriet">Zavrieť</button></div>';
    }
    var v = ZM.v;
    return '<form class="fz" id="form-makler" novalidate>' +
      '<p class="fz-uvod">Napíšte nám pár slov o sebe. Ozveme sa vám a povieme, ako v realitách začať.</p>' +
      '<label>Meno a priezvisko<input class="vstup" name="meno" autocomplete="name" maxlength="80" required value="' + esc(v.meno || "") + '"></label>' +
      '<label>Telefón alebo e-mail<input class="vstup" name="kontakt" autocomplete="tel" maxlength="120" required value="' + esc(v.kontakt || "") + '"></label>' +
      '<label>Kde by ste chceli pracovať?<input class="vstup" name="okres" maxlength="60" placeholder="mesto alebo okres" value="' + esc(v.okres || "") + '"></label>' +
      '<fieldset><legend>Skúsenosti</legend><div class="volby">' + PRAX.map(function (x) { return '<button type="button" data-prax="' + x[0] + '" aria-pressed="' + (v.prax === x[0]) + '">' + x[1] + "</button>"; }).join("") + "</div></fieldset>" +
      '<label>Správa (nepovinné)<textarea class="vstup" name="co" rows="3" maxlength="1500" placeholder="Čo vás na práci makléra láka?">' + esc(v.co || "") + "</textarea></label>" +
      '<input class="med" name="web" tabindex="-1" autocomplete="off" aria-hidden="true">' +
      (ZM.chyba ? '<p class="chyba" role="alert">' + esc(ZM.chyba) + "</p>" : "") +
      '<button class="btn btn-zlate" type="submit"' + (ZM.posiela ? " disabled" : "") + ">" + (ZM.posiela ? '<span class="toci" aria-hidden="true"></span>Odosielam…' : "Odoslať") + "</button>" +
      '<p class="fz-pozn">Vaše údaje použijeme iba na to, aby sme sa vám ozvali.</p></form>';
  }
  function kresliFormularMakler(fokus) {
    var t = $("#panel-telo-makler"); if (!t) return;
    t.innerHTML = formularMakler();
    var f = $("#form-makler");
    if (f) f.addEventListener("focusin", function () { overenie("portal-makler", "makler"); }, { once: true });
    if (fokus) { var x = $('[name="' + fokus + '"]', t); if (x) x.focus(); }
  }
  function otvorChcemMakler() {
    zavriPanel();
    if (ZM.hotovo) ZM = { posiela: false, chyba: "", hotovo: false, v: {} };
    var z = document.createElement("div"); z.className = "zaclona"; z.dataset.panel = "1";
    var p = document.createElement("div"); p.className = "panel"; p.setAttribute("role", "dialog"); p.setAttribute("aria-modal", "true"); p.setAttribute("aria-labelledby", "panel-makler"); p.dataset.panel = "1";
    p.innerHTML = '<div class="panel-hlava"><h2 id="panel-makler">Chcem byť maklér</h2><button type="button" class="x" data-akcia="zavriet" aria-label="Zavrieť">' + IC.x + "</button></div>" +
      '<div class="panel-telo" id="panel-telo-makler"></div>';
    document.body.appendChild(z); document.body.appendChild(p);
    document.body.style.overflow = "hidden";
    S.panelFokus = document.activeElement;
    kresliFormularMakler();
    setTimeout(function () { var x = $('#form-makler [name="meno"]'); if (x) x.focus(); }, 60);
  }
  function odosliMakler(f) {
    ZM.v = { meno: f.meno.value.trim(), kontakt: f.kontakt.value.trim(), okres: f.okres.value.trim(), co: f.co.value.trim(), prax: ZM.v.prax };
    var med = f.web.value;
    if (ZM.v.meno.length < 2) { ZM.chyba = "Napíšte svoje meno."; kresliFormularMakler("meno"); return; }
    if (ZM.v.kontakt.length < 5) { ZM.chyba = "Napíšte telefón alebo e-mail, aby sme sa vám mohli ozvať."; kresliFormularMakler("kontakt"); return; }
    ZM.chyba = ""; ZM.posiela = true; kresliFormularMakler();
    overenie("portal-makler", "makler").then(function (ov) {
      delete POW.makler;
      return rpc("portal_ziadost", { p_typ: "makler", p_meno: ZM.v.meno, p_kontakt: ZM.v.kontakt, p_co: ZM.v.co || null,
        p_udaje: { okres: ZM.v.okres || null, prax: ZM.v.prax || null }, p_overenie: { ts: ov.ts, n: ov.n, med: med } });
    }).then(function () { ZM.posiela = false; ZM.hotovo = true; kresliFormularMakler(); }, function (e) { ZM.posiela = false; ZM.chyba = e.message; kresliFormularMakler(); });
  }

  // ================================================================ prepínanie zoznam ↔ detail
  function sPrechodom(fn) {
    if (document.startViewTransition && !MALO_POHYBU) document.startViewTransition(fn);
    else fn();
  }
  function odidZDetailu() {
    P = null;
    if (S.dIo) { S.dIo.disconnect(); S.dIo = null; }
    if (S.dMapa) { S.dMapa.remove(); S.dMapa = null; }
    zavriGaleriu();
  }
  function ukazZoznam(obnovScroll) {
    S.detail = null; odidZDetailu();
    $("#detail").hidden = true; $("#detail").innerHTML = "";
    $("#zoznam").hidden = false;
    document.title = "Týpkove nehnuteľnosti – ponuky realitných kancelárií a maklérov";
    citajFiltre();
    nacitajPonuky().then(function () { prepocitaj(); }, function () { kresliKarty(); kresliListu(); });
    nacitajMaklerov(); nacitajClanky();
    prepocitaj();
    if (obnovScroll) window.scrollTo(0, S.zoznamY || 0);
    if (S.mapa) setTimeout(function () { S.mapa.invalidateSize(); }, 50);
  }
  function ukazDetail(id) {
    if (!S.detail) { S.zoznamY = window.scrollY; S.zoznamUrl = $("#zoznam").hidden ? S.zoznamUrl : adresaZoznamu(); }
    if (typeof S.detail === "string") odidZDetailu();
    S.detail = id; Z = { zdroj: "obhliadka", posiela: false, chyba: "", hotovo: false, v: {} };
    $("#zoznam").hidden = true;
    var el = $("#detail"); el.hidden = false;
    window.scrollTo(0, 0);
    // údaje: vložené serverom (pekná adresa), inak z databázy
    var vlozene = $("#ponuka-data"), data = null;
    if (vlozene) { try { data = JSON.parse(vlozene.textContent); } catch (e) { data = null; } vlozene.remove(); }
    if (data && Number(data.id) === id) return zobrazDetail(data);
    if (S.detaily[id]) return zobrazDetail(S.detaily[id]);
    el.innerHTML = '<div class="detail"><div class="obal"><div class="galeria g1" style="background:var(--cream2)"></div><div class="d-grid"><div>' + kostry(1) + "</div></div></div></div>";
    rpc("portal_ponuka", { p_id: id }).then(function (d) {
      if (S.detail !== id) return;
      if (!d) return nedostupna();
      zobrazDetail(d);
    }, function (e) {
      if (S.detail !== id) return;
      el.innerHTML = '<div class="detail"><div class="obal">' + prazdne("Ponuku sa nepodarilo načítať", e.message, '<button class="btn btn-ink" type="button" data-akcia="znova-detail">Skúsiť znova</button>') + "</div></div>";
    });
  }
  function zobrazDetail(d) {
    P = d; S.detaily[d.id] = d;
    document.title = nazov(P) + " · Týpkove nehnuteľnosti";
    kresliDetail();
    // počítadlo zobrazení pre report majiteľovi (raz za návštevu)
    var k = "typek-videne-" + P.id;
    try { if (!sessionStorage.getItem(k)) { sessionStorage.setItem(k, "1"); rpc("zaznamenat_zobrazenie", { p_id: P.id }).catch(function () {}); } } catch (e) { /* nič */ }
  }
  function nedostupna() {
    document.title = "Ponuka už nie je dostupná · Týpkove nehnuteľnosti";
    $("#detail").innerHTML = '<div class="detail"><div class="obal">' + prazdne("Táto ponuka už nie je dostupná", "Nehnuteľnosť je už predaná alebo ju maklér stiahol. Pozrite si ďalšie ponuky.", '<a class="btn btn-ink" href="' + esc(ROOT) + '" data-akcia="spat">Všetky ponuky</a>') + '<section class="podobne" id="podobne" hidden></section></div></div>';
  }
  function smeruj(obnovScroll) {
    var cl = clanokZAdresy();
    if (cl) return ukazClanok(cl);
    var id = idZAdresy();
    if (id) ukazDetail(id); else ukazZoznam(obnovScroll);
  }
  function chodNa(url, fn) {
    history.pushState({ typek: 1 }, "", url);
    sPrechodom(fn);
  }

  // ================================================================ udalosti
  document.addEventListener("click", function (e) {
    var t = e.target;
    // odkaz na ponuku
    var a = t.closest("a[data-ponuka]");
    if (a && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey && e.button === 0) {
      e.preventDefault(); var id = Number(a.dataset.ponuka);
      zavriMapovuKartu();
      chodNa(a.getAttribute("href"), function () { ukazDetail(id); });
      return;
    }
    var ac = t.closest("a[data-clanok]");
    if (ac && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey && e.button === 0) {
      e.preventDefault(); var sl = ac.dataset.clanok;
      chodNa(ac.getAttribute("href"), function () { ukazClanok(sl); });
      return;
    }
    // klik kdekoľvek na kartu (okrem tlačidiel)
    var k = t.closest(".karta");
    if (k && !t.closest("button, a") && !e.defaultPrevented) { var l = $("h3 a", k); if (l) { l.click(); return; } }
    var b = t.closest("button, a[data-akcia], a[data-nav]");
    if (!b) return;
    var ak = b.dataset.akcia;
    if (b.dataset.mkPonuky) {
      var poh3 = F.pohlad, zor3 = F.zor; F = Object.assign({}, F0, { pohlad: poh3, zor: zor3, vyb: [], m: b.dataset.mkPonuky });
      prepocitaj(); $("#ponuky").scrollIntoView({ behavior: MALO_POHYBU ? "auto" : "smooth" }); return;
    }
    if (b.dataset.prax) { ZM.v.prax = ZM.v.prax === b.dataset.prax ? "" : b.dataset.prax; $$("[data-prax]").forEach(function (x) { x.setAttribute("aria-pressed", String(x.dataset.prax === ZM.v.prax)); }); return; }
    if (b.dataset.obl) { e.preventDefault(); prepniObl(Number(b.dataset.obl), b.classList.contains("srdce") ? b : null); return; }
    if (b.dataset.listuj) { var pas = $("[data-pas]", b.closest(".karta-foto")); if (pas) pas.scrollBy({ left: Number(b.dataset.listuj) * pas.clientWidth, behavior: MALO_POHYBU ? "auto" : "smooth" }); return; }
    if (b.hasAttribute("data-t") && b.closest("#hladanie")) { F.t = b.dataset.t; if (F.cdo && cenyDo().indexOf(Number(F.cdo)) < 0) F.cdo = ""; prepocitaj(); return; }
    if (b.hasAttribute("data-k") && b.closest("#hladanie")) { F.k = b.dataset.k; prepocitaj(); return; }
    if (b.dataset.navrh != null) { F.q = b.dataset.navrh; $("#navrhy").hidden = true; prepocitaj(); return; }
    if (b.dataset.pohlad) { F.pohlad = b.dataset.pohlad; zavriMapovuKartu(); prepocitaj(true); posunJazdce($("#lista-in")); return; }
    if (b.dataset.zrus) {
      var z = b.dataset.zrus;
      if (z === "vsetko") { var poh = F.pohlad, zor = F.zor; F = Object.assign({}, F0, { pohlad: poh, zor: zor, vyb: [] }); }
      else if (z.indexOf("vyb:") === 0) F.vyb = F.vyb.filter(function (v) { return v !== z.slice(4); });
      else F[z] = F0[z];
      prepocitaj(); return;
    }
    if (b.dataset.hodnota != null && b.closest(".panel")) {
      var pole = b.closest("[data-volby]").dataset.volby, h = b.dataset.hodnota;
      if (pole === "vyb") F.vyb = F.vyb.indexOf(h) >= 0 ? F.vyb.filter(function (v) { return v !== h; }) : F.vyb.concat([h]);
      else F[pole] = h;
      prepocitaj(); aktualizujPanel(); return;
    }
    if (b.dataset.zdroj) { Z.zdroj = b.dataset.zdroj; Z.chyba = ""; var f0 = $("#form-zaujem"); if (f0) Z.v = { meno: f0.meno.value, kontakt: f0.kontakt.value, co: f0.co.value }; kresliFormular(); return; }
    if (b.dataset.foto != null) { otvorGaleriu(Number(b.dataset.foto)); return; }
    if (b.dataset.lb) { ukazFotku(galeriaI + Number(b.dataset.lb)); return; }
    if (b.dataset.lbI != null) { ukazFotku(Number(b.dataset.lbI)); return; }
    if (b.dataset.kar) { var kar = $("#karusel"); if (kar) kar.scrollBy({ left: Number(b.dataset.kar) * kar.clientWidth * 0.9, behavior: MALO_POHYBU ? "auto" : "smooth" }); return; }
    var nav = b.dataset.nav;
    if (nav) {
      e.preventDefault();
      var md = $("#tn-menu"); if (md) md.open = false;
      if (nav === "mapa") F.pohlad = "mapa";
      if (nav === "ponuky" && b.closest(".tn-nav, .tn-pata")) F.pohlad = "zoznam";
      var ciel = nav === "uvod" ? null : nav === "mapa" ? "ponuky" : nav;
      var hotovo = function () {
        var cakaj = ciel === "makleri" ? nacitajMaklerov() : ciel === "clanky" ? nacitajClanky() : null;
        Promise.resolve(cakaj).then(function () {
          var c = ciel && $("#" + ciel);
          if (c && c.hidden) c = $("#ponuky");
          if (c) c.scrollIntoView({ behavior: MALO_POHYBU ? "auto" : "smooth" }); else window.scrollTo({ top: 0, behavior: MALO_POHYBU ? "auto" : "smooth" });
        });
      };
      if (S.detail) { var url = adresaZoznamu(); chodNa(url, function () { ukazZoznam(false); hotovo(); }); }
      else { prepocitaj(); hotovo(); }
      return;
    }
    if (!ak) return;
    if (ak === "oblubene") {
      F.obl = !F.obl;
      if (S.detail) { chodNa(adresaZoznamu(), function () { ukazZoznam(false); $("#ponuky").scrollIntoView(); }); }
      else { prepocitaj(); $("#ponuky").scrollIntoView({ behavior: MALO_POHYBU ? "auto" : "smooth" }); }
      return;
    }
    if (ak === "filtre") { otvorFiltre(); return; }
    if (ak === "chcem-makler") { otvorChcemMakler(); return; }
    if (ak === "vsetky-clanky") { CL.vsetky = true; kresliClanky(); return; }
    if (ak === "zavriet") { zavriPanel(); return; }
    if (ak === "zrusit-filtre") { var poh2 = F.pohlad, zor2 = F.zor; F = Object.assign({}, F0, { pohlad: poh2, zor: zor2, vyb: [] }); prepocitaj(); zavriPanel(); otvorFiltre(); return; }
    if (ak === "znova") { S.nacitanie = null; S.chyba = ""; kresliKarty(); nacitajPonuky().then(function () { prepocitaj(); }, function () { kresliKarty(); }); return; }
    if (ak === "znova-detail") { ukazDetail(S.detail); return; }
    if (ak === "spat") {
      e.preventDefault();
      if (history.state && history.state.typek) { history.back(); return; }
      chodNa(S.zoznamUrl || ROOT, function () { ukazZoznam(false); });
      return;
    }
    if (ak === "citaj") { var pp = $("#d-popis"); if (pp) pp.classList.remove("zbal"); b.remove(); return; }
    if (ak === "telefon") {
      var tel = b.dataset.tel, aa = document.createElement("a");
      aa.className = "btn btn-ink"; aa.href = "tel:" + tel.replace(/[^\d+]/g, ""); aa.innerHTML = IC.tel + esc(tel);
      b.replaceWith(aa); aa.focus(); return;
    }
    if (ak === "zdielat") {
      var url2 = location.href.split("#")[0];
      if (navigator.share) { navigator.share({ title: P ? nazov(P) : document.title, url: url2 }).catch(function () {}); return; }
      (navigator.clipboard ? navigator.clipboard.writeText(url2) : Promise.reject()).then(function () { toast("Odkaz je skopírovaný"); }, function () { prompt("Skopírujte si odkaz:", url2); });
      return;
    }
    if (ak === "k-formularu") { e.preventDefault(); var zj = $("#zaujem"); zj.scrollIntoView({ behavior: MALO_POHYBU ? "auto" : "smooth", block: "start" }); setTimeout(function () { var x = $('#form-zaujem [name="meno"]'); if (x) x.focus({ preventScroll: true }); }, 500); return; }
    if (ak === "dalsia-sprava") { Z.hotovo = false; kresliFormular("co"); return; }
    if (ak === "lb-zavriet") { zavriGaleriu(); return; }
  });
  document.addEventListener("click", function (e) {
    // obrázok v mobilnej galérii detailu
    var img = e.target.closest("img[data-foto]");
    if (img) otvorGaleriu(Number(img.dataset.foto));
    if (!e.target.closest(".hl-pole")) { var n = $("#navrhy"); if (n) n.hidden = true; }
    if (e.target.classList && e.target.classList.contains("zaclona")) zavriPanel();
  });
  document.addEventListener("submit", function (e) {
    if (e.target.id === "hladanie") {
      e.preventDefault();
      var q = $("#hl-q"); if (q) { F.q = q.value.trim(); $("#navrhy").hidden = true; q.blur(); }
      prepocitaj();
      $("#ponuky").scrollIntoView({ behavior: MALO_POHYBU ? "auto" : "smooth" });
    }
    if (e.target.id === "form-zaujem") { e.preventDefault(); if (!Z.posiela) odosliFormular(e.target); }
    if (e.target.id === "form-makler") { e.preventDefault(); if (!ZM.posiela) odosliMakler(e.target); }
  });
  document.addEventListener("input", function (e) {
    var t = e.target;
    if (t.id === "hl-q") { navrhAkt = -1; kresliNavrhy(); F.q = t.value.trim(); prepocitajNeskor(true); return; }
    if (t.id === "mk-q") { MK.q = t.value; clearTimeout(MK.t); MK.t = setTimeout(kresliMaklerov, 120); return; }
    if (t.dataset && t.dataset.pole && t.closest(".panel")) {
      if (t.type === "checkbox") F[t.dataset.pole] = t.checked;
      else { t.value = t.value.replace(/\D/g, "").slice(0, 9); F[t.dataset.pole] = t.value; }
      clearTimeout(S.panelT); S.panelT = setTimeout(function () { prepocitaj(); aktualizujPanel(); }, 220);
    }
  });
  document.addEventListener("change", function (e) {
    var t = e.target;
    if (t.id === "hl-cena") { F.cdo = t.value; prepocitaj(true); return; }
    if (t.id === "zoradit") { F.zor = t.value; prepocitaj(true); }
  });
  document.addEventListener("focusin", function (e) { if (e.target.id === "hl-q") kresliNavrhy(); });
  document.addEventListener("keydown", function (e) {
    if ($("#lightbox")) {
      if (e.key === "Escape") zavriGaleriu();
      if (e.key === "ArrowRight") ukazFotku(galeriaI + 1);
      if (e.key === "ArrowLeft") ukazFotku(galeriaI - 1);
      return;
    }
    if (e.key === "Escape" && $(".panel")) { zavriPanel(); return; }
    if (e.target.id === "hl-q") {
      var box = $("#navrhy"), bt = box ? $$("button", box) : [];
      if (e.key === "ArrowDown" && bt.length) { e.preventDefault(); navrhAkt = (navrhAkt + 1) % bt.length; kresliNavrhy(); }
      else if (e.key === "ArrowUp" && bt.length) { e.preventDefault(); navrhAkt = (navrhAkt - 1 + bt.length) % bt.length; kresliNavrhy(); }
      else if (e.key === "Enter" && navrhAkt >= 0 && bt[navrhAkt]) { e.preventDefault(); bt[navrhAkt].click(); }
      else if (e.key === "Escape" && box) box.hidden = true;
    }
  });
  // karta ↔ špendlík na mape
  document.addEventListener("mouseover", function (e) {
    var k = e.target.closest && e.target.closest("#mriezka .karta");
    if (k === S.hoverK) return;
    if (S.hoverK) zvyrazniPin(Number(S.hoverK.dataset.id), false);
    S.hoverK = k || null;
    if (k && F.pohlad === "mapa") zvyrazniPin(Number(k.dataset.id), true);
  });
  window.addEventListener("popstate", function () { sPrechodom(function () { smeruj(true); }); });
  window.addEventListener("resize", function () { posunJazdce(document); });
  // tieň hlavičky a lišty pri skrolovaní
  var hl = $(".tn-hlava"), li = $("#lista");
  window.addEventListener("scroll", function () {
    hl.classList.toggle("tien", window.scrollY > 8);
    if (li && !$("#zoznam").hidden) li.classList.toggle("tien", li.getBoundingClientRect().top <= parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--hlava")) + 1);
  }, { passive: true });

  // odkrývanie pri skrolovaní
  var rvIo = "IntersectionObserver" in window ? new IntersectionObserver(function (zaz) {
    zaz.forEach(function (z) { if (z.isIntersecting) { z.target.classList.add("rv-in"); rvIo.unobserve(z.target); } });
  }, { rootMargin: "0px 0px -8% 0px" }) : null;
  function odkryvaj(koren) {
    $$("[data-rv]:not(.rv-in)", koren || document).forEach(function (x) { if (rvIo) rvIo.observe(x); else x.classList.add("rv-in"); });
  }

  // ---------------------------------------------------------------- štart
  if ("scrollRestoration" in history) history.scrollRestoration = "manual";
  kresliPocetObl();
  odkryvaj(document);
  if (clanokZAdresy()) {
    // priamo otvorený článok
    S.zoznamUrl = ROOT;
    ukazClanok(clanokZAdresy());
  } else if (idZAdresy()) {
    // priamo otvorená ponuka: zoznam sa načíta na pozadí (podobné ponuky, návrat)
    S.zoznamUrl = ROOT;
    ukazDetail(idZAdresy());
  } else {
    citajFiltre();
    prepocitaj();
    nacitajPonuky().then(function () { prepocitaj(); }, function () { kresliKarty(); kresliListu(); });
    nacitajMaklerov(); nacitajClanky();
    var h = (location.hash || "").slice(1);
    if (["ponuky", "makleri", "clanky", "pre-vas", "inzerovat"].indexOf(h) >= 0) {
      Promise.resolve(h === "makleri" ? nacitajMaklerov() : h === "clanky" ? nacitajClanky() : null).then(function () {
        setTimeout(function () { var c = $("#" + h); if (c && !c.hidden) c.scrollIntoView(); }, 60);
      });
    }
  }
})();
