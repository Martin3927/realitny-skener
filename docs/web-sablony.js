/* Osobný web makléra – šablóny a vykreslenie (spoločné pre editor v aplikácii aj pre verejnú stránku)
   Realitný týpek. Verejná stránka: stranka.html?m=adresa, editor: web-editor.html */
(function () {
"use strict";

/* ================================================================ dáta šablón */
var TPLS = [
  { id: "susedska", name: "Susedská", desc: "Osobná, maklér v popredí" },
  { id: "galeria", name: "Galéria", desc: "Veľké fotky nehnuteľností" },
  { id: "vizitka", name: "Vizitka", desc: "Stručná jednostránka" },
  { id: "luxus", name: "Luxusná", desc: "Fotka cez celý úvod" },
  { id: "rodinna", name: "Rodinná", desc: "Mäkká a priateľská" },
  { id: "mestska", name: "Mestská", desc: "Výrazná a odvážna" }];
var HERO_IMG_TPLS = ["galeria", "luxus", "mestska"];
var HERO_DEF = {
  susedska: { t: "Predám váš byt či dom za dobrú cenu a bez starostí.", l: "Pomáham ľuďom z regiónu predať, kúpiť aj prenajať nehnuteľnosť. Od ocenenia až po podpis u notára." },
  galeria: { t: "Nájdite domov, v ktorom sa vám bude dobre žiť.", l: "" },
  vizitka: { t: "", l: "Predaj, kúpa a prenájom nehnuteľností v regióne {area}. Ozvite sa, poradím vám zadarmo." },
  luxus: { t: "Výnimočné nehnuteľnosti si zaslúžia výnimočný predaj.", l: "Diskrétne jednanie, profesionálne fotky a video, overení kupujúci." },
  rodinna: { t: "Pomôžem vám nájsť miesto, kde bude vašej rodine dobre.", l: "Poznám každú ulicu v regióne a na všetko mám čas. Predaj aj kúpu prejdeme spolu krok za krokom." },
  mestska: { t: "Byty a domy v meste. Rýchlo a férovo.", l: "Predaj, kúpa a prenájom v regióne {area}." } };
var COLORS = [{ id: "zlata", name: "Zlatá", c: "#DB9522" }, { id: "atrament", name: "Atramentová", c: "#1E2A35" }, { id: "smaragd", name: "Smaragdová", c: "#1F6B57" }, { id: "tehla", name: "Tehlová", c: "#A8482E" },
  { id: "more", name: "Morská", c: "#1D6F8F" }, { id: "slivka", name: "Slivková", c: "#6E3A5E" }, { id: "oliva", name: "Olivová", c: "#6E7B2C" }, { id: "sivomodra", name: "Sivomodrá", c: "#4A6074" }];
var SETS = [
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
var FONTS_URL = "https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500..800&family=Instrument+Sans:wght@400..700&family=Young+Serif&family=Public+Sans:wght@400..800&family=Archivo:wght@400..900&family=Cormorant+Garamond:wght@500;600;700&family=Nunito:wght@500..800&display=swap";
var BGS = [
  { id: "svetle", name: "Svetlé", bg: "#FFFFFF", surf: "#F3F5F7", fg: "#1A2128", muted: "#5A6571", line: "#DEE3E8", dark: false },
  { id: "kremove", name: "Krémové", bg: "#F7F2E8", surf: "#FFFDF8", fg: "#1E2A35", muted: "#5A6470", line: "#E4DACA", dark: false },
  { id: "tmave", name: "Tmavé", bg: "#141A21", surf: "#1E2630", fg: "#EEF1F4", muted: "#9DAAB7", line: "#2E3945", dark: true }];
var SECS = { ponuky: "Ponuky", vykup: "Výkup", cennik: "Cenník", preco: "Prečo so mnou", tim: "Tím", predane: "Predané nehnuteľnosti", strazca: "Strážca ponúk", omne: "O mne", postup: "Postup predaja", sluzby: "Služby", lokality: "Lokality, ktoré poznám",
  video: "Video", recenzie: "Recenzie", obhliadka: "Rezervácia obhliadky", ocenenie: "Odhad ceny", callback: "Zavolám vám späť", stiahnut: "Na stiahnutie", faq: "Časté otázky",
  dotaznik: "Dotazník", fotka: "Fotka", hypoteka: "Hypotekárna kalkulačka", clanok: "Článok mesiaca", kontakt: "Kontakt" };
var SOC = [["fb", "Facebook", "facebook.com/meno"], ["ig", "Instagram", "instagram.com/meno"], ["li", "LinkedIn", "linkedin.com/in/meno"], ["x", "X", "x.com/meno"], ["tt", "TikTok", "tiktok.com/@meno"], ["yt", "YouTube", "youtube.com/@meno"]];
var DEF = { tpl: "susedska", color: "zlata", cc: "#1D6F8F", b2: "", hcol: "text", cbg: "#EEF2F1", logoCols: [], font: "moderne", bg: "kremove", r: 14,
  btn: "pill", btnFill: "fill", ph: "plain", anim: true, heroMedia: "foto", heroImg: "", heroVideo: "", heroAiImg: "", heroAiVid: "", heroPos: "", heroFoc: "", bub: "polo",
  order: ["ponuky", "strazca", "omne", "preco", "tim", "postup", "sluzby", "vykup", "cennik", "predane", "lokality", "video", "recenzie", "obhliadka", "ocenenie", "callback", "stiahnut", "faq", "dotaznik", "fotka", "hypoteka", "clanok", "kontakt"],
  on: { ponuky: true, vykup: false, cennik: false, preco: false, tim: false, predane: true, strazca: true, omne: true, postup: true, sluzby: true, lokality: false, video: false, recenzie: true, obhliadka: true, ocenenie: true, callback: true, stiahnut: false, faq: true, dotaznik: false, fotka: false, hypoteka: false, clanok: false, kontakt: true },
  n: 6, name: "", area: "Spišská Nová Ves a Levoča", office: "", phone: "", email: "", wa: "", photo: "", photo2: "", logo: "", years: "", sold: "",
  soc: { fb: "", ig: "", li: "", x: "", tt: "", yt: "" },
  stats: [], addr: "", hours: "", kava: true, online: false, mbar: true,
  heroBtn: "", heroBtnTx: "", svcX: "", soldBand: false, footFirma: false, team: [],
  why: [{ t: "Férové ceny", d: "Cenu nastavíme podľa skutočných predajov v okolí, nie podľa prianí." }, { t: "Rýchlosť", d: "Ozvem sa vám v ten istý deň a veci nenechávam ležať." },
    { t: "Spoľahlivosť", d: "Čo sľúbim, to dodržím. O každom kroku viete vopred." }, { t: "Diskrétnosť", d: "Vaše údaje a zámery ostanú medzi nami." },
    { t: "Seriózne jednanie", d: "Na rovinu poviem, čo je možné a čo nie." }, { t: "Skúsenosti", d: "Poznám trh v regióne a viem, čo funguje." },
    { t: "Odbornosť", d: "Zmluvy, kataster aj hypotéku vybavíme bez chýb." }, { t: "Platba v hotovosti", d: "Pri výkupe vyplatíme peniaze v hotovosti alebo na účet." }],
  cen: { rows: [{ t: "Byt", c: "4 000 – 5 000 €", p: "pri cene do 200 000 €, vrátane DPH" }, { t: "Rodinný dom", c: "3 % z ceny", p: "vrátane DPH" }, { t: "Pozemok, chata, komerčné", c: "Individuálne", p: "podľa dohody" }],
    inc: "Ocenenie podľa skutočných predajov v okolí\nProfesionálne fotky a video\nInzercia na portáloch a sociálnych sieťach\nObhliadky a vyjednávanie s kupujúcimi\nZmluvy, úschova peňazí a kataster", pozn: "Odmenu platíte až po úspešnom predaji. Žiadne skryté poplatky." },
  vyk: { typy: "Byty, Rodinné domy, Pozemky, Chaty a chalupy, Nehnuteľnosti s ťarchou alebo exekúciou", vyhody: "Peniaze v hotovosti alebo na účet\nVyplatíme aj exekúcie a dlhy na nehnuteľnosti\nPapiere a kataster vybavíme za vás\nDiskrétne, bez inzerátu a obhliadok", kroky: "Zavoláte alebo napíšete\nPozrieme si nehnuteľnosť\nDostanete konkrétnu ponuku\nPodpis zmluvy a vyplatenie" },
  heroTx: {}, heads: {},
  about: { title: "Reality robím tak, ako by som ich chcel pre seba.", text: "Pochádzam z regiónu a poznám tu každú ulicu. Viem, za koľko sa reálne predávajú byty na sídlisku aj domy v okolitých obciach.\nKaždému klientovi poviem na rovinu, čo je možné. Postarám sa o fotky, inzerciu, obhliadky, zmluvy aj kataster." },
  svc: [{ t: "Predaj", d: "Ocenenie, fotky, inzercia a vyjednávanie až po notára." }, { t: "Prenájom", d: "Nájdem spoľahlivého nájomcu a pripravím zmluvu." }, { t: "Ocenenie", d: "Reálna cena podľa predajov v okolí, nie podľa prianí." }, { t: "Výkup", d: "Potrebujete peniaze rýchlo? Nehnuteľnosť odkúpime." }],
  video: { url: "", title: "Prehliadka mesiaca", text: "Pozrite si nehnuteľnosť ešte pred obhliadkou." },
  img: { src: "", title: "Môj región", cap: "" },
  form: { title: "Pomôžem vám s ďalším krokom", text: "Odpovedzte na tri krátke otázky a ozvem sa vám s konkrétnym návrhom." },
  dl: { title: "Ako predať nehnuteľnosť rýchlo a za dobrú cenu", desc: "Krátky e-book o tom, čo ľudí pri predaji stojí najviac peňazí a ako sa tomu vyhnúť.", btn: "Stiahnuť e-book", file: "", url: "", img: "", imgAuto: false, news: false, newsTx: "Chcem dostávať aj občasné tipy z realitného trhu e-mailom. Odhlásiť sa môžem kedykoľvek." },
  rev: { google: "", auto: true, gRating: "", gCount: "" },
  post: { title: "Na čo si dať pozor pri kúpe staršieho bytu na sídlisku", text: "Stúpačky, zateplenie, fond opráv a list vlastníctva. Prejdite si päť vecí, ktoré si oplatí overiť ešte pred rezervačnou zmluvou.", url: "" },
  hypo: { rate: 3.9 }, custom: {},
  watch: { title: "Strážca ponúk", text: "Napíšte, čo hľadáte, a ozvem sa vám, keď sa objaví vhodná ponuka. Často ešte skôr, než je na portáloch.", places: "Spišská Nová Ves, Levoča, Smižany, Markušovce" },
  steps: [
    { t: "Stretnutie a ocenenie", d: "Pozriem si nehnuteľnosť a podľa skutočných predajov v okolí navrhnem reálnu cenu." },
    { t: "Príprava na predaj", d: "Profesionálne fotky, video, pôdorys a kontrola listu vlastníctva." },
    { t: "Inzercia", d: "Ponuka ide na realitné portály, sociálne siete aj medzi kupujúcich, ktorých už mám." },
    { t: "Obhliadky", d: "Obhliadky organizujem ja. Vy sa dozviete výsledok a spätnú väzbu." },
    { t: "Rezervácia a zmluvy", d: "Zmluvy pripraví advokát, dohliadnem na úschovu peňazí aj hypotéku kupujúceho." },
    { t: "Prevod a odovzdanie", d: "Podáme návrh na kataster a pri odovzdaní kľúčov spíšeme preberací protokol." }],
  book: { times: "9:00, 10:30, 14:00, 16:30, 18:00", sat: false, text: "Vyberte si deň a čas. Obhliadku vám potvrdím telefonicky alebo SMS." },
  val: { title: "Koľko má hodnotu vaša nehnuteľnosť?", text: "Vyplňte pár údajov a do 24 hodín vám pošlem odhad ceny podľa skutočných predajov v okolí. Zadarmo a nezáväzne.", krokyOn: false, kroky: "Vyplníte krátky formulár, trvá to 2 minúty\nPrídem na obhliadku, asi 30 minút\nDo 24 hodín dostanete písomné ocenenie" },
  cb: { title: "Zavolám vám späť", text: "Nemáte čas písať? Nechajte mi číslo a vyberte si, kedy vám to vyhovuje." },
  loc: [],
  faq: [
    { q: "Koľko stojí vaša služba?", a: "Províziu platí predávajúci až po úspešnom predaji. Výšku vám poviem vopred a zapíšeme ju do zmluvy." },
    { q: "Ako dlho trvá predaj bytu?", a: "Pri reálnej cene väčšinou do dvoch mesiacov. Záleží na lokalite, stave a cene." },
    { q: "Aké dane platím pri predaji?", a: "Ak ste nehnuteľnosť vlastnili aspoň 5 rokov, daň z príjmu väčšinou neplatíte. Presne vám to povie daňový poradca." },
    { q: "Čo potrebujem k predaju?", a: "List vlastníctva, energetický certifikát a doklady o nehnuteľnosti. Čo chýba, vybavíme spolu." }],
  gdpr: { who: "", ico: "", addr: "", mail: "", bar: true, ga: false, fbp: false },
  share: { title: "", desc: "" },
  reply: "Dobrý deň {meno klienta},\nďakujem za vašu správu. Ozvem sa vám do 24 hodín, väčšinou ešte v ten istý deň.\n\nS pozdravom\n{meno makléra}\n{telefón}" };
var UKAZKA = [
  { k: "byt", t: "3-izbový byt s loggiou", l: "Sídlisko blízko centra", p: 139000, a: ["74 m²", "3 izby", "6. poschodie"], m: 74, iz: 3, d: "Svetlý byt s loggiou a výhľadom na hory. Nové rozvody, kuchyňa aj kúpeľňa." },
  { k: "dom", t: "Rodinný dom so záhradou", l: "Tichá ulica na okraji obce", p: 229000, a: ["142 m²", "4 izby", "pozemok 620 m²"], m: 142, iz: 4, d: "Dom v tichej ulici s rovinatou záhradou a garážou." },
  { k: "poz", t: "Stavebný pozemok", l: "Okraj obce pri lese", p: 68000, a: ["950 m²"], m: 950, iz: 0, d: "Pozemok s výhľadom na les, siete pri hranici pozemku." }];
var QS = [["Čo plánujete?", ["Predať", "Kúpiť", "Prenajať", "Oceniť"]], ["O akú nehnuteľnosť ide?", ["Byt", "Dom", "Pozemok", "Iné"]], ["Kedy to plánujete?", ["Čo najskôr", "Do 3 mesiacov", "Do roka", "Len zisťujem"]]];
var DN = ["Ne", "Po", "Ut", "St", "Št", "Pi", "So"];

/* ================================================================ pomocníci */
function h2r(h) { h = h.replace("#", ""); return [0, 2, 4].map(function (i) { return parseInt(h.slice(i, i + 2), 16); }); }
function r2h(a) { return "#" + a.map(function (v) { return Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0"); }).join(""); }
function mix(a, b, t) { var A = h2r(a), B = h2r(b); return r2h(A.map(function (v, i) { return v + (B[i] - v) * t; })); }
function lum(h) { var c = h2r(h).map(function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; }
function con(a, b) { var x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
function onCol(c) { return con(c, "#FFFFFF") >= con(c, "#1E2A35") ? "#FFFFFF" : "#1E2A35"; }
function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
function paras(t) { return String(t || "").split(/\n+/).filter(Boolean).map(function (p) { return "<p>" + esc(p) + "</p>"; }).join(""); }
function initials(n) { return String(n || "").trim().split(/\s+/).map(function (w) { return w[0] || ""; }).slice(0, 2).join("").toUpperCase() || "M"; }
function slugD(n) { return String(n || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }
function url(u) { u = String(u || "").trim(); return !u ? "" : /^https?:\/\//i.test(u) ? u : "https://" + u; }
function waNum(p) { var d = String(p || "").replace(/\D/g, ""); if (d.indexOf("00") === 0) d = d.slice(2); else if (d.indexOf("0") === 0) d = "421" + d.slice(1); return d; }
var NF = new Intl.NumberFormat("sk-SK");
function fmt(v) { return NF.format(Math.round(v)); }
function clone(o) { return JSON.parse(JSON.stringify(o)); }
function isHex(v) { return /^#[0-9a-f]{6}$/i.test(v || ""); }
function okHex(v) { v = String(v || "").trim(); if (v.charAt(0) !== "#") v = "#" + v; return isHex(v) ? v.toLowerCase() : null; }
function typ(v) { return v === null ? "null" : Array.isArray(v) ? "pole" : typeof v; }
function merge(x) {
  var d = clone(DEF); x = x && typeof x === "object" && !Array.isArray(x) ? x : {};
  Object.keys(x).forEach(function (k) {
    if (!Object.prototype.hasOwnProperty.call(DEF, k)) { if (k === "dev" || k === "tab") d[k] = x[k]; return; }
    var td = typ(DEF[k]), tx = typ(x[k]);
    // nastavenie s nesprávnym typom sa ignoruje (ochrana pred poškodenými alebo podvrhnutými údajmi)
    if (td === "object") { if (tx === "object") d[k] = Object.assign(d[k], x[k]); return; }
    if (td === "pole") { if (tx === "pole") d[k] = x[k]; return; }
    if (td === "string" || td === "number") { if (tx === "string" || tx === "number") d[k] = x[k]; return; }
    if (td === "boolean") { if (tx === "boolean") d[k] = x[k]; return; }
    d[k] = x[k];
  });
  if (!TPLS.some(function (t) { return t.id === d.tpl; })) d.tpl = DEF.tpl;
  if (typ(d.custom) !== "object") d.custom = {};
  Object.keys(d.custom).forEach(function (k) { if (!/^c[0-9a-z]{1,20}$/.test(k) || typ(d.custom[k]) !== "object") delete d.custom[k]; });
  if (typ(d.order) !== "pole") d.order = DEF.order.slice();
  d.order = d.order.filter(function (k, i, a) { return typeof k === "string" && a.indexOf(k) === i; });
  ["svc", "steps", "loc", "faq", "stats", "why", "team"].forEach(function (k) { d[k] = d[k].filter(function (e) { return typ(e) === "object"; }); });
  d.cen.rows = typ(d.cen.rows) === "pole" ? d.cen.rows.filter(function (e) { return typ(e) === "object"; }) : clone(DEF.cen.rows);
  ["soc", "heroTx", "heads"].forEach(function (k) { Object.keys(d[k]).forEach(function (j) { if (typ(d[k][j]) === "pole" || typ(d[k][j]) === "null") delete d[k][j]; }); });
  DEF.order.forEach(function (k, idx) {
    if (d.order.indexOf(k) < 0) { var nx = DEF.order.slice(idx + 1).find(function (n) { return d.order.indexOf(n) >= 0; }); d.order.splice(nx ? d.order.indexOf(nx) : d.order.length, 0, k); }
    if (d.on[k] === undefined) d.on[k] = DEF.on[k];
  });
  d.order = d.order.filter(function (k) { return SECS[k] || (d.custom && d.custom[k]); });
  return d;
}

/* ================================================================ stav */
var W = {
  S: merge({}), CTX: { ponuky: [], predane: [], recenzie: null, makler: null, ukazka: true },
  Q: { step: 0, a: [] }, Wt: { typ: ["Byt"], place: "", max: 160000 }, BK: { d: 0, t: "", l: 0 }, VF: { typ: "Byt", stav: "Po rekonštrukcii" }, CBT: "Čo najskôr",
  CK: { bar: true }, PAGE: { v: "home" }, DONE: {}, ERR: {}, FV: {}, EDIT: false, INTRO: true, VSETKY: false, FIL: { k: "", t: "", o: "", sort: "" }, adresa: "",
  editor: false, odoslat: null, root: null, poZmene: null,
  // maklér si animácie môže zobraziť v ukážke aj vtedy, keď ich má v systéme vypnuté (pamätá sa v prehliadači)
  vzdyPohyb: (function () { try { return localStorage.getItem("typek-web-pohyb") === "1"; } catch (e) { return false; } })()
};
function S() { return W.S; }
function get(p) { return p.split(".").reduce(function (o, k) { return o == null ? o : o[k]; }, W.S); }
function setDeep(p, v) {
  var ks = p.split("."), o = W.S;
  ks.slice(0, -1).forEach(function (k, i) { if (o[k] == null || typeof o[k] !== "object") o[k] = /^\d+$/.test(ks[i + 1]) ? [] : {}; o = o[k]; });
  o[ks[ks.length - 1]] = v;
}
function secName(k) { var s = W.S; return s.custom[k] ? (s.custom[k].title || "Vlastná sekcia") : SECS[k]; }
function heroTx() { var s = W.S, d = HERO_DEF[s.tpl], o = s.heroTx[s.tpl] || {}; return { t: o.t != null ? o.t : d.t, l: String(o.l != null ? o.l : d.l).replace("{area}", s.area) }; }
function head(k, f, def) { var h = W.S.heads[k]; return h && h[f] != null ? h[f] : def; }

/* ================================================================ farby */
function rdAll(c, bgs, to, min) { for (var t = 0; t <= 1.0001; t += 0.04) { var m = mix(c, to, Math.min(t, 1)); if (bgs.every(function (b) { return con(m, b) >= min; })) return m; } return to; }
function fitOn(c) { var on = onCol(c), away = on === "#FFFFFF" ? "#000000" : "#FFFFFF"; for (var t = 0; t <= 1.0001; t += 0.04) { var x = mix(c, away, Math.min(t, 1)); if (con(x, on) >= 4.5) return [x, on]; } return [c, on]; }
function pal() {
  var s = W.S, B = BGS.find(function (b) { return b.id === s.bg; }) || BGS[1];
  if (s.bg === "vlastne" && isHex(s.cbg)) {
    var bg = s.cbg, L = "#F4F6F8", D = "#12171C", fg0 = con(bg, D) >= con(bg, L) ? D : L, dk = fg0 === L;
    B = { id: "vlastne", bg: bg, fg: fg0, dark: dk, surf: dk ? mix(bg, "#FFFFFF", 0.07) : (lum(bg) > 0.9 ? mix(bg, "#1A2128", 0.035) : mix(bg, "#FFFFFF", 0.5)), muted: mix(fg0, bg, 0.36), line: mix(fg0, bg, 0.8) };
  }
  function fix(c) { if (B.dark && con(c, B.bg) < 3) return mix(c, "#FFFFFF", 0.45); if (!B.dark && con(c, B.bg) < 1.45) return rdAll(c, [B.bg], "#1A2128", 1.45); return c; }
  var col = COLORS.find(function (c) { return c.id === s.color; });
  var A = fitOn(fix(s.color === "vlastna" && isHex(s.cc) ? s.cc : (col ? col.c : "#DB9522")));
  var Bc = fitOn(fix(isHex(s.b2) ? s.b2 : A[0]));
  var a = A[0], b = Bc[0], soft = mix(a, B.bg, B.dark ? 0.78 : 0.86), bsoft = mix(b, B.bg, B.dark ? 0.78 : 0.84), tx = B.dark ? "#FFFFFF" : "#000000";
  var all = [B.bg, B.surf, soft, bsoft];
  var fg = rdAll(B.fg, all, tx, 7);
  return { bg: B.bg, surf: B.surf, line: B.line, dark: B.dark, fg: fg, muted: rdAll(B.muted, all, fg, 4.5), a: a, onA: A[1], soft: soft, b: b, onB: Bc[1], bsoft: bsoft,
    at: rdAll(a, [B.bg, B.surf, soft], tx, 4.5), bt: rdAll(b, [B.bg, B.surf, bsoft], tx, 4.5),
    hc: s.hcol === "a" ? rdAll(a, [B.bg, B.surf, bsoft], tx, 3.2) : s.hcol === "b" ? rdAll(b, [B.bg, B.surf, bsoft], tx, 3.2) : fg,
    err: rdAll("#C2412D", [B.bg, B.surf], tx, 4.5), onFg: con(fg, "#FFFFFF") > con(fg, "#12171C") ? "#FFFFFF" : "#12171C" };
}

/* ================================================================ ilustračné fotky (vytvorené AI) */
var AI_BASE = (function () {
  try { var u = document.currentScript && document.currentScript.src; if (u) return u.split(/[?#]/)[0].replace(/[^\/]*$/, "") + "img/web/"; } catch (e) { /* nič */ }
  return "img/web/";
})();
var AI = {
  dom: ["dom-rodinny", "dom-obyvacka", "dom-zahrada", "dom-novostavba"],
  byt: ["byt-dom", "byt-obyvacka", "byt-kuchyna", "byt-spalna"],
  poz: ["pozemok", "mesto-letecky"],
  chata: ["chata", "chata-krb"],
  mesto: ["mesto-namestie", "mesto-letecky"]
};
var AI_NOTE = "Obsahový vizuál na webe je generovaný AI.";
// knižnica na výber úvodnej fotky a videa
var AI_LIB = ["dom-novostavba", "dom-rodinny", "dom-zahrada", "dom-obyvacka", "luxus-obyvacka", "byt-obyvacka", "byt-dom", "byt-tehla", "byt-centrum", "mesto-namestie", "mesto-letecky", "pozemok", "chata", "chata-krb", "chatka"];
var AI_VID_LIB = [["video-dom", "Dom pod horami"], ["video-luxus", "Luxusný interiér"], ["video-mesto", "Námestie"]];
function aiSrc(n, maly) { return AI_BASE + n + (maly ? "-m" : "") + ".webp"; }
function aiImg(n, alt, maly, lazy) { return '<img class="ph" src="' + aiSrc(n, maly) + '" alt="' + esc(alt || "") + '"' + (lazy === false ? "" : ' loading="lazy"') + ' decoding="async">'; }
function aiVid(kind) { if (AI_VID_LIB.some(function (v) { return v[0] === W.S.heroAiVid; })) return AI_BASE + W.S.heroAiVid + ".mp4"; return AI_BASE + (kind === "mesto" ? "video-mesto" : W.S.tpl === "luxus" ? "video-luxus" : "video-dom") + ".mp4"; }
function heroAi(kind) { if (AI_LIB.indexOf(W.S.heroAiImg) >= 0) return W.S.heroAiImg; return kind === "mesto" ? "mesto-namestie" : W.S.tpl === "luxus" ? "luxus-obyvacka" : "dom-novostavba"; }
// skutočná ponuka bez fotiek: nikdy nie cudzia fotka, len neutrálna plocha
function bezFotky() { return '<div class="ph nofoto" role="img" aria-label="Fotky pripravujeme">' + SV('<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>') + "<span>Fotky pripravujeme</span></div>"; }
function photo(k, i) { var L = AI[k] || AI.dom; return aiImg(L[(i || 0) % L.length], "", true); }
function img(src, alt, lazy) { return '<img class="ph" src="' + esc(src) + '" alt="' + esc(alt || "") + '"' + (lazy === false ? "" : ' loading="lazy"') + ">"; }
function favSvg(P) { var s = W.S; return s.logo ? '<img src="' + esc(s.logo) + '" alt="">' : '<svg viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" rx="14" fill="' + P.a + '"/><text x="32" y="41" font-size="26" font-weight="800" text-anchor="middle" fill="' + P.onA + '" font-family="system-ui,sans-serif">' + esc(initials(s.name)) + "</text></svg>"; }

/* ================================================================ ochrana formulárov
   Prehliadač vyrieši malú úlohu (SHA-256 začínajúce štyrmi nulami, priemerne 65 000 pokusov, zlomok sekundy).
   Robotom to výrazne predraží posielanie spamu, človek nič nevidí. Server každé riešenie prijme len raz. */
var K256 = [0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2];
var SHA_W = new Array(64);
// prvé 32 bitov SHA-256 z ASCII textu (na overenie stačí začiatok odtlačku)
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

/* ================================================================ ponuky z Realitného týpka */
var CFG = window.SKENER_CONFIG || {};
var KAT = { byty: "byt", domy: "dom", chaty: "chata", pozemky: "poz" };
function fotkaUrl(f) { if (!f) return ""; if (typeof f === "string") return f; if (f.url) return f.url; return CFG.supabaseUrl + "/storage/v1/object/public/ponuky/" + f.cesta; }
function prevod(p) {
  var poz = p.kategoria === "pozemky", pl = poz ? p.plocha_pozemku : (p.plocha_uzitkova || p.plocha_zastavana || p.plocha_pozemku), a = [];
  if (pl) a.push(fmt(pl) + " m²");
  if (p.izby && !poz) a.push(p.izby + (p.izby === 1 ? " izba" : p.izby < 5 ? " izby" : " izieb"));
  if (p.kategoria === "byty" && p.poschodie != null && p.poschodie !== "") a.push(Number(p.poschodie) === 0 ? "prízemie" : p.poschodie + ". poschodie");
  if (p.kategoria === "domy" && p.plocha_pozemku) a.push("pozemok " + fmt(p.plocha_pozemku) + " m²");
  if (p.stav_objektu && a.length < 3) a.push(String(p.stav_objektu).toLowerCase());
  var nazov = p.nazov || [p.typ || "Nehnuteľnosť", p.obec].filter(Boolean).join(", ");
  var popis = String(p.intro || p.popis || "").replace(/\s+/g, " ").trim();
  return { id: p.id, k: KAT[p.kategoria] || "byt", t: nazov, l: [p.obec, p.cast_obce].filter(Boolean).join(" – "), p: p.cena, rent: p.transakcia === "prenajom",
    bezCeny: p.zobrazit_cenu === false || p.cena == null, typCeny: p.typ_ceny, a: a.slice(0, 3), m: pl, iz: p.izby, d: popis.length > 230 ? popis.slice(0, 227).replace(/\s\S*$/, "") + "…" : popis,
    foto: (p.fotky || []).map(fotkaUrl).filter(Boolean), stav: p.stav, nova: !!p.nova_cena, novinka: p.vytvorene && (Date.now() - new Date(p.vytvorene).getTime()) < 14 * 864e5,
    exkl: !!p.exkluzivne, raw: p };
}
function cenaTxt(x) {
  if (x.bezCeny) return x.typCeny === "na vyžiadanie" ? "Cena na vyžiadanie" : "Cena dohodou";
  return fmt(x.p) + " €" + (x.rent ? " / mes." : "");
}
function ZOZ() { return W.CTX.ukazka ? UKAZKA : W.CTX.ponuky; }
function stitok(x, i) {
  if (x.stav === "predane") return '<span class="tag tag-sold">PREDANÉ</span>';
  if (x.stav === "rezervovane") return '<span class="tag tag-res">REZERVOVANÉ</span>';
  if (x.nova) return '<span class="tag">NOVÁ CENA</span>';
  if (x.novinka || (W.CTX.ukazka && i === 0)) return '<span class="tag">NOVÉ</span>';
  if (x.exkl) return '<span class="tag">EXKLUZÍVNE</span>';
  return "";
}
function fotoX(x, i, P) { return x.foto && x.foto.length ? img(x.foto[0], x.t) : x.raw ? bezFotky() : aiImg((AI[x.k] || AI.dom)[0], x.t, true); }
function waPonuka(x) {
  var s = W.S, cis = waNum(s.wa || s.phone); if (!cis) return "";
  var txt = "Dobrý deň, mám záujem o ponuku " + x.t + (x.l ? " (" + x.l + ")" : "") + ". " + odkazPonuky(x);
  return "https://wa.me/" + cis + "?text=" + encodeURIComponent(txt);
}
var APP_URL = "https://app.realitnytypek.sk/";
// odkaz stranka.html?m=adresa&p=ID: Facebook a WhatsApp z neho na serveri prečítajú fotku a názov ponuky
function odkazPonuky(x) {
  if (W.domena && x.id) return "https://" + W.domena + "/?p=" + x.id;
  if (W.adresa && x.id) return APP_URL + "stranka.html?m=" + encodeURIComponent(W.adresa) + "&p=" + x.id;
  try { var u = new URL(location.href); u.hash = "p-" + (x.id || ""); return u.href; } catch (e) { return ""; }
}

/* ================================================================ ikony */
function SV(d, extra) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ' + (extra || "") + ">" + d + "</svg>"; }
var IC = {
  predaj: SV('<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>'),
  prenajom: SV('<circle cx="8" cy="14" r="4"/><path d="M11 11l9-9M17 5l3 3M15 7l2 2"/>'),
  ocenenie: SV('<path d="M4 19h16M7 16V9M12 16V5M17 16v-4"/>'),
  vykup: SV('<path d="M17.5 6.2a7 7 0 1 0 0 11.6"/><path d="M4 10h9.5M4 14h9.5"/>'),
  cube: SV('<path d="M12 2l9 5v10l-9 5-9-5V7z"/><path d="M12 22V12M21 7l-9 5-9-5"/>'),
  fb: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M14 8.5V6.8c0-.8.5-1 1-1h2.3V2.2L14.2 2C10.9 2 10 4.2 10 6.3v2.2H7.5v3.8H10V22h4v-9.7h3.1l.5-3.8H14z"/></svg>',
  ig: SV('<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r=".8" fill="currentColor"/>'),
  li: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="9" width="4" height="12"/><circle cx="5" cy="4.8" r="2.3"/><path d="M10 9h3.8v1.7c.6-1 1.9-2 3.9-2 3.3 0 4.3 2.1 4.3 5.3V21h-4v-6.2c0-1.5-.3-2.8-1.9-2.8s-2.1 1.2-2.1 2.8V21h-4z"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.6 3h3.1l-6.8 7.7L22 21h-6.3l-4.9-6.4L5.2 21H2.1l7.3-8.3L1.8 3h6.4l4.4 5.9zm-1.1 16.2h1.7L7.6 4.7H5.8z"/></svg>',
  tt: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M16.6 2c.3 2.4 1.7 3.9 4.1 4.1v3.3c-1.5.1-2.8-.4-4.1-1.2v6.3c0 4.2-3.5 6.9-7.2 6.3-3.3-.6-5.3-3.8-4.6-7 .6-2.9 3.4-4.9 6.5-4.5v3.4c-.4-.1-.8-.1-1.2 0-1.4.3-2.2 1.6-2 2.9.3 1.5 1.8 2.3 3.2 1.9 1.1-.3 1.8-1.3 1.8-2.6V2h3.5z"/></svg>',
  wa: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.1l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.2-.4.7-1.4.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 2.9 2.9 0 0 0-.9 2.2 5 5 0 0 0 1.1 2.7c.1.2 1.9 2.9 4.6 4 1.7.7 2.4.8 3.2.7.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.2-.2-.5-.3z"/></svg>',
  play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15l12.5-7.5z"/></svg>',
  yt: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M23 7.2a3 3 0 0 0-2.1-2.1C19 4.6 12 4.6 12 4.6s-7 0-8.9.5A3 3 0 0 0 1 7.2 31 31 0 0 0 .5 12 31 31 0 0 0 1 16.8a3 3 0 0 0 2.1 2.1c1.9.5 8.9.5 8.9.5s7 0 8.9-.5a3 3 0 0 0 2.1-2.1 31 31 0 0 0 .5-4.8 31 31 0 0 0-.5-4.8zM9.7 15.1V8.9l5.8 3.1z"/></svg>',
  ok: SV('<path d="M5 12.5l4.5 4.5L19 7.5"/>', 'stroke-width="2.6"'),
  tel: SV('<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/>'),
  kava: SV('<path d="M4 9h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z"/><path d="M17 10h1.5a2.5 2.5 0 0 1 0 5H17M8 3v3M12 3v3"/>'),
  video: SV('<rect x="3" y="6" width="13" height="12" rx="2"/><path d="M16 10l5-3v10l-5-3"/>'),
  mail: SV('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>') };
// ikony pre Prečo so mnou – vyberú sa podľa názvu
var WHY_IC = {
  cena: SV('<path d="M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z"/><circle cx="7.5" cy="7.5" r="1.5"/>'),
  hotovost: SV('<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 10v4M18 10v4"/>'),
  rychlost: SV('<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>'),
  istota: SV('<path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/>'),
  diskretnost: SV('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>'),
  jednanie: SV('<circle cx="9" cy="8" r="4"/><path d="M2 21a7 7 0 0 1 14 0M16 11l2 2 4-4"/>'),
  skusenosti: SV('<circle cx="12" cy="9" r="6"/><path d="M8.5 14L7 22l5-3 5 3-1.5-8"/>'),
  odbornost: SV('<path d="M2 9l10-5 10 5-10 5z"/><path d="M6 11v5c3 2 9 2 12 0v-5M22 9v6"/>'),
  hviezda: SV('<path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9z"/>'),
  srdce: SV('<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>') };
function whyIc(t, i) {
  var x = slugD(t), m = [[/cen|odmen|proviz|poplat/, "cena"], [/hotov|peniaz|platb|vyplat/, "hotovost"], [/rychl|cas|hned|okamz/, "rychlost"], [/spolah|istot|bezpec|garanc|dovera/, "istota"], [/diskr|sukrom|mlcan/, "diskretnost"], [/serioz|ferov|jednan|pristup|ludsk|otvoren/, "jednanie"], [/skusen|prax|rok|referenc/, "skusenosti"], [/odbor|vzdel|znal|certif|rsc|pravn/, "odbornost"]].find(function (q) { return q[0].test(x); });
  return WHY_IC[m ? m[1] : i % 2 ? "srdce" : "hviezda"];
}
var SVC_IC = ["predaj", "prenajom", "ocenenie", "vykup"];

/* ================================================================ časti stránky */
function ed(path, single) { return 'data-ed="' + esc(path) + '"' + (single ? " data-single" : "") + (W.EDIT ? ' contenteditable="true" spellcheck="true"' : ""); }
function fotoMaklera() { var s = W.S; return s.photo || (W.CTX.makler && W.CTX.makler.foto) || ""; }
// ilustračná fotka makléra/maklérky len v ukážke v editore, na zverejnenom webe sa bez fotky zobrazia iniciály
function zena() { return !!(W.CTX.makler && W.CTX.makler.pohlavie === "zena"); }
function fotoUkazka() { return W.editor && !fotoMaklera() ? aiSrc(zena() ? "maklerka" : "makler") : ""; }
// druhá fotka makléra (sekcia O mne a kontakt); bez nej sa použije hlavná
function foto2() { return String(W.S.photo2 || "").trim(); }
function av() { var s = W.S, f = fotoMaklera() || fotoUkazka(); return '<span class="mono">' + (f ? '<img src="' + esc(f) + '" alt="' + esc(s.name) + '">' : esc(initials(s.name))) + "</span>"; }
function socRow() {
  var s = W.S, it = SOC.filter(function (x) { return String(s.soc[x[0]] || "").trim(); });
  if (!it.length) return "";
  return '<div class="soc">' + it.map(function (x) { return '<a href="' + esc(url(s.soc[x[0]])) + '" target="_blank" rel="noopener" aria-label="' + x[1] + '" title="' + x[1] + '">' + IC[x[0]] + "</a>"; }).join("") + "</div>";
}
function H(k, eb, h, p) { return '<div class="hd"><span class="eb">' + esc(eb) + "</span><h2 " + ed("heads." + k + ".h", 1) + ">" + esc(head(k, "h", h)) + "</h2>" + (p ? "<p " + ed("heads." + k + ".p") + ">" + esc(head(k, "p", p)) + "</p>" : "") + "</div>"; }
function fv(f, n) { return esc((W.FV[f] || {})[n] || ""); }
function inp(f, n, ph, type) { return '<input class="fld" name="' + n + '" type="' + (type || "text") + '" placeholder="' + esc(ph) + '" value="' + fv(f, n) + '" aria-label="' + esc(ph) + '"' + (type === "email" ? ' autocomplete="email"' : type === "tel" ? ' autocomplete="tel"' : n === "meno" ? ' autocomplete="name"' : "") + ">"; }
function errMsg(f) { return W.ERR[f] ? '<p class="err" role="alert">' + esc(W.ERR[f]) + "</p>" : ""; }
function rec() { return W.CTX.recenzie && W.CTX.recenzie.pocet ? W.CTX.recenzie : null; }
function avg() { var r = rec(); return r ? String(r.priemer).replace(".", ",") : ""; }
function cislo(v) { v = String(v).trim(); var m = v.match(/^(\d{1,6})(\D{0,6})$/); return m ? '<b class="num" data-count="' + m[1] + '" data-suf="' + esc(m[2]) + '">' + esc(v) + "</b>" : '<b class="num">' + esc(v) + "</b>"; }
function facts(cls, bezRokov) {
  var s = W.S, f = [];
  if (String(s.years).trim() && !bezRokov) f.push("<div>" + cislo(s.years) + "<span>rokov v realitách</span></div>");
  if (String(s.sold).trim()) f.push("<div>" + cislo(s.sold) + "<span>predaných nehnuteľností</span></div>");
  (s.stats || []).forEach(function (x) { if (String(x.n || "").trim() && String(x.t || "").trim()) f.push("<div>" + cislo(x.n) + "<span>" + esc(x.t) + "</span></div>"); });
  var a = avg(); if (f.length < 2 && a) f.push('<div><b class="num">' + a + "</b><span>priemer z " + rec().pocet + (rec().pocet === 1 ? " recenzie" : " recenzií") + "</span></div>");
  if (!f.length) return cls && W.editor && !W.EDIT && !String(s.years).trim() ? '<button type="button" class="facts-pr" data-edgo="makler|f-years">+ Sem pridaj čísla: roky v realitách, počet predajov…</button>' : "";
  return '<div class="facts' + (cls ? " " + cls : "") + (f.length > 2 ? " f4" : "") + " n" + Math.min(4, f.length) + '">' + f.slice(0, 4).join("") + "</div>";
}
// pás s číslami hneď pod úvodom (roky, predaje, vlastné čísla)
function cislaPas() { var f = facts("cp"); return f ? '<div class="cisla"><div class="w">' + f + "</div></div>" : ""; }
// hlavné tlačidlo v úvode podľa výberu makléra
var HBTN = { ocenenie: ["Zistiť hodnotu zdarma", "ocenenie"], predat: ["Chcem predať", "ocenenie"], ponuky: ["Pozrieť ponuky", "ponuky"], zavolat: ["Zavolajte mi", "callback"], vykup: ["Chcem výkup", "vykup"], ebook: ["Stiahnuť e-book", "stiahnut"], kontakt: ["Napíšte mi", "kontakt"] };
function hlavneTl() { var s = W.S, h = HBTN[s.heroBtn]; if (!h) return ""; return '<button type="button" class="btn" data-go="' + (s.on[h[1]] ? h[1] : "kontakt") + '">' + esc(String(s.heroBtnTx || "").trim() || h[0]) + "</button>"; }
function hlavnyCiel() { var h = HBTN[W.S.heroBtn]; return h ? h[1] : ""; }
// hodnotenie z Google (ručne zadané) alebo priemer recenzií z aplikácie – odznak v úvode
function gRating() { var r = W.S.rev || {}, v = parseFloat(String(r.gRating || "").replace(",", ".")), n = parseInt(String(r.gCount || "").replace(/\D/g, ""), 10); return v >= 1 && v <= 5 ? { v: (Math.round(v * 10) / 10).toFixed(1).replace(".", ","), n: n > 0 ? n : 0 } : null; }
function recTxt(n) { return n + (n === 1 ? " recenzia" : n < 5 ? " recenzie" : " recenzií"); }
function gBadge() {
  var g = gRating(), u = url(W.S.rev.google), r = rec(), a = avg(), st = '<span class="gb-st" aria-hidden="true">★★★★★</span>';
  if (g) { var t = st + "<b>" + g.v + "</b><span>" + (g.n ? recTxt(g.n) + " na Google" : "hodnotenie na Google") + "</span>"; return u ? '<a class="gbadge" href="' + esc(u) + '" target="_blank" rel="noopener">' + t + "</a>" : '<span class="gbadge">' + t + "</span>"; }
  if (r && r.pocet >= 3 && a) return '<span class="gbadge">' + st + "<b>" + a + "</b><span>" + r.pocet + " hodnotení klientov</span></span>";
  return "";
}
function ohnisko() { var f = String(W.S.heroFoc || ""); return /^\d{1,3}(\.\d)?% \d{1,3}(\.\d)?%$/.test(f) ? f : ""; }
function heroMedia(P, kind) {
  var s = W.S, f = ohnisko(), st = f ? ' style="object-position:' + f + ";transform-origin:" + f + '"' : "";
  if (s.heroMedia === "video") return '<div class="hm"><video src="' + esc(s.heroVideo || aiVid(kind)) + '"' + (s.heroVideo ? "" : ' poster="' + aiSrc(heroAi(kind)) + '"') + st + ' autoplay muted loop playsinline aria-hidden="true"></video></div>';
  return '<div class="hm' + (s.heroMedia === "pohyb" ? " kb" : "") + '">' + (s.heroImg ? img(s.heroImg, "", false) : aiImg(heroAi(kind), "", false, false)).replace("<img ", "<img" + st + " ") + "</div>";
}
function days() { var out = [], d = new Date(); d.setHours(12, 0, 0, 0); while (out.length < 6) { d.setDate(d.getDate() + 1); var w = d.getDay(); if (w === 0 || (w === 6 && !W.S.book.sat)) continue; out.push(new Date(d)); } return out; }
function calcHtml(p0) {
  return '<div class="calc"><div class="sl"><label>Cena nehnuteľnosti <b class="num" data-o="p"></b><input type="range" data-c="p" min="30000" max="500000" step="1000" value="' + Math.min(500000, Math.max(30000, p0 || 150000)) + '"></label>' +
    '<label>Vlastné zdroje <b class="num" data-o="d"></b><input type="range" data-c="d" min="0" max="40" step="5" value="20"></label>' +
    '<label>Doba splácania <b class="num" data-o="y"></b><input type="range" data-c="y" min="5" max="35" step="1" value="30"></label></div>' +
    '<div class="res"><span class="muted">Mesačná splátka približne</span><strong class="num" data-o="m"></strong><span class="muted" style="font-size:14px">Orientačne pri úroku ' + String(Math.round((+W.S.hypo.rate || 0) * 100) / 100).replace(".", ",") + " %. Rád vám odporučím overeného hypotekárneho špecialistu.</span></div></div>";
}

function nav() {
  var s = W.S;
  var items = s.order.filter(function (k) { return s.on[k] && (!W.SEKCIE || W.SEKCIE.indexOf(k) >= 0) && ["ponuky", "omne", "sluzby", "postup", "recenzie", "lokality", "faq", "kontakt", "ocenenie"].indexOf(k) >= 0; }).slice(0, 5)
    .map(function (k) { return '<button type="button" data-go="' + k + '">' + esc(secName(k).replace("Lokality, ktoré poznám", "Lokality")) + "</button>"; }).join("");
  return '<div class="w nav"><div class="brand" data-home="top">' + (s.logo ? '<img class="logoimg" src="' + esc(s.logo) + '" alt="' + esc(s.name) + '">' : av() + esc(s.name)) + '</div><nav class="menu">' + items + '</nav><button type="button" class="btn" data-go="' + (s.on.callback ? "callback" : "kontakt") + '">Zavolajte mi</button></div>';
}
function pozicia() { return ["l", "c", "r"].indexOf(W.S.heroPos) >= 0 ? W.S.heroPos : W.S.tpl === "luxus" ? "c" : "l"; }
function heroHladaj() {
  var s = W.S, kat = s.on.ponuky ? katPocty(ZOZ().filter(function (x) { return x.stav !== "predane"; })).slice(0, 3) : [], F = W.FIL;
  return '<div class="search">' + kat.map(function (k) { return '<button type="button" data-hfk="' + k[0] + '"' + (F.k === k[0] ? ' class="on"' : "") + ">" + (k[0] === "chata" ? "Chaty" : KAT_N[k[0]][0]) + "</button>"; }).join("") +
    '<button type="button" data-go="' + (s.on.strazca ? "strazca" : "kontakt") + '"' + (kat.length ? "" : ' class="on"') + ">" + (kat.length ? "Hľadám" : "Hľadám nehnuteľnosť") + "</button></div>";
}
function hero(P) {
  var s = W.S, T = heroTx(), h1 = "<h1 " + ed("heroTx." + s.tpl + ".t", 1) + ">" + esc(T.t) + "</h1>", lead = T.l || W.EDIT ? '<p class="lead" ' + ed("heroTx." + s.tpl + ".l") + ">" + esc(T.l) + "</p>" : "";
  var hb = hlavneTl(), hc = hlavnyCiel(), predat = '<button type="button" class="btn' + (hb ? " gh" : "") + '" data-go="' + (s.on.ocenenie ? "ocenenie" : "kontakt") + '">Chcem predať</button>', ponuky = '<button type="button" class="btn gh" data-go="ponuky">Pozrieť ponuky</button>';
  var btns = '<div class="btns">' + (hb ? hb + (hc === "ponuky" ? predat : ponuky) : predat + ponuky) + "</div>", hbRow = hb ? '<div class="btns">' + hb + "</div>" : "";
  var first = String(s.name || "").split(" ")[0];
  switch (s.tpl) {
    case "galeria": return '<div class="hero pos-' + pozicia() + '">' + heroMedia(P) + '<div class="box"><div class="who">' + av() + "<div><b>" + esc(s.name) + '</b><div class="muted" style="font-size:14px">' + esc(s.area) + "</div></div></div>" + h1 + lead +
      heroHladaj() + hbRow + gBadge() + "</div></div>";
    case "vizitka": return '<div class="w hero">' + av() + '<span class="eb">' + (zena() ? "Realitná maklérka" : "Realitný maklér") + (s.office ? " · " + esc(s.office) : "") + "</span><h1>" + esc(s.name) + "</h1>" + lead +
      '<div class="pills">' + (s.phone ? '<a class="num" href="tel:' + esc(String(s.phone).replace(/[^\d+]/g, "")) + '">' + esc(s.phone) + "</a>" : "") + (s.email ? '<a href="mailto:' + esc(s.email) + '">' + esc(s.email) + "</a>" : "") + (s.wa ? '<a href="https://wa.me/' + waNum(s.wa) + '" target="_blank" rel="noopener">WhatsApp</a>' : "") + "</div>" + hbRow + gBadge() + socRow() + "</div>";
    case "luxus": return '<div class="hero pos-' + pozicia() + '">' + heroMedia(P) + '<div class="scrim"></div><div class="in"><span class="eb">' + esc(s.name) + " · " + esc(s.area) + "</span>" + h1 + lead +
      '<div class="btns">' + (hb && hc !== "ponuky" ? hb + (hc === "ocenenie" ? '<button type="button" class="btn gh" data-go="ponuky">Pozrieť ponuky</button>' : '<button type="button" class="btn gh" data-go="' + (s.on.ocenenie ? "ocenenie" : "kontakt") + '">Ocenenie nehnuteľnosti</button>') : '<button type="button" class="btn" data-go="ponuky">' + (hb ? esc(String(s.heroBtnTx || "").trim() || "Pozrieť ponuky") : "Pozrieť ponuky") + '</button><button type="button" class="btn gh" data-go="' + (s.on.ocenenie ? "ocenenie" : "kontakt") + '">Ocenenie nehnuteľnosti</button>') + "</div>" + gBadge() + "</div></div>";
    case "rodinna": { var a = avg();
      return '<div class="w hero"><div><span class="eb">Realitný maklér · ' + esc(s.area) + '</span><h1><span class="hl" ' + ed("heroTx.rodinna.t", 1) + ">" + esc(T.t) + "</span></h1>" + lead + btns + gBadge() + "</div>" +
        '<div class="blob"><div class="shape">' + av() + "</div>" + (a ? '<div class="badge2"><b class="num">' + a + " z 5</b><span>priemer hodnotení</span></div>" : "") + "</div></div>"; }
    case "mestska": return '<div class="hero"><div class="blk"><span class="eb">' + esc(s.name) + " · " + esc(s.area) + "</span><div>" + h1 + "</div><div>" + lead + '<div class="btns" style="margin-top:18px">' + (hb || '<button type="button" class="btn" data-go="ponuky">Pozrieť ponuky</button>') + "</div>" + gBadge() + '</div></div><div class="img">' + heroMedia(P, "mesto") + "</div></div>";
    default: return '<div class="w hero"><div><span class="eb">Realitn' + (zena() ? "á maklérka" : "ý maklér") + " · " + esc(s.area) + "</span>" + h1 + lead + btns + gBadge() + "</div>" +
      '<div class="port' + (fotoMaklera() || fotoUkazka() ? " hasimg" : "") + '">' + av() + '<div><b style="font-size:18px">' + esc(s.name || first) + '</b><div class="muted" style="font-size:14px">' + esc(s.office) + "</div></div>" + socRow() + "</div></div>";
  }
}

function kartaPonuky(x, i, P) {
  var bk = W.S.on.obhliadka && x.stav !== "predane" ? '<button type="button" class="bk" data-book="' + i + '">Dohodnúť obhliadku →</button>' : "", wa = waPonuka(x);
  return '<div class="card" data-open="' + i + '"><div class="media">' + fotoX(x, i, P) + stitok(x, i) + '</div><div class="price num">' + esc(cenaTxt(x)) + '</div><h3><button type="button" class="tlink" data-open="' + i + '">' + esc(x.t) + "</button>" +
    '<br><span class="muted" style="font-weight:400;font-size:15px">' + esc(x.l) + '</span></h3><div class="params">' + x.a.map(function (v) { return "<span>" + esc(v) + "</span>"; }).join("") + "</div>" +
    (bk || wa ? '<div class="card-akcie">' + bk + (wa && x.stav !== "predane" ? '<a class="wa-mini" href="' + esc(wa) + '" target="_blank" rel="noopener" aria-label="Napísať cez WhatsApp o ponuke ' + esc(x.t) + '">' + IC.wa + "WhatsApp</a>" : "") + "</div>" : "") + "</div>";
}
function zoznamPonuk(L, P) {
  var s = W.S;
  if (s.tpl === "galeria") return '<div class="tiles">' + L.map(function (q) { var x = q[0], i = q[1]; return '<div class="tile" data-open="' + i + '" role="button" tabindex="0" aria-label="' + esc(x.t) + '">' + fotoX(x, i, P) + stitok(x, i) + '<div class="info"><div><h3>' + esc(x.t) + "</h3><small>" + esc(x.l) + (x.a[0] ? " · " + esc(x.a[0]) : "") + '</small></div><b class="num">' + esc(cenaTxt(x)) + "</b></div></div>"; }).join("") + "</div>";
  if (s.tpl === "vizitka") return '<div class="rows">' + L.map(function (q) { var x = q[0], i = q[1]; return '<div class="lrow" data-open="' + i + '" role="button" tabindex="0"><div class="media">' + fotoX(x, i, P) + stitok(x, i) + "</div><div><h3>" + esc(x.t) + '</h3><div class="muted" style="font-size:14px">' + esc([x.l].concat(x.a.slice(0, 2)).filter(Boolean).join(" · ")) + '</div></div><b class="num">' + esc(cenaTxt(x)) + "</b></div>"; }).join("") + "</div>";
  if (s.tpl === "luxus") return '<div class="lux-list">' + L.map(function (q) { var x = q[0], i = q[1]; return '<div class="lux-row" data-open="' + i + '" role="button" tabindex="0"><div class="media">' + fotoX(x, i, P) + stitok(x, i) + '</div><div><span class="eb">' + esc(x.l) + "</span><h3>" + esc(x.t) + '</h3><p class="muted">' + esc(x.d) + '</p><div class="params">' + x.a.map(function (v) { return "<span>" + esc(v) + "</span>"; }).join("") + '</div><div class="price num">' + esc(cenaTxt(x)) + "</div></div></div>"; }).join("") + "</div>";
  return '<div class="cards">' + L.map(function (q) { return kartaPonuky(q[0], q[1], P); }).join("") + "</div>";
}

/* ================================================================ filtrovanie ponúk */
var KAT_N = { byt: ["Byty", "Byt"], dom: ["Domy", "Dom"], poz: ["Pozemky", "Pozemok"], chata: ["Chaty a chalupy", "Chata"] };
function katPocty(Z) { var c = {}; Z.forEach(function (x) { if (KAT_N[x.k]) c[x.k] = (c[x.k] || 0) + 1; }); return Object.keys(KAT_N).filter(function (k) { return c[k]; }).map(function (k) { return [k, c[k]]; }).sort(function (a, b) { return b[1] - a[1]; }); }
function obecX(x) { return String((x.raw && x.raw.obec) || "").trim(); }
function rovnakaObec(a, b) { return slugD(a) === slugD(b); }
function filtrovane() {
  var F = W.FIL, out = ZOZ().map(function (x, i) { return [x, i]; }).filter(function (q) {
    var x = q[0]; return x.stav !== "predane" && (!F.k || x.k === F.k) && (!F.t || (F.t === "prenajom") === !!x.rent) && (!F.o || rovnakaObec(obecX(x), F.o));
  });
  if (F.sort === "lacne" || F.sort === "drahe") out.sort(function (a, b) {
    var x = a[0], y = b[0]; if (x.bezCeny !== y.bezCeny) return x.bezCeny ? 1 : -1; if (x.bezCeny) return 0;
    if (!!x.rent !== !!y.rent) return x.rent ? 1 : -1; return F.sort === "lacne" ? x.p - y.p : y.p - x.p;
  });
  return out;
}
function filtre(Z) {
  var F = W.FIL, aktivny = F.k || F.t || F.o || F.sort;
  if (Z.length < 4 && !aktivny) return "";
  var kat = katPocty(Z), rent = Z.filter(function (x) { return x.rent; }).length, out = [];
  function chip(attr, v, label, n, on) { return '<button type="button" class="fchip' + (on ? " on" : "") + '" data-' + attr + '="' + esc(v) + '" aria-pressed="' + !!on + '">' + esc(label) + (n != null ? " <span>" + n + "</span>" : "") + "</button>"; }
  if (kat.length > 1 || F.k) { out.push(chip("fk", "", "Všetky", Z.length, !F.k)); kat.forEach(function (k) { out.push(chip("fk", k[0], KAT_N[k[0]][0], k[1], F.k === k[0])); }); }
  if ((rent && rent < Z.length) || F.t) { out.push('<span class="fsep" aria-hidden="true"></span>'); out.push(chip("ft", "predaj", "Na predaj", Z.length - rent, F.t === "predaj")); out.push(chip("ft", "prenajom", "Na prenájom", rent, F.t === "prenajom")); }
  if (F.o) out.push(chip("fo", "", F.o + " ✕", null, true));
  var sort = Z.length >= 4 ? '<label class="fsort"><span>Zoradiť</span><select data-fsort>' + [["", "Najnovšie"], ["lacne", "Od najlacnejších"], ["drahe", "Od najdrahších"]].map(function (o) { return '<option value="' + o[0] + '"' + (F.sort === o[0] ? " selected" : "") + ">" + o[1] + "</option>"; }).join("") + "</select></label>" : "";
  return out.length || sort ? '<div class="filtre" role="group" aria-label="Filter ponúk"><div class="fchips">' + out.join("") + "</div>" + sort + "</div>" : "";
}

var R = {
  ponuky: function (P) {
    var s = W.S, Z = ZOZ().filter(function (x) { return x.stav !== "predane"; }), FL = filtrovane(), L = W.VSETKY ? FL : FL.slice(0, s.n);
    var nic = '<div class="prazdne"><b>V tomto výbere teraz nemám ponuku.</b><p class="muted">Napíšte mi, čo hľadáte, a ozvem sa vám, keď sa objaví.</p><div class="btns" style="justify-content:center"><button type="button" class="btn gh" data-fk="">Zobraziť všetky ponuky</button><button type="button" class="btn" data-go="' + (s.on.strazca ? "strazca" : "kontakt") + '">Napísať, čo hľadám</button></div></div>';
    var body = Z.length ? filtre(Z) + (FL.length ? zoznamPonuk(L, P) : nic) : '<div class="prazdne"><b>Momentálne pripravujem nové ponuky.</b><p class="muted">Napíšte mi, čo hľadáte, a ozvem sa vám, keď sa objaví vhodná nehnuteľnosť.</p><button type="button" class="btn" data-go="' + (s.on.strazca ? "strazca" : "kontakt") + '">Napísať, čo hľadám</button></div>';
    var viac = FL.length > s.n && !W.VSETKY ? '<div class="btns" style="justify-content:center;margin-top:28px"><button type="button" class="btn gh" data-vsetky>Všetky ponuky (' + FL.length + ")</button></div>" : "";
    var uk = W.CTX.ukazka && W.editor ? '<p class="sample">Ukážkové ponuky. Keď v Nehnuteľnostiach zverejníš ponuky, ukážu sa tu tvoje.</p>' : "";
    return H("ponuky", "Ponuky", "Aktuálne ponuky", Z.length ? "Kliknite na ponuku a uvidíte všetky fotky, parametre, polohu aj splátku hypotéky." : "") + body + viac + uk;
  },
  predane: function (P) {
    var L = W.CTX.predane || [];
    if (!L.length) return W.editor ? H("predane", "Referencie", "Predané nehnuteľnosti") + '<p class="sample">Keď v Nehnuteľnostiach označíš ponuku ako Predané, objaví sa tu. Na verejnom webe sa sekcia bez predaných ponúk nezobrazí.</p>' : "";
    return H("predane", "Referencie", "Predané nehnuteľnosti", "Nehnuteľnosti, ktoré som " + (W.CTX.makler && W.CTX.makler.pohlavie === "zena" ? "pomohla" : "pomohol") + " predať.") + '<div class="cards sold">' + L.slice(0, 6).map(function (x, i) {
      return '<div class="card"><div class="media">' + fotoX(x, i + 3, P) + (W.S.soldBand ? '<span class="sold-band" aria-label="Predané"><b>PREDANÉ</b></span>' : '<span class="tag tag-sold">PREDANÉ</span>') + '</div><h3>' + esc(x.t) + '<br><span class="muted" style="font-weight:400;font-size:15px">' + esc(x.l) + '</span></h3><div class="params">' + x.a.slice(0, 2).map(function (v) { return "<span>" + esc(v) + "</span>"; }).join("") + "</div></div>";
    }).join("") + "</div>";
  },
  strazca: function () {
    var s = W.S, Wt = W.Wt, places = String(s.watch.places || "").split(",").map(function (x) { return x.trim(); }).filter(Boolean);
    var right = W.DONE.strazca ? '<div class="done"><b>Ďakujem, mám to zapísané</b><p>' + esc(Wt.typ.join(", ") || "Všetko") + " · " + esc(Wt.place || "celý región") + " · do " + fmt(Wt.max) + ' €</p><p class="muted" style="font-size:14px">Keď sa objaví vhodná ponuka, ozvem sa vám. Ak ste zadali e-mail, potvrďte ho odkazom, ktorý vám príde. Potom vám ponuky budú chodiť aj e-mailom.</p><button type="button" class="qback" data-again="strazca">Upraviť požiadavku</button></div>'
      : '<div class="wform" data-form="strazca"><div><span class="lbl">Čo hľadáte</span><div class="wchips">' + ["Byt", "Dom", "Pozemok", "Prenájom"].map(function (t) { var on = Wt.typ.indexOf(t) >= 0; return '<button type="button" class="wchip' + (on ? " on" : "") + '" data-wt="' + t + '" aria-pressed="' + on + '">' + t + "</button>"; }).join("") + "</div></div>" +
        (places.length ? '<div><span class="lbl">Kde</span><div class="wchips">' + places.map(function (p) { return '<button type="button" class="wchip' + (Wt.place === p ? " on" : "") + '" data-wp="' + esc(p) + '" aria-pressed="' + (Wt.place === p) + '">' + esc(p) + "</button>"; }).join("") + "</div></div>" : "") +
        '<div><span class="lbl">Cena do <b class="num" data-wo>' + fmt(Wt.max) + ' €</b></span><input type="range" min="30000" max="400000" step="5000" value="' + Wt.max + '" data-wmax aria-label="Cena do"></div>' +
        '<div class="two">' + inp("strazca", "meno", "Meno") + inp("strazca", "kontakt", "E-mail alebo telefón") + "</div>" + errMsg("strazca") + '<button type="button" class="btn" data-send="strazca">Dajte mi vedieť</button><p class="muted wnote">Keď zadáte e-mail, príde vám odkaz na potvrdenie. Potom vám nové ponuky budú chodiť aj e-mailom, najviac raz za 12 hodín. Odhlásiť sa dá jedným klikom.</p></div>';
    return '<div class="watch"><div><span class="eb">Hľadáte nehnuteľnosť?</span><h2 ' + ed("watch.title", 1) + ">" + esc(s.watch.title) + '</h2><p class="muted" ' + ed("watch.text") + ">" + esc(s.watch.text) + "</p></div>" + right + "</div>";
  },
  omne: function () { var s = W.S; return '<div class="about">' + (foto2() ? '<span class="mono foto2"><img src="' + esc(foto2()) + '" alt="' + esc(s.name) + '" loading="lazy"></span>' : av()) + '<div class="txt"><span class="eb">O mne</span><h2 class="h2" style="margin:10px 0 16px" ' + ed("about.title", 1) + ">" + esc(s.about.title) + "</h2><div " + ed("about.text") + ">" + paras(s.about.text) + '</div><div class="sig">' + esc(s.name) + '</div><div class="muted" style="font-size:14px">' + esc(s.office) + "</div></div></div>"; },
  postup: function () {
    var st = W.S.steps.map(function (s, i) { return [s, i]; }).filter(function (x) { return x[0].t || x[0].d; }), n = st.length;
    if (!n) return "";
    return H("postup", "Postup predaja", "Ako prebieha predaj so mnou", n + " " + (n === 1 ? "krok" : n < 5 ? "kroky" : "krokov") + " od prvého stretnutia po odovzdanie kľúčov.") +
      '<ol class="steps">' + st.map(function (x) { return "<li><div><h3 " + ed("steps." + x[1] + ".t", 1) + ">" + esc(x[0].t) + "</h3><p " + ed("steps." + x[1] + ".d") + ">" + esc(x[0].d) + "</p></div></li>"; }).join("") + "</ol>";
  },
  sluzby: function () { if (!W.S.svc.some(function (x) { return x.t || x.d; })) return ""; return H("sluzby", "Služby", "S čím vám pomôžem") + '<div class="svc">' + W.S.svc.map(function (x, i) { return "<div><i>" + IC[SVC_IC[i % 4]] + "</i><h3 " + ed("svc." + i + ".t", 1) + ">" + esc(x.t) + "</h3><p " + ed("svc." + i + ".d") + ">" + esc(x.d) + "</p></div>"; }).join("") + "</div>" + svcX(); },
  preco: function () {
    var L = W.S.why.map(function (x, i) { return [x, i]; }).filter(function (q) { return String(q[0].t || "").trim(); });
    if (!L.length) return W.editor ? H("preco", "Prečo so mnou", "Prečo si vybrať práve mňa") + '<p class="sample">Doplň dôvody v nastavení sekcie (ceruzka v časti Sekcie).</p>' : "";
    return H("preco", "Prečo so mnou", "Prečo si vybrať práve mňa") + '<div class="preco n' + Math.min(4, L.length) + '">' + L.map(function (q) { var x = q[0], i = q[1];
      return "<div><i>" + whyIc(x.t, i) + "</i><h3 " + ed("why." + i + ".t", 1) + ">" + esc(x.t) + "</h3>" + (x.d || W.EDIT ? "<p " + ed("why." + i + ".d") + ">" + esc(x.d) + "</p>" : "") + "</div>"; }).join("") + "</div>";
  },
  tim: function () {
    var L = W.S.team.map(function (x, i) { return [x, i]; }).filter(function (q) { return String(q[0].n || "").trim(); });
    var hd = H("tim", "Tím", "Ľudia, s ktorými budete v kontakte");
    if (!L.length) return W.editor ? hd + '<p class="sample">Pridaj kolegov v nastavení sekcie (ceruzka v časti Sekcie). Kým nikoho nepridáš, na verejnom webe sa sekcia nezobrazí.</p>' : "";
    return hd + '<div class="tim">' + L.map(function (q) { var x = q[0], i = q[1], tel = String(x.tel || "").replace(/[^\d+]/g, ""), f = String(x.img || "").trim();
      return '<div class="clen"><span class="mono">' + (f ? '<img src="' + esc(f) + '" alt="' + esc(x.n) + '" loading="lazy">' : esc(initials(x.n))) + "</span><h3 " + ed("team." + i + ".n", 1) + ">" + esc(x.n) + "</h3>" + (x.r || W.EDIT ? '<span class="muted" ' + ed("team." + i + ".r", 1) + ">" + esc(x.r) + "</span>" : "") +
        (tel || x.mail ? '<div class="clen-k">' + (tel ? '<a href="tel:' + esc(tel) + '" aria-label="Zavolať ' + esc(x.n) + '">' + IC.tel + '<span class="num">' + esc(x.tel) + "</span></a>" : "") + (x.mail ? '<a href="mailto:' + esc(String(x.mail).trim()) + '" aria-label="Napísať ' + esc(x.n) + '">' + IC.mail + "<span>" + esc(x.mail) + "</span></a>" : "") + "</div>" : "") + "</div>"; }).join("") + "</div>";
  },
  cennik: function () {
    var c = W.S.cen, rows = (c.rows || []).map(function (x, i) { return [x, i]; }).filter(function (q) { return q[0].t || q[0].c; }), inc = riadky(c.inc);
    var hd = H("cennik", "Cenník", "Férová a jasná odmena", "Viete vopred, koľko zaplatíte. Bez prekvapení na konci.");
    if (!rows.length && !inc.length) return W.editor ? hd + '<p class="sample">Doplň ceny v nastavení sekcie (ceruzka v časti Sekcie).</p>' : "";
    return hd + '<div class="cen"><div class="cen-rows">' + rows.map(function (q) { var x = q[0], i = q[1];
        return '<div class="cen-row"><div><h3 ' + ed("cen.rows." + i + ".t", 1) + ">" + esc(x.t) + "</h3>" + (x.p || W.EDIT ? '<span class="muted" ' + ed("cen.rows." + i + ".p", 1) + ">" + esc(x.p) + "</span>" : "") + '</div><b class="num" ' + ed("cen.rows." + i + ".c", 1) + ">" + esc(x.c) + "</b></div>"; }).join("") +
      (c.pozn || W.EDIT ? '<p class="cen-pozn" ' + ed("cen.pozn") + ">" + esc(c.pozn) + "</p>" : "") + "</div>" +
      (inc.length ? '<div class="cen-inc"><h3>V cene je</h3><ul>' + inc.map(function (t) { return "<li>" + IC.ok + "<span>" + esc(t) + "</span></li>"; }).join("") + "</ul>" +
        '<button type="button" class="btn" data-go="' + (W.S.on.ocenenie ? "ocenenie" : "kontakt") + '">' + (W.S.on.ocenenie ? "Chcem bezplatné ocenenie" : "Dohodnúť stretnutie") + "</button></div>" : "") + "</div>";
  },
  vykup: function () {
    var s = W.S, v = s.vyk, typy = String(v.typy || "").split(",").map(function (x) { return x.trim(); }).filter(Boolean), vyh = riadky(v.vyhody), kr = riadky(v.kroky);
    var tel = String(s.phone || "").replace(/[^\d+]/g, ""), wa = s.wa ? "https://wa.me/" + waNum(s.wa) + "?text=" + encodeURIComponent("Dobrý deň, mám záujem o výkup nehnuteľnosti.") : "";
    return H("vykup", "Výkup", "Vykúpime vašu nehnuteľnosť. Rýchlo a za férovú cenu.", "Potrebujete predať rýchlo? Nehnuteľnosť od vás odkúpime priamo, bez čakania na kupujúceho.") +
      '<div class="vyk"><div class="vyk-l">' + (typy.length ? '<div class="vyk-typy">' + typy.map(function (t) { return "<span>" + esc(t) + "</span>"; }).join("") + "</div>" : "") +
        (vyh.length ? '<ul class="vyk-vyh">' + vyh.map(function (t) { return "<li>" + IC.ok + "<span>" + esc(t) + "</span></li>"; }).join("") + "</ul>" : "") +
        '<div class="btns">' + (tel ? '<a class="btn" href="tel:' + esc(tel) + '">' + IC.tel + "Zavolať</a>" : "") + (wa ? '<a class="btn gh" href="' + esc(wa) + '" target="_blank" rel="noopener">' + IC.wa + "Napísať na WhatsApp</a>" : "") +
        (!tel && !wa ? '<button type="button" class="btn" data-go="kontakt">Ozvite sa mi</button>' : "") + "</div></div>" +
      (kr.length ? '<ol class="vyk-kroky">' + kr.map(function (t, i) { return "<li><b>" + (i + 1) + "</b><span>" + esc(t) + "</span></li>"; }).join("") + "</ol>" : "") + "</div>";
  },
  lokality: function (P) {
    var hd = H("lokality", "Lokality", "Lokality, ktoré poznám", "Kde v regióne sa oplatí bývať a čo ktorá obec ponúka.");
    if (!W.S.loc.length) return W.editor ? hd + '<p class="sample">Doplň obce a štvrte, ktoré dobre poznáš. Otvor nastavenie sekcie ceruzkou v časti Sekcie. Kým ich nevyplníš, na verejnom webe sa sekcia nezobrazí.</p>' : "";
    return hd + '<div class="locs">' + W.S.loc.map(function (l, i) {
      return '<div class="loc">' + (l.img ? '<div class="media">' + img(l.img, l.n) + "</div>" : "") + '<div class="in"><h3 ' + ed("loc." + i + ".n", 1) + ">" + esc(l.n) + "</h3><p " + ed("loc." + i + ".t") + ">" + esc(l.t) + '</p><div class="params">' +
        String(l.g || "").split(",").map(function (x) { return x.trim(); }).filter(Boolean).map(function (g) { return "<span>" + esc(g) + "</span>"; }).join("") + '</div>' + (ZOZ().some(function (x) { return rovnakaObec(obecX(x), l.n); }) ? '<button type="button" class="bk" data-hfo="' + esc(l.n) + '" style="margin-top:6px">Ponuky v lokalite →</button>' : '<button type="button" class="bk" data-go="' + (W.S.on.strazca ? "strazca" : "kontakt") + '" style="margin-top:6px">Hľadáte tu? Napíšte mi →</button>') + "</div></div>";
    }).join("") + "</div>";
  },
  video: function (P) {
    var s = W.S, u = url(s.video.url), M = window.TYPEK_MEDIA, emb = "";
    if (u && M && !W.editor) { try { emb = M.htmlVidea(u); } catch (e) { emb = ""; } }
    var inner = '<div class="media wide">' + aiImg("dom-obyvacka", "") + '<div class="play"><span>' + IC.play + "</span></div></div>";
    return '<div class="hd"><span class="eb">Video</span><h2 ' + ed("video.title", 1) + ">" + esc(s.video.title) + "</h2><p " + ed("video.text") + ">" + esc(s.video.text) + "</p></div>" +
      (emb ? '<div class="vid-emb">' + emb + "</div>" : u ? '<a class="vid" href="' + esc(u) + '" target="_blank" rel="noopener" aria-label="Prehrať video">' + inner + "</a>" : '<div class="vid">' + inner + "</div>") +
      (W.editor ? '<p class="sample">' + (u ? "Na zverejnenom webe sa video prehrá priamo na stránke." : "Vlož odkaz na video z YouTube alebo Vimeo v nastavení sekcie.") + "</p>" : "");
  },
  fotka: function (P) { var s = W.S; return (s.img.title || W.EDIT ? '<div class="hd"><span class="eb">Fotka</span><h2 ' + ed("img.title", 1) + ">" + esc(s.img.title) + "</h2></div>" : "") + '<figure><div class="media wide">' + (s.img.src ? img(s.img.src, s.img.cap) : aiImg("mesto-letecky", s.img.cap)) + "</div>" + (s.img.cap || W.EDIT ? "<figcaption " + ed("img.cap") + ">" + esc(s.img.cap) + "</figcaption>" : "") + "</figure>"; },
  ocenenie: function () {
    var s = W.S, f = "odhad", VF = W.VF, fvv = W.FV[f] || {};
    var form = W.DONE[f] ? '<div class="done"><b>Ďakujem, mám všetko potrebné</b><p>Do 24 hodín vám pošlem odhad ceny. Ak budem potrebovať niečo doplniť, zavolám vám.</p><button type="button" class="qback" data-again="' + f + '">Poslať ďalšiu nehnuteľnosť</button></div>'
      : '<div class="vf" data-form="' + f + '"><div><span class="lbl">Typ nehnuteľnosti</span><div class="wchips">' + ["Byt", "Dom", "Pozemok", "Chata"].map(function (t) { return '<button type="button" class="wchip' + (VF.typ === t ? " on" : "") + '" data-vt="' + t + '" aria-pressed="' + (VF.typ === t) + '">' + t + "</button>"; }).join("") + "</div></div>" +
        inp(f, "adresa", "Adresa alebo obec") +
        '<div class="two">' + inp(f, "vymera", "Výmera v m²", "number") + (VF.typ === "Pozemok" ? inp(f, "siete", "Siete pri pozemku") : '<select class="fld" name="izby" aria-label="Počet izieb">' + ["Počet izieb", "1", "2", "3", "4", "5 a viac"].map(function (o, i) { return '<option value="' + (i ? o : "") + '"' + (fvv.izby === o ? " selected" : "") + ">" + o + "</option>"; }).join("") + "</select>") + "</div>" +
        (VF.typ !== "Pozemok" ? '<div><span class="lbl">Stav</span><div class="wchips">' + ["Pôvodný", "Po rekonštrukcii", "Novostavba"].map(function (t) { return '<button type="button" class="wchip' + (VF.stav === t ? " on" : "") + '" data-vs="' + t + '" aria-pressed="' + (VF.stav === t) + '">' + t + "</button>"; }).join("") + "</div></div>" : "") +
        '<div class="two">' + inp(f, "meno", "Meno") + inp(f, "kontakt", "Telefón alebo e-mail") + "</div>" + errMsg(f) +
        '<button type="button" class="btn" data-send="' + f + '" style="justify-self:start">Chcem odhad ceny</button></div>';
    return '<div class="val"><div class="vt"><span class="eb" style="color:inherit">Odhad ceny zadarmo</span><h2 style="margin-top:10px" ' + ed("val.title", 1) + ">" + esc(s.val.title) + "</h2><p " + ed("val.text") + ">" + esc(s.val.text) + "</p>" +
      (s.val.krokyOn && riadky(s.val.kroky).length ? '<ol class="vkroky">' + riadky(s.val.kroky).slice(0, 5).map(function (t, i) { return "<li><b>" + (i + 1) + "</b><span>" + esc(t) + "</span></li>"; }).join("") + "</ol>"
        : "<ul><li>Cena podľa skutočných predajov v okolí</li><li>Odpoveď do 24 hodín</li><li>Nezáväzne, bez povinnosti predať</li></ul>") + "</div>" + form + "</div>";
  },
  callback: function () {
    var s = W.S, f = "callback", C = W.CBT;
    return '<div class="cb"><div><h2 ' + ed("cb.title", 1) + ">" + esc(s.cb.title) + "</h2><p " + ed("cb.text") + ">" + esc(s.cb.text) + "</p></div>" +
      (W.DONE[f] ? '<div class="done"><b>Zavolám vám</b><p>' + esc(C === "Čo najskôr" ? "Ozvem sa vám čo najskôr." : "Zavolám vám " + C.toLowerCase() + ".") + '</p><button type="button" class="qback" data-again="' + f + '">Zmeniť číslo alebo čas</button></div>'
        : '<div class="cbf" data-form="' + f + '"><div class="wchips">' + ["Čo najskôr", "Dopoludnia", "Popoludní", "Večer"].map(function (t) { return '<button type="button" class="wchip' + (C === t ? " on" : "") + '" data-cbt="' + t + '" aria-pressed="' + (C === t) + '">' + t + "</button>"; }).join("") + "</div>" +
          '<div class="row3">' + inp(f, "kontakt", "Vaše telefónne číslo", "tel") + '<button type="button" class="btn" data-send="' + f + '">Zavolajte mi</button></div>' + errMsg(f) + "</div>") + "</div>";
  },
  recenzie: function () {
    var s = W.S, g = url(s.rev.google), r = rec();
    var gr = gRating();
    var top = g || gr ? '<div class="gbar"><span class="g"><i>G</i>' + (gr ? gr.v + " z 5" + (gr.n ? " · " + recTxt(gr.n) + " na Google" : " na Google") : r ? "Priemer " + avg() + " z 5 · " + r.pocet + (r.pocet === 1 ? " recenzia" : r.pocet < 5 ? " recenzie" : " recenzií") : "Hodnotenia na Google") + "</span>" + (g ? '<a href="' + esc(g) + '" target="_blank" rel="noopener">Recenzie na Google →</a>' : "") + "</div>" : "";
    var cards = r ? '<div class="revs">' + r.zoznam.slice(0, 6).map(function (x) { var n = Math.max(0, Math.min(5, +x.hodnotenie || 0)); return '<div class="rev"><span class="stars" aria-label="' + n + ' z 5">' + "★★★★★".slice(0, n) + "☆☆☆☆☆".slice(0, 5 - n) + "</span>" + (x.text ? "<p>" + esc(x.text) + "</p>" : "") + "<small>" + esc(x.meno) + "</small></div>"; }).join("") + "</div>" : "";
    if (!r && !g && !gr) return W.editor ? H("recenzie", "Recenzie", "Čo hovoria klienti") + '<p class="sample">Zatiaľ nemáš schválené recenzie. Požiadaj klientov v aplikácii v sekcii Recenzie. Na verejnom webe sa sekcia bez recenzií nezobrazí.</p>' : "";
    return H("recenzie", "Recenzie", "Čo hovoria klienti") + top + cards;
  },
  obhliadka: function () {
    var s = W.S, f = "obhliadka", BK = W.BK, ds = days(), times = String(s.book.times || "").split(",").map(function (x) { return x.trim(); }).filter(Boolean), L = ZOZ();
    if (!times.length) times = DEF.book.times.split(", ");
    if (!L.length) return "";
    if (BK.l >= L.length) BK.l = 0; if (BK.d >= ds.length) BK.d = 0;
    var d = ds[BK.d], when = DN[d.getDay()] + " " + d.getDate() + ". " + (d.getMonth() + 1) + ".", body;
    if (W.DONE[f]) body = '<div class="done"><b>Ďakujem, termín mám zapísaný</b><p>' + esc(L[BK.l].t) + (L[BK.l].l ? ", " + esc(L[BK.l].l) : "") + '</p><p class="num">' + when + " o " + esc(BK.t) + '</p><p class="muted" style="font-size:14px">Obhliadku vám potvrdím telefonicky alebo SMS.</p><button type="button" class="qback" data-again="' + f + '">Zmeniť termín</button></div>';
    else body = '<div data-form="' + f + '" style="display:grid;gap:20px"><div><span class="lbl">Nehnuteľnosť</span><select class="fld" data-bl aria-label="Nehnuteľnosť">' + L.map(function (x, i) { return '<option value="' + i + '"' + (i === BK.l ? " selected" : "") + ">" + esc(x.t) + (x.l ? " – " + esc(x.l) : "") + "</option>"; }).join("") + "</select></div>" +
      '<div><span class="lbl">Deň</span><div class="days">' + ds.map(function (x, i) { return '<button type="button" class="day' + (BK.d === i ? " on" : "") + '" data-bd="' + i + '" aria-pressed="' + (BK.d === i) + '"><small>' + DN[x.getDay()] + "</small><b>" + x.getDate() + ".</b><small>" + (x.getMonth() + 1) + ".</small></button>"; }).join("") + "</div></div>" +
      '<div><span class="lbl">Čas</span><div class="slots">' + times.map(function (t) { return '<button type="button" class="slot' + (BK.t === t ? " on" : "") + '" data-bt="' + esc(t) + '" aria-pressed="' + (BK.t === t) + '">' + esc(t) + "</button>"; }).join("") + "</div></div>" +
      '<div class="two">' + inp(f, "meno", "Meno") + inp(f, "kontakt", "Telefón", "tel") + "</div>" + errMsg(f) +
      '<div class="bfoot"><span class="muted num" style="font-size:14.5px">' + (BK.t ? when + " o " + esc(BK.t) : "Vyberte si čas obhliadky") + '</span><button type="button" class="btn" data-send="' + f + '">Chcem obhliadku</button></div></div>';
    return '<div class="hd"><span class="eb">Obhliadka</span><h2 ' + ed("heads.obhliadka.h", 1) + ">" + esc(head("obhliadka", "h", "Dohodnite si obhliadku")) + "</h2><p " + ed("book.text") + ">" + esc(s.book.text) + '</p></div><div class="book">' + body + "</div>";
  },
  stiahnut: function () {
    var s = W.S, f = "ebook", u = W.DLURL || (s.dl.url ? url(s.dl.url) : "");
    var obal = String(s.dl.img || "").trim();
    return '<div class="dl">' + (obal ? '<div class="cover cover-img"><img src="' + esc(obal) + '" alt="Obálka: ' + esc(s.dl.title) + '" loading="lazy"></div>' : '<div class="cover"><small>E-BOOK</small><b>' + esc(s.dl.title) + "</b><span>" + esc(s.name) + "</span></div>") + '<div><span class="eb">Na stiahnutie zadarmo</span><h2 class="h2" style="margin:10px 0 14px" ' + ed("dl.title", 1) + ">" + esc(s.dl.title) + '</h2><p class="muted" ' + ed("dl.desc") + ">" + esc(s.dl.desc) + "</p>" +
      (W.DONE[f] ? '<div class="done" style="margin-top:20px"><b>Ďakujem, e-book je váš</b>' + (u ? '<p><a class="btn" href="' + esc(u) + '" target="_blank" rel="noopener" download>Stiahnuť ' + esc(s.dl.file || "e-book") + "</a></p>" : "<p>Pošlem vám ho na e-mail.</p>") + "</div>"
        : '<div class="dlf" data-form="' + f + '">' + inp(f, "kontakt", "Váš e-mail", "email") + '<button type="button" class="btn" data-send="' + f + '">' + esc(s.dl.btn || "Stiahnuť") + "</button>" +
          (s.dl.news ? '<label class="dlnews"><input type="checkbox" name="novinky"' + ((W.FV[f] || {}).novinky ? " checked" : "") + "><span>" + esc(s.dl.newsTx || DEF.dl.newsTx) + " (nepovinné)</span></label>" : "") + "</div>" + errMsg(f)) + "</div></div>";
  },
  faq: function () {
    var L = W.S.faq.map(function (x, i) { return [x, i]; }).filter(function (x) { return x[0].q; });
    if (!L.length) return "";
    return H("faq", "Časté otázky", "Na čo sa ľudia najčastejšie pýtajú") + '<div class="faq">' + L.map(function (x) {
      return "<details" + (W.EDIT ? " open" : "") + "><summary><span " + ed("faq." + x[1] + ".q", 1) + ">" + esc(x[0].q) + "</span></summary><div " + ed("faq." + x[1] + ".a") + ">" + paras(x[0].a) + "</div></details>";
    }).join("") + "</div>";
  },
  dotaznik: function () {
    var s = W.S, f = "dotaznik", Q = W.Q, b;
    if (Q.step < QS.length) { var q = QS[Q.step]; b = '<span class="eb">Otázka ' + (Q.step + 1) + " z " + QS.length + "</span><h3>" + q[0] + '</h3><div class="opts">' + q[1].map(function (v) { return '<button type="button" class="opt" data-qa="' + esc(v) + '">' + v + "</button>"; }).join("") + "</div>" + (Q.step ? '<button type="button" class="qback" data-qback>← Späť</button>' : ""); }
    else if (!W.DONE[f]) b = '<span class="eb">Posledný krok</span><h3>Kam sa vám môžem ozvať?</h3><div class="qsum">' + Q.a.map(function (v) { return "<span>" + esc(v) + "</span>"; }).join("") + '</div><div class="qform" data-form="' + f + '">' + inp(f, "meno", "Meno") + inp(f, "kontakt", "Telefón alebo e-mail") + errMsg(f) + '<button type="button" class="btn" data-send="' + f + '" style="justify-self:start">Odoslať</button></div><button type="button" class="qback" data-qback>← Späť</button>';
    else b = "<h3>Ďakujem, ozvem sa vám do 24 hodín.</h3><p class=\"muted\">" + esc(s.name) + (s.phone ? ", " + esc(s.phone) : "") + '</p><button type="button" class="qback" data-qreset>Vyplniť znova</button>';
    var pr = W.DONE[f] ? 100 : (Q.step / (QS.length + 1)) * 100;
    return '<div class="hd"><span class="eb">Dotazník</span><h2 ' + ed("form.title", 1) + ">" + esc(s.form.title) + "</h2><p " + ed("form.text") + ">" + esc(s.form.text) + '</p></div><div class="quiz"><div class="prog"><i style="width:' + pr + '%"></i></div>' + b + "</div>";
  },
  hypoteka: function () { return H("hypoteka", "Hypotéka", "Koľko budete splácať?", "Posuňte cenu a dobu splácania a hneď uvidíte orientačnú splátku.") + calcHtml(150000); },
  clanok: function (P) { var s = W.S, u = url(s.post.url); return '<div class="post"><div class="media">' + aiImg("byt-obyvacka", "", true) + '</div><div><span class="eb">Článok mesiaca</span><h3 ' + ed("post.title", 1) + ">" + esc(s.post.title) + '</h3><p class="muted" ' + ed("post.text") + ">" + esc(s.post.text) + "</p>" + (u ? '<a class="more" href="' + esc(u) + '" target="_blank" rel="noopener">Čítať článok →</a>' : "") + "</div></div>"; },
  kontakt: function () {
    var s = W.S, f = "kontakt", w = s.wa ? '<a href="https://wa.me/' + waNum(s.wa) + '" target="_blank" rel="noopener"><small>WhatsApp</small><b class="num">' + esc(s.wa) + "</b></a>" : "";
    var kf = foto2() || fotoMaklera() || fotoUkazka();
    return '<div class="contact"><div>' + (kf ? '<div class="kfoto"><span class="mono"><img src="' + esc(kf) + '" alt="' + esc(s.name) + '" loading="lazy"></span><div><b>' + esc(s.name) + '</b><span class="muted">' + esc(s.office || (zena() ? "Realitná maklérka" : "Realitný maklér")) + "</span></div></div>" : "") + '<span class="eb">Kontakt</span><h2 class="h2" style="margin-top:10px" ' + ed("heads.kontakt.h", 1) + ">" + esc(head("kontakt", "h", "Zavolajte mi, poradím vám.")) + "</h2>" +
      '<div class="clist">' + (s.phone ? '<a href="tel:' + esc(String(s.phone).replace(/[^\d+]/g, "")) + '"><small>Telefón</small><b class="num">' + esc(s.phone) + "</b></a>" : "") + w + (s.email ? '<a href="mailto:' + esc(s.email) + '"><small>E-mail</small><b>' + esc(s.email) + "</b></a>" : "") +
      (s.addr && s.kava ? '<a href="https://www.google.com/maps/search/?api=1&amp;query=' + encodeURIComponent(s.addr) + '" target="_blank" rel="noopener" class="cl-ik">' + IC.kava + "<small>Káva v kancelárii</small><b>" + esc(s.addr) + "</b></a>" : s.addr ? '<a href="https://www.google.com/maps/search/?api=1&amp;query=' + encodeURIComponent(s.addr) + '" target="_blank" rel="noopener"><small>Kancelária</small><b>' + esc(s.addr) + "</b></a>" : "") +
      (s.online ? '<button type="button" class="cl-ik" data-online>' + IC.video + "<small>Online hovor</small><b>Dohodnúť termín →</b></button>" : "") +
      (s.addr ? "" : "<div><small>Pôsobím</small><b>" + esc(s.area) + "</b></div>") + "</div>" + (s.hours ? '<p class="khod"><b>Otváracie hodiny:</b> ' + esc(s.hours) + "</p>" : "") + socRow() + "</div>" +
      (W.DONE[f] ? '<div class="done" style="align-self:start"><b>Správa je odoslaná</b><p>Ďakujem, ozvem sa vám čo najskôr.</p><button type="button" class="qback" data-again="' + f + '">Napísať ďalšiu správu</button></div>'
        : '<div class="cform" data-form="' + f + '">' + inp(f, "meno", "Meno") + inp(f, "kontakt", "Telefón alebo e-mail") + '<textarea class="fld" name="sprava" placeholder="Čo potrebujete?" aria-label="Čo potrebujete?">' + fv(f, "sprava") + "</textarea>" + errMsg(f) + '<button class="btn" type="button" data-send="' + f + '" style="justify-self:start">Odoslať správu</button></div>') + "</div>";
  }
};
function svcX() { var L = String(W.S.svcX || "").split(",").map(function (x) { return x.trim(); }).filter(Boolean); return L.length ? '<div class="svcx"><span class="lbl">Doplnkové služby</span><div class="svcx-l">' + L.map(function (t) { return "<span>" + esc(t) + "</span>"; }).join("") + "</div></div>" : ""; }
function riadky(t) { return String(t || "").split(/\n/).map(function (x) { return x.trim(); }).filter(Boolean); }
function rCustom(id) {
  var c = W.S.custom[id], has = !!c.img;
  return '<div class="custom' + (has ? " img" : "") + '">' + (has ? '<div class="media">' + img(c.img, "") + "</div>" : "") + '<div class="txt"><h2 class="h2" style="margin-bottom:16px" ' + ed("custom." + id + ".title", 1) + ">" + esc(c.title) + "</h2><div " + ed("custom." + id + ".text") + ">" + paras(c.text) + "</div>" +
    (c.btn ? '<div class="btns">' + (url(c.link) ? '<a class="btn" href="' + esc(url(c.link)) + '" target="_blank" rel="noopener">' + esc(c.btn) + "</a>" : '<span class="btn">' + esc(c.btn) + "</span>") + "</div>" : "") + "</div></div>";
}

/* ================================================================ detail ponuky */
function parametre(p) {
  var out = [], ch = [["plocha_uzitkova", "Úžitková plocha", " m²"], ["plocha_zastavana", "Zastavaná plocha", " m²"], ["plocha_pozemku", "Pozemok", " m²"], ["izby", "Izby", ""], ["poschodie", "Poschodie", ""], ["rok_vystavby", "Rok výstavby", ""]];
  ch.forEach(function (k) { var v = p[k[0]]; if (v === null || v === undefined || v === "") return; if (k[0] === "poschodie") v = Number(v) === 0 ? "prízemie" : v + (p.pocet_podlazi ? " z " + p.pocet_podlazi : ""); else v = (k[0] === "rok_vystavby" || k[0] === "izby" ? String(v) : NF.format(v)) + k[2]; out.push([k[1], esc(v)]); });
  [["stav_objektu", "Stav"], ["konstrukcia", "Konštrukcia"], ["vlastnictvo", "Vlastníctvo"], ["kurenie", "Kúrenie"]].forEach(function (k) { if (p[k[0]]) out.push([k[1], esc(p[k[0]])]); });
  if (p.energ_certifikat) out.push(["Energetický certifikát", '<span class="energ">' + esc(String(p.energ_certifikat).charAt(0)) + "</span>" + esc(p.energ_certifikat)]);
  if (p.cena_energie) out.push(["Energie", esc(p.cena_energie)]);
  return out;
}
function galeria(x, i, P) {
  if (x.foto && x.foto.length) return x.foto.map(function (u) { return img(u, x.t); });
  if (x.raw) return [bezFotky()];
  return (AI[x.k] || AI.dom).map(function (n) { return aiImg(n, x.t); });
}
function detail(i, P) {
  var s = W.S, Z = ZOZ(), x = Z[i]; if (!x) return "";
  var p = x.raw || {}, imgs = galeria(x, i, P), pv = x.raw ? parametre(p) : x.a.map(function (v, j) { return [["Plocha", "Izby", "Ďalšie"][j] || "", esc(v)]; });
  var M = window.TYPEK_MEDIA, media = "";
  if (M && !W.editor && x.raw) { try { media = M.htmlVsetko(p, {}); } catch (e) { media = ""; } }
  var mapa = p.lat && p.lon ? '<div class="map"><iframe title="Poloha na mape" loading="lazy" src="https://www.openstreetmap.org/export/embed.html?bbox=' + (p.lon - 0.012) + "," + (p.lat - 0.007) + "," + (p.lon + 0.012) + "," + (p.lat + 0.007) + "&layer=mapnik&marker=" + p.lat + "," + p.lon + '"></iframe></div>' : "";
  var qMap = encodeURIComponent([p.ulica, p.cast_obce, p.obec || x.l].filter(Boolean).join(", "));
  var wa = waPonuka(x), popis = x.raw ? paras(p.popis || p.intro) : "<p>" + esc(x.d) + "</p>";
  return '<div class="w det" id="detail"><button type="button" class="crumb" data-home="ponuky">← Späť na ponuky</button>' +
    '<div class="gal' + (imgs.length < 3 ? " gal-malo" : "") + '">' + imgs.slice(0, 5).map(function (h, j) { return '<button type="button" data-lb="' + j + '" aria-label="Zväčšiť fotku ' + (j + 1) + '">' + h + (j === Math.min(4, imgs.length - 1) && imgs.length > 1 ? '<span class="all">Všetky fotky (' + imgs.length + ")</span>" : "") + "</button>"; }).join("") + "</div>" +
    '<div class="dcols"><div class="dmain"><div><span class="eb">' + esc(x.l) + '</span><h1 style="margin-top:8px">' + esc(x.t) + "</h1>" + (stitok(x, 1) ? '<div style="position:relative;height:30px;margin-top:10px">' + stitok(x, 1).replace('class="tag', 'class="tag tag-inline') + "</div>" : "") +
    '<div class="params" style="margin-top:12px">' + x.a.map(function (v) { return "<span>" + esc(v) + "</span>"; }).join("") + "</div></div>" +
    '<div class="txt">' + popis + "</div>" +
    (pv.length ? '<div><h2>Parametre</h2><div class="ptable">' + pv.map(function (k) { return "<div><small>" + k[0] + "</small><b>" + k[1] + "</b></div>"; }).join("") + "</div></div>" : "") +
    (media ? '<div class="det-media">' + media + "</div>" : "") +
    '<div><h2>Kde to je</h2>' + mapa + '<a class="bk" href="https://www.google.com/maps/search/?api=1&amp;query=' + qMap + '" target="_blank" rel="noopener" style="display:inline-block;margin-top:10px">Otvoriť v Google Mapách →</a></div>' +
    (!x.rent && !x.bezCeny && x.stav !== "predane" ? "<div><h2>Koľko by ste splácali</h2>" + calcHtml(x.p) + "</div>" : "") + "</div>" +
    '<aside class="dside"><span class="muted">' + (x.rent ? "Nájom" : "Cena") + '</span><div class="price num">' + esc(cenaTxt(x)) + "</div>" +
    (x.stav === "predane" ? '<p class="muted">Táto nehnuteľnosť je už predaná. Hľadáte podobnú? Napíšte mi.</p><button type="button" class="btn" data-home="' + (s.on.strazca ? "strazca" : "kontakt") + '">Hľadám podobnú</button>'
      : (s.on.obhliadka ? '<button type="button" class="btn" data-book="' + i + '">Dohodnúť obhliadku</button>' : '<button type="button" class="btn" data-home="' + (s.on.kontakt ? "kontakt" : s.on.callback ? "callback" : "kontakt") + '" data-zaujem="' + i + '">Mám záujem</button>')) +
    (wa && x.stav !== "predane" ? '<a class="btn wa-btn" href="' + esc(wa) + '" target="_blank" rel="noopener">' + IC.wa + "Napísať cez WhatsApp</a>" : "") +
    '<div class="mini"><button type="button" class="btn gh" data-share="' + i + '">Zdieľať</button>' + (x.id ? '<a class="btn gh" href="letak.html?id=' + x.id + '" target="_blank" rel="noopener">Leták</a>' : '<button type="button" class="btn gh" data-demo="letak">Leták</button>') + "</div>" +
    '<div class="agent">' + av() + "<div><b>" + esc(s.name) + '</b><div class="muted num" style="font-size:14px">' + esc(s.phone) + "</div></div></div></aside></div></div>";
}

/* ================================================================ ochrana údajov */
/* voliteľné meracie nástroje makléra (Google Analytics, Meta Pixel) – len s overeným tvarom ID, načítajú sa až po súhlase */
function trk() {
  var g = W.S.gdpr || {}, ga = String(g.gaId || "").trim().toUpperCase(), fb = String(g.fbId || "").trim().replace(/\s+/g, "");
  ga = /^G-[A-Z0-9]{4,14}$/.test(ga) ? ga : ""; fb = /^\d{8,20}$/.test(fb) ? fb : "";
  return { ga: ga, fb: fb, any: !!(ga || fb) };
}
function gdprPage() {
  var s = W.S, g = Object.assign({}, s.gdpr, { ga: s.gdpr.ga || !!trk().ga, fbp: s.gdpr.fbp || !!trk().fb }), who = esc(g.who || s.name), mail = esc(g.mail || s.email), rec2 = ["poskytovateľ webu a realitného softvéru Realitný týpek", "poskytovateľ e-mailových služieb"];
  if (g.ga) rec2.push("Google (služba Google Analytics na meranie návštevnosti)"); if (g.fbp) rec2.push("Meta Platforms (Meta Pixel na meranie reklamy)");
  return '<div class="w"><div class="txt legal" style="max-width:760px;padding-block:24px 40px"><button type="button" class="crumb" data-home="top">← Späť na web</button><span class="eb" style="display:block">Ochrana osobných údajov</span><h2 class="h2" style="margin:10px 0 8px">Ako spracúvame vaše osobné údaje</h2>' +
    "<h3>Prevádzkovateľ</h3><p>" + who + (g.ico ? ", IČO " + esc(g.ico) : "") + (g.addr ? ", " + esc(g.addr) : "") + ". Kontakt pre otázky k osobným údajom: " + mail + (s.phone ? ", " + esc(s.phone) : "") + ".</p>" +
    "<h3>Aké údaje a na čo</h3><p>Spracúvame meno, telefón, e-mail a údaje o nehnuteľnosti, ktoré nám pošlete cez formuláre na tomto webe. Používame ich na odpoveď na vašu požiadavku, prípravu ponuky alebo odhadu ceny, dohodnutie obhliadky a na plnenie sprostredkovateľskej zmluvy.</p>" +
    "<h3>Právny základ</h3><ul><li>rokovanie o zmluve a jej plnenie (čl. 6 ods. 1 písm. b GDPR),</li><li>váš súhlas pri strážcovi ponúk, e-booku a analytických cookies (čl. 6 ods. 1 písm. a GDPR),</li><li>zákonné povinnosti vrátane overenia klienta podľa zákona č. 297/2008 Z. z. (čl. 6 ods. 1 písm. c GDPR).</li></ul>" +
    "<h3>Ako dlho</h3><p>Údaje z dopytov uchovávame len po dobu potrebnú na vybavenie požiadavky. Údaje zo zmlúv uchovávame po dobu, ktorú určuje zákon. Súhlas môžete kedykoľvek odvolať.</p>" +
    "<h3>Komu ich poskytujeme</h3><ul>" + rec2.map(function (r) { return "<li>" + r + "</li>"; }).join("") + "</ul>" +
    "<h3>Vaše práva</h3><p>Máte právo na prístup k údajom, ich opravu, vymazanie, obmedzenie spracúvania, prenosnosť a právo namietať. Ak máte pocit, že s údajmi nezaobchádzame správne, môžete podať sťažnosť na Úrad na ochranu osobných údajov Slovenskej republiky.</p>" +
    "<h3>Cookies</h3><p>Nevyhnutné cookies zabezpečujú fungovanie webu a nepotrebujú súhlas." + (g.ga ? " Analytické cookies (Google Analytics) používame len s vaším súhlasom." : "") + (g.fbp ? " Marketingové cookies (Meta Pixel) používame len s vaším súhlasom." : "") + " Voľbu môžete zmeniť cez odkaz Nastavenie cookies v pätičke.</p></div></div>";
}

/* ================================================================ vykreslenie */
function fFirma() {
  var s = W.S, g = s.gdpr || {}; if (!s.footFirma) return "";
  var a = [g.who && esc(g.who), g.ico && "IČO " + esc(g.ico), g.addr && esc(g.addr)].filter(Boolean), h = String(s.hours || "").trim();
  return a.length || h ? '<p class="ffirma">' + (a.length ? "<span>" + a.join(" · ") + "</span>" : "") + (h ? "<span><b>Otváracie hodiny:</b> " + esc(h) + "</span>" : "") + "</p>" : W.editor ? '<p class="ffirma sample">Údaje firmy doplň v záložke Maklér v časti Ochrana údajov a otváracie hodiny v Kontaktoch.</p>' : "";
}
function bubBg(P) { var a = W.S.bub === "plne" ? 1 : W.S.bub === "sklo" ? 0.6 : 0.8, c = h2r(P.bg); return "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + a + ")"; }
function render() {
  var root = W.root; if (!root) return;
  // titulok karty prehliadača (a pre Google): na detaile ponuky jej názov, inak titulok webu
  if (!W.editor && W.titulDomov) { var dx = W.PAGE.v === "detail" ? ZOZ()[W.PAGE.i] : null; document.title = dx && dx.t ? dx.t + (W.S.name ? " | " + W.S.name : "") : W.titulDomov; }
  var s = W.S, P = pal(), F = FONTS.find(function (f) { return f.id === s.font; }) || FONTS[0], st = root.style;
  var rb = s.btn === "pill" ? "999px" : s.btn === "round" ? Math.max(8, Math.round(s.r * 0.7)) + "px" : "2px";
  [["--bg", P.bg], ["--surf", P.surf], ["--fg", P.fg], ["--muted", P.muted], ["--line", P.line], ["--a", P.a], ["--on-a", P.onA], ["--at", P.at], ["--a-soft", P.soft], ["--b", P.b], ["--on-b", P.onB], ["--bt", P.bt], ["--b-soft", P.bsoft],
    ["--hc", P.hc], ["--err", P.err], ["--on-fg", P.onFg], ["--fh", F.h], ["--fb", F.b], ["--fhw", F.w], ["--fhls", F.ls], ["--r", s.r + "px"], ["--rb", rb], ["--bub", bubBg(P)], ["--bub-blur", s.bub === "plne" ? "0px" : s.bub === "sklo" ? "16px" : "10px"], ["--bub-muted", s.bub === "plne" ? P.muted : P.fg]].forEach(function (x) { st.setProperty(x[0], x[1]); });
  st.colorScheme = P.dark ? "dark" : "light";
  root.className = ["site", "t-" + s.tpl, "pg-" + W.PAGE.v, s.anim ? "anim" : "", s.anim && W.INTRO ? "intro" : "", s.btnFill === "outline" ? "bo" : "", s.ph === "frame" ? "pf" : s.ph === "shadow" ? "ps" : "", W.EDIT ? "editing" : ""].filter(Boolean).join(" ");
  var out = "", vykreslene = [];
  if (W.PAGE.v === "detail") out += detail(W.PAGE.i, P);
  else if (W.PAGE.v === "gdpr") out += gdprPage();
  else {
    out += hero(P) + cislaPas(); var i = 0;
    s.order.forEach(function (k) {
      if (!s.on[k] || (!s.custom[k] && !R[k])) return;
      var html = s.custom[k] ? rCustom(k) : R[k](P); if (!html) return;
      vykreslene.push(k);
      var alt = (["galeria", "luxus"].indexOf(s.tpl) >= 0 ? i % 2 === 1 : i % 2 === 0) && k !== "ocenenie";
      out += '<section class="s' + (alt ? " alt" : "") + '" id="s-' + esc(k) + '"><div class="w secin">' + html + "</div></section>"; i++;
    });
  }
  // v menu len sekcie, ktoré sa naozaj zobrazili (napr. Recenzie bez recenzií nie)
  if (W.PAGE.v === "home") W.SEKCIE = vykreslene;
  out = phFhd() + nav() + out;
  var aiVizual = out.indexOf(AI_BASE) >= 0;
  out += '<footer><div class="w"><span style="display:flex;flex-wrap:wrap;align-items:center;gap:6px 14px">' + (s.logo ? '<img class="logoimg" src="' + esc(s.logo) + '" alt="">' : "") + "© " + new Date().getFullYear() + " " + esc(s.name) + (s.office ? " · " + esc(s.office) : "") +
    ' · <button type="button" class="flink" data-gdpr>Ochrana osobných údajov</button>' + (s.gdpr.bar || trk().any ? ' · <button type="button" class="flink" data-ckopen>Nastavenie cookies</button>' : "") + "</span>" + socRow() + fFirma() + (aiVizual ? '<p class="ai-pozn">' + AI_NOTE + "</p>" : "") + "</div></footer>";
  var TR = trk(), ckOn = (s.gdpr.bar || TR.any) && W.CK.bar;
  if (ckOn) out += '<div class="ck-wrap"><div class="ck"><p><b>Používame cookies.</b> Nevyhnutné cookies zabezpečujú fungovanie webu.' + (s.gdpr.ga || s.gdpr.fbp || TR.any ? " S vaším súhlasom použijeme aj " + (s.gdpr.ga || TR.ga ? "analytické" + (s.gdpr.fbp || TR.fb ? " a marketingové" : "") : "marketingové") + " cookies." : "") + ' <button type="button" class="flink" data-gdpr>Viac informácií</button></p><div class="btns"><button type="button" class="btn" data-ck="vsetky">Prijať všetky</button><button type="button" class="btn gh" data-ck="nevyhnutne">Len nevyhnutné</button></div></div></div>';
  var mbTel = String(s.phone || "").replace(/[^\d+]/g, ""), mb = s.mbar && !ckOn && (mbTel || s.wa) && W.PAGE.v !== "gdpr";
  if (mb) out += '<div class="mbar-wrap"><div class="mbar">' + (mbTel ? '<a href="tel:' + esc(mbTel) + '">' + IC.tel + "Zavolať</a>" : "") + (s.wa ? '<a href="https://wa.me/' + waNum(s.wa) + '" target="_blank" rel="noopener">' + IC.wa + "WhatsApp</a>" : "") +
    '<button type="button" class="mbar-hl" data-go="' + (s.on.ocenenie ? "ocenenie" : "kontakt") + '">' + (s.on.ocenenie ? "Ocenenie zdarma" : "Napísať") + "</button></div></div>";
  if (s.wa && !ckOn) out += '<div class="wa-wrap"><a class="wa" href="https://wa.me/' + waNum(s.wa) + '" target="_blank" rel="noopener" aria-label="Napísať na WhatsApp">' + IC.wa + "<span>Napíšte mi</span></a></div>";
  root.innerHTML = out;
  root.classList.toggle("ma-mbar", !!mb);
  // pasca na roboty: pole, ktoré človek nevidí a nevyplní
  if (!W.editor) root.querySelectorAll("[data-form]").forEach(function (f) { if (!f.querySelector('[name="web_url"]')) f.insertAdjacentHTML("beforeend", '<input class="hp" type="text" name="web_url" tabindex="-1" autocomplete="off" aria-hidden="true">'); });
  calc();
  var v = root.querySelector(".hm video"); if (v) v.addEventListener("error", function () { toast("Video sa nepodarilo prehrať."); }, { once: true });
  if (window.TYPEK_MEDIA && window.TYPEK_MEDIA.napoj) { try { window.TYPEK_MEDIA.napoj(root); } catch (e) { /* nič */ } }
  pohyb(root);
  if (W.INTRO && s.anim) { countUp(root); setTimeout(function () { W.INTRO = false; root.classList.remove("intro"); }, 1600); }
  if (W.poZmene) W.poZmene();
}
function countUp(el) {
  if (PH.sys && !W.vzdyPohyb) return;
  el.querySelectorAll("[data-count]").forEach(function (b) {
    if (el === W.root && b.closest(".cisla")) return;
    var n = parseInt(b.dataset.count, 10); if (!(n > 0)) return; var t0 = performance.now(), dur = 1100, suf = b.dataset.suf || "", fin = b.textContent;
    function step(t) { var k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3); b.textContent = String(Math.round(n * e)) + suf; if (k < 1) requestAnimationFrame(step); else b.textContent = fin; }
    b.textContent = "0" + suf; requestAnimationFrame(step);
  });
}
function calc() {
  var r0 = W.root; if (!r0) return; var g = function (k) { return r0.querySelector('[data-c="' + k + '"]'); }; if (!g("p")) return;
  var p = +g("p").value, d = +g("d").value, y = +g("y").value, o = function (k) { return r0.querySelector('[data-o="' + k + '"]'); };
  var L = p * (1 - d / 100), r = (+W.S.hypo.rate || 0) / 100 / 12, n = y * 12, m = r ? L * r / (1 - Math.pow(1 + r, -n)) : L / n;
  o("p").textContent = fmt(p) + " €"; o("d").textContent = d + " %"; o("y").textContent = y + " rokov"; o("m").textContent = fmt(m) + " €";
}

/* ================================================================ správanie stránky */
var tt;
function toast(m) {
  var t = document.getElementById("wtoast");
  if (!t) { t = document.createElement("div"); t.id = "wtoast"; t.className = "wtoast"; t.setAttribute("role", "status"); document.body.appendChild(t); }
  t.textContent = m; t.hidden = false; clearTimeout(tt); tt = setTimeout(function () { t.hidden = true; }, 3200);
}
function goSec(k) {
  function run() { var el = document.getElementById("s-" + k) || W.root; el.scrollIntoView({ behavior: "smooth", block: "start" }); }
  if (W.PAGE.v !== "home") { W.PAGE = { v: "home" }; render(); setHash(""); requestAnimationFrame(run); } else run();
}
function setHash(h, nove) { if (W.editor) return; try { history[nove ? "pushState" : "replaceState"]({ typek: h || "" }, "", location.pathname + location.search + (h ? "#" + h : "")); return; } catch (e) { /* nič */ } try { history.replaceState(null, "", location.pathname + location.search + (h ? "#" + h : "")); } catch (e) { /* nič */ } }
function otvorDetail(i) { var bol = W.PAGE.v === "detail"; W.PAGE = { v: "detail", i: i }; render(); var x = ZOZ()[i]; if (x && x.id) setHash("p-" + x.id, !bol); if (x && W.poDetaile) W.poDetaile(x); W.root.scrollIntoView({ behavior: "smooth", block: "start" }); }
function send(f) {
  var box = W.root.querySelector('[data-form="' + f + '"]'), v = {};
  if (box) box.querySelectorAll("[name]").forEach(function (e) { v[e.name] = e.type === "checkbox" ? (e.checked ? "áno" : "") : String(e.value || "").trim(); });
  var k = v.kontakt || "", mailOnly = f === "ebook", err = "";
  if (f === "obhliadka" && !W.BK.t) err = "Vyberte si čas obhliadky.";
  else if (!k) err = mailOnly ? "Doplňte e-mail." : f === "callback" ? "Doplňte telefónne číslo." : "Doplňte telefón alebo e-mail.";
  else if (mailOnly && !/^\S+@\S+\.\S+$/.test(k)) err = "Skontrolujte e-mailovú adresu.";
  else if (!/^\S+@\S+\.\S+$/.test(k) && String(k).replace(/\D/g, "").length < 9) err = "Skontrolujte telefón alebo e-mail.";
  if (err) { W.ERR[f] = err; render(); var x = W.root.querySelector('[data-form="' + f + '"] [name="kontakt"]'); if (x) x.focus(); return; }
  var Z = ZOZ(), ds = days(), dd = ds[W.BK.d] || ds[0], Wt = W.Wt, VF = W.VF, ponuka = null, dopyt = null, co = "";
  if (f === "odhad") co = [VF.typ, v.adresa, v.vymera && v.vymera + " m²", v.izby && v.izby + " izby", v.siete, VF.typ !== "Pozemok" && VF.stav].filter(Boolean).join(", ");
  if (f === "strazca") { co = (Wt.typ.join(", ") || "Všetko") + " · " + (Wt.place || "celý región") + " · do " + fmt(Wt.max) + " €";
    var mapa = { Byt: "byty", Dom: "domy", Pozemok: "pozemky" };
    dopyt = { kategorie: Wt.typ.map(function (t) { return mapa[t]; }).filter(Boolean), obce: Wt.place ? [Wt.place] : [], cena_do: Wt.max, prenajom: Wt.typ.indexOf("Prenájom") >= 0 && Wt.typ.length === 1 }; }
  if (f === "obhliadka") { var px = Z[W.BK.l]; ponuka = px && px.id || null; co = (px ? px.t + (px.l ? ", " + px.l : "") : "") + " · " + DN[dd.getDay()] + " " + dd.getDate() + ". " + (dd.getMonth() + 1) + ". o " + W.BK.t; }
  if (f === "callback") co = "Zavolať: " + W.CBT.toLowerCase();
  if (f === "dotaznik") co = W.Q.a.join(", ");
  if (f === "ebook") co = "E-book: " + W.S.dl.title + (W.S.dl.news && v.novinky ? " · Chce dostávať tipy e-mailom" : "");
  if (f === "kontakt") co = v.sprava || "";
  if (W.PAGE.v === "detail") { var dx = Z[W.PAGE.i]; if (dx && dx.id) ponuka = dx.id; }
  if (!ponuka && f === "kontakt" && W.ZAUJEM) ponuka = W.ZAUJEM;
  var btn = box && box.querySelector("[data-send]"); if (btn) { btn.disabled = true; btn.textContent = "Odosielam…"; }
  var odo = W.odoslat ? W.odoslat({ zdroj: f, kontakt: k, meno: v.meno || "", co: co, ponuka: ponuka, dopyt: dopyt, med: v.web_url || "" }) : Promise.resolve();
  Promise.resolve(odo).then(function (r) { if (f === "ebook" && typeof r === "string" && /^https?:\/\//i.test(r)) W.DLURL = r; if (f === "kontakt") W.ZAUJEM = null; if (W.poOdoslani) { try { W.poOdoslani(f); } catch (x) { /* nič */ } } delete W.ERR[f]; W.DONE[f] = true; W.FV[f] = {}; render(); })
    .catch(function (e) { W.ERR[f] = (e && e.message) || "Správu sa nepodarilo odoslať. Skúste to znova alebo zavolajte."; render(); });
}
function share(i) {
  var x = ZOZ()[i], u = odkazPonuky(x);
  if (navigator.share && !W.editor) { navigator.share({ title: x.t, url: u }).catch(function () {}); return; }
  try { navigator.clipboard.writeText(u).then(function () { toast("Odkaz na ponuku je skopírovaný"); }, function () { toast(u); }); } catch (e) { toast(u); }
}

/* fotky na celú obrazovku */
var LB = { imgs: [], j: 0 };
function lbDlg() {
  var d = document.getElementById("wlb"); if (d) return d;
  d = document.createElement("dialog"); d.id = "wlb"; d.className = "wlb"; d.setAttribute("aria-label", "Fotky nehnuteľnosti");
  d.innerHTML = '<div class="wlb-in"><div class="wlb-top"><span id="wlbCount"></span><button type="button" data-lbx>Zavrieť</button></div><div class="wlb-img" id="wlbImg"></div><div class="wlb-nav"><button type="button" data-lbp>← Predchádzajúca</button><button type="button" data-lbn>Ďalšia →</button></div></div>';
  document.body.appendChild(d);
  d.addEventListener("click", function (e) {
    if (e.target.closest("[data-lbx]") || e.target === d) d.close();
    else if (e.target.closest("[data-lbp]")) { LB.j = (LB.j - 1 + LB.imgs.length) % LB.imgs.length; lbShow(); }
    else if (e.target.closest("[data-lbn]")) { LB.j = (LB.j + 1) % LB.imgs.length; lbShow(); }
  });
  d.addEventListener("keydown", function (e) { if (e.key === "ArrowLeft") d.querySelector("[data-lbp]").click(); if (e.key === "ArrowRight") d.querySelector("[data-lbn]").click(); });
  return d;
}
function lbShow() { document.getElementById("wlbImg").innerHTML = LB.imgs[LB.j]; document.getElementById("wlbCount").textContent = (LB.j + 1) + " / " + LB.imgs.length; }
function openLB(i, j) { var x = ZOZ()[i]; if (!x) return; LB = { imgs: galeria(x, i, pal()), j: j }; var d = lbDlg(); lbShow(); if (d.showModal) d.showModal(); }

/* ================================================================ pohyb – animácie pri skrolovaní a pohybe myšou
   Zapína ich prepínač Animácie (W.S.anim). Pri úprave textu (W.EDIT), na mobile bez myši a pri „obmedziť pohyb“
   v systéme sa vypnú tie rušivé. Obsah sa nikdy neskryje natrvalo – bez JS alebo bez podpory ostane viditeľný. */
var PH = { seen: {}, io: null, raf: 0, loop: 0, mx: 0, my: 0, cx: 0, cy: 0, fine: false, sys: false, reduce: false, napojene: false, tilt: null, mag: null };
var PH_GRIDS = ".cards,.tiles,.rows,.lux-list,.revs,.steps,.svc,.locs,.gal,.val,.faq,.facts,.cen,.vyk,.preco,.tim";
function phOk() { return !!(W.S.anim && !PH.reduce && W.root); }
function phNapoj() {
  if (PH.napojene) return; PH.napojene = true;
  var mm = function (q) { return !!(window.matchMedia && matchMedia(q).matches); };
  PH.sys = mm("(prefers-reduced-motion: reduce)");
  PH.fine = mm("(hover: hover) and (pointer: fine)");
  window.addEventListener("scroll", phScroll, { passive: true });
  window.addEventListener("resize", phScroll, { passive: true });
  if (PH.fine) document.addEventListener("pointermove", phMove, { passive: true });
}
function phIO() {
  if (PH.io || !("IntersectionObserver" in window)) return PH.io;
  PH.io = new IntersectionObserver(function (ent) {
    var vis = ent.filter(function (e) { return e.isIntersecting; }).map(function (e) { return e.target; });
    vis.sort(function (a, b) { var ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect(); return (ra.top - rb.top) || (ra.left - rb.left); });
    vis.forEach(function (el, i) { PH.io.unobserve(el); phIn(el, Math.min(i, 7) * 85); });
  }, { rootMargin: "0px 0px -9% 0px", threshold: 0 });
  return PH.io;
}
function phIn(el, d) {
  el.style.setProperty("--rd", d + "ms"); el.classList.add("rv-in");
  if (el.dataset.rk) PH.seen[el.dataset.rk] = 1;
  setTimeout(function () { el.classList.remove("rv-in"); el.removeAttribute("data-rv"); el.removeAttribute("data-rk"); el.style.removeProperty("--rd"); }, d + 1700);
}
// nadpis rozdelený na slová, ktoré vyjdú zospodu ako spod masky
function phSlova(el) {
  if (el.dataset.split) return; var n = 0;
  (function walk(node) {
    Array.prototype.slice.call(node.childNodes).forEach(function (c) {
      if (c.nodeType === 1) { if (c.tagName !== "BR") walk(c); return; }
      if (c.nodeType !== 3 || !c.nodeValue.trim()) return;
      var frag = document.createDocumentFragment();
      c.nodeValue.split(/(\s+)/).forEach(function (w) {
        if (!w) return; if (/^\s+$/.test(w)) { frag.appendChild(document.createTextNode(w)); return; }
        var o = document.createElement("span"), i = document.createElement("span"); o.className = "sl"; i.className = "sli"; i.style.setProperty("--i", n++); i.textContent = w; o.appendChild(i); frag.appendChild(o);
      });
      node.replaceChild(frag, c);
    });
  })(el);
  el.dataset.split = "1";
}
function phOznac(root) {
  var io = phIO(); if (!io) return;
  io.disconnect();   // staré prvky po prekreslení už neexistujú
  if (W.EDIT || W.PAGE.v !== "home") return;
  var vh = window.innerHeight || 800;
  root.querySelectorAll(".s").forEach(function (sec) {
    var inn = sec.querySelector(".secin"); if (!inn) return; var items = [];
    Array.prototype.forEach.call(inn.children, function (c) {
      if (c.classList.contains("hd")) { Array.prototype.forEach.call(c.children, function (h) { items.push([h, h.tagName === "H2" ? "slova" : "hore"]); }); return; }
      var g = c.matches(PH_GRIDS) ? c : c.querySelector(":scope > " + PH_GRIDS.split(",").join(",:scope > "));
      if (g && g !== c) Array.prototype.forEach.call(c.children, function (x) { if (x !== g) items.push([x, "hore"]); });
      if (g) Array.prototype.forEach.call(g.children, function (x) { items.push([x, "hore"]); });
      else items.push([c, c.classList.contains("media") || c.tagName === "FIGURE" ? "obr" : "hore"]);
    });
    items.forEach(function (it, i) {
      var el = it[0], k = sec.id + ":" + i + ":" + el.tagName; if (PH.seen[k]) return;
      if (el.getBoundingClientRect().bottom < 0) { PH.seen[k] = 1; return; }   // už prešiel nad oknom – ukáž hneď
      if (it[1] === "slova") phSlova(el);
      el.dataset.rv = it[1]; el.dataset.rk = k; io.observe(el);
    });
  });
}
function phFhd() {
  if (W.editor || !W.S.anim) return "";
  var s = W.S, tel = String(s.phone || "").replace(/[^\d+]/g, "");
  return '<div class="fhd-wrap"><div class="fprog" aria-hidden="true"></div><div class="fhd"><div class="brand" data-home="top">' + (s.logo ? '<img class="logoimg" src="' + esc(s.logo) + '" alt="' + esc(s.name) + '">' : av() + "<span>" + esc(s.name) + "</span>") + "</div>" +
    (tel ? '<a class="fhd-tel num" href="tel:' + esc(tel) + '"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/></svg>' + esc(s.phone) + "</a>" : "") +
    '<button type="button" class="btn" data-go="' + (s.on.callback ? "callback" : "kontakt") + '">Zavolajte mi</button></div></div>';
}
function pohyb(root) {
  phNapoj();
  PH.reduce = PH.sys && !W.vzdyPohyb;
  root.classList.toggle("pohyb-vzdy", PH.sys && !!W.vzdyPohyb);
  var ok = phOk();
  root.classList.toggle("mys", ok && PH.fine && !W.EDIT);
  if (!ok) return;
  // úvodný nadpis po slovách (Rodinná má zvýraznenie, tam ostáva pôvodné vysunutie)
  if (W.INTRO && !W.EDIT && W.S.tpl !== "rodinna") { var h1 = root.querySelector(".hero h1"); if (h1) phSlova(h1); }
  phOznac(root);
  phCisla(root);
  PH.tilt = PH.mag = null;
  phTick(); phApplyMouse();
}
function phCisla(root) {
  if (PH.cislaIo) PH.cislaIo.disconnect();
  var c = root.querySelector(".cisla"); if (!c || PH.cislaHotovo || W.editor || !("IntersectionObserver" in window)) return;
  PH.cislaIo = new IntersectionObserver(function (ent) { if (!ent.some(function (e) { return e.isIntersecting; })) return; PH.cislaIo.disconnect(); PH.cislaHotovo = true; countUp(c); }, { threshold: 0.5 });
  PH.cislaIo.observe(c);
}
function phScroll() { if (!PH.raf) PH.raf = requestAnimationFrame(phTick); }
function phTick() {
  PH.raf = 0; var root = W.root; if (!root || !phOk()) return;
  var r = root.getBoundingClientRect(), vh = window.innerHeight || 800, tot = r.height - vh;
  var fp = root.querySelector(".fprog"); if (fp) fp.style.setProperty("--prog", (tot > 0 ? Math.min(1, Math.max(0, -r.top / tot)) : 0).toFixed(4));
  var h = root.querySelector(".hero");
  if (h) { var hr = h.getBoundingClientRect(); h.style.setProperty("--hp", Math.min(1, Math.max(0, -hr.top / Math.max(1, hr.height))).toFixed(4)); root.classList.toggle("fhd-on", hr.bottom < 70 && r.top < 0); }
  else root.classList.toggle("fhd-on", r.top < -260);
  if (r.bottom <= vh + 4 && PH.io) root.querySelectorAll("[data-rv]:not(.rv-in)").forEach(function (el) { if (el.getBoundingClientRect().top < vh) { PH.io.unobserve(el); phIn(el, 0); } });   // koniec stránky
  root.querySelectorAll(".s .media.wide").forEach(function (m) { var b = m.getBoundingClientRect(); if (b.bottom < 0 || b.top > vh) return; m.style.setProperty("--py", (((b.top + b.height / 2) / vh) - 0.5).toFixed(4)); });
}
// myš: úvod sa jemne nakláňa za kurzorom, karty sa natáčajú s odleskom, tlačidlá sa „prilepia“
function phMove(e) {
  var root = W.root; if (!root || !root.classList.contains("mys")) return;
  var h = root.querySelector(".hero");
  if (h) { var hr = h.getBoundingClientRect(); if (e.clientY < hr.bottom + 40) { PH.mx = Math.max(-1, Math.min(1, (e.clientX - hr.left) / hr.width * 2 - 1)); PH.my = Math.max(-1, Math.min(1, (e.clientY - hr.top) / hr.height * 2 - 1)); } else { PH.mx = PH.my = 0; } if (!PH.loop) PH.loop = requestAnimationFrame(phLoop); }
  var t = e.target && e.target.closest ? e.target.closest(".card,.tile,.lux-row,.lrow") : null;
  t = t && root.contains(t) && !t.closest(".sold") ? (t.classList.contains("tile") ? t : t.querySelector(".media")) : null;
  if (PH.tilt && PH.tilt !== t) { ["--rx", "--ry", "--gx", "--gy"].forEach(function (p) { PH.tilt.style.removeProperty(p); }); }
  PH.tilt = t;
  if (t) { var b = t.getBoundingClientRect(), px = (e.clientX - b.left) / b.width, py = (e.clientY - b.top) / b.height;
    t.style.setProperty("--ry", ((px - 0.5) * 9).toFixed(2) + "deg"); t.style.setProperty("--rx", ((0.5 - py) * 7).toFixed(2) + "deg");
    t.style.setProperty("--gx", (px * 100).toFixed(1) + "%"); t.style.setProperty("--gy", (py * 100).toFixed(1) + "%"); }
  var m = e.target && e.target.closest ? e.target.closest(".btn") : null; if (m && !root.contains(m)) m = null;
  if (PH.mag && PH.mag !== m) { PH.mag.style.removeProperty("--bx"); PH.mag.style.removeProperty("--by"); }
  PH.mag = m;
  if (m) { var c = m.getBoundingClientRect(); m.style.setProperty("--bx", ((e.clientX - c.left - c.width / 2) * 0.22).toFixed(1) + "px"); m.style.setProperty("--by", ((e.clientY - c.top - c.height / 2) * 0.3).toFixed(1) + "px"); }
}
function phLoop() {
  PH.cx += (PH.mx - PH.cx) * 0.09; PH.cy += (PH.my - PH.cy) * 0.09; phApplyMouse();
  PH.loop = Math.abs(PH.mx - PH.cx) + Math.abs(PH.my - PH.cy) > 0.002 ? requestAnimationFrame(phLoop) : 0;
}
function phApplyMouse() { var h = W.root && W.root.querySelector(".hero"); if (!h) return; h.style.setProperty("--mx", PH.cx.toFixed(4)); h.style.setProperty("--my", PH.cy.toFixed(4)); }

function napoj(root) {
  W.root = root;
  root.addEventListener("click", function (e) {
    if (W.EDIT && e.target.closest("[data-ed]")) return;
    var lnk = e.target.closest("a[href]");
    if (lnk) {
      var hr = lnk.getAttribute("href") || "", typ = /^tel:/i.test(hr) ? "tel" : /^mailto:/i.test(hr) ? "mail" : /^https:\/\/wa\.me\//i.test(hr) ? "wa" : "";
      if (typ && W.klik) { var kc = lnk.closest("[data-open]"), kx = kc ? ZOZ()[+kc.dataset.open] : W.PAGE.v === "detail" ? ZOZ()[W.PAGE.i] : null; try { W.klik(typ, kx && kx.id || null); } catch (x) { /* nič */ } }
      return;
    }
    var t = e.target.closest("button,[data-open],[data-home]"); if (!t) return; var d = t.dataset;
    if (d.open !== undefined && (!e.target.closest("button") || e.target.closest("button") === t)) { otvorDetail(+d.open); return; }
    if (d.online !== undefined) { W.FV.kontakt = Object.assign({}, W.FV.kontakt, { sprava: "Dobrý deň, chcel(a) by som sa s vami spojiť cez online hovor. Vyhovuje mi: " }); W.DONE.kontakt = false; render();
      requestAnimationFrame(function () { var ta = W.root.querySelector('[data-form="kontakt"] textarea'); if (ta) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); } }); return; }
    if (d.book !== undefined) { W.BK.l = +d.book; W.DONE.obhliadka = false; W.PAGE = { v: "home" }; render(); setHash(""); requestAnimationFrame(function () { goSec("obhliadka"); }); return; }
    if (d.zaujem !== undefined) { var zx = ZOZ()[+d.zaujem]; if (zx) { W.ZAUJEM = zx.id || null; W.FV.kontakt = { sprava: "Mám záujem o ponuku: " + zx.t + (zx.l ? " (" + zx.l + ")" : "") }; } }
    if (d.home !== undefined) { W.PAGE = { v: "home" }; render(); setHash(""); requestAnimationFrame(function () { if (d.home === "top") W.root.scrollIntoView({ behavior: "smooth", block: "start" }); else goSec(d.home); }); return; }
    if (d.go) { goSec(W.SEKCIE && W.SEKCIE.indexOf(d.go) < 0 && W.PAGE.v === "home" && (d.go === "strazca" || d.go === "ocenenie") ? "kontakt" : d.go); return; }
    if (d.hfk !== undefined || d.hfo !== undefined) { W.FIL = { k: d.hfk || "", t: "", o: d.hfo || "", sort: W.FIL.sort }; W.VSETKY = false; W.PAGE = { v: "home" }; render(); requestAnimationFrame(function () { goSec("ponuky"); }); return; }
    if (d.fk !== undefined) { W.FIL.k = d.fk; if (!d.fk && t.classList.contains("btn")) W.FIL = { k: "", t: "", o: "", sort: W.FIL.sort }; W.VSETKY = false; render(); return; }
    if (d.ft !== undefined) { W.FIL.t = W.FIL.t === d.ft ? "" : d.ft; W.VSETKY = false; render(); return; }
    if (d.fo !== undefined) { W.FIL.o = ""; render(); return; }
    if (d.vsetky !== undefined) { W.VSETKY = true; render(); return; }
    if (d.lb !== undefined) { openLB(W.PAGE.i, +d.lb); return; }
    if (d.share !== undefined) { share(+d.share); return; }
    if (d.demo) { toast("Leták sa vytvorí z ponuky v Nehnuteľnostiach."); return; }
    if (d.gdpr !== undefined) { W.PAGE = { v: "gdpr" }; render(); W.root.scrollIntoView({ behavior: "smooth", block: "start" }); return; }
    if (d.send) { send(d.send); return; }
    if (d.qa !== undefined) { W.Q.a[W.Q.step] = d.qa; W.Q.step++; }
    else if (d.qback !== undefined) W.Q.step = Math.max(0, W.Q.step - 1);
    else if (d.qreset !== undefined) { W.Q = { step: 0, a: [] }; W.DONE.dotaznik = false; }
    else if (d.wt) { var Wt = W.Wt; Wt.typ = Wt.typ.indexOf(d.wt) >= 0 ? Wt.typ.filter(function (x) { return x !== d.wt; }) : Wt.typ.concat([d.wt]); }
    else if (d.wp !== undefined) W.Wt.place = W.Wt.place === d.wp ? "" : d.wp;
    else if (d.vt) W.VF.typ = d.vt; else if (d.vs) W.VF.stav = d.vs; else if (d.cbt) W.CBT = d.cbt;
    else if (d.bd !== undefined) W.BK.d = +d.bd; else if (d.bt !== undefined) W.BK.t = d.bt;
    else if (d.again) W.DONE[d.again] = false;
    else if (d.ck !== undefined) { W.CK.bar = false; try { localStorage.setItem("typek-web-cookies", d.ck); } catch (x) { /* nič */ } if (W.poSuhlase) W.poSuhlase(d.ck); }
    else if (d.ckopen !== undefined) W.CK.bar = true;
    else return;
    render();
  });
  if (!W.editor) window.addEventListener("popstate", function () {
    var m = location.hash.match(/^#p-(\d+)$/), i = m ? ZOZ().findIndex(function (x) { return String(x.id) === m[1]; }) : -1;
    if (i >= 0) { if (W.PAGE.v !== "detail" || W.PAGE.i !== i) { W.PAGE = { v: "detail", i: i }; render(); } }
    else if (W.PAGE.v !== "home") { var sp = W.PAGE.v === "detail" ? W.PAGE.i : -1; W.PAGE = { v: "home" }; render();
      requestAnimationFrame(function () { var el = sp >= 0 && W.root.querySelector('[data-open="' + sp + '"]'); (el || document.getElementById("s-ponuky") || W.root).scrollIntoView({ block: "center" }); }); }
  });
  root.addEventListener("focusin", function (e) {
    var f = e.target.closest && e.target.closest("[data-form]");
    if (f && !W.editor && W.formAdresa) overenie(W.formAdresa, f.dataset.form);
  });
  root.addEventListener("change", function (e) { if (e.target.dataset && e.target.dataset.fsort !== undefined) { W.FIL.sort = e.target.value; render(); } });
  root.addEventListener("keydown", function (e) {
    var t = e.target;
    if (t.matches && t.matches("[data-open]") && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); otvorDetail(+t.dataset.open); }
    if (t.matches && t.matches("[data-ed][data-single]") && e.key === "Enter") { e.preventDefault(); t.blur(); }
  });
  root.addEventListener("paste", function (e) { if (!e.target.closest || !e.target.closest("[data-ed]")) return; e.preventDefault(); var tx = (e.clipboardData || window.clipboardData).getData("text/plain"); document.execCommand("insertText", false, tx); });
  root.addEventListener("input", function (e) {
    var t = e.target;
    if (t.dataset && t.dataset.c) { calc(); return; }
    if (t.dataset && t.dataset.wmax !== undefined) { W.Wt.max = +t.value; var o = root.querySelector("[data-wo]"); if (o) o.textContent = fmt(W.Wt.max) + " €"; return; }
    var edEl = t.closest && t.closest("[data-ed]");
    if (edEl) { var v = String(edEl.innerText != null ? edEl.innerText : edEl.textContent).replace(/\n{3,}/g, "\n\n").replace(/\n$/, ""); if ("single" in edEl.dataset) v = v.replace(/\s*\n\s*/g, " ");
      setDeep(edEl.dataset.ed, v); if (W.poUprave) W.poUprave(edEl.dataset.ed, v); return; }
    var form = t.closest && t.closest("[data-form]");
    if (form && t.name) { var fk = form.dataset.form; (W.FV[fk] = W.FV[fk] || {})[t.name] = t.value; }
  });
  root.addEventListener("click", function (e) { var b = e.target.closest("[data-edgo]"); if (b && W.editorGo) { e.preventDefault(); W.editorGo(b.dataset.edgo); } });
  root.addEventListener("change", function (e) { var t = e.target; if (t.dataset.bl !== undefined) W.BK.l = +t.value; var form = t.closest("[data-form]"); if (form && t.name) (W.FV[form.dataset.form] = W.FV[form.dataset.form] || {})[t.name] = t.type === "checkbox" ? (t.checked ? "áno" : "") : t.value; });
}

window.TYPEK_WEB = { W: W, trk: trk, bezPohybu: function () { return !!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches); }, overenie: overenie, overeniePouzite: overeniePouzite, sha256Zaciatok: sha256Zaciatok, AI: AI, AI_LIB: AI_LIB, AI_VID_LIB: AI_VID_LIB, pozicia: function () { return pozicia(); }, ohnisko: function () { return ohnisko(); }, AI_BASE: AI_BASE, AI_NOTE: AI_NOTE, aiSrc: aiSrc, heroAi: function (k) { return heroAi(k); }, TPLS: TPLS, HERO_IMG_TPLS: HERO_IMG_TPLS, HERO_DEF: HERO_DEF, COLORS: COLORS, SETS: SETS, FONTS: FONTS, FONTS_URL: FONTS_URL, BGS: BGS, SECS: SECS, SOC: SOC, DEF: DEF, UKAZKA: UKAZKA,
  fotoMaklera: function () { return fotoMaklera(); }, merge: merge, clone: clone, esc: esc, get: get, setDeep: setDeep, secName: secName, heroTx: heroTx, pal: pal, photo: photo, favSvg: favSvg, initials: initials, slugD: slugD, url: url, waNum: waNum, fmt: fmt,
  okHex: okHex, isHex: isHex, mix: mix, h2r: h2r, r2h: r2h, prevod: prevod, ZOZ: ZOZ, render: render, napoj: napoj, toast: toast, SV: SV, otvorDetail: otvorDetail };
})();
