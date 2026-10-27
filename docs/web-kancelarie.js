/* Web kancelárie – návrh šablóny (skladačka). Vidí ho len administrátor (overenie podľa roly v tabuľke makleri).
   Nastavenie návrhu sa zatiaľ ukladá len v tomto prehliadači. Realitný týpek */
(function () {
"use strict";

/* ================================================================ pomocníci (rovnaké ako v šablónach webu makléra) */
function $(id) { return document.getElementById(id); }
function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
function h2r(h) { h = h.replace("#", ""); return [0, 2, 4].map(function (i) { return parseInt(h.slice(i, i + 2), 16); }); }
function r2h(a) { return "#" + a.map(function (v) { return Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0"); }).join(""); }
function mix(a, b, t) { var A = h2r(a), B = h2r(b); return r2h(A.map(function (v, i) { return v + (B[i] - v) * t; })); }
function lum(h) { var c = h2r(h).map(function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; }
function con(a, b) { var x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
function onCol(c) { return con(c, "#FFFFFF") >= con(c, "#1E2A35") ? "#FFFFFF" : "#1E2A35"; }
function rdAll(c, bgs, to, min) { for (var t = 0; t <= 1.0001; t += 0.04) { var m = mix(c, to, Math.min(t, 1)); if (bgs.every(function (b) { return con(m, b) >= min; })) return m; } return to; }
function fitOn(c) { var on = onCol(c), away = on === "#FFFFFF" ? "#000000" : "#FFFFFF"; for (var t = 0; t <= 1.0001; t += 0.04) { var x = mix(c, away, Math.min(t, 1)); if (con(x, on) >= 4.5) return [x, on]; } return [c, on]; }
function isHex(v) { return /^#[0-9a-f]{6}$/i.test(v || ""); }
function okHex(v) { v = String(v || "").trim(); if (v.charAt(0) !== "#") v = "#" + v; return isHex(v) ? v.toLowerCase() : null; }
function clone(o) { return JSON.parse(JSON.stringify(o)); }
function paras(t) { return String(t || "").split(/\n+/).filter(function (x) { return x.trim(); }).map(function (p) { return "<p>" + esc(p) + "</p>"; }).join(""); }
function lines(t) { return String(t || "").split(/\n+/).map(function (x) { return x.trim(); }).filter(Boolean); }
var NF = new Intl.NumberFormat("sk-SK");
function fmt(v) { return NF.format(Math.round(v)); }
function initials(n) { return String(n || "").replace(/,.*$/, "").split(/\s+/).filter(function (w) { return w && !/\.$/.test(w); }).map(function (w) { return w[0]; }).join("").slice(0, 2).toUpperCase() || "M"; }
function pon(n) { return n + (n === 1 ? " ponuka" : n >= 2 && n <= 4 ? " ponuky" : " ponúk"); }
function url(u) { u = String(u || "").trim(); return !u ? "" : /^https?:\/\//i.test(u) ? u : "https://" + u; }
function SV(p, sw) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="' + (sw || 1.9) + '" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + p + "</svg>"; }
var STAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2.8l2.8 5.8 6.3.9-4.6 4.4 1.1 6.3L12 17.2l-5.6 3 1.1-6.3L2.9 9.5l6.3-.9z"/></svg>';
function stars(n) { var s = ""; for (var i = 0; i < (n || 5); i++) s += STAR; return '<span class="stars" aria-label="' + (n || 5) + ' z 5 hviezdičiek">' + s + "</span>"; }
var IC = {
  tel: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
  pin: '<path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  firma: '<path d="M4 21V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v16M15 9h4a1 1 0 0 1 1 1v11M2 21h20M8 8h3M8 12h3M8 16h3"/>',
  dom: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
  byt: '<rect x="5" y="3" width="14" height="18" rx="1.5"/><path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2M10 21v-3h4v3"/>',
  poz: '<path d="M3 19l5-9 4 6 3-4 6 7z"/><circle cx="16" cy="6" r="2"/>',
  chata: '<path d="M2 12l10-8 10 8"/><path d="M6 10v10h12V10"/><path d="M12 20v-5"/><path d="M16 6V3h2v4.5"/>',
  ine: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M9 12h6M12 9v6"/>',
  kluc: '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M16 7l3 3M14 9l2 2"/>',
  d3: '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M12 12l8-4.5M12 12v9M12 12L4 7.5"/>',
  dron: '<circle cx="5" cy="5" r="2.2"/><circle cx="19" cy="5" r="2.2"/><circle cx="5" cy="19" r="2.2"/><circle cx="19" cy="19" r="2.2"/><path d="M7 7l3 3M17 7l-3 3M7 17l3-3M17 17l-3-3"/><rect x="10" y="10" width="4" height="4" rx="1"/>',
  staging: '<path d="M4 12V9a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v3"/><path d="M3 12h18v5H3zM5 17v2M19 17v2"/>',
  zmluva: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>',
  hladat: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
  graf: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  foto: '<rect x="3" y="6" width="18" height="14" rx="2"/><circle cx="12" cy="13" r="3.5"/><path d="M8 6l1.5-2h5L16 6"/>',
  srdce: '<path d="M12 20s-8-4.6-8-10.3A4.7 4.7 0 0 1 12 7a4.7 4.7 0 0 1 8 2.7C20 15.4 12 20 12 20z"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  l: '<path d="M15 5l-7 7 7 7"/>', r: '<path d="M9 5l7 7-7 7"/>',
  up: '<path d="M6 15l6-6 6 6"/>', down: '<path d="M6 9l6 6 6-6"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  grip: '<circle cx="9" cy="6" r="1.2" fill="currentColor"/><circle cx="15" cy="6" r="1.2" fill="currentColor"/><circle cx="9" cy="12" r="1.2" fill="currentColor"/><circle cx="15" cy="12" r="1.2" fill="currentColor"/><circle cx="9" cy="18" r="1.2" fill="currentColor"/><circle cx="15" cy="18" r="1.2" fill="currentColor"/>',
  plus: '<path d="M12 5v14M5 12h14"/>', menu: '<path d="M4 7h16M4 12h16M4 17h16"/>', x: '<path d="M6 6l12 12M18 6L6 18"/>',
  laur: '<circle cx="12" cy="9" r="6"/><path d="M8.6 13.8L7 22l5-2.8 5 2.8-1.6-8.2"/><path d="M12 6l1 2 2.2.3-1.6 1.5.4 2.2-2-1.1-2 1.1.4-2.2-1.6-1.5L11 8z"/>',
  web: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  ext: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  sipka: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  fb: '<path d="M14 8h3V4h-3a4 4 0 0 0-4 4v2H8v4h2v7h4v-7h3l1-4h-4V8.6c0-.3.3-.6.6-.6z"/>',
  ig: '<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.4" cy="6.6" r=".8" fill="currentColor"/>',
  yt: '<rect x="2.5" y="5.5" width="19" height="13" rx="4"/><path d="M10 9.3v5.4l4.6-2.7z" fill="currentColor"/>',
  li: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M8 10v7M8 7v.01M12 17v-7M12 13a3 3 0 0 1 6 0v4"/>',
  tt: '<path d="M14 3v11.5a3.5 3.5 0 1 1-3.5-3.5"/><path d="M14 3c.5 3 2.5 4.6 5 4.6"/>'
};

/* ================================================================ voľby vzhľadu */
var TPLS = [
  { id: "klasicka", name: "Klasická", desc: "Fotky a vyhľadávanie pod nimi", p: { head: "svetla", font: "moderne", r: 14, btn: "pill", align: "vlavo", hh: "vysoka" } },
  { id: "portal", name: "Portál", desc: "Vyhľadávanie ponúk v úvode", p: { head: "priehladna", font: "jednoduche", r: 12, btn: "round", align: "stred", hh: "vysoka" } },
  { id: "rozdelena", name: "Rozdelená", desc: "Text vľavo, fotky vpravo", p: { head: "svetla", font: "elegantne", r: 20, btn: "pill", align: "vlavo", hh: "vysoka" } },
  { id: "luxusna", name: "Luxusná", desc: "Fotka cez celú obrazovku", p: { head: "priehladna", font: "luxusne", r: 4, btn: "square", align: "stred", hh: "cela" } },
  { id: "mestska", name: "Mestská", desc: "Výrazná a odvážna", p: { head: "tmava", font: "vyrazne", r: 0, btn: "square", align: "vlavo", hh: "vysoka" } }];
var COLORS = [{ id: "alpha", name: "Alpha zlatá", c: "#DAB967" }, { id: "zlata", name: "Zlatá", c: "#DB9522" }, { id: "atrament", name: "Atramentová", c: "#1E2A35" }, { id: "smaragd", name: "Smaragdová", c: "#1F6B57" }, { id: "tehla", name: "Tehlová", c: "#A8482E" },
  { id: "more", name: "Morská", c: "#1D6F8F" }, { id: "slivka", name: "Slivková", c: "#6E3A5E" }, { id: "oliva", name: "Olivová", c: "#6E7B2C" }, { id: "sivomodra", name: "Sivomodrá", c: "#4A6074" }];
var SETS = [
  { id: "alpha", name: "Alpha zlatá", a: "#DAB967", b: "#1E2A35", h: "text", bg: "svetle" },
  { id: "spis", name: "Spišská zlatá", a: "#DB9522", b: "#4A6074", h: "text", bg: "kremove" },
  { id: "tatry", name: "Tatranská zelená", a: "#1F6B57", b: "#C98A2B", h: "a", bg: "svetle" },
  { id: "noc", name: "Nočný luxus", a: "#C9A45C", b: "#8C9BA8", h: "text", bg: "tmave" },
  { id: "more", name: "More a koral", a: "#1D6F8F", b: "#D9664A", h: "text", bg: "svetle" },
  { id: "tehla", name: "Tehla a krém", a: "#A8482E", b: "#2F4152", h: "b", bg: "kremove" },
  { id: "slivka", name: "Slivka a med", a: "#6E3A5E", b: "#D9A441", h: "a", bg: "svetle" },
  { id: "cierna", name: "Čierna klasika", a: "#15191C", b: "#DB9522", h: "text", bg: "svetle" },
  { id: "salvia", name: "Šalvia a terakota", a: "#5F7A61", b: "#B4654A", h: "a", bg: "kremove" }];
var FONTS = [
  { id: "moderne", name: "Moderné", h: '"Bricolage Grotesque",system-ui,sans-serif', b: '"Instrument Sans",system-ui,sans-serif', w: 800, ls: "-0.02em" },
  { id: "elegantne", name: "Elegantné", h: '"Young Serif",Georgia,serif', b: '"Instrument Sans",system-ui,sans-serif', w: 400, ls: "-0.01em" },
  { id: "luxusne", name: "Luxusné", h: '"Cormorant Garamond",Georgia,serif', b: '"Instrument Sans",system-ui,sans-serif', w: 600, ls: "-0.005em" },
  { id: "jednoduche", name: "Jednoduché", h: '"Public Sans",system-ui,sans-serif', b: '"Public Sans",system-ui,sans-serif', w: 700, ls: "-0.015em" },
  { id: "priatelske", name: "Priateľské", h: '"Nunito",system-ui,sans-serif', b: '"Nunito",system-ui,sans-serif', w: 800, ls: "-0.01em" },
  { id: "vyrazne", name: "Výrazné", h: '"Archivo",system-ui,sans-serif', b: '"Archivo",system-ui,sans-serif', w: 900, ls: "-0.03em" }];
var BGS = [
  { id: "svetle", name: "Svetlé", bg: "#FFFFFF", surf: "#F3F5F7", fg: "#1A2128", muted: "#5A6571", line: "#DEE3E8", dark: false },
  { id: "kremove", name: "Krémové", bg: "#F7F2E8", surf: "#FFFDF8", fg: "#1E2A35", muted: "#5A6470", line: "#E4DACA", dark: false },
  { id: "tmave", name: "Tmavé", bg: "#141A21", surf: "#1E2630", fg: "#EEF1F4", muted: "#9DAAB7", line: "#2E3945", dark: true }];

/* ================================================================ knižnica fotiek (ilustračné fotky od AI z Týpka) */
var LIB = [["dom-novostavba", "Novostavba"], ["dom-rodinny", "Rodinný dom"], ["dom-zahrada", "Dom so záhradou"], ["dom-obyvacka", "Obývačka v dome"], ["luxus-obyvacka", "Luxusný interiér"],
  ["byt-obyvacka", "Obývačka v byte"], ["byt-centrum", "Byt v centre"], ["byt-dom", "Bytový dom"], ["byt-tehla", "Tehlový dom"], ["byt-kuchyna", "Kuchyňa"], ["byt-spalna", "Spálňa"],
  ["mesto-namestie", "Námestie"], ["mesto-letecky", "Mesto zhora"], ["pozemok", "Pozemok"], ["chata", "Chata"], ["chata-krb", "Chata s krbom"], ["chatka", "Chatka v horách"]];
function src(v, maly) { v = String(v || ""); if (/^(data:|blob:)/.test(v)) return v; if (!v) return ""; return "img/web/" + v + (maly ? "-m" : "") + ".webp"; }

/* ================================================================ údaje z Týpka (v návrhu ukážkové) */
var AG = [
  { id: "m1", n: "Martin Augustiňák, RSc.", r: "Konateľ a realitný maklér", web: "martinaugustinak.sk" },
  { id: "m2", n: "Mgr. Martina Macejová, RSc.", r: "Realitná poradkyňa", web: "" },
  { id: "m3", n: "Roman Blaško", r: "Realitný maklér", web: "" }];
var LST = [
  { k: "byt", tr: "predaj", t: "3-izbový byt s loggiou", l: "Spišská Nová Ves", p: 139000, m2: 74, a: ["74 m²", "3 izby", "6. poschodie"], img: "byt-obyvacka", m: "m1", st: "Novinka" },
  { k: "dom", tr: "predaj", t: "Rodinný dom so záhradou", l: "Smižany", p: 229000, m2: 142, a: ["142 m²", "4 izby", "pozemok 620 m²"], img: "dom-zahrada", m: "m2" },
  { k: "poz", tr: "predaj", t: "Stavebný pozemok pri lese", l: "Markušovce", p: 68000, m2: 950, a: ["950 m²", "siete pri pozemku"], img: "pozemok", m: "m3" },
  { k: "byt", tr: "prenajom", t: "2-izbový byt v centre", l: "Levoča", p: 520, m2: 54, a: ["54 m²", "2 izby", "zariadený"], img: "byt-centrum", m: "m2" },
  { k: "dom", tr: "predaj", t: "Novostavba bungalovu", l: "Harichovce", p: 259000, m2: 118, a: ["118 m²", "4 izby", "pozemok 700 m²"], img: "dom-novostavba", m: "m1", st: "Rezervované" },
  { k: "chata", tr: "predaj", t: "Chata s krbom", l: "Hrabušice", p: 95000, m2: 64, a: ["64 m²", "3 izby", "pozemok 410 m²"], img: "chata-krb", m: "m3" },
  { k: "byt", tr: "predaj", t: "1-izbový byt po rekonštrukcii", l: "Spišská Nová Ves", p: 84900, m2: 36, a: ["36 m²", "1 izba", "2. poschodie"], img: "byt-kuchyna", m: "m3", st: "Znížená cena" },
  { k: "dom", tr: "predaj", t: "Rodinný dom s garážou", l: "Levoča", p: 189000, m2: 160, a: ["160 m²", "5 izieb", "garáž"], img: "dom-rodinny", m: "m1" },
  { k: "byt", tr: "prenajom", t: "3-izbový byt s balkónom", l: "Spišská Nová Ves", p: 650, m2: 68, a: ["68 m²", "3 izby", "balkón"], img: "byt-spalna", m: "m2" }];
var KINDS = [["vse", "Všetko"], ["byt", "Byty"], ["dom", "Domy"], ["poz", "Pozemky"], ["chata", "Chaty"]];
var KIND1 = { byt: "Byt", dom: "Dom", poz: "Pozemok", chata: "Chata" };
var POSTS = [
  { t: "Na čo si dať pozor pri kúpe staršieho bytu na sídlisku", d: "Stúpačky, zateplenie, fond opráv a list vlastníctva. Päť vecí, ktoré si oplatí overiť ešte pred rezervačnou zmluvou.", img: "byt-tehla", dt: "14. 10. 2026" },
  { t: "Ako pripraviť dom na obhliadku, aby zaujal na prvý pohľad", d: "Upratať, vyvetrať a odložiť osobné veci. Drobné úpravy, vďaka ktorým sa dom predá rýchlejšie.", img: "dom-obyvacka", dt: "16. 9. 2026" },
  { t: "Dane pri predaji nehnuteľnosti: kedy ich platíte a kedy nie", d: "Rozhoduje hlavne to, ako dlho nehnuteľnosť vlastníte. Prejdite si základné pravidlá skôr, než podpíšete zmluvu.", img: "mesto-letecky", dt: "19. 8. 2026" },
  { t: "Koľko stojí predaj bytu a čo všetko je v cene", d: "Provízia, poplatky na katastri, energetický certifikát. Prehľad nákladov, s ktorými rátať.", img: "byt-dom", dt: "15. 7. 2026" },
  { t: "Pozemok na stavbu: čo overiť v územnom pláne", d: "Než kúpite pozemok, zistite, čo sa na ňom smie stavať a kde vedú siete.", img: "pozemok", dt: "17. 6. 2026" },
  { t: "Chata na Spiši ako investícia", d: "Na čo myslieť pri kúpe chaty na prenájom a aké náklady čakať počas roka.", img: "chata", dt: "13. 5. 2026" }];
var REVS = [
  { n: "Klientka z Levoče", t: "Predaj bytu prebehol rýchlejšie, než sme čakali. Vždy nám zdvihli telefón a všetko nám v pokoji vysvetlili.", d: "pred 2 týždňami" },
  { n: "Predávajúci zo Smižian", t: "Oceňujeme poctivé ocenenie domu aj pomoc s papiermi až po kataster. Nemuseli sme nič riešiť sami.", d: "pred mesiacom" },
  { n: "Kupujúci zo Spišskej Novej Vsi", t: "Pomohli nám nájsť byt a vybaviť aj hypotéku. Odporúčame každému, kto chce mať pokoj.", d: "pred 2 mesiacmi" },
  { n: "Klient z Popradu", t: "Profesionálne fotky, video aj obhliadky. Dom sa predal za cenu, s ktorou sme boli spokojní.", d: "pred 3 mesiacmi" },
  { n: "Predávajúca z Markušoviec", t: "Pri výkupe pozemku bolo všetko dohodnuté rýchlo a férovo.", d: "pred 4 mesiacmi" },
  { n: "Kupujúci z Levoče", t: "Ochotní, dochvíľni a s prehľadom. Na obhliadke vedeli odpovedať na každú otázku.", d: "pred 5 mesiacmi" }];
var OBCE = ["Spišská Nová Ves", "Levoča", "Smižany", "Markušovce", "Harichovce", "Spišské Vlachy", "Krompachy", "Spišské Podhradie", "Hrabušice", "Poprad", "Iná obec"];
var SVC_IC = [["dom", "Dom"], ["byt", "Byt"], ["kluc", "Kľúč"], ["d3", "3D prehliadka"], ["dron", "Dron"], ["staging", "Staging"], ["zmluva", "Zmluva"], ["hladat", "Hľadanie"], ["graf", "Graf"], ["foto", "Fotky"], ["srdce", "Srdce"], ["poz", "Pozemok"]];

/* ================================================================ sekcie */
var SEC = {
  cisla: { n: "Čísla pod úvodom", d: "číselník, pekne sa napočítajú", menu: "" },
  ponuky: { n: "Ponuky maklérov", d: "všetci makléri, berú sa z Týpka", menu: "Ponuky" },
  okancelarii: { n: "O kancelárii", d: "text, fotka, výhody", menu: "O nás" },
  sluzby: { n: "Služby", d: "zoznam služieb s ikonami", menu: "Služby" },
  odhad: { n: "Odhad hodnoty", d: "formulár v troch krokoch", menu: "" },
  tim: { n: "Náš tím", d: "makléri z Týpka", menu: "Tím" },
  ocenenia: { n: "Ocenenia", d: "ocenenia a certifikáty", menu: "" },
  recenzie: { n: "Recenzie z Google", d: "načítajú sa z odkazu", menu: "" },
  galeria: { n: "Galéria", d: "viac fotiek naraz", menu: "" },
  clanky: { n: "Články", d: "z Týpka, 1 mesačne v cene", menu: "Blog" },
  kontakt: { n: "Kontakt a mapa", d: "formulár, kontakty, mapa", menu: "Kontakt" } };
var CTYPES = [["text", "Text", "nadpis a odseky"], ["txph", "Text a fotka", "fotka vedľa textu"], ["fotky", "Fotky", "galéria fotiek"], ["vyzva", "Výzva s tlačidlom", "farebný pás"]];

var DEF = {
  tpl: "klasicka", set: "alpha", color: "alpha", cc: "#DAB967", b2: "#1E2A35", hcol: "text", font: "moderne", bg: "svetle", head: "svetla", btn: "pill", r: 14, anim: "on",
  hero: { eb: "Realitná kancelária pre Spiš", auto: "on", int: 6, dim: 45, align: "vlavo", hh: "vysoka", search: "on", slides: [
    { img: "dom-novostavba", t: "Predáme vašu nehnuteľnosť rýchlo a za dobrú cenu.", l: "Realitná kancelária pre Spišskú Novú Ves, Levoču a okolie. Od ocenenia až po odovzdanie kľúčov.", b: "Viac informácií", go: "okancelarii", u: "", b2: "Pozrieť ponuky", go2: "ponuky", u2: "" },
    { img: "mesto-namestie", t: "Potrebujete predať hneď? Nehnuteľnosť od vás odkúpime.", l: "Byty, domy aj pozemky. Peniaze v hotovosti alebo na účet, papiere a kataster vybavíme za vás.", b: "Viac informácií", go: "c1", u: "", b2: "", go2: "kontakt", u2: "" },
    { img: "luxus-obyvacka", t: "Koľko má hodnotu vaša nehnuteľnosť?", l: "Pošlite nám pár údajov a pripravíme vám odhad ceny podľa skutočných predajov v okolí. Zadarmo a nezáväzne.", b: "Zistiť hodnotu", go: "odhad", u: "", b2: "", go2: "kontakt", u2: "" }] },
  order: ["cisla", "ponuky", "okancelarii", "sluzby", "c1", "odhad", "tim", "ocenenia", "recenzie", "galeria", "clanky", "kontakt"],
  on: { cisla: true, ponuky: true, okancelarii: true, sluzby: true, c1: true, odhad: true, tim: true, ocenenia: true, recenzie: true, galeria: true, clanky: true, kontakt: true },
  cisla: { st: "pas", rows: [{ typ: "vlastne", n: "15+", t: "rokov na realitnom trhu" }, { typ: "ponuky", n: "", t: "aktuálnych ponúk" }, { typ: "makleri", n: "", t: "maklérov v tíme" }, { typ: "vlastne", n: "2", t: "okresy: Spišská Nová Ves a Levoča" }] },
  ponuky: { eb: "Ponuky", t: "Aktuálne ponuky našich maklérov", l: "Byty, domy, pozemky aj chaty na predaj a prenájom.", cnt: "6", lay: "mriezka", filt: "on", agent: "on", sort: "nove" },
  okancelarii: { eb: "O nás", t: "Realitná kancelária, ktorá pozná Spiš", text: "Viac ako 15 rokov sprostredkúvame predaj, kúpu a prenájom nehnuteľností a vykupujeme byty, domy aj pozemky. Pôsobíme v Spišskej Novej Vsi, Levoči, Poprade a okolí.\nKaždému klientovi povieme na rovinu, čo je možné. Postaráme sa o ocenenie, fotky, inzerciu, obhliadky, zmluvy aj kataster.", img: "mesto-namestie", pts: "Najviac pozitívnych recenzií v regióne\nCertifikovaní realitní špecialisti RSc.\nVýkup bytov, domov a pozemkov\nVšetko od ocenenia až po kataster", b: "Spoznajte náš tím", go: "tim", badge: "on" },
  sluzby: { eb: "Služby", t: "S čím vám pomôžeme", l: "Všetko okolo predaja, kúpy a prenájmu pod jednou strechou.", items: [
    { ic: "dom", t: "Predaj a prenájom", d: "Ocenenie, fotky, inzercia, obhliadky a zmluvy až po kataster." },
    { ic: "kluc", t: "Výkup nehnuteľností", d: "Nehnuteľnosť od vás odkúpime rýchlo a bez inzercie." },
    { ic: "d3", t: "Virtuálne prehliadky", d: "Kupujúci si nehnuteľnosť prejde online ešte pred obhliadkou." },
    { ic: "dron", t: "Zábery z dronu", d: "Domy a pozemky ukážeme aj z výšky, s celým okolím." },
    { ic: "staging", t: "Virtuálny staging", d: "Prázdne izby zariadime na fotkách, aby kupujúci videli ich možnosti." },
    { ic: "zmluva", t: "Servis pri prevode", d: "Zmluvy, úschova peňazí, hypotéka a návrh na vklad do katastra." },
    { ic: "hladat", t: "Agent kupujúceho", d: "Nájdeme vám vhodnú nehnuteľnosť a zastúpime vás pri jednaní." }] },
  odhad: { eb: "Odhad hodnoty", t: "Koľko má hodnotu vaša nehnuteľnosť?", text: "Vyplňte pár údajov a do 24 hodín vám pošleme odhad ceny podľa skutočných predajov v okolí. Zadarmo a nezáväzne.", kroky: "Vyplníte krátky formulár, trvá to 2 minúty\nOzve sa vám náš maklér\nDostanete odhad ceny e-mailom", komu: "kancelaria" },
  tim: { eb: "Náš tím", t: "Makléri, ktorí vám pomôžu", l: "Každý z nás pozná svoj región. Vyberte si makléra alebo napíšte kancelárii.", web: "on", kont: "on" },
  ocenenia: { eb: "Ocenenia", t: "Ocenenia a certifikáty", items: [{ t: "Certifikovaní realitní špecialisti", y: "RSc.", d: "Titul RSc. majú naši makléri" }, { t: "Názov ocenenia", y: "2025", d: "Kto ho udelil" }, { t: "Názov ocenenia", y: "2024", d: "Kto ho udelil" }] },
  recenzie: { eb: "Recenzie", t: "Čo o nás hovoria klienti", cnt: "3", write: "on" },
  galeria: { eb: "Galéria", t: "Z našej práce", lay: "mozaika", imgs: ["dom-obyvacka", "byt-obyvacka", "mesto-letecky", "chata", "byt-kuchyna", "dom-rodinny", "luxus-obyvacka", "chatka"] },
  clanky: { eb: "Blog", t: "Rady a novinky z realít", cnt: "3" },
  kontakt: { eb: "Kontakt", t: "Napíšte nám alebo sa zastavte", l: "Kancelária je v centre Spišskej Novej Vsi. Radi vám poradíme osobne aj telefonicky.", form: "on", map: "on", hours: "on" },
  custom: { c1: { typ: "vyzva", t: "Výkup nehnuteľností", text: "Potrebujete predať rýchlo? Byt, dom aj pozemok od vás odkúpime. Peniaze v hotovosti alebo na účet, papiere a kataster vybavíme za vás.", img: "", imgs: [], b: "Chcem ponuku na výkup", go: "kontakt", u: "", bgs: "col", menu: "on", ml: "Výkup" } },
  k: { name: "Alpha Reality", logo: "logo.png", addr: "Hviezdoslavova 8, 052 01 Spišská Nová Ves", tel: "+421 915 140 759", mail: "info@alphareality.sk", hours: "Po – Pi 8:00 – 16:30", ico: "50 801 457", dom: "www.alphareality.sk",
    soc: { fb: "facebook.com/alpharealit", ig: "instagram.com/alphareality.sk", yt: "youtube.com/@alpharealitysk", li: "", tt: "" } },
  team: { m1: { on: true, foto: "" }, m2: { on: true, foto: "" }, m3: { on: true, foto: "" } },
  rev: { url: "", rating: "", count: "" },
  gdpr: { who: "Alpha Reality s.r.o.", ico: "50 801 457", addr: "Hviezdoslavova 8, 052 01 Spišská Nová Ves", mail: "info@alphareality.sk", dpo: "", bar: "on" },
  ga: "", px: ""
};
var SOC = [["fb", "Facebook", "facebook.com/kancelaria"], ["ig", "Instagram", "instagram.com/kancelaria"], ["yt", "YouTube", "youtube.com/@kancelaria"], ["li", "LinkedIn", "linkedin.com/company/kancelaria"], ["tt", "TikTok", "tiktok.com/@kancelaria"]];

/* ================================================================ stav */
var KEY = "typek-web-kancelarie-navrh-v1";
var S = load();
var UI = { tab: "vzhlad", open: "", add: false, slide: 0, dev: "pc", pf: { tr: "vse", k: "vse", m: "vse", loc: "vse" }, allP: false, menu: false, ck: true, ckSet: null, ovl: null, lb: 0, val: { step: 1, typ: "", obec: "Spišská Nová Ves", m2: "", stav: "", meno: "", kont: "", ok: false, err: "" }, kf: { done: false, err: "", komu: "kancelaria", v: {} }, counted: false, libCb: null, fileCb: null, pause: false };
function deep(d, x) {
  if (Array.isArray(d)) return Array.isArray(x) ? x : d;
  if (d && typeof d === "object") { var o = {}; Object.keys(d).forEach(function (k) { o[k] = x && typeof x === "object" && k in x ? deep(d[k], x[k]) : clone(d[k]); }); if (x && typeof x === "object") Object.keys(x).forEach(function (k) { if (!(k in d)) o[k] = x[k]; }); return o; }
  return x === undefined || x === null || typeof x !== typeof d ? d : x;
}
function load() {
  try { var raw = localStorage.getItem(KEY); if (raw) { var x = deep(DEF, JSON.parse(raw)); x.order = x.order.filter(function (k) { return SEC[k] || x.custom[k]; }); return x; } } catch (e) { /* bez uloženia */ }
  return clone(DEF);
}
var saveT = 0;
function save() { clearTimeout(saveT); saveT = setTimeout(function () { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* plné úložisko – ukážka ide ďalej */ } }, 300); }
function get(path) { return path.split(".").reduce(function (o, k) { return o == null ? undefined : o[k]; }, S); }
function set(path, v) { var ks = path.split("."), o = S; for (var i = 0; i < ks.length - 1; i++) o = o[ks[i]]; o[ks[ks.length - 1]] = v; save(); }
function toast(t) { var el = $("toast"); el.textContent = t; el.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(function () { el.hidden = true; }, 3600); }

/* ================================================================ paleta */
function pal() {
  var B = BGS.find(function (b) { return b.id === S.bg; }) || BGS[0];
  function fix(c) { if (B.dark && con(c, B.bg) < 3) return mix(c, "#FFFFFF", 0.45); if (!B.dark && con(c, B.bg) < 1.45) return rdAll(c, [B.bg], "#1A2128", 1.45); return c; }
  var col = COLORS.find(function (c) { return c.id === S.color; });
  var A = fitOn(fix(S.color === "vlastna" && isHex(S.cc) ? S.cc : (col ? col.c : "#DAB967")));
  var Bc = fitOn(isHex(S.b2) ? (B.dark && con(S.b2, B.bg) < 1.6 ? mix(S.b2, "#FFFFFF", 0.2) : S.b2) : A[0]);
  var a = A[0], b = Bc[0], soft = mix(a, B.bg, B.dark ? 0.8 : 0.84), bsoft = mix(b, B.bg, B.dark ? 0.8 : 0.86), tx = B.dark ? "#FFFFFF" : "#000000";
  var all = [B.bg, B.surf, soft, bsoft], fg = rdAll(B.fg, all, tx, 7);
  return { bg: B.bg, surf: B.surf, line: B.line, dark: B.dark, fg: fg, muted: rdAll(B.muted, all, fg, 4.5), a: a, onA: A[1], soft: soft, b: b, onB: Bc[1], bsoft: bsoft,
    at: rdAll(a, [B.bg, B.surf, soft], tx, 4.5), bt: rdAll(b, [B.bg, B.surf, bsoft], tx, 4.5),
    aOnB: con(a, b) >= 3 ? a : Bc[1],
    hc: S.hcol === "a" ? rdAll(a, [B.bg, B.surf, bsoft], tx, 3.2) : S.hcol === "b" ? rdAll(b, [B.bg, B.surf, bsoft], tx, 3.2) : fg,
    err: rdAll("#C2412D", [B.bg, B.surf], tx, 4.5) };
}
function trk() { var ga = String(S.ga || "").trim().toUpperCase(), fb = String(S.px || "").trim().replace(/\s+/g, ""); return { ga: /^G-[A-Z0-9]{4,14}$/.test(ga) ? ga : "", fb: /^\d{8,20}$/.test(fb) ? fb : "" }; }

/* ================================================================ PANEL – stavebné kúsky */
function fld(lab, path, o) {
  o = o || {}; var v = get(path); v = v == null ? "" : v;
  var inner = o.ta ? '<textarea data-k="' + path + '" rows="' + (o.ta === true ? 3 : o.ta) + '"' + (o.ph ? ' placeholder="' + esc(o.ph) + '"' : "") + ">" + esc(v) + "</textarea>"
    : '<input type="' + (o.type || "text") + '" data-k="' + path + '" value="' + esc(v) + '"' + (o.ph ? ' placeholder="' + esc(o.ph) + '"' : "") + (o.max ? ' maxlength="' + o.max + '"' : "") + (o.mode ? ' inputmode="' + o.mode + '"' : "") + ">";
  return '<label class="f' + (o.half ? " half" : "") + '"><span>' + lab + "</span>" + inner + "</label>";
}
function sel(lab, path, opts, o) {
  o = o || {}; var v = String(get(path));
  return '<label class="f' + (o.half ? " half" : "") + '"><span>' + lab + '</span><select data-k="' + path + '"' + (o.rp ? " data-rp" : "") + ">" + opts.map(function (x) { return '<option value="' + esc(x[0]) + '"' + (String(x[0]) === v ? " selected" : "") + ">" + esc(x[1]) + "</option>"; }).join("") + "</select></label>";
}
function seg(path, opts, lab) {
  var v = String(get(path));
  return (lab ? '<div class="lab">' + lab + "</div>" : "") + '<div class="seg" role="group">' + opts.map(function (x) { return '<button type="button" data-seg="' + path + '" data-v="' + esc(x[0]) + '" aria-pressed="' + (String(x[0]) === v) + '">' + esc(x[1]) + "</button>"; }).join("") + "</div>";
}
function onoff(path, lab) { return seg(path, [["on", "Zapnuté"], ["off", "Vypnuté"]], lab); }
function grp(h, body, id) { return '<section class="grp"' + (id ? ' id="' + id + '"' : "") + "><h2>" + h + "</h2>" + body + "</section>"; }
function icb(act, ic, lab, extra) { return '<button type="button" class="ic" data-act="' + act + '" aria-label="' + esc(lab) + '" title="' + esc(lab) + '"' + (extra || "") + ">" + SV(IC[ic], 2.2) + "</button>"; }
function targets(withUrl) {
  var t = [["ponuky", "Ponuky"], ["okancelarii", "O kancelárii"], ["sluzby", "Služby"], ["odhad", "Odhad hodnoty"], ["tim", "Náš tím"], ["recenzie", "Recenzie"], ["galeria", "Galéria"], ["clanky", "Články"], ["kontakt", "Kontakt"]];
  S.order.forEach(function (k) { if (S.custom[k]) t.push([k, (S.custom[k].t || "Vlastná sekcia") + " (vlastná)"]); });
  if (withUrl) t.push(["url", "Vlastný odkaz…"]);
  return t;
}
function tplSvg(id) {
  var g = "#C9BFAE", d = "#8E9AA6", a = "#DB9522", bg = "#FFFDF8";
  var m = {
    klasicka: '<rect width="120" height="80" fill="' + bg + '"/><rect width="120" height="9" fill="#fff"/><rect y="9" width="120" height="40" fill="' + d + '"/><rect x="8" y="20" width="44" height="5" rx="2" fill="#fff"/><rect x="8" y="29" width="30" height="3" rx="1.5" fill="#fff" opacity=".7"/><rect x="8" y="36" width="16" height="5" rx="2.5" fill="' + a + '"/><rect x="16" y="44" width="88" height="10" rx="3" fill="#fff" stroke="' + g + '"/><rect x="8" y="60" width="32" height="16" rx="2" fill="' + g + '"/><rect x="44" y="60" width="32" height="16" rx="2" fill="' + g + '"/><rect x="80" y="60" width="32" height="16" rx="2" fill="' + g + '"/>',
    portal: '<rect width="120" height="80" fill="' + bg + '"/><rect width="120" height="52" fill="' + d + '"/><rect x="34" y="14" width="52" height="5" rx="2" fill="#fff"/><rect x="44" y="23" width="32" height="3" rx="1.5" fill="#fff" opacity=".7"/><rect x="18" y="33" width="84" height="11" rx="3" fill="#fff"/><rect x="88" y="35" width="12" height="7" rx="2" fill="' + a + '"/><rect x="8" y="58" width="32" height="18" rx="2" fill="' + g + '"/><rect x="44" y="58" width="32" height="18" rx="2" fill="' + g + '"/><rect x="80" y="58" width="32" height="18" rx="2" fill="' + g + '"/>',
    rozdelena: '<rect width="120" height="80" fill="' + bg + '"/><rect width="120" height="9" fill="#fff"/><rect x="8" y="20" width="44" height="6" rx="2" fill="#1E2A35"/><rect x="8" y="30" width="36" height="3" rx="1.5" fill="' + g + '"/><rect x="8" y="36" width="30" height="3" rx="1.5" fill="' + g + '"/><rect x="8" y="44" width="18" height="6" rx="3" fill="' + a + '"/><rect x="60" y="14" width="52" height="44" rx="6" fill="' + d + '"/><rect x="8" y="64" width="32" height="12" rx="2" fill="' + g + '"/><rect x="44" y="64" width="32" height="12" rx="2" fill="' + g + '"/><rect x="80" y="64" width="32" height="12" rx="2" fill="' + g + '"/>',
    luxusna: '<rect width="120" height="80" fill="#1A2128"/><rect width="120" height="62" fill="#5F6B76"/><rect x="38" y="20" width="44" height="6" rx="1" fill="#fff"/><rect x="48" y="30" width="24" height="2" rx="1" fill="#fff" opacity=".7"/><rect x="24" y="44" width="72" height="9" rx="1" fill="#fff" opacity=".35"/><rect x="8" y="66" width="32" height="14" fill="' + g + '"/><rect x="44" y="66" width="32" height="14" fill="' + g + '"/><rect x="80" y="66" width="32" height="14" fill="' + g + '"/>',
    mestska: '<rect width="120" height="80" fill="' + bg + '"/><rect width="120" height="9" fill="#1E2A35"/><rect y="9" width="120" height="44" fill="' + d + '"/><rect x="8" y="28" width="60" height="25" fill="' + bg + '"/><rect x="14" y="33" width="44" height="6" fill="#1E2A35"/><rect x="14" y="43" width="16" height="5" fill="' + a + '"/><rect x="8" y="60" width="32" height="16" fill="' + g + '"/><rect x="44" y="60" width="32" height="16" fill="' + g + '"/><rect x="80" y="60" width="32" height="16" fill="' + g + '"/>' };
  return '<svg viewBox="0 0 120 80" aria-hidden="true">' + m[id] + "</svg>";
}

/* ================================================================ PANEL – záložky */
var TABS = [["vzhlad", "Vzhľad"], ["uvod", "Úvod"], ["sekcie", "Sekcie"], ["kancelaria", "Kancelária"], ["napojenia", "Napojenia"]];
function renderTabs() {
  $("tabs").innerHTML = TABS.map(function (t) { return '<button type="button" class="tab" role="tab" data-tab="' + t[0] + '" aria-selected="' + (UI.tab === t[0]) + '">' + t[1] + "</button>"; }).join("");
}
function renderPanel(keepScroll) {
  var pn = $("panel"), y = pn.scrollTop, wy = window.scrollY;
  renderTabs();
  var h = { vzhlad: paneVzhlad, uvod: paneUvod, sekcie: paneSekcie, kancelaria: paneKancelaria, napojenia: paneNapojenia }[UI.tab]();
  $("pane").innerHTML = '<div class="pane">' + h + "</div>";
  if (keepScroll) { pn.scrollTop = y; window.scrollTo(0, wy); }
}

function paneVzhlad() {
  var col = COLORS.find(function (c) { return c.id === S.color; });
  return grp("Šablóna", '<div class="tpls">' + TPLS.map(function (t) { return '<button type="button" class="tpl" data-tpl="' + t.id + '" aria-pressed="' + (S.tpl === t.id) + '">' + tplSvg(t.id) + "<b>" + t.name + "</b><small>" + t.desc + "</small></button>"; }).join("") + '</div><p class="sub">Šablóna nastaví odporúčané písmo, hlavičku a tvar. Potom si všetko dolaď nižšie.</p><div><button type="button" class="b b-soft b-sm" data-act="mix">Zamiešať vzhľad</button></div>') +
    grp("Farebné sady", '<div class="sets">' + SETS.map(function (s) { return '<button type="button" class="set" data-set="' + s.id + '" aria-pressed="' + (S.set === s.id) + '"><span class="trio"><i style="background:' + s.a + '"></i><i style="background:' + s.b + '"></i><i style="background:' + (BGS.find(function (b) { return b.id === s.bg; }) || BGS[0]).bg + ';box-shadow:inset 0 0 0 1px #E4DACA"></i></span><span>' + s.name + "</span></button>"; }).join("") + '</div><p class="sub">Celý web zladený jedným klikom. Sada Alpha zlatá je podľa loga kancelárie.</p>') +
    grp("Hlavná farba <output>" + esc(col ? col.name : "Vlastná") + "</output>", '<div class="sw">' + COLORS.map(function (c) { return '<button type="button" class="dot" style="--sw:' + c.c + '" data-col="' + c.id + '" aria-label="' + c.name + '" title="' + c.name + '" aria-pressed="' + (S.color === c.id) + '"></button>'; }).join("") + "</div>" +
      '<div class="own-row"><input type="color" data-hex="cc" value="' + esc(isHex(S.cc) ? S.cc : "#DAB967") + '" aria-label="Vybrať hlavnú farbu"><input type="text" data-hex="cc" value="' + esc(S.cc) + '" maxlength="7" spellcheck="false" aria-label="Kód hlavnej farby"><small>vlastná, napríklad z loga</small></div>') +
    grp("Doplnková farba", '<div class="own-row"><input type="color" data-hex="b2" value="' + esc(isHex(S.b2) ? S.b2 : "#1E2A35") + '" aria-label="Vybrať doplnkovú farbu"><input type="text" data-hex="b2" value="' + esc(S.b2) + '" maxlength="7" spellcheck="false" aria-label="Kód doplnkovej farby" placeholder="ako hlavná"><button type="button" class="lbtn" data-act="b2clear">Zrušiť</button></div><p class="sub">Pás s číslami, ikony služieb, malé nadpisy a odznaky.</p>') +
    grp("Farba nadpisov", seg("hcol", [["text", "Ako text"], ["a", "Hlavná"], ["b", "Doplnková"]])) +
    grp("Písmo", seg("font", FONTS.map(function (f) { return [f.id, f.name]; }))) +
    grp("Pozadie", seg("bg", BGS.map(function (b) { return [b.id, b.name]; }))) +
    grp("Hlavička", seg("head", [["svetla", "Svetlá"], ["tmava", "Tmavá"], ["priehladna", "Na fotke"]]) + '<p class="sub">Na fotke: hlavička je priehľadná cez titulné fotky a pri posúvaní stmavne. Pri šablóne Rozdelená sa použije svetlá.</p>') +
    grp("Tlačidlá", seg("btn", [["pill", "Pilulky"], ["round", "Zaoblené"], ["square", "Hranaté"]])) +
    grp("Zaoblenie rohov <output>" + S.r + " px</output>", '<input type="range" min="0" max="28" step="1" data-k="r" data-num value="' + S.r + '" aria-label="Zaoblenie rohov">') +
    grp("Animácie", onoff("anim") + '<p class="sub">Pomalé priblíženie fotiek v úvode, nábeh textov a napočítanie čísel.</p>');
}

function paneUvod() {
  var sl = S.hero.slides;
  var list = sl.map(function (s, i) {
    return '<div class="item slide-ed' + (UI.slide === i ? " cur" : "") + '" data-slidei="' + i + '"><div class="item-h"><img class="thumb" src="' + esc(src(s.img, true)) + '" alt=""><b>Titulná fotka ' + (i + 1) + "</b>" +
      icb("sl-up:" + i, "up", "Posunúť vyššie", i === 0 ? " disabled" : "") + icb("sl-down:" + i, "down", "Posunúť nižšie", i === sl.length - 1 ? " disabled" : "") + icb("sl-del:" + i, "trash", "Odstrániť fotku") + "</div>" +
      '<div class="row-btns"><button type="button" class="b b-soft b-sm" data-act="sl-img:' + i + '">Zmeniť fotku</button><button type="button" class="b b-soft b-sm" data-act="sl-show:' + i + '">Ukázať v ukážke</button></div>' +
      '<div class="fields">' + fld("Nadpis", "hero.slides." + i + ".t", { ta: 2 }) + fld("Text pod nadpisom", "hero.slides." + i + ".l", { ta: 2 }) +
      fld("Tlačidlo", "hero.slides." + i + ".b", { half: 1, ph: "Viac informácií" }) + sel("Kam vedie", "hero.slides." + i + ".go", targets(true), { half: 1, rp: 1 }) +
      (s.go === "url" ? fld("Odkaz tlačidla", "hero.slides." + i + ".u", { ph: "napr. alphareality.sk/vykup" }) : "") +
      fld("Druhé tlačidlo (nepovinné)", "hero.slides." + i + ".b2", { half: 1, ph: "napr. Pozrieť ponuky" }) + sel("Kam vedie", "hero.slides." + i + ".go2", targets(true), { half: 1, rp: 1 }) +
      (s.go2 === "url" ? fld("Odkaz druhého tlačidla", "hero.slides." + i + ".u2", { ph: "napr. alphareality.sk/kariera" }) : "") + "</div></div>";
  }).join("");
  return grp("Titulné fotky <output>" + sl.length + "</output>", '<p class="note">Fotky v úvode sa striedajú. Každá má vlastný nadpis, text a tlačidlo, napríklad <b>Viac informácií</b>. Tlačidlo vedie na sekciu webu alebo na vlastný odkaz.</p><div class="items">' + list + '</div><button type="button" class="addb" data-act="sl-add">+ Pridať titulnú fotku</button>') +
    grp("Malý nápis nad nadpisom", '<div class="fields">' + fld("Nápis", "hero.eb", { ph: "napr. Realitná kancelária pre Spiš" }) + "</div>") +
    grp("Striedanie fotiek", onoff("hero.auto") + '<div class="lab">Každá fotka svieti <output id="intOut">' + S.hero.int + ' s</output></div><input type="range" min="3" max="12" step="1" data-k="hero.int" data-num value="' + S.hero.int + '" aria-label="Ako dlho svieti jedna fotka">') +
    grp("Stmavenie fotiek <output>" + S.hero.dim + " %</output>", '<input type="range" min="0" max="75" step="1" data-k="hero.dim" data-num value="' + S.hero.dim + '" aria-label="Stmavenie fotiek"><p class="sub">Biely text na fotke je čitateľný od zhruba 35 %.</p>') +
    grp("Zarovnanie textu", seg("hero.align", [["vlavo", "Vľavo"], ["stred", "Na stred"]])) +
    grp("Výška úvodu", seg("hero.hh", [["cela", "Celá obrazovka"], ["vysoka", "Vysoký"], ["stredna", "Nižší"]])) +
    grp("Vyhľadávanie ponúk", onoff("hero.search") + '<p class="sub">Návštevník si vyberie predaj alebo prenájom, druh a obec a web mu hneď ukáže zodpovedajúce ponuky.</p>');
}

function paneSekcie() {
  var rows = S.order.map(function (k, i) {
    var c = S.custom[k], nm = c ? (c.t || "Vlastná sekcia") : SEC[k].n, ds = c ? "vlastná sekcia · " + (CTYPES.find(function (t) { return t[0] === c.typ; }) || [0, "", ""])[1].toLowerCase() : SEC[k].d, on = !!S.on[k], op = UI.open === k;
    return '<li class="srow' + (on ? "" : " off") + '" data-row="' + k + '"><div class="shd"><span class="grip" aria-hidden="true">' + SV(IC.grip) + '</span><span class="sw-t"><input type="checkbox" data-on="' + k + '"' + (on ? " checked" : "") + ' aria-label="Zobraziť sekciu ' + esc(nm) + '"><span></span></span>' +
      '<button type="button" class="snm" data-act="sec-open:' + k + '"><b>' + esc(nm) + "</b><small>" + esc(ds) + "</small></button>" +
      icb("sec-up:" + k, "up", "Posunúť vyššie", i === 0 ? " disabled" : "") + icb("sec-down:" + k, "down", "Posunúť nižšie", i === S.order.length - 1 ? " disabled" : "") +
      '<button type="button" class="ic" data-act="sec-open:' + k + '" aria-expanded="' + op + '" aria-label="Upraviť sekciu" title="Upraviť sekciu">' + SV(IC.edit, 2.2) + "</button></div>" +
      (op ? '<div class="sed">' + secEd(k) + "</div>" : "") + "</li>";
  }).join("");
  var add = UI.add ? '<div class="types">' + CTYPES.map(function (t) { return '<button type="button" data-act="c-add:' + t[0] + '"><b>' + t[1] + "</b><small>" + t[2] + "</small></button>"; }).join("") + '</div><button type="button" class="lbtn" data-act="c-addx">Zrušiť</button>' : '<button type="button" class="addb" data-act="c-addopen">+ Pridať vlastnú sekciu</button>';
  return grp("Sekcie webu", '<p class="note">Zapni, čo chceš mať na webe, a poskladaj poradie. Ťahaj za úchyt vľavo alebo použi šípky. Ceruzkou otvoríš nastavenie sekcie. V ukážke vieš sekciu otvoriť aj tlačidlom <b>Upraviť sekciu</b>.</p><ul class="secs" id="secs">' + rows + "</ul>" + add);
}

function secEd(k) {
  var c = S.custom[k];
  if (c) {
    var b = '<div class="fields">' + sel("Typ sekcie", "custom." + k + ".typ", CTYPES.map(function (t) { return [t[0], t[1]]; }), { rp: 1 }) + fld("Nadpis", "custom." + k + ".t") + (c.typ !== "fotky" ? fld("Text", "custom." + k + ".text", { ta: 4 }) : "") + "</div>";
    if (c.typ === "txph") b += '<div class="row-btns"><img class="thumb" src="' + esc(src(c.img || "dom-obyvacka", true)) + '" alt=""><button type="button" class="b b-soft b-sm" data-act="img:custom.' + k + '.img">Zmeniť fotku</button></div>';
    if (c.typ === "fotky") b += galEd("custom." + k + ".imgs");
    if (c.typ !== "fotky") b += '<div class="fields">' + fld("Tlačidlo (nepovinné)", "custom." + k + ".b", { half: 1, ph: "napr. Viac informácií" }) + sel("Kam vedie", "custom." + k + ".go", targets(true), { half: 1, rp: 1 }) + (c.go === "url" ? fld("Odkaz", "custom." + k + ".u") : "") + "</div>";
    b += seg("custom." + k + ".bgs", [["", "Bežné"], ["alt", "Tónované"], ["col", "Vo farbe"]], "Pozadie sekcie");
    b += seg("custom." + k + ".menu", [["on", "V menu"], ["off", "Nie v menu"]], "Hlavné menu") + (c.menu === "on" ? '<div class="fields">' + fld("Názov v menu", "custom." + k + ".ml", { max: 18 }) + "</div>" : "");
    return b + '<div><button type="button" class="lbtn" data-act="c-del:' + k + '" style="color:var(--c-danger)">Odstrániť túto sekciu</button></div>';
  }
  var p = k + ".";
  var head = '<div class="fields">' + fld("Malý nadpis", p + "eb", { half: 1 }) + fld("Nadpis", p + "t", { half: 1 }) + "</div>";
  switch (k) {
    case "cisla":
      return '<p class="note">Ku každému číslu napíš vlastný popis. Počet ponúk a maklérov vie Týpek zrátať sám, hodnotenie sa vezme z Google. Prázdne riadky sa nezobrazia.</p>' +
        S.cisla.rows.map(function (r, i) { return '<div class="item"><div class="item-h"><b>Číslo ' + (i + 1) + "</b>" + icb("ls-del:cisla.rows:" + i, "trash", "Odstrániť") + '</div><div class="fields">' +
          sel("Odkiaľ", "cisla.rows." + i + ".typ", [["vlastne", "Vlastné číslo"], ["ponuky", "Počet ponúk z Týpka"], ["makleri", "Počet maklérov z Týpka"], ["google", "Hodnotenie na Google"]], { rp: 1 }) +
          (r.typ === "vlastne" ? fld("Číslo", "cisla.rows." + i + ".n", { half: 1, ph: "napr. 500+" }) : "") + fld("Popis", "cisla.rows." + i + ".t", { half: r.typ === "vlastne" ? 1 : 0, ph: "napr. predaných nehnuteľností" }) + "</div></div>"; }).join("") +
        (S.cisla.rows.length < 4 ? '<button type="button" class="addb" data-act="ls-add:cisla.rows">+ Pridať číslo</button>' : "") + seg("cisla.st", [["pas", "Pás vo farbe"], ["karty", "Karty"], ["jedno", "Jednoduché"]], "Vzhľad");
    case "ponuky":
      return '<p class="note">Ponuky sa na webe berú samy z Týpka od <b>všetkých maklérov kancelárie</b>. Na karte je meno makléra. V návrhu sú ilustračné ponuky.</p>' + head + '<div class="fields">' + fld("Text pod nadpisom", p + "l") + "</div>" +
        seg(p + "cnt", [["3", "3"], ["6", "6"], ["9", "9"], ["vse", "Všetky"]], "Koľko ponúk ukázať hneď") + seg(p + "lay", [["mriezka", "Mriežka"], ["posuvnik", "Posúvanie"], ["zoznam", "Zoznam"]], "Rozloženie") +
        seg(p + "sort", [["nove", "Najnovšie"], ["lacne", "Od najlacnejšej"], ["drahe", "Od najdrahšej"]], "Poradie") + onoff(p + "filt", "Filtre nad ponukami (druh, predaj a prenájom, maklér)") + onoff(p + "agent", "Maklér na karte ponuky");
    case "okancelarii":
      return head + '<div class="fields">' + fld("Text", p + "text", { ta: 6 }) + fld("Výhody (každá na nový riadok)", p + "pts", { ta: 4 }) + fld("Tlačidlo", p + "b", { half: 1 }) + sel("Kam vedie", p + "go", targets(false), { half: 1 }) + "</div>" +
        '<div class="row-btns"><img class="thumb" src="' + esc(src(S.okancelarii.img, true)) + '" alt=""><button type="button" class="b b-soft b-sm" data-act="img:okancelarii.img">Zmeniť fotku</button></div>' + onoff(p + "badge", "Odznak s prvým číslom na fotke");
    case "sluzby":
      return head + '<div class="fields">' + fld("Text pod nadpisom", p + "l") + '</div><div class="items">' + S.sluzby.items.map(function (s, i) {
        return '<div class="item"><div class="item-h"><b>' + esc(s.t || "Služba") + "</b>" + icb("ls-up:sluzby.items:" + i, "up", "Vyššie", i === 0 ? " disabled" : "") + icb("ls-del:sluzby.items:" + i, "trash", "Odstrániť") + '</div><div class="fields">' + sel("Ikona", "sluzby.items." + i + ".ic", SVC_IC, { half: 1 }) + fld("Názov", "sluzby.items." + i + ".t", { half: 1 }) + fld("Popis", "sluzby.items." + i + ".d", { ta: 2 }) + "</div></div>"; }).join("") +
        '</div><button type="button" class="addb" data-act="ls-add:sluzby.items">+ Pridať službu</button>';
    case "odhad":
      return head + '<div class="fields">' + fld("Text", p + "text", { ta: 3 }) + fld("Kroky vľavo (každý na nový riadok)", p + "kroky", { ta: 3 }) +
        sel("Komu chodia dopyty", p + "komu", [["kancelaria", "Kancelárii (" + S.k.mail + ")"]].concat(AG.map(function (a) { return [a.id, a.n]; })).concat([["rotacia", "Maklérom po rade"]])) + '</div><p class="note">Dopyt sa v Týpku uloží ako nový klient a príde upozornenie. Formulár má tri kroky: druh, údaje o nehnuteľnosti a kontakt.</p>';
    case "tim":
      return '<p class="note">Makléri sa berú z Týpka. Kto sa ukáže na webe, nastavíš v záložke <b>Kancelária</b>.</p>' + head + '<div class="fields">' + fld("Text pod nadpisom", p + "l", { ta: 2 }) + "</div>" + onoff(p + "web", "Odkaz na osobný web makléra") + onoff(p + "kont", "Tlačidlo Napísať maklérovi");
    case "ocenenia":
      return head + '<div class="items">' + S.ocenenia.items.map(function (a, i) {
        return '<div class="item"><div class="item-h"><b>' + esc(a.t || "Ocenenie") + "</b>" + icb("ls-up:ocenenia.items:" + i, "up", "Vyššie", i === 0 ? " disabled" : "") + icb("ls-del:ocenenia.items:" + i, "trash", "Odstrániť") + '</div><div class="fields">' + fld("Názov", "ocenenia.items." + i + ".t") + fld("Rok alebo skratka", "ocenenia.items." + i + ".y", { half: 1 }) + fld("Kto ho udelil", "ocenenia.items." + i + ".d", { half: 1 }) + "</div></div>"; }).join("") +
        '</div><button type="button" class="addb" data-act="ls-add:ocenenia.items">+ Pridať ocenenie</button><p class="note">Dve ocenenia v návrhu sú len vzor. Doplň skutočné alebo ich odstráň.</p>';
    case "recenzie":
      return '<p class="note">Odkaz na Google profil kancelárie vložíš v záložke <b>Napojenia</b>. Recenzie sa potom načítajú samy.</p>' + head + seg(p + "cnt", [["3", "3 recenzie"], ["6", "6 recenzií"]], "Koľko ukázať") + onoff(p + "write", "Tlačidlo Napísať recenziu");
    case "galeria":
      return head + seg(p + "lay", [["mriezka", "Mriežka"], ["mozaika", "Mozaika"], ["posuvnik", "Posúvanie"]], "Rozloženie") + galEd("galeria.imgs");
    case "clanky":
      return '<p class="note">Články sa berú z Týpka. K osobnému webu a balíku Kancelária komplet je 1 realitný článok mesačne v cene.</p>' + head + seg(p + "cnt", [["3", "3 články"], ["6", "6 článkov"]], "Koľko ukázať");
    case "kontakt":
      return '<p class="note">Adresu, telefón a hodiny zmeníš v záložke <b>Kancelária</b>.</p>' + head + '<div class="fields">' + fld("Text pod nadpisom", p + "l", { ta: 2 }) + "</div>" + onoff(p + "form", "Kontaktný formulár") + onoff(p + "map", "Mapa") + onoff(p + "hours", "Otváracie hodiny");
  }
  return "";
}
function galEd(path) {
  var a = get(path) || [];
  return '<div class="lab">Fotky (' + a.length + ')</div><div class="gthumbs">' + a.map(function (v, i) { return '<div><img src="' + esc(src(v, true)) + '" alt=""><button type="button" data-act="g-del:' + path + ":" + i + '" aria-label="Odstrániť fotku">' + SV(IC.x, 3) + "</button></div>"; }).join("") +
    '</div><div class="row-btns"><button type="button" class="b b-ink b-sm" data-act="g-up:' + path + '">Nahrať viac fotiek</button><button type="button" class="b b-soft b-sm" data-act="g-lib:' + path + '">Z knižnice</button></div><p class="note">Naraz môžeš vybrať aj viac fotiek. Ťažké fotky sa samy zmenšia.</p>';
}

function paneKancelaria() {
  var k = S.k;
  return grp("Logo", '<div class="logo-prev"><img src="' + esc(k.logo) + '" alt="Logo kancelárie"><div class="row-btns"><button type="button" class="b b-gold b-sm" data-act="logo-up">Nahrať logo</button>' + (k.logo !== DEF.k.logo ? '<button type="button" class="b b-soft b-sm" data-act="logo-reset">Pôvodné</button>' : "") + '</div></div><p class="sub">Najlepšie PNG s priehľadným pozadím. Ikona v záložke prehliadača sa vytvorí z loga.</p>') +
    grp("Údaje kancelárie", '<div class="fields">' + fld("Názov kancelárie", "k.name") + fld("Adresa kancelárie", "k.addr") + fld("Telefón", "k.tel", { half: 1, type: "tel" }) + fld("E-mail", "k.mail", { half: 1, type: "email" }) + fld("Otváracie hodiny", "k.hours", { half: 1 }) + fld("IČO", "k.ico", { half: 1 }) + fld("Adresa webu", "k.dom", { ph: "www.kancelaria.sk" }) + "</div>") +
    grp("Makléri na webe", '<p class="note">Makléri a ich ponuky sa berú z Týpka. Vypnutý maklér sa na webe neukáže ani so svojimi ponukami.</p>' + AG.map(function (a) {
      var t = S.team[a.id] || { on: true, foto: "" };
      return '<div class="agent-r"><span class="av">' + (t.foto ? '<img src="' + esc(t.foto) + '" alt="">' : esc(initials(a.n))) + "</span><div><b>" + esc(a.n) + "</b><small>" + esc(a.r) + " · " + pon(LST.filter(function (x) { return x.m === a.id; }).length) + '</small></div><button type="button" class="lbtn" data-act="foto:' + a.id + '">Fotka</button><span class="sw-t"><input type="checkbox" data-agent="' + a.id + '"' + (t.on ? " checked" : "") + ' aria-label="Zobraziť makléra ' + esc(a.n) + ' na webe"><span></span></span></div>'; }).join("")) +
    grp("Sociálne siete", '<p class="note">Ikony sa ukážu v kontakte a v pätičke. Prázdne sa nezobrazia.</p><div class="fields">' + SOC.map(function (s) { return fld(s[1], "k.soc." + s[0], { ph: s[2] }); }).join("") + "</div>");
}

function paneNapojenia() {
  var t = trk();
  function st(ok, val, msgOk, msgNo, bad) { return '<div class="stat ' + (ok ? "ok" : val ? "err" : "no") + '" id="st-' + bad + '"><i></i>' + (ok ? msgOk : val ? msgNo : "Nie je nastavené") + "</div>"; }
  return grp("Recenzie z Google", '<div class="fields">' + fld("Odkaz na Google profil kancelárie", "rev.url", { ph: "napr. g.page/r/… alebo odkaz z Google Máp" }) + fld("Hodnotenie", "rev.rating", { half: 1, ph: "napr. 4,9", mode: "decimal" }) + fld("Počet recenzií", "rev.count", { half: 1, ph: "napr. 120", mode: "numeric" }) + "</div>" +
      '<div><button type="button" class="b b-soft b-sm" data-act="rev-load">Načítať recenzie z Google</button></div><p class="note">Na ostrom webe sa hodnotenie, počet aj najnovšie recenzie načítajú samy z odkazu a raz denne sa obnovia. V návrhu sú ukážkové texty, hodnotenie a počet zatiaľ dopíš ručne.</p>') +
    grp("Ochrana osobných údajov (GDPR)", '<p class="note">Z týchto údajov sa sama vytvorí stránka <b>Ochrana osobných údajov</b>, súhlas pri formulároch a lišta cookies.</p><div class="fields">' + fld("Prevádzkovateľ (firma)", "gdpr.who") + fld("IČO", "gdpr.ico", { half: 1 }) + fld("E-mail pre otázky k údajom", "gdpr.mail", { half: 1, type: "email" }) + fld("Sídlo", "gdpr.addr") + fld("Zodpovedná osoba (nepovinné)", "gdpr.dpo", { ph: "meno a e-mail, ak ju máte" }) + "</div>" +
      onoff("gdpr.bar", "Lišta cookies") + '<div><button type="button" class="b b-soft b-sm" data-act="gdpr-show">Pozrieť stránku Ochrana osobných údajov</button></div>') +
    grp("Google Analytics", '<div class="fields">' + fld("Identifikátor merania", "ga", { ph: "G-XXXXXXXXXX", max: 20 }) + st(t.ga, S.ga.trim(), "Zapne sa až po súhlase návštevníka s cookies", "Identifikátor má tvar G- a písmená s číslami, napríklad G-1A2B3C4D5E", "ga") + '</div><p class="note">Nájdeš ho v Google Analytics v časti Správca → Toky údajov.</p>') +
    grp("Meta Pixel (Facebook)", '<div class="fields">' + fld("ID Pixelu", "px", { ph: "napr. 123456789012345", max: 24, mode: "numeric" }) + st(t.fb, S.px.trim(), "Zapne sa až po súhlase návštevníka s cookies", "ID Pixelu sú len číslice, napríklad 123456789012345", "px") + '</div><p class="note">Nájdeš ho v Meta Business Suite v Správcovi udalostí. Pixel meria reklamy a umožní cieliť na ľudí, ktorí boli na webe.</p>');
}

/* ================================================================ PANEL – udalosti */
var panel = $("panel");
panel.addEventListener("click", function (e) {
  var t = e.target.closest("button"); if (!t || !panel.contains(t)) return;
  var d = t.dataset;
  if (d.tab) { UI.tab = d.tab; UI.open = ""; UI.add = false; renderPanel(); panel.scrollTop = 0; return; }
  if (d.seg) { var v = d.v; set(d.seg, v); if (d.seg === "hero.auto") sched(); renderPanel(true); render(); return; }
  if (d.tpl) { var T = TPLS.find(function (x) { return x.id === d.tpl; }); S.tpl = T.id; S.head = T.p.head; S.font = T.p.font; S.r = T.p.r; S.btn = T.p.btn; S.hero.align = T.p.align; S.hero.hh = T.p.hh; if (T.id === "luxusna") S.hero.dim = Math.max(S.hero.dim, 50); save(); renderPanel(true); render(); toTop(); return; }
  if (d.set) { var s = SETS.find(function (x) { return x.id === d.set; }); S.set = s.id; var c = COLORS.find(function (x) { return x.c.toLowerCase() === s.a.toLowerCase(); }); S.color = c ? c.id : "vlastna"; S.cc = s.a; S.b2 = s.b; S.hcol = s.h; S.bg = s.bg; save(); renderPanel(true); render(); return; }
  if (d.col) { S.color = d.col; S.cc = COLORS.find(function (x) { return x.id === d.col; }).c; S.set = ""; save(); renderPanel(true); render(); return; }
  if (d.act) act(d.act, t);
});
panel.addEventListener("input", function (e) {
  var t = e.target;
  if (t.dataset.hex) { var h = okHex(t.value); if (h) { if (t.dataset.hex === "cc") { S.cc = h; S.color = "vlastna"; } else S.b2 = h; S.set = ""; save(); panel.querySelectorAll('[data-hex="' + t.dataset.hex + '"]').forEach(function (x) { if (x !== t) x.value = h; }); render(); } return; }
  var k = t.dataset.k; if (!k) return;
  var v = t.dataset.num !== undefined ? Number(t.value) : t.value;
  set(k, v);
  var out = t.closest(".grp") && t.closest(".grp").querySelector("h2 output");
  if (k === "r" && out) out.textContent = v + " px";
  if (k === "hero.dim" && out) out.textContent = v + " %";
  if (k === "hero.int") { $("intOut").textContent = v + " s"; sched(); }
  if (k === "ga" || k === "px") refreshStat(k);
  var si = t.closest("[data-slidei]"); if (si) showSlide(+si.dataset.slidei, true);
  later();
});
panel.addEventListener("change", function (e) {
  var t = e.target;
  if (t.dataset.on) { S.on[t.dataset.on] = t.checked; save(); t.closest(".srow").classList.toggle("off", !t.checked); render(); return; }
  if (t.dataset.agent) { S.team[t.dataset.agent].on = t.checked; save(); UI.pf.m = "vse"; render(); return; }
  if (t.dataset.rp !== undefined && t.dataset.k) { set(t.dataset.k, t.value); renderPanel(true); render(); }
  if (t.dataset.hex && t.type === "text" && !okHex(t.value)) t.value = get(t.dataset.hex);
});
panel.addEventListener("focusin", function (e) { var si = e.target.closest && e.target.closest("[data-slidei]"); if (si) { UI.pause = true; showSlide(+si.dataset.slidei, true); } });
panel.addEventListener("focusout", function (e) { if (e.target.closest && e.target.closest("[data-slidei]")) { UI.pause = false; sched(); } });
function refreshStat(k) {
  var t = trk(), el = $("st-" + k); if (!el) return; var ok = k === "ga" ? t.ga : t.fb, val = (k === "ga" ? S.ga : S.px).trim();
  el.className = "stat " + (ok ? "ok" : val ? "err" : "no");
  el.innerHTML = "<i></i>" + (ok ? "Zapne sa až po súhlase návštevníka s cookies" : val ? (k === "ga" ? "Identifikátor má tvar G- a písmená s číslami, napríklad G-1A2B3C4D5E" : "ID Pixelu sú len číslice, napríklad 123456789012345") : "Nie je nastavené");
}

/* presúvanie sekcií ťahaním */
var dragK = null;
panel.addEventListener("mousedown", function (e) { var g = e.target.closest && e.target.closest(".grip"); if (g) g.closest(".srow").draggable = true; });
document.addEventListener("mouseup", function () { panel.querySelectorAll(".srow[draggable]").forEach(function (r) { if (!dragK) r.removeAttribute("draggable"); }); });
panel.addEventListener("dragstart", function (e) { var r = e.target.closest && e.target.closest(".srow"); if (!r) return; if (e.target.closest("input,textarea,select")) { e.preventDefault(); return; } dragK = r.dataset.row; r.classList.add("drag"); e.dataTransfer.effectAllowed = "move"; try { e.dataTransfer.setData("text/plain", dragK); } catch (x) { /* nič */ } });
panel.addEventListener("dragover", function (e) { var r = e.target.closest && e.target.closest(".srow"); if (!r || !dragK) return; e.preventDefault(); panel.querySelectorAll(".srow.over").forEach(function (x) { x.classList.remove("over"); }); if (r.dataset.row !== dragK) r.classList.add("over"); });
panel.addEventListener("drop", function (e) { var r = e.target.closest && e.target.closest(".srow"); if (!r || !dragK) return; e.preventDefault(); var to = r.dataset.row; if (to !== dragK) { var o = S.order.filter(function (k) { return k !== dragK; }); o.splice(o.indexOf(to), 0, dragK); S.order = o; save(); } dragK = null; renderPanel(true); render(); });
panel.addEventListener("dragend", function () { dragK = null; panel.querySelectorAll(".srow").forEach(function (x) { x.classList.remove("drag", "over"); x.removeAttribute("draggable"); }); });

function move(arr, i, d) { var j = i + d; if (j < 0 || j >= arr.length) return; var x = arr[i]; arr[i] = arr[j]; arr[j] = x; }
function act(a) {
  var p = a.split(":"), n = p[0], x = p[1], y = p[2];
  if (n === "mix") { var T = TPLS[Math.floor(Math.random() * TPLS.length)], s = SETS[Math.floor(Math.random() * SETS.length)]; S.tpl = T.id; Object.assign(S, { head: T.p.head, r: T.p.r, btn: T.p.btn }); S.hero.align = T.p.align; S.hero.hh = T.p.hh; S.font = FONTS[Math.floor(Math.random() * FONTS.length)].id; S.set = s.id; var c = COLORS.find(function (q) { return q.c.toLowerCase() === s.a.toLowerCase(); }); S.color = c ? c.id : "vlastna"; S.cc = s.a; S.b2 = s.b; S.hcol = s.h; S.bg = s.bg; save(); renderPanel(true); render(); toTop(); return; }
  if (n === "b2clear") { S.b2 = ""; save(); renderPanel(true); render(); return; }
  if (n === "sl-add") { pickImg(function (v) { S.hero.slides.push({ img: v, t: "Nový nadpis titulnej fotky", l: "Krátky text pod nadpisom.", b: "Viac informácií", go: "kontakt", u: "", b2: "", go2: "ponuky", u2: "" }); UI.slide = S.hero.slides.length - 1; save(); renderPanel(true); render(); toTop(); }, true, function (list) { list.forEach(function (v) { S.hero.slides.push({ img: v, t: "Nový nadpis titulnej fotky", l: "Krátky text pod nadpisom.", b: "Viac informácií", go: "kontakt", u: "", b2: "", go2: "ponuky", u2: "" }); }); UI.slide = S.hero.slides.length - 1; save(); renderPanel(true); render(); toTop(); }); return; }
  if (n === "sl-up" || n === "sl-down") { move(S.hero.slides, +x, n === "sl-up" ? -1 : 1); UI.slide = Math.max(0, Math.min(S.hero.slides.length - 1, +x + (n === "sl-up" ? -1 : 1))); save(); renderPanel(true); render(); return; }
  if (n === "sl-del") { if (S.hero.slides.length <= 1) { toast("Aspoň jedna titulná fotka musí ostať."); return; } S.hero.slides.splice(+x, 1); UI.slide = 0; save(); renderPanel(true); render(); return; }
  if (n === "sl-img") { pickImg(function (v) { S.hero.slides[+x].img = v; save(); renderPanel(true); render(); }); return; }
  if (n === "sl-show") { showSlide(+x, true); toTop(); return; }
  if (n === "sec-open") { UI.open = UI.open === x ? "" : x; renderPanel(true); if (UI.open) goSec(x); return; }
  if (n === "sec-up" || n === "sec-down") { var i = S.order.indexOf(x); move(S.order, i, n === "sec-up" ? -1 : 1); save(); renderPanel(true); render(); goSec(x); return; }
  if (n === "c-addopen") { UI.add = true; renderPanel(true); return; }
  if (n === "c-addx") { UI.add = false; renderPanel(true); return; }
  if (n === "c-add") { var id = "c" + Date.now().toString(36); S.custom[id] = { typ: x, t: { text: "Nadpis sekcie", txph: "Nadpis sekcie s fotkou", fotky: "Fotky", vyzva: "Výzva pre návštevníkov" }[x], text: x === "fotky" ? "" : "Sem napíš text sekcie. Odseky oddeľ novým riadkom.", img: "dom-obyvacka", imgs: x === "fotky" ? ["byt-obyvacka", "dom-zahrada", "chata"] : [], b: x === "vyzva" ? "Ozvite sa nám" : "", go: "kontakt", u: "", bgs: x === "vyzva" ? "col" : "", menu: "off", ml: "" };
    var ki = S.order.indexOf("kontakt"); S.order.splice(ki < 0 ? S.order.length : ki, 0, id); S.on[id] = true; UI.add = false; UI.open = id; save(); renderPanel(true); render(); goSec(id); return; }
  if (n === "c-del") { delete S.custom[x]; delete S.on[x]; S.order = S.order.filter(function (k) { return k !== x; }); S.hero.slides.forEach(function (s) { if (s.go === x) s.go = "kontakt"; if (s.go2 === x) s.go2 = "kontakt"; }); UI.open = ""; save(); renderPanel(true); render(); return; }
  if (n === "ls-add") { var arr = get(x), tm = { "cisla.rows": { typ: "vlastne", n: "", t: "" }, "sluzby.items": { ic: "dom", t: "Nová služba", d: "Krátky popis služby." }, "ocenenia.items": { t: "Názov ocenenia", y: "2026", d: "Kto ho udelil" } }[x]; arr.push(tm); save(); renderPanel(true); render(); return; }
  if (n === "ls-del") { get(x).splice(+y, 1); save(); renderPanel(true); render(); return; }
  if (n === "ls-up") { move(get(x), +y, -1); save(); renderPanel(true); render(); return; }
  if (n === "g-del") { get(x).splice(+y, 1); save(); renderPanel(true); render(); return; }
  if (n === "g-up") { upload(function (list) { get(x).push.apply(get(x), list); save(); renderPanel(true); render(); toast(list.length === 1 ? "Fotka pridaná." : "Pridané fotky: " + list.length); }); return; }
  if (n === "g-lib") { pickImg(function (v) { get(x).push(v); save(); renderPanel(true); render(); }, false); return; }
  if (n === "img") { pickImg(function (v) { set(x, v); renderPanel(true); render(); }); return; }
  if (n === "logo-up") { upload(function (l) { S.k.logo = l[0]; save(); renderPanel(true); render(); }, true, true); return; }
  if (n === "logo-reset") { S.k.logo = DEF.k.logo; save(); renderPanel(true); render(); return; }
  if (n === "foto") { upload(function (l) { S.team[x].foto = l[0]; save(); renderPanel(true); render(); }, true); return; }
  if (n === "rev-load") { toast(S.rev.url.trim() ? "V ostrom webe sa teraz načítajú recenzie z Google. V návrhu ostávajú ukážkové." : "Najprv vlož odkaz na Google profil kancelárie."); return; }
  if (n === "gdpr-show") { UI.ovl = "gdpr"; render(); return; }
}

/* fotky: knižnica a nahrávanie */
var lib = $("lib");
function pickImg(cb, allowUp, multiCb) {
  UI.libCb = cb; UI.libMulti = multiCb || null;
  $("libG").innerHTML = LIB.map(function (x) { return '<button type="button" data-pick="' + x[0] + '"><img src="' + src(x[0], true) + '" alt="" loading="lazy"><span>' + esc(x[1]) + "</span></button>"; }).join("");
  if (lib.showModal) lib.showModal(); else lib.setAttribute("open", "");
}
lib.addEventListener("click", function (e) {
  var b = e.target.closest("button"); if (!b) { if (e.target === lib) lib.close(); return; }
  if (b.dataset.pick) { lib.close(); if (UI.libCb) UI.libCb(b.dataset.pick); return; }
  if (b.dataset.libx !== undefined) { lib.close(); return; }
  if (b.dataset.libup !== undefined) { lib.close(); var one = UI.libCb, multi = UI.libMulti; upload(function (l) { if (multi && l.length > 1) multi(l); else l.forEach(function (v) { one(v); }); }); }
});
function upload(cb, single, png) {
  var f = $("file"); f.multiple = !single; f.value = "";
  UI.fileCb = function (files) {
    var out = [], left = files.length; if (!left) return;
    Array.prototype.forEach.call(files, function (file, i) {
      shrink(file, png ? 600 : 1600, png, function (d) { out[i] = d; if (--left === 0) cb(out.filter(Boolean)); });
    });
  };
  f.click();
}
$("file").addEventListener("change", function () { if (UI.fileCb && this.files.length) UI.fileCb(this.files); });
function shrink(file, max, png, cb) {
  var r = new FileReader();
  r.onload = function () { var im = new Image(); im.onload = function () { var k = Math.min(1, max / Math.max(im.width, im.height)), c = document.createElement("canvas"); c.width = Math.round(im.width * k); c.height = Math.round(im.height * k); c.getContext("2d").drawImage(im, 0, 0, c.width, c.height); try { cb(png ? c.toDataURL("image/png") : c.toDataURL("image/jpeg", 0.82)); } catch (e) { cb(r.result); } }; im.onerror = function () { cb(null); }; im.src = r.result; };
  r.onerror = function () { cb(null); };
  r.readAsDataURL(file);
}

/* ================================================================ UKÁŽKA WEBU */
var site = $("site"), stage = $("stage");
function agentsOn() { return AG.filter(function (a) { return (S.team[a.id] || {}).on; }); }
function agent(id) { return AG.find(function (a) { return a.id === id; }); }
function lstAll() { var ids = agentsOn().map(function (a) { return a.id; }); return LST.filter(function (x) { return ids.indexOf(x.m) >= 0; }); }
function av(a, size) { var t = S.team[a.id] || {}; return '<span class="av"' + (size ? ' style="width:' + size + "px;height:" + size + 'px"' : "") + ">" + (t.foto ? '<img src="' + esc(t.foto) + '" alt="">' : esc(initials(a.n))) + "</span>"; }
function gRating() { var v = parseFloat(String(S.rev.rating || "").replace(",", ".")), n = parseInt(String(S.rev.count || "").replace(/\D/g, ""), 10); return v >= 1 && v <= 5 ? { v: (Math.round(v * 10) / 10).toFixed(1).replace(".", ","), n: n > 0 ? n : 0 } : null; }
function secOn(k) { return S.on[k] && (SEC[k] || S.custom[k]); }
function menuItems() {
  var m = [];
  S.order.forEach(function (k) { if (!secOn(k)) return; if (SEC[k] && SEC[k].menu) m.push([k, SEC[k].menu]); else if (S.custom[k] && S.custom[k].menu === "on") m.push([k, S.custom[k].ml || S.custom[k].t]); });
  return m;
}
function btnTo(label, go, u, cls) {
  if (!String(label || "").trim()) return "";
  if (go === "url") return '<a class="btn ' + (cls || "") + '" href="' + esc(url(u) || "#") + '" target="_blank" rel="noopener">' + esc(label) + "</a>";
  return '<button type="button" class="btn ' + (cls || "") + '" data-go="' + esc(go) + '">' + esc(label) + "</button>";
}
function edBtn(k) { return '<button type="button" class="sec-ed" data-edsec="' + k + '">' + SV(IC.edit, 2.2) + "Upraviť sekciu</button>"; }
function sh(o, c) { return '<div class="sh' + (c ? " c" : "") + '">' + (o.eb ? '<span class="eb">' + esc(o.eb) + "</span>" : "") + '<h2 class="h2">' + esc(o.t) + "</h2>" + (o.l ? '<p class="lead">' + esc(o.l) + "</p>" : "") + "</div>"; }

function header() {
  var k = S.k, m = menuItems();
  return '<header class="s-head"><div class="w"><button type="button" class="logo" data-go="top" aria-label="' + esc(k.name) + ', úvod">' + (k.logo ? '<img src="' + esc(k.logo) + '" alt="' + esc(k.name) + '">' : "<b>" + esc(k.name) + "</b>") + "</button>" +
    '<nav class="s-nav" aria-label="Hlavné menu">' + m.map(function (x) { return '<button type="button" data-go="' + x[0] + '">' + esc(x[1]) + "</button>"; }).join("") + "</nav>" +
    (k.tel ? '<a class="s-tel" href="tel:' + esc(k.tel.replace(/\s/g, "")) + '">' + SV(IC.tel, 2.1) + esc(k.tel) + "</a>" : "") +
    (secOn("odhad") ? '<button type="button" class="btn sm s-cta" data-go="odhad">Odhad ceny</button>' : "") +
    '<button type="button" class="burger" data-menu aria-label="Menu" aria-expanded="' + UI.menu + '">' + SV(UI.menu ? IC.x : IC.menu, 2.2) + "</button></div></header>" +
    (UI.menu ? '<div class="mnav" id="mnav">' + m.map(function (x) { return '<button type="button" data-go="' + x[0] + '">' + esc(x[1]) + "</button>"; }).join("") + (k.tel ? '<button type="button" data-go="kontakt">Volajte ' + esc(k.tel) + "</button>" : "") + (secOn("odhad") ? '<button type="button" class="btn" data-go="odhad">Odhad ceny zadarmo</button>' : "") + "</div>" : "");
}
function searchBox() {
  var locs = []; lstAll().forEach(function (x) { if (locs.indexOf(x.l) < 0) locs.push(x.l); });
  var f = UI.pf, o = function (v, l, cur) { return '<option value="' + esc(v) + '"' + (v === cur ? " selected" : "") + ">" + esc(l) + "</option>"; };
  return '<form class="srch" data-srch><label>Ponuka<select name="tr">' + o("predaj", "Predaj", f.tr) + o("prenajom", "Prenájom", f.tr) + o("vse", "Predaj aj prenájom", f.tr) + "</select></label>" +
    '<label>Druh<select name="k">' + KINDS.map(function (x) { return o(x[0], x[0] === "vse" ? "Všetky druhy" : x[1], f.k); }).join("") + "</select></label>" +
    '<label>Lokalita<select name="loc">' + o("vse", "Všetky obce", f.loc) + locs.map(function (l) { return o(l, l, f.loc); }).join("") + "</select></label>" +
    '<button type="submit" class="btn">' + SV(IC.hladat, 2.2) + "Hľadať</button></form>";
}
function hero() {
  var H = S.hero, sl = H.slides, cur = Math.min(UI.slide, sl.length - 1), tpl = S.tpl;
  var inHero = H.search === "on" && secOn("ponuky") && (tpl === "portal" || tpl === "luxusna");
  var below = H.search === "on" && secOn("ponuky") && !inHero && tpl === "klasicka";
  var h = '<section class="hero' + (below ? " ov" : "") + '" id="s-uvod" data-sec="uvod" style="--dim:' + (H.dim / 100) + '">' + edBtn("uvod") +
    '<div class="ph-l">' + sl.map(function (s, i) { return '<div class="sl' + (i === cur ? " on" : "") + '" data-i="' + i + '"><img src="' + esc(src(s.img)) + '" alt=""' + (i === cur ? "" : ' loading="lazy"') + "></div>"; }).join("") +
    (sl.length > 1 ? '<div class="hctl"><button type="button" class="harr l" data-hprev aria-label="Predchádzajúca fotka">' + SV(IC.l, 2.2) + '</button><button type="button" class="harr r" data-hnext aria-label="Ďalšia fotka">' + SV(IC.r, 2.2) + '</button><div class="hdots">' + sl.map(function (s, i) { return '<button type="button" data-hdot="' + i + '" aria-label="Fotka ' + (i + 1) + '" aria-current="' + (i === cur) + '"></button>'; }).join("") + "</div></div>" : "") + "</div>" +
    '<div class="tx-l w">' + sl.map(function (s, i) {
      return '<div class="sl' + (i === cur ? " on" : "") + '" data-i="' + i + '">' + (H.eb ? '<span class="heb">' + esc(H.eb) + "</span>" : "") + "<h1>" + esc(s.t) + "</h1>" + (s.l ? "<p>" + esc(s.l) + "</p>" : "") +
        '<div class="btns">' + btnTo(s.b, s.go, s.u) + btnTo(s.b2, s.go2, s.u2, "wh") + "</div></div>"; }).join("") + "</div>" +
    (inHero ? '<div class="srch-in w">' + searchBox() + "</div>" : "") + "</section>";
  if (H.search === "on" && secOn("ponuky") && !inHero) h += '<div class="srch-w w">' + searchBox() + "</div>";
  return h;
}
function cislaVal(r) {
  if (r.typ === "ponuky") return String(lstAll().length);
  if (r.typ === "makleri") return String(agentsOn().length);
  if (r.typ === "google") { var g = gRating(); return g ? g.v : ""; }
  return String(r.n || "").trim();
}
function num(v) { var m = v.match(/^(\d{1,6})(\D{0,6})$/); return m ? '<b class="num" data-count="' + m[1] + '" data-suf="' + esc(m[2]) + '">' + esc(UI.counted || S.anim !== "on" ? v : "0" + m[2]) + "</b>" : '<b class="num">' + esc(v) + "</b>"; }
function secCisla() {
  var rows = S.cisla.rows.map(function (r) { return { v: cislaVal(r), t: r.t, g: r.typ === "google" }; }).filter(function (r) { return r.v && String(r.t || "").trim(); });
  if (!rows.length) return '<section class="cisla jedno" data-sec="cisla">' + edBtn("cisla") + '<div class="w"><p class="muted">Sem patria čísla kancelárie, napríklad roky na trhu a počet predajov.</p></div></section>';
  return '<section class="cisla ' + S.cisla.st + '" data-sec="cisla" id="s-cisla">' + edBtn("cisla") + '<div class="w" style="--n:' + rows.length + '">' + rows.map(function (r) { return '<div class="c">' + num(r.v) + (r.g ? stars(5) : "") + "<span>" + esc(r.t) + "</span></div>"; }).join("") + "</div></section>";
}
function card(x) {
  var a = agent(x.m), pr = x.tr === "prenajom" ? fmt(x.p) + " € <small>/ mesiac</small>" : fmt(x.p) + " €" + (x.m2 ? " <small>" + fmt(x.p / x.m2) + " €/m²</small>" : "");
  return '<article class="card" tabindex="0" data-card><div class="cph"><img src="' + esc(src(x.img, true)) + '" alt="' + esc(x.t) + '" loading="lazy"><div class="cbadge"><span>' + (x.tr === "prenajom" ? "Prenájom" : "Predaj") + "</span>" + (x.st ? '<span class="st">' + esc(x.st) + "</span>" : "") + "</div></div>" +
    '<div class="cbody"><div class="cprice">' + pr + "</div><h3>" + esc(x.t) + '</h3><div class="cloc">' + SV(IC.pin) + esc(x.l) + '</div><div class="cpar">' + x.a.map(function (p) { return "<span>" + esc(p) + "</span>"; }).join("") + "</div>" +
    (S.ponuky.agent === "on" && a ? '<div class="cag">' + av(a) + "<span>" + esc(a.n) + "</span></div>" : "") + "</div></article>";
}
function secPonuky() {
  var P = S.ponuky, all = lstAll(), f = UI.pf;
  var L = all.filter(function (x) { return (f.tr === "vse" || x.tr === f.tr) && (f.k === "vse" || x.k === f.k) && (f.m === "vse" || x.m === f.m) && (f.loc === "vse" || x.l === f.loc); });
  if (P.sort === "lacne") L.sort(function (a, b) { return a.p - b.p; }); else if (P.sort === "drahe") L.sort(function (a, b) { return b.p - a.p; });
  var cnt = P.cnt === "vse" || UI.allP ? L.length : +P.cnt, shown = L.slice(0, cnt);
  var filt = P.filt === "on" ? '<div class="pf" role="group" aria-label="Filtrovať ponuky">' + KINDS.map(function (k) { return '<button type="button" class="chip" data-pk="' + k[0] + '" aria-pressed="' + (f.k === k[0]) + '">' + k[1] + "</button>"; }).join("") + '<span class="sep" aria-hidden="true"></span>' +
    [["vse", "Predaj aj prenájom"], ["predaj", "Predaj"], ["prenajom", "Prenájom"]].map(function (k) { return '<button type="button" class="chip" data-ptr="' + k[0] + '" aria-pressed="' + (f.tr === k[0]) + '">' + k[1] + "</button>"; }).join("") +
    '<select data-pm aria-label="Maklér"><option value="vse">Všetci makléri</option>' + agentsOn().map(function (a) { return '<option value="' + a.id + '"' + (f.m === a.id ? " selected" : "") + ">" + esc(a.n) + "</option>"; }).join("") + "</select>" +
    (f.loc !== "vse" ? '<button type="button" class="chip" data-ploc="vse" aria-pressed="true">' + esc(f.loc) + " ✕</button>" : "") + "</div>" : "";
  return '<section class="sec" id="s-ponuky" data-sec="ponuky">' + edBtn("ponuky") + '<div class="w"><div class="sh-row">' + sh(P) + '<button type="button" class="lnk" data-go="kontakt">Hľadáte niečo iné? Napíšte nám ' + SV(IC.sipka, 2.2) + "</button></div>" + filt +
    (shown.length ? '<div class="pgrid ' + P.lay + '">' + shown.map(card).join("") + "</div>" + (L.length > shown.length ? '<div class="pmore"><button type="button" class="btn gh" data-allp>Zobraziť všetky ponuky (' + L.length + ")</button></div>" : "")
      : '<div class="pempty"><h3>Takú ponuku práve nemáme</h3><p class="muted">Napíšte nám, čo hľadáte. Ozveme sa, keď sa objaví, často ešte skôr, než je na portáloch.</p><button type="button" class="btn" data-go="kontakt">Napísať, čo hľadám</button></div>') + "</div></section>";
}
function secAbout(alt) {
  var O = S.okancelarii, r0 = S.cisla.rows.map(function (r) { return { v: cislaVal(r), t: r.t }; }).filter(function (r) { return r.v && r.t; })[0];
  return '<section class="sec' + alt + '" id="s-okancelarii" data-sec="okancelarii">' + edBtn("okancelarii") + '<div class="w about"><div class="aph"><img src="' + esc(src(O.img)) + '" alt="" loading="lazy">' + (O.badge === "on" && r0 ? '<div class="abadge"><b>' + esc(r0.v) + "</b><span>" + esc(r0.t) + "</span></div>" : "") + "</div>" +
    '<div class="atx">' + (O.eb ? '<span class="eb">' + esc(O.eb) + "</span>" : "") + '<h2 class="h2">' + esc(O.t) + '</h2><div class="paras">' + paras(O.text) + "</div>" +
    (lines(O.pts).length ? '<ul class="ticks">' + lines(O.pts).map(function (p) { return "<li><i>" + SV(IC.check, 2.6) + "</i>" + esc(p) + "</li>"; }).join("") + "</ul>" : "") + "<div>" + btnTo(O.b, O.go) + "</div></div></div></section>";
}
function secSluzby(alt) {
  var V = S.sluzby;
  return '<section class="sec' + alt + '" id="s-sluzby" data-sec="sluzby">' + edBtn("sluzby") + '<div class="w">' + sh(V, true) + '<div class="svc">' + V.items.map(function (s) { return '<div class="s"><span class="si">' + SV(IC[s.ic] || IC.dom, 1.7) + "</span><h3>" + esc(s.t) + "</h3><p>" + esc(s.d) + "</p></div>"; }).join("") + "</div></div></section>";
}
function secOdhad(alt) {
  var O = S.odhad, v = UI.val, steps = lines(O.kroky), body;
  if (v.ok) body = '<div class="done"><i>' + SV(IC.check, 2.6) + '</i><h3>Ďakujeme, máme to</h3><p class="muted">Ozveme sa vám s odhadom ceny. Ak niečo chýba, zavoláme.</p><small>Ukážka: v návrhu sa nič neodoslalo.</small><button type="button" class="btn gh sm" data-vagain>Poslať ďalší odhad</button></div>';
  else if (v.step === 1) body = '<h3>O akú nehnuteľnosť ide?</h3><div class="opts">' + [["byt", "Byt"], ["dom", "Dom"], ["poz", "Pozemok"], ["chata", "Chata"], ["ine", "Iné"]].map(function (o) { return '<button type="button" data-vtyp="' + o[0] + '" aria-pressed="' + (v.typ === o[0]) + '">' + SV(IC[o[0]], 1.7) + o[1] + "</button>"; }).join("") + "</div>";
  else if (v.step === 2) body = '<h3>Pár údajov o nehnuteľnosti</h3><label class="inp">Obec<select data-vf="obec">' + OBCE.map(function (o) { return "<option" + (v.obec === o ? " selected" : "") + ">" + esc(o) + "</option>"; }).join("") + '</select></label><div class="row2"><label class="inp">Rozloha v m²<input data-vf="m2" inputmode="numeric" value="' + esc(v.m2) + '" placeholder="napr. 68"></label><label class="inp">Stav<select data-vf="stav">' + ["", "Pôvodný stav", "Čiastočná rekonštrukcia", "Kompletná rekonštrukcia", "Novostavba"].map(function (o) { return '<option value="' + o + '"' + (v.stav === o ? " selected" : "") + ">" + (o || "Vyberte") + "</option>"; }).join("") + '</select></label></div><div class="fbtns"><button type="button" class="btn gh sm" data-vback>Späť</button><button type="button" class="btn" data-vnext>Pokračovať</button></div>';
  else body = '<h3>Kam vám pošleme odhad?</h3><label class="inp">Meno<input data-vf="meno" value="' + esc(v.meno) + '" autocomplete="name"></label><label class="inp">Telefón alebo e-mail<input data-vf="kont" value="' + esc(v.kont) + '"></label><label class="souhlas"><input type="checkbox" data-vf="ok2"' + (v.ok2 ? " checked" : "") + '><span>Súhlasím so spracovaním osobných údajov na prípravu odhadu. <button type="button" data-gdpr>Ochrana osobných údajov</button></span></label>' + (v.err ? '<p class="ferr" role="alert">' + esc(v.err) + "</p>" : "") + '<div class="fbtns"><button type="button" class="btn gh sm" data-vback>Späť</button><button type="button" class="btn" data-vsend>Poslať a získať odhad</button></div>';
  var prog = v.ok ? "" : '<div class="vprog"><span>Krok ' + v.step + ' z 3</span><span class="vbar" aria-hidden="true"><i class="on"></i><i class="' + (v.step > 1 ? "on" : "") + '"></i><i class="' + (v.step > 2 ? "on" : "") + '"></i></span></div>';
  return '<section class="sec' + alt + '" id="s-odhad" data-sec="odhad">' + edBtn("odhad") + '<div class="w val"><div class="vtx">' + (O.eb ? '<span class="eb">' + esc(O.eb) + "</span>" : "") + '<h2 class="h2">' + esc(O.t) + '</h2><p class="lead">' + esc(O.text) + "</p>" + (steps.length ? '<ol class="vsteps">' + steps.map(function (s) { return "<li>" + esc(s) + "</li>"; }).join("") + "</ol>" : "") + '</div><div class="vform">' + prog + body + "</div></div></section>";
}
function secTim(alt) {
  var T = S.tim, A = agentsOn(), all = lstAll();
  return '<section class="sec' + alt + '" id="s-tim" data-sec="tim">' + edBtn("tim") + '<div class="w">' + sh(T, true) + '<div class="team">' + A.map(function (a) {
    var n = all.filter(function (x) { return x.m === a.id; }).length;
    return '<div class="tm">' + av(a) + "<h3>" + esc(a.n) + "</h3><p>" + esc(a.r) + '</p><div class="tbtn">' + (n ? '<button type="button" class="btn sm gh" data-agent-p="' + a.id + '">Ponuky (' + n + ")</button>" : "") + (T.kont === "on" ? '<button type="button" class="btn sm" data-agent-k="' + a.id + '">Napísať</button>' : "") + "</div>" +
      (T.web === "on" && a.web ? '<a class="lnk" style="margin-top:10px" href="' + esc(url(a.web)) + '" target="_blank" rel="noopener">' + SV(IC.web, 2) + "Osobný web</a>" : "") + "</div>"; }).join("") + "</div></div></section>";
}
function secOcenenia(alt) {
  var O = S.ocenenia; if (!O.items.length) return "";
  return '<section class="sec' + alt + '" id="s-ocenenia" data-sec="ocenenia">' + edBtn("ocenenia") + '<div class="w">' + sh(O, true) + '<div class="awards">' + O.items.map(function (a) { return '<div class="aw"><i>' + SV(IC.laur, 1.5) + "</i><div><b>" + esc(a.t) + "</b><span>" + esc([a.y, a.d].filter(Boolean).join(" · ")) + "</span></div></div>"; }).join("") + "</div></div></section>";
}
function secRecenzie(alt) {
  var R = S.recenzie, g = gRating(), u = url(S.rev.url), list = REVS.slice(0, +R.cnt);
  var badge = '<div class="gbadge">' + (g ? '<span class="gv">' + g.v + "</span>" : "") + "<div>" + stars(5) + '<small><span class="gword">Google</span> · ' + (g && g.n ? "na základe " + fmt(g.n) + " recenzií" : "recenzie našich klientov") + "</small></div></div>";
  return '<section class="sec' + alt + '" id="s-recenzie" data-sec="recenzie">' + edBtn("recenzie") + '<div class="w"><div class="sh-row">' + sh(R) + badge + '</div><p style="margin:-10px 0 22px"><span class="sample">Ukážka: na webe sa tu načítajú skutočné recenzie z Google</span></p><div class="revs">' +
    list.map(function (r) { return '<div class="rv">' + stars(5) + "<p>" + esc(r.t) + '</p><div class="who"><span class="av">' + esc(initials(r.n.replace(/ z .*| zo .*/, "")) || "K") + "</span><div><b>" + esc(r.n) + "</b><small>" + esc(r.d) + " · Google</small></div></div></div>"; }).join("") + "</div>" +
    '<div class="rbtns">' + (u ? '<a class="btn gh" href="' + esc(u) + '" target="_blank" rel="noopener">Všetky recenzie na Google</a>' : '<span class="btn gh" aria-disabled="true" title="Doplň odkaz v záložke Napojenia">Všetky recenzie na Google</span>') + (R.write === "on" ? (u ? '<a class="btn" href="' + esc(u) + '" target="_blank" rel="noopener">Napísať recenziu</a>' : '<span class="btn" aria-disabled="true">Napísať recenziu</span>') : "") + "</div></div></section>";
}
function galGrid(imgs, lay, key) {
  if (!imgs.length) return '<div class="gempty">Pridaj fotky v nastavení sekcie.</div>';
  return '<div class="gal ' + lay + '">' + imgs.map(function (v, i) { return '<button type="button" data-lb="' + key + ":" + i + '" aria-label="Zväčšiť fotku ' + (i + 1) + '"><img src="' + esc(src(v, true)) + '" alt="" loading="lazy"></button>'; }).join("") + "</div>";
}
function secGaleria(alt) { var G = S.galeria; return '<section class="sec' + alt + '" id="s-galeria" data-sec="galeria">' + edBtn("galeria") + '<div class="w">' + sh(G, true) + galGrid(G.imgs, G.lay, "galeria.imgs") + "</div></section>"; }
function secClanky(alt) {
  var C = S.clanky;
  return '<section class="sec' + alt + '" id="s-clanky" data-sec="clanky">' + edBtn("clanky") + '<div class="w"><div class="sh-row">' + sh(C) + '<button type="button" class="lnk" data-demo>Všetky články ' + SV(IC.sipka, 2.2) + '</button></div><div class="posts">' +
    POSTS.slice(0, +C.cnt).map(function (p) { return '<button type="button" class="post" data-demo><img src="' + esc(src(p.img, true)) + '" alt="" loading="lazy"><small>' + esc(p.dt) + "</small><h3>" + esc(p.t) + "</h3><p>" + esc(p.d) + '</p><span class="lnk">Čítať ďalej ' + SV(IC.sipka, 2.2) + "</span></button>"; }).join("") + "</div></div></section>";
}
function socRow() {
  var s = S.k.soc, h = SOC.filter(function (x) { return String(s[x[0]] || "").trim(); }).map(function (x) { return '<a href="' + esc(url(s[x[0]])) + '" target="_blank" rel="noopener" aria-label="' + x[1] + '">' + SV(IC[x[0]], 1.9) + "</a>"; }).join("");
  return h ? '<div class="soc">' + h + "</div>" : "";
}
function mapSvg(P) {
  var land = P.dark ? "#1F2830" : "#EEF0EA", road = P.dark ? "#34414D" : "#FFFFFF", road2 = P.dark ? "#2A3540" : "#F9F9F6", water = P.dark ? "#22405A" : "#C7DCEB", park = P.dark ? "#22382B" : "#D7E7CF", blk = P.dark ? "#26303A" : "#E3E5DE";
  return '<svg class="m" viewBox="0 0 800 300" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><rect width="800" height="300" fill="' + land + '"/>' +
    '<g fill="' + blk + '"><rect x="60" y="30" width="120" height="70" rx="6"/><rect x="210" y="30" width="150" height="60" rx="6"/><rect x="440" y="20" width="110" height="80" rx="6"/><rect x="590" y="40" width="160" height="60" rx="6"/><rect x="60" y="160" width="100" height="90" rx="6"/><rect x="470" y="170" width="120" height="70" rx="6"/><rect x="620" y="170" width="140" height="90" rx="6"/></g>' +
    '<path d="M190 150 Q 300 120 380 160 T 560 140" fill="none" stroke="' + park + '" stroke-width="0"/><rect x="200" y="170" width="220" height="90" rx="14" fill="' + park + '"/>' +
    '<path d="M-10 280 C 150 240 260 300 420 270 S 700 230 820 260" fill="none" stroke="' + water + '" stroke-width="22"/>' +
    '<g stroke="' + road + '" stroke-width="16" fill="none" stroke-linecap="round"><path d="M-10 128 H 820"/><path d="M400 -10 V 310"/><path d="M-10 20 L 300 140"/></g>' +
    '<g stroke="' + road2 + '" stroke-width="8" fill="none" stroke-linecap="round"><path d="M190 -10 V 300"/><path d="M590 -10 V 300"/><path d="M-10 150 H 800" opacity="0"/><path d="M400 128 L 760 30"/></g></svg>';
}
function secKontakt(alt, P) {
  var K = S.kontakt, k = UI.kf, ki = [];
  if (S.k.addr) ki.push('<a class="ki" href="https://www.google.com/maps/search/?api=1&amp;query=' + encodeURIComponent(S.k.addr) + '" target="_blank" rel="noopener"><i>' + SV(IC.pin) + "</i><div><small>Adresa kancelárie</small><b>" + esc(S.k.addr) + "</b></div></a>");
  if (S.k.tel) ki.push('<a class="ki" href="tel:' + esc(S.k.tel.replace(/\s/g, "")) + '"><i>' + SV(IC.tel) + "</i><div><small>Telefón</small><b>" + esc(S.k.tel) + "</b></div></a>");
  if (S.k.mail) ki.push('<a class="ki" href="mailto:' + esc(S.k.mail) + '"><i>' + SV(IC.mail) + "</i><div><small>E-mail</small><b>" + esc(S.k.mail) + "</b></div></a>");
  if (K.hours === "on" && S.k.hours) ki.push('<div class="ki"><i>' + SV(IC.clock) + "</i><div><small>Otváracie hodiny</small><b>" + esc(S.k.hours) + "</b></div></div>");
  var form = K.form !== "on" ? "" : '<form class="kform" data-kform>' + (k.done ? '<div class="done"><i>' + SV(IC.check, 2.6) + '</i><h3>Ďakujeme za správu</h3><p class="muted">Ozveme sa vám čo najskôr.</p><small>Ukážka: v návrhu sa nič neodoslalo.</small><button type="button" class="btn gh sm" data-kagain>Napísať ďalšiu správu</button></div>'
    : "<h3>Napíšte nám</h3>" + '<label class="inp">Komu<select name="komu"><option value="kancelaria">Kancelárii</option>' + agentsOn().map(function (a) { return '<option value="' + a.id + '"' + (k.komu === a.id ? " selected" : "") + ">" + esc(a.n) + "</option>"; }).join("") + "</select></label>" +
      '<div class="row2"><label class="inp">Meno<input name="meno" autocomplete="name" value="' + esc(k.v.meno || "") + '"></label><label class="inp">Telefón<input name="tel" type="tel" autocomplete="tel" value="' + esc(k.v.tel || "") + '"></label></div><label class="inp">E-mail<input name="mail" type="email" autocomplete="email" value="' + esc(k.v.mail || "") + '"></label><label class="inp">Správa<textarea name="msg" rows="4" placeholder="Napríklad: chcem predať 3-izbový byt v Levoči">' + esc(k.v.msg || "") + '</textarea></label>' +
      '<label class="souhlas"><input type="checkbox" name="ok"' + (k.v.ok ? " checked" : "") + '><span>Súhlasím so spracovaním osobných údajov na vybavenie mojej správy. <button type="button" data-gdpr>Ochrana osobných údajov</button></span></label>' + (k.err ? '<p class="ferr" role="alert">' + esc(k.err) + "</p>" : "") + '<div><button type="submit" class="btn">Odoslať správu</button></div>') + "</form>";
  var map = K.map === "on" && S.k.addr ? '<div class="map">' + mapSvg(P) + '<div class="mpin"><span>' + esc(S.k.name) + '</span><i></i></div><span class="mnote">Na webe tu bude živá mapa</span><a class="mlink" href="https://www.google.com/maps/search/?api=1&amp;query=' + encodeURIComponent(S.k.addr) + '" target="_blank" rel="noopener">Otvoriť v Mapách</a></div>' : "";
  return '<section class="sec' + alt + '" id="s-kontakt" data-sec="kontakt">' + edBtn("kontakt") + '<div class="w">' + sh(K) + '<div class="kgrid">' + (form || '<div class="kinfo"><div class="klist">' + ki.join("") + "</div>" + socRow() + "</div>") +
    '<div class="kinfo">' + (form ? '<div class="klist">' + ki.join("") + "</div>" + socRow() : "") + map + "</div></div></div></section>";
}
function secCustom(k, alt) {
  var c = S.custom[k], bgc = c.bgs === "col" ? " col" : c.bgs === "alt" ? " alt" : alt, cls = c.bgs === "col" ? "inv" : "", inner;
  if (c.typ === "vyzva") inner = '<div class="cta"><div><h2 class="h2">' + esc(c.t) + '</h2><div class="paras">' + paras(c.text) + "</div></div><div>" + btnTo(c.b, c.go, c.u, cls) + "</div></div>";
  else if (c.typ === "txph") inner = '<div class="txph"><img src="' + esc(src(c.img || "dom-obyvacka")) + '" alt="" loading="lazy"><div><h2 class="h2">' + esc(c.t) + '</h2><div class="paras">' + paras(c.text) + "</div>" + btnTo(c.b, c.go, c.u, cls) + "</div></div>";
  else if (c.typ === "fotky") inner = '<div class="sh c"><h2 class="h2">' + esc(c.t) + "</h2></div>" + galGrid(c.imgs || [], "mriezka", "custom." + k + ".imgs");
  else inner = '<div class="ctxt c"><h2 class="h2">' + esc(c.t) + '</h2><div class="paras">' + paras(c.text) + "</div>" + btnTo(c.b, c.go, c.u, cls) + "</div>";
  return '<section class="sec' + bgc + '" id="s-' + k + '" data-sec="' + k + '">' + edBtn(k) + '<div class="w">' + inner + "</div></section>";
}
function footer() {
  var k = S.k, m = menuItems(), t = trk();
  return '<footer class="foot"><div class="w"><div class="fg"><div style="display:flex;flex-direction:column;gap:16px"><button type="button" class="logo" data-go="top">' + (k.logo ? '<img src="' + esc(k.logo) + '" alt="' + esc(k.name) + '">' : "<b>" + esc(k.name) + "</b>") + "</button><p>" + esc(S.hero.eb || "Realitná kancelária") + ". Predaj, kúpa, prenájom a výkup nehnuteľností.</p>" + socRow() + "</div>" +
    "<div><h4>Kontakt</h4><ul>" + [k.addr, k.tel, k.mail].filter(Boolean).map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul></div>" +
    "<div><h4>Na webe</h4><ul>" + m.slice(0, 7).map(function (x) { return '<li><button type="button" data-go="' + x[0] + '">' + esc(x[1]) + "</button></li>"; }).join("") + "</ul></div>" +
    "<div><h4>Otváracie hodiny</h4><ul>" + (k.hours ? "<li>" + esc(k.hours) + "</li>" : "<li>Podľa dohody</li>") + "</ul></div></div>" +
    '<div class="fbot"><span>© 2026 ' + esc(S.gdpr.who || k.name) + (k.ico ? " · IČO " + esc(k.ico) : "") + ' · <button type="button" data-gdpr>Ochrana osobných údajov</button>' + (S.gdpr.bar === "on" || t.ga || t.fb ? ' · <button type="button" data-ckopen>Nastavenie cookies</button>' : "") + '</span><span class="typ">Obsahový vizuál na webe je generovaný AI · Web beží na <b>Realitný <span>týpek</span></b></span></div></div></footer>';
}
function cookieBar() {
  var t = trk();
  if (!(S.gdpr.bar === "on" || t.ga || t.fb) || !UI.ck) return "";
  var what = t.ga && t.fb ? " S vaším súhlasom použijeme aj analytické (Google Analytics) a marketingové (Meta Pixel) cookies." : t.ga ? " S vaším súhlasom použijeme aj analytické cookies (Google Analytics)." : t.fb ? " S vaším súhlasom použijeme aj marketingové cookies (Meta Pixel)." : "";
  return '<div class="ck-w"><div class="ck" role="region" aria-label="Cookies"><p><b>Používame cookies.</b> Nevyhnutné cookies zabezpečujú fungovanie webu.' + what + ' <button type="button" class="flink" data-gdpr>Viac informácií</button></p><div class="btns"><button type="button" class="btn" data-ck="vsetky">Prijať všetky</button><button type="button" class="btn gh" data-ck="nevyhnutne">Len nevyhnutné</button>' + (t.ga || t.fb ? '<button type="button" class="btn gh" data-ckopen>Nastavenia</button>' : "") + "</div></div></div>";
}
function miss(v, lab) { return String(v || "").trim() ? esc(v) : "<mark>[doplň " + lab + "]</mark>"; }
function ovlHtml() {
  if (!UI.ovl) return "";
  var t = trk(), g = S.gdpr;
  if (UI.ovl === "gdpr") {
    var rec = ["poskytovateľ webu a realitného softvéru Realitný týpek", "poskytovateľ e-mailových služieb"]; if (t.ga) rec.push("Google (služba Google Analytics na meranie návštevnosti)"); if (t.fb) rec.push("Meta Platforms (Meta Pixel na meranie reklamy)");
    return '<div class="ovl" data-ovlbg><div class="box" role="dialog" aria-modal="true" aria-label="Ochrana osobných údajov"><button type="button" class="x" data-ovlx aria-label="Zavrieť">' + SV(IC.x, 2.2) + '</button><span class="eb">Ochrana osobných údajov</span><h2>Ako spracúvame vaše osobné údaje</h2>' +
      "<h3>Prevádzkovateľ</h3><p>" + miss(g.who, "firmu") + ", IČO " + miss(g.ico, "IČO") + ", " + miss(g.addr, "sídlo") + ". Kontakt pre otázky k osobným údajom: " + miss(g.mail, "e-mail") + (S.k.tel ? ", " + esc(S.k.tel) : "") + "." + (g.dpo.trim() ? " Zodpovedná osoba: " + esc(g.dpo) + "." : "") + "</p>" +
      "<h3>Aké údaje a na čo</h3><p>Spracúvame meno, telefón, e-mail a údaje o nehnuteľnosti, ktoré nám pošlete cez formuláre na tomto webe. Používame ich na odpoveď na vašu požiadavku, prípravu ponuky alebo odhadu ceny, dohodnutie obhliadky a na plnenie sprostredkovateľskej zmluvy.</p>" +
      "<h3>Právny základ</h3><ul><li>rokovanie o zmluve a jej plnenie (čl. 6 ods. 1 písm. b GDPR),</li><li>váš súhlas pri analytických a marketingových cookies (čl. 6 ods. 1 písm. a GDPR),</li><li>zákonné povinnosti vrátane overenia klienta podľa zákona č. 297/2008 Z. z. (čl. 6 ods. 1 písm. c GDPR).</li></ul>" +
      "<h3>Ako dlho</h3><p>Údaje z dopytov uchovávame len po dobu potrebnú na vybavenie požiadavky. Údaje zo zmlúv uchovávame po dobu, ktorú určuje zákon. Súhlas môžete kedykoľvek odvolať.</p>" +
      "<h3>Komu ich poskytujeme</h3><ul>" + rec.map(function (r) { return "<li>" + r + "</li>"; }).join("") + "</ul>" +
      "<h3>Vaše práva</h3><p>Máte právo na prístup k údajom, ich opravu, vymazanie, obmedzenie spracúvania, prenosnosť a právo namietať. Ak máte pocit, že s údajmi nezaobchádzame správne, môžete podať sťažnosť na Úrad na ochranu osobných údajov Slovenskej republiky.</p>" +
      "<h3>Cookies</h3><p>Nevyhnutné cookies zabezpečujú fungovanie webu a nepotrebujú súhlas." + (t.ga ? " Analytické cookies (Google Analytics) používame len s vaším súhlasom." : "") + (t.fb ? " Marketingové cookies (Meta Pixel) používame len s vaším súhlasom." : "") + " Voľbu môžete zmeniť cez odkaz Nastavenie cookies v pätičke.</p>" +
      '<p class="demo">Text vychádza zo stránky, ktorú majú makléri pri osobnom webe. Žlté miesta doplň v záložke Napojenia.</p></div></div>';
  }
  if (UI.ovl === "ck") {
    var cs = UI.ckSet || { ga: false, fb: false };
    return '<div class="ovl" data-ovlbg><div class="box" role="dialog" aria-modal="true" aria-label="Nastavenie cookies" style="max-width:560px"><button type="button" class="x" data-ovlx aria-label="Zavrieť">' + SV(IC.x, 2.2) + '</button><span class="eb">Cookies</span><h2>Nastavenie cookies</h2>' +
      '<div class="ckrow"><div><b>Nevyhnutné</b><small>Fungovanie webu. Vždy zapnuté.</small></div><input type="checkbox" checked disabled aria-label="Nevyhnutné cookies"></div>' +
      (t.ga ? '<div class="ckrow"><div><b>Analytické</b><small>Google Analytics, meranie návštevnosti</small></div><input type="checkbox" data-cks="ga"' + (cs.ga ? " checked" : "") + ' aria-label="Analytické cookies"></div>' : "") +
      (t.fb ? '<div class="ckrow"><div><b>Marketingové</b><small>Meta Pixel, meranie a cielenie reklamy</small></div><input type="checkbox" data-cks="fb"' + (cs.fb ? " checked" : "") + ' aria-label="Marketingové cookies"></div>' : "") +
      '<div style="display:flex;gap:8px;margin-top:18px;flex-wrap:wrap"><button type="button" class="btn" data-cksave style="font-family:var(--fb)">Uložiť voľbu</button><button type="button" class="btn gh" data-ck="vsetky" style="font-family:var(--fb)">Prijať všetky</button></div></div></div>';
  }
  if (UI.ovl === "lb") {
    var L = get(UI.lbKey) || [], i = Math.max(0, Math.min(UI.lb, L.length - 1));
    return '<div class="ovl lb" data-ovlbg><button type="button" class="x" data-ovlx aria-label="Zavrieť">' + SV(IC.x, 2.2) + '</button><div style="max-width:100%;max-height:100%;display:flex;flex-direction:column;align-items:center"><img src="' + esc(src(L[i])) + '" alt=""><div class="lbn"><button type="button" data-lbm="-1">← Predchádzajúca</button><span>' + (i + 1) + " / " + L.length + '</span><button type="button" data-lbm="1">Ďalšia →</button></div></div></div>';
  }
  return "";
}

var vhPx = 760;
function render() {
  var P = pal(), F = FONTS.find(function (f) { return f.id === S.font; }) || FONTS[0], st = site.style;
  var rb = S.btn === "pill" ? "999px" : S.btn === "round" ? Math.max(8, Math.round(S.r * 0.7)) + "px" : "2px";
  var head = S.tpl === "rozdelena" && S.head === "priehladna" ? "svetla" : S.head;
  var hbg = head === "tmava" ? "#151B21" : head === "priehladna" ? "transparent" : P.bg, hfg = head === "svetla" ? P.fg : "#FFFFFF";
  var hh = S.hero.hh === "cela" ? vhPx : S.hero.hh === "vysoka" ? Math.round(vhPx * 0.84) : Math.min(560, vhPx);
  var fbg = P.dark ? "#0E1318" : (lum(P.b) < 0.06 ? mix(P.b, "#000000", 0.25) : "#151B21");
  [["--bg", P.bg], ["--surf", P.surf], ["--fg", P.fg], ["--muted", P.muted], ["--line", P.line], ["--a", P.a], ["--on-a", P.onA], ["--at", P.at], ["--a-soft", P.soft], ["--b", P.b], ["--on-b", P.onB], ["--bt", P.bt], ["--b-soft", P.bsoft], ["--a-on-b", P.aOnB],
    ["--hc", P.hc], ["--err", P.err], ["--fh", F.h], ["--fb", F.b], ["--fhw", F.w], ["--fhls", F.ls], ["--r", S.r + "px"], ["--rb", rb], ["--hbg", hbg], ["--hfg", hfg], ["--hacc", head === "svetla" ? P.at : P.a], ["--hh", Math.max(460, hh) + "px"], ["--fbg", fbg],
    ["--hero-acc", con(P.a, "#10161C") >= 4.5 ? P.a : mix(P.a, "#FFFFFF", 0.5)]].forEach(function (x) { st.setProperty(x[0], x[1]); });
  st.colorScheme = P.dark ? "dark" : "light";
  site.className = "site t-" + S.tpl + " h-" + head + " al-" + S.hero.align + (S.anim === "on" ? " anim" : "") + (stage.scrollTop > 40 ? " scr" : "");
  var out = header() + hero(), n = 0;
  S.order.forEach(function (k) {
    if (!secOn(k)) return;
    if (k === "cisla") { out += secCisla(); return; }
    var alt = (k !== "ponuky" && n % 2 === 1) ? " alt" : ""; n++;
    if (S.custom[k]) { out += secCustom(k, alt); if (S.custom[k].bgs === "col" || S.custom[k].bgs === "alt") n = 0; return; }
    out += ({ ponuky: secPonuky, okancelarii: secAbout, sluzby: secSluzby, odhad: secOdhad, tim: secTim, ocenenia: secOcenenia, recenzie: secRecenzie, galeria: secGaleria, clanky: secClanky, kontakt: function (a) { return secKontakt(a, P); } })[k](alt);
  });
  out += footer() + cookieBar();
  site.innerHTML = out;
  var ov = $("ovlHost"); if (!ov) { ov = document.createElement("div"); ov.id = "ovlHost"; $("frame").appendChild(ov); }
  ov.innerHTML = ovlHtml(); ov.style.cssText = ov.innerHTML ? "" : "display:none";
  ov.firstChild && ov.firstChild.style && (ov.firstChild.style.cssText += ";--bg:" + P.bg + ";--surf:" + P.surf + ";--fg:" + P.fg + ";--muted:" + P.muted + ";--line:" + P.line + ";--a:" + P.a + ";--on-a:" + P.onA + ";--at:" + P.at + ";--bt:" + P.bt + ";--hc:" + P.hc + ";--fh:" + F.h + ";--fb:" + F.b + ";--fhw:" + F.w + ";--fhls:" + F.ls + ";--rb:" + rb);
  $("addrTx").textContent = String(S.k.dom || "www.kancelaria.sk").replace(/^https?:\/\//, "");
  watchCount(); sched();
}
var rq = 0;
function later() { cancelAnimationFrame(rq); rq = requestAnimationFrame(render); }

/* posúvanie v ukážke */
function toTop() { stage.scrollTo({ top: 0, behavior: "smooth" }); }
function goSec(k) {
  if (k === "top" || k === "uvod") { toTop(); return; }
  var el = site.querySelector("#s-" + k); if (!el) return;
  var hd = site.querySelector(".s-head"), off = hd ? hd.offsetHeight : 0;
  var top = el.getBoundingClientRect().top - stage.getBoundingClientRect().top + stage.scrollTop - off + 1;
  stage.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
}
stage.addEventListener("scroll", function () { var s = stage.scrollTop > 40; if (site.classList.contains("scr") !== s) site.classList.toggle("scr", s); }, { passive: true });

/* titulné fotky */
var hT = 0;
function showSlide(i, user) {
  var n = S.hero.slides.length; if (!n) return; UI.slide = (i + n) % n;
  site.querySelectorAll(".hero .sl").forEach(function (el) { el.classList.toggle("on", +el.dataset.i === UI.slide); });
  site.querySelectorAll(".hdots button").forEach(function (b) { b.setAttribute("aria-current", String(+b.dataset.hdot === UI.slide)); });
  panel.querySelectorAll(".slide-ed").forEach(function (el) { el.classList.toggle("cur", +el.dataset.slidei === UI.slide); });
  sched();
}
function sched() { clearTimeout(hT); if (S.hero.auto !== "on" || S.hero.slides.length < 2 || UI.pause || UI.hover) return; hT = setTimeout(function () { showSlide(UI.slide + 1); }, Math.max(3, S.hero.int) * 1000); }
site.addEventListener("mouseover", function (e) { var h = !!(e.target.closest && e.target.closest(".hero")); if (h !== !!UI.hover) { UI.hover = h; sched(); } });
site.addEventListener("mouseleave", function () { UI.hover = false; sched(); });

/* napočítanie čísel */
var io = null;
function watchCount() {
  if (UI.counted || S.anim !== "on") { UI.counted = true; return; }
  var el = site.querySelector(".cisla"); if (!el || !("IntersectionObserver" in window)) { UI.counted = true; return; }
  if (io) io.disconnect();
  io = new IntersectionObserver(function (en) { if (en.some(function (x) { return x.isIntersecting; })) { io.disconnect(); countUp(); } }, { root: stage, threshold: 0.4 });
  io.observe(el);
}
function countUp() {
  UI.counted = true;
  site.querySelectorAll(".cisla [data-count]").forEach(function (b) {
    var n = parseInt(b.dataset.count, 10), suf = b.dataset.suf || "", t0 = performance.now(), dur = 1200;
    (function step(t) { var k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3); b.textContent = Math.round(n * e) + suf; if (k < 1) requestAnimationFrame(step); })(t0);
  });
}

/* klikanie v ukážke */
site.addEventListener("click", function (e) {
  var t = e.target.closest("button,a,article"); if (!t) return; var d = t.dataset;
  if (d.edsec) { e.preventDefault(); if (d.edsec === "uvod") { UI.tab = "uvod"; } else { UI.tab = "sekcie"; UI.open = d.edsec; } UI.add = false; renderPanel(); var row = panel.querySelector('[data-row="' + d.edsec + '"]'); if (row) row.scrollIntoView({ block: "start", behavior: "smooth" }); else panel.scrollTop = 0; return; }
  if (d.go !== undefined) { e.preventDefault(); if (UI.menu) { UI.menu = false; render(); } goSec(d.go); return; }
  if (d.menu !== undefined) { UI.menu = !UI.menu; render(); return; }
  if (d.hprev !== undefined) { showSlide(UI.slide - 1, true); return; }
  if (d.hnext !== undefined) { showSlide(UI.slide + 1, true); return; }
  if (d.hdot !== undefined) { showSlide(+d.hdot, true); return; }
  if (d.pk) { UI.pf.k = d.pk; UI.allP = false; render(); return; }
  if (d.ptr) { UI.pf.tr = d.ptr; UI.allP = false; render(); return; }
  if (d.ploc) { UI.pf.loc = "vse"; render(); return; }
  if (d.allp !== undefined) { UI.allP = true; render(); return; }
  if (d.card !== undefined) { toast("Na webe sa otvorí detail ponuky s fotkami, popisom a kontaktom na makléra."); return; }
  if (d.agentP) { UI.pf = { tr: "vse", k: "vse", m: d.agentP, loc: "vse" }; UI.allP = true; render(); goSec("ponuky"); return; }
  if (d.agentK) { UI.kf.komu = d.agentK; UI.kf.done = false; render(); goSec("kontakt"); return; }
  if (d.vtyp) { UI.val.typ = d.vtyp; UI.val.step = 2; render(); return; }
  if (d.vback !== undefined) { UI.val.step = Math.max(1, UI.val.step - 1); UI.val.err = ""; render(); return; }
  if (d.vnext !== undefined) { UI.val.step = 3; render(); return; }
  if (d.vsend !== undefined) { var v = UI.val; v.err = !v.meno.trim() ? "Doplňte meno." : !v.kont.trim() ? "Doplňte telefón alebo e-mail." : !v.ok2 ? "Potvrďte súhlas so spracovaním údajov." : ""; if (!v.err) { v.ok = true; } render(); return; }
  if (d.vagain !== undefined) { UI.val = { step: 1, typ: "", obec: "Spišská Nová Ves", m2: "", stav: "", meno: "", kont: "", ok: false, err: "" }; render(); return; }
  if (d.kagain !== undefined) { UI.kf.done = false; UI.kf.v = {}; render(); return; }
  if (d.lb) { var q = d.lb.split(":"); UI.lbKey = q[0]; UI.lb = +q[1]; UI.ovl = "lb"; render(); return; }
  if (d.gdpr !== undefined) { e.preventDefault(); UI.ovl = "gdpr"; render(); return; }
  if (d.ckopen !== undefined) { UI.ovl = "ck"; render(); return; }
  if (d.ck) { UI.ck = false; render(); var tr = trk(); toast(d.ck === "vsetky" ? (tr.ga || tr.fb ? "Teraz by sa zapli " + [tr.ga && "Google Analytics", tr.fb && "Meta Pixel"].filter(Boolean).join(" a ") + "." : "Súhlas uložený. Meranie zatiaľ nie je nastavené.") : "Zapnuté len nevyhnutné cookies. Meranie sa nespustí."); return; }
  if (d.demo !== undefined) { toast("Na webe sa otvorí článok z Týpka."); return; }
  if (t.tagName === "A" && t.getAttribute("href") && t.getAttribute("href").charAt(0) !== "#" && !/^https?:/i.test(t.getAttribute("href"))) { e.preventDefault(); toast("Na webe: " + t.getAttribute("href").replace(/^(tel|mailto):/, "")); }
});
site.addEventListener("keydown", function (e) { if ((e.key === "Enter" || e.key === " ") && e.target.matches && e.target.matches("[data-card]")) { e.preventDefault(); e.target.click(); } });
site.addEventListener("input", function (e) { var t = e.target, f = t.dataset && t.dataset.vf; if (f) UI.val[f] = t.type === "checkbox" ? t.checked : t.value; if (t.form && t.form.dataset.kform !== undefined && t.name) UI.kf.v[t.name] = t.type === "checkbox" ? t.checked : t.value; });
site.addEventListener("change", function (e) {
  var t = e.target; if (t.dataset.vf) { UI.val[t.dataset.vf] = t.type === "checkbox" ? t.checked : t.value; return; }
  if (t.dataset.pm !== undefined) { UI.pf.m = t.value; UI.allP = false; render(); }
});
site.addEventListener("submit", function (e) {
  e.preventDefault(); var f = e.target;
  if (f.dataset.srch !== undefined) { UI.pf = { tr: f.tr.value, k: f.k.value, m: "vse", loc: f.loc.value }; UI.allP = true; render(); goSec("ponuky"); return; }
  if (f.dataset.kform !== undefined) { var k = UI.kf; k.komu = f.komu.value; k.err = !f.meno.value.trim() ? "Doplňte meno." : !f.tel.value.trim() && !f.mail.value.trim() ? "Doplňte telefón alebo e-mail." : !f.ok.checked ? "Potvrďte súhlas so spracovaním údajov." : ""; if (!k.err) k.done = true; render(); goSec("kontakt"); }
});
$("frame").addEventListener("click", function (e) {
  var t = e.target; if (!t.closest("#ovlHost")) return;
  if (t.matches("[data-ovlbg]") || t.closest("[data-ovlx]")) { UI.ovl = null; render(); return; }
  var b = t.closest("button"); if (!b) return;
  if (b.dataset.lbm) { var L = get(UI.lbKey) || []; UI.lb = (UI.lb + (+b.dataset.lbm) + L.length) % L.length; render(); return; }
  if (b.dataset.ck) { UI.ovl = null; UI.ck = false; render(); toast("Súhlas uložený."); return; }
  if (b.dataset.cksave !== undefined) { var cs = {}; document.querySelectorAll("#ovlHost [data-cks]").forEach(function (x) { cs[x.dataset.cks] = x.checked; }); UI.ckSet = cs; UI.ovl = null; UI.ck = false; render(); toast(cs.ga || cs.fb ? "Zapli by sa: " + [cs.ga && "Google Analytics", cs.fb && "Meta Pixel"].filter(Boolean).join(" a ") + "." : "Meranie sa nespustí."); }
});
document.addEventListener("keydown", function (e) { if (e.key === "Escape" && UI.ovl) { UI.ovl = null; render(); } });

/* zariadenie, náhľad, horné tlačidlá */
function renderDev() { $("devSeg").innerHTML = [["pc", "Počítač"], ["tablet", "Tablet"], ["mobil", "Mobil"]].map(function (x) { return '<button type="button" data-dev="' + x[0] + '" aria-pressed="' + (UI.dev === x[0]) + '">' + x[1] + "</button>"; }).join(""); }
$("devSeg").addEventListener("click", function (e) { var b = e.target.closest("[data-dev]"); if (!b) return; UI.dev = b.dataset.dev; UI.menu = false; $("frame").className = "frame dev-" + UI.dev; renderDev(); measure(); render(); stage.scrollTop = 0; });
$("fullBtn").addEventListener("click", function () { var a = $("app"), on = !a.classList.contains("full"); a.classList.toggle("full", on); this.setAttribute("aria-pressed", String(on)); this.textContent = on ? "Späť na úpravy" : "Náhľad na celú šírku"; measure(); render(); });
$("pub").addEventListener("click", function () { toast("Toto je návrh šablóny. Zverejnenie s doménou, verziami a kontrolou doplníme po doladení, rovnako ako pri webe makléra."); });
$("reset").addEventListener("click", function () { S = clone(DEF); save(); UI.slide = 0; UI.open = ""; UI.pf = { tr: "vse", k: "vse", m: "vse", loc: "vse" }; UI.counted = false; UI.ck = true; renderPanel(); render(); toTop(); toast("Návrh je späť v pôvodnom stave."); });
function avail() { var a = $("app"), top = a.getBoundingClientRect().top + window.scrollY; document.documentElement.style.setProperty("--avail", Math.max(560, window.innerHeight - top - 16) + "px"); }
function measure() { avail(); vhPx = Math.max(520, Math.min(980, stage.clientHeight - (UI.dev === "pc" ? 0 : 36))); }
var rz = 0; window.addEventListener("resize", function () { clearTimeout(rz); rz = setTimeout(function () { var o = vhPx; measure(); if (o !== vhPx) render(); }, 150); });

/* ================================================================ návrhy na úpravy (zaškrtne admin a pošle) */
var NAVRHY = [
  ["data", "Skutočné ponuky a makléri z Týpka", "Namiesto ukážkových ponúk sa ukážu aktívne ponuky všetkých maklérov kancelárie s fotkami, maklér s fotkou a titulom a klik otvorí stránku ponuky."],
  ["ulozit", "Ukladanie do databázy, zverejnenie a verzie", "Návrh sa uloží v Týpku a nie len v tomto prehliadači. Rozpracovaný a zverejnený web, staršie verzie a kontrola pred zverejnením ako pri webe makléra."],
  ["domena", "Vlastná doména kancelárie", "Web pobeží na alphareality.sk, s ikonou v prehliadači, náhľadom pri zdieľaní na Facebooku a mapou stránok pre Google."],
  ["formulare", "Formuláre do zvončeka a do Klientov", "Kontakt, odhad ceny a dopyt sa uložia ako klient v Týpku, prídu do zvončeka aj do mobilu. Dopyt pôjde vybranému maklérovi alebo maklérom po rade."],
  ["google", "Automatické Google recenzie", "Hodnotenie, počet a najnovšie recenzie sa načítajú samy z Google profilu kancelárie a raz denne obnovia. Treba na to kľúč od Google."],
  ["predane", "Predané nehnuteľnosti a referencie", "Sekcia s predanými ponukami so štítkom Predané. Dôkaz, že kancelária predáva. Na alphareality.sk sú dnes Referencie."],
  ["kariera", "Kariéra a nábor maklérov", "Sekcia alebo podstránka Pridajte sa k nám s formulárom pre nových maklérov. Žiadosť príde adminovi."],
  ["vykup", "Výkup ako samostatná podstránka", "Vlastná stránka pre výkup s postupom, výhodami a formulárom na rýchlu ponuku."],
  ["strazca", "Strážca ponúk", "Návštevník napíše, čo hľadá, a dostane e-mail, keď sa objaví vhodná ponuka. Dopyt sa uloží v Klientoch."],
  ["video", "Video v úvode", "Namiesto fotky krátke video cez celý úvod, vlastné alebo z knižnice Týpka."],
  ["mapa", "Živá mapa a mapa ponúk", "Skutočná mapa s kanceláriou a voliteľne mapa so všetkými ponukami."],
  ["podstranky", "Samostatné podstránky", "Ponuky, O nás, Tím, Blog a Kontakt ako samostatné stránky s vlastnými adresami. Google ich lepšie nájde."],
  ["ai", "Texty na jeden klik", "AI asistent napíše úvod, O kancelárii a služby podľa troch otázok, tak ako pri webe makléra."],
  ["oznam", "Pás s oznamom", "Úzky pás nad hlavičkou, napríklad Vianočné otváracie hodiny alebo Nová ponuka výkupu."],
  ["hypo", "Hypotekárna kalkulačka", "Výpočet splátky priamo na webe, ako sekcia alebo pri ponuke."],
  ["stat", "Štatistiky webu", "Návštevy, odkiaľ ľudia prišli a koľko poslali formulárov, rovnako ako pri webe makléra."]];
var NKEY = "typek-web-kancelarie-navrhy";
function navVyber() { try { return JSON.parse(localStorage.getItem(NKEY) || "[]"); } catch (e) { return []; } }
function navUloz(a) { try { localStorage.setItem(NKEY, JSON.stringify(a)); } catch (e) { /* nič */ } }
function navPocet() { var n = navVyber().length; $("navrhyN").textContent = n ? String(n) : ""; $("navrhySt").textContent = n ? "Vybraté: " + n : "Nič nie je vybraté."; }
function navRender() { var v = navVyber(); $("navrhyL").innerHTML = NAVRHY.map(function (x, i) { return '<li><label><input type="checkbox" data-nav="' + x[0] + '"' + (v.indexOf(x[0]) >= 0 ? " checked" : "") + "><span><b><i>" + (i + 1) + ".</i>" + esc(x[1]) + "</b>" + esc(x[2]) + "</span></label></li>"; }).join(""); navPocet(); }
$("navrhyBtn").addEventListener("click", function () { navRender(); var d = $("navrhyD"); if (d.showModal) d.showModal(); else d.setAttribute("open", ""); });
$("navrhyD").addEventListener("change", function (e) { var k = e.target.dataset && e.target.dataset.nav; if (!k) return; var v = navVyber().filter(function (x) { return x !== k; }); if (e.target.checked) v.push(k); navUloz(v); navPocet(); });
$("navrhyD").addEventListener("click", function (e) {
  var d = $("navrhyD");
  if (e.target === d || e.target.closest("[data-navx]")) { d.close(); return; }
  if (e.target.closest("[data-navcopy]")) {
    var v = navVyber(), t = NAVRHY.map(function (x, i) { return v.indexOf(x[0]) >= 0 ? (i + 1) + ". " + x[1] : ""; }).filter(Boolean);
    if (!t.length) { toast("Najprv zaškrtni aspoň jeden návrh."); return; }
    var txt = "Web kancelárie – chcem doplniť:\n" + t.join("\n");
    try { navigator.clipboard.writeText(txt).then(function () { toast("Výber je skopírovaný. Vlož ho do chatu s Claudom."); }, function () { toast(txt); }); } catch (x) { toast(txt); }
  }
});

/* ================================================================ prístup len pre administrátora */
function zamknute(nadpis, text) {
  $("gate").innerHTML = '<img src="typek-hlavicka.png" alt="" width="64" height="64"><h2>' + esc(nadpis) + "</h2><p>" + esc(text) + '</p><a class="b b-gold" href="./">Späť do Realitného týpka</a>';
}
function start() {
  $("gate").hidden = true; $("app").hidden = false; $("topAct").hidden = false;
  $("frame").className = "frame dev-pc";
  renderDev(); renderPanel(); measure(); render(); navPocet();
  if (location.hash === "#navrhy") $("navrhyBtn").click();
}
var CFG = window.SKENER_CONFIG || {};
try {
  var sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey, { auth: { persistSession: true, autoRefreshToken: true } });
  sb.auth.getSession().then(function (r) {
    var ses = r.data && r.data.session;
    if (!ses) { zamknute("Najprv sa prihlás", "Návrh webu kancelárie otvoríš po prihlásení v Realitnom týpkovi."); return; }
    return sb.from("makleri").select("rola,aktivny").eq("id", ses.user.id).maybeSingle().then(function (q) {
      if (q.error) throw q.error;
      if (!q.data || q.data.rola !== "admin" || q.data.aktivny === false) { zamknute("Len pre administrátora", "Návrh webu kancelárie zatiaľ vidí iba administrátor."); return; }
      start();
    });
  }).catch(function () { zamknute("Prístup sa nepodarilo overiť", "Skontroluj pripojenie na internet a skús stránku obnoviť."); });
} catch (e) { zamknute("Prístup sa nepodarilo overiť", "Skús stránku obnoviť."); }
})();
