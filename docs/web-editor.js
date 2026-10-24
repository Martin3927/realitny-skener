/* Editor osobného webu makléra – Realitný týpek
   Ukladá rozpracovaný web do databázy (ulozit_web), zverejňuje (zverejnit_web), fotky nahráva do úložiska „weby“. */
(function () {
"use strict";
var CFG = window.SKENER_CONFIG, T = window.TYPEK_WEB, W = T.W, esc = T.esc;
var sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey, { auth: { persistSession: true, autoRefreshToken: true } });
var q = new URLSearchParams(location.search), CIEL = q.get("m") || null;
var $ = function (id) { return document.getElementById(id); };
var WEB = null, JA = null, MAKLER_ID = null, open = new Set(), VIEW = "web", ZMENY = false, UKLADANIE = null, NEULOZENE = false;
W.editor = true;

/* ================================================================ pomocníci */
function toast(m, chyba) { var t = $("toast"); t.textContent = m; t.hidden = false; t.style.background = chyba ? "var(--c-danger)" : ""; clearTimeout(toast.t); toast.t = setTimeout(function () { t.hidden = true; }, chyba ? 6000 : 3000); }
function chybaText(e) { return (e && (e.message || e.error_description || e.chyba)) || String(e); }
function rpc(fn, args) { return sb.rpc(fn, args || {}).then(function (r) { if (r.error) throw r.error; return r.data; }); }
function S() { return W.S; }
function cas(d) { d = new Date(d); return d.getDate() + ". " + (d.getMonth() + 1) + ". " + d.getFullYear() + " o " + d.getHours() + ":" + String(d.getMinutes()).padStart(2, "0"); }
function qrOdkaz() { var u = verejnyOdkaz(); return u + (u.indexOf("?") >= 0 ? "&" : "?") + "z=qr"; }
function verejnyOdkaz() { return WEB.domena && WEB.domena_pripojena ? "https://" + WEB.domena + "/" : new URL("stranka.html?m=" + encodeURIComponent(WEB.adresa), location.href).href; }
function nahladOdkaz() { return new URL("stranka.html?m=" + encodeURIComponent(WEB.adresa), location.href).href + "&nahlad=1"; }
function adresaText() { return WEB.domena && WEB.domena_pripojena ? WEB.domena : location.host + "/stranka.html?m=" + WEB.adresa; }
function stav(t, druh) { var e = $("stav"); e.className = "stav" + (druh ? " " + druh : ""); e.querySelector("span").textContent = t; }
function cistyS() { var c = T.clone(W.S); delete c.dev; delete c.tab; return c; }
function kopiruj(v, msg, el) { try { navigator.clipboard.writeText(v).then(function () { toast(msg); }, function () { if (el) el.select(); toast("Označené, skopíruj cez Ctrl+C"); }); } catch (e) { if (el) el.select(); toast("Označené, skopíruj cez Ctrl+C"); } }

/* ================================================================ ukladanie a história */
function save() {
  histSchedule(); NEULOZENE = true; ZMENY = true; stav("Neuložené zmeny…", "uklada");
  clearTimeout(save.t); save.t = setTimeout(ulozTeraz, 1200);
}
function ulozTeraz() {
  clearTimeout(save.t);
  if (!NEULOZENE) return UKLADANIE || Promise.resolve();
  NEULOZENE = false; stav("Ukladám…", "uklada");
  UKLADANIE = rpc("ulozit_web", { p_koncept: cistyS(), p_makler: MAKLER_ID }).then(function () {
    var d = new Date(); stav("Uložené " + d.getHours() + ":" + String(d.getMinutes()).padStart(2, "0")); renderPub();
  }).catch(function (e) { NEULOZENE = true; stav("Neuložené – " + chybaText(e), "chyba"); });
  return UKLADANIE;
}
window.addEventListener("beforeunload", function (e) { if (NEULOZENE) { ulozTeraz(); e.preventDefault(); e.returnValue = ""; } });
var IMG = new Map(), IMGS = [], HIST = [], HI = -1, histT = null, RESTORING = false;
function snap() { return JSON.stringify(cistyS()); }
function histPush() { var s = snap(); if (HIST[HI] === s) return; HIST = HIST.slice(0, HI + 1); HIST.push(s); if (HIST.length > 80) HIST.shift(); HI = HIST.length - 1; updHist(); }
function histSchedule() { if (RESTORING) return; clearTimeout(histT); histT = setTimeout(histPush, 450); }
function updHist() { $("undo").disabled = HI <= 0; $("redo").disabled = HI >= HIST.length - 1; }
function restore() { RESTORING = true; var keep = { dev: W.S.dev, tab: W.S.tab }; W.S = Object.assign(T.merge(JSON.parse(HIST[HI])), keep); all(); RESTORING = false; NEULOZENE = true; save(); updHist(); }
function undo() { clearTimeout(histT); histPush(); if (HI <= 0) return; HI--; restore(); toast("Vrátené späť"); }
function redo() { clearTimeout(histT); if (HI >= HIST.length - 1) return; HI++; restore(); }

/* ================================================================ nahrávanie súborov */
function zmensi(file, max, png) {
  return new Promise(function (res, rej) {
    var r = new FileReader(); r.onerror = rej;
    r.onload = function () {
      var im = new Image(); im.onerror = rej;
      im.onload = function () {
        var k = Math.min(1, max / Math.max(im.width, im.height)), c = document.createElement("canvas");
        c.width = Math.max(1, Math.round(im.width * k)); c.height = Math.max(1, Math.round(im.height * k));
        c.getContext("2d").drawImage(im, 0, 0, c.width, c.height);
        var hotovo = function (b, ext) {
          if (!b) return rej(new Error("Obrázok sa nepodarilo spracovať."));
          // ak netreba zmenšovať a pôvodný súbor je menší, nahrá sa pôvodný
          if (k === 1 && !png && /^image\/(jpeg|webp)$/.test(file.type) && file.size <= b.size) { b = file; ext = file.type === "image/webp" ? ".webp" : ".jpg"; }
          res({ blob: b, ext: ext, farby: png ? logoColors(im) : [] });
        };
        if (png) c.toBlob(function (b) { hotovo(b, ".png"); }, "image/png");
        else c.toBlob(function (b) {
          // WebP je o tretinu menší; prehliadač, ktorý ho nevie uložiť, vráti PNG, vtedy JPEG
          if (b && b.type === "image/webp") hotovo(b, ".webp");
          else c.toBlob(function (j) { hotovo(j, ".jpg"); }, "image/jpeg", 0.85);
        }, "image/webp", 0.82);
      };
      im.src = r.result;
    };
    r.readAsDataURL(file);
  });
}
// veľké video prekóduje v prehliadači na šírku 1280 px (trvá približne ako dĺžka videa)
function zmensiVideo(file, priebeh) {
  return new Promise(function (res) {
    var mov = /quicktime/.test(file.type), treba = file.size > 12 * 1024 * 1024 || mov;
    var typy = ["video/mp4;codecs=avc1", "video/mp4", "video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
    var typ = window.MediaRecorder && HTMLCanvasElement.prototype.captureStream ? typy.find(function (x) { return MediaRecorder.isTypeSupported(x); }) : null;
    if (!treba && !typ) return res(file);
    var url = URL.createObjectURL(file), v = document.createElement("video"), hotovo = false;
    function koniec(b) { if (hotovo) return; hotovo = true; URL.revokeObjectURL(url); res(b); }
    v.muted = true; v.playsInline = true; v.preload = "auto"; v.src = url;
    v.onerror = function () { koniec(file); };
    v.onloadedmetadata = function () {
      var siroke = v.videoWidth > 1920;
      if ((!treba && !siroke) || !typ || !(v.duration > 0) || v.duration > 120) return koniec(file);
      var k = Math.min(1, 1280 / v.videoWidth), c = document.createElement("canvas"), x = c.getContext("2d");
      c.width = Math.round(v.videoWidth * k / 2) * 2; c.height = Math.round(v.videoHeight * k / 2) * 2;
      var rec, casti = [];
      try { rec = new MediaRecorder(c.captureStream(30), { mimeType: typ, videoBitsPerSecond: 3000000 }); } catch (e) { return koniec(file); }
      rec.ondataavailable = function (e) { if (e.data && e.data.size) casti.push(e.data); };
      rec.onstop = function () { var b = new Blob(casti, { type: typ.split(";")[0] }); koniec(b.size > 50000 && (b.size < file.size || mov) ? b : file); };
      var posl = -1;
      function kresli() {
        if (hotovo) return;
        x.drawImage(v, 0, 0, c.width, c.height);
        var p = Math.min(99, Math.round(v.currentTime / v.duration * 100)); if (p !== posl) { posl = p; priebeh(p); }
        if (!v.ended) { if (v.requestVideoFrameCallback) v.requestVideoFrameCallback(kresli); else requestAnimationFrame(kresli); }
      }
      v.onended = function () { setTimeout(function () { if (rec.state !== "inactive") rec.stop(); }, 150); };
      rec.start(1000);
      v.play().then(kresli, function () { try { rec.stop(); } catch (e) { /* nič */ } koniec(file); });
    };
  });
}
function nahraj(blob, nazov, typ) {
  var cesta = MAKLER_ID + "/" + Date.now().toString(36) + "-" + (T.slugD(nazov.replace(/\.[^.]+$/, "")) || "subor") + (nazov.match(/\.[a-z0-9]+$/i) || [""])[0].toLowerCase();
  return sb.storage.from("weby").upload(cesta, blob, { contentType: typ || blob.type, upsert: false }).then(function (r) {
    if (r.error) throw r.error;
    return sb.storage.from("weby").getPublicUrl(cesta).data.publicUrl;
  });
}
function logoColors(im) {
  try { var c = document.createElement("canvas"), n = 64; c.width = n; c.height = n; var x = c.getContext("2d"); x.drawImage(im, 0, 0, n, n); var p = x.getImageData(0, 0, n, n).data, b = {};
    for (var i = 0; i < p.length; i += 4) { if (p[i + 3] < 200) continue; var r = p[i], g = p[i + 1], bl = p[i + 2], mx = Math.max(r, g, bl), mn = Math.min(r, g, bl); if (mx - mn < 38 || mx < 40 || mn > 225) continue;
      var k = [r, g, bl].map(function (v) { return v >> 4; }).join(","); b[k] = b[k] || { n: 0, r: 0, g: 0, b: 0 }; b[k].n++; b[k].r += r; b[k].g += g; b[k].b += bl; }
    var out = []; Object.keys(b).map(function (k) { return b[k]; }).sort(function (a, z) { return z.n - a.n; }).forEach(function (v) { var h = T.r2h([v.r / v.n, v.g / v.n, v.b / v.n]); if (out.length < 4 && out.every(function (o) { var A = T.h2r(o), B = T.h2r(h); return Math.abs(A[0] - B[0]) + Math.abs(A[1] - B[1]) + Math.abs(A[2] - B[2]) > 70; })) out.push(h); });
    return out; } catch (e) { return []; }
}

/* ================================================================ panel – polia */
var HBTN_E = [["", "Podľa šablóny"], ["ocenenie", "Zistiť hodnotu zdarma"], ["predat", "Chcem predať"], ["ponuky", "Pozrieť ponuky"], ["zavolat", "Zavolajte mi"], ["vykup", "Chcem výkup"], ["ebook", "Stiahnuť e-book"], ["kontakt", "Napíšte mi"]];
function hlavneTlPole(s) {
  var cur = HBTN_E.find(function (x) { return x[0] === s.heroBtn; }) || HBTN_E[0];
  return '<label class="full" style="margin-top:6px">Hlavné tlačidlo v úvode<select data-bind="heroBtn">' + HBTN_E.map(function (x) { return '<option value="' + x[0] + '"' + (x[0] === s.heroBtn ? " selected" : "") + ">" + x[1] + "</option>"; }).join("") + "</select></label>" +
    (s.heroBtn ? fld("Vlastný text tlačidla (nepovinné)", "heroBtnTx", { ph: cur[1] }) : "") +
    '<p class="note">Čo má návštevník urobiť ako prvé. Napríklad „Zistiť hodnotu zdarma“ ho pošle rovno na odhad ceny. Keď je cieľová sekcia vypnutá, tlačidlo vedie na kontakt.</p>';
}
var get = T.get, setDeep = T.setDeep;
function fld(label, path, o) {
  o = o || {}; var v = get(path); if (v == null) v = ""; var id = "f-" + path.replace(/\./g, "-");
  if (o.area) return '<label class="full">' + label + '<textarea id="' + id + '" data-bind="' + path + '" rows="' + (o.rows || 3) + '" placeholder="' + esc(o.ph || "") + '">' + esc(v) + "</textarea></label>";
  return '<label class="' + (o.half ? "" : "full") + '">' + label + '<input id="' + id + '" data-bind="' + path + '"' + (o.num ? ' data-num inputmode="decimal"' : "") + ' value="' + esc(v) + '" placeholder="' + esc(o.ph || "") + '" autocomplete="off"></label>';
}
function upl(label, path, o) {
  o = o || {}; var vOwn = get(path), v = vOwn || (path === "photo" ? T.fotoMaklera() : ""), id = "u-" + path.replace(/\./g, "-");
  var th = v ? (o.video ? '<video src="' + esc(v) + '" muted playsinline></video>' : o.pdf ? "PDF" : '<img src="' + esc(v) + '" alt=""' + (o.logo ? ' style="object-fit:contain;padding:4px"' : "") + ">") : (o.logo ? "bez loga" : o.video ? "bez videa" : o.pdf ? "bez súboru" : "bez fotky");
  return '<div class="up"><div class="th' + (o.round ? " round" : "") + '">' + th + '</div><div><div style="font-size:13px;font-weight:600;margin-bottom:6px">' + label + (o.pdf && S().dl.file ? ": " + esc(S().dl.file) : "") + '</div><div class="act"><label class="fbtn" for="' + id + '">' + (v ? "Zmeniť" : o.logo ? "Nahrať logo" : o.video ? "Nahrať video" : o.pdf ? "Vybrať súbor" : "Nahrať fotku") + "</label>" +
    '<input type="file" accept="' + (o.video ? "video/mp4,video/webm,video/quicktime" : o.pdf ? "application/pdf" : "image/jpeg,image/png,image/webp") + '" id="' + id + '" data-upload="' + path + '" data-max="' + (o.max || 1800) + '"' + (o.logo ? " data-png" : "") + (o.video ? " data-video" : "") + (o.pdf ? " data-pdf" : "") + ">" +
    (vOwn ? '<button type="button" class="lbtn" data-clear="' + path + '">Odstrániť</button>' : "") + "</div></div></div>";
}
function seg(id, items, cur, attr) { $(id).innerHTML = items.map(function (x) { return '<button type="button" class="chip" data-' + attr + '="' + x[0] + '" aria-pressed="' + (cur === x[0]) + '">' + x[1] + "</button>"; }).join(""); }
var ICP = { grip: T.SV('<circle cx="9" cy="6" r="1" fill="currentColor"/><circle cx="15" cy="6" r="1" fill="currentColor"/><circle cx="9" cy="12" r="1" fill="currentColor"/><circle cx="15" cy="12" r="1" fill="currentColor"/><circle cx="9" cy="18" r="1" fill="currentColor"/><circle cx="15" cy="18" r="1" fill="currentColor"/>'),
  up: T.SV('<path d="M6 15l6-6 6 6"/>', 'stroke-width="2.4"'), dn: T.SV('<path d="M6 9l6 6 6-6"/>', 'stroke-width="2.4"'), edit: T.SV('<path d="M4 20h4L19 9l-4-4L4 16z"/>'), ok: T.SV('<path d="M5 12l5 5 9-10"/>', 'stroke-width="3"') };
function listItem(path, i, len, inner, del) {
  return '<div class="revitem" style="grid-template-columns:1fr">' + inner + '<div class="ctl"><button type="button" class="mv" data-lup="' + path + ":" + i + '"' + (i === 0 ? " disabled" : "") + ' aria-label="Vyššie">' + ICP.up + '</button><button type="button" class="mv" data-ldn="' + path + ":" + i + '"' + (i === len - 1 ? " disabled" : "") + ' aria-label="Nižšie">' + ICP.dn + '</button><button type="button" class="lbtn" data-ldel="' + path + ":" + i + '">' + del + "</button></div></div>";
}
function bodyOf(k) {
  var s = S();
  if (s.custom[k]) return fld("Nadpis", "custom." + k + ".title") + fld("Text", "custom." + k + ".text", { area: 1, rows: 4 }) + upl("Obrázok (nepovinné)", "custom." + k + ".img", { max: 1600 }) + fld("Text tlačidla", "custom." + k + ".btn", { half: 1, ph: "napr. Viac info" }) + fld("Odkaz tlačidla", "custom." + k + ".link", { half: 1, ph: "www..." }) + '<button type="button" class="lbtn" data-delcustom="' + k + '">Odstrániť sekciu</button>';
  switch (k) {
    case "ponuky": return '<label class="full">Počet ponúk na úvode: <b id="nOut">' + s.n + '</b><input type="range" min="2" max="12" step="1" data-bind="n" data-num value="' + s.n + '"></label><p class="note">Ponuky sa berú samy z Nehnuteľností (aktívne a rezervované). Kliknutím na ponuku sa otvorí detail s fotkami, parametrami, mapou, videom a 3D prehliadkou.</p>';
    case "predane": return '<label class="chk"><input type="checkbox" data-check="soldBand"' + (s.soldBand ? " checked" : "") + '>Výrazný pás PREDANÉ cez celú fotku</label><p class="note">Ukazujú sa ponuky, ktoré máš v Nehnuteľnostiach označené ako Predané (za posledné 2 roky). Bez predaných ponúk sa sekcia na webe nezobrazí.</p>';
    case "preco": return fld("Nadpis", "heads.preco.h", { ph: "Prečo si vybrať práve mňa" }) + fld("Text pod nadpisom (nepovinné)", "heads.preco.p") +
      s.why.map(function (x, i) { return listItem("why", i, s.why.length, fld("Dôvod " + (i + 1), "why." + i + ".t", { ph: "napr. Férové ceny" }) + fld("Krátky popis (nepovinné)", "why." + i + ".d", { area: 1, rows: 2 }), "Odstrániť"); }).join("") +
      (s.why.length < 12 ? '<button type="button" class="addb" data-ladd="why" style="grid-column:1/-1">+ Pridať dôvod</button>' : "") +
      '<p class="note">Ikona sa vyberie sama podľa názvu (cena, rýchlosť, spoľahlivosť, diskrétnosť, skúsenosti…). Popisy sú ukážkové, prepíš ich podľa seba.</p>';
    case "tim": return s.team.map(function (x, i) { return listItem("team", i, s.team.length, upl("Fotka", "team." + i + ".img", { max: 900 }) + fld("Meno", "team." + i + ".n", { half: 1 }) + fld("Pozícia", "team." + i + ".r", { half: 1, ph: "napr. Realitná maklérka" }) + fld("Telefón", "team." + i + ".tel", { half: 1 }) + fld("E-mail", "team." + i + ".mail", { half: 1 }), "Odstrániť člena"); }).join("") +
      '<button type="button" class="addb" data-ladd="team" style="grid-column:1/-1">+ Pridať člena tímu</button>' +
      (s.team.length ? "" : '<button type="button" class="lbtn" data-timja style="grid-column:1/-1;justify-self:start;color:var(--c-ink)">Pridať mňa ako prvého člena</button>') +
      '<p class="note">Sekcia sa hodí, keď v kancelárii pracuje viac ľudí. Bez členov sa na webe nezobrazí.</p>';
    case "strazca": return fld("Nadpis", "watch.title") + fld("Text", "watch.text", { area: 1, rows: 3 }) + fld("Lokality na výber (oddeľ čiarkou)", "watch.places") + '<p class="note">Požiadavka sa zapíše medzi tvoje dopyty v Klientoch. Keď pridáš vhodnú ponuku alebo ju nájde skener, aplikácia ti dá vedieť.</p>';
    case "omne": return fld("Nadpis", "about.title") + fld("Text o sebe", "about.text", { area: 1, rows: 5 }) + '<p class="note">Fotku a počet rokov v realitách doplníš v záložke Maklér.</p>';
    case "postup": return s.steps.map(function (x, i) { return listItem("steps", i, s.steps.length, fld("Krok " + (i + 1), "steps." + i + ".t") + fld("Popis", "steps." + i + ".d", { area: 1, rows: 2 }), "Odstrániť krok"); }).join("") + '<button type="button" class="addb" data-ladd="steps" style="grid-column:1/-1">+ Pridať krok</button>';
    case "sluzby": return s.svc.map(function (x, i) { return listItem("svc", i, s.svc.length, fld("Služba " + (i + 1), "svc." + i + ".t") + fld("Popis", "svc." + i + ".d", { area: 1, rows: 2 }), "Odstrániť službu"); }).join("") + '<button type="button" class="addb" data-ladd="svc" style="grid-column:1/-1">+ Pridať službu</button>' +
      fld("Doplnkové služby (oddeľ čiarkou, nepovinné)", "svcX", { ph: "napr. Foto a video, Dron, 3D prehliadka, Virtuálny staging, Právny servis" }) +
      (s.svcX ? "" : '<button type="button" class="lbtn" data-svcx style="grid-column:1/-1;justify-self:start;color:var(--c-ink)">Vložiť príklad</button>') + '<p class="note">Doplnkové služby sa ukážu ako štítky pod službami.</p>';
    case "lokality": return s.loc.map(function (l, i) { return listItem("loc", i, s.loc.length, fld("Obec alebo štvrť", "loc." + i + ".n") + fld("Popis", "loc." + i + ".t", { area: 1, rows: 2 }) + fld("Štítky (oddeľ čiarkou)", "loc." + i + ".g") + upl("Fotka (nepovinné)", "loc." + i + ".img", { max: 1200 }), "Odstrániť lokalitu"); }).join("") + '<button type="button" class="addb" data-ladd="loc" style="grid-column:1/-1">+ Pridať lokalitu</button><p class="note">Popisy sú ukážkové. Prepíš ich podľa toho, čo o lokalitách vieš ty.</p>';
    case "cennik": return fld("Nadpis", "heads.cennik.h", { ph: "Férová a jasná odmena" }) + fld("Text pod nadpisom", "heads.cennik.p", { ph: "Viete vopred, koľko zaplatíte. Bez prekvapení na konci." }) +
      s.cen.rows.map(function (x, i) { return listItem("cen.rows", i, s.cen.rows.length, fld("Typ nehnuteľnosti", "cen.rows." + i + ".t", { half: 1 }) + fld("Cena", "cen.rows." + i + ".c", { half: 1, ph: "napr. 3 % z ceny" }) + fld("Poznámka", "cen.rows." + i + ".p", { ph: "napr. vrátane DPH" }), "Odstrániť riadok"); }).join("") +
      '<button type="button" class="addb" data-ladd="cen.rows" style="grid-column:1/-1">+ Pridať riadok</button>' +
      fld("Čo je v cene (každá položka na nový riadok)", "cen.inc", { area: 1, rows: 5 }) + fld("Poznámka pod cenami", "cen.pozn") +
      '<p class="note">Uprav ceny podľa seba. Otvorene napísaná odmena buduje dôveru, ľudia vedia, do čoho idú.</p>';
    case "vykup": return fld("Nadpis", "heads.vykup.h", { ph: "Vykúpime vašu nehnuteľnosť. Rýchlo a za férovú cenu." }) + fld("Text pod nadpisom", "heads.vykup.p", { area: 1, rows: 2, ph: "Potrebujete predať rýchlo? Nehnuteľnosť od vás odkúpime priamo, bez čakania na kupujúceho." }) +
      fld("Čo vykupujeme (oddeľ čiarkou)", "vyk.typy") + fld("Výhody (každá na nový riadok)", "vyk.vyhody", { area: 1, rows: 4 }) + fld("Ako to prebieha (každý krok na nový riadok)", "vyk.kroky", { area: 1, rows: 4 }) +
      '<p class="note">Tlačidlá Zavolať a WhatsApp sa doplnia samy z tvojich kontaktov. Uprav výhody podľa toho, čo naozaj ponúkate.</p>';
    case "video": return fld("Odkaz na video", "video.url", { ph: "youtube.com/watch?v=..." }) + fld("Nadpis", "video.title") + fld("Popis", "video.text");
    case "fotka": return upl("Fotka", "img.src", { max: 2000 }) + fld("Nadpis (nepovinné)", "img.title") + fld("Popis pod fotkou", "img.cap");
    case "dotaznik": return fld("Nadpis", "form.title") + fld("Úvodný text", "form.text", { area: 1, rows: 2 }) + '<p class="note">Otázky: čo plánuje, typ nehnuteľnosti, kedy. Odpovede ti prídu ako nový kontakt do zvončeka.</p>';
    case "stiahnut": return fld("Názov", "dl.title") + fld("Popis", "dl.desc", { area: 1, rows: 3 }) + fld("Text tlačidla", "dl.btn") + upl("Súbor (PDF)", "dl.url", { pdf: 1 }) +
      upl("Obrázok obálky", "dl.img", { max: 1200 }) +
      '<label class="chk"><input type="checkbox" data-check="dl.news"' + (s.dl.news ? " checked" : "") + '>Ponúknuť aj odber tipov e-mailom (nepovinné zaškrtávacie políčko)</label>' + fld("Text súhlasu", "dl.newsTx", { area: 1, rows: 2 }) +
      (s.dl.url ? '<button type="button" class="lbtn" data-dlobalka style="grid-column:1/-1;justify-self:start;color:var(--c-ink)">Použiť prvú stranu PDF ako obálku</button>' : "") +
      '<p class="note">Po nahratí PDF sa obálka vytvorí sama z jeho prvej strany. Môžeš ju nahradiť vlastným obrázkom. Bez obrázka sa zobrazí farebná obálka s názvom. Návštevník zadá e-mail, hneď si súbor stiahne a ty máš jeho kontakt.</p>';
    case "faq": return s.faq.map(function (x, i) { return listItem("faq", i, s.faq.length, fld("Otázka", "faq." + i + ".q") + fld("Odpoveď", "faq." + i + ".a", { area: 1, rows: 3 }), "Odstrániť otázku"); }).join("") + '<button type="button" class="addb" data-ladd="faq" style="grid-column:1/-1">+ Pridať otázku</button>' +
      (s.faq.some(function (x) { return /RSc/.test(x.q || ""); }) ? "" : '<button type="button" class="lbtn" data-faqrsc style="grid-column:1/-1;justify-self:start;color:var(--c-ink)">+ Pridať otázku o titule RSc.</button>') + '<p class="note">Odpovede sú ukážkové, skontroluj ich a prepíš podľa seba.</p>';
    case "recenzie": return fld("Odkaz na Google recenzie (nepovinné)", "rev.google", { ph: "g.page/r/..." }) + fld("Hodnotenie na Google", "rev.gRating", { half: 1, ph: "napr. 4,9" }) + fld("Počet recenzií na Google", "rev.gCount", { half: 1, ph: "napr. 166" }) +
      '<p class="note">Keď vyplníš hodnotenie, v úvode webu sa ukáže odznak „★ 4,9 · 166 recenzií na Google“ s odkazom na tvoje recenzie. Čísla občas aktualizuj.</p>' + '<p class="note">Na webe sa ukazujú schválené recenzie z aplikácie (sekcia Recenzie). Klienta o recenziu požiadaš tam jedným klikom.</p>';
    case "obhliadka": return fld("Časy obhliadok (oddeľ čiarkou)", "book.times", { ph: "9:00, 14:00, 17:30" }) + '<label class="chk"><input type="checkbox" data-check="book.sat"' + (s.book.sat ? " checked" : "") + ">Obhliadky aj v sobotu</label>" + fld("Text pod nadpisom", "book.text", { area: 1, rows: 2 }) + '<p class="note">Záujem o obhliadku ti príde do zvončeka aj s vybranou ponukou a časom. Termín potvrdíš klientovi telefonicky.</p>';
    case "ocenenie": return fld("Nadpis", "val.title") + fld("Text", "val.text", { area: 1, rows: 3 }) +
      '<label class="chk"><input type="checkbox" data-check="val.krokyOn"' + (s.val.krokyOn ? " checked" : "") + '>Ukázať postup v krokoch namiesto bodov</label>' + fld("Kroky (každý na nový riadok)", "val.kroky", { area: 1, rows: 3 });
    case "callback": return fld("Nadpis", "cb.title") + fld("Text", "cb.text", { area: 1, rows: 2 });
    case "hypoteka": return fld("Úrok v %", "hypo.rate", { num: 1, half: 1 });
    case "clanok": return fld("Nadpis článku", "post.title") + fld("Úvod článku", "post.text", { area: 1, rows: 3 }) + fld("Odkaz na celý článok (nepovinné)", "post.url", { ph: "www..." });
    case "kontakt": return '<p class="note">Kontakt sa skladá z údajov v záložkách Maklér a Siete.</p>';
    default: return '<p class="note">Táto sekcia nemá ďalšie nastavenia.</p>';
  }
}
function renderSecs() {
  var s = S();
  $("secs").innerHTML = '<li class="sec"><div class="row"><span class="grip lockd">' + ICP.grip + '</span><label><input type="checkbox" checked disabled><span>Úvod a navigácia</span></label><span class="note" style="padding-right:8px;grid-column:auto">vždy</span></div></li>' +
    s.order.map(function (k, i) { var o = open.has(k); return '<li class="sec' + (s.on[k] ? "" : " off") + '" data-k="' + k + '"><div class="row"><span class="grip" data-grip title="Potiahni a presuň">' + ICP.grip + "</span>" +
      '<label><input type="checkbox" id="sec-' + k + '" data-sec="' + k + '"' + (s.on[k] ? " checked" : "") + '><span data-title="' + k + '">' + esc(T.secName(k)) + "</span></label>" + (s.custom[k] ? '<span class="badge">vlastná</span>' : "") +
      '<button type="button" class="mv" data-edit="' + k + '" aria-expanded="' + o + '" aria-label="Upraviť sekciu ' + esc(T.secName(k)) + '">' + ICP.edit + "</button>" +
      '<button type="button" class="mv" data-up="' + i + '"' + (i === 0 ? " disabled" : "") + ' aria-label="Posunúť vyššie">' + ICP.up + '</button><button type="button" class="mv" data-dn="' + i + '"' + (i === s.order.length - 1 ? " disabled" : "") + ' aria-label="Posunúť nižšie">' + ICP.dn + "</button></div>" +
      (o ? '<div class="body"><div class="fields">' + bodyOf(k) + "</div></div>" : "") + "</li>"; }).join("");
}
function thumb(id) {
  var a = "var(--c-gold)", i = "var(--c-slate)", p = "var(--c-paper)";
  var x = { susedska: '<rect x="8" y="12" width="36" height="5" rx="2" fill="' + i + '"/><rect x="8" y="20" width="28" height="5" rx="2" fill="' + i + '"/><rect x="8" y="30" width="16" height="6" rx="3" fill="' + a + '"/><circle cx="66" cy="24" r="12" fill="' + a + '"/><rect x="8" y="44" width="22" height="10" rx="2" fill="' + i + '" opacity=".35"/><rect x="34" y="44" width="22" height="10" rx="2" fill="' + i + '" opacity=".35"/><rect x="60" y="44" width="22" height="10" rx="2" fill="' + i + '" opacity=".35"/>',
    galeria: '<rect x="4" y="6" width="82" height="32" rx="3" fill="' + i + '" opacity=".45"/><rect x="9" y="22" width="34" height="12" rx="2" fill="' + p + '"/><rect x="12" y="25" width="20" height="3" rx="1" fill="' + i + '"/><rect x="4" y="42" width="40" height="14" rx="2" fill="' + i + '" opacity=".35"/><rect x="46" y="42" width="40" height="14" rx="2" fill="' + i + '" opacity=".35"/>',
    vizitka: '<circle cx="45" cy="16" r="9" fill="' + a + '"/><rect x="25" y="29" width="40" height="5" rx="2" fill="' + i + '"/><rect x="20" y="40" width="50" height="6" rx="2" fill="' + i + '" opacity=".35"/><rect x="20" y="49" width="50" height="6" rx="2" fill="' + i + '" opacity=".35"/>',
    luxus: '<rect width="90" height="42" fill="' + i + '"/><rect x="22" y="22" width="46" height="5" rx="1" fill="' + p + '"/><rect x="32" y="30" width="26" height="3" rx="1" fill="' + p + '" opacity=".7"/><rect x="6" y="47" width="46" height="9" fill="' + i + '" opacity=".35"/><rect x="56" y="48" width="28" height="3" fill="' + a + '"/>',
    rodinna: '<rect x="8" y="16" width="34" height="5" rx="2" fill="' + i + '"/><rect x="8" y="23" width="26" height="4" rx="2" fill="' + a + '" opacity=".5"/><rect x="8" y="33" width="16" height="6" rx="3" fill="' + a + '"/><path d="M58 10c12-4 24 4 24 18s-10 24-22 22-18-10-16-22 4-14 14-18z" fill="' + a + '" opacity=".6"/><rect x="4" y="50" width="82" height="8" rx="4" fill="' + i + '" opacity=".25"/>',
    mestska: '<rect width="45" height="44" fill="' + a + '"/><rect x="5" y="10" width="34" height="7" fill="' + p + '"/><rect x="5" y="19" width="26" height="7" fill="' + p + '"/><rect x="45" width="45" height="44" fill="' + i + '" opacity=".45"/><rect y="44" width="90" height="2" fill="' + i + '"/><rect x="5" y="50" width="22" height="4" fill="' + i + '"/><rect x="34" y="50" width="50" height="4" fill="' + i + '" opacity=".35"/>' }[id];
  return '<svg viewBox="0 0 90 60" aria-hidden="true"><rect width="90" height="60" fill="' + p + '"/>' + x + "</svg>";
}
function renderPanel() {
  var s = S();
  $("tabs").innerHTML = [["vzhlad", "Vzhľad"], ["sekcie", "Sekcie"], ["makler", "Maklér"], ["siete", "Siete"], ["kontrola", "Zverejniť"]].map(function (x) { return '<button type="button" class="tab" role="tab" data-tab="' + x[0] + '" aria-selected="' + (s.tab === x[0]) + '">' + x[1] + "</button>"; }).join("");
  document.querySelectorAll("[data-pane]").forEach(function (p) { p.hidden = p.dataset.pane !== s.tab; });
  $("tpls").innerHTML = T.TPLS.map(function (t) { return '<button type="button" class="tpl" data-tpl="' + t.id + '" aria-pressed="' + (s.tpl === t.id) + '">' + thumb(t.id) + "<b>" + t.name + "</b><small>" + t.desc + "</small></button>"; }).join("");
  var col = T.COLORS.find(function (c) { return c.id === s.color; }), curA = s.color === "vlastna" ? s.cc : (col ? col.c : "#DB9522");
  $("sets").innerHTML = T.SETS.map(function (x) { var on = s.color === "vlastna" && s.cc.toLowerCase() === x.a.toLowerCase() && (s.b2 || "").toLowerCase() === x.b.toLowerCase() && s.hcol === x.h && s.bg === x.bg, bg = T.BGS.find(function (b) { return b.id === x.bg; }).bg;
    return '<button type="button" class="set" data-set="' + x.id + '" aria-pressed="' + on + '"><span class="trio"><i style="background:' + x.a + '"></i><i style="background:' + x.b + '"></i><i style="background:' + bg + ';box-shadow:inset 0 0 0 1px rgba(0,0,0,.12)"></i></span><span>' + x.name + "</span></button>"; }).join("");
  $("colors").innerHTML = T.COLORS.map(function (c) { return '<button type="button" class="dot" style="--sw:' + c.c + '" data-col="' + c.id + '" aria-pressed="' + (s.color === c.id) + '" aria-label="' + c.name + '" title="' + c.name + '"></button>'; }).join("") +
    '<button type="button" class="dot own" style="--sw:' + s.cc + '" data-col="vlastna" aria-pressed="' + (s.color === "vlastna") + '" aria-label="Vlastná farba" title="Vlastná farba"><i></i></button>';
  var set = T.SETS.find(function (x) { return x.a.toLowerCase() === String(s.cc).toLowerCase(); });
  $("colName").textContent = s.color === "vlastna" ? ((set && set.name) || "Vlastná") + " " + String(s.cc).toUpperCase() : (col ? col.name : "");
  $("logoCols").innerHTML = s.logo && s.logoCols.length ? '<div class="grp" style="gap:6px"><span class="sub">Farby z tvojho loga</span><div class="sw">' + s.logoCols.map(function (c) { return '<button type="button" class="dot" style="--sw:' + c + '" data-lc="' + c + '" aria-pressed="' + (s.color === "vlastna" && s.cc.toLowerCase() === c.toLowerCase()) + '" aria-label="Farba z loga ' + c + '" title="' + c.toUpperCase() + '"></button>'; }).join("") + "</div></div>" : "";
  $("ccPick").value = curA; if (document.activeElement !== $("ccHex")) $("ccHex").value = curA.toUpperCase();
  $("c2Pick").value = s.b2 || curA; if (document.activeElement !== $("c2Hex")) $("c2Hex").value = (s.b2 || "").toUpperCase(); $("c2Clear").hidden = !s.b2;
  $("bgPick").value = s.cbg; if (document.activeElement !== $("bgHex")) $("bgHex").value = String(s.cbg).toUpperCase();
  seg("hcols", [["text", "Ako text"], ["a", "Hlavná farba"], ["b", "Doplnková farba"]], s.hcol, "hc");
  $("fonts").innerHTML = T.FONTS.map(function (f) { return '<button type="button" class="chip" data-font="' + f.id + '" aria-pressed="' + (s.font === f.id) + '" style="font-family:' + f.h.replace(/"/g, "'") + ";font-weight:" + Math.min(f.w, 800) + '">' + f.name + "</button>"; }).join("");
  seg("bgs", T.BGS.map(function (b) { return [b.id, b.name]; }).concat([["vlastne", "Vlastné"]]), s.bg, "bg");
  var hasImg = T.HERO_IMG_TPLS.indexOf(s.tpl) >= 0, kind = s.tpl === "mestska" ? "mesto" : "dom", video = s.heroMedia === "video";
  var aiFoto = '<div class="lab" style="grid-column:1/-1">' + (s.heroImg ? "Alebo vyber ilustračnú fotku" : "Ilustračné fotky na výber") + '</div><div class="ailib" style="grid-column:1/-1">' +
    T.AI_LIB.map(function (n) { var on = !s.heroImg && T.heroAi(kind) === n; return '<button type="button" class="aith" data-aiimg="' + n + '" aria-pressed="' + on + '" title="Použiť túto fotku"><img src="' + T.aiSrc(n, true) + '" alt="" loading="lazy"></button>'; }).join("") + "</div>";
  var AV = { "video-dom": "dom-novostavba", "video-luxus": "luxus-obyvacka", "video-mesto": "mesto-namestie" }, aktVid = s.heroVideo ? "" : (T.AI_VID_LIB.some(function (v) { return v[0] === s.heroAiVid; }) ? s.heroAiVid : kind === "mesto" ? "video-mesto" : s.tpl === "luxus" ? "video-luxus" : "video-dom");
  var aiVideo = '<div class="lab" style="grid-column:1/-1">' + (s.heroVideo ? "Alebo vyber ilustračné video" : "Ilustračné videá na výber") + '</div><div class="ailib vid" style="grid-column:1/-1">' +
    T.AI_VID_LIB.map(function (v) { return '<button type="button" class="aith" data-aivid="' + v[0] + '" aria-pressed="' + (aktVid === v[0]) + '"><img src="' + T.aiSrc(AV[v[0]], true) + '" alt="" loading="lazy"><span>' + esc(v[1]) + "</span></button>"; }).join("") + "</div>";
  var src = s.heroImg || T.aiSrc(T.heroAi(kind)), f = T.ohnisko(), fx = f ? f.split(" ") : ["50%", "50%"];
  var foc = hasImg && !video ? '<div class="lab" style="grid-column:1/-1">Čo má byť na fotke vždy vidno</div><div class="focbox" data-focbox style="grid-column:1/-1" title="Klikni na miesto, ktoré má byť vždy vidno"><img src="' + esc(src) + '" alt=""><i style="left:' + fx[0] + ";top:" + fx[1] + '"></i></div>' +
    '<p class="note">Klikni na fotku, napríklad na dom. Na mobile a úzkych obrazovkách sa fotka oreže okolo tohto miesta.' + (f ? ' <button type="button" class="lbtn" data-focreset>Vrátiť na stred</button>' : "") + "</p>" : "";
  var pos = hasImg && (s.tpl === "galeria" || s.tpl === "luxus") ? '<div class="lab" style="grid-column:1/-1">Umiestnenie ' + (s.tpl === "galeria" ? "bubliny" : "textu") + '</div><div class="seg" style="grid-column:1/-1">' +
    [["l", "Vľavo"], ["c", "V strede"], ["r", "Vpravo"]].map(function (x) { return '<button type="button" class="chip" data-hpos="' + x[0] + '" aria-pressed="' + (T.pozicia() === x[0]) + '">' + x[1] + "</button>"; }).join("") + "</div>" : "";
  $("fHero").innerHTML = (hasImg ? "" : '<p class="note">Šablóna ' + T.TPLS.find(function (t) { return t.id === s.tpl; }).name + " nemá veľkú fotku ani video v úvode. Prepni na šablónu s fotkou cez celý úvod:</p>" +
      '<div class="seg" style="grid-column:1/-1">' + T.HERO_IMG_TPLS.map(function (id) { return '<button type="button" class="chip" data-tpl="' + id + '">' + T.TPLS.find(function (t) { return t.id === id; }).name + "</button>"; }).join("") + "</div>") +
    '<div class="seg" style="grid-column:1/-1">' + [["foto", "Fotka"], ["pohyb", "Pomaly sa približuje"], ["video", "Video"]].map(function (x) { return '<button type="button" class="chip" data-hm="' + x[0] + '" aria-pressed="' + (s.heroMedia === x[0]) + '">' + x[1] + "</button>"; }).join("") + "</div>" +
    (video ? upl("Vlastné video do úvodu", "heroVideo", { video: 1 }) + '<p class="note">Krátke video bez zvuku, napríklad prelet dronom, 10 až 30 sekúnd. Veľké video zmenším priamo v prehliadači, trvá to asi tak dlho ako samotné video.</p>' + aiVideo
      : upl("Vlastná úvodná fotka", "heroImg", { max: 2200 }) + '<p class="note">Najlepšie fungujú fotky na šírku. Pod ilustračnými fotkami od AI sa na webe ukáže poznámka, že sú vytvorené AI.</p>' + aiFoto) + pos + foc + hlavneTlPole(s);
  seg("btnShape", [["pill", "Pilulka"], ["round", "Zaoblené"], ["square", "Hranaté"]], s.btn, "bs");
  seg("btnFill", [["fill", "Vyplnené"], ["outline", "Obrysové"]], s.btnFill, "bf");
  seg("phStyle", [["plain", "Bez rámika"], ["frame", "S rámikom"], ["shadow", "S tieňom"]], s.ph, "phs");
  seg("bubSeg", [["plne", "Plné"], ["polo", "Polopriehľadné"], ["sklo", "Sklo"]], s.bub, "bub");
  seg("animSeg", [["1", "Zapnuté"], ["0", "Vypnuté"]], s.anim ? "1" : "0", "an");
  // počítač s vypnutými animáciami v systéme ich v ukážke neukáže – vysvetlenie a možnosť pozrieť si ich aj tak
  $("animPozn").innerHTML = s.anim && T.bezPohybu() ? '<div class="anim-pozn">' + (W.vzdyPohyb
    ? "Animácie sa v ukážke zobrazujú, hoci ich máš v počítači vypnuté. Klienti ich uvidia podľa svojho nastavenia.<br><button type=\"button\" class=\"chip\" data-pohybvzdy=\"0\">Skryť animácie v ukážke</button>"
    : "Animácie v ukážke nevidíš, lebo ich máš vypnuté v nastaveniach počítača (zjednodušenie ovládania). Klienti so zapnutými animáciami ich na webe uvidia.<br><button type=\"button\" class=\"chip\" data-pohybvzdy=\"1\">Ukázať animácie v ukážke</button>") + "</div>" : "";
  seg("viewSeg", [["web", "Web"], ["prehlad", "Štatistiky"]], VIEW, "view");
  seg("dev", [["pc", "Počítač"], ["mob", "Mobil"]], s.dev, "dev");
  $("dev").hidden = $("editTg").hidden = VIEW !== "web";
  $("rad").value = s.r; $("rOut").textContent = s.r + " px";
  var vz = W.CTX.kancelaria || {};
  $("fMakler").innerHTML = upl("Logo", "logo", { max: 700, logo: 1 }) + (vz.logo && s.logo !== vz.logo ? '<button type="button" class="lbtn" data-logokanc style="grid-column:1/-1;justify-self:start;color:var(--c-ink)">Použiť logo kancelárie</button>' : "") +
    upl("Fotka makléra", "photo", { round: 1, max: 900 }) + upl("Druhá fotka makléra", "photo2", { max: 1400 }) + '<p class="note">Druhá fotka sa ukáže v sekcii O mne a pri kontakte. Hodí sa fotka pri práci, s klientom alebo pred nehnuteľnosťou. Bez nej sa použije hlavná fotka.</p>' + fld("Meno a priezvisko", "name") + fld("Kde pôsobí", "area") + fld("Kancelária", "office") + '<p class="note">Kým nenahráš svoju fotku, ukážka ukazuje ilustračnú fotku od AI. Na zverejnenom webe sa bez fotky zobrazia iniciály.</p>';
  $("fCisla").innerHTML = fld("Rokov v realitách", "years", { half: 1, ph: "napr. 16+" }) + fld("Predaných nehnuteľností", "sold", { half: 1, ph: "napr. 250+" }) +
    s.stats.map(function (x, i) { return listItem("stats", i, s.stats.length, fld("Číslo", "stats." + i + ".n", { half: 1, ph: i ? "napr. 20+" : "napr. 300+" }) + fld("Čo znamená", "stats." + i + ".t", { half: 1, ph: i ? "výkupov" : "predajov pod mojím vedením" }), "Odstrániť číslo"); }).join("") +
    (s.stats.length < 2 ? '<button type="button" class="addb" data-ladd="stats" style="grid-column:1/-1">+ Pridať ďalšie číslo</button>' : "") +
    '<p class="note">Čísla sa ukážu vo výraznom páse hneď pod úvodom webu, najviac 4. Pri čísle môžeš pridať aj znak, napríklad 250+. Keď ich návštevník uvidí, pekne sa napočítajú. Prázdne sa nezobrazia.</p>';
  $("fKontakt").innerHTML = fld("Telefón", "phone", { half: 1 }) + fld("WhatsApp", "wa", { half: 1, ph: "0905 ..." }) + fld("E-mail", "email") + '<p class="note">Keď vyplníš WhatsApp, na webe sa zobrazí zelené tlačidlo „Napíšte mi“ a pri každej ponuke odkaz s predvyplnenou správou.</p>' +
    fld("Adresa kancelárie", "addr", { ph: "napr. Hviezdoslavova 8, Spišská Nová Ves" }) + fld("Otváracie hodiny", "hours", { ph: "napr. Po – Pi 8:00 – 16:30, víkend po dohode" }) +
    '<label class="chk"><input type="checkbox" data-check="kava"' + (s.kava ? " checked" : "") + '>Ponúknuť kávu v kancelárii (pri adrese, s odkazom na mapu)</label>' +
    '<label class="chk"><input type="checkbox" data-check="online"' + (s.online ? " checked" : "") + '>Ponúknuť online hovor</label>' +
    '<label class="chk"><input type="checkbox" data-check="mbar"' + (s.mbar ? " checked" : "") + '>Na mobile zobraziť spodnú lištu Zavolať · WhatsApp · Ocenenie</label>';
  $("fGdpr").innerHTML = fld("Prevádzkovateľ (meno alebo firma)", "gdpr.who") + fld("IČO", "gdpr.ico", { half: 1 }) + fld("E-mail pre GDPR", "gdpr.mail", { half: 1, ph: s.email }) + fld("Sídlo", "gdpr.addr", { ph: "Ulica, PSČ Mesto" }) +
    '<label class="chk"><input type="checkbox" data-check="gdpr.bar"' + (s.gdpr.bar ? " checked" : "") + '>Zobraziť lištu so súhlasom s cookies</label>' +
    '<label class="chk"><input type="checkbox" data-check="footFirma"' + (s.footFirma ? " checked" : "") + '>Zobraziť firmu, IČO, sídlo a otváracie hodiny aj v pätičke webu</label>' +

    '<p class="note">Z týchto údajov sa vyskladá stránka Ochrana osobných údajov aj lišta s cookies. Je to vzorový text, pred spustením ho daj raz skontrolovať právnikovi.</p>';
  var TRK = T.trk(), stavMer = function (ok, vyplnene) { return '<span class="mer-stav' + (ok ? " ok" : vyplnene ? " zle" : "") + '">' + (ok ? "Napojené" : vyplnene ? "Zlý tvar ID" : "Nenapojené") + "</span>"; };
  $("fMeranie").innerHTML = '<p class="note">Obe sú nepovinné a navzájom nezávislé. Štatistiky webu (tlačidlo Štatistiky hore) fungujú aj bez nich.</p>' +
    '<div class="mer-blok"><div class="mer-hl"><b>Google Analytics</b>' + stavMer(!!TRK.ga, !!String(s.gdpr.gaId || "").trim()) + "</div>" +
      '<p class="note">Podrobné štatistiky návštevnosti v tvojom účte Google.</p>' + fld("ID merania", "gdpr.gaId", { ph: "G-XXXXXXXXXX" }) +
      '<a class="mer-odkaz" href="https://support.google.com/analytics/answer/12270356" target="_blank" rel="noopener">Kde nájdem ID Google Analytics →</a></div>' +
    '<div class="mer-blok"><div class="mer-hl"><b>Meta Pixel</b>' + stavMer(!!TRK.fb, !!String(s.gdpr.fbId || "").trim()) + "</div>" +
      '<p class="note">Pre reklamy na Facebooku a Instagrame. Zaznamená odoslané formuláre, kliky na telefón a WhatsApp a otvorené ponuky, takže uvidíš, čo ti reklama priniesla.</p>' + fld("ID Pixelu", "gdpr.fbId", { ph: "napr. 123456789012345" }) +
      '<a class="mer-odkaz" href="https://business.facebook.com/events_manager2" target="_blank" rel="noopener">ID Pixelu nájdeš v Správcovi udalostí Meta →</a></div>' +
    '<p class="note">Na webe sa zapnú až keď návštevník v lište cookies klikne Prijať všetky, preto sa lišta pri vyplnenom ID zobrazí vždy. Zmena sa prejaví po zverejnení webu.</p>';
  $("fSoc").innerHTML = T.SOC.map(function (x) { return fld(x[1], "soc." + x[0], { ph: x[2] }); }).join("") + '<p class="note">Vyplnené siete sa zobrazia ako ikony. Prázdne sa na webe nezobrazia.</p>';
  renderSecs(); renderKontrola(); renderPub(); renderAdresa(); renderVerzie();
  $("stage").classList.toggle("mob", s.dev === "mob");
  $("editTg").setAttribute("aria-pressed", W.EDIT); $("editHint").hidden = !W.EDIT || VIEW !== "web";
}
function all() { renderPanel(); T.render(); save(); if (VIEW === "prehlad") renderDash(); }
function soft() { T.render(); save(); renderKontrola(); }

/* ================================================================ kontrola, zverejnenie, adresa, verzie */
function checks() {
  var s = S(), ch = function (t, ok, go, when) { return when === false ? null : { t: t, ok: !!ok, go: go }; };
  return [
    ch("Fotka makléra", T.fotoMaklera(), ["makler", "u-photo"]),
    ch("Meno, telefón a e-mail", s.name && s.phone && s.email, ["makler", "f-name"]),
    ch("Čísla pod úvodom (roky, predaje)", String(s.years).trim() || String(s.sold).trim() || s.stats.some(function (x) { return x.n && x.t; }), ["makler", "f-years"]),
    ch("Úvodný text podľa seba", s.heroTx[s.tpl] && (s.heroTx[s.tpl].t || s.heroTx[s.tpl].l), ["edit"]),
    ch("Text O mne podľa seba", s.about.text !== T.DEF.about.text, ["sekcie", "omne"], !!s.on.omne),
    ch("Úvodná fotka alebo video", s.heroMedia === "video" ? s.heroVideo : s.heroImg, ["vzhlad", "u-heroImg"], T.HERO_IMG_TPLS.indexOf(s.tpl) >= 0),
    ch("Aspoň jedna aktívna ponuka v Nehnuteľnostiach", (W.CTX.ponuky || []).length, ["app"], !!s.on.ponuky),
    ch("Aspoň jedna sociálna sieť", T.SOC.some(function (x) { return String(s.soc[x[0]] || "").trim(); }), ["siete", "f-soc-fb"]),
    ch("Odkaz na video", s.video.url, ["sekcie", "video"], !!s.on.video),
    ch("Súbor e-booku", s.dl.url, ["sekcie", "stiahnut"], !!s.on.stiahnut),
    ch("Fotka v sekcii Fotka", s.img.src, ["sekcie", "fotka"], !!s.on.fotka),
    ch("Lokality vyplnené", s.loc.length > 0, ["sekcie", "lokality"], !!s.on.lokality),
    ch("Časté otázky podľa seba", JSON.stringify(s.faq) !== JSON.stringify(T.DEF.faq), ["sekcie", "faq"], !!s.on.faq),
    ch("Prevádzkovateľ, IČO a sídlo pre ochranu údajov", s.gdpr.who && s.gdpr.ico && s.gdpr.addr, ["makler", "f-gdpr-ico"])].filter(Boolean);
}
function renderKontrola() {
  var c = checks(), d = c.filter(function (x) { return x.ok; }).length, pct = Math.round(d / c.length * 100);
  $("readyPct").textContent = pct + " %"; $("readyBar").style.width = pct + "%"; $("ckPct").textContent = pct + " %";
  $("ckSub").textContent = pct === 100 ? "Všetko je doplnené." : "Chýba ešte " + (c.length - d) + " " + (c.length - d === 1 ? "vec" : c.length - d < 5 ? "veci" : "vecí") + ".";
  $("ckList").innerHTML = c.sort(function (a, b) { return a.ok - b.ok; }).map(function (x) { return '<li class="' + (x.ok ? "done" : "") + '"><span class="ok">' + (x.ok ? ICP.ok : "") + '</span><span class="t">' + x.t + "</span>" + (x.ok ? "" : '<button type="button" data-ckgo="' + x.go.join("|") + '">Doplniť</button>') + "</li>"; }).join("");
  renderShare();
}
W.editorGo = function (g) { goFix(g); };
function goFix(g) {
  var p = g.split("|"), tab = p[0], id = p[1];
  if (tab === "app") { location.href = "./#nehnutelnosti"; return; }
  if (tab === "edit") { setView("web"); W.EDIT = true; all(); var h = document.querySelector("#site .hero"); if (h) h.scrollIntoView({ behavior: "smooth", block: "center" }); toast("Klikni na nadpis v ukážke a prepíš ho"); return; }
  S().tab = tab; if (tab === "sekcie") open.add(id); all();
  requestAnimationFrame(function () { var el = tab === "sekcie" ? document.querySelector('#secs li[data-k="' + id + '"]') : $(id); if (!el) return; el.scrollIntoView({ behavior: "smooth", block: "center" });
    var f = tab === "sekcie" ? el.querySelector(".body input,.body textarea") : (el.matches("input[type=file]") ? el.closest(".up").querySelector("label") : el); if (f && f.focus) f.focus(); });
}
/* obálka e-booku z prvej strany PDF (pdf.js sa načíta až keď treba) */
var PDFJS = null;
function nacitajPdfJs() {
  if (PDFJS) return PDFJS;
  PDFJS = new Promise(function (ok, ko) {
    var x = document.createElement("script"); x.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
    x.onload = function () { var L = window.pdfjsLib; if (!L) { ko(new Error("pdf.js")); return; } L.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js"; ok(L); };
    x.onerror = function () { PDFJS = null; ko(new Error("Nepodarilo sa načítať čítačku PDF.")); };
    document.head.appendChild(x);
  });
  return PDFJS;
}
function obalkaZPdf(buf) {
  return nacitajPdfJs().then(function (L) {
    return L.getDocument({ data: new Uint8Array(buf), isEvalSupported: false, standardFontDataUrl: "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/standard_fonts/" }).promise;
  }).then(function (doc) { return doc.getPage(1); }).then(function (p) {
    var v0 = p.getViewport({ scale: 1 }), k = Math.min(3, 1000 / v0.width), v = p.getViewport({ scale: k }), c = document.createElement("canvas");
    c.width = Math.round(v.width); c.height = Math.round(v.height); var g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height);
    return p.render({ canvasContext: g, viewport: v }).promise.then(function () { return new Promise(function (ok) { c.toBlob(ok, "image/jpeg", 0.86); }); });
  }).then(function (b) { if (!b) return ""; return nahraj(b, "obalka-ebooku.jpg", "image/jpeg"); });
}
function pdfObalkaZNahraneho() {
  var s = S(); if (!s.dl.url) return;
  toast("Robím obálku z prvej strany PDF…");
  fetch(s.dl.url).then(function (r) { if (!r.ok) throw new Error("PDF sa nepodarilo načítať."); return r.arrayBuffer(); }).then(obalkaZPdf)
    .then(function (img) { if (!img) throw new Error("Obálku sa nepodarilo vytvoriť."); s.dl.img = img; s.dl.imgAuto = true; all(); toast("Obálka je hotová"); })
    .catch(function (e) { toast((e && e.message) || "Obálku sa nepodarilo vytvoriť.", true); });
}
/* QR kód adresy webu */
function qrModuly(text) { if (!window.qrcode) return null; var q = window.qrcode(0, "M"); q.addData(text); q.make(); return q; }
function qrSvg(text, tlac) {
  var q = qrModuly(text); if (!q) return "";
  var n = q.getModuleCount(), m = 4, d = "";
  for (var r = 0; r < n; r++) for (var c = 0; c < n; c++) if (q.isDark(r, c)) d += "M" + (c + m) + " " + (r + m) + "h1v1h-1z";
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + (n + 2 * m) + " " + (n + 2 * m) + '"' + (tlac ? ' width="40mm" height="40mm"' : "") + ' shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><path d="' + d + '" fill="#000"/></svg>';
}
function stiahni(blob, nazov) { var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = nazov; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500); }
function stiahniQr(druh) {
  var u = qrOdkaz(), q = qrModuly(u), nazov = "qr-" + (WEB.adresa || "web");
  if (!q) { toast("QR kód sa nepodarilo vytvoriť. Skontroluj pripojenie a skús znova.", true); return; }
  if (druh === "svg") { stiahni(new Blob([qrSvg(u, true)], { type: "image/svg+xml" }), nazov + ".svg"); return; }
  var n = q.getModuleCount(), m = 4, k = Math.floor(1200 / (n + 2 * m)), c = document.createElement("canvas"), x = c.getContext("2d");
  c.width = c.height = k * (n + 2 * m); x.fillStyle = "#fff"; x.fillRect(0, 0, c.width, c.height); x.fillStyle = "#000";
  for (var r = 0; r < n; r++) for (var cc = 0; cc < n; cc++) if (q.isDark(r, cc)) x.fillRect((cc + m) * k, (r + m) * k, k, k);
  c.toBlob(function (b) { if (b) stiahni(b, nazov + ".png"); }, "image/png");
}
function renderPub() {
  if (!WEB) return;
  var u = verejnyOdkaz();
  $("pubBox").innerHTML = (WEB.zverejnene_kedy ? "<b>Web je zverejnený</b><span class=\"sub\">Naposledy " + esc(cas(WEB.zverejnene_kedy)) + (ZMENY ? ". Máš zmeny, ktoré klienti ešte nevidia." : ". Klienti vidia aktuálnu verziu.") + "</span>" +
      '<div class="linkbox"><input id="pubLink" readonly value="' + esc(u) + '" aria-label="Adresa webu"><button type="button" class="b b-ink b-sm" data-kop="pub">Kopírovať</button><a class="b b-soft b-sm" href="' + esc(u) + '" target="_blank" rel="noopener">Otvoriť</a></div>' +
      '<div class="qrbox"><div class="qr">' + qrSvg(qrOdkaz()) + '</div><div><b>QR kód webu</b><span class="sub">Na vizitky, letáky a tabule Predám. Po naskenovaní sa otvorí tvoj web a v Prehľade uvidíš, koľko ľudí prišlo cez QR kód.</span><div class="qrbtns"><button type="button" class="b b-soft b-sm" data-qr="png">Stiahnuť obrázok</button><button type="button" class="b b-soft b-sm" data-qr="svg">Stiahnuť na tlač (SVG)</button></div></div></div>'
    : "<b>Web zatiaľ nie je zverejnený</b><span class=\"sub\">Klienti ho uvidia po kliknutí na Zverejniť web. Dovtedy si ho môžeš pozrieť cez Náhľad.</span>") +
    '<button type="button" class="b b-gold" data-zverejnit>' + (WEB.zverejnene_kedy ? "Zverejniť zmeny" : "Zverejniť web") + "</button>" +
    '<span class="sub">Odkaz na náhľad rozpracovaného webu pre kolegu (musí byť prihlásený v Realitnom týpkovi):</span><div class="linkbox"><input id="nahLink" readonly value="' + esc(nahladOdkaz()) + '" aria-label="Odkaz na náhľad"><button type="button" class="b b-soft b-sm" data-kop="nah">Kopírovať</button></div>';
  $("nahlad").href = nahladOdkaz();
  $("zverejnit").textContent = WEB.zverejnene_kedy ? (ZMENY ? "Zverejniť zmeny" : "Zverejnené") : "Zverejniť web";
}
function renderAdresa() {
  if (!WEB) return;
  var base = new URL("stranka.html?m=", location.href).href;
  if (!$("fAdresa").contains(document.activeElement)) $("fAdresa").innerHTML =
    (WEB.adresa_navrh ? '<div class="dom-krok full cak"><b>Čaká na schválenie: ' + esc(WEB.adresa_navrh) + '</b><span class="sub">Admin dostal žiadosť do zvončeka' + (WEB.adresa_navrh_kedy ? " " + esc(cas(WEB.adresa_navrh_kedy)) : "") + '. Kým ju schváli, web beží na adrese ' + esc(WEB.adresa) + '.</span><button type="button" class="b b-soft b-sm" data-adrzrus>Zrušiť žiadosť</button></div>' : "") +
    '<label class="full">Adresa za ' + esc(base) + '<input id="adr" value="' + esc(WEB.adresa_navrh || WEB.adresa) + '" autocomplete="off" spellcheck="false"></label>' +
    '<button type="button" class="b b-soft b-sm" data-adresa style="grid-column:1/-1;justify-self:start">' + (WEB.adresa_navrh ? "Zmeniť žiadosť" : "Požiadať o novú adresu") + "</button>" +
    '<p class="note">Malé písmená bez diakritiky, číslice a pomlčky. Novú adresu schvaľuje admin. Staré odkazy aj vytlačené QR kódy budú fungovať ďalej.</p>';
  if (!$("fDomena").contains(document.activeElement)) $("fDomena").innerHTML = domenaHtml();
}
/* vlastná doména: 1. overenie, či je voľná (register domén), 2. uloženie, 3. DNS záznamy, 4. kontrola, 5. admin pripojí */
var DOM_INFO = null, DOM_KONTROLA = null;
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
function kopBtn(hodnota) { return '<button type="button" class="b b-soft b-sm" data-kopit="' + esc(hodnota) + '">Kopírovať</button>'; }
function domenaHtml() {
  var d = WEB.domena, ip = (DOM_INFO && DOM_INFO.ip && DOM_INFO.ip[0]) || "", k = DOM_KONTROLA || {};
  if (!d) return '<label class="full">Doména<input id="dom" value="" placeholder="napr. janakovacova.sk" autocomplete="off" spellcheck="false"></label>' +
    '<div class="full" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><button type="button" class="b b-soft b-sm" data-domcheck>Overiť, či je voľná</button><button type="button" class="b b-soft b-sm" data-domsave>Použiť túto doménu</button></div>' +
    '<p class="dom-stav full" id="domStav" role="status"></p>' +
    '<p class="note">Doménu si zaregistruješ u ľubovoľného registrátora (Websupport, Webglobe, Active24…). Overenie sa pýta priamo registra domén. Kým doménu nepripojíme, web beží na adrese vyššie.</p>';
  if (WEB.domena_pripojena) return '<div class="dom-krok full hot"><b>Web beží na <a href="https://' + esc(d) + '/" target="_blank" rel="noopener">' + esc(d) + "</a></b><span class=\"sub\">Pripojené " + esc(cas(WEB.domena_pripojena)) + ". Odkazy aj QR kód teraz vedú na túto doménu, stará adresa funguje ďalej.</span></div>" +
    '<div class="full"><button type="button" class="b b-soft b-sm" data-domdel>Odstrániť doménu</button></div>';
  var ok1 = !!WEB.domena_overena, ok2 = !!WEB.domena_smeruje, krok = function (ok, n, nadpis, telo) {
    return '<div class="dom-krok full' + (ok ? " hot" : "") + '"><b><span class="dk-n" aria-hidden="true">' + (ok ? "✓" : n) + "</span>" + nadpis + (ok ? ' <span class="dk-ok">hotovo</span>' : "") + "</b>" + telo + "</div>";
  };
  var zaznam = function (typ, nazov, hodnota) {
    return '<div class="dk-zaz"><span><small>Typ</small><code>' + typ + '</code></span><span><small>Názov</small><code>' + esc(nazov) + '</code></span><span class="dk-hod"><small>Hodnota</small><code>' + esc(hodnota) + "</code></span>" + kopBtn(hodnota) + "</div>";
  };
  return '<div class="dom-hlava full"><b>' + esc(d) + '</b><button type="button" class="b b-soft b-sm" data-domdel>Zmeniť alebo odstrániť</button></div>' +
    krok(ok1, 1, "Over, že doména je tvoja", '<span class="sub">U registrátora domény pridaj v nastavení DNS tento záznam:</span>' + zaznam("TXT", "_realitnytypek", WEB.domena_token || "")) +
    krok(ok2, 2, "Nasmeruj doménu na web", '<span class="sub">Hlavný záznam domény nastav na náš server (starý A záznam nahraď):</span>' + zaznam("A", "@ (prázdny názov)", ip || "načítavam…") +
      '<span class="sub">Ak chceš, aby fungovalo aj www.' + esc(d) + ':</span>' + zaznam("CNAME", "www", d)) +
    krok(!!WEB.domena_ziadost && ok1 && ok2, 3, "Pripojenie", '<span class="sub">' + (ok1 && ok2 ? "Všetko je nastavené. Admin doménu pripojí a zapne zabezpečenie (https), zvyčajne do 1 pracovného dňa. Príde ti upozornenie do zvončeka." : "Keď sú prvé dva kroky hotové, admin dostane žiadosť a doménu pripojí.") + "</span>") +
    '<div class="full" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><button type="button" class="b b-ink b-sm" data-domover>Skontrolovať nastavenie</button><span class="dom-stav" id="domStav" role="status">' +
    (k.konflikt ? '<span class="zle">Túto doménu už overil iný web. Ozvi sa adminovi.</span>' : WEB.domena_kontrola ? "Naposledy skontrolované " + esc(cas(WEB.domena_kontrola)) : "") + "</span></div>" +
    '<p class="note">Zmena v DNS sa zvyčajne prejaví do hodiny, niekedy až do 24 hodín. Kontrolu môžeš spustiť kedykoľvek znova.</p>';
}
function renderVerzie() {
  if (!WEB) return;
  var V = WEB.verzie || [];
  $("verzie").innerHTML = V.length ? V.slice(0, 12).map(function (v, i) { return '<li><span>' + (i === 0 ? "<b>Aktuálne zverejnená</b> · " : "") + esc(cas(v.kedy)) + (v.kto ? " · " + esc(v.kto) : "") + '</span><button type="button" data-verzia="' + v.id + '">Vrátiť</button></li>'; }).join("")
    : '<li><span class="sub">Zatiaľ žiadne. Prvá verzia sa uloží pri zverejnení.</span></li>';
}
function renderShare() {
  var s = S(), P = T.pal(), t = s.share.title || s.name + " | Realitný maklér" + (s.area ? ", " + s.area : ""), d = s.share.desc || T.heroTx().l || "Predaj, kúpa a prenájom nehnuteľností v regióne " + s.area + ".";
  $("favBig").innerHTML = T.favSvg(P); $("favSmall").innerHTML = T.favSvg(P);
  var im = s.heroImg ? '<img src="' + esc(s.heroImg) + '" alt="">' : s.photo ? '<img src="' + esc(s.photo) + '" alt="">' : '<img src="' + T.aiSrc(T.heroAi(s.tpl === "mestska" ? "mesto" : "dom"), true) + '" alt="">';
  $("sharePrev").innerHTML = '<div class="im">' + im + '</div><div class="tx"><small>' + esc(location.host) + "</small><b>" + esc(t) + "</b><span>" + esc(d) + "</span></div>";
  if (!$("fShare").contains(document.activeElement)) $("fShare").innerHTML = fld("Nadpis pri zdieľaní", "share.title", { ph: t }) + fld("Popis pri zdieľaní", "share.desc", { area: 1, rows: 2, ph: d }) + '<p class="note">Nechaj prázdne a vyplní sa samo z mena a úvodu webu.</p>';
}

/* ================================================================ prehľad pre makléra */
function setView(v) { VIEW = v; $("stage").hidden = v !== "web"; $("dash").hidden = v !== "prehlad"; $("statBtn").setAttribute("aria-pressed", v === "prehlad"); if (v === "prehlad") renderDash(); renderPanel(); }
// obdobie štatistík: predvolene posledných 30 dní, dá sa zmeniť alebo zadať vlastné dátumy
var OBD = { typ: "30", od: "", do: "" };
var OBD_N = [["7", "7 dní"], ["30", "30 dní"], ["90", "3 mesiace"], ["365", "12 mesiacov"], ["rok", "Tento rok"], ["vsetko", "Od spustenia"], ["vlastne", "Vlastné dátumy"]];
var MES = ["január", "február", "marec", "apríl", "máj", "jún", "júl", "august", "september", "október", "november", "december"];
function dnes0() { var d = new Date(); d.setHours(0, 0, 0, 0); return d; }
function zIso(s) { var p = String(s || "").split("-"); return p.length === 3 ? new Date(+p[0], +p[1] - 1, +p[2]) : null; }
function obdobie() {
  var dn = dnes0(), od = null, dd = dn;
  if (/^\d+$/.test(OBD.typ)) { od = new Date(dn); od.setDate(dn.getDate() - (+OBD.typ - 1)); }
  else if (OBD.typ === "rok") od = new Date(dn.getFullYear(), 0, 1);
  else if (OBD.typ === "vlastne") { od = zIso(OBD.od) || new Date(dn.getFullYear(), dn.getMonth(), 1); dd = zIso(OBD.do) || dn; if (dd > dn) dd = dn; if (od > dd) od = new Date(dd); }
  return { od: od, do: dd };
}
function datTxt(d) { return d.getDate() + ". " + (d.getMonth() + 1) + ". " + d.getFullYear(); }
function obdNazov(n) { var t = OBD.typ; return t === "7" ? "Posledných 7 dní" : t === "30" ? "Posledných 30 dní" : t === "90" ? "Posledné 3 mesiace" : t === "365" ? "Posledných 12 mesiacov" : t === "rok" ? "Tento rok" : t === "vsetko" ? "Od spustenia webu" : n === 1 ? "Jeden deň" : "Vlastné obdobie"; }
function obdBar(o) {
  return '<div class="obd"><div class="seg" role="group" aria-label="Obdobie">' + OBD_N.map(function (x) { return '<button type="button" class="chip" data-obd="' + x[0] + '" aria-pressed="' + (OBD.typ === x[0]) + '">' + x[1] + "</button>"; }).join("") + "</div>" +
    (OBD.typ === "vlastne" ? '<div class="obd-vl"><label>Od <input type="date" id="obdOd" value="' + isoDen(o.od) + '" max="' + isoDen(dnes0()) + '"></label><label>Do <input type="date" id="obdDo" value="' + isoDen(o.do) + '" max="' + isoDen(dnes0()) + '"></label><button type="button" class="b b-soft b-sm" data-obdok>Zobraziť</button></div>' : "") + "</div>";
}
function renderDash() {
  var el = $("dash"), o = obdobie();
  el.innerHTML = '<div class="dash"><div class="dh"><div><div class="lab">' + obdNazov() + '</div><h2>Štatistiky webu</h2></div></div>' + obdBar(o) + '<div class="prazdny">Načítavam štatistiky…</div></div>';
  var ids = (W.CTX.ponuky || []).map(function (x) { return x.id; }).filter(Boolean);
  var kq = sb.from("web_kontakty").select("*").eq("web_id", WEB.id).order("vytvorene", { ascending: false }).limit(300);
  if (o.od) { var dp = new Date(o.do); dp.setDate(dp.getDate() + 1); kq = kq.gte("vytvorene", o.od.toISOString()).lt("vytvorene", dp.toISOString()); }
  Promise.all([sb.rpc("web_statistiky", { p_web_id: WEB.id, p_od: o.od ? isoDen(o.od) : null, p_do: isoDen(o.do), p_ponuky: ids }), kq]).then(function (r) {
    if (r[0].error || r[1].error) throw r[0].error || r[1].error;
    var D = r[0].data || {}, od = zIso(D.od) || o.od || dnes0(), dd = zIso(D.do) || o.do, N = Math.round((dd - od) / 864e5) + 1, porovnaj = OBD.typ !== "vsetko";
    var den = {}; (D.dni || []).forEach(function (x) { den[x[0]] = x[1]; });
    var VIS = Array.from({ length: N }, function (_, i) { var d = new Date(od); d.setDate(od.getDate() + i); return den[isoDen(d)] || 0; });
    var tot = VIS.reduce(function (a, b) { return a + b; }, 0), pred = +D.navstevy_pred || 0;
    var KK = D.kontakty || {}, kTot = Object.keys(KK).reduce(function (a, k) { return a + (+KK[k] || 0); }, 0), Kpred = +D.kontakty_pred || 0, K = r[1].data || [];
    var pz = D.ponuky || {}, kp = D.kliky_ponuky || {}, ZD = D.zdroje || {}, zdTot = Object.keys(ZD).reduce(function (a, k) { return a + (+ZD[k] || 0); }, 0);
    var KL = { tel: +((D.kliky || {}).tel) || 0, wa: +((D.kliky || {}).wa) || 0, mail: +((D.kliky || {}).mail) || 0 }, klTot = KL.tel + KL.wa + KL.mail, klPred = +D.kliky_pred || 0;
    var uspech = tot ? Math.min(100, Math.round((kTot + klTot) / tot * 1000) / 10) : 0;
    var top = (W.CTX.ponuky || []).filter(function (x) { return pz[x.id] || kp[x.id]; }).sort(function (a, b) { return (pz[b.id] || 0) - (pz[a.id] || 0) || (kp[b.id] || 0) - (kp[a.id] || 0); }).slice(0, 8);
    var odh = +KK.odhad || 0, obh = +KK.obhliadka || 0, zt = porovnaj ? (N === 1 ? "oproti predošlému dňu" : "oproti predošlým " + N + " dňom") : "";
    var NAZ = { odhad: "Odhad ceny", strazca: "Strážca ponúk", obhliadka: "Obhliadka", callback: "Zavolať späť", dotaznik: "Dotazník", ebook: "E-book", kontakt: "Správa" };
    // graf: krátke obdobie po dňoch, dlhšie po týždňoch, veľmi dlhé po mesiacoch
    var gr = N > 400 ? "m" : N > 92 ? "t" : "d", B = [];
    if (gr === "d") VIS.forEach(function (v, i) { var d = new Date(od); d.setDate(od.getDate() + i); B.push({ v: v, l: d.getDate() + ". " + (d.getMonth() + 1) + ".", t: d.getDate() + ". " + (d.getMonth() + 1) + ". " + d.getFullYear() }); });
    else if (gr === "t") for (var i = 0; i < N; i += 7) { var a1 = new Date(od); a1.setDate(od.getDate() + i); var a2 = new Date(od); a2.setDate(od.getDate() + Math.min(N - 1, i + 6)); B.push({ v: VIS.slice(i, i + 7).reduce(function (a, b) { return a + b; }, 0), l: a1.getDate() + ". " + (a1.getMonth() + 1) + ".", t: a1.getDate() + ". " + (a1.getMonth() + 1) + ". – " + a2.getDate() + ". " + (a2.getMonth() + 1) + ". " + a2.getFullYear() }); }
    else VIS.forEach(function (v, i) { var d = new Date(od); d.setDate(od.getDate() + i); var k = d.getFullYear() + "-" + d.getMonth(), last = B[B.length - 1]; if (!last || last.k !== k) B.push({ k: k, v: v, l: (d.getMonth() + 1) + "/" + String(d.getFullYear()).slice(2), t: MES[d.getMonth()] + " " + d.getFullYear() }); else last.v += v; });
    var L = B.length, W2 = 640, H2 = 220, pl = 40, pr = 14, pt = 14, pb = 28, mx = Math.max(4, Math.ceil(Math.max.apply(null, B.map(function (b) { return b.v; })) / 4) * 4);
    var sx = function (i) { return L < 2 ? (pl + W2 - pr) / 2 : pl + i * (W2 - pl - pr) / (L - 1); }, sy = function (v) { return pt + (H2 - pt - pb) * (1 - v / mx); };
    var line = B.map(function (b, i) { return (i ? "L" : "M") + sx(i).toFixed(1) + " " + sy(b.v).toFixed(1); }).join(" ");
    var grid = [0, mx / 4, mx / 2, mx * 3 / 4, mx].map(function (v) { return '<line class="g" x1="' + pl + '" x2="' + (W2 - pr) + '" y1="' + sy(v) + '" y2="' + sy(v) + '"/><text class="t" x="' + (pl - 8) + '" y="' + (sy(v) + 4) + '" font-size="11" text-anchor="end">' + v + "</text>"; }).join("");
    var xi = L < 2 ? [0] : [0, 0.25, 0.5, 0.75, 1].map(function (f) { return Math.round(f * (L - 1)); }).filter(function (v, i, a) { return a.indexOf(v) === i; });
    var xl = xi.map(function (i) { return '<text class="t" x="' + sx(i) + '" y="' + (H2 - 8) + '" font-size="11" text-anchor="' + (L < 2 ? "middle" : i === 0 ? "start" : i === L - 1 ? "end" : "middle") + '">' + B[i].l + "</text>"; }).join("");
    var nav = function (n) { return n === 1 ? " návšteva" : n > 1 && n < 5 ? " návštevy" : " návštev"; };
    var TR = T.trk();
    el.innerHTML = '<div class="dash"><div class="dh"><div><div class="lab">' + obdNazov(N) + " · " + datTxt(od) + (N > 1 ? " – " + datTxt(dd) : "") + '</div><h2>Štatistiky webu</h2></div>' + (WEB.zverejnene_kedy ? "" : '<span class="tagx">Web ešte nie je zverejnený</span>') + "</div>" + obdBar({ od: od, do: dd }) +
      '<div class="dash-mer"><span>Google Analytics: <b>' + (TR.ga ? "napojené" : "nenapojené") + "</b></span><span>Meta Pixel: <b>" + (TR.fb ? "napojený" : "nenapojený") + '</b></span><button type="button" class="b b-soft b-sm" data-ckgo="makler|f-gdpr-gaId">' + (TR.any ? "Upraviť" : "Napojiť Google Analytics alebo Meta Pixel") + "</button></div>" +
      '<div class="kpis"><div class="kpi"><small>Návštevy webu</small><b>' + T.fmt(tot) + "</b>" + (porovnaj ? zmena(tot, pred, zt) : "") + "</div>" +
      '<div class="kpi"><small>Kontakty z formulárov</small><b>' + T.fmt(kTot) + "</b>" + (porovnaj ? zmena(kTot, Kpred, zt) : "") + (odh || obh ? "<em>" + [odh ? odh + (odh === 1 ? " odhad ceny" : odh < 5 ? " odhady ceny" : " odhadov ceny") : "", obh ? obh + (obh === 1 ? " obhliadka" : obh < 5 ? " obhliadky" : " obhliadok") : ""].filter(Boolean).join(", ") + "</em>" : "") + "</div>" +
      '<div class="kpi"><small>Kliky na kontakt</small><b>' + T.fmt(klTot) + "</b>" + (porovnaj ? zmena(klTot, klPred, zt) : "") + "<em>telefón, WhatsApp, e-mail</em></div>" +
      '<div class="kpi"><small>Úspešnosť webu</small><b>' + String(uspech).replace(".", ",") + ' %</b><em>' + (tot ? "návštev skončilo kontaktom alebo klikom" : "keď prídu prvé návštevy") + "</em></div></div>" +
      '<div class="dgrid"><div class="card2"><h3>Návštevy ' + (gr === "d" ? "po dňoch" : gr === "t" ? "po týždňoch" : "po mesiacoch") + "</h3>" + (tot ? '<div class="chart"><svg viewBox="0 0 ' + W2 + " " + H2 + '" role="img" aria-label="Návštevy webu ' + esc(datTxt(od) + " – " + datTxt(dd)) + ", spolu " + tot + '">' + grid + (L > 1 ? '<path class="ar" d="' + line + " L" + sx(L - 1) + " " + sy(0) + " L" + sx(0) + " " + sy(0) + ' Z"/><path class="ln" d="' + line + '" fill="none" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>' : "") + xl +
        '<circle class="dt" cx="' + sx(L - 1) + '" cy="' + sy(B[L - 1].v) + '" r="5" stroke-width="2"/><line class="xh" id="vx" x1="0" x2="0" y1="' + pt + '" y2="' + (H2 - pb) + '" stroke-dasharray="3 3" visibility="hidden"/><circle class="dt" id="vd" r="5" stroke-width="2" visibility="hidden"/><rect x="' + pl + '" y="0" width="' + (W2 - pl - pr) + '" height="' + (H2 - pb) + '" fill="transparent" id="vhit"/></svg><div class="tip" id="vtip" hidden></div></div>'
        : '<div class="prazdny">V tomto období žiadne návštevy. Počítajú sa len návštevy zverejneného webu, tvoje vlastné nie.</div>') + "</div>" +
      zdrojeHtml(ZD, zdTot, tot) + "</div>" +
      '<div class="dgrid"><div class="card2"><h3>Najsledovanejšie ponuky</h3>' + (top.length ? '<div class="hrow hhead"><span>Ponuka</span><span>Zobrazenia</span><span>Kliky</span></div>' + top.map(function (x) { return '<div class="hrow"><span>' + esc(x.t) + "</span><b>" + (pz[x.id] || 0) + "</b><b>" + (kp[x.id] || 0) + "</b></div>"; }).join("") : '<div class="prazdny">V tomto období bez zobrazení.</div>') + "</div>" +
      klikyHtml(KL, klTot) + "</div>" +
      strazcaHtml() +
      '<div class="card2"><h3>Kontakty z webu</h3><p class="sub">Kontakty za vybrané obdobie' + (K.length >= 300 ? " (posledných 300)" : "") + '. Každý kontakt ti príde aj do zvončeka v aplikácii. Odpovedať môžeš jedným klikom, text je pripravený a pred odoslaním ho ešte uvidíš. Strážca ponúk sa zapíše medzi dopyty v Klientoch.</p>' +
      (K.length ? '<div class="tbl"><table><thead><tr><th>Kedy</th><th>Meno</th><th>Kontakt</th><th>Odkiaľ</th><th>Čo chce</th><th>Odpovedať</th><th></th></tr></thead><tbody>' + K.map(function (k) {
        var pon = k.nehnutelnost_id && (W.CTX.ponuky || []).find(function (x) { return x.id === k.nehnutelnost_id; });
        return "<tr><td class=\"num\">" + esc(cas(k.vytvorene)) + "</td><td>" + esc(k.meno || "–") + "</td><td>" + esc(k.kontakt) + '</td><td><span class="src' + (k.vybavene ? "" : " new") + '">' + esc(NAZ[k.zdroj] || k.zdroj) + "</span></td><td>" + esc(k.co || "") + (pon ? '<div class="sub">' + esc(pon.t) + "</div>" : "") +
          '</td><td><div class="odp">' + (window.TYPEK_ODPOVED ? TYPEK_ODPOVED.html(k, odpovedMakler(), pon && pon.t, "b b-soft b-sm") : "") + '</div></td><td><button type="button" class="b b-soft b-sm" data-vyb="' + k.id + '" data-v="' + (k.vybavene ? 0 : 1) + '">' + (k.vybavene ? "Vrátiť" : "Vybavené") + "</button></td></tr>";
      }).join("") + "</tbody></table></div>" : '<div class="prazdny">V tomto období žiadne kontakty. Prídu, keď návštevník vyplní formulár na zverejnenom webe.</div>') + "</div></div>";
    var hit = $("vhit"); if (!hit) return; var svg = hit.ownerSVGElement, tip = $("vtip");
    hit.addEventListener("pointermove", function (e) { var r2 = svg.getBoundingClientRect(), x = (e.clientX - r2.left) * W2 / r2.width, i = L < 2 ? 0 : Math.max(0, Math.min(L - 1, Math.round((x - pl) / ((W2 - pl - pr) / (L - 1)))));
      $("vx").setAttribute("x1", sx(i)); $("vx").setAttribute("x2", sx(i)); $("vx").setAttribute("visibility", "visible"); $("vd").setAttribute("cx", sx(i)); $("vd").setAttribute("cy", sy(B[i].v)); $("vd").setAttribute("visibility", "visible");
      tip.hidden = false; tip.textContent = B[i].t + ": " + T.fmt(B[i].v) + nav(B[i].v); tip.style.left = (sx(i) * r2.width / W2) + "px"; tip.style.top = (sy(B[i].v) * r2.height / H2) + "px"; });
    hit.addEventListener("pointerleave", function () { tip.hidden = true; $("vx").setAttribute("visibility", "hidden"); $("vd").setAttribute("visibility", "hidden"); });
  }).catch(function (e) { el.innerHTML = '<div class="dash"><div class="dh"><div><div class="lab">' + obdNazov() + '</div><h2>Štatistiky webu</h2></div></div>' + obdBar(o) + '<div class="prazdny">Štatistiky sa nepodarilo načítať: ' + esc(chybaText(e)) + "</div></div>"; });
}

// počet návštev za 30 dní na tlačidle Štatistiky
function nacitajOdznak() {
  if (!WEB || !WEB.id || !WEB.zverejnene_kedy) return;
  var od = new Date(); od.setHours(0, 0, 0, 0); od.setDate(od.getDate() - 29);
  sb.from("web_zobrazenia").select("pocet").eq("web_id", WEB.id).gte("den", isoDen(od)).then(function (r) {
    if (r.error) return; var n = (r.data || []).reduce(function (a, x) { return a + x.pocet; }, 0), b = $("statBtn"); if (!b) return;
    var o = b.querySelector(".bdg"); if (!o) { o = document.createElement("span"); o.className = "bdg"; b.appendChild(o); }
    o.textContent = T.fmt(n); b.title = n + " návštev za posledných 30 dní";
  });
}
function isoDen(d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
// zmena oproti predošlému rovnako dlhému obdobiu
function zmena(teraz, predtym, txt) {
  txt = txt || "oproti predošlým 30 dňom";
  if (!teraz && !predtym) return "";
  if (!predtym) return '<span class="zm hore">nové ' + txt + "</span>";
  var p = Math.round((teraz - predtym) / predtym * 100);
  return '<span class="zm ' + (p > 0 ? "hore" : p < 0 ? "dole" : "") + '">' + (p > 0 ? "+" : p < 0 ? "−" : "±") + Math.abs(p) + " % " + txt + "</span>";
}
var ZDROJE_N = [["google", "Google"], ["facebook", "Facebook"], ["instagram", "Instagram"], ["qr", "QR kód (letáky, tabule)"], ["email", "E-mail"], ["vyhladavac", "Iné vyhľadávače"], ["iny", "Iné weby"], ["priamo", "Priamo"]];
function zdrojeHtml(ZD, zdTot, tot) {
  var rows = ZDROJE_N.filter(function (z) { return ZD[z[0]]; }).sort(function (a, b) { return ZD[b[0]] - ZD[a[0]]; }), mx = rows.length ? ZD[rows[0][0]] : 1;
  return '<div class="card2"><h3>Odkiaľ prišli</h3>' + (rows.length ? rows.map(function (z) { var n = ZD[z[0]]; return '<div class="hbar hbar2"><span>' + z[1] + '</span><span class="tr"><i style="width:' + Math.max(3, Math.round(n / mx * 100)) + '%"></i></span><b>' + n + '</b><small>' + Math.round(n / zdTot * 100) + " %</small></div>"; }).join("") +
      (zdTot < tot ? '<p class="sub">Zdroje sa počítajú od 24. 10. 2026, staršie návštevy ich nemajú.</p>' : "")
    : '<div class="prazdny">Zdroje sa počítajú od 24. 10. 2026. Ukážu sa s ďalšími návštevami.</div>') +
    '<p class="sub">Návštevy z QR kódu sa rátajú pri QR kóde stiahnutom od 24. 10. 2026 (Nastavenia → Zverejnenie). Starší QR kód funguje ďalej, len sa ráta ako „Priamo“.</p></div>';
}
function klikyHtml(KL, klTot) {
  var rows = [["tel", "Telefón"], ["wa", "WhatsApp"], ["mail", "E-mail"]], mx = Math.max(1, KL.tel, KL.wa, KL.mail);
  return '<div class="card2"><h3>Kliky na kontakt</h3>' + (klTot ? rows.map(function (z) { var n = KL[z[0]] || 0; return '<div class="hbar"><span>' + z[1] + '</span><span class="tr"><i style="width:' + (n ? Math.max(3, Math.round(n / mx * 100)) : 0) + '%"></i></span><b>' + n + "</b></div>"; }).join("")
    : '<div class="prazdny">Zatiaľ žiadne kliky. Počítajú sa od 24. 10. 2026.</div>') + '<p class="sub">Každý návštevník sa pri jednom druhu kontaktu ráta raz za návštevu. Tvoje vlastné kliky sa nerátajú.</p></div>';
}
function odpovedMakler() { var s = S(), m = W.CTX.makler || {}; return { meno: s.name || m.meno || "", telefon: s.phone || m.telefon || "", pohlavie: m.pohlavie }; }
function strazcaHtml() {
  var z = (WEB && WEB.strazcovia) || {}, n = +z.aktivni || 0, e = +z.emaily_30 || 0, p = +z.nepotvrdeni || 0;
  return '<div class="card2"><h3>Strážca ponúk</h3><p class="sub">Klienti, ktorí si na webe zapli strážcu a potvrdili e-mail, dostanú tvoje nové a zlacnené ponuky automaticky, najviac raz za 12 hodín. E-mail príde s tvojím menom, odpoveď ide priamo tebe a klient sa vie kedykoľvek odhlásiť. Každý strážca sa zapíše aj medzi dopyty v Klientoch.</p>' +
    '<div class="kpis k3"><div class="kpi"><small>Aktívni strážcovia</small><b>' + n + '</b></div><div class="kpi"><small>Ponuky poslané klientom za 30 dní</small><b>' + e + '</b></div><div class="kpi"><small>Čakajú na potvrdenie e-mailu</small><b>' + p + "</b></div></div></div>";
}

/* ================================================================ udalosti panela */
document.addEventListener("click", function (e) {
  var t = e.target.closest("button"); if (!t || t.closest("#site") || t.closest("#wlb")) return; var d = t.dataset, s = S();
  if (d.ckgo) { goFix(d.ckgo); return; }
  if (d.obd) { if (d.obd === "vlastne" && OBD.typ !== "vlastne") { var o0 = obdobie(); OBD.od = isoDen(o0.od || dnes0()); OBD.do = isoDen(o0.do); } OBD.typ = d.obd; renderDash(); return; }
  if (d.obdok !== undefined) { var vo = $("obdOd").value, vd = $("obdDo").value; if (!vo || !vd) { toast("Vyber oba dátumy", true); return; } if (vo > vd) { var tx = vo; vo = vd; vd = tx; } OBD.od = vo; OBD.do = vd; renderDash(); return; }
  if (d.view) { setView(d.view); return; }
  if (d.zverejnit !== undefined) { zverejnit(); return; }
  if (d.qr) { stiahniQr(d.qr); return; }
  if (d.kop) { var el = $(d.kop === "pub" ? "pubLink" : "nahLink"); kopiruj(el.value, "Odkaz je skopírovaný", el); return; }
  if (d.adresa !== undefined) { zmenAdresu(); return; }
  if (d.adrzrus !== undefined) { zmenAdresu(true); return; }
  if (d.domcheck !== undefined) { overDomenu(); return; }
  if (d.domsave !== undefined) { var dn = cistaDomena(); if (!dn) { toast("Najprv napíš doménu.", true); return; } ulozDomenu(dn); return; }
  if (d.domdel !== undefined) { if (confirm(WEB.domena_pripojena ? "Odstrániť doménu " + WEB.domena + "? Web pobeží znova na adrese " + WEB.adresa + "." : "Odstrániť doménu " + WEB.domena + "? Nastavenie začneš odznova.")) ulozDomenu(null); return; }
  if (d.domover !== undefined) { skontrolujDomenu(); return; }
  if (d.kopit !== undefined) { kopiruj(d.kopit, "Skopírované", null); return; }
  if (d.verzia) { obnovVerziu(+d.verzia); return; }
  if (d.vyb) { rpc("vybavit_web_kontakt", { p_id: +d.vyb, p_vybavene: d.v === "1" }).then(renderDash).catch(function (x) { toast(chybaText(x), true); }); return; }
  if (d.logokanc !== undefined) { s.logo = (W.CTX.kancelaria || {}).logo || ""; all(); return; }
  if (d.tab) s.tab = d.tab; else if (d.tpl) { s.tpl = d.tpl; W.INTRO = true; W.PAGE = { v: "home" }; } else if (d.col) s.color = d.col; else if (d.font) s.font = d.font; else if (d.bg) s.bg = d.bg; else if (d.dev) s.dev = d.dev;
  else if (d.set) { var x = T.SETS.find(function (z) { return z.id === d.set; }); s.color = "vlastna"; s.cc = x.a; s.b2 = x.b; s.hcol = x.h; s.bg = x.bg; }
  else if (d.hc) s.hcol = d.hc; else if (d.bs) s.btn = d.bs; else if (d.bf) s.btnFill = d.bf; else if (d.phs) s.ph = d.phs; else if (d.bub) s.bub = d.bub; else if (d.an !== undefined) { s.anim = d.an === "1"; W.INTRO = s.anim; }
  else if (d.pohybvzdy !== undefined) { W.vzdyPohyb = d.pohybvzdy === "1"; try { localStorage.setItem("typek-web-pohyb", W.vzdyPohyb ? "1" : "0"); } catch (x) { /* nič */ } W.INTRO = W.vzdyPohyb; }
  else if (d.aiimg) { s.heroAiImg = d.aiimg; s.heroImg = ""; s.heroFoc = ""; } else if (d.aivid) { s.heroAiVid = d.aivid; s.heroVideo = ""; } else if (d.hpos) s.heroPos = d.hpos; else if (d.focreset !== undefined) s.heroFoc = "";
  else if (d.hm) s.heroMedia = d.hm;
  else if (d.up !== undefined) { var i = +d.up, tmp = s.order[i - 1]; s.order[i - 1] = s.order[i]; s.order[i] = tmp; }
  else if (d.dn !== undefined) { var j = +d.dn, tmp2 = s.order[j + 1]; s.order[j + 1] = s.order[j]; s.order[j] = tmp2; }
  else if (d.edit) { if (open.has(d.edit)) open.delete(d.edit); else open.add(d.edit); }
  else if (d.clear) { setDeep(d.clear, ""); if (d.clear === "logo") s.logoCols = []; if (d.clear === "dl.url") { s.dl.file = ""; if (s.dl.imgAuto) { s.dl.img = ""; s.dl.imgAuto = false; } } if (d.clear === "dl.img") s.dl.imgAuto = false; }
  else if (d.dlobalka !== undefined) { pdfObalkaZNahraneho(); return; }
  else if (d.ladd) { var add = { steps: { t: "", d: "" }, svc: { t: "", d: "" }, loc: { n: "", t: "", g: "" }, faq: { q: "", a: "" }, "cen.rows": { t: "", c: "", p: "" }, stats: { n: "", t: "" }, why: { t: "", d: "" }, team: { n: "", r: "", tel: "", mail: "", img: "" } }[d.ladd]; if (add) get(d.ladd).push(add); }
  else if (d.ldel) { var a = d.ldel.split(":"); get(a[0]).splice(+a[1], 1); }
  else if (d.faqrsc !== undefined) s.faq.push({ q: "Čo znamená titul RSc.?", a: "V slovenskom prostredí znamená skratka RSc. Real Estate Consultant, teda realitný konzultant." });
  else if (d.svcx !== undefined) s.svcX = "Foto a video, Zábery z dronu, 3D prehliadka, Virtuálny staging, Právny servis";
  else if (d.timja !== undefined) { var mk = W.CTX.makler || {}; s.team.push({ n: s.name || mk.meno || "", r: s.office ? "Maklér · " + s.office : "Maklér", tel: s.phone || "", mail: s.email || "", img: s.photo || "" }); }
  else if (d.lup) { var b = d.lup.split(":"), A = get(b[0]), k = +b[1], t1 = A[k - 1]; A[k - 1] = A[k]; A[k] = t1; }
  else if (d.ldn) { var c = d.ldn.split(":"), B = get(c[0]), m = +c[1], t2 = B[m + 1]; B[m + 1] = B[m]; B[m] = t2; }
  else if (d.lc) { s.color = "vlastna"; s.cc = d.lc; }
  else if (d.delcustom) { var kk = d.delcustom; delete s.custom[kk]; delete s.on[kk]; s.order = s.order.filter(function (z) { return z !== kk; }); open.delete(kk); }
  else return;
  all();
});
$("ready").addEventListener("click", function () { S().tab = "kontrola"; all(); });
$("panel").addEventListener("click", function (e) {
  var fb = e.target.closest("[data-focbox]"); if (!fb || e.target.closest("button")) return;
  var r = fb.querySelector("img").getBoundingClientRect(); if (!r.width) return;
  var x = Math.max(0, Math.min(100, Math.round((e.clientX - r.left) / r.width * 100))), y = Math.max(0, Math.min(100, Math.round((e.clientY - r.top) / r.height * 100)));
  S().heroFoc = x + "% " + y + "%"; all();
});
$("zverejnit").addEventListener("click", function () { zverejnit(); });
$("statBtn").addEventListener("click", function () { setView(VIEW === "prehlad" ? "web" : "prehlad"); if (VIEW === "prehlad") window.scrollTo({ top: 0, behavior: "smooth" }); });
$("editTg").addEventListener("click", function () { W.EDIT = !W.EDIT; all(); if (W.EDIT) toast("Klikni na text v ukážke a prepíš ho"); });
$("addCustom").addEventListener("click", function () { var k = "c" + Date.now().toString(36), s = S(); s.custom[k] = { title: "Vlastná sekcia", text: "Sem napíš, čo chceš návštevníkom povedať.", img: "", btn: "", link: "" }; s.order.push(k); s.on[k] = true; open.add(k); all();
  requestAnimationFrame(function () { var el = $("f-custom-" + k + "-title"); if (el) { el.focus(); el.select(); } }); });
$("panel").addEventListener("input", function (e) {
  var t = e.target, p = t.dataset.bind; if (!p) return; var v = t.value; if ("num" in t.dataset) v = parseFloat(String(v).replace(",", ".")) || 0; setDeep(p, v);
  if (p === "gdpr.gaId" || p === "gdpr.fbId") { var bl = t.closest(".mer-blok"), st = bl && bl.querySelector(".mer-stav"), TRK = T.trk(), ok = p === "gdpr.gaId" ? !!TRK.ga : !!TRK.fb, vypl = !!String(v || "").trim(); if (st) { st.className = "mer-stav" + (ok ? " ok" : vypl ? " zle" : ""); st.textContent = ok ? "Napojené" : vypl ? "Zlý tvar ID" : "Nenapojené"; } }
  if (p === "n") $("nOut").textContent = v;
  if (p === "heroBtn") { all(); return; }
  var m = p.match(/^custom\.(\w+)\.title$/); if (m) { var sp = document.querySelector('[data-title="' + m[1] + '"]'); if (sp) sp.textContent = v || "Vlastná sekcia"; }
  soft();
});
$("panel").addEventListener("change", function (e) {
  var t = e.target, s = S();
  if (t.dataset.sec) { s.on[t.dataset.sec] = t.checked; all(); return; }
  if (t.dataset.check) { setDeep(t.dataset.check, t.checked); soft(); return; }
  if (!t.dataset.upload || !t.files[0]) return;
  var f = t.files[0], path = t.dataset.upload, lbl = t.closest(".up") && t.closest(".up").querySelector("label");
  if (lbl) lbl.textContent = "Nahrávam…";
  var uloha;
  if ("video" in t.dataset) {
    if (f.size > 400 * 1024 * 1024) { toast("Video je väčšie ako 400 MB. Skús kratšie.", true); renderPanel(); return; }
    uloha = zmensiVideo(f, function (pct) { var l = document.querySelector('#panel label[for="u-heroVideo"]') || lbl; if (l) l.textContent = "Zmenšujem video… " + pct + " %"; }).then(function (v) {
      var typ = String(v.type || "").split(";")[0];
      if (!/^video\/(mp4|webm)$/.test(typ)) throw new Error("tento formát videa web nevie prehrať. Ulož video ako MP4 a skús znova.");
      if (v.size > 50 * 1024 * 1024) throw new Error("video je aj po zmenšení väčšie ako 50 MB. Skús kratšie video.");
      var l = document.querySelector('#panel label[for="u-heroVideo"]') || lbl; if (l) l.textContent = "Nahrávam…";
      return nahraj(v, f.name.replace(/\.[^.]+$/, "") + (typ === "video/webm" ? ".webm" : ".mp4"), typ).then(function (u) { s.heroVideo = u; s.heroMedia = "video"; });
    });
  } else if ("pdf" in t.dataset) {
    if (f.size > 50 * 1024 * 1024) { toast("Súbor je väčší ako 50 MB. Skús menší.", true); renderPanel(); return; }
    uloha = nahraj(f, f.name, f.type).then(function (u) {
      setDeep(path, u); s.dl.file = f.name;
      if (s.dl.img && !s.dl.imgAuto) return;   // vlastný obrázok obálky nechám
      var l = document.querySelector('#panel label[for="u-dl-url"]') || lbl; if (l) l.textContent = "Robím obálku z PDF…";
      return f.arrayBuffer().then(obalkaZPdf).then(function (img) { if (img) { s.dl.img = img; s.dl.imgAuto = true; toast("Obálku som vytvoril z prvej strany PDF"); } }).catch(function () { /* obálka nie je nutná */ });
    });
  } else {
    var png = "png" in t.dataset;
    uloha = zmensi(f, +t.dataset.max, png).then(function (r) {
      return nahraj(r.blob, f.name.replace(/\.[^.]+$/, "") + r.ext, r.blob.type).then(function (u) {
        setDeep(path, u); if (path === "heroImg") s.heroFoc = ""; if (path === "dl.img") s.dl.imgAuto = false;
        if (path === "logo" && r.farby.length) { s.logoCols = r.farby; s.color = "vlastna"; s.cc = r.farby[0]; if (r.farby[1]) s.b2 = r.farby[1]; toast("Farby webu som nastavil podľa loga"); }
      });
    });
  }
  uloha.then(all).catch(function (x) { toast("Súbor sa nepodarilo nahrať: " + chybaText(x), true); renderPanel(); });
});
$("rad").addEventListener("input", function (e) { S().r = +e.target.value; $("rOut").textContent = S().r + " px"; soft(); });
function hexPair(pick, hex, apply) {
  $(pick).addEventListener("input", function (e) { apply(e.target.value); $(hex).value = e.target.value.toUpperCase(); $(hex).removeAttribute("aria-invalid"); all(); });
  $(hex).addEventListener("input", function (e) { var v = T.okHex(e.target.value); e.target.setAttribute("aria-invalid", v ? "false" : "true"); if (v) { apply(v); all(); } });
}
hexPair("ccPick", "ccHex", function (v) { S().color = "vlastna"; S().cc = v; }); hexPair("c2Pick", "c2Hex", function (v) { S().b2 = v; }); hexPair("bgPick", "bgHex", function (v) { S().bg = "vlastne"; S().cbg = v; });
$("c2Clear").addEventListener("click", function () { S().b2 = ""; all(); });
$("mix").addEventListener("click", function () { var p = function (a) { return a[Math.floor(Math.random() * a.length)]; }, x = p(T.SETS), s = S(); s.tpl = p(T.TPLS).id; s.color = "vlastna"; s.cc = x.a; s.b2 = x.b; s.hcol = x.h; s.bg = x.bg; s.font = p(T.FONTS).id; s.r = p([0, 6, 10, 14, 20, 26]); s.btn = p(["pill", "round", "square"]); s.ph = p(["plain", "frame", "shadow"]); W.INTRO = true; W.PAGE = { v: "home" }; all(); });

/* ťahanie sekcií (myš aj prst) */
var drag = null;
$("secs").addEventListener("pointerdown", function (e) { var g = e.target.closest("[data-grip]"); if (!g) return; e.preventDefault(); var li = g.closest("li"); drag = { li: li, id: e.pointerId }; li.classList.add("dragging"); try { g.setPointerCapture(e.pointerId); } catch (x) { /* nič */ } });
document.addEventListener("pointermove", function (e) {
  if (!drag || e.pointerId !== drag.id) return; var el = document.elementFromPoint(e.clientX, e.clientY), over = el && el.closest("#secs li[data-k]"); if (!over || over === drag.li) return;
  var r = over.getBoundingClientRect(), list = $("secs"); if (e.clientY < r.top + r.height / 2) list.insertBefore(drag.li, over); else list.insertBefore(drag.li, over.nextSibling);
  S().order = Array.prototype.map.call(list.querySelectorAll("li[data-k]"), function (l) { return l.dataset.k; }); T.render();
});
function endDrag(e) { if (!drag || e.pointerId !== drag.id) return; drag.li.classList.remove("dragging"); drag = null; all(); }
document.addEventListener("pointerup", endDrag); document.addEventListener("pointercancel", endDrag);
$("undo").addEventListener("click", undo); $("redo").addEventListener("click", redo);
document.addEventListener("keydown", function (e) {
  if (!(e.ctrlKey || e.metaKey)) return; var k = e.key.toLowerCase(); if (k !== "z" && k !== "y") return;
  if (e.target.closest && e.target.closest("input,textarea,select,[contenteditable=\"true\"]")) return; e.preventDefault(); if (k === "y" || e.shiftKey) redo(); else undo();
});

/* ================================================================ zverejnenie, adresa, doména, verzie */
function nacitajWeb() { return rpc("moj_web", { p_makler: MAKLER_ID }).then(function (w) { WEB = w; W.adresa = w && w.zverejnene_kedy ? w.adresa : ""; return w; }); }
/* upozornenie pred zverejnením: čo chýba alebo by web vylepšilo (zobrazí sa len pri nových výhradách) */
function varovania() {
  var s = S(), out = [], add = function (k, t, go) { out.push({ k: k, t: t, go: go }); };
  if (!T.fotoMaklera()) add("foto", "Chýba tvoja fotka. Web s fotkou makléra pôsobí dôveryhodnejšie a klienti ťa ľahšie spoznajú.", "makler|u-photo");
  if (!String(s.phone || "").trim()) add("tel", "Chýba telefón. Klienti ti nebudú vedieť zavolať.", "makler|f-phone");
  if (!String(s.email || "").trim()) add("mail", "Chýba e-mail.", "makler|f-email");
  var bez = s.on.ponuky && !W.CTX.ukazka ? (W.CTX.ponuky || []).filter(function (x) { return !(x.foto && x.foto.length); }) : [];
  if (bez.length) add("ponuky", (bez.length === 1 ? "1 ponuka nemá" : bez.length + (bez.length < 5 ? " ponuky nemajú" : " ponúk nemá")) + " fotky a na webe sa zobrazí bez obrázka: " + bez.slice(0, 3).map(function (x) { return x.t; }).join(", ") + (bez.length > 3 ? " a ďalšie" : "") + ".", "app");
  if (String(s.gdpr.gaId || "").trim() && !T.trk().ga) add("ga", "ID Google Analytics má zlý tvar. Má vyzerať ako G-ABC123XYZ. Kým ho neopravíš, Google Analytics sa na webe nezapne.", "makler|f-gdpr-gaId");
  if (String(s.gdpr.fbId || "").trim() && !T.trk().fb) add("fb", "ID Meta Pixelu má zlý tvar. Sú to len číslice, napríklad 123456789012345. Kým ho neopravíš, Pixel sa na webe nezapne.", "makler|f-gdpr-fbId");
  if (!(s.gdpr.who && s.gdpr.ico && s.gdpr.addr)) add("gdpr", "Chýba prevádzkovateľ, IČO alebo sídlo v Ochrane osobných údajov. Formuláre na webe zbierajú osobné údaje, preto ich treba doplniť.", "makler|f-gdpr-ico");
  if (s.on.omne && s.about.text === T.DEF.about.text) add("omne", "Text O mne je stále ukážkový. Napíš pár viet o sebe, alebo ich nechaj napísať AI asistenta.", "sekcie|omne");
  if (s.on.stiahnut && !s.dl.url) add("ebook", "Sekcia E-book je zapnutá, ale nemá nahraný súbor.", "sekcie|stiahnut");
  if (s.on.video && !s.video.url) add("video", "Sekcia Video je zapnutá, ale nemá odkaz na video.", "sekcie|video");
  if (s.on.fotka && !s.img.src) add("fotka", "Sekcia Fotka je zapnutá, ale nemá fotku.", "sekcie|fotka");
  return out;
}
function pzKluc() { return "typek-pz-" + (WEB && WEB.id); }
function ukazVarovania(v) {
  var dl = $("predZverejnenim");
  $("pzList").innerHTML = v.map(function (x) { return '<li><span>' + esc(x.t) + '</span><button type="button" class="b b-soft b-sm" data-pzgo="' + esc(x.go) + '">Doplniť</button></li>'; }).join("");
  dl.dataset.kluce = v.map(function (x) { return x.k; }).join(",");
  if (dl.showModal) dl.showModal(); else dl.setAttribute("open", "");
  var prvy = dl.querySelector("[data-pzgo]"); if (prvy) prvy.focus();
}
$("predZverejnenim").addEventListener("click", function (e) {
  var dl = $("predZverejnenim"), b = e.target.closest("button"); if (!b) { if (e.target === dl) dl.close(); return; }
  if (b.dataset.pzgo) { dl.close(); goFix(b.dataset.pzgo); return; }
  if (b.dataset.pz === "spat") { dl.close(); return; }
  if (b.dataset.pz === "aj-tak") { try { localStorage.setItem(pzKluc(), dl.dataset.kluce || ""); } catch (x) { /* nič */ } dl.close(); zverejnit(true); }
});
function zverejnit(ajTak) {
  if (ajTak !== true) {
    var v = varovania(), videl = "";
    try { videl = localStorage.getItem(pzKluc()) || ""; } catch (x) { /* nič */ }
    var nove = v.filter(function (x) { return ("," + videl + ",").indexOf("," + x.k + ",") < 0; });
    if (nove.length) { ukazVarovania(v); return; }
  }
  var b = $("zverejnit"); b.disabled = true; b.textContent = "Zverejňujem…";
  ulozTeraz().then(function () { return rpc("zverejnit_web", { p_koncept: cistyS(), p_makler: MAKLER_ID }); }).then(nacitajWeb).then(function () {
    ZMENY = false; renderPanel(); toast("Web je zverejnený. Klienti vidia aktuálnu verziu.");
  }).catch(function (e) { toast(chybaText(e), true); }).then(function () { b.disabled = false; renderPub(); });
}
function zmenAdresu(zrusit) {
  var v = zrusit ? WEB.adresa : $("adr").value;
  rpc("zmenit_adresu_webu", { p_adresa: v, p_makler: MAKLER_ID }).then(function (r) {
    WEB.adresa = r.adresa; WEB.adresa_navrh = r.navrh; WEB.adresa_navrh_kedy = r.navrh ? new Date().toISOString() : null;
    odfokusuj("fAdresa"); $("addr").textContent = adresaText(); renderPanel();
    toast(zrusit ? "Žiadosť o novú adresu je zrušená." : r.navrh ? "Žiadosť o adresu " + r.navrh + " je odoslaná adminovi." : "Adresa je uložená: " + r.adresa);
  }).catch(function (e) { toast(chybaText(e), true); });
}
function odfokusuj(id) { var a = document.activeElement; if (a && $(id).contains(a)) a.blur(); }
function cistaDomena() { return String(($("dom") || {}).value || "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/[/?#].*$/, ""); }
function overDomenu() {
  var d = cistaDomena(), st = $("domStav");
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(d)) { st.className = "dom-stav full zle"; st.textContent = "Napíš doménu v tvare mojemeno.sk"; return; }
  st.className = "dom-stav full"; st.textContent = "Overujem v registri domén…";
  volajDomenu({ akcia: "dostupnost", domena: d }).then(function (r) {
    var kde = r.zdroj && r.zdroj !== "DNS" ? " (register " + r.zdroj + ")" : "";
    var plat = r.platnost && /^\d{4}-\d{2}-\d{2}/.test(r.platnost) ? String(r.platnost).slice(0, 10).split("-").map(Number) : null;
    if (r.stav === "volna") { st.className = "dom-stav full ok"; st.textContent = d + " je voľná" + kde + ". Zaregistruj si ju a potom klikni na Použiť túto doménu."; }
    else if (r.stav === "asi_volna") { st.className = "dom-stav full ok"; st.textContent = d + " vyzerá voľná. Isté to bude až pri registrácii."; }
    else if (r.stav === "obsadena") { st.className = "dom-stav full zle"; st.textContent = d + " je už registrovaná" + (plat ? ", platná do " + plat[2] + ". " + plat[1] + ". " + plat[0] : "") + kde + ". Ak je tvoja, klikni na Použiť túto doménu."; }
    else { st.className = "dom-stav full"; st.textContent = "Register domén teraz neodpovedá. Skús to o chvíľu."; }
  }).catch(function (e) { st.className = "dom-stav full zle"; st.textContent = chybaText(e); });
}
function nacitajDomInfo() {
  if (DOM_INFO || !WEB || !WEB.domena || WEB.domena_pripojena) return;
  DOM_INFO = {};
  volajDomenu({ akcia: "info" }).then(function (r) { DOM_INFO = r; renderAdresa(); }).catch(function () { DOM_INFO = null; });
}
function ulozDomenu(d) {
  rpc("ulozit_domenu_webu", { p_domena: d, p_makler: MAKLER_ID }).then(function (r) {
    return nacitajWeb().then(function () {
      DOM_KONTROLA = null; toast(r.domena ? "Doména je uložená. Teraz nastav záznamy v DNS." : "Doména je odstránená."); odfokusuj("fDomena"); renderAdresa(); renderPub(); $("addr").textContent = adresaText(); nacitajDomInfo();
    });
  }).catch(function (e) { toast(chybaText(e), true); });
}
function skontrolujDomenu() {
  var st = $("domStav"), b = document.querySelector("[data-domover]"); if (b) b.disabled = true;
  if (st) { st.className = "dom-stav"; st.textContent = "Kontrolujem DNS…"; }
  volajDomenu({ akcia: "overit", makler: MAKLER_ID }).then(function (r) {
    DOM_KONTROLA = r; if (r.ip && r.ip.length) DOM_INFO = { ip: r.ip };
    return nacitajWeb().then(function () {
      odfokusuj("fDomena"); renderAdresa();
      toast(r.konflikt ? "Túto doménu už overil iný web." : r.overena && r.smeruje ? "Všetko je nastavené. Admin doménu pripojí." : !r.overena ? "Záznam TXT zatiaľ nevidno. Ak si ho práve pridal, počkaj chvíľu." : "Doména zatiaľ nesmeruje na náš server. Skontroluj záznam A.", !!r.konflikt);
    });
  }).catch(function (e) { if (st) { st.className = "dom-stav zle"; st.textContent = chybaText(e); } }).then(function () { var b2 = document.querySelector("[data-domover]"); if (b2) b2.disabled = false; });
}
function obnovVerziu(id) {
  ulozTeraz().then(function () { return rpc("obnovit_verziu_webu", { p_verzia: id }); }).then(function (o) {
    histPush(); var keep = { dev: S().dev, tab: S().tab }; W.S = Object.assign(T.merge(o), keep); ZMENY = true; W.INTRO = true; all(); toast("Verzia je vrátená do rozpracovaného webu. Klienti ju uvidia po zverejnení.");
  }).catch(function (e) { toast(chybaText(e), true); });
}

/* ================================================================ texty od AI asistenta */
var AITONE = "Priateľský";
function renderTone() { $("aiTone").innerHTML = ["Priateľský", "Profesionálny", "Luxusný"].map(function (t) { return '<button type="button" class="chip" data-tone="' + t + '" aria-pressed="' + (AITONE === t) + '">' + t + "</button>"; }).join(""); }
$("aiTone").addEventListener("click", function (e) { var b = e.target.closest("[data-tone]"); if (b) { AITONE = b.dataset.tone; renderTone(); } });
$("aiGo").addEventListener("click", function () {
  var s = S(), q1 = $("aiQ1").value.trim(), q2 = $("aiQ2").value.trim(), q3 = $("aiQ3").value.trim();
  if (!q1 && !q2 && !q3) { $("aiSt").textContent = "Odpovedz aspoň na jednu otázku."; $("aiQ1").focus(); return; }
  $("aiGo").disabled = true; $("aiSt").textContent = "Asistent píše texty…";
  var zena = W.CTX.makler && W.CTX.makler.pohlavie === "zena";
  var prompt = "Napíš texty na osobný web realitného makléra. Odpovedz IBA jedným JSON objektom, bez ďalšieho textu.\n\nÚdaje:\n- Meno: " + s.name + " (" + (zena ? "žena" : "muž") + ")\n- Kancelária: " + s.office + "\n- Kde pôsobí: " + s.area +
    "\n- Ako dlho robí reality a kde: " + (q1 || "neuvedené") + "\n- V čom je dobrý a čím sa líši: " + (q2 || "neuvedené") + "\n- Čo na ňom klienti oceňujú: " + (q3 || "neuvedené") + "\n- Tón: " + AITONE.toLowerCase() +
    "\n\nPravidlá: spisovná slovenčina, bez anglicizmov, bez emoji, bez výkričníkov. Klientom vykaj. Text O mne v prvej osobe za makléra v správnom rode. Nepridávaj čísla ani fakty, ktoré nie sú v údajoch. Krátke konkrétne vety, žiadne prázdne frázy.\n\n" +
    'JSON kľúče: {"heroTitle":"nadpis úvodu, najviac 9 slov","heroLead":"1 až 2 vety, najviac 30 slov","aboutTitle":"nadpis O mne, najviac 10 slov","aboutText":"2 krátke odseky oddelené znakom \\n, spolu najviac 90 slov","services":[{"t":"1 až 2 slová","d":"1 veta, najviac 14 slov"}],"valTitle":"nadpis ponuky odhadu ceny, najviac 8 slov","valText":"1 až 2 vety, najviac 30 slov","years":"počet rokov ako číslo v texte alebo prázdny reťazec"}. V services presne 4 položky.';
  sb.functions.invoke("asistent", { body: { spravy: [{ role: "user", content: prompt }] } }).then(function (r) {
    var d = r.data || {};
    if (r.error || d.chyba) {
      var msg = d.chyba;
      if (!msg && r.error && r.error.context && r.error.context.json) return r.error.context.json().then(function (j) { throw new Error(j.chyba || "AI asistent teraz neodpovedá."); });
      throw new Error(msg || "AI asistent teraz neodpovedá.");
    }
    var tx = String(d.text || ""), m = tx.match(/\{[\s\S]*\}/); if (!m) throw new Error("Odpoveď sa nepodarilo spracovať. Skús to ešte raz.");
    var o = JSON.parse(m[0]), st = function (v) { return typeof v === "string" ? v.trim() : ""; };
    histPush();
    if (st(o.heroTitle) || st(o.heroLead)) T.TPLS.forEach(function (t) { var x = s.heroTx[t.id] || {}; if (st(o.heroTitle) && t.id !== "vizitka") x.t = st(o.heroTitle); if (st(o.heroLead)) x.l = st(o.heroLead); s.heroTx[t.id] = x; });
    if (st(o.aboutTitle)) s.about.title = st(o.aboutTitle); if (st(o.aboutText)) s.about.text = st(o.aboutText);
    if (Array.isArray(o.services) && o.services.length) s.svc = o.services.slice(0, 6).map(function (x) { return { t: st(x && x.t), d: st(x && x.d) }; }).filter(function (x) { return x.t; });
    if (st(o.valTitle)) s.val.title = st(o.valTitle); if (st(o.valText)) s.val.text = st(o.valText);
    if (/^\d{1,2}$/.test(st(String(o.years == null ? "" : o.years)))) s.years = st(String(o.years));
    W.INTRO = true; all(); $("aiSt").textContent = "Hotovo. Texty sú v ukážke. Nepáčia sa? Daj Späť alebo napíš znova.";
  }).catch(function (e) { $("aiSt").textContent = chybaText(e); }).then(function () { $("aiGo").disabled = false; });
});

/* ================================================================ štart */
function predvolby(s, m, vz) {
  var zena = m && m.pohlavie === "zena";
  s.name = (m && m.meno) || ""; s.phone = (m && m.telefon) || ""; s.email = (m && m.email) || "";
  s.office = (vz && vz.nazov) || "Alpha Reality"; s.wa = s.phone;
  s.about.title = "Reality robím tak, ako by som ich chcel" + (zena ? "a" : "") + " pre seba.";
  s.gdpr.who = s.name; s.gdpr.mail = "";
  return s;
}
sb.auth.getSession().then(function (r) {
  var ses = r.data && r.data.session;
  if (!ses) { document.body.innerHTML = '<div style="padding:60px 20px;text-align:center;font:16px system-ui">Na úpravu webu sa najprv prihlás v <a href="./">Realitnom týpkovi</a>.</div>'; return; }
  JA = ses.user.id; MAKLER_ID = CIEL || JA;
  return nacitajWeb().then(function (w) {
    return rpc("verejny_web", { p_adresa: w.adresa, p_nahlad: true }).then(function (d) {
      d = d || {};
      var m = d.makler || {}, ponuky = (d.ponuky || []).map(T.prevod);
      W.CTX = { ponuky: ponuky, predane: (d.predane || []).map(T.prevod), recenzie: d.recenzie, makler: m, kancelaria: d.kancelaria || {}, ukazka: !ponuky.length };
      var prazdny = !w.koncept || !Object.keys(w.koncept).length;
      W.S = T.merge(w.koncept || {});
      if (prazdny) predvolby(W.S, m, d.kancelaria);
      W.S.tab = "vzhlad"; W.S.dev = "pc";
      ZMENY = !!w.zmeny_od_zverejnenia;
      W.odoslat = function () { return new Promise(function (ok) { setTimeout(function () { toast("V náhľade sa formulár neodosiela. Na zverejnenom webe ti príde kontakt do zvončeka."); ok(); }, 300); }); };
      W.poUprave = function (path, v) { save(); renderKontrola(); var pf = document.querySelector('#panel [data-bind="' + path + '"]'); if (pf) pf.value = v; };
      if (CIEL && CIEL !== JA) $("podnadpis").textContent = "Upravuješ web makléra " + (m.meno || "") + ". Zmeny sa ukladajú samy.";
      $("appEd").hidden = false;
      $("addr").textContent = adresaText(); nacitajDomInfo();
      T.napoj($("site")); renderTone();
      renderPanel(); T.render(); histPush();
      if (location.hash === "#statistiky") setView("prehlad");
      nacitajOdznak();
      if (prazdny) { NEULOZENE = true; ulozTeraz(); } else stav("Uložené");
    });
  });
}).catch(function (e) { stav("Chyba: " + chybaText(e), "chyba"); toast(chybaText(e), true); });
})();
