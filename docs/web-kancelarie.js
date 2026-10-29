/* Skladačka webu realitnej kancelárie (len administrátor) – Realitný týpek
   Ukladá do databázy (ulozit_web_kancelarie), zverejňuje (zverejnit_web_kancelarie), fotky a videá nahráva do úložiska „weby“.
   Vzhľad a vykreslenie webu sú vo web-kancelarie-sablona.js (rovnaké pre ukážku aj verejný web). */
(function () {
"use strict";
var CFG = window.SKENER_CONFIG || {}, KC = window.TYPEK_KANC, K = KC.K, esc = KC.esc, SV = KC.SV, IC = KC.IC, src = KC.src;
var APP = "https://app.realitnytypek.sk/";
var $ = function (id) { return document.getElementById(id); };
var sb = null, WEB = null, D = null, JA = null, ZMENY = false, NEULOZENE = false, UKLADANIE = null;
var UI = { tab: "vzhlad", open: "", add: false, dev: "pc", view: "web", libCb: null, libMulti: null, fileCb: null, otv: "", aiTone: "Priateľský" };
var vhPx = 760;
var EIC = { grip: '<circle cx="9" cy="6" r="1.3"/><circle cx="15" cy="6" r="1.3"/><circle cx="9" cy="12" r="1.3"/><circle cx="15" cy="12" r="1.3"/><circle cx="9" cy="18" r="1.3"/><circle cx="15" cy="18" r="1.3"/>',
  up: '<path d="M6 15l6-6 6 6"/>', down: '<path d="M6 9l6 6 6-6"/>', trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>', oko: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>' };
function ic(n) { return EIC[n] || IC[n] || ""; }
function S() { return K.S; }

/* ================================================================ pomocníci */
function toast(m, chyba) { var t = $("toast"); t.textContent = m; t.hidden = false; t.style.background = chyba ? "var(--c-danger)" : ""; clearTimeout(toast.t); toast.t = setTimeout(function () { t.hidden = true; }, chyba ? 6500 : 3400); }
function chybaText(e) { return (e && (e.message || e.error_description || e.chyba)) || String(e); }
function rpc(fn, args) { return sb.rpc(fn, args || {}).then(function (r) { if (r.error) throw r.error; return r.data; }); }
function cas(d) { d = new Date(d); return d.getDate() + ". " + (d.getMonth() + 1) + ". " + d.getFullYear() + " o " + d.getHours() + ":" + String(d.getMinutes()).padStart(2, "0"); }
function isoDen(d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
function get(path) { return path.split(".").reduce(function (o, k) { return o == null ? undefined : o[k]; }, K.S); }
function set(path, v) { var ks = path.split("."), o = K.S; for (var i = 0; i < ks.length - 1; i++) { if (o[ks[i]] == null || typeof o[ks[i]] !== "object") o[ks[i]] = {}; o = o[ks[i]]; } o[ks[ks.length - 1]] = v; save(); }
function okHex(v) { v = String(v || "").trim(); if (v.charAt(0) !== "#") v = "#" + v; return KC.isHex(v) ? v.toLowerCase() : null; }
function move(arr, i, d) { var j = i + d; if (j < 0 || j >= arr.length) return; var x = arr[i]; arr[i] = arr[j]; arr[j] = x; }
function stav(t, druh) { var e = $("stav"); e.className = "stav" + (druh ? " " + druh : ""); e.querySelector("span").textContent = t; }
function verejnyOdkaz() { return WEB.domena && WEB.domena_pripojena ? "https://" + WEB.domena + "/" : APP + "stranka.html?m=" + encodeURIComponent(WEB.adresa); }
function nahladOdkaz() { return new URL("kancelaria.html?m=" + encodeURIComponent(WEB.adresa) + "&nahlad=1", location.href).href; }
function kopiruj(v, msg) { try { navigator.clipboard.writeText(v).then(function () { toast(msg); }, function () { toast(v); }); } catch (e) { toast(v); } }
function makler(id) { return ((D && D.makleri) || []).find(function (m) { return m.id === id; }); }
function menoM(m) { return (m && (m.meno_cele || m.meno)) || ""; }
function pon(n) { return n + (n === 1 ? " ponuka" : n >= 2 && n <= 4 ? " ponuky" : " ponúk"); }

/* ================================================================ ukladanie a história */
// čisté nastavenie na uloženie; pri zverejnení dostane každý článok trvalú adresu (slug)
function cisty(pub) {
  if (pub) {
    var videne = {};
    K.S.clanky.items.forEach(function (a) {
      if (!a.id) a.id = "a" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
      var s = KC.slug(a.slug || a.t) || a.id, z = s, i = 2;
      while (videne[z]) z = s + "-" + i++;
      a.slug = z; videne[z] = 1;
    });
  }
  var c = KC.clone(K.S);
  c._stranky = KC.STRANKY.filter(function (x) { return (c.stranky[x[0]] || {}).on && (x[0] !== "predane" || ((D && D.predane) || []).length); }).map(function (x) { return x[0]; });
  c._clanky = c.clanky.items.filter(function (a) { return a.on !== false && a.slug && String(a.t || "").trim(); }).map(function (a) { return { slug: a.slug, dt: a.dt || "" }; });
  return c;
}
function save() {
  histSchedule(); NEULOZENE = true; ZMENY = true; stav("Neuložené zmeny…", "uklada");
  clearTimeout(save.t); save.t = setTimeout(ulozTeraz, 1200);
}
function ulozTeraz() {
  clearTimeout(save.t);
  if (!NEULOZENE) return UKLADANIE || Promise.resolve();
  NEULOZENE = false; stav("Ukladám…", "uklada");
  UKLADANIE = rpc("ulozit_web_kancelarie", { p_koncept: cisty() }).then(function () {
    var d = new Date(); stav("Uložené " + d.getHours() + ":" + String(d.getMinutes()).padStart(2, "0")); updPub();
  }).catch(function (e) { NEULOZENE = true; stav("Neuložené – " + chybaText(e), "chyba"); throw e; });
  return UKLADANIE;
}
window.addEventListener("beforeunload", function (e) { if (NEULOZENE) { ulozTeraz().catch(function () {}); e.preventDefault(); e.returnValue = ""; } });
var HIST = [], HI = -1, histT = null, RESTORING = false;
function snap() { return JSON.stringify(K.S); }
function histPush() { var s = snap(); if (HIST[HI] === s) return; HIST = HIST.slice(0, HI + 1); HIST.push(s); if (HIST.length > 80) HIST.shift(); HI = HIST.length - 1; updHist(); }
function histSchedule() { if (RESTORING) return; clearTimeout(histT); histT = setTimeout(histPush, 450); }
function updHist() { $("undo").disabled = HI <= 0; $("redo").disabled = HI >= HIST.length - 1; }
function restore() { RESTORING = true; K.S = KC.merge(JSON.parse(HIST[HI])); all(); RESTORING = false; NEULOZENE = true; save(); updHist(); }
function undo() { clearTimeout(histT); histPush(); if (HI <= 0) return; HI--; restore(); toast("Vrátené späť"); }
function redo() { clearTimeout(histT); if (HI >= HIST.length - 1) return; HI++; restore(); }

/* ================================================================ nahrávanie fotiek a videí */
function zmensi(file, max, png) {
  return new Promise(function (res, rej) {
    var r = new FileReader(); r.onerror = rej;
    r.onload = function () {
      var im = new Image(); im.onerror = function () { rej(new Error("Súbor nie je obrázok.")); };
      im.onload = function () {
        var k = Math.min(1, max / Math.max(im.width, im.height)), c = document.createElement("canvas");
        c.width = Math.max(1, Math.round(im.width * k)); c.height = Math.max(1, Math.round(im.height * k));
        c.getContext("2d").drawImage(im, 0, 0, c.width, c.height);
        var hotovo = function (b, ext) {
          if (!b) return rej(new Error("Obrázok sa nepodarilo spracovať."));
          if (k === 1 && !png && /^image\/(jpeg|webp)$/.test(file.type) && file.size <= b.size) { b = file; ext = file.type === "image/webp" ? ".webp" : ".jpg"; }
          res({ blob: b, ext: ext });
        };
        if (png) c.toBlob(function (b) { hotovo(b, ".png"); }, "image/png");
        else c.toBlob(function (b) { if (b && b.type === "image/webp") hotovo(b, ".webp"); else c.toBlob(function (j) { hotovo(j, ".jpg"); }, "image/jpeg", 0.85); }, "image/webp", 0.82);
      };
      im.src = r.result;
    };
    r.readAsDataURL(file);
  });
}
function nahraj(blob, nazov, typ) {
  var cesta = "kancelaria/" + Date.now().toString(36) + "-" + (KC.slug(nazov.replace(/\.[^.]+$/, "")) || "subor").slice(0, 40) + (nazov.match(/\.[a-z0-9]+$/i) || [""])[0].toLowerCase();
  return sb.storage.from("weby").upload(cesta, blob, { contentType: typ || blob.type, upsert: false }).then(function (r) {
    if (r.error) throw r.error;
    return sb.storage.from("weby").getPublicUrl(cesta).data.publicUrl;
  });
}
// vyberie súbory a nahrá ich (fotky zmenší, logo ako PNG, video bez zmeny do 50 MB)
function vyberSubory(o, cb) {
  var f = $("file"); f.multiple = !o.single; f.accept = o.video ? "video/mp4,video/webm" : "image/*"; f.value = "";
  UI.fileCb = function (files) {
    var list = Array.prototype.slice.call(files, 0, o.single ? 1 : 20), out = [], i = 0;
    (function dalsi() {
      if (i >= list.length) { if (out.length) cb(out); return; }
      var file = list[i++];
      toast("Nahrávam " + (list.length > 1 ? i + " z " + list.length : o.video ? "video" : "fotku") + "…");
      var p = o.video
        ? (file.size > 50 * 1024 * 1024 ? Promise.reject(new Error("Video je väčšie ako 50 MB. Skráť ho alebo zmenši.")) : nahraj(file, file.name, file.type))
        : zmensi(file, o.max || 1920, o.png).then(function (z) { return nahraj(z.blob, file.name.replace(/\.[^.]+$/, "") + z.ext, z.blob.type); });
      p.then(function (u) { out.push(u); dalsi(); }, function (e) { toast("Nahrať sa nepodarilo: " + chybaText(e), true); dalsi(); });
    })();
  };
  f.click();
}
$("file").addEventListener("change", function () { if (UI.fileCb && this.files.length) UI.fileCb(this.files); });

/* knižnica ilustračných fotiek a videí */
var lib = $("lib");
function pickImg(cb, o) {
  o = o || {}; UI.libCb = cb; UI.libMulti = o.multi || null; UI.libVideo = !!o.video;
  $("libH").textContent = o.video ? "Vyber video" : "Vyber fotku";
  $("libNote").textContent = o.video ? "Krátke videá od AI z knižnice Týpka. Vlastné video (MP4, do 50 MB) nahráš z počítača." : "Ilustračné fotky od AI z knižnice Týpka. Vlastné fotky nahráš z počítača alebo mobilu.";
  $("libG").innerHTML = o.video
    ? KC.VIDEA.map(function (x) { return '<button type="button" class="vid" data-pick="' + x[0] + '"><img src="' + src(x[2], true) + '" alt="" loading="lazy"><i class="vid-tag">VIDEO</i><span>' + esc(x[1]) + "</span></button>"; }).join("")
    : KC.LIB.map(function (x) { return '<button type="button" data-pick="' + x[0] + '"><img src="' + src(x[0], true) + '" alt="" loading="lazy"><span>' + esc(x[1]) + "</span></button>"; }).join("");
  if (lib.showModal) lib.showModal(); else lib.setAttribute("open", "");
}
lib.addEventListener("click", function (e) {
  var b = e.target.closest("button"); if (!b) { if (e.target === lib) lib.close(); return; }
  if (b.dataset.pick) { lib.close(); if (UI.libCb) UI.libCb(b.dataset.pick); return; }
  if (b.dataset.libx !== undefined) { lib.close(); return; }
  if (b.dataset.libup !== undefined) { lib.close(); var one = UI.libCb, multi = UI.libMulti; vyberSubory({ video: UI.libVideo, single: UI.libVideo || !multi }, function (l) { if (multi && l.length > 1) multi(l); else l.forEach(function (v) { one(v); }); }); }
});

/* ================================================================ panel – stavebné kúsky */
function fld(lab, path, o) {
  o = o || {}; var v = get(path); v = v == null ? "" : v;
  var inner = o.ta ? '<textarea data-k="' + path + '" rows="' + (o.ta === true ? 3 : o.ta) + '"' + (o.ph ? ' placeholder="' + esc(o.ph) + '"' : "") + ">" + esc(v) + "</textarea>"
    : '<input type="' + (o.type || "text") + '" data-k="' + path + '" value="' + esc(v) + '"' + (o.ph ? ' placeholder="' + esc(o.ph) + '"' : "") + (o.max ? ' maxlength="' + o.max + '"' : "") + (o.mode ? ' inputmode="' + o.mode + '"' : "") + (o.num ? " data-num" : "") + (o.step ? ' step="' + o.step + '"' : "") + ">";
  return '<label class="f' + (o.half ? " half" : "") + '"><span>' + lab + "</span>" + inner + "</label>";
}
function sel(lab, path, opts, o) {
  o = o || {}; var v = String(get(path) == null ? "" : get(path));
  return '<label class="f' + (o.half ? " half" : "") + '"><span>' + lab + '</span><select data-k="' + path + '"' + (o.rp ? " data-rp" : "") + ">" + opts.map(function (x) { return '<option value="' + esc(x[0]) + '"' + (String(x[0]) === v ? " selected" : "") + ">" + esc(x[1]) + "</option>"; }).join("") + "</select></label>";
}
function seg(path, opts, lab) {
  var v = String(get(path));
  return (lab ? '<div class="lab">' + lab + "</div>" : "") + '<div class="seg" role="group"' + (lab ? ' aria-label="' + esc(lab) + '"' : "") + ">" + opts.map(function (x) { return '<button type="button" data-seg="' + path + '" data-v="' + esc(x[0]) + '" aria-pressed="' + (String(x[0]) === v) + '">' + esc(x[1]) + "</button>"; }).join("") + "</div>";
}
function onoff(path, lab) { return seg(path, [["on", "Zapnuté"], ["off", "Vypnuté"]], lab); }
function grp(h, body, id) { return '<section class="grp"' + (id ? ' id="' + id + '"' : "") + "><h2>" + h + "</h2>" + body + "</section>"; }
function icb(act, n, lab, extra) { return '<button type="button" class="ic" data-act="' + act + '" aria-label="' + esc(lab) + '" title="' + esc(lab) + '"' + (extra || "") + ">" + SV(ic(n), 2.2) + "</button>"; }
function prepinac(attr, on, lab) { return '<span class="sw-t"><input type="checkbox" ' + attr + (on ? " checked" : "") + ' aria-label="' + esc(lab) + '"><span></span></span>'; }
function obrBtns(path, lab) { return '<div class="row-btns"><img class="thumb" src="' + esc(src(get(path) || "dom-obyvacka", true)) + '" alt=""><button type="button" class="b b-soft b-sm" data-act="img:' + path + '">' + (lab || "Zmeniť fotku") + "</button></div>"; }
function targets(withUrl) {
  var t = [["ponuky", "Ponuky"], ["predane", "Predané"], ["o-nas", "O nás"], ["sluzby", "Služby"], ["vykup", "Výkup"], ["tim", "Tím"], ["kariera", "Kariéra"], ["blog", "Blog"], ["kontakt", "Kontakt"],
    ["odhad", "Odhad hodnoty"], ["strazca", "Strážca ponúk"], ["hypo", "Hypotekárna kalkulačka"], ["recenzie", "Recenzie"], ["galeria", "Galéria"]];
  K.S.order.forEach(function (k) { if (K.S.custom[k]) t.push([k, (K.S.custom[k].t || "Vlastná sekcia") + " (vlastná)"]); });
  if (withUrl) t.push(["url", "Vlastný odkaz…"]);
  return t;
}
function kamVedie(lab, path, upath, half) { return sel(lab, path, targets(true), { half: half, rp: 1 }) + (get(path) === "url" ? fld("Odkaz", upath, { ph: "napr. alphareality.sk/akcia" }) : ""); }
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

/* ================================================================ panel – záložky */
var TABS = [["vzhlad", "Vzhľad"], ["uvod", "Úvod"], ["sekcie", "Sekcie"], ["stranky", "Stránky"], ["blog", "Blog"], ["kancelaria", "Kancelária"], ["napojenia", "Napojenia"], ["web", "Web a doména"]];
function renderPanel(keepScroll) {
  var pn = $("panel"), y = pn.scrollTop, wy = window.scrollY;
  $("tabs").innerHTML = TABS.map(function (t) { return '<button type="button" class="tab" role="tab" data-tab="' + t[0] + '" aria-selected="' + (UI.tab === t[0]) + '">' + t[1] + "</button>"; }).join("");
  var h = { vzhlad: paneVzhlad, uvod: paneUvod, sekcie: paneSekcie, stranky: paneStranky, blog: paneBlog, kancelaria: paneKancelaria, napojenia: paneNapojenia, web: paneWeb }[UI.tab]();
  $("pane").innerHTML = '<div class="pane">' + h + "</div>";
  if (keepScroll) { pn.scrollTop = y; window.scrollTo(0, wy); }
  if (UI.tab === "kancelaria") kancMapa();
}

function paneVzhlad() {
  var s = S(), col = KC.COLORS.find(function (c) { return c.id === s.color; });
  return grp("Šablóna", '<div class="tpls">' + KC.TPLS.map(function (t) { return '<button type="button" class="tpl" data-tpl="' + t.id + '" aria-pressed="' + (s.tpl === t.id) + '">' + tplSvg(t.id) + "<b>" + t.name + "</b><small>" + t.desc + "</small></button>"; }).join("") + '</div><p class="sub">Šablóna nastaví odporúčané písmo, hlavičku a tvar. Potom si všetko dolaď nižšie.</p><div><button type="button" class="b b-soft b-sm" data-act="mix">Zamiešať vzhľad</button></div>') +
    grp("Farebné sady", '<div class="sets">' + KC.SETS.map(function (x) { return '<button type="button" class="set" data-set="' + x.id + '" aria-pressed="' + (s.set === x.id) + '"><span class="trio"><i style="background:' + x.a + '"></i><i style="background:' + x.b + '"></i><i style="background:' + (KC.BGS.find(function (b) { return b.id === x.bg; }) || KC.BGS[0]).bg + ';box-shadow:inset 0 0 0 1px #E4DACA"></i></span><span>' + x.name + "</span></button>"; }).join("") + '</div><p class="sub">Celý web zladený jedným klikom. Sada Alpha zlatá je podľa loga kancelárie.</p>') +
    grp("Hlavná farba <output>" + esc(col ? col.name : "Vlastná") + "</output>", '<div class="sw">' + KC.COLORS.map(function (c) { return '<button type="button" class="dot" style="--sw:' + c.c + '" data-col="' + c.id + '" aria-label="' + c.name + '" title="' + c.name + '" aria-pressed="' + (s.color === c.id) + '"></button>'; }).join("") + "</div>" +
      '<div class="own-row"><input type="color" data-hex="cc" value="' + esc(KC.isHex(s.cc) ? s.cc : "#DAB967") + '" aria-label="Vybrať hlavnú farbu"><input type="text" data-hex="cc" value="' + esc(s.cc) + '" maxlength="7" spellcheck="false" aria-label="Kód hlavnej farby"><small>vlastná, napríklad z loga</small></div>') +
    grp("Doplnková farba", '<div class="own-row"><input type="color" data-hex="b2" value="' + esc(KC.isHex(s.b2) ? s.b2 : "#1E2A35") + '" aria-label="Vybrať doplnkovú farbu"><input type="text" data-hex="b2" value="' + esc(s.b2) + '" maxlength="7" spellcheck="false" aria-label="Kód doplnkovej farby" placeholder="ako hlavná"><button type="button" class="lbtn" data-act="b2clear">Zrušiť</button></div><p class="sub">Pás s oznamom, kalkulačka, malé nadpisy a odznaky.</p>') +
    grp("Farba nadpisov", seg("hcol", [["text", "Ako text"], ["a", "Hlavná"], ["b", "Doplnková"]])) +
    grp("Písmo", seg("font", KC.FONTS.map(function (f) { return [f.id, f.name]; }))) +
    grp("Pozadie", seg("bg", KC.BGS.map(function (b) { return [b.id, b.name]; }))) +
    grp("Hlavička", seg("head", [["svetla", "Svetlá"], ["tmava", "Tmavá"], ["priehladna", "Na fotke"]]) + '<p class="sub">Na fotke: hlavička je priehľadná cez titulné fotky a pri posúvaní stmavne. Pri šablóne Rozdelená sa použije svetlá.</p>') +
    grp("Tlačidlá", seg("btn", [["pill", "Pilulky"], ["round", "Zaoblené"], ["square", "Hranaté"]])) +
    grp("Zaoblenie rohov <output>" + s.r + " px</output>", '<input type="range" min="0" max="28" step="1" data-k="r" data-num value="' + s.r + '" aria-label="Zaoblenie rohov">') +
    grp("Animácie", onoff("anim") + '<p class="sub">Pomalé priblíženie fotiek v úvode, nábeh textov a napočítanie čísel.</p>');
}

function paneUvod() {
  var s = S(), sl = s.hero.slides, o = s.oznam;
  var list = sl.map(function (x, i) {
    var p = "hero.slides." + i + ".", vid = x.media === "video";
    return '<div class="item slide-ed' + (K.UI.slide === i ? " cur" : "") + '" data-slidei="' + i + '"><div class="item-h"><img class="thumb" src="' + esc(src(x.img, true)) + '" alt=""><b>' + (vid ? "Video " : "Titulná fotka ") + (i + 1) + "</b>" +
      icb("sl-up:" + i, "up", "Posunúť vyššie", i === 0 ? " disabled" : "") + icb("sl-down:" + i, "down", "Posunúť nižšie", i === sl.length - 1 ? " disabled" : "") + icb("sl-del:" + i, "trash", "Odstrániť") + "</div>" +
      seg(p + "media", [["foto", "Fotka"], ["video", "Video"]]) +
      '<div class="row-btns">' + (vid ? '<button type="button" class="b b-soft b-sm" data-act="sl-vid:' + i + '">' + (x.video ? "Zmeniť video" : "Vybrať video") + "</button>" : "") +
      '<button type="button" class="b b-soft b-sm" data-act="sl-img:' + i + '">' + (vid ? "Fotka, kým sa video načíta" : "Zmeniť fotku") + '</button><button type="button" class="b b-soft b-sm" data-act="sl-show:' + i + '">Ukázať</button></div>' +
      (vid && !x.video ? '<p class="note">Vyber video z knižnice alebo nahraj vlastné. Kým ho nevyberieš, ukazuje sa fotka.</p>' : vid ? '<p class="note">Video je bez zvuku a opakuje sa dookola. Na mobile sa pri šetrení dát ukáže fotka.</p>' : "") +
      '<div class="fields">' + fld("Nadpis", p + "t", { ta: 2 }) + fld("Text pod nadpisom", p + "l", { ta: 2 }) +
      fld("Tlačidlo", p + "b", { half: 1, ph: "Viac informácií" }) + kamVedie("Kam vedie", p + "go", p + "u", 1) +
      fld("Druhé tlačidlo (nepovinné)", p + "b2", { half: 1, ph: "napr. Pozrieť ponuky" }) + kamVedie("Kam vedie", p + "go2", p + "u2", 1) + "</div></div>";
  }).join("");
  return grp("Pás s oznamom", onoff("oznam.on") + (o.on === "on" ? '<div class="fields">' + fld("Text oznamu", "oznam.text", { ta: 2, ph: "napr. Cez sviatky máme otvorené od 9:00 do 12:00." }) + fld("Odkaz v oznáme (nepovinné)", "oznam.b", { half: 1, ph: "napr. Viac" }) + kamVedie("Kam vedie", "oznam.go", "oznam.u", 1) + "</div>" : "") +
      '<p class="sub">Úzky pás nad hlavičkou. Návštevník ho môže zavrieť.</p>') +
    grp("Titulné fotky a videá <output>" + sl.length + "</output>", '<p class="note">Fotky v úvode sa striedajú. Každá má vlastný nadpis, text a tlačidlo, napríklad <b>Viac informácií</b>. Namiesto fotky môže byť krátke video.</p><div class="items">' + list + '</div><button type="button" class="addb" data-act="sl-add">+ Pridať titulnú fotku</button>') +
    grp("Malý nápis nad nadpisom", '<div class="fields">' + fld("Nápis", "hero.eb", { ph: "napr. Realitná kancelária pre Spiš" }) + "</div>") +
    grp("Striedanie fotiek", onoff("hero.auto") + '<div class="lab">Každá fotka svieti <output id="intOut">' + s.hero.int + ' s</output></div><input type="range" min="3" max="12" step="1" data-k="hero.int" data-num value="' + s.hero.int + '" aria-label="Ako dlho svieti jedna fotka">') +
    grp("Stmavenie fotiek <output>" + s.hero.dim + " %</output>", '<input type="range" min="0" max="75" step="1" data-k="hero.dim" data-num value="' + s.hero.dim + '" aria-label="Stmavenie fotiek"><p class="sub">Biely text na fotke je čitateľný od zhruba 35 %.</p>') +
    grp("Zarovnanie textu", seg("hero.align", [["vlavo", "Vľavo"], ["stred", "Na stred"]])) +
    grp("Výška úvodu", seg("hero.hh", [["cela", "Celá obrazovka"], ["vysoka", "Vysoký"], ["stredna", "Nižší"]])) +
    grp("Vyhľadávanie ponúk", onoff("hero.search") + '<p class="sub">Návštevník si vyberie predaj alebo prenájom, druh a obec a web mu ukáže zodpovedajúce ponuky.</p>');
}

function aiBlok() { return '<div class="ai-b"><div><b>Texty na jeden klik</b><small>AI asistent napíše úvod, O nás, služby, výkup a kariéru podľa troch otázok.</small></div><button type="button" class="b b-gold b-sm" data-act="ai">Napísať texty</button></div>'; }
function paneSekcie() {
  var s = S();
  var rows = s.order.map(function (k, i) {
    var c = s.custom[k], nm = c ? (c.t || "Vlastná sekcia") : KC.SEC[k].n, ds = c ? "vlastná sekcia · " + (KC.CTYPES.find(function (t) { return t[0] === c.typ; }) || [0, "", ""])[1].toLowerCase() : KC.SEC[k].d, on = !!s.on[k], op = UI.open === k;
    return '<li class="srow' + (on ? "" : " off") + '" data-row="' + k + '"><div class="shd"><span class="grip" aria-hidden="true">' + SV(ic("grip")) + "</span>" + prepinac('data-on="' + k + '"', on, "Zobraziť sekciu " + nm) +
      '<button type="button" class="snm" data-act="sec-open:' + k + '"><b>' + esc(nm) + "</b><small>" + esc(ds) + "</small></button>" +
      icb("sec-up:" + k, "up", "Posunúť vyššie", i === 0 ? " disabled" : "") + icb("sec-down:" + k, "down", "Posunúť nižšie", i === s.order.length - 1 ? " disabled" : "") +
      '<button type="button" class="ic" data-act="sec-open:' + k + '" aria-expanded="' + op + '" aria-label="Upraviť sekciu" title="Upraviť sekciu">' + SV(IC.edit, 2.2) + "</button></div>" +
      (op ? '<div class="sed">' + secEd(k) + "</div>" : "") + "</li>";
  }).join("");
  var add = UI.add ? '<div class="types">' + KC.CTYPES.map(function (t) { return '<button type="button" data-act="c-add:' + t[0] + '"><b>' + t[1] + "</b><small>" + t[2] + "</small></button>"; }).join("") + '</div><button type="button" class="lbtn" data-act="c-addx">Zrušiť</button>' : '<button type="button" class="addb" data-act="c-addopen">+ Pridať vlastnú sekciu</button>';
  return aiBlok() + grp("Sekcie úvodnej stránky", '<p class="note">Zapni, čo chceš mať na úvodnej stránke, a poskladaj poradie. Ťahaj za úchyt vľavo alebo použi šípky. V ukážke vieš sekciu otvoriť aj tlačidlom <b>Upraviť sekciu</b>.</p><ul class="secs" id="secs">' + rows + "</ul>" + add);
}
function hlava(p) { return '<div class="fields">' + fld("Malý nadpis", p + "eb", { half: 1 }) + fld("Nadpis", p + "t", { half: 1 }) + "</div>"; }
function pageEd(k) {
  var p = k + ".";
  if (k === "vykup") return '<p class="note">Samostatná stránka <b>Výkup</b> s postupom, výhodami a formulárom. Žiadosť príde do zvončeka a predávajúci sa zapíše v Klientoch.</p>' + hlava(p) + '<div class="fields">' + fld("Text pod nadpisom", p + "l", { ta: 2 }) + fld("Text", p + "text", { ta: 5 }) + fld("Výhody (každá na nový riadok)", p + "pts", { ta: 4 }) + fld("Postup (každý krok na nový riadok)", p + "kroky", { ta: 4 }) + "</div>" + obrBtns(p + "img");
  if (k === "kariera") return '<p class="note">Na úvode je krátka výzva, celá ponuka práce s formulárom je na stránke <b>Kariéra</b>. Záujem o prácu príde vždy kancelárii.</p>' + hlava(p) + '<div class="fields">' + fld("Text pod nadpisom", p + "l", { ta: 2 }) + fld("Čo ponúkate", p + "text", { ta: 5 }) + fld("Výhody (každá na nový riadok)", p + "pts", { ta: 4 }) + fld("Tlačidlo formulára", p + "b", { ph: "Mám záujem" }) + "</div>" + obrBtns(p + "img");
  return "";
}
function secEd(k) {
  var s = S(), c = s.custom[k];
  if (c) {
    var b = '<div class="fields">' + sel("Typ sekcie", "custom." + k + ".typ", KC.CTYPES.map(function (t) { return [t[0], t[1]]; }), { rp: 1 }) + fld("Nadpis", "custom." + k + ".t") + (c.typ !== "fotky" ? fld("Text", "custom." + k + ".text", { ta: 4 }) : "") + "</div>";
    if (c.typ === "txph") b += obrBtns("custom." + k + ".img");
    if (c.typ === "fotky") b += galEd("custom." + k + ".imgs");
    if (c.typ !== "fotky") b += '<div class="fields">' + fld("Tlačidlo (nepovinné)", "custom." + k + ".b", { half: 1, ph: "napr. Viac informácií" }) + kamVedie("Kam vedie", "custom." + k + ".go", "custom." + k + ".u", 1) + "</div>";
    b += seg("custom." + k + ".bgs", [["", "Bežné"], ["alt", "Tónované"], ["col", "Vo farbe"]], "Pozadie sekcie");
    b += seg("custom." + k + ".menu", [["on", "V menu"], ["off", "Nie v menu"]], "Hlavné menu") + (c.menu === "on" ? '<div class="fields">' + fld("Názov v menu", "custom." + k + ".ml", { max: 18 }) + "</div>" : "");
    return b + '<div><button type="button" class="lbtn" data-act="c-del:' + k + '" style="color:var(--c-danger)">Odstrániť túto sekciu</button></div>';
  }
  var p = k + ".", head = hlava(p);
  switch (k) {
    case "cisla":
      return '<p class="note">Ku každému číslu napíš popis. Počty vie Týpek zrátať sám, hodnotenie sa vezme z Google. Prázdne riadky sa nezobrazia.</p>' +
        s.cisla.rows.map(function (r, i) { return '<div class="item"><div class="item-h"><b>Číslo ' + (i + 1) + "</b>" + icb("ls-del:cisla.rows:" + i, "trash", "Odstrániť") + '</div><div class="fields">' +
          sel("Odkiaľ", "cisla.rows." + i + ".typ", [["vlastne", "Vlastné číslo"], ["ponuky", "Počet ponúk z Týpka"], ["makleri", "Počet maklérov z Týpka"], ["predane", "Počet predaných z Týpka"], ["recenzie", "Počet recenzií"], ["google", "Hodnotenie na Google"]], { rp: 1 }) +
          (r.typ === "vlastne" ? fld("Číslo", "cisla.rows." + i + ".n", { half: 1, ph: "napr. 500+" }) : "") + fld("Popis", "cisla.rows." + i + ".t", { half: r.typ === "vlastne" ? 1 : 0, ph: "napr. predaných nehnuteľností" }) + "</div></div>"; }).join("") +
        (s.cisla.rows.length < 4 ? '<button type="button" class="addb" data-act="ls-add:cisla.rows">+ Pridať číslo</button>' : "") + seg("cisla.st", [["pas", "Pás vo farbe"], ["karty", "Karty"], ["jedno", "Jednoduché"]], "Vzhľad");
    case "ponuky":
      return '<p class="note">Ponuky sa berú samy z Týpka od <b>všetkých maklérov kancelárie</b> (aktívne aj rezervované). Klik na ponuku otvorí jej stránku s fotkami a kontaktom na makléra. Makléra vypneš v záložke Kancelária.</p>' + head + '<div class="fields">' + fld("Text pod nadpisom", p + "l") + "</div>" +
        seg(p + "cnt", [["3", "3"], ["6", "6"], ["9", "9"], ["vse", "Všetky"]], "Koľko ponúk ukázať na úvode") + seg(p + "lay", [["mriezka", "Mriežka"], ["posuvnik", "Posúvanie"], ["zoznam", "Zoznam"]], "Rozloženie") +
        seg(p + "sort", [["nove", "Najnovšie"], ["lacne", "Od najlacnejšej"], ["drahe", "Od najdrahšej"]], "Poradie") + onoff(p + "filt", "Filtre nad ponukami (druh, predaj a prenájom, maklér)") + onoff(p + "agent", "Maklér na karte ponuky") + onoff(p + "mapa", "Mapa ponúk na stránke Ponuky");
    case "predane":
      return '<p class="note">Predané a prenajaté ponuky za posledné 3 roky sa berú samy z Týpka, keď maklér označí ponuku ako predanú.</p>' + head + '<div class="fields">' + fld("Text pod nadpisom", p + "l", { ta: 2 }) + "</div>" + seg(p + "cnt", [["3", "3"], ["6", "6"], ["9", "9"], ["12", "12"]], "Koľko ukázať na úvode");
    case "okancelarii":
      return head + '<div class="fields">' + fld("Text", p + "text", { ta: 6 }) + fld("Výhody (každá na nový riadok)", p + "pts", { ta: 4 }) + fld("Tlačidlo", p + "b", { half: 1 }) + sel("Kam vedie", p + "go", targets(false), { half: 1 }) + "</div>" + obrBtns("okancelarii.img") + onoff(p + "badge", "Odznak s prvým číslom na fotke");
    case "sluzby":
      return head + '<div class="fields">' + fld("Text pod nadpisom", p + "l") + '</div><div class="items">' + s.sluzby.items.map(function (x, i) {
        return '<div class="item"><div class="item-h"><b>' + esc(x.t || "Služba") + "</b>" + icb("ls-up:sluzby.items:" + i, "up", "Vyššie", i === 0 ? " disabled" : "") + icb("ls-del:sluzby.items:" + i, "trash", "Odstrániť") + '</div><div class="fields">' + sel("Ikona", "sluzby.items." + i + ".ic", KC.SVC_IC, { half: 1 }) + fld("Názov", "sluzby.items." + i + ".t", { half: 1 }) + fld("Popis", "sluzby.items." + i + ".d", { ta: 2 }) + "</div></div>"; }).join("") +
        '</div><button type="button" class="addb" data-act="ls-add:sluzby.items">+ Pridať službu</button>';
    case "odhad":
      return head + '<div class="fields">' + fld("Text", p + "text", { ta: 3 }) + fld("Kroky vľavo (každý na nový riadok)", p + "kroky", { ta: 3 }) + '</div><p class="note">Formulár má tri kroky: druh, údaje o nehnuteľnosti a kontakt. Komu príde, nastavíš v záložke <b>Kancelária</b>. Predávajúci s telefónom sa zapíše v Klientoch medzi predávajúcich.</p><p class="note">Klient na webe nevidí žiadnu cenu, ozve sa mu maklér. Maklér dostane pri kontakte <b>orientačný odhad</b> vypočítaný z inzerátov v tej obci za posledný rok, aby mal pri telefonáte od čoho sa odraziť.</p>';
    case "strazca":
      return head + '<div class="fields">' + fld("Text pod nadpisom", p + "l", { ta: 2 }) + '</div><p class="note">Návštevník vyberie druh, obce a cenu. Dopyt sa uloží v Klientoch a keď ktorýkoľvek maklér pridá zhodnú ponuku, klientovi príde e-mail (najviac raz za 12 hodín). E-mail najprv potvrdí odkazom.</p>';
    case "tim":
      return '<p class="note">Makléri sa berú z Týpka. Kto sa ukáže na webe, poradie, fotku a titul nastavíš v záložke <b>Kancelária</b>.</p>' + head + '<div class="fields">' + fld("Text pod nadpisom", p + "l", { ta: 2 }) + "</div>" + onoff(p + "web", "Odkaz na osobný web makléra") + onoff(p + "kont", "Tlačidlo Napísať maklérovi") + '<p class="note">Klik na makléra otvorí jeho stránku na webe kancelárie s ponukami, recenziami a kontaktom. Text o maklérovi doplníš v záložke <b>Kancelária</b>.</p>';
    case "ocenenia":
      return head + '<div class="items">' + s.ocenenia.items.map(function (a, i) {
        return '<div class="item"><div class="item-h"><b>' + esc(a.t || "Ocenenie") + "</b>" + icb("ls-up:ocenenia.items:" + i, "up", "Vyššie", i === 0 ? " disabled" : "") + icb("ls-del:ocenenia.items:" + i, "trash", "Odstrániť") + '</div><div class="fields">' + fld("Názov", "ocenenia.items." + i + ".t") + fld("Rok alebo skratka", "ocenenia.items." + i + ".y", { half: 1 }) + fld("Kto ho udelil", "ocenenia.items." + i + ".d", { half: 1 }) + "</div></div>"; }).join("") +
        '</div><button type="button" class="addb" data-act="ls-add:ocenenia.items">+ Pridať ocenenie</button>';
    case "recenzie":
      return '<p class="note">Google recenzie napojíš v záložke <b>Napojenia</b>. Recenzie z Týpka sú tie, ktoré klienti napísali maklérom a admin ich schválil.</p>' + head + seg(p + "zdroj", [["oboje", "Google aj Týpek"], ["google", "Len Google"], ["typek", "Len Týpek"]], "Odkiaľ") + seg(p + "cnt", [["3", "3 recenzie"], ["6", "6 recenzií"], ["9", "9 recenzií"]], "Koľko ukázať") + onoff(p + "write", "Tlačidlo Napísať recenziu");
    case "galeria":
      return head + seg(p + "lay", [["mriezka", "Mriežka"], ["mozaika", "Mozaika"], ["posuvnik", "Posúvanie"]], "Rozloženie") + galEd("galeria.imgs");
    case "mapa":
      return '<p class="note">Na mape sú ponuky, ktoré majú v Týpku polohu. Klik na bod ukáže fotku, cenu a odkaz na ponuku.</p>' + head + '<div class="fields">' + fld("Text pod nadpisom", p + "l", { ta: 2 }) + "</div>";
    case "hypo":
      return head + '<div class="fields">' + fld("Text pod výsledkom", p + "l", { ta: 2 }) + fld("Úrok v % ročne", p + "rate", { half: 1, type: "number", num: 1, step: "0.1", mode: "decimal" }) + fld("Doba splácania (roky)", p + "roky", { half: 1, type: "number", num: 1 }) +
        fld("Predvolená cena (€)", p + "cena", { half: 1, type: "number", num: 1 }) + fld("Vlastné zdroje (%)", p + "vlastne", { half: 1, type: "number", num: 1 }) + '</div><p class="note">Výpočet je orientačný. Tlačidlo pod výsledkom vedie na kontakt.</p>';
    case "clanky":
      return '<p class="note">Články píšeš v záložke <b>Blog</b>. Tu nastavíš, koľko najnovších sa ukáže na úvodnej stránke.</p>' + head + seg(p + "cnt", [["3", "3 články"], ["6", "6 článkov"]], "Koľko ukázať") + '<div><button type="button" class="b b-soft b-sm" data-tab="blog">Otvoriť Blog</button></div>';
    case "kariera": return pageEd("kariera");
    case "kontakt":
      return '<p class="note">Adresu, telefón, hodiny a polohu na mape zmeníš v záložke <b>Kancelária</b>. Návštevník si vo formulári môže vybrať makléra.</p>' + head + '<div class="fields">' + fld("Text pod nadpisom", p + "l", { ta: 2 }) + "</div>" + onoff(p + "form", "Kontaktný formulár") + onoff(p + "map", "Mapa") + onoff(p + "hours", "Otváracie hodiny");
  }
  return "";
}
function galEd(path) {
  var a = get(path) || [];
  return '<div class="lab">Fotky (' + a.length + ')</div><div class="gthumbs">' + a.map(function (v, i) { return '<div><img src="' + esc(src(v, true)) + '" alt=""><button type="button" data-act="g-del:' + path + ":" + i + '" aria-label="Odstrániť fotku">' + SV(IC.x, 3) + "</button></div>"; }).join("") +
    '</div><div class="row-btns"><button type="button" class="b b-ink b-sm" data-act="g-up:' + path + '">Nahrať fotky</button><button type="button" class="b b-soft b-sm" data-act="g-lib:' + path + '">Z knižnice</button></div><p class="note">Naraz môžeš vybrať viac fotiek. Veľké fotky sa samy zmenšia.</p>';
}

var STR_POPIS = { ponuky: "všetky ponuky s filtrami, mapa a strážca", predane: "predané ponuky a recenzie", "o-nas": "O kancelárii, čísla, ocenenia, galéria, tím", sluzby: "služby, odhad hodnoty, hypotéka",
  vykup: "výkup s postupom a formulárom", tim: "makléri s kontaktmi", kariera: "práca u vás s formulárom", blog: "zoznam článkov a články", kontakt: "formulár, kontakty, mapa a tím" };
function paneStranky() {
  var s = S();
  var rows = KC.STRANKY.map(function (x) {
    var k = x[0], st = s.stranky[k] || {}, op = UI.open === "p-" + k, pop = STR_POPIS[k] + (k === "predane" && !((D && D.predane) || []).length ? " · na webe sa ukáže po prvom predaji" : "");
    return '<li class="srow' + (st.on ? "" : " off") + '"><div class="shd" style="padding-left:8px">' + prepinac('data-pg="' + k + '"', st.on, "Stránka " + x[1]) +
      '<button type="button" class="snm" data-act="pg-go:' + k + '"><b>' + esc(x[1]) + "</b><small>" + esc(pop) + "</small></button>" +
      '<label class="mini" title="V hlavnom menu"><input type="checkbox" data-pgm="' + k + '"' + (st.menu ? " checked" : "") + (st.on ? "" : " disabled") + ">menu</label>" +
      (k === "vykup" || k === "kariera" ? '<button type="button" class="ic" data-act="pg-open:' + k + '" aria-expanded="' + op + '" aria-label="Upraviť stránku" title="Upraviť stránku">' + SV(IC.edit, 2.2) + "</button>" : icb("pg-go:" + k, "oko", "Ukázať v ukážke")) +
      "</div>" + (op ? '<div class="sed">' + pageEd(k) + "</div>" : "") + "</li>";
  }).join("");
  var adr = WEB && WEB.domena && WEB.domena_pripojena ? WEB.domena + "/ponuky" : "…/stranka.html?m=" + (WEB ? WEB.adresa : "") + "&s=ponuky";
  return grp("Ako sa web prechádza", seg("podstranky", [["on", "Samostatné podstránky"], ["off", "Jedna dlhá stránka"]]) +
      '<p class="note">' + (s.podstranky === "on" ? "Menu otvára samostatné stránky s vlastnou adresou, napríklad <b>" + esc(adr) + "</b>. Google ich nájde lepšie a dajú sa posielať odkazom." : "Menu posúva na sekcie na úvodnej stránke. Výkup, kariéra a články majú aj tak vlastné stránky.") + "</p>") +
    grp("Stránky webu", '<p class="note">Vypnutá stránka sa na webe nezobrazí. Prepínačom <b>menu</b> ju dáš do hlavného menu. Obsah stránok sa skladá zo sekcií, ktoré upravuješ v záložke Sekcie.</p><ul class="secs">' + rows + "</ul>");
}

function paneBlog() {
  var s = S(), L = s.clanky.items;
  var list = L.map(function (a, i) {
    var p = "clanky.items." + i + ".", op = UI.otv === a.id;
    return '<li class="srow' + (a.on === false ? " off" : "") + '"><div class="shd" style="padding-left:8px">' + prepinac('data-cl="' + i + '"', a.on !== false, "Zobraziť článok") +
      '<button type="button" class="snm" data-act="cl-open:' + i + '"><b>' + esc(a.t || "Bez názvu") + "</b><small>" + esc(a.dt ? new Date(a.dt).toLocaleDateString("sk-SK") : "bez dátumu") + (a.slug ? " · /blog/" + esc(a.slug) : " · zatiaľ nezverejnený") + "</small></button>" +
      icb("cl-go:" + i, "oko", "Ukázať v ukážke") + '<button type="button" class="ic" data-act="cl-open:' + i + '" aria-expanded="' + op + '" aria-label="Upraviť článok" title="Upraviť článok">' + SV(IC.edit, 2.2) + "</button></div>" +
      (op ? '<div class="sed"><div class="fields">' + fld("Nadpis", p + "t", { ta: 2 }) + fld("Perex (krátky úvod)", p + "d", { ta: 3 }) + fld("Text článku (odseky oddeľ novým riadkom)", p + "text", { ta: 10 }) +
        fld("Dátum", p + "dt", { half: 1, type: "date" }) + fld("Adresa článku", p + "slug", { half: 1, ph: KC.slug(a.t) || "nazov-clanku" }) + "</div>" + obrBtns(p + "img") +
        '<div><button type="button" class="lbtn" data-act="cl-del:' + i + '" style="color:var(--c-danger)">Odstrániť článok</button></div></div>' : "") + "</li>";
  }).join("");
  return grp("Napísať článok s AI", '<div class="fields"><label class="f"><span>Téma článku</span><input id="aiTema" placeholder="napr. Ako pripraviť byt na predaj v zime"></label></div><div class="row-btns"><button type="button" class="b b-gold b-sm" data-act="ai-clanok">Napísať článok</button><span class="prog" id="aiClSt" role="status"></span></div><p class="note">Asistent napíše nadpis, perex aj text. Článok sa pridá ako vypnutý, kým ho neskontroluješ a nezapneš.</p>') +
    grp("Články <output>" + L.length + "</output>", '<p class="note">Články sú na stránke <b>Blog</b>, najnovšie aj na úvodnej stránke. Adresa článku sa nastaví pri prvom zverejnení a potom sa už nemení.</p><ul class="secs">' + list + '</ul><button type="button" class="addb" data-act="cl-add">+ Pridať článok</button>');
}

function paneKancelaria() {
  var s = S(), k = s.k, M = poradieMaklerov();
  var cnt = function (id) { return ((D && D.ponuky) || []).filter(function (p) { return p.makler_id === id; }).length; };
  var MOZ = [["kancelaria", "Kancelárii – " + (menoM(makler(WEB && WEB.makler_id)) || "administrátor")], ["rotacia", "Maklérom po rade"]].concat(M.map(function (m) { return [m.id, menoM(m)]; }));
  return grp("Logo", '<div class="logo-prev"><img src="' + esc(/^(https?:|data:)/.test(k.logo) ? k.logo : k.logo || "logo.png") + '" alt="Logo kancelárie"><div class="row-btns"><button type="button" class="b b-gold b-sm" data-act="logo-up">Nahrať logo</button>' + (k.logo !== KC.DEF.k.logo ? '<button type="button" class="b b-soft b-sm" data-act="logo-reset">Pôvodné</button>' : "") + '</div></div><p class="sub">Najlepšie PNG s priehľadným pozadím. Ikona v záložke prehliadača sa vytvorí z loga.</p>') +
    grp("Údaje kancelárie", '<div class="fields">' + fld("Názov kancelárie", "k.name") + fld("Adresa kancelárie", "k.addr") + fld("Telefón", "k.tel", { half: 1, type: "tel" }) + fld("E-mail", "k.mail", { half: 1, type: "email" }) + fld("Otváracie hodiny", "k.hours", { half: 1 }) + fld("IČO", "k.ico", { half: 1 }) + "</div>") +
    grp("Poloha na mape", '<div class="kmapa" id="kmapa"></div><p class="note">Posuň značku na miesto kancelárie. Mapa sa ukáže v kontakte a návštevník si otvorí trasu v Google Mapách.</p>') +
    grp("Makléri na webe", '<p class="note">Makléri a ich ponuky sa berú z Týpka. Vypnutý maklér sa na webe neukáže ani so svojimi ponukami a kontakty mu nechodia. Fotku, titul a text o maklérovi tu môžeš zmeniť len pre web kancelárie.</p>' +
      (M.length ? M.map(function (m, i) {
        var t = s.team[m.id] || {}, on = t.on !== false, f = t.foto || m.foto;
        return '<div class="agent-r' + (on ? "" : " off") + '"><span class="av">' + (f ? '<img src="' + esc(f) + '" alt="">' : esc(KC.initials(menoM(m)))) + "</span><div><b>" + esc(menoM(m)) + "</b><small>" + esc(pon(cnt(m.id))) + (m.admin ? " · admin" : "") + "</small></div>" +
          icb("tm-up:" + m.id, "up", "Vyššie", i === 0 ? " disabled" : "") + icb("tm-down:" + m.id, "down", "Nižšie", i === M.length - 1 ? " disabled" : "") + prepinac('data-agent="' + m.id + '"', on, "Zobraziť makléra " + menoM(m) + " na webe") +
          '<div class="rola"><input data-k="team.' + m.id + '.rola" value="' + esc(t.rola || "") + '" placeholder="' + esc(m.pohlavie === "zena" ? "Realitná maklérka" : "Realitný maklér") + '" aria-label="Titul makléra ' + esc(menoM(m)) + '"><button type="button" class="lbtn" data-act="tm-foto:' + m.id + '">Fotka</button>' + (t.foto ? '<button type="button" class="lbtn" data-act="tm-fotox:' + m.id + '">Pôvodná</button>' : "") + "</div>" +
          '<textarea class="bio" data-k="team.' + m.id + '.bio" rows="2" maxlength="700" placeholder="Pár viet o maklérovi pre jeho stránku na webe (nepovinné)" aria-label="Text o maklérovi ' + esc(menoM(m)) + '">' + esc(t.bio || "") + "</textarea></div>";
      }).join("") : '<p class="note">V Týpku zatiaľ nie sú aktívni makléri.</p>')) +
    grp("Komu chodia kontakty z webu", '<div class="fields">' + sel("Kontaktný formulár a ostatné", "smerovanie.predvolene", MOZ) + sel("Odhad hodnoty", "smerovanie.odhad", [["", "Ako ostatné"]].concat(MOZ), { half: 1 }) + sel("Výkup", "smerovanie.vykup", [["", "Ako ostatné"]].concat(MOZ), { half: 1 }) + sel("Strážca ponúk", "smerovanie.strazca", [["", "Ako ostatné"]].concat(MOZ)) + "</div>" +
      '<p class="note">Kontakt príde do zvončeka a do mobilu. Ak si návštevník vo formulári vyberie makléra, príde rovno jemu. <b>Maklérom po rade</b> znamená, že kontakt dostane maklér, ktorý ho dostal najdlhšie dávno. Záujem o prácu z Kariéry príde vždy kancelárii.</p>') +
    grp("Sociálne siete", '<p class="note">Ikony sa ukážu v kontakte a v pätičke. Prázdne sa nezobrazia.</p><div class="fields">' + [["fb", "Facebook", "facebook.com/kancelaria"], ["ig", "Instagram", "instagram.com/kancelaria"], ["yt", "YouTube", "youtube.com/@kancelaria"], ["li", "LinkedIn", "linkedin.com/company/kancelaria"], ["tt", "TikTok", "tiktok.com/@kancelaria"]].map(function (x) { return fld(x[1], "k.soc." + x[0], { ph: x[2] }); }).join("") + "</div>");
}
// poradie maklérov rovnaké ako na webe: podľa nastavenia, inak podľa Týpka
function poradieMaklerov() {
  var M = ((D && D.makleri) || []).slice(), ord = S().teamOrder || [], pov = M.map(function (m) { return m.id; });
  return M.sort(function (a, b) { var i = ord.indexOf(a.id), j = ord.indexOf(b.id); return (i < 0 ? 999 : i) - (j < 0 ? 999 : j) || pov.indexOf(a.id) - pov.indexOf(b.id); });
}
var KMAPA = null;
function kancMapa() {
  var el = $("kmapa"); if (!el) return;
  KC.leaflet().then(function () {
    if (!el.isConnected) return;
    var L = window.L, k = S().k, lat = +k.lat || 48.947233, lon = +k.lon || 20.56593;
    if (KMAPA) { try { KMAPA.remove(); } catch (e) { /* nič */ } }
    KMAPA = L.map(el, { scrollWheelZoom: false }).setView([lat, lon], 16);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(KMAPA);
    var mk = L.marker([lat, lon], { draggable: true }).addTo(KMAPA);
    mk.on("dragend", function () { var p = mk.getLatLng(); S().k.lat = Math.round(p.lat * 1e6) / 1e6; S().k.lon = Math.round(p.lng * 1e6) / 1e6; save(); KC.render(); toast("Poloha kancelárie je uložená."); });
  }, function () { el.innerHTML = '<p class="note" style="padding:12px">Mapu sa nepodarilo načítať.</p>'; });
}

function paneNapojenia() {
  var s = S(), t = KC.trk(), g = D && D.google;
  function st(ok, val, msgOk, msgNo, id) { return '<div class="stat ' + (ok ? "ok" : val ? "err" : "no") + '" id="st-' + id + '"><i></i>' + (ok ? msgOk : val ? msgNo : "Nie je nastavené") + "</div>"; }
  var gBox = g && g.hodnotenie ? '<div class="gstav"><b class="gv">' + String(g.hodnotenie).replace(".", ",") + "</b><div><b>" + esc(g.nazov || "Google profil") + "</b>" + esc(KC.fmt(g.pocet || 0)) + " recenzií · načítané " + esc(cas(g.kedy)) + (g.url ? ' · <a href="' + esc(g.url) + '" target="_blank" rel="noopener">otvoriť</a>' : "") + "</div></div>" : "";
  return grp("Recenzie z Google", gBox + '<div class="fields">' + fld("Odkaz na Google profil kancelárie", "rev.url", { ph: "odkaz z Google Máp, napr. maps.app.goo.gl/…" }) + "</div>" +
      '<div class="row-btns"><button type="button" class="b b-ink b-sm" data-act="g-nacitat">' + (g ? "Načítať znova" : "Načítať recenzie z Google") + "</button>" + (g ? '<button type="button" class="b b-soft b-sm" data-act="g-zrusit">Odpojiť</button>' : "") + '</div><p class="prog" id="gSt" role="status"></p>' +
      '<p class="note">Hodnotenie, počet a najnovšie recenzie sa načítajú z Google a raz denne sa samy obnovia. Ak odkaz nemáš, Týpek nájde kanceláriu podľa názvu a adresy.</p>' +
      (g ? "" : '<p class="note">Kým Google nie je napojený, hodnotenie a počet recenzií môžeš dopísať ručne:</p><div class="fields">' + fld("Hodnotenie", "rev.rating", { half: 1, ph: "napr. 4,9", mode: "decimal" }) + fld("Počet recenzií", "rev.count", { half: 1, ph: "napr. 120", mode: "numeric" }) + "</div>")) +
    grp("Ochrana osobných údajov (GDPR)", '<p class="note">Z týchto údajov sa sama vytvorí stránka <b>Ochrana osobných údajov</b>, súhlas pri formulároch a lišta cookies.</p><div class="fields">' + fld("Prevádzkovateľ (firma)", "gdpr.who") + fld("IČO", "gdpr.ico", { half: 1 }) + fld("E-mail pre otázky k údajom", "gdpr.mail", { half: 1, type: "email" }) + fld("Sídlo", "gdpr.addr") + fld("Zodpovedná osoba (nepovinné)", "gdpr.dpo", { ph: "meno a e-mail, ak ju máte" }) + "</div>" +
      onoff("gdpr.bar", "Lišta cookies") + '<div><button type="button" class="b b-soft b-sm" data-act="gdpr-show">Pozrieť stránku Ochrana osobných údajov</button></div>') +
    grp("Google Analytics", '<div class="fields">' + fld("Identifikátor merania", "ga", { ph: "G-XXXXXXXXXX", max: 20 }) + st(t.ga, String(s.ga || "").trim(), "Zapne sa až po súhlase návštevníka s cookies", "Identifikátor má tvar G- a písmená s číslami, napríklad G-1A2B3C4D5E", "ga") + '</div><p class="note">Nájdeš ho v Google Analytics v časti Správca → Toky údajov.</p>') +
    grp("Meta Pixel (Facebook)", '<div class="fields">' + fld("ID Pixelu", "px", { ph: "napr. 123456789012345", max: 24, mode: "numeric" }) + st(t.fb, String(s.px || "").trim(), "Zapne sa až po súhlase návštevníka s cookies", "ID Pixelu sú len číslice, napríklad 123456789012345", "px") + '</div><p class="note">Nájdeš ho v Meta Business Suite v Správcovi udalostí.</p>');
}
function refreshStat(k) {
  var t = KC.trk(), el = $("st-" + k); if (!el) return; var ok = k === "ga" ? t.ga : t.fb, val = String((k === "ga" ? S().ga : S().px) || "").trim();
  el.className = "stat " + (ok ? "ok" : val ? "err" : "no");
  el.innerHTML = "<i></i>" + (ok ? "Zapne sa až po súhlase návštevníka s cookies" : val ? (k === "ga" ? "Identifikátor má tvar G- a písmená s číslami, napríklad G-1A2B3C4D5E" : "ID Pixelu sú len číslice, napríklad 123456789012345") : "Nie je nastavené");
}

/* záložka Web a doména: zverejnenie, adresa, doména, zdieľanie, verzie */
var DOM_INFO = null, DOM_KONTROLA = null;
function paneWeb() {
  if (!WEB) return "";
  var s = S(), u = verejnyOdkaz(), V = WEB.verzie || [];
  var pub = '<div class="pubbox">' + (WEB.zverejnene_kedy ? "<b>Web je zverejnený</b><span class=\"sub\">Naposledy " + esc(cas(WEB.zverejnene_kedy)) + (ZMENY ? ". Máš zmeny, ktoré klienti ešte nevidia." : ". Klienti vidia aktuálnu verziu.") + '</span><div class="odkaz"><input readonly value="' + esc(u) + '" aria-label="Adresa webu"><button type="button" class="b b-soft b-sm" data-act="kop:' + esc(u) + '">Kopírovať</button><a class="b b-soft b-sm" href="' + esc(u) + '" target="_blank" rel="noopener">Otvoriť</a></div>'
    : "<b>Web zatiaľ nie je zverejnený</b><span class=\"sub\">Klienti ho uvidia po kliknutí na Zverejniť web. Dovtedy si ho pozrieš cez Náhľad.</span>") +
    '<div class="row-btns"><button type="button" class="b b-gold b-sm" data-act="zverejnit">' + (WEB.zverejnene_kedy ? "Zverejniť zmeny" : "Zverejniť web") + "</button>" + (WEB.zverejnene_kedy ? '<button type="button" class="b b-soft b-sm" data-act="skryt">Skryť web</button>' : "") + "</div></div>";
  var adr = '<div class="fields"><label class="f"><span>Adresa za app.realitnytypek.sk/stranka.html?m=</span><input id="adr" value="' + esc(WEB.adresa) + '" autocomplete="off" spellcheck="false"></label></div><div><button type="button" class="b b-soft b-sm" data-act="adresa">Zmeniť adresu</button></div><p class="note">Malé písmená bez diakritiky, číslice a pomlčky. Staré odkazy budú fungovať ďalej.</p>';
  var dt = s.share.title || (s.k.name + " | Realitná kancelária"), dd = s.share.desc || (s.hero.slides[0] && s.hero.slides[0].l) || "";
  var im = s.hero.slides[0] ? src(s.hero.slides[0].img, true) : "";
  return grp("Zverejnenie", pub) +
    grp("Adresa webu", adr) +
    grp("Vlastná doména", '<div id="fDomena" style="display:flex;flex-direction:column;gap:10px">' + domenaHtml() + "</div>") +
    grp("Zdieľanie na Facebooku a WhatsAppe", '<div class="share"><div class="im">' + (im ? '<img src="' + esc(im) + '" alt="">' : "") + '</div><div class="tx"><small>' + esc(WEB.domena && WEB.domena_pripojena ? WEB.domena : "app.realitnytypek.sk") + "</small><b>" + esc(dt) + "</b><span>" + esc(dd) + "</span></div></div>" +
      '<div class="fields">' + fld("Nadpis pri zdieľaní", "share.title", { ph: dt }) + fld("Popis pri zdieľaní", "share.desc", { ta: 2, ph: dd }) + '</div><p class="note">Nechaj prázdne a vyplní sa samo z názvu kancelárie a úvodu. Fotka je prvá titulná fotka. Každá podstránka a článok má vlastný nadpis.</p>') +
    grp("Staršie verzie", '<ul class="verzie">' + (V.length ? V.slice(0, 12).map(function (v, i) { return "<li><span>" + (i === 0 ? "<b>Aktuálne zverejnená</b> · " : "") + esc(cas(v.kedy)) + (v.kto ? " · " + esc(v.kto) : "") + '</span><button type="button" data-act="verzia:' + v.id + '">Vrátiť</button></li>'; }).join("") : '<li><span class="sub">Zatiaľ žiadne. Prvá verzia sa uloží pri zverejnení.</span></li>') + "</ul>");
}
function volajDomenu(telo) {
  return sb.functions.invoke("domena", { body: telo }).then(function (r) {
    var d = r.data || {};
    if (r.error) {
      if (r.error.context && r.error.context.json) return r.error.context.json().then(function (j) { throw new Error((j && j.chyba) || "Kontrola domény teraz nefunguje."); }, function () { throw new Error("Kontrola domény teraz nefunguje."); });
      throw new Error("Kontrola domény teraz nefunguje.");
    }
    if (d.chyba) throw new Error(d.chyba);
    return d;
  });
}
function nacitajDomInfo() {
  if (DOM_INFO || !WEB || !WEB.domena || WEB.domena_pripojena) return;
  volajDomenu({ akcia: "info" }).then(function (d) { DOM_INFO = d; if (UI.tab === "web" && $("fDomena") && !$("fDomena").contains(document.activeElement)) $("fDomena").innerHTML = domenaHtml(); }, function () {});
}
function domenaHtml() {
  var d = WEB.domena, ip = (DOM_INFO && DOM_INFO.ip && DOM_INFO.ip[0]) || "", k = DOM_KONTROLA || {};
  var kop = function (h) { return '<button type="button" class="b b-soft b-sm" data-act="kop:' + esc(h) + '">Kopírovať</button>'; };
  if (!d) return '<div class="fields"><label class="f"><span>Doména</span><input id="dom" value="" placeholder="napr. alphareality.sk" autocomplete="off" spellcheck="false"></label></div>' +
    '<div class="row-btns"><button type="button" class="b b-soft b-sm" data-act="domcheck">Overiť, či je voľná</button><button type="button" class="b b-ink b-sm" data-act="domsave">Použiť túto doménu</button></div>' +
    '<p class="dom-stav" id="domStav" role="status"></p><p class="note">Ak už doménu máte (napríklad alphareality.sk so starým webom), web na ňu prepneme až keď nastavíte záznamy v DNS. Dovtedy beží starý web aj tento na adrese vyššie.</p>' + PRESMEROVANIE;
  if (WEB.domena_pripojena) return '<div class="dom-krok hot"><b>Web beží na <a href="https://' + esc(d) + '/" target="_blank" rel="noopener">' + esc(d) + "</a></b><span class=\"sub\">Pripojené " + esc(cas(WEB.domena_pripojena)) + ". Odkazy teraz vedú na túto doménu, stará adresa funguje ďalej. Podstránky majú adresy ako " + esc(d) + "/ponuky.</span></div>" +
    '<div><button type="button" class="b b-soft b-sm" data-act="domdel">Odstrániť doménu</button></div>';
  var ok1 = !!WEB.domena_overena, ok2 = !!WEB.domena_smeruje;
  var krok = function (ok, n, nadpis, telo) { return '<div class="dom-krok' + (ok ? " hot" : "") + '"><b><span class="dk-n" aria-hidden="true">' + (ok ? "✓" : n) + "</span>" + nadpis + (ok ? ' <span class="dk-ok">hotovo</span>' : "") + "</b>" + telo + "</div>"; };
  var zaz = function (typ, naz, hod) { return '<div class="dk-zaz"><span><small>Typ</small><code>' + typ + '</code></span><span><small>Názov</small><code>' + esc(naz) + '</code></span><span class="dk-hod"><small>Hodnota</small><code>' + esc(hod) + "</code></span>" + kop(hod) + "</div>"; };
  return '<div class="dom-hlava"><b>' + esc(d) + '</b><button type="button" class="b b-soft b-sm" data-act="domdel">Zmeniť alebo odstrániť</button></div>' +
    krok(ok1, 1, "Overenie, že doména je vaša", '<span class="sub">U registrátora domény pridaj v nastavení DNS tento záznam:</span>' + zaz("TXT", "_realitnytypek", WEB.domena_token || "")) +
    krok(ok2, 2, "Nasmerovanie domény na web", '<span class="sub">Hlavný záznam domény nastav na náš server (starý A záznam nahraď). Starý web na doméne sa tým vypne.</span>' + zaz("A", "@ (prázdny názov)", ip || "načítavam…") + '<span class="sub">Aby fungovalo aj www.' + esc(d) + ":</span>" + zaz("CNAME", "www", d)) +
    krok(!!WEB.domena_ziadost && ok1 && ok2, 3, "Pripojenie", '<span class="sub">' + (ok1 && ok2 ? "Všetko je nastavené. Doména sa pripojí na hostingu a zapne sa zabezpečenie (https), zvyčajne do 1 pracovného dňa. Žiadosť nájdeš v aplikácii v časti Osobný web." : "Keď sú prvé dva kroky hotové, príde žiadosť o pripojenie do zvončeka.") + "</span>") +
    '<div class="row-btns" style="align-items:center"><button type="button" class="b b-ink b-sm" data-act="domover">Skontrolovať nastavenie</button><span class="dom-stav" id="domStav" role="status">' +
    (k.konflikt ? '<span class="zle">Túto doménu už overil iný web.</span>' : WEB.domena_kontrola ? "Naposledy skontrolované " + esc(cas(WEB.domena_kontrola)) : "") + "</span></div>" +
    '<p class="note">Zmena v DNS sa zvyčajne prejaví do hodiny, niekedy až do 24 hodín.</p>' + PRESMEROVANIE;
}
var PRESMEROVANIE = '<p class="note dom-pozor"><b>Pred prepnutím domény:</b> staré adresy webu (napríklad podstránky a ponuky na alphareality.sk, na ktoré vedú odkazy z Googlu a inzerátov) treba presmerovať na nové, aby web nestratil pozície vo vyhľadávaní. Presmerovanie treba pripraviť ešte pred zmenou záznamov v DNS.</p>';

/* ================================================================ panel – udalosti */
var panel = $("panel");
panel.addEventListener("click", function (e) {
  var t = e.target.closest("button"); if (!t || !panel.contains(t)) return;
  var d = t.dataset;
  if (d.tab) { UI.tab = d.tab; UI.open = ""; UI.add = false; renderPanel(); panel.scrollTop = 0; if (d.tab === "web") nacitajDomInfo(); return; }
  if (d.seg) {
    set(d.seg, d.v); if (d.seg === "hero.auto") KC.sched();
    if (/^hero\.slides\.(\d+)\.media$/.test(d.seg) && d.v === "video" && !get(d.seg.replace(/media$/, "video"))) { var ix = +d.seg.split(".")[2]; renderPanel(true); KC.render(); pickVideo(ix); return; }
    renderPanel(true); KC.render(); return;
  }
  if (d.tpl) { var T = KC.TPLS.find(function (x) { return x.id === d.tpl; }), s = S(); s.tpl = T.id; s.head = T.p.head; s.font = T.p.font; s.r = T.p.r; s.btn = T.p.btn; s.hero.align = T.p.align; s.hero.hh = T.p.hh; if (T.id === "luxusna") s.hero.dim = Math.max(s.hero.dim, 50); save(); renderPanel(true); KC.render(); toTop(); return; }
  if (d.set) { var x = KC.SETS.find(function (q) { return q.id === d.set; }), s2 = S(); s2.set = x.id; var c = KC.COLORS.find(function (q) { return q.c.toLowerCase() === x.a.toLowerCase(); }); s2.color = c ? c.id : "vlastna"; s2.cc = x.a; s2.b2 = x.b; s2.hcol = x.h; s2.bg = x.bg; save(); renderPanel(true); KC.render(); return; }
  if (d.col) { S().color = d.col; S().cc = KC.COLORS.find(function (q) { return q.id === d.col; }).c; S().set = ""; save(); renderPanel(true); KC.render(); return; }
  if (d.act) act(d.act, t);
});
panel.addEventListener("input", function (e) {
  var t = e.target;
  if (t.dataset.hex) { var h = okHex(t.value); if (h) { if (t.dataset.hex === "cc") { S().cc = h; S().color = "vlastna"; } else S().b2 = h; S().set = ""; save(); panel.querySelectorAll('[data-hex="' + t.dataset.hex + '"]').forEach(function (x) { if (x !== t) x.value = h; }); later(); } return; }
  var k = t.dataset.k; if (!k) return;
  var v = t.dataset.num !== undefined ? (t.value === "" ? "" : Number(t.value)) : t.value;
  set(k, v);
  var out = t.closest(".grp") && t.closest(".grp").querySelector("h2 output");
  if (k === "r" && out) out.textContent = v + " px";
  if (k === "hero.dim" && out) out.textContent = v + " %";
  if (k === "hero.int") { $("intOut").textContent = v + " s"; KC.sched(); }
  if (k === "ga" || k === "px") refreshStat(k);
  var si = t.closest("[data-slidei]"); if (si && +si.dataset.slidei !== K.UI.slide) KC.showSlide(+si.dataset.slidei);
  later();
});
panel.addEventListener("change", function (e) {
  var t = e.target, s = S();
  if (t.dataset.on) { s.on[t.dataset.on] = t.checked; save(); t.closest(".srow").classList.toggle("off", !t.checked); KC.render(); return; }
  if (t.dataset.agent) { var tm = s.team[t.dataset.agent] = s.team[t.dataset.agent] || {}; tm.on = t.checked; save(); K.UI.pf.m = "vse"; renderPanel(true); KC.render(); return; }
  if (t.dataset.pg) { s.stranky[t.dataset.pg].on = t.checked; if (!t.checked && K.page === t.dataset.pg) KC.go("domov"); save(); renderPanel(true); KC.render(); fillPageSel(); return; }
  if (t.dataset.pgm) { s.stranky[t.dataset.pgm].menu = t.checked; save(); KC.render(); return; }
  if (t.dataset.cl !== undefined) { s.clanky.items[+t.dataset.cl].on = t.checked; save(); renderPanel(true); KC.render(); return; }
  if (t.dataset.rp !== undefined && t.dataset.k) { set(t.dataset.k, t.value); renderPanel(true); KC.render(); return; }
  if (t.dataset.hex && t.type === "text" && !okHex(t.value)) t.value = get(t.dataset.hex) || "";
  if (t.dataset.k && /^clanky\.items\.\d+\.(t|dt|slug)$/.test(t.dataset.k)) { if (/\.slug$/.test(t.dataset.k)) { set(t.dataset.k, KC.slug(t.value)); t.value = get(t.dataset.k); } renderPanel(true); }
});
panel.addEventListener("focusin", function (e) { var si = e.target.closest && e.target.closest("[data-slidei]"); if (si) { K.UI.pause = true; if (+si.dataset.slidei !== K.UI.slide) KC.showSlide(+si.dataset.slidei); } });
panel.addEventListener("focusout", function (e) { if (e.target.closest && e.target.closest("[data-slidei]")) { K.UI.pause = false; KC.sched(); } });

/* presúvanie sekcií ťahaním */
var dragK = null;
panel.addEventListener("mousedown", function (e) { var g = e.target.closest && e.target.closest(".grip"); if (g) g.closest(".srow").draggable = true; });
document.addEventListener("mouseup", function () { panel.querySelectorAll(".srow[draggable]").forEach(function (r) { if (!dragK) r.removeAttribute("draggable"); }); });
panel.addEventListener("dragstart", function (e) { var r = e.target.closest && e.target.closest(".srow[data-row]"); if (!r) return; dragK = r.dataset.row; r.classList.add("drag"); e.dataTransfer.effectAllowed = "move"; try { e.dataTransfer.setData("text/plain", dragK); } catch (x) { /* nič */ } });
panel.addEventListener("dragover", function (e) { var r = e.target.closest && e.target.closest(".srow[data-row]"); if (!r || !dragK) return; e.preventDefault(); panel.querySelectorAll(".srow.over").forEach(function (x) { x.classList.remove("over"); }); if (r.dataset.row !== dragK) r.classList.add("over"); });
panel.addEventListener("drop", function (e) { var r = e.target.closest && e.target.closest(".srow[data-row]"); if (!r || !dragK) return; e.preventDefault(); var to = r.dataset.row; if (to !== dragK) { var o = S().order.filter(function (k) { return k !== dragK; }); o.splice(o.indexOf(to), 0, dragK); S().order = o; save(); } dragK = null; renderPanel(true); KC.render(); });
panel.addEventListener("dragend", function () { dragK = null; panel.querySelectorAll(".srow").forEach(function (x) { x.classList.remove("drag", "over"); x.removeAttribute("draggable"); }); });

function novaSnimka(v) { return { media: "foto", img: v, video: "", t: "Nový nadpis titulnej fotky", l: "Krátky text pod nadpisom.", b: "Viac informácií", go: "kontakt", u: "", b2: "", go2: "ponuky", u2: "" }; }
function pickVideo(i) {
  pickImg(function (v) {
    var sl = S().hero.slides[i]; sl.media = "video"; sl.video = v;
    var lib2 = KC.VIDEA.find(function (x) { return x[0] === v; }); if (lib2 && (!sl.img || KC.LIB.some(function (q) { return q[0] === sl.img; }))) sl.img = lib2[2];
    save(); renderPanel(true); KC.render(); KC.showSlide(i); toTop();
  }, { video: true });
}
function act(a, el) {
  var p = a.split(":"), n = p[0], x = p.slice(1).join(":"), s = S();
  var y = p[2];
  if (n === "mix") { var T = KC.TPLS[Math.floor(Math.random() * KC.TPLS.length)], st = KC.SETS[Math.floor(Math.random() * KC.SETS.length)]; s.tpl = T.id; s.head = T.p.head; s.r = T.p.r; s.btn = T.p.btn; s.hero.align = T.p.align; s.hero.hh = T.p.hh; s.font = KC.FONTS[Math.floor(Math.random() * KC.FONTS.length)].id; s.set = st.id; var c = KC.COLORS.find(function (q) { return q.c.toLowerCase() === st.a.toLowerCase(); }); s.color = c ? c.id : "vlastna"; s.cc = st.a; s.b2 = st.b; s.hcol = st.h; s.bg = st.bg; save(); renderPanel(true); KC.render(); toTop(); return; }
  if (n === "b2clear") { s.b2 = ""; save(); renderPanel(true); KC.render(); return; }
  if (n === "sl-add") { pickImg(function (v) { s.hero.slides.push(novaSnimka(v)); K.UI.slide = s.hero.slides.length - 1; save(); renderPanel(true); KC.render(); toTop(); }, { multi: function (list) { list.forEach(function (v) { s.hero.slides.push(novaSnimka(v)); }); K.UI.slide = s.hero.slides.length - 1; save(); renderPanel(true); KC.render(); toTop(); } }); return; }
  if (n === "sl-up" || n === "sl-down") { move(s.hero.slides, +x, n === "sl-up" ? -1 : 1); K.UI.slide = Math.max(0, Math.min(s.hero.slides.length - 1, +x + (n === "sl-up" ? -1 : 1))); save(); renderPanel(true); KC.render(); return; }
  if (n === "sl-del") { if (s.hero.slides.length <= 1) { toast("Aspoň jedna titulná fotka musí ostať."); return; } s.hero.slides.splice(+x, 1); K.UI.slide = 0; save(); renderPanel(true); KC.render(); return; }
  if (n === "sl-img") { pickImg(function (v) { s.hero.slides[+x].img = v; save(); renderPanel(true); KC.render(); KC.showSlide(+x); }); return; }
  if (n === "sl-vid") { pickVideo(+x); return; }
  if (n === "sl-show") { if (K.page !== "domov") KC.go("domov"); KC.showSlide(+x); toTop(); return; }
  if (n === "sec-open") { UI.open = UI.open === x ? "" : x; renderPanel(true); if (UI.open) ukazSekciu(x); return; }
  if (n === "sec-up" || n === "sec-down") { var i = s.order.indexOf(x); move(s.order, i, n === "sec-up" ? -1 : 1); save(); renderPanel(true); KC.render(); ukazSekciu(x); return; }
  if (n === "c-addopen") { UI.add = true; renderPanel(true); return; }
  if (n === "c-addx") { UI.add = false; renderPanel(true); return; }
  if (n === "c-add") { var id = "c" + Date.now().toString(36); s.custom[id] = { typ: x, t: { text: "Nadpis sekcie", txph: "Nadpis sekcie s fotkou", fotky: "Fotky", vyzva: "Výzva pre návštevníkov" }[x], text: x === "fotky" ? "" : "Sem napíš text sekcie. Odseky oddeľ novým riadkom.", img: "dom-obyvacka", imgs: x === "fotky" ? ["byt-obyvacka", "dom-zahrada", "chata"] : [], b: x === "vyzva" ? "Ozvite sa nám" : "", go: "kontakt", u: "", bgs: x === "vyzva" ? "col" : "", menu: "off", ml: "" };
    var ki = s.order.indexOf("kontakt"); s.order.splice(ki < 0 ? s.order.length : ki, 0, id); s.on[id] = true; UI.add = false; UI.open = id; save(); renderPanel(true); KC.render(); ukazSekciu(id); return; }
  if (n === "c-del") { if (!confirm("Odstrániť túto sekciu?")) return; delete s.custom[x]; delete s.on[x]; s.order = s.order.filter(function (k) { return k !== x; }); s.hero.slides.forEach(function (q) { if (q.go === x) q.go = "kontakt"; if (q.go2 === x) q.go2 = "kontakt"; }); UI.open = ""; save(); renderPanel(true); KC.render(); return; }
  if (n === "ls-add") { var arr = get(x.split(":")[0]), tm = { "cisla.rows": { typ: "vlastne", n: "", t: "" }, "sluzby.items": { ic: "dom", t: "Nová služba", d: "Krátky popis služby." }, "ocenenia.items": { t: "Názov ocenenia", y: String(new Date().getFullYear()), d: "Kto ho udelil" } }[x.split(":")[0]]; arr.push(tm); save(); renderPanel(true); KC.render(); return; }
  if (n === "ls-del") { get(p[1]).splice(+y, 1); save(); renderPanel(true); KC.render(); return; }
  if (n === "ls-up") { move(get(p[1]), +y, -1); save(); renderPanel(true); KC.render(); return; }
  if (n === "g-del") { get(p[1]).splice(+y, 1); save(); renderPanel(true); KC.render(); return; }
  if (n === "g-up") { vyberSubory({ max: 1920 }, function (list) { var g = get(x); g.push.apply(g, list); save(); renderPanel(true); KC.render(); toast(list.length === 1 ? "Fotka pridaná." : "Pridané fotky: " + list.length); }); return; }
  if (n === "g-lib") { pickImg(function (v) { get(x).push(v); save(); renderPanel(true); KC.render(); }); return; }
  if (n === "img") { pickImg(function (v) { set(x, v); renderPanel(true); KC.render(); }); return; }
  if (n === "logo-up") { vyberSubory({ single: true, png: true, max: 800 }, function (l) { s.k.logo = l[0]; save(); renderPanel(true); KC.render(); }); return; }
  if (n === "logo-reset") { s.k.logo = KC.DEF.k.logo; save(); renderPanel(true); KC.render(); return; }
  if (n === "tm-foto") { vyberSubory({ single: true, max: 900 }, function (l) { (s.team[x] = s.team[x] || {}).foto = l[0]; save(); renderPanel(true); KC.render(); }); return; }
  if (n === "tm-fotox") { if (s.team[x]) delete s.team[x].foto; save(); renderPanel(true); KC.render(); return; }
  if (n === "tm-up" || n === "tm-down") {
    var ids = poradieMaklerov().map(function (m) { return m.id; }); move(ids, ids.indexOf(x), n === "tm-up" ? -1 : 1); s.teamOrder = ids; save(); renderPanel(true); KC.render(); return;
  }
  if (n === "pg-open") { UI.open = UI.open === "p-" + x ? "" : "p-" + x; renderPanel(true); if (UI.open) KC.go(x); return; }
  if (n === "pg-go") { if (!(s.stranky[x] || {}).on) { toast("Stránka je vypnutá. Zapni ju prepínačom."); return; } KC.go(x); return; }
  if (n === "cl-open") { var a1 = s.clanky.items[+x]; UI.otv = UI.otv === a1.id ? "" : a1.id; renderPanel(true); return; }
  if (n === "cl-go") { var a2 = s.clanky.items[+x]; if (a2.on === false) { toast("Článok je vypnutý. Zapni ho prepínačom."); return; } if (!(s.stranky.blog || {}).on) { toast("Stránka Blog je vypnutá v záložke Stránky."); return; } KC.go("blog", KC.slugC(a2)); return; }
  if (n === "cl-add") { var na = { id: "a" + Date.now().toString(36), t: "Nový článok", d: "Krátky úvod článku.", text: "Sem napíš text článku. Odseky oddeľ novým riadkom.", img: "byt-obyvacka", dt: isoDen(new Date()), on: true }; s.clanky.items.unshift(na); UI.otv = na.id; save(); renderPanel(true); KC.render(); return; }
  if (n === "cl-del") { if (!confirm("Odstrániť tento článok?")) return; s.clanky.items.splice(+x, 1); save(); renderPanel(true); if (K.page === "blog") KC.go("blog"); else KC.render(); return; }
  if (n === "ai") { otvorAi(); return; }
  if (n === "ai-clanok") { aiClanok(); return; }
  if (n === "g-nacitat") { googleNacitat(); return; }
  if (n === "g-zrusit") { if (confirm("Odpojiť Google recenzie? Na webe sa prestanú zobrazovať.")) googleZrusit(); return; }
  if (n === "gdpr-show") { K.UI.ovl = "gdpr"; KC.render(); return; }
  if (n === "kop") { kopiruj(x, "Skopírované."); return; }
  if (n === "zverejnit") { zverejnit(); return; }
  if (n === "skryt") { if (confirm("Skryť web kancelárie? Klienti ho neuvidia, kým ho znova nezverejníš.")) rpc("zrusit_zverejnenie_webu_kancelarie").then(nacitajWeb).then(function () { renderPanel(true); updPub(); toast("Web je skrytý."); }).catch(function (e2) { toast(chybaText(e2), true); }); return; }
  if (n === "adresa") { zmenAdresu(); return; }
  if (n === "domcheck" || n === "domsave") { domena(n === "domsave"); return; }
  if (n === "domover") { domOver(el); return; }
  if (n === "domdel") { if (confirm(WEB.domena_pripojena ? "Odstrániť doménu " + WEB.domena + "? Web pobeží znova na adrese " + WEB.adresa + "." : "Odstrániť doménu " + WEB.domena + "? Nastavenie začneš odznova.")) ulozDomenu(null); return; }
  if (n === "verzia") { obnovVerziu(+x); return; }
}
function ukazSekciu(k) {
  var naUvode = S().on[k];
  if (naUvode && K.page !== "domov") KC.go("domov", "", k);
  else if (naUvode) KC.goSec(k);
}

/* ================================================================ ukážka webu */
function updAddr() {
  if (!WEB) return;
  var base = WEB.domena && WEB.domena_pripojena ? WEB.domena + "/" : "app.realitnytypek.sk/stranka.html?m=" + WEB.adresa;
  var pg = K.page !== "domov" ? (WEB.domena && WEB.domena_pripojena ? K.page + (K.sub ? "/" + K.sub : "") : "&s=" + K.page + (K.sub ? "&c=" + K.sub : "")) : "";
  $("addrTx").textContent = base + pg;
  var ps = $("pageSel"); if (ps && ps.value !== K.page) ps.value = K.page;
}
function fillPageSel() {
  var s = S();
  $("pageSel").innerHTML = '<option value="domov">Úvod</option>' + KC.STRANKY.filter(function (x) { return (s.stranky[x[0]] || {}).on; }).map(function (x) { return '<option value="' + x[0] + '">' + esc(x[1]) + "</option>"; }).join("");
  $("pageSel").value = K.page;
}
$("pageSel").addEventListener("change", function () { KC.go(this.value); });
var rq = 0;
function later() { cancelAnimationFrame(rq); rq = requestAnimationFrame(function () { KC.render(); }); }
function all() { renderPanel(true); fillPageSel(); KC.render(); updAddr(); }
function toTop() { $("stage").scrollTo({ top: 0, behavior: "smooth" }); }
// v ukážke sa telefón a e-mail neotvárajú
$("site").addEventListener("click", function (e) {
  var a = e.target.closest && e.target.closest("a[href]"); if (!a) return;
  var h = a.getAttribute("href");
  if (/^(tel|mailto):/i.test(h)) { e.preventDefault(); e.stopPropagation(); toast("Na webe sa otvorí: " + h.replace(/^(tel|mailto):/i, "")); }
}, true);
function renderDev() { $("devSeg").innerHTML = [["pc", "Počítač"], ["tablet", "Tablet"], ["mobil", "Mobil"]].map(function (x) { return '<button type="button" data-dev="' + x[0] + '" aria-pressed="' + (UI.dev === x[0]) + '">' + x[1] + "</button>"; }).join(""); }
$("devSeg").addEventListener("click", function (e) { var b = e.target.closest("[data-dev]"); if (!b) return; UI.dev = b.dataset.dev; K.UI.menu = false; $("frame").className = "frame dev-" + UI.dev; renderDev(); measure(); KC.render(); $("stage").scrollTop = 0; });
$("fullBtn").addEventListener("click", function () { var a = $("app"), on = !a.classList.contains("full"); a.classList.toggle("full", on); this.setAttribute("aria-pressed", String(on)); this.textContent = on ? "Späť na úpravy" : "Na celú šírku"; measure(); KC.render(); });
function avail() { var a = $("app"), top = a.getBoundingClientRect().top + window.scrollY; document.documentElement.style.setProperty("--avail", Math.max(560, window.innerHeight - top - 16) + "px"); }
function measure() { avail(); vhPx = Math.max(520, Math.min(980, $("stage").clientHeight - (UI.dev === "pc" ? 0 : 36))); }
var rz = 0; window.addEventListener("resize", function () { clearTimeout(rz); rz = setTimeout(function () { var o = vhPx; measure(); if (o !== vhPx) KC.render(); }, 150); });
$("undo").addEventListener("click", undo);
$("redo").addEventListener("click", redo);
document.addEventListener("keydown", function (e) {
  if (!(e.ctrlKey || e.metaKey) || !WEB) return;
  var t = e.target, inField = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
  if (inField) return;
  if (e.key === "z" && !e.shiftKey) { e.preventDefault(); undo(); } else if (e.key === "y" || (e.key === "z" && e.shiftKey) || e.key === "Z") { e.preventDefault(); redo(); }
});

/* ================================================================ zverejnenie, adresa, doména, verzie */
function nacitajWeb() { return rpc("web_kancelarie").then(function (w) { WEB = w; ZMENY = !!w.zmeny_od_zverejnenia; updPub(); return w; }); }
function updPub() {
  if (!WEB) return;
  var b = $("zverejnit");
  b.textContent = WEB.zverejnene_kedy ? (ZMENY ? "Zverejniť zmeny" : "Zverejnené") : "Zverejniť web";
  $("nahladBtn").href = nahladOdkaz();
}
function kontrola() {
  var s = S(), out = [], D0 = D || {};
  if (!String(s.gdpr.who || "").trim() || !String(s.gdpr.mail || "").trim()) out.push(["Doplň prevádzkovateľa a e-mail v ochrane osobných údajov.", "napojenia"]);
  if (!String(s.k.tel || "").trim() && !String(s.k.mail || "").trim()) out.push(["Chýba telefón aj e-mail kancelárie.", "kancelaria"]);
  var vzor = KC.CLANKY_DEF.map(function (a) { return a.id; });
  if ((s.stranky.blog || {}).on && s.clanky.items.some(function (a) { return a.on !== false && vzor.indexOf(a.id) >= 0; })) out.push(["V blogu sú ukážkové články. Skontroluj ich, uprav alebo vypni.", "blog"]);
  if (s.on.recenzie && !(D0.google && D0.google.hodnotenie) && !String(s.rev.rating || "").trim() && !((D0.recenzie || {}).pocet)) out.push(["Recenzie nie sú napojené. Napoj Google recenzie alebo sekciu vypni.", "napojenia"]);
  if (s.on.ocenenia && !s.ocenenia.items.length) out.push(["Sekcia Ocenenia je zapnutá, ale je prázdna.", "sekcie"]);
  if (!(D0.ponuky || []).length) out.push(["V Týpku zatiaľ nie sú aktívne ponuky. Na webe sa namiesto nich ukáže výzva zapnúť strážcu ponúk.", "", 1]);
  return out;
}
function zverejnit(ajTak) {
  if (!ajTak) {
    var k = kontrola(), vaz = k.filter(function (x) { return !x[2]; });
    if (vaz.length) {
      $("pubL").innerHTML = k.map(function (x) { return '<li class="' + (x[2] ? "info" : "") + '"><span>' + esc(x[0]) + "</span>" + (x[1] ? '<button type="button" class="b b-soft b-sm" data-pzt="' + x[1] + '">Upraviť</button>' : "") + "</li>"; }).join("");
      $("pubD").showModal(); return;
    }
  }
  var b = $("zverejnit"); b.disabled = true; b.textContent = "Zverejňujem…";
  NEULOZENE = true;
  ulozTeraz().then(function () { return rpc("zverejnit_web_kancelarie", { p_koncept: cisty(true) }); }).then(nacitajWeb).then(function () {
    ZMENY = false; updPub(); if (UI.tab === "web" || UI.tab === "blog") renderPanel(true);
    toast("Web kancelárie je zverejnený. Klienti vidia aktuálnu verziu.");
    ponukniFarbyKarty();
  }).catch(function (e) { toast("Zverejnenie sa nepodarilo: " + chybaText(e), true); updPub(); }).then(function () { b.disabled = false; });
}
$("zverejnit").addEventListener("click", function () { zverejnit(); });

/* farby karty nehnuteľnosti (stránka ponuky): po zverejnení webu sa opýta, či rovnaké farby nastaviť aj na kartu */
function farbyPreKartu() {
  var S = K.S, col = KC.COLORS.find(function (c) { return c.id === S.color; });
  return { a: String(S.color === "vlastna" && KC.isHex(S.cc) ? S.cc : (col ? col.c : "#DAB967")).toLowerCase(), b: String(KC.isHex(S.b2) ? S.b2 : "#1E2A35").toLowerCase(),
    bg: ["svetle", "kremove", "tmave"].indexOf(S.bg) >= 0 ? S.bg : "svetle", zdroj: "web" };
}
function ponukniFarbyKarty() {
  var f = farbyPreKartu(), sig = f.a + f.b + f.bg;
  rpc("karta_ponuky").then(function (k) {
    var t = k && k.farby;
    if (t && t.a === f.a && (t.b || "") === f.b && t.bg === f.bg) return;
    try { if (localStorage.getItem("typek-karta-farby-nie") === sig) return; } catch (x) { /* bez úložiska */ }
    var d = document.createElement("dialog"); d.className = "dlg"; d.setAttribute("aria-labelledby", "kfH");
    d.innerHTML = '<h2 id="kfH">Rovnaké farby aj na karte nehnuteľnosti?</h2>' +
      '<p class="sub">Web kancelárie má iné farby ako stránka ponuky, ktorú posielate klientom. Chceš na ňu nastaviť farby webu, aby všetko ladilo? Neskôr ich zmeníš v Správe → Karta nehnuteľnosti.</p>' +
      '<div class="dlg-btns"><button type="button" class="b b-soft b-sm" data-kf-nie>Nie, nechať</button><button type="button" class="b b-gold b-sm" data-kf-ano>Áno, nastaviť</button></div>';
    document.body.appendChild(d);
    d.addEventListener("close", function () { d.remove(); });
    d.addEventListener("click", function (e) {
      if (e.target.closest("[data-kf-nie]")) { try { localStorage.setItem("typek-karta-farby-nie", sig); } catch (x) { /* nič */ } d.close(); }
      else if (e.target.closest("[data-kf-ano]")) {
        d.close();
        rpc("nastavit_farby_karty", { p_farby: f }).then(function () { toast("Karta nehnuteľnosti má teraz rovnaké farby ako web."); }, function (x) { toast(chybaText(x), true); });
      } else if (e.target === d) d.close();
    });
    d.showModal();
  }).catch(function () { /* karta sa nedá načítať – nič sa nepýta */ });
}
$("pubD").addEventListener("click", function (e) {
  var d = $("pubD"), b = e.target.closest("button");
  if (e.target === d || (b && b.dataset.dlgx !== undefined)) { d.close(); return; }
  if (b && b.dataset.pzt) { d.close(); UI.tab = b.dataset.pzt; UI.open = ""; renderPanel(); return; }
});
$("pubAjTak").addEventListener("click", function () { $("pubD").close(); zverejnit(true); });
function zmenAdresu() {
  var v = String(($("adr") || {}).value || "").trim().toLowerCase();
  if (!v || v === WEB.adresa) return;
  rpc("zmenit_adresu_web_kancelarie", { p_adresa: v }).then(function (r) { WEB.adresa = r.adresa; renderPanel(true); updAddr(); updPub(); K.adresa = r.adresa; toast("Adresa webu je zmenená. Staré odkazy fungujú ďalej."); })
    .catch(function (e) { toast(chybaText(e), true); });
}
function domena(ulozit) {
  var d = String(($("dom") || {}).value || "").trim().toLowerCase().replace(/^(https?:\/\/)?(www\.)?/, "").replace(/\/.*$/, "");
  var st = $("domStav");
  if (!d) { st.textContent = "Napíš doménu v tvare alphareality.sk"; return; }
  if (ulozit) { ulozDomenu(d); return; }
  st.className = "dom-stav"; st.textContent = "Overujem…";
  volajDomenu({ akcia: "dostupnost", domena: d }).then(function (r) {
    st.className = "dom-stav " + (r.volna ? "ok" : "");
    st.textContent = r.volna ? "Doména " + r.domena + " je voľná. Zaregistruj ju u registrátora a potom klikni na Použiť túto doménu." : r.volna === false ? "Doména " + r.domena + " je už zaregistrovaná. Ak je vaša, klikni na Použiť túto doménu." : "Dostupnosť sa nepodarilo zistiť. Ak doménu máte, pokračuj.";
  }).catch(function (e) { st.className = "dom-stav zle"; st.textContent = chybaText(e); });
}
function ulozDomenu(d) {
  rpc("ulozit_domenu_web_kancelarie", { p_domena: d }).then(function (r) {
    return nacitajWeb().then(function () { DOM_KONTROLA = null; DOM_INFO = null; toast(r.domena ? "Doména je uložená. Teraz nastav záznamy v DNS." : "Doména je odstránená."); renderPanel(true); updAddr(); nacitajDomInfo(); });
  }).catch(function (e) { toast(chybaText(e), true); });
}
function domOver(b) {
  b.disabled = true; var st = $("domStav"); if (st) st.textContent = "Kontrolujem DNS…";
  volajDomenu({ akcia: "overit", kancelaria: true }).then(function (r) {
    DOM_KONTROLA = r; return nacitajWeb().then(function () { renderPanel(true); toast("Vlastníctvo " + (r.overena ? "✓" : "✗") + ", smerovanie " + (r.smeruje ? "✓" : "✗")); });
  }).catch(function (e) { if (st) { st.className = "dom-stav zle"; st.textContent = chybaText(e); } }).then(function () { b.disabled = false; });
}
function obnovVerziu(id) {
  if (!confirm("Vrátiť túto verziu do rozpracovaného webu? Klienti ju uvidia až po zverejnení.")) return;
  ulozTeraz().then(function () { return rpc("obnovit_verziu_webu", { p_verzia: id }); }).then(function (o) {
    histPush(); K.S = KC.merge(o); ZMENY = true; all(); histPush(); toast("Verzia je vrátená do rozpracovaného webu. Klienti ju uvidia po zverejnení.");
  }).catch(function (e) { toast(chybaText(e), true); });
}

/* ================================================================ Google recenzie */
function googleChyba(r) {
  if (!r.error) return Promise.resolve((r.data && r.data.chyba) || "");
  var ctx = r.error.context;
  if (ctx && ctx.status === 404) return Promise.resolve("Načítanie Google recenzií ešte nie je zapnuté na serveri (funkcia google-recenzie). Dovtedy dopíš hodnotenie a počet ručne.");
  if (ctx && ctx.json) return ctx.json().then(function (j) { return (j && j.chyba) || "Google recenzie sa nepodarilo načítať."; }, function () { return "Google recenzie sa nepodarilo načítať."; });
  return Promise.resolve("Google recenzie sa nepodarilo načítať. Skontroluj pripojenie.");
}
function googleNacitat() {
  var st = $("gSt"), s = S(); if (st) st.textContent = "Hľadám kanceláriu na Google…";
  ulozTeraz().catch(function () {}).then(function () {
    return sb.functions.invoke("google-recenzie", { body: { akcia: "nacitat", odkaz: String(s.rev.url || "").trim(), text: [s.k.name, s.k.addr].filter(Boolean).join(", ") } });
  }).then(function (r) {
    return googleChyba(r).then(function (ch) {
      if (ch) { if (st) st.textContent = ch; toast(ch, true); return; }
      D.google = r.data.google; renderPanel(true); KC.render();
      toast("Google recenzie sú napojené: " + String(D.google.hodnotenie || "").replace(".", ",") + " z 5, " + (D.google.pocet || 0) + " recenzií.");
    });
  }).catch(function (e) { if (st) st.textContent = chybaText(e); });
}
function googleZrusit() {
  sb.functions.invoke("google-recenzie", { body: { akcia: "zrusit" } }).then(function (r) {
    return googleChyba(r).then(function (ch) { if (ch) { toast(ch, true); return; } D.google = null; renderPanel(true); KC.render(); toast("Google recenzie sú odpojené."); });
  });
}

/* ================================================================ texty od AI asistenta */
function aiVolaj(prompt) {
  return sb.functions.invoke("asistent", { body: { spravy: [{ role: "user", content: prompt }] } }).then(function (r) {
    var d = r.data || {};
    if (r.error || d.chyba) {
      if (!d.chyba && r.error && r.error.context && r.error.context.json) return r.error.context.json().then(function (j) { throw new Error((j && j.chyba) || "AI asistent teraz neodpovedá."); });
      throw new Error(d.chyba || "AI asistent teraz neodpovedá.");
    }
    var m = String(d.text || "").match(/\{[\s\S]*\}/); if (!m) throw new Error("Odpoveď sa nepodarilo spracovať. Skús to ešte raz.");
    return JSON.parse(m[0]);
  });
}
function renderTone() { $("aiTone").innerHTML = ["Priateľský", "Profesionálny", "Luxusný"].map(function (t) { return '<button type="button" class="ech" data-tone="' + t + '" aria-pressed="' + (UI.aiTone === t) + '">' + t + "</button>"; }).join(""); }
function otvorAi() { renderTone(); $("aiSt").textContent = ""; $("aiD").showModal(); }
$("aiD").addEventListener("click", function (e) {
  var d = $("aiD"), b = e.target.closest("button");
  if (e.target === d || (b && b.dataset.dlgx !== undefined)) { d.close(); return; }
  if (b && b.dataset.tone) { UI.aiTone = b.dataset.tone; renderTone(); }
});
$("aiGo").addEventListener("click", function () {
  var s = S(), q1 = $("aiQ1").value.trim(), q2 = $("aiQ2").value.trim(), q3 = $("aiQ3").value.trim();
  if (!q1 && !q2 && !q3) { $("aiSt").textContent = "Odpovedz aspoň na jednu otázku."; $("aiQ1").focus(); return; }
  $("aiGo").disabled = true; $("aiSt").textContent = "Asistent píše texty…";
  var sluzby = s.sluzby.items.map(function (x) { return x.t; });
  var prompt = "Napíš texty na web realitnej kancelárie. Odpovedz IBA jedným JSON objektom, bez ďalšieho textu.\n\nÚdaje:\n- Kancelária: " + s.k.name + "\n- Adresa: " + s.k.addr +
    "\n- Čím je výnimočná: " + (q1 || "neuvedené") + "\n- Kde pôsobí a odkedy: " + (q2 || "neuvedené") + "\n- Čo oceňujú klienti: " + (q3 || "neuvedené") + "\n- Služby: " + sluzby.join(", ") + "\n- Tón: " + UI.aiTone.toLowerCase() +
    "\n\nPravidlá: spisovná slovenčina, bez anglicizmov, bez emoji, bez výkričníkov. Klientom vykaj, píš v množnom čísle za kanceláriu (my). Nepridávaj čísla ani fakty, ktoré nie sú v údajoch. Krátke konkrétne vety, žiadne prázdne frázy.\n\n" +
    'JSON kľúče: {"slides":[{"t":"nadpis, najviac 10 slov","l":"1 až 2 vety, najviac 28 slov"}] (presne 3 položky: 1. predaj nehnuteľnosti, 2. výkup, 3. odhad hodnoty),' +
    '"about_t":"nadpis O nás, najviac 9 slov","about_text":"2 krátke odseky oddelené \\n, spolu najviac 90 slov","about_pts":"4 výhody, každá na nový riadok (\\n), každá najviac 7 slov",' +
    '"sluzby_l":"1 veta pod nadpisom služieb","sluzby":[{"t":"názov služby z údajov","d":"1 veta, najviac 14 slov"}] (presne v poradí služieb z údajov),' +
    '"vykup_l":"1 veta, najviac 22 slov","vykup_text":"2 krátke odseky oddelené \\n, spolu najviac 70 slov",' +
    '"kariera_l":"1 veta, najviac 22 slov","kariera_text":"2 krátke odseky oddelené \\n, spolu najviac 70 slov","popis":"popis webu pre Google, najviac 25 slov"}';
  aiVolaj(prompt).then(function (o) {
    var st = function (v) { return typeof v === "string" ? v.trim() : ""; };
    histPush();
    if (Array.isArray(o.slides)) o.slides.slice(0, s.hero.slides.length).forEach(function (x, i) { if (st(x && x.t)) s.hero.slides[i].t = st(x.t); if (st(x && x.l)) s.hero.slides[i].l = st(x.l); });
    if (st(o.about_t)) s.okancelarii.t = st(o.about_t); if (st(o.about_text)) s.okancelarii.text = st(o.about_text); if (st(o.about_pts)) s.okancelarii.pts = st(o.about_pts);
    if (st(o.sluzby_l)) s.sluzby.l = st(o.sluzby_l);
    if (Array.isArray(o.sluzby)) o.sluzby.forEach(function (x, i) { if (s.sluzby.items[i] && st(x && x.d)) s.sluzby.items[i].d = st(x.d); });
    if (st(o.vykup_l)) s.vykup.l = st(o.vykup_l); if (st(o.vykup_text)) s.vykup.text = st(o.vykup_text);
    if (st(o.kariera_l)) s.kariera.l = st(o.kariera_l); if (st(o.kariera_text)) s.kariera.text = st(o.kariera_text);
    if (st(o.popis)) s.share.desc = st(o.popis);
    save(); all(); $("aiSt").textContent = "Hotovo. Texty sú v ukážke. Nepáčia sa? Daj Späť alebo napíš znova.";
  }).catch(function (e) { $("aiSt").textContent = chybaText(e); }).then(function () { $("aiGo").disabled = false; });
});
function aiClanok() {
  var tema = String(($("aiTema") || {}).value || "").trim(), st = $("aiClSt"), s = S();
  if (!tema) { st.textContent = "Napíš tému článku."; return; }
  st.textContent = "Asistent píše článok…";
  var prompt = "Napíš článok na blog realitnej kancelárie " + s.k.name + " (" + s.k.addr + "). Téma: " + tema + ".\nOdpovedz IBA jedným JSON objektom, bez ďalšieho textu.\n\n" +
    "Pravidlá: spisovná slovenčina, bez anglicizmov, bez emoji, bez výkričníkov. Čitateľom vykaj. Praktické rady, žiadne vymyslené čísla, zákony uvádzaj len všeobecne. Na konci jedna veta s ponukou pomoci od kancelárie.\n\n" +
    'JSON kľúče: {"t":"nadpis, najviac 12 slov","d":"perex, 1 až 2 vety, najviac 30 slov","text":"4 až 6 odsekov oddelených \\n, spolu 250 až 400 slov"}';
  aiVolaj(prompt).then(function (o) {
    var t = String(o.t || "").trim(); if (!t) throw new Error("Odpoveď sa nepodarilo spracovať. Skús to ešte raz.");
    histPush();
    var a = { id: "a" + Date.now().toString(36), t: t, d: String(o.d || "").trim(), text: String(o.text || "").trim(), img: KC.LIB[Math.floor(Math.random() * KC.LIB.length)][0], dt: isoDen(new Date()), on: false };
    s.clanky.items.unshift(a); UI.otv = a.id; save(); renderPanel(true); KC.render();
    toast("Článok je pridaný ako vypnutý. Skontroluj ho a zapni prepínačom.");
  }).catch(function (e) { var el = $("aiClSt"); if (el) el.textContent = chybaText(e); });
}

/* ================================================================ štatistiky */
var OBD = "30";
var NAZ = { odhad: "Odhad ceny", strazca: "Strážca ponúk", kontakt: "Správa", vykup: "Výkup", kariera: "Kariéra", callback: "Zavolať späť", obhliadka: "Obhliadka", hypoteka: "Hypotéka" };
var ZDROJE_N = [["google", "Google"], ["facebook", "Facebook"], ["instagram", "Instagram"], ["qr", "QR kód"], ["email", "E-mail"], ["vyhladavac", "Iné vyhľadávače"], ["iny", "Iné weby"], ["priamo", "Priamo"]];
function setView(v) {
  UI.view = v; $("stage").hidden = v !== "web"; $("dash").hidden = v !== "stat"; $("statBtn").setAttribute("aria-pressed", String(v === "stat"));
  $("pageSel").hidden = v !== "web"; $("devSeg").hidden = v !== "web";
  if (v === "stat") renderStat();
}
$("statBtn").addEventListener("click", function () { setView(UI.view === "stat" ? "web" : "stat"); });
function zmena(teraz, predtym) { if (!teraz && !predtym) return ""; if (!predtym) return '<span class="zm hore">nové</span>'; var p = Math.round((teraz - predtym) / predtym * 100); return '<span class="zm ' + (p > 0 ? "hore" : p < 0 ? "dole" : "") + '">' + (p > 0 ? "+" : p < 0 ? "−" : "±") + Math.abs(p) + " % oproti predošlému obdobiu</span>"; }
function hbar(lab, v, mx) { return '<div class="hbar"><span>' + esc(lab) + '</span><span class="tr"><i style="width:' + (mx ? Math.max(3, Math.round(v / mx * 100)) : 0) + '%"></i></span><b>' + KC.fmt(v) + "</b></div>"; }
function renderStat() {
  var el = $("dash"), dn = new Date(); dn.setHours(0, 0, 0, 0);
  var od = OBD === "vsetko" ? null : new Date(dn.getTime() - (+OBD - 1) * 864e5);
  var obd = '<div class="chips" role="group" aria-label="Obdobie">' + [["7", "7 dní"], ["30", "30 dní"], ["90", "3 mesiace"], ["365", "12 mesiacov"], ["vsetko", "Od spustenia"]].map(function (x) { return '<button type="button" class="ech" data-obd="' + x[0] + '" aria-pressed="' + (OBD === x[0]) + '">' + x[1] + "</button>"; }).join("") + "</div>";
  var hlav = '<div class="dh"><div><div class="lab2">Web kancelárie</div><h2>Štatistiky webu</h2></div>' + (WEB.zverejnene_kedy ? "" : '<span class="tagx">Web ešte nie je zverejnený</span>') + "</div>" + obd;
  el.innerHTML = hlav + '<div class="prazdny">Načítavam štatistiky…</div>';
  var kq = sb.from("web_kontakty").select("id, vytvorene, meno, kontakt, zdroj, co, makler_id, vybavene").eq("web_id", WEB.id).order("vytvorene", { ascending: false }).limit(300);
  if (od) kq = kq.gte("vytvorene", od.toISOString());
  Promise.all([sb.rpc("web_statistiky", { p_web_id: WEB.id, p_od: od ? isoDen(od) : null, p_do: isoDen(dn), p_ponuky: [] }), kq]).then(function (r) {
    if (r[0].error || r[1].error) throw r[0].error || r[1].error;
    var Dd = r[0].data || {}, KK = Dd.kontakty || {}, ZD = Dd.zdroje || {}, KL = Dd.kliky || {}, kont = r[1].data || [];
    var dni = {}; (Dd.dni || []).forEach(function (x) { dni[x[0]] = x[1]; });
    var o2 = Dd.od ? new Date(Dd.od + "T00:00:00") : (od || dn), N = Math.max(1, Math.round((dn - o2) / 864e5) + 1);
    var V = []; for (var i = 0; i < N; i++) { var dd = new Date(o2.getTime() + i * 864e5); V.push({ d: dd, v: dni[isoDen(dd)] || 0 }); }
    var tot = V.reduce(function (a, b) { return a + b.v; }, 0), kTot = Object.keys(KK).reduce(function (a, k) { return a + (+KK[k] || 0); }, 0), klTot = (+KL.tel || 0) + (+KL.mail || 0) + (+KL.wa || 0);
    var B = V; if (N > 92) { B = []; for (var j = 0; j < V.length; j += 7) { var w = V.slice(j, j + 7); B.push({ d: w[0].d, v: w.reduce(function (a, b) { return a + b.v; }, 0) }); } }
    var mx = Math.max.apply(null, B.map(function (b) { return b.v; }).concat([1]));
    var zd = ZDROJE_N.filter(function (z) { return ZD[z[0]]; }).sort(function (a, b) { return ZD[b[0]] - ZD[a[0]]; }), zmx = zd.length ? ZD[zd[0][0]] : 1;
    var fk = Object.keys(KK).sort(function (a, b) { return KK[b] - KK[a]; }), fmx = fk.length ? KK[fk[0]] : 1;
    var S0 = WEB.strazcovia || {};
    el.innerHTML = hlav +
      '<div class="kpis"><div class="kpi"><small>Návštevy webu</small><b>' + KC.fmt(tot) + "</b>" + (od ? zmena(tot, +Dd.navstevy_pred || 0) : "") + "</div>" +
      '<div class="kpi"><small>Kontakty z formulárov</small><b>' + KC.fmt(kTot) + "</b>" + (od ? zmena(kTot, +Dd.kontakty_pred || 0) : "") + "</div>" +
      '<div class="kpi"><small>Kliky na telefón a e-mail</small><b>' + KC.fmt(klTot) + "</b>" + (od ? zmena(klTot, +Dd.kliky_pred || 0) : "") + "</div>" +
      '<div class="kpi"><small>Strážcovia ponúk</small><b>' + KC.fmt(+S0.aktivni || 0) + "</b><em>" + KC.fmt(+S0.emaily_30 || 0) + " e-mailov s ponukami za 30 dní</em></div></div>" +
      '<div class="dgrid"><div class="card2"><h3>Návštevy ' + (N > 92 ? "po týždňoch" : "po dňoch") + "</h3>" + (tot ? '<div class="stlpce" role="img" aria-label="Návštevy webu, spolu ' + tot + '">' + B.map(function (b) { return '<i style="height:' + Math.round(b.v / mx * 100) + '%" title="' + b.d.getDate() + ". " + (b.d.getMonth() + 1) + ".: " + b.v + '"></i>'; }).join("") + '</div><div class="stlpce-x"><span>' + B[0].d.getDate() + ". " + (B[0].d.getMonth() + 1) + ".</span><span>" + B[B.length - 1].d.getDate() + ". " + (B[B.length - 1].d.getMonth() + 1) + ".</span></div>"
        : '<div class="prazdny">V tomto období žiadne návštevy. Počítajú sa len návštevy zverejneného webu, nie tvoje vlastné.</div>') + "</div>" +
      '<div class="card2"><h3>Odkiaľ ľudia prišli</h3>' + (zd.length ? zd.map(function (z) { return hbar(z[1], ZD[z[0]], zmx); }).join("") : '<div class="prazdny">Zatiaľ bez údajov.</div>') +
      "<h3 style=\"margin-top:8px\">Formuláre</h3>" + (fk.length ? fk.map(function (k) { return hbar(NAZ[k] || k, KK[k], fmx); }).join("") : '<div class="prazdny">Zatiaľ žiadne.</div>') + "</div></div>" +
      '<p class="sub st-prehlad">Prvý deň v mesiaci príde administrátorom prehľad za minulý mesiac do zvončeka, e-mailom aj do mobilu.</p>' +
      '<div class="card2"><h3>Kontakty z webu</h3><p class="sub">Každý kontakt prišiel do zvončeka maklérovi v stĺpci Komu. Kupujúci sú v Klientoch medzi dopytmi, predávajúci s telefónom medzi predávajúcimi.</p>' +
      (kont.length ? '<div class="tbl"><table><thead><tr><th>Kedy</th><th>Meno</th><th>Kontakt</th><th>Formulár</th><th>Komu</th><th>Čo chce</th><th></th></tr></thead><tbody>' + kont.map(function (k) {
        return "<tr><td>" + esc(cas(k.vytvorene)) + "</td><td>" + esc(k.meno || "–") + "</td><td>" + esc(k.kontakt) + '</td><td><span class="src' + (k.vybavene ? "" : " new") + '">' + esc(NAZ[k.zdroj] || k.zdroj) + "</span></td><td>" + esc(menoM(makler(k.makler_id)) || "–") + "</td><td>" + esc(k.co || "") +
          '</td><td><button type="button" class="b b-soft b-sm" data-vyb="' + k.id + '" data-v="' + (k.vybavene ? 0 : 1) + '">' + (k.vybavene ? "Vrátiť" : "Vybavené") + "</button></td></tr>"; }).join("") + "</tbody></table></div>"
        : '<div class="prazdny">V tomto období žiadne kontakty.</div>') + "</div>";
  }).catch(function (e) { el.innerHTML = hlav + '<div class="prazdny">Štatistiky sa nepodarilo načítať: ' + esc(chybaText(e)) + "</div>"; });
}
$("dash").addEventListener("click", function (e) {
  var b = e.target.closest("button"); if (!b) return;
  if (b.dataset.obd) { OBD = b.dataset.obd; renderStat(); return; }
  if (b.dataset.vyb) { b.disabled = true; rpc("vybavit_web_kontakt", { p_id: +b.dataset.vyb, p_vybavene: b.dataset.v === "1" }).then(renderStat).catch(function (x) { toast(chybaText(x), true); b.disabled = false; }); }
});

/* ================================================================ štart (len administrátor) */
function zamknute(nadpis, text) {
  $("gate").innerHTML = '<img src="typek-hlavicka.png" alt="" width="64" height="64"><h2>' + esc(nadpis) + "</h2><p>" + esc(text) + '</p><a class="b b-gold" href="./">Späť do Realitného týpka</a>';
}
function nacitajData() {
  return rpc("verejny_web", { p_adresa: WEB.adresa, p_nahlad: true }).then(function (d) { D = d || { makleri: [], ponuky: [], predane: [] }; K.D = D; return D; });
}
function start(vz) {
  var prazdny = !WEB.koncept || !Object.keys(WEB.koncept).length;
  K.S = KC.merge(WEB.koncept || {});
  if (prazdny) {
    vz = vz || {};
    if (vz.nazov) K.S.k.name = vz.nazov;
    if (vz.firma) K.S.gdpr.who = vz.firma;
    var mer = vz.meranie || {};
    if (mer.ga) K.S.ga = mer.ga; if (mer.fb) K.S.px = mer.fb;
  }
  var prvy = prazdny ? rpc("ulozit_web_kancelarie", { p_koncept: cisty() }) : Promise.resolve();
  return prvy.then(nacitajData).then(function () {
    KC.init({ root: $("site"), scroller: $("stage"), ovlHost: $("frame"), editor: true, adresa: WEB.adresa, domena: WEB.domena || "", vh: function () { return vhPx; } });
    K.hooks.upravSekciu = function (k) {
      if (k === "uvod") { UI.tab = "uvod"; UI.open = ""; }
      else if (k === "vykup" || (k === "kariera" && K.page === "kariera")) { UI.tab = "stranky"; UI.open = "p-" + k; }
      else if (k === "clanok" || k === "dalsie") { UI.tab = "blog"; var a = KC.clanky().find(function (q) { return KC.slugC(q) === K.sub; }); UI.otv = a ? a.id : ""; }
      else { UI.tab = "sekcie"; UI.open = k; }
      UI.add = false; setView("web"); renderPanel();
      var row = panel.querySelector('[data-row="' + k + '"]') || panel.querySelector(".sed"); if (row) row.scrollIntoView({ block: "start", behavior: "smooth" }); else panel.scrollTop = 0;
    };
    K.hooks.poSnimke = function (i) { panel.querySelectorAll(".slide-ed").forEach(function (el) { el.classList.toggle("cur", +el.dataset.slidei === i); }); };
    K.hooks.poNavigacii = function () { updAddr(); };
    K.hooks.poRender = function () { updAddr(); };
    K.hooks.odoslat = function () { return new Promise(function (ok) { setTimeout(function () { toast("V náhľade sa formulár neodosiela. Na zverejnenom webe príde kontakt do zvončeka."); ok("ok"); }, 300); }); };
    K.hooks.oznam = function (t) { toast(t); };
    K.hooks.nacitajPonuku = function (id) { return sb.rpc("verejna_ponuka", { p_id: id }).then(function (x) { if (x.error) throw x.error; return x.data; }); };
    K.hooks.suhlas = function (v) { var t = KC.trk(); toast(v === "vsetky" ? (t.any ? "Na webe by sa teraz zaplo meranie: " + [t.ga && "Google Analytics", t.fb && "Meta Pixel"].filter(Boolean).join(" a ") + "." : "Súhlas uložený. Meranie nie je nastavené.") : "Len nevyhnutné cookies. Meranie sa nespustí."); };
    $("gate").hidden = true; $("app").hidden = false; $("topAct").hidden = false;
    $("frame").className = "frame dev-pc";
    renderDev(); measure(); all(); histPush(); updPub();
    stav(prazdny ? "Uložené" : WEB.upravene ? "Uložené " + cas(WEB.upravene) : "Uložené");
    if (location.hash === "#statistiky") setView("stat");
  });
}
try {
  sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey, { auth: { persistSession: true, autoRefreshToken: true } });
  sb.auth.getSession().then(function (r) {
    var ses = r.data && r.data.session;
    if (!ses) { zamknute("Najprv sa prihlás", "Web kancelárie upravíš po prihlásení v Realitnom týpkovi."); return; }
    JA = ses.user.id;
    return sb.from("makleri").select("rola,aktivny").eq("id", JA).maybeSingle().then(function (q) {
      if (q.error) throw q.error;
      if (!q.data || q.data.rola !== "admin" || q.data.aktivny === false) { zamknute("Len pre administrátora", "Web kancelárie upravuje administrátor."); return; }
      return Promise.all([nacitajWeb(), rpc("vzhlad_kancelarie").catch(function () { return {}; })]).then(function (x) { return start(x[1]); });
    });
  }).catch(function (e) { zamknute("Web kancelárie sa nepodarilo načítať", chybaText(e)); });
} catch (e) { zamknute("Prístup sa nepodarilo overiť", "Skús stránku obnoviť."); }
})();
