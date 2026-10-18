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
  var DRUH_IKONA = { pripomienka: "🔔", uvolnenie: "🔓", cena: "📉" };
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
    f: { q: "", predajca: "vsetci", typ: "", okres: "", novost: "", praca: "vsetky", under: false, sort: "novy", stav: "aktivne" },
    arch: {}, tel: {}, telZdroj: {},
    sf: { q: "", makler: "", typ: "" }, chat: [], chatMax: 0, nehnObd: "aktualne", vykonObd: "tento_tyzden", vykon: null, smsEdit: null,
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
    var styl = ' style="width:' + v + "px;height:" + v + "px;font-size:" + Math.round(v * 0.4) + 'px"';
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
  async function rpc(fn, args) {
    var r = await sb.rpc(fn, args);
    if (r.error) throw r.error;
    return r.data;
  }
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
  async function start() {
    var ses = (await sb.auth.getSession()).data.session;
    if (ses) return poPrihlaseni(ses.user);
    var prve = false;
    try { prve = await rpc("je_prve_spustenie", {}); } catch (e) { /* zobrazíme prihlásenie */ }
    var sprava = null;
    try { sprava = sessionStorage.getItem("typek-odhlaseny"); sessionStorage.removeItem("typek-odhlaseny"); } catch (e) { /* bez správy */ }
    prve ? obrazovkaPrve() : obrazovkaLogin(sprava);
  }

  function obrazovkaLogin(sprava) {
    $("#app").innerHTML =
      '<div class="login"><form class="login-box" id="f-login">' +
      '<span class="lesk"><img class="login-logo" src="logo.png?v=202610181900" alt="Alpha Reality"></span><h1 class="login-nazov">Realitný <span>týpek</span></h1><p>Prihláste sa svojím maklérskym účtom.</p>' +
      '<label class="field"><span>Email</span><input type="email" id="l-email" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" inputmode="email" required></label>' +
      '<label class="field"><span>Heslo</span><input type="password" id="l-heslo" autocomplete="current-password" required></label>' +
      '<div class="error" id="l-err">' + esc(sprava || "") + "</div>" +
      '<button class="btn primary wide" type="submit">Prihlásiť sa</button>' +
      "<p>Účet vám vytvorí administrátor. Ak ste zabudli heslo, požiadajte ho o nové.</p>" + PRAVA + "</form></div>";
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
      '<img class="login-logo" src="logo.png?v=202610181900" alt="Alpha Reality"><h1 class="login-nazov">Realitný <span>týpek</span></h1>' +
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
      await sb.auth.signOut();
      return obrazovkaLogin(r.data && !r.data.aktivny ? "Váš účet je deaktivovaný. Kontaktujte administrátora." : "Účet sa nenašiel. Kontaktujte administrátora.");
    }
    S.me = r.data;
    try { await nacitajNastavenia(); } catch (e) { /* predvolené */ }
    // aplikácia bola zatvorená dlhšie, ako je čas odhlásenia → odhlásime
    var posl = poslednaAktivita();
    if (S.odhlMin > 0 && posl && Date.now() - posl > S.odhlMin * 60000) return odhlasitPreNecinnost();
    zaznamenajAktivitu(true);
    S.tab = tabZAdresy() || "domov";
    history.replaceState({ tab: S.tab }, "", "#" + S.tab);
    try { await nacitajVsetko(); } catch (e) { toast(chybaText(e), true); }
    vykresli();
    setInterval(obnov, 60000);
    setTimeout(ukazPochvalu, 1200);
    spustiOdpocet();
    somTu();
    setInterval(function () { if (S.tab === "chat" && !document.hidden) chatNove(); }, 5000);
    document.addEventListener("visibilitychange", function () { if (!document.hidden) obnov(); });
  }

  // ikona na ploche mobilu (aplikácia)
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", function () { navigator.serviceWorker.register("sw.js").catch(function () {}); });
  }
  var instalacia = null;
  window.addEventListener("beforeinstallprompt", function (e) { e.preventDefault(); instalacia = e; if (S.pwdOpen) vykresliHeslo(); });
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
      '<div class="pochvala-hviezda" aria-hidden="true">⭐</div><h3 id="poch-n">Máš pochvalu, ' + esc(oslovenie(S.me)) + "!</h3>" +
      '<p class="pochvala-text">' + esc(p.text) + "</p>" +
      (S.mById[p.od] ? '<div class="pochvala-podpis">' + avatar(p.od, 26) + "<span>— " + esc(S.mById[p.od].meno) + "</span></div>" : "") +
      '<button class="btn primary wide" type="button">Ďakujem 🙏</button></div>';
    document.body.appendChild(o);
    setTimeout(function () { konfety({ pocet: 180 }); }, 250);
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
    await sb.auth.signOut().catch(function () {});
    history.replaceState(null, "", location.pathname);
    location.reload();
  }

  // ---------- navigácia: každá sekcia je krok v histórii prehliadača (funguje tlačidlo Späť)
  var TABY = ["domov", "inzeraty", "schrankovanie", "nehnutelnosti", "chat", "vykon", "makleri"];
  function tabPovoleny(t) { return TABY.indexOf(t) >= 0 && (admin() || (t !== "vykon" && t !== "makleri")); }
  function tabZAdresy() {
    var t = decodeURIComponent(location.hash.replace(/^#/, "")).split("/")[0];
    return S.me && tabPovoleny(t) ? t : null;
  }
  function prejdi(tab, jeden) {
    if (!tabPovoleny(tab)) tab = "domov";
    if (tab === S.tab && !jeden && !S.jedenId) { S.pwdOpen = false; S.zvonOpen = false; vykresliHeslo(); vykresliZvoncek(); prekresliObsah(); window.scrollTo(0, 0); return; }
    S.tab = tab; S.jedenId = jeden || null; S.shown = 100;
    if (tab === "vykon") S.vykon = null;
    ulozFiltre();
    history.pushState({ tab: tab, jeden: S.jedenId }, "", "#" + tab);
    vykresli(); window.scrollTo(0, 0);
  }
  window.addEventListener("popstate", function (e) {
    if (!S.me) return;
    var st = e.state || { tab: tabZAdresy() || "domov" };
    S.tab = tabPovoleny(st.tab) ? st.tab : "domov";
    S.jedenId = st.jeden || null; S.shown = 100;
    if (S.tab === "vykon") S.vykon = null;
    S.pwdOpen = false; S.zvonOpen = false;
    vykresli(); window.scrollTo(0, 0);
  });

  async function odhlasit() { await sb.auth.signOut(); history.replaceState(null, "", location.pathname); location.reload(); }

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
  // automatické uvoľnenie po 2 dňoch bez zápisu (rovnaké pravidlo ako v databáze)
  function casUvolnenia(z) {
    var p = S.prev[z.id];
    if (!p || !p.makler_id || !p.upravene) return null;
    if (CHRANENE_VYSLEDKY.indexOf(p.posledny_vysledok) >= 0) return null;
    var t = Date.now();
    var maPripomienku = S.prip.some(function (x) {
      return x.inzerat_id === z.id && x.makler_id === p.makler_id && (x.druh || "pripomienka") === "pripomienka" && !x.hotovo && new Date(x.cas).getTime() > t;
    });
    return maPripomienku ? null : new Date(new Date(p.upravene).getTime() + 48 * 3600e3);
  }
  // typ predajcu: ručné označenie má prednosť pred odhadom skenera
  function ptyp(z) { var o = S.ozn[z.id]; return o ? o.predajca_typ : z.predajca_typ; }
  async function nacitajSchrankovanie() {
    var rows = await vsetkyRiadky("schrankovanie", "*", "id");
    S.sch = rows.sort(function (a, b) { return String(b.vytvorene).localeCompare(String(a.vytvorene)); });
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
    await Promise.all([nacitajInzeraty(), nacitajPrevzatia(), nacitajOdhady(), nacitajSchrankovanie(), nacitajPripomienky(), nacitajOznacenia(), nacitajTelefony(), nacitajChat(), nacitajPrihlasenia(), nacitajOsobne(), nacitajOslavy(), meta]);
  }
  var obnovuje = false;
  async function obnov() {
    if (obnovuje || !S.me) return;
    obnovuje = true;
    try {
      var uloha = [nacitajPrevzatia(), nacitajMaklerov(), nacitajSchrankovanie(), nacitajPripomienky(), nacitajOznacenia(), nacitajTelefony(), chatNove()];
      if (Date.now() - S.lastInzLoad > 10 * 60000) uloha.push(nacitajInzeraty(), nacitajOdhady());
      uloha.push(nacitajNastavenia().catch(function () {}), nacitajPrihlasenia(), nacitajOsobne(), nacitajOslavy());
      somTu();
      await Promise.all(uloha);
      if (!S.me.aktivny) return odhlasit();
      prekresliObsah();
      ohlasSplatne();
      ukazPochvalu();
      if (S.zvonOpen && !S.pripForm) vykresliZvoncek();
    } catch (e) { /* skúsime pri ďalšej obnove */ }
    obnovuje = false;
  }

  // ------------------------------------------------------------ kostra stránky
  function vykresli() {
    var tabs = [["inzeraty", "Realitný skener"], ["schrankovanie", "Schránkovanie"], ["nehnutelnosti", "Nehnuteľnosti"], ["chat", "Chat"]];
    if (admin()) tabs.push(["vykon", "Výkon"], ["makleri", "Makléri"]);
    $("#app").innerHTML =
      '<header class="top"><div class="wrap">' +
      '<a class="brand" href="#" data-tab="domov" title="Hlavná obrazovka"><img src="logo.png?v=202610181900" alt="Alpha Reality"><span class="brand-sub">Realitný<br>týpek</span></a>' +
      '<nav class="tabs" aria-label="Sekcie">' + tabs.map(function (t) {
        return '<button type="button" data-tab="' + t[0] + '"' + (S.tab === t[0] ? ' aria-current="page"' : "") + ">" + t[1] +
          (t[0] === "chat" ? ' <span class="tab-n" data-chat-n hidden></span>' : "") + "</button>";
      }).join("") + "</nav>" +
      '<div class="user">' +
      '<span class="odhl" id="odhl" hidden title="Automatické odhlásenie pri nečinnosti – odpočet sa vynuluje pri každej vašej aktivite">⏱ <b id="odhl-cas"></b></span>' +
      '<button type="button" class="bell" data-act="zvoncek" id="zvon-btn" aria-label="Pripomienky">🔔<span class="badge" id="zvon-n" hidden></span></button>' +
      '<button type="button" class="me-btn" data-act="profil" title="Môj profil">' + avatar(S.me.id, 28) + '<span class="email">' + esc(S.me.meno || S.me.email) + (admin() ? " · admin" : "") + "</span></button>" +
      '<button type="button" class="theme-btn" data-act="tema" id="tema-btn"></button>' +
      '<button type="button" data-act="odhlasit">Odhlásiť</button></div>' +
      "</div>" + (S.tab === "inzeraty" ? '<div class="wrap stats" id="stats"></div>' : "") + "</header>" +
      '<div id="filters"></div><main><div class="wrap"><div id="pwd"></div><div id="zvon"></div><div id="obsah"></div></div></main>' +
      '<footer><div class="wrap" id="foot"></div></footer>';
    $("header.top").addEventListener("click", function (e) {
      var t = e.target.closest("[data-tab]");
      if (t) { e.preventDefault(); prejdi(t.dataset.tab); return; }
      var a = e.target.closest("[data-act]");
      if (!a) return;
      if (a.dataset.act === "odhlasit") odhlasit();
      if (a.dataset.act === "tema") prepniTemu();
      if (a.dataset.act === "profil" || a.dataset.act === "zvoncek") animPanel();
      if (a.dataset.act === "profil") { S.pwdOpen = !S.pwdOpen; vykresliHeslo(); if (S.pwdOpen) window.scrollTo({ top: 0, behavior: "smooth" }); }
      if (a.dataset.act === "zvoncek") { S.zvonOpen = !S.zvonOpen; S.pripForm = null; vykresliZvoncek(); if (S.zvonOpen) window.scrollTo({ top: 0, behavior: "smooth" }); }
      if (a.dataset.act === "preset") predvolba(a.dataset.v);
    });
    vykresliHeslo();
    vykresliZvoncek();
    popisTemy();
    popisZvoncek();
    popisChat();
    tikOdpocet();
    document.body.setAttribute("data-anim", "");
    clearTimeout(S.animT); S.animT = setTimeout(function () { document.body.removeAttribute("data-anim"); }, 1200);
    if (S.tab === "inzeraty") vykresliFiltreInz();
    else if (S.tab === "schrankovanie") vykresliFiltreSch();
    else $("#filters").innerHTML = "";
    prekresliObsah();
  }

  function prekresliObsah() {
    if (S.tab === "inzeraty") { vykresliStaty(); vykresliZoznam(); }
    else if (S.tab === "schrankovanie") vykresliSchrankovanie();
    else if (S.tab === "makleri") vykresliMaklerov();
    else if (S.tab === "vykon") vykresliVykon();
    else if (S.tab === "domov") vykresliDomov();
    else if (S.tab === "nehnutelnosti") vykresliNehnutelnosti();
    else if (S.tab === "chat") { if (!$("#chat-spravy")) vykresliChat(); else oznacPrecitane(); }
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
    el.innerHTML = '<div class="box"><h3>Môj profil</h3>' + fotoVolba("ja", S.me.id) + "</div>" + boxObce() + formSms() + boxPlocha() +
      '<form class="box" id="f-pwd"><h3>Zmena vášho hesla</h3><div class="form-grid">' +
      '<label class="field"><span>Nové heslo (aspoň 8 znakov)</span><input type="password" id="pw1" minlength="8" autocomplete="new-password" required></label>' +
      '<label class="field"><span>Zopakujte heslo</span><input type="password" id="pw2" minlength="8" autocomplete="new-password" required></label></div>' +
      '<div class="form-actions"><button class="btn primary" type="submit">Uložiť heslo</button><button class="btn ghost" type="button" id="pw-x">Zrušiť</button></div></form>';
    pridajOko(el);
    napojFormSms();
    napojObce();
    if ($("#plocha-btn")) $("#plocha-btn").onclick = async function () {
      instalacia.prompt(); await instalacia.userChoice.catch(function () {}); instalacia = null; vykresliHeslo();
    };
    $("#pw-x").onclick = function () { S.pwdOpen = false; vykresliHeslo(); };
    $("#f-pwd").addEventListener("submit", async function (e) {
      e.preventDefault();
      if ($("#pw1").value !== $("#pw2").value) return toast("Heslá sa nezhodujú.", true);
      var r = await sb.auth.updateUser({ password: $("#pw1").value });
      if (r.error) return toast(chybaText(r.error), true);
      S.pwdOpen = false; vykresliHeslo(); toast("Heslo je zmenené.");
    });
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
      seg("predajca", [["vsetci", "Všetci", 1], ["sukr", "Súkromní", 1], ["rk", "RK", 1]]) +
      seg("typ", [["", "Všetko"], ["byt", "Byty"], ["dom", "Domy"], ["pozemok", "Pozemky"], ["chata", "Chaty"], ["garaz", "Garáže"]]) +
      '<select id="f-okres" aria-label="Okres alebo obec"><option value="">Oba okresy</option>' +
      '<option value="o:Spišská Nová Ves">Okres Spišská Nová Ves</option><option value="o:Levoča">Okres Levoča</option>' +
      ((S.me.obce || []).length ? '<option value="moje">📍 Moje obce (' + S.me.obce.length + ")</option>" : "") +
      '<optgroup label="Obec">' + S.obce.map(function (o) { return '<option value="' + esc(o[0]) + '">' + esc(o[0]) + " (" + o[1] + ")</option>"; }).join("") + "</optgroup></select>" +
      '<select id="f-stav" aria-label="Stav inzerátu"><option value="aktivne">Aktívne na portáloch</option><option value="zmiznute">Zmiznuté z portálov (archív)</option><option value="vsetky">Aktívne aj zmiznuté</option></select>' +
      '<select id="f-novost" aria-label="Kedy pribudli"><option value="">Kedykoľvek</option><option value="1">Nové za 24 h</option>' +
      '<option value="3">Nové za 3 dni</option><option value="7">Nové za 7 dní</option><option value="30">Nové za 30 dní</option></select>' +
      (S.canUnder ? '<label class="chk"><input type="checkbox" id="f-under"' + (f.under ? " checked" : "") + "> Len podhodnotené</label>" : "") +
      '<select id="f-sort" aria-label="Zoradiť"><option value="novy">Najnovšie</option>' +
      (S.canUnder ? '<option value="under">Najviac pod cenou</option>' : "") +
      '<option value="cena">Najlacnejšie</option><option value="cenam2">Najnižšia cena/m²</option><option value="hovor">Naposledy volané</option></select>' +
      "</div></div>";
    if (!S.canUnder) { f.under = false; if (f.sort === "under") f.sort = "novy"; }
    $("#f-okres").value = f.okres; if ($("#f-okres").value !== f.okres) f.okres = "";
    $("#f-novost").value = f.novost; $("#f-sort").value = f.sort; $("#f-stav").value = f.stav || "aktivne";
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
    var h = '<button class="stat" type="button" data-act="preset" data-v="vsetky"><b>' + nf.format(akt.length) + "</b><small>Aktívne inzeráty</small></button>" +
      '<button class="stat gold" type="button" data-act="preset" data-v="sukr"><b>' + nf.format(sukr.length) + "</b><small>Súkromní · voľných " + nf.format(sukrVolne) + "</small></button>" +
      '<button class="stat" type="button" data-act="preset" data-v="moje"><b>' + nf.format(moje) + "</b><small>Moje inzeráty</small></button>" +
      '<button class="stat" type="button" data-act="preset" data-v="nove"><b>' + nf.format(nove) + "</b><small>Nové za 24 h</small></button>";
    if (S.canUnder) {
      var under = akt.filter(function (z) { return S.odh[z.id] && S.odh[z.id].podhodnotene; }).length;
      h += '<button class="stat" type="button" data-act="preset" data-v="under"><b>' + nf.format(under) + "</b><small>Podhodnotené</small></button>";
    }
    el.innerHTML = h;
    if (document.body.hasAttribute("data-anim")) animujCisla(el);
  }

  function filtruj() {
    var f = S.f, q = norm(f.q).trim(), qd = /\d/.test(q) ? telCifry(q) : "", lim = f.novost ? Date.now() - Number(f.novost) * 864e5 : 0, me = S.me.id;
    var zaklad = viditelne(), pocty = {};
    if (S.jedenId) return { out: S.inz.filter(function (z) { return z.id === S.jedenId; }), pocty: pocty };
    function pridaj(k) { pocty[k] = (pocty[k] || 0) + 1; }
    var out = zaklad.filter(function (z) {
      var p = S.prev[z.id], maj = p && p.makler_id;
      var pt = ptyp(z);
      var okP = f.predajca === "vsetci" || (f.predajca === "sukr" ? pt !== "rk" : pt === "rk");
      var okPr = f.praca === "vsetky" || (f.praca === "volne" && !maj) || (f.praca === "moje" && maj === me) || (f.praca === "prevzate" && maj);
      var okIne = (!f.typ || z.typ === f.typ) &&
        (!f.okres || (f.okres === "moje" ? (S.me.obce || []).indexOf(z.obec) >= 0 : f.okres.indexOf("o:") === 0 ? z.okres === f.okres.slice(2) : z.obec === f.okres)) &&
        (!lim || new Date(z.prvy_krat).getTime() >= lim) &&
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
      if (s === "hovor") return String((S.prev[b.id] || {}).posledny_hovor || "").localeCompare(String((S.prev[a.id] || {}).posledny_hovor || ""));
      return String(b.prvy_krat).localeCompare(String(a.prvy_krat)) || String(b.publikovane || "").localeCompare(String(a.publikovane || ""));
    });
    return { out: out, pocty: pocty };
  }

  function vykresliZoznam() {
    var el = $("#obsah"); if (!el) return;
    var r = filtruj(), out = r.out;
    document.querySelectorAll("[data-n]").forEach(function (n) { n.textContent = nf.format(r.pocty[n.dataset.n] || 0); });
    var h = S.jedenId ? '<div class="note" style="margin-bottom:10px">Zobrazený inzerát z pripomienky. <button class="btn" type="button" id="vsetky-inz">Zobraziť všetky inzeráty</button></div>' : "";
    h += '<div class="bar"><span>' + nf.format(out.length) + (out.length === 1 ? " inzerát" : out.length > 1 && out.length < 5 ? " inzeráty" : " inzerátov") + "</span>" +
      (S.canUnder ? "<span>Porovnanie: cena/m² oproti mediánu podobných aktuálnych ponúk</span>" : "") + "</div>";
    h += out.length ? '<div class="list" id="list">' + out.slice(0, S.shown).map(karta).join("") + "</div>" :
      '<div class="empty">Nič nezodpovedá filtrom. Skúste „Všetky“ a „Všetci“ alebo zrušte obmedzenie času.</div>';
    if (out.length > S.shown) h += '<button class="btn more" type="button" id="more">Zobraziť ďalšie (zostáva ' + nf.format(out.length - S.shown) + ")</button>";
    el.innerHTML = h;
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
      (z.plocha ? "<span>" + nf.format(z.plocha) + " m²</span>" : "") + "<span>v skeneri " + ago(z.prvy_krat) + "</span></div>" +
      telRiadok(z) +
      '<div class="pills">' + (nove ? '<span class="pill new">Nové</span>' : "") + (!z.aktivny ? '<span class="pill gone">Zmizol z portálu · naposledy ' + datum(z.naposledy) + "</span>" : "") +
      '<span class="pill ' + pr[1] + '" title="' + esc(ozn ? "Ručne označil " + meno(ozn.oznacil) + " " + datum(ozn.oznacene) : z.predajca_dovod || "") + '">' + pr[0] + (z.predajca ? " · " + esc(z.predajca) : "") + "</span>" +
      (ozn ? '<span class="pill rk">Označil ' + esc(meno(ozn.oznacil)) + "</span>" : "") +
      (o && o.podhodnotene ? '<span class="pill priv">Pod cenou</span>' : "") +
      (znizena ? '<span class="pill priv">Znížená cena z ' + eur(hist[hist.length - 2][1]) + "</span>" : "") + "</div>" +
      '<div class="links">' + odkazy + "</div></div>" +
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
      znacky.push('<span class="' + (zostava < 12 * 3600e3 ? "due" : "wait") + '" title="Prevzatý inzerát sa uvoľní, ak sa pri ňom 2 dni nič nezapíše. Zabráni tomu zápis hovoru, SMS, emailu alebo pripomienka.">⏳ Uvoľní sa ' +
        (zostava <= 0 ? "pri najbližšej kontrole" : datum(uvol.toISOString(), true)) + "</span>" + (moj ? ", ak nič nezapíšete" : ""));
    }
    if (mojePrip.length > 2) znacky.push("🔔 +" + (mojePrip.length - 2) + " ďalšie");
    if (znacky.length) h += '<div class="marks">' + znacky.join(" · ") + "</div>";
    h += '<div class="actions">';
    if (!maj) h += '<button class="btn primary" type="button" data-act="prevziat">Prevziať</button>';
    if (mozeUpravit) {
      if (S.tel[z.id] && ptyp(z) !== "rk") h += '<a class="btn sms-btn" href="' + esc(smsOdkaz(z)) + '" data-act="sms-posli">💬 Poslať SMS</a>';
      h += '<button class="btn" type="button" data-act="hovor">Zapísať hovor</button>' +
        '<button class="btn' + (p && p.sms ? " on" : "") + '" type="button" data-act="sms">' + (p && p.sms ? "✓ SMS poslaná" : "SMS poslaná") + "</button>" +
        '<button class="btn' + (p && p.email ? " on" : "") + '" type="button" data-act="email">' + (p && p.email ? "✓ Email poslaný" : "Email poslaný") + "</button>";
    }
    h += '<button class="btn ghost" type="button" data-act="zvon" title="Nastaviť pripomienku">🔔 Pripomenúť</button>';
    if (ozn && ozn.predajca_typ === "rk") h += '<button class="btn ghost" type="button" data-act="oznac-zrus" title="Vrátiť rozpoznanie skenera">Nie je RK</button>';
    else if (ptyp(z) !== "rk") h += '<button class="btn ghost" type="button" data-act="oznac-rk" title="Presunúť medzi realitné kancelárie">Je to RK</button>';
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
  function detailPanel(z) {
    var h = '<div class="panel detail">';
    if (!(z.id in S.arch)) return h + '<div class="meta">Načítavam uložené údaje…</div></div>';
    var a = S.arch[z.id], hist = z.historia_cien || [];
    var fotky = a ? (a.fotky.length ? a.fotky.map(fotoUrl) : z.aktivny ? a.fotky_portal.slice(0, 8) : []) : [];
    h += '<div class="meta">V skeneri od ' + datum(z.prvy_krat, true) + " · " + (z.aktivny ? "na portáli aktívny" : "<b>z portálu zmizol</b>, naposledy videný " + datum(z.naposledy)) +
      (a ? " · uložené " + datum(a.ulozene) + (a.fotky.length ? " s " + a.fotky.length + " fotkami" : "") : "") + "</div>";
    if (fotky.length) h += '<div class="d-fotky">' + fotky.map(function (u) { return '<a href="' + esc(u) + '" target="_blank" rel="noopener"><img loading="lazy" referrerpolicy="no-referrer" src="' + esc(u) + '" alt=""></a>'; }).join("") + "</div>";
    var tt = telefon(z);
    if (tt) h += '<div class="d-tel">📞 ' + telOdkaz(tt.telefon) + " <small>" + (tt.zdroj === "text" ? "z textu inzerátu" : "zadal " + esc(meno(tt.zadal))) + "</small></div>";
    var par = a && a.parametre ? a.parametre : {}, riadky = [];
    if (Array.isArray(par.vlastnosti)) riadky = par.vlastnosti.slice();
    Object.keys(par).forEach(function (k) {
      var v = par[k];
      if (k === "vlastnosti" || v == null || v === "" || typeof v === "object" || typeof v === "boolean") return;
      riadky.push(k.charAt(0).toUpperCase() + k.slice(1) + ": " + v);
    });
    if (riadky.length) h += '<div class="d-par">' + riadky.map(function (r) { return "<span>" + esc(r) + "</span>"; }).join("") + "</div>";
    var popis = (a && a.popis) || z.popis;
    if (popis) h += '<div class="d-popis">' + esc(popis) + "</div>";
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
    try { await fn(); await nacitajPrevzatia(); if (S.open[id] === "hist") await nacitajHistoriu(id); }
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
        await rpc("oznacit_predajcu", { p_inzerat: id, p_typ: act === "oznac-rk" ? "rk" : null });
        await nacitajOznacenia();
        toast(act === "oznac-rk" ? "Označené ako realitná kancelária – presunuté mimo súkromných." : "Označenie zrušené.");
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
      await nacitajTelefony();
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
    var vys = f.vysledok.value, pozn = f.poznamka.value;
    f.querySelector('button[type="submit"]').disabled = true;
    akcia(id, async function () {
      await rpc("zapisat_hovor", { p_inzerat: id, p_vysledok: vys, p_poznamka: pozn });
      S.open[id] = null;
      if (vys === "Získaný do ponuky") { konfety({ pocet: 240 }); toast("🎉 Gratulujeme! Tím sa to dozvie v chate."); chatNove(); nacitajOslavy(); }
      else toast("Hovor je zapísaný.");
    });
  });

  // ------------------------------------------------------------ SCHRÁNKOVANIE
  function vykresliFiltreSch() {
    var sf = S.sf;
    $("#filters").innerHTML = '<div class="filters"><div class="wrap">' +
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
      h += '<div class="tbl-wrap sch"><table><thead><tr><th>Dátum</th><th>Lokalita / adresa</th><th>Meno</th><th>Druh</th><th>Cena</th><th>Telefón</th><th>Stav</th><th>Poznámky</th><th>Maklér</th><th></th></tr></thead><tbody>' +
        rows.map(function (r) {
          return "<tr><td>" + datum(r.vytvorene) + "</td><td>" + esc(r.lokalita) + "</td><td>" + esc(r.kontakt || "") + "</td><td>" + esc(TYP[r.typ] || r.typ || "") + '</td><td class="num">' + (r.cena ? eur(r.cena) : "") +
            '</td><td style="white-space:nowrap">' + tel(r.telefon) + "</td><td>" + esc(r.stav || "") + "</td><td>" + esc(r.poznamky || "") + "</td><td>" + esc(meno(r.makler_id)) +
            '</td><td style="white-space:nowrap">' + tlacidla(r) + "</td></tr>";
        }).join("") + "</tbody></table></div>";
      h += '<div class="sch-cards">' + rows.map(function (r) {
        return '<div class="sch-card"><div class="top"><span>' + esc(r.lokalita) + "</span><span>" + (r.cena ? eur(r.cena) : "") + "</span></div>" +
          '<div class="meta"><span>' + esc(TYP[r.typ] || "") + "</span>" + (r.stav ? "<span>" + esc(r.stav) + "</span>" : "") + "<span>" + esc(meno(r.makler_id)) + "</span><span>" + datum(r.vytvorene) + "</span></div>" +
          (r.kontakt || r.telefon ? "<div>" + (r.kontakt ? "<b>" + esc(r.kontakt) + "</b> " : "") + tel(r.telefon) + "</div>" : "") + (r.poznamky ? "<div>" + esc(r.poznamky) + "</div>" : "") +
          (moze(r) ? '<div class="form-actions">' + tlacidla(r) + "</div>" : "") + "</div>";
      }).join("") + "</div>";
    }
    el.innerHTML = h;
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
  function vykresliMaklerov() {
    var el = $("#obsah"); if (!el || !admin()) return;
    var prevzate = {}, hovory = {};
    Object.values(S.prev).forEach(function (p) { if (p.makler_id) prevzate[p.makler_id] = (prevzate[p.makler_id] || 0) + 1; });
    var MOZNOSTI = [[0, "Vypnuté"], [15, "15 minút"], [30, "30 minút"], [60, "1 hodina"], [120, "2 hodiny"], [240, "4 hodiny"], [480, "8 hodín"]];
    if (S.odhlMin && !MOZNOSTI.some(function (x) { return x[0] === S.odhlMin; })) MOZNOSTI.push([S.odhlMin, S.odhlMin + " minút"]);
    var h = '<div class="box odhl-nast"><div><h3>⏱ Automatické odhlásenie</h3><p class="meta">Maklér, ktorý nič nerobí, sa po nastavenom čase odhlási. Minútu pred odhlásením ho upozorníme. Platí pre všetkých vrátane vás.</p></div>' +
      '<select id="odhl-min" aria-label="Čas automatického odhlásenia">' + MOZNOSTI.map(function (x) {
        return '<option value="' + x[0] + '"' + (x[0] === S.odhlMin ? " selected" : "") + ">" + x[1] + "</option>";
      }).join("") + "</select></div>";
    var ok0 = S.odkaz || { text: "", zapnuty: false };
    h += '<form class="box odkaz-nast" id="f-odkaz"><h3>📣 Odkaz pre všetkých</h3>' +
      '<p class="meta">Jedna veta, ktorú uvidia všetci makléri na hlavnej obrazovke – napríklad cieľ mesiaca alebo pochvala tímu.</p>' +
      '<div class="odkaz-riadok"><input type="text" id="odkaz-text" maxlength="300" value="' + esc(ok0.text) + '" placeholder="napr. Tento mesiac ideme na 10 nových zmlúv – držím palce!">' +
      '<label class="toggle"><input type="checkbox" id="odkaz-zap"' + (ok0.zapnuty ? " checked" : "") + "> Zobraziť</label>" +
      '<button class="btn primary" type="submit">Uložiť</button></div></form>';
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
    h += '<div class="mk-list">' + S.makleri.map(function (m) {
        var ja = m.id === S.me.id;
        return '<div class="mk-card" data-m="' + m.id + '">' +
          '<div class="mk-foto">' + fotoVolba("makler", m.id) + "</div>" +
          '<div class="mk-hlavne"><input type="text" data-f="meno" value="' + esc(m.meno) + '" aria-label="Meno"><div class="meta">' + esc(m.email || "") +
          " · prevzatých " + (prevzate[m.id] || 0) + '</div><div class="meta mk-online">' + onlineStav(m.id).html + "</div></div>" +
          '<div class="mk-prava"><select data-f="pohlavie" aria-label="Rod (pre text SMS)"><option value="muz"' + (rodMaklera(m) === "muz" ? " selected" : "") + '>Muž</option><option value="zena"' + (rodMaklera(m) === "zena" ? " selected" : "") + ">Žena</option></select>" +
          '<select data-f="rola"' + (ja ? " disabled" : "") + ' aria-label="Rola"><option value="makler"' + (m.rola === "makler" ? " selected" : "") + '>Maklér</option><option value="admin"' + (m.rola === "admin" ? " selected" : "") + ">Administrátor</option></select>" +
          '<label class="toggle"><input type="checkbox" data-f="aktivny"' + (m.aktivny ? " checked" : "") + (ja ? " disabled" : "") + "> Aktívny</label>" +
          '<label class="toggle"><input type="checkbox" data-f="vidi"' + (m.vidi_podhodnotene || m.rola === "admin" ? " checked" : "") + (m.rola === "admin" ? " disabled" : "") + "> Vidí podhodnotené</label></div>" +
          '<div class="mk-heslo"><span class="meta">Heslo</span>' + bunkaHeslo(m) + "</div>" +
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
          '<div class="mk-akcie">' + (m.id !== S.me.id ? '<button class="btn ghost" type="button" data-m-act="pochvala">⭐ Pochváliť</button>' : "") + '<button class="btn" type="button" data-m-act="ulozit">Uložiť</button></div></div>';
      }).join("") + "</div>" +
      '<p class="meta">Administrátor vidí podhodnotené ponuky vždy. Maklérom ich zapnete v stĺpci „Vidí podhodnotené“. Deaktivovaný maklér sa neprihlási a nič nevidí. Prevzatý inzerát sa automaticky uvoľní, ak sa pri ňom 2 dni nič nezapíše (nie pri budúcej pripomienke, dohodnutom stretnutí alebo získanom do ponuky) – maklérovi príde upozornenie do zvončeka aj emailom.</p>';
    el.innerHTML = h;
    vykresliNahladNoveho();
    $("#f-odkaz").addEventListener("submit", async function (e) {
      e.preventDefault();
      var t = $("#odkaz-text").value, z = $("#odkaz-zap").checked;
      if (z && !t.trim()) return toast("Napíšte text odkazu.", true);
      try { await rpc("nastavit_odkaz", { p_text: t, p_zapnuty: z }); await nacitajNastavenia(); toast(z ? "Odkaz sa zobrazuje všetkým." : "Odkaz je uložený a skrytý."); }
      catch (err) { toast(chybaText(err), true); }
    });
    $("#odhl-min").onchange = async function () {
      var v = Number(this.value);
      try { await rpc("nastavit_odhlasenie", { p_min: v }); S.odhlMin = v; zaznamenajAktivitu(true); tikOdpocet(); toast(v ? "Automatické odhlásenie: po " + this.options[this.selectedIndex].text + " nečinnosti." : "Automatické odhlásenie je vypnuté."); }
      catch (err) { toast(chybaText(err), true); }
    };
    if ($("#n-copy")) $("#n-copy").onclick = function () {
      var t = "Skener Alpha Reality: " + location.origin + location.pathname + "\nEmail: " + S.newUser.email + "\nHeslo: " + S.newUser.heslo;
      navigator.clipboard.writeText(t).then(function () { toast("Skopírované."); }, function () { toast("Kopírovanie nefunguje – označte text ručne.", true); });
    };
    $("#f-novy").addEventListener("submit", async function (e) {
      e.preventDefault();
      var btn = e.target.querySelector('button[type="submit"]'); btn.disabled = true;
      var email = $("#n-email").value.trim().toLowerCase(), heslo = $("#n-heslo").value;
      try {
        var nov = await funkcia({ akcia: "vytvorit", meno: $("#n-meno").value, email: email, heslo: heslo, rola: $("#n-rola").value });
        if (S.novyFoto) await rpc("nastavit_foto", { p_id: nov.id, p_foto: S.novyFoto });
        S.novyFoto = null;
        S.newUser = { email: email, heslo: heslo }; S.hesla[nov.id] = heslo;
        await nacitajMaklerov(); toast("Účet je vytvorený.");
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
      chat: '<path d="M20.5 12a8.5 8.5 0 0 1-12.3 7.6L3.5 21l1.4-4.4A8.5 8.5 0 1 1 20.5 12z"/><path d="M8.5 12h.01M12 12h.01M15.5 12h.01"/>',
      zvon: '<path d="M6 9a6 6 0 1 1 12 0c0 6.5 2.5 8 2.5 8h-17S6 15.5 6 9"/><path d="M10.2 20.5a2 2 0 0 0 3.6 0"/>',
      vykon: '<path d="M3 21h18"/><rect x="5" y="11" width="3" height="7" rx=".5"/><rect x="10.5" y="5" width="3" height="13" rx=".5"/><rect x="16" y="13.5" width="3" height="4.5" rx=".5"/>',
      makleri: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20.5a6.5 6.5 0 0 1 13 0"/><circle cx="17.2" cy="9" r="2.6"/><path d="M16.5 14.3a5 5 0 0 1 5 5"/>',
      profil: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
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
      ["nehnutelnosti", "nehn", "Nehnuteľnosti", "Ponuka kancelárie – aktuálne, neaktuálne a archivované", "Pridávanie ponúk čoskoro", "", ""],
      ["chat", "chat", "Chat", "Správy pre celý tím", neprec ? neprec + (neprec === 1 ? " neprečítaná správa" : neprec <= 4 ? " neprečítané správy" : " neprečítaných správ") : "Všetko prečítané", "", ""],
      ["zvon", "zvon", "Pripomienky", "Komu a kedy zavolať, upozornenia na zníženie ceny", prip ? prip + " čaká na vás" : pripVsetky ? pripVsetky + " naplánovaných" : "Nič nečaká", "", ""],
      ["profil", "profil", "Môj profil", "Fotka, text SMS, heslo, skener na ploche mobilu", "", "", ""],
    ];
    if (admin()) {
      dlazdice.push(["vykon", "vykon", "Výkon maklérov", "Hovory, SMS, výsledky a grafy – len pre vás", "", "", ""]);
      dlazdice.push(["makleri", "makleri", "Makléri", "Účty, práva, heslá a texty SMS", S.makleri.filter(function (m) { return m.aktivny; }).length + " aktívnych", "", ""]);
    }
    el.innerHTML = '<div class="domov">' +
      '<section class="hero' + (mojeO.length ? " oslava" : "") + '"><div class="hero-hlava"><span class="hero-foto">' + avatar(S.me.id, 76) + "</span>" +
      '<div class="hero-text"><div class="hero-dnes">' + esc(dnes.charAt(0).toUpperCase() + dnes.slice(1)) + (meninyDnes.length ? ' · meniny má <b>' + esc(meninyDnes.join(", ")) + "</b>" : "") + "</div>" +
      "<h2>Ahoj" + (krstne ? ", " + esc(krstne) : "") + ' <span class="mava" aria-hidden="true">👋</span></h2>' +
      mojaOslava.map(function (t) { return '<div class="hero-oslava">' + esc(t) + "</div>"; }).join("") + "</div>" +
      (kruhy ? '<div class="hero-ciel"><div class="hero-ciel-n">Môj cieľ – ' + esc(new Date().toLocaleDateString("sk-SK", { month: "long" })) + '</div><div class="kruhy">' + kruhy + "</div></div>" : "") + "</div>" +
      (veta ? '<figure class="hero-veta"><blockquote>' + esc(veta) + "</blockquote>" +
        (autorVety && S.mById[autorVety] && autorVety !== S.me.id ? "<figcaption>— " + esc(oslovenie(S.mById[autorVety])) + "</figcaption>" : "") +
        reakcieBar("veta:" + S.me.id + ":" + hashTextu(veta)) + "</figure>" : "") +
      '<div class="hero-znak">Realitný <span>týpek</span></div></section>' +
      (cudzie.length ? '<div class="oslavy-ini">' + cudzie.map(function (x) {
        var m = S.mById[x.makler_id], o = oslovenie(m);
        var t = x.typ === "narodeniny" ? "🎂 Dnes má narodeniny <b>" + esc(o) + "</b>" : x.typ === "meniny" ? "🌷 Dnes má meniny <b>" + esc(o) + "</b>" :
          "🏆 <b>" + esc(o) + "</b> je s nami už " + x.roky + (x.roky === 1 ? " rok" : x.roky <= 4 ? " roky" : " rokov");
        return '<div class="oslava-riadok">' + avatar(x.makler_id, 34) + "<span>" + t + '</span><button class="btn" type="button" data-zablahozelat="' + esc(x.makler_id) + '" data-typ="' + x.typ + '">Zablahoželať 🎉</button></div>';
      }).join("") + "</div>" : "") +
      (odkaz ? '<div class="odkaz-vsetci"><span class="odkaz-ikona" aria-hidden="true">📣</span><div class="odkaz-telo"><b>' + esc(odkaz.text) + "</b>" +
        (odkaz.autor && S.mById[odkaz.autor] ? "<small>" + esc(S.mById[odkaz.autor].meno) + "</small>" : "") + reakcieBar("odkaz:" + hashTextu(odkaz.text)) + "</div></div>" : "") +
      mojDen +
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
  function mojDenHtml() {
    var koniecDna = new Date(); koniecDna.setHours(23, 59, 59, 999);
    var prip = mojeAktivne().filter(function (p) { return new Date(p.cas) <= koniecDna; });
    var obce = S.me.obce || [], den = Date.now() - 864e5;
    var vObciach = obce.length ? S.inz.filter(function (z) { return z.aktivny && ptyp(z) !== "rk" && obce.indexOf(z.obec) >= 0; }) : [];
    var noveObce = vObciach.filter(function (z) { return new Date(z.prvy_krat).getTime() > den; });
    var volneObce = vObciach.filter(function (z) { return !(S.prev[z.id] && S.prev[z.id].makler_id); });
    var uvol = S.inz.filter(function (z) {
      var p = S.prev[z.id]; if (!p || p.makler_id !== S.me.id) return false;
      var c = casUvolnenia(z); return c && c.getTime() - Date.now() < 24 * 3600e3;
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
      stlpec("⏳", "Uvoľní sa do 24 h", uvol.length ? "<ul>" + uvol.slice(0, 3).map(function (z) { return "<li>" + esc(z.nazov.slice(0, 60)) + "</li>"; }).join("") + "</ul>" :
        '<p class="meta">Žiadny váš inzerát sa v najbližších 24 hodinách neuvoľní.</p>', uvol.length ? "moje" : "", "Moje inzeráty") +
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
      prejdi("chat"); return;
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
  function vykresliNehnutelnosti() {
    var el = $("#obsah"); if (!el) return;
    var OBD = [["aktualne", "Aktuálne"], ["neaktualne", "Neaktuálne"], ["archiv", "Archivované"]];
    el.innerHTML = '<div class="box nehn"><div class="vykon-hlava"><h3>Nehnuteľnosti v ponuke</h3>' +
      '<button class="btn primary" type="button" disabled title="Pripravujeme">+ Pridať ponuku <span class="pill-cos">čoskoro</span></button></div>' +
      '<div class="seg" role="group">' + OBD.map(function (o) {
        return '<button type="button" data-nehn="' + o[0] + '" aria-pressed="' + (S.nehnObd === o[0]) + '">' + o[1] + ' <span class="n">0</span></button>';
      }).join("") + "</div>" +
      '<div class="prazdne"><span class="dl-ikona velka">' + ikona("nehn") + "</span>" +
      "<b>" + ({ aktualne: "Zatiaľ žiadne aktuálne ponuky", neaktualne: "Žiadne neaktuálne ponuky", archiv: "Archív je prázdny" })[S.nehnObd] + "</b>" +
      '<span class="meta">Sem budete pridávať nehnuteľnosti, ktoré má kancelária v ponuke – s fotkami, cenou, majiteľom a maklérom. Pridávanie ponúk pripravujeme.</span></div></div>';
    el.querySelectorAll("[data-nehn]").forEach(function (b) { b.onclick = function () { S.nehnObd = b.dataset.nehn; vykresliNehnutelnosti(); }; });
  }

  // ------------------------------------------------------------ CHAT
  async function nacitajChat() {
    var r = await sb.from("spravy").select("*").order("id", { ascending: false }).limit(300);
    if (r.error) return;
    S.chat = r.data.reverse();
    S.chatMax = S.chat.length ? S.chat[S.chat.length - 1].id : 0;
  }
  async function chatNove() {
    if (!S.me) return;
    var r = await sb.from("spravy").select("*").gt("id", S.chatMax).order("id", { ascending: true }).limit(200);
    if (r.error || !r.data.length) { popisChat(); return; }
    S.chat = S.chat.concat(r.data).slice(-500);
    S.chatMax = S.chat[S.chat.length - 1].id;
    if (S.tab === "chat") { pridajSpravy(r.data); oznacPrecitane(); } else if (S.tab === "domov") vykresliDomov();
    popisChat();
  }
  function pocetNeprecitanych() {
    var od = S.me.chat_precitane ? new Date(S.me.chat_precitane).getTime() : 0;
    return S.chat.filter(function (m) { return !m.zmazane && m.makler_id !== S.me.id && new Date(m.vytvorene).getTime() > od; }).length;
  }
  function popisChat() {
    var n = S.me ? pocetNeprecitanych() : 0;
    document.querySelectorAll("[data-chat-n]").forEach(function (b) { b.hidden = n === 0; b.textContent = n > 99 ? "99+" : String(n); });
  }
  function oznacPrecitane() {
    if (document.hidden || pocetNeprecitanych() === 0) return;
    S.me.chat_precitane = new Date().toISOString();
    rpc("chat_precitane", {}).catch(function () {});
    popisChat();
  }
  function denSpravy(iso) {
    var d = new Date(iso), dnes = new Date(); dnes.setHours(0, 0, 0, 0);
    var t = new Date(d); t.setHours(0, 0, 0, 0);
    var rozdiel = Math.round((dnes - t) / 864e5);
    if (rozdiel === 0) return "Dnes";
    if (rozdiel === 1) return "Včera";
    return d.toLocaleDateString("sk-SK", { weekday: "long", day: "numeric", month: "numeric", year: d.getFullYear() === dnes.getFullYear() ? undefined : "numeric" });
  }
  function textSpravy(t) {
    return esc(t).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
  }
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
    return h + '<div class="sprava' + (ja ? " ja" : "") + (spojit ? " spojena" : "") + '" data-sprava="' + m.id + '">' +
      (!ja ? '<span class="sprava-av">' + (spojit ? "" : avatar(m.makler_id, 36)) + "</span>" : "") +
      '<div class="sprava-telo">' + (!ja && !spojit ? '<div class="sprava-meno">' + esc(meno(m.makler_id)) + "</div>" : "") +
      '<div class="bublina' + (m.zmazane ? " zmazana" : "") + '">' + (m.zmazane ? "Správa bola zmazaná" : textSpravy(m.text)) +
      '<span class="sprava-cas">' + cas + "</span></div></div>" +
      (!m.zmazane && (ja || admin()) ? '<button type="button" class="sprava-x" data-zmaz-spravu="' + m.id + '" title="Zmazať správu" aria-label="Zmazať správu">×</button>' : "") + "</div>";
  }
  function vykresliChat() {
    var el = $("#obsah"); if (!el) return;
    var koncept = $("#chat-text") ? $("#chat-text").value : (S.chatKoncept || "");
    S.chatKoncept = "";
    var h = '<div class="box chat"><div class="chat-hlava"><h3>' + ikona("chat") + " Chat tímu</h3>" +
      '<span class="meta">' + S.makleri.filter(function (m) { return m.aktivny; }).length + " členov · správy vidia všetci makléri</span></div>" +
      '<div class="chat-spravy" id="chat-spravy">' +
      (S.chat.length ? S.chat.map(function (m, i) { return htmlSpravy(m, S.chat[i - 1]); }).join("") :
        '<div class="prazdne"><span class="dl-ikona velka">' + ikona("chat") + "</span><b>Zatiaľ žiadne správy</b><span class=\"meta\">Napíšte prvú správu celému tímu.</span></div>") +
      "</div>" +
      '<form class="chat-form" id="f-chat"><textarea id="chat-text" rows="1" maxlength="2000" placeholder="Napíšte správu…" aria-label="Správa"></textarea>' +
      '<button class="btn primary" type="submit">Odoslať</button></form></div>';
    el.innerHTML = h;
    var box = $("#chat-spravy"); box.scrollTop = box.scrollHeight;
    var t = $("#chat-text");
    if (koncept) t.value = koncept;
    t.addEventListener("input", function () { t.style.height = "auto"; t.style.height = Math.min(t.scrollHeight, 160) + "px"; });
    t.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.shiftKey && !e.isComposing && window.matchMedia("(pointer: fine)").matches) { e.preventDefault(); $("#f-chat").requestSubmit(); }
    });
    $("#f-chat").addEventListener("submit", async function (e) {
      e.preventDefault();
      var v = t.value.trim(); if (!v) return;
      var btn = e.target.querySelector("button"); btn.disabled = true;
      try { await rpc("poslat_spravu", { p_text: v }); t.value = ""; t.style.height = "auto"; S.me.chat_precitane = new Date().toISOString(); await chatNove(); }
      catch (err) { toast(chybaText(err), true); }
      btn.disabled = false; t.focus();
    });
    oznacPrecitane();
  }
  function pridajSpravy(nove) {
    var box = $("#chat-spravy"); if (!box) return;
    if (box.querySelector(".prazdne")) return vykresliChat();
    if (nove.some(function (m) { return m.typ === "uspech" && m.makler_id == null; })) konfety({ pocet: 120 });
    var dole = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
    var start = S.chat.length - nove.length;
    var html = nove.map(function (m, i) { return htmlSpravy(m, S.chat[start + i - 1]); }).join("");
    box.insertAdjacentHTML("beforeend", html.replace(/class="sprava/g, 'class="nova sprava'));
    if (dole || nove.some(function (m) { return m.makler_id === S.me.id; })) box.scrollTop = box.scrollHeight;
  }
  document.addEventListener("click", async function (e) {
    var b = e.target.closest("[data-zmaz-spravu]");
    if (!b) return;
    var id = Number(b.dataset.zmazSpravu);
    try {
      await rpc("zmazat_spravu", { p_id: id });
      var m = S.chat.find(function (x) { return x.id === id; }); if (m) m.zmazane = new Date().toISOString();
      vykresliChat();
    } catch (err) { toast(chybaText(err), true); }
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
    try { S.vykon = await rpc("vykon_maklerov", { p_od: r[0].toISOString(), p_do: r[1].toISOString() }); }
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
      }).join("") + "</tr></tbody></table></div></div>";
    el.innerHTML = h;
    if (S.vykonAnim) { S.vykonAnim = false; animujCisla(el); var g = el.querySelector(".grafy"); if (g) g.classList.add("rast"); }
    napojVykon();
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
    if (b.dataset.mAct === "ulozit") {
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

  function popisZvoncek() {
    var n = splatne().length, b = $("#zvon-n");
    if (!b) return;
    b.hidden = n === 0; b.textContent = n > 9 ? "9+" : String(n);
    $("#zvon-btn").classList.toggle("ring", n > 0);
    $("#zvon-btn").title = n ? n + (n === 1 ? " pripomienka čaká" : " pripomienky čakajú") : "Pripomienky";
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
    var h = '<div class="box zvon-box"><div class="zvon-hlava"><h3>🔔 Moje pripomienky</h3>' +
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
  async function nastavFoto(id, hodnota) {
    await rpc("nastavit_foto", { p_id: id, p_foto: hodnota || null });
    await nacitajMaklerov();
    toast("Fotka je uložená.");
    vykresli();
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
