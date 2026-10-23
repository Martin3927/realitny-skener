/* Realitný skener Alpha Reality – aplikácia pre maklérov */
(function () {
  "use strict";

  var CFG = window.SKENER_CONFIG;
  var sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey, {
    auth: { persistSession: true, autoRefreshToken: true },
  });

  var PORTAL = { bazos: "Bazoš", nehnutelnosti: "Nehnuteľnosti.sk", reality: "Reality.sk", topreality: "TopReality.sk" };
  var TYP = { byt: "Byt", dom: "Dom", pozemok: "Pozemok", chata: "Chata", garaz: "Garáž", ine: "Iné" };
  var PRED = { sukromny: ["Súkromný", "priv"], asi_sukromny: ["Asi súkromný", "maybe"], rk: ["RK", "rk"] };
  var VYSLEDKY = [
    "Nedvíha", "Volať neskôr", "Nemá záujem o RK", "Predáva cez inú RK", "Už predané",
    "Záujem – stretnutie dohodnuté", "Získaný do ponuky", "Iné",
  ];
  var VYSLEDOK_TRIEDA = {
    "Záujem – stretnutie dohodnuté": "won", "Získaný do ponuky": "won",
    "Nemá záujem o RK": "lost", "Predáva cez inú RK": "lost", "Už predané": "lost",
  };
  var DRUH_IKONA = { pripomienka: "🔔", uvolnenie: "🔓", cena: "📉", zmluva: "📝", zhoda: "🎯", obhliadka: "🗝️", udalost: "📅" };
  // výsledky hovoru, pri ktorých sa inzerát automaticky neuvoľní
  var CHRANENE_VYSLEDKY = ["Záujem – stretnutie dohodnuté", "Získaný do ponuky"];
  var SMS_ZAKLAD = "Dobrý deň, volám sa {makler} z realitnej kancelárie Alpha Reality. {Všimol|Všimla} som si Váš inzerát – {nehnutelnost}, {lokalita}. " +
    "Máme klientov, ktorí hľadajú nehnuteľnosť práve v tejto lokalite. Môžem Vám zavolať? Ďakujem.";
  var SMS_POLIA = [["{Videl|Videla}", "podľa rodu: muž | žena"], ["{makler}", "vaše meno"], ["{nehnutelnost}", "napr. 3-izbový byt"], ["{lokalita}", "obec"], ["{cena}", "cena z inzerátu"], ["{portal}", "portál"]];
  var STAVY_NEHN = ["Pôvodný stav", "Čiastočná rekonštrukcia", "Kompletná rekonštrukcia", "Novostavba", "Rozostavaná", "Na zbúranie"];
  var KEY = "alpha-skener-app-v1";
  var PRAVA = '<p class="prava">© ' + new Date().getFullYear() + " Realitný týpek · Všetky práva vyhradené Alpha Reality s.r.o.</p>";

  var S = {
    user: null, me: null, makleri: [], mById: {}, inz: [], prev: {}, odh: {}, canUnder: false, meta: {},
    sch: [], hist: {}, open: {}, tab: "inzeraty", shown: 100, schEdit: null, delConfirm: null, pwdOpen: false,
    prip: [], zvonOpen: false, pripForm: null, ohlasene: {}, ozn: {}, hesla: {}, hesloEdit: null,
    obce: [], lastInzLoad: 0, newUser: null,
    f: { q: "", predajca: "vsetci", typ: "", okres: "", novost: "", praca: "vsetky", under: false, sort: "novy", stav: "aktivne", kto: "" },
    arch: {}, tel: {}, telZdroj: {},
    sf: { q: "", makler: "", typ: "" }, chat: [], chatMax: 0, dm: [], dmMax: 0, chatS: null, nehnObd: "aktivne", vykonObd: "tento_tyzden", vykon: null, smsEdit: null,
  };
  try {
    var ul = JSON.parse(localStorage.getItem(KEY) || "null");
    if (ul) { Object.assign(S.f, ul.f || {}); Object.assign(S.sf, ul.sf || {}); S.tab = ul.tab || S.tab; S.f.q = ""; S.sf.q = ""; }
  } catch (e) { /* bez uložených filtrov */ }

  // ------------------------------------------------------------ pomocné
  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var nf = new Intl.NumberFormat("sk-SK");
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function norm(s) { return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""); }
  function eur(n) { return n ? nf.format(Math.round(n)) + " €" : "cena neuvedená"; }
  function m2(v) { return v < 10 ? v.toLocaleString("sk-SK", { maximumFractionDigits: 2 }) : nf.format(Math.round(v)); }
  function datum(iso, sCasom) {
    if (!iso) return "";
    var d = new Date(iso);
    var o = { day: "numeric", month: "numeric" };
    if (d.getFullYear() !== new Date().getFullYear()) o.year = "numeric";
    if (sCasom) { o.hour = "2-digit"; o.minute = "2-digit"; }
    return d.toLocaleString("sk-SK", o);
  }
  function ago(iso) {
    var h = (Date.now() - new Date(iso).getTime()) / 36e5;
    if (h < 1) return "pred " + Math.max(1, Math.round(h * 60)) + " min";
    if (h < 24) return "pred " + Math.round(h) + " h";
    var d = Math.round(h / 24);
    return "pred " + d + (d === 1 ? " dňom" : " dňami");
  }
  function meno(id) { var m = S.mById[id]; return m ? (m.meno || m.email) : "iný maklér"; }
  var SVG_MUZ = '<svg viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" fill="#ece3cc"/><circle cx="32" cy="25" r="12" fill="#a8862f"/><path d="M9 64c2-14 11-22 23-22s21 8 23 22z" fill="#a8862f"/></svg>';
  var SVG_ZENA = '<svg viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" fill="#ece3cc"/><path d="M16 33c0-13 7-21 16-21s16 8 16 21c0 7-2 12-4 15H20c-2-3-4-8-4-15z" fill="#7d6222"/><circle cx="32" cy="27" r="11" fill="#c9a24a"/><path d="M10 64c2-13 11-20 22-20s20 7 22 20z" fill="#c9a24a"/></svg>';
  function avatar(id, vel) {
    var m = S.mById[id] || (S.me && S.me.id === id ? S.me : null), f = m && m.foto, v = vel || 28;
    var styl = ' data-av="' + esc(id || "") + '" data-v="' + v + '" style="width:' + v + "px;height:" + v + "px;font-size:" + Math.round(v * 0.4) + 'px"';
    if (f && f.indexOf("data:image/") === 0) return '<span class="av"' + styl + '><img src="' + esc(f) + '" alt=""></span>';
    if (f === "avatar:zena") return '<span class="av"' + styl + ">" + SVG_ZENA + "</span>";
    if (f === "avatar:muz") return '<span class="av"' + styl + ">" + SVG_MUZ + "</span>";
    var n = (m && (m.meno || m.email) || "?").trim().split(/\s+/);
    return '<span class="av"' + styl + ">" + esc(((n[0] || "?")[0] + (n.length > 1 ? n[n.length - 1][0] : "")).toUpperCase()) + "</span>";
  }
  // fotka zo súboru → štvorec 256 px JPEG (data URL)
  function spracujFoto(subor) {
    return new Promise(function (ok, chyba) {
      if (!subor || !/^image\//.test(subor.type)) return chyba(new Error("Vyberte obrázok (JPG alebo PNG)."));
      var r = new FileReader();
      r.onerror = function () { chyba(new Error("Súbor sa nepodarilo načítať.")); };
      r.onload = function () {
        var img = new Image();
        img.onerror = function () { chyba(new Error("Obrázok sa nepodarilo otvoriť.")); };
        img.onload = function () { orezFoto(img).then(ok, chyba); };
        img.src = r.result;
      };
      r.readAsDataURL(subor);
    });
  }
  // okno na orezanie fotky: posúvanie ťahaním (aj prstom), zoom posuvníkom, kolieskom alebo dvoma prstami
  function orezFoto(img) {
    return new Promise(function (ok) {
      var O = 260, VYST = 320;
      var zaklad = Math.max(O / img.width, O / img.height), zoom = 1, x = 0, y = 0;
      var o = document.createElement("div"); o.className = "orez-var";
      o.innerHTML = '<div class="orez-karta" role="dialog" aria-label="Upraviť fotku"><h3>Upraviť fotku</h3>' +
        '<p class="meta">Posuňte fotku ťahaním a priblížte posuvníkom, aby bola tvár v strede kruhu.</p>' +
        '<div class="orez-okno" tabindex="0" aria-label="Fotka – posúvajte šípkami"><img alt="" draggable="false"></div>' +
        '<div class="orez-zoom"><span aria-hidden="true">−</span><input type="range" min="1" max="4" step="0.01" value="1" aria-label="Priblíženie"><span aria-hidden="true">+</span></div>' +
        '<div class="orez-sipky">' + [["hore", "↑", 0, -1], ["vlavo", "←", -1, 0], ["stred", "⊙", 0, 0], ["vpravo", "→", 1, 0], ["dole", "↓", 0, 1]].map(function (a) {
          return '<button type="button" class="btn ghost" data-posun="' + a[2] + "," + a[3] + '" aria-label="' + a[0] + '">' + a[1] + "</button>";
        }).join("") + "</div>" +
        '<div class="form-actions"><button class="btn primary" type="button" data-orez="ok">Uložiť fotku</button><button class="btn ghost" type="button" data-orez="x">Zrušiť</button></div></div>';
      document.body.appendChild(o);
      var okno = o.querySelector(".orez-okno"), im = o.querySelector("img"), rng = o.querySelector("input");
      im.src = img.src;
      function obmedz() {
        var w = img.width * zaklad * zoom, h = img.height * zaklad * zoom;
        var mx = Math.max(0, (w - O) / 2), my = Math.max(0, (h - O) / 2);
        x = Math.min(mx, Math.max(-mx, x)); y = Math.min(my, Math.max(-my, y));
      }
      function kresli() {
        obmedz();
        var w = img.width * zaklad * zoom, h = img.height * zaklad * zoom;
        im.style.width = w + "px"; im.style.height = h + "px";
        im.style.transform = "translate(" + (O / 2 - w / 2 + x) + "px," + (O / 2 - h / 2 + y) + "px)";
      }
      function nastavZoom(z, cx, cy) {
        var stary = zoom; zoom = Math.min(4, Math.max(1, z));
        // priblíženie okolo bodu (prst / myš)
        if (cx != null) { x = (x - cx) * zoom / stary + cx; y = (y - cy) * zoom / stary + cy; }
        rng.value = zoom; kresli();
      }
      var body = {}, start = null;
      okno.addEventListener("pointerdown", function (e) {
        okno.setPointerCapture(e.pointerId); body[e.pointerId] = { x: e.clientX, y: e.clientY };
        start = { x: x, y: y, zoom: zoom, body: JSON.parse(JSON.stringify(body)) };
      });
      okno.addEventListener("pointermove", function (e) {
        if (!body[e.pointerId] || !start) return;
        body[e.pointerId] = { x: e.clientX, y: e.clientY };
        var ids = Object.keys(body);
        if (ids.length >= 2 && start.body[ids[0]] && start.body[ids[1]]) {
          var d0 = Math.hypot(start.body[ids[0]].x - start.body[ids[1]].x, start.body[ids[0]].y - start.body[ids[1]].y);
          var d1 = Math.hypot(body[ids[0]].x - body[ids[1]].x, body[ids[0]].y - body[ids[1]].y);
          if (d0 > 0) { zoom = Math.min(4, Math.max(1, start.zoom * d1 / d0)); rng.value = zoom; kresli(); }
        } else if (start.body[e.pointerId]) {
          x = start.x + (e.clientX - start.body[e.pointerId].x); y = start.y + (e.clientY - start.body[e.pointerId].y); kresli();
        }
      });
      function pusti(e) { delete body[e.pointerId]; start = { x: x, y: y, zoom: zoom, body: JSON.parse(JSON.stringify(body)) }; }
      okno.addEventListener("pointerup", pusti); okno.addEventListener("pointercancel", pusti);
      okno.addEventListener("wheel", function (e) {
        e.preventDefault();
        var r = okno.getBoundingClientRect();
        nastavZoom(zoom * (e.deltaY < 0 ? 1.08 : 1 / 1.08), e.clientX - r.left - O / 2, e.clientY - r.top - O / 2);
      }, { passive: false });
      okno.addEventListener("keydown", function (e) {
        var k = { ArrowLeft: [-10, 0], ArrowRight: [10, 0], ArrowUp: [0, -10], ArrowDown: [0, 10] }[e.key];
        if (k) { e.preventDefault(); x -= k[0]; y -= k[1]; kresli(); }
        if (e.key === "+" || e.key === "=") nastavZoom(zoom * 1.1);
        if (e.key === "-") nastavZoom(zoom / 1.1);
      });
      rng.addEventListener("input", function () { nastavZoom(Number(rng.value), 0, 0); });
      o.querySelectorAll("[data-posun]").forEach(function (b) {
        b.onclick = function () {
          var d = b.dataset.posun.split(",").map(Number);
          if (!d[0] && !d[1]) { x = 0; y = 0; } else { x -= d[0] * 20; y -= d[1] * 20; }
          kresli();
        };
      });
      function zavri(v) { o.remove(); document.removeEventListener("keydown", esc2); ok(v); }
      function esc2(e) { if (e.key === "Escape") zavri(null); }
      document.addEventListener("keydown", esc2);
      o.querySelector('[data-orez="x"]').onclick = function () { zavri(null); };
      o.querySelector('[data-orez="ok"]').onclick = function () {
        var c = document.createElement("canvas"), k = VYST / O; c.width = VYST; c.height = VYST;
        var g = c.getContext("2d"), w = img.width * zaklad * zoom, h = img.height * zaklad * zoom;
        g.fillStyle = "#fff"; g.fillRect(0, 0, VYST, VYST);
        g.drawImage(img, (O / 2 - w / 2 + x) * k, (O / 2 - h / 2 + y) * k, w * k, h * k);
        zavri(c.toDataURL("image/jpeg", 0.86));
      };
      kresli(); okno.focus();
    });
  }
  function admin() { return S.me && S.me.rola === "admin"; }
  function ulozFiltre() {
    try { localStorage.setItem(KEY, JSON.stringify({ f: S.f, sf: S.sf, tab: S.tab })); } catch (e) { /* nevadí */ }
  }
  var toastT;
  function toast(msg, chyba) {
    var t = $("#toast");
    t.textContent = msg; t.className = chyba ? "err" : ""; t.hidden = false;
    clearTimeout(toastT); toastT = setTimeout(function () { t.hidden = true; }, chyba ? 6000 : 2800);
  }
  function chybaText(e) {
    var m = (e && (e.message || e.chyba)) || String(e);
    if (/Invalid login credentials/i.test(m)) return "Nesprávny email alebo heslo.";
    if (/Failed to fetch|NetworkError/i.test(m)) return "Nepodarilo sa spojiť so serverom. Skontrolujte internet.";
    if (/JWT expired/i.test(m)) return "Prihlásenie vypršalo. Obnovte stránku.";
    return m;
  }
  // keď prihlásenie medzičasom vypršalo, skúsime ho obnoviť; ak sa nedá, ponúkneme prihlásenie (nie chybu „permission denied“)
  function chybaPrihlasenia(e) {
    var t = String((e && (e.message || e.code)) || "");
    return e && (e.code === "42501" && /permission denied for function/i.test(t) || e.code === "PGRST301" || e.code === "PGRST303" || /JWT expired|invalid JWT|JWSError/i.test(t));
  }
  async function rpc(fn, args) {
    var r = await sb.rpc(fn, args);
    if (r.error && S.me && chybaPrihlasenia(r.error)) {
      var obn = await sb.auth.refreshSession().catch(function () { return { data: {} }; });
      if (obn && obn.data && obn.data.session) r = await sb.rpc(fn, args);
      else { prihlasenieVyprsalo(); throw new Error("Prihlásenie vypršalo – prihláste sa znova."); }
    }
    if (r.error) throw r.error;
    return r.data;
  }
  function prihlasenieVyprsalo() {
    if (!S.me || S.vyprsalo || S.odhlasujem) return;
    S.vyprsalo = true;
    try { sessionStorage.setItem("typek-odhlaseny", "Prihlásenie vypršalo alebo ste sa odhlásili na inom zariadení. Prihláste sa znova – nič sa nestratilo."); } catch (e) { /* nič */ }
    sb.auth.signOut({ scope: "local" }).catch(function () {}).then(function () { history.replaceState(null, "", location.pathname); location.reload(); });
  }
  sb.auth.onAuthStateChange(function (udalost) { if (udalost === "SIGNED_OUT" && S.me) prihlasenieVyprsalo(); });
  async function funkcia(telo) {
    var ses = (await sb.auth.getSession()).data.session;
    var r = await fetch(CFG.supabaseUrl + "/functions/v1/makleri", {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: CFG.supabaseKey,
        Authorization: "Bearer " + (ses ? ses.access_token : CFG.supabaseKey) },
      body: JSON.stringify(telo),
    });
    var d = {};
    try { d = await r.json(); } catch (e) { /* prázdna odpoveď */ }
    if (!r.ok || !d.ok) throw new Error(d.chyba || ("Chyba servera (" + r.status + ")"));
    return d;
  }
  function noveHeslo() {
    var a = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789", s = "";
    var r = new Uint32Array(10); crypto.getRandomValues(r);
    for (var i = 0; i < 10; i++) s += a[r[i] % a.length];
    return s;
  }

  // ------------------------------------------------------------ svetlý / tmavý režim
  var TEMA_KEY = "alpha-skener-tema";
  function jeTmava() {
    var t = document.documentElement.dataset.theme;
    if (t) return t === "dark";
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  }
  function popisTemy() {
    var b = $("#tema-btn"); if (!b) return;
    var tmava = jeTmava();
    b.textContent = tmava ? "☀" : "☾";
    b.title = tmava ? "Prepnúť na svetlý režim" : "Prepnúť na tmavý režim";
    b.setAttribute("aria-label", b.title);
    var m = document.querySelector('meta[name="theme-color"]');
    if (m) m.content = tmava ? "#0f1114" : "#2b2f36";
  }
  function prepniTemu() {
    var nova = jeTmava() ? "light" : "dark";
    document.documentElement.dataset.theme = nova;
    try { localStorage.setItem(TEMA_KEY, nova); } catch (e) { /* nevadí */ }
    popisTemy();
  }

  // ------------------------------------------------------------ oko pri hesle
  function pridajOko(root) {
    (root || document).querySelectorAll('input[type="password"]:not([data-oko])').forEach(function (inp) {
      inp.setAttribute("data-oko", "1");
      var w = document.createElement("span"); w.className = "pw-wrap";
      inp.parentNode.insertBefore(w, inp); w.appendChild(inp);
      var b = document.createElement("button");
      b.type = "button"; b.className = "pw-eye"; b.setAttribute("aria-label", "Zobraziť heslo"); b.textContent = "👁";
      b.onclick = function () {
        var skryte = inp.type === "password";
        inp.type = skryte ? "text" : "password";
        b.setAttribute("aria-label", skryte ? "Skryť heslo" : "Zobraziť heslo");
        b.classList.toggle("on", skryte);
      };
      w.appendChild(b);
    });
  }

  // ------------------------------------------------------------ štart a prihlásenie
  // ------------------------------------------------------------ VZHĽAD KANCELÁRIE (farby, logo, vodotlač)
  var LOGO_PREDV = "logo.png?v=202610201600";
  var SCHEMY = {
    zlata: ["Zlatá", "#dab967", "#a8862f", "#f3ead6", "#2b2f36"],
    typek: ["Realitný týpek", "#db9522", "#8a5a2b", "#f2e4c6", "#1e2a35"],
    modra: ["Modrá", "#4c8df6", "#2560c4", "#e4edfd", "#1c2738"],
    smaragd: ["Smaragdová", "#2fb380", "#16845a", "#ddf3e9", "#1d2b27"],
    vinova: ["Vínová", "#c4566a", "#9a2d42", "#f8e3e7", "#2b2125"],
    oranzova: ["Oranžová", "#f08a2c", "#b85c0c", "#fdebd9", "#2a2522"],
    fialova: ["Fialová", "#8d73ee", "#6247cc", "#ece7fd", "#231f36"],
    grafit: ["Grafitová", "#a3adbb", "#566170", "#eceef2", "#212429"],
  };
  var VODOZNAK_PREDV = { pozicia: "pd", styl: "farebne", priehladnost: 0.62, velkost: 0.2 };
  function hexRgb(h) { h = String(h || "#000000").replace("#", ""); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; }
  function rgbHex(c) { return "#" + c.map(function (v) { return Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0"); }).join(""); }
  function zmiesaj(a, b, t) { var x = hexRgb(a), y = hexRgb(b); return rgbHex(x.map(function (v, i) { return v + (y[i] - v) * t; })); }
  function jas(h) { var c = hexRgb(h).map(function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; }
  function farbySchemy(V) {
    V = V || {};
    if (V.schema === "vlastna" && /^#[0-9a-f]{6}$/i.test(V.farba || "")) {
      var c = V.farba, tmava = jas(c) > 0.45 ? zmiesaj(c, "#000000", 0.38) : jas(c) > 0.2 ? zmiesaj(c, "#000000", 0.2) : c;
      return ["Vlastná", jas(c) < 0.12 ? zmiesaj(c, "#ffffff", 0.35) : c, tmava, zmiesaj(c, "#ffffff", 0.84), zmiesaj("#23262c", c, 0.1)];
    }
    return SCHEMY[V.schema] || SCHEMY.typek;
  }
  function aplikujVzhlad(V) {
    var f = farbySchemy(V), s = f[1], g = f[2];
    var on = jas(s) > 0.42 ? zmiesaj(s, "#000000", 0.85) : "#ffffff";
    var dsoft = zmiesaj("#20232a", s, 0.18), dgr = zmiesaj("#0f1114", f[4], 0.35);
    // farba sa prenesie aj do pozadia, plôch, čiar a bočného panela
    var svetle = "--bg:" + zmiesaj("#f7f6f3", f[3], 0.55) + ";--surface:" + zmiesaj("#ffffff", f[3], 0.12) + ";--surface-2:" + zmiesaj("#fbfaf8", f[3], 0.35) +
      ";--line:" + zmiesaj("#e4e1da", f[3], 0.6) + ";--ink:" + zmiesaj("#1d2128", f[4], 0.5) + ";--muted:" + zmiesaj("#666b73", f[4], 0.3) +
      ";--panel:" + zmiesaj(f[4], s, 0.2) + ";--panel-2:" + zmiesaj(f[4], "#000000", 0.12);
    var tmave = "--gold:" + s + ";--gold-soft:" + dsoft + ";--graphite:" + dgr + ";--bg:" + zmiesaj("#16181c", s, 0.035) + ";--surface:" + zmiesaj("#1f2228", s, 0.045) +
      ";--surface-2:" + zmiesaj("#1a1d22", s, 0.04) + ";--line:" + zmiesaj("#33373f", s, 0.1) + ";--ink:#ecebe6;--muted:#a2a4a8;--panel:" + zmiesaj(dgr, s, 0.14) + ";--panel-2:" + dgr;
    var css = ":root{--gold:" + g + ";--gold-strong:" + s + ";--gold-soft:" + f[3] + ";--graphite:" + f[4] + ";--accent-rgb:" + hexRgb(s).join(" ") +
      ";--accent-dark-rgb:" + hexRgb(g).join(" ") + ";--accent-light:" + zmiesaj(s, "#ffffff", 0.35) + ";--on-accent:" + on + ";" + svetle + "}" +
      '@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){' + tmave + "}}" +
      ':root[data-theme="dark"]{' + tmave + "}";
    var el = document.getElementById("vzhlad-css");
    if (!el) { el = document.createElement("style"); el.id = "vzhlad-css"; document.head.appendChild(el); }
    el.textContent = css;
    var m = document.querySelector('meta[name="theme-color"]'); if (m) m.setAttribute("content", f[4]);
    if (S.logoUrlPred !== logoUrl()) { S.logoUrlPred = logoUrl(); S.logoP = null; }
  }
  function logoUrl() { return (S.vzhlad && S.vzhlad.logo) || LOGO_PREDV; }
  function nazovKancelarie() { return (S.vzhlad && S.vzhlad.nazov) || "Alpha Reality"; }
  function vodoznakNast() { return Object.assign({}, VODOZNAK_PREDV, (S.vzhlad && S.vzhlad.vodoznak) || {}); }
  function cssVar(n) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim() || "#dab967"; }
  // vzhľad sa pamätá v prehliadači, aby sa farby a logo ukázali hneď (aj na prihlasovacej obrazovke)
  try { S.vzhlad = JSON.parse(localStorage.getItem("typek-vzhlad") || "null") || {}; } catch (e) { S.vzhlad = {}; }
  aplikujVzhlad(S.vzhlad);
  async function nacitajVzhlad() {
    var v = await rpc("vzhlad_kancelarie", {});
    var zmena = JSON.stringify(v || {}) !== JSON.stringify(S.vzhlad || {});
    S.vzhlad = v || {};
    try { localStorage.setItem("typek-vzhlad", JSON.stringify(S.vzhlad)); } catch (e) { /* bez úložiska */ }
    if (zmena) aplikujVzhlad(S.vzhlad);
    return zmena;
  }

  async function start() {
    var ses = (await sb.auth.getSession()).data.session;
    nacitajVzhlad().then(function (zmena) { if (zmena && !S.me && $("#f-login")) obrazovkaLogin($("#l-err") ? $("#l-err").textContent : ""); }).catch(function () {});
    if (ses) return poPrihlaseni(ses.user);
    var prve = false;
    try { prve = await rpc("je_prve_spustenie", {}); } catch (e) { /* zobrazíme prihlásenie */ }
    var sprava = null;
    try { sprava = sessionStorage.getItem("typek-odhlaseny"); sessionStorage.removeItem("typek-odhlaseny"); } catch (e) { /* bez správy */ }
    prve ? obrazovkaPrve() : obrazovkaLogin(sprava);
  }

  function obrazovkaLogin(sprava) {
    $("#app").innerHTML =
      '<div class="login"><div class="login-typek" aria-hidden="true"><img src="typek-postava.png" alt="" width="568" height="640"><span class="login-bublina">Ahoj! Poďme predávať 🔑</span></div>' +
      '<form class="login-box" id="f-login">' +
      '<span class="lesk"><img class="login-logo" src="' + esc(logoUrl()) + '" alt="' + esc(nazovKancelarie()) + '"></span><h1 class="login-nazov">Realitný <span>týpek</span></h1><p>Prihláste sa svojím maklérskym účtom.</p>' +
      '<label class="field"><span>Email</span><input type="email" id="l-email" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" inputmode="email" required></label>' +
      '<label class="field"><span>Heslo</span><input type="password" id="l-heslo" autocomplete="current-password" required></label>' +
      '<div class="error" id="l-err">' + esc(sprava || "") + "</div>" +
      '<button class="btn primary wide" type="submit">Prihlásiť sa</button>' +
      "<p>Účet vám vytvorí administrátor. Ak ste zabudli heslo, požiadajte ho o nové.</p>" + PRAVA + "</form>" +
      '<div class="login-pata"><img src="typek-hlava.png" alt="" width="28" height="28"><span><b>Realitný týpek</b></span></div></div>';
    pridajOko($("#f-login"));
    $("#f-login").addEventListener("submit", async function (e) {
      e.preventDefault();
      var btn = e.target.querySelector("button"); btn.disabled = true; $("#l-err").textContent = "";
      var email = $("#l-email").value.trim().toLowerCase(), heslo = $("#l-heslo").value;
      var r = await sb.auth.signInWithPassword({ email: email, password: heslo });
      // mobilné klávesnice niekedy pridajú medzeru na koniec – skúsime aj bez nej
      if (r.error && heslo !== heslo.trim()) r = await sb.auth.signInWithPassword({ email: email, password: heslo.trim() });
      btn.disabled = false;
      if (r.error) {
        $("#l-err").textContent = /Invalid login credentials/i.test(r.error.message || "") ?
          "Nesprávny email alebo heslo. Ťuknite na 👁 a skontrolujte heslo – veľké a malé písmená, prípadne zámenu y a z na klávesnici." : chybaText(r.error);
        return;
      }
      poPrihlaseni(r.data.user);
    });
  }

  function obrazovkaPrve() {
    $("#app").innerHTML =
      '<div class="login"><form class="login-box" id="f-prve">' +
      '<img class="login-logo" src="' + esc(logoUrl()) + '" alt="' + esc(nazovKancelarie()) + '"><h1 class="login-nazov">Realitný <span>týpek</span></h1>' +
      "<p>Vitajte. Vytvorte účet administrátora – s ním budete pridávať maklérov a nastavovať ich práva.</p>" +
      '<label class="field"><span>Meno a priezvisko</span><input type="text" id="p-meno" required></label>' +
      '<label class="field"><span>Email</span><input type="email" id="p-email" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" inputmode="email" required></label>' +
      '<label class="field"><span>Heslo (aspoň 8 znakov)</span><input type="password" id="p-heslo" minlength="8" autocomplete="new-password" required></label>' +
      '<div class="error" id="p-err"></div>' +
      '<button class="btn primary wide" type="submit">Vytvoriť účet administrátora</button></form></div>';
    pridajOko($("#f-prve"));
    $("#f-prve").addEventListener("submit", async function (e) {
      e.preventDefault();
      var btn = e.target.querySelector("button"); btn.disabled = true;
      try {
        await funkcia({ akcia: "vytvorit", meno: $("#p-meno").value, email: $("#p-email").value, heslo: $("#p-heslo").value });
        var r = await sb.auth.signInWithPassword({ email: $("#p-email").value.trim().toLowerCase(), password: $("#p-heslo").value });
        if (r.error) throw r.error;
        poPrihlaseni(r.data.user);
      } catch (err) { $("#p-err").textContent = chybaText(err); btn.disabled = false; }
    });
  }

  async function poPrihlaseni(user) {
    S.user = user;
    $("#app").innerHTML = '<div class="boot">Načítavam inzeráty…</div>';
    var r = await sb.from("makleri").select("*").eq("id", user.id).maybeSingle();
    if (r.error || !r.data || !r.data.aktivny) {
      await sb.auth.signOut({ scope: "local" });
      return obrazovkaLogin(r.data && !r.data.aktivny ? "Váš účet je deaktivovaný. Kontaktujte administrátora." : "Účet sa nenašiel. Kontaktujte administrátora.");
    }
    S.me = r.data;
    // hlavný správca Realitného týpka – vidí prepínač do správy zákazníkov
    try { var hs = await sb.rpc("je_hlavny_spravca"); S.hlavny = !hs.error && hs.data === true; } catch (e) { S.hlavny = false; }
    try { await nacitajNastavenia(); } catch (e) { /* predvolené */ }
    // aplikácia bola zatvorená dlhšie, ako je čas odhlásenia → odhlásime
    var posl = poslednaAktivita();
    if (S.odhlMin > 0 && posl && Date.now() - posl > S.odhlMin * 60000) return odhlasitPreNecinnost();
    zaznamenajAktivitu(true);
    S.tab = tabZAdresy() || "domov";
    var dmAdresa = location.hash.match(/^#chat\/([0-9a-f-]{36})$/i); if (dmAdresa) S.chatS = dmAdresa[1];
    // odkaz na jednu ponuku alebo inzerát (napr. z realitnej mapy v novom okne)
    var stavAdresy = { tab: S.tab }, jedenAdresa = location.hash.match(/^#(nehnutelnosti|inzeraty)\/(.+)$/);
    if (jedenAdresa && S.tab === jedenAdresa[1]) {
      if (S.tab === "nehnutelnosti" && Number(jedenAdresa[2])) { S.ponukaDetail = Number(jedenAdresa[2]); stavAdresy.detail = S.ponukaDetail; }
      if (S.tab === "inzeraty") { S.jedenId = decodeURIComponent(jedenAdresa[2]); stavAdresy.jeden = S.jedenId; }
    }
    history.replaceState(stavAdresy, "", "#" + S.tab);
    try { await nacitajVsetko(); } catch (e) { toast(chybaText(e), true); }
    vykresli();
    setInterval(obnov, 60000);
    setTimeout(ukazPochvalu, 1200);
    setTimeout(zacniSprievodcuAkTreba, 2200);
    nacitajNovinky().then(function () { popisNovinky(); setTimeout(zacniNovinkyAkTreba, 3200); }, function () {});
    spustiOdpocet();
    somTu();
    var chatTik = 0;
    var tik = function () { chatTik++; if (!document.hidden || chatTik % 2 === 0) chatNove(); };
    try {
      var w = new Worker(URL.createObjectURL(new Blob(["setInterval(function(){postMessage(1)},4000)"], { type: "text/javascript" })));
      w.onmessage = tik;
    } catch (e) { setInterval(tik, 4000); }
    window.addEventListener("focus", function () { chatNove(); if (S.tab === "chat") oznacPrecitane(); });
    document.addEventListener("visibilitychange", function () { if (!document.hidden) obnov(); });
  }

  // ikona na ploche mobilu (aplikácia)
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", function () { navigator.serviceWorker.register("sw.js").catch(function () {}); });
  }
  var instalacia = null;
  window.addEventListener("beforeinstallprompt", function (e) { e.preventDefault(); instalacia = e; if (S.pwdOpen) vykresliHeslo(); });
  // ---------- upozornenia do mobilu (Web Push) na nové súkromné inzeráty
  function pushPodpora() { return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window; }
  function jeIos() { return /iphone|ipad|ipod/i.test(navigator.userAgent); }
  function naPloche() { return (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) || navigator.standalone === true; }
  function b64Bajty(b) {
    var p = "=".repeat((4 - b.length % 4) % 4), r = atob((b + p).replace(/-/g, "+").replace(/_/g, "/")), o = new Uint8Array(r.length);
    for (var i = 0; i < r.length; i++) o[i] = r.charCodeAt(i);
    return o;
  }
  function boxUpozornenia() {
    if (!maSekciu("inzeraty")) return "";
    var obce = S.me.obce || [];
    var co = obce.length ? "nové súkromné inzeráty z Vašich obcí (" + obce.length + ": " + esc(obce.slice(0, 4).join(", ")) + (obce.length > 4 ? "…" : "") + ")" : "všetky nové súkromné inzeráty z oboch okresov – obmedzíte ich nižšie v Mojich obciach";
    return '<div class="box" id="box-push"><h3>🔔 Upozornenia do mobilu</h3><p class="meta">Keď skener nájde nový súkromný inzerát, pípne vám telefón, aj keď je aplikácia zatvorená. Chodia vám ' + co + ".</p>" +
      '<div id="push-stav" class="push-stav"><span class="meta">Zisťujem…</span></div></div>';
  }
  async function napojUpozornenia() {
    var el = $("#push-stav"); if (!el) return;
    function kresli(h) { var x = $("#push-stav"); if (x) x.innerHTML = h; }
    if (!pushPodpora()) {
      return kresli(jeIos() && !naPloche() ?
        '<p class="note">Na iPhone fungujú upozornenia len z aplikácie na ploche: v Safari ťuknite na <b>Zdieľať</b> → <b>Pridať na plochu</b>, otvorte Realitného týpka z ikony na ploche a tu ich zapnite.</p>' :
        '<p class="note">Tento prehliadač upozornenia nepodporuje. Otvorte aplikáciu v Chrome (Android, počítač) alebo z ikony na ploche iPhonu.</p>');
    }
    if (Notification.permission === "denied") {
      return kresli('<p class="note zle">Upozornenia sú pre túto aplikáciu zablokované. Povoľte ich v nastaveniach telefónu (Nastavenia → Upozornenia → Realitný týpek, prípadne v nastaveniach stránky v Chrome) a potom ich tu zapnite.</p>');
    }
    var reg = await Promise.race([navigator.serviceWorker.ready, new Promise(function (ok) { setTimeout(function () { ok(null); }, 5000); })]).catch(function () { return null; });
    if (!reg) return kresli('<p class="note">Upozornenia sa nedajú zapnúť – obnovte stránku a skúste znova.</p>');
    var sub = reg ? await reg.pushManager.getSubscription().catch(function () { return null; }) : null;
    var r = sub ? await sb.from("push_odbery").select("id").eq("endpoint", sub.endpoint).maybeSingle() : { data: null };
    var zapnute = !!(sub && r.data);
    kresli(zapnute ?
      '<p class="push-ok">✅ Na tomto zariadení sú upozornenia zapnuté.</p><div class="form-actions"><button class="btn ghost" type="button" id="push-vyp">Vypnúť na tomto zariadení</button></div>' :
      (jeIos() && !naPloche() ? '<p class="note">Na iPhone fungujú upozornenia len z aplikácie na ploche: v Safari ťuknite na <b>Zdieľať</b> → <b>Pridať na plochu</b>, otvorte ju z ikony a tu ich zapnite.</p>' : "") +
      '<div class="form-actions"><button class="btn primary" type="button" id="push-zap">🔔 Zapnúť upozornenia</button></div>');
    var zap = $("#push-zap"), vyp = $("#push-vyp");
    if (zap) zap.onclick = async function () {
      zap.disabled = true;
      try {
        var kluc = await rpc("push_kluc", {});
        if (!kluc) throw new Error("Upozornenia sa ešte pripravujú – skúste to o 10 minút.");
        var p = await Notification.requestPermission();
        if (p !== "granted") throw new Error("Upozornenia ste nepovolili. Ak ste ťukli na Nepovoliť, zapnete ich v nastaveniach telefónu.");
        var rg = await navigator.serviceWorker.ready;
        var s = await rg.pushManager.getSubscription();
        if (!s) s = await rg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64Bajty(kluc) });
        var j = s.toJSON();
        await rpc("ulozit_push_odber", { p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth,
          p_zariadenie: (jeIos() ? "iPhone" : /android/i.test(navigator.userAgent) ? "Android" : "Počítač") + (naPloche() ? " (aplikácia)" : "") });
        rg.showNotification("🔔 Upozornenia sú zapnuté", { body: "Takto vám príde správa o novom súkromnom inzeráte.", icon: "ikona-192.png", badge: "favicon-32.png", tag: "push-test" });
        toast("🔔 Upozornenia sú zapnuté.");
      } catch (err) { toast(chybaText(err), true); }
      napojUpozornenia();
    };
    if (vyp) vyp.onclick = async function () {
      vyp.disabled = true;
      try { await rpc("zrusit_push_odber", { p_endpoint: sub.endpoint }); await sub.unsubscribe().catch(function () {}); toast("Upozornenia sú na tomto zariadení vypnuté."); }
      catch (err) { toast(chybaText(err), true); }
      napojUpozornenia();
    };
  }
  function boxPlocha() {
    var nainst = window.matchMedia && window.matchMedia("(display-mode: standalone)").matches;
    if (nainst) return "";
    var ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    return '<div class="box"><h3>📲 Skener na ploche mobilu</h3>' +
      (instalacia ? '<p class="meta">Skener sa bude otvárať ako aplikácia, bez hľadania odkazu.</p><button class="btn primary" type="button" id="plocha-btn">Pridať na plochu</button>' :
        ios ? '<p class="meta">V Safari ťuknite dole na <b>Zdieľať</b> (štvorček so šípkou) → <b>Pridať na plochu</b> → <b>Pridať</b>.</p>' :
        '<p class="meta">V Chrome ťuknite vpravo hore na <b>⋮</b> → <b>Pridať na plochu</b> (alebo <b>Inštalovať aplikáciu</b>).</p>') + "</div>";
  }

  // ---------- posledné prihlásenie a aktivita
  var somTuCas = 0;
  function somTu() {
    // oznámime aktivitu len ak maklér niečo robil v posledných 5 minútach a stránka je otvorená
    if (!S.me || document.hidden || Date.now() - poslednaAktivita() > 5 * 60000 || Date.now() - somTuCas < 2 * 60000) return;
    somTuCas = Date.now();
    rpc("som_tu", {}).catch(function () {});
  }
  // oslavy, cieľ mesiaca, pochvaly, reakcie
  async function nacitajOslavy() {
    var u = await Promise.all([
      rpc("oslavy_dnes", {}).catch(function () { return S.oslavy || []; }),
      rpc("moj_mesiac", {}).catch(function () { return S.mesiac || null; }),
      sb.from("pochvaly").select("*").order("id", { ascending: false }).limit(50),
      sb.from("reakcie").select("*").eq("aktivna", true),
    ]);
    S.oslavy = u[0] || []; S.mesiac = u[1];
    S.pochvaly = (u[2] && u[2].data) || [];
    S.reakcie = (u[3] && u[3].data) || [];
  }
  function hashTextu(t) {
    var h = 5381; t = String(t);
    for (var i = 0; i < t.length; i++) h = ((h << 5) + h + t.charCodeAt(i)) >>> 0;
    return h.toString(36);
  }
  var EMOJI = [["👍", "Palec hore"], ["😂", "Smiech"], ["😢", "Plač"], ["💣", "Bomba"], ["🔥", "Oheň"], ["🖐️", "Daj five!"]];
  function reakcieBar(ciel) {
    var r = (S.reakcie || []).filter(function (x) { return x.ciel === ciel; });
    return '<div class="reakcie" data-ciel="' + esc(ciel) + '">' + EMOJI.map(function (e) {
      var kto = r.filter(function (x) { return x.emoji === e[0]; }), moja = kto.some(function (x) { return x.makler_id === S.me.id; });
      var mena = kto.map(function (x) { return x.makler_id === S.me.id ? "vy" : oslovenie(S.mById[x.makler_id]) || "?"; }).join(", ");
      return '<button type="button" class="reakcia' + (e[0] === "🖐️" ? " five" : "") + '" data-emoji="' + e[0] + '" aria-pressed="' + moja + '" title="' + esc(e[1] + (mena ? " – " + mena : "")) + '">' +
        '<span class="re-e">' + e[0] + "</span>" + (e[0] === "🖐️" ? '<span class="re-t">Five!</span>' : "") + (kto.length ? '<span class="re-n">' + kto.length + "</span>" : "") + "</button>";
    }).join("") + "</div>";
  }
  document.addEventListener("click", async function (e) {
    var b = e.target.closest(".reakcia");
    if (!b) return;
    var bar = b.closest("[data-ciel]"), ciel = bar.dataset.ciel, emo = b.dataset.emoji;
    var bylo = b.getAttribute("aria-pressed") === "true";
    if (!bylo) letiaceEmoji(b, emo);
    if (!bylo && emo === "🖐️") konfety({ x: b.getBoundingClientRect().left + 20, y: b.getBoundingClientRect().top, pocet: 60, sila: 0.7 });
    try {
      var pridane = await rpc("reagovat", { p_ciel: ciel, p_emoji: emo });
      if (pridane) S.reakcie.push({ ciel: ciel, makler_id: S.me.id, emoji: emo });
      else S.reakcie = S.reakcie.filter(function (x) { return !(x.ciel === ciel && x.makler_id === S.me.id && x.emoji === emo); });
      var t = document.createElement("div"); t.innerHTML = reakcieBar(ciel); bar.replaceWith(t.firstElementChild);
    } catch (err) { toast(chybaText(err), true); }
  });
  function letiaceEmoji(el, emo) {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    var r = el.getBoundingClientRect();
    for (var i = 0; i < 5; i++) {
      var sp = document.createElement("span"); sp.className = "letiace"; sp.textContent = emo;
      sp.style.left = (r.left + r.width / 2 - 12 + (Math.random() * 40 - 20)) + "px"; sp.style.top = (r.top - 4) + "px";
      sp.style.animationDelay = (i * 0.07) + "s"; sp.style.setProperty("--dx", (Math.random() * 80 - 40) + "px");
      document.body.appendChild(sp); setTimeout(function (x) { x.remove(); }.bind(null, sp), 1600);
    }
  }
  // konfety – jednoduchá animácia na plátne
  function konfety(o) {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    o = o || {};
    var c = document.createElement("canvas"); c.className = "konfety"; document.body.appendChild(c);
    var w = c.width = window.innerWidth, h = c.height = window.innerHeight, g = c.getContext("2d");
    var farby = ["#dab967", "#a8862f", "#f3d98b", "#2a78d6", "#eb6834", "#1baf7a", "#e87ba4", "#ffffff"];
    var x0 = o.x != null ? o.x : w / 2, y0 = o.y != null ? o.y : h * 0.35, n = o.pocet || 160, sila = o.sila || 1;
    var cast = [];
    for (var i = 0; i < n; i++) {
      var uhol = Math.random() * Math.PI * 2, v = (4 + Math.random() * 9) * sila;
      cast.push({ x: x0, y: y0, vx: Math.cos(uhol) * v, vy: Math.sin(uhol) * v - 6 * sila, r: 4 + Math.random() * 5, f: farby[i % farby.length],
        rot: Math.random() * 6, vr: Math.random() * 0.3 - 0.15, tvar: i % 3 });
    }
    var t0 = performance.now();
    (function krok(t) {
      var p = (t - t0) / 2600; g.clearRect(0, 0, w, h);
      cast.forEach(function (k) {
        k.vy += 0.28; k.vx *= 0.99; k.x += k.vx; k.y += k.vy; k.rot += k.vr;
        g.save(); g.globalAlpha = Math.max(0, 1 - p * p); g.translate(k.x, k.y); g.rotate(k.rot); g.fillStyle = k.f;
        if (k.tvar === 0) g.fillRect(-k.r, -k.r / 2, k.r * 2, k.r);
        else if (k.tvar === 1) { g.beginPath(); g.arc(0, 0, k.r / 1.6, 0, 6.3); g.fill(); }
        else { g.beginPath(); g.moveTo(0, -k.r); g.lineTo(k.r, k.r); g.lineTo(-k.r, k.r); g.fill(); }
        g.restore();
      });
      if (p < 1) requestAnimationFrame(krok); else c.remove();
    })(t0);
  }
  // pochvala od šéfa – vyskakovacie okno
  function ukazPochvalu() {
    if (!S.me || document.querySelector(".pochvala-var")) return;
    var p = (S.pochvaly || []).filter(function (x) { return x.komu === S.me.id && !x.videne; }).sort(function (a, b) { return a.id - b.id; })[0];
    if (!p) return;
    var o = document.createElement("div"); o.className = "pochvala-var";
    o.innerHTML = '<div class="pochvala-karta" role="dialog" aria-labelledby="poch-n">' +
      '<div class="pochvala-hviezda" aria-hidden="true">' + (p.typ === "oznam" ? "📣" : p.typ === "tim" ? "🏆" : "⭐") + '</div><h3 id="poch-n">' +
      (p.typ === "oznam" ? "Správa pre celý tím" : p.typ === "tim" ? "Pochvala pre celý tím!" : "Máš pochvalu, " + esc(oslovenie(S.me)) + "!") + "</h3>" +
      '<p class="pochvala-text">' + esc(p.text) + "</p>" +
      (S.mById[p.od] ? '<div class="pochvala-podpis">' + avatar(p.od, 26) + "<span>— " + esc(S.mById[p.od].meno) + "</span></div>" : "") +
      '<button class="btn primary wide" type="button">' + (p.typ === "oznam" ? "Rozumiem 👍" : "Ďakujem 🙏") + "</button></div>";
    document.body.appendChild(o);
    if (p.typ !== "oznam") setTimeout(function () { konfety({ pocet: 180 }); }, 250);
    o.querySelector("button").onclick = async function () {
      p.videne = new Date().toISOString(); o.remove();
      try { await rpc("pochvala_videna", { p_id: p.id }); } catch (e) { /* nevadí */ }
      setTimeout(ukazPochvalu, 400);
    };
  }
  async function nacitajOsobne() {
    var r = await sb.from("makler_osobne").select("*");
    if (r.error) return;
    var o = {}; r.data.forEach(function (x) { o[x.makler_id] = x; }); S.osobne = o;
  }
  function oslovenie(m) {
    if (!m) return "";
    return m.oslovenie || String(m.meno || "").trim().split(/\s+/)[0] || "";
  }
  async function nacitajPrihlasenia() {
    if (!admin()) return;
    try {
      var r = await rpc("prihlasenia_maklerov", {}), o = {};
      r.forEach(function (x) { o[x.id] = x; }); S.prihl = o;
    } catch (e) { /* nič */ }
  }
  function onlineStav(id) {
    var x = (S.prihl || {})[id] || {};
    var akt = x.aktivny ? new Date(x.aktivny).getTime() : 0;
    var online = akt && Date.now() - akt < 4 * 60000;
    return {
      online: online,
      html: (online ? '<span class="online">online</span>' : x.aktivny ? "aktívny " + ago(x.aktivny) : "zatiaľ neaktívny") +
        (x.prihlaseny ? " · prihlásený " + datum(x.prihlaseny, true) : " · ešte sa neprihlásil"),
    };
  }

  // ---------- automatické odhlásenie pri nečinnosti
  var KLUC_AKT = "typek-aktivita", aktPamat = 0, aktZapis = 0;
  async function nacitajNastavenia() {
    nacitajVzhlad().then(function (zmena) { if (zmena && S.me) vykresli(); }).catch(function () {});
    var n = await rpc("nastavenia_aplikacie", {});
    S.odhlMin = Number(n.odhlasenie_min) || 0;
    S.odkaz = { text: n.odkaz_text || "", zapnuty: !!n.odkaz_zapnuty, autor: n.odkaz_autor || null };
  }
  function poslednaAktivita() {
    var ls = 0;
    try { ls = Number(localStorage.getItem(KLUC_AKT)) || 0; } catch (e) { /* bez úložiska */ }
    return Math.max(ls, aktPamat);
  }
  function zaznamenajAktivitu(hned) {
    aktPamat = Date.now();
    if (hned || aktPamat - aktZapis > 5000) {
      aktZapis = aktPamat;
      try { localStorage.setItem(KLUC_AKT, String(aktPamat)); } catch (e) { /* bez úložiska */ }
    }
    if (S.odhlVaruje) skryVarovanie();
  }
  ["pointerdown", "keydown", "wheel", "touchstart", "scroll"].forEach(function (ev) {
    window.addEventListener(ev, function () { if (S.me) zaznamenajAktivitu(); }, { passive: true, capture: true });
  });
  var pohybT = 0;
  window.addEventListener("mousemove", function () { if (S.me && Date.now() - pohybT > 2000) { pohybT = Date.now(); zaznamenajAktivitu(); } }, { passive: true });
  function formatOdpocet(ms) {
    var s = Math.max(0, Math.ceil(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), ss = s % 60;
    return (h ? h + ":" + String(m).padStart(2, "0") : m) + ":" + String(ss).padStart(2, "0");
  }
  function tikOdpocet() {
    if (!S.me) return;
    var el = $("#odhl"), cas = $("#odhl-cas");
    if (!S.odhlMin) { if (el) el.hidden = true; skryVarovanie(); return; }
    var zostava = S.odhlMin * 60000 - (Date.now() - poslednaAktivita());
    if (el) { el.hidden = false; cas.textContent = formatOdpocet(zostava); el.classList.toggle("malo", zostava < 5 * 60000); }
    if (zostava <= 0) return odhlasitPreNecinnost();
    if (zostava <= 60000) ukazVarovanie(zostava); else if (S.odhlVaruje) skryVarovanie();
  }
  function spustiOdpocet() {
    tikOdpocet();
    setInterval(tikOdpocet, 1000);
    document.addEventListener("visibilitychange", function () { if (!document.hidden) tikOdpocet(); });
  }
  function ukazVarovanie(zostava) {
    var o = $("#odhl-var");
    if (!o) {
      o = document.createElement("div"); o.id = "odhl-var"; o.className = "odhl-var";
      o.innerHTML = '<div class="odhl-karta" role="alertdialog" aria-labelledby="odhl-nadpis">' +
        '<svg class="odhl-kruh" viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="52" class="podklad"/><circle cx="60" cy="60" r="52" class="postup" id="odhl-postup"/></svg>' +
        '<div class="odhl-cislo" id="odhl-cislo"></div>' +
        '<h3 id="odhl-nadpis">Ste tu ešte?</h3><p class="meta">Pre nečinnosť vás o chvíľu odhlásime, aby sa k vašim údajom nikto nedostal.</p>' +
        '<button class="btn primary wide" type="button" id="odhl-zostat">Zostať prihlásený</button></div>';
      document.body.appendChild(o);
      $("#odhl-zostat").onclick = function () { zaznamenajAktivitu(true); };
    }
    S.odhlVaruje = true;
    var sek = Math.max(0, Math.ceil(zostava / 1000));
    $("#odhl-cislo").textContent = sek;
    $("#odhl-postup").style.strokeDashoffset = String(326.7 * (1 - sek / 60));
  }
  function skryVarovanie() {
    S.odhlVaruje = false;
    var o = $("#odhl-var"); if (o) o.remove();
  }
  async function odhlasitPreNecinnost() {
    var min = S.odhlMin;
    S.me = null;
    try {
      sessionStorage.setItem("typek-odhlaseny", "Boli ste automaticky odhlásený po " + (min >= 60 && min % 60 === 0 ? min / 60 + (min === 60 ? " hodine" : " hodinách") : min + " minútach") + " nečinnosti. Prihláste sa znova.");
      localStorage.removeItem(KLUC_AKT);
    } catch (e) { /* bez úložiska */ }
    await sb.auth.signOut({ scope: "local" }).catch(function () {});
    history.replaceState(null, "", location.pathname);
    location.reload();
  }

  // ---------- neuložené zmeny: upozornenie pri tlačidle Uložiť, pred odchodom a ukladanie cez Ctrl+S
  var NEULOZENE = '<span class="neulozene" aria-live="polite">● Neuložené zmeny</span>';
  function oznacZmenu(e) {
    var t = e.target; if (!t || !t.closest || !/INPUT|TEXTAREA|SELECT/.test(t.tagName) || t.type === "search" || t.type === "file") return;
    if (t.closest(".foto-volba, .mk-pochvala, .heslo-edit, [data-nestrazit]")) return;
    var f = t.closest("[data-strazit]"); if (f) f.setAttribute("data-zmenene", "");
  }
  document.addEventListener("input", oznacZmenu, true);
  document.addEventListener("change", oznacZmenu, true);
  function maNeulozene() { return !!document.querySelector("#obsah [data-zmenene]"); }
  function odistBezUlozenia() { return !maNeulozene() || window.confirm("Máte neuložené zmeny. Odísť bez uloženia?"); }
  window.addEventListener("beforeunload", function (e) { if (S.me && maNeulozene()) { e.preventDefault(); e.returnValue = ""; } });
  document.addEventListener("keydown", function (e) {
    if (!(e.ctrlKey || e.metaKey) || e.altKey || String(e.key).toLowerCase() !== "s") return;
    var zoz = Array.prototype.slice.call(document.querySelectorAll("#obsah [data-ulozit]")).filter(function (b) { return b.offsetParent && !b.disabled; });
    if (!zoz.length) return;
    e.preventDefault();
    var b = zoz.find(function (x) { return x.closest("[data-zmenene]"); }) || zoz[0];
    b.click();
  });

  // ---------- navigácia: každá sekcia je krok v histórii prehliadača (funguje tlačidlo Späť)
  var TABY = ["domov", "inzeraty", "schrankovanie", "nehnutelnosti", "klienti", "kalendar", "chat", "matterport", "mapa", "kataster", "asistent", "web", "recenzie", "provizie", "vykon", "makleri", "vzhlad", "historia"];
  var SEKCIE = [["inzeraty", "Realitný skener", "skener"], ["schrankovanie", "Schránkovanie", "sch"], ["nehnutelnosti", "Nehnuteľnosti", "nehn"], ["klienti", "Klienti", "klienti"],
    ["kalendar", "Kalendár", "kal"], ["chat", "Chat", "chat"], ["matterport", "Matterport", "matterport"], ["mapa", "Realitná mapa", "mapa"], ["kataster", "Kataster", "kataster"], ["asistent", "AI asistent", "ai"], ["web", "Osobný web", "web"], ["recenzie", "Recenzie", "hviezda"], ["provizie", "Provízie", "euro"]];
  var HLAVNE_SEKCIE = ["inzeraty", "schrankovanie", "nehnutelnosti", "klienti", "kalendar", "chat"];
  function maSekciu(t) { return admin() || (S.me && (S.me.pristup || SEKCIE.map(function (x) { return x[0]; })).indexOf(t) >= 0); }
  function tabPovoleny(t) {
    if (TABY.indexOf(t) < 0) return false;
    if (t === "domov") return true;
    if (t === "vykon" || t === "makleri" || t === "vzhlad" || t === "historia") return admin();
    return maSekciu(t);
  }
  function tabZAdresy() {
    var t = decodeURIComponent(location.hash.replace(/^#/, "")).split("/")[0];
    return S.me && tabPovoleny(t) ? t : null;
  }
  function prejdi(tab, jeden) {
    if (!tabPovoleny(tab)) tab = "domov";
    if ((tab !== S.tab || jeden) && !odistBezUlozenia()) return;
    if (tab === S.tab && !jeden && !S.jedenId) { S.pwdOpen = false; S.zvonOpen = false; vykresliHeslo(); vykresliZvoncek(); prekresliObsah(); window.scrollTo(0, 0); return; }
    S.tab = tab; S.jedenId = jeden || null; S.shown = 100;
    if (tab === "vykon") S.vykon = null;
    ulozFiltre();
    history.pushState({ tab: tab, jeden: S.jedenId }, "", "#" + tab);
    vykresli(); window.scrollTo(0, 0);
  }
  // odkaz #nehnutelnosti/ID alebo #inzeraty/ID otvorený v už bežiacej aplikácii
  window.addEventListener("hashchange", function () {
    var m = location.hash.match(/^#(nehnutelnosti|inzeraty)\/(.+)$/);
    if (!m || !S.me || !tabPovoleny(m[1])) return;
    if (m[1] === "nehnutelnosti") {
      S.tab = "nehnutelnosti"; S.ponukaEdit = null; S.ponukaDetail = Number(m[2]) || null;
      history.replaceState({ tab: S.tab, detail: S.ponukaDetail }, "", "#nehnutelnosti"); vykresli(); window.scrollTo(0, 0);
    } else { history.replaceState({ tab: "inzeraty" }, "", "#inzeraty"); prejdi("inzeraty", decodeURIComponent(m[2])); }
  });
  window.addEventListener("popstate", function (e) {
    if (!S.me) return;
    var st = e.state || { tab: tabZAdresy() || "domov" };
    S.tab = tabPovoleny(st.tab) ? st.tab : "domov";
    S.jedenId = st.jeden || null; S.shown = 100;
    if (S.tab === "vykon") S.vykon = null;
    if (S.tab === "nehnutelnosti") { S.ponukaDetail = st.detail || null; if (!st.form) S.ponukaEdit = null; S.ponukaExport = !!st.export; }
    if (S.tab === "klienti") {
      S.dopytDetail = st.dopyt || null; if (!st.dform) S.dopytEdit = null;
      S.predDetail = st.pred || null;
      if ("kl" in st) S.klPohlad = st.kl; else if (st.dopyt || st.dform) S.klPohlad = "dopyty";
    }
    if (S.tab === "makleri") S.mkPohlad = st.mk || null;
    S.pwdOpen = false; S.zvonOpen = false;
    vykresli(); window.scrollTo(0, 0);
  });

  async function odhlasit() { S.odhlasujem = true; await sb.auth.signOut({ scope: "local" }); history.replaceState(null, "", location.pathname); location.reload(); }

  // ------------------------------------------------------------ dáta
  async function vsetkyRiadky(tabulka, stlpce, poradie, uprav) {
    var out = [], od = 0, krok = 1000;
    for (;;) {
      var q = sb.from(tabulka).select(stlpce).order(poradie).range(od, od + krok - 1);
      if (uprav) q = uprav(q);
      var r = await q;
      if (r.error) throw r.error;
      out = out.concat(r.data);
      if (r.data.length < krok) break;
      od += krok;
    }
    return out;
  }

  async function nacitajInzeraty() {
    var rows = await vsetkyRiadky("inzeraty", "*", "id", function (q) { return q.is("duplikat_z", null); });
    rows.forEach(function (z) { z._t = norm([z.nazov, z.obec, z.predajca, z.popis].join(" ")); });
    S.inz = rows;
    var obce = {};
    rows.forEach(function (z) { if (z.obec && z.aktivny) obce[z.obec] = (obce[z.obec] || 0) + 1; });
    S.obce = Object.keys(obce).sort(function (a, b) { return a.localeCompare(b, "sk"); }).map(function (o) { return [o, obce[o]]; });
    S.lastInzLoad = Date.now();
    if (S.me && !S.me.inzeraty_videne) inzeratyVidene();   // prvé spustenie – staré inzeráty nehlásime
  }
  async function nacitajPrevzatia() {
    var rows = await vsetkyRiadky("prevzatia", "*", "inzerat_id");
    var p = {}; rows.forEach(function (x) { p[x.inzerat_id] = x; }); S.prev = p;
  }
  async function nacitajMaklerov() {
    var r = await sb.from("makleri").select("*").order("meno");
    if (r.error) throw r.error;
    S.makleri = r.data; S.mById = {};
    r.data.forEach(function (m) { S.mById[m.id] = m; });
    if (S.mById[S.me.id]) S.me = S.mById[S.me.id];
  }
  async function nacitajOdhady() {
    S.canUnder = admin() || !!S.me.vidi_podhodnotene;
    S.odh = {};
    if (!S.canUnder) return;
    var rows = await vsetkyRiadky("odhady", "*", "inzerat_id");
    rows.forEach(function (o) { S.odh[o.inzerat_id] = o; });
  }
  async function nacitajOznacenia() {
    var rows = await vsetkyRiadky("oznacenia", "*", "inzerat_id");
    var o = {}; rows.forEach(function (x) { if (x.predajca_typ) o[x.inzerat_id] = x; }); S.ozn = o;
  }
  // telefóny pri súkromných inzerátoch: číslo zadané maklérom má prednosť pred číslom z textu inzerátu
  async function nacitajTelefony() {
    var zText = await vsetkyRiadky("archiv", "inzerat_id, telefon", "inzerat_id", function (q) { return q.not("telefon", "is", null); });
    var ruc = await vsetkyRiadky("telefony", "*", "inzerat_id");
    var t = {};
    zText.forEach(function (x) { if (x.telefon) t[x.inzerat_id] = { telefon: x.telefon, zdroj: "text" }; });
    ruc.forEach(function (x) { t[x.inzerat_id] = x.telefon ? { telefon: x.telefon, zdroj: "makler", zadal: x.zadal, zadane: x.zadane } : null; });
    Object.keys(t).forEach(function (k) { if (!t[k]) delete t[k]; });
    S.tel = t;
  }
  // predávajúci zo skenera – podľa telefónneho čísla, so všetkými inzerátmi a históriou kontaktov
  async function nacitajPredajcov() {
    if (!maSekciu("inzeraty")) { S.pred = []; S.predTel = {}; S.predInz = {}; return; }
    var d;
    try { d = await rpc("kontakty_predajcov", {}); }
    catch (e) {
      // databáza ešte nemá zmenu pre predávajúcich – záložku zatiaľ nezobrazujeme, aplikácia beží ďalej
      if (e && (e.code === "PGRST202" || /Could not find the function/i.test(e.message || ""))) { S.predNedostupne = true; S.pred = []; S.predTel = {}; S.predInz = {}; return; }
      throw e;
    }
    S.predNedostupne = false;
    var t = {}, i = {};
    (d || []).forEach(function (k) { t[k.tel] = k; k.inzeraty.forEach(function (x) { i[x.id] = k; }); });
    S.pred = d || []; S.predTel = t; S.predInz = i; S.predNacitane = Date.now();
  }
  // čísla bez medzier a s predvoľbou +421 prevedenou na 0 (aby sa dalo hľadať v oboch tvaroch)
  function telCifry(t) {
    return String(t).split(",").map(function (c) { return c.replace(/\D/g, "").replace(/^(00)?421/, "0"); }).join("|");
  }
  function telefon(z) { return ptyp(z) !== "rk" ? S.tel[z.id] || null : null; }
  function telOdkaz(cislo) {
    return String(cislo).split(/\s*,\s*/).map(function (c) {
      var d = c.replace(/[^\d+]/g, "");
      return '<a class="tel" href="tel:' + esc(d) + '">' + esc(c) + "</a>";
    }).join(", ");
  }
  // ---------- SMS
  function popisNehn(z) {
    var t = { byt: "byt", dom: "rodinný dom", pozemok: "pozemok", chata: "chata", garaz: "garáž", ine: "nehnuteľnosť" }[z.typ] || "nehnuteľnosť";
    if (z.typ === "byt" && z.izby) t = z.izby + "-izbový byt";
    if (z.plocha && z.typ === "pozemok") t += " " + nf.format(z.plocha) + " m²";
    return t;
  }
  // rod makléra: nastavený ručne, inak podľa avatara alebo mena (priezvisko na -á, krstné meno na -a)
  function rodMaklera(m) {
    if (!m) return "muz";
    if (m.pohlavie) return m.pohlavie;
    if (m.foto === "avatar:zena") return "zena";
    if (m.foto === "avatar:muz") return "muz";
    var slova = String(m.meno || "").trim().split(/\s+/), posl = slova[slova.length - 1] || "";
    return /á$/i.test(posl) || (slova.length === 1 && /a$/i.test(posl)) ? "zena" : "muz";
  }
  function vyplnSms(sablona, z, m) {
    var zena = rodMaklera(m) === "zena";
    return String(sablona || SMS_ZAKLAD)
      .replace(/\{([^{}|]*)\|([^{}|]*)\}/g, function (_, muz, zen) { return zena ? zen : muz; })
      .replace(/\{makler\}/g, (m && (m.meno || m.email)) || "")
      .replace(/\{nehnutelnost\}/g, popisNehn(z))
      .replace(/\{lokalita\}/g, z.obec || (z.okres ? "okres " + z.okres : ""))
      .replace(/\{cena\}/g, z.cena ? eur(z.cena) : "")
      .replace(/\{portal\}/g, PORTAL[z.portal] || "");
  }
  function smsOdkaz(z) {
    var t = S.tel[z.id]; if (!t) return "";
    var cislo = String(t.telefon).split(",")[0].replace(/[^\d+]/g, "");
    return "sms:" + cislo + "?&body=" + encodeURIComponent(vyplnSms(S.me.sms_sablona, z, S.me));
  }
  // automatické uvoľnenie po 24 hodinách bez zápisu (rovnaké pravidlo ako v databáze)
  function casUvolnenia(z) {
    var p = S.prev[z.id];
    if (!p || !p.makler_id || !p.upravene) return null;
    if (CHRANENE_VYSLEDKY.indexOf(p.posledny_vysledok) >= 0) return null;
    var t = Date.now();
    var maPripomienku = S.prip.some(function (x) {
      return x.inzerat_id === z.id && x.makler_id === p.makler_id && (x.druh || "pripomienka") === "pripomienka" && !x.hotovo && new Date(x.cas).getTime() > t;
    });
    return maPripomienku ? null : new Date(new Date(p.upravene).getTime() + 24 * 3600e3);
  }
  function textOdpoctu(ms) {
    if (ms <= 0) return "uvoľňuje sa…";
    var s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60;
    return h + ":" + String(m).padStart(2, "0") + ":" + String(x).padStart(2, "0");
  }
  // časomiera pri prevzatých inzerátoch – tiká každú sekundu
  setInterval(function () {
    var t = Date.now();
    document.querySelectorAll("[data-uvol]").forEach(function (e) {
      var z = Number(e.dataset.uvol) - t, b = e.querySelector("b");
      if (b) b.textContent = textOdpoctu(z);
      e.classList.toggle("due", z < 3 * 3600e3); e.classList.toggle("wait", z >= 3 * 3600e3);
    });
  }, 1000);
  // typ predajcu: ručné označenie má prednosť pred odhadom skenera
  function ptyp(z) { var o = S.ozn[z.id]; return o ? o.predajca_typ : z.predajca_typ; }
  async function nacitajSchrankovanie() {
    var w = await Promise.all([vsetkyRiadky("schrankovanie", "*", "id"),
      vsetkyRiadky("sidliska", "*", "id").catch(function () { return []; }), vsetkyRiadky("schrankovanie_akcie", "*", "id").catch(function () { return []; }),
      vsetkyRiadky("sidliska_poznamky", "*", "id").catch(function () { return []; })]);
    S.sch = w[0].sort(function (a, b) { return String(b.vytvorene).localeCompare(String(a.vytvorene)); });
    S.sidliska = w[1]; S.akcie = w[2]; S.sidPozn = w[3];
  }
  async function nacitajPripomienky() {
    var rows = await vsetkyRiadky("pripomienky", "*", "id");
    S.prip = rows.sort(function (a, b) { return String(a.cas).localeCompare(String(b.cas)); });
  }
  function mojeAktivne() {
    return S.prip.filter(function (p) { return p.makler_id === S.me.id && !p.hotovo; });
  }
  function splatne() {
    var t = Date.now();
    return mojeAktivne().filter(function (p) { return new Date(p.cas).getTime() <= t; });
  }
  function ohlasSplatne() {
    splatne().forEach(function (p) {
      if (S.ohlasene[p.id]) return;
      S.ohlasene[p.id] = true;
      toast((DRUH_IKONA[p.druh] || "🔔") + " " + (p.poznamka || "Pripomienka") + " (" + datum(p.cas, true) + ")");
    });
    popisZvoncek();
  }
  async function nacitajVsetko() {
    await nacitajMaklerov();
    var meta = sb.from("stav_skenera").select("meta, upravene").maybeSingle().then(function (r) { S.meta = (r.data && r.data.meta) || {}; });
    await Promise.all([nacitajInzeraty(), nacitajPrevzatia(), nacitajOdhady(), nacitajSchrankovanie(), nacitajPripomienky(), nacitajOznacenia(), nacitajTelefony(), nacitajChat(), nacitajPrihlasenia(), nacitajOsobne(), nacitajOslavy(), nacitajPonuky().catch(function () { S.ponuky = null; }), nacitajUdalosti(), meta,
      nacitajPredajcov().catch(function () { S.pred = null; }), nacitajMatterport().catch(function () { S.mp = null; })]);
  }
  var obnovuje = false;
  async function obnov() {
    if (obnovuje || !S.me) return;
    obnovuje = true;
    try {
      var uloha = [nacitajPrevzatia(), nacitajMaklerov(), nacitajSchrankovanie(), nacitajPripomienky(), nacitajOznacenia(), nacitajTelefony(), chatNove(), inzeratyNoveNacitaj().catch(function () {})];
      if (Date.now() - S.lastInzLoad > 10 * 60000) uloha.push(nacitajInzeraty(), nacitajOdhady());
      uloha.push(nacitajNastavenia().catch(function () {}), nacitajPrihlasenia(), nacitajOsobne(), nacitajOslavy());
      if (S.ponuky && !S.ponukaEdit) uloha.push(nacitajPonuky().catch(function () {}));
      else if (S.dopyty && !S.dopytEdit) uloha.push(nacitajDopyty().catch(function () {}));
      if (S.tab === "inzeraty" || S.tab === "klienti") uloha.push(nacitajPredajcov().catch(function () {}));
      if (S.mp || S.tab === "matterport") uloha.push(nacitajMatterport().catch(function () {}));
      somTu();
      await Promise.all(uloha);
      if (!S.me.aktivny) return odhlasit();
      var pr = JSON.stringify(S.me.pristup || null) + S.me.rola;
      if (S.pristupPred && S.pristupPred !== pr) { S.pristupPred = pr; vykresli(); obnovuje = false; return; }
      S.pristupPred = pr;
      prekresliObsah();
      ohlasSplatne();
      ukazPochvalu();
      if (S.zvonOpen && !S.pripForm) vykresliZvoncek();
    } catch (e) { /* skúsime pri ďalšej obnove */ }
    obnovuje = false;
  }

  // ------------------------------------------------------------ kostra stránky
  function vykresli() {
    if (!tabPovoleny(S.tab)) S.tab = "domov";
    if (S.tab !== "vzhlad" && S.vzhladDraft) { S.vzhladDraft = null; aplikujVzhlad(S.vzhlad); }
    var tabs = SEKCIE.filter(function (x) { return maSekciu(x[0]); }).map(function (x) { return x[0] === "provizie" && !admin() ? ["provizie", "Moje provízie", "euro"] : x; });
    if (admin()) tabs.push(["vykon", "Výkon", "vykon"], ["makleri", "Makléri", "makleri"], ["vzhlad", "Vzhľad", "farby"], ["historia", "História zmien", "historia"]);
    var aktualna = tabs.find(function (t) { return t[0] === S.tab; }) || ["domov", "Prehľad", "domov"];
    var menuHtml = menuDlazdice(tabs);
    document.body.classList.add("ma-bocne");
    $("#app").innerHTML =
      '<aside class="bocne" aria-label="Sekcie"><a class="bocne-logo" href="#" data-tab="domov" title="Prehľad"><img src="' + esc(logoUrl()) + '" alt="' + esc(nazovKancelarie()) + '"><span>Realitný týpek</span></a>' + menuHtml +
        '<div class="bocne-typek"><img src="typek-postava.png" alt="" width="64" height="72"><span><b>Realitný týpek</b></span></div></aside>' +
      '<header class="top"><div class="wrap">' +
      '<a class="brand" href="#" data-tab="domov" title="Hlavná obrazovka"><img src="' + esc(logoUrl()) + '" alt="' + esc(nazovKancelarie()) + '"><span class="brand-sub">Realitný<br>týpek</span></a>' +
      '<h1 class="hl-titul"><span class="menu-ik">' + ikona(aktualna[2]) + "</span>" + esc(aktualna[1]) + "</h1>" +
      '<button type="button" class="menu-btn" data-act="menu" aria-expanded="false" aria-controls="menu-sheet"><span class="menu-mriezka" aria-hidden="true"><i></i><i></i><i></i><i></i></span>' +
        '<b>' + esc(aktualna[1]) + '</b><span class="tab-n" data-chat-n hidden></span><span class="menu-btn-hint">Menu ▾</span></button>' +
      '<div class="user">' +
      '<span class="odhl" id="odhl" hidden title="Automatické odhlásenie pri nečinnosti – odpočet sa vynuluje pri každej vašej aktivite">⏱ <b id="odhl-cas"></b></span>' +
      '<button type="button" class="bell" data-act="zvoncek" id="zvon-btn" aria-label="Upozornenia a pripomienky">🔔<span class="badge" id="zvon-n" hidden></span></button>' +
      (S.hlavny ? '<a class="sz-prepni" href="sprava.html" title="Prepnúť do správy zákazníkov Realitného týpka">⇄ <span>Správa zákazníkov</span></a>' : "") +
      '<button type="button" class="heslo-btn" data-pomoc="heslo" title="Zmeniť heslo"><span aria-hidden="true">🔑</span><span class="heslo-btn-t">Zmeniť heslo</span></button>' +
      '<button type="button" class="me-btn" data-act="profil" title="Môj profil">' + avatar(S.me.id, 28) + '<span class="email">' + esc(S.me.meno || S.me.email) + (admin() ? " · admin" : "") + "</span></button>" +
      '<button type="button" class="theme-btn" data-act="tema" id="tema-btn"></button>' +
      '<button type="button" data-act="odhlasit" title="Odhlásiť" aria-label="Odhlásiť"><svg class="odhl-ik" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v8" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" fill="none"/><path d="M6.3 6.8a8 8 0 1 0 11.4 0" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" fill="none"/></svg><span class="odhl-txt">Odhlásiť</span></button></div>' +
      "</div>" + (S.tab === "inzeraty" ? '<div class="wrap stats" id="stats"></div>' : "") + "</header>" +
      '<div class="menu-sheet" id="menu-sheet" hidden><div class="menu-sheet-pozadie" data-act="menu-zavri"></div><div class="menu-sheet-panel" role="dialog" aria-label="Sekcie">' +
        '<div class="menu-sheet-hl"><b>Kam idete?</b><button type="button" class="menu-sheet-x" data-act="menu-zavri" aria-label="Zavrieť">×</button></div>' + menuHtml + "</div></div>" +
      '<div id="filters"></div><main><div class="wrap"><div id="pwd"></div><div id="zvon"></div><div id="obsah"></div></div></main>' +
      '<footer><div class="wrap" id="foot"></div></footer>';
    function klikMenu(e) {
      var t = e.target.closest("[data-tab]");
      if (t) {
        e.preventDefault();
        // klik na sekciu v hlavičke vráti na zoznam (nie na naposledy otvorený detail)
        if (t.dataset.tab === "nehnutelnosti" && !S.ponukaEdit) { S.ponukaDetail = null; S.ponukaExport = false; if (S.tab === "nehnutelnosti") { history.pushState({ tab: "nehnutelnosti" }, "", "#nehnutelnosti"); vykresliNehnutelnosti(); window.scrollTo(0, 0); return; } }
        if (t.dataset.tab === "provizie") S.provForm = null;
        if (t.dataset.tab === "historia" && S.tab === "historia") { vykresliHistoriu(); return; }
        if (t.dataset.tab === "klienti" && !S.dopytEdit) { S.dopytDetail = null; S.predDetail = null; if (S.tab === "klienti") { history.pushState({ tab: "klienti" }, "", "#klienti"); vykresliKlientov(); window.scrollTo(0, 0); return; } }
        prejdi(t.dataset.tab); return;
      }
      var pm = e.target.closest("[data-pomoc]");
      if (pm) { e.preventDefault(); pomoc(pm.dataset.pomoc); return; }
      var a = e.target.closest("[data-act]");
      if (!a) return;
      if (a.dataset.act === "menu") { otvorMenu(); return; }
      if (a.dataset.act === "menu-zavri") { zavriMenu(); return; }
      if (a.dataset.act === "odhlasit") odhlasit();
      if (a.dataset.act === "tema") prepniTemu();
      if (a.dataset.act === "profil" || a.dataset.act === "zvoncek") animPanel();
      if (a.dataset.act === "profil") { S.pwdOpen = !S.pwdOpen; vykresliHeslo(); if (S.pwdOpen) window.scrollTo({ top: 0, behavior: "smooth" }); }
      if (a.dataset.act === "zvoncek") { S.zvonOpen = !S.zvonOpen; S.pripForm = null; vykresliZvoncek(); if (S.zvonOpen) window.scrollTo({ top: 0, behavior: "smooth" }); }
      if (a.dataset.act === "preset") predvolba(a.dataset.v);
    }
    $("header.top").addEventListener("click", klikMenu);
    $(".bocne").addEventListener("click", klikMenu);
    $("#menu-sheet").addEventListener("click", function (e) { if (e.target.closest("[data-tab]")) zavriMenu(); klikMenu(e); });
    vykresliHeslo();
    vykresliZvoncek();
    popisTemy();
    popisZvoncek();
    popisChat();
    popisNovinky();
    tikOdpocet();
    document.body.setAttribute("data-anim", "");
    clearTimeout(S.animT); S.animT = setTimeout(function () { document.body.removeAttribute("data-anim"); }, 1200);
    if (S.tab === "inzeraty") vykresliFiltreInz();
    else if (S.tab === "schrankovanie") vykresliFiltreSch();
    else $("#filters").innerHTML = "";
    prekresliObsah();
  }

  // menu z dlaždíc – na počítači bočný panel, na mobile/tablete rozbaľovacia plocha
  var SKUPINY_MENU = [["Práca", ["domov", "inzeraty", "schrankovanie", "nehnutelnosti", "klienti", "kalendar", "provizie"]], ["Tím", ["chat", "matterport", "recenzie"]],
    ["Nástroje", ["mapa", "kataster", "asistent", "web"]], ["Správa", ["vykon", "makleri", "vzhlad", "historia"]]];
  function menuDlazdice(tabs) {
    var podla = { domov: ["domov", "Prehľad", "domov"] }; tabs.forEach(function (t) { podla[t[0]] = t; });
    return SKUPINY_MENU.map(function (g) {
      var pol = g[1].filter(function (k) { return podla[k]; });
      if (!pol.length) return "";
      return '<div class="menu-skup"><span class="menu-skup-n">' + g[0] + '</span><div class="menu-dl">' + pol.map(function (k) {
        var t = podla[k];
        return '<button type="button" class="dl-menu" data-tab="' + t[0] + '"' + (S.tab === t[0] ? ' aria-current="page"' : "") + '><span class="dl-menu-ik">' + ikona(t[2]) + "</span>" +
          "<span>" + esc(t[1]) + "</span>" + (t[0] === "chat" ? '<span class="tab-n" data-chat-n hidden></span>' : "") + "</button>";
      }).join("") + "</div></div>";
    }).join("") + '<div class="menu-skup menu-pomoc"><span class="menu-skup-n">Pomoc</span><div class="menu-dl">' +
      [["sprievodca", "Sprievodca aplikáciou", "🧭"], ["novinky", "Čo je nové", "✨"], ["heslo", "Zmeniť heslo", "🔑"]].map(function (x) {
        return '<button type="button" class="dl-menu" data-pomoc="' + x[0] + '"><span class="dl-menu-ik dl-menu-emoji" aria-hidden="true">' + x[2] + "</span><span>" + x[1] + "</span>" +
          (x[0] === "novinky" ? '<span class="tab-n" data-novinky-n hidden></span>' : "") + "</button>";
      }).join("") + "</div></div>" +
      (S.hlavny ? '<div class="menu-skup menu-sprava"><span class="menu-skup-n">Realitný týpek</span><div class="menu-dl">' +
        '<a class="dl-menu" href="sprava.html"><span class="dl-menu-ik dl-menu-emoji" aria-hidden="true">⇄</span><span>Správa zákazníkov</span></a></div></div>' : "");
  }
  function otvorMenu() {
    var m = $("#menu-sheet"); if (!m) return;
    m.hidden = false; document.body.classList.add("menu-otvorene");
    var b = $(".menu-btn"); if (b) b.setAttribute("aria-expanded", "true");
    var ak = m.querySelector('[aria-current="page"]') || m.querySelector(".dl-menu"); if (ak) ak.focus({ preventScroll: true });
  }
  function zavriMenu() {
    var m = $("#menu-sheet"); if (!m || m.hidden) return;
    m.hidden = true; document.body.classList.remove("menu-otvorene");
    var b = $(".menu-btn"); if (b) b.setAttribute("aria-expanded", "false");
  }
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") zavriMenu(); });
  function prekresliObsah() {
    if (S.tab === "inzeraty") { vykresliStaty(); vykresliZoznam(); }
    else if (S.tab === "schrankovanie") { if (!S.schEdit && !S.sidForm) vykresliSchrankovanie(); }
    else if (S.tab === "makleri") { var fo = document.activeElement, prazdne = !$("#obsah").children.length; if (prazdne || (!S.mkPohlad && !(fo && fo.closest && fo.closest("#obsah") && /INPUT|TEXTAREA|SELECT/.test(fo.tagName)))) vykresliMaklerov(); }
    else if (S.tab === "vykon") vykresliVykon();
    else if (S.tab === "domov") vykresliDomov();
    else if (S.tab === "nehnutelnosti") { if (!$(".ponuka-form") && !$(".ponuka-detail") && !$(".export")) vykresliNehnutelnosti(); }
    else if (S.tab === "klienti") { var fk = document.activeElement; if (!$(".dopyt-form") && !$(".dopyt-detail") && !$(".pred-detail") && !(fk && fk.closest && fk.closest("#obsah") && /INPUT|TEXTAREA|SELECT/.test(fk.tagName))) vykresliKlientov(); }
    else if (S.tab === "kalendar") { if (!S.kalForm && !(document.activeElement && document.activeElement.closest && document.activeElement.closest("#obsah"))) vykresliKalendar(); }
    else if (S.tab === "mapa") { if (!$("#realitna-mapa")) vykresliMapu(); else kresliRealitnuMapu(false, true); }
    else if (S.tab === "kataster") { if (!$("#kat-mapa")) vykresliKataster(); }
    else if (S.tab === "vzhlad") { if (!$(".vz-box")) vykresliVzhlad(); }
    else if (S.tab === "provizie") { if (!$(".prov-form") && !$(".prov-box")) vykresliProvizie(); }
    else if (S.tab === "historia") { if (!$(".hist-box")) vykresliHistoriu(); }
    else if (S.tab === "asistent") { if (!$("#ai-spravy")) vykresliAsistenta(); }
    else if (S.tab === "web") { if (!$(".web-box")) vykresliWeb(); }
    else if (S.tab === "recenzie") { if (!S.recForm) vykresliRecenzie(); }
    else if (S.tab === "chat") { if (!$("#chat-spravy")) vykresliChat(); else oznacPrecitane(); }
    else if (S.tab === "matterport") { if (!$(".mp-box") || (!S.mpOkno && !$("#mp-okno"))) vykresliMatterport(); }
    else if (S.mpOkno || $("#mp-okno")) { S.mpOkno = null; zavriMpOkno(); }
    var m = S.meta || {};
    $("#foot").innerHTML = '<p class="foot-info"></p>' + PRAVA;
    $("#foot .foot-info").textContent = (m.posledna_kontrola ? "Posledná kontrola portálov " + datum(m.posledna_kontrola, true) + ". " : "") +
      "Sleduje Bazoš, Nehnuteľnosti.sk, Reality.sk a TopReality.sk v okresoch Spišská Nová Ves a Levoča." +
      (m.chyby && m.chyby.length ? " Pri poslednej kontrole sa nepodarilo načítať: " + m.chyby.join("; ") : "");
  }

  function boxObce() {
    var obce = S.me.obce || [];
    return '<div class="box" id="box-obce"><h3>📍 Moje obce</h3><p class="meta">Obce, ktoré sledujete. Nové súkromné inzeráty z nich uvidíte na hlavnej obrazovke v časti Môj deň a v skeneri cez filter „Moje obce“.</p>' +
      '<div class="obce-chips">' + (obce.length ? obce.map(function (o) { return '<span class="chip-obec">' + esc(o) + '<button type="button" data-obec-x="' + esc(o) + '" aria-label="Odobrať ' + esc(o) + '">×</button></span>'; }).join("") : '<span class="meta">Zatiaľ žiadne.</span>') + "</div>" +
      '<div class="obce-pridat"><input type="text" id="obec-nova" list="dl-obce-profil" placeholder="Začnite písať obec…" autocomplete="off"><button class="btn" type="button" id="obec-pridat">Pridať</button></div>' +
      '<datalist id="dl-obce-profil">' + S.obce.map(function (o) { return '<option value="' + esc(o[0]) + '">'; }).join("") + "</datalist></div>";
  }
  async function ulozObce(obce) {
    try {
      await rpc("ulozit_moje_obce", { p_obce: obce }); S.me.obce = obce; await nacitajMaklerov();
      var b = $("#box-obce"); if (b) { b.outerHTML = boxObce(); napojObce(); }
      var bp = $("#box-push"); if (bp) { bp.outerHTML = boxUpozornenia(); napojUpozornenia(); }
      if (S.tab === "domov") vykresliDomov(); else if (S.tab === "inzeraty") vykresliFiltreInz();
    }
    catch (err) { toast(chybaText(err), true); }
  }
  function napojObce() {
    var b = $("#box-obce"); if (!b) return;
    function pridaj() {
      var v = $("#obec-nova").value.trim(), zn = S.obce.find(function (o) { return o[0].toLowerCase() === v.toLowerCase(); });
      if (!v) return;
      if (!zn) return toast("Takú obec v inzerátoch nepoznám – vyberte ju zo zoznamu.", true);
      var obce = (S.me.obce || []).slice(); if (obce.indexOf(zn[0]) < 0) obce.push(zn[0]);
      ulozObce(obce);
    }
    $("#obec-pridat").onclick = pridaj;
    $("#obec-nova").addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); pridaj(); } });
    b.querySelectorAll("[data-obec-x]").forEach(function (x) {
      x.onclick = function () { ulozObce((S.me.obce || []).filter(function (o) { return o !== x.dataset.obecX; })); };
    });
  }
  function ukazkaInzeratu() {
    return S.inz.find(function (z) { return z.typ === "byt" && z.izby && z.obec; }) || { typ: "byt", izby: 3, obec: "Spišská Nová Ves", cena: 135000, portal: "bazos" };
  }
  function formSms() {
    var text = S.me.sms_sablona || SMS_ZAKLAD;
    return '<form class="box" id="f-sms"><h3>💬 Text mojej SMS</h3>' +
      '<p class="meta">Tento text sa vloží do SMS po ťuknutí na „Poslať SMS“ pri inzeráte. Kúsky v zložených zátvorkách sa doplnia za údaje z inzerátu – kliknutím ich vložíte do textu. ' +
      'Slovo v tvare <b>{Videl|Videla}</b> sa doplní podľa rodu: prvé pre muža, druhé pre ženu.</p>' +
      '<div class="field sms-rod"><span>Som</span><div class="seg" role="group">' +
      [["muz", "Muž"], ["zena", "Žena"]].map(function (x) { return '<button type="button" data-rod="' + x[0] + '" aria-pressed="' + (rodMaklera(S.me) === x[0]) + '">' + x[1] + "</button>"; }).join("") + "</div></div>" +
      '<div class="sms-polia">' + SMS_POLIA.map(function (x) { return '<button type="button" class="btn ghost" data-sms-pole="' + x[0] + '">' + x[0] + " <small>" + x[1] + "</small></button>"; }).join("") + "</div>" +
      '<label class="field"><span>Text SMS</span><textarea id="sms-text" rows="4" maxlength="700">' + esc(text) + "</textarea></label>" +
      '<div class="sms-nahlad"><span class="meta">Ukážka pre inzerát:</span><div id="sms-nahlad"></div><small class="meta" id="sms-dlzka"></small></div>' +
      '<div class="form-actions"><button class="btn primary" type="submit">Uložiť text SMS</button>' +
      '<button class="btn ghost" type="button" id="sms-zaklad">Vrátiť pôvodný text</button></div></form>';
  }
  function obnovNahladSms() {
    var t = $("#sms-text"); if (!t) return;
    var v = vyplnSms(t.value || SMS_ZAKLAD, ukazkaInzeratu(), S.me);
    $("#sms-nahlad").textContent = v;
    $("#sms-dlzka").textContent = v.length + " znakov";
  }
  function napojFormSms() {
    var f = $("#f-sms"); if (!f) return;
    var t = $("#sms-text");
    t.addEventListener("input", obnovNahladSms);
    f.querySelectorAll("[data-sms-pole]").forEach(function (b) {
      b.onclick = function () {
        var z = t.selectionStart || t.value.length, k = t.selectionEnd || z, pole = b.dataset.smsPole;
        t.value = t.value.slice(0, z) + pole + t.value.slice(k); t.focus(); t.selectionStart = t.selectionEnd = z + pole.length; obnovNahladSms();
      };
    });
    $("#sms-zaklad").onclick = function () { t.value = SMS_ZAKLAD; obnovNahladSms(); };
    f.querySelectorAll("[data-rod]").forEach(function (b) {
      b.onclick = async function () {
        try {
          await rpc("nastavit_pohlavie", { p_id: S.me.id, p_pohlavie: b.dataset.rod });
          S.me.pohlavie = b.dataset.rod; await nacitajMaklerov();
          f.querySelectorAll("[data-rod]").forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); });
          obnovNahladSms();
        } catch (err) { toast(chybaText(err), true); }
      };
    });
    f.addEventListener("submit", async function (e) {
      e.preventDefault();
      var v = t.value.trim() === SMS_ZAKLAD ? "" : t.value;
      try {
        await rpc("ulozit_sms_sablonu", { p_text: v });
        S.me.sms_sablona = v.trim() || null;
        await nacitajMaklerov();
        toast("Text SMS je uložený.");
        if (S.tab === "inzeraty") vykresliZoznam();
      } catch (err) { toast(chybaText(err), true); }
    });
    obnovNahladSms();
  }
  function vykresliHeslo() {
    var el = $("#pwd");
    if (!el) return;
    if (!S.pwdOpen) { el.innerHTML = ""; return; }
    el.innerHTML = '<div class="box"><h3>Môj profil</h3>' + fotoVolba("ja", S.me.id) +
      '<div class="prof-odkazy"><button class="btn" type="button" data-prof="heslo">🔑 Zmeniť heslo</button><button class="btn" type="button" data-prof="sprievodca">🧭 Sprievodca</button>' +
        '<button class="btn" type="button" data-prof="novinky">✨ Čo je nové</button></div></div>' +
      '<form class="box heslo-box" id="f-pwd"><h3>🔑 Zmena hesla</h3><p class="meta">Nové heslo platí hneď. Ťuknutím na 👁 si ho skontrolujete.</p><div class="form-grid">' +
      '<label class="field"><span>Nové heslo (aspoň 8 znakov)</span><input type="password" id="pw1" minlength="8" autocomplete="new-password" required></label>' +
      '<label class="field"><span>Zopakujte heslo</span><input type="password" id="pw2" minlength="8" autocomplete="new-password" required></label></div>' +
      '<div class="form-actions"><button class="btn primary" type="submit">Uložiť nové heslo</button></div></form>' +
      '<form class="box" id="f-tel"><h3>📞 Môj telefón</h3><p class="meta">Zobrazí sa klientom na stránke ponuky, na letáku a v reporte pre majiteľa.</p>' +
      '<div class="form-grid"><label class="field"><span>Telefón</span><input id="moj-tel" type="tel" inputmode="tel" maxlength="30" value="' + esc(S.me.telefon || "") + '" placeholder="napr. 0905 123 456"></label></div>' +
      '<div class="form-actions"><button class="btn primary" type="submit">Uložiť telefón</button></div></form>' + boxUpozornenia() + boxObce() + formSms() + boxPlocha() +
      '<div class="box spr-znova"><img src="typek-hlava.png" alt="" width="48" height="48"><div><h3>🧭 Sprievodca aplikáciou</h3><p class="meta">Realitný týpek vás znova prevedie hlavnými časťami aplikácie.</p></div>' +
        '<button class="btn" type="button" id="spr-znova">Spustiť sprievodcu</button></div>' +
      '<div class="prof-zavriet"><button class="btn ghost" type="button" id="pw-x">Zavrieť profil</button></div>';
    pridajOko(el);
    $("#f-tel").addEventListener("submit", async function (e) {
      e.preventDefault();
      try { await rpc("ulozit_telefon_maklera", { p_id: S.me.id, p_telefon: $("#moj-tel").value }); S.me.telefon = $("#moj-tel").value.trim() || null; await nacitajMaklerov(); toast("📞 Telefón je uložený."); }
      catch (err) { toast(chybaText(err), true); }
    });
    napojFormSms();
    napojObce();
    napojUpozornenia();
    if ($("#plocha-btn")) $("#plocha-btn").onclick = async function () {
      instalacia.prompt(); await instalacia.userChoice.catch(function () {}); instalacia = null; vykresliHeslo();
    };
    $("#pw-x").onclick = function () { S.pwdOpen = false; vykresliHeslo(); };
    $("#spr-znova").onclick = function () { S.pwdOpen = false; vykresliHeslo(); window.scrollTo(0, 0); spustiSprievodcu(); };
    el.querySelectorAll("[data-prof]").forEach(function (b) { b.onclick = function () { pomoc(b.dataset.prof); }; });
    $("#f-pwd").addEventListener("submit", async function (e) {
      e.preventDefault();
      if ($("#pw1").value !== $("#pw2").value) return toast("Heslá sa nezhodujú.", true);
      var r = await sb.auth.updateUser({ password: $("#pw1").value });
      if (r.error) return toast(chybaText(r.error), true);
      S.pwdOpen = false; vykresliHeslo(); toast("🔑 Heslo je zmenené.");
    });
  }
  // otvorí profil priamo na zmene hesla
  function otvorHeslo() {
    zavriMenu(); S.zvonOpen = false; vykresliZvoncek();
    S.pwdOpen = true; vykresliHeslo();
    var f = $("#f-pwd"); if (!f) return;
    f.scrollIntoView({ behavior: "smooth", block: "center" });
    f.classList.add("zvyrazni"); setTimeout(function () { f.classList.remove("zvyrazni"); }, 2200);
    setTimeout(function () { var i = $("#pw1"); if (i) i.focus({ preventScroll: true }); }, 450);
  }
  // časť Pomoc v menu a v profile
  function pomoc(co) {
    if (co === "heslo") return otvorHeslo();
    zavriMenu();
    if (co === "sprievodca") { S.pwdOpen = false; vykresliHeslo(); window.scrollTo(0, 0); return spustiSprievodcu(); }
    if (co === "novinky") return ukazNovinky(S.novinky || [], false);
  }

  // ------------------------------------------------------------ INZERÁTY
  function vykresliFiltreInz() {
    var f = S.f;
    function seg(id, polozky) {
      return '<div class="seg" data-seg="' + id + '" role="group">' + polozky.map(function (p) {
        return '<button type="button" data-v="' + p[0] + '" aria-pressed="' + (f[id] === p[0]) + '">' + p[1] +
          (p[2] ? ' <span class="n" data-n="' + id + ":" + p[0] + '"></span>' : "") + "</button>";
      }).join("") + "</div>";
    }
    $("#filters").innerHTML = '<div class="filters"><div class="wrap">' +
      '<input type="search" id="q" placeholder="Hľadať v názve, obci, predajcovi…" aria-label="Hľadať" value="' + esc(f.q) + '">' +
      seg("praca", [["vsetky", "Všetky"], ["volne", "Voľné", 1], ["moje", "Moje", 1], ["prevzate", "Prevzaté", 1]]) +
      '<select id="f-kto" aria-label="Maklér"><option value="">👤 Všetci makléri</option>' + S.makleri.filter(function (m) { return m.aktivny; }).map(function (m) {
        return '<option value="' + m.id + '">' + esc(m.meno || m.email) + (m.id === S.me.id ? " (ja)" : "") + "</option>"; }).join("") + "</select>" +
      seg("predajca", [["vsetci", "Všetci", 1], ["sukr", "Súkromní", 1], ["rk", "RK", 1]]) +
      seg("typ", [["", "Všetko"], ["byt", "Byty"], ["dom", "Domy"], ["pozemok", "Pozemky"], ["chata", "Chaty"], ["garaz", "Garáže"]]) +
      '<select id="f-okres" aria-label="Okres alebo obec"><option value="">Oba okresy</option>' +
      '<option value="o:Spišská Nová Ves">Okres Spišská Nová Ves</option><option value="o:Levoča">Okres Levoča</option>' +
      ((S.me.obce || []).length ? '<option value="moje">📍 Moje obce (' + S.me.obce.length + ")</option>" : "") +
      '<optgroup label="Obec">' + S.obce.map(function (o) { return '<option value="' + esc(o[0]) + '">' + esc(o[0]) + " (" + o[1] + ")</option>"; }).join("") + "</optgroup></select>" +
      '<select id="f-stav" aria-label="Stav inzerátu"><option value="aktivne">Aktívne na portáloch</option><option value="zmiznute">Zmiznuté z portálov (archív)</option><option value="vsetky">Aktívne aj zmiznuté</option></select>' +
      '<select id="f-novost" aria-label="Vek inzerátu"><option value="">Kedykoľvek zverejnené</option>' +
      '<optgroup label="Nové v skeneri"><option value="1">Nové za 24 h</option><option value="3">Nové za 3 dni</option><option value="7">Nové za 7 dní</option></optgroup>' +
      '<optgroup label="Zverejnené na portáli"><option value="p30">Zverejnené do 30 dní</option><option value="p90">Zverejnené do 90 dní</option>' +
      '<option value="s30">Staršie ako 30 dní</option><option value="s60">Staršie ako 60 dní</option><option value="s90">Staršie ako 90 dní</option></optgroup></select>' +
      (S.canUnder ? '<label class="chk"><input type="checkbox" id="f-under"' + (f.under ? " checked" : "") + "> Len podhodnotené</label>" : "") +
      '<select id="f-sort" aria-label="Zoradiť"><option value="novy">Najnovšie</option>' +
      (S.canUnder ? '<option value="under">Najviac pod cenou</option>' : "") +
      '<option value="stare">Najdlhšie na portáli</option><option value="cena">Najlacnejšie</option><option value="cenam2">Najnižšia cena/m²</option><option value="hovor">Naposledy volané</option></select>' +
      "</div></div>";
    if (!S.canUnder) { f.under = false; if (f.sort === "under") f.sort = "novy"; }
    $("#f-okres").value = f.okres; if ($("#f-okres").value !== f.okres) f.okres = "";
    $("#f-kto").value = f.kto || ""; if ($("#f-kto").value !== (f.kto || "")) f.kto = "";
    $("#f-kto").onchange = function () { f.kto = this.value; S.shown = 100; ulozFiltre(); vykresliZoznam(); };
    if (f.novost === "30") f.novost = "p30";
    $("#f-novost").value = f.novost; if ($("#f-novost").value !== f.novost) f.novost = ""; $("#f-sort").value = f.sort; $("#f-stav").value = f.stav || "aktivne";
    var fl = $("#filters");
    fl.addEventListener("click", function (e) {
      var b = e.target.closest(".seg button"); if (!b) return;
      f[b.closest(".seg").dataset.seg] = b.dataset.v; S.shown = 100;
      fl.querySelectorAll(".seg").forEach(function (s) {
        s.querySelectorAll("button").forEach(function (x) { x.setAttribute("aria-pressed", String(x.dataset.v === f[s.dataset.seg])); });
      });
      ulozFiltre(); vykresliZoznam();
    });
    var t;
    $("#q").addEventListener("input", function () { var v = this.value; clearTimeout(t); t = setTimeout(function () { f.q = v; S.shown = 100; vykresliZoznam(); }, 150); });
    $("#f-okres").onchange = function () { f.okres = this.value; S.shown = 100; ulozFiltre(); vykresliZoznam(); };
    $("#f-novost").onchange = function () { f.novost = this.value; S.shown = 100; ulozFiltre(); vykresliZoznam(); };
    $("#f-stav").onchange = function () { f.stav = this.value; S.shown = 100; ulozFiltre(); vykresliStaty(); vykresliZoznam(); };
    $("#f-sort").onchange = function () { f.sort = this.value; ulozFiltre(); vykresliZoznam(); };
    if ($("#f-under")) $("#f-under").onchange = function () { f.under = this.checked; S.shown = 100; ulozFiltre(); vykresliZoznam(); };
  }

  function predvolba(v) {
    Object.assign(S.f, { predajca: "vsetci", typ: "", okres: "", novost: "", praca: "vsetky", under: false, sort: "novy", q: "" });
    if (v === "sukr") S.f.predajca = "sukr";
    if (v === "sukr24") { S.f.predajca = "sukr"; S.f.novost = "1"; }
    if (v === "moje") S.f.praca = "moje";
    if (v === "nove") S.f.novost = "1";
    if (v === "under") { S.f.under = true; S.f.sort = "under"; }
    S.shown = 100; ulozFiltre(); vykresliFiltreInz(); vykresliZoznam();
  }

  function viditelne() {
    // stav: aktívne (+ zmiznuté, s ktorými niekto pracuje) / len zmiznuté z portálov / všetky
    var stav = S.f.stav || "aktivne";
    return S.inz.filter(function (z) {
      if (stav === "vsetky") return true;
      if (stav === "zmiznute") return !z.aktivny;
      if (z.aktivny) return true;
      var p = S.prev[z.id];
      return p && (p.makler_id || p.pocet_hovorov > 0);
    });
  }

  function vykresliStaty() {
    var el = $("#stats"); if (!el) return;
    var vid = viditelne(), den = Date.now() - 864e5;
    var akt = vid.filter(function (z) { return z.aktivny; });
    var sukr = akt.filter(function (z) { return ptyp(z) !== "rk"; });
    var sukrVolne = sukr.filter(function (z) { return !(S.prev[z.id] && S.prev[z.id].makler_id); }).length;
    var moje = vid.filter(function (z) { return S.prev[z.id] && S.prev[z.id].makler_id === S.me.id; }).length;
    var nove = akt.filter(function (z) { return new Date(z.prvy_krat).getTime() > den; }).length;
    var sukr24 = sukr.filter(function (z) { return new Date(z.prvy_krat).getTime() > den; });
    var sukr24Volne = sukr24.filter(function (z) { return !(S.prev[z.id] && S.prev[z.id].makler_id); }).length;
    var h = '<button class="stat" type="button" data-act="preset" data-v="vsetky"><b>' + nf.format(akt.length) + "</b><small>Aktívne inzeráty</small></button>" +
      '<button class="stat gold" type="button" data-act="preset" data-v="sukr"><b>' + nf.format(sukr.length) + "</b><small>Súkromní · voľných " + nf.format(sukrVolne) + "</small></button>" +
      '<button class="stat gold" type="button" data-act="preset" data-v="sukr24"><b>' + nf.format(sukr24.length) + "</b><small>Súkromní za 24 h · voľných " + nf.format(sukr24Volne) + "</small></button>" +
      '<button class="stat" type="button" data-act="preset" data-v="moje"><b>' + nf.format(moje) + "</b><small>Moje inzeráty</small></button>" +
      '<button class="stat" type="button" data-act="preset" data-v="nove"><b>' + nf.format(nove) + "</b><small>Nové za 24 h</small></button>";
    if (S.canUnder) {
      var under = akt.filter(function (z) { return S.odh[z.id] && S.odh[z.id].podhodnotene; }).length;
      h += '<button class="stat" type="button" data-act="preset" data-v="under"><b>' + nf.format(under) + "</b><small>Podhodnotené</small></button>";
    }
    el.innerHTML = h;
    oznacStaty();
    if (document.body.hasAttribute("data-anim")) animujCisla(el);
  }
  // dlaždica hore ostane označená, kým platí jej výber (Súkromní, Moje, Nové…)
  function aktPredvolba() {
    var f = S.f;
    if (f.q || f.typ || f.okres || f.kto) return "";
    var pr = f.predajca || "vsetci", pc = f.praca || "vsetky", nv = f.novost || "", un = !!f.under;
    if (pr === "vsetci" && pc === "vsetky" && !nv && !un) return "vsetky";
    if (pr === "sukr" && pc === "vsetky" && !nv && !un) return "sukr";
    if (pr === "sukr" && pc === "vsetky" && nv === "1" && !un) return "sukr24";
    if (pr === "vsetci" && pc === "moje" && !nv && !un) return "moje";
    if (pr === "vsetci" && pc === "vsetky" && nv === "1" && !un) return "nove";
    if (pr === "vsetci" && pc === "vsetky" && !nv && un) return "under";
    return "";
  }
  function oznacStaty() {
    var el = $("#stats"); if (!el) return;
    var v = aktPredvolba();
    el.querySelectorAll('[data-act="preset"]').forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.v === v)); });
  }

  // kedy bol inzerát zverejnený na portáli (dátum z portálu, inak kedy ho skener prvýkrát videl)
  function zverejnene(z) {
    var t = new Date(z.prvy_krat).getTime();
    if (z.publikovane) { var p = new Date(z.publikovane + "T12:00:00").getTime(); if (p < t) t = p; }
    return t;
  }
  function dniNaPortali(z) { return Math.floor((Date.now() - zverejnene(z)) / 864e5); }
  function filtruj() {
    var f = S.f, q = norm(f.q).trim(), qd = /\d/.test(q) ? telCifry(q) : "", nv = f.novost || "", lim = /^\d+$/.test(nv) ? Date.now() - Number(nv) * 864e5 : 0, me = S.me.id;
    var vekDo = nv.charAt(0) === "p" ? Number(nv.slice(1)) : 0, vekNad = nv.charAt(0) === "s" ? Number(nv.slice(1)) : 0;
    var zaklad = viditelne(), pocty = {};
    if (S.jedenId) return { out: S.inz.filter(function (z) { return z.id === S.jedenId; }), pocty: pocty };
    function pridaj(k) { pocty[k] = (pocty[k] || 0) + 1; }
    var out = zaklad.filter(function (z) {
      var p = S.prev[z.id], maj = p && p.makler_id;
      var pt = ptyp(z);
      var okP = f.predajca === "vsetci" || (f.predajca === "sukr" ? pt !== "rk" : pt === "rk");
      var okPr = (f.praca === "vsetky" || (f.praca === "volne" && !maj) || (f.praca === "moje" && maj === me) || (f.praca === "prevzate" && maj)) && (!f.kto || maj === f.kto);
      var okIne = (!f.typ || z.typ === f.typ) &&
        (!f.okres || (f.okres === "moje" ? (S.me.obce || []).indexOf(z.obec) >= 0 : f.okres.indexOf("o:") === 0 ? z.okres === f.okres.slice(2) : z.obec === f.okres)) &&
        (!lim || new Date(z.prvy_krat).getTime() >= lim) &&
        (!vekDo || dniNaPortali(z) <= vekDo) && (!vekNad || dniNaPortali(z) > vekNad) &&
        (!f.under || (S.odh[z.id] && S.odh[z.id].podhodnotene)) &&
        (!q || z._t.indexOf(q) >= 0 || (qd.length >= 4 && S.tel[z.id] && telCifry(S.tel[z.id].telefon).indexOf(qd) >= 0));
      if (okIne && okPr) { pridaj("predajca:vsetci"); pridaj(pt !== "rk" ? "predajca:sukr" : "predajca:rk"); }
      if (okIne && okP) { if (!maj) pridaj("praca:volne"); if (maj === me) pridaj("praca:moje"); if (maj) pridaj("praca:prevzate"); }
      return okP && okPr && okIne;
    });
    var s = f.sort;
    out.sort(function (a, b) {
      if (s === "under") return ((S.odh[a.id] || {}).rozdiel_pct ?? 999) - ((S.odh[b.id] || {}).rozdiel_pct ?? 999);
      if (s === "cena") return (a.cena || 9e12) - (b.cena || 9e12);
      if (s === "cenam2") return (a.cena_m2 || 9e12) - (b.cena_m2 || 9e12);
      if (s === "stare") return zverejnene(a) - zverejnene(b);
      if (s === "hovor") return String((S.prev[b.id] || {}).posledny_hovor || "").localeCompare(String((S.prev[a.id] || {}).posledny_hovor || ""));
      return String(b.prvy_krat).localeCompare(String(a.prvy_krat)) || String(b.publikovane || "").localeCompare(String(a.publikovane || ""));
    });
    return { out: out, pocty: pocty };
  }


  // ---------- stav skenera: upozornenie, keď portály dlho nekontroloval, a oprava kľúča (admin)
  var GH_REPO = "https://github.com/Martin3927/realitny-skener";
  function skenerStoji() {
    var m = S.meta || {}, t = m.posledna_kontrola ? new Date(m.posledna_kontrola).getTime() : 0;
    if (!t) return null;
    var hod = new Date().getHours(), vek = (Date.now() - t) / 36e5;
    return vek > (hod >= 8 && hod <= 22 ? 3 : 7) ? vek : null;
  }
  function vekText(h) { return h >= 48 ? Math.floor(h / 24) + " dni" : h >= 24 ? "viac ako deň" : Math.round(h) + " h"; }
  function bannerSkenera() {
    var m = S.meta || {}, vek = skenerStoji(), chyby = m.chyby || [];
    if (!vek && !chyby.length && !S.skOprava) return "";
    var h = "";
    if (vek || chyby.length) h += '<div class="sk-stav' + (vek ? " zle" : "") + '" role="status"><span>' + (vek ?
      "⚠️ <b>Skener " + vekText(vek) + " nekontroloval portály</b> – nové inzeráty sa teraz neobjavujú. Posledná kontrola " + datum(m.posledna_kontrola, true) + "." + (admin() ? "" : " Dajte vedieť administrátorovi.") :
      "⚠️ Pri poslednej kontrole sa nepodarilo načítať: " + esc(chyby.join("; ")) + ". Ostatné portály bežia normálne.") + "</span>" +
      (admin() ? '<button class="btn" type="button" data-sk="oprav">🔧 Opraviť skener</button>' : "") + "</div>";
    if (S.skOprava && admin()) h += '<div class="box sk-oprava"><div class="vykon-hlava"><h3>🔧 Oprava skenera</h3><button class="btn ghost" type="button" data-sk="zavri">Zavrieť</button></div>' +
      '<p class="meta">Skener beží na GitHube cez deň každých 30 minút (v noci plná kontrola) a do databázy sa prihlasuje tajným kľúčom. Keď kľúč na GitHube nesedí s databázou, každá kontrola zlyhá. Oprava trvá 2 minúty:</p>' +
      '<ol class="sk-kroky"><li><b>Vytvorte nový kľúč</b> a skopírujte ho.<div class="pd-odkaz">' +
        (S.skKluc ? '<input type="text" readonly value="' + esc(S.skKluc) + '" aria-label="Nový kľúč skenera"><button class="btn primary" type="button" data-sk="kopiruj">Kopírovať kľúč</button>' :
          '<button class="btn primary" type="button" data-sk="novy">Vytvoriť nový kľúč</button>') + "</div>" +
        (S.skKluc ? '<p class="meta">Kľúč sa zobrazí len teraz – v databáze je uložený iba jeho odtlačok. Do chatu ani emailu ho neposielajte.</p>' : '<p class="meta">Starý kľúč tým prestane platiť.</p>') + "</li>" +
      '<li><b>Vložte ho do GitHubu:</b> <a href="' + GH_REPO + '/settings/secrets/actions" target="_blank" rel="noopener">Settings → Secrets and variables → Actions</a> → pri <code>SKENER_KLUC</code> ✏️ → vložiť → <i>Update secret</i>.</li>' +
      '<li><b>Spustite kontrolu:</b> <a href="' + GH_REPO + '/actions/workflows/skener.yml" target="_blank" rel="noopener">Actions → Realitný skener</a> → <i>Run workflow</i>. O 5–10 minút sa tu objaví nová kontrola a upozornenie zmizne.</li></ol></div>';
    return h;
  }
  function napojBannerSkenera(el) {
    el.querySelectorAll("[data-sk]").forEach(function (b) {
      b.onclick = async function () {
        var a = b.dataset.sk;
        if (a === "oprav") { S.skOprava = true; vykresliZoznam(); return; }
        if (a === "zavri") { S.skOprava = false; S.skKluc = null; vykresliZoznam(); return; }
        if (a === "kopiruj") return kopiruj(S.skKluc, "Kľúč je skopírovaný – vložte ho do GitHubu.");
        if (a === "novy") {
          if (!confirm2("Vytvoriť nový kľúč skenera? Starý prestane platiť a skener pôjde, až keď nový vložíte do GitHubu.")) return;
          try { S.skKluc = await rpc("skener_novy_kluc", {}); vykresliZoznam(); toast("🔑 Nový kľúč je pripravený."); }
          catch (err) { toast(chybaText(err), true); }
        }
      };
    });
  }
  function vykresliZoznam() {
    oznacStaty();
    var el = $("#obsah"); if (!el) return;
    if (!S.jedenId && pozera()) inzeratyVidene();
    var r = filtruj(), out = r.out;
    document.querySelectorAll("[data-n]").forEach(function (n) { n.textContent = nf.format(r.pocty[n.dataset.n] || 0); });
    var h = bannerSkenera() + (S.jedenId ? '<div class="note" style="margin-bottom:10px">Zobrazený je jeden inzerát. <button class="btn" type="button" id="vsetky-inz">Zobraziť všetky inzeráty</button></div>' : "");
    h += '<div class="bar"><span>' + nf.format(out.length) + (out.length === 1 ? " inzerát" : out.length > 1 && out.length < 5 ? " inzeráty" : " inzerátov") + "</span>" +
      (S.canUnder ? "<span>Porovnanie: cena/m² oproti mediánu podobných aktuálnych ponúk</span>" : "") + "</div>";
    h += out.length ? '<div class="list" id="list">' + out.slice(0, S.shown).map(karta).join("") + "</div>" :
      '<div class="empty">Nič nezodpovedá filtrom. Skúste „Všetky“ a „Všetci“ alebo zrušte obmedzenie času.</div>';
    if (out.length > S.shown) h += '<button class="btn more" type="button" id="more">Zobraziť ďalšie (zostáva ' + nf.format(out.length - S.shown) + ")</button>";
    el.innerHTML = h;
    napojBannerSkenera(el);
    if ($("#more")) $("#more").onclick = function () { S.shown += 100; vykresliZoznam(); };
    if ($("#vsetky-inz")) $("#vsetky-inz").onclick = function () { S.jedenId = null; history.replaceState({ tab: "inzeraty" }, "", "#inzeraty"); vykresliZoznam(); };
  }

  function stavPrace(p) {
    if (!p || (!p.makler_id && !p.pocet_hovorov)) return '<span class="status free">Voľný – nikto nevolal</span>';
    if (p.posledny_vysledok) {
      return '<span class="status ' + (VYSLEDOK_TRIEDA[p.posledny_vysledok] || "called") + '">Volané: ' + esc(p.posledny_vysledok) +
        " · " + datum(p.posledny_hovor, true) + (p.pocet_hovorov > 1 ? " · " + p.pocet_hovorov + "×" : "") + "</span>";
    }
    return '<span class="status">Prevzaté, zatiaľ nevolané</span>';
  }

  function telRiadok(z) {
    if (ptyp(z) === "rk") return "";
    var t = S.tel[z.id];
    if (!t) return '<div class="tel-row"><button class="btn-link" type="button" data-act="tel">＋ Telefón predajcu</button></div>';
    return '<div class="tel-row">📞 ' + telOdkaz(t.telefon) +
      '<small>' + (t.zdroj === "text" ? "z textu inzerátu" : "zadal " + esc(meno(t.zadal)) + " " + datum(t.zadane)) + "</small>" +
      '<button class="btn-link" type="button" data-act="tel">upraviť</button></div>';
  }
  function tvarInz(n) { return n === 1 ? "inzerát" : n >= 2 && n <= 4 ? "inzeráty" : "inzerátov"; }
  function popisKontaktu(x) {
    if (!x) return "";
    if (x.typ === "hovor") return x.vysledok || "hovor";
    return x.typ === "sms" ? "SMS" : x.typ === "email" ? "email" : x.typ;
  }
  // na karte v skeneri: ten istý človek už inzeroval, niekto mu volal, alebo je pri ňom poznámka / „nevolať“
  function predRiadok(z) {
    if (ptyp(z) === "rk" || !S.predInz) return "";
    var k = S.predInz[z.id]; if (!k) return "";
    var ine = k.inzeraty.filter(function (x) { return x.id !== z.id; });
    var pk = k.posledny_kontakt, cudziKontakt = pk && pk.inzerat_id !== z.id;
    if (!ine.length && !k.nevolat && !k.poznamka && !k.asi_rk && !cudziKontakt) return "";
    var casti = [];
    if (ine.length) casti.push("má ešte " + ine.length + " " + tvarInz(ine.length) + (k.pocet - k.aktivnych ? " (aj zmiznuté z portálu)" : ""));
    if (cudziKontakt) casti.push("naposledy " + esc(meno(pk.makler_id)) + " " + datum(pk.vytvorene) + ": " + esc(popisKontaktu(pk)));
    if (k.poznamka) casti.push("„" + esc(k.poznamka.length > 80 ? k.poznamka.slice(0, 80) + "…" : k.poznamka) + "“");
    return '<div class="pred-row' + (k.nevolat ? " nevolat" : "") + '"><span>' + (k.nevolat ? "🚫 <b>Nevolať</b>" : "📇 <b>Známy predajca" + (k.meno ? " · " + esc(k.meno) : "") + "</b>") +
      (k.asi_rk ? ' <span class="chip maybe">veľa inzerátov – možno realitka</span>' : "") + (casti.length ? " – " + casti.join(" · ") : "") + "</span>" +
      '<button class="btn-link" type="button" data-pred-otvor="' + esc(k.tel) + '">Celá história ›</button></div>';
  }
  function formTelefon(z) {
    var t = S.tel[z.id];
    return '<form class="panel" data-form="tel"><h4>Telefón predajcu</h4>' +
      '<label class="field"><span>Číslo (napr. z portálu po kliknutí na „zobraziť číslo“)</span><input type="tel" name="telefon" inputmode="tel" autocomplete="off" value="' + esc(t ? t.telefon : "") + '" placeholder="0905 123 456"></label>' +
      '<div class="form-actions"><button class="btn primary" type="submit">Uložiť</button>' +
      (t ? '<button class="btn ghost" type="button" data-act="tel-zmaz">Vymazať číslo</button>' : "") +
      '<button class="btn ghost" type="button" data-act="zavriet">Zrušiť</button></div>' +
      '<small class="meta">Ukladá sa len pri súkromných inzerátoch. Ak predajca požiada, číslo vymažte.</small></form>';
  }
  function karta(z) {
    var p = S.prev[z.id] || null, maj = p && p.makler_id, moj = maj === S.me.id;
    var mozeUpravit = moj || admin() || !maj;
    var ozn = S.ozn[z.id], pr = PRED[ptyp(z)] || ["?", "rk"];
    var o = S.canUnder ? S.odh[z.id] : null;
    var nove = Date.now() - new Date(z.prvy_krat).getTime() < 864e5;
    var hist = z.historia_cien || [];
    var znizena = hist.length > 1 && hist[hist.length - 1][1] < hist[hist.length - 2][1];

    var odkazy = '<a href="' + esc(z.url) + '" target="_blank" rel="noopener">' + PORTAL[z.portal] + "</a>";
    (z.dalsie_odkazy || []).forEach(function (x) { odkazy += '<a href="' + esc(x[1]) + '" target="_blank" rel="noopener">' + (PORTAL[x[0]] || x[0]) + "</a>"; });
    var foto = z.foto ? '<img class="thumb" loading="lazy" referrerpolicy="no-referrer" alt="" src="' + esc(z.foto) + '" onerror="this.replaceWith(Object.assign(document.createElement(\'div\'),{className:\'thumb\',textContent:\'' + TYP[z.typ] + '\'}))">' :
      '<div class="thumb">' + (TYP[z.typ] || "") + "</div>";
    var delta = "";
    if (S.canUnder) {
      delta = o && o.rozdiel_pct != null ?
        '<span class="delta ' + (o.podhodnotene ? "lo" : "na") + '">' + (o.rozdiel_pct > 0 ? "+" : "") + Math.round(o.rozdiel_pct) + " % oproti mediánu" +
        "<small>" + esc(o.skupina) + " · medián " + nf.format(Math.round(o.median)) + " " + esc(o.jednotka) + " · " + o.n + " ponúk</small></span>" :
        '<span class="delta na"><small>Málo údajov na porovnanie</small></span>';
    }

    var mojePrip = mojeAktivne().filter(function (x) { return x.inzerat_id === z.id; });
    var h = '<article class="card' + (o && o.podhodnotene ? " under" : "") + (moj ? " mine" : maj ? " taken" : "") + '" data-id="' + esc(z.id) + '">' +
      (maj ? '<div class="claim-bar ' + (moj ? "claim-mine" : "claim-other") + '">' + avatar(maj, 26) +
        '<span class="claim-text">' + (moj ? "<b>VÁŠ INZERÁT</b>" : "PREVZAL <b>" + esc(meno(maj).toUpperCase()) + "</b>") +
        (p.prevzate ? '<small>od ' + datum(p.prevzate) + "</small>" : "") + "</span>" +
        (!moj ? '<span class="claim-lock">Nevolajte – rieši ho kolega</span>' : "") + "</div>" : "") +
      '<div class="row"><a class="thumb-link" href="' + esc(z.url) + '" target="_blank" rel="noopener" aria-label="Otvoriť inzerát">' + foto + '</a><div class="body">' +
      '<a class="title" href="' + esc(z.url) + '" target="_blank" rel="noopener">' + esc(z.nazov) + "</a>" +
      '<div class="meta"><span>' + (TYP[z.typ] || "") + (z.izby ? ", " + z.izby + "-izb." : "") + "</span><span>" + esc(z.obec || "okres " + z.okres) + "</span>" +
      (z.plocha ? "<span>" + nf.format(z.plocha) + " m²</span>" : "") + (dniNaPortali(z) - Math.floor((Date.now() - new Date(z.prvy_krat).getTime()) / 864e5) >= 2 ?
        '<span title="Zverejnené ' + datum(new Date(zverejnene(z)).toISOString()) + ", v skeneri " + ago(z.prvy_krat) + '">na portáli ' + dniNaPortali(z) + (dniNaPortali(z) <= 4 ? " dni" : " dní") + "</span>" : "<span>v skeneri " + ago(z.prvy_krat) + "</span>") + "</div>" +
      telRiadok(z) + predRiadok(z) +
      '<div class="pills">' + (nove ? '<span class="pill new">Nové</span>' : "") + (!z.aktivny ? '<span class="pill gone">Zmizol z portálu · naposledy ' + datum(z.naposledy) + "</span>" : "") +
      '<span class="pill ' + pr[1] + '" title="' + esc(ozn ? "Ručne označil " + meno(ozn.oznacil) + " " + datum(ozn.oznacene) : z.predajca_dovod || "") + '">' + pr[0] + (z.predajca ? " · " + esc(z.predajca) : "") + "</span>" +
      (ozn ? '<span class="pill rk">Označil ' + esc(meno(ozn.oznacil)) + "</span>" : "") +
      (o && o.podhodnotene ? '<span class="pill priv">Pod cenou</span>' : "") +
      (znizena ? '<span class="pill priv">Znížená cena z ' + eur(hist[hist.length - 2][1]) + "</span>" : "") + "</div>" +
      '<div class="links">' + odkazy + katasterTlacidlo(z) + "</div></div>" +
      '<div class="price"><b>' + eur(z.cena) + "</b>" + (z.cena_m2 && z.typ !== "garaz" ? '<span class="m2">' + m2(z.cena_m2) + " €/m²</span>" : "") + delta + "</div></div>";

    // pracovný pás
    h += '<div class="work"><div class="owner">' + (maj ? avatar(maj, 24) + '<span class="who">' + esc(moj ? "Vy" : meno(maj)) + "</span>" : "") + stavPrace(p) + "</div>";
    var znacky = [];
    if (p && p.sms) znacky.push('<span class="ok">✓ SMS</span> ' + esc(meno(p.sms_kto)) + " " + datum(p.sms));
    if (p && p.email) znacky.push('<span class="ok">✓ Email</span> ' + esc(meno(p.email_kto)) + " " + datum(p.email));
    mojePrip.slice(0, 2).forEach(function (x) { znacky.push('<span class="' + (new Date(x.cas) <= new Date() ? "due" : "ok") + '">' + (DRUH_IKONA[x.druh] || "🔔") + " " + datum(x.cas, true) + "</span>" + (x.poznamka ? " " + esc(x.poznamka) : "")); });
    var uvol = maj && (moj || admin()) ? casUvolnenia(z) : null;
    if (uvol) {
      var zostava = uvol.getTime() - Date.now();
      znacky.push('<span class="odpocet ' + (zostava < 3 * 3600e3 ? "due" : "wait") + '" data-uvol="' + uvol.getTime() + '" title="Prevzatý inzerát sa uvoľní, ak sa pri ňom 24 hodín nič nezapíše. Odpočet začne znova po zápise hovoru, SMS alebo emailu; zastaví ho budúca pripomienka alebo dohodnuté stretnutie.">⏳ <b>' +
        textOdpoctu(zostava) + "</b></span>" + (moj ? " do uvoľnenia, ak nič nezapíšete" : " do uvoľnenia"));
    }
    if (mojePrip.length > 2) znacky.push("🔔 +" + (mojePrip.length - 2) + " ďalšie");
    if (znacky.length) h += '<div class="marks">' + znacky.join(" · ") + "</div>";
    h += '<div class="actions">';
    if (!maj) h += '<button class="btn primary" type="button" data-act="prevziat">Prevziať</button>';
    if (mozeUpravit) {
      if (S.tel[z.id] && ptyp(z) !== "rk" && !(S.predInz && S.predInz[z.id] && S.predInz[z.id].nevolat)) h += '<a class="btn sms-btn" href="' + esc(smsOdkaz(z)) + '" data-act="sms-posli">💬 Poslať SMS</a>';
      h += '<button class="btn" type="button" data-act="hovor">Zapísať hovor</button>' +
        '<button class="btn' + (p && p.sms ? " on" : "") + '" type="button" data-act="sms">' + (p && p.sms ? "✓ SMS poslaná" : "SMS poslaná") + "</button>" +
        '<button class="btn' + (p && p.email ? " on" : "") + '" type="button" data-act="email">' + (p && p.email ? "✓ Email poslaný" : "Email poslaný") + "</button>";
    }
    h += '<button class="btn ghost" type="button" data-act="zvon" title="Nastaviť pripomienku">🔔 Pripomenúť</button>';
    if (ptyp(z) !== "rk" && (moj || admin())) h += '<button class="btn ghost" type="button" data-act="do-ponuky" title="Preniesť do Nehnuteľností – predvyplní formulár">➕ Do ponuky</button>';
    if (ozn && ozn.predajca_typ === "rk") h += '<button class="btn ghost" type="button" data-act="oznac-zrus" title="Vrátiť rozpoznanie skenera">Nie je RK</button>';
    else if (ptyp(z) !== "rk") h += '<button class="btn ghost" type="button" data-act="oznac-rk" title="Presunúť medzi realitné kancelárie – platí aj pre ďalšie inzeráty s rovnakým číslom">Je to RK</button>';
    h += '<button class="btn ghost" type="button" data-act="detail">Detail</button>';
    h += '<button class="btn ghost" type="button" data-act="hist">História</button>';
    if (maj && (moj || admin())) h += '<button class="btn ghost" type="button" data-act="uvolnit">Uvoľniť</button>';
    if (admin()) {
      h += '<select data-act="presun" aria-label="Presunúť na makléra"><option value="">Presunúť na…</option>' +
        (maj ? '<option value="__volny">— voľný —</option>' : "") +
        S.makleri.filter(function (m) { return m.aktivny && m.id !== maj; }).map(function (m) {
          return '<option value="' + m.id + '">' + esc(m.meno || m.email) + "</option>";
        }).join("") + "</select>";
    }
    h += "</div>";
    if (p && p.posledna_poznamka) h += '<div class="note">' + esc(p.posledna_poznamka) + " <small>– " + esc(meno(p.makler_id)) + "</small></div>";
    h += "</div>";

    var otv = S.open[z.id];
    if (otv === "zvon") h += '<div class="panel">' + formPripomienka({ inzerat_id: z.id }) + "</div>";
    if (otv === "detail") h += detailPanel(z);
    if (otv === "tel" && ptyp(z) !== "rk") h += formTelefon(z);
    if (otv === "hovor" && mozeUpravit) {
      h += '<form class="panel" data-form="hovor"><h4>Ako dopadol hovor</h4><div class="form-grid">' +
        '<label class="field"><span>Výsledok</span><select name="vysledok" required><option value="">Vyberte…</option>' +
        VYSLEDKY.map(function (v) { return "<option>" + esc(v) + "</option>"; }).join("") + "</select></label></div>" +
        (ptyp(z) !== "rk" && !S.tel[z.id] ? '<label class="field"><span>Telefón predajcu <small class="meta">aby sa uložil medzi Predávajúcich v Klientoch</small></span><input type="tel" name="telefon" inputmode="tel" autocomplete="off" placeholder="0905 123 456"></label>' : "") +
        '<label class="field"><span>Poznámka (čo povedal, kedy znova volať…)</span><textarea name="poznamka" rows="2"></textarea></label>' +
        '<div class="form-actions"><button class="btn primary" type="submit">Uložiť hovor</button><button class="btn ghost" type="button" data-act="zavriet">Zrušiť</button></div>' +
        (!maj ? '<small class="meta">Uložením hovoru si inzerát prevezmete.</small>' : "") + "</form>";
    }
    if (otv === "hist") {
      var a = S.hist[z.id];
      h += '<div class="panel"><h4>História</h4>' + (!a ? '<div class="meta">Načítavam…</div>' : !a.length ? '<div class="meta">Zatiaľ s inzerátom nikto nepracoval.</div>' :
        '<div class="history">' + a.map(function (x) {
          return "<div><time>" + datum(x.vytvorene, true) + '</time><span class="h-row">' + avatar(x.makler_id, 20) + "<span><b>" + esc(meno(x.makler_id)) + "</b> " + popisAktivity(x) + "</span></span></div>";
        }).join("") + "</div>") + (hist.length > 1 ? '<h4>Vývoj ceny</h4><div class="meta">' + hist.map(function (x) { return datum(x[0]) + ": " + eur(x[1]); }).join(" → ") + "</div>" : "") + "</div>";
    }
    return h + "</article>";
  }

  function fotoUrl(cesta) { return CFG.supabaseUrl + "/storage/v1/object/public/archiv/" + cesta; }
  // ---------- uložený archív inzerátu (text, parametre, fotky, staršie znenia) – ostane aj po zmazaní z portálu
  function riadkyParametrov(par) {
    var riadky = [];
    par = par || {};
    if (Array.isArray(par.vlastnosti)) riadky = par.vlastnosti.slice();
    Object.keys(par).forEach(function (k) {
      var v = par[k];
      if (k === "vlastnosti" || k === "Videlo" || v == null || v === "" || typeof v === "object" || typeof v === "boolean") return;
      riadky.push(k.charAt(0).toUpperCase() + k.slice(1) + ": " + v);
    });
    return riadky;
  }
  function textNaKopirovanie(id) {
    var a = S.arch[id] || {}, z = (S.inz || []).find(function (x) { return x.id === id; }) || (S.predInz && S.predInz[id] && S.predInz[id].inzeraty.find(function (x) { return x.id === id; })) || {};
    return [z.nazov, (z.cena ? eur(z.cena) : ""), riadkyParametrov(a.parametre).join("\n"), a.popis || z.popis || "", z.url ? "Zdroj: " + z.url : ""]
      .filter(function (x) { return x && String(x).trim(); }).join("\n\n");
  }
  function archivHistoria(a) {
    var hs = (a && a.historia) || [];
    if (!hs.length) return "";
    return '<details class="arch-hist"><summary>Predchádzajúce znenie textu (' + hs.length + ")</summary>" + hs.map(function (x) {
      return '<div class="arch-ver"><div class="meta">platilo do ' + datum(x.do, true) + '</div><div class="d-popis">' + esc(x.popis || "") + "</div></div>";
    }).join("") + "</details>";
  }
  async function nacitajArchivy(ids) {
    var chyba = ids.filter(function (id) { return !(id in S.arch); });
    if (!chyba.length) return false;
    var r = await sb.from("archiv").select("*").in("inzerat_id", chyba);
    if (r.error) throw r.error;
    chyba.forEach(function (id) { S.arch[id] = null; });
    (r.data || []).forEach(function (a) { S.arch[a.inzerat_id] = a; });
    return true;
  }
  document.addEventListener("click", function (e) {
    var b = e.target.closest("[data-kopiruj-text]"); if (!b) return;
    e.preventDefault(); kopiruj(textNaKopirovanie(b.dataset.kopirujText), "📋 Text inzerátu je skopírovaný.");
  });
  function detailPanel(z) {
    var h = '<div class="panel detail">';
    if (!(z.id in S.arch)) return h + '<div class="meta">Načítavam uložené údaje…</div></div>';
    var a = S.arch[z.id], hist = z.historia_cien || [];
    var fotky = a ? (a.fotky.length ? a.fotky.map(fotoUrl) : z.aktivny ? a.fotky_portal.slice(0, 10) : []) : [];
    h += '<div class="meta">V skeneri od ' + datum(z.prvy_krat, true) + " · " + (z.aktivny ? "na portáli aktívny" : "<b>z portálu zmizol</b>, naposledy videný " + datum(z.naposledy)) +
      (a ? " · uložené " + datum(a.ulozene) + (a.fotky.length ? " s " + a.fotky.length + " fotkami" : "") : "") + "</div>";
    if (fotky.length) h += '<div class="d-fotky">' + fotky.map(function (u) { return '<a href="' + esc(u) + '" target="_blank" rel="noopener"><img loading="lazy" referrerpolicy="no-referrer" src="' + esc(u) + '" alt=""></a>'; }).join("") + "</div>";
    var tt = telefon(z);
    if (tt) h += '<div class="d-tel">📞 ' + telOdkaz(tt.telefon) + " <small>" + (tt.zdroj === "text" ? "z textu inzerátu" : "zadal " + esc(meno(tt.zadal))) + "</small></div>";
    var riadky = riadkyParametrov(a && a.parametre);
    if (riadky.length) h += '<div class="d-par">' + riadky.map(function (r) { return "<span>" + esc(r) + "</span>"; }).join("") + "</div>";
    var popis = (a && a.popis) || z.popis;
    if (popis) h += '<div class="d-popis">' + esc(popis) + '</div><div class="arch-akcie"><button class="btn ghost" type="button" data-kopiruj-text="' + esc(z.id) + '">📋 Kopírovať text</button></div>';
    h += archivHistoria(a);
    if (!a) h += '<div class="meta">Celý popis a fotky skener ešte neuložil – urobí to pri najbližšej kontrole portálov.</div>';
    if (hist.length > 1) h += '<div class="meta">Vývoj ceny: ' + hist.map(function (x) { return datum(x[0]) + " " + eur(x[1]); }).join(" → ") + "</div>";
    return h + "</div>";
  }

  function popisAktivity(x) {
    switch (x.typ) {
      case "prevzatie": return "prevzal inzerát";
      case "uvolnenie": return "uvoľnil inzerát" + (x.poznamka ? " (" + esc(x.poznamka) + ")" : "");
      case "presun": return "presunul: " + esc(x.poznamka || "");
      case "hovor": return "volal – <b>" + esc(x.vysledok) + "</b>" + (x.poznamka ? ": " + esc(x.poznamka) : "");
      case "sms": return "poslal SMS";
      case "email": return "poslal email";
      case "sms_zrusena": return "zrušil označenie SMS";
      case "email_zruseny": return "zrušil označenie emailu";
      default: return esc(x.typ);
    }
  }

  async function nacitajHistoriu(id) {
    var r = await sb.from("aktivity").select("*").eq("inzerat_id", id).order("vytvorene", { ascending: false }).limit(100);
    S.hist[id] = r.error ? [] : r.data;
  }

  function prekresliKartu(id) {
    var stara = document.querySelector('.card[data-id="' + CSS.escape(id) + '"]');
    var z = S.inz.find(function (x) { return x.id === id; });
    if (!stara || !z) return vykresliZoznam();
    var t = document.createElement("div"); t.innerHTML = karta(z);
    stara.replaceWith(t.firstElementChild);
    vykresliStaty();
  }

  async function akcia(id, fn) {
    try { await fn(); await nacitajPrevzatia(); if (S.open[id] === "hist") await nacitajHistoriu(id); nacitajPredajcov().catch(function () {}); }
    catch (e) { toast(chybaText(e), true); await nacitajPrevzatia().catch(function () {}); }
    prekresliKartu(id);
  }

  document.addEventListener("click", async function (e) {
    var b = e.target.closest("#obsah .card [data-act]");
    if (!b || b.tagName === "SELECT") return;
    var id = b.closest(".card").dataset.id, act = b.dataset.act, p = S.prev[id];
    if (["zvon", "detail", "hovor", "hist", "tel"].indexOf(act) >= 0 && S.open[id] !== act) animPanel();
    if (act === "prevziat") return akcia(id, async function () { await rpc("prevziat", { p_inzerat: id }); toast("Inzerát je váš."); });
    if (act === "uvolnit") return akcia(id, async function () { await rpc("uvolnit", { p_inzerat: id }); toast("Inzerát je znova voľný."); });
    if (act === "sms" || act === "email") {
      var stav = !(p && p[act]);
      return akcia(id, async function () { await rpc("oznacit_kontakt", { p_inzerat: id, p_typ: act, p_stav: stav }); });
    }
    if (act === "zvon") { S.open[id] = S.open[id] === "zvon" ? null : "zvon"; return prekresliKartu(id); }
    if (act === "detail") {
      if (S.open[id] === "detail") { S.open[id] = null; return prekresliKartu(id); }
      S.open[id] = "detail"; prekresliKartu(id);
      if (!(id in S.arch)) {
        var ra = await sb.from("archiv").select("*").eq("inzerat_id", id).maybeSingle();
        S.arch[id] = ra.data || null;
        prekresliKartu(id);
      }
      return;
    }
    if (act === "oznac-rk" || act === "oznac-zrus") {
      try {
        var kp = S.predInz && S.predInz[id], ine = kp ? kp.inzeraty.length - 1 : 0;
        await rpc("oznacit_predajcu", { p_inzerat: id, p_typ: act === "oznac-rk" ? "rk" : null });
        await Promise.all([nacitajOznacenia(), nacitajPredajcov().catch(function () {})]);
        toast(act === "oznac-rk" ? "Označené ako realitná kancelária – presunuté mimo súkromných" + (ine === 1 ? " aj s ďalším inzerátom s rovnakým číslom." : ine > 1 ? " aj s ďalšími " + ine + " inzerátmi s rovnakým číslom." : ".") : "Označenie zrušené.");
      } catch (err) { toast(chybaText(err), true); }
      vykresliStaty(); return vykresliZoznam();
    }
    if (act === "hovor") { S.open[id] = S.open[id] === "hovor" ? null : "hovor"; prekresliKartu(id); var s = document.querySelector('.card[data-id="' + CSS.escape(id) + '"] select[name="vysledok"]'); if (s) s.focus(); return; }
    if (act === "zavriet") { S.open[id] = null; return prekresliKartu(id); }
    if (act === "tel") {
      S.open[id] = S.open[id] === "tel" ? null : "tel"; prekresliKartu(id);
      var ti = document.querySelector('.card[data-id="' + CSS.escape(id) + '"] input[name="telefon"]'); if (ti) ti.focus();
      return;
    }
    if (act === "tel-zmaz") return ulozTelefon(id, "");
    if (act === "do-ponuky") { var zz = S.inz.find(function (x) { return x.id === id; }); if (zz) zInzeratu(zz).catch(function (err) { toast(chybaText(err), true); }); return; }
    if (act === "sms-posli") {
      // odkaz otvorí SMS v telefóne; zároveň označíme „SMS poslaná“
      if (!(p && p.sms)) akcia(id, async function () { await rpc("oznacit_kontakt", { p_inzerat: id, p_typ: "sms", p_stav: true }); });
      return;
    }
    if (act === "hist") {
      if (S.open[id] === "hist") { S.open[id] = null; return prekresliKartu(id); }
      S.open[id] = "hist"; delete S.hist[id]; prekresliKartu(id);
      await nacitajHistoriu(id); return prekresliKartu(id);
    }
  });
  document.addEventListener("change", function (e) {
    var s = e.target.closest('#obsah .card select[data-act="presun"]');
    if (!s || !s.value) return;
    var id = s.closest(".card").dataset.id, kam = s.value === "__volny" ? null : s.value;
    akcia(id, async function () {
      await rpc("presunut", { p_inzerat: id, p_makler: kam });
      toast(kam ? "Presunuté na: " + meno(kam) : "Inzerát je voľný.");
    });
  });
  async function ulozTelefon(id, cislo) {
    try {
      await rpc("ulozit_telefon", { p_inzerat: id, p_telefon: cislo });
      await Promise.all([nacitajTelefony(), nacitajPredajcov().catch(function () {})]);
      S.open[id] = null;
      toast(cislo ? "Telefón je uložený." : "Telefón je vymazaný.");
    } catch (err) { toast(chybaText(err), true); }
    prekresliKartu(id);
  }
  document.addEventListener("submit", function (e) {
    var ft = e.target.closest('#obsah form[data-form="tel"]');
    if (ft) {
      e.preventDefault();
      var v = ft.telefon.value.trim();
      if (!v) return ulozTelefon(ft.closest(".card").dataset.id, "");
      if (v.replace(/\D/g, "").length < 9) return toast("Telefónne číslo musí mať aspoň 9 číslic.", true);
      ft.querySelector('button[type="submit"]').disabled = true;
      return ulozTelefon(ft.closest(".card").dataset.id, v);
    }
    var f = e.target.closest('#obsah form[data-form="hovor"]');
    if (!f) return;
    e.preventDefault();
    var id = f.closest(".card").dataset.id;
    var vys = f.vysledok.value, pozn = f.poznamka.value, tel = f.telefon ? f.telefon.value.trim() : "";
    if (tel && tel.replace(/\D/g, "").length < 9) { toast("Telefónne číslo musí mať aspoň 9 číslic.", true); f.telefon.focus(); return; }
    f.querySelector('button[type="submit"]').disabled = true;
    akcia(id, async function () {
      if (tel) { await rpc("ulozit_telefon", { p_inzerat: id, p_telefon: tel }); await nacitajTelefony(); }
      await rpc("zapisat_hovor", { p_inzerat: id, p_vysledok: vys, p_poznamka: pozn });
      S.open[id] = null;
      if (vys === "Získaný do ponuky") { konfety({ pocet: 240 }); toast("🎉 Gratulujeme! Tím sa to dozvie v chate."); chatNove(); nacitajOslavy(); }
      else toast("Hovor je zapísaný.");
    });
  });

  // ------------------------------------------------------------ SCHRÁNKOVANIE
  function vykresliFiltreSch() {
    var sf = S.sf, poh = sf.pohlad || "sidliska";
    var aktS = (S.sidliska || []).filter(function (s) { return s.aktivne; });
    var volneS = aktS.filter(function (s) { return !akciaCasti(s.id); }).length;
    var prep = '<div class="sch-pohlad" role="group">' + [
      ["sidliska", "🏘️", "Sídliská", volneS + " z " + aktS.length + " voľných"],
      ["kontakty", "📇", "Kontakty", nf.format((S.sch || []).length) + " záznamov"]].map(function (x) {
      return '<button type="button" data-sch-pohlad="' + x[0] + '" aria-pressed="' + (poh === x[0]) + '"><span class="sp-ik" aria-hidden="true">' + x[1] +
        '</span><span class="sp-txt"><b>' + x[2] + "</b><small>" + x[3] + "</small></span></button>"; }).join("") + "</div>";
    if (poh === "sidliska") {
      $("#filters").innerHTML = '<div class="filters"><div class="wrap">' + prep + "</div></div>";
      napojPohladSch(); return;
    }
    $("#filters").innerHTML = '<div class="filters"><div class="wrap">' + prep +
      '<button class="btn primary" type="button" id="sch-novy">+ Pridať záznam</button>' +
      '<input type="search" id="sq" placeholder="Hľadať: meno, telefón, adresa, poznámka, cena…" aria-label="Hľadať" value="' + esc(sf.q) + '">' +
      '<select id="s-makler" aria-label="Maklér"><option value="">Všetci makléri</option><option value="__moje">Moje</option>' +
      S.makleri.map(function (m) { return '<option value="' + m.id + '">' + esc(m.meno || m.email) + "</option>"; }).join("") + "</select>" +
      '<select id="s-typ" aria-label="Druh"><option value="">Všetky druhy</option>' +
      Object.keys(TYP).map(function (k) { return '<option value="' + k + '">' + TYP[k] + "</option>"; }).join("") + "</select>" +
      "</div></div>";
    $("#s-makler").value = sf.makler; $("#s-typ").value = sf.typ;
    $("#sch-novy").onclick = function () { S.schEdit = { id: null }; vykresliSchrankovanie(); var l = $("#sch-lokalita"); if (l) l.focus(); };
    var t;
    $("#sq").addEventListener("input", function () { var v = this.value; clearTimeout(t); t = setTimeout(function () { sf.q = v; vykresliSchrankovanie(); }, 150); });
    $("#s-makler").onchange = function () { sf.makler = this.value; ulozFiltre(); vykresliSchrankovanie(); };
    $("#s-typ").onchange = function () { sf.typ = this.value; ulozFiltre(); vykresliSchrankovanie(); };
    napojPohladSch();
  }
  function napojPohladSch() {
    document.querySelectorAll("[data-sch-pohlad]").forEach(function (b) {
      b.onclick = function () { S.sf.pohlad = b.dataset.schPohlad; S.sidForm = null; S.schEdit = null; ulozFiltre(); vykresliFiltreSch(); vykresliSchrankovanie(); };
    });
  }

  function formSch(r) {
    var mozeMaklera = admin();
    return '<form class="box" id="f-sch"><h3>' + (r.id ? "Upraviť záznam" : "Nový záznam") + "</h3><div class=\"form-grid\">" +
      '<label class="field"><span>Lokalita / adresa *</span><input type="text" id="sch-lokalita" list="dl-obce" required value="' + esc(r.lokalita || "") + '" placeholder="napr. Smižany, Hutnícka 12"></label>' +
      '<label class="field"><span>Meno a priezvisko</span><input type="text" id="sch-kontakt" value="' + esc(r.kontakt || "") + '" placeholder="majiteľ / kontaktná osoba"></label>' +
      '<label class="field"><span>Druh nehnuteľnosti</span><select id="sch-typ">' +
      Object.keys(TYP).map(function (k) { return '<option value="' + k + '"' + (r.typ === k ? " selected" : "") + ">" + TYP[k] + "</option>"; }).join("") + "</select></label>" +
      '<label class="field"><span>Cena (€)</span><input type="number" id="sch-cena" min="0" step="100" inputmode="numeric" value="' + (r.cena == null ? "" : r.cena) + '"></label>' +
      '<label class="field"><span>Telefón</span><input type="tel" id="sch-tel" value="' + esc(r.telefon || "") + '" placeholder="0905 123 456"></label>' +
      '<label class="field"><span>Stav</span><input type="text" id="sch-stav" list="dl-stav" value="' + esc(r.stav || "") + '"></label>' +
      (mozeMaklera ? '<label class="field"><span>Maklér</span><select id="sch-makler">' + S.makleri.filter(function (m) { return m.aktivny || m.id === r.makler_id; }).map(function (m) {
        return '<option value="' + m.id + '"' + ((r.makler_id || S.me.id) === m.id ? " selected" : "") + ">" + esc(m.meno || m.email) + "</option>";
      }).join("") + "</select></label>" : "") +
      "</div>" +
      '<label class="field"><span>Poznámky</span><textarea id="sch-pozn" rows="3">' + esc(r.poznamky || "") + "</textarea></label>" +
      '<datalist id="dl-obce">' + S.obce.map(function (o) { return '<option value="' + esc(o[0]) + '">'; }).join("") + "</datalist>" +
      '<datalist id="dl-stav">' + STAVY_NEHN.map(function (s) { return '<option value="' + esc(s) + '">'; }).join("") + "</datalist>" +
      '<div class="form-actions"><button class="btn primary" type="submit">Uložiť</button><button class="btn ghost" type="button" id="sch-x">Zrušiť</button></div></form>';
  }

  // hľadanie cez všetky údaje; telefón sa porovnáva bez medzier a predvoľby (+421 / 0)
  function cisloTel(t) { return String(t || "").replace(/\D/g, "").replace(/^00421|^421/, "0"); }
  function schZhoda(r, q) {
    var text = norm([r.lokalita, r.kontakt, r.telefon, r.poznamky, r.stav, TYP[r.typ], r.cena, meno(r.makler_id), datum(r.vytvorene)].join(" "));
    var slova = q.split(/\s+/).filter(Boolean);
    var tel = cisloTel(r.telefon);
    return slova.every(function (w) {
      if (text.indexOf(w) >= 0) return true;
      var d = cisloTel(w);
      return d.length >= 3 && tel.indexOf(d) >= 0;
    });
  }
  function vykresliSchrankovanie() {
    var el = $("#obsah"); if (!el) return;
    if ((S.sf.pohlad || "sidliska") === "sidliska") return vykresliSidliska();
    var sf = S.sf, q = norm(sf.q).trim();
    var rows = S.sch.filter(function (r) {
      if (sf.makler === "__moje" && r.makler_id !== S.me.id) return false;
      if (sf.makler && sf.makler !== "__moje" && r.makler_id !== sf.makler) return false;
      if (sf.typ && r.typ !== sf.typ) return false;
      if (q && !schZhoda(r, q)) return false;
      return true;
    });
    function moze(r) { return admin() || r.makler_id === S.me.id; }
    function tlacidla(r) {
      var zvon = '<button class="btn ghost" type="button" data-sch="zvon" data-id="' + r.id + '" title="Nastaviť pripomienku">🔔</button> ';
      if (!moze(r)) return zvon;
      return zvon + '<button class="btn" type="button" data-sch="upravit" data-id="' + r.id + '">Upraviť</button> ' +
        (S.delConfirm === r.id ? '<button class="btn danger" type="button" data-sch="zmazat" data-id="' + r.id + '">Naozaj zmazať?</button>' :
          '<button class="btn ghost danger" type="button" data-sch="zmazat-1" data-id="' + r.id + '">Zmazať</button>');
    }
    function tel(t) { return t ? '<a href="tel:' + esc(t.replace(/\s/g, "")) + '">' + esc(t) + "</a>" : ""; }
    var h = S.schEdit ? formSch(S.schEdit) : "";
    h += '<div class="bar"><span>' + nf.format(rows.length) + " záznamov</span></div>";
    if (!rows.length) {
      h += '<div class="empty">' + (S.sch.length ? "Nič nezodpovedá filtrom." : "Zatiaľ tu nie je žiadny záznam. Pridajte prvý tlačidlom „+ Pridať záznam“.") + "</div>";
    } else {
      h += '<div class="tbl-wrap sch"><table class="sch-tab"><colgroup><col class="c-kontakt"><col class="c-lok"><col class="c-pozn"><col class="c-makler"><col class="c-akcie"></colgroup>' +
        "<thead><tr><th>Kontakt</th><th>Lokalita</th><th>Poznámky</th><th>Maklér</th><th></th></tr></thead><tbody>" +
        rows.map(function (r) {
          var detail = [TYP[r.typ] || r.typ, r.cena ? eur(r.cena) : "", r.stav].filter(Boolean).map(esc).join(" · ");
          var dlha = (r.poznamky || "").length > 160 || (r.poznamky || "").split("\n").length > 3;
          return "<tr><td><b>" + esc(r.kontakt || "—") + '</b><div class="sch-tel">' + tel(r.telefon) + "</div></td>" +
            "<td>" + esc(r.lokalita) + (detail ? '<div class="meta">' + detail + "</div>" : "") + "</td>" +
            '<td><div class="sch-pozn' + (dlha ? " skratene" : "") + '">' + esc(r.poznamky || "") + "</div>" +
            (dlha ? '<button type="button" class="btn-link" data-sch-viac>celé ▾</button>' : "") + "</td>" +
            "<td>" + esc(meno(r.makler_id)) + '<div class="meta">' + datum(r.vytvorene) + "</div></td>" +
            '<td><div class="sch-akcie">' + tlacidla(r) + "</div></td></tr>";
        }).join("") + "</tbody></table></div>";
      h += '<div class="sch-cards">' + rows.map(function (r) {
        return '<div class="sch-card"><div class="top"><span>' + esc(r.lokalita) + "</span><span>" + (r.cena ? eur(r.cena) : "") + "</span></div>" +
          '<div class="meta"><span>' + esc(TYP[r.typ] || "") + "</span>" + (r.stav ? "<span>" + esc(r.stav) + "</span>" : "") + "<span>" + esc(meno(r.makler_id)) + "</span><span>" + datum(r.vytvorene) + "</span></div>" +
          (r.kontakt || r.telefon ? "<div>" + (r.kontakt ? "<b>" + esc(r.kontakt) + "</b> " : "") + tel(r.telefon) + "</div>" : "") + (r.poznamky ? "<div>" + esc(r.poznamky) + "</div>" : "") +
          (moze(r) ? '<div class="form-actions">' + tlacidla(r) + "</div>" : "") + "</div>";
      }).join("") + "</div>";
    }
    el.innerHTML = h;
    el.querySelectorAll("[data-sch-viac]").forEach(function (b) {
      b.onclick = function () { var p = b.previousElementSibling, z = p.classList.toggle("skratene"); b.textContent = z ? "celé ▾" : "menej ▴"; };
    });
    if (S.schEdit) {
      $("#sch-x").onclick = function () { S.schEdit = null; vykresliSchrankovanie(); };
      $("#f-sch").addEventListener("submit", async function (e) {
        e.preventDefault();
        var btn = e.target.querySelector('button[type="submit"]'); btn.disabled = true;
        var cena = $("#sch-cena").value;
        try {
          await rpc("ulozit_schrankovanie", {
            p_id: S.schEdit.id, p_lokalita: $("#sch-lokalita").value, p_typ: $("#sch-typ").value,
            p_cena: cena === "" ? null : Math.round(Number(cena)), p_telefon: $("#sch-tel").value, p_stav: $("#sch-stav").value,
            p_poznamky: $("#sch-pozn").value, p_makler: $("#sch-makler") ? $("#sch-makler").value : null,
            p_kontakt: $("#sch-kontakt").value,
          });
          toast(S.schEdit.id ? "Záznam je upravený." : "Záznam je pridaný.");
          S.schEdit = null; await nacitajSchrankovanie();
        } catch (err) { toast(chybaText(err), true); btn.disabled = false; return; }
        vykresliSchrankovanie();
      });
    }
  }

  document.addEventListener("click", async function (e) {
    var b = e.target.closest("#obsah [data-sch]");
    if (!b) return;
    var id = Number(b.dataset.id), r = S.sch.find(function (x) { return x.id === id; });
    if (b.dataset.sch === "upravit") { S.schEdit = Object.assign({}, r); S.delConfirm = null; vykresliSchrankovanie(); window.scrollTo({ top: 0, behavior: "smooth" }); }
    if (b.dataset.sch === "zmazat-1") { S.delConfirm = id; vykresliSchrankovanie(); }
    if (b.dataset.sch === "zvon") { S.zvonOpen = true; S.pripForm = { schrankovanie_id: id }; vykresliZvoncek(); window.scrollTo({ top: 0, behavior: "smooth" }); }
    if (b.dataset.sch === "zmazat") {
      try { await rpc("zmazat_schrankovanie", { p_id: id }); toast("Záznam je zmazaný."); S.delConfirm = null; await nacitajSchrankovanie(); }
      catch (err) { toast(chybaText(err), true); }
      vykresliSchrankovanie();
    }
  });

  // ------------------------------------------------------------ SCHRÁNKOVANIE PO SÍDLISKÁCH
  var REZ_DNI = 7;      // rezervácia bez zapísaného dátumu platí 7 dní
  var BLOK_DNI = 14;    // po prepadnutí si to isté sídlisko ten istý maklér nemôže rezervovať 14 dní
  function datumPlus2m(d) { var x = new Date(d + "T12:00:00"); x.setMonth(x.getMonth() + 2); return x; }
  function akciaBlokuje(a) {
    if (a.zrusene) return false;
    if (!a.datum) return new Date(a.rezervovane).getTime() > Date.now() - REZ_DNI * 864e5;
    return datumPlus2m(a.datum).getTime() > Date.now();
  }
  // prepadnutá rezervácia → dokedy je sídlisko zamknuté pre toho maklera (inak null)
  function blokaciaDo(a) {
    if (a.zrusene || a.datum) return null;
    var t = new Date(a.rezervovane).getTime();
    if (t > Date.now() - REZ_DNI * 864e5) return null;
    var koniec = t + (REZ_DNI + BLOK_DNI) * 864e5;
    return koniec > Date.now() ? new Date(koniec) : null;
  }
  function zaciatokTyzdna() { var d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - (d.getDay() + 6) % 7); return d; }
  function buducPondelok() { var d = zaciatokTyzdna(); d.setDate(d.getDate() + 7); return d; }
  // rezervácia, ktorá tento týždeň vyčerpala limit (administrátor limit nemá)
  function tyzdennaRezervacia() {
    if (admin()) return null;
    var od = zaciatokTyzdna().getTime();
    return (S.akcie || []).filter(function (a) {
      if (a.makler_id !== S.me.id || new Date(a.rezervovane).getTime() < od) return false;
      if (!a.zrusene) return true;
      return a.zrusil === a.makler_id && new Date(a.zrusene).getTime() - new Date(a.rezervovane).getTime() > 30 * 6e4;
    }).sort(function (a, b) { return String(b.rezervovane).localeCompare(String(a.rezervovane)); })[0] || null;
  }
  function mojaBlokacia(sid) {
    if (admin()) return null;
    var max = null;
    (S.akcie || []).forEach(function (a) { var d = a.sidlisko_id === sid && a.makler_id === S.me.id ? blokaciaDo(a) : null; if (d && (!max || d > max)) max = d; });
    return max;
  }
  function akciaCasti(sid) {
    return (S.akcie || []).filter(function (a) { return a.sidlisko_id === sid && akciaBlokuje(a); })
      .sort(function (a, b) { return String(b.rezervovane).localeCompare(String(a.rezervovane)); })[0] || null;
  }
  function poslednaAkcia(sid) {
    return (S.akcie || []).filter(function (a) { return a.sidlisko_id === sid && !a.zrusene && a.datum && !akciaBlokuje(a); })
      .sort(function (a, b) { return String(b.datum).localeCompare(String(a.datum)); })[0] || null;
  }
  function nazovSidliska(id) { var s = (S.sidliska || []).find(function (x) { return x.id === id; }); return s ? s.nazov + " (" + s.mesto + ")" : "sídlisko"; }
  function sklon(m, muz, zena) { return rodMaklera(S.mById[m] || {}) === "zena" ? zena : muz; }
  function dnes() { return lokalnyCas(new Date()).slice(0, 10); }
  function vykresliSidliska() {
    var el = $("#obsah"), mesta = {};
    (S.sidliska || []).filter(function (s) { return s.aktivne; }).forEach(function (s) { (mesta[s.mesto] = mesta[s.mesto] || []).push(s); });
    var poradieMiest = ["Spišská Nová Ves", "Smižany", "Levoča"];
    var mn = Object.keys(mesta).sort(function (a, b) { var x = poradieMiest.indexOf(a), y = poradieMiest.indexOf(b); return (x < 0 ? 99 : x) - (y < 0 ? 99 : y) || a.localeCompare(b, "sk"); });
    var tyz = tyzdennaRezervacia(), stav;
    if (admin()) stav = '<div class="sid-limit info">👑 Ako administrátor nemáte týždenný limit a môžete zrušiť akúkoľvek rezerváciu aj blokáciu.</div>';
    else if (tyz) stav = '<div class="sid-limit pouzite">📌 Tento týždeň máte rezervované: <b>' + esc(nazovSidliska(tyz.sidlisko_id)) + "</b>. Ďalšie sídlisko si môžete rezervovať od pondelka <b>" + datum(buducPondelok().toISOString()) + "</b>.</div>";
    else stav = '<div class="sid-limit volne">✅ Tento týždeň si môžete rezervovať <b>1 sídlisko</b>.</div>';
    var h = '<div class="box sid-box"><div class="vykon-hlava"><h3>🏘️ Sídliská na schránkovanie</h3></div>' + stav +
      '<div class="sid-legenda"><span class="sid-b volne"></span>voľné<span class="sid-b rez"></span>rezervované (7 dní)<span class="sid-b obs"></span>schránkované (2 mesiace)<button type="button" class="btn-link" data-sid-pravidla>Ako to funguje? ↓</button></div>';
    mn.forEach(function (m) {
      var zoz = mesta[m].sort(function (a, b) { return a.poradie - b.poradie; });
      var volne = zoz.filter(function (s) { return !akciaCasti(s.id); }).length;
      h += '<div class="sid-mesto"><h4>' + esc(m) + '</h4><span class="sid-mesto-poc">' + volne + " z " + zoz.length + " voľných</span></div>" +
        '<div class="sid-grid">' + zoz.map(kartaSidliska).join("") + "</div>";
    });
    if (admin()) h += '<form class="sid-novy" id="f-sid-novy"><b>Pridať sídlisko</b><input type="text" name="mesto" placeholder="Obec, napr. Krompachy" required list="dl-sid-mesta">' +
      '<input type="text" name="nazov" placeholder="Názov sídliska" required><button class="btn" type="submit">Pridať</button>' +
      '<datalist id="dl-sid-mesta">' + mn.map(function (m) { return '<option value="' + esc(m) + '">'; }).join("") + "</datalist></form>";
    var skryte = admin() ? (S.sidliska || []).filter(function (s) { return !s.aktivne; }) : [];
    if (skryte.length) h += '<div class="sid-skryte"><b>Skryté sídliská:</b>' + skryte.map(function (s) {
      return '<button class="btn ghost" type="button" data-sid-vratit="' + s.id + '">↩ ' + esc(s.nazov + " (" + s.mesto + ")") + "</button>"; }).join("") + "</div>";
    h += "</div>" + pravidlaSidlisk();
    el.innerHTML = h;
    napojSidliska();
  }
  function pravidlaSidlisk() {
    return '<div class="box sid-pravidla" id="sid-pravidla"><h3>📋 Ako funguje schránkovanie</h3><ol>' +
      "<li><b>Najprv si sídlisko rezervujte.</b> Tak sa s kolegami nestretnete na rovnakom mieste. Rezervácia platí " + REZ_DNI + " dní a ostatní ju vidia na oranžovo.</li>" +
      "<li><b>Jedno sídlisko za týždeň.</b> Každý maklér si môže rezervovať jedno sídlisko od pondelka do nedele. Ak sa pomýlite a rezerváciu zrušíte do 30 minút, nepočíta sa.</li>" +
      "<li><b>Sídlisko sa berie vždy celé.</b> Platí to aj pre Centrum sever a Centrum juh, každé z nich sa schránkuje celé.</li>" +
      "<li><b>Po schránkovaní zapíšte dátum.</b> Ťuknite na „✓ Schránkované – zapísať dátum“. Sídlisko potom 2 mesiace svieti na červeno s vaším menom a dátumom a nikto iný si ho nevezme.</li>" +
      "<li><b>Keď to nestihnete:</b> ak do " + REZ_DNI + " dní dátum nezapíšete, rezervácia prepadne. Sídlisko je hneď voľné pre ostatných maklérov, vy si ho znova môžete rezervovať až o 2 týždne.</li>" +
      "<li><b>Kontakty a poznámky.</b> Ľudí, ktorí sa ozvali, pridáte tlačidlom „+ Kontakt“. Poznámky pri sídlisku, napríklad „vchod 12 nechce letáky“, vidia všetci makléri.</li>" +
      "<li><b>Administrátor</b> môže zapísať schránkovanie za ktoréhokoľvek makléra (aj spätne), zmeniť kto a kedy schránkoval a zrušiť akúkoľvek rezerváciu, záznam aj blokáciu.</li></ol></div>";
  }
  function kartaSidliska(s) {
    var akcia = akciaCasti(s.id);
    var stav = akcia ? (akcia.datum ? "obs" : "rez") : "volne";
    var f = S.sidForm && S.sidForm.sidlisko_id === s.id ? S.sidForm : null;
    return '<div class="sid-karta ' + stav + '" data-sid="' + s.id + '"><div class="sid-hl"><b>' + esc(s.nazov) + "</b>" +
      (admin() ? '<button type="button" class="btn-link" data-sid-skryt="' + s.id + '" title="Skryť sídlisko zo zoznamu">skryť</button>' : "") + "</div>" +
      blokCasti(s, akcia) + (f && f.mode !== "pozn" ? formSidliska(s, f) : "") + poznamkySidliska(s, f && f.mode === "pozn") + "</div>";
  }
  function blokCasti(s, a) {
    var h = '<div class="sid-cast ' + (!a ? "volne" : a.datum ? "obs" : "rez") + '">';
    if (!a) {
      var p = poslednaAkcia(s.id), blok = mojaBlokacia(s.id), tyz = tyzdennaRezervacia();
      h += '<div class="sid-stav">✅ Voľné' + (p ? '<small class="meta d-block">naposledy ' + esc(meno(p.makler_id)) + " · " + datum(p.datum) + "</small>" : "") + "</div>";
      if (blok) h += '<div class="sid-blok">⏳ Toto sídlisko ste nestihli vyschránkovať. Znova si ho môžete rezervovať od <b>' + datum(blok.toISOString()) + "</b>. Pre ostatných je voľné.</div>";
      else h += '<div class="sid-akcie"><button class="btn primary" type="button" data-sid-akt="rez" data-sid-id="' + s.id + '"' +
        (tyz ? ' disabled title="Tento týždeň už máte rezervované sídlisko"' : "") + ">" + (admin() ? "Rezervovať / zapísať" : "Rezervovať") + "</button>" +
        (tyz ? '<small class="meta">ďalšie od pondelka ' + datum(buducPondelok().toISOString()) + "</small>" : "") + "</div>";
      if (admin()) (S.akcie || []).forEach(function (x) {
        var d = x.sidlisko_id === s.id ? blokaciaDo(x) : null;
        if (d) h += '<div class="sid-blok">⏳ ' + esc(meno(x.makler_id)) + " " + sklon(x.makler_id, "nestihol", "nestihla") + " – pre " + sklon(x.makler_id, "neho", "ňu") +
          " zamknuté do " + datum(d.toISOString()) + ' <button class="btn ghost" type="button" data-sid-akt="odblokovat" data-akcia="' + x.id + '">Zrušiť blokáciu</button></div>';
      });
      return h + "</div>";
    }
    var moja = a.makler_id === S.me.id, smiem = moja || admin();
    var K = S.sch.filter(function (r) { return r.akcia_id === a.id; });
    if (!a.datum) {
      var do_ = new Date(new Date(a.rezervovane).getTime() + REZ_DNI * 864e5);
      h += '<div class="sid-stav">' + avatar(a.makler_id, 22) + " <b>" + esc(meno(a.makler_id)) + "</b> " + sklon(a.makler_id, "rezervoval", "rezervovala") +
        '<small class="meta d-block">od ' + datum(a.rezervovane) + " · rezervácia platí do " + datum(do_.toISOString()) + "</small></div>";
    } else {
      h += '<div class="sid-stav">' + avatar(a.makler_id, 22) + " <b>" + esc(meno(a.makler_id)) + "</b> " + sklon(a.makler_id, "schránkoval", "schránkovala") + " <b>" + datum(a.datum) + "</b>" +
        '<small class="meta d-block">voľné bude od ' + datum(datumPlus2m(a.datum).toISOString()) + "</small></div>";
    }
    if (a.poznamka) h += '<div class="sid-pozn">📍 ' + esc(a.poznamka) + "</div>";
    if (K.length) h += '<details class="sid-kontakty"><summary>📇 Kontakty (' + K.length + ")</summary><ul>" + K.map(function (r) {
      return "<li><b>" + esc(r.kontakt || r.lokalita) + "</b>" + (r.kontakt ? ' <span class="meta">' + esc(r.lokalita) + "</span>" : "") +
        (r.telefon ? ' · <a href="tel:' + esc(String(r.telefon).replace(/\s/g, "")) + '">' + esc(r.telefon) + "</a>" : "") + (r.poznamky ? '<div class="meta">' + esc(r.poznamky) + "</div>" : "") + "</li>";
    }).join("") + "</ul></details>";
    if (smiem) h += '<div class="sid-akcie">' +
      (!a.datum ? '<button class="btn primary" type="button" data-sid-akt="datum" data-akcia="' + a.id + '">✓ Schránkované – zapísať dátum</button>' : "") +
      '<button class="btn" type="button" data-sid-akt="kontakt" data-akcia="' + a.id + '">+ Kontakt</button>' +
      (a.datum ? '<button class="btn ghost" type="button" data-sid-akt="datum" data-akcia="' + a.id + '">' + (admin() ? "Upraviť (kto, kedy)" : "Zmeniť dátum") + "</button>" : "") +
      '<button class="btn ghost danger" type="button" data-sid-akt="zrusit" data-akcia="' + a.id + '">' + (a.datum ? "Zrušiť záznam" : "Zrušiť rezerváciu") + "</button></div>";
    return h + "</div>";
  }
  function poznamkySidliska(s, form) {
    var P = (S.sidPozn || []).filter(function (p) { return p.sidlisko_id === s.id; })
      .sort(function (a, b) { return String(b.vytvorene).localeCompare(String(a.vytvorene)); });
    function li(p) {
      var smiem = admin() || p.makler_id === S.me.id;
      return '<li><div class="sid-pozn-text">' + esc(p.text) + '</div><small class="meta">' + esc(meno(p.makler_id)) + " · " + datum(p.vytvorene) +
        (smiem ? ' · <button type="button" class="btn-link" data-sid-pozn-zmaz="' + p.id + '">zmazať</button>' : "") + "</small></li>";
    }
    var h = '<div class="sid-poznamky"><div class="sid-pozn-hl"><span>💬 Poznámky' + (P.length ? " (" + P.length + ")" : "") + "</span>" +
      (form ? "" : '<button type="button" class="btn-link" data-sid-akt="pozn" data-sid-id="' + s.id + '">+ Pridať poznámku</button>') + "</div>";
    if (P.length) h += "<ul>" + P.slice(0, 2).map(li).join("") + "</ul>" +
      (P.length > 2 ? '<details><summary class="meta">Zobraziť staršie (' + (P.length - 2) + ")</summary><ul>" + P.slice(2).map(li).join("") + "</ul></details>" : "");
    if (form) h += '<form class="sid-form" id="f-sid"><label class="field"><span>Poznámka pre všetkých maklérov</span>' +
      '<textarea name="text" rows="2" maxlength="1000" required placeholder="napr. vchod Hutnícka 12 nechce letáky, nová schránka pri obchode"></textarea></label>' +
      '<div class="form-actions"><button class="btn primary" type="submit">Pridať poznámku</button><button class="btn ghost" type="button" data-sid-akt="zavriet">Zrušiť</button></div></form>';
    return h + "</div>";
  }
  function vyberMaklera(vybrany, popis) {
    if (!admin()) return "";
    return '<label class="field"><span>' + popis + '</span><select name="makler">' + S.makleri.filter(function (m) { return m.aktivny || m.id === vybrany; }).map(function (m) {
      return '<option value="' + m.id + '"' + (m.id === vybrany ? " selected" : "") + ">" + esc(m.meno || m.email) + (m.id === S.me.id ? " (ja)" : "") + "</option>";
    }).join("") + "</select></label>";
  }
  function formSidliska(s, f) {
    if (f.mode === "rez") {
      return '<form class="sid-form" id="f-sid">' + vyberMaklera(S.me.id, "Maklér, ktorý schránkuje / schránkoval") +
        '<label class="field"><span>Ktoré ulice / vchody <small class="meta">nepovinné</small></span><input type="text" name="poznamka" placeholder="napr. začínam od Hutníckej"></label>' +
        '<label class="field"><span>Už schránkované dňa <small class="meta">nechajte prázdne, ak len rezervujete</small></span><input type="date" name="datum" max="' + dnes() + '"></label>' +
        (admin() ? "" : '<p class="meta">Týmto využijete svoju rezerváciu na tento týždeň.</p>') +
        '<div class="form-actions"><button class="btn primary" type="submit">Rezervovať</button><button class="btn ghost" type="button" data-sid-akt="zavriet">Zrušiť</button></div></form>';
    }
    if (f.mode === "datum") {
      var a = (S.akcie || []).find(function (x) { return x.id === f.akcia_id; }) || {};
      return '<form class="sid-form" id="f-sid">' + vyberMaklera(a.makler_id, "Kto schránkoval") + '<label class="field"><span>Dátum schránkovania</span><input type="date" name="datum" required max="' + dnes() + '" value="' + esc(a.datum || dnes()) + '"></label>' +
        '<label class="field"><span>Ktoré ulice / vchody</span><input type="text" name="poznamka" value="' + esc(a.poznamka || "") + '"></label>' +
        '<div class="form-actions"><button class="btn primary" type="submit">Uložiť dátum</button><button class="btn ghost" type="button" data-sid-akt="zavriet">Zrušiť</button></div></form>';
    }
    if (f.mode === "kontakt") {
      return '<form class="sid-form" id="f-sid"><div class="form-grid">' +
        '<label class="field"><span>Adresa / vchod *</span><input type="text" name="lokalita" required value="' + esc(s.mesto + " – " + s.nazov + ", ") + '"></label>' +
        '<label class="field"><span>Meno a priezvisko</span><input type="text" name="kontakt"></label>' +
        '<label class="field"><span>Telefón</span><input type="tel" inputmode="tel" name="telefon"></label>' +
        '<label class="field"><span>Druh</span><select name="typ">' + Object.keys(TYP).map(function (k) { return '<option value="' + k + '">' + TYP[k] + "</option>"; }).join("") + "</select></label></div>" +
        '<label class="field"><span>Poznámka</span><textarea name="poznamky" rows="2" placeholder="napr. zvažuje predaj na jar, 3-izbový byt, 4. poschodie"></textarea></label>' +
        '<div class="form-actions"><button class="btn primary" type="submit">Uložiť kontakt</button><button class="btn ghost" type="button" data-sid-akt="zavriet">Zrušiť</button></div>' +
        '<p class="meta">Kontakt sa uloží aj do zoznamu Kontakty v schránkovaní.</p></form>';
    }
    return "";
  }
  function napojSidliska() {
    var el = $("#obsah");
    el.querySelectorAll("[data-sid-akt]").forEach(function (b) {
      b.onclick = async function () {
        var akt = b.dataset.sidAkt;
        if (akt === "zavriet") { S.sidForm = null; return vykresliSidliska(); }
        if (akt === "rez" || akt === "pozn") { S.sidForm = { mode: akt, sidlisko_id: Number(b.dataset.sidId) }; return vykresliSidliska(); }
        var a = (S.akcie || []).find(function (x) { return x.id === Number(b.dataset.akcia); });
        if (!a) return;
        if (akt === "datum" || akt === "kontakt") { S.sidForm = { mode: akt, sidlisko_id: a.sidlisko_id, akcia_id: a.id }; return vykresliSidliska(); }
        if (akt === "zrusit" || akt === "odblokovat") {
          var otazka = akt === "odblokovat" ? "Zrušiť blokáciu? " + meno(a.makler_id) + " si bude môcť sídlisko hneď znova rezervovať." :
            a.datum ? "Zrušiť záznam o schránkovaní? Sídlisko bude znova voľné." : "Zrušiť rezerváciu? Sídlisko bude znova voľné.";
          if (!confirm2(otazka)) return;
          try { await rpc("zrusit_akciu_schrankovania", { p_id: a.id }); await nacitajSchrankovanie(); toast(akt === "odblokovat" ? "Blokácia je zrušená." : "Zrušené – sídlisko je voľné."); }
          catch (err) { toast(chybaText(err), true); }
          vykresliSidliska();
        }
      };
    });
    var bp = el.querySelector("[data-sid-pravidla]");
    if (bp) bp.onclick = function () { var c = $("#sid-pravidla"); if (c) c.scrollIntoView({ behavior: "smooth", block: "start" }); };
    el.querySelectorAll("[data-sid-pozn-zmaz]").forEach(function (b) {
      b.onclick = async function () {
        if (!confirm2("Zmazať poznámku?")) return;
        try { await rpc("zmazat_poznamku_sidliska", { p_id: Number(b.dataset.sidPoznZmaz) }); await nacitajSchrankovanie(); toast("Poznámka je zmazaná."); }
        catch (err) { toast(chybaText(err), true); }
        vykresliSidliska();
      };
    });
    el.querySelectorAll("[data-sid-vratit]").forEach(function (b) {
      b.onclick = async function () {
        var s = S.sidliska.find(function (x) { return x.id === Number(b.dataset.sidVratit); });
        if (!s) return;
        try { await rpc("ulozit_sidlisko", { p_id: s.id, p_mesto: s.mesto, p_nazov: s.nazov, p_aktivne: true }); await nacitajSchrankovanie(); toast("Sídlisko je späť v zozname."); vykresliSidliska(); }
        catch (err) { toast(chybaText(err), true); }
      };
    });
    el.querySelectorAll("[data-sid-skryt]").forEach(function (b) {
      b.onclick = async function () {
        var s = S.sidliska.find(function (x) { return x.id === Number(b.dataset.sidSkryt); });
        if (!s || !confirm2("Skryť sídlisko „" + s.nazov + "“ zo zoznamu?")) return;
        try { await rpc("ulozit_sidlisko", { p_id: s.id, p_mesto: s.mesto, p_nazov: s.nazov, p_aktivne: false }); await nacitajSchrankovanie(); vykresliSidliska(); }
        catch (err) { toast(chybaText(err), true); }
      };
    });
    var fn = $("#f-sid-novy");
    if (fn) fn.onsubmit = async function (e) {
      e.preventDefault();
      try { await rpc("ulozit_sidlisko", { p_id: null, p_mesto: fn.mesto.value, p_nazov: fn.nazov.value, p_aktivne: true }); await nacitajSchrankovanie(); toast("Sídlisko je pridané."); vykresliSidliska(); }
      catch (err) { toast(chybaText(err), true); }
    };
    var f = $("#f-sid");
    if (f) {
      var prve = f.querySelector('input[type="text"], input[type="date"], textarea'); if (prve && S.sidForm.mode !== "rez") prve.focus();
      f.onsubmit = async function (e) {
        e.preventDefault();
        var F = S.sidForm, btn = f.querySelector('[type="submit"]'); btn.disabled = true;
        try {
          if (F.mode === "rez" && f.makler) {
            await rpc("admin_zapisat_schrankovanie", { p_id: null, p_sidlisko: F.sidlisko_id, p_makler: f.makler.value, p_datum: f.datum.value || null, p_poznamka: f.poznamka.value });
            toast(f.datum.value ? "✅ Zapísané: " + meno(f.makler.value) + ", " + datum(f.datum.value) + "." : "📌 Rezervované pre " + meno(f.makler.value) + ".");
          } else if (F.mode === "rez") {
            await rpc("rezervovat_sidlisko", { p_sidlisko: F.sidlisko_id, p_polovica: "cele", p_datum: f.datum.value || null, p_poznamka: f.poznamka.value });
            toast(f.datum.value ? "✅ Schránkovanie je zapísané – 2 mesiace obsadené." : "📌 Rezervované na " + REZ_DNI + " dní. Po schránkovaní zapíšte dátum.");
          }
          if (F.mode === "datum" && f.makler) {
            await rpc("admin_zapisat_schrankovanie", { p_id: F.akcia_id, p_sidlisko: null, p_makler: f.makler.value, p_datum: f.datum.value, p_poznamka: f.poznamka.value });
            toast("✅ Uložené: " + meno(f.makler.value) + ", " + datum(f.datum.value) + ".");
          } else if (F.mode === "datum") {
            await rpc("zapisat_datum_schrankovania", { p_id: F.akcia_id, p_datum: f.datum.value, p_poznamka: f.poznamka.value });
            toast("✅ Dátum je zapísaný – sídlisko je obsadené 2 mesiace.");
          }
          if (F.mode === "kontakt") {
            var id = await rpc("ulozit_schrankovanie", { p_id: null, p_lokalita: f.lokalita.value, p_typ: f.typ.value, p_cena: null, p_telefon: f.telefon.value,
              p_stav: null, p_poznamky: f.poznamky.value, p_makler: null, p_kontakt: f.kontakt.value });
            await rpc("priradit_kontakt_akcii", { p_zaznam: id, p_akcia: F.akcia_id });
            toast("📇 Kontakt je uložený.");
          }
          if (F.mode === "pozn") {
            await rpc("pridat_poznamku_sidliska", { p_sidlisko: F.sidlisko_id, p_text: f.text.value });
            toast("💬 Poznámka je pridaná.");
          }
          S.sidForm = null; await nacitajSchrankovanie(); vykresliSidliska();
        } catch (err) { toast(chybaText(err), true); btn.disabled = false; }
      };
    }
  }

  // ------------------------------------------------------------ MAKLÉRI (admin)
  function bunkaHeslo(m) {
    if (S.hesloEdit === m.id) {
      return '<span class="heslo-edit"><input type="text" data-heslo-nove value="' + noveHeslo() + '" minlength="8" aria-label="Nové heslo" autocomplete="off">' +
        '<button class="btn primary" type="button" data-m-act="heslo-uloz">Nastaviť</button><button class="btn ghost" type="button" data-m-act="heslo-zrus">✕</button></span>';
    }
    // heslo sa nikde neukladá čitateľne – ukážeme len to, ktoré ste práve nastavili (do obnovenia stránky)
    var h = S.hesla[m.id], obsah;
    if (h) obsah = '<span class="heslo-val" data-heslo="' + esc(h) + '">••••••••</span> <button class="btn ghost pw-show" type="button" data-m-act="heslo-ukaz" aria-label="Zobraziť heslo">👁</button>';
    else obsah = '<span class="meta">zašifrované</span>';
    return '<span class="heslo-cell">' + obsah + ' <button class="btn ghost" type="button" data-m-act="heslo">Zmeniť</button></span>';
  }
  function meninyPodlaKalendara(m) {
    var meno = String((m && m.meno) || "").trim().split(/\s+/)[0].toLowerCase(), M = window.MENINY || {};
    if (!meno) return "";
    for (var k in M) if (M[k].some(function (n) { return n.toLowerCase() === meno; })) return "podľa kalendára " + Number(k.slice(3)) + "." + Number(k.slice(0, 2)) + ".";
    return "";
  }
  function reakcieNaVety(id) {
    var r = (S.reakcie || []).filter(function (x) { return x.ciel.indexOf("veta:" + id + ":") === 0; });
    if (!r.length) return "";
    var poc = {}; r.forEach(function (x) { poc[x.emoji] = (poc[x.emoji] || 0) + 1; });
    return '<small class="meta mk-reakcie">Reakcie na vaše vety: ' + Object.keys(poc).map(function (e) { return e + " " + poc[e]; }).join(" · ") + "</small>";
  }
  function otvorMaklera(id) {
    S.mkPohlad = id || null; S.hesloEdit = null; S.pochvalaEdit = null; S.hmData = null; S.hmViac = 0;
    if (!id) S.newUser = null;
    history.pushState({ tab: "makleri", mk: S.mkPohlad }, "", "#makleri");
    vykresliMaklerov(); window.scrollTo(0, 0);
  }
  function vykresliRiadkyMaklerov(prevzate) {
    var box = $("#mk-riadky"); if (!box) return;
    var q = normLok(S.mkHladat || "");
    var zoz = S.makleri.filter(function (m) { return !q || normLok((m.meno || "") + " " + (m.email || "")).indexOf(q) >= 0; })
      .sort(function (a, b) { return (b.aktivny - a.aktivny) || (a.rola === "admin" ? -1 : 0) - (b.rola === "admin" ? -1 : 0) || String(a.meno).localeCompare(String(b.meno), "sk"); });
    var vsetky = SEKCIE.length;
    box.innerHTML = zoz.length ? zoz.map(function (m) {
      var o = onlineStav(m.id), sek = m.rola === "admin" ? vsetky : (m.pristup || []).filter(function (x) { return SEKCIE.some(function (y) { return y[0] === x; }); }).length;
      return '<button type="button" class="mk-riadok' + (m.aktivny ? "" : " neaktivny") + '" data-mk-otvor="' + m.id + '">' + avatar(m.id, 42) +
        '<span class="mk-r-meno"><b>' + esc(m.meno || m.email) + (m.id === S.me.id ? ' <small class="meta">(vy)</small>' : "") + '</b><small class="meta">' + esc(m.email || "") + "</small></span>" +
        '<span class="mk-r-rola"><span class="chip' + (m.rola === "admin" ? " chip-admin" : "") + '">' + (m.rola === "admin" ? "Administrátor" : rodMaklera(m) === "zena" ? "Maklérka" : "Maklér") + "</span>" +
          (m.aktivny ? "" : '<span class="chip chip-off">Deaktivovaný</span>') + "</span>" +
        '<span class="mk-r-stat"><b>' + (prevzate[m.id] || 0) + '</b><small>prevzatých</small></span>' +
        '<span class="mk-r-stat"><b>' + sek + "/" + vsetky + '</b><small>sekcií</small></span>' +
        '<span class="mk-r-online meta">' + o.html + "</span>" +
        '<span class="mk-r-upravit">Upraviť ›</span></button>';
    }).join("") : '<p class="meta">Nikoho som nenašiel.</p>';
    box.querySelectorAll("[data-mk-otvor]").forEach(function (b) { b.onclick = function () { otvorMaklera(b.dataset.mkOtvor); }; });
  }
  function vykresliMaklerov() {
    var el = $("#obsah"); if (!el || !admin()) return;
    var prevzate = {}, hovory = {};
    Object.values(S.prev).forEach(function (p) { if (p.makler_id) prevzate[p.makler_id] = (prevzate[p.makler_id] || 0) + 1; });
    var MOZNOSTI = [[0, "Vypnuté"], [15, "15 minút"], [30, "30 minút"], [60, "1 hodina"], [120, "2 hodiny"], [240, "4 hodiny"], [480, "8 hodín"]];
    if (S.odhlMin && !MOZNOSTI.some(function (x) { return x[0] === S.odhlMin; })) MOZNOSTI.push([S.odhlMin, S.odhlMin + " minút"]);
    var pohlad = S.mkPohlad || null, mkDetail = pohlad && pohlad !== "novy" ? S.mById[pohlad] : null;
    if (pohlad && pohlad !== "novy" && !mkDetail) { pohlad = S.mkPohlad = null; }
    var aktivni = S.makleri.filter(function (m) { return m.aktivny; }).length;
    var hz = '<div class="box mk-zoznam-box"><div class="vykon-hlava"><h3>👥 Makléri <span class="meta">' + aktivni + " aktívnych" + (S.makleri.length > aktivni ? " · " + (S.makleri.length - aktivni) + " deaktivovaných" : "") + "</span></h3>" +
      '<div class="nehn-akcie"><input type="search" id="mk-hladat" placeholder="Hľadať meno alebo email…" value="' + esc(S.mkHladat || "") + '" aria-label="Hľadať makléra">' +
      '<button class="btn primary" type="button" data-mk-otvor="novy">+ Pridať makléra</button></div></div><div class="mk-riadky" id="mk-riadky"></div></div>';
    var h = '<details class="box mk-tim-nast"' + (S.mkNastOtv ? " open" : "") + '><summary><b>⚙️ Nastavenia tímu</b><span class="meta">automatické odhlásenie, odkaz na hlavnej obrazovke, správa a pochvala pre všetkých, novinky v aplikácii</span></summary>' +
      '<div class="box odhl-nast"><div><h3>⏱ Automatické odhlásenie</h3><p class="meta">Maklér, ktorý nič nerobí, sa po nastavenom čase odhlási. Minútu pred odhlásením ho upozorníme. Platí pre všetkých vrátane vás.</p></div>' +
      '<select id="odhl-min" aria-label="Čas automatického odhlásenia">' + MOZNOSTI.map(function (x) {
        return '<option value="' + x[0] + '"' + (x[0] === S.odhlMin ? " selected" : "") + ">" + x[1] + "</option>";
      }).join("") + "</select></div>";
    var ok0 = S.odkaz || { text: "", zapnuty: false };
    h += '<form class="box odkaz-nast" id="f-odkaz"><h3>📣 Odkaz pre všetkých</h3>' +
      '<p class="meta">Jedna veta, ktorú uvidia všetci makléri na hlavnej obrazovke – napríklad cieľ mesiaca alebo pochvala tímu.</p>' +
      '<div class="odkaz-riadok"><input type="text" id="odkaz-text" maxlength="300" value="' + esc(ok0.text) + '" placeholder="napr. Tento mesiac ideme na 10 nových zmlúv – držím palce!">' +
      '<label class="toggle"><input type="checkbox" id="odkaz-zap"' + (ok0.zapnuty ? " checked" : "") + "> Zobraziť</label>" +
      '<button class="btn primary" type="submit">Uložiť</button></div></form>';
    h += '<form class="box odkaz-nast" id="f-vsetkym"><h3>📣 Správa a pochvala pre celý tím</h3>' +
      '<p class="meta">Každému maklérovi pri najbližšom otvorení vyskočí okno – ako pochvala (s konfetami) alebo dôležitý oznam.</p>' +
      '<textarea id="vsetkym-text" rows="2" maxlength="800" placeholder="napr. Tím, rekordný mesiac – 12 nových zmlúv! Ďakujem každému z vás 🙌"></textarea>' +
      '<div class="form-actions"><button class="btn primary" type="button" data-vsetkym="tim">⭐ Pochváliť celý tím</button><button class="btn" type="button" data-vsetkym="oznam">📣 Poslať oznam všetkým</button></div></form>' +
      '<div class="box mk-spr-vsetci"><div><h3>🧭 Prehliadka aplikácie pre všetkých</h3><p class="meta">Každému maklérovi sa pri najbližšom otvorení aplikácie znova spustí sprievodca. Jednotlivo ju zapnete v detaile makléra.</p></div>' +
        '<button class="btn primary" type="button" id="spr-vsetkym">Zapnúť prehliadku všetkým</button></div>' +
      '<div class="box"><h3>✨ Novinky v aplikácii</h3><p class="meta">Keď pribudne nová funkcia, napíšte ju sem. Každému maklérovi pri ďalšom otvorení vyskočí okno „Ahoj, máš nové funkcie“ s tlačidlom, ktoré ho na funkciu rovno zavedie.</p>' +
      '<div id="novinky-adm"></div></div></details>';
    var hTim = h; h = "";
    h += '<form class="box" id="f-novy"><h3>Pridať makléra</h3><div class="form-grid">' +
      '<label class="field"><span>Meno a priezvisko</span><input type="text" id="n-meno" required></label>' +
      '<label class="field"><span>Email (prihlasovacie meno)</span><input type="email" id="n-email" required autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false" inputmode="email"></label>' +
      '<label class="field"><span>Heslo</span><input type="text" id="n-heslo" minlength="8" required autocomplete="off" value="' + noveHeslo() + '"></label>' +
      '<label class="field"><span>Rola</span><select id="n-rola"><option value="makler">Maklér</option><option value="admin">Administrátor</option></select></label>' +
      "</div>" +
      '<div class="field"><span>Fotka</span><div class="foto-volba" data-foto-kde="novy"><span id="novy-nahlad"></span>' +
      '<div class="foto-btns"><label class="btn">Nahrať fotku<input type="file" accept="image/*" data-foto-subor hidden></label>' +
      '<button class="btn ghost" type="button" data-foto="avatar:zena"><span class="av mini">' + SVG_ZENA + '</span> Žena</button>' +
      '<button class="btn ghost" type="button" data-foto="avatar:muz"><span class="av mini">' + SVG_MUZ + '</span> Muž</button>' +
      '<button class="btn ghost" type="button" data-foto="">Bez fotky</button></div></div></div>' +
      '<div class="form-actions"><button class="btn primary" type="submit">Vytvoriť účet</button></div>' +
      (S.newUser ? '<div class="note">' + (S.newUser.zmena ? "Heslo je zmenené." : "Účet je vytvorený.") + ' Pošlite maklérovi: <b>' + esc(location.origin + location.pathname) + "</b> · email <b>" + esc(S.newUser.email) +
        "</b> · heslo <b>" + esc(S.newUser.heslo) + '</b> <button class="btn" type="button" id="n-copy">Kopírovať</button></div>' : "") + "</form>";
    var hNovy = h; h = "";
    h += '<div class="mk-list">' + (mkDetail ? [mkDetail] : []).map(function (m) {
        var ja = m.id === S.me.id;
        return '<div class="mk-card" data-m="' + m.id + '" data-strazit>' +
          '<div class="mk-foto">' + fotoVolba("makler", m.id) + "</div>" +
          '<div class="mk-hlavne"><input type="text" data-f="meno" value="' + esc(m.meno) + '" aria-label="Meno"><div class="meta">' + esc(m.email || "") +
          " · prevzatých " + (prevzate[m.id] || 0) + '</div><div class="meta mk-online">' + onlineStav(m.id).html + "</div></div>" +
          '<div class="mk-prava"><select data-f="pohlavie" aria-label="Rod (pre text SMS)"><option value="muz"' + (rodMaklera(m) === "muz" ? " selected" : "") + '>Muž</option><option value="zena"' + (rodMaklera(m) === "zena" ? " selected" : "") + ">Žena</option></select>" +
          '<select data-f="rola"' + (ja ? " disabled" : "") + ' aria-label="Rola"><option value="makler"' + (m.rola === "makler" ? " selected" : "") + '>Maklér</option><option value="admin"' + (m.rola === "admin" ? " selected" : "") + ">Administrátor</option></select>" +
          '<label class="toggle"><input type="checkbox" data-f="aktivny"' + (m.aktivny ? " checked" : "") + (ja ? " disabled" : "") + "> Aktívny</label>" +
          '<label class="toggle"><input type="checkbox" data-f="vidi"' + (m.vidi_podhodnotene || m.rola === "admin" ? " checked" : "") + (m.rola === "admin" ? " disabled" : "") + "> Vidí podhodnotené</label></div>" +
          '<div class="mk-pristup"><span class="meta">Vidí sekcie</span><div class="cipy">' + (m.rola === "admin" ? '<span class="meta">Administrátor vidí všetko vrátane Výkonu a Maklérov.</span>' :
            SEKCIE.map(function (x) { return '<button type="button" class="cip" data-pristup="' + x[0] + '" aria-pressed="' + ((m.pristup || []).indexOf(x[0]) >= 0) + '">' + x[1] + "</button>"; }).join("")) + "</div></div>" +
          '<div class="mk-heslo"><span class="meta">Heslo</span>' + bunkaHeslo(m) + "</div>" +
          '<div class="mk-spr"><img src="typek-hlava.png" alt="" width="40" height="40"><div><b>🧭 Prehliadka aplikácie</b><small class="meta">' +
            (m.sprievodca_videny ? "Videl" + (rodMaklera(m) === "zena" ? "a" : "") + " ju " + datum(m.sprievodca_videny) : "Spustí sa pri najbližšom otvorení aplikácie.") + "</small></div>" +
            (m.sprievodca_videny ? '<button class="btn primary" type="button" data-m-act="sprievodca">Zapnúť prehliadku znova</button>' : '<span class="chip">✓ Zapnutá</span>') + "</div>" +
          '<div class="mk-osobne"><label class="field"><span>Oslovenie na hlavnej obrazovke</span><input type="text" data-f="oslovenie" maxlength="40" value="' + esc(m.oslovenie || "") + '" placeholder="' + esc(String(m.meno || "").trim().split(/\s+/)[0] || "napr. Tina") + '"></label>' +
          '<label class="field"><span>Motivačné vety – každá na nový riadok, najviac 5 (každý deň sa ukáže iná)</span><textarea data-f="motivacia" rows="3" placeholder="napr. Každé „nie“ ťa posúva bližšie k „áno“.">' +
          esc(((S.osobne || {})[m.id] || {}).motivacia || "") + "</textarea>" + reakcieNaVety(m.id) + "</label></div>" +
          '<div class="mk-datumy">' +
          '<label class="field"><span>🎂 Narodeniny</span><input type="date" data-f="narodeniny" value="' + esc(m.narodeniny || "") + '"></label>' +
          '<label class="field"><span>🏆 V tíme od</span><input type="date" data-f="nastup" value="' + esc(m.nastup || "") + '"></label>' +
          '<label class="field"><span>🌷 Meniny (deň.mesiac)</span><input type="text" data-f="meniny" inputmode="decimal" maxlength="6" value="' + esc(m.meniny_den ? Number(m.meniny_den.slice(3)) + "." + Number(m.meniny_den.slice(0, 2)) + "." : "") + '" placeholder="' + esc(meninyPodlaKalendara(m) || "napr. 9.9.") + '"></label>' +
          '<label class="field"><span>🎯 Cieľ hovorov / mesiac</span><input type="number" min="0" max="2000" data-f="ciel_hovory" value="' + esc(((S.osobne || {})[m.id] || {}).ciel_hovory || "") + '"></label>' +
          '<label class="field"><span>🎯 Cieľ získaných / mesiac</span><input type="number" min="0" max="200" data-f="ciel_ziskane" value="' + esc(((S.osobne || {})[m.id] || {}).ciel_ziskane || "") + '"></label></div>' +
          (S.pochvalaEdit === m.id ? '<div class="mk-pochvala"><textarea data-pochvala-text rows="2" maxlength="500" placeholder="napr. Super práca tento týždeň, 3 nové zmluvy! 💪"></textarea>' +
            '<button class="btn primary" type="button" data-m-act="pochvala-posli">Poslať pochvalu ⭐</button><button class="btn ghost" type="button" data-m-act="pochvala-zrus">Zrušiť</button></div>' : "") +
          '<details class="mk-sms"><summary>💬 Text SMS' + (m.sms_sablona ? "" : " <small>(pôvodný)</small>") + "</summary>" +
          '<div class="mk-sms-text">' + esc(m.sms_sablona || SMS_ZAKLAD) + '</div><div class="meta">Ukážka: ' + esc(vyplnSms(m.sms_sablona, ukazkaInzeratu(), m)) + "</div></details>" +
          '<div class="mk-akcie lepkave">' + (m.id !== S.me.id ? '<button class="btn ghost" type="button" data-m-act="pochvala">⭐ Pochváliť</button>' : "") + NEULOZENE +
          '<button class="btn primary ulozit" type="button" data-m-act="ulozit" data-ulozit>✓ Uložiť zmeny</button></div></div>';
      }).join("") + "</div>" +
      '<p class="meta">Administrátor vidí podhodnotené ponuky vždy. Maklérom ich zapnete v stĺpci „Vidí podhodnotené“. Deaktivovaný maklér sa neprihlási a nič nevidí. Prevzatý inzerát sa automaticky uvoľní, ak sa pri ňom 24 hodín nič nezapíše (nie pri budúcej pripomienke, dohodnutom stretnutí alebo získanom do ponuky) – maklérovi príde upozornenie do zvončeka aj emailom.</p>';
    var spat = '<button class="btn ghost mk-spat" type="button" data-mk-otvor="">← Všetci makléri</button>';
    if (mkDetail) el.innerHTML = spat + '<div class="mk-detail-hl">' + avatar(mkDetail.id, 54) + "<div><h2>" + esc(mkDetail.meno || mkDetail.email) + '</h2><span class="meta">' + esc(mkDetail.email || "") + " · " +
      (mkDetail.rola === "admin" ? "administrátor" : rodMaklera(mkDetail) === "zena" ? "maklérka" : "maklér") + (mkDetail.aktivny ? "" : " · deaktivovaný") + "</span></div></div>" + h + sekciaHistorieMaklera(mkDetail.id);
    else if (pohlad === "novy") el.innerHTML = spat + hNovy;
    else el.innerHTML = hz + hTim + (S.newUser ? hNovy : "");
    if ($("#mk-riadky")) vykresliRiadkyMaklerov(prevzate);
    napojHistoriu(el);
    if ($("#hm-box")) vykresliHistoriuMaklera();
    var hl = $("#mk-hladat"); if (hl) hl.oninput = function () { S.mkHladat = this.value; vykresliRiadkyMaklerov(prevzate); };
    var tn = el.querySelector(".mk-tim-nast"); if (tn) tn.ontoggle = function () { S.mkNastOtv = tn.open; if (tn.open) vykresliNovinkyAdm(); };
    if (tn && tn.open) vykresliNovinkyAdm();
    el.querySelectorAll("[data-mk-otvor]").forEach(function (b) { b.onclick = function () { otvorMaklera(b.dataset.mkOtvor || null); }; });
    if ($("#novy-nahlad")) vykresliNahladNoveho();
    el.querySelectorAll("[data-vsetkym]").forEach(function (b) {
      b.onclick = async function () {
        var t = $("#vsetkym-text").value.trim(); if (!t) return toast("Napíšte text.", true);
        try { var n = await rpc("pochvalit_vsetkych", { p_text: t, p_typ: b.dataset.vsetkym }); $("#vsetkym-text").value = "";
          toast((b.dataset.vsetkym === "tim" ? "⭐ Pochvala odoslaná " : "📣 Oznam odoslaný ") + n + (n === 1 ? " maklérovi." : " maklérom.")); konfety({ pocet: 90 }); }
        catch (err) { toast(chybaText(err), true); }
      };
    });
    el.querySelectorAll("[data-pristup]").forEach(function (b) {
      b.onclick = async function () {
        var id = b.closest("[data-m]").dataset.m, m = S.mById[id]; if (!m) return;
        var nove = (m.pristup || []).slice(), ix = nove.indexOf(b.dataset.pristup);
        if (ix >= 0) nove.splice(ix, 1); else nove.push(b.dataset.pristup);
        b.disabled = true;
        try { await rpc("nastavit_pristup_maklera", { p_id: id, p_pristup: nove }); m.pristup = nove; b.setAttribute("aria-pressed", String(ix < 0));
          toast((m.meno || "Maklér") + (ix < 0 ? " teraz vidí: " : " už nevidí: ") + b.textContent); }
        catch (err) { toast(chybaText(err), true); }
        b.disabled = false;
      };
    });
    if ($("#spr-vsetkym")) $("#spr-vsetkym").onclick = async function () {
      if (!confirm2("Zapnúť prehliadku aplikácie znova všetkým maklérom? Spustí sa im pri najbližšom otvorení.")) return;
      this.disabled = true;
      try { var n = await rpc("obnovit_sprievodcu", { p_id: null }); await nacitajMaklerov(); toast("🧭 Prehliadka je zapnutá " + n + (n === 1 ? " maklérovi." : " maklérom.")); }
      catch (err) { toast(chybaText(err), true); }
      this.disabled = false;
    };
    if ($("#f-odkaz")) $("#f-odkaz").addEventListener("submit", async function (e) {
      e.preventDefault();
      var t = $("#odkaz-text").value, z = $("#odkaz-zap").checked;
      if (z && !t.trim()) return toast("Napíšte text odkazu.", true);
      try { await rpc("nastavit_odkaz", { p_text: t, p_zapnuty: z }); await nacitajNastavenia(); toast(z ? "Odkaz sa zobrazuje všetkým." : "Odkaz je uložený a skrytý."); }
      catch (err) { toast(chybaText(err), true); }
    });
    if ($("#odhl-min")) $("#odhl-min").onchange = async function () {
      var v = Number(this.value);
      try { await rpc("nastavit_odhlasenie", { p_min: v }); S.odhlMin = v; zaznamenajAktivitu(true); tikOdpocet(); toast(v ? "Automatické odhlásenie: po " + this.options[this.selectedIndex].text + " nečinnosti." : "Automatické odhlásenie je vypnuté."); }
      catch (err) { toast(chybaText(err), true); }
    };
    if ($("#n-copy")) $("#n-copy").onclick = function () {
      var t = "Skener Alpha Reality: " + location.origin + location.pathname + "\nEmail: " + S.newUser.email + "\nHeslo: " + S.newUser.heslo;
      navigator.clipboard.writeText(t).then(function () { toast("Skopírované."); }, function () { toast("Kopírovanie nefunguje – označte text ručne.", true); });
    };
    if ($("#f-novy")) $("#f-novy").addEventListener("submit", async function (e) {
      e.preventDefault();
      var btn = e.target.querySelector('button[type="submit"]'); btn.disabled = true;
      var email = $("#n-email").value.trim().toLowerCase(), heslo = $("#n-heslo").value;
      try {
        var nov = await funkcia({ akcia: "vytvorit", meno: $("#n-meno").value, email: email, heslo: heslo, rola: $("#n-rola").value });
        if (S.novyFoto) await rpc("nastavit_foto", { p_id: nov.id, p_foto: S.novyFoto });
        S.novyFoto = null;
        S.newUser = { email: email, heslo: heslo }; S.hesla[nov.id] = heslo;
        await nacitajMaklerov(); toast("Účet je vytvorený.");
        S.mkPohlad = null;
      } catch (err) { toast(chybaText(err), true); btn.disabled = false; return; }
      vykresliMaklerov();
    });
  }

  // ------------------------------------------------------------ HLAVNÁ OBRAZOVKA
  function ikona(nazov) {
    var I = {
      skener: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5 10v9h5"/><circle cx="16" cy="16" r="3.2"/><path d="m18.4 18.4 2.6 2.6"/>',
      sch: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3.5 7 8.5 6 8.5-6"/>',
      nehn: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M10 21v-6h4v6"/>',
      matterport: '<path d="M4 8.5h3l1.6-2.5h6.8L17 8.5h3a1 1 0 0 1 1 1V18a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5a1 1 0 0 1 1-1z"/><circle cx="12" cy="13.5" r="3.4"/><path d="M18 11h.01"/>',
      chat: '<path d="M20.5 12a8.5 8.5 0 0 1-12.3 7.6L3.5 21l1.4-4.4A8.5 8.5 0 1 1 20.5 12z"/><path d="M8.5 12h.01M12 12h.01M15.5 12h.01"/>',
      zvon: '<path d="M6 9a6 6 0 1 1 12 0c0 6.5 2.5 8 2.5 8h-17S6 15.5 6 9"/><path d="M10.2 20.5a2 2 0 0 0 3.6 0"/>',
      vykon: '<path d="M3 21h18"/><rect x="5" y="11" width="3" height="7" rx=".5"/><rect x="10.5" y="5" width="3" height="13" rx=".5"/><rect x="16" y="13.5" width="3" height="4.5" rx=".5"/>',
      makleri: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20.5a6.5 6.5 0 0 1 13 0"/><circle cx="17.2" cy="9" r="2.6"/><path d="M16.5 14.3a5 5 0 0 1 5 5"/>',
      profil: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
      kal: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/><path d="M8 14h2M14 14h2M8 17.5h2"/>',
      mapa: '<path d="M9 4 3.5 6v14L9 18l6 2 5.5-2V4L15 6z"/><path d="M9 4v14M15 6v14"/>',
      kataster: '<path d="M4 4h16v16H4z"/><path d="M4 11h7v9M11 4v7h9M15 11v9"/>',
      farby: '<path d="M12 3.5a8.5 8.5 0 1 0 0 17c1.3 0 1.9-.9 1.6-2-.3-1.2.4-2.2 1.7-2.2h2.2a3 3 0 0 0 3-3A8.6 8.6 0 0 0 12 3.5z"/><circle cx="7.6" cy="11" r="1.1"/><circle cx="10.5" cy="7.4" r="1.1"/><circle cx="15" cy="7.8" r="1.1"/>',
      poloha: '<path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.4"/>',
      lv: '<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4M9.5 12h6M9.5 15.5h6M9.5 8.5h2.5"/>',
      urad: '<path d="M3 9.5 12 4l9 5.5M4.5 20h15M6 10v8M10 10v8M14 10v8M18 10v8"/>',
      satelit: '<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><path d="m3.5 16 5-5 4 4 2.5-2.5 5.5 5.5"/><circle cx="15.5" cy="9" r="1.6"/>',
      vrstvy: '<path d="m12 4 8.5 4.5L12 13 3.5 8.5z"/><path d="m3.5 12.5 8.5 4.5 8.5-4.5M3.5 16.5 12 21l8.5-4.5"/>',
      ai: '<path d="M12 3.5 13.8 8l4.7 1.8-4.7 1.8L12 16l-1.8-4.4L5.5 9.8 10.2 8z"/><path d="M18.5 15.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"/>',
      web: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.6 2.4 3.8 5.2 3.8 8.5s-1.2 6.1-3.8 8.5c-2.6-2.4-3.8-5.2-3.8-8.5s1.2-6.1 3.8-8.5"/>',
      hviezda: '<path d="m12 3.5 2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.8l-5.2 2.8 1-5.8-4.3-4.1 5.9-.8z"/>',
      domov: '<path d="M3 11 12 3.5 21 11"/><path d="M5.5 9.5V20h13V9.5"/>',
      euro: '<circle cx="12" cy="12" r="8.5"/><path d="M15.5 8.6a4.2 4.2 0 1 0 0 6.8"/><path d="M7.5 10.8h5.5M7.5 13.2h5.5"/>',
      historia: '<path d="M3.5 12a8.5 8.5 0 1 0 2.5-6"/><path d="M3.5 4.5V9h4.5"/><path d="M12 7.5V12l3 2"/>',
      klienti: '<circle cx="9" cy="8" r="3.6"/><path d="M2.5 20.5a6.5 6.5 0 0 1 9.6-5.7"/><circle cx="17" cy="15.5" r="3.4"/><path d="m19.5 18 2.3 2.3"/>',
    };
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + I[nazov] + "</svg>";
  }
  function vykresliDomov() {
    var el = $("#obsah"); if (!el) return;
    var akt = S.inz.filter(function (z) { return z.aktivny; });
    var sukr = akt.filter(function (z) { return ptyp(z) !== "rk"; });
    var volne = sukr.filter(function (z) { return !(S.prev[z.id] && S.prev[z.id].makler_id); }).length;
    var den = Date.now() - 864e5, nove = sukr.filter(function (z) { return new Date(z.prvy_krat).getTime() > den; }).length;
    var moje = Object.values(S.prev).filter(function (p) { return p.makler_id === S.me.id; }).length;
    var sch = S.sch.filter(function (r) { return !r.zmazane; }).length;
    var prip = splatne().length, pripVsetky = mojeAktivne().length;
    var neprec = pocetNeprecitanych();
    var krstne = oslovenie(S.me);
    var mot = ((S.osobne || {})[S.me.id] || {}).motivacia || "", vety = mot.split("\n").filter(function (x) { return x.trim(); });
    var dnesIdx = Math.floor((Date.now() - new Date().getTimezoneOffset() * 60000) / 864e5);
    var veta = vety.length ? vety[dnesIdx % vety.length] : "";
    var autorVety = ((S.osobne || {})[S.me.id] || {}).autor;
    var odkaz = S.odkaz && S.odkaz.zapnuty && S.odkaz.text ? S.odkaz : null;
    var dnesK = new Date(), mdK = String(dnesK.getMonth() + 1).padStart(2, "0") + "-" + String(dnesK.getDate()).padStart(2, "0");
    var meninyDnes = (window.MENINY || {})[mdK] || [];
    var oslavy = S.oslavy || [], mojeO = oslavy.filter(function (x) { return x.makler_id === S.me.id; }), cudzie = oslavy.filter(function (x) { return x.makler_id !== S.me.id; });
    var mojaOslava = mojeO.map(function (x) {
      return x.typ === "narodeniny" ? "🎂 Všetko najlepšie k narodeninám, " + krstne + "!" :
        x.typ === "meniny" ? "🌷 Všetko najlepšie k meninám, " + krstne + "!" :
        "🏆 Dnes je to " + x.roky + (x.roky === 1 ? " rok" : x.roky <= 4 ? " roky" : " rokov") + ", čo si s nami. Ďakujeme!";
    });
    var mes = S.mesiac || {};
    function kruh(hodnota, ciel, popis) {
      var p = Math.min(1, hodnota / ciel), obvod = 2 * Math.PI * 30;
      return '<div class="kruh' + (p >= 1 ? " splnene" : "") + '" title="' + esc(popis + ": " + hodnota + " z " + ciel) + '"><svg viewBox="0 0 72 72" aria-hidden="true"><circle cx="36" cy="36" r="30" class="k-pod"/>' +
        '<circle cx="36" cy="36" r="30" class="k-post" style="stroke-dasharray:' + obvod.toFixed(1) + ";stroke-dashoffset:" + (obvod * (1 - p)).toFixed(1) + ";--obvod:" + obvod.toFixed(1) + '"/></svg>' +
        '<div class="k-text"><b>' + hodnota + "</b><small>z " + ciel + "</small></div><span>" + esc(popis) + "</span></div>";
    }
    var kruhy = (mes.ciel_hovory ? kruh(mes.hovory || 0, mes.ciel_hovory, "Hovory") : "") + (mes.ciel_ziskane ? kruh(mes.ziskane || 0, mes.ciel_ziskane, "Získané") : "");
    var mojDen = mojDenHtml();
    var dnes = new Date().toLocaleDateString("sk-SK", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    var dlazdice = [
      ["inzeraty", "skener", "Realitný skener", "Súkromné inzeráty z Bazoša, Nehnuteľností, Reality.sk a TopReality", nf.format(volne) + " voľných súkromných", nove ? nove + (nove === 1 ? " nový" : nove <= 4 ? " nové" : " nových") + " za 24 h" : "", moje ? "Moje: " + moje : ""],
      ["schrankovanie", "sch", "Schránkovanie", "Majitelia z letákov a schránok – kontakty, stav, poznámky", nf.format(sch) + (sch === 1 ? " záznam" : sch >= 2 && sch <= 4 ? " záznamy" : " záznamov"), "", ""],
      ["nehnutelnosti", "nehn", "Nehnuteľnosti", "Ponuka kancelárie – pridávanie, fotky, majiteľ a zmluva", S.ponuky ? S.ponuky.filter(function (x) { return skupinaStavu(x.stav) === "aktivne"; }).length + " aktívnych ponúk" : "Ponuka kancelárie", "", ""],
      ["klienti", "klienti", "Klienti a dopyty", "Čo hľadajú vaši klienti – samo sa páruje s ponukami a inzerátmi", S.dopyty ? S.dopyty.filter(function (d) { return d.stav === "aktivny" && d.makler_id === S.me.id; }).length + " mojich aktívnych" : "Dopyty klientov", "", ""],
      ["chat", "chat", "Chat", "Správy celému tímu aj súkromne kolegovi", neprec ? neprec + (neprec === 1 ? " neprečítaná správa" : neprec <= 4 ? " neprečítané správy" : " neprečítaných správ") : "Všetko prečítané", "", ""],
      ["matterport", "matterport", "Matterport", "Rezervácia 3D kamery – klik na deň a hodinu", S.mp ? mpStavText() : "Rezervácia kamery", "", ""],
      ["kalendar", "kal", "Kalendár", "Stretnutia, obhliadky a pripomienky – aj v Google a Apple kalendári", (function () { var n = polozkyKalendara().filter(function (x) { return denKluc(x.od) === denKluc(new Date()); }).length; return n ? n + " dnes" : "Dnes voľno"; })(), "", ""],
      ["mapa", "mapa", "Realitná mapa", "Naše ponuky a súkromní predajcovia na mape", "", "", ""],
      ["kataster", "kataster", "Kataster", "Katastrálna mapa, list vlastníctva, parcela podľa GPS", "", "", ""],
      ["asistent", "ai", "AI asistent", "Popisy, príspevky, SMS a odpovede klientom", "", "", ""],
      ["recenzie", "hviezda", "Recenzie", "Hodnotenia klientov – zbierajte ich jedným odkazom", "", "", ""],
      ["web", "web", "Osobný web", "Vaša stránka s ponukami a recenziami", "", "", ""],
      ["zvon", "zvon", "Pripomienky", "Komu a kedy zavolať, upozornenia na zníženie ceny", prip ? prip + " čaká na vás" : pripVsetky ? pripVsetky + " naplánovaných" : "Nič nečaká", "", ""],
      ["profil", "profil", "Môj profil", "Fotka, text SMS, heslo, skener na ploche mobilu", "", "", ""],
    ];
    dlazdice = dlazdice.filter(function (d) { return ["zvon", "profil"].indexOf(d[0]) >= 0 || maSekciu(d[0]); });
    if (admin()) {
      dlazdice.push(["vykon", "vykon", "Výkon maklérov", "Hovory, SMS, výsledky a grafy – len pre vás", "", "", ""]);
      dlazdice.push(["makleri", "makleri", "Makléri", "Účty, práva, heslá a texty SMS", S.makleri.filter(function (m) { return m.aktivny; }).length + " aktívnych", "", ""]);
    }
    el.innerHTML = '<div class="domov">' + (admin() && skenerStoji() ? '<div class="sk-stav zle"><span>⚠️ <b>Skener ' + vekText(skenerStoji()) + " nekontroloval portály</b> – nové inzeráty sa neobjavujú.</span>" +
      '<a class="btn" href="#inzeraty">Pozrieť a opraviť</a></div>' : "") +
      '<section class="hero' + (mojeO.length ? " oslava" : "") + '"><div class="hero-hlava"><span class="hero-foto">' + avatar(S.me.id, 76) + "</span>" +
      '<div class="hero-text"><div class="hero-dnes">' + esc(dnes.charAt(0).toUpperCase() + dnes.slice(1)) + (meninyDnes.length ? ' · meniny má <b>' + esc(meninyDnes.join(", ")) + "</b>" : "") + "</div>" +
      "<h2>Ahoj" + (krstne ? ", " + esc(krstne) : "") + ' <span class="mava" aria-hidden="true">👋</span></h2>' +
      '<div class="hero-prianie">' + esc(prianieDna(S.me)) + "</div>" +
      mojaOslava.map(function (t) { return '<div class="hero-oslava">' + esc(t) + "</div>"; }).join("") + "</div>" +
      (kruhy ? '<div class="hero-ciel"><div class="hero-ciel-n">Môj cieľ – ' + esc(new Date().toLocaleDateString("sk-SK", { month: "long" })) + '</div><div class="kruhy">' + kruhy + "</div></div>" : "") + "</div>" +
      (veta ? '<figure class="hero-veta"><blockquote>' + esc(veta) + "</blockquote>" +
        (autorVety && S.mById[autorVety] && autorVety !== S.me.id ? "<figcaption>— " + esc(oslovenie(S.mById[autorVety])) + "</figcaption>" : "") +
        reakcieBar("veta:" + S.me.id + ":" + hashTextu(veta)) + "</figure>" : "") +
      (!kruhy ? '<img class="hero-typek" src="typek-postava.png" alt="" width="563" height="640">' : "") +
      '<div class="hero-znak">Realitný <span>týpek</span></div></section>' +
      (cudzie.length ? '<div class="oslavy-ini">' + cudzie.map(function (x) {
        var m = S.mById[x.makler_id], o = oslovenie(m);
        var t = x.typ === "narodeniny" ? "🎂 Dnes má narodeniny <b>" + esc(o) + "</b>" : x.typ === "meniny" ? "🌷 Dnes má meniny <b>" + esc(o) + "</b>" :
          "🏆 <b>" + esc(o) + "</b> je s nami už " + x.roky + (x.roky === 1 ? " rok" : x.roky <= 4 ? " roky" : " rokov");
        return '<div class="oslava-riadok">' + avatar(x.makler_id, 34) + "<span>" + t + '</span><button class="btn" type="button" data-zablahozelat="' + esc(x.makler_id) + '" data-typ="' + x.typ + '">Zablahoželať 🎉</button></div>';
      }).join("") + "</div>" : "") +
      (odkaz ? '<div class="odkaz-vsetci"><span class="odkaz-ikona" aria-hidden="true">📣</span><div class="odkaz-telo"><b>' + esc(odkaz.text) + "</b>" +
        (odkaz.autor && S.mById[odkaz.autor] ? "<small>" + esc(S.mById[odkaz.autor].meno) + "</small>" : "") + reakcieBar("odkaz:" + hashTextu(odkaz.text)) + "</div></div>" : "") +
      kalendarDomovHtml() + mojDen +
      '<div class="dlazdice">' + dlazdice.map(function (d) {
        var upozorni = (d[0] === "chat" && neprec) || (d[0] === "zvon" && prip);
        return '<button type="button" class="dlazdica' + (upozorni ? " upozorni" : "") + '" data-domov="' + d[0] + '">' +
          '<span class="dl-ikona">' + ikona(d[1]) + (upozorni ? '<span class="dl-bod">' + (d[0] === "chat" ? neprec : prip) + "</span>" : "") + "</span>" +
          '<span class="dl-text"><b>' + esc(d[2]) + "</b><small>" + esc(d[3]) + "</small>" +
          (d[4] || d[5] || d[6] ? '<span class="dl-stav">' + [d[4], d[5], d[6]].filter(Boolean).map(esc).join(" · ") + "</span>" : "") + "</span></button>";
      }).join("") + "</div></div>";
    if (mojeO.length) {
      var kl = "typek-oslava-" + mdK + "-" + new Date().getFullYear();
      var uz = false; try { uz = localStorage.getItem(kl); localStorage.setItem(kl, "1"); } catch (e2) { /* bez úložiska */ }
      if (!uz) setTimeout(function () { konfety({ pocet: 220 }); }, 500);
    }
  }
  // ---------- pozdrav podľa dňa v týždni, sviatkov a významných dní
  function velkaNoc(rok) {
    var a = rok % 19, b = Math.floor(rok / 100), c = rok % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
    var h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
    var mes = Math.floor((h + l - 7 * m + 114) / 31), den = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(rok, mes - 1, den);
  }
  function nNedela(rok, mesiac, n) { var d = new Date(rok, mesiac, 1); d.setDate(1 + (7 - d.getDay()) % 7 + 7 * (n - 1)); return d; }
  function prianieDna(m) {
    var d = new Date(); d.setHours(0, 0, 0, 0);
    var md = (d.getMonth() + 1) + "-" + d.getDate(), rok = d.getFullYear(), zena = rodMaklera(m) === "zena";
    function rovnaky(x) { return x.getMonth() === d.getMonth() && x.getDate() === d.getDate(); }
    var vn = velkaNoc(rok), vp = new Date(vn), vpon = new Date(vn); vp.setDate(vn.getDate() - 2); vpon.setDate(vn.getDate() + 1);
    // sviatky – celé prianie
    var SVIATKY = {
      "1-1": "Šťastný nový rok! Nech je plný úspešných obchodov 🥂",
      "1-6": "Pekný sviatok Troch kráľov ti prajem 👑",
      "5-1": "Pekný Sviatok práce ti prajem – dnes si oddýchni 🌸",
      "5-8": "Dnes je Deň víťazstva nad fašizmom. Pekný deň ti prajem.",
      "7-5": "Pekný sviatok sv. Cyrila a Metoda ti prajem.",
      "8-29": "Dnes je výročie SNP. Pekný deň ti prajem.",
      "9-1": "Dnes je Deň Ústavy SR. Pekný deň ti prajem.",
      "9-15": "Pokojný sviatok Sedembolestnej Panny Márie ti prajem.",
      "11-1": "Pokojný Sviatok všetkých svätých ti prajem 🕯️",
      "11-2": "Dnes je Pamiatka zosnulých. Pokojný deň ti prajem 🕯️",
      "11-17": "Dnes je Deň boja za slobodu a demokraciu. Pekný deň ti prajem.",
      "12-24": "Krásny Štedrý deň a pokojné Vianoce ti prajem! 🎄",
      "12-25": "Pokojné a požehnané Vianoce ti prajem! 🎄",
      "12-26": "Pokojné vianočné sviatky ti prajem! 🎄",
      "12-31": "Pekného Silvestra a šťastný vstup do nového roka! 🥂",
      "2-14": "Pekný Valentín ti prajem! ❤️",
    };
    if (rovnaky(vp)) return "Pokojný Veľký piatok ti prajem.";
    if (rovnaky(vn) || rovnaky(vpon)) return "Krásnu a pokojnú Veľkú noc ti prajem! 🐣";
    if (md === "3-8") return zena ? "Všetko najlepšie k MDŽ! 🌷" : "Pekný deň ti prajem – a dnes nezabudni na kvety, je MDŽ 🌷";
    if (SVIATKY[md]) return SVIATKY[md];
    // dni v týždni – tri varianty, striedajú sa každý týždeň
    var DNI = [
      ["Príjemnú nedeľu ti prajem.", "Pokojnú nedeľu ti prajem – zajtra ideme na to!", "Krásnu nedeľu ti prajem."],
      ["Pekný pondelok ti prajem!", "Úspešný štart do týždňa ti prajem!", "Krásny pondelok – nech je tento týždeň plný dobrých obchodov."],
      ["Úspešný utorok ti prajem!", "Pekný utorok ti prajem.", "Prajem ti utorok plný dobrých telefonátov."],
      ["Peknú stredu ti prajem – sme v polovici týždňa!", "Úspešnú stredu ti prajem.", "Krásnu stredu – polovica týždňa je za nami!"],
      ["Príjemný štvrtok ti prajem.", "Úspešný štvrtok ti prajem!", "Pekný štvrtok – víkend sa už blíži."],
      ["Krásny piatok ti prajem – víkend už klope na dvere!", "Úspešný piatok a pekný víkend ti prajem!", "Pekný piatok – dotiahni týždeň a užij si víkend."],
      ["Pohodovú sobotu ti prajem.", "Peknú sobotu ti prajem – nezabudni si aj oddýchnuť.", "Krásnu sobotu ti prajem."],
    ];
    var tyzden = Math.floor((d - new Date(rok, 0, 1)) / (7 * 864e5));
    var t = DNI[d.getDay()][tyzden % 3];
    // významné dni – doplnok
    if (rovnaky(nNedela(rok, 4, 2))) t += " Dnes je Deň matiek – nezabudni na mamu 💐";
    else if (rovnaky(nNedela(rok, 5, 3))) t += " Dnes je Deň otcov 👔";
    else if (md === "6-1") t += " Dnes je Deň detí 🎈";
    else if (md === "12-6") t += " Je Mikuláš – snáď ti niečo nechal v čižme 🎅";
    return t;
  }
  function mojDenHtml() {
    var koniecDna = new Date(); koniecDna.setHours(23, 59, 59, 999);
    var prip = mojeAktivne().filter(function (p) { return new Date(p.cas) <= koniecDna; });
    var obce = S.me.obce || [], den = Date.now() - 864e5;
    var vObciach = obce.length ? S.inz.filter(function (z) { return z.aktivny && ptyp(z) !== "rk" && obce.indexOf(z.obec) >= 0; }) : [];
    var noveObce = vObciach.filter(function (z) { return new Date(z.prvy_krat).getTime() > den; });
    var volneObce = vObciach.filter(function (z) { return !(S.prev[z.id] && S.prev[z.id].makler_id); });
    var uvol = S.inz.filter(function (z) {
      var p = S.prev[z.id]; if (!p || p.makler_id !== S.me.id) return false;
      var c = casUvolnenia(z); return c && c.getTime() - Date.now() < 6 * 3600e3;
    });
    function stlpec(ikona, nadpis, obsah, akcia, tlacidlo) {
      return '<div class="md-stlpec"><div class="md-hlava"><span>' + ikona + "</span><b>" + nadpis + "</b></div>" + obsah +
        (akcia ? '<button class="btn-link" type="button" data-mojden="' + akcia + '">' + tlacidlo + " →</button>" : "") + "</div>";
    }
    return '<section class="moj-den"><h3>Môj deň</h3><div class="md-grid">' +
      stlpec("🔔", "Dnes volať", prip.length ? "<ul>" + prip.slice(0, 3).map(function (p) {
        return "<li><time>" + new Date(p.cas).toLocaleTimeString("sk-SK", { hour: "2-digit", minute: "2-digit" }) + "</time> " + esc((p.poznamka || "Pripomienka").slice(0, 70)) + "</li>";
      }).join("") + (prip.length > 3 ? '<li class="meta">+ ďalšie ' + (prip.length - 3) + "</li>" : "") + "</ul>" : '<p class="meta">Na dnes nemáte žiadne pripomienky.</p>', "zvon", "Pripomienky") +
      stlpec("📍", "V mojich obciach", obce.length ? '<p><b class="md-cislo">' + noveObce.length + "</b> " + (noveObce.length === 1 ? "nový súkromný" : noveObce.length >= 2 && noveObce.length <= 4 ? "nové súkromné" : "nových súkromných") +
        ' za 24 h<br><span class="meta">' + volneObce.length + " voľných spolu · " + esc(obce.slice(0, 3).join(", ")) + (obce.length > 3 ? " a ďalšie" : "") + "</span></p>" :
        '<p class="meta">Vyberte si obce, ktoré sledujete, a uvidíte tu nové súkromné inzeráty.</p>', obce.length ? "obce" : "profil", obce.length ? "Zobraziť inzeráty" : "Vybrať obce") +
      stlpec("⏳", "Uvoľní sa do 6 h", uvol.length ? "<ul>" + uvol.slice(0, 3).map(function (z) { return "<li>" + esc(z.nazov.slice(0, 60)) + "</li>"; }).join("") + "</ul>" :
        '<p class="meta">Žiadny váš inzerát sa v najbližších 6 hodinách neuvoľní.</p>', uvol.length ? "moje" : "", "Moje inzeráty") +
      "</div></section>";
  }
  document.addEventListener("click", function (e) {
    var md = e.target.closest("[data-mojden]");
    if (md) {
      var k = md.dataset.mojden;
      if (k === "zvon") { S.zvonOpen = true; S.pripForm = null; vykresliZvoncek(); window.scrollTo({ top: 0, behavior: "smooth" }); return; }
      if (k === "profil") { S.pwdOpen = true; vykresliHeslo(); window.scrollTo({ top: 0, behavior: "smooth" }); return; }
      if (k === "obce") { S.f.okres = "moje"; S.f.predajca = "sukr"; S.f.praca = "vsetky"; }
      if (k === "moje") { S.f.praca = "moje"; S.f.okres = ""; }
      ulozFiltre(); prejdi("inzeraty"); return;
    }
    var zb = e.target.closest("[data-zablahozelat]");
    if (zb) {
      var m = S.mById[zb.dataset.zablahozelat], o = oslovenie(m), typ = zb.dataset.typ;
      S.chatKoncept = typ === "narodeniny" ? "Všetko najlepšie k narodeninám, " + o + "! 🎂🎉" : typ === "meniny" ? "Všetko najlepšie k meninám, " + o + "! 🌷" : "Ďakujeme, že si s nami, " + o + "! 🏆";
      S.chatS = null; prejdi("chat"); return;
    }
  });
  document.addEventListener("click", function (e) {
    var d = e.target.closest("#obsah [data-domov]");
    if (!d) return;
    var k = d.dataset.domov;
    if (k === "zvon") { S.zvonOpen = true; S.pripForm = null; vykresliZvoncek(); window.scrollTo({ top: 0, behavior: "smooth" }); return; }
    if (k === "profil") { S.pwdOpen = true; vykresliHeslo(); window.scrollTo({ top: 0, behavior: "smooth" }); return; }
    prejdi(k);
  });

  // ------------------------------------------------------------ NEHNUTEĽNOSTI (ponuka kancelárie)
  var KATEGORIE = [["byty", "Byt", "🏢"], ["domy", "Dom", "🏠"], ["chaty", "Chata / chalupa", "🏡"], ["pozemky", "Pozemok", "🌳"],
    ["priestory", "Priestor", "🏬"], ["objekty", "Objekt", "🏭"], ["garaze", "Garáž", "🚗"]];
  var TYPY = {
    byty: ["Garsónka", "1-izbový byt", "2-izbový byt", "3-izbový byt", "4-izbový byt", "5 a viac izbový byt", "Mezonet", "Apartmán", "Loft", "Iný byt"],
    domy: ["Rodinný dom", "Vila", "Bungalov", "Dvojdom", "Radový dom", "Mobilný / modulový dom", "Rekreačný dom", "Zrub", "Farma / usadlosť", "Iný dom"],
    chaty: ["Chata", "Chalupa", "Záhradná chatka", "Rekreačné zariadenie"],
    pozemky: ["Stavebný pozemok – rodinné domy", "Stavebný pozemok – bytová výstavba", "Rekreačný pozemok", "Záhrada", "Sad / vinica", "Orná pôda",
      "Lúka / pasienok", "Les", "Komerčná zóna", "Priemyselná zóna", "Iný pozemok"],
    priestory: ["Kancelárie", "Obchodné priestory", "Reštaurácia", "Sklad", "Výrobné priestory", "Ubytovanie", "Ambulancia", "Iný priestor"],
    objekty: ["Hotel / penzión", "Polyfunkčný objekt", "Administratívna budova", "Skladový objekt", "Výrobný objekt", "Poľnohospodársky objekt", "Iný objekt"],
    garaze: ["Garáž", "Garážové státie", "Parkovacie miesto"],
  };
  var TYP_CENY = ["za nehnuteľnosť", "za m²", "za mesiac", "za mesiac + energie", "za rok", "dohodou", "na vyžiadanie"];
  var VLASTNICTVO = ["osobné", "družstevné", "obecné", "štátne", "firemné", "iné"];
  var STAV_OBJ = ["novostavba", "vo výstavbe", "developerský projekt", "kompletná rekonštrukcia", "čiastočná rekonštrukcia", "pôvodný stav", "na rekonštrukciu", "na zbúranie"];
  var KONSTRUKCIA = ["tehla", "panel", "drevostavba", "zrub", "kameň", "nepálená tehla", "skelet", "kombinovaná", "iná"];
  var ENERG = ["A0", "A1", "B", "C", "D", "E", "F", "G", "nemá", "v konaní"];
  var KURENIE = ["ústredné plynové", "elektrické", "tepelné čerpadlo", "tuhé palivo", "diaľkové (centrálne)", "podlahové", "kozub / krb", "solárne", "iné"];
  var ORIENT = ["S", "SV", "V", "JV", "J", "JZ", "Z", "SZ"];
  var VYBAVENIE = [
    ["Exteriér a príslušenstvo", ["balkón", "lodžia", "terasa", "záhrada", "pivnica", "komora", "garáž", "parkovacie miesto", "výťah", "bazén", "studňa"]],
    ["Interiér", ["zariadený", "čiastočne zariadený", "nezariadený", "klimatizácia", "krb", "bezbariérový", "šatník", "nová kuchyňa"]],
    ["Inžinierske siete", ["elektrina 230 V", "elektrina 400 V", "verejný vodovod", "vlastná studňa", "plyn", "verejná kanalizácia", "žumpa", "ČOV"]],
    ["Komunikácie", ["telefón", "internet", "satelit", "káblová TV", "optická sieť"]],
  ];
  var SPECIALNE = ["TOP", "Novinka", "Zľava", "Exkluzívne", "Rezervované čoskoro"];
  var STAVY_P = { koncept: ["Koncept", "na"], aktivne: ["Aktívne", "won"], rezervovane: ["Rezervované", "maybe"], predane: ["Predané", "lost"], neaktivne: ["Neaktívne", "na"], archiv: ["Archív", "na"] };
  // ktoré polia sa ukážu pri danej kategórii
  var POLIA = {
    byty: ["plocha_uzitkova", "izby", "poschodie", "pocet_podlazi", "rok_vystavby", "vlastnictvo", "stav_objektu", "konstrukcia", "energ_certifikat", "kurenie", "orientacia"],
    domy: ["plocha_uzitkova", "plocha_zastavana", "plocha_pozemku", "izby", "pocet_podlazi", "rok_vystavby", "vlastnictvo", "stav_objektu", "konstrukcia", "energ_certifikat", "kurenie", "orientacia"],
    chaty: ["plocha_uzitkova", "plocha_zastavana", "plocha_pozemku", "izby", "pocet_podlazi", "rok_vystavby", "vlastnictvo", "stav_objektu", "konstrukcia", "kurenie", "orientacia"],
    pozemky: ["plocha_pozemku", "vlastnictvo"],
    priestory: ["plocha_uzitkova", "poschodie", "pocet_podlazi", "vlastnictvo", "stav_objektu", "energ_certifikat", "kurenie"],
    objekty: ["plocha_uzitkova", "plocha_zastavana", "plocha_pozemku", "pocet_podlazi", "rok_vystavby", "vlastnictvo", "stav_objektu", "konstrukcia", "energ_certifikat", "kurenie"],
    garaze: ["plocha_uzitkova", "vlastnictvo"],
  };
  var CISELNE = { plocha_uzitkova: ["Úžitková plocha", "m²"], plocha_zastavana: ["Zastavaná plocha", "m²"], plocha_pozemku: ["Plocha pozemku", "m²"],
    izby: ["Počet izieb", ""], poschodie: ["Poschodie", "0 = prízemie"], pocet_podlazi: ["Počet podlaží budovy", ""], rok_vystavby: ["Rok výstavby / kolaudácie", ""] };
  var VYBERY = { vlastnictvo: ["Vlastníctvo", VLASTNICTVO], stav_objektu: ["Stav", STAV_OBJ], konstrukcia: ["Konštrukcia", KONSTRUKCIA],
    energ_certifikat: ["Energetický certifikát", ENERG], kurenie: ["Kúrenie", KURENIE] };
  var KROKY = [["druh", "Druh a cena"], ["lokalita", "Lokalita"], ["parametre", "Parametre"], ["fotky", "Fotky, video a text"], ["interne", "Interné a uloženie"]];

  async function nacitajPonuky() {
    var r = await vsetkyRiadky("nehnutelnosti", "*", "id");
    S.ponuky = r.sort(function (a, b) { return String(b.upravene).localeCompare(String(a.upravene)); });
    var ri = await vsetkyRiadky("nehnutelnosti_interne", "*", "nehnutelnost_id");
    var o = {}; ri.forEach(function (x) { o[x.nehnutelnost_id] = x; }); S.ponukyInt = o;
    await nacitajNastrojePonuk();
  }
  function fotkaUrl(f) {
    if (!f) return "";
    if (f.url) return f.url;
    return CFG.supabaseUrl + "/storage/v1/object/public/ponuky/" + f.cesta;
  }
  function nazovPonuky(p) { return p.nazov || [p.typ || "Nehnuteľnosť", p.obec].filter(Boolean).join(", "); }
  function cenaPonuky(p) {
    if (p.typ_ceny === "dohodou" || p.typ_ceny === "na vyžiadanie") return p.cena ? eur(p.cena) + " · " + p.typ_ceny : p.typ_ceny.charAt(0).toUpperCase() + p.typ_ceny.slice(1);
    return p.cena ? eur(p.cena) + (p.typ_ceny && p.typ_ceny !== "za nehnuteľnosť" ? " " + p.typ_ceny : "") : "cena neuvedená";
  }
  function skupinaStavu(st) { return st === "predane" || st === "neaktivne" ? "neaktivne" : st === "archiv" ? "archiv" : st === "koncept" ? "koncepty" : "aktivne"; }

  // ---------- zoznam
  // zobrazenie ponúk: dlaždice alebo zoznam pod sebou (pamätá si to prehliadač každého makléra)
  var POHLADY_P = [
    ["dlazdice", "Dlaždice", '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>'],
    ["zoznam", "Zoznam", '<rect x="3" y="4" width="5" height="4" rx="1"/><rect x="3" y="10" width="5" height="4" rx="1"/><rect x="3" y="16" width="5" height="4" rx="1"/><path d="M11 6h10M11 12h10M11 18h10"/>']];
  function klucPohladu() { return "typek-ponuky-pohlad-" + (S.me ? S.me.id : ""); }
  function pohladPonuk() { try { return localStorage.getItem(klucPohladu()) === "zoznam" ? "zoznam" : "dlazdice"; } catch (e) { return S.ponukyPohlad || "dlazdice"; } }
  function nastavPohladPonuk(v) { S.ponukyPohlad = v; try { localStorage.setItem(klucPohladu(), v); } catch (e) { /* bez úložiska */ } }
  function vykresliNehnutelnosti() {
    var el = $("#obsah"); if (!el) return;
    if (S.ponukaEdit) return vykresliFormularPonuky();
    if (S.ponukaDetail) return vykresliDetailPonuky();
    if (S.ponukaExport) return vykresliExport();
    if (!S.ponuky) { el.innerHTML = '<div class="box"><div class="meta">Načítavam ponuky…</div></div>'; nacitajPonuky().then(vykresliNehnutelnosti, function (e) { toast(chybaText(e), true); S.ponuky = []; vykresliNehnutelnosti(); }); return; }
    var poc = { aktivne: 0, neaktivne: 0, koncepty: 0, archiv: 0 };
    S.ponuky.forEach(function (p) { poc[skupinaStavu(p.stav)]++; });
    if (!poc[S.nehnObd] && S.nehnObd === "koncepty") S.nehnObd = "aktivne";
    var OBD = [["aktivne", "Aktívne"], ["neaktivne", "Neaktívne"]].concat(poc.koncepty ? [["koncepty", "Koncepty"]] : []).concat([["archiv", "Archív"]]);
    var q = norm(S.ponukyQ || "");
    var zoz = S.ponuky.filter(function (p) {
      return skupinaStavu(p.stav) === S.nehnObd && (!q || norm([p.nazov, p.obec, p.okres, p.typ, p.cislo, meno(p.makler_id)].join(" ")).indexOf(q) >= 0);
    });
    var koncept = nacitajKoncept(), pohlad = pohladPonuk();
    var h = '<div class="box nehn"><div class="vykon-hlava"><h3>🏠 Nehnuteľnosti v ponuke</h3>' +
      '<div class="nehn-akcie"><button class="btn" type="button" data-ponuka="export">🌐 Web a export</button><button class="btn primary" type="button" data-ponuka="nova">+ Pridať ponuku</button></div></div>' +
      (koncept ? '<div class="note koncept-pozn">📝 Máte rozpracovanú ponuku' + (koncept.p.obec ? " (" + esc(koncept.p.obec) + ")" : "") + ' z ' + datum(koncept.ulozene, true) +
        ' <button class="btn" type="button" data-ponuka="pokracovat">Pokračovať</button> <button class="btn ghost" type="button" data-ponuka="zahodit">Zahodiť</button></div>' : "") +
      '<div class="nehn-filtre"><div class="seg" role="group">' + OBD.map(function (o) {
        return '<button type="button" data-nehn="' + o[0] + '" aria-pressed="' + (S.nehnObd === o[0]) + '">' + o[1] + ' <span class="n">' + poc[o[0]] + "</span></button>";
      }).join("") + '</div><input type="search" id="ponuky-q" placeholder="Hľadať: obec, názov, maklér, číslo…" value="' + esc(S.ponukyQ || "") + '">' +
      '<div class="seg pohlad-seg" role="group" aria-label="Zobrazenie ponúk">' + POHLADY_P.map(function (o) {
        return '<button type="button" data-pohlad="' + o[0] + '" aria-pressed="' + (pohlad === o[0]) + '" title="' + o[1] + '">' +
          '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + o[2] + "</svg><span>" + o[1] + "</span></button>";
      }).join("") + "</div></div>";
    if (!zoz.length) {
      h += '<div class="prazdne"><span class="dl-ikona velka">' + ikona("nehn") + "</span><b>" +
        (q ? "Nič sa nenašlo" : ({ aktivne: "Zatiaľ žiadne aktívne ponuky", neaktivne: "Žiadne neaktívne ponuky", koncepty: "Žiadne koncepty", archiv: "Archív je prázdny" })[S.nehnObd] || "Žiadne ponuky") + "</b>" +
        '<span class="meta">Novú ponuku pridáte tlačidlom „Pridať ponuku“ alebo priamo zo skenera pri získanom inzeráte („➕ Do ponuky“).</span></div>';
    } else if (pohlad === "zoznam") {
      h += '<div class="ponuky-zoznam">' + zoz.map(function (p) {
        var f = (p.fotky || [])[0], st = STAVY_P[p.stav] || ["?", "na"];
        var par = [p.plocha_uzitkova ? nf.format(p.plocha_uzitkova) + " m²" : p.plocha_pozemku ? nf.format(p.plocha_pozemku) + " m² pozemok" : "", p.izby ? p.izby + "-izb." : ""].filter(Boolean).join(" · ");
        return '<button type="button" class="ponuka-riadok" data-ponuka-detail="' + p.id + '">' +
          '<span class="pr-foto">' + (f ? '<img loading="lazy" src="' + esc(fotkaUrl(f)) + '" alt="">' : '<span class="pk-bez">' + (KATEGORIE.find(function (k) { return k[0] === p.kategoria; }) || ["", "", "🏠"])[2] + "</span>") + "</span>" +
          '<span class="pr-telo"><span class="pk-tr">' + (p.transakcia === "prenajom" ? "Prenájom" : "Predaj") + (p.typ ? " · " + esc(p.typ) : "") + (p.cislo ? " · č. " + esc(p.cislo) : "") + "</span>" +
          "<b>" + esc(nazovPonuky(p)) + "</b>" +
          '<span class="meta">' + esc([[p.cast_obce, p.obec, p.okres ? "okr. " + p.okres : ""].filter(Boolean).join(", "), par].filter(Boolean).join(" · ")) + "</span>" +
          '<span class="pr-stitky"><span class="chip ' + st[1] + '">' + st[0] + "</span>" + (p.exkluzivne ? '<span class="pk-exk">Exkluzívne</span>' : "") + zmluvaStitok(S.ponukyInt[p.id]) + "</span></span>" +
          '<span class="pr-vpravo"><span class="pk-cena">' + esc(cenaPonuky(p)) + "</span>" +
          '<span class="pk-makler">' + avatar(p.makler_id, 22) + "<span>" + esc(meno(p.makler_id)) + "</span><span class=\"meta\">· " + ago(p.upravene) + "</span></span></span></button>";
      }).join("") + "</div>";
    } else {
      h += '<div class="ponuky-grid">' + zoz.map(function (p) {
        var f = (p.fotky || [])[0], st = STAVY_P[p.stav] || ["?", "na"];
        var par = [p.plocha_uzitkova ? nf.format(p.plocha_uzitkova) + " m²" : p.plocha_pozemku ? nf.format(p.plocha_pozemku) + " m² pozemok" : "", p.izby ? p.izby + "-izb." : ""].filter(Boolean).join(" · ");
        return '<button type="button" class="ponuka-karta" data-ponuka-detail="' + p.id + '">' +
          '<span class="pk-foto">' + (f ? '<img loading="lazy" src="' + esc(fotkaUrl(f)) + '" alt="">' : '<span class="pk-bez">' + (KATEGORIE.find(function (k) { return k[0] === p.kategoria; }) || ["", "", "🏠"])[2] + "</span>") +
          '<span class="pk-stav chip ' + st[1] + '">' + st[0] + "</span>" + (p.exkluzivne ? '<span class="pk-exk">Exkluzívne</span>' : "") + "</span>" +
          '<span class="pk-telo"><span class="pk-tr">' + (p.transakcia === "prenajom" ? "Prenájom" : "Predaj") + (p.typ ? " · " + esc(p.typ) : "") + "</span>" +
          "<b>" + esc(nazovPonuky(p)) + "</b>" +
          '<span class="meta">' + esc([p.cast_obce, p.obec, p.okres ? "okr. " + p.okres : ""].filter(Boolean).join(", ")) + "</span>" +
          '<span class="pk-cena">' + esc(cenaPonuky(p)) + "</span>" + (par ? '<span class="meta">' + esc(par) + "</span>" : "") + zmluvaStitok(S.ponukyInt[p.id]) +
          '<span class="pk-makler">' + avatar(p.makler_id, 22) + "<span>" + esc(meno(p.makler_id)) + "</span><span class=\"meta\">· " + ago(p.upravene) + "</span></span></span></button>";
      }).join("") + "</div>";
    }
    el.innerHTML = h + "</div>";
    el.querySelectorAll("[data-nehn]").forEach(function (b) { b.onclick = function () { S.nehnObd = b.dataset.nehn; vykresliNehnutelnosti(); }; });
    el.querySelectorAll("[data-pohlad]").forEach(function (b) { b.onclick = function () { nastavPohladPonuk(b.dataset.pohlad); vykresliNehnutelnosti(); }; });
    var t; $("#ponuky-q").addEventListener("input", function () { var v = this.value; clearTimeout(t); t = setTimeout(function () { S.ponukyQ = v; vykresliNehnutelnosti(); var i = $("#ponuky-q"); if (i) { i.focus(); i.setSelectionRange(v.length, v.length); } }, 200); });
  }

  // ---------- koncept (rozpracovaná ponuka v prehliadači)
  function klucKonceptu() { return "typek-koncept-" + (S.me ? S.me.id : ""); }
  function nacitajKoncept() { try { return JSON.parse(localStorage.getItem(klucKonceptu()) || "null"); } catch (e) { return null; } }
  function ulozKoncept() {
    if (!S.ponukaEdit) return;
    try { localStorage.setItem(klucKonceptu(), JSON.stringify({ p: S.ponukaEdit.p, i: S.ponukaEdit.i, krok: S.ponukaEdit.krok, ulozene: new Date().toISOString() })); } catch (e) { /* plné úložisko */ }
  }
  function zmazKoncept() { try { localStorage.removeItem(klucKonceptu()); } catch (e) { /* nič */ } }

  function novaPonuka(zaklad) {
    var p = Object.assign({ transakcia: "predaj", kategoria: "", typ: "", stav: "koncept", zobrazit_cenu: true, zobrazit_mapu: true, typ_ceny: "za nehnuteľnosť",
      orientacia: [], vybavenie: [], specialne: [], fotky: [], makler_id: S.me.id }, (zaklad && zaklad.p) || {});
    var i = Object.assign({ provizia_typ: "eur", provizia_rk_typ: "eur", dokumenty: [] }, (zaklad && zaklad.i) || {});
    S.ponukaEdit = { p: p, i: i, krok: (zaklad && zaklad.krok) || 0 };
    S.ponukaDetail = null;
  }
  document.addEventListener("click", function (e) {
    var b = e.target.closest("[data-ponuka]");
    if (b) {
      var a = b.dataset.ponuka;
      if (a === "nova") { var k = nacitajKoncept(); if (k && !confirm2("Máte rozpracovanú ponuku. Začať novú a rozpracovanú zahodiť?")) return; zmazKoncept(); novaPonuka(); }
      if (a === "pokracovat") novaPonuka(nacitajKoncept());
      if (a === "zahodit") { zmazKoncept(); }
      if (a === "upravit") { var p = S.ponuky.find(function (x) { return x.id === S.ponukaDetail; }); if (p) S.ponukaEdit = { p: JSON.parse(JSON.stringify(p)), i: JSON.parse(JSON.stringify(S.ponukyInt[p.id] || { provizia_typ: "eur", provizia_rk_typ: "eur", dokumenty: [] })), krok: 0, uprava: true }; }
      if (a === "spat") { S.ponukaDetail = null; }
      if (a === "export") { S.ponukaExport = true; history.pushState({ tab: "nehnutelnosti", export: 1 }, "", "#nehnutelnosti"); }
      if (S.ponukaEdit && a !== "spat") history.pushState({ tab: "nehnutelnosti", form: 1, detail: S.ponukaDetail }, "", "#nehnutelnosti");
      vykresliNehnutelnosti(); window.scrollTo(0, 0); return;
    }
    var d = e.target.closest("[data-ponuka-detail]");
    if (d) { S.ponukaDetail = Number(d.dataset.ponukaDetail); S.galeria = 0; S.pdPanel = null; S.obhForm = null; history.pushState({ tab: "nehnutelnosti", detail: S.ponukaDetail }, "", "#nehnutelnosti"); vykresliNehnutelnosti(); window.scrollTo(0, 0); }
  });
  // jednoduché potvrdenie bez systémového okna
  function confirm2(text) { return window.confirm(text); }

  // ---------- formulár v krokoch
  function nacitajLokality() {
    if (window.LOKALITY) return Promise.resolve();
    if (S.lokalityP) return S.lokalityP;
    S.lokalityP = new Promise(function (ok, chyba) {
      var sc = document.createElement("script"); sc.src = "lokality.js?v=202610201600"; sc.onload = ok; sc.onerror = function () { chyba(new Error("Zoznam obcí sa nepodarilo načítať.")); };
      document.head.appendChild(sc);
    });
    return S.lokalityP;
  }
  function uplnost(p, i) {
    var kontrola = [
      [!!p.kategoria && !!p.typ, "Druh nehnuteľnosti", 0],
      [!!p.cena || p.typ_ceny === "dohodou" || p.typ_ceny === "na vyžiadanie", "Cena", 0],
      [!!p.obec, "Obec", 1],
      [!!(p.plocha_uzitkova || p.plocha_pozemku), "Plocha", 2],
      [(p.fotky || []).length >= 5, "Aspoň 5 fotiek", 3],
      [String(p.nazov || "").trim().length >= 10, "Názov", 3],
      [String(p.popis || "").trim().length >= 200, "Popis (aspoň 200 znakov)", 3],
      [!!(i.majitel_meno || i.majitel_telefon), "Kontakt na majiteľa", 4],
    ];
    if (p.kategoria === "byty" || p.kategoria === "domy") kontrola.push([!!p.energ_certifikat, "Energetický certifikát", 2]);
    var ok = kontrola.filter(function (k) { return k[0]; }).length;
    return { pct: Math.round(ok / kontrola.length * 100), chyba: kontrola.filter(function (k) { return !k[0]; }) };
  }
  function vyber(nazov, pole, moznosti, hodnota) {
    return '<label class="field"><span>' + nazov + '</span><select data-p="' + pole + '"><option value="">—</option>' +
      moznosti.map(function (m) { return "<option" + (m === hodnota ? " selected" : "") + ">" + esc(m) + "</option>"; }).join("") + "</select></label>";
  }
  function cislo(nazov, pole, hodnota, pomoc) {
    return '<label class="field"><span>' + nazov + (pomoc ? ' <small class="meta">' + esc(pomoc) + "</small>" : "") + '</span><input type="number" inputmode="decimal" min="0" step="any" data-p="' + pole + '" value="' + esc(hodnota == null ? "" : hodnota) + '"></label>';
  }
  function text1(nazov, pole, hodnota, opt) {
    opt = opt || {};
    return '<label class="field"><span>' + nazov + (opt.max ? ' <small class="meta" data-pocitadlo="' + pole + '">' + String(hodnota || "").length + "/" + opt.max + "</small>" : "") + "</span>" +
      '<input type="' + (opt.typ || "text") + '"' + (opt.i ? ' data-i="' : ' data-p="') + pole + '" value="' + esc(hodnota == null ? "" : hodnota) + '"' + (opt.max ? ' maxlength="' + opt.max + '"' : "") +
      (opt.ph ? ' placeholder="' + esc(opt.ph) + '"' : "") + (opt.im ? ' inputmode="' + opt.im + '"' : "") + "></label>";
  }
  function prepinac(nazov, pole, hodnota, interne) {
    return '<label class="toggle"><input type="checkbox" ' + (interne ? 'data-i="' : 'data-p="') + pole + '"' + (hodnota ? " checked" : "") + "> " + nazov + "</label>";
  }
  function cipy(pole, moznosti, vybrane) {
    vybrane = vybrane || [];
    return '<div class="cipy" data-cipy="' + pole + '">' + moznosti.map(function (m) {
      return '<button type="button" class="cip" aria-pressed="' + (vybrane.indexOf(m) >= 0) + '" data-hodnota="' + esc(m) + '">' + esc(m) + "</button>";
    }).join("") + "</div>";
  }
  function vykresliFormularPonuky() {
    var el = $("#obsah"), E = S.ponukaEdit, p = E.p, i = E.i, k = KROKY[E.krok][0], u = uplnost(p, i);
    var h = '<div class="box ponuka-form"><div class="pf-hlava"><button class="btn ghost" type="button" data-pf="zrusit">← ' + (E.uprava ? "Späť na ponuku" : "Zrušiť") + "</button>" +
      "<h3>" + (E.uprava ? "Upraviť ponuku" : "Nová ponuka") + "</h3>" +
      '<div class="pf-uplnost" title="Pripravené na zverejnenie a export"><span style="--u:' + u.pct + '%"></span><b>' + u.pct + " %</b></div></div>" +
      '<ol class="pf-kroky">' + KROKY.map(function (x, n) {
        return '<li><button type="button" data-krok="' + n + '"' + (n === E.krok ? ' aria-current="step"' : "") + "><span>" + (n + 1) + "</span>" + x[1] + "</button></li>";
      }).join("") + "</ol><div class=\"pf-telo\">";
    if (k === "druh") {
      h += '<div class="seg pf-tr" role="group">' + [["predaj", "Predaj"], ["prenajom", "Prenájom"]].map(function (x) {
        return '<button type="button" data-tr="' + x[0] + '" aria-pressed="' + (p.transakcia === x[0]) + '">' + x[1] + "</button>";
      }).join("") + "</div>" +
        '<h4>Čo ponúkate?</h4><div class="pf-kategorie">' + KATEGORIE.map(function (x) {
          return '<button type="button" class="pf-kat" data-kat="' + x[0] + '" aria-pressed="' + (p.kategoria === x[0]) + '"><span>' + x[2] + "</span>" + x[1] + "</button>";
        }).join("") + "</div>" +
        (p.kategoria ? '<h4>Typ</h4><div class="cipy" data-typ-vyber>' + TYPY[p.kategoria].map(function (t) {
          return '<button type="button" class="cip" aria-pressed="' + (p.typ === t) + '" data-hodnota="' + esc(t) + '">' + esc(t) + "</button>";
        }).join("") + "</div>" : "") +
        '<h4>Cena</h4><div class="form-grid">' +
        '<label class="field"><span>Cena (€)</span><input type="number" inputmode="decimal" min="0" step="100" data-p="cena" value="' + esc(p.cena == null ? "" : p.cena) + '" placeholder="napr. 135000"></label>' +
        vyber("Typ ceny", "typ_ceny", TYP_CENY, p.typ_ceny) +
        text1("Text k cene", "text_k_cene", p.text_k_cene, { ph: "napr. vrátane provízie RK" }) +
        (p.transakcia === "prenajom" ? text1("Cena za energie", "cena_energie", p.cena_energie, { ph: "napr. 150 €/mesiac" }) : "") + "</div>" +
        '<div class="pf-prepinace">' + prepinac("Zobrazovať cenu", "zobrazit_cenu", p.zobrazit_cenu) + prepinac("Exkluzívne", "exkluzivne", p.exkluzivne) + "</div>" +
        '<div class="form-grid">' +
        (admin() ? '<label class="field"><span>Zodpovedný maklér</span><select data-p="makler_id">' + S.makleri.filter(function (m) { return m.aktivny; }).map(function (m) {
          return '<option value="' + m.id + '"' + (p.makler_id === m.id ? " selected" : "") + ">" + esc(m.meno || m.email) + "</option>";
        }).join("") + "</select></label>" : "") +
        text1("Interné číslo ponuky", "cislo", p.cislo, { ph: "pridelí sa automaticky" }) + "</div>";
    }
    if (k === "lokalita") {
      h += '<label class="field"><span>Obec alebo mestská časť</span><div class="lok-hladat"><input type="search" id="lok-q" autocomplete="off" placeholder="Začnite písať, napr. Smižany…" value="' + esc(p.obec ? (p.cast_obce ? p.cast_obce + " (" + p.obec + ")" : p.obec) : "") + '"><div class="lok-navrhy" id="lok-navrhy" hidden></div></div></label>' +
        (p.obec ? '<div class="lok-vybrane">📍 <b>' + esc(p.cast_obce ? p.cast_obce + ", " + p.obec : p.obec) + "</b> · okres " + esc(p.okres || "?") + " · " + esc(p.kraj || "") + "</div>" : "") +
        '<details class="lok-rucne"><summary>Obec nie je v zozname</summary><div class="form-grid">' +
        text1("Obec", "obec", p.obec) + text1("Okres", "okres", p.okres) + text1("Kraj", "kraj", p.kraj) + "</div></details>" +
        '<div class="form-grid">' + text1("Ulica – verejná", "ulica", p.ulica, { ph: "zobrazí sa v ponuke" }) +
        text1("Ulica a číslo – interné", "ulica_interna", i.ulica_interna, { i: true, ph: "nezverejňuje sa" }) + "</div>" +
        '<div class="pf-prepinace">' + prepinac("Zobrazovať mapu", "zobrazit_mapu", p.zobrazit_mapu) + "</div>" +
        '<p class="meta">Pre presnejšiu polohu kliknite do mapy alebo posuňte špendlík.</p><div id="pf-mapa" class="pf-mapa"></div>';
    }
    if (k === "parametre") {
      if (!p.kategoria) h += '<div class="note">Najprv v 1. kroku vyberte druh nehnuteľnosti – podľa neho sa ukážu správne polia.</div>';
      else {
        var polia = POLIA[p.kategoria] || [];
        h += '<div class="form-grid">' + polia.filter(function (x) { return CISELNE[x]; }).map(function (x) { return cislo(CISELNE[x][0], x, p[x], CISELNE[x][1]); }).join("") +
          polia.filter(function (x) { return VYBERY[x]; }).map(function (x) { return vyber(VYBERY[x][0], x, VYBERY[x][1], p[x]); }).join("") + "</div>" +
          (polia.indexOf("orientacia") >= 0 ? "<h4>Orientácia</h4>" + cipy("orientacia", ORIENT, p.orientacia) : "") +
          VYBAVENIE.filter(function (g) { return p.kategoria !== "pozemky" || g[0] === "Inžinierske siete" || g[0] === "Komunikácie"; }).map(function (g) {
            return "<h4>" + g[0] + "</h4>" + cipy("vybavenie", g[1], p.vybavenie);
          }).join("") +
          (p.transakcia === "prenajom" ? '<div class="pf-prepinace">' + prepinac("Vhodné pre študentov", "vhodne_pre_studentov", p.vhodne_pre_studentov) + "</div>" : "");
      }
    }
    if (k === "fotky") {
      var F = p.fotky || [];
      h += '<div class="pf-fotky-hlava"><h4>Fotky <small class="meta">' + F.length + "/40 · prvá je titulná</small></h4>" +
        '<div class="pf-foto-btns"><label class="btn primary">📷 Odfotiť<input type="file" accept="image/*" capture="environment" data-fotky-pridat hidden></label>' +
        '<label class="btn">🖼 Vybrať fotky<input type="file" accept="image/*" multiple data-fotky-pridat hidden></label></div></div>' +
        '<label class="toggle pf-vodoznak"><input type="checkbox" id="pf-vodoznak"' + (vodoznakZapnuty() ? " checked" : "") + '> Pridať na nové fotky logo Alpha Reality (vodoznak)</label>' +
        '<div class="pf-drop" id="pf-drop">' + (F.length ? '<div class="pf-fotky" id="pf-fotky">' + F.map(function (f, n) {
          return '<div class="pf-foto" draggable="true" data-foto-i="' + n + '"><img src="' + esc(fotkaUrl(f)) + '" alt="">' + (n === 0 ? '<span class="pf-titul">Titulná</span>' : "") +
            (f.varovanie ? '<span class="pf-var" title="' + esc(f.varovanie) + '">⚠️</span>' : "") +
            '<div class="pf-foto-akcie"><button type="button" data-foto-akcia="vlavo" title="Posunúť dopredu">◀</button>' +
            (n ? '<button type="button" data-foto-akcia="titul" title="Nastaviť ako titulnú">★</button>' : "") +
            '<button type="button" data-foto-akcia="vpravo" title="Posunúť dozadu">▶</button><button type="button" data-foto-akcia="zmaz" title="Odstrániť">✕</button></div></div>';
        }).join("") + "</div>" : '<div class="pf-drop-text">Potiahnite sem fotky alebo použite tlačidlá vyššie.<br><small>Najlepšie fotky na šírku, aspoň 800 × 600. Fotky sa automaticky zmenšia.</small></div>') +
        '<div class="pf-nahravanie" id="pf-nahravanie" hidden></div></div>' +
        sekciaMediiFormulara(E) +
        '<div class="pf-text-hlava"><h4>Text ponuky</h4><button class="btn" type="button" data-pf="navrh">✨ Navrhnúť text</button></div>' +
        text1("Názov", "nazov", p.nazov, { max: 60, ph: "napr. Slnečný 3-izbový byt s balkónom" }) +
        '<label class="field"><span>Intro – krátky popis pre sociálne siete <small class="meta" data-pocitadlo="intro">' + String(p.intro || "").length + '/160</small></span><textarea data-p="intro" rows="2" maxlength="160">' + esc(p.intro || "") + "</textarea></label>" +
        '<label class="field"><span>Popis <small class="meta" data-pocitadlo="popis">' + String(p.popis || "").length + ' znakov</small></span><textarea data-p="popis" rows="10">' + esc(p.popis || "") + "</textarea></label>";
    }
    if (k === "interne") {
      var D = i.dokumenty || [];
      h += '<div class="note pf-int-pozn">🔒 Tieto údaje vidíte len vy a administrátor. Nezverejňujú sa.</div>' +
        "<h4>Majiteľ</h4><div class=\"form-grid\">" + text1("Meno a priezvisko", "majitel_meno", i.majitel_meno, { i: true }) +
        text1("Telefón", "majitel_telefon", i.majitel_telefon, { i: true, typ: "tel", im: "tel" }) + text1("Email", "majitel_email", i.majitel_email, { i: true, typ: "email" }) + "</div>" +
        '<h4>Zmluva a provízia</h4><div class="pf-prepinace">' + prepinac("So zmluvou", "zmluva", i.zmluva, true) + "</div>" +
        '<div class="form-grid"><label class="field"><span>Typ zmluvy</span><select data-i="zmluva_typ"><option value="">—</option>' +
        ["exkluzívna", "neexkluzívna", "sprostredkovateľská"].map(function (x) { return "<option" + (i.zmluva_typ === x ? " selected" : "") + ">" + x + "</option>"; }).join("") + "</select></label>" +
        text1("Platná od", "zmluva_od", i.zmluva_od, { i: true, typ: "date" }) + text1("Platná do", "zmluva_do", i.zmluva_do, { i: true, typ: "date" }) + "</div>" +
        '<div class="form-grid">' + proviziaPole("Provízia", "provizia", i) + proviziaPole("Časť provízie pre RK", "provizia_rk", i) + "</div>" +
        '<label class="field"><span>Poznámka</span><textarea data-i="poznamka" rows="3">' + esc(i.poznamka || "") + "</textarea></label>" +
        '<h4>Dokumenty <small class="meta">list vlastníctva, zmluva, energetický certifikát…</small></h4>' +
        '<div class="pf-dok">' + (D.length ? D.map(function (d, n) { return '<span class="chip-obec">📄 ' + esc(d.nazov) + '<button type="button" data-dok-zmaz="' + n + '" aria-label="Odobrať">×</button></span>'; }).join("") : '<span class="meta">Zatiaľ žiadne.</span>') +
        '<label class="btn">+ Pridať dokument<input type="file" data-dok-pridat hidden></label></div>' +
        "<h4>Špeciálne označenie</h4>" + cipy("specialne", SPECIALNE, p.specialne) +
        '<h4>Kontrola pred zverejnením</h4><div class="pf-kontrola">' + (u.chyba.length ? "<ul>" + u.chyba.map(function (c) {
          return '<li><button type="button" class="btn-link" data-krok="' + c[2] + '">' + esc(c[1]) + "</button></li>";
        }).join("") + '</ul><p class="meta">Ponuku môžete uložiť aj neúplnú – ako koncept, alebo ju zverejniť a doplniť neskôr.</p>' : '<p class="pf-ok">✅ Všetko podstatné je vyplnené.</p>') + "</div>";
    }
    h += "</div>" + '<div class="pf-pata"><button class="btn ghost" type="button" data-pf="spat"' + (E.krok === 0 ? " disabled" : "") + ">← Späť</button>" +
      '<button class="btn" type="button" data-pf="koncept">Uložiť ako koncept</button>' +
      (E.krok < KROKY.length - 1 ? '<button class="btn primary" type="button" data-pf="dalej">Ďalej →</button>' :
        '<button class="btn primary ulozit" type="button" data-pf="zverejnit"' + (p.stav && p.stav !== "koncept" ? " data-ulozit" : "") + ">" + (p.stav && p.stav !== "koncept" ? "✓ Uložiť zmeny" : "✓ Uložiť a zverejniť") + "</button>") + "</div></div>";
    el.innerHTML = h;
    napojFormularPonuky();
  }
  function proviziaPole(nazov, pole, i) {
    var typ = i[pole + "_typ"] || "eur";
    return '<div class="field"><span>' + nazov + '</span><div class="provizia"><input type="number" min="0" step="any" inputmode="decimal" data-i="' + pole + '" value="' + esc(i[pole] == null ? "" : i[pole]) + '">' +
      '<div class="seg" role="group">' + [["eur", "€"], ["pct", "%"]].map(function (x) {
        return '<button type="button" data-prov="' + pole + '_typ" data-v="' + x[0] + '" aria-pressed="' + (typ === x[0]) + '">' + x[1] + "</button>";
      }).join("") + "</div></div></div>";
  }
  // ---------- formulár: videá a virtuálna prehliadka
  function sekciaMediiFormulara(E) {
    var p = E.p, TM = window.TYPEK_MEDIA;
    if (!E.videa) E.videa = TM.zoznam(p.video);
    if (!E.videa.length) E.videa = [""];
    return '<section class="pf-media"><h4>🎬 Video a virtuálna prehliadka</h4>' +
      '<div class="pf-media-pole"><span>Virtuálna prehliadka 3D – Matterport, Kuula a iné</span><div class="pf-3d-riadok">' +
      '<input type="url" data-p="virtualna_prehliadka" value="' + esc(p.virtualna_prehliadka || "") + '" placeholder="https://my.matterport.com/show/?m=…">' +
      '<button class="btn" type="button" data-pf-3d-nahlad>👁 Náhľad</button></div>' +
      '<div class="pf-video-info" id="pf-3d-info">' + info3d(p.virtualna_prehliadka) + '</div><div class="pf-3d-nahlad" id="pf-3d-nahlad"></div></div>' +
      '<div class="pf-media-pole"><span>Videá – YouTube, Shorts, Vimeo, TikTok, Instagram Reels <small class="meta">· najviac 10</small></span>' +
      E.videa.map(function (u, n) {
        return '<div class="pf-video-riadok"><span class="pf-video-nahlad">🎬</span><div class="pf-video-stred">' +
          '<input type="url" data-video-i="' + n + '" value="' + esc(u) + '" placeholder="https://youtube.com/… alebo https://youtube.com/shorts/…">' +
          '<span class="pf-video-info"></span></div>' +
          '<button type="button" class="pf-video-zmaz" data-video-zmaz="' + n + '" title="Odstrániť video" aria-label="Odstrániť video">✕</button></div>';
      }).join("") +
      (E.videa.length < 10 ? '<div><button class="btn" type="button" data-video-pridat>+ Pridať ďalšie video</button></div>' : "") + "</div></section>";
  }
  function info3d(u) {
    if (!String(u || "").trim()) return "Po vložení odkazu sa prehliadka zobrazí priamo v ponuke a hneď sa spustí.";
    var t = window.TYPEK_MEDIA.prehliadka(u);
    return t ? "✓ <b>" + esc(t.zdroj) + "</b> · zobrazí sa priamo v ponuke" : '<span class="zle-text">⚠️ Odkaz nevyzerá správne</span>';
  }
  function obnovRiadokVidea(r, u) {
    var TM = window.TYPEK_MEDIA, nh = r.querySelector(".pf-video-nahlad"), inf = r.querySelector(".pf-video-info");
    u = String(u || "").trim(); r.dataset.url = u;
    nh.classList.remove("vysoke"); nh.style.backgroundImage = ""; nh.textContent = "🎬"; inf.classList.remove("zle");
    if (!u) { inf.textContent = "Vložte odkaz na video – rozpoznám, či je to Shorts alebo klasické video."; return; }
    var v = TM.video(u);
    if (v.typ === "odkaz") { inf.classList.add("zle"); inf.textContent = "⚠️ Toto nevyzerá ako video – v ponuke sa ukáže len ako odkaz."; return; }
    function kresli(vysoke, nazov) {
      nh.classList.toggle("vysoke", vysoke);
      if (v.nahlad) { nh.style.backgroundImage = "url('" + (vysoke && v.typ === "youtube" ? "https://i.ytimg.com/vi/" + v.id + "/oardefault.jpg" : v.nahlad) + "')"; nh.textContent = ""; }
      inf.innerHTML = "✓ <b>" + esc(nazov) + "</b> · " + (vysoke ? "zobrazí sa na výšku (9:16)" : "zobrazí sa na šírku (16:9)");
    }
    kresli(v.vysoke, v.nazov);
    if (v.typ === "youtube" && !v.istota) {
      inf.innerHTML = "✓ <b>YouTube</b> · zisťujem, či ide o Shorts…";
      TM.jeShorts(v.id).then(function (sh) { if (r.dataset.url === u) kresli(sh, sh ? "YouTube Shorts" : "YouTube video"); });
    }
  }
  function napojMediaFormulara(el, E, zmena) {
    var TM = window.TYPEK_MEDIA, p = E.p;
    el.querySelectorAll("[data-video-i]").forEach(function (inp) {
      var r = inp.closest(".pf-video-riadok"); obnovRiadokVidea(r, inp.value);
      inp.addEventListener("input", function () { E.videa[Number(inp.dataset.videoI)] = inp.value; p.video = TM.spoj(E.videa); obnovRiadokVidea(r, inp.value); zmena(); });
    });
    el.querySelectorAll("[data-video-zmaz]").forEach(function (b) {
      b.onclick = function () { E.videa.splice(Number(b.dataset.videoZmaz), 1); p.video = TM.spoj(E.videa); zmena(); vykresliFormularPonuky(); };
    });
    var pr = el.querySelector("[data-video-pridat]");
    if (pr) pr.onclick = function () { E.videa.push(""); vykresliFormularPonuky(); var x = $("#obsah").querySelectorAll("[data-video-i]"); if (x.length) x[x.length - 1].focus(); };
    var t3 = el.querySelector('[data-p="virtualna_prehliadka"]'), nb = el.querySelector("[data-pf-3d-nahlad]"), nbox = $("#pf-3d-nahlad");
    if (t3) t3.addEventListener("input", function () { $("#pf-3d-info").innerHTML = info3d(t3.value); nbox.innerHTML = ""; });
    if (nb) nb.onclick = function () {
      if (nbox.innerHTML) { nbox.innerHTML = ""; return; }
      if (!t3.value.trim()) return toast("Najprv vložte odkaz na virtuálnu prehliadku.", true);
      nbox.innerHTML = TM.htmlPrehliadka(t3.value); TM.napoj(nbox);
    };
  }
  function napojFormularPonuky() {
    var el = $("#obsah"), E = S.ponukaEdit, p = E.p, i = E.i;
    function zmena() { ulozKoncept(); obnovUplnost(); }
    el.querySelectorAll("[data-p]").forEach(function (inp) {
      inp.addEventListener(inp.type === "checkbox" || inp.tagName === "SELECT" ? "change" : "input", function () {
        var v = inp.type === "checkbox" ? inp.checked : inp.value;
        p[inp.dataset.p] = v;
        var pc = el.querySelector('[data-pocitadlo="' + inp.dataset.p + '"]');
        if (pc) pc.textContent = String(v).length + (inp.maxLength > 0 ? "/" + inp.maxLength : " znakov");
        zmena();
      });
    });
    el.querySelectorAll("[data-i]").forEach(function (inp) {
      inp.addEventListener(inp.type === "checkbox" || inp.tagName === "SELECT" ? "change" : "input", function () { i[inp.dataset.i] = inp.type === "checkbox" ? inp.checked : inp.value; zmena(); });
    });
    el.querySelectorAll("[data-tr]").forEach(function (b) { b.onclick = function () { p.transakcia = b.dataset.tr; if (p.transakcia === "prenajom" && p.typ_ceny === "za nehnuteľnosť") p.typ_ceny = "za mesiac"; zmena(); vykresliFormularPonuky(); }; });
    el.querySelectorAll("[data-kat]").forEach(function (b) { b.onclick = function () { if (p.kategoria !== b.dataset.kat) { p.kategoria = b.dataset.kat; p.typ = ""; } zmena(); vykresliFormularPonuky(); }; });
    var tv = el.querySelector("[data-typ-vyber]");
    if (tv) tv.querySelectorAll(".cip").forEach(function (b) {
      b.onclick = function () {
        p.typ = b.dataset.hodnota;
        var m = p.typ.match(/^(\d)/); if (p.kategoria === "byty") p.izby = p.typ === "Garsónka" ? 1 : m ? Number(m[1]) : p.izby;
        zmena(); vykresliFormularPonuky();
      };
    });
    el.querySelectorAll("[data-cipy]").forEach(function (g) {
      g.querySelectorAll(".cip").forEach(function (b) {
        b.onclick = function () {
          var pole = g.dataset.cipy, v = b.dataset.hodnota, arr = (p[pole] || []).slice(), ix = arr.indexOf(v);
          if (ix >= 0) arr.splice(ix, 1); else arr.push(v);
          p[pole] = arr; b.setAttribute("aria-pressed", String(ix < 0)); zmena();
        };
      });
    });
    el.querySelectorAll("[data-prov]").forEach(function (b) {
      b.onclick = function () { i[b.dataset.prov] = b.dataset.v; b.parentNode.querySelectorAll("button").forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); }); zmena(); };
    });
    el.querySelectorAll("[data-krok]").forEach(function (b) { b.onclick = function () { E.krok = Number(b.dataset.krok); ulozKoncept(); vykresliFormularPonuky(); window.scrollTo(0, 0); }; });
    el.querySelectorAll("[data-pf]").forEach(function (b) { b.onclick = function () { akciaFormulara(b.dataset.pf, b); }; });
    napojMediaFormulara(el, E, zmena);
    var ci = el.querySelector('[data-p="cislo"]');
    if (ci && !p.cislo) rpc("navrh_cisla_ponuky", { p_makler: p.makler_id || S.me.id }).then(function (c) { if (c && document.body.contains(ci)) ci.placeholder = "pridelí sa automaticky: " + c; }, function () {});
    var mk = el.querySelector('select[data-p="makler_id"]');
    if (mk && ci) mk.addEventListener("change", function () { if (!p.cislo || E.cisloAuto) rpc("navrh_cisla_ponuky", { p_makler: mk.value }).then(function (c) { ci.placeholder = "pridelí sa automaticky: " + c; }, function () {}); });
    if (KROKY[E.krok][0] === "lokalita") napojLokalitu();
    if (KROKY[E.krok][0] === "fotky") napojFotky();
    if (KROKY[E.krok][0] === "interne") napojDokumenty();
  }
  function obnovUplnost() {
    var u = uplnost(S.ponukaEdit.p, S.ponukaEdit.i), b = document.querySelector(".pf-uplnost");
    if (b) { b.querySelector("span").style.setProperty("--u", u.pct + "%"); b.querySelector("b").textContent = u.pct + " %"; }
  }
  async function akciaFormulara(a) {
    var E = S.ponukaEdit;
    if (a === "dalej") { E.krok = Math.min(KROKY.length - 1, E.krok + 1); ulozKoncept(); vykresliFormularPonuky(); window.scrollTo(0, 0); return; }
    if (a === "spat") { E.krok = Math.max(0, E.krok - 1); ulozKoncept(); vykresliFormularPonuky(); window.scrollTo(0, 0); return; }
    if (a === "zrusit") {
      if (!E.uprava) { if (!confirm2("Zrušiť pridávanie? Rozpracovaná ponuka ostane uložená v tomto zariadení, môžete v nej pokračovať.")) return; }
      S.ponukaEdit = null; vykresliNehnutelnosti(); window.scrollTo(0, 0); return;
    }
    if (a === "navrh") {
      var p = E.p;
      if ((p.nazov || p.popis) && !confirm2("Prepísať názov, intro a popis navrhnutým textom?")) return;
      var t = navrhniText(p, E.i); p.nazov = t.nazov; p.intro = t.intro; p.popis = t.popis;
      ulozKoncept(); vykresliFormularPonuky(); toast("✨ Text je navrhnutý – upravte ho podľa seba."); return;
    }
    if (a === "koncept" || a === "zverejnit") {
      var stav = a === "koncept" ? (E.p.stav && E.p.stav !== "koncept" && E.uprava ? E.p.stav : "koncept") : (E.p.stav && E.p.stav !== "koncept" ? E.p.stav : "aktivne");
      if (a === "zverejnit" && (!E.p.kategoria || !E.p.obec)) return toast("Na zverejnenie vyplňte aspoň druh nehnuteľnosti a obec.", true);
      var data = Object.assign({}, E.p, { stav: stav });
      delete data.vytvoril; delete data.vytvorene; delete data.upravene; delete data.historia_cien; delete data.kancelaria;
      var tl = document.querySelectorAll(".pf-pata .btn"); tl.forEach(function (x) { x.disabled = true; });
      try {
        var id = await rpc("ulozit_nehnutelnost", { p: data, p_int: E.i });
        zmazKoncept();
        await nacitajPonuky();
        S.ponukaEdit = null; S.ponukaDetail = id;
        var nova = S.ponuky.find(function (x) { return x.id === id; });
        if (nova) S.nehnObd = skupinaStavu(nova.stav);
        toast(stav === "koncept" ? "📝 Uložené ako koncept." : "✅ Ponuka je uložená.");
        if (a === "zverejnit" && !E.uprava) konfety({ pocet: 120 });
        vykresliNehnutelnosti(); window.scrollTo(0, 0);
      } catch (err) { toast(chybaText(err), true); tl.forEach(function (x) { x.disabled = false; }); }
    }
  }

  // ---------- lokalita: našepkávač a mapa
  function normLok(s) { return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""); }
  function napojLokalitu() {
    var inp = $("#lok-q"), box = $("#lok-navrhy"), E = S.ponukaEdit, p = E.p;
    nacitajLokality().then(function () { kresliMapu(); }, function (e) { toast(chybaText(e), true); });
    inp.addEventListener("input", function () {
      var q = normLok(inp.value.trim());
      if (q.length < 2 || !window.LOKALITY) { box.hidden = true; return; }
      var zac = [], obs = [];
      window.LOKALITY.forEach(function (l) { var n = normLok(l[0]); if (n.indexOf(q) === 0) zac.push(l); else if (n.indexOf(q) > 0) obs.push(l); });
      var vys = zac.concat(obs).slice(0, 12);
      box.innerHTML = vys.length ? vys.map(function (l, n) {
        return '<button type="button" data-lok="' + n + '"><b>' + esc(l[0]) + "</b>" + (l[5] ? " <small>(" + esc(l[5]) + ")</small>" : "") +
          '<span class="meta">okres ' + esc(l[1]) + " · " + esc((window.OKRES_KRAJ || {})[l[1]] || "") + (l[2] ? " · " + esc(l[2].slice(0, 3) + " " + l[2].slice(3)) : "") + "</span></button>";
      }).join("") : '<div class="meta lok-nic">Nenašla sa – použite „Obec nie je v zozname“.</div>';
      box.hidden = false;
      box.querySelectorAll("[data-lok]").forEach(function (b) {
        b.onclick = function () {
          var l = vys[Number(b.dataset.lok)];
          if (l[5]) { p.obec = l[5]; p.cast_obce = l[0]; } else { p.obec = l[0]; p.cast_obce = ""; }
          p.okres = l[1]; p.kraj = (window.OKRES_KRAJ || {})[l[1]] || ""; p.lat = l[3]; p.lon = l[4]; p.psc = l[2];
          ulozKoncept(); vykresliFormularPonuky();
        };
      });
    });
    inp.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); var f = box.querySelector("[data-lok]"); if (f) f.click(); } });
  }
  function nacitajLeaflet() {
    if (window.L) return Promise.resolve();
    if (S.leafletP) return S.leafletP;
    S.leafletP = new Promise(function (ok, chyba) {
      var c = document.createElement("link"); c.rel = "stylesheet"; c.href = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css"; document.head.appendChild(c);
      var s = document.createElement("script"); s.src = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js"; s.onload = ok; s.onerror = function () { chyba(new Error("Mapu sa nepodarilo načítať.")); };
      document.head.appendChild(s);
    });
    return S.leafletP;
  }
  function kresliMapu(idEl, upravit) {
    var el = $("#" + (idEl || "pf-mapa")); if (!el) return;
    var p = idEl ? S.ponuky.find(function (x) { return x.id === S.ponukaDetail; }) : S.ponukaEdit.p;
    nacitajLeaflet().then(function () {
      if (!document.body.contains(el)) return;
      var ma = p.lat && p.lon, stred = ma ? [p.lat, p.lon] : [48.67, 19.7];
      var mapa = L.map(el, { scrollWheelZoom: false }).setView(stred, ma ? 14 : 7);
      // priblíženie: tlačidlá +/−, dvojklik, dva prsty na mobile alebo Ctrl + koliesko myši
      var tip = document.createElement("div"); tip.className = "mapa-tip"; tip.textContent = "Na priblíženie mapy podržte Ctrl a otáčajte kolieskom"; el.appendChild(tip);
      var tipT;
      el.addEventListener("wheel", function (e) {
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault(); tip.classList.remove("viditelny");
          var bod = mapa.mouseEventToContainerPoint(e);
          mapa.setZoomAround(bod, mapa.getZoom() + (e.deltaY < 0 ? 1 : -1));
        } else { tip.classList.add("viditelny"); clearTimeout(tipT); tipT = setTimeout(function () { tip.classList.remove("viditelny"); }, 1400); }
      }, { passive: false });
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(mapa);
      if (idEl) { if (ma) L.marker(stred).addTo(mapa); return; }
      var mk = ma ? L.marker(stred, { draggable: true }).addTo(mapa) : null;
      function nastav(ll) {
        p.lat = Math.round(ll.lat * 1e5) / 1e5; p.lon = Math.round(ll.lng * 1e5) / 1e5; ulozKoncept();
        if (!mk) { mk = L.marker(ll, { draggable: true }).addTo(mapa); mk.on("dragend", function () { nastav(mk.getLatLng()); }); } else mk.setLatLng(ll);
      }
      if (mk) mk.on("dragend", function () { nastav(mk.getLatLng()); });
      mapa.on("click", function (e) { nastav(e.latlng); });
    }, function () { el.innerHTML = '<div class="meta">Mapa nie je dostupná.</div>'; });
  }

  // ---------- fotky: zmenšenie, nahratie, poradie
  function vodoznakZapnuty() { try { return localStorage.getItem("typek-vodoznak") !== "0"; } catch (e) { return true; } }
  function logoObr() {
    if (!S.logoP) S.logoP = new Promise(function (ok) { var i = new Image(); i.onload = function () { ok(i); }; i.onerror = function () { ok(null); }; i.crossOrigin = "anonymous"; i.src = logoUrl(); });
    return S.logoP;
  }
  // poloha loga: 9 pevných miest (ľavo/stred/pravo × hore/stred/dole) alebo vlastná – stred loga v pomere 0–1
  function vodoznakObdlznik(W, H, lw, lh, n) {
    var m = Math.round(Math.min(W, H) * 0.03), p = n.pozicia || "pd", x, y;
    if (p === "vlastna") {
      x = (+n.x || 0.5) * W - lw / 2; y = (+n.y || 0.5) * H - lh / 2;
      x = Math.min(Math.max(x, m), W - lw - m); y = Math.min(Math.max(y, m), H - lh - m);
      return [x, y];
    }
    var stlpec = { lh: "l", ld: "l", ls: "l", ph: "p", pd: "p", ps: "p" }[p] || "s";
    var riadok = { lh: "h", ph: "h", hore: "h", ld: "d", pd: "d", dole: "d" }[p] || "s";
    x = stlpec === "l" ? m : stlpec === "p" ? W - lw - m : (W - lw) / 2;
    y = riadok === "h" ? m : riadok === "d" ? H - lh - m : (H - lh) / 2;
    return [x, y];
  }
  // vodotlač loga podľa nastavenia kancelárie: poloha, farebná/biela, priehľadnosť, veľkosť
  function kresliVodoznak(g, W, H, logo, n) {
    var lw = Math.round(Math.max(W, H) * n.velkost * (n.pozicia === "stred" ? 1.6 : 1)), lh = Math.round(lw * logo.height / logo.width);
    if (lw > W * 0.9) { lw = Math.round(W * 0.9); lh = Math.round(lw * logo.height / logo.width); }
    var r = vodoznakObdlznik(W, H, lw, lh, n), x = r[0], y = r[1];
    var zdroj = logo;
    if (n.styl === "biele") {
      zdroj = document.createElement("canvas"); zdroj.width = lw; zdroj.height = lh;
      var z = zdroj.getContext("2d"); z.drawImage(logo, 0, 0, lw, lh); z.globalCompositeOperation = "source-in"; z.fillStyle = "#ffffff"; z.fillRect(0, 0, lw, lh);
    }
    g.save(); g.globalAlpha = n.priehladnost; g.shadowColor = "rgba(0,0,0,.45)"; g.shadowBlur = Math.round(lw * 0.03);
    g.drawImage(zdroj, Math.round(x), Math.round(y), lw, lh); g.restore();
  }
  async function zmensiFotku(subor, vodoznak) {
    var logo = vodoznak ? await logoObr() : null;
    return new Promise(function (ok, chyba) {
      var img = new Image(), url = URL.createObjectURL(subor);
      img.onload = function () {
        var max = 1920, k = Math.min(1, max / Math.max(img.width, img.height));
        var c = document.createElement("canvas"); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        var g = c.getContext("2d"); g.drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
        if (logo) kresliVodoznak(g, c.width, c.height, logo, vodoznakNast());
        var varovanie = img.height > img.width ? "Fotka je na výšku – portály uprednostňujú fotky na šírku." : (img.width < 800 || img.height < 600) ? "Fotka je menšia ako 800 × 600." : "";
        c.toBlob(function (b) { b ? ok({ blob: b, w: c.width, h: c.height, varovanie: varovanie }) : chyba(new Error("Fotku sa nepodarilo spracovať.")); }, "image/jpeg", 0.85);
      };
      img.onerror = function () { URL.revokeObjectURL(url); chyba(new Error("Súbor " + subor.name + " nie je obrázok.")); };
      img.src = url;
    });
  }
  function nahodneId() { return (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2)); }
  async function pridajFotky(subory) {
    var E = S.ponukaEdit, p = E.p, stav = $("#pf-nahravanie");
    subory = Array.prototype.slice.call(subory).filter(function (f) { return /^image\//.test(f.type); });
    var volne = 40 - (p.fotky || []).length;
    if (subory.length > volne) { toast("Najviac 40 fotiek – pridám prvých " + volne + ".", true); subory = subory.slice(0, volne); }
    for (var n = 0; n < subory.length; n++) {
      if (stav) { stav.hidden = false; stav.textContent = "Nahrávam fotku " + (n + 1) + " z " + subory.length + "…"; }
      try {
        var z = await zmensiFotku(subory[n], vodoznakZapnuty()), cesta = (S.me.kancelaria || "alpha") + "/" + nahodneId() + ".jpg";
        var r;
        try { r = await sb.storage.from("ponuky").upload(cesta, z.blob, { contentType: "image/jpeg", upsert: false }); } catch (e1) { r = { error: e1 }; }
        var zaznam = { cesta: cesta, w: z.w, h: z.h };
        if (r.error) {
          // lokálne testovanie bez úložiska: fotka sa uloží priamo
          if (location.hostname === "localhost") zaznam = { url: await new Promise(function (ok) { var fr = new FileReader(); fr.onload = function () { ok(fr.result); }; fr.readAsDataURL(z.blob); }), w: z.w, h: z.h };
          else throw r.error;
        }
        if (z.varovanie) zaznam.varovanie = z.varovanie;
        p.fotky = (p.fotky || []).concat([zaznam]); ulozKoncept();
      } catch (err) { toast(chybaText(err), true); }
    }
    vykresliFormularPonuky();
  }
  function napojFotky() {
    var p = S.ponukaEdit.p, drop = $("#pf-drop");
    var vz = $("#pf-vodoznak"); if (vz) vz.onchange = function () { try { localStorage.setItem("typek-vodoznak", vz.checked ? "1" : "0"); } catch (e) { /* nič */ } };
    document.querySelectorAll("[data-fotky-pridat]").forEach(function (inp) { inp.onchange = function () { var f = inp.files; if (f && f.length) pridajFotky(f); inp.value = ""; }; });
    ["dragover", "dragenter"].forEach(function (ev) { drop.addEventListener(ev, function (e) { if (e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types, "Files") >= 0) { e.preventDefault(); drop.classList.add("nad"); } }); });
    drop.addEventListener("dragleave", function () { drop.classList.remove("nad"); });
    drop.addEventListener("drop", function (e) { drop.classList.remove("nad"); if (e.dataTransfer.files && e.dataTransfer.files.length) { e.preventDefault(); pridajFotky(e.dataTransfer.files); } });
    var tahana = null;
    document.querySelectorAll(".pf-foto").forEach(function (f) {
      f.addEventListener("dragstart", function () { tahana = Number(f.dataset.fotoI); f.classList.add("taha"); });
      f.addEventListener("dragend", function () { f.classList.remove("taha"); });
      f.addEventListener("dragover", function (e) { if (tahana != null) e.preventDefault(); });
      f.addEventListener("drop", function (e) {
        if (tahana == null) return; e.preventDefault(); e.stopPropagation();
        var kam = Number(f.dataset.fotoI), arr = p.fotky.slice(), x = arr.splice(tahana, 1)[0]; arr.splice(kam, 0, x);
        p.fotky = arr; tahana = null; ulozKoncept(); vykresliFormularPonuky();
      });
    });
    document.querySelectorAll("[data-foto-akcia]").forEach(function (b) {
      b.onclick = function () {
        var n = Number(b.closest(".pf-foto").dataset.fotoI), arr = p.fotky.slice(), a = b.dataset.fotoAkcia;
        if (a === "zmaz") arr.splice(n, 1);
        if (a === "titul") arr.unshift(arr.splice(n, 1)[0]);
        if (a === "vlavo" && n > 0) arr.splice(n - 1, 0, arr.splice(n, 1)[0]);
        if (a === "vpravo" && n < arr.length - 1) arr.splice(n + 1, 0, arr.splice(n, 1)[0]);
        p.fotky = arr; ulozKoncept(); vykresliFormularPonuky();
      };
    });
  }
  function napojDokumenty() {
    var i = S.ponukaEdit.i;
    var inp = document.querySelector("[data-dok-pridat]");
    if (inp) inp.onchange = async function () {
      var f = inp.files[0]; inp.value = ""; if (!f) return;
      if (f.size > 20 * 1024 * 1024) return toast("Dokument je väčší ako 20 MB.", true);
      var cesta = S.me.id + "/" + nahodneId() + "-" + f.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80);
      var r = await sb.storage.from("ponuky-dokumenty").upload(cesta, f, { upsert: false });
      if (r.error) return toast(chybaText(r.error), true);
      i.dokumenty = (i.dokumenty || []).concat([{ cesta: cesta, nazov: f.name }]); ulozKoncept(); vykresliFormularPonuky();
    };
    document.querySelectorAll("[data-dok-zmaz]").forEach(function (b) {
      b.onclick = function () { i.dokumenty.splice(Number(b.dataset.dokZmaz), 1); ulozKoncept(); vykresliFormularPonuky(); };
    });
  }

  // ---------- návrh textu z parametrov
  function navrhniText(p, i) {
    var typ = p.typ || "Nehnuteľnosť", obec = p.cast_obce ? p.cast_obce + ", " + p.obec : (p.obec || "");
    var na = p.transakcia === "prenajom" ? "na prenájom" : "na predaj";
    var plocha = p.plocha_uzitkova ? nf.format(p.plocha_uzitkova) + " m²" : p.plocha_pozemku ? nf.format(p.plocha_pozemku) + " m²" : "";
    var vyb = (p.vybavenie || []).filter(function (v) { return ["balkón", "lodžia", "terasa", "záhrada", "garáž", "pivnica", "výťah", "bazén"].indexOf(v) >= 0; });
    var nazov = (typ + (vyb[0] ? " s " + ({ balkón: "balkónom", lodžia: "lodžiou", terasa: "terasou", záhrada: "záhradou", garáž: "garážou", pivnica: "pivnicou", výťah: "výťahom", bazén: "bazénom" })[vyb[0]] : "") + (obec ? ", " + (p.cast_obce || p.obec) : "")).slice(0, 60);
    var intro = (typ + " " + na + (obec ? " – " + obec : "") + (plocha ? ", " + plocha : "") + (p.stav_objektu ? ", " + p.stav_objektu : "") +
      (p.cena && p.zobrazit_cenu !== false ? ". Cena " + eur(p.cena) + (p.typ_ceny && p.typ_ceny !== "za nehnuteľnosť" ? " " + p.typ_ceny : "") : "") + ".").slice(0, 160);
    var r = [];
    r.push("Ponúkame " + na + " " + typ.toLowerCase() + (obec ? " v lokalite " + obec : "") + (p.okres ? " (okres " + p.okres + ")" : "") + ".");
    var par = [];
    if (p.plocha_uzitkova) par.push("Úžitková plocha: " + nf.format(p.plocha_uzitkova) + " m²");
    if (p.plocha_zastavana) par.push("Zastavaná plocha: " + nf.format(p.plocha_zastavana) + " m²");
    if (p.plocha_pozemku) par.push("Plocha pozemku: " + nf.format(p.plocha_pozemku) + " m²");
    if (p.izby && p.kategoria !== "byty") par.push("Počet izieb: " + p.izby);
    if (p.poschodie !== undefined && p.poschodie !== null && p.poschodie !== "") par.push("Poschodie: " + (Number(p.poschodie) === 0 ? "prízemie" : p.poschodie) + (p.pocet_podlazi ? " z " + p.pocet_podlazi : ""));
    if (p.stav_objektu) par.push("Stav: " + p.stav_objektu);
    if (p.konstrukcia) par.push("Konštrukcia: " + p.konstrukcia);
    if (p.rok_vystavby) par.push("Rok výstavby: " + p.rok_vystavby);
    if (p.kurenie) par.push("Kúrenie: " + p.kurenie);
    if (p.energ_certifikat) par.push("Energetický certifikát: " + p.energ_certifikat);
    if (p.vlastnictvo) par.push("Vlastníctvo: " + p.vlastnictvo);
    if ((p.orientacia || []).length) par.push("Orientácia: " + p.orientacia.join(", "));
    if (par.length) r.push(par.map(function (x) { return "• " + x; }).join("\n"));
    if ((p.vybavenie || []).length) r.push("K nehnuteľnosti patrí: " + p.vybavenie.join(", ") + ".");
    if (p.cena && p.zobrazit_cenu !== false) r.push("Cena: " + eur(p.cena) + (p.typ_ceny && p.typ_ceny !== "za nehnuteľnosť" ? " " + p.typ_ceny : "") + (p.text_k_cene ? " (" + p.text_k_cene + ")" : "") + ".");
    var mk = S.mById[p.makler_id] || S.me;
    r.push("Pre viac informácií alebo dohodnutie obhliadky ma neváhajte kontaktovať." + (mk ? "\n" + (mk.meno || "") + ", Alpha Reality" : ""));
    return { nazov: nazov, intro: intro, popis: r.join("\n\n") };
  }

  // ---------- detail ponuky
  function galeriaDetailu(F, g) {
    if (!F.length) return '<div class="pd-bez">Bez fotiek</div>';
    return '<div class="pd-hlavna"><img src="' + esc(fotkaUrl(F[g])) + '" alt="">' +
      (F.length > 1 ? '<button type="button" class="pd-sip l" data-gal="-1" aria-label="Predchádzajúca">‹</button><button type="button" class="pd-sip r" data-gal="1" aria-label="Ďalšia">›</button><span class="pd-poc">' + (g + 1) + " / " + F.length + "</span>" : "") + "</div>" +
      '<div class="pd-nahlady">' + F.map(function (f, n) { return '<button type="button" data-gal-i="' + n + '"' + (n === g ? ' aria-current="true"' : "") + '><img loading="lazy" src="' + esc(fotkaUrl(f)) + '" alt=""></button>'; }).join("") + "</div>";
  }
  function vykresliDetailPonuky() {
    var el = $("#obsah"), p = S.ponuky.find(function (x) { return x.id === S.ponukaDetail; });
    if (!p) { S.ponukaDetail = null; return vykresliNehnutelnosti(); }
    var I = S.ponukyInt[p.id], F = p.fotky || [], g = Math.min(S.galeria || 0, Math.max(0, F.length - 1)), st = STAVY_P[p.stav] || ["?", "na"];
    var mozem = admin() || p.makler_id === S.me.id;
    var par = [];
    Object.keys(CISELNE).forEach(function (k) { if (p[k] !== null && p[k] !== undefined && p[k] !== "") par.push([CISELNE[k][0], (k === "poschodie" && Number(p[k]) === 0 ? "prízemie" : nf.format(p[k])) + (CISELNE[k][1] === "m²" ? " m²" : "")]); });
    Object.keys(VYBERY).forEach(function (k) { if (p[k]) par.push([VYBERY[k][0], p[k]]); });
    if ((p.orientacia || []).length) par.push(["Orientácia", p.orientacia.join(", ")]);
    var h = '<div class="box ponuka-detail"><div class="pd-hlava"><button class="btn ghost" type="button" data-ponuka="spat">← Všetky ponuky</button>' +
      (mozem ? '<div class="pd-akcie"><select id="pd-stav" aria-label="Stav ponuky">' + Object.keys(STAVY_P).map(function (s) {
        return '<option value="' + s + '"' + (p.stav === s ? " selected" : "") + ">" + STAVY_P[s][0] + "</option>";
      }).join("") + '</select><button class="btn primary" type="button" data-ponuka="upravit">✏️ Upraviť</button></div>' : "") + "</div>" +
      nastrojePonuky(p, mozem) +
      (mozem && p.makler_id === S.me.id && !S.me.telefon ? '<div class="note">📞 Doplňte si telefón v <a href="#" data-act-profil>Mojom profile</a> – klient ho uvidí na stránke ponuky a na letáku.</div>' : "") +
      '<div class="pd-grid"><div class="pd-galeria">' + galeriaDetailu(F, g) + "</div>" +
      '<div class="pd-info"><div class="pd-cipy"><span class="chip ' + st[1] + '">' + st[0] + '</span><span class="chip">' + (p.transakcia === "prenajom" ? "Prenájom" : "Predaj") + "</span>" +
        (p.exkluzivne ? '<span class="chip won">Exkluzívne</span>' : "") + (p.specialne || []).map(function (s) { return '<span class="chip">' + esc(s) + "</span>"; }).join("") + "</div>" +
        "<h2>" + esc(nazovPonuky(p)) + "</h2>" +
        '<div class="pd-lok">📍 ' + esc([p.ulica, p.cast_obce, p.obec].filter(Boolean).join(", ")) + (p.okres ? " · okres " + esc(p.okres) : "") + "</div>" +
        '<div class="pd-cena">' + esc(cenaPonuky(p)) + (p.zobrazit_cenu === false ? ' <small class="meta">(cena sa nezobrazuje)</small>' : "") + "</div>" +
        (p.text_k_cene ? '<div class="meta">' + esc(p.text_k_cene) + "</div>" : "") +
        '<div class="pd-makler">' + avatar(p.makler_id, 30) + "<span><b>" + esc(meno(p.makler_id)) + "</b><small class=\"meta d-block\">" + esc(p.typ || "") + (p.cislo ? " · č. " + esc(p.cislo) : "") + "</small></span></div>" +
        (par.length ? '<dl class="pd-par">' + par.map(function (x) { return "<dt>" + esc(x[0]) + "</dt><dd>" + esc(x[1]) + "</dd>"; }).join("") + "</dl>" : "") + "</div></div>" +
      ((p.vybavenie || []).length ? '<h4>Vybavenie</h4><div class="cipy">' + p.vybavenie.map(function (v) { return '<span class="cip" aria-pressed="true">' + esc(v) + "</span>"; }).join("") + "</div>" : "") +
      (p.intro ? '<p class="pd-intro">' + esc(p.intro) + "</p>" : "") +
      (p.popis ? '<div class="pd-popis">' + esc(p.popis) + "</div>" : "") +
      (p.virtualna_prehliadka || p.video ? '<section class="pd-media"><h4>🎬 Video a virtuálna prehliadka</h4>' + window.TYPEK_MEDIA.htmlVsetko(p) + "</section>" : "") +
      (p.lat && p.lon ? '<div id="pd-mapa" class="pf-mapa"></div>' : "") +
      (I ? '<section class="pd-interne"><h4>🔒 Interné údaje</h4><dl class="pd-par">' +
        (I.majitel_meno || I.majitel_telefon ? "<dt>Majiteľ</dt><dd>" + esc(I.majitel_meno || "") + (I.majitel_telefon ? ' · <a class="tel" href="tel:' + esc(String(I.majitel_telefon).replace(/[^\d+]/g, "")) + '">' + esc(I.majitel_telefon) + "</a>" : "") +
          (I.majitel_email ? ' · <a href="mailto:' + esc(I.majitel_email) + '">' + esc(I.majitel_email) + "</a>" : "") + "</dd>" : "") +
        (I.ulica_interna ? "<dt>Presná adresa</dt><dd>" + esc(I.ulica_interna) + "</dd>" : "") +
        "<dt>Zmluva</dt><dd>" + (I.zmluva ? esc(I.zmluva_typ || "áno") + (I.zmluva_do ? " · platná do " + datum(I.zmluva_do) + zmluvaZostava(I.zmluva_do) : "") : "bez zmluvy") + "</dd>" +
        (I.provizia ? "<dt>Provízia</dt><dd>" + (I.provizia_typ === "pct" ? nf.format(I.provizia) + " %" : eur(I.provizia)) +
          (I.provizia_rk ? " · pre RK " + (I.provizia_rk_typ === "pct" ? nf.format(I.provizia_rk) + " %" : eur(I.provizia_rk)) : "") + "</dd>" : "") +
        (I.poznamka ? "<dt>Poznámka</dt><dd>" + esc(I.poznamka) + "</dd>" : "") + "</dl>" +
        ((I.dokumenty || []).length ? '<div class="pf-dok">' + I.dokumenty.map(function (d) { return '<button type="button" class="chip-obec" data-dok-otvor="' + esc(d.cesta) + '">📄 ' + esc(d.nazov) + "</button>"; }).join("") + "</div>" : "") + "</section>" : "") +
      sekciaObhliadky(p, mozem) +
      ((p.historia_cien || []).length > 1 ? '<p class="meta">Vývoj ceny: ' + p.historia_cien.map(function (x) { return datum(x[0]) + " " + eur(x[1]); }).join(" → ") + "</p>" : "") +
      (mozem ? sekciaHistorie("nehnutelnosti", p.id) : "") +
      '<p class="meta">Vytvorené ' + datum(p.vytvorene, true) + " · upravené " + datum(p.upravene, true) + (p.zdroj_inzerat ? " · prenesené zo skenera" : "") + "</p></div>";
    el.innerHTML = h;
    napojHistoriu(el);
    window.TYPEK_MEDIA.napoj(el);
    function napojGaleriu() {
      var box = el.querySelector(".pd-galeria");
      function ukaz(n) { S.galeria = n; box.innerHTML = galeriaDetailu(F, n); napojGaleriu(); }
      box.querySelectorAll("[data-gal]").forEach(function (b) { b.onclick = function () { ukaz((Math.min(S.galeria || 0, F.length - 1) + Number(b.dataset.gal) + F.length) % F.length); }; });
      box.querySelectorAll("[data-gal-i]").forEach(function (b) { b.onclick = function () { ukaz(Number(b.dataset.galI)); }; });
    }
    napojGaleriu();
    var sel = $("#pd-stav");
    if (sel) sel.onchange = async function () {
      try { await rpc("zmenit_stav_nehnutelnosti", { p_id: p.id, p_stav: sel.value }); p.stav = sel.value; toast("Stav: " + STAVY_P[sel.value][0]); if (sel.value === "predane") konfety({ pocet: 160 }); vykresliDetailPonuky(); }
      catch (err) { toast(chybaText(err), true); sel.value = p.stav; }
    };
    el.querySelectorAll("[data-dok-otvor]").forEach(function (b) {
      b.onclick = async function () {
        var r = await sb.storage.from("ponuky-dokumenty").createSignedUrl(b.dataset.dokOtvor, 300);
        if (r.error) return toast(chybaText(r.error), true);
        window.open(r.data.signedUrl, "_blank", "noopener");
      };
    });
    if (p.lat && p.lon) kresliMapu("pd-mapa");
    napojNastroje(p);
    var ap = el.querySelector("[data-act-profil]"); if (ap) ap.onclick = function (e) { e.preventDefault(); S.pwdOpen = true; vykresliHeslo(); window.scrollTo({ top: 0, behavior: "smooth" }); };
  }
  function zmluvaStitok(I) {
    if (!I || !I.zmluva || !I.zmluva_do) return "";
    var dni = Math.ceil((new Date(I.zmluva_do) - new Date()) / 864e5);
    return dni <= 30 ? '<span class="pk-zmluva">📝 ' + (dni < 0 ? "zmluva vypršala" : dni === 0 ? "zmluva končí dnes" : "zmluva končí o " + dni + (dni === 1 ? " deň" : dni <= 4 ? " dni" : " dní")) + "</span>" : "";
  }
  function zmluvaZostava(d) {
    var dni = Math.ceil((new Date(d) - new Date()) / 864e5);
    return dni < 0 ? ' <b class="zle-text">(vypršala)</b>' : dni <= 30 ? ' <b class="zle-text">(o ' + dni + " dní)</b>" : "";
  }

  // ---------- prenos inzerátu zo skenera do ponuky
  async function zInzeratu(z) {
    await nacitajLokality().catch(function () {});
    var a = S.arch[z.id];
    if (a === undefined) { var ra = await sb.from("archiv").select("*").eq("inzerat_id", z.id).maybeSingle(); a = S.arch[z.id] = ra.data || null; }
    var kat = { byt: "byty", dom: "domy", pozemok: "pozemky", chata: "chaty", garaz: "garaze" }[z.typ] || "";
    var typ = "";
    if (kat === "byty") typ = z.izby ? (z.izby >= 5 ? "5 a viac izbový byt" : z.izby + "-izbový byt") : "";
    if (kat === "domy") typ = "Rodinný dom"; if (kat === "chaty") typ = "Chata"; if (kat === "garaze") typ = "Garáž";
    var lok = (window.LOKALITY || []).find(function (l) { return !l[5] && normLok(l[0]) === normLok(z.obec) && (!z.okres || l[1] === z.okres); }) ||
      (window.LOKALITY || []).find(function (l) { return !l[5] && normLok(l[0]) === normLok(z.obec); });
    var fotky = a && a.fotky && a.fotky.length ? a.fotky.map(function (c) { return { url: fotoUrl(c) }; }) : [];
    var t = S.tel[z.id];
    var p = { transakcia: "predaj", kategoria: kat, typ: typ, cena: z.cena || "", izby: z.izby || "", zdroj_inzerat: z.id, fotky: fotky,
      popis: (a && a.popis) || z.popis || "", nazov: String(z.nazov || "").slice(0, 60),
      obec: lok ? lok[0] : z.obec || "", okres: lok ? lok[1] : z.okres || "", kraj: lok ? (window.OKRES_KRAJ || {})[lok[1]] || "" : "", lat: lok ? lok[3] : null, lon: lok ? lok[4] : null };
    if (kat === "pozemky") p.plocha_pozemku = z.plocha || ""; else p.plocha_uzitkova = z.plocha || "";
    var i = { majitel_meno: z.predajca && ptyp(z) !== "rk" ? z.predajca : "", majitel_telefon: t ? String(t.telefon).split(",")[0].trim() : "", poznamka: "Prenesené zo skenera: " + (z.url || "") };
    zmazKoncept(); novaPonuka({ p: p, i: i, krok: 0 }); ulozKoncept();
    S.tab = "nehnutelnosti"; history.pushState({ tab: "nehnutelnosti" }, "", "#nehnutelnosti"); vykresli(); window.scrollTo(0, 0);
    toast("➕ Údaje z inzerátu sú predvyplnené – skontrolujte ich a doplňte.");
  }

  // ------------------------------------------------------------ NÁSTROJE K PONUKE: zdieľanie, leták, report, obhliadky, export
  function verejnyOdkaz(id) { return new URL("ponuka.html?id=" + id, location.href).href; }
  function kopirujStaro(text) {
    var t = document.createElement("textarea"); t.value = text; t.setAttribute("readonly", ""); t.style.position = "fixed"; t.style.opacity = "0";
    document.body.appendChild(t); t.select(); try { document.execCommand("copy"); } catch (e) { /* nič */ } t.remove();
  }
  function kopiruj(text, sprava) {
    function ok() { toast(sprava || "Skopírované."); }
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text).then(ok, function () { kopirujStaro(text); ok(); });
    kopirujStaro(text); ok(); return Promise.resolve();
  }
  function telCislo(t) { return String(t || "").replace(/[^\d+]/g, ""); }
  function waCislo(t) { var c = telCislo(t); if (c.indexOf("+") === 0) return c.slice(1); if (c.indexOf("00") === 0) return c.slice(2); if (c.indexOf("0") === 0) return "421" + c.slice(1); return c; }
  function zverejnena(p) { return p.stav === "aktivne" || p.stav === "rezervovane" || p.stav === "predane"; }
  function nacitajSkript(src, globalne) {
    if (window[globalne]) return Promise.resolve();
    S.skripty = S.skripty || {};
    if (!S.skripty[src]) S.skripty[src] = new Promise(function (ok, chyba) {
      var s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = function () { chyba(new Error("Doplnok sa nepodarilo načítať. Skontrolujte internet.")); }; document.head.appendChild(s);
    });
    return S.skripty[src];
  }
  // odkazy na WhatsApp / SMS / email s textom (telefón je nepovinný)
  function odkazSpravy(kam, tel, text, predmet, email) {
    if (kam === "wa") return "https://wa.me/" + (tel ? waCislo(tel) : "") + "?text=" + encodeURIComponent(text);
    if (kam === "sms") return "sms:" + (tel ? telCislo(tel) : "") + "?&body=" + encodeURIComponent(text);
    return "mailto:" + encodeURIComponent(email || "") + "?subject=" + encodeURIComponent(predmet || "") + "&body=" + encodeURIComponent(text);
  }
  function podpis() { return (S.me.meno || "") + ", Alpha Reality" + (S.me.telefon ? "\n" + S.me.telefon : ""); }

  // ---------- obhliadky, zobrazenia, dopyty – načítanie
  async function nacitajNastrojePonuk() {
    var w = await Promise.all([
      vsetkyRiadky("obhliadky", "*", "id").catch(function () { return []; }),
      vsetkyRiadky("zobrazenia_ponuk", "*", "nehnutelnost_id").catch(function () { return []; }),
      nacitajDopyty().catch(function () {}),
    ]);
    S.obhliadky = w[0];
    var z = {}, hranica = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
    w[1].forEach(function (r) { var o = z[r.nehnutelnost_id] = z[r.nehnutelnost_id] || { spolu: 0, d7: 0 }; o.spolu += r.pocet; if (r.den > hranica) o.d7 += r.pocet; });
    S.zobrazenia = z;
  }
  async function nacitajDopyty() {
    var w = await Promise.all([vsetkyRiadky("dopyty", "*", "id"), vsetkyRiadky("dopyty_kontakty", "*", "dopyt_id")]);
    S.dopyty = w[0].sort(function (a, b) { return String(b.upravene).localeCompare(String(a.upravene)); });
    var k = {}; w[1].forEach(function (x) { k[x.dopyt_id] = x; }); S.dopytyK = k;
  }

  // ---------- párovanie dopytov (rovnaké pravidlá ako v databáze)
  var KAT_INZ = { byt: "byty", dom: "domy", pozemok: "pozemky", chata: "chaty", garaz: "garaze" };
  function cisloAlebo(v) { return v === null || v === undefined || v === "" ? null : Number(v); }
  function sediDopyt(d, x) {
    if (d.stav !== "aktivny" || d.transakcia !== (x.transakcia || "predaj")) return false;
    if ((d.kategorie || []).length && d.kategorie.indexOf(x.kategoria) < 0) return false;
    if ((d.typy || []).length && x.typ && d.typy.indexOf(x.typ) < 0) return false;
    if (((d.obce || []).length || (d.okresy || []).length) && !((d.obce || []).some(function (o) { return norm(o) === norm(x.obec); }) || (d.okresy || []).some(function (o) { return norm(o) === norm(x.okres); }))) return false;
    var c = cisloAlebo(x.cena), pl = cisloAlebo(x.plocha), iz = cisloAlebo(x.izby);
    if (c !== null && ((d.cena_od != null && c < Number(d.cena_od)) || (d.cena_do != null && c > Number(d.cena_do) * 1.05))) return false;
    if (pl !== null && ((d.plocha_od != null && pl < Number(d.plocha_od) * 0.95) || (d.plocha_do != null && pl > Number(d.plocha_do)))) return false;
    if (iz !== null && ((d.izby_od != null && iz < d.izby_od) || (d.izby_do != null && iz > d.izby_do))) return false;
    return true;
  }
  function xPonuky(p) {
    return { transakcia: p.transakcia, kategoria: p.kategoria, typ: p.typ, obec: p.obec, okres: p.okres, cena: p.cena,
      plocha: p.kategoria === "pozemky" ? p.plocha_pozemku : (p.plocha_uzitkova || p.plocha_pozemku), izby: p.izby };
  }
  function xInzeratu(z) { return { transakcia: "predaj", kategoria: KAT_INZ[z.typ], typ: null, obec: z.obec, okres: z.okres, cena: z.cena, plocha: z.plocha, izby: z.izby }; }
  function dopytyPrePonuku(p) { return (S.dopyty || []).filter(function (d) { return d.kancelaria === (p.kancelaria || "alpha") && sediDopyt(d, xPonuky(p)); }); }
  function ponukyPreDopyt(d) { return (S.ponuky || []).filter(function (p) { return (p.stav === "aktivne" || p.stav === "rezervovane") && sediDopyt(d, xPonuky(p)); }); }
  function inzeratyPreDopyt(d) {
    if (d.transakcia !== "predaj") return [];
    return S.inz.filter(function (z) { return z.aktivny && !z.duplikat_z && ptyp(z) !== "rk" && sediDopyt(d, xInzeratu(z)); });
  }
  function menoKlienta(d) { var k = (S.dopytyK || {})[d.id]; return k && k.meno ? k.meno : "Klient makléra " + meno(d.makler_id); }
  function popisDopytu(d) {
    var r = [d.transakcia === "prenajom" ? "Prenájom" : "Kúpa"];
    var kat = (d.kategorie || []).map(function (k) { return (KATEGORIE.find(function (x) { return x[0] === k; }) || [k, k])[1]; });
    if ((d.typy || []).length) r.push(d.typy.join(", ")); else if (kat.length) r.push(kat.join(", ")); else r.push("akákoľvek nehnuteľnosť");
    var lok = (d.obce || []).concat((d.okresy || []).map(function (o) { return "okres " + o; }));
    if (lok.length) r.push(lok.slice(0, 4).join(", ") + (lok.length > 4 ? " +" + (lok.length - 4) : ""));
    if (d.cena_od != null || d.cena_do != null) r.push(d.cena_od != null && d.cena_do != null ? eur(d.cena_od) + " – " + eur(d.cena_do) : d.cena_do != null ? "do " + eur(d.cena_do) : "od " + eur(d.cena_od));
    if (d.plocha_od != null || d.plocha_do != null) r.push((d.plocha_od != null ? "od " + nf.format(d.plocha_od) + " " : "") + (d.plocha_do != null ? "do " + nf.format(d.plocha_do) + " " : "") + "m²");
    if (d.izby_od != null || d.izby_do != null) r.push(d.izby_od != null && d.izby_do != null && d.izby_od !== d.izby_do ? d.izby_od + "–" + d.izby_do + " izby" : (d.izby_od || d.izby_do) + (d.izby_do == null ? "+ izby" : " izby"));
    return r.join(" · ");
  }

  // ---------- panel nástrojov v detaile ponuky
  function nastrojePonuky(p, mozem) {
    var Z = (S.zobrazenia || {})[p.id] || { spolu: 0, d7: 0 };
    var nO = (S.obhliadky || []).filter(function (o) { return o.nehnutelnost_id === p.id && !o.zrusena; }).length, nD = dopytyPrePonuku(p).length;
    var h = '<div class="pd-nastroje">' +
      '<button class="btn" type="button" data-pdn="zdielat" aria-pressed="' + (S.pdPanel === "zdielat") + '">🔗 Poslať klientovi</button>' +
      '<a class="btn" href="letak.html?id=' + p.id + '" target="_blank" rel="noopener">🖨 Leták (PDF)</a>' +
      (mozem ? '<button class="btn" type="button" data-pdn="report" aria-pressed="' + (S.pdPanel === "report") + '">📊 Report majiteľovi</button>' : "") +
      '<button class="btn" type="button" data-pdn="siete" aria-pressed="' + (S.pdPanel === "siete") + '">📣 Sociálne siete</button>' +
      '<button class="btn" type="button" data-pdn="text">📋 Text pre portál</button>' + katasterTlacidlo(p, "btn") +
      ((p.fotky || []).length ? '<button class="btn" type="button" data-pdn="zip">⬇️ Fotky (ZIP)</button>' : "") +
      (mozem ? '<button class="btn ghost" type="button" data-pdn="duplikovat">⧉ Duplikovať</button>' : "") +
      (admin() && p.stav === "predane" ? '<button class="btn" type="button" data-pdn="provizia">💶 Zapísať províziu</button>' : "") + "</div>" +
      '<div class="pd-staty"><span>👁 <b>' + nf.format(Z.spolu) + "</b> zobrazení ponuky" + (Z.d7 ? " (" + Z.d7 + " za 7 dní)" : "") + "</span>" +
      "<span>🗝️ <b>" + nO + "</b> " + (nO === 1 ? "obhliadka" : nO >= 2 && nO <= 4 ? "obhliadky" : "obhliadok") + "</span>" +
      "<span>🎯 <b>" + nD + "</b> " + (nD === 1 ? "potenciálny klient" : nD >= 2 && nD <= 4 ? "potenciálni klienti" : "potenciálnych klientov") + "</span></div>";
    if (S.pdPanel === "zdielat") h += panelZdielat(p);
    if (S.pdPanel === "report" && mozem) h += panelReport(p);
    if (S.pdPanel === "siete") h += panelSiete(p);
    return h;
  }
  function panelZdielat(p) {
    var url = verejnyOdkaz(p.id), tel = S.pdTel || "";
    var sprava = "Dobrý deň, posielam Vám ponuku: " + nazovPonuky(p) + (p.zobrazit_cenu !== false && p.cena ? ", " + eur(p.cena) : "") + ".\n" + url + "\n\n" + podpis();
    return '<div class="pd-panel" id="pd-zdielat"><h4>🔗 Poslať ponuku klientovi</h4>' +
      (!zverejnena(p) ? '<div class="note">Ponuka je v stave „' + esc(STAVY_P[p.stav][0]) + "“ – klient ju neuvidí. Najprv nastavte stav <b>Aktívne</b>.</div>" : "") +
      '<div class="pd-odkaz"><input type="text" readonly value="' + esc(url) + '" aria-label="Odkaz na ponuku"><button class="btn" type="button" data-pdn="kopiruj-url">Kopírovať odkaz</button>' +
      '<a class="btn ghost" href="' + esc(url) + '&nahlad=1" target="_blank" rel="noopener">👁 Náhľad</a></div>' +
      '<div class="form-grid"><label class="field"><span>Telefón klienta <small class="meta">nepovinné</small></span><input type="tel" inputmode="tel" id="pd-tel" value="' + esc(tel) + '" placeholder="napr. 0905 123 456"></label>' +
      '<label class="field"><span>Email klienta <small class="meta">nepovinné</small></span><input type="email" id="pd-email" value="' + esc(S.pdEmail || "") + '"></label></div>' +
      '<label class="field"><span>Text správy</span><textarea id="pd-sprava" rows="5">' + esc(sprava) + "</textarea></label>" +
      '<div class="pd-zdiel-btns"><a class="btn wa" href="#" data-posli="wa" target="_blank" rel="noopener">WhatsApp</a><a class="btn" href="#" data-posli="sms">💬 SMS</a>' +
      '<a class="btn" href="#" data-posli="email">✉️ Email</a>' + (navigator.share ? '<button class="btn" type="button" data-pdn="share">📤 Iné aplikácie</button>' : "") +
      '<button class="btn ghost" type="button" data-pdn="kopiruj-text">Kopírovať text</button></div></div>';
  }
  function panelReport(p) {
    var I = S.ponukyInt[p.id] || {};
    var h = '<div class="pd-panel" id="pd-report"><h4>📊 Report pre majiteľa</h4>' +
      '<p class="meta">Majiteľ na odkaze uvidí obhliadky so spätnou väzbou, počet zobrazení ponuky a koľko klientov hľadá podobnú nehnuteľnosť. Mená a telefóny záujemcov nevidí. Report sa priebežne aktualizuje.</p>';
    if (!I.report_token) return h + '<div><button class="btn primary" type="button" data-pdn="report-vytvor">Vytvoriť odkaz na report</button></div></div>';
    var url = new URL("report.html?t=" + I.report_token, location.href).href;
    var sprava = "Dobrý deň" + (I.majitel_meno ? " " + I.majitel_meno.split(" ")[0] : "") + ", posielam Vám prehľad o predaji Vašej nehnuteľnosti – obhliadky, záujem a spätnú väzbu. Odkaz sa priebežne aktualizuje:\n" + url + "\n\n" + podpis();
    return h + '<div class="pd-odkaz"><input type="text" readonly value="' + esc(url) + '" aria-label="Odkaz na report"><button class="btn" type="button" data-pdn="kopiruj-report">Kopírovať odkaz</button>' +
      '<a class="btn ghost" href="' + esc(url) + '" target="_blank" rel="noopener">Otvoriť</a></div>' +
      '<label class="field"><span>Text správy majiteľovi</span><textarea id="pd-sprava-r" rows="4">' + esc(sprava) + "</textarea></label>" +
      '<div class="pd-zdiel-btns">' + (I.majitel_telefon ? '<a class="btn wa" href="#" data-posli-r="wa" target="_blank" rel="noopener">WhatsApp majiteľovi</a><a class="btn" href="#" data-posli-r="sms">💬 SMS</a>' : "") +
      (I.majitel_email ? '<a class="btn" href="#" data-posli-r="email">✉️ Email</a>' : "") + "</div>" +
      (!I.majitel_telefon && !I.majitel_email ? '<p class="meta">Telefón ani email majiteľa nie je vyplnený – doplníte ich v úprave ponuky (krok Interné).</p>' : "") +
      '<label class="toggle"><input type="checkbox" id="pd-report-tyz"' + (I.report_tyzdenne ? " checked" : "") + (I.majitel_email ? "" : " disabled") + "> Každý pondelok o 9:00 poslať majiteľovi report emailom</label>" +
      (I.majitel_email ? (I.report_odoslany ? '<p class="meta">Naposledy odoslaný ' + datum(I.report_odoslany, true) + ".</p>" : "") : '<p class="meta">Na týždenný email treba vyplniť email majiteľa.</p>') + "</div>";
  }
  function textPrePortal(p) {
    var par = [];
    Object.keys(CISELNE).forEach(function (k) { if (p[k] !== null && p[k] !== undefined && p[k] !== "") par.push(CISELNE[k][0] + ": " + (k === "poschodie" && Number(p[k]) === 0 ? "prízemie" : p[k]) + (CISELNE[k][1] === "m²" ? " m²" : "")); });
    Object.keys(VYBERY).forEach(function (k) { if (p[k]) par.push(VYBERY[k][0] + ": " + p[k]); });
    var mk = S.mById[p.makler_id] || {};
    return [nazovPonuky(p), "", (p.transakcia === "prenajom" ? "Prenájom" : "Predaj") + (p.typ ? " · " + p.typ : ""),
      "Lokalita: " + [p.ulica, p.cast_obce, p.obec].filter(Boolean).join(", ") + (p.okres ? ", okres " + p.okres : ""),
      "Cena: " + cenaPonuky(p) + (p.text_k_cene ? " (" + p.text_k_cene + ")" : ""), "",
      p.intro || "", "", p.popis || "", "",
      par.length ? "Parametre:\n" + par.map(function (x) { return "• " + x; }).join("\n") : "",
      (p.vybavenie || []).length ? "\nVybavenie: " + p.vybavenie.join(", ") : "", "",
      "Kontakt: " + (mk.meno || "") + (mk.telefon ? ", " + mk.telefon : "") + (mk.email ? ", " + mk.email : "") + " – Alpha Reality",
      p.cislo ? "Číslo ponuky: " + p.cislo : "", "Fotky a detaily: " + verejnyOdkaz(p.id)].join("\n").replace(/\n{3,}/g, "\n\n").trim();
  }
  async function stiahniFotky(p, b) {
    b.disabled = true; var povodny = b.textContent;
    try {
      await nacitajSkript("https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js", "JSZip");
      var zip = new window.JSZip(), F = p.fotky || [];
      for (var n = 0; n < F.length; n++) {
        b.textContent = "Sťahujem " + (n + 1) + "/" + F.length + "…";
        var r = await fetch(fotkaUrl(F[n])); if (!r.ok) throw new Error("Fotku " + (n + 1) + " sa nepodarilo stiahnuť.");
        zip.file(String(n + 1).padStart(2, "0") + ".jpg", await r.blob());
      }
      var blob = await zip.generateAsync({ type: "blob" }), a = document.createElement("a");
      a.href = URL.createObjectURL(blob); a.download = "ponuka-" + (p.cislo || p.id) + "-fotky.zip"; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
      toast("⬇️ Fotky sú stiahnuté (" + F.length + ").");
    } catch (err) { toast(chybaText(err), true); }
    b.disabled = false; b.textContent = povodny;
  }
  function duplikujPonuku(p) {
    if (nacitajKoncept() && !confirm2("Máte rozpracovanú ponuku. Nahradiť ju kópiou tejto ponuky?")) return;
    var k = JSON.parse(JSON.stringify(p));
    ["id", "cislo", "vytvoril", "vytvorene", "upravene", "historia_cien", "kancelaria", "zdroj_inzerat"].forEach(function (x) { delete k[x]; });
    k.stav = "koncept"; k.nazov = p.nazov ? (p.nazov.slice(0, 52) + " (kópia)") : "";
    var I = JSON.parse(JSON.stringify(S.ponukyInt[p.id] || {}));
    ["nehnutelnost_id", "report_token", "report_tyzdenne", "report_odoslany"].forEach(function (x) { delete I[x]; }); I.dokumenty = [];
    zmazKoncept(); novaPonuka({ p: k, i: I, krok: 0 }); ulozKoncept();
    history.pushState({ tab: "nehnutelnosti", form: 1 }, "", "#nehnutelnosti");
    vykresliNehnutelnosti(); window.scrollTo(0, 0);
    toast("⧉ Kópia ponuky – upravte, čo sa líši (poschodie, cena, fotky…), a uložte.");
  }
  function napojNastroje(p) {
    var el = $("#obsah");
    el.querySelectorAll("[data-pdn]").forEach(function (b) {
      b.onclick = async function () {
        var a = b.dataset.pdn;
        if (a === "zdielat" || a === "report" || a === "siete") { S.pdPanel = S.pdPanel === a ? null : a; vykresliDetailPonuky(); var pn = $(a === "zdielat" ? "#pd-zdielat" : a === "siete" ? "#pd-siete" : "#pd-report"); if (pn) pn.scrollIntoView({ behavior: "smooth", block: "nearest" }); return; }
        if (a === "kopiruj-url") return kopiruj(verejnyOdkaz(p.id), "🔗 Odkaz na ponuku je skopírovaný.");
        if (a === "kopiruj-text") return kopiruj($("#pd-sprava").value, "Text správy je skopírovaný.");
        if (a === "kopiruj-report") return kopiruj(new URL("report.html?t=" + S.ponukyInt[p.id].report_token, location.href).href, "📊 Odkaz na report je skopírovaný.");
        if (a === "share") { navigator.share({ title: nazovPonuky(p), text: $("#pd-sprava").value }).catch(function () {}); return; }
        if (a === "text") return kopiruj(textPrePortal(p), "📋 Text ponuky je skopírovaný – vložte ho do portálu.");
        if (a === "zip") return stiahniFotky(p, b);
        if (a === "duplikovat") return duplikujPonuku(p);
        if (a === "provizia") { S.provForm = proviziaZPonuky(p); S.provF = null; prejdi("provizie"); return; }
        if (a === "report-vytvor") {
          try { var t = await rpc("report_odkaz", { p_id: p.id, p_tyzdenne: null }); S.ponukyInt[p.id] = Object.assign(S.ponukyInt[p.id] || {}, { report_token: t }); vykresliDetailPonuky(); toast("📊 Odkaz na report je pripravený."); }
          catch (err) { toast(chybaText(err), true); }
        }
      };
    });
    var tel = $("#pd-tel"), em = $("#pd-email");
    if (tel) tel.oninput = function () { S.pdTel = tel.value; };
    if (em) em.oninput = function () { S.pdEmail = em.value; };
    el.querySelectorAll("[data-posli]").forEach(function (a) {
      a.onclick = function () { a.href = odkazSpravy(a.dataset.posli, tel ? tel.value : "", $("#pd-sprava").value, nazovPonuky(p) + " – Alpha Reality", em ? em.value : ""); };
    });
    var I = S.ponukyInt[p.id] || {};
    el.querySelectorAll("[data-posli-r]").forEach(function (a) {
      a.onclick = function () { a.href = odkazSpravy(a.dataset.posliR, I.majitel_telefon, $("#pd-sprava-r").value, "Report k ponuke – " + nazovPonuky(p), I.majitel_email); };
    });
    var tyz = $("#pd-report-tyz");
    if (tyz) tyz.onchange = async function () {
      try { await rpc("report_odkaz", { p_id: p.id, p_tyzdenne: tyz.checked }); I.report_tyzdenne = tyz.checked; toast(tyz.checked ? "Majiteľ bude dostávať report každý pondelok." : "Týždenný report je vypnutý."); }
      catch (err) { toast(chybaText(err), true); tyz.checked = !tyz.checked; }
    };
    napojObhliadky(p);
    if (S.pdPanel === "siete") napojSiete(p);
  }

  // ---------- obhliadky v detaile ponuky
  var VYS_OBH = [["naplanovana", "Naplánovaná"], ["zaujem", "Záujem"], ["zvazuje", "Zvažuje"], ["nezaujem", "Bez záujmu"], ["ponuka", "Dal ponuku"], ["nedostavil", "Nedostavil sa"]];
  var VYS_TRIEDA = { zaujem: "won", ponuka: "won", nezaujem: "lost", nedostavil: "lost", zvazuje: "maybe", naplanovana: "na" };
  function sekciaObhliadky(p, mozem) {
    var O = (S.obhliadky || []).filter(function (o) { return o.nehnutelnost_id === p.id && !o.zrusena; }).sort(function (a, b) { return String(b.cas).localeCompare(String(a.cas)); });
    var f = S.obhForm && S.obhForm.nehnutelnost_id === p.id ? S.obhForm : null;
    var D = dopytyPrePonuku(p);
    var h = '<section class="pd-sekcia" id="pd-obhliadky"><div class="pd-sek-hlava"><h4>🗝️ Obhliadky</h4>' +
      (f ? "" : '<button class="btn primary" type="button" data-obh="nova">+ Zapísať obhliadku</button>') + "</div>";
    if (f) {
      var dop = (S.dopyty || []).filter(function (d) { return d.stav === "aktivny"; });
      h += '<form class="pd-obh-form" id="f-obh"><div class="form-grid">' +
        '<label class="field"><span>Dátum a čas</span><input type="datetime-local" name="cas" required value="' + esc(f.cas ? lokalnyCas(new Date(f.cas)) : "") + '"></label>' +
        '<label class="field"><span>Klient z dopytov <small class="meta">nepovinné</small></span><select name="dopyt_id"><option value="">—</option>' +
        dop.map(function (d) { return '<option value="' + d.id + '"' + (Number(f.dopyt_id) === d.id ? " selected" : "") + ">" + esc(menoKlienta(d)) + (D.indexOf(d) >= 0 ? " ★" : "") + "</option>"; }).join("") + "</select></label>" +
        '<label class="field"><span>Meno klienta</span><input type="text" name="klient_meno" value="' + esc(f.klient_meno || "") + '"></label>' +
        '<label class="field"><span>Telefón klienta</span><input name="klient_telefon" type="tel" inputmode="tel" value="' + esc(f.klient_telefon || "") + '"></label>' +
        '<label class="field"><span>Výsledok</span><select name="vysledok"><option value="">—</option>' + VYS_OBH.map(function (v) { return '<option value="' + v[0] + '"' + (f.vysledok === v[0] ? " selected" : "") + ">" + v[1] + "</option>"; }).join("") + "</select></label>" +
        '<label class="field"><span>Ponúknutá cena (€)</span><input name="ponuknuta_cena" type="number" min="0" step="100" inputmode="decimal" value="' + esc(f.ponuknuta_cena == null ? "" : f.ponuknuta_cena) + '"></label></div>' +
        '<label class="field"><span>Spätná väzba pre majiteľa <small class="meta">uvidí ju majiteľ v reporte – píšte vecne a slušne</small></span><textarea name="spatna_vazba" rows="2">' + esc(f.spatna_vazba || "") + "</textarea></label>" +
        '<label class="field"><span>Interná poznámka <small class="meta">len pre maklérov</small></span><textarea name="poznamka" rows="2">' + esc(f.poznamka || "") + "</textarea></label>" +
        '<div class="form-actions"><button class="btn primary" type="submit">Uložiť obhliadku</button><button class="btn ghost" type="button" data-obh="zrus-form">Zrušiť</button></div>' +
        '<p class="meta">Pri budúcej obhliadke vám hodinu vopred pripomenie zvonček (aj emailom).</p></form>';
    }
    if (!O.length && !f) h += '<p class="meta">Zatiaľ žiadne obhliadky. Zapíšte ich aj so spätnou väzbou – majiteľ ich uvidí v reporte.</p>';
    h += O.map(function (o) {
      var buduca = new Date(o.cas).getTime() > Date.now(), v = VYS_OBH.find(function (x) { return x[0] === o.vysledok; });
      var smiem = admin() || o.makler_id === S.me.id || p.makler_id === S.me.id;
      return '<div class="obh' + (buduca ? " buduca" : "") + '"><div class="obh-cas"><b>' + esc(datum(o.cas, true)) + "</b>" + (v ? '<span class="chip ' + (VYS_TRIEDA[o.vysledok] || "") + '">' + v[1] + "</span>" : "") + "</div>" +
        '<div class="obh-telo">' + (o.klient_meno || o.klient_telefon ? "<b>" + esc(o.klient_meno || "Klient") + "</b>" + (o.klient_telefon ? ' · <a class="tel" href="tel:' + esc(telCislo(o.klient_telefon)) + '">' + esc(o.klient_telefon) + "</a>" : "") : '<span class="meta">Klient neuvedený</span>') +
        (o.makler_id && o.makler_id !== p.makler_id ? ' <span class="meta">· ' + avatar(o.makler_id, 18) + " " + esc(meno(o.makler_id)) + "</span>" : "") +
        (o.ponuknuta_cena ? '<div>Ponúknutá cena: <b>' + eur(o.ponuknuta_cena) + "</b></div>" : "") +
        (o.spatna_vazba ? '<div class="obh-vazba">💬 ' + esc(o.spatna_vazba) + "</div>" : "") + (o.poznamka ? '<div class="meta">🔒 ' + esc(o.poznamka) + "</div>" : "") + "</div>" +
        (smiem ? '<div class="obh-akcie"><button class="btn ghost" type="button" data-obh="upravit" data-id="' + o.id + '">Upraviť</button><button class="btn ghost danger" type="button" data-obh="zrusit" data-id="' + o.id + '">Zrušiť</button></div>' : "") + "</div>";
    }).join("");
    h += "</section>";
    // potenciálni klienti
    h += '<section class="pd-sekcia"><div class="pd-sek-hlava"><h4>🎯 Potenciálni klienti <small class="meta">dopyty, na ktoré ponuka sedí</small></h4>' +
      '<button class="btn ghost" type="button" data-klienti-novy>+ Nový dopyt</button></div>' +
      (D.length ? D.map(function (d) {
        var K = (S.dopytyK || {})[d.id];
        return '<div class="pk-klient"><span class="pk-kl-av">' + avatar(d.makler_id, 28) + "</span><div><b>" + esc(menoKlienta(d)) + '</b><div class="meta">' + esc(popisDopytu(d)) + "</div>" +
          (d.popis ? '<div class="meta">„' + esc(d.popis.slice(0, 140)) + "“</div>" : "") + "</div>" +
          '<div class="pk-kl-akcie">' + (K && K.telefon ? '<a class="btn ghost" href="tel:' + esc(telCislo(K.telefon)) + '">📞</a><button class="btn ghost" type="button" data-posli-klientovi="' + d.id + '" title="Poslať ponuku klientovi">📤</button>' : "") +
          '<button class="btn ghost" type="button" data-obh="nova" data-dopyt="' + d.id + '" title="Zapísať obhliadku">🗝️</button>' +
          '<button class="btn ghost" type="button" data-dopyt-otvor="' + d.id + '">Detail</button></div></div>';
      }).join("") : '<p class="meta">Žiadny aktívny dopyt zatiaľ nesedí. Keď maklér zapíše klienta, ktorý hľadá niečo podobné, zobrazí sa tu a príde mu upozornenie.</p>') + "</section>";
    return h;
  }
  function napojObhliadky(p) {
    var el = $("#obsah");
    el.querySelectorAll("[data-obh]").forEach(function (b) {
      b.onclick = async function () {
        var a = b.dataset.obh;
        if (a === "nova") {
          var d = b.dataset.dopyt ? (S.dopyty || []).find(function (x) { return x.id === Number(b.dataset.dopyt); }) : null, K = d ? (S.dopytyK || {})[d.id] || {} : {};
          var zajtra = new Date(Date.now() + 864e5); zajtra.setHours(16, 0, 0, 0);
          S.obhForm = { nehnutelnost_id: p.id, cas: zajtra.toISOString(), dopyt_id: d ? d.id : "", klient_meno: K.meno || "", klient_telefon: K.telefon || "" };
        }
        if (a === "upravit") S.obhForm = Object.assign({}, (S.obhliadky || []).find(function (o) { return o.id === Number(b.dataset.id); }));
        if (a === "zrus-form") S.obhForm = null;
        if (a === "zrusit") {
          if (!confirm2("Zrušiť túto obhliadku?")) return;
          try { await rpc("zrusit_obhliadku", { p_id: Number(b.dataset.id) }); await nacitajNastrojePonuk(); await nacitajPripomienky(); popisZvoncek(); toast("Obhliadka je zrušená."); }
          catch (err) { return toast(chybaText(err), true); }
        }
        vykresliDetailPonuky();
        var s = $("#pd-obhliadky"); if (s && (a === "nova" || a === "upravit")) s.scrollIntoView({ behavior: "smooth", block: "start" });
      };
    });
    var f = $("#f-obh");
    if (f) {
      f.dopyt_id.onchange = function () {
        var K = (S.dopytyK || {})[Number(f.dopyt_id.value)];
        if (K) { if (!f.klient_meno.value) f.klient_meno.value = K.meno || ""; if (!f.klient_telefon.value) f.klient_telefon.value = K.telefon || ""; }
      };
      f.onsubmit = async function (e) {
        e.preventDefault();
        var btn = f.querySelector('[type="submit"]'); btn.disabled = true;
        try {
          await rpc("ulozit_obhliadku", { p: { id: S.obhForm.id || null, nehnutelnost_id: p.id, cas: new Date(f.cas.value).toISOString(), dopyt_id: f.dopyt_id.value || null,
            klient_meno: f.klient_meno.value, klient_telefon: f.klient_telefon.value, vysledok: f.vysledok.value, ponuknuta_cena: f.ponuknuta_cena.value,
            spatna_vazba: f.spatna_vazba.value, poznamka: f.poznamka.value } });
          S.obhForm = null; await nacitajNastrojePonuk(); await nacitajPripomienky(); popisZvoncek();
          toast("🗝️ Obhliadka je uložená."); vykresliDetailPonuky();
        } catch (err) { toast(chybaText(err), true); btn.disabled = false; }
      };
    }
    el.querySelectorAll("[data-posli-klientovi]").forEach(function (b) {
      b.onclick = function () {
        var K = (S.dopytyK || {})[Number(b.dataset.posliKlientovi)] || {};
        S.pdTel = K.telefon || ""; S.pdEmail = K.email || ""; S.pdPanel = "zdielat"; vykresliDetailPonuky();
        var pn = $("#pd-zdielat"); if (pn) pn.scrollIntoView({ behavior: "smooth", block: "start" });
      };
    });
    el.querySelectorAll("[data-dopyt-otvor]").forEach(function (b) { b.onclick = function () { otvorDopyt(Number(b.dataset.dopytOtvor)); }; });
    el.querySelectorAll("[data-klienti-novy]").forEach(function (b) { b.onclick = function () { novyDopyt(); }; });
  }

  // ---------- web a export
  function vykresliExport() {
    var el = $("#obsah"), base = new URL(".", location.href).href, feed = CFG.supabaseUrl + "/functions/v1/feed";
    var kodRK = '<div data-typek-ponuky data-filtre="1"></div>\n<script src="' + base + 'widget.js" async></script>';
    var kodJa = '<div data-typek-ponuky data-makler="' + S.me.id + '"></div>\n<script src="' + base + 'widget.js" async></script>';
    el.innerHTML = '<div class="box export"><div class="pd-hlava"><button class="btn ghost" type="button" data-export="spat">← Ponuky</button></div>' +
      "<h3>🌐 Web a export ponúk</h3>" +
      '<p class="meta">Aktívne a rezervované ponuky sa automaticky zobrazujú všade, kam vložíte kód nižšie – zmena v Realitnom týpkovi sa hneď prejaví aj na webe. Zverejňujú sa len verejné údaje (bez majiteľa, zmluvy a provízie).</p>' +
      '<div class="exp-blok"><h4>Ponuky kancelárie na web (napr. alphareality.sk)</h4><p class="meta">Vložte do stránky ako HTML blok. Zobrazí ponuky s prepínačmi predaj/prenájom a druh.</p>' +
      '<pre class="kod" id="kod-rk">' + esc(kodRK) + '</pre><button class="btn" type="button" data-kopiruj-kod="kod-rk">Kopírovať kód</button></div>' +
      '<div class="exp-blok"><h4>Moje ponuky – osobný web makléra</h4><pre class="kod" id="kod-ja">' + esc(kodJa) + '</pre><button class="btn" type="button" data-kopiruj-kod="kod-ja">Kopírovať kód</button></div>' +
      '<div class="exp-blok"><h4>Feed pre portály a webového vývojára</h4><p class="meta">Strojovo čitateľný zoznam ponúk s fotkami. Keď dostaneme od portálu (Nehnuteľnosti.sk, Reality.sk, TopReality…) ich formát importu, napojíme ho na tento feed.</p>' +
      '<div class="pd-odkaz"><input type="text" readonly value="' + esc(feed) + '" aria-label="XML feed"><button class="btn" type="button" data-kopiruj="' + esc(feed) + '">XML</button>' +
      '<button class="btn" type="button" data-kopiruj="' + esc(feed + "?format=json") + '">JSON</button><a class="btn ghost" href="' + esc(feed) + '" target="_blank" rel="noopener">Otvoriť</a></div></div>' +
      (admin() ? blokUc() : "") +
      '<div class="exp-blok"><h4>Náhľad – takto to uvidia návštevníci webu</h4><div class="exp-nahlad"><div data-typek-ponuky data-filtre="1" id="exp-widget"></div></div></div></div>';
    el.querySelector('[data-export="spat"]').onclick = function () { S.ponukaExport = false; vykresliNehnutelnosti(); };
    el.querySelectorAll("[data-kopiruj-kod]").forEach(function (b) { b.onclick = function () { kopiruj($("#" + b.dataset.kopirujKod).textContent, "Kód je skopírovaný."); }; });
    el.querySelectorAll("[data-kopiruj]").forEach(function (b) { b.onclick = function () { kopiruj(b.dataset.kopiruj, "Adresa feedu je skopírovaná."); }; });
    if (admin()) vykresliUc();
    if (window.TypekPonuky) window.TypekPonuky.obnov();
    else nacitajSkript("widget.js?v=202610201600", "TypekPonuky").catch(function (e) { toast(chybaText(e), true); });
  }

  // ------------------------------------------------------------ KLIENTI A DOPYTY
  function vykresliKlientov() {
    var el = $("#obsah"); if (!el) return;
    if (S.dopytEdit) return vykresliFormDopytu();
    if (!S.dopytDetail && klPohlad() === "predavajuci") return vykresliPredavajucich();
    if (!S.dopyty) { el.innerHTML = '<div class="box"><div class="meta">Načítavam klientov…</div></div>'; nacitajDopyty().then(vykresliKlientov, function (e) { toast(chybaText(e), true); S.dopyty = []; S.dopytyK = {}; vykresliKlientov(); }); return; }
    if (S.dopytDetail) return vykresliDetailDopytu();
    var F = S.klF = S.klF || { kto: admin() ? "vsetci" : "moji", stav: "aktivny", q: "" };
    var poc = { aktivny: 0, vybaveny: 0, zruseny: 0 };
    var podlaKto = S.dopyty.filter(function (d) { return F.kto === "vsetci" || d.makler_id === S.me.id; });
    podlaKto.forEach(function (d) { poc[d.stav]++; });
    var q = norm(F.q);
    var zoz = podlaKto.filter(function (d) { return d.stav === F.stav && (!q || norm([menoKlienta(d), popisDopytu(d), d.popis, meno(d.makler_id)].join(" ")).indexOf(q) >= 0); });
    var h = prepinacKlientov() + '<div class="box nehn"><div class="vykon-hlava"><h3>👥 Klienti a dopyty</h3><button class="btn primary" type="button" data-dop="novy">+ Nový dopyt</button></div>' +
      '<p class="meta">Zapíšte, čo klient hľadá. Ponuky kancelárie aj nové súkromné inzeráty zo skenera sa s dopytom automaticky porovnávajú – keď niečo sedí, príde vám upozornenie do zvončeka.</p>' +
      '<div class="nehn-filtre"><div class="seg" role="group">' + [["moji", "Moji klienti"], ["vsetci", "Všetci"]].map(function (x) { return '<button type="button" data-klf-kto="' + x[0] + '" aria-pressed="' + (F.kto === x[0]) + '">' + x[1] + "</button>"; }).join("") + "</div>" +
      '<div class="seg" role="group">' + [["aktivny", "Aktívne"], ["vybaveny", "Vybavené"], ["zruseny", "Zrušené"]].map(function (x) { return '<button type="button" data-klf-stav="' + x[0] + '" aria-pressed="' + (F.stav === x[0]) + '">' + x[1] + ' <span class="n">' + poc[x[0]] + "</span></button>"; }).join("") + "</div>" +
      '<input type="search" id="klienti-q" placeholder="Hľadať: meno, obec, typ…" value="' + esc(F.q) + '"></div>';
    if (!zoz.length) h += '<div class="prazdne"><span class="dl-ikona velka">' + ikona("klienti") + "</span><b>" + (q ? "Nič sa nenašlo" : F.stav === "aktivny" ? "Zatiaľ žiadne aktívne dopyty" : "Žiadne dopyty") + '</b><span class="meta">Pridajte klienta tlačidlom „Nový dopyt“ – napr. „3-izbový byt v SNV do 150 000 €“.</span></div>';
    else h += '<div class="dopyty">' + zoz.map(function (d) {
      var nP = ponukyPreDopyt(d).length, nI = inzeratyPreDopyt(d).length;
      return '<button type="button" class="dopyt-karta" data-dopyt-otvor="' + d.id + '"><span class="dk-hl">' + avatar(d.makler_id, 30) + "<span><b>" + esc(menoKlienta(d)) + '</b><small class="meta d-block">' + esc(meno(d.makler_id)) + " · " + ago(d.upravene) + "</small></span></span>" +
        '<span class="dk-popis">' + esc(popisDopytu(d)) + "</span>" + (d.popis ? '<span class="meta dk-text">„' + esc(d.popis.slice(0, 120)) + "“</span>" : "") +
        '<span class="dk-zhody">' + (nP ? '<span class="chip won">🏠 ' + nP + " " + (nP === 1 ? "ponuka" : nP <= 4 ? "ponuky" : "ponúk") + "</span>" : "") +
        (nI ? '<span class="chip maybe">🔎 ' + nI + " " + (nI === 1 ? "inzerát" : nI <= 4 ? "inzeráty" : "inzerátov") + "</span>" : "") + (!nP && !nI && d.stav === "aktivny" ? '<span class="chip na">zatiaľ nič nesedí</span>' : "") + "</span></button>";
    }).join("") + "</div>";
    el.innerHTML = h + "</div>";
    viazPrepinacKlientov(el);
    el.querySelectorAll("[data-klf-kto]").forEach(function (b) { b.onclick = function () { F.kto = b.dataset.klfKto; vykresliKlientov(); }; });
    el.querySelectorAll("[data-klf-stav]").forEach(function (b) { b.onclick = function () { F.stav = b.dataset.klfStav; vykresliKlientov(); }; });
    el.querySelectorAll("[data-dopyt-otvor]").forEach(function (b) { b.onclick = function () { otvorDopyt(Number(b.dataset.dopytOtvor)); }; });
    el.querySelector('[data-dop="novy"]').onclick = function () { novyDopyt(); };
    var t; $("#klienti-q").addEventListener("input", function () { var v = this.value; clearTimeout(t); t = setTimeout(function () { F.q = v; vykresliKlientov(); var i = $("#klienti-q"); if (i) { i.focus(); i.setSelectionRange(v.length, v.length); } }, 200); });
  }
  // ------------------------------------------------------------ PREDÁVAJÚCI ZO SKENERA
  // predvolene sú Predávajúci zo skenera (ak má maklér prístup k skeneru)
  function klPohlad() {
    if (!maSekciu("inzeraty") || S.predNedostupne) return "dopyty";
    return S.klPohlad || "predavajuci";
  }
  function prepinacKlientov() {
    if (!maSekciu("inzeraty") || S.predNedostupne) return "";
    var p = klPohlad();
    var nPred = S.pred ? S.pred.filter(function (k) { return k.sukromny && !k.rk; }).length : null;
    var nDop = S.dopyty ? S.dopyty.filter(function (d) { return d.stav === "aktivny"; }).length : null;
    return '<div class="sch-pohlad kl-pohlad" role="group" aria-label="Klienti">' + [
      ["predavajuci", "📇", "Predávajúci zo skenera", nPred == null ? "kontakty z inzerátov" : nf.format(nPred) + " " + (nPred === 1 ? "predávajúci" : "predávajúcich")],
      ["dopyty", "🎯", "Dopyty klientov", nDop == null ? "čo hľadajú vaši klienti" : nf.format(nDop) + " " + (nDop === 1 ? "aktívny dopyt" : nDop >= 2 && nDop <= 4 ? "aktívne dopyty" : "aktívnych dopytov")]].map(function (x) {
      return '<button type="button" data-kl-pohlad="' + x[0] + '" aria-pressed="' + (p === x[0]) + '"><span class="sp-ik" aria-hidden="true">' + x[1] +
        '</span><span class="sp-txt"><b>' + x[2] + "</b><small>" + x[3] + "</small></span></button>"; }).join("") + "</div>";
  }
  function viazPrepinacKlientov(el) {
    el.querySelectorAll("[data-kl-pohlad]").forEach(function (b) {
      b.onclick = function () { S.klPohlad = b.dataset.klPohlad; S.predDetail = null; S.dopytDetail = null; history.pushState({ tab: "klienti", kl: S.klPohlad }, "", "#klienti"); vykresliKlientov(); window.scrollTo(0, 0); };
    });
  }
  function otvorPredajcu(tel) {
    S.klPohlad = "predavajuci"; S.predDetail = tel; S.dopytDetail = null; S.dopytEdit = null;
    if (S.tab !== "klienti") { if (!tabPovoleny("klienti")) return toast("Sekciu Klienti nemáte povolenú.", true); S.tab = "klienti"; }
    history.pushState({ tab: "klienti", kl: "predavajuci", pred: tel }, "", "#klienti"); vykresli(); window.scrollTo(0, 0);
  }
  function predHladanie(k) {
    if (!k._t) k._t = norm([k.meno, k.meno_portal, k.poznamka, k.tel, k.telefon].concat(k.inzeraty.map(function (i) { return [i.nazov, i.obec].join(" "); })).join(" "));
    return k._t;
  }
  function vykresliPredavajucich() {
    var el = $("#obsah"); if (!el) return;
    if (!S.pred) {
      el.innerHTML = prepinacKlientov() + '<div class="box"><div class="meta">Načítavam predávajúcich…</div></div>'; viazPrepinacKlientov(el);
      nacitajPredajcov().then(vykresliKlientov, function (e) { toast(chybaText(e), true); S.pred = []; S.predTel = {}; S.predInz = {}; vykresliKlientov(); });
      return;
    }
    if (S.predDetail) return vykresliDetailPredajcu();
    var F = S.predF = S.predF || { filter: "vsetci", q: "", n: 60 };
    if (F.kto == null) F.kto = "";
    function patriKto(k) { return !F.kto || (F.kto === "__bez" ? !k.makler_id && !(k.prevzali || []).length : k.makler_id === F.kto || (k.prevzali || []).indexOf(F.kto) >= 0); }
    var sukr = S.pred.filter(function (k) { return k.sukromny && !k.rk; }), realitky = S.pred.filter(function (k) { return k.rk; });
    var FILTRE = [["vsetci", "Všetci", function () { return true; }],
      ["historia", "Volali sme", function (k) { return !!k.posledny_kontakt; }],
      ["viac", "Viac inzerátov", function (k) { return k.pocet > 1; }],
      ["nevolat", "Nevolať", function (k) { return k.nevolat; }],
      ["rk", "Realitky", null]];
    var q = norm(F.q), qd = /\d/.test(F.q) ? F.q.replace(/\D/g, "").replace(/^(00)?421/, "0") : "";
    var fx = (FILTRE.find(function (x) { return x[0] === F.filter; }) || FILTRE[0])[2];
    var zaklad = F.filter === "rk" ? realitky : sukr;
    var zoz = zaklad.filter(function (k) { return (!fx || fx(k)) && patriKto(k) && (!q || predHladanie(k).indexOf(q) >= 0 || (qd.length >= 4 && k.tel.indexOf(qd) >= 0)); });
    var h = prepinacKlientov() + '<div class="box nehn pred-box"><div class="vykon-hlava"><h3>📇 Predávajúci zo skenera</h3></div>' +
      '<p class="meta">Každý predávajúci podľa telefónneho čísla – so všetkými inzerátmi a celou históriou hovorov. Ostáva tu, aj keď inzerát z portálu zmizne. Číslo sa berie z textu inzerátu alebo z „＋ Telefón predajcu“ v skeneri.</p>' +
      '<div class="nehn-filtre"><div class="seg" role="group">' + FILTRE.map(function (x) {
        var n = x[2] ? sukr.filter(x[2]).length : realitky.length;
        return '<button type="button" data-predf="' + x[0] + '" aria-pressed="' + (F.filter === x[0]) + '">' + x[1] + ' <span class="n">' + n + "</span></button>"; }).join("") + "</div>" +
      '<select id="pred-kto" aria-label="Maklér"><option value="">👤 Všetci makléri</option><option value="__bez">Bez makléra</option>' +
      S.makleri.filter(function (m) { return m.aktivny; }).map(function (m) { return '<option value="' + m.id + '"' + (F.kto === m.id ? " selected" : "") + ">" + esc(m.meno || m.email) + (m.id === S.me.id ? " (ja)" : "") + "</option>"; }).join("") + "</select>" +
      '<input type="search" id="pred-q" placeholder="Hľadať: meno, telefón, obec…" value="' + esc(F.q) + '">' +
      '<button class="btn primary" type="button" id="pred-novy">+ Pridať predávajúceho</button></div>' +
      (S.predNovy ? '<form class="box pred-novy" id="f-pred-novy"><h4>Nový predávajúci</h4><div class="form-grid">' +
        '<label class="field"><span>Telefón *</span><input type="tel" name="tel" required inputmode="tel" placeholder="0905 123 456"></label>' +
        '<label class="field"><span>Meno</span><input type="text" name="meno" maxlength="120"></label>' +
        '<label class="field"><span>Maklér</span><select name="makler">' + S.makleri.filter(function (m) { return m.aktivny && (admin() || m.id === S.me.id); }).map(function (m) {
          return '<option value="' + m.id + '"' + (m.id === S.me.id ? " selected" : "") + ">" + esc(m.meno || m.email) + "</option>"; }).join("") + "</select></label></div>" +
        '<label class="field"><span>Poznámka (čo predáva, kde, kedy volať…)</span><textarea name="poznamka" rows="3" maxlength="2000"></textarea></label>' +
        '<div class="form-actions"><button class="btn primary" type="submit">Uložiť</button><button class="btn ghost" type="button" id="pred-novy-x">Zrušiť</button></div>' +
        '<p class="meta">Keď sa toto číslo objaví v novom inzeráte, skener ho spojí s týmto predávajúcim aj s poznámkou.</p></form>' : "");
    if (!zoz.length) h += '<div class="prazdne"><span class="dl-ikona velka">' + ikona("klienti") + "</span><b>" + (q || qd ? "Nič sa nenašlo" : F.filter === "rk" ? "Žiadne označené realitky" : "Zatiaľ tu nikto nie je") + '</b><span class="meta">' +
      (F.filter === "rk" ? "Keď pri predávajúcom stlačíte „Je to RK“, presunie sa sem a jeho inzeráty sa v skeneri presunú medzi realitky." : "Predávajúci sa sem pridávajú sami, keď má súkromný inzerát v skeneri telefónne číslo.") + "</span></div>";
    else {
      h += '<div class="dopyty">' + zoz.slice(0, F.n).map(function (k) {
        var pk = k.posledny_kontakt, akt = k.inzeraty.filter(function (i) { return i.aktivny; }).length;
        return '<button type="button" class="dopyt-karta pred-karta' + (k.nevolat ? " nevolat" : "") + '" data-pred-otvor="' + esc(k.tel) + '"><span class="dk-hl"><span class="pred-av">' + (k.nevolat ? "🚫" : "📇") + "</span><span><b>" + esc(k.meno || "Bez mena") +
          '</b><small class="meta d-block">' + esc(k.telefon) + (k.pocet ? " · v skeneri " + ago(k.najnovsi) : " · inzerát v skeneri nie je") + "</small></span></span>" +
          '<span class="dk-popis">' + esc(k.inzeraty.slice(0, 2).map(function (i) { return i.nazov; }).join(" · ")) + (k.pocet > 2 ? " · +" + (k.pocet - 2) : "") + "</span>" +
          (pk ? '<span class="meta dk-text">' + avatar(pk.makler_id, 16) + " " + esc(meno(pk.makler_id)) + " " + datum(pk.vytvorene) + ": <b>" + esc(popisKontaktu(pk)) + "</b>" + (pk.poznamka ? " – " + esc(pk.poznamka.slice(0, 70)) : "") + "</span>" : "") +
          (k.poznamka ? '<span class="meta dk-text">📝 ' + esc(k.poznamka.slice(0, 100)) + "</span>" : "") +
          '<span class="dk-zhody">' + (k.makler_id ? '<span class="chip won">👤 ' + esc(meno(k.makler_id)) + "</span>" : "") +
          '<span class="chip">' + k.pocet + " " + tvarInz(k.pocet) + (akt !== k.pocet ? " · " + akt + " na portáli" : "") + "</span>" +
          (k.hovorov ? '<span class="chip">📞 ' + k.hovorov + "× volané</span>" : '<span class="chip na">zatiaľ nevolané</span>') +
          (k.nevolat ? '<span class="chip lost">Nevolať</span>' : "") + (k.rk ? '<span class="chip">🏢 realitka</span>' : k.asi_rk ? '<span class="chip maybe">možno realitka</span>' : "") + "</span></button>";
      }).join("") + "</div>";
      if (zoz.length > F.n) h += '<button class="btn more" type="button" data-pred-viac>Zobraziť ďalších (' + (zoz.length - F.n) + ")</button>";
    }
    el.innerHTML = h + "</div>";
    viazPrepinacKlientov(el);
    el.querySelectorAll("[data-predf]").forEach(function (b) { b.onclick = function () { F.filter = b.dataset.predf; F.n = 60; vykresliKlientov(); }; });
    var v = el.querySelector("[data-pred-viac]"); if (v) v.onclick = function () { F.n += 60; vykresliKlientov(); };
    $("#pred-kto").onchange = function () { F.kto = this.value; F.n = 60; vykresliKlientov(); };
    $("#pred-novy").onclick = function () { S.predNovy = !S.predNovy; vykresliKlientov(); var i = document.querySelector('#f-pred-novy [name="tel"]'); if (i) i.focus(); };
    var fpn = $("#f-pred-novy");
    if (fpn) {
      $("#pred-novy-x").onclick = function () { S.predNovy = false; vykresliKlientov(); };
      fpn.onsubmit = async function (e) {
        e.preventDefault();
        var btn = fpn.querySelector('[type="submit"]'); btn.disabled = true;
        try {
          await rpc("ulozit_predajcu", { p_telefon: fpn.tel.value, p_meno: fpn.meno.value, p_poznamka: fpn.poznamka.value, p_nevolat: false });
          await rpc("priradit_predajcu", { p_telefon: fpn.tel.value, p_makler: fpn.makler.value });
          S.predNovy = false; await nacitajPredajcov(); toast("📇 Predávajúci je pridaný."); vykresliKlientov();
        } catch (err) { toast(chybaText(err), true); btn.disabled = false; }
      };
    }
    var t; $("#pred-q").addEventListener("input", function () { var val = this.value; clearTimeout(t); t = setTimeout(function () { F.q = val; F.n = 60; vykresliKlientov(); var i = $("#pred-q"); if (i) { i.focus(); i.setSelectionRange(val.length, val.length); } }, 200); });
  }
  function archivPredajcu(i, otvorene) {
    if (!(i.id in S.arch)) return '<p class="meta arch-nacitam">Načítavam uložený text inzerátu…</p>';
    var a = S.arch[i.id];
    if (!a || !(a.popis || (a.fotky || []).length)) return '<p class="meta">Text inzerátu sa ešte neuložil – skener ho uloží pri najbližšej kontrole.</p>';
    var fotky = (a.fotky || []).length ? a.fotky.map(fotoUrl) : i.aktivny ? (a.fotky_portal || []).slice(0, 10) : [];
    var riadky = riadkyParametrov(a.parametre);
    var otv = S.archOtv && i.id in S.archOtv ? S.archOtv[i.id] : otvorene;
    return '<details class="arch-blok" data-arch="' + esc(i.id) + '"' + (otv ? " open" : "") + '><summary>📄 Text a fotky z inzerátu <small class="meta">uložené ' + datum(a.ulozene) +
      ((a.fotky || []).length ? " · " + a.fotky.length + " fotiek" : "") + (i.aktivny ? "" : " · inzerát už na portáli nie je, ale máme ho") + "</small></summary>" +
      (fotky.length ? '<div class="d-fotky">' + fotky.map(function (u) { return '<a href="' + esc(u) + '" target="_blank" rel="noopener"><img loading="lazy" referrerpolicy="no-referrer" src="' + esc(u) + '" alt=""></a>'; }).join("") + "</div>" : "") +
      (a.telefon ? '<div class="d-tel">📞 ' + telOdkaz(a.telefon) + " <small>z textu inzerátu</small></div>" : "") +
      (riadky.length ? '<div class="d-par">' + riadky.map(function (r) { return "<span>" + esc(r) + "</span>"; }).join("") + "</div>" : "") +
      (a.popis ? '<div class="d-popis">' + esc(a.popis) + "</div>" : "") +
      '<div class="arch-akcie"><button class="btn ghost" type="button" data-kopiruj-text="' + esc(i.id) + '">📋 Kopírovať text</button></div>' +
      archivHistoria(a) + "</details>";
  }
  function vykresliDetailPredajcu() {
    var el = $("#obsah"), k = S.predTel[S.predDetail];
    if (!k) { S.predDetail = null; toast("Predávajúci sa nenašiel – číslo mohlo byť vymazané.", true); return vykresliPredavajucich(); }
    var tel = S.predDetail;
    nacitajArchivy(k.inzeraty.map(function (i) { return i.id; })).then(function (nove) {
      if (nove && S.predDetail === tel && $(".pred-detail")) vykresliDetailPredajcu();
    }, function () { k.inzeraty.forEach(function (i) { if (!(i.id in S.arch)) S.arch[i.id] = null; }); });
    var nazvy = {}; k.inzeraty.forEach(function (i) { nazvy[i.id] = i.nazov; });
    var cislo = String(k.telefon || k.tel).replace(/[^\d+]/g, "");
    var h = '<div class="box pred-detail"><div class="pd-hlava"><button class="btn ghost" type="button" data-predd="spat">← Všetci predávajúci</button>' +
      '<div class="pd-akcie">' + (k.rk ? '<button class="btn" type="button" data-predd="nie-rk">Nie je RK</button>' : '<button class="btn" type="button" data-predd="je-rk">🏢 Je to RK</button>') +
      (k.nevolat || k.rk ? "" : '<a class="btn primary" href="tel:' + esc(cislo) + '">📞 Zavolať</a>') + "</div></div>" +
      '<div class="dd-hl"><span class="pred-av velky">' + (k.nevolat ? "🚫" : "📇") + "</span><div><h2>" + esc(k.meno || "Bez mena") + '</h2><div class="meta"><a class="tel" href="tel:' + esc(cislo) + '">' + esc(k.telefon) + "</a>" +
      (k.meno_portal && k.meno_vlastne && k.meno_portal !== k.meno_vlastne ? " · na portáli „" + esc(k.meno_portal) + "“" : "") +
      " · " + k.pocet + " " + tvarInz(k.pocet) + " · " + (k.hovorov ? k.hovorov + "× volané" : "zatiaľ nevolané") + "</div></div></div>" +
      (k.nevolat ? '<div class="note zle">🚫 <b>Nevolať.</b> Predávajúci si neželá kontakt od realitnej kancelárie' + (k.upravil ? " – označil " + esc(meno(k.upravil)) + " " + datum(k.upravene) : "") + ".</div>" : "") +
      (k.rk ? '<div class="note">🏢 <b>Realitná kancelária.</b> Označil ' + esc(meno(k.rk_oznacil)) + " " + datum(k.rk_oznacene) + ". Všetky inzeráty s týmto číslom sú v skeneri medzi RK – aj nové, ktoré sa objavia.</div>" :
        k.asi_rk ? '<div class="note">Toto číslo je vo viacerých inzerátoch naraz – môže ísť o realitku, ktorá inzeruje ako súkromník. Ak áno, stlačte hore „Je to RK“.</div>' : "");

    // komu predávajúci patrí
    h += '<div class="pd-sekcia pred-makler"><b>👤 Maklér:</b> ' + (k.makler_id ? avatar(k.makler_id, 20) + " " + esc(meno(k.makler_id)) : '<span class="meta">nikto</span>') +
      ((k.prevzali || []).filter(function (x) { return x !== k.makler_id; }).length ? ' <span class="meta">· inzeráty prevzal ' + esc(k.prevzali.filter(function (x) { return x !== k.makler_id; }).map(meno).join(", ")) + "</span>" : "") +
      (admin() ? ' <select id="pred-makler" aria-label="Priradiť maklérovi"><option value="">— nikto —</option>' + S.makleri.filter(function (m) { return m.aktivny || m.id === k.makler_id; }).map(function (m) {
          return '<option value="' + m.id + '"' + (m.id === k.makler_id ? " selected" : "") + ">" + esc(m.meno || m.email) + "</option>"; }).join("") + "</select>" :
        !k.makler_id ? ' <button class="btn" type="button" data-predd="moj">Priradiť mne</button>' : k.makler_id === S.me.id ? ' <button class="btn ghost" type="button" data-predd="nie-moj">Zrušiť priradenie</button>' : "") + "</div>";

    // údaje, ktoré dopíšu makléri
    h += '<form class="pd-sekcia pred-form" id="f-pred"><div class="pd-sek-hlava"><h4>📝 Meno a poznámka</h4></div><div class="form-grid">' +
      '<label class="field"><span>Meno predávajúceho</span><input type="text" name="meno" maxlength="120" value="' + esc(k.meno_vlastne || "") + '" placeholder="' + esc(k.meno_portal || "napr. Ján Novák") + '"></label></div>' +
      '<label class="field"><span>Poznámka (čo chce, kedy znova volať, čo predáva…)</span><textarea name="poznamka" rows="3" maxlength="2000">' + esc(k.poznamka || "") + "</textarea></label>" +
      '<label class="toggle"><input type="checkbox" name="nevolat"' + (k.nevolat ? " checked" : "") + "> 🚫 Nevolať – predávajúci si neželá kontakt</label>" +
      '<div class="form-actions"><button class="btn primary" type="submit">Uložiť</button>' + (k.upravil ? '<span class="meta">Naposledy upravil ' + esc(meno(k.upravil)) + " " + datum(k.upravene, true) + "</span>" : "") + "</div></form>";

    // inzeráty
    h += '<section class="pd-sekcia"><div class="pd-sek-hlava"><h4>🏠 Inzeráty (' + k.pocet + ")</h4></div>" + (k.pocet ? "" : '<p class="meta">Inzerát tohto predávajúceho v skeneri zatiaľ nie je. Keď sa jeho číslo objaví v novom inzeráte, ukáže sa tu.</p>') + '<div class="pred-inz">' + k.inzeraty.map(function (i) {
      var z = (S.inz || []).find(function (x) { return x.id === i.id; });
      var foto = i.foto ? '<img loading="lazy" referrerpolicy="no-referrer" alt="" src="' + esc(i.foto) + '" onerror="this.replaceWith(Object.assign(document.createElement(\'span\'),{className:\'pi-bez\',textContent:\'🏠\'}))">' : '<span class="pi-bez">🏠</span>';
      var mozePonuku = z && i.ptyp !== "rk" && !i.nehnutelnost_id && (admin() || i.prevzal === S.me.id);
      return '<div class="pi-riadok">' + foto + '<div class="pi-telo"><b>' + esc(i.nazov) + '</b><span class="meta d-block">' + esc([TYP[i.typ], i.izby ? i.izby + "-izb." : "", i.obec].filter(Boolean).join(", ")) + " · " + eur(i.cena) + "</span>" +
        '<span class="meta d-block">' + (i.aktivny ? '<span class="chip won">na portáli</span>' : '<span class="chip na">zmizol ' + datum(i.naposledy) + "</span>") +
        (i.ptyp === "rk" ? '<span class="chip">RK</span>' : "") + "v skeneri od " + datum(i.prvy_krat) +
        (i.prevzal ? " · prevzal " + esc(meno(i.prevzal)) : "") + (i.posledny_vysledok ? " · <b>" + esc(i.posledny_vysledok) + "</b>" : "") + "</span>" +
        '<span class="pi-akcie">' + (z ? '<button class="btn ghost" type="button" data-pred-inz="' + esc(i.id) + '">🔎 V skeneri</button>' : "") +
        (i.url && i.aktivny ? '<a class="btn ghost" href="' + esc(i.url) + '" target="_blank" rel="noopener">' + esc(PORTAL[i.portal] || "Portál") + " ↗</a>" : "") +
        (i.nehnutelnost_id ? '<button class="btn ghost" type="button" data-ponuka-otvor="' + i.nehnutelnost_id + '">🏠 Otvoriť ponuku</button>' : "") +
        (mozePonuku ? '<button class="btn" type="button" data-pred-do-ponuky="' + esc(i.id) + '" title="Popis, parametre, fotky a kontakt sa predvyplnia do novej ponuky">➕ Do ponuky</button>' : "") + "</span></div>" +
        archivPredajcu(i, k.pocet === 1) + "</div>";
    }).join("") + "</div></section>";

    // história kontaktov zo všetkých jeho inzerátov
    h += '<section class="pd-sekcia"><div class="pd-sek-hlava"><h4>🕑 História (' + k.aktivity.length + ")</h4></div>" +
      (k.aktivity.length ? '<div class="history">' + k.aktivity.map(function (x) {
        return "<div><time>" + datum(x.vytvorene, true) + '</time><span class="h-row">' + avatar(x.makler_id, 20) + "<span><b>" + esc(meno(x.makler_id)) + "</b> " + popisAktivity(x) +
          (k.pocet > 1 ? ' <small class="meta">· ' + esc(String(nazvy[x.inzerat_id] || "").slice(0, 40)) + "</small>" : "") + "</span></span></div>";
      }).join("") + "</div>" : '<p class="meta">S týmto predávajúcim zatiaľ nikto nepracoval.</p>') + "</section>";

    if (admin()) h += '<section class="pd-sekcia pred-gdpr"><h4>🔒 Vymazanie na žiadosť predávajúceho</h4><p class="meta">Ak predávajúci požiada o vymazanie údajov, číslo zmizne zo všetkých jeho inzerátov aj z tohto zoznamu. Inzeráty a zápisy hovorov ostanú, len bez čísla.</p>' +
      '<button class="btn ghost zle-text" type="button" data-predd="vymazat">Vymazať číslo a kontakt</button></section>';
    el.innerHTML = h + "</div>";

    el.querySelector('[data-predd="spat"]').onclick = function () { S.predDetail = null; history.pushState({ tab: "klienti", kl: "predavajuci" }, "", "#klienti"); vykresliKlientov(); window.scrollTo(0, 0); };
    el.querySelectorAll("[data-pred-inz]").forEach(function (b) { b.onclick = function () { prejdi("inzeraty", b.dataset.predInz); }; });
    el.querySelectorAll("details[data-arch]").forEach(function (d) { d.addEventListener("toggle", function () { S.archOtv = S.archOtv || {}; S.archOtv[d.dataset.arch] = d.open; }); });
    el.querySelectorAll("[data-ponuka-otvor]").forEach(function (b) { b.onclick = function () { otvorPonuku(b.dataset.ponukaOtvor); }; });
    el.querySelectorAll("[data-pred-do-ponuky]").forEach(function (b) {
      b.onclick = function () { var z = S.inz.find(function (x) { return x.id === b.dataset.predDoPonuky; }); if (z) zInzeratu(z).catch(function (e) { toast(chybaText(e), true); }); };
    });
    async function priradit(m) {
      try { await rpc("priradit_predajcu", { p_telefon: k.tel, p_makler: m || null }); await nacitajPredajcov(); toast(m ? "Priradené: " + meno(m) + "." : "Priradenie je zrušené."); vykresliDetailPredajcu(); }
      catch (err) { toast(chybaText(err), true); }
    }
    var pm = $("#pred-makler"); if (pm) pm.onchange = function () { priradit(this.value); };
    var bm = el.querySelector('[data-predd="moj"]'); if (bm) bm.onclick = function () { priradit(S.me.id); };
    var bn = el.querySelector('[data-predd="nie-moj"]'); if (bn) bn.onclick = function () { priradit(null); };
    $("#f-pred").onsubmit = async function (e) {
      e.preventDefault();
      var f = e.target, btn = f.querySelector('[type="submit"]'); btn.disabled = true;
      try {
        await rpc("ulozit_predajcu", { p_telefon: k.tel, p_meno: f.meno.value, p_poznamka: f.poznamka.value, p_nevolat: f.nevolat.checked });
        await nacitajPredajcov();
        toast("Uložené.");
        vykresliDetailPredajcu();
      } catch (err) { toast(chybaText(err), true); btn.disabled = false; }
    };
    el.querySelectorAll('[data-predd="je-rk"], [data-predd="nie-rk"]').forEach(function (b) {
      b.onclick = async function () {
        var rk = b.dataset.predd === "je-rk";
        if (rk && !confirm2("Označiť " + (k.meno || k.telefon) + " ako realitnú kanceláriu? Všetky jeho inzeráty (" + k.pocet + ") sa v skeneri presunú medzi RK a nové s týmto číslom sa označia samé.")) return;
        b.disabled = true;
        try {
          var n = await rpc("oznacit_predajcu_rk", { p_telefon: k.tel, p_rk: rk });
          await Promise.all([nacitajPredajcov(), nacitajOznacenia()]);
          toast(rk ? "🏢 Označené ako realitka – " + n + " " + tvarInz(n) + " v skeneri " + (n === 1 ? "presunutý" : n >= 2 && n <= 4 ? "presunuté" : "presunutých") + " medzi RK." : "Označenie zrušené – inzeráty sú znova podľa rozpoznania skenera.");
          if (rk) { S.predDetail = null; history.pushState({ tab: "klienti", kl: "predavajuci" }, "", "#klienti"); vykresliKlientov(); window.scrollTo(0, 0); }
          else vykresliDetailPredajcu();
        } catch (err) { toast(chybaText(err), true); b.disabled = false; }
      };
    });
    var vym = el.querySelector('[data-predd="vymazat"]');
    if (vym) vym.onclick = async function () {
      if (!confirm2("Naozaj vymazať číslo " + k.telefon + " zo všetkých inzerátov a z adresára? Nedá sa to vrátiť.")) return;
      try {
        await rpc("vymazat_predajcu", { p_telefon: k.tel });
        S.predDetail = null;
        await Promise.all([nacitajPredajcov(), nacitajTelefony()]);
        toast("Číslo a kontakt sú vymazané.");
        history.pushState({ tab: "klienti", kl: "predavajuci" }, "", "#klienti"); vykresliKlientov(); window.scrollTo(0, 0);
      } catch (err) { toast(chybaText(err), true); }
    };
  }
  document.addEventListener("click", function (e) {
    var b = e.target.closest("[data-pred-otvor]"); if (!b) return;
    e.preventDefault(); otvorPredajcu(b.dataset.predOtvor);
  });

  function otvorDopyt(id) {
    S.klPohlad = "dopyty"; S.dopytDetail = id; S.dopytEdit = null; S.dopVyber = {};
    if (S.tab !== "klienti") S.tab = "klienti";
    history.pushState({ tab: "klienti", dopyt: id }, "", "#klienti"); vykresli(); window.scrollTo(0, 0);
  }
  function novyDopyt(zaklad) {
    S.klPohlad = "dopyty";
    S.dopytEdit = { d: Object.assign({ transakcia: "predaj", kategorie: [], typy: [], obce: [], okresy: [], makler_id: S.me.id, stav: "aktivny" }, zaklad || {}), k: {} };
    S.tab = "klienti"; history.pushState({ tab: "klienti", dform: 1, dopyt: S.dopytDetail }, "", "#klienti"); vykresli(); window.scrollTo(0, 0);
  }
  function vykresliDetailDopytu() {
    var el = $("#obsah"), d = S.dopyty.find(function (x) { return x.id === S.dopytDetail; });
    if (!d) { S.dopytDetail = null; return vykresliKlientov(); }
    var K = (S.dopytyK || {})[d.id], mozem = admin() || d.makler_id === S.me.id;
    var P = ponukyPreDopyt(d), I = inzeratyPreDopyt(d), V = S.dopVyber = S.dopVyber || {};
    var h = '<div class="box dopyt-detail"><div class="pd-hlava"><button class="btn ghost" type="button" data-dd="spat">← Všetci klienti</button>' +
      (mozem ? '<div class="pd-akcie"><select id="dd-stav" aria-label="Stav dopytu">' + [["aktivny", "Aktívny"], ["vybaveny", "Vybavený"], ["zruseny", "Zrušený"]].map(function (s) {
        return '<option value="' + s[0] + '"' + (d.stav === s[0] ? " selected" : "") + ">" + s[1] + "</option>"; }).join("") + '</select><button class="btn primary" type="button" data-dd="upravit">✏️ Upraviť</button></div>' : "") + "</div>" +
      '<div class="dd-hl">' + avatar(d.makler_id, 44) + "<div><h2>" + esc(menoKlienta(d)) + '</h2><div class="meta">Maklér: ' + esc(meno(d.makler_id)) + " · zapísané " + datum(d.vytvorene) + "</div></div></div>" +
      '<div class="dd-poziadavky"><b>Hľadá:</b> ' + esc(popisDopytu(d)) + (d.popis ? '<p class="pd-popis">' + esc(d.popis) + "</p>" : "") + "</div>" +
      (K ? '<section class="pd-interne"><h4>🔒 Kontakt</h4><dl class="pd-par">' + (K.telefon ? '<dt>Telefón</dt><dd><a class="tel" href="tel:' + esc(telCislo(K.telefon)) + '">' + esc(K.telefon) + "</a></dd>" : "") +
        (K.email ? '<dt>Email</dt><dd><a href="mailto:' + esc(K.email) + '">' + esc(K.email) + "</a></dd>" : "") + (K.poznamka ? "<dt>Poznámka</dt><dd>" + esc(K.poznamka) + "</dd>" : "") + "</dl></section>" :
        '<p class="meta">🔒 Kontakt na klienta vidí len jeho maklér a administrátor.</p>') +
      '<section class="pd-sekcia"><div class="pd-sek-hlava"><h4>🏠 Ponuky kancelárie, ktoré sedia (' + P.length + ")</h4></div>" +
      (P.length ? '<div class="dd-ponuky">' + P.map(function (p) {
        var f = (p.fotky || [])[0];
        return '<div class="dd-ponuka">' + (K && (K.telefon || K.email) ? '<label class="dd-vyber"><input type="checkbox" data-dd-vyber="' + p.id + '"' + (V[p.id] ? " checked" : "") + ' aria-label="Vybrať na poslanie"></label>' : "") +
          '<button type="button" class="dd-p-telo" data-ponuka-otvor="' + p.id + '">' + (f ? '<img src="' + esc(fotkaUrl(f)) + '" alt="" loading="lazy">' : '<span class="dd-bez">🏠</span>') +
          "<span><b>" + esc(nazovPonuky(p)) + '</b><span class="meta d-block">' + esc([p.cast_obce, p.obec].filter(Boolean).join(", ")) + " · " + esc(cenaPonuky(p)) + "</span>" +
          '<span class="meta d-block">' + avatar(p.makler_id, 16) + " " + esc(meno(p.makler_id)) + (p.cislo ? " · " + esc(p.cislo) : "") + "</span></span></button></div>";
      }).join("") + "</div>" +
        (K && (K.telefon || K.email) ? '<div class="dd-poslat"><span class="meta">Vybrané ponuky poslať klientovi:</span>' + (K.telefon ? '<a class="btn wa" href="#" data-dd-posli="wa" target="_blank" rel="noopener">WhatsApp</a><a class="btn" href="#" data-dd-posli="sms">💬 SMS</a>' : "") +
          (K.email ? '<a class="btn" href="#" data-dd-posli="email">✉️ Email</a>' : "") + '<button class="btn ghost" type="button" data-dd="kopiruj">Kopírovať text</button></div>' : "") :
        '<p class="meta">Zatiaľ žiadna ponuka kancelárie nesedí. Keď pribudne, príde ' + (d.makler_id === S.me.id ? "vám" : "maklérovi") + " upozornenie.</p>") + "</section>" +
      (d.transakcia === "predaj" ? '<section class="pd-sekcia"><div class="pd-sek-hlava"><h4>🔎 Súkromné inzeráty zo skenera (' + I.length + ")</h4></div>" +
        (I.length ? '<div class="dd-inz">' + I.slice(0, 30).map(function (z) {
          var pr = S.prev[z.id];
          return '<button type="button" class="dd-inz-r" data-inz-otvor="' + esc(z.id) + '"><b>' + esc(z.nazov) + '</b><span class="meta">' + esc(z.obec || "") + " · " + eur(z.cena) + (z.plocha ? " · " + nf.format(z.plocha) + " m²" : "") + " · " + esc(PORTAL[z.portal] || z.portal) +
            (pr && pr.makler_id ? " · prevzal " + esc(meno(pr.makler_id)) : " · voľný") + "</span></button>";
        }).join("") + (I.length > 30 ? '<p class="meta">… a ďalších ' + (I.length - 30) + "</p>" : "") + "</div>" : '<p class="meta">Teraz žiadny aktívny súkromný inzerát nesedí. Nové sa porovnávajú automaticky pri každej kontrole portálov.</p>') + "</section>" : "") + "</div>";
    el.innerHTML = h;
    el.querySelector('[data-dd="spat"]').onclick = function () { S.dopytDetail = null; history.pushState({ tab: "klienti" }, "", "#klienti"); vykresliKlientov(); window.scrollTo(0, 0); };
    var up = el.querySelector('[data-dd="upravit"]');
    if (up) up.onclick = function () {
      S.dopytEdit = { d: JSON.parse(JSON.stringify(d)), k: JSON.parse(JSON.stringify(K || {})), uprava: true };
      history.pushState({ tab: "klienti", dform: 1, dopyt: d.id }, "", "#klienti"); vykresliKlientov(); window.scrollTo(0, 0);
    };
    var st = $("#dd-stav");
    if (st) st.onchange = async function () {
      try { await rpc("zmenit_stav_dopytu", { p_id: d.id, p_stav: st.value }); d.stav = st.value; toast(st.value === "vybaveny" ? "✅ Dopyt je vybavený." : "Stav je zmenený."); if (st.value === "vybaveny") konfety({ pocet: 80 }); vykresliDetailDopytu(); }
      catch (err) { toast(chybaText(err), true); st.value = d.stav; }
    };
    el.querySelectorAll("[data-dd-vyber]").forEach(function (c) { c.onchange = function () { V[c.dataset.ddVyber] = c.checked; }; });
    function textVybranych() {
      var vyb = P.filter(function (p) { return V[p.id]; }); if (!vyb.length) vyb = P.slice(0, 5);
      return "Dobrý deň" + (K && K.meno ? " " + K.meno.split(" ")[0] : "") + ", posielam Vám ponuky, ktoré zodpovedajú tomu, čo hľadáte:\n\n" +
        vyb.map(function (p) { return "• " + nazovPonuky(p) + " – " + cenaPonuky(p) + "\n" + verejnyOdkaz(p.id); }).join("\n\n") + "\n\n" + (rodMaklera(S.me) === "zena" ? "Rada" : "Rád") + " Vám ktorúkoľvek z nich ukážem.\n" + podpis();
    }
    el.querySelectorAll("[data-dd-posli]").forEach(function (a) { a.onclick = function () { a.href = odkazSpravy(a.dataset.ddPosli, K.telefon, textVybranych(), "Ponuky nehnuteľností – Alpha Reality", K.email); }; });
    var kp = el.querySelector('[data-dd="kopiruj"]'); if (kp) kp.onclick = function () { kopiruj(textVybranych(), "Text s ponukami je skopírovaný."); };
    el.querySelectorAll("[data-ponuka-otvor]").forEach(function (b) {
      b.onclick = function () { S.tab = "nehnutelnosti"; S.ponukaEdit = null; S.ponukaDetail = Number(b.dataset.ponukaOtvor); S.pdPanel = null; history.pushState({ tab: "nehnutelnosti", detail: S.ponukaDetail }, "", "#nehnutelnosti"); vykresli(); window.scrollTo(0, 0); };
    });
    el.querySelectorAll("[data-inz-otvor]").forEach(function (b) { b.onclick = function () { prejdi("inzeraty", b.dataset.inzOtvor); }; });
  }
  function vykresliFormDopytu() {
    var el = $("#obsah"), E = S.dopytEdit, d = E.d, k = E.k;
    var typy = []; (d.kategorie.length ? d.kategorie : []).forEach(function (c) { typy = typy.concat(TYPY[c] || []); });
    function n(nazov, pole, pomoc) { return '<label class="field"><span>' + nazov + (pomoc ? ' <small class="meta">' + pomoc + "</small>" : "") + '</span><input type="number" min="0" step="any" inputmode="decimal" data-d="' + pole + '" value="' + esc(d[pole] == null ? "" : d[pole]) + '"></label>'; }
    var lok = d.obce.map(function (o, i) { return '<span class="chip-obec">📍 ' + esc(o) + '<button type="button" data-lok-x="o' + i + '" aria-label="Odobrať">×</button></span>'; })
      .concat(d.okresy.map(function (o, i) { return '<span class="chip-obec">🗺 okres ' + esc(o) + '<button type="button" data-lok-x="k' + i + '" aria-label="Odobrať">×</button></span>'; }));
    var h = '<div class="box ponuka-form dopyt-form" data-strazit><div class="pf-hlava"><button class="btn ghost" type="button" data-df="zrusit">← Zrušiť</button><h3>' + (E.uprava ? "Upraviť dopyt" : "Nový dopyt klienta") + "</h3></div>" +
      '<div class="pf-telo"><h4>Klient</h4><div class="form-grid">' +
      '<label class="field"><span>Meno a priezvisko</span><input type="text" data-k="meno" value="' + esc(k.meno || "") + '" autocomplete="off"></label>' +
      '<label class="field"><span>Telefón</span><input data-k="telefon" type="tel" inputmode="tel" value="' + esc(k.telefon || "") + '"></label>' +
      '<label class="field"><span>Email</span><input data-k="email" type="email" value="' + esc(k.email || "") + '"></label>' +
      (admin() ? '<label class="field"><span>Maklér klienta</span><select data-d="makler_id">' + S.makleri.filter(function (m) { return m.aktivny; }).map(function (m) {
        return '<option value="' + m.id + '"' + (d.makler_id === m.id ? " selected" : "") + ">" + esc(m.meno || m.email) + "</option>"; }).join("") + "</select></label>" : "") + "</div>" +
      '<p class="meta">🔒 Kontakt vidíte len vy a administrátor. Ostatní makléri uvidia, čo klient hľadá, aby vám mohli ponúknuť vhodnú nehnuteľnosť.</p>' +
      '<h4>Čo hľadá</h4><div class="seg pf-tr" role="group">' + [["predaj", "Kúpa"], ["prenajom", "Prenájom"]].map(function (x) {
        return '<button type="button" data-dtr="' + x[0] + '" aria-pressed="' + (d.transakcia === x[0]) + '">' + x[1] + "</button>"; }).join("") + "</div>" +
      '<div class="cipy" data-dcipy="kategorie">' + KATEGORIE.map(function (x) { return '<button type="button" class="cip" data-hodnota="' + x[0] + '" aria-pressed="' + (d.kategorie.indexOf(x[0]) >= 0) + '">' + x[2] + " " + x[1] + "</button>"; }).join("") + "</div>" +
      (typy.length ? '<h4>Typ <small class="meta">nič nevybrané = akýkoľvek</small></h4><div class="cipy" data-dcipy="typy">' + typy.map(function (t) { return '<button type="button" class="cip" data-hodnota="' + esc(t) + '" aria-pressed="' + (d.typy.indexOf(t) >= 0) + '">' + esc(t) + "</button>"; }).join("") + "</div>" : "") +
      '<h4>Lokalita <small class="meta">nič nevybrané = kdekoľvek</small></h4>' +
      '<div class="lok-hladat"><input type="search" id="dlok-q" autocomplete="off" placeholder="Pridať obec alebo okres, napr. Smižany, Levoča…"><div class="lok-navrhy" id="dlok-navrhy" hidden></div></div>' +
      '<div class="pf-dok">' + (lok.length ? lok.join("") : '<span class="meta">Kdekoľvek</span>') +
      '<button type="button" class="btn ghost" data-dokres="Spišská Nová Ves">+ okres SNV</button><button type="button" class="btn ghost" data-dokres="Levoča">+ okres Levoča</button></div>' +
      '<h4>Rozpočet a parametre</h4><div class="form-grid dva">' + n("Cena od (€)", "cena_od") + n("Cena do (€)", "cena_do") + n("Plocha od (m²)", "plocha_od") + n("Plocha do (m²)", "plocha_do") +
      n("Izby od", "izby_od") + n("Izby do", "izby_do") + "</div>" +
      '<label class="field"><span>Čo klient hľadá vlastnými slovami <small class="meta">vidia aj ostatní makléri</small></span><textarea data-d="popis" rows="3" placeholder="napr. hľadá byt s balkónom, nie prízemie, financovanie hypotékou schválené">' + esc(d.popis || "") + "</textarea></label>" +
      '<label class="field"><span>Interná poznámka <small class="meta">len vy a admin</small></span><textarea data-k="poznamka" rows="2">' + esc(k.poznamka || "") + "</textarea></label>" +
      '<div class="dopyt-nahlad" id="dopyt-nahlad"></div></div>' +
      '<div class="pf-pata"><button class="btn ghost" type="button" data-df="zrusit">Zrušiť</button>' + NEULOZENE + '<button class="btn primary ulozit" type="button" data-df="ulozit" data-ulozit>✓ Uložiť dopyt</button></div></div>';
    el.innerHTML = h;
    function nahlad() {
      var x = Object.assign({}, d, { stav: "aktivny" });
      ["cena_od", "cena_do", "plocha_od", "plocha_do", "izby_od", "izby_do"].forEach(function (f) { x[f] = cisloAlebo(x[f]); });
      var nP = ponukyPreDopyt(x).length, nI = inzeratyPreDopyt(x).length;
      $("#dopyt-nahlad").innerHTML = "🎯 Teraz sedí <b>" + nP + "</b> " + (nP === 1 ? "ponuka" : nP >= 2 && nP <= 4 ? "ponuky" : "ponúk") + " kancelárie" + (x.transakcia === "predaj" ? " a <b>" + nI + "</b> " + (nI === 1 ? "súkromný inzerát" : nI >= 2 && nI <= 4 ? "súkromné inzeráty" : "súkromných inzerátov") + " zo skenera" : "") + ".";
    }
    el.querySelectorAll("[data-d]").forEach(function (i) { i.addEventListener(i.tagName === "SELECT" ? "change" : "input", function () { d[i.dataset.d] = i.value; nahlad(); }); });
    el.querySelectorAll("[data-k]").forEach(function (i) { i.addEventListener("input", function () { k[i.dataset.k] = i.value; }); });
    el.querySelectorAll("[data-dtr]").forEach(function (b) { b.onclick = function () { d.transakcia = b.dataset.dtr; vykresliFormDopytu(); }; });
    el.querySelectorAll("[data-dcipy]").forEach(function (g) {
      g.querySelectorAll(".cip").forEach(function (b) {
        b.onclick = function () {
          var pole = g.dataset.dcipy, arr = d[pole], v = b.dataset.hodnota, ix = arr.indexOf(v);
          if (ix >= 0) arr.splice(ix, 1); else arr.push(v);
          if (pole === "kategorie") { var povolene = []; d.kategorie.forEach(function (c) { povolene = povolene.concat(TYPY[c] || []); }); d.typy = d.typy.filter(function (t) { return povolene.indexOf(t) >= 0; }); vykresliFormDopytu(); }
          else { b.setAttribute("aria-pressed", String(ix < 0)); nahlad(); }
        };
      });
    });
    el.querySelectorAll("[data-lok-x]").forEach(function (b) { b.onclick = function () { var v = b.dataset.lokX; (v[0] === "o" ? d.obce : d.okresy).splice(Number(v.slice(1)), 1); vykresliFormDopytu(); }; });
    el.querySelectorAll("[data-dokres]").forEach(function (b) { b.onclick = function () { if (d.okresy.indexOf(b.dataset.dokres) < 0) d.okresy.push(b.dataset.dokres); vykresliFormDopytu(); }; });
    var inp = $("#dlok-q"), box = $("#dlok-navrhy");
    nacitajLokality().catch(function () {});
    inp.addEventListener("input", function () {
      var q = normLok(inp.value.trim());
      if (q.length < 2 || !window.LOKALITY) { box.hidden = true; return; }
      var okr = Object.keys(window.OKRES_KRAJ || {}).filter(function (o) { return normLok(o).indexOf(q) === 0; }).slice(0, 3).map(function (o) { return { okres: o }; });
      var obce = window.LOKALITY.filter(function (l) { return !l[5] && normLok(l[0]).indexOf(q) === 0; }).slice(0, 10).map(function (l) { return { obec: l[0], okresObce: l[1] }; });
      var vys = okr.concat(obce);
      box.innerHTML = vys.length ? vys.map(function (v, i) {
        return '<button type="button" data-dlok="' + i + '">' + (v.okres ? "🗺 <b>okres " + esc(v.okres) + "</b> <span class=\"meta\">celý okres</span>" : "<b>" + esc(v.obec) + '</b><span class="meta">okres ' + esc(v.okresObce) + "</span>") + "</button>";
      }).join("") : '<div class="meta lok-nic">Nenašlo sa.</div>';
      box.hidden = false;
      box.querySelectorAll("[data-dlok]").forEach(function (b) {
        b.onclick = function () {
          var v = vys[Number(b.dataset.dlok)];
          if (v.okres) { if (d.okresy.indexOf(v.okres) < 0) d.okresy.push(v.okres); } else if (d.obce.indexOf(v.obec) < 0) d.obce.push(v.obec);
          vykresliFormDopytu(); var i2 = $("#dlok-q"); if (i2) i2.focus();
        };
      });
    });
    inp.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); var f = box.querySelector("[data-dlok]"); if (f) f.click(); } });
    el.querySelectorAll("[data-df]").forEach(function (b) {
      b.onclick = async function () {
        if (b.dataset.df === "zrusit") { S.dopytEdit = null; vykresliKlientov(); window.scrollTo(0, 0); return; }
        if (!k.meno && !k.telefon) return toast("Vyplňte aspoň meno alebo telefón klienta.", true);
        var tl = el.querySelectorAll(".pf-pata .btn"); tl.forEach(function (x) { x.disabled = true; });
        try {
          var data = Object.assign({}, d); delete data.vytvorene; delete data.upravene; delete data.kancelaria;
          var id = await rpc("ulozit_dopyt", { p: data, p_k: k });
          await nacitajDopyty();
          S.dopytEdit = null; S.dopytDetail = id; S.dopVyber = {}; S.klPohlad = "dopyty";
          var nd = S.dopyty.find(function (x) { return x.id === id; });
          var nP = nd ? ponukyPreDopyt(nd).length : 0, nI = nd ? inzeratyPreDopyt(nd).length : 0;
          toast("✅ Dopyt je uložený" + (nP || nI ? " – nájdené: " + nP + " " + (nP === 1 ? "ponuka" : nP >= 2 && nP <= 4 ? "ponuky" : "ponúk") + " a " + nI + " " + (nI === 1 ? "inzerát" : nI >= 2 && nI <= 4 ? "inzeráty" : "inzerátov") + "." : "."));
          vykresliKlientov(); window.scrollTo(0, 0);
        } catch (err) { toast(chybaText(err), true); tl.forEach(function (x) { x.disabled = false; }); }
      };
    });
    nahlad();
  }

  // ------------------------------------------------------------ KALENDÁR
  var TYPY_UDALOSTI = [["stretnutie", "🤝", "Stretnutie"], ["obhliadka", "🗝️", "Obhliadka"], ["podpis", "✍️", "Podpis zmluvy"], ["telefonat", "📞", "Telefonát"], ["osobne", "🙂", "Osobné"], ["ine", "📌", "Iné"]];
  async function nacitajUdalosti() {
    S.udalosti = await vsetkyRiadky("udalosti", "*", "id").catch(function () { return []; });
    // kolegovia na udalosti fungujú až po zmene databázy (stĺpec ucastnici)
    if (S.kalKolegovia === undefined) S.kalKolegovia = await sb.from("udalosti").select("ucastnici").limit(1).then(function (r) { return !r.error; }, function () { return false; });
  }
  function d2(n) { return String(n).padStart(2, "0"); }
  function denKluc(d) { d = new Date(d); return d.getFullYear() + "-" + d2(d.getMonth() + 1) + "-" + d2(d.getDate()); }
  // všetko, čo patrí do môjho kalendára: udalosti, obhliadky, pripomienky, konce zmlúv
  function polozkyKalendara() {
    var out = [], ja = S.me.id;
    (S.udalosti || []).forEach(function (u) {
      if (u.zrusene) return;
      var t = TYPY_UDALOSTI.find(function (x) { return x[0] === u.typ; }) || TYPY_UDALOSTI[5];
      var ludia = [u.makler_id].concat((u.ucastnici || []).filter(function (x) { return x !== u.makler_id; }));
      out.push({ druh: "udalost", id: u.id, ikona: t[1], nazov: u.nazov, od: u.zaciatok, do: u.koniec, celyDen: u.cely_den, miesto: u.miesto, pozn: u.poznamka,
        cudzia: ludia.indexOf(ja) < 0, makler: u.makler_id, ludia: ludia, sAdminom: ludia.some(jeAdminId), zdielane: u.zdielane, u: u, ponuka: u.nehnutelnost_id || null });
    });
    (S.obhliadky || []).forEach(function (o) {
      if (o.zrusena) return;
      var p = (S.ponuky || []).find(function (x) { return x.id === o.nehnutelnost_id; });
      if (o.makler_id !== ja && (!p || p.makler_id !== ja) && !admin()) return;
      if (o.makler_id !== ja && (!p || p.makler_id !== ja)) return;
      out.push({ druh: "obhliadka", id: o.id, ikona: "🗝️", nazov: "Obhliadka: " + (p ? nazovPonuky(p) : "ponuka"), od: o.cas, do: null, miesto: p ? [p.ulica, p.obec].filter(Boolean).join(", ") : "",
        pozn: [o.klient_meno, o.klient_telefon].filter(Boolean).join(" · "), ponuka: o.nehnutelnost_id });
    });
    (S.prip || []).forEach(function (x) {
      if (x.makler_id !== ja || x.hotovo || x.zrusena || (x.druh && x.druh !== "pripomienka")) return;
      out.push({ druh: "pripomienka", id: x.id, ikona: "🔔", nazov: x.poznamka || "Pripomienka", od: x.cas, do: null });
    });
    Object.keys(S.ponukyInt || {}).forEach(function (k) {
      var I = S.ponukyInt[k], p = (S.ponuky || []).find(function (x) { return x.id === Number(k); });
      if (!I || !I.zmluva || !I.zmluva_do || !p || p.makler_id !== ja || ["predane", "archiv"].indexOf(p.stav) >= 0) return;
      out.push({ druh: "zmluva", id: p.id, ikona: "📝", nazov: "Končí zmluva: " + nazovPonuky(p), od: I.zmluva_do + "T08:00:00", celyDen: true, ponuka: p.id });
    });
    return out.sort(function (a, b) { return String(a.od).localeCompare(String(b.od)); });
  }
  function jeAdminId(id) { var m = S.mById && S.mById[id]; return !!(m && m.rola === "admin"); }
  // krátke mená ľudí na udalosti, admin (Martin) prvý
  function menaPolozky(x) {
    if (!x.ludia) return "";
    return x.ludia.slice().sort(function (a, b) { return jeAdminId(b) - jeAdminId(a); }).map(krstneMeno).join(", ");
  }
  function casPolozky(x) {
    if (x.celyDen) return "celý deň";
    var t = new Date(x.od).toLocaleTimeString("sk-SK", { hour: "2-digit", minute: "2-digit" });
    return x.do ? t + "–" + new Date(x.do).toLocaleTimeString("sk-SK", { hour: "2-digit", minute: "2-digit" }) : t;
  }
  function googleOdkaz(x) {
    var f = function (d) { return new Date(d).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, ""); };
    var dates = x.celyDen ? denKluc(x.od).replace(/-/g, "") + "/" + denKluc(new Date(new Date(x.od).getTime() + 864e5)).replace(/-/g, "") :
      f(x.od) + "/" + f(x.do || new Date(new Date(x.od).getTime() + 3600e3));
    return "https://calendar.google.com/calendar/render?action=TEMPLATE&text=" + encodeURIComponent(x.ikona + " " + x.nazov) + "&dates=" + dates +
      (x.miesto ? "&location=" + encodeURIComponent(x.miesto) : "") + (x.pozn ? "&details=" + encodeURIComponent(x.pozn) : "");
  }
  function icsSubor(x) {
    var f = function (d) { return new Date(d).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, ""); };
    var e = function (t) { return String(t || "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n"); };
    var r = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Alpha Reality//Realitny typek//SK", "BEGIN:VEVENT", "UID:" + x.druh + x.id + "@realitny-typek", "DTSTAMP:" + f(new Date()), "SUMMARY:" + e(x.ikona + " " + x.nazov)];
    if (x.celyDen) r.push("DTSTART;VALUE=DATE:" + denKluc(x.od).replace(/-/g, ""));
    else r.push("DTSTART:" + f(x.od), "DTEND:" + f(x.do || new Date(new Date(x.od).getTime() + 3600e3)));
    if (x.miesto) r.push("LOCATION:" + e(x.miesto));
    if (x.pozn) r.push("DESCRIPTION:" + e(x.pozn));
    r.push("END:VEVENT", "END:VCALENDAR");
    var a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([r.join("\r\n")], { type: "text/calendar" })); a.download = "udalost.ics";
    document.body.appendChild(a); a.click(); a.remove();
  }
  // ------------------------------------------------------------ MATTERPORT – rezervácia kamery
  // klik na deň a hodinu = rezervácia na 2 hodiny, svoju si maklér raz predĺži o hodinu; tím dostane správu v chate
  var MP_OD = 7, MP_DO = 21, MP_RIADOK = 44;
  async function nacitajMatterport() {
    var od = new Date(); od.setDate(od.getDate() - 14);
    var r = await sb.from("matterport_rezervacie").select("*").gte("koniec", od.toISOString()).order("zaciatok").limit(1000);
    if (r.error) throw r.error;
    S.mp = r.data || [];
  }
  function mpPondelok(d) { d = new Date(d); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d; }
  function mpCas(d) { d = new Date(d); return d.getHours() + ":" + d2(d.getMinutes()); }
  function mpDen(d, kratko) { return new Date(d).toLocaleDateString("sk-SK", kratko ? { weekday: "short", day: "numeric", month: "numeric" } : { weekday: "long", day: "numeric", month: "numeric" }); }
  function mpRozsah(r) {
    var z = new Date(r.zaciatok), k = new Date(r.koniec);
    return mpDen(z) + " · " + mpCas(z) + " – " + mpCas(k) + (denKluc(z) !== denKluc(k) ? " (" + k.toLocaleDateString("sk-SK", { day: "numeric", month: "numeric" }) + ")" : "");
  }
  function mpKolizia(z, k, okrem) {
    return (S.mp || []).find(function (r) { return r.id !== okrem && new Date(r.zaciatok) < k && new Date(r.koniec) > z; });
  }
  function mpMoze(r) { return r.makler_id === S.me.id || admin(); }
  function mpTeraz() { var t = new Date(); return (S.mp || []).find(function (r) { return new Date(r.zaciatok) <= t && new Date(r.koniec) > t; }); }
  // najbližšia rezervácia, ktorá sa ešte dnes začne
  function mpDnesRez() { var n = new Date(); return (S.mp || []).find(function (r) { return new Date(r.zaciatok) > n && denKluc(r.zaciatok) === denKluc(n); }); }
  function mpKto(r) { return r.makler_id === S.me.id ? "ty" : krstneMeno(r.makler_id); }
  function mpStavText() {
    var t = mpTeraz(), n = new Date();
    if (t) return "Obsadený – teraz ho " + (t.makler_id === S.me.id ? "máš ty" : "má " + krstneMeno(t.makler_id)) + " do " + mpCas(t.koniec);
    var d = mpDnesRez();
    if (d) return "Rezervovaný dnes od " + mpCas(d.zaciatok) + " do " + mpCas(d.koniec) + " (" + mpKto(d) + ")";
    var dalsia = (S.mp || []).filter(function (r) { return new Date(r.zaciatok) > n; })[0];
    return dalsia ? "Dnes voľný · najbližšie " + mpDen(dalsia.zaciatok, true) + " o " + mpCas(dalsia.zaciatok) + " (" + mpKto(dalsia) + ")" : "Voľný – žiadne rezervácie";
  }
  function mpMobil() { return window.matchMedia("(max-width: 760px)").matches; }

  function vykresliMatterport() {
    var el = $("#obsah"); if (!el) return;
    if (!S.mp) {
      el.innerHTML = '<div class="box"><div class="meta">Načítavam rezervácie Matterportu…</div></div>';
      nacitajMatterport().then(vykresliMatterport, function (e) { S.mp = []; toast(chybaText(e), true); vykresliMatterport(); });
      return;
    }
    var dnes = new Date(); dnes.setHours(0, 0, 0, 0);
    var pon = S.mpTyzden ? new Date(S.mpTyzden + "T00:00:00") : mpPondelok(dnes);
    var dniTyz = []; for (var i = 0; i < 7; i++) { var d = new Date(pon); d.setDate(pon.getDate() + i); dniTyz.push(d); }
    var mobil = mpMobil();
    if (!S.mpDen || !dniTyz.some(function (d) { return denKluc(d) === S.mpDen; })) {
      S.mpDen = denKluc(dniTyz.some(function (d) { return denKluc(d) === denKluc(dnes); }) ? dnes : pon);
    }
    var dni = mobil ? dniTyz.filter(function (d) { return denKluc(d) === S.mpDen; }) : dniTyz;
    var koniecTyz = dniTyz[6], teraz = new Date(), t = mpTeraz();
    var h = '<div class="box mp-box"><div class="vykon-hlava"><div class="mp-titul"><span class="mp-ik">' + ikona("matterport") + '</span><div><h3>Matterport</h3>' +
      '<span class="meta">Klikni na deň a hodinu – kamera je tvoja na 2 hodiny. Ak treba, pridáš si +1 hodinu (najviac 2×), kým hneď potom nemá kameru kolega.</span></div></div>' +
      '<span class="mp-stav' + (t || mpDnesRez() ? " obsadeny" : "") + '">' + esc(mpStavText()) + "</span></div>" +
      '<div class="mp-nav"><button class="btn ghost" type="button" data-mp="pred" aria-label="Predchádzajúci týždeň"' + (pon <= mpPondelok(dnes) ? " disabled" : "") + '>‹</button>' +
      "<b>" + esc(pon.getDate() + ". " + (pon.getMonth() !== koniecTyz.getMonth() ? (pon.getMonth() + 1) + ". " : "") + "– " + koniecTyz.getDate() + ". " + (koniecTyz.getMonth() + 1) + ". " + koniecTyz.getFullYear()) + "</b>" +
      '<button class="btn ghost" type="button" data-mp="dalsi" aria-label="Ďalší týždeň">›</button>' +
      (denKluc(pon) !== denKluc(mpPondelok(dnes)) ? '<button class="btn ghost" type="button" data-mp="dnes">Tento týždeň</button>' : "") + "</div>";
    if (mobil) {
      h += '<div class="mp-dni" role="group" aria-label="Deň">' + dniTyz.map(function (d) {
        var k = denKluc(d), n = (S.mp || []).filter(function (r) { return denKluc(r.zaciatok) === k; }).length;
        return '<button type="button" class="mp-den-cip' + (k === S.mpDen ? " akt" : "") + (k === denKluc(dnes) ? " dnes" : "") + (d < dnes ? " minule" : "") + '" data-mp-den="' + k + '">' +
          "<small>" + esc(d.toLocaleDateString("sk-SK", { weekday: "short" })) + "</small><b>" + d.getDate() + "</b>" + (n ? '<i aria-label="' + n + ' rezervácií"></i>' : "") + "</button>";
      }).join("") + "</div>";
    }
    // mriežka: stĺpec s hodinami + jeden stĺpec na deň
    var riadkov = MP_DO - MP_OD, vyska = riadkov * MP_RIADOK;
    h += '<div class="mp-mriezka" style="--mp-dni:' + dni.length + '"><div class="mp-roh"></div>' + dni.map(function (d) {
      return '<div class="mp-hlava-dna' + (denKluc(d) === denKluc(dnes) ? " dnes" : "") + '">' + esc(d.toLocaleDateString("sk-SK", { weekday: mobil ? "long" : "short" })) + " <b>" + d.getDate() + "." + (d.getMonth() + 1) + ".</b></div>";
    }).join("");
    h += '<div class="mp-hodiny" style="height:' + vyska + 'px">';
    for (var hd = MP_OD; hd < MP_DO; hd++) h += '<span style="top:' + ((hd - MP_OD) * MP_RIADOK) + 'px">' + hd + ":00</span>";
    h += "</div>";
    dni.forEach(function (d) {
      var k = denKluc(d);
      h += '<div class="mp-stlpec' + (k === denKluc(dnes) ? " dnes" : "") + '" style="height:' + vyska + 'px">';
      for (var hd = MP_OD; hd < MP_DO; hd++) {
        var z = new Date(d); z.setHours(hd, 0, 0, 0);
        var zk = new Date(z.getTime() + 36e5), minula = zk <= teraz;
        var obs = mpKolizia(z, zk);
        h += '<button type="button" class="mp-bunka' + (hd % 2 ? " par" : "") + (minula ? " minula" : "") + (obs && !minula ? " obsadena" : "") + '" style="top:' + ((hd - MP_OD) * MP_RIADOK) + 'px"' +
          (minula || obs ? ' tabindex="-1" disabled' : ' data-mp-volny="' + z.toISOString() + '"') + ' aria-label="' + esc(mpDen(z) + " " + hd + ":00") + '">' +
          (minula || obs ? "" : '<span class="mp-plus">+ Rezervovať ' + hd + ":00</span>") + "</button>";
      }
      // rezervácie v tento deň (aj tie, čo cez deň len prechádzajú)
      var zd = new Date(d); zd.setHours(MP_OD, 0, 0, 0); var kd = new Date(d); kd.setHours(MP_DO, 0, 0, 0);
      (S.mp || []).filter(function (r) { return new Date(r.zaciatok) < kd && new Date(r.koniec) > zd; }).forEach(function (r) {
        var a = Math.max(new Date(r.zaciatok), zd), b = Math.min(new Date(r.koniec), kd);
        var top = (a - zd) / 36e5 * MP_RIADOK, v = Math.max(18, (b - a) / 36e5 * MP_RIADOK - 3);
        var moja = r.makler_id === S.me.id, skoncila = new Date(r.koniec) <= teraz;
        h += '<button type="button" class="mp-rez' + (moja ? " moja" : "") + (skoncila ? " skoncila" : "") + (v < 50 ? " nizka" : "") + '" data-mp-rez="' + r.id + '" style="top:' + (top + 1) + "px;height:" + v + 'px"' +
          ' title="' + esc(meno(r.makler_id) + " · " + mpRozsah(r) + (r.poznamka ? " · " + r.poznamka : "")) + '">' +
          '<span class="mp-rez-kto">' + avatar(r.makler_id, 20) + "<b>" + esc(moja ? "Ty" : krstneMeno(r.makler_id)) + "</b></span>" +
          '<span class="mp-rez-cas">' + esc(mpCas(r.zaciatok) + " – " + mpCas(r.koniec)) + "</span>" +
          (r.poznamka && v >= 70 ? '<span class="mp-rez-pozn">' + esc(r.poznamka) + "</span>" : "") + "</button>";
      });
      // čiara „teraz“
      if (k === denKluc(dnes) && teraz > zd && teraz < kd) h += '<i class="mp-teraz" style="top:' + ((teraz - zd) / 36e5 * MP_RIADOK) + 'px" aria-hidden="true"></i>';
      h += "</div>";
    });
    h += "</div>";
    // najbližšie rezervácie
    var nadchadzajuce = (S.mp || []).filter(function (r) { return new Date(r.koniec) > teraz; }).slice(0, 12);
    h += '<div class="mp-zoznam"><h4>Najbližšie rezervácie</h4>' + (nadchadzajuce.length ? nadchadzajuce.map(function (r) {
      return '<div class="mp-riadok' + (r.makler_id === S.me.id ? " moja" : "") + '">' + avatar(r.makler_id, 30) + '<div class="mp-riadok-t"><b>' + esc(mpRozsah(r)) + '</b><span class="meta">' +
        esc(meno(r.makler_id)) + (r.poznamka ? " · " + esc(r.poznamka) : "") + "</span></div>" +
        (mpMoze(r) ? '<div class="mp-riadok-a">' + mpPlusBtn(r, "", "data-mp-plus") + '<button class="btn ghost" type="button" data-mp-zrus="' + r.id + '">Zrušiť</button></div>' : "") + "</div>";
    }).join("") : '<p class="meta">Matterport je zatiaľ voľný. Klikni v kalendári na deň a hodinu.</p>') + "</div>" +
      (admin() ? '<div class="mp-stat" id="mp-stat"></div>' : "") + "</div>";
    el.innerHTML = h;
    napojMatterport();
    if (admin()) vykresliMpStat();
    if (S.mpOkno) mpOkno(S.mpOkno);
    var m = el.querySelector(".mp-mriezka");
    if (m && !S.mpPosunute) { S.mpPosunute = true; var p = el.querySelector(".mp-rez:not(.skoncila)") || el.querySelector(".mp-bunka:not(.minula)"); if (p && mobil) p.scrollIntoView({ block: "center" }); }
  }
  function napojMatterport() {
    var el = $("#obsah");
    el.querySelectorAll("[data-mp]").forEach(function (b) {
      b.onclick = function () {
        var a = b.dataset.mp, pon = S.mpTyzden ? new Date(S.mpTyzden + "T00:00:00") : mpPondelok(new Date());
        if (a === "pred") pon.setDate(pon.getDate() - 7);
        if (a === "dalsi") pon.setDate(pon.getDate() + 7);
        if (a === "dnes") pon = mpPondelok(new Date());
        S.mpTyzden = denKluc(pon); S.mpDen = null;
        vykresliMatterport();
      };
    });
    el.querySelectorAll("[data-mp-den]").forEach(function (b) { b.onclick = function () { S.mpDen = b.dataset.mpDen; vykresliMatterport(); }; });
    el.querySelectorAll("[data-mp-volny]").forEach(function (b) { b.onclick = function () { mpOkno({ nova: b.dataset.mpVolny }); }; });
    el.querySelectorAll("[data-mp-rez]").forEach(function (b) { b.onclick = function () { mpOkno({ rez: Number(b.dataset.mpRez) }); }; });
    el.querySelectorAll("[data-mp-plus]").forEach(function (b) { b.onclick = function () { mpPredlzit(Number(b.dataset.mpPlus)); }; });
    el.querySelectorAll("[data-mp-zrus]").forEach(function (b) { b.onclick = function () { mpZrusit(Number(b.dataset.mpZrus)); }; });
  }
  // ---- štatistika pre administrátora: hodiny s kamerou podľa makléra a mesiaca
  function mpMesiac() { var d = S.mpStatMes ? new Date(S.mpStatMes + "-01T00:00:00") : new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); }
  function mpHod(x) { x = Number(x) || 0; return String(x).replace(".", ",") + " h"; }
  function vykresliMpStat() {
    var el = $("#mp-stat"); if (!el) return;
    var m = mpMesiac(), kluc = m.getFullYear() + "-" + d2(m.getMonth() + 1), dalsi = new Date(m.getFullYear(), m.getMonth() + 1, 1);
    S.mpStat = S.mpStat || {};
    var data = S.mpStat[kluc];
    var h = '<div class="vykon-hlava"><h4>📊 Štatistika Matterportu <small class="meta">vidíš len ty</small></h4><div class="mp-nav">' +
      '<button class="btn ghost" type="button" data-mps="-1" aria-label="Predchádzajúci mesiac">‹</button><b>' + esc(m.toLocaleDateString("sk-SK", { month: "long", year: "numeric" })) + "</b>" +
      '<button class="btn ghost" type="button" data-mps="1" aria-label="Ďalší mesiac">›</button></div></div>';
    if (!data) {
      el.innerHTML = h + '<p class="meta">Načítavam…</p>'; napojMpStat();
      rpc("matterport_statistika", { p_od: m.toISOString(), p_do: dalsi.toISOString() }).then(function (d) { S.mpStat[kluc] = d || []; vykresliMpStat(); },
        function (e) { el.innerHTML = h + '<p class="meta">' + esc(chybaText(e)) + "</p>"; napojMpStat(); });
      return;
    }
    var spolu = data.reduce(function (a, x) { a.r += x.rezervacie; a.h += Number(x.hodiny); a.p += x.predlzenia; a.z += x.zrusene; return a; }, { r: 0, h: 0, p: 0, z: 0 });
    var max = Math.max.apply(null, data.map(function (x) { return Number(x.hodiny); }).concat([1]));
    h += '<div class="mp-stat-suhrn"><div><b>' + mpHod(Math.round(spolu.h * 10) / 10) + '</b><span>spolu s kamerou</span></div><div><b>' + spolu.r + '</b><span>rezervácií</span></div>' +
      '<div><b>' + spolu.p + '</b><span>predĺžení o hodinu</span></div><div><b>' + spolu.z + "</b><span>zrušených</span></div></div>";
    h += data.length ? '<div class="mp-stat-tab" role="table"><div class="mp-stat-r hlava" role="row"><span role="columnheader">Maklér</span><span role="columnheader">Hodiny</span><span role="columnheader">Rezervácie</span><span role="columnheader">Predĺženia</span><span role="columnheader">Zrušené</span></div>' +
      data.map(function (x) {
        return '<div class="mp-stat-r" role="row"><span class="mp-stat-kto" role="cell">' + avatar(x.makler_id, 26) + "<b>" + esc(meno(x.makler_id)) + "</b></span>" +
          '<span role="cell" class="mp-stat-h"><i style="width:' + Math.max(4, Number(x.hodiny) / max * 100) + '%"></i><b>' + mpHod(x.hodiny) + "</b></span>" +
          '<span role="cell" data-l="Rezervácie">' + x.rezervacie + '</span><span role="cell" data-l="Predĺženia">' + x.predlzenia + '</span><span role="cell" data-l="Zrušené">' + x.zrusene + "</span></div>";
      }).join("") + "</div>" : '<p class="meta">V tomto mesiaci nemal Matterport nikto rezervovaný.</p>';
    el.innerHTML = h; napojMpStat();
  }
  function napojMpStat() {
    document.querySelectorAll("#mp-stat [data-mps]").forEach(function (b) {
      b.onclick = function () { var m = mpMesiac(); m.setMonth(m.getMonth() + Number(b.dataset.mps)); S.mpStatMes = m.getFullYear() + "-" + d2(m.getMonth() + 1); vykresliMpStat(); };
    });
  }
  async function mpAkcia(fn, args, ok) {
    try { await rpc(fn, args); } catch (e) { toast(chybaText(e), true); await nacitajMatterport().catch(function () {}); vykresliMatterport(); return false; }
    S.mpOkno = null; zavriMpOkno();
    await nacitajMatterport().catch(function () {});
    S.mpStat = null; vykresliMatterport(); toast(ok); chatNove();
    return true;
  }
  // +1 hodina: najviac 2×, len keď hneď potom nemá Matterport kolega
  function mpPredlz(r) {
    var n = r.predlzenia != null ? r.predlzenia : (r.predlzene ? 1 : 0);
    if (n >= 2) return { ok: false, preco: "Rezervácia už bola predĺžená 2× – viac sa nedá." };
    var kol = mpKolizia(new Date(r.koniec), new Date(new Date(r.koniec).getTime() + 36e5), r.id);
    if (kol) return { ok: false, preco: "Predĺžiť sa nedá – od " + mpCas(kol.zaciatok) + " má Matterport " + krstneMeno(kol.makler_id) + "." };
    return { ok: true, zostava: 2 - n };
  }
  function mpPlusBtn(r, trieda, attr) {
    var p = mpPredlz(r);
    if (!p.ok && /2×/.test(p.preco)) return "";
    return '<button class="btn' + trieda + '" type="button" ' + attr + '="' + r.id + '"' + (p.ok ? ' title="Ešte ' + p.zostava + '× sa dá predĺžiť"' : ' disabled title="' + esc(p.preco) + '"') + ">+1 hodina</button>";
  }
  function mpPredlzit(id) {
    var r = (S.mp || []).find(function (x) { return x.id === id; }); if (!r) return;
    var p = mpPredlz(r); if (!p.ok) return toast(p.preco, true);
    var k = new Date(new Date(r.koniec).getTime() + 36e5);
    mpAkcia("predlzit_matterport", { p_id: id }, "Predĺžené do " + mpCas(k) + ". Tím dostal správu v chate.");
  }
  function mpZrusit(id) {
    var r = (S.mp || []).find(function (x) { return x.id === id; }); if (!r) return;
    if (!confirm2("Zrušiť rezerváciu Matterportu " + mpRozsah(r) + (r.makler_id !== S.me.id ? " (" + meno(r.makler_id) + ")" : "") + "?")) return;
    mpAkcia("zrusit_matterport", { p_id: id }, "Rezervácia je zrušená. Kolegovia vedia, že je Matterport voľný.");
  }
  function zavriMpOkno() { var o = $("#mp-okno"); if (o) o.remove(); document.removeEventListener("keydown", mpEsc); }
  function mpEsc(e) { if (e.key === "Escape") { S.mpOkno = null; zavriMpOkno(); } }
  function mpOkno(o) {
    zavriMpOkno(); S.mpOkno = o;
    var w = document.createElement("div"); w.className = "pochvala-var mp-var"; w.id = "mp-okno";
    var h = '<div class="pochvala-karta mp-karta" role="dialog" aria-modal="true" aria-labelledby="mp-okno-n"><button type="button" class="nov-x" data-mpo="x" aria-label="Zavrieť">×</button>';
    if (o.nova) {
      var z = new Date(o.nova), moznosti = "";
      for (var m = MP_OD * 60 - 60; m <= MP_DO * 60; m += 30) {
        var c = new Date(z); c.setHours(0, m, 0, 0);
        if (c.getTime() + 36e5 * 2 <= Date.now()) continue;
        moznosti += '<option value="' + c.toISOString() + '"' + (c.getTime() === z.getTime() ? " selected" : "") + ">" + mpCas(c) + "</option>";
      }
      h += '<span class="mp-ik velka">' + ikona("matterport") + '</span><h3 id="mp-okno-n">Rezervovať Matterport</h3><p class="mp-okno-den">' + esc(mpDen(z)) + "</p>" +
        '<form id="f-mp" class="mp-form"><label class="field"><span>Od</span><select name="od">' + moznosti + "</select></label>" +
        '<div class="mp-do">do <b data-mp-do></b> <small>(2 hodiny)</small></div>' +
        '<label class="field"><span>Kde skenuješ? (nepovinné)</span><input type="text" name="poznamka" maxlength="300" placeholder="napr. 3-izbový byt, Mier"></label>' +
        '<p class="mp-kol" data-mp-kol hidden></p>' +
        '<button class="btn primary wide" type="submit">📸 Rezervovať na 2 hodiny</button>' +
        '<p class="meta mp-info">Kolegom príde správa v chate. Ak budeš potrebovať viac času, pridáš si +1 hodinu – najviac 2×.</p></form>';
    } else {
      var r = (S.mp || []).find(function (x) { return x.id === o.rez; });
      if (!r) { S.mpOkno = null; return; }
      var moja = r.makler_id === S.me.id, skoncila = new Date(r.koniec) <= new Date();
      h += '<span class="mp-okno-av">' + avatar(r.makler_id, 64) + '</span><h3 id="mp-okno-n">' + esc(moja ? "Tvoja rezervácia" : meno(r.makler_id)) + "</h3>" +
        '<p class="mp-okno-den">' + esc(mpRozsah(r)) + "</p>" + (r.poznamka ? '<p class="meta mp-okno-pozn">📍 ' + esc(r.poznamka) + "</p>" : "") +
        (mpMoze(r) && !skoncila ? (function () {
          var p = mpPredlz(r), plus = mpPlusBtn(r, " primary", 'data-mpo="plus" data-x');
          return '<div class="mp-okno-akcie' + (plus ? "" : " jedna") + '">' + plus + '<button class="btn ghost" type="button" data-mpo="zrus">Zrušiť rezerváciu</button></div>' +
            '<p class="meta mp-info">' + esc(p.ok ? "Predĺžiť o hodinu sa dá ešte " + p.zostava + "×." : p.preco) + "</p>";
        })() :
          !moja && !skoncila ? '<button class="btn wide" type="button" data-mpo="napisat">Napísať ' + esc(krstneMeno(r.makler_id)) + "</button>" : "") +
        (skoncila ? '<p class="meta">Rezervácia už skončila.</p>' : "");
    }
    w.innerHTML = h + "</div>";
    document.body.appendChild(w);
    document.addEventListener("keydown", mpEsc);
    w.addEventListener("click", function (e) {
      if (e.target === w || e.target.closest('[data-mpo="x"]')) { S.mpOkno = null; return zavriMpOkno(); }
      var b = e.target.closest("[data-mpo]"); if (!b) return;
      if (b.dataset.mpo === "plus") mpPredlzit(o.rez);
      if (b.dataset.mpo === "zrus") mpZrusit(o.rez);
      if (b.dataset.mpo === "napisat") { var r = (S.mp || []).find(function (x) { return x.id === o.rez; }); S.mpOkno = null; zavriMpOkno(); if (r) otvorKonverzaciu(r.makler_id); }
    });
    var f = w.querySelector("#f-mp");
    if (f) {
      var prepocitaj = function () {
        var z = new Date(f.od.value), k = new Date(z.getTime() + 2 * 36e5), kol = mpKolizia(z, k);
        w.querySelector("[data-mp-do]").textContent = mpCas(k) + (denKluc(k) !== denKluc(z) ? " (" + k.toLocaleDateString("sk-SK", { day: "numeric", month: "numeric" }) + ")" : "");
        var p = w.querySelector("[data-mp-kol]");
        p.hidden = !kol;
        if (kol) p.textContent = "V tom čase už má Matterport " + meno(kol.makler_id) + " (" + mpCas(kol.zaciatok) + " – " + mpCas(kol.koniec) + "). Vyber skorší alebo neskorší čas.";
        f.querySelector('[type="submit"]').disabled = !!kol;
      };
      f.od.onchange = prepocitaj; prepocitaj();
      f.onsubmit = function (e) {
        e.preventDefault();
        var b = f.querySelector('[type="submit"]'); b.disabled = true; b.textContent = "Rezervujem…";
        mpAkcia("rezervovat_matterport", { p_zaciatok: f.od.value, p_poznamka: f.poznamka.value.trim() || null },
          "Matterport je tvoj " + mpDen(f.od.value) + " od " + mpCas(f.od.value) + ". Tím dostal správu v chate.").then(function (ok) { if (!ok) { b.disabled = false; b.textContent = "📸 Rezervovať na 2 hodiny"; } });
      };
      setTimeout(function () { f.poznamka.focus({ preventScroll: true }); }, 50);
    } else { var bb = w.querySelector(".btn"); if (bb) bb.focus({ preventScroll: true }); }
  }
  var mpMobilBol = null;
  window.addEventListener("resize", function () {
    if (S.tab !== "matterport") return;
    var m = mpMobil(); if (mpMobilBol !== null && m !== mpMobilBol) vykresliMatterport(); mpMobilBol = m;
  });

  function vykresliKalendar() {
    var el = $("#obsah"); if (!el) return;
    if (!S.udalosti) { el.innerHTML = '<div class="box"><div class="meta">Načítavam kalendár…</div></div>'; nacitajUdalosti().then(vykresliKalendar); return; }
    var dnes = new Date(); dnes.setHours(0, 0, 0, 0);
    var mes = S.kalMesiac ? new Date(S.kalMesiac) : new Date(dnes.getFullYear(), dnes.getMonth(), 1);
    var vyb = S.kalDen || denKluc(dnes);
    var P = polozkyKalendara(), poDnoch = {};
    P.forEach(function (x) { var k = denKluc(x.od); (poDnoch[k] = poDnoch[k] || []).push(x); });
    var prvy = new Date(mes.getFullYear(), mes.getMonth(), 1), start = new Date(prvy); start.setDate(1 - ((prvy.getDay() + 6) % 7));
    var bunky = "";
    for (var i = 0; i < 42; i++) {
      var d = new Date(start); d.setDate(start.getDate() + i);
      if (i >= 35 && d.getMonth() !== mes.getMonth()) break;
      var k = denKluc(d), pol = poDnoch[k] || [];
      bunky += '<button type="button" class="kal-den' + (d.getMonth() !== mes.getMonth() ? " mimo" : "") + (k === denKluc(dnes) ? " dnes" : "") + (k === vyb ? " vybrany" : "") + '" data-kal-den="' + k + '">' +
        '<span class="kal-c">' + d.getDate() + "</span>" + (pol.length ? '<span class="kal-body">' + pol.slice(0, 3).map(function (x) { return '<i class="kb-' + x.druh + '"></i>'; }).join("") + "</span>" +
        pol.slice(0, 3).map(function (x) {
          var mn = menaPolozky(x);
          return '<span class="kal-prvy kp-' + x.druh + (x.sAdminom ? " s-adminom" : "") + '">' + esc((x.celyDen ? "" : casPolozky(x).slice(0, 5) + " ") + x.nazov) +
            (mn ? '<em class="kal-mena">' + (x.sAdminom ? "★ " : "") + esc(mn) + "</em>" : "") + "</span>";
        }).join("") + (pol.length > 3 ? '<span class="kal-viac">+ ďalšie ' + (pol.length - 3) + "</span>" : "") : "") + "</button>";
    }
    var denP = poDnoch[vyb] || [], vd = new Date(vyb + "T12:00:00");
    var f = S.kalForm;
    var h = '<div class="box kal"><div class="vykon-hlava"><h3>📅 Kalendár</h3><div class="nehn-akcie"><button class="btn" type="button" data-kal="synch">🔗 Google / Apple kalendár</button>' +
      '<button class="btn primary" type="button" data-kal="nova">+ Nová udalosť</button></div></div>';
    if (S.kalSynch) h += panelSynchronizacie();
    if (f) h += formUdalosti(f);
    h += '<div class="kal-grid-wrap"><div class="kal-nav"><button class="btn ghost" type="button" data-kal="pred" aria-label="Predchádzajúci mesiac">‹</button><b>' +
      esc(mes.toLocaleDateString("sk-SK", { month: "long", year: "numeric" })) + '</b><button class="btn ghost" type="button" data-kal="dalsi" aria-label="Ďalší mesiac">›</button>' +
      '<button class="btn ghost" type="button" data-kal="dnes">Dnes</button></div>' +
      '<div class="kal-tyz">' + ["Po", "Ut", "St", "Št", "Pi", "So", "Ne"].map(function (x) { return "<span>" + x + "</span>"; }).join("") + "</div>" +
      '<div class="kal-mriezka">' + bunky + "</div>" +
      '<div class="kal-legenda"><span><i class="kb-udalost"></i>udalosť</span><span><i class="kb-obhliadka"></i>obhliadka</span><span><i class="kb-pripomienka"></i>pripomienka</span><span><i class="kb-zmluva"></i>koniec zmluvy</span><span class="leg-admin">★ s ' + esc(menoAdmina()) + "</span></div></div>" +
      '<div class="kal-agenda"><h4>' + esc(vd.toLocaleDateString("sk-SK", { weekday: "long", day: "numeric", month: "long" })) + "</h4>" +
      (denP.length ? denP.map(polozkaAgendy).join("") : '<p class="meta">V tento deň nemáte nič naplánované.</p>') +
      '<button class="btn ghost" type="button" data-kal="nova-den">+ Pridať na tento deň</button></div></div>';
    el.innerHTML = h;
    napojKalendar();
  }
  function menoAdmina() { var a = (S.makleri || []).find(function (m) { return m.rola === "admin" && m.aktivny; }); return a ? krstneMeno(a.id) : "administrátorom"; }
  function polozkaAgendy(x) {
    return '<div class="kal-pol kp-' + x.druh + (x.sAdminom ? " s-adminom" : "") + '"><div class="kal-cas">' + esc(casPolozky(x)) + "</div><div><b>" + esc(x.ikona + " " + x.nazov) + "</b>" +
      (x.ludia ? '<div class="kal-ludia">' + x.ludia.map(function (id, i) {
        return '<span class="kal-clovek' + (jeAdminId(id) ? " admin" : "") + '" title="' + esc(meno(id) + (i === 0 ? " – zapísal(a)" : "")) + '">' + avatar(id, 18) + " " + esc(krstneMeno(id)) + (jeAdminId(id) ? " ★" : "") + "</span>";
      }).join("") + "</div>" : "") +
      (x.miesto ? '<div class="meta">📍 ' + esc(x.miesto) + "</div>" : "") + (x.pozn ? '<div class="meta">' + esc(x.pozn) + "</div>" : "") +
      '<div class="kal-akcie"><a class="btn-link" href="' + esc(googleOdkaz(x)) + '" target="_blank" rel="noopener">+ Google</a>' +
      '<button type="button" class="btn-link" data-kal-ics="' + x.druh + ":" + x.id + '">+ Apple / Outlook (.ics)</button>' +
      (x.druh === "udalost" && (!x.cudzia || admin()) ? '<button type="button" class="btn-link" data-kal-upr="' + x.id + '">Upraviť</button><button type="button" class="btn-link" data-kal-zrus="' + x.id + '">Zrušiť</button>' : "") +
      (x.ponuka ? '<button type="button" class="btn-link" data-kal-ponuka="' + x.ponuka + '">Ponuka</button>' : "") + "</div></div></div>";
  }
  function formUdalosti(f) {
    var z = f.zaciatok ? new Date(f.zaciatok) : null, k = f.koniec ? new Date(f.koniec) : null;
    return '<form class="kal-form" id="f-udalost"><h4>' + (f.id ? "Upraviť udalosť" : "Nová udalosť") + '</h4><div class="form-grid">' +
      '<label class="field"><span>Názov *</span><input type="text" name="nazov" required maxlength="140" value="' + esc(f.nazov || "") + '" placeholder="napr. Stretnutie s majiteľom – Mier"></label>' +
      '<label class="field"><span>Druh</span><select name="typ">' + TYPY_UDALOSTI.map(function (t) { return '<option value="' + t[0] + '"' + (f.typ === t[0] ? " selected" : "") + ">" + t[1] + " " + t[2] + "</option>"; }).join("") + "</select></label>" +
      '<label class="field"><span>Dátum</span><input type="date" name="den" required value="' + esc(z ? denKluc(z) : (S.kalDen || denKluc(new Date()))) + '"></label>' +
      '<label class="field"><span>Od</span><input type="time" name="od" value="' + esc(z && !f.cely_den ? d2(z.getHours()) + ":" + d2(z.getMinutes()) : "09:00") + '"></label>' +
      '<label class="field"><span>Do</span><input type="time" name="do" value="' + esc(k && !f.cely_den ? d2(k.getHours()) + ":" + d2(k.getMinutes()) : "10:00") + '"></label>' +
      '<label class="field"><span>Miesto</span><input type="text" name="miesto" value="' + esc(f.miesto || "") + '"></label>' +
      '<label class="field"><span>Ponuka</span><select name="nehnutelnost_id"><option value="">—</option>' + (S.ponuky || []).filter(function (p) { return ["predane", "archiv"].indexOf(p.stav) < 0; }).map(function (p) {
        return '<option value="' + p.id + '"' + (Number(f.nehnutelnost_id) === p.id ? " selected" : "") + ">" + esc((p.cislo ? p.cislo + " · " : "") + nazovPonuky(p)) + "</option>"; }).join("") + "</select></label></div>" +
      '<label class="field"><span>Poznámka</span><textarea name="poznamka" rows="2">' + esc(f.poznamka || "") + "</textarea></label>" +
      formKolegovia(f) +
      '<div class="pf-prepinace"><label class="toggle"><input type="checkbox" name="cely_den"' + (f.cely_den ? " checked" : "") + "> Celý deň</label>" +
      '<label class="toggle"><input type="checkbox" name="zdielane"' + (f.zdielane ? " checked" : "") + "> Uvidí celý tím</label></div>" +
      '<div class="form-actions"><button class="btn primary" type="submit">Uložiť</button><button class="btn ghost" type="button" data-kal="zrus-form">Zrušiť</button></div></form>';
  }
  function formKolegovia(f) {
    if (!S.kalKolegovia) return "";
    var autor = f.makler_id || S.me.id, vyb = f.ucastnici || [];
    var zoz = (S.makleri || []).filter(function (m) { return m.aktivny && m.id !== autor; })
      .sort(function (a, b) { return (b.rola === "admin") - (a.rola === "admin") || String(a.meno).localeCompare(String(b.meno), "sk"); });
    if (!zoz.length) return "";
    return '<fieldset class="kal-kolegovia"><legend>👥 Kolegovia na udalosti</legend><div class="cipy">' + zoz.map(function (m) {
      return '<label class="kal-kolega' + (m.rola === "admin" ? " admin" : "") + '"><input type="checkbox" name="ucastnik" value="' + esc(m.id) + '"' + (vyb.indexOf(m.id) >= 0 ? " checked" : "") + "> " +
        avatar(m.id, 20) + " " + esc(m.meno || m.email) + (m.rola === "admin" ? " ★" : "") + "</label>";
    }).join("") + '</div><p class="meta">🔔 Ty aj označení kolegovia dostanete upozornenie deň vopred o 18:00 a ráno v deň udalosti o 7:00 – v zvončeku aj e-mailom. Udalosť sa im ukáže v kalendári.</p></fieldset>';
  }
  function panelSynchronizacie() {
    var url = S.kalToken ? CFG.supabaseUrl + "/functions/v1/kalendar?t=" + S.kalToken : "", webcal = url.replace(/^https?:/, "webcal:");
    return '<div class="pd-panel kal-synch"><h4>🔗 Prepojenie s Google a Apple kalendárom</h4>' +
      '<p class="meta">Vaše udalosti, obhliadky, pripomienky a konce zmlúv sa automaticky zobrazia vo vašom kalendári v mobile. Je to jednosmerné – nové veci zapisujte tu. Google obnovuje odber zhruba raz za pár hodín, iPhone podľa nastavenia (najčastejšie každú hodinu).</p>' +
      (url ? '<div class="pd-odkaz"><input type="text" readonly value="' + esc(url) + '" aria-label="Odkaz na odber"><button class="btn" type="button" data-kal="kopiruj">Kopírovať</button></div>' +
        '<div class="pd-zdiel-btns"><a class="btn" href="https://calendar.google.com/calendar/r?cid=' + encodeURIComponent(webcal) + '" target="_blank" rel="noopener">Pridať do Google Kalendára</a>' +
        '<a class="btn" href="' + esc(webcal) + '">Pridať do Apple Kalendára (iPhone, Mac)</a></div>' +
        '<p class="meta">🔒 Odkaz je tajný – kto ho má, vidí váš kalendár. Ak ho niekomu omylom pošlete, <button type="button" class="btn-link" data-kal="novy-token">vytvorte nový</button> (starý prestane fungovať).</p>' :
        '<button class="btn primary" type="button" data-kal="token">Vytvoriť odkaz na odber</button>') + "</div>";
  }
  function napojKalendar() {
    var el = $("#obsah");
    el.querySelectorAll("[data-kal-den]").forEach(function (b) { b.onclick = function () { S.kalDen = b.dataset.kalDen; vykresliKalendar(); var a = $(".kal-agenda"); if (a && window.innerWidth < 900) a.scrollIntoView({ behavior: "smooth", block: "start" }); }; });
    el.querySelectorAll("[data-kal]").forEach(function (b) {
      b.onclick = async function () {
        var a = b.dataset.kal, m = S.kalMesiac ? new Date(S.kalMesiac) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
        if (a === "pred" || a === "dalsi") { m.setMonth(m.getMonth() + (a === "pred" ? -1 : 1)); S.kalMesiac = m.toISOString(); }
        if (a === "dnes") { S.kalMesiac = null; S.kalDen = denKluc(new Date()); }
        if (a === "nova") S.kalForm = { typ: "stretnutie" };
        if (a === "nova-den") S.kalForm = { typ: "stretnutie", zaciatok: S.kalDen + "T09:00:00" };
        if (a === "zrus-form") S.kalForm = null;
        if (a === "synch") { S.kalSynch = !S.kalSynch; if (S.kalSynch && !S.kalToken) { try { S.kalToken = await rpc("moj_kalendar_odkaz", { p_novy: false }); } catch (e) { toast(chybaText(e), true); } } }
        if (a === "token" || a === "novy-token") {
          if (a === "novy-token" && !confirm2("Vytvoriť nový odkaz? Starý odber v kalendároch prestane fungovať a treba ho pridať znova.")) return;
          try { S.kalToken = await rpc("moj_kalendar_odkaz", { p_novy: a === "novy-token" }); toast("Odkaz je pripravený."); } catch (e) { return toast(chybaText(e), true); }
        }
        if (a === "kopiruj") return kopiruj(CFG.supabaseUrl + "/functions/v1/kalendar?t=" + S.kalToken, "Odkaz na kalendár je skopírovaný.");
        vykresliKalendar();
        if (a === "nova" || a === "nova-den") { var fn = $("#f-udalost"); if (fn) { fn.scrollIntoView({ behavior: "smooth", block: "start" }); fn.nazov.focus(); } }
      };
    });
    var P = polozkyKalendara();
    el.querySelectorAll("[data-kal-ics]").forEach(function (b) { b.onclick = function () { var c = b.dataset.kalIcs.split(":"); var x = P.find(function (y) { return y.druh === c[0] && String(y.id) === c[1]; }); if (x) icsSubor(x); }; });
    el.querySelectorAll("[data-kal-upr]").forEach(function (b) { b.onclick = function () { S.kalForm = Object.assign({}, (S.udalosti || []).find(function (u) { return u.id === Number(b.dataset.kalUpr); })); vykresliKalendar(); window.scrollTo({ top: 0, behavior: "smooth" }); }; });
    el.querySelectorAll("[data-kal-zrus]").forEach(function (b) {
      b.onclick = async function () { if (!confirm2("Zrušiť udalosť?")) return; try { await rpc("zrusit_udalost", { p_id: Number(b.dataset.kalZrus) }); await nacitajUdalosti(); toast("Udalosť je zrušená."); vykresliKalendar(); } catch (e) { toast(chybaText(e), true); } };
    });
    el.querySelectorAll("[data-kal-ponuka]").forEach(function (b) {
      b.onclick = function () { S.tab = "nehnutelnosti"; S.ponukaEdit = null; S.ponukaDetail = Number(b.dataset.kalPonuka); history.pushState({ tab: "nehnutelnosti", detail: S.ponukaDetail }, "", "#nehnutelnosti"); vykresli(); window.scrollTo(0, 0); };
    });
    var f = $("#f-udalost");
    if (f) f.onsubmit = async function (e) {
      e.preventDefault();
      var cd = f.cely_den.checked, z = new Date(f.den.value + "T" + (cd ? "08:00" : f.od.value || "09:00")), k = cd ? null : new Date(f.den.value + "T" + (f.do.value || f.od.value));
      try {
        await rpc("ulozit_udalost", { p: { id: S.kalForm.id || null, nazov: f.nazov.value, typ: f.typ.value, zaciatok: z.toISOString(), koniec: k ? k.toISOString() : null, cely_den: cd,
          miesto: f.miesto.value, poznamka: f.poznamka.value, nehnutelnost_id: f.nehnutelnost_id.value || null, zdielane: f.zdielane.checked,
          ucastnici: Array.prototype.map.call(f.querySelectorAll('[name="ucastnik"]:checked'), function (c) { return c.value; }) } });
        S.kalForm = null; nacitajPripomienky().then(popisZvoncek).catch(function () {}); S.kalDen = f.den.value; S.kalMesiac = new Date(z.getFullYear(), z.getMonth(), 1).toISOString();
        await nacitajUdalosti(); toast("📅 Udalosť je uložená."); vykresliKalendar();
      } catch (err) { toast(chybaText(err), true); }
    };
  }
  // malý prehľad na hlavnej obrazovke
  function kalendarDomovHtml() {
    if (!maSekciu("kalendar")) return "";
    var dnes = denKluc(new Date()), zajtra = denKluc(new Date(Date.now() + 864e5));
    var P = polozkyKalendara().filter(function (x) { var k = denKluc(x.od); return (k === dnes || k === zajtra) && (x.celyDen || new Date(x.od).getTime() > Date.now() - 3600e3 || k === zajtra); });
    return '<section class="box kal-domov"><div class="vykon-hlava"><h3>📅 Dnes a zajtra</h3><button class="btn ghost" type="button" data-domov="kalendar">Otvoriť kalendár →</button></div>' +
      (P.length ? P.slice(0, 6).map(function (x) {
        return '<div class="kal-pol kp-' + x.druh + (x.sAdminom ? " s-adminom" : "") + '"><div class="kal-cas">' + (denKluc(x.od) === zajtra ? "zajtra " : "") + esc(casPolozky(x)) + "</div><div><b>" + esc(x.ikona + " " + x.nazov) + "</b>" +
          (x.ludia && x.ludia.length > 1 ? '<div class="meta">👥 ' + esc(menaPolozky(x)) + "</div>" : "") +
          (x.miesto ? '<div class="meta">📍 ' + esc(x.miesto) + "</div>" : "") + "</div></div>";
      }).join("") : '<p class="meta">Dnes ani zajtra nemáte nič naplánované. Udalosti pridáte v Kalendári.</p>') + "</section>";
  }

  // ------------------------------------------------------------ REALITNÁ MAPA
  function nacitajCluster() {
    return nacitajLeaflet().then(function () {
      if (window.L && L.markerClusterGroup) return;
      ["MarkerCluster.css", "MarkerCluster.Default.css"].forEach(function (c) { var l = document.createElement("link"); l.rel = "stylesheet"; l.href = "https://cdnjs.cloudflare.com/ajax/libs/leaflet.markercluster/1.5.3/" + c; document.head.appendChild(l); });
      return nacitajSkript("https://cdnjs.cloudflare.com/ajax/libs/leaflet.markercluster/1.5.3/leaflet.markercluster.js", "__nic__").then(function () {});
    });
  }
  function hashCislo(s) { var h = 0; String(s).split("").forEach(function (c) { h = (h * 31 + c.charCodeAt(0)) | 0; }); return h; }
  // ulice a časti obcí s polohou (docs/ulice.js) – podľa nich spresníme inzeráty bez súradníc
  function nacitajUlice() {
    if (window.ULICE) return Promise.resolve();
    if (S.uliceP) return S.uliceP;
    S.uliceP = new Promise(function (ok) {
      var sc = document.createElement("script"); sc.src = "ulice.js?v=202610201945"; sc.onload = ok; sc.onerror = function () { window.ULICE = {}; ok(); };
      document.head.appendChild(sc);
    });
    return S.uliceP;
  }
  var SLABE_ULICE = /^(nova|kratka|mala|dlha|lesna|lucna|polna|zelena|sadova|skolska|zahradna|mlynska|potocna|jarna|letna|zimna|jesenna|vysoka|stredna|hlavna|slnecna|okruzna|druzstevna|nabrezna|lipova|brezova|dubova|topolova|gastanova|javorova|agatova|jablonova|ruzova|smrekova|vrbova|jahodova|slovenska|spisska|ceska|moravska|banska|banicka|kamenna|cintorinska|zeleznicna|stanicna|tatranska|horska|veterna|vetrova|letecka|slobody|snp|medza|majer|pila|dolina|hradby|rozvoj|predmestie|okolie|sokol|rybniky|zahradky|stojan|hajik|robotnicka|partizanska|hornadska|obchodna|kostolna|uholna|osloboditelov|posta|postova|hrad|trhovisko|levocska|smizianska|tomasovska|iliasovska|kosicka|presovska|maurerova|masa|mier|zapad|vychod|stred|centrum|kupelna|bielidla|podskala|podskalka|vapenec|hagy|sestnastka|brusnik|jarecek|podlesok|turisticka|lesnicka|horska|sportovcov|ziacka|kasarenska|dolina|slovenskeho raja|slov\. raja|stara cesta|nova cesta)$/;
  function vzorUlice(meno) {
    var n = norm(meno).replace(/\s+/g, " ").trim();
    var slova = n.replace(/\./g, ". ").replace(/\s+/g, " ").trim().split(" ");
    // posledné slovo v páde: Hutnícka → Hutníckej/Hutnícku/Hutníckou; námestie → nám.
    var casti = slova.map(function (w, i) {
      var e = w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      if (/^namestie$/.test(w)) return "nam(?:estie|esti|\\.)?";
      if (/^[a-z]\.$/.test(w) || /^(ing|dr|sv|gen)\.$/.test(w)) return "(?:" + e + "\\s*)?";
      if (i === slova.length - 1 && /[a]$/.test(w) && w.length > 3) return e.slice(0, -1) + "(?:a|ej|u|ou)";
      return e;
    });
    var jadro = casti.join("\\s*");
    return { n: n, re: new RegExp("(?:^|[^a-z0-9])(" + jadro + ")(?![a-z0-9])"), slabe: SLABE_ULICE.test(n) || (slova.length === 1 && n.length < 6),
      reUl: new RegExp("(?:ul\\.?|ulic[a-z]*)\\s*(?:" + jadro + ")(?![a-z0-9])|(?:^|[^a-z0-9])(?:" + jadro + ")\\s+ul(?:\\.|ic[a-z]*)") };
  }
  function uliceObce(obec) {
    S.uliceVz = S.uliceVz || {};
    if (S.uliceVz[obec]) return S.uliceVz[obec];
    var zoz = ((window.ULICE || {})[obec] || []).map(function (u) { var v = vzorUlice(u[0]); v.meno = u[0]; v.ll = [u[1], u[2]]; v.druh = u[3] || "u"; v.vzory = (u[4] || []).map(function (x) { try { return new RegExp(x); } catch (e) { return null; } }).filter(Boolean); return v; });
    return (S.uliceVz[obec] = zoz);
  }
  // obec z textu inzerátu, keď ju portál neuviedol (Bazoš)
  var OKRESY_MAPA = ["Spišská Nová Ves", "Levoča"];
  function obecZTextu(z) {
    if (!window.LOKALITY) return null;
    return obecZTextuV(z, z.okres) || obecZTextuV(z, "*");
  }
  function obecZTextuV(z, okr) {
    S.obceVz = S.obceVz || {};
    var vz = S.obceVz[okr] || (S.obceVz[okr] = window.LOKALITY.filter(function (x) { return !x[5] && (okr === "*" ? OKRESY_MAPA.indexOf(x[1]) >= 0 : x[1] === okr); }).map(function (x) {
      var w = norm(x[0]).split(/\s+/).map(function (s) { return s === "ves" ? "v(?:es|si)" : s.length > 5 ? s.slice(0, s.length - 2) + "[a-z]{0,4}" : s.length > 3 ? s.slice(0, -1) + "[a-z]{0,3}" : s; });
      var vz = w.join("\\s+");
      if (x[0] === "Spišská Nová Ves") vz = "(?:" + vz + "|snv|sp\\.?\\s*nov[a-z]{0,3}\\s+v(?:es|si))";
      return { meno: x[0], re: new RegExp("(?:^|[^a-z])" + vz + "(?![a-z])") };
    }).sort(function (a, b) { return b.meno.length - a.meno.length; }));
    var texty = [norm(z.nazov), norm(z.popis)];
    for (var i = 0; i < texty.length; i++) {
      var naj = null, poz = 1e9;
      vz.forEach(function (o) { var m = o.re.exec(texty[i]); if (m && m.index < poz) { poz = m.index; naj = o.meno; } });
      if (naj) return naj;
    }
    return null;
  }
  // obec podľa výraznej ulice alebo sídliska v texte (napr. „sídlisko Tarča“, „ul. Boženy Němcovej“), keď obec v inzeráte chýba
  function obecPodlaUlice(text) {
    var naj = null;
    Object.keys(window.ULICE || {}).forEach(function (o) {
      if (o.charAt(0) === "_" || naj) return;
      var u = najdiUlicu(o, text, null, true);
      if (u) naj = { obec: o, u: u };
    });
    return naj;
  }
  function najdiUlicu(obec, text, ulica, lenIsta) {
    var zoz = uliceObce(obec); if (!zoz.length) return null;
    var t = norm(text), u = ulica ? norm(ulica).replace(/\s+\d.*$/, "") : "";
    if (u) { var pr = zoz.find(function (x) { return x.druh === "u" && (x.n === u || x.re.test(u)); }); if (pr) return pr; }
    var lep = null, lepSk = -1;
    zoz.forEach(function (x) {
      var sk = -1, m;
      if (x.druh === "c") { if (x.vzory.some(function (r, i) { return (!lenIsta || i === 0) && r.test(t); }) && !(lenIsta && x.meno === "centrum")) sk = 1; }
      else if (x.reUl.test(t) && !(lenIsta && x.slabe)) sk = 3;
      else if (!x.slabe && (m = x.re.exec(t))) sk = 2;
      if (sk > lepSk) { lep = x; lepSk = sk; }
    });
    return lepSk > 0 ? lep : null;
  }
  function stredObce(obec, okres) {
    var st = (window.ULICE && window.ULICE._stredy || {})[obec];
    if (st) return st;
    var l = (window.LOKALITY || []).find(function (x) { return !x[5] && normLok(x[0]) === normLok(obec) && (!okres || x[1] === okres); }) ||
      (window.LOKALITY || []).find(function (x) { return !x[5] && normLok(x[0]) === normLok(obec) && OKRESY_MAPA.indexOf(x[1]) >= 0; });
    return l ? [l[3], l[4]] : null;
  }
  function posun(id, ll, rMin, rMax) {
    var h = hashCislo(id), uhol = (h % 360) * Math.PI / 180, r = rMin + ((h >>> 8) % 100) / 100 * (rMax - rMin);
    return [ll[0] + Math.sin(uhol) * r, ll[1] + Math.cos(uhol) * r * 1.5];
  }
  // poloha inzerátu: presná (GPS z portálu) → ulica → časť obce → stred obce
  var PRESNOST = { gps: "presná poloha z portálu", ulica: "podľa ulice v inzeráte", cast: "podľa časti obce v inzeráte", obec: "len obec – orientačne" };
  function polohaInzeratu(z) {
    var obec = z.obec || obecZTextu(z), podlaUlice = null;
    if (!obec && (podlaUlice = obecPodlaUlice([z.nazov, z.popis].join(" \n ")))) obec = podlaUlice.obec;
    var stred = obec ? stredObce(obec, z.okres) : null;
    var gps = z.lat && z.lon ? [Number(z.lat), Number(z.lon)] : null;
    // rovnaký bod pri viacerých inzerátoch = portál dal len stred obce, nie adresu
    if (gps && S.gpsPocty && S.gpsPocty[gps[0].toFixed(5) + "," + gps[1].toFixed(5)] > 2) gps = null;
    if (gps && stred && Math.abs(gps[0] - stred[0]) + Math.abs(gps[1] - stred[1]) > 0.15) gps = null;
    if (gps) return { ll: gps, presnost: "gps", presna: true, obec: obec, ulica: z.ulica || null };
    if (!obec) return null;
    var u = najdiUlicu(obec, [z.nazov, z.popis].join(" \n "), z.ulica);
    if (u) return { ll: posun(z.id, u.ll, u.druh === "c" ? 0.0006 : 0.0002, u.druh === "c" ? 0.0018 : 0.0007), presnost: u.druh === "c" ? "cast" : "ulica", presna: u.druh !== "c", obec: obec, ulica: u.meno };
    if (!stred) return null;
    return { ll: posun(z.id, stred, 0.0015, 0.006), presnost: "obec", presna: false, obec: obec, ulica: null };
  }
  function ulozMapu() {
    try { localStorage.setItem("typek-mapa", JSON.stringify({ F: S.mapaF, pohlad: S.mapaPohlad || null, podklad: (S.realVrstvy || {}).podklad || null })); } catch (e) { /* bez úložiska */ }
  }
  function nacitajUlozenuMapu() {
    if (S.mapaNacitana) return; S.mapaNacitana = true;
    try { var u = JSON.parse(localStorage.getItem("typek-mapa") || "null"); if (u) { if (u.F) S.mapaF = u.F; if (u.pohlad) S.mapaPohlad = u.pohlad; if (u.podklad && PODKLADY[u.podklad]) S.realVrstvy = { podklad: u.podklad, parcely: false }; } } catch (e) { /* nič */ }
  }
  function pocetText(n, a, b, c) { return n + " " + (n === 1 ? a : n >= 2 && n <= 4 ? b : c); }
  function vykresliMapu() {
    var el = $("#obsah"); if (!el) return;
    nacitajUlozenuMapu();
    var F = S.mapaF = S.mapaF || { ponuky: true, sukr: true, rk: false, typ: "" };
    var TYPY_M = [["", "Všetko"], ["byt", "Byty"], ["dom", "Domy"], ["pozemok", "Pozemky"], ["chata", "Chaty"], ["garaz", "Garáže"]];
    var vek = maSekciu("inzeraty") ? skenerStoji() : null;
    el.innerHTML = '<div class="box mapa-box"><div class="vykon-hlava"><h3>🗺️ Realitná mapa</h3><span class="meta" id="mapa-pocet"></span></div>' +
      (vek ? '<div class="sk-stav zle" role="status"><span>⚠️ Skener ' + vekText(vek) + " nekontroloval portály – na mape sú inzeráty z poslednej kontroly " + datum((S.meta || {}).posledna_kontrola, true) + "." + (admin() ? " Opravíte ho v Realitnom skeneri tlačidlom „Opraviť skener“." : " Dajte vedieť administrátorovi.") + "</span></div>" : "") +
      '<div class="mapa-filtre">' +
      '<label class="toggle mf-ponuky"><input type="checkbox" data-mf="ponuky"' + (F.ponuky ? " checked" : "") + '> <i></i>Naše ponuky</label>' +
      (maSekciu("inzeraty") ? '<label class="toggle mf-sukr"><input type="checkbox" data-mf="sukr"' + (F.sukr ? " checked" : "") + '> <i></i>Súkromní predajcovia</label>' +
        '<label class="toggle mf-rk"><input type="checkbox" data-mf="rk"' + (F.rk ? " checked" : "") + "> <i></i>Inzeráty RK</label>" : "") +
      '<div class="seg" role="group">' + TYPY_M.map(function (t) { return '<button type="button" data-mtyp="' + t[0] + '" aria-pressed="' + (F.typ === t[0]) + '">' + t[1] + "</button>"; }).join("") + "</div>" +
      '<button type="button" class="btn ghost mapa-cela" data-mapa-cela title="Zobraziť všetky body na mape">⤢ Celý región</button></div>' +
      '<div id="realitna-mapa" class="realitna-mapa"></div>' +
      '<div class="mapa-legenda meta"><span><i class="lg presna"></i>presnejšia poloha (adresa z portálu alebo ulica v inzeráte)</span><span><i class="lg priblizna"></i>približne – časť obce alebo len obec</span></div>' +
      '<p class="meta mapa-pozn"><b>Poloha je orientačná.</b> Vychádza z ponúk, pri ktorých bola poloha pridaná – presná adresa z portálu, ulica alebo časť obce uvedená v inzeráte. Ostatné sú približne v obci, kde sa nachádzajú (prerušovaný okraj). Ťuknutím na názov obce ju priblížite.</p></div>';
    el.querySelectorAll("[data-mf]").forEach(function (c) { c.onchange = function () { F[c.dataset.mf] = c.checked; ulozMapu(); kresliRealitnuMapu(); }; });
    el.querySelectorAll("[data-mtyp]").forEach(function (b) { b.onclick = function () { F.typ = b.dataset.mtyp; el.querySelectorAll("[data-mtyp]").forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); }); ulozMapu(); kresliRealitnuMapu(); }; });
    el.querySelector("[data-mapa-cela]").onclick = function () { if (S.realMapa && S.realBody && S.realBody.length) S.realMapa.fitBounds(S.realBody, { padding: [30, 30], maxZoom: 14 }); };
    Promise.all([nacitajCluster(), nacitajLokality(), nacitajUlice()]).then(function () {
      var box = $("#realitna-mapa"); if (!box) return;
      var p = S.mapaPohlad;
      var mapa = L.map(box, { scrollWheelZoom: true }).setView(p ? p.c : [48.98, 20.6], p ? p.z : 11);
      ovladanieVrstiev(mapa, "realVrstvy", "mapa", ulozMapu);
      mapa.createPane("obce"); mapa.getPane("obce").style.zIndex = 450;
      mapa.on("moveend zoomend", function () {
        var c = mapa.getCenter(); S.mapaPohlad = { c: [+c.lat.toFixed(5), +c.lng.toFixed(5)], z: mapa.getZoom() }; ulozMapu();
        box.classList.toggle("zoom-daleko", mapa.getZoom() < 11); box.classList.toggle("zoom-blizko", mapa.getZoom() >= 13);
      });
      box.classList.toggle("zoom-daleko", mapa.getZoom() < 11); box.classList.toggle("zoom-blizko", mapa.getZoom() >= 13);
      mapa.on("popupopen", function () { box.classList.add("bublina"); }); mapa.on("popupclose", function () { box.classList.remove("bublina"); });
      S.realMapa = mapa; kresliRealitnuMapu(!p);
      setTimeout(function () { mapa.invalidateSize(); }, 200);
    }, function () { $("#realitna-mapa").innerHTML = '<div class="meta" style="padding:20px">Mapu sa nepodarilo načítať.</div>'; });
  }
  var MESTA_MAPA = ["Spišská Nová Ves", "Levoča", "Krompachy", "Spišské Vlachy", "Spišské Podhradie", "Smižany", "Spišský Štvrtok", "Markušovce", "Hrabušice"];
  function kresliRealitnuMapu(prisposob, zObnovy) {
    var mapa = S.realMapa, F = S.mapaF; if (!mapa || !document.body.contains(mapa.getContainer())) return;
    if (zObnovy && mapa._popup && mapa.hasLayer(mapa._popup)) return;   // otvorená bublina – pri obnove dát ju nezatvárame
    if (S.realVrstva) mapa.removeLayer(S.realVrstva);
    if (S.realObce) mapa.removeLayer(S.realObce);
    var vrstva = L.markerClusterGroup ? L.markerClusterGroup({ maxClusterRadius: 40, showCoverageOnHover: false, spiderfyOnMaxZoom: true }) : L.layerGroup();
    var body = [], n = { ponuky: 0, sukr: 0, rk: 0 }, naObec = {};
    var KAT_TYP = { byty: "byt", domy: "dom", pozemky: "pozemok", chaty: "chata", garaze: "garaz" };
    // body, ktoré portál dal viacerým inzerátom naraz (stred obce), nepovažujeme za presnú adresu
    var gp = {}; (S.inz || []).forEach(function (z) { if (z.lat && z.lon) { var k = Number(z.lat).toFixed(5) + "," + Number(z.lon).toFixed(5); gp[k] = (gp[k] || 0) + 1; } }); S.gpsPocty = gp;
    function ikonka(trieda, text, priblizne) {
      return L.divIcon({ className: "", html: '<span class="rm-pin ' + trieda + (priblizne ? " priblizne" : "") + '">' + esc(text) + "</span>", iconSize: null, iconAnchor: [0, 0] });
    }
    function kratkaCena(c) { return c ? (c >= 1e6 ? (Math.round(c / 1e5) / 10).toLocaleString("sk-SK") + " mil." : c >= 1000 ? Math.round(c / 1000) + " tis." : c + " €") : "dohodou"; }
    function riadokPolohy(q, obec, popis) {
      return '<span class="rm-poloha">📍 ' + esc([q.ulica, obec].filter(Boolean).join(", ") || "Poloha neznáma") + "<small>" + esc(popis || PRESNOST[q.presnost]) + "</small></span>";
    }
    if (F.ponuky) (S.ponuky || []).forEach(function (p) {
      if (["aktivne", "rezervovane"].indexOf(p.stav) < 0 || (F.typ && KAT_TYP[p.kategoria] !== F.typ)) return;
      var q = p.lat && p.lon ? { ll: [Number(p.lat), Number(p.lon)], presnost: "gps", presna: true, ulica: p.ulica || null, obec: p.obec } :
        polohaInzeratu({ id: "p" + p.id, obec: p.obec, okres: p.okres, ulica: p.ulica, nazov: [p.cast_obce, p.ulica].filter(Boolean).join(" ") });
      if (!q) return;
      var f = (p.fotky || [])[0], odkaz = "#nehnutelnosti/" + p.id;
      var mk = L.marker(q.ll, { icon: ikonka("ponuka", kratkaCena(p.cena), !q.presna), zIndexOffset: 500 }).bindPopup('<div class="rm-pop">' + (f ? '<a href="' + odkaz + '" target="_blank" rel="noopener"><img src="' + esc(fotkaUrl(f)) + '" alt=""></a>' : "") +
        '<span class="rm-zn ponuka">Naša ponuka' + (p.stav === "rezervovane" ? " · rezervované" : "") + '</span><a class="rm-nazov" href="' + odkaz + '" target="_blank" rel="noopener">' + esc(nazovPonuky(p)) + "</a>" +
        (q.presnost === "gps" ? riadokPolohy({ ulica: [p.cast_obce, p.ulica].filter(Boolean).join(", ") }, p.obec, "poloha zadaná v ponuke") : riadokPolohy(q, p.obec)) + '<span class="rm-cena">' + esc(cenaPonuky(p)) + "</span>" +
        '<span class="meta">' + esc(meno(p.makler_id)) + '</span><span class="rm-odkazy"><a class="btn primary" href="' + odkaz + '" target="_blank" rel="noopener">Detail ponuky ↗</a>' +
        '<a class="btn" href="' + esc(q.presnost === "gps" ? zbgisOdkaz(q.ll[0], q.ll[1], 19) : katasterOdkaz({ obec: p.obec, okres: p.okres })) + '" target="_blank" rel="noopener">📐 Kataster</a></span></div>');
      vrstva.addLayer(mk); body.push(q.ll); n.ponuky++; if (p.obec) naObec[p.obec] = (naObec[p.obec] || 0) + 1;
    });
    if ((F.sukr || F.rk) && maSekciu("inzeraty")) (S.inz || []).forEach(function (z) {
      if (!z.aktivny || z.duplikat_z || (F.typ && z.typ !== F.typ)) return;
      var rk = ptyp(z) === "rk"; if ((rk && !F.rk) || (!rk && !F.sukr)) return;
      var q = polohaInzeratu(z); if (!q) return;
      var pr = (S.prev || {})[z.id], vSkeneri = "#inzeraty/" + encodeURIComponent(z.id);
      var mk = L.marker(q.ll, { icon: ikonka(rk ? "rk" : "sukr", kratkaCena(z.cena), !q.presna) }).bindPopup('<div class="rm-pop">' + (z.foto ? '<a href="' + esc(z.url) + '" target="_blank" rel="noopener"><img src="' + esc(z.foto) + '" alt="" referrerpolicy="no-referrer"></a>' : "") +
        '<span class="rm-zn ' + (rk ? "rk" : "sukr") + '">' + (rk ? "RK" + (z.predajca ? " · " + esc(z.predajca) : "") : "Súkromný predajca") + '</span><a class="rm-nazov" href="' + esc(z.url) + '" target="_blank" rel="noopener">' + esc(z.nazov) + "</a>" +
        riadokPolohy(q, q.obec) + '<span class="rm-cena">' + eur(z.cena) + (z.plocha ? " · " + nf.format(z.plocha) + " m²" : "") + "</span>" +
        (pr && pr.makler_id ? '<span class="meta">Prevzal ' + esc(meno(pr.makler_id)) + "</span>" : rk ? "" : '<span class="meta">Voľný – zatiaľ ho nikto neprevzal</span>') +
        '<span class="rm-odkazy"><a class="btn primary" href="' + vSkeneri + '" target="_blank" rel="noopener">V skeneri ↗</a><a class="btn" href="' + esc(z.url) + '" target="_blank" rel="noopener">' + esc(PORTAL[z.portal] || "Portál") + " ↗</a>" +
        '<a class="btn" href="' + esc(q.presnost === "gps" ? zbgisOdkaz(q.ll[0], q.ll[1], 19) : katasterOdkaz({ obec: q.obec, okres: z.okres })) + '" target="_blank" rel="noopener">📐 Kataster</a></span></div>');
      vrstva.addLayer(mk); body.push(q.ll); n[rk ? "rk" : "sukr"]++; naObec[q.obec] = (naObec[q.obec] || 0) + 1;
    });
    vrstva.addTo(mapa); S.realVrstva = vrstva; S.realBody = body;
    // názvy obcí – vidno ich aj na leteckej mape; ťuknutím obec priblížite
    var obce = L.layerGroup();
    (window.LOKALITY || []).forEach(function (x) {
      if (x[5] || (x[1] !== "Spišská Nová Ves" && x[1] !== "Levoča")) return;
      var ll = stredObce(x[0], x[1]), pocet = naObec[x[0]] || 0, mesto = MESTA_MAPA.indexOf(x[0]) >= 0;
      var t = L.marker(ll, { pane: "obce", keyboard: false, title: x[0] + (pocet ? " – " + pocetText(pocet, "bod", "body", "bodov") + " na mape" : ""),
        icon: L.divIcon({ className: "", iconSize: null, iconAnchor: [0, 0], html: '<span class="rm-obec' + (mesto ? " mesto" : "") + (pocet ? "" : " prazdna") + '">' + esc(x[0]) + (pocet ? "<b>" + pocet + "</b>" : "") + "</span>" }) });
      t.on("click", function () { mapa.setView(ll, Math.max(mapa.getZoom() + 1, x[0] === "Spišská Nová Ves" || x[0] === "Levoča" ? 14 : 15)); });
      obce.addLayer(t);
    });
    obce.addTo(mapa); S.realObce = obce;
    var pc = $("#mapa-pocet"); if (pc) pc.textContent = [F.ponuky ? pocetText(n.ponuky, "naša ponuka", "naše ponuky", "našich ponúk") : "", F.sukr ? pocetText(n.sukr, "súkromný", "súkromné", "súkromných") : "", F.rk ? pocetText(n.rk, "inzerát RK", "inzeráty RK", "inzerátov RK") : ""].filter(Boolean).join(" · ");
    if (prisposob && body.length) mapa.fitBounds(body, { padding: [30, 30], maxZoom: 14 });
  }

  // ------------------------------------------------------------ KATASTER
  var KAT_ODKAZY = {
    zbgis: "https://zbgis.skgeodesy.sk/mapka/sk/kataster?pos=48.800000,19.530000,8",
    eskn: "https://kataster.skgeodesy.sk/eskn-portal/",
    ugkk: "https://www.skgeodesy.sk/sk/",
  };
  function katasterTlacidlo(x, trieda) {
    return '<a class="' + (trieda || "kat-link") + '" href="' + esc(KAT_ODKAZY.zbgis) + '" target="_blank" rel="noopener" data-kataster data-obec="' + esc(x.obec || "") + '" data-okres="' + esc(x.okres || "") + '"' +
      (x.lat && x.lon ? ' data-lat="' + x.lat + '" data-lon="' + x.lon + '"' : "") + ' title="Otvoriť v katastri (ZBGIS)">📐 Kataster</a>';
  }
  document.addEventListener("click", function (e) {
    var a = e.target.closest("[data-kataster]"); if (!a) return;
    var x = { obec: a.dataset.obec, okres: a.dataset.okres, lat: Number(a.dataset.lat) || null, lon: Number(a.dataset.lon) || null };
    if (x.lat || window.LOKALITY) { a.href = katasterOdkaz(x); return; }
    e.preventDefault();
    var okno = window.open("about:blank", "_blank");
    nacitajLokality().then(function () { var u = katasterOdkaz(x); a.href = u; if (okno) okno.location.href = u; else location.href = u; },
      function () { if (okno) okno.location.href = KAT_ODKAZY.zbgis; });
  });
  function zbgisOdkaz(lat, lon, zoom) {
    return "https://zbgis.skgeodesy.sk/mapka/sk/kataster?pos=" + Number(lat).toFixed(6) + "," + Number(lon).toFixed(6) + "," + (zoom || 18);
  }
  // poloha obce zo zoznamu obcí (stred obce)
  function polohaObce(obec, okres) {
    var l = (window.LOKALITY || []).find(function (x) { return !x[5] && normLok(x[0]) === normLok(obec) && (!okres || x[1] === okres); }) ||
      (window.LOKALITY || []).find(function (x) { return normLok(x[0]) === normLok(obec); });
    return l ? [l[3], l[4]] : null;
  }
  // odkaz do katastra pre ponuku alebo inzerát – presná poloha, inak stred obce
  function katasterOdkaz(x) {
    if (x.lat && x.lon) return zbgisOdkaz(x.lat, x.lon, 19);
    var ll = window.LOKALITY ? polohaObce(x.obec, x.okres) : null;
    return ll ? zbgisOdkaz(ll[0], ll[1], 16) : KAT_ODKAZY.zbgis;
  }
  // podkladové mapy + vrstva parciel (ÚGKK SR); vracia ovládacie tlačidlá s piktogramami
  var PODKLADY = {
    mapa: ["Mapa", "mapa", function () { return L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }); }],
    letecka: ["Letecká", "satelit", function () { return L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", { maxZoom: 19, attribution: "Esri, Maxar, Earthstar Geographics" }); }],
  };
  function vrstvaParciel(naChybu) {
    var KN = "https://kataster.skgeodesy.sk/eskn/rest/services/NR/kn_wms_norm/MapServer/export";
    var V = L.TileLayer.extend({
      getTileUrl: function (c) {
        var ts = this.getTileSize(), nw = this._map.unproject(c.scaleBy(ts), c.z), se = this._map.unproject(c.add([1, 1]).scaleBy(ts), c.z);
        var a = L.CRS.EPSG3857.project(nw), b = L.CRS.EPSG3857.project(se);
        return KN + "?bbox=" + [a.x, b.y, b.x, a.y].map(function (v) { return v.toFixed(2); }).join(",") +
          "&bboxSR=3857&imageSR=3857&size=256,256&format=png32&transparent=true&dpi=96&f=image";
      },
    });
    var v = new V("", { maxZoom: 21, minZoom: 14, opacity: 0.85, attribution: "Kataster © ÚGKK SR", zIndex: 5 });
    var ok = 0, zle = 0;
    v.on("tileload", function () { ok++; });
    v.on("tileerror", function () { zle++; if (zle === 6 && !ok && naChybu) naChybu(); });
    return v;
  }
  function ovladanieVrstiev(mapa, kluc, pred, poZmene) {
    var st = S[kluc] = S[kluc] || { podklad: pred || "mapa", parcely: false };
    var podklad = PODKLADY[st.podklad][2]().addTo(mapa), parcely = null;
    function nastavParcely() {
      if (parcely) { mapa.removeLayer(parcely); parcely = null; }
      if (st.parcely) {
        parcely = vrstvaParciel(function () { toast("Vrstvu parciel sa teraz nepodarilo načítať – kliknite do mapy a otvorte kataster ZBGIS.", true); }).addTo(mapa);
        if (mapa.getZoom() < 16) mapa.setZoom(17);
      }
    }
    nastavParcely();
    var Ovl = L.Control.extend({
      options: { position: "topright" },
      onAdd: function () {
        var d = L.DomUtil.create("div", "pikto-vrstvy");
        d.innerHTML = Object.keys(PODKLADY).map(function (k) {
          return '<button type="button" data-podklad="' + k + '" aria-pressed="' + (st.podklad === k) + '" title="' + PODKLADY[k][0] + '">' + ikona(PODKLADY[k][1]) + "<span>" + PODKLADY[k][0] + "</span></button>";
        }).join("") + '<button type="button" data-parcely aria-pressed="' + st.parcely + '" title="Hranice parciel z katastra (pri väčšom priblížení)">' + ikona("kataster") + "<span>Parcely</span></button>";
        L.DomEvent.disableClickPropagation(d);
        d.querySelectorAll("[data-podklad]").forEach(function (b) {
          b.onclick = function () {
            st.podklad = b.dataset.podklad; mapa.removeLayer(podklad); podklad = PODKLADY[st.podklad][2]().addTo(mapa); podklad.bringToBack();
            d.querySelectorAll("[data-podklad]").forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); });
            if (poZmene) poZmene();
          };
        });
        d.querySelector("[data-parcely]").onclick = function () { st.parcely = !st.parcely; this.setAttribute("aria-pressed", String(st.parcely)); nastavParcely(); };
        return d;
      },
    });
    new Ovl().addTo(mapa);
  }
  function vykresliKataster() {
    var el = $("#obsah"); if (!el) return;
    var obce = ["Spišská Nová Ves", "Levoča", "Smižany", "Spišské Podhradie", "Krompachy", "Spišské Vlachy", "Markušovce", "Hrabušice", "Harichovce", "Spišský Štvrtok"];
    el.innerHTML = '<div class="box kat-box"><div class="vykon-hlava"><h3>📐 Kataster nehnuteľností</h3></div>' +
      '<div class="kat-pikto">' +
      '<a class="kat-dl" href="' + KAT_ODKAZY.zbgis + '" target="_blank" rel="noopener" id="kat-zbgis"><span class="kat-ik">' + ikona("kataster") + "</span><b>Katastrálna mapa</b><small>ZBGIS – parcely, LV, vlastníci</small></a>" +
      '<button type="button" class="kat-dl" data-kat="poloha"><span class="kat-ik">' + ikona("poloha") + "</span><b>Kataster tu, kde stojím</b><small>otvorí parcelu podľa GPS mobilu</small></button>" +
      '<a class="kat-dl" href="' + KAT_ODKAZY.eskn + '" target="_blank" rel="noopener"><span class="kat-ik">' + ikona("lv") + "</span><b>List vlastníctva</b><small>portál ESKN – vyhľadanie LV a parciel</small></a>" +
      '<a class="kat-dl" href="' + KAT_ODKAZY.ugkk + '" target="_blank" rel="noopener"><span class="kat-ik">' + ikona("urad") + "</span><b>Úrad geodézie</b><small>skgeodesy.sk – ÚGKK SR</small></a></div>" +
      '<div class="kat-obec"><label class="field"><span>Otvoriť kataster obce</span><input type="text" id="kat-obec" list="kat-obce" placeholder="napr. Spišská Nová Ves"></label>' +
      '<button class="btn primary" type="button" data-kat="obec">Otvoriť v katastri</button><datalist id="kat-obce"></datalist>' +
      '<div class="cipy">' + obce.map(function (o) { return '<button type="button" class="cip" data-kat-rychla="' + esc(o) + '">' + esc(o) + "</button>"; }).join("") + "</div></div>" +
      '<div id="kat-mapa" class="realitna-mapa kat-mapa"></div>' +
      '<p class="meta">👆 Ťuknite kamkoľvek do mapy – otvorí sa katastrálna mapa ZBGIS presne na tom mieste (parcela, list vlastníctva, výmera). Piktogramy vpravo hore prepínajú mapu, leteckú snímku a hranice parciel.</p></div>';
    nacitajLokality().then(function () {
      var dl = $("#kat-obce"); if (!dl) return;
      dl.innerHTML = window.LOKALITY.filter(function (x) { return !x[5]; }).map(function (x) { return '<option value="' + esc(x[0]) + '">' + esc("okres " + x[1]) + "</option>"; }).join("");
    }).catch(function () {});
    function otvorObec(nazov) {
      nacitajLokality().then(function () {
        var ll = polohaObce(nazov); if (!ll) return toast("Obec „" + nazov + "“ som nenašiel.", true);
        window.open(zbgisOdkaz(ll[0], ll[1], 15), "_blank", "noopener");
        if (S.katMapa) S.katMapa.setView(ll, 15);
      });
    }
    el.querySelectorAll("[data-kat-rychla]").forEach(function (b) { b.onclick = function () { $("#kat-obec").value = b.dataset.katRychla; otvorObec(b.dataset.katRychla); }; });
    el.querySelector('[data-kat="obec"]').onclick = function () { var v = $("#kat-obec").value.trim(); if (!v) return toast("Napíšte názov obce.", true); otvorObec(v); };
    $("#kat-obec").addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); el.querySelector('[data-kat="obec"]').click(); } });
    el.querySelector('[data-kat="poloha"]').onclick = function () {
      if (!navigator.geolocation) return toast("Tento prehliadač nevie zistiť polohu.", true);
      var okno = window.open("about:blank", "_blank");
      toast("📍 Zisťujem polohu…");
      navigator.geolocation.getCurrentPosition(function (p) {
        var u = zbgisOdkaz(p.coords.latitude, p.coords.longitude, 19);
        if (okno) okno.location.href = u; else location.href = u;
        if (S.katMapa) S.katMapa.setView([p.coords.latitude, p.coords.longitude], 18);
      }, function () { if (okno) okno.close(); toast("Polohu sa nepodarilo zistiť – povoľte prístup k polohe.", true); }, { enableHighAccuracy: true, timeout: 15000 });
    };
    nacitajLeaflet().then(function () {
      var box = $("#kat-mapa"); if (!box) return;
      var mapa = S.katMapa = L.map(box, { scrollWheelZoom: true }).setView(S.katStred || [48.946, 20.565], S.katZoom || 13);
      ovladanieVrstiev(mapa, "katVrstvy", "letecka");
      var odkaz = $("#kat-zbgis");
      function aktualizuj() { var c = mapa.getCenter(); S.katStred = [c.lat, c.lng]; S.katZoom = mapa.getZoom(); if (odkaz) odkaz.href = zbgisOdkaz(c.lat, c.lng, Math.max(14, mapa.getZoom())); }
      mapa.on("moveend", aktualizuj); aktualizuj();
      mapa.on("click", function (e) {
        L.popup().setLatLng(e.latlng).setContent('<div class="rm-pop"><b>📐 Toto miesto v katastri</b><span class="meta">' + e.latlng.lat.toFixed(5) + ", " + e.latlng.lng.toFixed(5) + "</span>" +
          '<a class="btn primary" href="' + zbgisOdkaz(e.latlng.lat, e.latlng.lng, 19) + '" target="_blank" rel="noopener">Otvoriť parcelu v ZBGIS</a></div>').openOn(mapa);
      });
      setTimeout(function () { mapa.invalidateSize(); }, 200);
    }, function () { $("#kat-mapa").innerHTML = '<div class="meta" style="padding:20px">Mapu sa nepodarilo načítať.</div>'; });
  }

  // ------------------------------------------------------------ VZHĽAD A ZNAČKA (admin)
  var POZICIE = [["lh", "Vľavo hore"], ["hore", "Hore v strede"], ["ph", "Vpravo hore"], ["ls", "Vľavo v strede"], ["stred", "Stred"], ["ps", "Vpravo v strede"],
    ["ld", "Vľavo dole"], ["dole", "Dole v strede"], ["pd", "Vpravo dole"]];
  function vykresliVzhlad() {
    var el = $("#obsah"); if (!el || !admin()) return;
    var D = S.vzhladDraft = S.vzhladDraft || JSON.parse(JSON.stringify(Object.assign({ schema: "typek" }, S.vzhlad || {})));
    D.vodoznak = Object.assign({}, VODOZNAK_PREDV, D.vodoznak || {});
    var w = D.vodoznak, zmenene = JSON.stringify(D) !== JSON.stringify(Object.assign({ schema: "typek" }, S.vzhlad || {}, { vodoznak: Object.assign({}, VODOZNAK_PREDV, (S.vzhlad || {}).vodoznak || {}) }));
    function karta(k, f) {
      return '<button type="button" class="vz-schema' + (D.schema === k ? " vybrana" : "") + '" data-schema="' + k + '" aria-pressed="' + (D.schema === k) + '">' +
        '<span class="vz-nahlad" style="--g:' + f[1] + ";--gr:" + f[4] + ";--soft:" + f[3] + '"><i class="vz-hl"></i><i class="vz-bod"></i><i class="vz-pas"></i></span><b>' + esc(f[0]) + "</b></button>";
    }
    var h = '<div class="box vz-box"><div class="vykon-hlava"><h3>🎨 Vzhľad a značka kancelárie</h3>' +
      '<div class="nehn-akcie">' + (zmenene ? '<span class="chip">Neuložené zmeny</span><button class="btn ghost" type="button" data-vz="zrusit">Zrušiť</button>' : "") +
      '<button class="btn primary" type="button" data-vz="ulozit"' + (zmenene ? "" : " disabled") + ">Uložiť pre celý tím</button></div></div>" +
      '<p class="meta">Nastavenie platí pre všetkých maklérov – farby aplikácie, logo v menu, na prihlásení, na verejných stránkach ponúk a vodotlač na nových fotkách.</p>' +
      '<section class="vz-sekcia"><h4>Farebná schéma</h4><div class="vz-schemy">' +
      Object.keys(SCHEMY).map(function (k) { return karta(k, SCHEMY[k]); }).join("") +
      '<label class="vz-schema vlastna' + (D.schema === "vlastna" ? " vybrana" : "") + '"><span class="vz-nahlad" style="--g:' + esc(D.farba || "#7a5cff") + ";--gr:" + farbySchemy({ schema: "vlastna", farba: D.farba || "#7a5cff" })[4] +
        ";--soft:" + zmiesaj(D.farba || "#7a5cff", "#ffffff", 0.84) + '"><i class="vz-hl"></i><i class="vz-bod"></i><i class="vz-pas"></i></span><b>Vlastná farba</b>' +
        '<input type="color" id="vz-farba" value="' + esc(D.farba || "#7a5cff") + '" aria-label="Vlastná farba"></label></div></section>' +
      '<section class="vz-sekcia"><h4>Logo kancelárie</h4><div class="vz-logo"><div class="vz-logo-nahlad"><span class="tmave"><img src="' + esc(D.logo || LOGO_PREDV) + '" alt="Logo"></span>' +
        '<span class="svetle"><img src="' + esc(D.logo || LOGO_PREDV) + '" alt=""></span></div><div class="vz-logo-akcie">' +
        '<label class="btn primary">📤 Nahrať logo<input type="file" id="vz-logo-subor" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden></label>' +
        (D.logo ? '<button class="btn ghost" type="button" data-vz="logo-predv">Vrátiť pôvodné logo</button>' : "") +
        '<span class="meta">Najlepšie PNG s priehľadným pozadím, na šírku. Použije sa aj na vodotlač.</span>' +
        '<label class="field"><span>Názov kancelárie</span><input type="text" id="vz-nazov" maxlength="80" value="' + esc(D.nazov || "") + '" placeholder="Alpha Reality"></label></div></div></section>' +
      '<section class="vz-sekcia"><h4>Vodotlač na fotky</h4><div class="vz-vodoznak"><div class="vz-ovladanie">' +
        '<span class="meta">Kde bude logo</span><div class="vz-pozicie">' + POZICIE.map(function (p) {
          return '<button type="button" class="vz-poz p-' + p[0] + '" data-poz="' + p[0] + '" aria-pressed="' + (w.pozicia === p[0]) + '" title="' + p[1] + '" aria-label="' + p[1] + '"><i></i></button>';
        }).join("") + "</div>" +
        '<span class="meta vz-poz-tip" id="vz-poz-tip">' + (w.pozicia === "vlastna" ? "✋ Vlastná poloha – logo si posunul v náhľade." : "Alebo logo chyť v náhľade a posuň ho, kam chceš.") + "</span>" +
        '<span class="meta">Farba loga</span><div class="seg" role="group"><button type="button" data-styl="farebne" aria-pressed="' + (w.styl === "farebne") + '">🎨 Farebné</button>' +
        '<button type="button" data-styl="biele" aria-pressed="' + (w.styl === "biele") + '">⬜ Biele</button></div>' +
        '<label class="vz-slider"><span>Priehľadnosť <b id="vz-pr-h">' + Math.round((1 - w.priehladnost) * 100) + ' %</b></span><input type="range" id="vz-pr" min="0" max="90" step="5" value="' + Math.round((1 - w.priehladnost) * 100) + '"></label>' +
        '<label class="vz-slider"><span>Veľkosť <b id="vz-vel-h">' + Math.round(w.velkost * 100) + ' %</b></span><input type="range" id="vz-vel" min="8" max="60" step="1" value="' + Math.round(w.velkost * 100) + '"></label>' +
        '<p class="meta">Platí pre nové fotky. Každý maklér si vodotlač pri nahrávaní môže vypnúť.</p></div>' +
        '<div class="vz-nahlad-foto"><canvas id="vz-canvas" width="960" height="540" aria-label="Náhľad vodotlače – logo sa dá posunúť myšou alebo prstom"></canvas><span class="meta">Náhľad · logo môžeš chytiť a posunúť</span></div></div></section>' +
      '<section class="vz-sekcia vz-typek"><img src="typek-postava.png" alt="" width="90" height="101"><div><b>Realitný týpek</b><span class="meta">Softvér pre realitné kancelárie a maklérov. Farby a logo si každá kancelária nastaví po svojom.</span></div></section></div>';
    el.innerHTML = h;
    napojVzhlad();
    kresliNahladVodoznaku();
  }
  function nahladVzhladu() { aplikujVzhlad(S.vzhladDraft); }
  async function kresliNahladVodoznaku() {
    var c = $("#vz-canvas"); if (!c) return;
    var g = c.getContext("2d"), W = c.width, H = c.height, D = S.vzhladDraft;
    if (!S.vzNahladFoto) S.vzNahladFoto = nacitajObr("vodotlac-nahlad.jpg?v=202610211700");
    var logoSrc = D.logo || LOGO_PREDV;
    if (!S.vzNahladLogo || S.vzNahladLogo.src !== logoSrc) S.vzNahladLogo = { src: logoSrc, p: nacitajObr(logoSrc) };
    var foto = await S.vzNahladFoto, logo = await S.vzNahladLogo.p;
    if (!$("#vz-canvas") || S.vzhladDraft !== D) return;
    g.clearRect(0, 0, W, H);
    if (foto) { var k = Math.max(W / foto.width, H / foto.height); g.drawImage(foto, (W - foto.width * k) / 2, (H - foto.height * k) / 2, foto.width * k, foto.height * k); }
    else {
      var gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, "#8fb8e0"); gr.addColorStop(0.62, "#dce9f3"); gr.addColorStop(0.62, "#7aa35a"); gr.addColorStop(1, "#5b8243");
      g.fillStyle = gr; g.fillRect(0, 0, W, H);
      g.fillStyle = "#efe7da"; g.fillRect(300, 260, 360, 200); g.fillStyle = "#9b4b36"; g.beginPath(); g.moveTo(270, 270); g.lineTo(480, 140); g.lineTo(690, 270); g.closePath(); g.fill();
      g.fillStyle = "#5c7da0"; [[340, 300], [440, 300], [560, 300]].forEach(function (o) { g.fillRect(o[0], o[1], 60, 60); }); g.fillStyle = "#6b4a33"; g.fillRect(450, 370, 60, 90);
    }
    if (logo) kresliVodoznak(g, W, H, logo, Object.assign({}, VODOZNAK_PREDV, D.vodoznak));
  }
  function napojVzhlad() {
    var el = $("#obsah"), D = S.vzhladDraft;
    function zmena(prekresli) { nahladVzhladu(); if (prekresli) vykresliVzhlad(); else { kresliNahladVodoznaku(); var u = el.querySelector('[data-vz="ulozit"]'); if (u) u.disabled = false; } }
    el.querySelectorAll("[data-schema]").forEach(function (b) { b.onclick = function () { D.schema = b.dataset.schema; zmena(true); }; });
    var fa = $("#vz-farba");
    fa.oninput = function () { D.schema = "vlastna"; D.farba = fa.value; nahladVzhladu(); };
    fa.onchange = function () { D.schema = "vlastna"; D.farba = fa.value; zmena(true); };
    function tipPolohy() { var t = $("#vz-poz-tip"); if (t) t.textContent = D.vodoznak.pozicia === "vlastna" ? "✋ Vlastná poloha – logo si posunul v náhľade." : "Alebo logo chyť v náhľade a posuň ho, kam chceš."; }
    el.querySelectorAll("[data-poz]").forEach(function (b) { b.onclick = function () { D.vodoznak.pozicia = b.dataset.poz; delete D.vodoznak.x; delete D.vodoznak.y; el.querySelectorAll("[data-poz]").forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); }); tipPolohy(); zmena(); }; });
    var cv = $("#vz-canvas"), tahanie = null, cakaKresba = false;
    function bodVCanvase(e) { var r = cv.getBoundingClientRect(); return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height]; }
    function presun(e) {
      var b = bodVCanvase(e);
      D.vodoznak.pozicia = "vlastna";
      D.vodoznak.x = Math.round(Math.min(1, Math.max(0, b[0] - tahanie[0])) * 1000) / 1000;
      D.vodoznak.y = Math.round(Math.min(1, Math.max(0, b[1] - tahanie[1])) * 1000) / 1000;
      if (!cakaKresba) { cakaKresba = true; requestAnimationFrame(function () { cakaKresba = false; zmena(); }); }
    }
    cv.onpointerdown = async function (e) {
      var logo = S.vzNahladLogo && await S.vzNahladLogo.p; if (!logo) return;
      var n = Object.assign({}, VODOZNAK_PREDV, D.vodoznak), W = cv.width, H = cv.height;
      var lw = Math.round(Math.max(W, H) * n.velkost * (n.pozicia === "stred" ? 1.6 : 1)); if (lw > W * 0.9) lw = Math.round(W * 0.9);
      var lh = Math.round(lw * logo.height / logo.width), r = vodoznakObdlznik(W, H, lw, lh, n), b = bodVCanvase(e);
      var sx = (r[0] + lw / 2) / W, sy = (r[1] + lh / 2) / H;
      var naLogu = Math.abs(b[0] - sx) * W <= lw / 2 + 12 && Math.abs(b[1] - sy) * H <= lh / 2 + 12;
      // chytené logo sa posúva bez skoku; klik mimo loga ho presunie priamo na to miesto
      tahanie = naLogu ? [b[0] - sx, b[1] - sy] : [0, 0];
      // stred zostane stredom – pri posunutí sa už veľkosť nemení
      if (n.pozicia === "stred") D.vodoznak.velkost = Math.min(0.6, Math.round(n.velkost * 1.6 * 100) / 100);
      try { cv.setPointerCapture(e.pointerId); } catch (x) { /* nič */ }
      el.querySelectorAll("[data-poz]").forEach(function (x) { x.setAttribute("aria-pressed", "false"); });
      presun(e); tipPolohy();
      var vel = $("#vz-vel"); if (vel) { vel.value = Math.round(D.vodoznak.velkost * 100); $("#vz-vel-h").textContent = vel.value + " %"; }
    };
    cv.onpointermove = function (e) { if (tahanie) presun(e); };
    cv.onpointerup = cv.onpointercancel = function () { tahanie = null; };
    el.querySelectorAll("[data-styl]").forEach(function (b) { b.onclick = function () { D.vodoznak.styl = b.dataset.styl; el.querySelectorAll("[data-styl]").forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); }); zmena(); }; });
    $("#vz-pr").oninput = function () { D.vodoznak.priehladnost = Math.round((1 - this.value / 100) * 100) / 100; $("#vz-pr-h").textContent = this.value + " %"; zmena(); };
    $("#vz-vel").oninput = function () { D.vodoznak.velkost = this.value / 100; $("#vz-vel-h").textContent = this.value + " %"; zmena(); };
    $("#vz-nazov").oninput = function () { D.nazov = this.value; var u = el.querySelector('[data-vz="ulozit"]'); if (u) u.disabled = false; };
    $("#vz-logo-subor").onchange = async function () {
      var f = this.files[0]; if (!f) return;
      try {
        toast("Nahrávam logo…");
        var obr = await new Promise(function (ok, chyba) { var i = new Image(), u = URL.createObjectURL(f); i.onload = function () { ok(i); }; i.onerror = function () { chyba(new Error("Súbor nie je obrázok.")); }; i.src = u; });
        var k = Math.min(1, 900 / Math.max(obr.width || 900, obr.height || 300)), cv = document.createElement("canvas");
        cv.width = Math.round((obr.width || 900) * k); cv.height = Math.round((obr.height || 300) * k); cv.getContext("2d").drawImage(obr, 0, 0, cv.width, cv.height);
        var blob = await new Promise(function (ok) { cv.toBlob(ok, "image/png"); });
        var cesta = "vzhlad/logo-" + Date.now() + ".png", r;
        try { r = await sb.storage.from("ponuky").upload(cesta, blob, { contentType: "image/png", upsert: false }); } catch (e1) { r = { error: e1 }; }
        if (r.error) throw r.error;
        D.logo = CFG.supabaseUrl + "/storage/v1/object/public/ponuky/" + cesta;
        toast("Logo je nahraté – nezabudnite Uložiť.");
        zmena(true);
      } catch (err) { toast(chybaText(err), true); }
    };
    el.querySelectorAll("[data-vz]").forEach(function (b) {
      b.onclick = async function () {
        var a = b.dataset.vz;
        if (a === "logo-predv") { D.logo = null; return zmena(true); }
        if (a === "zrusit") { S.vzhladDraft = null; aplikujVzhlad(S.vzhlad); return vykresliVzhlad(); }
        if (a === "ulozit") {
          b.disabled = true;
          try { await rpc("ulozit_vzhlad", { p: D }); S.vzhladDraft = null; await nacitajVzhlad(); aplikujVzhlad(S.vzhlad); toast("🎨 Vzhľad je uložený – uvidí ho celý tím."); konfety({ pocet: 70 }); vykresli(); }
          catch (err) { b.disabled = false; toast(chybaText(err), true); }
        }
      };
    });
  }

  // ------------------------------------------------------------ AI ASISTENT
  var AI_NAVRHY = [
    ["✍️ Popis nehnuteľnosti", "Napíš predajný popis nehnuteľnosti (cca 1200 znakov) a pútavý názov do 60 znakov. Použi údaje z podkladov."],
    ["📣 Príspevok na Facebook", "Napíš príspevok na Facebook a Instagram k tejto ponuke – krátky, pútavý, s emoji a 5 hashtagmi (#SpisskaNovaVes #Levoca …)."],
    ["💬 SMS majiteľovi", "Napíš krátku zdvorilú SMS súkromnému predajcovi, že máme klientov na nehnuteľnosti v jeho lokalite, a poprosím o krátky telefonát."],
    ["📧 Email po obhliadke", "Napíš email klientovi po obhliadke – poďakovanie, zhrnutie výhod nehnuteľnosti, ďalší krok (druhá obhliadka / rezervácia)."],
    ["🛡️ Námietka „predám sám“", "Majiteľ hovorí, že predá sám bez realitky. Daj mi 5 krátkych, slušných odpovedí, ako vysvetliť prínos makléra."],
    ["📊 Cena nehnuteľnosti", "Ako mám majiteľovi vysvetliť, že jeho cena je nad trhom? Navrhni rozhovor v bodoch."],
  ];
  function kontextPonuky(p) {
    if (!p) return "";
    var I = (S.ponukyInt || {})[p.id] || {};
    return ["Ponuka: " + nazovPonuky(p), "Druh: " + [p.transakcia === "prenajom" ? "prenájom" : "predaj", p.typ].filter(Boolean).join(", "),
      "Lokalita: " + [p.ulica, p.cast_obce, p.obec, p.okres ? "okres " + p.okres : ""].filter(Boolean).join(", "), "Cena: " + cenaPonuky(p),
      p.plocha_uzitkova ? "Úžitková plocha: " + p.plocha_uzitkova + " m²" : "", p.plocha_pozemku ? "Pozemok: " + p.plocha_pozemku + " m²" : "", p.izby ? "Izby: " + p.izby : "",
      p.poschodie != null && p.poschodie !== "" ? "Poschodie: " + p.poschodie + (p.pocet_podlazi ? " z " + p.pocet_podlazi : "") : "", p.stav_objektu ? "Stav: " + p.stav_objektu : "",
      p.konstrukcia ? "Konštrukcia: " + p.konstrukcia : "", p.energ_certifikat ? "Energetický certifikát: " + p.energ_certifikat : "", p.kurenie ? "Kúrenie: " + p.kurenie : "",
      (p.vybavenie || []).length ? "Vybavenie: " + p.vybavenie.join(", ") : "", p.popis ? "Súčasný popis: " + p.popis.slice(0, 1500) : "",
      "Odkaz: " + verejnyOdkaz(p.id), I.poznamka ? "Interná poznámka makléra: " + I.poznamka.slice(0, 300) : ""].filter(Boolean).join("\n");
  }
  function vykresliAsistenta() {
    var el = $("#obsah"); if (!el) return;
    var M = S.aiSpravy = S.aiSpravy || [];
    var ponuky = (S.ponuky || []).filter(function (p) { return ["archiv"].indexOf(p.stav) < 0; });
    el.innerHTML = '<div class="box chat ai-box"><div class="chat-hlava"><div class="chat-titul"><span class="chat-ik typek-ik"><img src="typek-hlava.png" alt="" width="38" height="38"></span><div><h3>AI asistent Týpek</h3><span class="meta">Texty, odpovede klientom, rady – po slovensky</span></div></div>' +
      (M.length ? '<button class="btn ghost" type="button" data-ai="nova">Nový rozhovor</button>' : "") + "</div>" +
      '<div class="chat-spravy" id="ai-spravy">' + (M.length ? M.map(function (m, i) {
        var prvaOdpoved = m.role !== "user" && (i === 0 || M[i - 1].role === "user");
        return '<div class="sprava' + (m.role === "user" ? " ja" : "") + '">' + (m.role !== "user" ? '<span class="sprava-av">' + (prvaOdpoved ? '<img class="typek-av" src="typek-hlava.png" alt="" width="36" height="36">' : "") + "</span>" : "") +
          '<div class="sprava-telo">' + (prvaOdpoved ? '<div class="sprava-meno">Týpek</div>' : "") +
          '<div class="bublina' + (m.chyba ? " ai-chyba" : "") + '">' + esc(m.content) + "</div>" +
          (m.role !== "user" && !m.chyba ? '<button type="button" class="btn-link" data-ai-kopiruj="' + i + '">Kopírovať</button>' : "") + "</div></div>";
      }).join("") + (S.aiCaka ? '<div class="sprava"><span class="sprava-av"><img class="typek-av" src="typek-hlava.png" alt="" width="36" height="36"></span><div class="sprava-telo"><div class="bublina ai-pise"><span></span><span></span><span></span></div></div></div>' : "") :
        '<div class="ai-uvod"><img class="ai-typek" src="typek-postava.png" alt="" width="568" height="640"><b>Ahoj, som Týpek. S čím vám pomôžem?</b><span class="meta">Vyberte ponuku (nepovinné) a ťuknite na návrh, alebo napíšte vlastnú otázku.</span><div class="ai-navrhy">' +
        AI_NAVRHY.map(function (n, i) { return '<button type="button" class="ai-navrh" data-ai-navrh="' + i + '">' + esc(n[0]) + "</button>"; }).join("") + "</div></div>") + "</div>" +
      '<div class="ai-kontext"><label class="field"><span>Podklady z ponuky</span><select id="ai-ponuka"><option value="">— bez ponuky —</option>' + ponuky.map(function (p) {
        return '<option value="' + p.id + '"' + (Number(S.aiPonuka) === p.id ? " selected" : "") + ">" + esc((p.cislo ? p.cislo + " · " : "") + nazovPonuky(p)) + "</option>"; }).join("") + "</select></label></div>" +
      '<form class="chat-form" id="f-ai"><textarea id="ai-text" rows="1" maxlength="4000" placeholder="Napíšte, s čím potrebujete pomôcť…" aria-label="Otázka"></textarea>' +
      '<button class="chat-poslat" type="submit" aria-label="Odoslať"' + (S.aiCaka ? " disabled" : "") + '><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.4 20.4 21 12 3.4 3.6 3.4 10l12.6 2-12.6 2z" fill="currentColor"/></svg></button></form></div>';
    vyskaAi();
    var box = $("#ai-spravy"); box.scrollTop = box.scrollHeight;
    var t = $("#ai-text");
    t.addEventListener("input", function () { t.style.height = "auto"; t.style.height = Math.min(t.scrollHeight, 160) + "px"; });
    t.addEventListener("keydown", function (e) { if (e.key === "Enter" && !e.shiftKey && window.matchMedia("(pointer: fine)").matches) { e.preventDefault(); $("#f-ai").requestSubmit(); } });
    $("#ai-ponuka").onchange = function () { S.aiPonuka = this.value; };
    el.querySelectorAll("[data-ai-navrh]").forEach(function (b) { b.onclick = function () { posliAi(AI_NAVRHY[Number(b.dataset.aiNavrh)][1]); }; });
    el.querySelectorAll("[data-ai-kopiruj]").forEach(function (b) { b.onclick = function () { kopiruj(M[Number(b.dataset.aiKopiruj)].content, "Text je skopírovaný."); }; });
    var nr = el.querySelector('[data-ai="nova"]'); if (nr) nr.onclick = function () { S.aiSpravy = []; vykresliAsistenta(); };
    $("#f-ai").onsubmit = function (e) { e.preventDefault(); var v = t.value.trim(); if (v) posliAi(v); };
  }
  function vyskaAi() {
    var c = $(".ai-box"); if (!c) return;
    var vh = window.visualViewport ? window.visualViewport.height : window.innerHeight;
    c.style.height = Math.max(420, vh - Math.min(c.getBoundingClientRect().top + window.scrollY, vh * 0.45) - 16) + "px";
  }
  async function posliAi(text) {
    if (S.aiCaka) return;
    var M = S.aiSpravy;
    M.push({ role: "user", content: text }); S.aiCaka = true; vykresliAsistenta();
    var p = S.aiPonuka ? (S.ponuky || []).find(function (x) { return x.id === Number(S.aiPonuka); }) : null;
    try {
      var ses = (await sb.auth.getSession()).data.session;
      var r = await fetch(CFG.supabaseUrl + "/functions/v1/asistent", { method: "POST",
        headers: { "Content-Type": "application/json", apikey: CFG.supabaseKey, Authorization: "Bearer " + (ses ? ses.access_token : "") },
        body: JSON.stringify({ spravy: M.filter(function (m) { return !m.chyba; }).map(function (m) { return { role: m.role, content: m.content }; }), kontext: kontextPonuky(p) }) });
      var d = {}; try { d = await r.json(); } catch (e) { /* nič */ }
      if (!r.ok || !d.text) M.push({ role: "assistant", content: d.chyba || "AI asistent teraz nie je dostupný.", chyba: true });
      else M.push({ role: "assistant", content: d.text });
    } catch (err) { M.push({ role: "assistant", content: chybaText(err), chyba: true }); }
    S.aiCaka = false; if (S.tab === "asistent") vykresliAsistenta();
  }

  // ------------------------------------------------------------ OSOBNÝ WEB
  function vykresliWeb() {
    var el = $("#obsah"); if (!el) return;
    var url = new URL("makler.html?id=" + S.me.id, location.href).href, base = new URL(".", location.href).href;
    el.innerHTML = '<div class="box web-box"><div class="vykon-hlava"><h3>🌐 Osobný web</h3></div>' +
      '<div class="web-hero"><div><b>Vaša osobná stránka už funguje</b><p class="meta">Fotka, kontakt, vaše aktuálne ponuky a recenzie klientov – všetko sa aktualizuje samo z Realitného týpka. Pošlite ju klientom alebo dajte do podpisu emailu.</p>' +
      '<div class="pd-odkaz"><input type="text" readonly value="' + esc(url) + '"><button class="btn" type="button" data-web="kopiruj">Kopírovať</button><a class="btn primary" href="' + esc(url) + '" target="_blank" rel="noopener">Otvoriť</a></div></div></div>' +
      '<div class="web-dlazdice">' +
      '<div class="web-dl"><span class="web-ik">✏️</span><b>Úprava vlastného webu</b><span class="meta">Texty o vás, farby, vlastná doména (napr. meno.alphareality.sk), sekcie a fotky.</span><span class="chip">Pripravujeme</span></div>' +
      '<div class="web-dl"><span class="web-ik">📘</span><b>E-book pre predávajúcich</b><span class="meta">„Ako predať nehnuteľnosť rýchlo a za najlepšiu cenu“ – stiahnutie výmenou za kontakt. Získate nových majiteľov priamo z webu.</span><span class="chip">Pripravujeme</span></div>' +
      '<div class="web-dl"><span class="web-ik">⭐</span><b>Recenzie na webe</b><span class="meta">Schválené recenzie klientov sa na vašej stránke zobrazujú automaticky.</span><button class="btn" type="button" data-domov="recenzie">Recenzie →</button></div>' +
      '<div class="web-dl"><span class="web-ik">🧩</span><b>Ponuky na inom webe</b><span class="meta">Kód s vašimi ponukami pre ľubovoľnú stránku:</span><pre class="kod" id="kod-moj">' + esc('<div data-typek-ponuky data-makler="' + S.me.id + '"></div>\n<script src="' + base + 'widget.js" async></script>') +
      '</pre><button class="btn" type="button" data-web="kod">Kopírovať kód</button></div></div></div>';
    el.querySelector('[data-web="kopiruj"]').onclick = function () { kopiruj(url, "Odkaz na vašu stránku je skopírovaný."); };
    el.querySelector('[data-web="kod"]').onclick = function () { kopiruj($("#kod-moj").textContent, "Kód je skopírovaný."); };
  }

  // ------------------------------------------------------------ RECENZIE
  var ZDROJE_REC = { web: "Web", google: "Google", facebook: "Facebook", osobne: "Osobne", ine: "Iné" };
  async function nacitajRecenzie() { S.recenzie = await vsetkyRiadky("recenzie", "*", "id").catch(function () { return []; }); }
  function hviezdy(n) { return '<span class="hviezdy" aria-label="' + n + ' z 5">' + "★★★★★".slice(0, n) + '<i>' + "★★★★★".slice(n) + "</i></span>"; }
  function vykresliRecenzie() {
    var el = $("#obsah"); if (!el) return;
    if (!S.recenzie) { el.innerHTML = '<div class="box"><div class="meta">Načítavam recenzie…</div></div>'; nacitajRecenzie().then(vykresliRecenzie); return; }
    var F = S.recF = S.recF || { stav: "schvalena" };
    var R = S.recenzie, schv = R.filter(function (r) { return r.stav === "schvalena"; });
    var priemer = schv.length ? (schv.reduce(function (a, r) { return a + r.hodnotenie; }, 0) / schv.length) : 0;
    var caka = R.filter(function (r) { return r.stav === "caka"; }).length;
    var odkaz = new URL("recenzia.html?m=" + S.me.id, location.href).href;
    var sprava = "Dobrý deň, ďakujem za dôveru a spoluprácu. Veľmi by mi pomohlo, keby ste mi napísali krátku recenziu – zaberie to minútu: " + odkaz + "\n\n" + podpis();
    var h = '<div class="box rec-box"><div class="vykon-hlava"><h3>⭐ Recenzie</h3><button class="btn primary" type="button" data-rec="nova">+ Zapísať recenziu</button></div>' +
      '<div class="rec-suhrn"><div class="rec-priemer"><b>' + (schv.length ? priemer.toFixed(1).replace(".", ",") : "–") + "</b>" + hviezdy(Math.round(priemer)) + '<span class="meta">' + schv.length + " schválených</span></div>" +
      '<div class="rec-poziadat"><b>Požiadajte klienta o recenziu</b><span class="meta">Pošlite mu odkaz – recenziu napíše za minútu, administrátor ju schváli a zobrazí sa na webe.</span>' +
      '<div class="pd-zdiel-btns"><a class="btn wa" href="#" data-rec-posli="wa" target="_blank" rel="noopener">WhatsApp</a><a class="btn" href="#" data-rec-posli="sms">💬 SMS</a><a class="btn" href="#" data-rec-posli="email">✉️ Email</a>' +
      '<button class="btn ghost" type="button" data-rec="kopiruj">Kopírovať odkaz</button></div></div></div>';
    if (S.recForm) h += '<form class="kal-form" id="f-rec"><h4>Zapísať recenziu klienta</h4><p class="meta">Len skutočné hodnotenia od klientov (napr. z Google, Facebooku alebo osobne). ' + (admin() ? "" : "Zobrazí sa po schválení administrátorom.") + '</p><div class="form-grid">' +
      '<label class="field"><span>Meno klienta *</span><input type="text" name="meno" required maxlength="80"></label>' +
      '<label class="field"><span>Hodnotenie</span><select name="hodnotenie">' + [5, 4, 3, 2, 1].map(function (n) { return '<option value="' + n + '">' + "★★★★★".slice(0, n) + " (" + n + ")</option>"; }).join("") + "</select></label>" +
      '<label class="field"><span>Odkiaľ</span><select name="zdroj">' + ["google", "facebook", "osobne", "ine"].map(function (z) { return '<option value="' + z + '">' + ZDROJE_REC[z] + "</option>"; }).join("") + "</select></label>" +
      (admin() ? '<label class="field"><span>Maklér</span><select name="makler_id">' + S.makleri.filter(function (m) { return m.aktivny; }).map(function (m) { return '<option value="' + m.id + '"' + (m.id === S.me.id ? " selected" : "") + ">" + esc(m.meno) + "</option>"; }).join("") + "</select></label>" : "") +
      '</div><label class="field"><span>Text recenzie</span><textarea name="text" rows="3" maxlength="2000"></textarea></label>' +
      '<div class="form-actions"><button class="btn primary" type="submit">Uložiť</button><button class="btn ghost" type="button" data-rec="zrus-form">Zrušiť</button></div></form>';
    h += '<div class="seg" role="group">' + [["schvalena", "Schválené"], ["caka", "Čakajú" + (caka ? " (" + caka + ")" : "")], ["zamietnuta", "Zamietnuté"]].map(function (x) {
      return '<button type="button" data-recf="' + x[0] + '" aria-pressed="' + (F.stav === x[0]) + '">' + x[1] + "</button>"; }).join("") + "</div>";
    var zoz = R.filter(function (r) { return r.stav === F.stav; }).sort(function (a, b) { return String(b.vytvorene).localeCompare(String(a.vytvorene)); });
    h += zoz.length ? '<div class="rec-zoznam">' + zoz.map(function (r) {
      return '<div class="rec-karta"><div class="rec-hl">' + hviezdy(r.hodnotenie) + "<b>" + esc(r.meno) + '</b><span class="meta">' + datum(r.vytvorene) + " · " + esc(ZDROJE_REC[r.zdroj] || r.zdroj) + "</span></div>" +
        (r.text ? '<p class="rec-text">„' + esc(r.text) + "“</p>" : "") + '<div class="meta">' + (r.makler_id ? avatar(r.makler_id, 18) + " " + esc(meno(r.makler_id)) : "Kancelária") + "</div>" +
        (admin() ? '<div class="rec-akcie">' + (r.stav !== "schvalena" ? '<button class="btn primary" type="button" data-rec-stav="schvalena" data-id="' + r.id + '">✓ Schváliť</button>' : "") +
          (r.stav !== "zamietnuta" ? '<button class="btn ghost danger" type="button" data-rec-stav="zamietnuta" data-id="' + r.id + '">Zamietnuť</button>' : "") + "</div>" : "") + "</div>";
    }).join("") + "</div>" : '<p class="meta">Žiadne recenzie v tejto skupine.</p>';
    el.innerHTML = h + "</div>";
    el.querySelectorAll("[data-recf]").forEach(function (b) { b.onclick = function () { F.stav = b.dataset.recf; vykresliRecenzie(); }; });
    el.querySelectorAll("[data-rec]").forEach(function (b) {
      b.onclick = function () {
        var a = b.dataset.rec;
        if (a === "nova") S.recForm = true; if (a === "zrus-form") S.recForm = false;
        if (a === "kopiruj") return kopiruj(odkaz, "Odkaz na recenziu je skopírovaný.");
        vykresliRecenzie();
      };
    });
    el.querySelectorAll("[data-rec-posli]").forEach(function (a) { a.onclick = function () { a.href = odkazSpravy(a.dataset.recPosli, "", sprava, "Prosba o recenziu – Alpha Reality", ""); }; });
    el.querySelectorAll("[data-rec-stav]").forEach(function (b) {
      b.onclick = async function () { try { await rpc("schvalit_recenziu", { p_id: Number(b.dataset.id), p_stav: b.dataset.recStav }); await nacitajRecenzie(); toast(b.dataset.recStav === "schvalena" ? "⭐ Recenzia je schválená a zobrazí sa na webe." : "Recenzia je zamietnutá."); vykresliRecenzie(); } catch (e) { toast(chybaText(e), true); } };
    });
    var f = $("#f-rec");
    if (f) f.onsubmit = async function (e) {
      e.preventDefault();
      try { await rpc("zapisat_recenziu", { p: { meno: f.meno.value, hodnotenie: Number(f.hodnotenie.value), zdroj: f.zdroj.value, text: f.text.value, makler_id: f.makler_id ? f.makler_id.value : null } });
        S.recForm = false; await nacitajRecenzie(); toast(admin() ? "⭐ Recenzia je uložená." : "Recenzia je uložená – zobrazí sa po schválení."); vykresliRecenzie(); }
      catch (err) { toast(chybaText(err), true); }
    };
  }

  // ------------------------------------------------------------ SOCIÁLNE SIETE: banner a text k ponuke
  var FORMATY = [["stvorec", "Štvorec 1080×1080", 1080, 1080, "Instagram, Facebook"], ["sirka", "Na šírku 1200×630", 1200, 630, "Facebook, LinkedIn"], ["story", "Story 1080×1920", 1080, 1920, "Instagram / FB príbeh"]];
  function textNaSiete(p) {
    var mk = S.mById[p.makler_id] || S.me, par = [];
    if (p.plocha_uzitkova) par.push("📐 " + nf.format(p.plocha_uzitkova) + " m²"); if (p.plocha_pozemku) par.push("🌳 pozemok " + nf.format(p.plocha_pozemku) + " m²");
    if (p.izby) par.push("🛏️ " + p.izby + (p.izby === 1 ? " izba" : p.izby <= 4 ? " izby" : " izieb")); if (p.stav_objektu) par.push("✨ " + p.stav_objektu);
    var tagy = ["#AlphaReality", "#reality", p.transakcia === "prenajom" ? "#prenajom" : "#predaj", "#" + String(p.obec || "Spis").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z]/g, ""),
      { byty: "#byt", domy: "#rodinnydom", pozemky: "#pozemok", chaty: "#chata", garaze: "#garaz", priestory: "#priestory", objekty: "#objekt" }[p.kategoria] || "#nehnutelnost"];
    return "🏡 " + (p.transakcia === "prenajom" ? "NA PRENÁJOM" : "NA PREDAJ") + " – " + nazovPonuky(p) + "\n📍 " + [p.cast_obce, p.obec].filter(Boolean).join(", ") + "\n💰 " + cenaPonuky(p) +
      (par.length ? "\n\n" + par.join("\n") : "") + (p.intro ? "\n\n" + p.intro : "") + "\n\n👉 Fotky a detaily: " + verejnyOdkaz(p.id) +
      "\n📞 " + (mk.meno || "") + (mk.telefon ? ", " + mk.telefon : "") + "\n\n" + tagy.join(" ");
  }
  function nacitajObr(src) {
    return new Promise(function (ok) { if (!src) return ok(null); var i = new Image(); i.crossOrigin = "anonymous"; i.onload = function () { ok(i); }; i.onerror = function () { ok(null); }; i.src = src; });
  }
  async function kresliBanner(p, fmt, canvas) {
    var F = FORMATY.find(function (x) { return x[0] === fmt; }) || FORMATY[0], W = F[2], H = F[3];
    canvas.width = W; canvas.height = H;
    var g = canvas.getContext("2d"), mk = S.mById[p.makler_id] || S.me;
    var foto = await nacitajObr(fotkaUrl((p.fotky || [])[0])), logo = await nacitajObr(logoUrl());
    g.fillStyle = "#24282e"; g.fillRect(0, 0, W, H);
    var fotoH = fmt === "sirka" ? H : Math.round(H * (fmt === "story" ? 0.6 : 0.56));
    var fotoW = fmt === "sirka" ? Math.round(W * 0.58) : W;
    if (foto) { var k = Math.max(fotoW / foto.width, fotoH / foto.height), w = foto.width * k, h = foto.height * k; g.save(); g.beginPath(); g.rect(0, 0, fotoW, fotoH); g.clip(); g.drawImage(foto, (fotoW - w) / 2, (fotoH - h) / 2, w, h); g.restore(); }
    else { g.fillStyle = "#3a3324"; g.fillRect(0, 0, fotoW, fotoH); }
    var gr = g.createLinearGradient(0, 0, 0, 180); gr.addColorStop(0, "rgba(20,22,26,.65)"); gr.addColorStop(1, "rgba(20,22,26,0)"); g.fillStyle = gr; g.fillRect(0, 0, fotoW, 180);
    if (logo) { var lh = fmt === "sirka" ? 56 : 70, lw = lh * logo.width / logo.height; g.drawImage(logo, 36, 30, lw, lh); }
    var stitok = p.transakcia === "prenajom" ? "NA PRENÁJOM" : "NA PREDAJ";
    if (p.stav === "rezervovane") stitok = "REZERVOVANÉ"; else if (p.exkluzivne) stitok += " · EXKLUZÍVNE";
    g.font = "800 " + (fmt === "sirka" ? 26 : 32) + "px Montserrat, Arial, sans-serif"; var sw = g.measureText(stitok).width + 44;
    var sy = fmt === "sirka" ? H - 80 : fotoH - 30;
    var AKC = cssVar("--gold-strong"), NA_AKC = cssVar("--on-accent");
    g.fillStyle = AKC; g.fillRect(fmt === "sirka" ? 36 : 36, sy - 26, sw, 52); g.fillStyle = NA_AKC; g.textBaseline = "middle"; g.fillText(stitok, 58, sy);
    var x0 = fmt === "sirka" ? fotoW + 44 : 56, maxW = (fmt === "sirka" ? W - fotoW - 80 : W - 112), y = fmt === "sirka" ? 90 : fotoH + (fmt === "story" ? 110 : 80);
    function riadky(text, font, farba, vyska, max) {
      g.font = font; g.fillStyle = farba; g.textBaseline = "alphabetic";
      var slova = String(text).split(/\s+/), r = "", n = 0;
      for (var i = 0; i < slova.length; i++) {
        var t = r ? r + " " + slova[i] : slova[i];
        if (g.measureText(t).width > maxW && r) { g.fillText(r, x0, y); y += vyska; r = slova[i]; n++; if (n >= max - 1) { var zv = slova.slice(i + 1).length; if (zv) { while (g.measureText(r + " …").width > maxW && r.length) r = r.slice(0, -1); r += " …"; } break; } }
        else r = t;
      }
      g.fillText(r, x0, y); y += vyska;
    }
    var vel = fmt === "sirka" ? 1 : fmt === "story" ? 1.4 : 1.15;
    riadky(nazovPonuky(p), "800 " + Math.round(40 * vel) + "px Montserrat, Arial, sans-serif", "#ffffff", Math.round(50 * vel), fmt === "sirka" ? 3 : 2);
    y += 4; riadky("📍 " + [p.cast_obce, p.obec].filter(Boolean).join(", "), "500 " + Math.round(26 * vel) + "px 'Public Sans', Arial, sans-serif", "#c9c5bb", Math.round(40 * vel), 1);
    y += Math.round(14 * vel); riadky(cenaPonuky(p), "800 " + Math.round(54 * vel) + "px Montserrat, Arial, sans-serif", AKC, Math.round(64 * vel), 1);
    var par = [p.plocha_uzitkova ? nf.format(p.plocha_uzitkova) + " m²" : p.plocha_pozemku ? nf.format(p.plocha_pozemku) + " m²" : "", p.izby ? p.izby + " izby" : "", p.stav_objektu || ""].filter(Boolean).join("  ·  ");
    if (par) riadky(par, "600 " + Math.round(26 * vel) + "px 'Public Sans', Arial, sans-serif", "#e9e4d6", Math.round(40 * vel), 1);
    g.font = "600 " + Math.round(24 * vel) + "px 'Public Sans', Arial, sans-serif"; g.fillStyle = "#c9c5bb"; g.textBaseline = "alphabetic";
    g.fillText((mk.meno || "Alpha Reality") + (mk.telefon ? "  ·  " + mk.telefon : ""), x0, H - (fmt === "sirka" ? 40 : 54));
    g.fillStyle = AKC; g.fillRect(0, H - 10, W, 10);
  }
  function panelSiete(p) {
    var fmt = S.siteFmt || "stvorec";
    return '<div class="pd-panel" id="pd-siete"><h4>📣 Sociálne siete</h4><div class="seg" role="group">' + FORMATY.map(function (f) {
      return '<button type="button" data-sfmt="' + f[0] + '" aria-pressed="' + (fmt === f[0]) + '" title="' + esc(f[4]) + '">' + esc(f[1]) + "</button>"; }).join("") + "</div>" +
      '<div class="siete-grid"><div class="siete-nahlad"><canvas id="banner" aria-label="Náhľad banneru"></canvas></div><div class="siete-text">' +
      '<label class="field"><span>Text príspevku</span><textarea id="siete-text" rows="11">' + esc(textNaSiete(p)) + "</textarea></label>" +
      '<div class="pd-zdiel-btns"><button class="btn primary" type="button" data-siete="stiahnut">⬇️ Stiahnuť obrázok</button><button class="btn" type="button" data-siete="text">Kopírovať text</button>' +
      '<a class="btn" href="https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(verejnyOdkaz(p.id)) + '" target="_blank" rel="noopener">Facebook</a>' +
      '<a class="btn" href="https://www.linkedin.com/sharing/share-offsite/?url=' + encodeURIComponent(verejnyOdkaz(p.id)) + '" target="_blank" rel="noopener">LinkedIn</a>' +
      (navigator.canShare ? '<button class="btn" type="button" data-siete="zdielat">📤 Instagram a iné</button>' : "") + "</div>" +
      '<p class="meta">Banner s logom: stiahnite obrázok a pridajte ho ručne (na mobile cez „Instagram a iné“). Fotky ponuky zverejníte jedným klikom nižšie.</p></div></div>' + blokPriamo(p) + "</div>";
  }
  function napojSiete(p) {
    var c = $("#banner"); if (!c) return;
    kresliBanner(p, S.siteFmt || "stvorec", c);
    napojPriamo(p);
    document.querySelectorAll("[data-sfmt]").forEach(function (b) { b.onclick = function () { S.siteFmt = b.dataset.sfmt; document.querySelectorAll("[data-sfmt]").forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); }); kresliBanner(p, S.siteFmt, c); }; });
    document.querySelectorAll("[data-siete]").forEach(function (b) {
      b.onclick = function () {
        var a = b.dataset.siete, nazovSub = "ponuka-" + (p.cislo || p.id) + "-" + (S.siteFmt || "stvorec") + ".png";
        if (a === "text") return kopiruj($("#siete-text").value, "Text príspevku je skopírovaný.");
        c.toBlob(function (blob) {
          if (!blob) return toast("Obrázok sa nepodarilo vytvoriť (fotka z iného webu).", true);
          if (a === "stiahnut") { var l = document.createElement("a"); l.href = URL.createObjectURL(blob); l.download = nazovSub; document.body.appendChild(l); l.click(); l.remove(); return; }
          var subor = new File([blob], nazovSub, { type: "image/png" });
          if (navigator.canShare && navigator.canShare({ files: [subor] })) navigator.share({ files: [subor], text: $("#siete-text").value }).catch(function () {});
          else toast("Zdieľanie obrázka tento prehliadač nepodporuje – stiahnite ho.", true);
        }, "image/png");
      };
    });
  }

  // ------------------------------------------------------------ volanie serverových funkcií (prihlásený maklér)
  async function volajFunkciu(nazov, telo) {
    var ses = (await sb.auth.getSession()).data.session;
    if (!ses) { prihlasenieVyprsalo(); throw new Error("Prihlásenie vypršalo – prihláste sa znova."); }
    var r = await fetch(CFG.supabaseUrl + "/functions/v1/" + nazov, { method: "POST",
      headers: { "Content-Type": "application/json", apikey: CFG.supabaseKey, Authorization: "Bearer " + ses.access_token }, body: JSON.stringify(telo || {}) });
    var d = {};
    try { d = await r.json(); } catch (e) { /* prázdna odpoveď */ }
    if (!r.ok) throw new Error(d.chyba || ("Chyba servera (" + r.status + ")"));
    return d;
  }
  function eurS(n) { return nf.format(Math.round(Number(n) || 0)) + " €"; }
  function dnesIso() { var d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); }
  function otvorPonuku(id) {
    S.tab = "nehnutelnosti"; S.ponukaEdit = null; S.ponukaExport = false; S.ponukaDetail = Number(id); S.pdPanel = null;
    history.pushState({ tab: "nehnutelnosti", detail: S.ponukaDetail }, "", "#nehnutelnosti"); vykresli(); window.scrollTo(0, 0);
  }

  // ------------------------------------------------------------ EXPORT DO REALSOFTU (United Classifieds → Nehnuteľnosti.sk, Reality.sk, TopReality.sk…)
  var UC_TEREN = [[398, "Rovina"], [399, "Prevažne rovný"], [396, "Mierne svahovitý"], [397, "Svahovitý"], [401, "Strmý svah"], [400, "Terasovitý"], [402, "Iný"]];
  function blokUc() {
    return '<div class="exp-blok uc-blok" id="uc-blok"><h4>🏢 Realsoft → Nehnuteľnosti.sk, Reality.sk, TopReality.sk</h4>' +
      '<p class="meta">Ponuky posielame cez United Classifieds priamo do Realsoftu a odtiaľ na portály. UC si súbor s ponukami stiahne samo každých 12 hodín – nič neodosielate ručne. ' +
      "Posielajú sa aktívne a rezervované ponuky bez chýb; predaná alebo neaktívna ponuka z portálov pri ďalšom stiahnutí sama zmizne.</p>" +
      '<div id="uc-obsah"><p class="meta">Načítavam…</p></div></div>';
  }
  async function nacitajUc() {
    var w = await Promise.all([rpc("kancelaria_udaje", {}), rpc("uc_feed_odkaz", { p_novy: false })]);
    S.uc = Object.assign(S.uc || {}, { kanc: w[0] || {}, token: w[1] });
  }
  function ucOdkaz() { return CFG.supabaseUrl + "/functions/v1/uc-feed?t=" + S.uc.token; }
  function ucMail() {
    var K = S.uc.kanc || {};
    var telo = "Dobrý deň,\n\nradi by sme posielali ponuky našej realitnej kancelárie do Realsoftu a na portály cez Váš import (Realsoft Import API v1).\n\n" +
      "Súbor s ponukami (JSON vo formáte OfficeData, aktualizuje sa priebežne):\n" + ucOdkaz() + "\n\n" +
      "Kancelária: " + (K.nazov || "") + (K.ico ? ", IČO " + K.ico : "") + "\n" + [K.ulica, K.cislo].filter(Boolean).join(" ") + ", " + [K.psc, K.mesto].filter(Boolean).join(" ") + "\n" +
      "Kontakt: " + [K.kontakt, K.telefon, K.email].filter(Boolean).join(", ") + "\n\n" +
      "Súbor sme overili cez Vaše validačné rozhranie. Prosím o zaregistrovanie importu a informáciu, čo ešte potrebujete (prístupové údaje, zapnutie portálov).\n\nĎakujem,\n" + podpis();
    return "mailto:info@unitedclassifieds.sk?subject=" + encodeURIComponent("Import ponúk – " + (K.nazov || "realitná kancelária") + " (Realsoft Import API v1)") + "&body=" + encodeURIComponent(telo);
  }
  function vykresliUc() {
    var el = $("#uc-obsah"); if (!el) return;
    if (!S.uc || !S.uc.token) {
      el.innerHTML = '<p class="meta">Načítavam…</p>';
      nacitajUc().then(vykresliUc, function (e) { var x = $("#uc-obsah"); if (x) x.innerHTML = '<p class="zle-text">' + esc(chybaText(e)) + "</p>"; });
      return;
    }
    var K = S.uc.kanc || {}, kompletne = ["nazov", "telefon", "email", "mesto", "psc", "ulica", "cislo"].every(function (k) { return K[k]; });
    var POLIA = [["nazov", "Názov kancelárie", "Alpha Reality"], ["kontakt", "Kontaktná osoba", ""], ["telefon", "Telefón", ""], ["email", "Email", ""], ["ulica", "Ulica", ""], ["cislo", "Číslo domu", ""],
      ["mesto", "Mesto", ""], ["psc", "PSČ", ""], ["ico", "IČO (nepovinné)", ""]];
    el.innerHTML = '<ol class="uc-kroky">' +
      '<li><details' + (kompletne ? "" : " open") + '><summary><b>Údaje kancelárie</b> ' + (kompletne ? '<span class="chip won">vyplnené</span>' : '<span class="chip maybe">doplňte</span>') + "</summary>" +
        '<form id="f-kanc"><div class="form-grid">' + POLIA.map(function (x) {
          return '<label class="field"><span>' + x[1] + '</span><input name="' + x[0] + '" value="' + esc(K[x[0]] || "") + '" placeholder="' + esc(x[2]) + '"' + (x[0] === "email" ? ' type="email"' : x[0] === "telefon" ? ' type="tel"' : "") + "></label>";
        }).join("") + '</div><div class="form-actions"><button class="btn primary" type="submit">Uložiť údaje kancelárie</button></div></form></details></li>' +
      '<li><b>Skontrolovať ponuky</b><p class="meta">Overí každú ponuku podľa pravidiel Realsoftu a celý súbor pošle na skúšobné overenie do United Classifieds. Nič sa tým nezverejní.</p>' +
        '<button class="btn primary" type="button" data-uc="kontrola">🔍 Skontrolovať ponuky</button><div id="uc-vysledok">' + (S.uc.vysledok ? ucVysledokHtml() : "") + "</div></li>" +
      '<li><b>Odkaz pre United Classifieds</b><p class="meta">Tento tajný odkaz pošlete do UC. Kto ho má, vidí verejné údaje ponúk – inde ho nezverejňujte.</p>' +
        '<div class="pd-odkaz"><input type="text" readonly value="' + esc(ucOdkaz()) + '" aria-label="Odkaz pre UC"><button class="btn" type="button" data-uc="kopiruj">Kopírovať</button>' +
        '<button class="btn ghost" type="button" data-uc="novy">Nový odkaz</button></div></li>' +
      '<li><b>Napísať do UC</b><p class="meta">Pošlite im odkaz a požiadajte o zaregistrovanie importu. Pridelia prístup a zapnú posielanie na portály – stačí raz.</p>' +
        '<a class="btn" href="' + esc(ucMail()) + '">✉️ Napísať na info@unitedclassifieds.sk</a></li></ol>';
    napojUc();
  }
  function ucVysledokHtml() {
    var V = S.uc.vysledok; if (!V) return "";
    var zle = V.vysledky.filter(function (x) { return x.chyby.length; }), ok = V.vysledky.length - zle.length;
    var h = '<div class="uc-suhrn"><span class="chip won">✅ ' + ok + " " + (ok === 1 ? "ponuka pripravená" : ok >= 2 && ok <= 4 ? "ponuky pripravené" : "ponúk pripravených") + "</span>" +
      (zle.length ? '<span class="chip lost">⚠️ ' + zle.length + " s chybou – neodošle sa</span>" : "") + "</div>";
    if (V.problemyKancelarie.length) h += '<div class="note">' + V.problemyKancelarie.map(esc).join("<br>") + "</div>";
    if (V.overenie) h += V.overenie.ok ? '<div class="note uc-ok">✅ United Classifieds súbor overili – formát je v poriadku.</div>' :
      '<div class="note">❌ United Classifieds hlásia chybu (' + esc(V.overenie.status) + '):<pre class="uc-chyba">' +
        esc((typeof V.overenie.odpoved === "string" ? V.overenie.odpoved : JSON.stringify(V.overenie.odpoved, null, 1)).slice(0, 3000)) + "</pre></div>";
    else if (!V.pocet) h += '<p class="meta">Zatiaľ nie je čo overiť – žiadna ponuka nie je pripravená.</p>';
    var zoz = V.vysledky.slice().sort(function (a, b) { return b.chyby.length - a.chyby.length || b.upozornenia.length - a.upozornenia.length; });
    h += '<div class="uc-ponuky">' + zoz.map(function (x) {
      var p = (S.ponuky || []).find(function (q) { return q.id === x.id; }) || {};
      var ulicaVolba = x.region_id && (p.uc_ulica_id || x.chyby.some(function (c) { return /Ulica|ulice/.test(c); }));
      return '<div class="uc-p' + (x.chyby.length ? " zle" : "") + '"><div class="uc-p-hl"><button type="button" class="linka" data-ponuka-otvor="' + x.id + '"><b>' + esc(x.nazov) + "</b></button>" +
        '<span class="meta">' + esc([x.ulica, x.obec].filter(Boolean).join(", ")) + (x.ulica_uc ? " → v Realsofte: " + esc(x.ulica_uc) : "") + "</span>" +
        (x.chyby.length ? '<span class="chip lost">neodošle sa</span>' : '<span class="chip won">OK</span>') + "</div>" +
        (x.chyby.length ? '<ul class="uc-chyby">' + x.chyby.map(function (c) { return "<li>" + esc(c) + "</li>"; }).join("") + "</ul>" : "") +
        (x.upozornenia.length ? '<ul class="uc-upoz">' + x.upozornenia.map(function (c) { return "<li>" + esc(c) + "</li>"; }).join("") + "</ul>" : "") +
        '<div class="uc-p-volby">' +
          (ulicaVolba ? '<label class="field"><span>Ulica v Realsofte</span><select data-uc-ulica="' + x.id + '" data-region="' + x.region_id + '"><option value="">načítavam…</option></select></label>' : "") +
          (x.potrebuje_teren ? '<label class="field"><span>Terén pozemku</span><select data-uc-teren="' + x.id + '"><option value="">— vyberte —</option>' + UC_TEREN.map(function (t) {
            return '<option value="' + t[0] + '"' + (Number(x.teren) === t[0] ? " selected" : "") + ">" + t[1] + "</option>"; }).join("") + "</select></label>" : "") +
          '<label class="toggle"><input type="checkbox" data-uc-export="' + x.id + '" checked> Posielať do Realsoftu</label></div></div>';
    }).join("") + "</div>";
    var vyn = (S.ponuky || []).filter(function (p) { return (p.stav === "aktivne" || p.stav === "rezervovane") && p.uc_export === false; });
    if (vyn.length) h += '<h5 class="uc-vyn-n">Vynechané z exportu (' + vyn.length + ')</h5><div class="uc-ponuky">' + vyn.map(function (p) {
      return '<div class="uc-p vyn"><div class="uc-p-hl"><button type="button" class="linka" data-ponuka-otvor="' + p.id + '"><b>' + esc(nazovPonuky(p)) + '</b></button><span class="meta">' + esc(p.obec || "") + "</span></div>" +
        '<label class="toggle"><input type="checkbox" data-uc-export="' + p.id + '"> Posielať do Realsoftu</label></div>';
    }).join("") + "</div>";
    return h;
  }
  async function uliceUc(region) {
    S.ucUlice = S.ucUlice || {};
    if (!S.ucUlice[region]) {
      var r = await sb.from("uc_ulica").select("street_id, nazov").eq("region_id", region).order("nazov").limit(1000);
      if (r.error) throw r.error;
      S.ucUlice[region] = r.data;
    }
    return S.ucUlice[region];
  }
  function napojUc() {
    var el = $("#uc-obsah"); if (!el) return;
    var f = $("#f-kanc");
    if (f) f.onsubmit = async function (e) {
      e.preventDefault();
      var d = {}; new FormData(f).forEach(function (v, k) { d[k] = v; });
      try { S.uc.kanc = await rpc("ulozit_kancelariu", { p: d }); toast("🏢 Údaje kancelárie sú uložené."); vykresliUc(); }
      catch (err) { toast(chybaText(err), true); }
    };
    el.querySelectorAll("[data-uc]").forEach(function (b) {
      b.onclick = async function () {
        var a = b.dataset.uc;
        if (a === "kopiruj") return kopiruj(ucOdkaz(), "Odkaz pre UC je skopírovaný.");
        if (a === "novy") {
          if (!confirm2("Vytvoriť nový odkaz? Starý prestane fungovať a nový treba poslať do United Classifieds.")) return;
          try { S.uc.token = await rpc("uc_feed_odkaz", { p_novy: true }); vykresliUc(); toast("Nový odkaz je pripravený – pošlite ho do UC."); }
          catch (err) { toast(chybaText(err), true); }
          return;
        }
        if (a === "kontrola") {
          b.disabled = true; b.textContent = "Kontrolujem…";
          try { S.uc.vysledok = await volajFunkciu("uc-feed", { akcia: "kontrola" }); var v = $("#uc-vysledok"); if (v) { v.innerHTML = ucVysledokHtml(); napojUc(); } }
          catch (err) { toast(chybaText(err), true); }
          b.disabled = false; b.textContent = "🔍 Skontrolovať ponuky";
        }
      };
    });
    el.querySelectorAll("[data-ponuka-otvor]").forEach(function (b) { b.onclick = function () { otvorPonuku(b.dataset.ponukaOtvor); }; });
    function ponuka(id) { return (S.ponuky || []).find(function (p) { return p.id === Number(id); }) || {}; }
    el.querySelectorAll("[data-uc-ulica]").forEach(function (s) {
      if (s.dataset.nap) return; s.dataset.nap = "1";
      var p = ponuka(s.dataset.ucUlica);
      uliceUc(Number(s.dataset.region)).then(function (U) {
        s.innerHTML = '<option value="">— vyberte —</option>' + U.map(function (u) { return '<option value="' + u.street_id + '"' + (p.uc_ulica_id === u.street_id ? " selected" : "") + ">" + esc(u.nazov) + "</option>"; }).join("");
        if (!U.length) s.innerHTML = '<option value="">obec nemá v Realsofte ulice</option>';
      }, function (e) { s.innerHTML = '<option value="">' + esc(chybaText(e)) + "</option>"; });
      s.onchange = async function () {
        var v = s.value ? Number(s.value) : null;
        try { await rpc("nastavit_uc_ponuky", { p_id: p.id, p_export: p.uc_export !== false, p_obec: p.uc_obec_id || null, p_cast: p.uc_cast_id || null, p_ulica: v }); p.uc_ulica_id = v; toast("Ulica je uložená – skontrolujte ponuky znova."); }
        catch (err) { toast(chybaText(err), true); }
      };
    });
    el.querySelectorAll("[data-uc-teren]").forEach(function (s) {
      s.onchange = async function () {
        var p = ponuka(s.dataset.ucTeren), v = s.value ? Number(s.value) : null;
        try { await rpc("nastavit_uc_teren", { p_id: p.id, p_teren: v }); p.uc_teren = v; toast("Terén je uložený."); }
        catch (err) { toast(chybaText(err), true); }
      };
    });
    el.querySelectorAll("[data-uc-export]").forEach(function (c) {
      c.onchange = async function () {
        var p = ponuka(c.dataset.ucExport);
        try { await rpc("nastavit_uc_ponuky", { p_id: p.id, p_export: c.checked, p_obec: p.uc_obec_id || null, p_cast: p.uc_cast_id || null, p_ulica: p.uc_ulica_id || null }); p.uc_export = c.checked;
          toast(c.checked ? "Ponuka sa bude posielať do Realsoftu." : "Ponuka sa do Realsoftu posielať nebude."); }
        catch (err) { toast(chybaText(err), true); c.checked = !c.checked; }
      };
    });
  }

  // ------------------------------------------------------------ PRIAMO NA FACEBOOK A INSTAGRAM (cez scenár Make)
  function igSedi(f) { return !f || !f.w || !f.h || (f.w / f.h >= 0.8 && f.w / f.h <= 1.91); }
  function blokPriamo(p) {
    if (!(admin() || p.makler_id === S.me.id)) return "";
    if (!(p.stav === "aktivne" || p.stav === "rezervovane")) return '<div class="siete-priamo"><h5>🚀 Zverejniť na Facebook a Instagram kancelárie</h5><p class="meta">Zverejniť sa dá len aktívna alebo rezervovaná ponuka.</p></div>';
    var F = p.fotky || [];
    if (!S.sieteFotky || S.sieteFotky.id !== p.id) S.sieteFotky = { id: p.id, v: F.slice(0, 10).map(function (_, i) { return i; }) };
    var V = S.sieteFotky.v;
    return '<div class="siete-priamo" id="siete-priamo"><h5>🚀 Zverejniť na Facebook a Instagram kancelárie</h5>' +
      '<p class="meta">Príspevok s textom vyššie a vybranými fotkami pošleme na Facebook stránku a Instagram kancelárie. Nič sa nezverejní samo – len po kliknutí na tlačidlo.</p>' +
      '<div class="siete-volby"><label class="toggle"><input type="checkbox" id="sp-fb" checked> Facebook</label><label class="toggle"><input type="checkbox" id="sp-ig" checked> Instagram</label></div>' +
      (F.length ? '<div class="sp-fotky">' + F.map(function (f, i) {
        return '<label class="sp-foto' + (igSedi(f) ? "" : " vyska") + '"' + (igSedi(f) ? "" : ' title="Na Instagram nepôjde – fotka je na výšku"') + '><input type="checkbox" data-sp-foto="' + i + '"' + (V.indexOf(i) >= 0 ? " checked" : "") + ">" +
          '<img src="' + esc(fotkaUrl(f)) + '" alt="Fotka ' + (i + 1) + '" loading="lazy"><span class="sp-n">' + (i + 1) + "</span></label>";
      }).join("") + "</div>" : '<p class="meta">Ponuka nemá fotky – najprv ich pridajte.</p>') +
      '<p class="meta" id="sp-info"></p><div class="form-actions"><button class="btn primary" type="button" id="sp-posli"' + (F.length ? "" : " disabled") + ">🚀 Zverejniť teraz</button></div>" +
      '<div id="sp-historia"></div></div>';
  }
  function napojPriamo(p) {
    var box = $("#siete-priamo"); if (!box) return;
    function info() {
      var V = S.sieteFotky.v, ig = V.filter(function (i) { return igSedi((p.fotky || [])[i]); }).length, i = $("#sp-info");
      if (i) i.textContent = "Vybrané fotky: " + V.length + " z najviac 10" + ($("#sp-ig").checked && ig < V.length ? " · na Instagram pôjde " + ig + " (fotky na výšku Instagram neprijme)" : "") + ".";
    }
    box.querySelectorAll("[data-sp-foto]").forEach(function (c) {
      c.onchange = function () {
        var i = Number(c.dataset.spFoto), V = S.sieteFotky.v;
        if (c.checked) { if (V.length >= 10) { c.checked = false; return toast("Najviac 10 fotiek v jednom príspevku.", true); } V.push(i); V.sort(function (a, b) { return a - b; }); }
        else V.splice(V.indexOf(i), 1);
        info();
      };
    });
    $("#sp-ig").onchange = info; info();
    $("#sp-posli").onclick = async function () {
      var siete = [], b = this;
      if ($("#sp-fb").checked) siete.push("fb"); if ($("#sp-ig").checked) siete.push("ig");
      if (!siete.length) return toast("Vyberte Facebook alebo Instagram.", true);
      if (!S.sieteFotky.v.length) return toast("Vyberte aspoň jednu fotku.", true);
      if (siete.indexOf("ig") >= 0 && !S.sieteFotky.v.some(function (i) { return igSedi(p.fotky[i]); })) return toast("Na Instagram vyberte aspoň jednu fotku na šírku alebo štvorcovú.", true);
      if (!confirm2("Zverejniť príspevok teraz na " + siete.map(nazovSiete).join(" a ") + " kancelárie?")) return;
      b.disabled = true; b.textContent = "Odosielam…";
      try {
        var d = await volajFunkciu("siete", { ponuka_id: p.id, siete: siete, text: $("#siete-text").value, fotky: S.sieteFotky.v });
        toast("🚀 Odoslané – príspevok sa zverejňuje, zvyčajne do minúty.");
        sledujPrispevok(p, d.zaznam);
      } catch (err) { toast(chybaText(err), true); }
      b.disabled = false; b.textContent = "🚀 Zverejniť teraz";
    };
    nacitajPrispevky(p);
  }
  function nazovSiete(s) { return s === "fb" ? "Facebook" : "Instagram"; }
  async function nacitajPrispevky(p) {
    var r = await sb.from("prispevky_siete").select("id, siete, stav, vysledok, makler_id, vytvorene").eq("nehnutelnost_id", p.id).order("id", { ascending: false }).limit(5);
    var el = $("#sp-historia"); if (r.error) return [];
    if (el) el.innerHTML = r.data.length ? '<h6>Odoslané príspevky</h6><ul class="sp-hist">' + r.data.map(function (z) {
      return "<li><span class=\"meta\">" + datum(z.vytvorene, true) + " · " + esc(meno(z.makler_id)) + "</span> " + z.siete.map(function (s) {
        var v = (z.vysledok || {})[s];
        if (z.stav === "chyba" || (v && !v.ok)) return '<span class="chip lost">' + nazovSiete(s) + " ✕</span>";
        return v ? '<span class="chip won">' + nazovSiete(s) + " ✓</span>" : '<span class="chip maybe">' + nazovSiete(s) + " ⏳</span>";
      }).join(" ") + "</li>";
    }).join("") + "</ul>" : "";
    return r.data;
  }
  function sledujPrispevok(p, id) {
    var n = 0; clearInterval(S.spT);
    nacitajPrispevky(p);
    S.spT = setInterval(async function () {
      n++;
      if (n > 45 || !$("#sp-historia")) return clearInterval(S.spT);
      var z = (await nacitajPrispevky(p)).find(function (x) { return x.id === id; });
      if (!z || !z.siete.every(function (s) { return (z.vysledok || {})[s]; })) return;
      clearInterval(S.spT);
      var zle = z.siete.filter(function (s) { return !z.vysledok[s].ok; });
      if (zle.length) toast("Na " + zle.map(nazovSiete).join(" a ") + " sa príspevok nepodarilo zverejniť. Skúste to znova; ak to nepôjde, treba v Make obnoviť prepojenie s Facebookom.", true);
      else { toast("✅ Príspevok je zverejnený."); konfety({ pocet: 70 }); }
    }, 4000);
  }

  // ------------------------------------------------------------ PROVÍZIE A FAKTURÁCIA
  async function nacitajProvizie() { S.provizie = await vsetkyRiadky("provizie", "*", "id"); }
  function stavProv(x) {
    if (!x.zaplatene_klientom) {
      if (x.faktura_splatnost && x.faktura_splatnost < dnesIso()) return ["caka", "po splatnosti", "lost"];
      return ["caka", x.faktura_cislo || x.faktura_vystavena ? "čaká na platbu" : "bez faktúry", x.faktura_cislo || x.faktura_vystavena ? "maybe" : "na"];
    }
    if (Number(x.podiel_maklera) > 0 && !x.vyplatene_maklerovi) return ["vyplatit", admin() ? "vyplatiť maklérovi" : "čaká na vyplatenie", "maybe"];
    return ["vybavene", "vybavené", "won"];
  }
  function vykresliProvizie() {
    var el = $("#obsah"); if (!el) return;
    if (!S.provizie) {
      el.innerHTML = '<div class="box"><p class="meta">Načítavam provízie…</p></div>';
      nacitajProvizie().then(vykresliProvizie, function (e) { S.provizie = []; toast(chybaText(e), true); vykresliProvizie(); });
      return;
    }
    if (S.provForm && admin()) return vykresliFormProvizie();
    var A = admin(), F = S.provF = S.provF || { rok: String(new Date().getFullYear()), kto: "", stav: "" };
    var roky = {}; roky[new Date().getFullYear()] = 1; S.provizie.forEach(function (x) { roky[String(x.datum_obchodu).slice(0, 4)] = 1; });
    var zoz = S.provizie.filter(function (x) { return (!F.rok || String(x.datum_obchodu).slice(0, 4) === F.rok) && (!F.kto || x.makler_id === F.kto); });
    var s = { celkom: 0, zapl: 0, caka: 0, po: 0, vypl: 0, podiel: 0, kanc: 0 }, pm = {};
    zoz.forEach(function (x) {
      var c = Number(x.provizia_celkom) || 0, m = Number(x.podiel_maklera) || 0, st = stavProv(x);
      s.celkom += c; s.podiel += m; s.kanc += c - m;
      if (x.zaplatene_klientom) s.zapl += c; else { s.caka += c; if (st[1] === "po splatnosti") s.po += c; }
      if (m && !x.vyplatene_maklerovi) s.vypl += m;
      var k = x.makler_id || "-"; pm[k] = pm[k] || { n: 0, c: 0, m: 0, v: 0 }; pm[k].n++; pm[k].c += c; pm[k].m += m; if (m && !x.vyplatene_maklerovi) pm[k].v += m;
    });
    var poc = { caka: 0, vyplatit: 0, vybavene: 0 }; zoz.forEach(function (x) { poc[stavProv(x)[0]]++; });
    var zobraz = zoz.filter(function (x) { return !F.stav || stavProv(x)[0] === F.stav; })
      .sort(function (a, b) { return String(b.datum_obchodu).localeCompare(String(a.datum_obchodu)) || b.id - a.id; });
    function dl(n, v, pod, tr) { return '<div class="prov-dl' + (tr ? " " + tr : "") + '"><span class="meta">' + n + "</span><b>" + v + "</b>" + (pod ? '<small class="meta">' + pod + "</small>" : "") + "</div>"; }
    var h = '<div class="box prov-box"><div class="vykon-hlava"><h3>💶 ' + (A ? "Provízie a fakturácia" : "Moje provízie") + "</h3>" +
      '<div class="nehn-akcie"><button class="btn" type="button" data-prov="csv">⬇️ Export pre účtovníčku</button>' + (A ? '<button class="btn primary" type="button" data-prov="novy">+ Zapísať obchod</button>' : "") + "</div></div>" +
      '<p class="meta">' + (A ? "Každý uzavretý obchod: provízia kancelárie, faktúra klientovi, kedy zaplatil a koľko patrí maklérovi. Maklér vidí len svoje obchody." :
        "Prehľad vašich obchodov a podielov. Zapisuje ich administrátor – ak niečo chýba, napíšte mu.") + "</p>" +
      '<div class="nehn-filtre"><select id="prov-rok" aria-label="Rok">' + '<option value="">Všetky roky</option>' + Object.keys(roky).sort().reverse().map(function (r) { return '<option value="' + r + '"' + (F.rok === r ? " selected" : "") + ">" + r + "</option>"; }).join("") + "</select>" +
      (A ? '<select id="prov-kto" aria-label="Maklér"><option value="">Všetci makléri</option>' + S.makleri.map(function (m) { return '<option value="' + m.id + '"' + (F.kto === m.id ? " selected" : "") + ">" + esc(m.meno || m.email) + "</option>"; }).join("") + "</select>" : "") +
      '<div class="seg" role="group">' + [["", "Všetky", zoz.length], ["caka", "Čaká na platbu", poc.caka], ["vyplatit", A ? "Vyplatiť" : "Na vyplatenie", poc.vyplatit], ["vybavene", "Vybavené", poc.vybavene]].map(function (x) {
        return '<button type="button" data-provf="' + x[0] + '" aria-pressed="' + (F.stav === x[0]) + '">' + x[1] + ' <span class="n">' + x[2] + "</span></button>"; }).join("") + "</div></div>" +
      '<div class="prov-dlazdice">' + dl("Provízie spolu", eurS(s.celkom), zoz.length + (zoz.length === 1 ? " obchod" : zoz.length >= 2 && zoz.length <= 4 ? " obchody" : " obchodov")) +
        dl("Zaplatené klientmi", eurS(s.zapl)) + dl("Čaká na platbu", eurS(s.caka), s.po ? eurS(s.po) + " po splatnosti" : "", s.po ? "zle" : "") +
        (A ? dl("Vyplatiť maklérom", eurS(s.vypl)) + dl("Zostáva kancelárii", eurS(s.kanc)) : dl("Môj podiel", eurS(s.podiel)) + dl("Ešte mám dostať", eurS(s.vypl))) + "</div>";
    if (A && !F.kto && Object.keys(pm).length > 1) h += '<div class="prov-tab-wrap"><table class="prov-tab"><thead><tr><th>Maklér</th><th>Obchody</th><th>Provízia</th><th>Podiel makléra</th><th>Nevyplatené</th></tr></thead><tbody>' +
      Object.keys(pm).sort(function (a, b) { return pm[b].c - pm[a].c; }).map(function (k) { var x = pm[k];
        return "<tr><td>" + (k !== "-" ? avatar(k, 22) + " " + esc(meno(k)) : "—") + "</td><td>" + x.n + "</td><td>" + eurS(x.c) + "</td><td>" + eurS(x.m) + "</td><td>" + (x.v ? "<b>" + eurS(x.v) + "</b>" : "—") + "</td></tr>"; }).join("") + "</tbody></table></div>";
    if (!zobraz.length) h += '<div class="prazdne"><span class="dl-ikona velka">' + ikona("euro") + "</span><b>" + (S.provizie.length ? "Nič tu nie je" : "Zatiaľ žiadne obchody") + '</b><span class="meta">' +
      (A ? "Po predaji zapíšte obchod tlačidlom „Zapísať obchod“ alebo priamo v detaile predanej ponuky." : "Keď administrátor zapíše váš obchod, uvidíte ho tu.") + "</span></div>";
    else h += '<div class="prov-zoz">' + zobraz.map(function (x) {
      var st = stavProv(x), p = x.nehnutelnost_id && (S.ponuky || []).find(function (q) { return q.id === x.nehnutelnost_id; });
      return '<div class="prov-r"><div class="prov-r-hl"><span class="meta">' + datum(x.datum_obchodu) + "</span><b>" + esc(x.nazov) + "</b>" +
        (x.nehnutelnost_id ? '<button type="button" class="linka" data-ponuka-otvor="' + x.nehnutelnost_id + '">' + (p ? esc(p.cislo ? "č. " + p.cislo : "ponuka") : "ponuka") + " ›</button>" : "") +
        '<span class="chip ' + st[2] + '">' + st[1] + "</span></div>" +
        '<div class="prov-r-cisla"><span>' + (x.makler_id ? avatar(x.makler_id, 20) + " " + esc(meno(x.makler_id)) : '<span class="meta">bez makléra</span>') + "</span>" +
        "<span>Provízia <b>" + eurS(x.provizia_celkom) + "</b></span><span>Podiel makléra <b>" + eurS(x.podiel_maklera) + "</b></span>" +
        (x.faktura_cislo || x.faktura_splatnost ? '<span class="meta">Faktúra ' + esc(x.faktura_cislo || "") + (x.faktura_splatnost ? " · splatná " + datum(x.faktura_splatnost) : "") + "</span>" : "") +
        (x.zaplatene_klientom ? '<span class="meta">zaplatené ' + datum(x.zaplatene_klientom) + "</span>" : "") + (x.vyplatene_maklerovi ? '<span class="meta">vyplatené ' + datum(x.vyplatene_maklerovi) + "</span>" : "") + "</div>" +
        (x.poznamka ? '<div class="meta prov-pozn">' + esc(x.poznamka) + "</div>" : "") +
        (A ? '<div class="prov-r-akcie">' + (!x.zaplatene_klientom ? '<button class="btn" type="button" data-prov-zapl="' + x.id + '">✓ Klient zaplatil</button>' : "") +
          (x.zaplatene_klientom && Number(x.podiel_maklera) > 0 && !x.vyplatene_maklerovi ? '<button class="btn" type="button" data-prov-vypl="' + x.id + '">✓ Vyplatené maklérovi</button>' : "") +
          '<button class="btn ghost" type="button" data-prov-upr="' + x.id + '">✏️ Upraviť</button></div>' : "") + "</div>";
    }).join("") + "</div>";
    el.innerHTML = h + "</div>";
    $("#prov-rok").onchange = function () { F.rok = this.value; vykresliProvizie(); };
    if ($("#prov-kto")) $("#prov-kto").onchange = function () { F.kto = this.value; vykresliProvizie(); };
    el.querySelectorAll("[data-provf]").forEach(function (b) { b.onclick = function () { F.stav = b.dataset.provf; vykresliProvizie(); }; });
    el.querySelectorAll("[data-ponuka-otvor]").forEach(function (b) { b.onclick = function () { otvorPonuku(b.dataset.ponukaOtvor); }; });
    el.querySelector('[data-prov="csv"]').onclick = function () { stiahniCsvProvizii(zobraz); };
    var nb = el.querySelector('[data-prov="novy"]'); if (nb) nb.onclick = function () { S.provForm = {}; vykresliProvizie(); window.scrollTo(0, 0); };
    el.querySelectorAll("[data-prov-upr]").forEach(function (b) { b.onclick = function () { S.provForm = Object.assign({}, S.provizie.find(function (x) { return x.id === Number(b.dataset.provUpr); })); vykresliProvizie(); window.scrollTo(0, 0); }; });
    function rychlo(attr, pole, sprava) {
      el.querySelectorAll("[" + attr + "]").forEach(function (b) {
        b.onclick = async function () {
          var x = S.provizie.find(function (y) { return y.id === Number(b.getAttribute(attr)); }), z = Object.assign({}, x); z[pole] = dnesIso();
          b.disabled = true;
          try { await rpc("ulozit_proviziu", { p: z }); x[pole] = z[pole]; toast(sprava); vykresliProvizie(); }
          catch (err) { toast(chybaText(err), true); b.disabled = false; }
        };
      });
    }
    rychlo("data-prov-zapl", "zaplatene_klientom", "💶 Zapísané: klient zaplatil.");
    rychlo("data-prov-vypl", "vyplatene_maklerovi", "💶 Zapísané: podiel je vyplatený.");
  }
  function stiahniCsvProvizii(riadky) {
    var H = ["Dátum obchodu", "Obchod", "Číslo ponuky", "Maklér", "Provízia €", "Podiel makléra €", "Kancelárii €", "Faktúra č.", "Vystavená", "Splatnosť", "Zaplatené klientom", "Vyplatené maklérovi", "Stav", "Poznámka"];
    function b(v) { v = v == null ? "" : String(v); return /[";\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
    function c(n) { return String(Math.round((Number(n) || 0) * 100) / 100).replace(".", ","); }
    var t = [H.join(";")].concat(riadky.map(function (x) {
      var p = x.nehnutelnost_id && (S.ponuky || []).find(function (q) { return q.id === x.nehnutelnost_id; });
      return [x.datum_obchodu, x.nazov, p ? p.cislo || p.id : "", x.makler_id ? meno(x.makler_id) : "", c(x.provizia_celkom), c(x.podiel_maklera), c((Number(x.provizia_celkom) || 0) - (Number(x.podiel_maklera) || 0)),
        x.faktura_cislo, x.faktura_vystavena, x.faktura_splatnost, x.zaplatene_klientom, x.vyplatene_maklerovi, stavProv(x)[1], x.poznamka].map(b).join(";");
    })).join("\r\n");
    var a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["﻿" + t], { type: "text/csv;charset=utf-8" }));
    a.download = "provizie-" + (S.provF.rok || "vsetko") + ".csv"; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
  }
  // predvyplnenie z ponuky: celková provízia a časť pre kanceláriu z interných údajov
  function proviziaZPonuky(p) {
    var I = (S.ponukyInt || {})[p.id] || {}, cena = Number(p.cena) || 0;
    function suma(v, typ) { v = Number(v) || 0; return typ === "pct" ? Math.round(cena * v) / 100 : v; }
    var c = suma(I.provizia, I.provizia_typ), rk = I.provizia_rk ? suma(I.provizia_rk, I.provizia_rk_typ) : null;
    return { nehnutelnost_id: p.id, nazov: nazovPonuky(p) + " – " + (p.transakcia === "prenajom" ? "prenájom" : "predaj"), makler_id: p.makler_id,
      provizia_celkom: c || "", podiel_maklera: rk !== null && c ? Math.max(0, Math.round((c - rk) * 100) / 100) : "" };
  }
  function vykresliFormProvizie() {
    var el = $("#obsah"), x = S.provForm;
    if (!S.ponuky) { el.innerHTML = '<div class="box"><p class="meta">Načítavam ponuky…</p></div>'; nacitajPonuky().then(vykresliFormProvizie, function () { S.ponuky = []; vykresliFormProvizie(); }); return; }
    var P = S.ponuky.filter(function (p) { return p.stav !== "koncept"; }).sort(function (a, b) { return (b.stav === "predane") - (a.stav === "predane") || String(b.upravene).localeCompare(String(a.upravene)); });
    function pole(k, n, typ, attr) { return '<label class="field"><span>' + n + '</span><input name="' + k + '" type="' + (typ || "text") + '" value="' + esc(x[k] == null ? "" : x[k]) + '"' + (attr || "") + "></label>"; }
    el.innerHTML = '<form class="box prov-form" id="f-prov" data-strazit><div class="pd-hlava"><button class="btn ghost" type="button" data-pf="spat">← Provízie</button></div>' +
      "<h3>" + (x.id ? "Upraviť obchod" : "Zapísať obchod") + "</h3>" +
      '<div class="form-grid"><label class="field"><span>Ponuka (nepovinné)</span><select name="nehnutelnost_id"><option value="">— bez ponuky —</option>' + P.map(function (p) {
        return '<option value="' + p.id + '"' + (Number(x.nehnutelnost_id) === p.id ? " selected" : "") + ">" + esc((p.cislo ? p.cislo + " · " : "") + nazovPonuky(p) + (p.stav === "predane" ? " (predané)" : "")) + "</option>"; }).join("") + "</select></label>" +
      pole("nazov", "Popis obchodu", "text", ' required maxlength="160" placeholder="napr. 3-izbový byt Mier – predaj"') +
      '<label class="field"><span>Maklér</span><select name="makler_id"><option value="">—</option>' + S.makleri.map(function (m) { return '<option value="' + m.id + '"' + (x.makler_id === m.id ? " selected" : "") + ">" + esc(m.meno || m.email) + "</option>"; }).join("") + "</select></label>" +
      pole("datum_obchodu", "Dátum obchodu", "date") + pole("provizia_celkom", "Provízia kancelárie (€)", "number", ' min="0" step="0.01" inputmode="decimal"') +
      '<label class="field"><span>Podiel makléra (€)</span><input name="podiel_maklera" type="number" min="0" step="0.01" inputmode="decimal" value="' + esc(x.podiel_maklera == null ? "" : x.podiel_maklera) + '">' +
        '<span class="prov-pct">' + [30, 40, 50, 60].map(function (n) { return '<button type="button" class="btn ghost" data-pct="' + n + '">' + n + " %</button>"; }).join("") + "</span></label>" +
      pole("faktura_cislo", "Číslo faktúry", "text", ' maxlength="40"') + pole("faktura_vystavena", "Faktúra vystavená", "date") + pole("faktura_splatnost", "Splatnosť faktúry", "date") +
      pole("zaplatene_klientom", "Klient zaplatil dňa", "date") + pole("vyplatene_maklerovi", "Vyplatené maklérovi dňa", "date") + "</div>" +
      '<label class="field"><span>Poznámka</span><textarea name="poznamka" rows="2" maxlength="1000">' + esc(x.poznamka || "") + "</textarea></label>" +
      '<p class="meta" id="prov-kanc"></p>' +
      '<div class="form-actions lepkave"><button class="btn ghost" type="button" data-pf="spat">Zrušiť</button>' +
      (x.id ? '<button class="btn ghost zle-text" type="button" data-pf="zmazat">Zmazať</button>' : "") + NEULOZENE + '<button class="btn primary ulozit" type="submit" data-ulozit>✓ Uložiť obchod</button></div></form>';
    var f = $("#f-prov");
    if (!x.datum_obchodu) f.datum_obchodu.value = dnesIso();
    function prepocitaj() { var c = Number(f.provizia_celkom.value) || 0, m = Number(f.podiel_maklera.value) || 0; $("#prov-kanc").textContent = c ? "Kancelárii zostáva " + eurS(c - m) + "." : ""; }
    f.provizia_celkom.oninput = prepocitaj; f.podiel_maklera.oninput = prepocitaj; prepocitaj();
    f.querySelectorAll("[data-pct]").forEach(function (b) { b.onclick = function () { f.podiel_maklera.value = Math.round((Number(f.provizia_celkom.value) || 0) * Number(b.dataset.pct)) / 100; prepocitaj(); }; });
    f.faktura_vystavena.onchange = function () { if (f.faktura_vystavena.value && !f.faktura_splatnost.value) { var d = new Date(f.faktura_vystavena.value + "T12:00:00"); d.setDate(d.getDate() + 14); f.faktura_splatnost.value = d.toISOString().slice(0, 10); } };
    f.nehnutelnost_id.onchange = function () {
      var p = S.ponuky.find(function (q) { return q.id === Number(f.nehnutelnost_id.value); }); if (!p) return;
      var z = proviziaZPonuky(p);
      if (!f.nazov.value) f.nazov.value = z.nazov;
      if (!f.makler_id.value && z.makler_id) f.makler_id.value = z.makler_id;
      if (!f.provizia_celkom.value && z.provizia_celkom) f.provizia_celkom.value = z.provizia_celkom;
      if (!f.podiel_maklera.value && z.podiel_maklera !== "") f.podiel_maklera.value = z.podiel_maklera;
      prepocitaj();
    };
    f.querySelectorAll('[data-pf="spat"]').forEach(function (b) { b.onclick = function () { if (!odistBezUlozenia()) return; S.provForm = null; vykresliProvizie(); }; });
    var zm = f.querySelector('[data-pf="zmazat"]');
    if (zm) zm.onclick = async function () {
      if (!confirm2("Zmazať tento obchod z prehľadu provízií?")) return;
      try { await rpc("zrusit_proviziu", { p_id: x.id }); S.provForm = null; await nacitajProvizie(); toast("Obchod je zmazaný."); vykresliProvizie(); }
      catch (err) { toast(chybaText(err), true); }
    };
    f.onsubmit = async function (e) {
      e.preventDefault();
      var d = { id: x.id || null }; new FormData(f).forEach(function (v, k) { d[k] = v; });
      var btn = f.querySelector('[type="submit"]'); btn.disabled = true;
      try { await rpc("ulozit_proviziu", { p: d }); S.provForm = null; await nacitajProvizie(); toast("💶 Obchod je uložený."); vykresliProvizie(); window.scrollTo(0, 0); }
      catch (err) { toast(chybaText(err), true); btn.disabled = false; }
    };
  }

  // ------------------------------------------------------------ HISTÓRIA ZMIEN
  var POLIA_HIST = { nazov: "Názov", cena: "Cena", stav: "Stav", popis: "Popis", intro: "Úvodný text", fotky: "Fotky", makler_id: "Maklér", typ: "Druh", kategoria: "Kategória", transakcia: "Predaj / prenájom",
    obec: "Obec", ulica: "Ulica", cast_obce: "Časť obce", okres: "Okres", kraj: "Kraj", plocha_uzitkova: "Úžitková plocha", plocha_pozemku: "Plocha pozemku", plocha_zastavana: "Zastavaná plocha", izby: "Izby",
    poschodie: "Poschodie", pocet_podlazi: "Počet podlaží", rok_vystavby: "Rok výstavby", vlastnictvo: "Vlastníctvo", stav_objektu: "Stav objektu", konstrukcia: "Konštrukcia", energ_certifikat: "Energetický certifikát",
    kurenie: "Kúrenie", vybavenie: "Vybavenie", orientacia: "Orientácia", exkluzivne: "Exkluzívne", specialne: "Štítky", zobrazit_cenu: "Zobraziť cenu", text_k_cene: "Text k cene", typ_ceny: "Typ ceny", video: "Video",
    virtualna_prehliadka: "Virtuálna prehliadka", lat: "Poloha", lon: "Poloha", cislo: "Číslo ponuky", cena_energie: "Cena energií", uc_export: "Export do Realsoftu", uc_ulica_id: "Ulica v Realsofte", uc_teren: "Terén pozemku",
    majitel_meno: "Majiteľ", majitel_telefon: "Telefón majiteľa", majitel_email: "Email majiteľa", zmluva: "Zmluva", zmluva_typ: "Typ zmluvy", zmluva_do: "Zmluva platí do", provizia: "Provízia", provizia_typ: "Provízia v",
    provizia_rk: "Provízia pre RK", provizia_rk_typ: "Provízia pre RK v", poznamka: "Poznámka", dokumenty: "Dokumenty", ulica_interna: "Presná adresa", report_tyzdenne: "Týždenný report",
    meno: "Meno", email: "Email", telefon: "Telefón", rola: "Rola", aktivny: "Aktívny", pristup: "Sekcie", vidi_podhodnotene: "Vidí podhodnotené", pohlavie: "Rod", oslovenie: "Oslovenie", narodeniny: "Narodeniny",
    nastup: "V tíme od", meniny_den: "Meniny", sms_sablona: "Text SMS", obce: "Moje obce", provizia_celkom: "Provízia", podiel_maklera: "Podiel makléra", faktura_cislo: "Číslo faktúry", faktura_vystavena: "Faktúra vystavená",
    faktura_splatnost: "Splatnosť", zaplatene_klientom: "Klient zaplatil", vyplatene_maklerovi: "Vyplatené maklérovi", datum_obchodu: "Dátum obchodu", zrusene: "Zmazané" };
  var SKRYT_HIST = ["id", "vytvorene", "vytvoril", "kancelaria", "nehnutelnost_id", "kluc", "upravil", "sprievodca_videny", "novinky_videne", "historia_cien", "uc_obec_id", "uc_cast_id", "lon", "zdroj_inzerat"];
  function hodnotaHist(k, v) {
    if (v === null || v === undefined || v === "") return "—";
    if (k === "makler_id") return meno(v);
    if (k === "stav" && STAVY_P[v]) return STAVY_P[v][0];
    if (k === "rola") return v === "admin" ? "administrátor" : "maklér";
    if (k === "uc_teren") { var t = UC_TEREN.find(function (x) { return x[0] === Number(v); }); return t ? t[1] : v; }
    if (typeof v === "boolean") return v ? "áno" : "nie";
    if (k === "fotky" || k === "dokumenty") return Array.isArray(v) ? v.length + (k === "fotky" ? (v.length === 1 ? " fotka" : v.length >= 2 && v.length <= 4 ? " fotky" : " fotiek") : (v.length === 1 ? " súbor" : " súbory")) : "zoznam";
    if (k === "lat") return "zmenená";
    if (k === "cena" || k === "provizia_celkom" || k === "podiel_maklera") return eurS(v);
    if (Array.isArray(v)) return v.join(", ") || "—";
    if (typeof v === "object") return "upravené";
    var s = String(v);
    if (/^[\[{]/.test(s)) return "upravené";
    if (/^\d{4}-\d{2}-\d{2}(T|$)/.test(s)) return datum(s, s.length > 10);
    return s.length > 140 ? s.slice(0, 140) + "…" : s;
  }
  function riadkyHist(zaznamy, nazovZaznamu) {
    var h = zaznamy.map(function (z) { return riadokHist(z, nazovZaznamu); }).join("");
    return h ? '<ol class="hist">' + h + "</ol>" : '<p class="meta">Zatiaľ žiadne zmeny.</p>';
  }
  function nazovZaznamuHist(z) {
    if (z.tabulka === "nehnutelnosti" || z.tabulka === "nehnutelnosti_interne") {
      var p = (S.ponuky || []).find(function (x) { return String(x.id) === z.zaznam_id; });
      return '<button type="button" class="linka" data-ponuka-otvor="' + esc(z.zaznam_id) + '">🏠 ' + esc(p ? nazovPonuky(p) : "ponuka " + z.zaznam_id) + (z.tabulka === "nehnutelnosti_interne" ? " (interné)" : "") + "</button>";
    }
    if (z.tabulka === "makleri") return '<span class="hist-co">👤 ' + esc(meno(z.zaznam_id) || "maklér") + "</span>";
    if (z.tabulka === "provizie") { var x = (S.provizie || []).find(function (y) { return String(y.id) === z.zaznam_id; }); return '<span class="hist-co">💶 ' + esc(x ? x.nazov : "obchod") + "</span>"; }
    return "";
  }
  function riadokHist(z, nazovZaznamu) {
    {
      var zm = Object.keys(z.zmeny || {}).filter(function (k) { return SKRYT_HIST.indexOf(k) < 0; });
      if (z.akcia === "zmena" && !zm.length) return "";
      var co = z.akcia === "vytvorenie" ? "vytvoril(a)" : z.akcia === "zmazanie" ? "zmazal(a)" : "upravil(a)";
      return '<li><div class="hist-hl">' + (z.kto ? avatar(z.kto, 22) : '<span class="hist-sys" aria-hidden="true">⚙️</span>') + "<b>" + esc(z.kto ? meno(z.kto) : "Systém") + "</b>" +
        '<span class="meta">' + co + "</span>" + (nazovZaznamu ? nazovZaznamu(z) : "") + '<span class="meta hist-kedy">' + datum(z.kedy, true) + "</span></div>" +
        (zm.length ? '<ul class="hist-zmeny">' + zm.map(function (k) {
          var d = z.zmeny[k] || [];
          return "<li><span>" + esc(POLIA_HIST[k] || k) + ":</span> <s>" + esc(hodnotaHist(k, d[0])) + "</s> → <b>" + esc(hodnotaHist(k, d[1])) + "</b></li>";
        }).join("") + "</ul>" : "") + "</li>";
    }
  }
  function sekciaHistorie(tab, id) {
    var k = tab + ":" + id, otv = (S.histOtv || {})[k];
    return '<details class="hist-sekcia" data-hist="' + esc(k) + '"' + (otv ? " open" : "") + '><summary>🕘 História zmien</summary><div class="hist-obsah"><p class="meta">Načítavam…</p></div></details>';
  }
  function napojHistoriu(root) {
    (root || document).querySelectorAll("[data-hist]").forEach(function (d) {
      async function nacitaj() {
        if (d.dataset.nacitane) return; d.dataset.nacitane = "1";
        var c = d.dataset.hist.split(":"), tabs = c[0] === "nehnutelnosti" ? ["nehnutelnosti", "nehnutelnosti_interne"] : [c[0]];
        var r = await sb.from("historia_zmien").select("*").in("tabulka", tabs).eq("zaznam_id", c.slice(1).join(":")).order("kedy", { ascending: false }).limit(150);
        d.querySelector(".hist-obsah").innerHTML = r.error ? '<p class="zle-text">' + esc(chybaText(r.error)) + "</p>" : riadkyHist(r.data);
      }
      d.ontoggle = function () { S.histOtv = S.histOtv || {}; S.histOtv[d.dataset.hist] = d.open; if (d.open) nacitaj(); };
      if (d.open) nacitaj();
    });
  }
  // ------------------------------------------------------------ HISTÓRIA JEDNÉHO MAKLÉRA (admin, v detaile makléra)
  var HM_DRUHY = [["", "Všetko"], ["skener", "Skener"], ["ponuky", "Ponuky a provízie"], ["obhliadky", "Obhliadky"], ["sch", "Schránkovanie"], ["ucet", "Zmeny účtu"]];
  var HM_OBDOBIA = [[7, "Posledných 7 dní"], [30, "Posledných 30 dní"], [90, "Posledné 3 mesiace"], [0, "Celá história"]];
  function sekciaHistorieMaklera(id) {
    var F = S.hmF = S.hmF || { druh: "", dni: 30 };
    return '<div class="box hm-box" id="hm-box" data-hm="' + esc(id) + '"><div class="vykon-hlava"><h3>🕘 História makléra</h3>' +
      '<select id="hm-obd" aria-label="Obdobie">' + HM_OBDOBIA.map(function (o) { return '<option value="' + o[0] + '"' + (F.dni === o[0] ? " selected" : "") + ">" + o[1] + "</option>"; }).join("") + "</select></div>" +
      '<p class="meta">Všetko, čo maklér urobil – hovory, SMS a prevzaté inzeráty v skeneri, úpravy ponúk a provízií, obhliadky, schránkovanie – aj kto a kedy menil jeho účet.</p>' +
      '<div class="seg hm-seg" role="group" id="hm-seg"></div><div id="hm-zoz"><p class="meta">Načítavam…</p></div></div>';
  }
  async function nacitajHistoriuMaklera(id) {
    var w = await Promise.all([
      sb.from("aktivity").select("*").eq("makler_id", id).order("vytvorene", { ascending: false }).limit(500),
      sb.from("historia_zmien").select("*").eq("kto", id).order("kedy", { ascending: false }).limit(500),
      sb.from("historia_zmien").select("*").eq("tabulka", "makleri").eq("zaznam_id", id).order("kedy", { ascending: false }).limit(200),
      sb.from("obhliadky").select("*").eq("makler_id", id).order("vytvorene", { ascending: false }).limit(300),
      sb.from("schrankovanie_akcie").select("*").eq("makler_id", id).order("id", { ascending: false }).limit(300),
      S.ponuky ? null : nacitajPonuky().catch(function () {}), S.provizie ? null : nacitajProvizie().catch(function () {}),
      S.sidliska ? null : nacitajSchrankovanie().catch(function () {})]);
    var m = S.mById[id] || {}, a = rodMaklera(m) === "zena" ? "a" : "", R = [], videne = {};
    function inzerat(iid) {
      var z = (S.inz || []).find(function (x) { return x.id === iid; });
      return '<button type="button" class="linka" data-inz-otvor="' + esc(iid) + '">🔎 ' + esc(z ? [z.nazov, z.obec].filter(Boolean).join(" · ") : "inzerát") + "</button>";
    }
    function ponuka(pid) {
      var p = (S.ponuky || []).find(function (x) { return x.id === pid; });
      return pid ? '<button type="button" class="linka" data-ponuka-otvor="' + esc(pid) + '">🏠 ' + esc(p ? nazovPonuky(p) : "ponuka") + "</button>" : "";
    }
    function riadok(kedy, druh, ikonaR, co, ciel, detail, bezCasu) {
      R.push({ kedy: kedy, druh: druh, html: '<li><div class="hist-hl"><span class="hist-sys" aria-hidden="true">' + ikonaR + "</span><span>" + co + "</span>" + (ciel || "") +
        '<span class="meta hist-kedy">' + datum(kedy, !bezCasu) + "</span></div>" + (detail ? '<ul class="hist-zmeny"><li>' + detail + "</li></ul>" : "") + "</li>" });
    }
    (w[0].data || []).forEach(function (x) {
      var T = { prevzatie: ["🙋", "prevzal" + a + " inzerát"], uvolnenie: ["↩️", "uvoľnil" + a + " inzerát"], presun: ["🔀", "presun inzerátu"], hovor: ["📞", "volal" + a + " – <b>" + esc(x.vysledok || "") + "</b>"],
        sms: ["💬", "poslal" + a + " SMS"], email: ["✉️", "poslal" + a + " email"], sms_zrusena: ["💬", "zrušil" + a + " označenie SMS"], email_zruseny: ["✉️", "zrušil" + a + " označenie emailu"] }[x.typ] || ["•", esc(x.typ)];
      riadok(x.vytvorene, "skener", T[0], T[1], inzerat(x.inzerat_id), x.poznamka ? esc(x.poznamka) : "");
    });
    (w[1].data || []).concat(w[2].data || []).forEach(function (z) {
      if (videne[z.id]) return; videne[z.id] = 1;
      var html = riadokHist(z, nazovZaznamuHist); if (!html) return;
      R.push({ kedy: z.kedy, druh: z.tabulka === "makleri" ? "ucet" : "ponuky", html: html });
    });
    (w[3].data || []).forEach(function (o) {
      var v = VYS_OBH.find(function (x) { return x[0] === o.vysledok; });
      riadok(o.vytvorene, "obhliadky", "🗝️", "zapísal" + a + " obhliadku na " + datum(o.cas, true), ponuka(o.nehnutelnost_id),
        [o.klient_meno ? "klient " + esc(o.klient_meno) : "", v ? "výsledok: <b>" + esc(v[1]) + "</b>" : "", o.spatna_vazba ? esc(o.spatna_vazba) : ""].filter(Boolean).join(" · "));
    });
    (w[4].data || []).forEach(function (x) {
      var sd = (S.sidliska || []).find(function (y) { return y.id === x.sidlisko_id; }), n = '<span class="hist-co">📬 ' + esc(sd ? [sd.nazov, sd.mesto].filter(Boolean).join(", ") : "sídlisko") + (x.polovica ? " · " + esc(x.polovica) : "") + "</span>";
      if (x.rezervovane) riadok(x.rezervovane, "sch", "📌", "rezervoval" + a + " schránkovanie", n, "");
      if (x.datum) riadok(x.datum + "T12:00:00", "sch", "📬", "vyschránkoval" + a, n, x.poznamka ? esc(x.poznamka) : "", true);
      if (x.zrusene) riadok(x.zrusene, "sch", "✖️", "rezervácia zrušená" + (x.zrusil && x.zrusil !== id ? " (" + esc(meno(x.zrusil)) + ")" : ""), n, "");
    });
    R.sort(function (x, y) { return String(y.kedy).localeCompare(String(x.kedy)); });
    S.hmData = { id: id, R: R, chyba: w.slice(0, 5).map(function (r) { return r && r.error; }).filter(Boolean)[0] || null };
  }
  async function vykresliHistoriuMaklera() {
    var box = $("#hm-box"); if (!box) return;
    var id = box.dataset.hm, F = S.hmF;
    if (!S.hmData || S.hmData.id !== id) {
      try { await nacitajHistoriuMaklera(id); } catch (e) { S.hmData = { id: id, R: [], chyba: e }; }
      box = $("#hm-box"); if (!box || box.dataset.hm !== id) return;
    }
    var od = F.dni ? new Date(Date.now() - F.dni * 864e5).toISOString() : "", vObd = S.hmData.R.filter(function (x) { return !od || String(x.kedy) >= od; });
    var poc = {}; vObd.forEach(function (x) { poc[x.druh] = (poc[x.druh] || 0) + 1; });
    $("#hm-seg").innerHTML = HM_DRUHY.map(function (d) {
      return '<button type="button" data-hm-druh="' + d[0] + '" aria-pressed="' + (F.druh === d[0]) + '">' + d[1] + ' <span class="n">' + (d[0] ? poc[d[0]] || 0 : vObd.length) + "</span></button>"; }).join("");
    var zoz = vObd.filter(function (x) { return !F.druh || x.druh === F.druh; });
    $("#hm-zoz").innerHTML = (S.hmData.chyba ? '<p class="zle-text">Časť histórie sa nepodarilo načítať: ' + esc(chybaText(S.hmData.chyba)) + "</p>" : "") +
      (zoz.length ? '<ol class="hist">' + zoz.slice(0, S.hmViac || 150).map(function (x) { return x.html; }).join("") + "</ol>" +
        (zoz.length > (S.hmViac || 150) ? '<button class="btn ghost wide" type="button" id="hm-viac">Zobraziť staršie (' + (zoz.length - (S.hmViac || 150)) + ")</button>" : "") :
        '<p class="meta">V tomto období tu nič nie je.</p>');
    box.querySelectorAll("[data-hm-druh]").forEach(function (b) { b.onclick = function () { F.druh = b.dataset.hmDruh; S.hmViac = 0; vykresliHistoriuMaklera(); }; });
    $("#hm-obd").onchange = function () { F.dni = Number(this.value); S.hmViac = 0; vykresliHistoriuMaklera(); };
    var vi = $("#hm-viac"); if (vi) vi.onclick = function () { S.hmViac = (S.hmViac || 150) + 150; vykresliHistoriuMaklera(); };
    box.querySelectorAll("[data-ponuka-otvor]").forEach(function (b) { b.onclick = function () { otvorPonuku(b.dataset.ponukaOtvor); }; });
    box.querySelectorAll("[data-inz-otvor]").forEach(function (b) { b.onclick = function () { if (tabPovoleny("inzeraty")) prejdi("inzeraty", b.dataset.inzOtvor); }; });
  }

  async function vykresliHistoriu() {
    var el = $("#obsah"); if (!el || !admin()) return;
    var F = S.histF = S.histF || { tab: "", kto: "" };
    el.innerHTML = '<div class="box hist-box"><div class="vykon-hlava"><h3>🕘 História zmien</h3></div>' +
      '<p class="meta">Kto, kedy a čo zmenil v ponukách, pri makléroch a v províziách. Zobrazuje posledných 300 zmien.</p>' +
      '<div class="nehn-filtre"><div class="seg" role="group">' + [["", "Všetko"], ["nehnutelnosti", "Ponuky"], ["makleri", "Makléri"], ["provizie", "Provízie"]].map(function (x) {
        return '<button type="button" data-hf="' + x[0] + '" aria-pressed="' + (F.tab === x[0]) + '">' + x[1] + "</button>"; }).join("") + "</div>" +
      '<select id="hist-kto" aria-label="Kto"><option value="">Všetci</option>' + S.makleri.map(function (m) { return '<option value="' + m.id + '"' + (F.kto === m.id ? " selected" : "") + ">" + esc(m.meno || m.email) + "</option>"; }).join("") + "</select></div>" +
      '<div id="hist-zoz"><p class="meta">Načítavam…</p></div></div>';
    el.querySelectorAll("[data-hf]").forEach(function (b) { b.onclick = function () { F.tab = b.dataset.hf; vykresliHistoriu(); }; });
    $("#hist-kto").onchange = function () { F.kto = this.value; vykresliHistoriu(); };
    var q = sb.from("historia_zmien").select("*").order("kedy", { ascending: false }).limit(300);
    if (F.tab === "nehnutelnosti") q = q.in("tabulka", ["nehnutelnosti", "nehnutelnosti_interne"]); else if (F.tab) q = q.eq("tabulka", F.tab);
    if (F.kto) q = q.eq("kto", F.kto);
    var w = await Promise.all([q, S.ponuky ? null : nacitajPonuky().catch(function () {}), S.provizie ? null : nacitajProvizie().catch(function () {})]), r = w[0];
    var box = $("#hist-zoz"); if (!box) return;
    if (r.error) { box.innerHTML = '<p class="zle-text">' + esc(chybaText(r.error)) + "</p>"; return; }
    box.innerHTML = riadkyHist(r.data, nazovZaznamuHist);
    box.querySelectorAll("[data-ponuka-otvor]").forEach(function (b) { b.onclick = function () { otvorPonuku(b.dataset.ponukaOtvor); }; });
  }

  // ------------------------------------------------------------ SPRIEVODCA PRE NOVÉHO MAKLÉRA (Realitný týpek)
  function krokySprievodcu() {
    var mob = !window.matchMedia("(min-width: 1100px)").matches;
    function ciel(tab) { return mob ? ".menu-btn" : '.bocne [data-tab="' + tab + '"]'; }
    var K = [{ t: "Ahoj" + (oslovenie(S.me) ? ", " + oslovenie(S.me) : "") + "! 👋", x: "Som Realitný týpek. Za minútku vám ukážem, kde čo nájdete. Sprievodcu môžete kedykoľvek preskočiť." },
      { t: "Menu", x: mob ? "Všetky sekcie otvoríte tlačidlom Menu hore – dlaždice sú rozdelené na Prácu, Tím a Nástroje." : "Všetky sekcie máte v bočnom paneli vľavo – rozdelené na Prácu, Tím a Nástroje.", c: mob ? ".menu-btn" : ".bocne .menu-skup" }];
    if (maSekciu("inzeraty")) K.push({ t: "Realitný skener", x: "Každú hodinu zbieram nové súkromné inzeráty z Bazoša, Nehnuteľností.sk, Reality.sk a TopReality.sk. Inzerát si prevezmete, zavoláte a zapíšete, ako to dopadlo.", c: ciel("inzeraty") });
    if (maSekciu("nehnutelnosti")) K.push({ t: "Nehnuteľnosti", x: "Tu pridáte ponuku kancelárie krok za krokom. Pri ponuke nájdete leták, report pre majiteľa, príspevok na Facebook a Instagram aj odkaz pre klienta.", c: ciel("nehnutelnosti") });
    if (maSekciu("klienti")) K.push({ t: "Klienti", x: "Zapíšte, čo klient hľadá. Keď sa objaví ponuka alebo inzerát, ktorý sedí, dám vám vedieť do zvončeka.", c: ciel("klienti") });
    K.push({ t: "Pripomienky", x: "Zvonček vám pripomenie, komu máte zavolať a čo vás dnes čaká.", c: "#zvon-btn" });
    if (maSekciu("chat")) K.push({ t: "Chat tímu", x: "Správa celému tímu alebo súkromne len jednému kolegovi – vyberiete ho v zozname. Pri novej správe vyskočí obálka – prečítate hneď, pripomeniem neskôr alebo ignorujete. Nové správy sú aj vo zvončeku.", c: ciel("chat") });
    if (maSekciu("provizie")) K.push({ t: "Moje provízie", x: "Prehľad vašich obchodov a toho, čo vám kancelária ešte vyplatí.", c: ciel("provizie") });
    K.push({ t: "Zmena hesla", x: "Zlaté tlačidlo s kľúčom hore otvorí zmenu hesla – kedykoľvek si heslo zmeníte jedným klikom.", c: ".heslo-btn" });
    K.push({ t: "Môj profil", x: "Doplňte si telefón, fotku a text SMS. Telefón uvidia klienti na ponukách a letákoch.", c: ".me-btn" });
    if (admin()) K.push({ t: "Správa kancelárie", x: "Ako administrátor máte navyše Výkon, Maklérov, Vzhľad (farby a logo) a Históriu zmien. Export do Realsoftu nájdete v Nehnuteľnostiach → Web a export.", c: mob ? ".menu-btn" : '.bocne [data-tab="makleri"]' });
    K.push({ t: "Pomoc", x: "Sprievodcu, novinky a zmenu hesla nájdete v menu v časti Pomoc. Keď pribudne nová funkcia, ukážem vám ju hneď po prihlásení.", c: mob ? ".menu-btn" : ".bocne .menu-pomoc" });
    K.push({ t: "Hotovo! 🎉", x: "Sprievodcu spustíte znova v menu → Pomoc. Veľa úspešných obchodov!" });
    return K;
  }
  function spustiSprievodcu() { zavriMenu(); S.spr = { i: 0, k: krokySprievodcu() }; kresliSprievodcu(); }
  function zacniSprievodcuAkTreba() {
    if (!S.me || S.me.sprievodca_videny || S.spr) return;
    if (document.querySelector(".pochvala-var")) return setTimeout(zacniSprievodcuAkTreba, 2000);
    spustiSprievodcu();
  }
  function kresliSprievodcu() {
    var P = S.spr; if (!P) return;
    var box = $("#sprievodca");
    if (!box) { box = document.createElement("div"); box.id = "sprievodca"; document.body.appendChild(box); }
    var k = P.k[P.i], posl = P.i === P.k.length - 1, ciel = k.c ? document.querySelector(k.c) : null, r = ciel ? ciel.getBoundingClientRect() : null;
    if (r && (!r.width || !r.height)) r = null;
    if (r && (r.bottom < 0 || r.top > innerHeight)) { ciel.scrollIntoView({ block: "center" }); r = ciel.getBoundingClientRect(); }
    box.className = r ? "s-cielom" : "";
    box.innerHTML = (r ? '<div class="spr-ring" style="left:' + Math.round(r.left - 6) + "px;top:" + Math.round(r.top - 6) + "px;width:" + Math.round(r.width + 12) + "px;height:" + Math.round(r.height + 12) + 'px"></div>' : '<div class="spr-tien"></div>') +
      '<div class="spr-karta" role="dialog" aria-modal="true" aria-labelledby="spr-t"><img src="typek-postava.png" alt="" class="spr-typek" width="84" height="96">' +
      '<div class="spr-text"><span class="meta">' + (P.i + 1) + " / " + P.k.length + '</span><h3 id="spr-t">' + esc(k.t) + "</h3><p>" + esc(k.x) + "</p>" +
      '<div class="spr-btns">' + (P.i ? '<button class="btn ghost" type="button" data-spr="spat">‹ Späť</button>' : "") +
      (!posl ? '<button class="btn ghost" type="button" data-spr="koniec">Preskočiť</button>' : "") +
      '<button class="btn primary" type="button" data-spr="dalej">' + (posl ? "Poďme na to!" : "Ďalej ›") + "</button></div>" +
      '<div class="spr-body" aria-hidden="true">' + P.k.map(function (_, i) { return "<i" + (i === P.i ? ' class="ak"' : "") + "></i>"; }).join("") + "</div></div></div>";
    box.querySelectorAll("[data-spr]").forEach(function (b) {
      b.onclick = function () {
        var a = b.dataset.spr;
        if (a === "dalej" && !posl) { P.i++; kresliSprievodcu(); } else if (a === "spat") { P.i--; kresliSprievodcu(); } else ukonciSprievodcu(a === "dalej");
      };
    });
    var d = box.querySelector('[data-spr="dalej"]'); if (d) d.focus({ preventScroll: true });
  }
  function ukonciSprievodcu(dokoncil) {
    S.spr = null; var b = $("#sprievodca"); if (b) b.remove();
    S.me.sprievodca_videny = new Date().toISOString();
    rpc("sprievodca_hotovo", { p_znova: false }).catch(function () {});
    if (dokoncil) konfety({ pocet: 80 });
    setTimeout(zacniNovinkyAkTreba, 1500);
  }

  // ------------------------------------------------------------ NOVINKY („Ahoj Tinka, máš nové funkcie“)
  async function nacitajNovinky() {
    var r = await sb.from("novinky").select("*").eq("aktivna", true).order("vytvorene", { ascending: false }).limit(40);
    if (r.error) throw r.error;
    S.novinky = r.data || [];
  }
  function noveNovinky() {
    if (!S.me || !S.me.novinky_videne) return [];
    return (S.novinky || []).filter(function (n) { return n.vytvorene > S.me.novinky_videne; });
  }
  function popisNovinky() {
    var n = noveNovinky().length;
    document.querySelectorAll("[data-novinky-n]").forEach(function (b) { b.hidden = !n; b.textContent = n || ""; });
  }
  function zacniNovinkyAkTreba() {
    if (!S.me || S.spr || !S.me.sprievodca_videny || $("#novinky-okno")) return;
    if (document.querySelector(".pochvala-var")) return setTimeout(zacniNovinkyAkTreba, 2500);
    var nove = noveNovinky();
    if (nove.length) ukazNovinky(nove, true);
  }
  var CIELE_NOVINIEK = { heslo: "Zmena hesla", pomoc: "Menu → Pomoc", predavajuci: "Klienti → Predávajúci", upozornenia: "Upozornenia do mobilu" };
  function nazovCiela(c) {
    if (!c) return "";
    if (CIELE_NOVINIEK[c]) return CIELE_NOVINIEK[c];
    var t = SEKCIE.find(function (x) { return x[0] === c; });
    return t ? t[1] : { domov: "Prehľad", vykon: "Výkon", makleri: "Makléri", vzhlad: "Vzhľad", historia: "História zmien" }[c] || c;
  }
  function ukazNovinky(zoz, nove) {
    var stare = $("#novinky-okno"); if (stare) stare.remove();
    var meno = oslovenie(S.me);
    var o = document.createElement("div"); o.className = "pochvala-var"; o.id = "novinky-okno";
    o.innerHTML = '<div class="pochvala-karta nov-karta" role="dialog" aria-modal="true" aria-labelledby="nov-n">' +
      '<button type="button" class="nov-x" data-nov="zavriet" aria-label="Zavrieť">×</button>' +
      '<img src="typek-postava.png" alt="" class="nov-typek" width="92" height="104">' +
      '<h3 id="nov-n">' + (nove ? "Ahoj" + (meno ? " " + esc(meno) : "") + ", máš nové funkcie!" : "Čo je nové v Realitnom týpkovi") + "</h3>" +
      (nove ? '<p class="meta">Pozri, čo pribudlo od tvojho posledného prihlásenia:</p>' : "") +
      (zoz.length ? '<ul class="nov-zoz">' + zoz.map(function (n) {
        return '<li><div class="nov-hl"><b>✨ ' + esc(n.nazov) + '</b><small class="meta">' + datum(n.vytvorene) + "</small></div>" +
          (n.popis ? "<p>" + esc(n.popis) + "</p>" : "") +
          (n.ciel ? '<button class="btn" type="button" data-nov-ciel="' + esc(n.ciel) + '">Ukáž mi: ' + esc(nazovCiela(n.ciel)) + " ›</button>" : "") + "</li>";
      }).join("") + "</ul>" : '<p class="meta">Zatiaľ tu nič nie je. Keď pribudne nová funkcia, ukážem ti ju hneď po prihlásení.</p>') +
      '<button class="btn primary wide" type="button" data-nov="zavriet">' + (nove ? "Super, rozumiem 👍" : "Zavrieť") + "</button></div>";
    document.body.appendChild(o);
    if (nove) setTimeout(function () { konfety({ pocet: 70 }); }, 250);
    function zavri() {
      o.remove(); document.removeEventListener("keydown", esc2);
      if (nove) { S.me.novinky_videne = new Date().toISOString(); popisNovinky(); rpc("novinky_videne", {}).catch(function () {}); }
    }
    function esc2(e) { if (e.key === "Escape") zavri(); }
    document.addEventListener("keydown", esc2);
    o.addEventListener("click", function (e) {
      if (e.target === o || e.target.closest('[data-nov="zavriet"]')) return zavri();
      var c = e.target.closest("[data-nov-ciel]"); if (!c) return;
      zavri(); ukazCiel(c.dataset.novCiel);
    });
    var b = o.querySelector(".btn.primary"); if (b) b.focus({ preventScroll: true });
  }
  function ukazCiel(c) {
    if (c === "heslo") return otvorHeslo();
    if (c === "upozornenia") {
      zavriMenu(); S.zvonOpen = false; vykresliZvoncek(); S.pwdOpen = true; vykresliHeslo();
      var bx = $("#box-push"); if (bx) { bx.scrollIntoView({ behavior: "smooth", block: "center" }); bx.classList.add("zvyrazni"); setTimeout(function () { bx.classList.remove("zvyrazni"); }, 2600); }
      return;
    }
    if (c === "predavajuci") { if (!tabPovoleny("klienti") || !maSekciu("inzeraty")) return; S.klPohlad = "predavajuci"; S.predDetail = null; S.dopytDetail = null; if (S.tab !== "klienti") return prejdi("klienti"); history.pushState({ tab: "klienti", kl: "predavajuci" }, "", "#klienti"); vykresliKlientov(); window.scrollTo(0, 0); return; }
    if (c === "pomoc") {
      var desk = window.matchMedia("(min-width: 1100px)").matches;
      if (!desk) otvorMenu();
      var g = $(desk ? ".bocne .menu-pomoc" : "#menu-sheet .menu-pomoc"); if (!g) return;
      g.scrollIntoView({ block: "center", behavior: "smooth" });
      g.classList.add("zvyrazni"); setTimeout(function () { g.classList.remove("zvyrazni"); }, 2600);
      return;
    }
    if (tabPovoleny(c)) prejdi(c);
  }

  // správa noviniek (administrátor, Makléri → Nastavenia tímu)
  async function vykresliNovinkyAdm() {
    var box = $("#novinky-adm"); if (!box || !admin()) return;
    if (!S.novinkyAdm) {
      box.innerHTML = '<p class="meta">Načítavam…</p>';
      var r = await sb.from("novinky").select("*").order("vytvorene", { ascending: false }).limit(100);
      S.novinkyAdm = r.error ? [] : r.data;
      box = $("#novinky-adm"); if (!box) return;
    }
    var ciele = [["", "— nikam —"], ["heslo", "Zmena hesla"], ["pomoc", "Menu → Pomoc"], ["predavajuci", "Klienti → Predávajúci"], ["upozornenia", "Upozornenia do mobilu"]].concat(SEKCIE.map(function (x) { return [x[0], x[1]]; }),
      [["domov", "Prehľad"], ["vykon", "Výkon (admin)"], ["makleri", "Makléri (admin)"], ["vzhlad", "Vzhľad (admin)"]]);
    box.innerHTML = '<form id="f-novinka" class="nov-form"><div class="form-grid">' +
      '<label class="field"><span>Názov novinky</span><input type="text" name="nazov" maxlength="120" required placeholder="napr. Provízie sa dajú vypnúť"></label>' +
      '<label class="field"><span>Tlačidlo „Ukáž mi“ vedie do</span><select name="ciel">' + ciele.map(function (c) { return '<option value="' + c[0] + '">' + esc(c[1]) + "</option>"; }).join("") + "</select></label>" +
      '<label class="field"><span>Kto ju uvidí</span><select name="pre_koho"><option value="vsetci">Všetci makléri</option><option value="admin">Len administrátori</option></select></label></div>' +
      '<label class="field"><span>Čo robí – jedna či dve vety (tykáme)</span><textarea name="popis" rows="2" maxlength="600" placeholder="napr. V Makléroch pri každom maklérovi zapneš alebo vypneš sekciu Provízie."></textarea></label>' +
      '<div class="form-actions"><button class="btn primary" type="submit">✨ Pridať novinku</button><button class="btn ghost" type="button" data-nov-adm="nahlad">Ukážka okna</button></div></form>' +
      (S.novinkyAdm.length ? '<ul class="nov-adm-zoz">' + S.novinkyAdm.map(function (n) {
        return '<li class="' + (n.aktivna ? "" : "skryta") + '"><div><b>' + esc(n.nazov) + '</b><small class="meta">' + datum(n.vytvorene) + (n.pre_koho === "admin" ? " · len administrátori" : "") +
          (n.ciel ? " · vedie do: " + esc(nazovCiela(n.ciel)) : "") + (n.aktivna ? "" : " · skrytá") + "</small></div>" +
          '<button class="btn ghost" type="button" data-nov-prepni="' + n.id + '">' + (n.aktivna ? "Skryť" : "Zobraziť") + "</button></li>";
      }).join("") + "</ul>" : '<p class="meta">Zatiaľ žiadne novinky.</p>');
    var f = $("#f-novinka");
    f.onsubmit = async function (e) {
      e.preventDefault();
      var d = {}; new FormData(f).forEach(function (v, k) { d[k] = v; });
      var btn = f.querySelector('[type="submit"]'); btn.disabled = true;
      try { await rpc("ulozit_novinku", { p: d }); S.novinkyAdm = null; await nacitajNovinky().catch(function () {}); toast("✨ Novinka je pridaná – makléri ju uvidia pri ďalšom otvorení."); vykresliNovinkyAdm(); }
      catch (err) { toast(chybaText(err), true); btn.disabled = false; }
    };
    box.querySelector('[data-nov-adm="nahlad"]').onclick = function () {
      var d = {}; new FormData(f).forEach(function (v, k) { d[k] = v; });
      if (!d.nazov.trim()) return toast("Napíšte názov novinky.", true);
      ukazNovinky([{ nazov: d.nazov, popis: d.popis, ciel: d.ciel, vytvorene: new Date().toISOString() }], false);
      var h = $("#nov-n"); if (h) h.textContent = "Ahoj" + (oslovenie(S.me) ? " " + oslovenie(S.me) : "") + ", máš nové funkcie!";
    };
    box.querySelectorAll("[data-nov-prepni]").forEach(function (b) {
      b.onclick = async function () {
        var n = S.novinkyAdm.find(function (x) { return x.id === Number(b.dataset.novPrepni); }); if (!n) return;
        b.disabled = true;
        try { await rpc("ulozit_novinku", { p: Object.assign({}, n, { aktivna: !n.aktivna }) }); S.novinkyAdm = null; await nacitajNovinky().catch(function () {}); vykresliNovinkyAdm(); }
        catch (err) { toast(chybaText(err), true); b.disabled = false; }
      };
    });
  }
  document.addEventListener("keydown", function (e) { if (S.spr && e.key === "Escape") ukonciSprievodcu(); });
  window.addEventListener("resize", function () { if (S.spr) kresliSprievodcu(); });

  // ------------------------------------------------------------ CHAT
  // S.chat = správy pre celý tím, S.dm = súkromné správy (len tie, kde som odosielateľ alebo príjemca),
  // S.chatS = otvorená konverzácia (null = celý tím, inak id kolegu)
  async function nacitajChat() {
    var r = await Promise.all([
      sb.from("spravy").select("*").order("id", { ascending: false }).limit(300),
      sb.from("sukromne_spravy").select("*").order("id", { ascending: false }).limit(1000),
      sb.from("chat_reakcie").select("*").order("id", { ascending: false }).limit(400)
    ]);
    var t = r[0], d = r[1], rk = r[2];
    S.reak = S.reak || [];
    if (!rk.error) pridajReakcie(rk.data.reverse());
    if (!t.error) {
      t.data.reverse();
      S.chat = t.data.filter(function (m) { return !m.zmazane; });
      S.chatMax = t.data.length ? t.data[t.data.length - 1].id : 0;
    }
    if (!d.error) { S.dm = d.data.reverse(); S.dmMax = S.dm.length ? S.dm[S.dm.length - 1].id : 0; }
    if (!S.obalkyStart) { S.obalkyStart = true; setTimeout(obalkyPoSpusteni, 2600); }
  }
  function partner(m) { return m.od_id === S.me.id ? m.komu_id : m.od_id; }
  function normDm(m) { return { id: m.id, makler_id: m.od_id, komu_id: m.komu_id, text: m.text, vytvorene: m.vytvorene, precitane: m.precitane, dm: true }; }
  function oknoSpravy() {
    if (!S.chatS) return S.chat;
    return S.dm.filter(function (m) { return partner(m) === S.chatS; }).map(normDm);
  }
  function krstneMeno(id) { var m = S.mById[id]; return m ? (String(m.meno || "").trim().split(/\s+/)[0] || m.email) : "kolega"; }
  function clenoviaChatu() {
    return S.makleri.filter(function (m) { return m.aktivny && (m.rola === "admin" || (m.pristup || ["chat"]).indexOf("chat") >= 0); });
  }
  function jeOnline(m) { return m.id === S.me.id || (m.naposledy_aktivny && Date.now() - new Date(m.naposledy_aktivny).getTime() < 4 * 60000); }
  function otvorKonverzaciu(id) {
    S.chatS = id || null;
    if (S.tab === "chat") vykresliChat(); else prejdi("chat");
  }
  var chatBezi = null, chatZnova = false;
  function chatNove() {
    if (chatBezi) { chatZnova = true; return chatBezi; }
    chatBezi = chatNoveRaz().catch(function () { /* skúsime o chvíľu */ }).then(function () {
      chatBezi = null;
      if (chatZnova) { chatZnova = false; return chatNove(); }
    });
    return chatBezi;
  }
  // človek sa práve pozerá na Týpka (okno je vpredu, nie len otvorené na pozadí)
  function pozera() { return !document.hidden && (typeof document.hasFocus !== "function" || document.hasFocus()); }
  // čas poslednej správy tímu, ktorú aplikácia má (čas servera – nezávisí od hodín v počítači)
  function posledneTim() {
    var t = S.me.chat_precitane || null, tm = t ? new Date(t).getTime() : 0;
    S.chat.forEach(function (m) { var x = new Date(m.vytvorene).getTime(); if (x > tm) { tm = x; t = m.vytvorene; } });
    return t;
  }
  function timPrecitany() {
    var t = posledneTim(); if (!t) return;
    S.me.chat_precitane = t;
    rpc("chat_precitane_do", { p_cas: t }).catch(function () { return rpc("chat_precitane", {}); }).catch(function () {});
  }
  async function chatNoveRaz() {
    if (!S.me) return;
    var r = await Promise.all([
      sb.from("spravy").select("*").gt("id", S.chatMax).order("id", { ascending: true }).limit(200),
      sb.from("sukromne_spravy").select("*").gt("id", S.dmMax).order("id", { ascending: true }).limit(200),
      sb.from("chat_reakcie").select("*").gt("id", S.reakMax || 0).order("id", { ascending: true }).limit(200)
    ]);
    var rt = r[0], rd = r[1], noveT = [], noveD = [];
    if (!r[2].error && r[2].data.length) {
      var noveR = pridajReakcie(r[2].data);
      ohlasIgnoracie(noveR);
      if (S.tab === "chat") znackaPrecitania();
      obnovZvoncek();
    }
    skontrolujOdlozene();
    if (S.tab === "chat") await synchChat();
    if (!rt.error && rt.data.length) {
      S.chatMax = rt.data[rt.data.length - 1].id;
      noveT = rt.data.filter(function (m) { return !m.zmazane; });
      S.chat = S.chat.concat(noveT).slice(-500);
    }
    if (!rd.error && rd.data.length) {
      S.dmMax = rd.data[rd.data.length - 1].id;
      noveD = rd.data;
      S.dm = S.dm.concat(noveD).slice(-1000);
    }
    if (!noveT.length && !noveD.length) return popisChat();
    var okno = S.tab === "chat" && !!$("#chat-spravy");
    var doOkna = S.chatS ? noveD.filter(function (m) { return partner(m) === S.chatS; }).map(normDm) : noveT;
    try {
      if (okno) { pridajSpravy(doOkna); kresliKonverzacie(); oznacPrecitane(); }
      else if (S.tab === "domov") vykresliDomov();
    } catch (e) { /* obálka musí vyskočiť aj keby sa nepodarilo prekresliť stránku */ }
    // vyskočí len to, čo človek práve nemá pred očami
    var vidi = okno && pozera();
    var upoz = noveT.filter(function () { return !(vidi && !S.chatS); })
      .concat(noveD.filter(function (m) { return m.komu_id === S.me.id && !(vidi && S.chatS === m.od_id); }).map(normDm));
    upoz.sort(function (a, b) { return new Date(a.vytvorene) - new Date(b.vytvorene); });
    upozornNaSpravy(upoz);
    popisChat();
  }
  // ---------- vyskakovacie upozornenie na nové správy
  function nastChat(k) { try { return localStorage.getItem("typek-chat-" + k) !== "vyp"; } catch (e) { return true; } }
  function nastavChat(k, zap) { try { localStorage.setItem("typek-chat-" + k, zap ? "zap" : "vyp"); } catch (e) { /* nič */ } }
  function cinknut() {
    try {
      var A = window.AudioContext || window.webkitAudioContext; if (!A) return;
      var c = S.zvukCtx = S.zvukCtx || new A(), t = c.currentTime, o = c.createOscillator(), g = c.createGain();
      o.type = "sine"; o.frequency.setValueAtTime(880, t); o.frequency.setValueAtTime(1318, t + 0.09);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.13, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.38);
      o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + 0.4);
    } catch (e) { /* zvuk nie je dostupný */ }
  }
  // ---------- obálka: okno pri novej správe (Prečítať / Pripomenúť neskôr / Ignorovať)
  // S.reak = moje odloženia a oznámenia o ignorovaní mojich správ, S.obalky = rad okien (jedno na konverzáciu)
  function lsKluc(k) { return "typek-obalka-" + k + "-" + S.me.id; }
  function citajLS(k) { try { return Number(localStorage.getItem(lsKluc(k))) || 0; } catch (e) { return 0; } }
  function pisLS(k, v) { try { if (v > citajLS(k)) localStorage.setItem(lsKluc(k), String(v)); } catch (e) { /* nič */ } }
  function rod(id, muz, zena) { var m = S.mById[id]; return m && m.pohlavie === "zena" ? zena : muz; }
  function systemoveUpozornenie(titul, text, tag, adresa) {
    if (!document.hidden || !("Notification" in window) || Notification.permission !== "granted" || !navigator.serviceWorker) return;
    navigator.serviceWorker.ready.then(function (reg) {
      reg.showNotification(titul, { body: String(text || "").slice(0, 180), icon: "ikona-192.png", badge: "favicon-32.png", tag: tag, renotify: true,
        data: { url: location.href.split("#")[0] + "#" + adresa } });
    }).catch(function () {});
  }
  // neprečítané správy konverzácie ("" = celý tím, inak id kolegu)
  function neprecitaneKonv(konv) {
    if (!konv) {
      var od = S.me.chat_precitane ? new Date(S.me.chat_precitane).getTime() : 0;
      return S.chat.filter(function (m) { return m.makler_id !== S.me.id && new Date(m.vytvorene).getTime() > od; });
    }
    return S.dm.filter(function (m) { return m.komu_id === S.me.id && m.od_id === konv && !m.precitane; }).map(normDm);
  }
  function odlozeneCakajuce() { return S.reak.filter(function (r) { return r.makler_id === S.me.id && r.akcia === "neskor" && !r.vybavene; }); }
  function odlozenaKonv(konv) {
    return odlozeneCakajuce().filter(function (r) { return konv ? r.druh === "dm" && r.autor_id === konv : r.druh === "tim"; })[0];
  }
  function ignoracieNevidene() { return S.reak.filter(function (r) { return r.akcia === "ignorovane" && r.autor_id === S.me.id && !r.videne_autorom; }); }
  function pridajReakcie(rows) {
    var ma = {}; S.reak.forEach(function (r) { ma[r.id] = true; });
    var nove = rows.filter(function (r) { return !ma[r.id]; });
    S.reak = S.reak.concat(nove).slice(-600);
    rows.forEach(function (r) { S.reakMax = Math.max(S.reakMax || 0, r.id); });
    return nove;
  }
  // konverzácia je prečítaná → odložené pripomenutia sa zrušia a jej obálka z radu zmizne
  function vybavKonv(konv) {
    var druh = konv ? "dm" : "tim", bolo = false, t = new Date().toISOString();
    S.reak.forEach(function (r) {
      if (r.makler_id === S.me.id && r.akcia === "neskor" && !r.vybavene && r.druh === druh && (druh === "tim" || r.autor_id === konv)) { r.vybavene = t; bolo = true; }
    });
    if (bolo) rpc("vybavit_odlozene", { p_druh: druh, p_autor: konv || null }).catch(function () {});
    if (S.obalky) S.obalky = S.obalky.filter(function (e) { return e === S.obalkaAkt || e.konv !== (konv || ""); });
  }
  function upozornNaSpravy(nove, o) {
    o = o || {};
    var cudzie = nove.filter(function (m) { return m.makler_id !== S.me.id; });
    if (!cudzie.length || !maSekciu("chat")) return;
    cudzie.forEach(function (m) { pisLS(m.dm ? "dm" : "tim", m.id); });
    var m = cudzie[cudzie.length - 1];
    if (!o.ticho && nastChat("zvuk")) cinknut();
    if (!o.ticho) systemoveUpozornenie(m.dm ? "✉️ Nová správa od: " + meno(m.makler_id) : "✉️ Nová správa v spoločnom chate" + (m.makler_id ? " · " + meno(m.makler_id) : ""),
      m.text + (cudzie.length > 1 ? "  (+" + (cudzie.length - 1) + " ďalšie)" : ""), m.dm ? "typek-dm-" + m.makler_id : "typek-chat", "chat" + (m.dm ? "/" + m.makler_id : ""));
    obnovZvoncek();
    if (!nastChat("popup")) return;
    S.obalky = S.obalky || [];
    cudzie.forEach(function (x) {
      var otvorena = S.obalkaAkt && $("#obalka") && $("#obalka").dataset.stav !== "zavreta" ? S.obalkaAkt : null;
      var k = x.dm ? x.makler_id : "", e = S.obalky.find(function (y) { return y.konv === k && y !== otvorena; });
      if (!e) { e = { konv: k, spravy: [], pripomienka: !!o.pripomienka }; S.obalky.push(e); }
      if (!e.spravy.some(function (y) { return y.id === x.id; })) e.spravy.push(x);
      if (!o.pripomienka) e.pripomienka = false;
    });
    ukazObalku();
  }
  function jeNeprecitana(m) {
    if (m.dm) { var d = S.dm.find(function (x) { return x.id === m.id; }); return !!d && !d.precitane; }
    var od = S.me.chat_precitane ? new Date(S.me.chat_precitane).getTime() : 0;
    return new Date(m.vytvorene).getTime() > od && S.chat.some(function (x) { return x.id === m.id; });
  }
  function ukazObalku() {
    var o = $("#obalka");
    if (o) { if (o.dataset.stav === "zavreta" && S.obalkaAkt && !S.obalkaAkt.ign) kresliObalku(); return; }
    if (!S.obalky || !S.obalky.length || !S.me) return;
    var vidi = S.tab === "chat" && pozera() && $("#chat-spravy");
    S.obalky = S.obalky.filter(function (e) {
      if (e.ign) return !e.ign.videne_autorom;
      e.spravy = e.spravy.filter(jeNeprecitana);
      return e.spravy.length && !(vidi && (S.chatS || "") === e.konv);
    });
    if (!S.obalky.length) return;
    if (S.spr || document.querySelector(".pochvala-var")) { clearTimeout(S.obalkaT); S.obalkaT = setTimeout(ukazObalku, 2500); return; }
    S.obalkaAkt = S.obalky[0];
    kresliObalku();
  }
  function kresliObalku() {
    var E = S.obalkaAkt; if (!E) return;
    if (E.ign) return kresliIgnoraciu(E);
    var o = $("#obalka"), nove = !o, panel = "";
    if (o) { var vid = o.querySelector("[data-ob-panel]:not([hidden])"); panel = vid ? vid.dataset.obPanel : ""; }
    if (nove) { o = document.createElement("div"); o.id = "obalka"; o.className = "pochvala-var obalka-var"; o.dataset.stav = "zavreta"; document.body.appendChild(o); }
    var dm = !!E.konv, n = E.spravy.length, m = E.spravy[n - 1];
    var autori = []; E.spravy.forEach(function (x) { if (x.makler_id && autori.indexOf(x.makler_id) < 0) autori.push(x.makler_id); });
    var pecat = dm ? avatar(E.konv, 46) : autori.length === 1 ? avatar(autori[0], 46) : '<span class="ob-pecat-tim">' + ikona("chat") + "</span>";
    var nadpis = E.pripomienka ? "⏰ Pripomínam správu od:" : dm ? (n > 1 ? n + (n <= 4 ? " nové správy" : " nových správ") + " od:" : "Nová správa od:") :
      (n > 1 ? n + (n <= 4 ? " nové správy" : " nových správ") : "Nová správa") + " – spoločný chat";
    var kto = dm ? '<div class="ob-od">' + esc(meno(E.konv)) + "</div>" :
      '<div class="ob-od ob-od-tim">' + (autori.length ? "od " + esc(autori.map(function (a) { return a === S.me.id ? "vás" : meno(a); }).join(", ")) : "Tím Alpha Reality") + "</div>";
    var komuIgn = dm ? krstneMeno(E.konv) : autori.map(krstneMeno).join(" a ");
    o.innerHTML = '<div class="pochvala-karta obalka-karta' + (nove ? " prisla" : "") + '" role="dialog" aria-modal="true" aria-labelledby="ob-n">' +
      '<button type="button" class="nov-x" data-ob="zavriet" aria-label="Zavrieť">×</button>' +
      '<div class="ob-scena" aria-hidden="true"><div class="ob-obalka">' +
        '<div class="ob-zadna"></div><div class="ob-list"><i></i><i></i><i></i></div><div class="ob-predna"></div><div class="ob-chlopna"></div>' +
        '<div class="ob-pecat">' + pecat + "</div>" + (n > 1 ? '<span class="ob-pocet">' + (n > 9 ? "9+" : n) + "</span>" : "") + "</div></div>" +
      '<div class="ob-text"><span class="ob-stitok' + (dm ? " dm" : "") + '">' + (dm ? "🔒 Súkromná správa" : "👥 Spoločný chat tímu") + "</span>" +
        '<h3 id="ob-n">' + esc(nadpis) + "</h3>" + kto +
        '<span class="meta">' + esc(casKonverzacie(m.vytvorene)) + (E.pripomienka ? " · odložili ste si ju na teraz" : "") + "</span></div>" +
      '<div class="ob-akcie" data-ob-panel="akcie"><button class="btn primary wide ob-citat" type="button" data-ob="citat">📖 Prečítať</button>' +
        '<div class="ob-rad"><button class="btn" type="button" data-ob="neskor">⏰ Pripomenúť neskôr</button>' +
        '<button class="btn ghost" type="button" data-ob="ignorovat">🙈 Ignorovať</button></div>' +
        (komuIgn ? '<small class="meta ob-hint">Pri ignorovaní dostane ' + esc(komuIgn) + " oznámenie.</small>" : "") + "</div>" +
      '<div class="ob-neskor" data-ob-panel="neskor" hidden><b>Kedy vám ju mám pripomenúť?</b><div class="ob-chipy">' +
        [["15", "O 15 minút"], ["60", "O hodinu"], ["180", "O 3 hodiny"], ["rano", "Zajtra ráno"]].map(function (x) {
          return '<button class="btn" type="button" data-ob-kedy="' + x[0] + '">' + x[1] + "</button>"; }).join("") + "</div>" +
        '<button class="btn ghost" type="button" data-ob="spat">← Späť</button></div>' +
      '<div class="ob-precitane" data-ob-panel="list" hidden></div></div>';
    if (panel === "neskor") panelObalky("neskor");
    if (nove) {
      setTimeout(function () { var b = o.querySelector(".ob-citat"); if (b) b.focus({ preventScroll: true }); }, 50);
      o.addEventListener("click", klikObalka);
      S.obalkaEsc = function (e) { if (e.key === "Escape") zavriObalku(); };
      document.addEventListener("keydown", S.obalkaEsc);
    }
  }
  function kresliIgnoraciu(E) {
    var r = E.ign, o = $("#obalka");
    if (!o) {
      o = document.createElement("div"); o.id = "obalka"; o.className = "pochvala-var obalka-var"; o.dataset.stav = "zavreta"; document.body.appendChild(o);
      o.addEventListener("click", klikObalka);
      S.obalkaEsc = function (e) { if (e.key === "Escape") zavriObalku(); };
      document.addEventListener("keydown", S.obalkaEsc);
    }
    var txt = textIgnorovanej(r);
    o.innerHTML = '<div class="pochvala-karta obalka-karta ign-karta prisla" role="dialog" aria-modal="true" aria-labelledby="ob-n">' +
      '<button type="button" class="nov-x" data-ob="zavriet" aria-label="Zavrieť">×</button>' +
      '<div class="ob-scena" aria-hidden="true"><div class="ob-obalka ob-vratena">' +
        '<div class="ob-zadna"></div><div class="ob-list"><i></i><i></i><i></i></div><div class="ob-predna"></div><div class="ob-chlopna"></div>' +
        '<div class="ob-pecat">' + avatar(r.makler_id, 46) + '</div><div class="ob-razitko">Ignorované</div></div></div>' +
      '<div class="ob-text"><span class="ob-stitok ign">🙈 ' + (r.druh === "tim" ? "Spoločný chat tímu" : "Súkromná správa") + "</span>" +
        '<h3 id="ob-n">Vašu správu ' + rod(r.makler_id, "ignoroval", "ignorovala") + ":</h3>" +
        '<div class="ob-od">' + esc(meno(r.makler_id)) + "</div>" +
        '<span class="meta">' + esc(casKonverzacie(r.vytvorene)) + "</span></div>" +
      (txt ? '<div class="ob-citat-ign">„' + textSpravy(txt) + "“</div>" : "") +
      '<div class="ob-akcie"><button class="btn primary wide ob-citat" type="button" data-ob="ign-ok">👍 Beriem na vedomie</button>' +
        '<button class="btn" type="button" data-ob="ign-napisat">💬 Napísať ' + rod(r.makler_id, "mu", "jej") + " súkromne</button></div></div>";
    setTimeout(function () { var b = o.querySelector(".ob-citat"); if (b) b.focus({ preventScroll: true }); }, 50);
  }
  function panelObalky(k) {
    var o = $("#obalka"); if (!o) return;
    o.querySelectorAll("[data-ob-panel]").forEach(function (p) { p.hidden = p.dataset.obPanel !== k; });
  }
  async function klikObalka(e) {
    var E = S.obalkaAkt; if (!E) return;
    var o = $("#obalka"), b = e.target.closest("[data-ob],[data-ob-kedy]"); if (!b) return;
    if (E.ign) {
      var ak = b.dataset.ob;
      if (ak === "zavriet") return zavriObalku();
      E.ign.videne_autorom = new Date().toISOString();
      rpc("ignoracie_videne", { p_ids: [E.ign.id] }).catch(function () {});
      zavriObalku(); obnovZvoncek();
      if (ak === "ign-napisat") otvorKonverzaciu(E.ign.makler_id);
      return;
    }
    var dm = !!E.konv, posl = E.spravy[E.spravy.length - 1], a = b.dataset.ob;
    if (a === "zavriet") return zavriObalku();
    if (a === "neskor") return panelObalky("neskor");
    if (a === "spat") return panelObalky("akcie");
    if (a === "otvor") { zavriObalku(); return otvorKonverzaciu(E.konv || null); }
    if (a === "citat") return citajObalku();
    if (b.dataset.obKedy) {
      var k = b.dataset.obKedy, d = new Date();
      if (k === "rano") { d.setDate(d.getDate() + 1); d.setHours(8, 0, 0, 0); } else d = new Date(Date.now() + Number(k) * 60000);
      o.querySelectorAll("button").forEach(function (x) { x.disabled = true; });
      try {
        var id = await rpc("odlozit_spravu", { p_druh: dm ? "dm" : "tim", p_sprava: posl.id, p_kedy: d.toISOString() });
        var t = new Date().toISOString();
        S.reak.forEach(function (r) { if (r.makler_id === S.me.id && r.akcia === "neskor" && !r.vybavene && r.druh === (dm ? "dm" : "tim") && (!dm || r.autor_id === E.konv)) r.vybavene = t; });
        if (id) pridajReakcie([{ id: id, makler_id: S.me.id, autor_id: posl.makler_id || null, druh: dm ? "dm" : "tim", sprava_id: posl.id, akcia: "neskor", pripomenut: d.toISOString(), vybavene: null }]);
        toast("⏰ Pripomeniem " + (k === "rano" ? "zajtra o 8:00" : "o " + d.toLocaleTimeString("sk-SK", { hour: "2-digit", minute: "2-digit" })) + ".");
        zavriObalku(); obnovZvoncek();
      } catch (err) { o.querySelectorAll("button").forEach(function (x) { x.disabled = false; }); toast(chybaText(err), true); }
      return;
    }
    if (a === "ignorovat") {
      o.querySelectorAll("button").forEach(function (x) { x.disabled = true; });
      try {
        var mena = [];
        if (dm) { await rpc("ignorovat_spravu", { p_druh: "dm", p_sprava: posl.id }); oznacLokalnePrecitane(E.konv); mena.push(krstneMeno(E.konv)); }
        else {
          var posledne = {};
          E.spravy.forEach(function (x) { posledne[x.makler_id || "sys"] = x; });
          var zoz = Object.keys(posledne).map(function (k) { return posledne[k]; });
          for (var i = 0; i < zoz.length; i++) { await rpc("ignorovat_spravu", { p_druh: "tim", p_sprava: zoz[i].id }); if (zoz[i].makler_id) mena.push(krstneMeno(zoz[i].makler_id)); }
          var najnov = E.spravy.reduce(function (x, y) { return new Date(x.vytvorene) > new Date(y.vytvorene) ? x : y; }).vytvorene;
          if (!S.me.chat_precitane || new Date(S.me.chat_precitane) < new Date(najnov)) S.me.chat_precitane = najnov;
        }
        vybavKonv(E.konv);
        toast("🙈 Správa je ignorovaná" + (mena.length ? " – " + mena.join(" a ") + (mena.length > 1 ? " dostanú" : " dostane") + " oznámenie." : "."));
        zavriObalku(); popisChat(); kresliKonverzacie(); obnovZvoncek();
      } catch (err) { o.querySelectorAll("button").forEach(function (x) { x.disabled = false; }); toast(chybaText(err), true); }
    }
  }
  // obálka sa otvorí, list vyjde von a ukážu sa správy aj s rýchlou odpoveďou
  function citajObalku() {
    var E = S.obalkaAkt, o = $("#obalka"); if (!E || !o) return;
    var dm = !!E.konv;
    o.dataset.stav = "otvorena";
    o.querySelector(".obalka-karta").classList.add("otvorena");
    if (dm) { oznacLokalnePrecitane(E.konv); rpc("sukromne_precitane", { p_od: E.konv }).catch(function () {}); }
    else timPrecitany();
    vybavKonv(E.konv); popisChat(); kresliKonverzacie(); obnovZvoncek();
    var zoz = E.spravy.slice(-4), p = o.querySelector('[data-ob-panel="list"]');
    p.innerHTML = (E.spravy.length > 4 ? '<div class="meta ob-viac">+ ' + (E.spravy.length - 4) + " starších v konverzácii</div>" : "") +
      '<div class="ob-spravy">' + zoz.map(function (m) {
        return '<div class="ob-sprava">' + (!dm ? '<b class="ob-kto">' + esc(m.makler_id ? meno(m.makler_id) : "Tím Alpha Reality") + "</b>" : "") +
          "<p>" + textSpravy(m.text) + '</p><time class="meta">' + esc(casKonverzacie(m.vytvorene)) + "</time></div>";
      }).join("") + "</div>" +
      '<form class="ob-odp"><input type="text" maxlength="2000" placeholder="' + esc(dm ? "Odpovedať " + krstneMeno(E.konv) + "…" : "Odpovedať tímu…") + '" aria-label="Rýchla odpoveď">' +
      '<button type="submit" aria-label="Odoslať"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.4 20.4 21 12 3.4 3.6 3.4 10l12.6 2-12.6 2z" fill="currentColor"/></svg></button></form>' +
      '<div class="ob-rad"><button class="btn" type="button" data-ob="otvor">Otvoriť konverzáciu →</button><button class="btn ghost" type="button" data-ob="zavriet">Zavrieť</button></div>';
    panelObalky("list");
    var inp = p.querySelector("input");
    if (window.matchMedia("(pointer: fine)").matches) setTimeout(function () { inp.focus({ preventScroll: true }); }, 450);
    p.querySelector(".ob-odp").onsubmit = async function (e) {
      e.preventDefault();
      var v = inp.value.trim(); if (!v) return;
      inp.disabled = true;
      try {
        if (dm) await rpc("poslat_sukromnu_spravu", { p_komu: E.konv, p_text: v });
        else { await rpc("poslat_spravu", { p_text: v }); S.me.chat_precitane = posledneTim(); }
        toast(dm ? "🔒 Odpoveď pre " + krstneMeno(E.konv) + " je odoslaná." : "💬 Odpoveď je odoslaná.");
        zavriObalku(); chatNove();
      } catch (err) { inp.disabled = false; toast(chybaText(err), true); }
    };
  }
  function zavriObalku() {
    var o = $("#obalka"), E = S.obalkaAkt;
    S.obalky = (S.obalky || []).filter(function (e) { return e !== E; });
    S.obalkaAkt = null;
    if (S.obalkaEsc) { document.removeEventListener("keydown", S.obalkaEsc); S.obalkaEsc = null; }
    if (o) { o.classList.add("odchadza"); setTimeout(function () { o.remove(); setTimeout(ukazObalku, 350); }, 220); }
    else setTimeout(ukazObalku, 350);
  }
  // pri otvorení aplikácie: správy, ktoré prišli, kým bola zatvorená (každá vyskočí len raz na zariadení)
  function obalkyPoSpusteni() {
    if (!S.me || !maSekciu("chat")) return;
    var lt = citajLS("tim"), ld = citajLS("dm");
    if (!lt) pisLS("tim", S.chatMax || 1);
    var od = S.me.chat_precitane ? new Date(S.me.chat_precitane).getTime() : 0;
    var t = lt ? S.chat.filter(function (m) { return m.makler_id !== S.me.id && m.id > lt && new Date(m.vytvorene).getTime() > od; }) : [];
    var d = S.dm.filter(function (m) { return m.komu_id === S.me.id && !m.precitane && m.id > ld; }).map(normDm);
    pisLS("dm", S.dmMax || 1);
    var vsetky = t.concat(d).sort(function (a, b) { return new Date(a.vytvorene) - new Date(b.vytvorene); });
    if (vsetky.length) upozornNaSpravy(vsetky, { ticho: true });
    var li = citajLS("ign");
    ignoracieNevidene().filter(function (r) { return r.id > li; }).forEach(zaradIgnoraciu);
    skontrolujOdlozene();
  }
  function skontrolujOdlozene() {
    var t = Date.now();
    odlozeneCakajuce().filter(function (r) { return new Date(r.pripomenut).getTime() <= t; }).forEach(async function (r) {
      r.vybavene = new Date().toISOString();
      var ok = await rpc("vybavit_odlozenu", { p_id: r.id }).catch(function () { return false; });
      if (!ok) return;
      var zoz = neprecitaneKonv(r.druh === "dm" ? r.autor_id : "");
      if (!zoz.length) return obnovZvoncek();
      if (nastChat("zvuk")) cinknut();
      upozornNaSpravy(zoz, { pripomienka: true, ticho: true });
    });
  }
  // nové oznámenia, že niekto ignoroval moju správu
  function ohlasIgnoracie(nove) {
    nove.filter(function (r) { return r.akcia === "ignorovane" && r.autor_id === S.me.id && !r.videne_autorom; }).forEach(function (r) {
      var kto = meno(r.makler_id), slovo = rod(r.makler_id, "ignoroval", "ignorovala");
      if (nastChat("zvuk")) cinknut();
      zaradIgnoraciu(r);
      systemoveUpozornenie("🙈 " + kto + " " + slovo + " vašu správu", textIgnorovanej(r), "typek-ign-" + r.id, "chat" + (r.druh === "dm" ? "/" + r.makler_id : ""));
    });
  }
  function zaradIgnoraciu(r) {
    pisLS("ign", r.id);
    if (!nastChat("popup")) return toast("🙈 " + meno(r.makler_id) + " " + rod(r.makler_id, "ignoroval", "ignorovala") + " vašu správu – pozrite zvonček 🔔");
    S.obalky = S.obalky || [];
    if (S.obalky.some(function (e) { return e.ign && e.ign.id === r.id; })) return;
    S.obalky.push({ konv: "ign:" + r.id, ign: r, spravy: [] });
    ukazObalku();
  }
  function textIgnorovanej(r) {
    var m = r.druh === "dm" ? S.dm.find(function (x) { return x.id === r.sprava_id; }) : S.chat.find(function (x) { return x.id === r.sprava_id; });
    return m ? m.text : "";
  }
  function kedyOdlozene(iso) {
    var d = new Date(iso), dnes = new Date(); dnes.setHours(0, 0, 0, 0);
    var cas = d.toLocaleTimeString("sk-SK", { hour: "2-digit", minute: "2-digit" }), dni = Math.round((new Date(d).setHours(0, 0, 0, 0) - dnes) / 864e5);
    return dni <= 0 ? "dnes o " + cas : dni === 1 ? "zajtra o " + cas : datum(iso, true);
  }
  // ---------- správy vo zvončeku
  function pocetDoZvoncka() { return maSekciu("chat") ? pocetNeprecitanych() + ignoracieNevidene().length : 0; }
  function obnovZvoncek() { popisZvoncek(); if (S.zvonOpen && !S.pripForm) vykresliZvoncek(); }
  function zvonSpravyHtml() {
    if (!S.me || !maSekciu("chat")) return "";
    var konv = [];
    var t = neprecitaneKonv("");
    if (t.length) konv.push(["", t]);
    var kol = {};
    S.dm.forEach(function (m) { if (m.komu_id === S.me.id && !m.precitane) (kol[m.od_id] = kol[m.od_id] || []).push(normDm(m)); });
    Object.keys(kol).forEach(function (k) { konv.push([k, kol[k]]); });
    konv.sort(function (a, b) { return new Date(b[1][b[1].length - 1].vytvorene) - new Date(a[1][a[1].length - 1].vytvorene); });
    var ign = ignoracieNevidene().slice().reverse();
    if (!konv.length && !ign.length) return "";
    var n = konv.reduce(function (s, k) { return s + k[1].length; }, 0);
    var h = '<div class="zvon-spravy">';
    if (konv.length) h += "<h4>✉️ Nové správy (" + n + ")</h4>" + konv.map(function (k) {
      var id = k[0], zoz = k[1], m = zoz[zoz.length - 1], odl = odlozenaKonv(id), c = zoz.length;
      return '<div class="zs-pol">' + (id ? avatar(id, 36) : '<span class="zs-tim">' + ikona("chat") + "</span>") +
        '<div class="zs-text"><div class="zs-hl"><b>' + esc(id ? meno(id) : "Spoločný chat") + '</b><span class="meta">' + c + (c === 1 ? " nová" : c <= 4 ? " nové" : " nových") + " · " + esc(casKonverzacie(m.vytvorene)) + "</span></div>" +
        '<div class="zs-nahlad">' + (id ? "🔒 " : m.makler_id ? esc(krstneMeno(m.makler_id)) + ": " : "") + esc(m.text) + "</div>" +
        (odl ? '<div class="zs-odl">⏰ Pripomeniem ' + esc(kedyOdlozene(odl.pripomenut)) + "</div>" : "") + "</div>" +
        '<button class="btn primary" type="button" data-zvon-konv="' + esc(id) + '">Prečítať</button></div>';
    }).join("");
    if (ign.length) h += '<h4>🙈 Ignorované vaše správy (' + ign.length + ")</h4>" + ign.map(function (r) {
      var txt = textIgnorovanej(r);
      return '<div class="zs-pol zs-ign">' + avatar(r.makler_id, 36) + '<div class="zs-text"><div class="zs-hl"><span><b>' + esc(meno(r.makler_id)) + "</b> " + rod(r.makler_id, "ignoroval", "ignorovala") +
        " vašu správu" + (r.druh === "tim" ? " v spoločnom chate" : "") + '</span><span class="meta">' + esc(casKonverzacie(r.vytvorene)) + "</span></div>" +
        (txt ? '<div class="zs-nahlad">„' + esc(txt) + "“</div>" : "") + "</div>" +
        '<button class="btn ghost" type="button" data-zvon-ign="' + r.id + '">OK</button></div>';
    }).join("") + (ign.length > 1 ? '<button class="btn ghost zs-vsetky" type="button" data-zvon-ign="vsetky">Vymazať všetky oznámenia</button>' : "");
    return h + "</div>";
  }
  document.addEventListener("click", function (e) {
    var k = e.target.closest("[data-zvon-konv]");
    if (k) { S.zvonOpen = false; vykresliZvoncek(); otvorKonverzaciu(k.dataset.zvonKonv || null); return; }
    var g = e.target.closest("[data-zvon-ign]");
    if (!g) return;
    var vsetky = g.dataset.zvonIgn === "vsetky", id = Number(g.dataset.zvonIgn), t = new Date().toISOString();
    S.reak.forEach(function (r) { if (r.akcia === "ignorovane" && r.autor_id === S.me.id && !r.videne_autorom && (vsetky || r.id === id)) r.videne_autorom = t; });
    rpc("ignoracie_videne", { p_ids: vsetky ? null : [id] }).catch(function () {});
    obnovZvoncek();
  });
  // správy, ktoré niekto medzičasom zmazal, zmiznú aj u ostatných; odosielateľ uvidí, že kolega správu prečítal
  async function synchChat() {
    if (Date.now() - (S.chatSynch || 0) < 12000) return;
    S.chatSynch = Date.now();
    var prekreslit = false, znacka = false;
    if (S.chat.length) {
      var r = await sb.from("spravy").select("id").gte("id", S.chat[0].id).lte("id", S.chatMax).limit(1000);
      if (!r.error) {
        var ok = {}; r.data.forEach(function (x) { ok[x.id] = true; });
        var zost = S.chat.filter(function (m) { return ok[m.id]; });
        if (zost.length !== S.chat.length) { S.chat = zost; if (!S.chatS) prekreslit = true; }
      }
    }
    if (S.dm.length) {
      var d = await sb.from("sukromne_spravy").select("id,precitane").gte("id", S.dm[0].id).lte("id", S.dmMax).limit(1000);
      if (!d.error) {
        var st = {}; d.data.forEach(function (x) { st[x.id] = x; });
        S.dm = S.dm.filter(function (m) {
          var x = st[m.id], tu = S.chatS && partner(m) === S.chatS;
          if (!x) { if (tu) prekreslit = true; return false; }
          if (m.od_id === S.me.id && !m.precitane && x.precitane) { m.precitane = x.precitane; if (tu) znacka = true; }
          return true;
        });
      }
    }
    if (S.tab !== "chat") return;
    if (prekreslit) vykresliChat(); else if (znacka) znackaPrecitania();
  }
  function neprecTim() {
    var od = S.me.chat_precitane ? new Date(S.me.chat_precitane).getTime() : 0;
    return S.chat.filter(function (m) { return m.makler_id !== S.me.id && new Date(m.vytvorene).getTime() > od; }).length;
  }
  function neprecOd(id) {
    return S.dm.filter(function (m) { return m.komu_id === S.me.id && !m.precitane && (!id || m.od_id === id); }).length;
  }
  function pocetNeprecitanych() { return neprecTim() + neprecOd(); }
  function popisChat() {
    var n = S.me ? pocetNeprecitanych() : 0;
    document.querySelectorAll("[data-chat-n]").forEach(function (b) { b.hidden = n === 0; b.textContent = n > 99 ? "99+" : String(n); });
    popisZvoncek();
  }
  function oznacLokalnePrecitane(od) {
    var t = new Date().toISOString();
    S.dm.forEach(function (m) { if (m.komu_id === S.me.id && m.od_id === od && !m.precitane) m.precitane = t; });
  }
  function oznacPrecitane() {
    if (!pozera()) return;
    if (S.reak) vybavKonv(S.chatS || "");
    if (!S.chatS) {
      if (neprecTim() === 0) return;
      timPrecitany();
    } else {
      if (!neprecOd(S.chatS)) return;
      oznacLokalnePrecitane(S.chatS);
      rpc("sukromne_precitane", { p_od: S.chatS }).catch(function () {});
    }
    popisChat(); kresliKonverzacie(); obnovZvoncek();
  }
  function denSpravy(iso) {
    var d = new Date(iso), dnes = new Date(); dnes.setHours(0, 0, 0, 0);
    var t = new Date(d); t.setHours(0, 0, 0, 0);
    var rozdiel = Math.round((dnes - t) / 864e5);
    if (rozdiel === 0) return "Dnes";
    if (rozdiel === 1) return "Včera";
    return d.toLocaleDateString("sk-SK", { weekday: "long", day: "numeric", month: "numeric", year: d.getFullYear() === dnes.getFullYear() ? undefined : "numeric" });
  }
  function casKonverzacie(iso) {
    var d = new Date(iso), dnes = new Date(); dnes.setHours(0, 0, 0, 0);
    if (d >= dnes) return d.toLocaleTimeString("sk-SK", { hour: "2-digit", minute: "2-digit" });
    if (dnes - d < 864e5) return "včera";
    if (dnes - d < 6 * 864e5) return d.toLocaleDateString("sk-SK", { weekday: "short" });
    return d.toLocaleDateString("sk-SK", { day: "numeric", month: "numeric" });
  }
  function textSpravy(t) {
    return esc(t).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
  }
  function odtienMena(id) { var h = 0; String(id || "").split("").forEach(function (c) { h = (h * 31 + c.charCodeAt(0)) % 360; }); return h; }
  var IKONA_KOS = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13M10 11v6M14 11v6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  function htmlSpravy(m, predosla) {
    var ja = m.makler_id === S.me.id, h = "";
    if (!m.makler_id) {
      if (!predosla || denSpravy(predosla.vytvorene) !== denSpravy(m.vytvorene)) h += '<div class="chat-den"><span>' + esc(denSpravy(m.vytvorene)) + "</span></div>";
      return h + '<div class="sprava-sys ' + esc(m.typ || "") + '" data-sprava="' + m.id + '"><span>' + textSpravy(m.text) + "</span><time>" +
        new Date(m.vytvorene).toLocaleTimeString("sk-SK", { hour: "2-digit", minute: "2-digit" }) + "</time></div>";
    }
    if (!predosla || denSpravy(predosla.vytvorene) !== denSpravy(m.vytvorene)) h += '<div class="chat-den"><span>' + esc(denSpravy(m.vytvorene)) + "</span></div>";
    var spojit = predosla && predosla.makler_id === m.makler_id && denSpravy(predosla.vytvorene) === denSpravy(m.vytvorene) &&
      new Date(m.vytvorene) - new Date(predosla.vytvorene) < 5 * 60000 && !h;
    var cas = new Date(m.vytvorene).toLocaleTimeString("sk-SK", { hour: "2-digit", minute: "2-digit" });
    var zmaz = m.dm ? (ja ? '<button type="button" class="sprava-x" data-zmaz-dm="' + m.id + '" title="Zmazať správu" aria-label="Zmazať správu">' + IKONA_KOS + "</button>" : "")
      : (ja || admin() ? '<button type="button" class="sprava-x" data-zmaz-spravu="' + m.id + '" title="Zmazať správu" aria-label="Zmazať správu">' + IKONA_KOS + "</button>" : "");
    return h + '<div class="sprava' + (ja ? " ja" : "") + (spojit ? " spojena" : "") + '" data-sprava="' + m.id + '">' +
      (!ja ? '<span class="sprava-av">' + (spojit ? "" : avatar(m.makler_id, 36)) + "</span>" : "") +
      '<div class="sprava-telo">' + (!ja && !spojit && !m.dm ? '<div class="sprava-meno" style="--h:' + odtienMena(m.makler_id) + '">' + esc(meno(m.makler_id)) + "</div>" : "") +
      '<div class="bublina">' + textSpravy(m.text) + '<span class="sprava-cas">' + cas + "</span></div></div>" + zmaz + "</div>";
  }
  // pod mojou poslednou súkromnou správou: Doručené / Prečítané
  function znackaPrecitania() {
    var box = $("#chat-spravy"); if (!box) return;
    box.querySelectorAll(".sprava-stav").forEach(function (x) { x.remove(); });
    if (!S.chatS) return;
    var zoz = oknoSpravy(), m = zoz[zoz.length - 1];
    if (!m || m.makler_id !== S.me.id) return;
    var el = box.querySelector('[data-sprava="' + m.id + '"]'); if (!el) return;
    var ign = (S.reak || []).find(function (r) { return r.akcia === "ignorovane" && r.druh === "dm" && r.autor_id === S.me.id && r.makler_id === S.chatS && r.sprava_id === m.id; });
    if (ign) return el.insertAdjacentHTML("afterend", '<div class="sprava-stav ign">🙈 ' + rod(S.chatS, "Ignoroval", "Ignorovala") + " " + esc(casKonverzacie(ign.vytvorene)) + "</div>");
    el.insertAdjacentHTML("afterend", '<div class="sprava-stav' + (m.precitane ? " prec" : "") + '">' + (m.precitane ? "✓✓ Prečítané " +
      casKonverzacie(m.precitane) : "✓ Doručené") + "</div>");
  }
  // zoznam konverzácií: celý tím + každý kolega zvlášť
  function kresliKonverzacie() {
    var el = $("#chat-kto"); if (!el) return;
    var posl = {};
    S.dm.forEach(function (m) { posl[partner(m)] = m; });
    var kolegovia = clenoviaChatu().filter(function (m) { return m.id !== S.me.id; });
    kolegovia.sort(function (a, b) {
      var pa = posl[a.id], pb = posl[b.id];
      if (pa && pb) return pb.id - pa.id;
      if (pa || pb) return pa ? -1 : 1;
      return String(a.meno || a.email).localeCompare(String(b.meno || b.email), "sk");
    });
    var tPosl = S.chat[S.chat.length - 1], nT = neprecTim();
    function pol(id, av, cele, krstne, nahlad, cas, n, on) {
      var akt = (S.chatS || "") === id;
      return '<button type="button" class="kto-pol' + (akt ? " akt" : "") + (n ? " nove" : "") + '" data-konv="' + esc(id) + '"' + (akt ? ' aria-current="true"' : "") + ">" +
        '<span class="kto-av' + (on ? " on" : "") + '">' + av + "</span>" +
        '<span class="kto-meno"><span class="kto-cele">' + esc(cele) + '</span><span class="kto-krstne">' + esc(krstne) + "</span></span>" +
        '<span class="kto-cas">' + esc(cas) + "</span>" +
        '<span class="kto-nahlad">' + esc(nahlad) + "</span>" +
        (n ? '<span class="kto-n" aria-label="' + n + ' neprečítané">' + (n > 99 ? "99+" : n) + "</span>" : "") + "</button>";
    }
    var h = pol("", '<span class="kto-tim">' + ikona("chat") + "</span>", "Celý tím", "Tím",
      tPosl ? (tPosl.makler_id === S.me.id ? "Vy: " : tPosl.makler_id ? krstneMeno(tPosl.makler_id) + ": " : "") + tPosl.text : "Správy pre všetkých",
      tPosl ? casKonverzacie(tPosl.vytvorene) : "", nT, false);
    h += kolegovia.map(function (k) {
      var p = posl[k.id];
      return pol(k.id, avatar(k.id, 40), k.meno || k.email, krstneMeno(k.id),
        p ? (p.od_id === S.me.id ? "Vy: " : "") + p.text : "🔒 Napísať súkromne",
        p ? casKonverzacie(p.vytvorene) : "", neprecOd(k.id), jeOnline(k));
    }).join("");
    el.innerHTML = h;
  }
  function vykresliChat() {
    var el = $("#obsah"); if (!el) return;
    var hm = decodeURIComponent(location.hash).match(/^#chat\/([0-9a-f-]{36})$/i);
    if (hm) { S.chatS = hm[1]; history.replaceState({ tab: "chat" }, "", "#chat"); }
    var clenovia = clenoviaChatu();
    var s = S.chatS ? S.mById[S.chatS] : null;
    if (S.chatS && (!s || s.id === S.me.id || clenovia.indexOf(s) < 0)) { S.chatS = null; s = null; }
    // rozpísaná správa ostane pri každej konverzácii zvlášť
    S.chatKoncepty = S.chatKoncepty || {};
    var stare = $("#chat-text"); if (stare) S.chatKoncepty[stare.dataset.konv || ""] = stare.value;
    var koncept = S.chatKoncept || S.chatKoncepty[S.chatS || ""] || "";
    S.chatKoncept = ""; S.chatKoncepty[S.chatS || ""] = "";
    var zoz = oknoSpravy();
    var online = clenovia.filter(jeOnline).length;
    var hlava;
    if (s) {
      var zena = s.pohlavie === "zena";
      var stav = jeOnline(s) ? '<span class="chat-online">online</span>' :
        s.naposledy_aktivny ? (zena ? "aktívna " : "aktívny ") + esc(ago(s.naposledy_aktivny)) : "";
      hlava = '<div class="chat-titul"><span class="kto-av' + (jeOnline(s) ? " on" : "") + '">' + avatar(s.id, 38) + "</span><div><h3>" + esc(s.meno || s.email) + "</h3>" +
        '<span class="meta">🔒 Súkromne, len vy dvaja' + (stav ? " · " + stav : "") + "</span></div></div>";
    } else {
      hlava = '<div class="chat-titul"><span class="chat-ik">' + ikona("chat") + "</span><div><h3>Chat tímu</h3>" +
        '<span class="meta">' + clenovia.length + " " + (clenovia.length >= 2 && clenovia.length <= 4 ? "členovia" : "členov") + ' · <span class="chat-online">' + online + " online</span></span></div></div>" +
        '<div class="chat-clenovia">' + clenovia.slice(0, 8).map(function (m) {
          return '<span class="chat-clen' + (jeOnline(m) ? " on" : "") + '" title="' + esc((m.meno || m.email) + (jeOnline(m) ? " · online" : "")) + '">' + avatar(m.id, 30) + "</span>";
        }).join("") + (clenovia.length > 8 ? '<span class="chat-clen viac">+' + (clenovia.length - 8) + "</span>" : "") + "</div>";
    }
    var prazdne = s ? '<div class="prazdne"><span class="kto-av">' + avatar(s.id, 64) + "</span><b>Zatiaľ ste si nepísali</b><span class=\"meta\">Správu uvidí len " + esc(krstneMeno(s.id)) + ". Keď ju dostane, vyskočí " + (s.pohlavie === "zena" ? "jej" : "mu") + " okno s rýchlou odpoveďou.</span></div>"
      : '<div class="prazdne"><span class="dl-ikona velka">' + ikona("chat") + "</span><b>Zatiaľ žiadne správy</b><span class=\"meta\">Napíšte prvú správu celému tímu.</span></div>";
    var h = '<div class="box chat"><div class="chat-rozl">' +
      '<nav class="chat-kto" aria-label="Konverzácie"><div class="chat-kto-hl"><b>Správy</b><span class="meta">Celému tímu alebo len jednému kolegovi</span></div>' +
      '<div class="chat-kto-zoz" id="chat-kto"></div></nav>' +
      '<div class="chat-hlavny"><div class="chat-hlava">' + hlava +
      '<button type="button" class="chat-nast-btn" id="chat-nast-btn" aria-expanded="' + !!S.chatNast + '" title="Upozornenia" aria-label="Nastavenia upozornení">🔔</button></div>' +
      (S.chatNast ? '<div class="chat-nast"><b>Upozornenia na nové správy</b>' +
        '<label class="toggle"><input type="checkbox" data-chat-nast="popup"' + (nastChat("popup") ? " checked" : "") + "> Okno s obálkou pri novej správe</label>" +
        '<label class="toggle"><input type="checkbox" data-chat-nast="zvuk"' + (nastChat("zvuk") ? " checked" : "") + "> Zvuk pri novej správe</label>" +
        ("Notification" in window ? (Notification.permission === "granted" ? '<span class="meta">✅ Upozornenia mimo aplikácie sú povolené (keď je Týpek otvorený na pozadí).</span>' :
          Notification.permission === "denied" ? '<span class="meta">Upozornenia mimo aplikácie sú v prehliadači zablokované – povoľte ich v nastaveniach stránky.</span>' :
          '<button type="button" class="btn" id="chat-notif">📱 Povoliť upozornenia aj mimo aplikácie</button>') : "") + "</div>" : "") +
      '<div class="chat-spravy" id="chat-spravy">' +
      (zoz.length ? zoz.map(function (m, i) { return htmlSpravy(m, zoz[i - 1]); }).join("") : prazdne) +
      "</div>" +
      '<div class="chat-emoji" id="chat-emoji" hidden>' + ["👍", "👏", "🔥", "😂", "🙏", "💪", "🎉", "🏠", "🔑", "📞", "✅", "❤️"].map(function (x) {
        return '<button type="button" data-emoji="' + x + '" aria-label="Vložiť ' + x + '">' + x + "</button>"; }).join("") + "</div>" +
      '<form class="chat-form" id="f-chat"><button type="button" class="chat-emoji-btn" id="chat-emoji-btn" aria-label="Smajlíky" aria-expanded="false">😊</button>' +
      '<textarea id="chat-text" rows="1" maxlength="2000" data-konv="' + esc(S.chatS || "") + '" placeholder="' + esc(s ? "Napíšte súkromnú správu…" : "Správa pre celý tím…") + '" aria-label="Správa"></textarea>' +
      '<button class="chat-poslat" type="submit" aria-label="Odoslať"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.4 20.4 21 12 3.4 3.6 3.4 10l12.6 2-12.6 2z" fill="currentColor"/></svg></button></form></div></div></div>';
    el.innerHTML = h;
    kresliKonverzacie();
    var akt = el.querySelector(".kto-pol.akt"); if (akt && akt.scrollIntoView) akt.scrollIntoView({ block: "nearest", inline: "nearest" });
    $("#chat-kto").onclick = function (e) {
      var b = e.target.closest("[data-konv]"); if (!b) return;
      var id = b.dataset.konv || null;
      if (id === S.chatS) return;
      S.chatS = id; vykresliChat();
      if (window.matchMedia("(pointer: fine)").matches) $("#chat-text").focus();
    };
    var box = $("#chat-spravy");
    znackaPrecitania();
    vyskaChatu(); box.scrollTop = box.scrollHeight;
    var t = $("#chat-text");
    $("#chat-nast-btn").onclick = function () { S.chatNast = !S.chatNast; vykresliChat(); };
    el.querySelectorAll("[data-chat-nast]").forEach(function (c) { c.onchange = function () { nastavChat(c.dataset.chatNast, c.checked); if (c.checked && c.dataset.chatNast === "zvuk") cinknut(); }; });
    var nb = $("#chat-notif");
    if (nb) nb.onclick = function () { Notification.requestPermission().then(function (v) { toast(v === "granted" ? "✅ Upozornenia sú povolené." : "Upozornenia neboli povolené.", v !== "granted"); vykresliChat(); }); };
    $("#chat-emoji-btn").onclick = function () { var e = $("#chat-emoji"); e.hidden = !e.hidden; this.setAttribute("aria-expanded", String(!e.hidden)); vyskaChatu(); };
    el.querySelectorAll("[data-emoji]").forEach(function (b) {
      b.onclick = function () { var z = t.selectionStart != null ? t.selectionStart : t.value.length, k = t.selectionEnd != null ? t.selectionEnd : z; t.value = t.value.slice(0, z) + b.dataset.emoji + t.value.slice(k); t.focus(); t.selectionStart = t.selectionEnd = z + b.dataset.emoji.length; };
    });
    if (koncept) t.value = koncept;
    t.addEventListener("input", function () { t.style.height = "auto"; t.style.height = Math.min(t.scrollHeight, 160) + "px"; });
    t.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.shiftKey && !e.isComposing && window.matchMedia("(pointer: fine)").matches) { e.preventDefault(); $("#f-chat").requestSubmit(); }
    });
    $("#f-chat").addEventListener("submit", async function (e) {
      e.preventDefault();
      var v = t.value.trim(); if (!v) return;
      var btn = e.target.querySelector(".chat-poslat"); btn.disabled = true;
      var komu = S.chatS;
      try {
        if (komu) { await rpc("poslat_sukromnu_spravu", { p_komu: komu, p_text: v }); oznacLokalnePrecitane(komu); }
        else { await rpc("poslat_spravu", { p_text: v }); S.me.chat_precitane = posledneTim(); }
        t.value = ""; t.style.height = "auto"; await chatNove();
      } catch (err) { toast(chybaText(err), true); }
      btn.disabled = false; t.focus();
    });
    oznacPrecitane();
  }
  // chat vyplní obrazovku – pole na písanie je vždy vidno (aj na mobile s klávesnicou)
  function vyskaChatu() {
    var c = $(".box.chat"), box = $("#chat-spravy"); if (!c || !box) return;
    var vh = window.visualViewport ? window.visualViewport.height : window.innerHeight;
    var hore = c.getBoundingClientRect().top + window.scrollY;
    var dole = window.matchMedia("(max-width: 640px)").matches ? 8 : 24;
    var vyska = Math.max(360, vh - Math.min(hore, vh * 0.45) - dole);
    c.style.height = vyska + "px";
    var bolDole = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
    if (bolDole) box.scrollTop = box.scrollHeight;
  }
  window.addEventListener("resize", function () { if (S.tab === "chat") vyskaChatu(); if (S.tab === "asistent") vyskaAi(); });
  if (window.visualViewport) window.visualViewport.addEventListener("resize", function () { if (S.tab === "chat") { vyskaChatu(); var b = $("#chat-spravy"); if (b && document.activeElement && document.activeElement.id === "chat-text") b.scrollTop = b.scrollHeight; } });
  function pridajSpravy(nove) {
    var box = $("#chat-spravy"); if (!box || !nove.length) return;
    if (box.querySelector(".prazdne")) return vykresliChat();
    if (nove.some(function (m) { return m.typ === "uspech" && m.makler_id == null; })) konfety({ pocet: 120 });
    var dole = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
    var vsetky = oknoSpravy(), start = vsetky.length - nove.length;
    var html = nove.map(function (m, i) { return htmlSpravy(m, vsetky[start + i - 1]); }).join("");
    box.insertAdjacentHTML("beforeend", html.replace(/class="sprava/g, 'class="nova sprava'));
    znackaPrecitania();
    if (dole || nove.some(function (m) { return m.makler_id === S.me.id; })) box.scrollTop = box.scrollHeight;
  }
  document.addEventListener("click", async function (e) {
    var b = e.target.closest("[data-zmaz-spravu]");
    if (!b) return;
    var id = Number(b.dataset.zmazSpravu);
    if (!confirm2("Zmazať správu? Zmizne úplne – neuvidí ju nikto z tímu.")) return;
    var riadok = b.closest(".sprava"); if (riadok) riadok.classList.add("mizne");
    try {
      await rpc("zmazat_spravu", { p_id: id });
      S.chat = S.chat.filter(function (x) { return x.id !== id; });
      setTimeout(vykresliChat, riadok ? 220 : 0);
      toast("Správa je zmazaná.");
    } catch (err) { if (riadok) riadok.classList.remove("mizne"); toast(chybaText(err), true); }
  });
  document.addEventListener("click", async function (e) {
    var b = e.target.closest("[data-zmaz-dm]");
    if (!b) return;
    var id = Number(b.dataset.zmazDm);
    if (!confirm2("Zmazať správu? Zmizne úplne – neuvidí ju ani " + krstneMeno(S.chatS) + ".")) return;
    var riadok = b.closest(".sprava"); if (riadok) riadok.classList.add("mizne");
    try {
      await rpc("zmazat_sukromnu_spravu", { p_id: id });
      S.dm = S.dm.filter(function (x) { return x.id !== id; });
      setTimeout(vykresliChat, riadok ? 220 : 0);
      toast("Správa je zmazaná.");
    } catch (err) { if (riadok) riadok.classList.remove("mizne"); toast(chybaText(err), true); }
  });

  // ------------------------------------------------------------ VÝKON MAKLÉROV (len admin)
  var OBDOBIA = [["tento_tyzden", "Tento týždeň"], ["minuly_tyzden", "Minulý týždeň"], ["tento_mesiac", "Tento mesiac"], ["minuly_mesiac", "Minulý mesiac"], ["30_dni", "Posledných 30 dní"]];
  function rozsahObdobia(k) {
    var d = new Date(); d.setHours(0, 0, 0, 0);
    var pon = new Date(d); pon.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    var zajtra = new Date(d); zajtra.setDate(d.getDate() + 1);
    if (k === "minuly_tyzden") { var od = new Date(pon); od.setDate(pon.getDate() - 7); return [od, pon]; }
    if (k === "tento_mesiac") return [new Date(d.getFullYear(), d.getMonth(), 1), zajtra];
    if (k === "minuly_mesiac") return [new Date(d.getFullYear(), d.getMonth() - 1, 1), new Date(d.getFullYear(), d.getMonth(), 1)];
    if (k === "30_dni") { var t = new Date(zajtra); t.setDate(t.getDate() - 30); return [t, zajtra]; }
    return [pon, zajtra];
  }
  async function nacitajVykon() {
    S.vykonAnim = true;
    var r = rozsahObdobia(S.vykonObd);
    S.vykonNacitava = true; S.vykon = null; vykresliVykon();
    try {
      var w = await Promise.all([rpc("vykon_maklerov", { p_od: r[0].toISOString(), p_do: r[1].toISOString() }),
        rpc("statistiky_ponuk", { p_od: r[0].toISOString(), p_do: r[1].toISOString() }).catch(function () { return null; })]);
      S.vykon = w[0]; S.statPonuk = w[1];
    }
    catch (e) { S.vykon = { chyba: chybaText(e) }; }
    S.vykonNacitava = false;
    vykresliVykon();
  }
  function vykresliVykon() {
    var el = $("#obsah"); if (!el || !admin()) return;
    var r = rozsahObdobia(S.vykonObd), doDen = new Date(r[1].getTime() - 864e5);
    var h = '<div class="box vykon"><div class="vykon-hlava"><h3>📊 Výkon maklérov</h3>' +
      '<div class="seg" role="group">' + OBDOBIA.map(function (o) {
        return '<button type="button" data-obd="' + o[0] + '" aria-pressed="' + (S.vykonObd === o[0]) + '">' + o[1] + "</button>";
      }).join("") + "</div></div>" +
      '<div class="meta">' + datum(r[0].toISOString()) + " – " + datum(doDen.toISOString()) + " · vidíte len vy ako administrátor · súhrn za minulý týždeň vám príde emailom každý pondelok ráno</div>";
    var v = S.vykon;
    if (!v) { el.innerHTML = h + '<div class="meta">Načítavam…</div></div>'; return napojVykon(); }
    if (v.chyba) { el.innerHTML = h + '<div class="error">' + esc(v.chyba) + "</div></div>"; return napojVykon(); }
    var riadky = v.makleri.filter(function (m) { return m.aktivny || m.hovory || m.prevzate || m.sms || m.emaily; });
    function sucet(k) { return riadky.reduce(function (a, m) { return a + Number(m[k] || 0); }, 0); }
    function uspech(m) { return (m.vysledky["Záujem – stretnutie dohodnuté"] || 0) + (m.vysledky["Získaný do ponuky"] || 0); }
    var stlpce = [["prevzate", "Prevzal"], ["hovory", "Hovory"], ["sms", "SMS"], ["emaily", "Email"], ["uspech", "Stretnutie / získaný"], ["uvolnene", "Uvoľnil sám"], ["auto_uvolnene", "Uvoľnené automaticky"], ["schrankovanie", "Schránkovanie"], ["drzi", "Drží teraz"]];
    h += '<div class="vykon-sum"><div><b>' + nf.format(v.nove_sukromne) + "</b><small>nových súkromných inzerátov</small></div>" +
      "<div><b>" + sucet("hovory") + "</b><small>hovorov spolu</small></div>" +
      "<div><b>" + riadky.reduce(function (a, m) { return a + uspech(m); }, 0) + "</b><small>stretnutí / získaných</small></div>" +
      "<div><b>" + sucet("auto_uvolnene") + "</b><small>uvoľnených automaticky</small></div></div>";
    h += grafyVykonu(v, riadky, r);
    h += '<h4 class="graf-nadpis">Tabuľka</h4><div class="tbl-wrap"><table class="tbl vykon-tbl"><thead><tr><th>Maklér</th>' + stlpce.map(function (c) { return "<th>" + c[1] + "</th>"; }).join("") + "</tr></thead><tbody>" +
      riadky.map(function (m) {
        var chips = VYSLEDKY.filter(function (k) { return m.vysledky[k]; }).map(function (k) {
          return '<span class="chip ' + (VYSLEDOK_TRIEDA[k] || "") + '">' + esc(k) + " <b>" + m.vysledky[k] + "</b></span>";
        }).join("");
        return '<tr' + (chips ? ' class="ma-vysl"' : "") + '><td><span class="h-row">' + avatar(m.id, 24) + "<span><b>" + esc(m.meno) + "</b>" +
          '<small class="meta d-block">' + (m.posledna ? "posledný zápis " + datum(m.posledna, true) : "bez zápisu") + "</small>" +
          '<small class="meta d-block">' + onlineStav(m.id).html + "</small></span></span></td>" + stlpce.map(function (c) {
          var x = c[0] === "uspech" ? uspech(m) : m[c[0]];
          return '<td class="num' + (c[0] === "auto_uvolnene" && x ? " zle" : c[0] === "uspech" && x ? " dobre" : "") + '">' + x + "</td>";
        }).join("") + "</tr>" +
          (chips ? '<tr class="vysl-riadok"><td colspan="' + (stlpce.length + 1) + '"><span class="meta">Výsledky hovorov:</span> ' + chips + "</td></tr>" : "");
      }).join("") +
      '<tr class="spolu"><td><b>Spolu</b></td>' + stlpce.map(function (c) {
        return '<td class="num"><b>' + (c[0] === "uspech" ? riadky.reduce(function (a, m) { return a + uspech(m); }, 0) : sucet(c[0])) + "</b></td>";
      }).join("") + "</tr></tbody></table></div>" + statistikyPonukHtml() + "</div>";
    el.innerHTML = h;
    if (S.vykonAnim) { S.vykonAnim = false; animujCisla(el); var g = el.querySelector(".grafy"); if (g) g.classList.add("rast"); }
    napojVykon();
  }
  function statistikyPonukHtml() {
    var R = (S.statPonuk || []).filter(function (m) { return m.aktivny || m.aktivne_predaj || m.aktivne_prenajom || m.predane || m.prenajate; });
    if (!R.length) return "";
    function sum(k) { return R.reduce(function (a, m) { return a + Number(m[k] || 0); }, 0); }
    var st = [["aktivne_predaj", "Ponuky – predaj"], ["aktivne_prenajom", "Ponuky – prenájom"], ["rezervovane", "Rezervované"], ["nove", "Nové v období"], ["predane", "Predané"], ["prenajate", "Prenajaté"], ["obhliadky", "Obhliadky"]];
    return '<h3 class="stat-nadpis">🏠 Ponuky a odmena RK</h3><div class="vykon-sum"><div><b>' + sum("aktivne_predaj") + "</b><small>ponúk na predaj</small></div><div><b>" + sum("aktivne_prenajom") + "</b><small>ponúk na prenájom</small></div>" +
      "<div><b>" + eur(sum("odmena_rk")) + "</b><small>odmena RK z predaných v období</small></div><div><b>" + eur(sum("odmena_potencial")) + "</b><small>odmena RK z aktívnych ponúk</small></div></div>" +
      '<div class="tbl-wrap"><table class="vykon-tab"><thead><tr><th>Maklér</th>' + st.map(function (c) { return '<th class="num">' + c[1] + "</th>"; }).join("") +
      '<th class="num">Odmena RK (obdobie)</th><th class="num">Odmena RK (aktívne)</th><th class="num">Objem ponuky</th><th class="num">Hodnotenie</th></tr></thead><tbody>' +
      R.map(function (m) {
        return "<tr><td>" + avatar(m.id, 22) + " <b>" + esc(m.meno) + "</b></td>" + st.map(function (c) { return '<td class="num">' + (m[c[0]] || 0) + "</td>"; }).join("") +
          '<td class="num"><b>' + (m.odmena_rk ? eur(m.odmena_rk) : "–") + '</b></td><td class="num">' + (m.odmena_potencial ? eur(m.odmena_potencial) : "–") + '</td><td class="num">' + (m.objem_ponuky ? eur(m.objem_ponuky) : "–") +
          '</td><td class="num">' + (m.hodnotenie ? "★ " + String(m.hodnotenie).replace(".", ",") : "–") + "</td></tr>";
      }).join("") + '<tr class="spolu"><td><b>Spolu</b></td>' + st.map(function (c) { return '<td class="num"><b>' + sum(c[0]) + "</b></td>"; }).join("") +
      '<td class="num"><b>' + eur(sum("odmena_rk")) + '</b></td><td class="num"><b>' + eur(sum("odmena_potencial")) + '</b></td><td class="num"><b>' + eur(sum("objem_ponuky")) + "</b></td><td></td></tr></tbody></table></div>" +
      '<p class="meta">Odmena RK = „Časť provízie pre RK“ z interných údajov ponuky (pri % sa počíta z ceny). Predané v období = ponuky, ktorým sa v tomto období zmenil stav na Predané.</p>';
  }
  function animPanel() {
    document.body.setAttribute("data-anim-panel", "");
    clearTimeout(S.animPT); S.animPT = setTimeout(function () { document.body.removeAttribute("data-anim-panel"); }, 600);
  }
  // čísla „nabehnú“ od nuly
  function animujCisla(root) {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    root.querySelectorAll(".stat b, .vykon-sum b").forEach(function (b) {
      var ciel = Number(String(b.textContent).replace(/\s/g, "").replace(/\u00a0/g, ""));
      if (!isFinite(ciel) || ciel < 2) return;
      var t0 = performance.now(), d = 700;
      (function krok(t) {
        var p = Math.min(1, (t - t0) / d), e = 1 - Math.pow(1 - p, 3);
        b.textContent = nf.format(Math.round(ciel * e));
        if (p < 1) requestAnimationFrame(krok);
      })(t0);
    });
  }
  var TYPY_KONTAKTU = [["hovory", "Hovory", "s1"], ["sms", "SMS", "s2"], ["emaily", "Email", "s3"]];
  function legendaKontaktov() {
    return '<div class="graf-legenda">' + TYPY_KONTAKTU.map(function (t) { return '<span><i class="' + t[2] + '"></i>' + t[1] + "</span>"; }).join("") + "</div>";
  }
  function tipKontaktov(nadpis, o) {
    return "<b>" + esc(nadpis) + "</b>" + TYPY_KONTAKTU.map(function (t) { return '<span><i class="' + t[2] + '"></i>' + t[1] + " <b>" + (o[t[0]] || 0) + "</b></span>"; }).join("") +
      "<span>Spolu <b>" + ((o.hovory || 0) + (o.sms || 0) + (o.emaily || 0)) + "</b></span>";
  }
  function pekneMax(x) {
    if (x <= 4) return 4;
    if (x <= 10) return Math.ceil(x / 2) * 2;
    var k = Math.pow(10, Math.floor(Math.log10(x))) / 2;
    return Math.ceil(x / (2 * k)) * 2 * k;
  }
  function grafyVykonu(v, riadky, r) {
    // 1) kontakty po dňoch – skladané stĺpce
    var poDnoch = {}; (v.dni || []).forEach(function (d) { poDnoch[d.den] = d; });
    var dni = [], d = new Date(r[0]), dnes = new Date(); dnes.setHours(23, 59, 59, 999);
    var koniec = new Date(Math.min(r[1].getTime(), dnes.getTime() + 1));
    while (d < koniec && dni.length < 62) {
      var k = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
      dni.push({ k: k, d: new Date(d), o: poDnoch[k] || {} }); d.setDate(d.getDate() + 1);
    }
    function spolu(o) { return (o.hovory || 0) + (o.sms || 0) + (o.emaily || 0); }
    var maxD = pekneMax(Math.max.apply(null, dni.map(function (x) { return spolu(x.o); }).concat([1])));
    var popisy = dni.length <= 14;
    var DNI_T = ["ne", "po", "ut", "st", "št", "pi", "so"];
    var h = '<div class="grafy"><div class="graf graf-siroky"><div class="graf-hlava"><h4>Kontakty po dňoch</h4>' + legendaKontaktov() + "</div>" +
      '<div class="gs"><div class="gs-os"><span>' + maxD + "</span><span>" + maxD / 2 + "</span><span>0</span></div>" +
      '<div class="gs-plocha"><div class="gs-mriezka"><i></i><i></i><i></i></div><div class="gs-stlpce">' +
      dni.map(function (x) {
        var t = spolu(x.o), nadpis = DNI_T[x.d.getDay()] + " " + x.d.getDate() + ". " + (x.d.getMonth() + 1) + ".";
        return '<div class="gs-den" data-tip="' + esc(tipKontaktov(nadpis, x.o)) + '" tabindex="-1">' +
          '<div class="gs-stack" style="height:' + (t / maxD * 100) + '%">' +
          TYPY_KONTAKTU.map(function (tt) { var n = x.o[tt[0]] || 0; return n ? '<i class="' + tt[2] + '" style="flex-grow:' + n + '"></i>' : ""; }).join("") + "</div>" +
          (popisy && t ? '<b class="gs-val" style="bottom:' + (t / maxD * 100) + '%">' + t + "</b>" : "") + "</div>";
      }).join("") + "</div></div></div>" +
      '<div class="gs-x">' + dni.map(function (x, i) {
        var ukaz = popisy || x.d.getDay() === 1 || i === 0;
        return "<span>" + (ukaz ? (popisy ? DNI_T[x.d.getDay()] + "<br>" : "") + x.d.getDate() + "." : "") + "</span>";
      }).join("") + "</div></div>";

    // 2) kontakty podľa makléra – vodorovné skladané pruhy
    var maxM = Math.max.apply(null, riadky.map(spolu).concat([1]));
    h += '<div class="graf"><div class="graf-hlava"><h4>Kontakty podľa makléra</h4>' + legendaKontaktov() + "</div>" +
      '<div class="gm">' + riadky.slice().sort(function (a, b) { return spolu(b) - spolu(a); }).map(function (m) {
        var t = spolu(m);
        return '<div class="gm-riadok" data-tip="' + esc(tipKontaktov(m.meno, m)) + '" tabindex="-1"><span class="gm-meno">' + esc(m.meno) + "</span>" +
          '<span class="gm-pruh"><span class="gm-stack" style="width:' + (t / maxM * 100) + '%">' +
          TYPY_KONTAKTU.map(function (tt) { var n = m[tt[0]] || 0; return n ? '<i class="' + tt[2] + '" style="flex-grow:' + n + '"></i>' : ""; }).join("") +
          '</span><b class="gm-val">' + t + "</b></span></div>";
      }).join("") + "</div></div>";

    // 3) výsledky hovorov – všetci makléri spolu
    var vys = {}; riadky.forEach(function (m) { Object.keys(m.vysledky || {}).forEach(function (k) { vys[k] = (vys[k] || 0) + m.vysledky[k]; }); });
    var polozky = VYSLEDKY.filter(function (k) { return vys[k]; }), maxV = Math.max.apply(null, polozky.map(function (k) { return vys[k]; }).concat([1]));
    var spoluV = polozky.reduce(function (a, k) { return a + vys[k]; }, 0);
    h += '<div class="graf"><div class="graf-hlava"><h4>Výsledky hovorov</h4><span class="meta">' + spoluV + " hovorov</span></div>" +
      (polozky.length ? '<div class="gm">' + polozky.map(function (k) {
        return '<div class="gm-riadok" data-tip="' + esc("<b>" + esc(k) + "</b><span>" + vys[k] + " z " + spoluV + " hovorov (" + Math.round(vys[k] / spoluV * 100) + " %)</span>") + '" tabindex="-1">' +
          '<span class="gm-meno">' + esc(k) + '</span><span class="gm-pruh"><span class="gm-stack" style="width:' + (vys[k] / maxV * 100) + '%"><i class="s1" style="flex-grow:1"></i></span>' +
          '<b class="gm-val">' + vys[k] + "</b></span></div>";
      }).join("") + "</div>" : '<div class="meta">V tomto období nie je zapísaný žiadny hovor.</div>') + "</div></div>";
    return h;
  }
  // bublina s údajmi pri grafe (myš aj dotyk)
  (function () {
    var tip = null;
    function ukaz(el, x, y) {
      if (!tip) { tip = document.createElement("div"); tip.className = "graf-tip"; document.body.appendChild(tip); }
      tip.innerHTML = el.dataset.tip; tip.hidden = false;
      var w = tip.offsetWidth, hh = tip.offsetHeight;
      tip.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, x - w / 2)) + "px";
      tip.style.top = Math.max(8, y - hh - 14) + window.scrollY + "px";
      document.querySelectorAll(".graf .aktivny").forEach(function (a) { a.classList.remove("aktivny"); });
      el.classList.add("aktivny");
    }
    function skry() { if (tip) tip.hidden = true; document.querySelectorAll(".graf .aktivny").forEach(function (a) { a.classList.remove("aktivny"); }); }
    document.addEventListener("pointermove", function (e) {
      var el = e.target.closest && e.target.closest(".graf [data-tip]");
      if (el) ukaz(el, e.clientX, e.clientY); else if (e.pointerType === "mouse") skry();
    });
    document.addEventListener("pointerdown", function (e) {
      var el = e.target.closest && e.target.closest(".graf [data-tip]");
      if (el) ukaz(el, e.clientX, e.clientY); else skry();
    });
    window.addEventListener("scroll", function () { if (tip && !tip.hidden) skry(); }, { passive: true });
  })();
  function napojVykon() {
    document.querySelectorAll("#obsah [data-obd]").forEach(function (b) {
      b.onclick = function () { S.vykonObd = b.dataset.obd; nacitajVykon(); };
    });
    if (!S.vykon && !S.vykonNacitava) nacitajVykon();
  }

  document.addEventListener("click", async function (e) {
    var b = e.target.closest("#obsah [data-m-act]");
    if (!b) return;
    var tr = b.closest("[data-m]"), id = tr.dataset.m, m = S.mById[id];
    S.hmData = null;
    if (b.dataset.mAct === "ulozit") {
      b.disabled = true; b.textContent = "Ukladám…";
      try {
        await rpc("upravit_maklera", {
          p_id: id, p_meno: tr.querySelector('[data-f="meno"]').value, p_rola: tr.querySelector('[data-f="rola"]').value,
          p_aktivny: tr.querySelector('[data-f="aktivny"]').checked, p_vidi_podhodnotene: tr.querySelector('[data-f="vidi"]').checked,
        });
        var osl = tr.querySelector('[data-f="oslovenie"]').value, mot = tr.querySelector('[data-f="motivacia"]').value;
        if (mot.split("\n").filter(function (x) { return x.trim(); }).length > 5) toast("Uložím prvých 5 viet.", true);
        var mn = tr.querySelector('[data-f="meniny"]').value.trim(), mnD = null;
        if (mn) {
          var mm = mn.match(/^(\d{1,2})\s*[.\/-]\s*(\d{1,2})\.?$/);
          if (!mm || Number(mm[2]) < 1 || Number(mm[2]) > 12 || Number(mm[1]) < 1 || Number(mm[1]) > 31) throw new Error("Meniny zadajte ako deň.mesiac, napr. 9.9.");
          mnD = String(mm[2]).padStart(2, "0") + "-" + String(mm[1]).padStart(2, "0");
        }
        await rpc("upravit_profil_maklera", {
          p_id: id, p_oslovenie: osl, p_motivacia: mot,
          p_narodeniny: tr.querySelector('[data-f="narodeniny"]').value || null, p_nastup: tr.querySelector('[data-f="nastup"]').value || null,
          p_meniny: mnD, p_ciel_hovory: Number(tr.querySelector('[data-f="ciel_hovory"]').value) || null, p_ciel_ziskane: Number(tr.querySelector('[data-f="ciel_ziskane"]').value) || null,
        });
        await Promise.all([nacitajOsobne(), nacitajOslavy()]);
        var rod = tr.querySelector('[data-f="pohlavie"]').value;
        if (rod !== m.pohlavie) await rpc("nastavit_pohlavie", { p_id: id, p_pohlavie: rod });
        await nacitajMaklerov(); toast("Uložené.");
      } catch (err) { toast(chybaText(err), true); }
      vykresliMaklerov();
    }
    if (b.dataset.mAct === "sprievodca") {
      b.disabled = true;
      try { await rpc("obnovit_sprievodcu", { p_id: id }); await nacitajMaklerov(); toast("🧭 " + (m.meno || "Maklérovi") + " sa prehliadka spustí pri najbližšom otvorení aplikácie."); }
      catch (err) { toast(chybaText(err), true); }
      vykresliMaklerov(); return;
    }
    if (b.dataset.mAct === "pochvala") { S.pochvalaEdit = id; vykresliMaklerov(); var pt = document.querySelector("[data-pochvala-text]"); if (pt) pt.focus(); return; }
    if (b.dataset.mAct === "pochvala-zrus") { S.pochvalaEdit = null; vykresliMaklerov(); return; }
    if (b.dataset.mAct === "pochvala-posli") {
      var txt = tr.querySelector("[data-pochvala-text]").value;
      try { await rpc("pochvalit", { p_komu: id, p_text: txt }); S.pochvalaEdit = null; toast("⭐ Pochvala odoslaná – " + oslovenie(m) + " ju uvidí s konfetami."); await nacitajOslavy(); }
      catch (err) { toast(chybaText(err), true); return; }
      vykresliMaklerov(); return;
    }
    if (b.dataset.mAct === "heslo") { S.hesloEdit = id; vykresliMaklerov(); var i = document.querySelector("[data-heslo-nove]"); if (i) i.select(); }
    if (b.dataset.mAct === "heslo-zrus") { S.hesloEdit = null; vykresliMaklerov(); }
    if (b.dataset.mAct === "heslo-ukaz") {
      var v = tr.querySelector(".heslo-val"), skryte = v.textContent.indexOf("•") === 0;
      v.textContent = skryte ? v.dataset.heslo : "••••••••";
      b.classList.toggle("on", skryte);
    }
    if (b.dataset.mAct === "heslo-uloz") {
      var nove = tr.querySelector("[data-heslo-nove]").value.trim();
      if (nove.length < 8) return toast("Heslo musí mať aspoň 8 znakov.", true);
      b.disabled = true;
      try {
        await funkcia({ akcia: "heslo", id: id, heslo: nove });
        S.hesloEdit = null; S.newUser = { email: m.email, heslo: nove, zmena: true }; S.hesla[id] = nove;
        toast("Heslo pre " + (m.meno || m.email) + " je zmenené.");
      } catch (err) { toast(chybaText(err), true); b.disabled = false; return; }
      vykresliMaklerov();
    }
  });

  // ------------------------------------------------------------ PRIPOMIENKY (zvonček)
  function lokalnyCas(d) {
    function d2(n) { return String(n).padStart(2, "0"); }
    return d.getFullYear() + "-" + d2(d.getMonth() + 1) + "-" + d2(d.getDate()) + "T" + d2(d.getHours()) + ":" + d2(d.getMinutes());
  }
  function rychlyCas(kod) {
    var d = new Date();
    if (kod === "1h") { d.setHours(d.getHours() + 1, d.getMinutes(), 0, 0); return d; }
    if (kod === "30d") d.setMonth(d.getMonth() + 1); else d.setDate(d.getDate() + Number(kod.replace("d", "")));
    d.setHours(9, 0, 0, 0);
    return d;
  }
  function formPripomienka(o) {
    o = o || {};
    var cas = o.cas ? new Date(o.cas) : rychlyCas("1d");
    var ciel = "";
    if (o.inzerat_id) { var z = S.inz.find(function (x) { return x.id === o.inzerat_id; }); if (z) ciel = "Inzerát: " + z.nazov; }
    if (o.schrankovanie_id) { var r = S.sch.find(function (x) { return x.id === o.schrankovanie_id; }); if (r) ciel = "Schránkovanie: " + r.lokalita; }
    return '<form data-form="pripomienka" class="prip-form"' +
      ' data-id="' + (o.id || "") + '" data-inzerat="' + esc(o.inzerat_id || "") + '" data-sch="' + (o.schrankovanie_id || "") + '">' +
      "<h4>" + (o.id ? "Upraviť pripomienku" : "🔔 Nová pripomienka") + "</h4>" + (ciel ? '<div class="meta">' + esc(ciel) + "</div>" : "") +
      '<div class="rychle">' + [["1h", "O hodinu"], ["1d", "Zajtra 9:00"], ["3d", "O 3 dni"], ["7d", "O týždeň"], ["30d", "O mesiac"]].map(function (q) {
        return '<button type="button" class="btn ghost" data-rychlo="' + q[0] + '">' + q[1] + "</button>";
      }).join("") + "</div>" +
      '<div class="form-grid"><label class="field"><span>Dátum a čas</span><input type="datetime-local" name="cas" required value="' + lokalnyCas(cas) + '"></label>' +
      (admin() ? '<label class="field"><span>Pre makléra</span><select name="makler">' + S.makleri.filter(function (m) { return m.aktivny; }).map(function (m) {
        return '<option value="' + m.id + '"' + ((o.makler_id || S.me.id) === m.id ? " selected" : "") + ">" + esc(m.meno || m.email) + "</option>";
      }).join("") + "</select></label>" : "") + "</div>" +
      '<label class="field"><span>Poznámka</span><textarea name="poznamka" rows="2" placeholder="napr. Zavolať o mesiac, či ešte predáva">' + esc(o.poznamka || "") + "</textarea></label>" +
      '<div class="form-actions"><button class="btn primary" type="submit">Uložiť pripomienku</button><button class="btn ghost" type="button" data-act="prip-zrus-form">Zrušiť</button></div>' +
      '<small class="meta">V nastavenom čase sa ukáže pri zvončeku a príde aj emailom.</small></form>';
  }

  // ---------- nové súkromné inzeráty zo skenera (zvonček)
  function maxPrvyKrat() {
    var t = null, tm = 0;
    (S.inz || []).forEach(function (z) { var x = new Date(z.prvy_krat).getTime(); if (x > tm) { tm = x; t = z.prvy_krat; } });
    return t;
  }
  function noveInzeraty() {
    if (!S.me || !S.inz || !maSekciu("inzeraty") || !S.me.inzeraty_videne) return [];
    var od = new Date(S.me.inzeraty_videne).getTime();
    return S.inz.filter(function (z) { return z.aktivny && ptyp(z) !== "rk" && new Date(z.prvy_krat).getTime() > od; })
      .sort(function (a, b) { return new Date(b.prvy_krat) - new Date(a.prvy_krat); });
  }
  function inzeratyVidene() {
    if (!S.me || !maSekciu("inzeraty")) return;
    var t = maxPrvyKrat(); if (!t) return;
    if (S.me.inzeraty_videne && new Date(S.me.inzeraty_videne) >= new Date(t)) return;
    S.me.inzeraty_videne = t;
    rpc("inzeraty_videne", { p_cas: t }).catch(function () {});
    obnovZvoncek();
  }
  async function inzeratyNoveNacitaj() {
    if (!S.me || !S.inz || !maSekciu("inzeraty")) return;
    if (!S.me.inzeraty_videne) return inzeratyVidene();   // prvé spustenie – staré inzeráty nehlásime
    var od = maxPrvyKrat(); if (!od) return;
    var r = await sb.from("inzeraty").select("*").is("duplikat_z", null).gt("prvy_krat", od).order("prvy_krat", { ascending: true }).limit(200);
    if (r.error || !r.data.length) return;
    var ma = {}; S.inz.forEach(function (z) { ma[z.id] = true; });
    var nove = r.data.filter(function (z) { return !ma[z.id]; });
    if (!nove.length) return;
    nove.forEach(function (z) { z._t = norm([z.nazov, z.obec, z.predajca, z.popis].join(" ")); });
    S.inz = S.inz.concat(nove);
    var sukr = nove.filter(function (z) { return z.aktivny && ptyp(z) !== "rk"; });
    if (sukr.length) {
      var z = sukr[sukr.length - 1];
      toast("🏠 " + (sukr.length === 1 ? "Nový súkromný inzerát: " + (z.nazov || "") + (z.obec ? " – " + z.obec : "") : sukr.length + " nové súkromné inzeráty v skeneri") + " 🔔");
      if (nastChat("zvuk")) cinknut();
      systemoveUpozornenie("🏠 " + (sukr.length === 1 ? "Nový súkromný inzerát" : sukr.length + " nové súkromné inzeráty"),
        (z.nazov || "") + (z.obec ? " · " + z.obec : "") + (z.cena ? " · " + eur(z.cena) : ""), "typek-inz", "inzeraty");
    }
    if (S.tab === "inzeraty") { vykresliStaty(); vykresliZoznam(); }
    obnovZvoncek();
  }
  function zvonInzeratyHtml() {
    var zoz = noveInzeraty(); if (!zoz.length) return "";
    var moje = (S.me.obce || []).length ? zoz.filter(function (z) { return S.me.obce.indexOf(z.obec) >= 0; }).length : -1;
    return '<div class="zvon-spravy zvon-inz"><h4>🏠 Nové súkromné inzeráty (' + zoz.length + ")" + (moje >= 0 ? " · " + moje + " vo vašich obciach" : "") + "</h4>" +
      zoz.slice(0, 5).map(function (z) {
        return '<div class="zs-pol">' + (z.foto ? '<img class="zs-foto" src="' + esc(z.foto) + '" alt="" loading="lazy" onerror="this.style.visibility=\'hidden\'">' : '<span class="zs-tim">🏠</span>') +
          '<div class="zs-text"><div class="zs-hl"><b>' + esc(z.nazov || TYP[z.typ] || "Inzerát") + '</b><span class="meta">' + esc(casKonverzacie(z.prvy_krat)) + "</span></div>" +
          '<div class="zs-nahlad">' + esc([z.obec, z.cena ? eur(z.cena) : "", PORTAL[z.portal] || z.portal, (PRED[ptyp(z)] || [""])[0]].filter(Boolean).join(" · ")) + "</div></div>" +
          '<button class="btn primary" type="button" data-zvon-inz="' + esc(z.id) + '">Otvoriť</button></div>';
      }).join("") +
      '<div class="zs-tlacidla">' + (zoz.length > 5 ? '<button class="btn" type="button" data-zvon-inz-vsetky>Zobraziť všetkých ' + zoz.length + " v skeneri</button>" :
        '<button class="btn" type="button" data-zvon-inz-vsetky>Otvoriť skener</button>') +
      '<button class="btn ghost" type="button" data-zvon-inz-videne>Označiť ako videné</button></div></div>';
  }
  document.addEventListener("click", function (e) {
    var a = e.target.closest("[data-zvon-inz],[data-zvon-inz-vsetky],[data-zvon-inz-videne]"); if (!a) return;
    if (a.hasAttribute("data-zvon-inz-videne")) { inzeratyVidene(); return; }
    S.zvonOpen = false; vykresliZvoncek();
    if (a.hasAttribute("data-zvon-inz-vsetky")) {
      Object.assign(S.f, { predajca: "sukr", typ: "", okres: "", novost: "", praca: "vsetky", under: false, sort: "novy", q: "" }); ulozFiltre();
      if (S.tab === "inzeraty" && !S.jedenId) { vykresliFiltreInz(); vykresliZoznam(); window.scrollTo(0, 0); } else prejdi("inzeraty");
      return;
    }
    prejdi("inzeraty", a.dataset.zvonInz);
  });
  // ikona karty v prehliadači: logo, pri novej správe alebo pripomienke červený zvonček
  function ikonaKarty(zvon) {
    if (S.ikonaZvon === zvon) return;
    S.ikonaZvon = zvon;
    var linky = document.querySelectorAll('link[rel="icon"]');
    linky.forEach(function (l) { if (!l.dataset.povodna) l.dataset.povodna = l.getAttribute("href"); });
    if (!zvon) { linky.forEach(function (l) { l.href = l.dataset.povodna; }); return; }
    if (!S.ikonaZvonUrl) {
      try {
        var c = document.createElement("canvas"); c.width = c.height = 64;
        var g = c.getContext("2d");
        g.fillStyle = "#2b2f36"; g.beginPath(); if (g.roundRect) g.roundRect(0, 0, 64, 64, 14); else g.rect(0, 0, 64, 64); g.fill();
        g.save(); g.translate(5, 4); g.scale(2.25, 2.25); g.fillStyle = "#e53935";
        g.fill(new Path2D("M12 2a1.6 1.6 0 0 0-1.6 1.6v.7A6.6 6.6 0 0 0 5.4 10.7V15l-2.1 2.6v1.2h17.4v-1.2L18.6 15v-4.3a6.6 6.6 0 0 0-5-6.4v-.7A1.6 1.6 0 0 0 12 2zm-2.7 18a2.7 2.7 0 0 0 5.4 0z"));
        g.restore();
        S.ikonaZvonUrl = c.toDataURL("image/png");
      } catch (e) { return; }
    }
    linky.forEach(function (l) { l.href = S.ikonaZvonUrl; });
  }
  function popisZvoncek() {
    var b = $("#zvon-n");
    if (!b || !S.me) return;
    var p = splatne().length, sp = S.reak ? pocetDoZvoncka() : 0, n = p + sp;
    var ni = S.reak && maSekciu("chat") ? ignoracieNevidene().length : 0, ns = sp - ni, nz = noveInzeraty().length;
    n += nz;
    b.hidden = n === 0; b.textContent = n > 9 ? "9+" : String(n);
    $("#zvon-btn").classList.toggle("ring", n > 0);
    $("#zvon-btn").classList.toggle("ma-spravu", sp > 0);
    ikonaKarty(n > 0);
    var t = [];
    if (ns) t.push(ns + (ns === 1 ? " nová správa" : ns <= 4 ? " nové správy" : " nových správ"));
    if (ni) t.push(ni + (ni === 1 ? " ignorovaná správa" : " ignorované správy"));
    if (nz) t.push(nz + (nz === 1 ? " nový súkromný inzerát" : nz <= 4 ? " nové súkromné inzeráty" : " nových súkromných inzerátov"));
    if (p) t.push(p + (p === 1 ? " pripomienka čaká" : " pripomienky čakajú"));
    $("#zvon-btn").title = t.length ? t.join(", ") : "Upozornenia a pripomienky";
  }

  function vykresliZvoncek() {
    var el = $("#zvon"); if (!el) return;
    if (!S.zvonOpen) { el.innerHTML = ""; return; }
    var t = Date.now(), dnesKoniec = new Date(); dnesKoniec.setHours(23, 59, 59, 999);
    var moje = mojeAktivne();
    var po = moje.filter(function (p) { return new Date(p.cas).getTime() <= t; });
    var dnes = moje.filter(function (p) { var c = new Date(p.cas).getTime(); return c > t && c <= dnesKoniec.getTime(); });
    var neskor = moje.filter(function (p) { return new Date(p.cas).getTime() > dnesKoniec.getTime(); });
    var ostatni = admin() ? S.prip.filter(function (p) { return p.makler_id !== S.me.id && !p.hotovo; }) : [];
    function riadok(p, cudzia) {
      var ciel = "";
      if (p.inzerat_id) { var z = S.inz.find(function (x) { return x.id === p.inzerat_id; }); ciel = '<a href="#" data-prip-inz="' + esc(p.inzerat_id) + '">' + esc(z ? z.nazov : "inzerát") + "</a>"; }
      if (p.nehnutelnost_id) { var pn = (S.ponuky || []).find(function (x) { return x.id === p.nehnutelnost_id; }); ciel = '<a href="#" data-prip-nehn="' + p.nehnutelnost_id + '">🏠 ' + esc(pn ? nazovPonuky(pn) : "ponuka") + "</a>"; }
      if (p.udalost_id) { var ud = (S.udalosti || []).find(function (x) { return x.id === p.udalost_id; }); if (ud) ciel = '<a href="#" data-prip-udalost="' + esc(denKluc(ud.zaciatok)) + '">📅 Otvoriť v kalendári</a>'; }
      if (p.schrankovanie_id) { var r = S.sch.find(function (x) { return x.id === p.schrankovanie_id; }); ciel = '<a href="#" data-prip-sch="' + p.schrankovanie_id + '">Schránkovanie: ' + esc(r ? r.lokalita : "záznam") + "</a>"; }
      var splatna = new Date(p.cas).getTime() <= t;
      return '<div class="prip' + (splatna ? " due" : "") + '" data-prip="' + p.id + '">' +
        '<div class="prip-cas">' + datum(p.cas, true) + "</div>" +
        '<div class="prip-text">' + (cudzia ? avatar(p.makler_id, 20) + " <b>" + esc(meno(p.makler_id)) + "</b> · " : "") + (p.druh && p.druh !== "pripomienka" ? DRUH_IKONA[p.druh] + " " : "") + esc(p.poznamka || "Pripomienka") +
        (ciel ? '<div class="meta">' + ciel + "</div>" : "") +
        (p.vytvoril && p.vytvoril !== p.makler_id ? '<div class="meta">Nastavil: ' + esc(meno(p.vytvoril)) + "</div>" : "") +
        (p.email_chyba ? '<div class="error">Email sa nepodarilo odoslať: ' + esc(p.email_chyba) + "</div>" : p.email_odoslany ? '<div class="meta">✓ Email odoslaný</div>' : "") + "</div>" +
        '<div class="prip-akcie"><button class="btn" type="button" data-prip-act="hotovo">✓ Hotovo</button>' +
        (!p.druh || p.druh === "pripomienka" ? '<button class="btn ghost" type="button" data-prip-act="upravit">Upraviť</button>' : "") +
        '<button class="btn ghost danger" type="button" data-prip-act="zrusit">Zrušiť</button></div></div>';
    }
    function sekcia(nadpis, zoznam, cudzia) {
      return zoznam.length ? "<h4>" + nadpis + " (" + zoznam.length + ")</h4>" + zoznam.map(function (p) { return riadok(p, cudzia); }).join("") : "";
    }
    var spr = zvonSpravyHtml() + zvonInzeratyHtml();
    var h = '<div class="box zvon-box">' + spr + '<div class="zvon-hlava"><h3>🔔 Moje pripomienky</h3>' +
      '<button class="btn primary" type="button" data-act="prip-nova">+ Nová pripomienka</button></div>';
    if (S.pripForm) h += formPripomienka(S.pripForm);
    h += sekcia("Po termíne", po) + sekcia("Dnes", dnes) + sekcia("Neskôr", neskor);
    if (!moje.length && !S.pripForm) h += '<div class="meta">Nemáte žiadne pripomienky. Nastavíte ich tlačidlom „🔔 Pripomenúť“ pri inzeráte alebo v schránkovaní.</div>';
    if (ostatni.length) h += sekcia("Pripomienky ostatných maklérov", ostatni, true);
    el.innerHTML = h + "</div>";
  }

  async function ulozPripomienku(f) {
    var cas = f.cas.value;
    if (!cas) return toast("Zadajte dátum a čas.", true);
    await rpc("ulozit_pripomienku", {
      p_id: f.dataset.id ? Number(f.dataset.id) : null,
      p_makler: f.makler ? f.makler.value : null,
      p_inzerat: f.dataset.inzerat || null,
      p_schrankovanie: f.dataset.sch ? Number(f.dataset.sch) : null,
      p_cas: new Date(cas).toISOString(),
      p_poznamka: f.poznamka.value,
    });
    await nacitajPripomienky();
  }

  document.addEventListener("submit", async function (e) {
    var f = e.target.closest('form[data-form="pripomienka"]');
    if (!f) return;
    e.preventDefault();
    var btn = f.querySelector('button[type="submit"]'); btn.disabled = true;
    try {
      await ulozPripomienku(f);
      toast("Pripomienka je uložená na " + datum(new Date(f.cas.value).toISOString(), true) + ".");
      var karta = f.closest(".card");
      if (karta) { S.open[karta.dataset.id] = null; prekresliKartu(karta.dataset.id); }
      S.pripForm = null; vykresliZvoncek(); popisZvoncek();
      if (S.tab === "schrankovanie") vykresliSchrankovanie();
    } catch (err) { toast(chybaText(err), true); btn.disabled = false; }
  });

  document.addEventListener("click", async function (e) {
    var q = e.target.closest("[data-rychlo]");
    if (q) { var f = q.closest("form"); f.cas.value = lokalnyCas(rychlyCas(q.dataset.rychlo)); return; }
    var a = e.target.closest('[data-act="prip-zrus-form"]');
    if (a) {
      var karta = a.closest(".card");
      if (karta) { S.open[karta.dataset.id] = null; prekresliKartu(karta.dataset.id); }
      else { S.pripForm = null; vykresliZvoncek(); }
      return;
    }
    if (e.target.closest('[data-act="prip-nova"]')) { S.pripForm = {}; vykresliZvoncek(); return; }
    var li = e.target.closest("[data-prip-inz]");
    if (li) {
      e.preventDefault();
      S.zvonOpen = false;
      prejdi("inzeraty", li.dataset.pripInz);
      return;
    }
    var lu = e.target.closest("[data-prip-udalost]");
    if (lu) {
      e.preventDefault(); S.zvonOpen = false; vykresliZvoncek();
      var dk = lu.dataset.pripUdalost; S.kalDen = dk; S.kalMesiac = new Date(Number(dk.slice(0, 4)), Number(dk.slice(5, 7)) - 1, 1).toISOString();
      prejdi("kalendar");
      return;
    }
    var ln = e.target.closest("[data-prip-nehn]");
    if (ln) {
      e.preventDefault(); S.zvonOpen = false; S.tab = "nehnutelnosti"; S.ponukaEdit = null; S.ponukaExport = false; S.pdPanel = null; S.obhForm = null;
      S.ponukaDetail = Number(ln.dataset.pripNehn); history.pushState({ tab: "nehnutelnosti", detail: S.ponukaDetail }, "", "#nehnutelnosti"); vykresli(); window.scrollTo(0, 0);
      return;
    }
    var ls = e.target.closest("[data-prip-sch]");
    if (ls) {
      e.preventDefault();
      var r = S.sch.find(function (x) { return x.id === Number(ls.dataset.pripSch); });
      S.sf.q = r ? r.lokalita : ""; S.sf.makler = ""; S.sf.typ = "";
      S.zvonOpen = false;
      prejdi("schrankovanie");
      return;
    }
    var b = e.target.closest("[data-prip-act]");
    if (!b) return;
    var id = Number(b.closest("[data-prip]").dataset.prip), p = S.prip.find(function (x) { return x.id === id; });
    try {
      if (b.dataset.pripAct === "hotovo") { await rpc("pripomienka_hotovo", { p_id: id, p_hotovo: true }); toast("Hotovo."); }
      if (b.dataset.pripAct === "zrusit") { await rpc("zrusit_pripomienku", { p_id: id }); toast("Pripomienka je zrušená."); }
      if (b.dataset.pripAct === "upravit") { S.pripForm = Object.assign({}, p); vykresliZvoncek(); return; }
      await nacitajPripomienky();
    } catch (err) { toast(chybaText(err), true); }
    vykresliZvoncek(); popisZvoncek();
    if (S.tab === "inzeraty") vykresliZoznam();
  });

  // ------------------------------------------------------------ FOTKY MAKLÉROV
  function fotoVolba(kde, id) {
    if (kde === "makler") {
      return '<div class="foto-volba kompakt" data-foto-kde="makler" data-foto-id="' + id + '">' + avatar(id, 40) +
        '<input type="file" accept="image/*" data-foto-subor hidden>' +
        '<select data-foto-sel aria-label="Zmeniť fotku"><option value="">Zmeniť…</option><option value="__subor">Nahrať fotku</option>' +
        '<option value="avatar:zena">Avatar žena</option><option value="avatar:muz">Avatar muž</option><option value="__ziadna">Bez fotky</option></select></div>';
    }
    return '<div class="foto-volba" data-foto-kde="' + kde + '" data-foto-id="' + (id || "") + '">' + avatar(id, 64) +
      '<div class="foto-btns"><label class="btn">Nahrať fotku<input type="file" accept="image/*" data-foto-subor hidden></label>' +
      '<button class="btn ghost" type="button" data-foto="avatar:zena">' + '<span class="av mini">' + SVG_ZENA + "</span> Žena</button>" +
      '<button class="btn ghost" type="button" data-foto="avatar:muz">' + '<span class="av mini">' + SVG_MUZ + "</span> Muž</button>" +
      '<button class="btn ghost" type="button" data-foto="">Bez fotky</button></div></div>';
  }
  // fotka sa vymení všade, kde je zobrazená – bez prekreslenia stránky (rozpísané údaje ostanú)
  async function nastavFoto(id, hodnota) {
    await rpc("nastavit_foto", { p_id: id, p_foto: hodnota || null });
    await nacitajMaklerov();
    document.querySelectorAll('.av[data-av="' + id + '"]').forEach(function (el) { el.outerHTML = avatar(id, Number(el.dataset.v) || 28); });
    toast(hodnota ? "Fotka je uložená." : "Fotka je odstránená.");
  }
  document.addEventListener("click", function (e) {
    var b = e.target.closest("[data-foto]");
    if (!b) return;
    var box = b.closest("[data-foto-kde]");
    if (box.dataset.fotoKde === "novy") { S.novyFoto = b.dataset.foto || null; vykresliNahladNoveho(); return; }
    nastavFoto(box.dataset.fotoId, b.dataset.foto).catch(function (err) { toast(chybaText(err), true); });
  });
  document.addEventListener("change", function (e) {
    var sel = e.target.closest("[data-foto-sel]");
    if (sel) {
      var v = sel.value, bx = sel.closest("[data-foto-kde]");
      sel.value = "";
      if (v === "__subor") return bx.querySelector("[data-foto-subor]").click();
      if (v) nastavFoto(bx.dataset.fotoId, v === "__ziadna" ? null : v).catch(function (err) { toast(chybaText(err), true); });
      return;
    }
    var inp = e.target.closest("[data-foto-subor]");
    if (!inp || !inp.files[0]) return;
    var box = inp.closest("[data-foto-kde]");
    var subor = inp.files[0]; inp.value = "";
    spracujFoto(subor).then(function (url) {
      if (!url) return;
      if (box.dataset.fotoKde === "novy") { S.novyFoto = url; vykresliNahladNoveho(); return; }
      return nastavFoto(box.dataset.fotoId, url);
    }).catch(function (err) { toast(chybaText(err), true); });
  });
  function vykresliNahladNoveho() {
    var n = $("#novy-nahlad"); if (!n) return;
    var f = S.novyFoto;
    n.innerHTML = f && f.indexOf("data:image/") === 0 ? '<span class="av" style="width:64px;height:64px"><img src="' + esc(f) + '" alt=""></span>' :
      f === "avatar:zena" ? '<span class="av" style="width:64px;height:64px">' + SVG_ZENA + "</span>" :
      f === "avatar:muz" ? '<span class="av" style="width:64px;height:64px">' + SVG_MUZ + "</span>" :
      '<span class="av" style="width:64px;height:64px;font-size:22px">?</span>';
  }

  start().catch(function (e) { $("#app").innerHTML = '<div class="boot">Aplikáciu sa nepodarilo spustiť: ' + esc(chybaText(e)) + "</div>"; });
})();
