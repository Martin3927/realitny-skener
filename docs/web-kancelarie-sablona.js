/* Web realitnej kancelárie – šablóna a vykreslenie, spoločné pre skladačku v Týpku (web-kancelarie.html)
   aj pre verejný web (kancelaria.html, cez stranka.php aj na vlastnej doméne). Realitný týpek */
(function () {
"use strict";
var T = window.TYPEK_WEB || {};
var CFG = window.SKENER_CONFIG || {};
var APP = "https://app.realitnytypek.sk/";

/* ================================================================ pomocníci */
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
function clone(o) { return JSON.parse(JSON.stringify(o)); }
function paras(t) { return String(t || "").split(/\n+/).filter(function (x) { return x.trim(); }).map(function (p) { return "<p>" + esc(p) + "</p>"; }).join(""); }
function lines(t) { return String(t || "").split(/\n+/).map(function (x) { return x.trim(); }).filter(Boolean); }
var NF = new Intl.NumberFormat("sk-SK");
function fmt(v) { return NF.format(Math.round(v)); }
function initials(n) { return String(n || "").replace(/,.*$/, "").split(/\s+/).filter(function (w) { return w && !/\.$/.test(w); }).map(function (w) { return w[0]; }).join("").slice(0, 2).toUpperCase() || "M"; }
function url(u) { u = String(u || "").trim(); return !u ? "" : /^https?:\/\//i.test(u) ? u : "https://" + u; }
function slug(t) { return String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 70); }
function pon(n) { return n + (n === 1 ? " ponuka" : n >= 2 && n <= 4 ? " ponuky" : " ponúk"); }
function SV(p, sw) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="' + (sw || 1.9) + '" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + p + "</svg>"; }
var STAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2.8l2.8 5.8 6.3.9-4.6 4.4 1.1 6.3L12 17.2l-5.6 3 1.1-6.3L2.9 9.5l6.3-.9z"/></svg>';
function stars(n) { n = Math.max(1, Math.min(5, Math.round(n || 5))); var s = ""; for (var i = 0; i < n; i++) s += STAR; return '<span class="stars" aria-label="' + n + ' z 5 hviezdičiek">' + s + "</span>"; }
var IC = {
  tel: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
  pin: '<path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
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
  euro: '<path d="M17 6.5A7 7 0 1 0 17 17.5"/><path d="M4 10h9M4 14h9"/>',
  zvon: '<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  l: '<path d="M15 5l-7 7 7 7"/>', r: '<path d="M9 5l7 7-7 7"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>', x: '<path d="M6 6l12 12M18 6L6 18"/>',
  laur: '<circle cx="12" cy="9" r="6"/><path d="M8.6 13.8L7 22l5-2.8 5 2.8-1.6-8.2"/><path d="M12 6l1 2 2.2.3-1.6 1.5.4 2.2-2-1.1-2 1.1.4-2.2-1.6-1.5L11 8z"/>',
  web: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
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
var LIB = [["dom-novostavba", "Novostavba"], ["dom-rodinny", "Rodinný dom"], ["dom-zahrada", "Dom so záhradou"], ["dom-obyvacka", "Obývačka v dome"], ["luxus-obyvacka", "Luxusný interiér"],
  ["byt-obyvacka", "Obývačka v byte"], ["byt-centrum", "Byt v centre"], ["byt-dom", "Bytový dom"], ["byt-tehla", "Tehlový dom"], ["byt-kuchyna", "Kuchyňa"], ["byt-spalna", "Spálňa"],
  ["mesto-namestie", "Námestie"], ["mesto-letecky", "Mesto zhora"], ["pozemok", "Pozemok"], ["chata", "Chata"], ["chata-krb", "Chata s krbom"], ["chatka", "Chatka v horách"]];
var VIDEA = [["video-dom", "Dom pod horami", "dom-novostavba"], ["video-luxus", "Luxusný interiér", "luxus-obyvacka"], ["video-mesto", "Námestie", "mesto-namestie"]];
var BASE = (function () { try { var u = document.currentScript && document.currentScript.src; if (u) return u.split(/[?#]/)[0].replace(/[^\/]*$/, ""); } catch (e) { /* nič */ } return ""; })();
function src(v, maly) { v = String(v || ""); if (!v) return ""; if (/^(data:|blob:|https?:)/.test(v)) return v; return BASE + "img/web/" + v + (maly ? "-m" : "") + ".webp"; }
function vidSrc(v) { v = String(v || ""); if (/^https?:/.test(v)) return v; return VIDEA.some(function (x) { return x[0] === v; }) ? BASE + "img/web/" + v + ".mp4" : ""; }
function fotkaUrl(f) { if (!f) return ""; if (typeof f === "string") return f; if (f.url) return f.url; return f.cesta ? CFG.supabaseUrl + "/storage/v1/object/public/ponuky/" + f.cesta : ""; }

/* ================================================================ ukážkové údaje (len v skladačke, kým v Týpku nie sú ponuky) */
var UKAZKA_P = [
  { k: "byt", rent: false, t: "3-izbový byt s loggiou", l: "Spišská Nová Ves", p: 139000, m: 74, a: ["74 m²", "3 izby", "6. poschodie"], img: "byt-obyvacka", st: "Novinka" },
  { k: "dom", rent: false, t: "Rodinný dom so záhradou", l: "Smižany", p: 229000, m: 142, a: ["142 m²", "4 izby", "pozemok 620 m²"], img: "dom-zahrada" },
  { k: "poz", rent: false, t: "Stavebný pozemok pri lese", l: "Markušovce", p: 68000, m: 950, a: ["950 m²"], img: "pozemok" },
  { k: "byt", rent: true, t: "2-izbový byt v centre", l: "Levoča", p: 520, m: 54, a: ["54 m²", "2 izby"], img: "byt-centrum" },
  { k: "dom", rent: false, t: "Novostavba bungalovu", l: "Harichovce", p: 259000, m: 118, a: ["118 m²", "4 izby"], img: "dom-novostavba", st: "Rezervované" },
  { k: "chata", rent: false, t: "Chata s krbom", l: "Hrabušice", p: 95000, m: 64, a: ["64 m²", "3 izby"], img: "chata-krb" }];
var UKAZKA_REV = [
  { meno: "Klientka z Levoče", hodnotenie: 5, text: "Predaj bytu prebehol rýchlejšie, než sme čakali. Vždy nám zdvihli telefón a všetko vysvetlili.", pred: "ukážka" },
  { meno: "Predávajúci zo Smižian", hodnotenie: 5, text: "Oceňujeme poctivé ocenenie domu aj pomoc s papiermi až po kataster.", pred: "ukážka" },
  { meno: "Kupujúci zo Spišskej Novej Vsi", hodnotenie: 5, text: "Pomohli nám nájsť byt aj vybaviť hypotéku. Odporúčame.", pred: "ukážka" }];
var OBCE = ["Spišská Nová Ves", "Levoča", "Smižany", "Markušovce", "Harichovce", "Spišské Vlachy", "Krompachy", "Spišské Podhradie", "Hrabušice", "Poprad", "Iná obec"];
var KINDS = [["vse", "Všetko"], ["byt", "Byty"], ["dom", "Domy"], ["poz", "Pozemky"], ["chata", "Chaty"]];
var KAT_DB = { byt: "byty", dom: "domy", poz: "pozemky", chata: "chaty" };
var SVC_IC = [["dom", "Dom"], ["byt", "Byt"], ["kluc", "Kľúč"], ["d3", "3D prehliadka"], ["dron", "Dron"], ["staging", "Staging"], ["zmluva", "Zmluva"], ["hladat", "Hľadanie"], ["graf", "Graf"], ["foto", "Fotky"], ["srdce", "Srdce"], ["poz", "Pozemok"], ["euro", "Euro"]];

/* ================================================================ sekcie a podstránky */
var SEC = {
  cisla: { n: "Čísla pod úvodom", d: "číselník, pekne sa napočítajú" },
  ponuky: { n: "Ponuky maklérov", d: "všetci makléri, z Týpka" },
  predane: { n: "Predané a referencie", d: "predané ponuky z Týpka" },
  okancelarii: { n: "O kancelárii", d: "text, fotka, výhody" },
  sluzby: { n: "Služby", d: "zoznam služieb s ikonami" },
  odhad: { n: "Odhad hodnoty", d: "formulár v troch krokoch" },
  strazca: { n: "Strážca ponúk", d: "dopyt do Klientov, e-maily s ponukami" },
  tim: { n: "Náš tím", d: "makléri z Týpka" },
  ocenenia: { n: "Ocenenia", d: "ocenenia a certifikáty" },
  recenzie: { n: "Recenzie", d: "Google aj Týpek" },
  galeria: { n: "Galéria", d: "viac fotiek naraz" },
  mapa: { n: "Mapa ponúk", d: "ponuky na mape" },
  hypo: { n: "Hypotekárna kalkulačka", d: "výpočet splátky" },
  clanky: { n: "Články", d: "blog kancelárie" },
  kariera: { n: "Kariéra (výzva)", d: "odkaz na stránku Kariéra" },
  kontakt: { n: "Kontakt a mapa", d: "formulár, kontakty, mapa" } };
var STRANKY = [["ponuky", "Ponuky", "ponuky"], ["predane", "Predané", "predane"], ["o-nas", "O nás", "okancelarii"], ["sluzby", "Služby", "sluzby"], ["vykup", "Výkup", ""],
  ["tim", "Tím", "tim"], ["kariera", "Kariéra", "kariera"], ["blog", "Blog", "clanky"], ["kontakt", "Kontakt", "kontakt"]];
var CTYPES = [["text", "Text", "nadpis a odseky"], ["txph", "Text a fotka", "fotka vedľa textu"], ["fotky", "Fotky", "galéria fotiek"], ["vyzva", "Výzva s tlačidlom", "farebný pás"]];
var CLANKY_DEF = [
  { id: "a1", t: "Na čo si dať pozor pri kúpe staršieho bytu na sídlisku", d: "Stúpačky, zateplenie, fond opráv a list vlastníctva. Päť vecí, ktoré si oplatí overiť ešte pred rezervačnou zmluvou.", img: "byt-tehla", dt: "2026-10-14",
    text: "Starší byt na sídlisku býva cenovo dostupnejší, no pred podpisom rezervačnej zmluvy sa oplatí preveriť niekoľko vecí.\nOpýtajte sa správcu domu, kedy sa menili stúpačky a či je dom zateplený. Pozrite si výšku fondu opráv a plánované opravy na schôdzi vlastníkov.\nSkontrolujte list vlastníctva: kto je vlastník, či na byte nie je ťarcha a či sedí výmera. S overením vám radi pomôžeme." },
  { id: "a2", t: "Ako pripraviť dom na obhliadku, aby zaujal na prvý pohľad", d: "Upratať, vyvetrať a odložiť osobné veci. Drobné úpravy, vďaka ktorým sa dom predá rýchlejšie.", img: "dom-obyvacka", dt: "2026-09-16",
    text: "Prvý dojem rozhoduje už pri fotkách, a potom znova pri obhliadke.\nUpracte, vyvetrajte a odložte osobné veci, aby si kupujúci vedel predstaviť vlastné bývanie. Opravte drobnosti, ktoré bijú do očí, napríklad kvapkajúci kohútik alebo nefunkčné svetlo.\nPred obhliadkou rozsvieťte, otvorte žalúzie a postarajte sa o vstup a záhradu. Ostatné necháme na nás." },
  { id: "a3", t: "Koľko stojí predaj bytu a čo všetko je v cene", d: "Provízia, poplatky na katastri, energetický certifikát. Prehľad nákladov, s ktorými rátať.", img: "byt-dom", dt: "2026-08-19",
    text: "Pri predaji bytu rátajte s províziou realitnej kancelárie, poplatkom za návrh na vklad do katastra a s energetickým certifikátom, ak ho ešte nemáte.\nVýšku provízie vám povieme vopred a zapíšeme ju do zmluvy. Platí sa až po úspešnom predaji.\nAk si nie ste istí, čo vás čaká, ozvite sa. Prejdeme to spolu ešte pred podpisom." }];

var DEF = {
  v: 1, tpl: "klasicka", set: "alpha", color: "alpha", cc: "#DAB967", b2: "#1E2A35", hcol: "text", font: "moderne", bg: "svetle", head: "svetla", btn: "pill", r: 14, anim: "on",
  oznam: { on: "off", text: "Nové ponuky každý týždeň. Nechajte si ich posielať e-mailom.", b: "Strážca ponúk", go: "ponuky", u: "" },
  hero: { eb: "Realitná kancelária pre Spiš", auto: "on", int: 6, dim: 45, align: "vlavo", hh: "vysoka", search: "on", slides: [
    { media: "foto", img: "dom-novostavba", video: "", t: "Predáme vašu nehnuteľnosť rýchlo a za dobrú cenu.", l: "Realitná kancelária pre Spišskú Novú Ves, Levoču a okolie. Od ocenenia až po odovzdanie kľúčov.", b: "Viac informácií", go: "o-nas", u: "", b2: "Pozrieť ponuky", go2: "ponuky", u2: "" },
    { media: "foto", img: "mesto-namestie", video: "", t: "Potrebujete predať hneď? Nehnuteľnosť od vás odkúpime.", l: "Byty, domy aj pozemky. Peniaze v hotovosti alebo na účet, papiere a kataster vybavíme za vás.", b: "Viac informácií", go: "vykup", u: "", b2: "", go2: "kontakt", u2: "" },
    { media: "foto", img: "luxus-obyvacka", video: "", t: "Koľko má hodnotu vaša nehnuteľnosť?", l: "Pošlite nám pár údajov a pripravíme vám odhad ceny podľa skutočných predajov v okolí. Zadarmo a nezáväzne.", b: "Zistiť hodnotu", go: "odhad", u: "", b2: "", go2: "kontakt", u2: "" }] },
  podstranky: "on",
  stranky: { ponuky: { on: true, menu: true }, predane: { on: true, menu: false }, "o-nas": { on: true, menu: true }, sluzby: { on: true, menu: true }, vykup: { on: true, menu: true },
    tim: { on: true, menu: true }, kariera: { on: true, menu: false }, blog: { on: true, menu: true }, kontakt: { on: true, menu: true } },
  order: ["cisla", "ponuky", "okancelarii", "sluzby", "c1", "odhad", "predane", "tim", "recenzie", "strazca", "ocenenia", "galeria", "mapa", "hypo", "clanky", "kariera", "kontakt"],
  on: { cisla: true, ponuky: true, okancelarii: true, sluzby: true, c1: true, odhad: true, predane: false, tim: true, recenzie: true, strazca: true, ocenenia: false, galeria: true, mapa: false, hypo: false, clanky: true, kariera: true, kontakt: true },
  cisla: { st: "pas", rows: [{ typ: "vlastne", n: "15+", t: "rokov na realitnom trhu" }, { typ: "ponuky", n: "", t: "aktuálnych ponúk" }, { typ: "makleri", n: "", t: "maklérov v tíme" }, { typ: "vlastne", n: "2", t: "okresy: Spišská Nová Ves a Levoča" }] },
  ponuky: { eb: "Ponuky", t: "Aktuálne ponuky našich maklérov", l: "Byty, domy, pozemky aj chaty na predaj a prenájom.", cnt: "6", lay: "mriezka", filt: "on", agent: "on", sort: "nove", mapa: "on" },
  predane: { eb: "Referencie", t: "Predali sme", l: "Nehnuteľnosti, ktoré sme nedávno predali alebo prenajali.", cnt: "6" },
  okancelarii: { eb: "O nás", t: "Realitná kancelária, ktorá pozná Spiš", text: "Viac ako 15 rokov sprostredkúvame predaj, kúpu a prenájom nehnuteľností a vykupujeme byty, domy aj pozemky. Pôsobíme v Spišskej Novej Vsi, Levoči, Poprade a okolí.\nKaždému klientovi povieme na rovinu, čo je možné. Postaráme sa o ocenenie, fotky, inzerciu, obhliadky, zmluvy aj kataster.", img: "mesto-namestie", pts: "Najviac pozitívnych recenzií v regióne\nCertifikovaní realitní špecialisti RSc.\nVýkup bytov, domov a pozemkov\nVšetko od ocenenia až po kataster", b: "Spoznajte náš tím", go: "tim", badge: "on" },
  sluzby: { eb: "Služby", t: "S čím vám pomôžeme", l: "Všetko okolo predaja, kúpy a prenájmu pod jednou strechou.", items: [
    { ic: "dom", t: "Predaj a prenájom", d: "Ocenenie, fotky, inzercia, obhliadky a zmluvy až po kataster." },
    { ic: "kluc", t: "Výkup nehnuteľností", d: "Nehnuteľnosť od vás odkúpime rýchlo a bez inzercie." },
    { ic: "d3", t: "Virtuálne prehliadky", d: "Kupujúci si nehnuteľnosť prejde online ešte pred obhliadkou." },
    { ic: "dron", t: "Zábery z dronu", d: "Domy a pozemky ukážeme aj z výšky, s celým okolím." },
    { ic: "staging", t: "Virtuálny staging", d: "Prázdne izby zariadime na fotkách, aby kupujúci videli ich možnosti." },
    { ic: "zmluva", t: "Servis pri prevode", d: "Zmluvy, úschova peňazí, hypotéka a návrh na vklad do katastra." },
    { ic: "hladat", t: "Agent kupujúceho", d: "Nájdeme vám vhodnú nehnuteľnosť a zastúpime vás pri jednaní." }] },
  odhad: { eb: "Odhad hodnoty", t: "Koľko má hodnotu vaša nehnuteľnosť?", text: "Vyplňte pár údajov a do 24 hodín vám pošleme odhad ceny podľa skutočných predajov v okolí. Zadarmo a nezáväzne.", kroky: "Vyplníte krátky formulár, trvá to 2 minúty\nOzve sa vám náš maklér\nDostanete odhad ceny" },
  strazca: { eb: "Strážca ponúk", t: "Nájdeme vám bývanie skôr, než bude na portáloch", l: "Napíšte, čo hľadáte. Keď sa objaví vhodná ponuka, pošleme vám ju e-mailom." },
  tim: { eb: "Náš tím", t: "Makléri, ktorí vám pomôžu", l: "Každý z nás pozná svoj región. Vyberte si makléra alebo napíšte kancelárii.", web: "on", kont: "on" },
  ocenenia: { eb: "Ocenenia", t: "Ocenenia a certifikáty", items: [{ t: "Certifikovaní realitní špecialisti", y: "RSc.", d: "Titul RSc. majú naši makléri" }] },
  recenzie: { eb: "Recenzie", t: "Čo o nás hovoria klienti", cnt: "6", write: "on", zdroj: "oboje" },
  galeria: { eb: "Galéria", t: "Z našej práce", lay: "mozaika", imgs: ["dom-obyvacka", "byt-obyvacka", "mesto-letecky", "chata", "byt-kuchyna", "dom-rodinny"] },
  mapa: { eb: "Mapa", t: "Ponuky na mape", l: "Pozrite si, kde sa nachádzajú." },
  hypo: { eb: "Hypotéka", t: "Koľko by ste splácali", l: "Orientačný výpočet. Presnú ponuku vám pripravíme s hypotekárnym špecialistom.", rate: 4.2, roky: 30, cena: 150000, vlastne: 20 },
  clanky: { eb: "Blog", t: "Rady a novinky z realít", cnt: "3", items: CLANKY_DEF },
  kariera: { eb: "Kariéra", t: "Pridajte sa k nám", l: "Hľadáme maklérov, ktorí chcú robiť reality poctivo a s podporou celej kancelárie.", text: "Ponúkame zázemie kancelárie v centre mesta, vlastný realitný softvér Realitný týpek, marketing ponúk a zaškolenie od skúsených maklérov.\nNezáleží na tom, či v realitách začínate, alebo už máte skúsenosti. Dôležité je, aby ste chceli pomáhať ľuďom.", pts: "Zaškolenie a podpora skúsených maklérov\nVlastný softvér, fotky, video a inzercia\nZázemie kancelárie a férové podmienky\nFlexibilný čas a výkonnostná odmena", img: "mesto-namestie", b: "Mám záujem" },
  vykup: { eb: "Výkup nehnuteľností", t: "Nehnuteľnosť od vás odkúpime", l: "Potrebujete predať rýchlo? Byt, dom aj pozemok vykúpime a papiere vybavíme za vás.", text: "Výkup je riešenie, keď potrebujete peniaze rýchlo alebo nechcete riešiť inzerciu a obhliadky.\nNehnuteľnosť si pozrieme, dostanete konkrétnu ponuku a ak sa dohodneme, postaráme sa o zmluvy aj kataster.", pts: "Peniaze v hotovosti alebo na účet\nVyplatíme aj exekúcie a dlhy na nehnuteľnosti\nPapiere a kataster vybavíme za vás\nDiskrétne, bez inzerátu a obhliadok", kroky: "Zavoláte alebo vyplníte formulár\nPozrieme si nehnuteľnosť\nDostanete konkrétnu ponuku\nPodpis zmluvy a vyplatenie", img: "mesto-namestie" },
  kontakt: { eb: "Kontakt", t: "Napíšte nám alebo sa zastavte", l: "Kancelária je v centre Spišskej Novej Vsi. Radi vám poradíme osobne aj telefonicky.", form: "on", map: "on", hours: "on" },
  custom: { c1: { typ: "vyzva", t: "Výkup nehnuteľností", text: "Potrebujete predať rýchlo? Byt, dom aj pozemok od vás odkúpime. Peniaze v hotovosti alebo na účet, papiere a kataster vybavíme za vás.", img: "", imgs: [], b: "Viac o výkupe", go: "vykup", u: "", bgs: "col", menu: "off", ml: "" } },
  k: { name: "Alpha Reality", logo: "logo.png", addr: "Hviezdoslavova 8, 052 01 Spišská Nová Ves", lat: 48.947233, lon: 20.56593, tel: "+421 915 140 759", mail: "info@alphareality.sk", hours: "Po – Pi 8:00 – 16:30", ico: "50 801 457",
    soc: { fb: "facebook.com/alpharealit", ig: "instagram.com/alphareality.sk", yt: "youtube.com/@alpharealitysk", li: "", tt: "" } },
  team: {},
  smerovanie: { predvolene: "kancelaria", odhad: "", vykup: "", strazca: "" },
  rev: { url: "", rating: "", count: "" },
  gdpr: { who: "Alpha Reality s.r.o.", ico: "50 801 457", addr: "Hviezdoslavova 8, 052 01 Spišská Nová Ves", mail: "info@alphareality.sk", dpo: "", bar: "on" },
  ga: "", px: "",
  share: { title: "", desc: "" }
};

/* ================================================================ stav šablóny */
var K = { S: null, D: null, root: null, page: "domov", sub: "", editor: false, adresa: "", domena: "", vlastna: false, hooks: {}, scroller: window, ovlHost: null,
  vh: function () { return window.innerHeight || 800; },
  UI: { slide: 0, pf: { tr: "vse", k: "vse", m: "vse", loc: "vse" }, allP: false, menu: false, ck: true, ovl: null, lb: 0, lbKey: "", counted: false, pause: false, hover: false, oznamX: false,
    f: {}, val: { step: 1, typ: "", obec: "Spišská Nová Ves", m2: "", stav: "" }, straz: { k: [], tr: "predaj", obce: "", cena: "" }, hyp: null } };

function deep(d, x) {
  if (Array.isArray(d)) return Array.isArray(x) ? x : d;
  if (d && typeof d === "object") { var o = {}; Object.keys(d).forEach(function (k) { o[k] = x && typeof x === "object" && !Array.isArray(x) && k in x ? deep(d[k], x[k]) : clone(d[k]); }); if (x && typeof x === "object" && !Array.isArray(x)) Object.keys(x).forEach(function (k) { if (!(k in d)) o[k] = x[k]; }); return o; }
  return x === undefined || x === null || typeof x !== typeof d ? d : x;
}
// nastavenie zo servera doplnené o predvolené hodnoty (aj keď pribudne nová sekcia)
function merge(x) {
  var s = deep(DEF, x && typeof x === "object" ? x : {});
  if (!s.custom || typeof s.custom !== "object") s.custom = {};
  s.order = (Array.isArray(s.order) ? s.order : DEF.order.slice()).filter(function (k, i, a) { return typeof k === "string" && a.indexOf(k) === i && (SEC[k] || s.custom[k]); });
  DEF.order.forEach(function (k) { if (s.order.indexOf(k) < 0 && SEC[k]) { s.order.splice(Math.max(0, s.order.indexOf("kontakt")), 0, k); if (!(k in s.on)) s.on[k] = DEF.on[k]; } });
  if (!Array.isArray(s.hero.slides) || !s.hero.slides.length) s.hero.slides = clone(DEF.hero.slides);
  s.hero.slides = s.hero.slides.filter(function (x) { return x && typeof x === "object"; }).map(function (x) { return deep(DEF.hero.slides[0], x); });
  if (!Array.isArray(s.clanky.items)) s.clanky.items = clone(CLANKY_DEF);
  s.clanky.items = s.clanky.items.filter(function (a) { return a && typeof a === "object"; });
  STRANKY.forEach(function (x) { if (!s.stranky[x[0]] || typeof s.stranky[x[0]] !== "object") s.stranky[x[0]] = clone(DEF.stranky[x[0]]); });
  if (!s.team || typeof s.team !== "object" || Array.isArray(s.team)) s.team = {};
  return s;
}

/* ================================================================ farby a meranie */
function pal() {
  var S = K.S, B = BGS.find(function (b) { return b.id === S.bg; }) || BGS[0];
  function fix(c) { if (B.dark && con(c, B.bg) < 3) return mix(c, "#FFFFFF", 0.45); if (!B.dark && con(c, B.bg) < 1.45) return rdAll(c, [B.bg], "#1A2128", 1.45); return c; }
  var col = COLORS.find(function (c) { return c.id === S.color; });
  var A = fitOn(fix(S.color === "vlastna" && isHex(S.cc) ? S.cc : (col ? col.c : "#DAB967")));
  var Bc = fitOn(isHex(S.b2) ? (B.dark && con(S.b2, B.bg) < 1.6 ? mix(S.b2, "#FFFFFF", 0.2) : S.b2) : A[0]);
  var a = A[0], b = Bc[0], soft = mix(a, B.bg, B.dark ? 0.8 : 0.84), bsoft = mix(b, B.bg, B.dark ? 0.8 : 0.86), tx = B.dark ? "#FFFFFF" : "#000000";
  var all = [B.bg, B.surf, soft, bsoft], fg = rdAll(B.fg, all, tx, 7);
  return { bg: B.bg, surf: B.surf, line: B.line, dark: B.dark, fg: fg, muted: rdAll(B.muted, all, fg, 4.5), a: a, onA: A[1], soft: soft, b: b, onB: Bc[1], bsoft: bsoft,
    at: rdAll(a, [B.bg, B.surf, soft], tx, 4.5), bt: rdAll(b, [B.bg, B.surf, bsoft], tx, 4.5), aOnB: con(a, b) >= 3 ? a : Bc[1],
    hc: S.hcol === "a" ? rdAll(a, [B.bg, B.surf, bsoft], tx, 3.2) : S.hcol === "b" ? rdAll(b, [B.bg, B.surf, bsoft], tx, 3.2) : fg,
    err: rdAll("#C2412D", [B.bg, B.surf], tx, 4.5) };
}
function trk() { var S = K.S, ga = String(S.ga || "").trim().toUpperCase(), fb = String(S.px || "").trim().replace(/\s+/g, ""); ga = /^G-[A-Z0-9]{4,14}$/.test(ga) ? ga : ""; fb = /^\d{8,20}$/.test(fb) ? fb : ""; return { ga: ga, fb: fb, any: !!(ga || fb) }; }

/* ================================================================ údaje z Týpka */
function mapPonuka(p) {
  var x = T.prevod ? T.prevod(p) : { id: p.id, t: p.nazov || "Nehnuteľnosť", l: p.obec || "", p: p.cena, rent: p.transakcia === "prenajom", a: [], foto: [] };
  x.mk = p.makler_id; x.lat = p.lat; x.lon = p.lon; x.znizena = !!(p.znizena || p.nova_cena); x.kat = p.kategoria;
  x.foto = (p.fotky || []).map(fotkaUrl).filter(Boolean);
  return x;
}
function vsetkyPonuky() {
  if (!K._pon || K._ponD !== K.D) { K._ponD = K.D; K._pon = ((K.D && K.D.ponuky) || []).map(mapPonuka); K._pred = ((K.D && K.D.predane) || []).map(mapPonuka); }
  return K._pon;
}
function ukazka() { return K.editor && !vsetkyPonuky().length; }
function makleri() { return ((K.D && K.D.makleri) || []); }
function maklerOn(m) { var t = K.S.team[m.id]; return !t || t.on !== false; }
function makleriWeb() {
  var ord = K.S.teamOrder || [], pov = makleri().map(function (m) { return m.id; });
  return makleri().filter(maklerOn).slice().sort(function (a, b) { var i = ord.indexOf(a.id), j = ord.indexOf(b.id); return (i < 0 ? 999 : i) - (j < 0 ? 999 : j) || pov.indexOf(a.id) - pov.indexOf(b.id); });
}
function makler(id) { return makleri().find(function (m) { return m.id === id; }); }
function menoM(m) { return (m && (m.meno_cele || m.meno)) || ""; }
function rolaM(m) { var t = K.S.team[m.id] || {}; return String(t.rola || "").trim() || (m.pohlavie === "zena" ? "Realitná maklérka" : "Realitný maklér"); }
function fotoM(m) { var t = K.S.team[m.id] || {}; return t.foto || m.foto || ""; }
function webM(m) { if (!m.web) return ""; return m.web.domena ? "https://" + m.web.domena + "/" : APP + "stranka.html?m=" + encodeURIComponent(m.web.adresa); }
function ponukyNaWebe() {
  var on = makleriWeb().map(function (m) { return m.id; });
  return vsetkyPonuky().filter(function (x) { return !x.mk || on.indexOf(x.mk) >= 0; });
}
function predane() { vsetkyPonuky(); var on = makleriWeb().map(function (m) { return m.id; }); return (K._pred || []).filter(function (x) { return !x.mk || on.indexOf(x.mk) >= 0; }); }
function odkazPonuky(x) { return x.id ? APP + "ponuka.html?id=" + x.id : ""; }
function google() { return (K.D && K.D.google) || null; }
function hodnotenie() {
  var g = google();
  if (g && g.hodnotenie) return { v: String(Number(g.hodnotenie).toFixed(1)).replace(".", ","), n: g.pocet || 0, zdroj: "google", url: g.url || "" };
  var r = K.S.rev || {}, v = parseFloat(String(r.rating || "").replace(",", ".")), n = parseInt(String(r.count || "").replace(/\D/g, ""), 10);
  if (v >= 1 && v <= 5) return { v: (Math.round(v * 10) / 10).toFixed(1).replace(".", ","), n: n > 0 ? n : 0, zdroj: "google", url: url(r.url) };
  var t = (K.D && K.D.recenzie) || {};
  if (t.pocet) return { v: String(t.priemer).replace(".", ","), n: t.pocet, zdroj: "typek", url: "" };
  return null;
}
function zoznamRecenzii() {
  var z = K.S.recenzie.zdroj, out = [], g = google();
  if (z !== "typek" && g && g.recenzie) g.recenzie.forEach(function (r) { out.push({ meno: r.meno, foto: r.foto, hodnotenie: r.hodnotenie, text: r.text, pred: r.pred, zdroj: "Google" }); });
  if (z !== "google") (((K.D && K.D.recenzie) || {}).zoznam || []).forEach(function (r) { out.push({ meno: r.meno, hodnotenie: r.hodnotenie, text: r.text, pred: r.datum ? datum(r.datum) : "", zdroj: r.makler ? "maklér " + r.makler : "Realitný týpek" }); });
  return out.filter(function (r) { return String(r.text || "").trim(); });
}
function datum(d) { var x = new Date(d); return isNaN(x) ? String(d || "") : x.getDate() + ". " + (x.getMonth() + 1) + ". " + x.getFullYear(); }
function clanky() { return (K.S.clanky.items || []).filter(function (a) { return a.on !== false && String(a.t || "").trim(); }).slice().sort(function (a, b) { return String(b.dt || "").localeCompare(String(a.dt || "")); }); }
function slugC(a) { return a.slug || slug(a.t) || a.id; }

/* ================================================================ odkazy a podstránky */
function stranka(k) { return (K.S.stranky || {})[k] || { on: false, menu: false }; }
function href(page, sub) {
  if (K.editor) return "#" + page + (sub ? "/" + sub : "");
  if (K.vlastna) return "/" + (page === "domov" ? "" : page + (sub ? "/" + encodeURIComponent(sub) : ""));
  return (K.subor || "stranka.html") + "?m=" + encodeURIComponent(K.adresa) + (page !== "domov" ? "&s=" + page : "") + (sub ? "&c=" + encodeURIComponent(sub) : "") + (K.nahlad ? "&nahlad=1" : "");
}
function link(page, label, cls, sub) { return '<a class="' + (cls || "") + '" href="' + esc(href(page, sub)) + '" data-page="' + page + '"' + (sub ? ' data-sub="' + esc(sub) + '"' : "") + ">" + label + "</a>"; }
// cieľ tlačidla: podstránka, sekcia na úvode alebo vlastný odkaz
function ciel(go) {
  var st = STRANKY.find(function (x) { return x[0] === go; });
  if (st) {
    if (stranka(go).on && (K.S.podstranky === "on" || !st[2] || !secOn(st[2]))) return { page: go };
    if (st[2] && secOn(st[2])) return { sec: st[2] };
    return { sec: "kontakt" };
  }
  if (go === "odhad" || go === "strazca" || go === "recenzie" || go === "galeria" || go === "hypo" || go === "mapa" || K.S.custom[go]) {
    if (secOn(go)) return { sec: go };
    if (go === "odhad" && stranka("sluzby").on) return { page: "sluzby", sec: "odhad" };
    if (go === "strazca" && stranka("ponuky").on) return { page: "ponuky", sec: "strazca" };
    return { sec: "kontakt" };
  }
  return { sec: go };
}
function btnTo(label, go, u, cls) {
  if (!String(label || "").trim()) return "";
  if (go === "url") return '<a class="btn ' + (cls || "") + '" href="' + esc(url(u) || "#") + '" target="_blank" rel="noopener">' + esc(label) + "</a>";
  var c = ciel(go);
  if (c.page) return '<a class="btn ' + (cls || "") + '" href="' + esc(href(c.page)) + '" data-page="' + c.page + '"' + (c.sec ? ' data-sec-go="' + c.sec + '"' : "") + ">" + esc(label) + "</a>";
  return '<button type="button" class="btn ' + (cls || "") + '" data-go="' + esc(c.sec) + '">' + esc(label) + "</button>";
}
function secOn(k) { return K.S.on[k] && (SEC[k] || K.S.custom[k]); }
function menuItems() {
  var m = [];
  STRANKY.forEach(function (x) {
    var st = stranka(x[0]); if (!st.on || !st.menu) return;
    var naUvode = x[2] && secOn(x[2]);
    if (K.S.podstranky === "on" || !naUvode) m.push({ page: x[0], label: x[1] });
    else m.push({ sec: x[2], label: x[1], page: x[0] });
  });
  K.S.order.forEach(function (k) { var c = K.S.custom[k]; if (c && c.menu === "on" && secOn(k)) m.splice(Math.max(0, m.length - 1), 0, { sec: k, label: c.ml || c.t }); });
  return m;
}
function menuLink(x, cls) {
  if (x.sec && !(K.S.podstranky === "on" && x.page)) return '<button type="button" class="' + (cls || "") + '" data-go="' + esc(x.sec) + '">' + esc(x.label) + "</button>";
  return '<a class="' + (cls || "") + '" href="' + esc(href(x.page)) + '" data-page="' + x.page + '"' + (K.page === x.page ? ' aria-current="page"' : "") + ">" + esc(x.label) + "</a>";
}

/* ================================================================ časti stránky */
function edBtn(k) { return K.editor ? '<button type="button" class="sec-ed" data-edsec="' + k + '">' + SV(IC.edit, 2.2) + "Upraviť sekciu</button>" : ""; }
function sh(o, c) { return '<div class="sh' + (c ? " c" : "") + '">' + (o.eb ? '<span class="eb">' + esc(o.eb) + "</span>" : "") + '<h2 class="h2">' + esc(o.t) + "</h2>" + (o.l ? '<p class="lead">' + esc(o.l) + "</p>" : "") + "</div>"; }
function logoHtml() { var k = K.S.k; return k.logo ? '<img src="' + esc(/^(https?:|data:)/.test(k.logo) ? k.logo : BASE + k.logo) + '" alt="' + esc(k.name) + '">' : "<b>" + esc(k.name) + "</b>"; }
function oznam() {
  var o = K.S.oznam; if (o.on !== "on" || !String(o.text || "").trim() || K.UI.oznamX) return "";
  var l = String(o.b || "").trim() ? (o.go === "url" ? '<a class="ol" href="' + esc(url(o.u)) + '" target="_blank" rel="noopener">' + esc(o.b) + "</a>" : (function () { var c = ciel(o.go); return c.page ? '<a class="ol" href="' + esc(href(c.page)) + '" data-page="' + c.page + '"' + (c.sec ? ' data-sec-go="' + c.sec + '"' : "") + ">" + esc(o.b) + "</a>" : '<button type="button" class="ol" data-go="' + esc(c.sec) + '">' + esc(o.b) + "</button>"; })()) : "";
  return '<div class="oznam" role="note">' + esc(o.text) + l + '<button type="button" class="ox" data-oznamx aria-label="Zavrieť oznam">' + SV(IC.x, 2.4) + "</button></div>";
}
function header() {
  var k = K.S.k, m = menuItems();
  return oznam() + '<header class="s-head"><div class="w"><a class="logo" href="' + esc(href("domov")) + '" data-page="domov" aria-label="' + esc(k.name) + ', úvod">' + logoHtml() + "</a>" +
    '<nav class="s-nav" aria-label="Hlavné menu">' + m.map(function (x) { return menuLink(x); }).join("") + "</nav>" +
    (k.tel ? '<a class="s-tel" href="tel:' + esc(k.tel.replace(/\s/g, "")) + '" data-klik="tel">' + SV(IC.tel, 2.1) + esc(k.tel) + "</a>" : "") +
    (secOn("odhad") || stranka("sluzby").on ? btnTo("Odhad ceny", "odhad", "", "sm s-cta") : "") +
    '<button type="button" class="burger" data-menu aria-label="Menu" aria-expanded="' + K.UI.menu + '">' + SV(K.UI.menu ? IC.x : IC.menu, 2.2) + "</button></div></header>" +
    (K.UI.menu ? '<nav class="mnav" aria-label="Menu">' + m.map(function (x) { return menuLink(x); }).join("") + (k.tel ? '<a href="tel:' + esc(k.tel.replace(/\s/g, "")) + '" data-klik="tel">Volajte ' + esc(k.tel) + "</a>" : "") + "</nav>" : "");
}
function searchBox() {
  var locs = []; ponukyNaWebe().forEach(function (x) { if (x.l && locs.indexOf(x.l.split(" – ")[0]) < 0) locs.push(x.l.split(" – ")[0]); });
  if (!locs.length) locs = OBCE.slice(0, 6);
  var f = K.UI.pf, o = function (v, l, cur) { return '<option value="' + esc(v) + '"' + (v === cur ? " selected" : "") + ">" + esc(l) + "</option>"; };
  return '<form class="srch" data-srch><label>Ponuka<select name="tr">' + o("vse", "Predaj aj prenájom", f.tr) + o("predaj", "Predaj", f.tr) + o("prenajom", "Prenájom", f.tr) + "</select></label>" +
    '<label>Druh<select name="k">' + KINDS.map(function (x) { return o(x[0], x[0] === "vse" ? "Všetky druhy" : x[1], f.k); }).join("") + "</select></label>" +
    '<label>Lokalita<select name="loc">' + o("vse", "Všetky obce", f.loc) + locs.map(function (l) { return o(l, l, f.loc); }).join("") + "</select></label>" +
    '<button type="submit" class="btn">' + SV(IC.hladat, 2.2) + "Hľadať</button></form>";
}
function hero() {
  var H = K.S.hero, sl = H.slides, cur = Math.min(K.UI.slide, sl.length - 1), tpl = K.S.tpl;
  var maPonuky = stranka("ponuky").on || secOn("ponuky");
  var inHero = H.search === "on" && maPonuky && (tpl === "portal" || tpl === "luxusna");
  var below = H.search === "on" && maPonuky && !inHero && tpl === "klasicka";
  var h = '<section class="hero' + (below ? " ov" : "") + '" id="s-uvod" data-sec="uvod" style="--dim:' + (H.dim / 100) + '">' + edBtn("uvod") +
    '<div class="ph-l">' + sl.map(function (s, i) {
      var v = s.media === "video" ? vidSrc(s.video) : "";
      return '<div class="sl' + (i === cur ? " on" : "") + '" data-i="' + i + '">' + (v ? '<video src="' + esc(v) + '" poster="' + esc(src(s.img)) + '" autoplay muted loop playsinline preload="' + (i === cur ? "auto" : "none") + '"></video>' : '<img src="' + esc(src(s.img)) + '" alt=""' + (i === cur ? ' fetchpriority="high"' : ' loading="lazy"') + ">") + "</div>";
    }).join("") +
    (sl.length > 1 ? '<div class="hctl"><button type="button" class="harr l" data-hprev aria-label="Predchádzajúca">' + SV(IC.l, 2.2) + '</button><button type="button" class="harr r" data-hnext aria-label="Ďalšia">' + SV(IC.r, 2.2) + '</button><div class="hdots">' + sl.map(function (s, i) { return '<button type="button" data-hdot="' + i + '" aria-label="Snímka ' + (i + 1) + '" aria-current="' + (i === cur) + '"></button>'; }).join("") + "</div></div>" : "") + "</div>" +
    '<div class="tx-l w">' + sl.map(function (s, i) {
      return '<div class="sl' + (i === cur ? " on" : "") + '" data-i="' + i + '">' + (H.eb ? '<span class="heb">' + esc(H.eb) + "</span>" : "") + (i === 0 ? "<h1>" : '<p class="h1" role="heading" aria-level="2">') + esc(s.t) + (i === 0 ? "</h1>" : "</p>") + (s.l ? "<p>" + esc(s.l) + "</p>" : "") +
        '<div class="btns">' + btnTo(s.b, s.go, s.u) + btnTo(s.b2, s.go2, s.u2, "wh") + "</div></div>"; }).join("") + "</div>" +
    (inHero ? '<div class="srch-in w">' + searchBox() + "</div>" : "") + "</section>";
  if (H.search === "on" && maPonuky && !inHero) h += '<div class="srch-w w">' + searchBox() + "</div>";
  return h;
}
function cislaVal(r) {
  if (r.typ === "ponuky") { var n = ukazka() ? UKAZKA_P.length : ponukyNaWebe().length; return n ? String(n) : ""; }
  if (r.typ === "makleri") { var m = makleriWeb().length; return m ? String(m) : ""; }
  if (r.typ === "predane") { var p = predane().length; return p ? String(p) : ""; }
  if (r.typ === "recenzie") { var h = hodnotenie(); return h && h.n ? String(h.n) : ""; }
  if (r.typ === "google") { var g = hodnotenie(); return g ? g.v : ""; }
  return String(r.n || "").trim();
}
function num(v) { var m = v.match(/^(\d{1,6})(\D{0,6})$/); return m ? '<b class="num" data-count="' + m[1] + '" data-suf="' + esc(m[2]) + '">' + esc(K.UI.counted || K.S.anim !== "on" ? v : "0" + m[2]) + "</b>" : '<b class="num">' + esc(v) + "</b>"; }
function cislaRows() { return K.S.cisla.rows.map(function (r) { return { v: cislaVal(r), t: r.t, g: r.typ === "google" }; }).filter(function (r) { return r.v && String(r.t || "").trim(); }); }
function secCisla() {
  var rows = cislaRows();
  if (!rows.length) return K.editor ? '<section class="cisla jedno" data-sec="cisla">' + edBtn("cisla") + '<div class="w"><p class="muted">Sem patria čísla kancelárie, napríklad roky na trhu a počet predajov.</p></div></section>' : "";
  return '<section class="cisla ' + K.S.cisla.st + '" data-sec="cisla" id="s-cisla">' + edBtn("cisla") + '<div class="w" style="--n:' + rows.length + '">' + rows.map(function (r) { return '<div class="c">' + num(r.v) + (r.g ? stars(5) : "") + "<span>" + esc(r.t) + "</span></div>"; }).join("") + "</div></section>";
}
function avM(m, size) { var f = fotoM(m); return '<span class="av"' + (size ? ' style="width:' + size + "px;height:" + size + 'px"' : "") + ">" + (f ? '<img src="' + esc(f) + '" alt="">' : esc(initials(menoM(m)))) + "</span>"; }
function card(x, sold) {
  var m = x.mk && makler(x.mk), foto = x.foto && x.foto[0] ? x.foto[0] : x.img ? src(x.img, true) : "";
  var pr = sold ? '<div class="cprice sold">' + (x.rent ? "Prenajaté" : "Predané") + "</div>" : x.bezCeny ? '<div class="cprice">' + (x.typCeny === "na vyžiadanie" ? "Cena na vyžiadanie" : "Cena dohodou") + "</div>"
    : '<div class="cprice">' + fmt(x.p) + " €" + (x.rent ? " <small>/ mesiac</small>" : x.m ? " <small>" + fmt(x.p / x.m) + " €/m²</small>" : "") + "</div>";
  var bad = [x.rent ? "Prenájom" : "Predaj"], st = sold ? '<span class="sold">' + (x.rent ? "Prenajaté" : "Predané") + "</span>" : x.stav === "rezervovane" ? '<span class="st">Rezervované</span>' : x.znizena ? '<span class="st">Znížená cena</span>' : x.novinka ? '<span class="st">Novinka</span>' : x.exkl ? '<span class="st">Exkluzívne</span>' : x.st ? '<span class="st">' + esc(x.st) + "</span>" : "";
  var odk = odkazPonuky(x), tag = odk ? "a" : "div";
  return "<" + tag + ' class="card' + (sold ? " sold" : "") + '"' + (odk ? ' href="' + esc(odk) + '"' + (K.editor ? ' target="_blank" rel="noopener"' : "") + ' data-pid="' + x.id + '"' : ' tabindex="0" data-uk') + '><div class="cph">' + (foto ? '<img src="' + esc(foto) + '" alt="' + esc(x.t) + '" loading="lazy">' : "") + '<div class="cbadge"><span>' + bad[0] + "</span>" + st + "</div></div>" +
    '<div class="cbody">' + pr + "<h3>" + esc(x.t) + '</h3><div class="cloc">' + SV(IC.pin) + esc(x.l) + '</div><div class="cpar">' + (x.a || []).map(function (p) { return "<span>" + esc(p) + "</span>"; }).join("") + "</div>" +
    (K.S.ponuky.agent === "on" && m ? '<div class="cag">' + avM(m) + "<span>" + esc(menoM(m)) + "</span></div>" : "") + "</div></" + tag + ">";
}
function filtrPonuky(L) {
  var f = K.UI.pf;
  L = L.filter(function (x) { return (f.tr === "vse" || (f.tr === "prenajom") === !!x.rent) && (f.k === "vse" || x.k === f.k) && (f.m === "vse" || x.mk === f.m) && (f.loc === "vse" || String(x.l || "").indexOf(f.loc) === 0); });
  if (K.S.ponuky.sort === "lacne") L.sort(function (a, b) { return (a.p || 0) - (b.p || 0); }); else if (K.S.ponuky.sort === "drahe") L.sort(function (a, b) { return (b.p || 0) - (a.p || 0); });
  return L;
}
function sekcia(k, alt, inner, extraCls) { return '<section class="sec' + (alt || "") + (extraCls ? " " + extraCls : "") + '" id="s-' + k + '" data-sec="' + k + '">' + edBtn(k) + '<div class="w">' + inner + "</div></section>"; }
function secPonuky(alt, full) {
  var P = K.S.ponuky, uk = ukazka(), all = uk ? UKAZKA_P : ponukyNaWebe(), f = K.UI.pf;
  var L = filtrPonuky(all.slice()), cnt = full || P.cnt === "vse" || K.UI.allP ? L.length : +P.cnt, shown = L.slice(0, cnt);
  var mk = makleriWeb().filter(function (m) { return all.some(function (x) { return x.mk === m.id; }); });
  var filt = P.filt === "on" && all.length ? '<div class="pf" role="group" aria-label="Filtrovať ponuky">' + KINDS.map(function (k) { return '<button type="button" class="chip" data-pk="' + k[0] + '" aria-pressed="' + (f.k === k[0]) + '">' + k[1] + "</button>"; }).join("") + '<span class="sep" aria-hidden="true"></span>' +
    [["vse", "Predaj aj prenájom"], ["predaj", "Predaj"], ["prenajom", "Prenájom"]].map(function (k) { return '<button type="button" class="chip" data-ptr="' + k[0] + '" aria-pressed="' + (f.tr === k[0]) + '">' + k[1] + "</button>"; }).join("") +
    (mk.length > 1 ? '<select data-pm aria-label="Maklér"><option value="vse">Všetci makléri</option>' + mk.map(function (m) { return '<option value="' + esc(m.id) + '"' + (f.m === m.id ? " selected" : "") + ">" + esc(menoM(m)) + "</option>"; }).join("") + "</select>" : "") +
    (f.loc !== "vse" ? '<button type="button" class="chip" data-ploc aria-pressed="true">' + esc(f.loc) + " ✕</button>" : "") + "</div>" : "";
  var nic = !all.length ? '<div class="prazd"><h3>Ponuky práve pripravujeme</h3><p>Napíšte nám, čo hľadáte. Ozveme sa, keď sa objaví vhodná ponuka, často ešte skôr, než je na portáloch.</p>' + btnTo("Napísať, čo hľadám", "strazca", "") + "</div>"
    : '<div class="pempty"><h3>Takú ponuku práve nemáme</h3><p class="muted">Zapnite si strážcu ponúk a pošleme vám ju, keď sa objaví.</p>' + btnTo("Strážca ponúk", "strazca", "") + "</div>";
  var vsetky = !full && L.length > shown.length ? '<div class="pmore">' + (stranka("ponuky").on && K.S.podstranky === "on" ? link("ponuky", "Všetky ponuky (" + L.length + ")", "btn gh") : '<button type="button" class="btn gh" data-allp>Zobraziť všetky ponuky (' + L.length + ")</button>") + "</div>" : "";
  var head = full ? "" : '<div class="sh-row">' + sh(P) + (stranka("ponuky").on && K.S.podstranky === "on" ? link("ponuky", "Všetky ponuky " + SV(IC.sipka, 2.2), "lnk") : btnTo("Hľadáte niečo iné?", "strazca", "", "gh sm")) + "</div>";
  return sekcia("ponuky", alt, head + (uk ? '<p style="margin:-14px 0 20px"><span class="uk">Ukážka: v Týpku zatiaľ nie sú aktívne ponuky, na webe sa ukážu samy</span></p>' : "") + filt +
    (shown.length ? '<div class="pgrid ' + P.lay + '">' + shown.map(function (x) { return card(x); }).join("") + "</div>" + vsetky : nic));
}
function secPredane(alt, full) {
  var P = K.S.predane, L = predane(), cnt = full ? L.length : +P.cnt;
  if (!L.length && !K.editor) return "";
  return sekcia("predane", alt, '<div class="sh-row">' + sh(P) + (!full && L.length > cnt && stranka("predane").on ? link("predane", "Všetky referencie " + SV(IC.sipka, 2.2), "lnk") : "") + "</div>" +
    (L.length ? '<div class="pgrid mriezka">' + L.slice(0, cnt).map(function (x) { return card(x, true); }).join("") + "</div>" : '<div class="prazd"><p>Predané ponuky sa sem dostanú samy, keď maklér v Týpku označí ponuku ako predanú.</p></div>'));
}
function secAbout(alt) {
  var O = K.S.okancelarii, r0 = cislaRows()[0];
  return sekcia("okancelarii", alt, '<div class="about"><div class="aph"><img src="' + esc(src(O.img)) + '" alt="" loading="lazy">' + (O.badge === "on" && r0 ? '<div class="abadge"><b>' + esc(r0.v) + "</b><span>" + esc(r0.t) + "</span></div>" : "") + "</div>" +
    '<div class="atx">' + (O.eb ? '<span class="eb">' + esc(O.eb) + "</span>" : "") + '<h2 class="h2">' + esc(O.t) + '</h2><div class="paras">' + paras(O.text) + "</div>" +
    (lines(O.pts).length ? '<ul class="ticks">' + lines(O.pts).map(function (p) { return "<li><i>" + SV(IC.check, 2.6) + "</i>" + esc(p) + "</li>"; }).join("") + "</ul>" : "") + "<div>" + btnTo(O.b, O.go) + "</div></div></div>");
}
function secSluzby(alt) {
  var V = K.S.sluzby;
  return sekcia("sluzby", alt, sh(V, true) + '<div class="svc">' + V.items.map(function (s) { return '<div class="s"><span class="si">' + SV(IC[s.ic] || IC.dom, 1.7) + "</span><h3>" + esc(s.t) + "</h3><p>" + esc(s.d) + "</p></div>"; }).join("") + "</div>");
}
/* formuláre: spoločné pomôcky */
function F(k) { return K.UI.f[k] = K.UI.f[k] || { v: {}, done: false, err: "", busy: false }; }
function inp(f, name, lab, typ, ph, area) { var v = F(f).v[name] || ""; return '<label class="inp">' + lab + (area ? '<textarea name="' + name + '" rows="4"' + (ph ? ' placeholder="' + esc(ph) + '"' : "") + ">" + esc(v) + "</textarea>" : '<input name="' + name + '" type="' + (typ || "text") + '" value="' + esc(v) + '"' + (ph ? ' placeholder="' + esc(ph) + '"' : "") + (typ === "tel" ? ' autocomplete="tel"' : typ === "email" ? ' autocomplete="email"' : name === "meno" ? ' autocomplete="name"' : "") + ">") + "</label>"; }
function souhlas(f, txt) { return '<label class="souhlas"><input type="checkbox" name="ok"' + (F(f).v.ok ? " checked" : "") + "><span>" + txt + ' <button type="button" data-gdpr>Ochrana osobných údajov</button></span></label><input class="med" type="text" name="med" tabindex="-1" autocomplete="off" aria-hidden="true" style="position:absolute;left:-9999px;width:1px;height:1px;opacity:0">'; }
function chyba(f) { return F(f).err ? '<p class="ferr" role="alert">' + esc(F(f).err) + "</p>" : ""; }
function hotovo(f, nadpis, text) { return '<div class="done"><i>' + SV(IC.check, 2.6) + "</i><h3>" + esc(nadpis) + '</h3><p class="muted">' + esc(text) + "</p>" + (K.editor ? "<small>V náhľade sa formulár neodosiela.</small>" : "") + '<button type="button" class="btn gh sm" data-fagain="' + f + '">Poslať ďalšiu správu</button></div>'; }
function odoslatBtn(f, txt) { return '<div class="fbtns"><button type="submit" class="btn"' + (F(f).busy ? " disabled" : "") + ">" + (F(f).busy ? "Odosielam…" : txt) + "</button></div>"; }
function secOdhad(alt) {
  var O = K.S.odhad, v = K.UI.val, f = F("odhad"), steps = lines(O.kroky), body;
  if (f.done) body = hotovo("odhad", "Ďakujeme, máme to", "Ozveme sa vám s odhadom ceny. Ak niečo chýba, zavoláme.");
  else if (v.step === 1) body = '<h3>O akú nehnuteľnosť ide?</h3><div class="opts">' + [["byt", "Byt"], ["dom", "Dom"], ["poz", "Pozemok"], ["chata", "Chata"], ["ine", "Iné"]].map(function (o) { return '<button type="button" data-vtyp="' + o[0] + '" aria-pressed="' + (v.typ === o[0]) + '">' + SV(IC[o[0]], 1.7) + o[1] + "</button>"; }).join("") + "</div>";
  else if (v.step === 2) body = '<h3>Pár údajov o nehnuteľnosti</h3><label class="inp">Obec<select data-vf="obec">' + OBCE.map(function (o) { return "<option" + (v.obec === o ? " selected" : "") + ">" + esc(o) + "</option>"; }).join("") + '</select></label><div class="row2"><label class="inp">Rozloha v m²<input data-vf="m2" inputmode="numeric" value="' + esc(v.m2) + '" placeholder="napr. 68"></label><label class="inp">Stav<select data-vf="stav">' + ["", "Pôvodný stav", "Čiastočná rekonštrukcia", "Kompletná rekonštrukcia", "Novostavba"].map(function (o) { return '<option value="' + o + '"' + (v.stav === o ? " selected" : "") + ">" + (o || "Vyberte") + "</option>"; }).join("") + '</select></label></div><div class="fbtns"><button type="button" class="btn gh sm" data-vback>Späť</button><button type="button" class="btn" data-vnext>Pokračovať</button></div>';
  else body = '<form data-form="odhad"><h3>Kam vám pošleme odhad?</h3>' + inp("odhad", "meno", "Meno") + inp("odhad", "kontakt", "Telefón alebo e-mail") + souhlas("odhad", "Súhlasím so spracovaním osobných údajov na prípravu odhadu.") + chyba("odhad") + '<div class="fbtns"><button type="button" class="btn gh sm" data-vback>Späť</button><button type="submit" class="btn"' + (f.busy ? " disabled" : "") + ">" + (f.busy ? "Odosielam…" : "Poslať a získať odhad") + "</button></div></form>";
  var prog = f.done ? "" : '<div class="vprog"><span>Krok ' + v.step + ' z 3</span><span class="vbar" aria-hidden="true"><i class="on"></i><i class="' + (v.step > 1 ? "on" : "") + '"></i><i class="' + (v.step > 2 ? "on" : "") + '"></i></span></div>';
  return sekcia("odhad", alt, '<div class="val"><div class="vtx">' + (O.eb ? '<span class="eb">' + esc(O.eb) + "</span>" : "") + '<h2 class="h2">' + esc(O.t) + '</h2><p class="lead">' + esc(O.text) + "</p>" + (steps.length ? '<ol class="vsteps">' + steps.map(function (s) { return "<li>" + esc(s) + "</li>"; }).join("") + "</ol>" : "") + '</div><div class="vform">' + prog + body + "</div></div>");
}
function secStrazca(alt) {
  var Z = K.S.strazca, s = K.UI.straz, f = F("strazca");
  var body = f.done ? hotovo("strazca", "Strážca je zapnutý", "Ak ste zadali e-mail, prišiel vám odkaz na potvrdenie. Nové ponuky vám pošleme najviac raz za 12 hodín.")
    : '<form data-form="strazca"><h3>Čo hľadáte?</h3><div class="chips2" role="group" aria-label="Druh">' + [["byty", "Byt"], ["domy", "Dom"], ["pozemky", "Pozemok"], ["chaty", "Chata"]].map(function (k) { return '<button type="button" data-zk="' + k[0] + '" aria-pressed="' + (s.k.indexOf(k[0]) >= 0) + '">' + k[1] + "</button>"; }).join("") + "</div>" +
      '<div class="chips2" role="group" aria-label="Predaj alebo prenájom">' + [["predaj", "Kúpa"], ["prenajom", "Prenájom"]].map(function (k) { return '<button type="button" data-ztr="' + k[0] + '" aria-pressed="' + (s.tr === k[0]) + '">' + k[1] + "</button>"; }).join("") + "</div>" +
      '<div class="row2"><label class="inp">Obce<input data-zf="obce" value="' + esc(s.obce) + '" placeholder="napr. Levoča, Smižany"></label><label class="inp">Cena do (€)<input data-zf="cena" inputmode="numeric" value="' + esc(s.cena) + '" placeholder="napr. 150000"></label></div>' +
      inp("strazca", "kontakt", "E-mail (na ponuky) alebo telefón", "text") + inp("strazca", "meno", "Meno") + souhlas("strazca", "Súhlasím so spracovaním osobných údajov a s posielaním ponúk e-mailom. Odhlásiť sa dá jedným klikom.") + chyba("strazca") + odoslatBtn("strazca", "Zapnúť strážcu ponúk") + "</form>";
  return sekcia("strazca", alt, '<div class="straz"><div class="stx">' + (Z.eb ? '<span class="eb">' + esc(Z.eb) + "</span>" : "") + '<h2 class="h2">' + esc(Z.t) + '</h2><p class="lead">' + esc(Z.l) + '</p><ul class="ticks"><li><i>' + SV(IC.check, 2.6) + "</i>Ponuky všetkých našich maklérov</li><li><i>" + SV(IC.check, 2.6) + "</i>Najviac jeden e-mail za 12 hodín</li><li><i>" + SV(IC.check, 2.6) + '</i>Zrušíte ho jedným klikom</li></ul></div><div class="vform">' + body + "</div></div>");
}
function secTim(alt, full) {
  var T2 = K.S.tim, A = makleriWeb(), all = ponukyNaWebe();
  if (!A.length) return K.editor ? sekcia("tim", alt, sh(T2, true) + '<div class="prazd"><p>Makléri sa berú z Týpka. Zapni ich v záložke Kancelária.</p></div>') : "";
  var kusy = full ? A : A.slice(0, 8);
  return sekcia("tim", alt, sh(T2, true) + '<div class="team">' + kusy.map(function (a) {
    var n = all.filter(function (x) { return x.mk === a.id; }).length, w = T2.web === "on" ? webM(a) : "";
    return '<div class="tm">' + avM(a) + "<h3>" + esc(menoM(a)) + "</h3><p>" + esc(rolaM(a)) + "</p>" +
      (full && (a.telefon || a.email) ? '<div class="tk">' + (a.telefon ? '<a href="tel:' + esc(String(a.telefon).replace(/\s/g, "")) + '" data-klik="tel">' + esc(a.telefon) + "</a>" : "") + (a.email ? '<a href="mailto:' + esc(a.email) + '" data-klik="mail">' + esc(a.email) + "</a>" : "") + "</div>" : "") +
      '<div class="tbtn">' + (n ? '<button type="button" class="btn sm gh" data-agent-p="' + esc(a.id) + '">' + esc(pon(n)) + "</button>" : "") + (T2.kont === "on" ? '<button type="button" class="btn sm" data-agent-k="' + esc(a.id) + '">Napísať</button>' : "") + "</div>" +
      (w ? '<a class="lnk" style="margin-top:10px" href="' + esc(w) + '" target="_blank" rel="noopener">' + SV(IC.web, 2) + "Osobný web</a>" : "") + "</div>"; }).join("") + "</div>" +
    (!full && stranka("tim").on && K.S.podstranky === "on" && A.length > 0 ? '<div class="more">' + link("tim", "Celý tím a kontakty", "btn gh") + "</div>" : ""));
}
function secOcenenia(alt) {
  var O = K.S.ocenenia; if (!O.items.length) return "";
  return sekcia("ocenenia", alt, sh(O, true) + '<div class="awards">' + O.items.map(function (a) { return '<div class="aw"><i>' + SV(IC.laur, 1.5) + "</i><div><b>" + esc(a.t) + "</b><span>" + esc([a.y, a.d].filter(Boolean).join(" · ")) + "</span></div></div>"; }).join("") + "</div>");
}
function secRecenzie(alt) {
  var R = K.S.recenzie, h = hodnotenie(), list = zoznamRecenzii(), uk = false;
  if (!list.length && K.editor) { list = UKAZKA_REV; uk = true; }
  if (!list.length && !h) return K.editor ? sekcia("recenzie", alt, sh(R) + '<div class="prazd"><p>Recenzie sa načítajú z Google a z Týpka.</p></div>') : "";
  var g = google(), gu = (g && g.url) || url(K.S.rev.url);
  var badge = h ? '<div class="gbadge"><span class="gv">' + h.v + "</span><div>" + stars(5) + "<small>" + (h.zdroj === "google" ? '<span class="gword"><b>G</b>oogle</span> · ' : "") + (h.n ? "na základe " + fmt(h.n) + (h.n === 1 ? " recenzie" : " recenzií") : "hodnotenie klientov") + "</small></div></div>" : "";
  return sekcia("recenzie", alt, '<div class="sh-row">' + sh(R) + badge + "</div>" + (uk ? '<p style="margin:-10px 0 22px"><span class="uk">Ukážka: na webe sa tu ukážu skutočné recenzie z Google a z Týpka</span></p>' : "") +
    (list.length ? '<div class="revs">' + list.slice(0, +R.cnt).map(function (r) { return '<div class="rv">' + stars(r.hodnotenie) + "<p>" + esc(r.text) + '</p><div class="who">' + (r.foto ? '<img class="rav" src="' + esc(r.foto) + '" alt="" referrerpolicy="no-referrer" loading="lazy">' : '<span class="av">' + esc(initials(r.meno) || "K") + "</span>") + "<div><b>" + esc(r.meno) + "</b><small>" + esc([r.pred, r.zdroj].filter(Boolean).join(" · ")) + "</small></div></div></div>"; }).join("") + "</div>" : "") +
    (gu ? '<div class="rbtns"><a class="btn gh" href="' + esc(gu) + '" target="_blank" rel="noopener">Všetky recenzie na Google</a>' + (R.write === "on" ? '<a class="btn" href="' + esc(gu) + '" target="_blank" rel="noopener">Napísať recenziu</a>' : "") + "</div>" : ""));
}
function galGrid(imgs, lay, key) {
  if (!imgs.length) return K.editor ? '<div class="gempty">Pridaj fotky v nastavení sekcie.</div>' : "";
  return '<div class="gal ' + lay + '">' + imgs.map(function (v, i) { return '<button type="button" data-lb="' + key + ":" + i + '" aria-label="Zväčšiť fotku ' + (i + 1) + '"><img src="' + esc(src(v, true)) + '" alt="" loading="lazy"></button>'; }).join("") + "</div>";
}
function secGaleria(alt) { var G = K.S.galeria; if (!G.imgs.length && !K.editor) return ""; return sekcia("galeria", alt, sh(G, true) + galGrid(G.imgs, G.lay, "galeria.imgs")); }
function secMapa(alt, bezHlavy) {
  var M = K.S.mapa, L = (ukazka() ? [] : ponukyNaWebe()).filter(function (x) { return x.lat && x.lon; });
  if (!L.length && !K.editor) return "";
  return sekcia("mapa", alt, (bezHlavy ? "" : sh(M, true)) + (L.length ? '<div class="pmapa"><div class="lmap" data-map="ponuky"></div></div>' : '<div class="prazd"><p>Na mape sa ukážu ponuky, ktoré majú v Týpku zapnuté zobrazenie na mape.</p></div>'));
}
function splatka(cena, vlastne, roky, sadzba) { var P = cena * (1 - vlastne / 100), r = sadzba / 100 / 12, n = roky * 12; return r ? P * r / (1 - Math.pow(1 + r, -n)) : P / n; }
function secHypo(alt) {
  var H = K.S.hypo, u = K.UI.hyp || (K.UI.hyp = { cena: +H.cena || 150000, vlastne: +H.vlastne || 20, roky: +H.roky || 30 }), s = splatka(u.cena, u.vlastne, u.roky, +H.rate || 4);
  return sekcia("hypo", alt, '<div class="hypo"><div class="hyp-f">' +
    '<div class="hyp-r"><label for="hy-c">Cena nehnuteľnosti <b>' + fmt(u.cena) + ' €</b></label><input id="hy-c" type="range" min="30000" max="600000" step="5000" value="' + u.cena + '" data-hy="cena"></div>' +
    '<div class="hyp-r"><label for="hy-v">Vlastné zdroje <b>' + u.vlastne + ' %</b></label><input id="hy-v" type="range" min="10" max="60" step="5" value="' + u.vlastne + '" data-hy="vlastne"></div>' +
    '<div class="hyp-r"><label for="hy-r">Doba splácania <b>' + u.roky + ' rokov</b></label><input id="hy-r" type="range" min="5" max="30" step="1" value="' + u.roky + '" data-hy="roky"></div></div>' +
    '<div class="hyp-v">' + (H.eb ? '<span class="eb" style="color:inherit;opacity:.8">' + esc(H.eb) + "</span>" : "") + '<h2 class="h2" style="color:inherit">' + esc(H.t) + '</h2><b data-hyv>' + fmt(s) + " €</b><small>mesačne pri úroku " + String(H.rate).replace(".", ",") + " % ročne, úver " + fmt(u.cena * (1 - u.vlastne / 100)) + " €</small>" +
    (H.l ? '<p style="opacity:.9;font-size:15px">' + esc(H.l) + "</p>" : "") + btnTo("Chcem ponuku hypotéky", "kontakt", "") + "</div></div>");
}
function secClanky(alt, full) {
  var C = K.S.clanky, L = clanky(), cnt = full ? L.length : +C.cnt;
  if (!L.length && !K.editor) return "";
  return sekcia("clanky", alt, '<div class="sh-row">' + sh(C) + (!full && stranka("blog").on ? link("blog", "Všetky články " + SV(IC.sipka, 2.2), "lnk") : "") + '</div><div class="posts">' +
    L.slice(0, cnt).map(function (p) { return '<a class="post" href="' + esc(href("blog", slugC(p))) + '" data-page="blog" data-sub="' + esc(slugC(p)) + '"><img src="' + esc(src(p.img, true)) + '" alt="" loading="lazy"><small>' + esc(datum(p.dt)) + "</small><h3>" + esc(p.t) + "</h3><p>" + esc(p.d) + '</p><span class="lnk">Čítať ďalej ' + SV(IC.sipka, 2.2) + "</span></a>"; }).join("") + "</div>");
}
function secKariera(alt) {
  var C = K.S.kariera;
  return '<section class="sec col" id="s-kariera" data-sec="kariera">' + edBtn("kariera") + '<div class="w"><div class="cta"><div><span class="eb">' + esc(C.eb) + '</span><h2 class="h2">' + esc(C.t) + '</h2><div class="paras"><p>' + esc(C.l) + "</p></div></div><div>" + btnTo("Viac o práci u nás", "kariera", "", "inv") + "</div></div></div></section>";
}
function socRow() {
  var s = K.S.k.soc, SOC = [["fb", "Facebook"], ["ig", "Instagram"], ["yt", "YouTube"], ["li", "LinkedIn"], ["tt", "TikTok"]];
  var h = SOC.filter(function (x) { return String(s[x[0]] || "").trim(); }).map(function (x) { return '<a href="' + esc(url(s[x[0]])) + '" target="_blank" rel="noopener" aria-label="' + x[1] + '">' + SV(IC[x[0]], 1.9) + "</a>"; }).join("");
  return h ? '<div class="soc">' + h + "</div>" : "";
}
function secKontakt(alt) {
  var Kt = K.S.kontakt, k = K.S.k, f = F("kontakt"), ki = [];
  if (k.addr) ki.push('<a class="ki" href="https://www.google.com/maps/search/?api=1&amp;query=' + encodeURIComponent(k.addr) + '" target="_blank" rel="noopener"><i>' + SV(IC.pin) + "</i><div><small>Adresa kancelárie</small><b>" + esc(k.addr) + "</b></div></a>");
  if (k.tel) ki.push('<a class="ki" href="tel:' + esc(k.tel.replace(/\s/g, "")) + '" data-klik="tel"><i>' + SV(IC.tel) + "</i><div><small>Telefón</small><b>" + esc(k.tel) + "</b></div></a>");
  if (k.mail) ki.push('<a class="ki" href="mailto:' + esc(k.mail) + '" data-klik="mail"><i>' + SV(IC.mail) + "</i><div><small>E-mail</small><b>" + esc(k.mail) + "</b></div></a>");
  if (Kt.hours === "on" && k.hours) ki.push('<div class="ki"><i>' + SV(IC.clock) + "</i><div><small>Otváracie hodiny</small><b>" + esc(k.hours) + "</b></div></div>");
  var A = makleriWeb(), komu = f.v.komu || "";
  var form = Kt.form !== "on" ? "" : '<form class="kform" data-form="kontakt">' + (f.done ? hotovo("kontakt", "Ďakujeme za správu", "Ozveme sa vám čo najskôr.")
    : "<h3>Napíšte nám</h3>" + (A.length > 1 ? '<label class="inp">Komu<select name="komu"><option value="">Kancelárii</option>' + A.map(function (a) { return '<option value="' + esc(a.id) + '"' + (komu === a.id ? " selected" : "") + ">" + esc(menoM(a)) + "</option>"; }).join("") + "</select></label>" : "") +
      '<label class="inp">S čím vám pomôžeme<select name="ucel">' + [["", "Vyberte"], ["predat", "Chcem predať"], ["kupit", "Chcem kúpiť"], ["prenajat", "Hľadám prenájom"], ["ine", "Iné"]].map(function (o) { return '<option value="' + o[0] + '"' + ((f.v.ucel || "") === o[0] ? " selected" : "") + ">" + o[1] + "</option>"; }).join("") + "</select></label>" +
      '<div class="row2">' + inp("kontakt", "meno", "Meno") + inp("kontakt", "tel", "Telefón", "tel") + "</div>" + inp("kontakt", "mail", "E-mail", "email") + inp("kontakt", "msg", "Správa", "", "Napríklad: chcem predať 3-izbový byt v Levoči", true) +
      souhlas("kontakt", "Súhlasím so spracovaním osobných údajov na vybavenie mojej správy.") + chyba("kontakt") + odoslatBtn("kontakt", "Odoslať správu")) + "</form>";
  var mapa = Kt.map === "on" && (k.addr || (k.lat && k.lon)) ? '<div class="map ziva">' + (k.lat && k.lon ? '<div class="lmap" data-map="kancelaria"></div>' : "") + '<a class="mlink" href="https://www.google.com/maps/search/?api=1&amp;query=' + encodeURIComponent(k.addr || (k.lat + "," + k.lon)) + '" target="_blank" rel="noopener" style="z-index:500">Otvoriť v Mapách</a></div>' : "";
  return sekcia("kontakt", alt, sh(Kt) + '<div class="kgrid">' + (form || '<div class="kinfo"><div class="klist">' + ki.join("") + "</div>" + socRow() + "</div>") +
    '<div class="kinfo">' + (form ? '<div class="klist">' + ki.join("") + "</div>" + socRow() : "") + mapa + "</div></div>");
}
function secCustom(k, alt) {
  var c = K.S.custom[k], bgc = c.bgs === "col" ? " col" : c.bgs === "alt" ? " alt" : alt, cls = c.bgs === "col" ? "inv" : "", inner;
  if (c.typ === "vyzva") inner = '<div class="cta"><div><h2 class="h2">' + esc(c.t) + '</h2><div class="paras">' + paras(c.text) + "</div></div><div>" + btnTo(c.b, c.go, c.u, cls) + "</div></div>";
  else if (c.typ === "txph") inner = '<div class="txph"><img src="' + esc(src(c.img || "dom-obyvacka")) + '" alt="" loading="lazy"><div><h2 class="h2">' + esc(c.t) + '</h2><div class="paras">' + paras(c.text) + "</div>" + btnTo(c.b, c.go, c.u, cls) + "</div></div>";
  else if (c.typ === "fotky") inner = '<div class="sh c"><h2 class="h2">' + esc(c.t) + "</h2></div>" + galGrid(c.imgs || [], "mriezka", "custom." + k + ".imgs");
  else inner = '<div class="ctxt c"><h2 class="h2">' + esc(c.t) + '</h2><div class="paras">' + paras(c.text) + "</div>" + btnTo(c.b, c.go, c.u, cls) + "</div>";
  return '<section class="sec' + bgc + '" id="s-' + k + '" data-sec="' + k + '">' + edBtn(k) + '<div class="w">' + inner + "</div></section>";
}
var SEKCIE_FN = { ponuky: secPonuky, predane: secPredane, okancelarii: secAbout, sluzby: secSluzby, odhad: secOdhad, strazca: secStrazca, tim: secTim, ocenenia: secOcenenia,
  recenzie: secRecenzie, galeria: secGaleria, mapa: secMapa, hypo: secHypo, clanky: secClanky, kariera: secKariera, kontakt: secKontakt };

/* podstránky */
function phd(nadpis, text, crumb) {
  var img = (K.S.hero.slides[0] || {}).img, st = STRANKY.find(function (x) { return x[0] === K.page; });
  if (!crumb && st) crumb = "<span>" + esc(st[1]) + "</span>";
  return '<section class="phd" data-sec="uvod">' + (img ? '<img class="bgi" src="' + esc(src(img)) + '" alt="">' : "") + '<div class="w"><nav class="crumb" aria-label="Kde ste">' + link("domov", "Úvod") + "<span>/</span>" + (crumb || "<span>" + esc(nadpis) + "</span>") + "</nav><h1>" + esc(nadpis) + "</h1>" + (text ? "<p>" + esc(text) + "</p>" : "") + "</div></section>";
}
function blokySekcii(zoz) { var out = "", n = 0; zoz.forEach(function (x) { var h = typeof x === "function" ? x(n % 2 === 1 ? " alt" : "") : x; if (h) { out += h; n++; } }); return out; }
function landing(kluc, D, zdroj, poleTypu, nadpisForm, tlacidlo, hotovoTx) {
  var f = F(zdroj);
  var form = '<form class="vform" data-form="' + zdroj + '">' + (f.done ? hotovo(zdroj, "Ďakujeme", hotovoTx) :
    "<h3>" + esc(nadpisForm) + "</h3>" + poleTypu + '<div class="row2">' + inp(zdroj, "meno", "Meno") + inp(zdroj, "tel", "Telefón", "tel") + "</div>" + inp(zdroj, "mail", "E-mail (nepovinné)", "email") + inp(zdroj, "msg", "Poznámka", "", "", true) +
    souhlas(zdroj, "Súhlasím so spracovaním osobných údajov na vybavenie mojej žiadosti.") + chyba(zdroj) + odoslatBtn(zdroj, tlacidlo)) + "</form>";
  return phd(D.t, D.l) + sekcia(kluc, "", '<div class="lp"><div class="ltx">' + (D.img ? '<img src="' + esc(src(D.img)) + '" alt="" loading="lazy">' : "") + '<div class="paras">' + paras(D.text) + "</div>" +
    (lines(D.pts).length ? '<ul class="ticks">' + lines(D.pts).map(function (p) { return "<li><i>" + SV(IC.check, 2.6) + "</i>" + esc(p) + "</li>"; }).join("") + "</ul>" : "") +
    (lines(D.kroky).length ? '<h3 style="margin-top:8px">Ako to prebieha</h3><ol class="vsteps">' + lines(D.kroky).map(function (s) { return "<li>" + esc(s) + "</li>"; }).join("") + "</ol>" : "") + "</div>" + form + "</div>");
}
function clanokDetail(a) {
  var ine = clanky().filter(function (x) { return x !== a; }).slice(0, 3);
  return phd(a.t, "", link("blog", "Blog") + "<span>/</span><span>" + esc(a.t.slice(0, 40)) + (a.t.length > 40 ? "…" : "") + "</span>") +
    sekcia("clanok", "", '<article class="art"><div class="meta">' + esc(datum(a.dt)) + " · " + esc(K.S.k.name) + '</div><p class="perex">' + esc(a.d) + "</p>" + (a.img ? '<img class="hl" src="' + esc(src(a.img)) + '" alt="">' : "") + '<div class="atx">' + paras(a.text) + "</div>" +
      '<div class="fbtns" style="justify-content:flex-start">' + btnTo("Poradiť sa s maklérom", "kontakt", "") + link("blog", "Ďalšie články", "btn gh") + "</div></article>") +
    (ine.length ? sekcia("dalsie", " alt", '<div class="sh"><h2 class="h2">Mohlo by vás zaujímať</h2></div><div class="posts">' + ine.map(function (p) { return '<a class="post" href="' + esc(href("blog", slugC(p))) + '" data-page="blog" data-sub="' + esc(slugC(p)) + '"><img src="' + esc(src(p.img, true)) + '" alt="" loading="lazy"><small>' + esc(datum(p.dt)) + "</small><h3>" + esc(p.t) + "</h3></a>"; }).join("") + "</div>") : "");
}
function domov() {
  var out = "", n = 0;
  K.S.order.forEach(function (k) {
    if (!secOn(k)) return;
    if (k === "cisla") { out += secCisla(); return; }
    var alt = (k !== "ponuky" && n % 2 === 1) ? " alt" : "";
    if (K.S.custom[k]) { out += secCustom(k, alt); n++; if (K.S.custom[k].bgs) n = 0; return; }
    var h = SEKCIE_FN[k] ? SEKCIE_FN[k](alt) : "";
    if (h) { out += h; if (k === "kariera") n = 0; else n++; }
  });
  return hero() + out;
}
function stranky() {
  var p = K.page, S = K.S;
  if (p === "domov" || !stranka(p).on) return domov();
  if (p === "ponuky") return phd("Ponuky", S.ponuky.l) + blokySekcii([function (a) { return secPonuky(a, true); }, function (a) { return S.ponuky.mapa === "on" ? secMapa(a, false) : ""; }, secStrazca]);
  if (p === "predane") return phd(S.predane.t, S.predane.l) + blokySekcii([function (a) { return secPredane(a, true); }, secRecenzie]);
  if (p === "o-nas") return phd("O nás", S.okancelarii.t) + blokySekcii([secAbout, function () { return secCisla(); }, secOcenenia, secGaleria, secTim, secRecenzie]);
  if (p === "sluzby") return phd("Služby", S.sluzby.l) + blokySekcii([secSluzby, secOdhad, secHypo]);
  if (p === "tim") return phd(S.tim.t, S.tim.l) + blokySekcii([function (a) { return secTim(a, true); }, secKontakt]);
  if (p === "vykup") return landing("vykup", S.vykup, "vykup", '<label class="inp">Čo chcete predať<select name="typ">' + ["Byt", "Dom", "Pozemok", "Chata", "Iné"].map(function (o) { return "<option" + ((F("vykup").v.typ || "Byt") === o ? " selected" : "") + ">" + o + "</option>"; }).join("") + '</select></label><label class="inp">Obec<select name="obec">' + OBCE.map(function (o) { return "<option" + ((F("vykup").v.obec || "Spišská Nová Ves") === o ? " selected" : "") + ">" + esc(o) + "</option>"; }).join("") + "</select></label>", "Získajte ponuku na výkup", "Chcem ponuku na výkup", "Ozveme sa vám s ponukou na výkup, väčšinou ešte v ten istý pracovný deň.");
  if (p === "kariera") return landing("kariera", S.kariera, "kariera", '<label class="inp">Skúsenosti v realitách<select name="typ">' + ["Začínam", "Do 2 rokov", "Viac ako 2 roky"].map(function (o) { return "<option" + ((F("kariera").v.typ || "Začínam") === o ? " selected" : "") + ">" + o + "</option>"; }).join("") + "</select></label>", "Ozvite sa nám", S.kariera.b || "Mám záujem", "Ozveme sa vám a dohodneme si stretnutie.");
  if (p === "blog") { var a = K.sub && clanky().find(function (x) { return slugC(x) === K.sub; }); if (a) return clanokDetail(a); return phd(S.clanky.t, "") + blokySekcii([function (al) { return secClanky(al, true); }]); }
  if (p === "kontakt") return phd("Kontakt", S.kontakt.l) + blokySekcii([secKontakt, secTim]);
  return domov();
}
function footer() {
  var k = K.S.k, t = trk(), str = STRANKY.filter(function (x) { return stranka(x[0]).on; });
  return '<footer class="foot"><div class="w"><div class="fg"><div style="display:flex;flex-direction:column;gap:16px"><a class="logo" href="' + esc(href("domov")) + '" data-page="domov">' + logoHtml() + "</a><p>" + esc(K.S.hero.eb || "Realitná kancelária") + ". Predaj, kúpa, prenájom a výkup nehnuteľností.</p>" + socRow() + "</div>" +
    "<div><h4>Kontakt</h4><ul>" + (k.addr ? "<li>" + esc(k.addr) + "</li>" : "") + (k.tel ? '<li><a href="tel:' + esc(k.tel.replace(/\s/g, "")) + '" data-klik="tel">' + esc(k.tel) + "</a></li>" : "") + (k.mail ? '<li><a href="mailto:' + esc(k.mail) + '" data-klik="mail">' + esc(k.mail) + "</a></li>" : "") + "</ul></div>" +
    "<div><h4>Stránky</h4><ul>" + str.map(function (x) { return "<li>" + link(x[0], x[1]) + "</li>"; }).join("") + "</ul></div>" +
    "<div><h4>Otváracie hodiny</h4><ul>" + (k.hours ? "<li>" + esc(k.hours) + "</li>" : "<li>Podľa dohody</li>") + "</ul></div></div>" +
    '<div class="fbot"><span>© ' + new Date().getFullYear() + " " + esc(K.S.gdpr.who || k.name) + (k.ico ? " · IČO " + esc(k.ico) : "") + ' · <button type="button" data-gdpr>Ochrana osobných údajov</button>' + (K.S.gdpr.bar === "on" || t.any ? ' · <button type="button" data-ckopen>Nastavenie cookies</button>' : "") + "</span>" +
    '<span class="typ">' + (aiVizual() ? "Obsahový vizuál na webe je generovaný AI · " : "") + "Web beží na <b>Realitný <span>týpek</span></b></span></div></div></footer>";
}
function aiVizual() { var lib = LIB.map(function (x) { return x[0]; }), S = K.S; return S.hero.slides.some(function (s) { return lib.indexOf(s.img) >= 0 || s.media === "video" && vidSrc(s.video).indexOf("img/web/") >= 0; }) || lib.indexOf(S.okancelarii.img) >= 0 || S.galeria.imgs.some(function (v) { return lib.indexOf(v) >= 0; }); }
function cookieBar() {
  var t = trk();
  if (!(K.S.gdpr.bar === "on" || t.any) || !K.UI.ck) return "";
  var what = t.ga && t.fb ? " S vaším súhlasom použijeme aj analytické (Google Analytics) a marketingové (Meta Pixel) cookies." : t.ga ? " S vaším súhlasom použijeme aj analytické cookies (Google Analytics)." : t.fb ? " S vaším súhlasom použijeme aj marketingové cookies (Meta Pixel)." : "";
  return '<div class="ck-w"><div class="ck" role="region" aria-label="Cookies"><p><b>Používame cookies.</b> Nevyhnutné cookies zabezpečujú fungovanie webu.' + what + ' <button type="button" class="flink" data-gdpr>Viac informácií</button></p><div class="btns"><button type="button" class="btn" data-ck="vsetky">Prijať všetky</button><button type="button" class="btn gh" data-ck="nevyhnutne">Len nevyhnutné</button>' + (t.any ? '<button type="button" class="btn gh" data-ckopen>Nastavenia</button>' : "") + "</div></div></div>";
}
function miss(v, lab) { return String(v || "").trim() ? esc(v) : (K.editor ? "<mark>[doplň " + lab + "]</mark>" : ""); }
function ovlHtml() {
  var UI = K.UI; if (!UI.ovl) return "";
  var t = trk(), g = K.S.gdpr, X = '<button type="button" class="x" data-ovlx aria-label="Zavrieť">' + SV(IC.x, 2.2) + "</button>";
  if (UI.ovl === "gdpr") {
    var rec = ["poskytovateľ webu a realitného softvéru Realitný týpek", "poskytovateľ e-mailových služieb"]; if (t.ga) rec.push("Google (služba Google Analytics na meranie návštevnosti)"); if (t.fb) rec.push("Meta Platforms (Meta Pixel na meranie reklamy)");
    return '<div class="ovl" data-ovlbg><div class="box" role="dialog" aria-modal="true" aria-label="Ochrana osobných údajov">' + X + '<span class="eb">Ochrana osobných údajov</span><h2>Ako spracúvame vaše osobné údaje</h2>' +
      "<h3>Prevádzkovateľ</h3><p>" + miss(g.who, "firmu") + (g.ico ? ", IČO " + esc(g.ico) : "") + (g.addr ? ", " + esc(g.addr) : "") + ". Kontakt pre otázky k osobným údajom: " + miss(g.mail, "e-mail") + (K.S.k.tel ? ", " + esc(K.S.k.tel) : "") + "." + (String(g.dpo || "").trim() ? " Zodpovedná osoba: " + esc(g.dpo) + "." : "") + "</p>" +
      "<h3>Aké údaje a na čo</h3><p>Spracúvame meno, telefón, e-mail a údaje o nehnuteľnosti, ktoré nám pošlete cez formuláre na tomto webe. Používame ich na odpoveď na vašu požiadavku, prípravu ponuky alebo odhadu ceny, ponuku výkupu, posielanie vybraných ponúk (strážca ponúk), dohodnutie obhliadky a na plnenie sprostredkovateľskej zmluvy. Údaje z formulára Kariéra používame len na výberové konanie.</p>" +
      "<h3>Právny základ</h3><ul><li>rokovanie o zmluve a jej plnenie (čl. 6 ods. 1 písm. b GDPR),</li><li>váš súhlas pri strážcovi ponúk a pri analytických a marketingových cookies (čl. 6 ods. 1 písm. a GDPR),</li><li>zákonné povinnosti vrátane overenia klienta podľa zákona č. 297/2008 Z. z. (čl. 6 ods. 1 písm. c GDPR).</li></ul>" +
      "<h3>Ako dlho</h3><p>Údaje z dopytov uchovávame len po dobu potrebnú na vybavenie požiadavky. Údaje zo zmlúv uchovávame po dobu, ktorú určuje zákon. Súhlas môžete kedykoľvek odvolať, strážcu ponúk zrušíte jedným klikom v každom e-maile.</p>" +
      "<h3>Komu ich poskytujeme</h3><ul>" + rec.map(function (r) { return "<li>" + r + "</li>"; }).join("") + "</ul>" +
      "<h3>Vaše práva</h3><p>Máte právo na prístup k údajom, ich opravu, vymazanie, obmedzenie spracúvania, prenosnosť a právo namietať. Ak máte pocit, že s údajmi nezaobchádzame správne, môžete podať sťažnosť na Úrad na ochranu osobných údajov Slovenskej republiky.</p>" +
      "<h3>Cookies</h3><p>Nevyhnutné cookies zabezpečujú fungovanie webu a nepotrebujú súhlas." + (t.ga ? " Analytické cookies (Google Analytics) používame len s vaším súhlasom." : "") + (t.fb ? " Marketingové cookies (Meta Pixel) používame len s vaším súhlasom." : "") + " Voľbu môžete zmeniť cez odkaz Nastavenie cookies v pätičke.</p></div></div>";
  }
  if (UI.ovl === "ck") {
    var cs = UI.ckSet || { ga: false, fb: false };
    return '<div class="ovl" data-ovlbg><div class="box" role="dialog" aria-modal="true" aria-label="Nastavenie cookies" style="max-width:560px">' + X + '<span class="eb">Cookies</span><h2>Nastavenie cookies</h2>' +
      '<div class="ckrow"><div><b>Nevyhnutné</b><small>Fungovanie webu. Vždy zapnuté.</small></div><input type="checkbox" checked disabled aria-label="Nevyhnutné cookies"></div>' +
      (t.ga ? '<div class="ckrow"><div><b>Analytické</b><small>Google Analytics, meranie návštevnosti</small></div><input type="checkbox" data-cks="ga"' + (cs.ga ? " checked" : "") + ' aria-label="Analytické cookies"></div>' : "") +
      (t.fb ? '<div class="ckrow"><div><b>Marketingové</b><small>Meta Pixel, meranie a cielenie reklamy</small></div><input type="checkbox" data-cks="fb"' + (cs.fb ? " checked" : "") + ' aria-label="Marketingové cookies"></div>' : "") +
      '<div style="display:flex;gap:8px;margin-top:18px;flex-wrap:wrap"><button type="button" class="btn" data-cksave>Uložiť voľbu</button><button type="button" class="btn gh" data-ck="vsetky">Prijať všetky</button></div></div></div>';
  }
  if (UI.ovl === "lb") {
    var L = getPath(UI.lbKey) || [], i = Math.max(0, Math.min(UI.lb, L.length - 1));
    return '<div class="ovl lb" data-ovlbg>' + X + '<div style="max-width:100%;max-height:100%;display:flex;flex-direction:column;align-items:center"><img src="' + esc(src(L[i])) + '" alt=""><div class="lbn"><button type="button" data-lbm="-1">← Predchádzajúca</button><span>' + (i + 1) + " / " + L.length + '</span><button type="button" data-lbm="1">Ďalšia →</button></div></div></div>';
  }
  return "";
}
function getPath(path) { return String(path || "").split(".").reduce(function (o, k) { return o == null ? undefined : o[k]; }, K.S); }

/* ================================================================ vykreslenie */
function render() {
  var S = K.S, root = K.root; if (!S || !root) return;
  var P = pal(), Fn = FONTS.find(function (f) { return f.id === S.font; }) || FONTS[0], st = root.style;
  var rb = S.btn === "pill" ? "999px" : S.btn === "round" ? Math.max(8, Math.round(S.r * 0.7)) + "px" : "2px";
  var head = S.tpl === "rozdelena" && S.head === "priehladna" ? "svetla" : S.head;
  var hbg = head === "tmava" ? "#151B21" : head === "priehladna" ? "transparent" : P.bg, hfg = head === "svetla" ? P.fg : "#FFFFFF";
  var vh = K.vh(), hh = S.hero.hh === "cela" ? vh : S.hero.hh === "vysoka" ? Math.round(vh * 0.84) : Math.min(560, vh);
  var fbg = P.dark ? "#0E1318" : (lum(P.b) < 0.06 ? mix(P.b, "#000000", 0.25) : "#151B21");
  var VARS = [["--bg", P.bg], ["--surf", P.surf], ["--fg", P.fg], ["--muted", P.muted], ["--line", P.line], ["--a", P.a], ["--on-a", P.onA], ["--at", P.at], ["--a-soft", P.soft], ["--b", P.b], ["--on-b", P.onB], ["--bt", P.bt], ["--b-soft", P.bsoft], ["--a-on-b", P.aOnB],
    ["--hc", P.hc], ["--err", P.err], ["--fh", Fn.h], ["--fb", Fn.b], ["--fhw", Fn.w], ["--fhls", Fn.ls], ["--r", S.r + "px"], ["--rb", rb], ["--hbg", hbg], ["--hfg", hfg], ["--hacc", head === "svetla" ? P.at : P.a], ["--hh", Math.max(460, hh) + "px"], ["--fbg", fbg],
    ["--hero-acc", con(P.a, "#10161C") >= 4.5 ? P.a : mix(P.a, "#FFFFFF", 0.5)]];
  VARS.forEach(function (x) { st.setProperty(x[0], x[1]); });
  st.colorScheme = P.dark ? "dark" : "light";
  var y = K.scroller === window ? window.scrollY : K.scroller.scrollTop;
  // na podstránke hlavička „na fotke“ prechádza cez tmavý pás s nadpisom
  root.className = "site t-" + S.tpl + " h-" + head + " al-" + S.hero.align + (S.anim === "on" ? " anim" : "") + (y > 40 ? " scr" : "") + (K.page !== "domov" ? " podstr" : "");
  zrusMapy();
  root.innerHTML = header() + "<main>" + stranky() + "</main>" + footer() + cookieBar();
  var host = K.ovlHost || document.body, ov = host.querySelector(":scope > .tk-ovl");
  if (!ov) { ov = document.createElement("div"); ov.className = "tk-ovl"; host.appendChild(ov); }
  ov.innerHTML = ovlHtml();
  VARS.forEach(function (x) { ov.style.setProperty(x[0], x[1]); });
  watchCount(); sched(); mapy();
  if (K.hooks.poRender) K.hooks.poRender();
}

/* ---------------------------------------------------------------- mapy (Leaflet z cdnjs, mapové podklady OpenStreetMap) */
var LP = null, MAPY = [];
function leaflet() {
  if (window.L) return Promise.resolve();
  if (LP) return LP;
  LP = new Promise(function (ok, zle) {
    var c = document.createElement("link"); c.rel = "stylesheet"; c.href = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css"; document.head.appendChild(c);
    var s = document.createElement("script"); s.src = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js"; s.onload = ok; s.onerror = function () { LP = null; zle(); }; document.head.appendChild(s);
  });
  return LP;
}
function zrusMapy() { MAPY.forEach(function (m) { try { m.remove(); } catch (e) { /* nič */ } }); MAPY = []; }
function mapy() {
  var el = K.root.querySelectorAll(".lmap[data-map]"); if (!el.length) return;
  leaflet().then(function () {
    el.forEach(function (box) {
      if (!box.isConnected || box._mapa) return;
      var L = window.L, P = pal(), ikon = L.divIcon({ className: "", html: '<div style="width:18px;height:18px;border-radius:999px;background:' + P.a + ';box-shadow:0 0 0 3px #fff,0 4px 10px rgba(0,0,0,.35)"></div>', iconSize: [18, 18], iconAnchor: [9, 9] });
      var m = L.map(box, { scrollWheelZoom: false, attributionControl: true }); box._mapa = m; MAPY.push(m);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(m);
      if (box.dataset.map === "kancelaria") {
        var k = K.S.k; m.setView([+k.lat, +k.lon], 16);
        L.marker([+k.lat, +k.lon], { icon: ikon }).addTo(m).bindPopup("<b>" + esc(k.name) + "</b><br>" + esc(k.addr || ""));
      } else {
        var pts = ponukyNaWebe().filter(function (x) { return x.lat && x.lon; }), B = [];
        pts.forEach(function (x) {
          var f = x.foto && x.foto[0], pop = '<div class="mpop">' + (f ? '<img src="' + esc(f) + '" alt="">' : "") + "<b>" + esc(x.t) + "</b><span>" + esc(x.bezCeny ? "Cena dohodou" : fmt(x.p) + " €" + (x.rent ? " / mes." : "")) + '</span><a href="' + esc(odkazPonuky(x)) + '"' + (K.editor ? ' target="_blank" rel="noopener"' : "") + ">Pozrieť ponuku →</a></div>";
          L.marker([+x.lat, +x.lon], { icon: ikon }).addTo(m).bindPopup(pop); B.push([+x.lat, +x.lon]);
        });
        if (B.length > 1) m.fitBounds(B, { padding: [40, 40], maxZoom: 15 }); else if (B.length) m.setView(B[0], 14); else m.setView([+K.S.k.lat || 48.947, +K.S.k.lon || 20.566], 11);
      }
    });
  }, function () { el.forEach(function (box) { box.innerHTML = '<p style="padding:20px">Mapu sa nepodarilo načítať.</p>'; }); });
}

/* ---------------------------------------------------------------- titulné fotky, napočítanie čísel */
var hT = 0;
function showSlide(i) {
  var n = K.S.hero.slides.length; if (!n || !K.root) return; K.UI.slide = (i + n) % n;
  K.root.querySelectorAll(".hero .sl").forEach(function (el) { var on = +el.dataset.i === K.UI.slide; el.classList.toggle("on", on); var v = el.querySelector("video"); if (v) { if (on) { try { v.play(); } catch (e) { /* nič */ } } else v.pause(); } });
  K.root.querySelectorAll(".hdots button").forEach(function (b) { b.setAttribute("aria-current", String(+b.dataset.hdot === K.UI.slide)); });
  if (K.hooks.poSnimke) K.hooks.poSnimke(K.UI.slide);
  sched();
}
function sched() { clearTimeout(hT); var S = K.S; if (!S || K.page !== "domov" || S.hero.auto !== "on" || S.hero.slides.length < 2 || K.UI.pause || K.UI.hover) return; hT = setTimeout(function () { showSlide(K.UI.slide + 1); }, Math.max(3, S.hero.int) * 1000); }
var io = null;
function watchCount() {
  if (K.UI.counted || K.S.anim !== "on") { K.UI.counted = true; return; }
  var el = K.root.querySelector(".cisla"); if (!el || !("IntersectionObserver" in window)) { K.UI.counted = true; return; }
  if (io) io.disconnect();
  io = new IntersectionObserver(function (en) { if (en.some(function (x) { return x.isIntersecting; })) { io.disconnect(); countUp(); } }, { root: K.scroller === window ? null : K.scroller, threshold: 0.4 });
  io.observe(el);
}
function countUp() {
  K.UI.counted = true;
  K.root.querySelectorAll(".cisla [data-count]").forEach(function (b) {
    var n = parseInt(b.dataset.count, 10), suf = b.dataset.suf || "", t0 = performance.now(), dur = 1200;
    (function step(t) { var k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3); b.textContent = Math.round(n * e) + suf; if (k < 1) requestAnimationFrame(step); })(t0);
  });
}

/* ---------------------------------------------------------------- posúvanie a navigácia */
function scrollTo(y) { if (K.scroller === window) window.scrollTo({ top: y, behavior: "smooth" }); else K.scroller.scrollTo({ top: y, behavior: "smooth" }); }
function goSec(k) {
  if (k === "top" || k === "uvod") { scrollTo(0); return; }
  var el = K.root.querySelector("#s-" + k);
  if (!el) {
    var c = ciel(k);
    if (c.page && c.page !== K.page) { go(c.page, "", c.sec); return; }
    el = K.root.querySelector("#s-kontakt"); if (!el) return;
  }
  var hd = K.root.querySelector(".s-head"), off = hd ? hd.offsetHeight : 0;
  var top = K.scroller === window ? el.getBoundingClientRect().top + window.scrollY - off : el.getBoundingClientRect().top - K.scroller.getBoundingClientRect().top + K.scroller.scrollTop - off;
  scrollTo(Math.max(0, top + 1));
}
function go(page, sub, sec, bezHistorie) {
  K.page = page || "domov"; K.sub = sub || ""; K.UI.menu = false; K.UI.allP = page === "ponuky";
  render();
  if (K.hooks.poNavigacii && !bezHistorie) K.hooks.poNavigacii(K.page, K.sub);
  if (sec) setTimeout(function () { goSec(sec); }, 60);
  else if (K.scroller === window) window.scrollTo(0, 0); else K.scroller.scrollTop = 0;
}
function onScroll() { var y = K.scroller === window ? window.scrollY : K.scroller.scrollTop, s = y > 40; if (K.root && K.root.classList.contains("scr") !== s) K.root.classList.toggle("scr", s); }

/* ---------------------------------------------------------------- formuláre */
function hodnoty(form) { var v = {}; Array.prototype.forEach.call(form.elements, function (e) { if (!e.name) return; v[e.name] = e.type === "checkbox" ? e.checked : e.value; }); return v; }
function poslat(f, payload) {
  var st = F(f); st.err = ""; st.busy = true; render();
  var odosli = K.hooks.odoslat ? K.hooks.odoslat(payload) : Promise.resolve("ok");
  return Promise.resolve(odosli).then(function () { st.busy = false; st.done = true; render(); if (K.hooks.poOdoslani) K.hooks.poOdoslani(f); var el = K.root.querySelector('[data-form="' + f + '"]') || K.root.querySelector("#s-" + f); if (el && el.scrollIntoView) el.scrollIntoView({ block: "center", behavior: "smooth" }); },
    function (e) { st.busy = false; st.err = (e && e.message) || "Správu sa nepodarilo odoslať. Skúste to znova alebo zavolajte."; render(); });
}
function kontaktZ(v) { var t = String(v.tel || "").trim(), m = String(v.mail || "").trim(); return t || m; }
function odoslatForm(form) {
  var f = form.dataset.form, st = F(f), v = hodnoty(form); st.v = Object.assign(st.v, v);
  var err = function (t) { st.err = t; render(); };
  if (f === "odhad") {
    if (!String(v.meno || "").trim()) return err("Doplňte meno."); if (String(v.kontakt || "").trim().length < 5) return err("Doplňte telefón alebo e-mail."); if (!v.ok) return err("Potvrďte súhlas so spracovaním údajov.");
    var u = K.UI.val, typ = { byt: "Byt", dom: "Dom", poz: "Pozemok", chata: "Chata", ine: "Iné" }[u.typ] || "Nehnuteľnosť";
    return poslat(f, { zdroj: "odhad", meno: v.meno, kontakt: v.kontakt, co: [typ, u.obec, u.m2 ? u.m2 + " m²" : "", u.stav].filter(Boolean).join(", "), med: v.med });
  }
  if (f === "strazca") {
    var z = K.UI.straz, cena = String(z.cena || "").replace(/\D/g, "");
    if (!z.k.length && !String(z.obce || "").trim() && !cena) return err("Vyberte, čo hľadáte.");
    if (String(v.kontakt || "").trim().length < 5) return err("Doplňte e-mail alebo telefón."); if (!v.ok) return err("Potvrďte súhlas so spracovaním údajov.");
    return poslat(f, { zdroj: "strazca", meno: v.meno, kontakt: v.kontakt, med: v.med, co: "", dopyt: { kategorie: z.k, prenajom: z.tr === "prenajom", obce: String(z.obce || "").split(",").map(function (x) { return x.trim(); }).filter(Boolean), cena_do: cena || "" } });
  }
  if (f === "kontakt" || f === "vykup" || f === "kariera") {
    if (!String(v.meno || "").trim()) return err("Doplňte meno.");
    var kt = kontaktZ(v); if (kt.length < 5) return err("Doplňte telefón alebo e-mail."); if (!v.ok) return err("Potvrďte súhlas so spracovaním údajov.");
    var co = f === "kontakt" ? [v.ucel ? { predat: "Chce predať", kupit: "Chce kúpiť", prenajat: "Hľadá prenájom", ine: "Iné" }[v.ucel] : "", v.tel && v.mail ? "e-mail: " + v.mail : "", v.msg].filter(Boolean).join(". ")
      : [v.typ, v.obec, v.tel && v.mail ? "e-mail: " + v.mail : "", v.msg].filter(Boolean).join(". ");
    return poslat(f, { zdroj: f, meno: v.meno, kontakt: kt, co: co, med: v.med, komu: f === "kontakt" ? (v.komu || "") : "", dopyt: f === "kontakt" && v.ucel ? { ucel: v.ucel } : null });
  }
}

/* ---------------------------------------------------------------- udalosti v stránke */
function bind() {
  var root = K.root;
  root.addEventListener("click", function (e) {
    var t = e.target.closest("button,a,[data-uk]"); if (!t || !root.contains(t)) return; var d = t.dataset;
    if (d.edsec) { e.preventDefault(); if (K.hooks.upravSekciu) K.hooks.upravSekciu(d.edsec); return; }
    if (d.klik && K.hooks.klik) K.hooks.klik(d.klik);
    if (d.page) { if (e.ctrlKey || e.metaKey || e.shiftKey) return; e.preventDefault(); go(d.page, d.sub || "", d.secGo || ""); return; }
    if (d.go !== undefined) { e.preventDefault(); if (K.UI.menu) { K.UI.menu = false; render(); } goSec(d.go); return; }
    if (d.menu !== undefined) { K.UI.menu = !K.UI.menu; render(); return; }
    if (d.oznamx !== undefined) { K.UI.oznamX = true; try { sessionStorage.setItem("typek-oznam", "1"); } catch (x) { /* nič */ } render(); return; }
    if (d.hprev !== undefined) { showSlide(K.UI.slide - 1); return; }
    if (d.hnext !== undefined) { showSlide(K.UI.slide + 1); return; }
    if (d.hdot !== undefined) { showSlide(+d.hdot); return; }
    if (d.pk) { K.UI.pf.k = d.pk; render(); return; }
    if (d.ptr) { K.UI.pf.tr = d.ptr; render(); return; }
    if (d.ploc !== undefined) { K.UI.pf.loc = "vse"; render(); return; }
    if (d.allp !== undefined) { K.UI.allP = true; render(); return; }
    if (d.uk !== undefined && K.hooks.oznam) { K.hooks.oznam("Na webe sa otvorí stránka ponuky s fotkami, popisom a kontaktom na makléra."); return; }
    if (d.agentP) { K.UI.pf = { tr: "vse", k: "vse", m: d.agentP, loc: "vse" }; if (stranka("ponuky").on && K.S.podstranky === "on") go("ponuky"); else { K.UI.allP = true; render(); goSec("ponuky"); } return; }
    if (d.agentK) { F("kontakt").v.komu = d.agentK; F("kontakt").done = false; if (K.root.querySelector("#s-kontakt")) { render(); goSec("kontakt"); } else go("kontakt"); return; }
    if (d.vtyp) { K.UI.val.typ = d.vtyp; K.UI.val.step = 2; render(); return; }
    if (d.vback !== undefined) { K.UI.val.step = Math.max(1, K.UI.val.step - 1); F("odhad").err = ""; render(); return; }
    if (d.vnext !== undefined) { K.UI.val.step = 3; render(); return; }
    if (d.fagain) { K.UI.f[d.fagain] = { v: {}, done: false, err: "", busy: false }; if (d.fagain === "odhad") K.UI.val = { step: 1, typ: "", obec: "Spišská Nová Ves", m2: "", stav: "" }; render(); return; }
    if (d.zk) { var z = K.UI.straz.k, i = z.indexOf(d.zk); if (i >= 0) z.splice(i, 1); else z.push(d.zk); render(); return; }
    if (d.ztr) { K.UI.straz.tr = d.ztr; render(); return; }
    if (d.lb) { var q = d.lb.split(":"); K.UI.lbKey = q[0]; K.UI.lb = +q[1]; K.UI.ovl = "lb"; render(); return; }
    if (d.gdpr !== undefined) { e.preventDefault(); K.UI.ovl = "gdpr"; render(); return; }
    if (d.ckopen !== undefined) { K.UI.ovl = "ck"; render(); return; }
    if (d.ck) { K.UI.ck = false; render(); if (K.hooks.suhlas) K.hooks.suhlas(d.ck); return; }
  });
  root.addEventListener("keydown", function (e) { if ((e.key === "Enter" || e.key === " ") && e.target.matches && e.target.matches("[data-uk]")) { e.preventDefault(); e.target.click(); } });
  root.addEventListener("input", function (e) {
    var t = e.target, d = t.dataset || {};
    if (d.vf) { K.UI.val[d.vf] = t.value; return; }
    if (d.zf) { K.UI.straz[d.zf] = t.value; return; }
    if (d.hy) { K.UI.hyp[d.hy] = +t.value; var H = K.S.hypo, u = K.UI.hyp, s = splatka(u.cena, u.vlastne, u.roky, +H.rate || 4), lab = t.closest(".hyp-r").querySelector("b"), out = K.root.querySelector("[data-hyv]");
      if (lab) lab.textContent = d.hy === "cena" ? fmt(u.cena) + " €" : d.hy === "vlastne" ? u.vlastne + " %" : u.roky + " rokov"; if (out) out.textContent = fmt(s) + " €"; var sm = out && out.nextElementSibling; if (sm) sm.textContent = "mesačne pri úroku " + String(H.rate).replace(".", ",") + " % ročne, úver " + fmt(u.cena * (1 - u.vlastne / 100)) + " €"; return; }
    if (t.form && t.form.dataset.form && t.name) F(t.form.dataset.form).v[t.name] = t.type === "checkbox" ? t.checked : t.value;
  });
  root.addEventListener("change", function (e) {
    var t = e.target; if (t.dataset.vf) { K.UI.val[t.dataset.vf] = t.value; return; }
    if (t.dataset.pm !== undefined) { K.UI.pf.m = t.value; render(); return; }
    if (t.form && t.form.dataset.form && t.name) F(t.form.dataset.form).v[t.name] = t.type === "checkbox" ? t.checked : t.value;
  });
  root.addEventListener("submit", function (e) {
    e.preventDefault(); var f = e.target;
    if (f.dataset.srch !== undefined) { K.UI.pf = { tr: f.tr.value, k: f.k.value, m: "vse", loc: f.loc.value }; if (stranka("ponuky").on && K.S.podstranky === "on") go("ponuky"); else { K.UI.allP = true; render(); goSec("ponuky"); } return; }
    if (f.dataset.form) odoslatForm(f);
  });
  root.addEventListener("mouseover", function (e) { var h = !!(e.target.closest && e.target.closest(".hero")); if (h !== K.UI.hover) { K.UI.hover = h; sched(); } });
  root.addEventListener("mouseleave", function () { K.UI.hover = false; sched(); });
  var host = K.ovlHost || document.body;
  host.addEventListener("click", function (e) {
    var t = e.target; if (!t.closest || !t.closest(".tk-ovl")) return;
    if (t.matches("[data-ovlbg]") || t.closest("[data-ovlx]")) { K.UI.ovl = null; render(); return; }
    var b = t.closest("button"); if (!b) return;
    if (b.dataset.lbm) { var L = getPath(K.UI.lbKey) || []; K.UI.lb = (K.UI.lb + (+b.dataset.lbm) + L.length) % L.length; render(); return; }
    if (b.dataset.ck) { K.UI.ovl = null; K.UI.ck = false; render(); if (K.hooks.suhlas) K.hooks.suhlas(b.dataset.ck); return; }
    if (b.dataset.cksave !== undefined) { var cs = {}; host.querySelectorAll(".tk-ovl [data-cks]").forEach(function (x) { cs[x.dataset.cks] = x.checked; }); K.UI.ckSet = cs; K.UI.ovl = null; K.UI.ck = false; render(); if (K.hooks.suhlas) K.hooks.suhlas(cs.ga || cs.fb ? "vsetky" : "nevyhnutne", cs); }
  });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && K.UI.ovl) { K.UI.ovl = null; render(); } });
  (K.scroller === window ? window : K.scroller).addEventListener("scroll", onScroll, { passive: true });
}

function init(o) {
  Object.assign(K, o || {});
  try { if (sessionStorage.getItem("typek-oznam")) K.UI.oznamX = true; } catch (e) { /* nič */ }
  bind();
}

window.TYPEK_KANC = { K: K, init: init, render: render, go: go, goSec: goSec, showSlide: showSlide, sched: sched, merge: merge, pal: pal, trk: trk, DEF: DEF, TPLS: TPLS, COLORS: COLORS, SETS: SETS, FONTS: FONTS, BGS: BGS,
  LIB: LIB, VIDEA: VIDEA, SEC: SEC, STRANKY: STRANKY, CTYPES: CTYPES, SVC_IC: SVC_IC, OBCE: OBCE, src: src, vidSrc: vidSrc, esc: esc, clone: clone, slug: slug, slugC: slugC, clanky: clanky, fmt: fmt,
  initials: initials, leaflet: leaflet, UKAZKA_P: UKAZKA_P, CLANKY_DEF: CLANKY_DEF, makleri: makleri, menoM: menoM, rolaM: rolaM, fotoM: fotoM, ponukyNaWebe: ponukyNaWebe, predane: predane, hodnotenie: hodnotenie, aiVizual: aiVizual, IC: IC, SV: SV, href: href, isHex: isHex, mix: mix, con: con, lum: lum };
})();
