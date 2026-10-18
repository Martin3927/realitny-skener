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
  var STAVY_NEHN = ["Pôvodný stav", "Čiastočná rekonštrukcia", "Kompletná rekonštrukcia", "Novostavba", "Rozostavaná", "Na zbúranie"];
  var KEY = "alpha-skener-app-v1";

  var S = {
    user: null, me: null, makleri: [], mById: {}, inz: [], prev: {}, odh: {}, canUnder: false, meta: {},
    sch: [], hist: {}, open: {}, tab: "inzeraty", shown: 100, schEdit: null, delConfirm: null, pwdOpen: false,
    prip: [], zvonOpen: false, pripForm: null, ohlasene: {}, ozn: {}, hesla: {}, hesloEdit: null,
    obce: [], lastInzLoad: 0, newUser: null,
    f: { q: "", predajca: "vsetci", typ: "", okres: "", novost: "", praca: "vsetky", under: false, sort: "novy", stav: "aktivne" },
    arch: {}, tel: {}, telZdroj: {},
    sf: { q: "", makler: "", typ: "" },
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
        img.onload = function () {
          var c = document.createElement("canvas"), v = 256, k = Math.min(img.width, img.height);
          c.width = v; c.height = v;
          c.getContext("2d").drawImage(img, (img.width - k) / 2, (img.height - k) / 2, k, k, 0, 0, v, v);
          ok(c.toDataURL("image/jpeg", 0.85));
        };
        img.src = r.result;
      };
      r.readAsDataURL(subor);
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
    prve ? obrazovkaPrve() : obrazovkaLogin();
  }

  function obrazovkaLogin(sprava) {
    $("#app").innerHTML =
      '<div class="login"><form class="login-box" id="f-login">' +
      '<img class="login-logo" src="logo.png?v=202610181400" alt="Alpha Reality"><p>Realitný skener – prihláste sa svojím maklérskym účtom.</p>' +
      '<label class="field"><span>Email</span><input type="email" id="l-email" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" inputmode="email" required></label>' +
      '<label class="field"><span>Heslo</span><input type="password" id="l-heslo" autocomplete="current-password" required></label>' +
      '<div class="error" id="l-err">' + esc(sprava || "") + "</div>" +
      '<button class="btn primary wide" type="submit">Prihlásiť sa</button>' +
      "<p>Účet vám vytvorí administrátor. Ak ste zabudli heslo, požiadajte ho o nové.</p></form></div>";
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
      '<img class="login-logo" src="logo.png?v=202610181400" alt="Alpha Reality">' +
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
    if (!admin() && S.tab === "makleri") S.tab = "inzeraty";
    try { await nacitajVsetko(); } catch (e) { toast(chybaText(e), true); }
    vykresli();
    setInterval(obnov, 60000);
    document.addEventListener("visibilitychange", function () { if (!document.hidden) obnov(); });
  }

  async function odhlasit() { await sb.auth.signOut(); location.reload(); }

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
      toast("🔔 " + (p.poznamka || "Pripomienka") + " (" + datum(p.cas, true) + ")");
    });
    popisZvoncek();
  }
  async function nacitajVsetko() {
    await nacitajMaklerov();
    var meta = sb.from("stav_skenera").select("meta, upravene").maybeSingle().then(function (r) { S.meta = (r.data && r.data.meta) || {}; });
    await Promise.all([nacitajInzeraty(), nacitajPrevzatia(), nacitajOdhady(), nacitajSchrankovanie(), nacitajPripomienky(), nacitajOznacenia(), nacitajTelefony(), meta]);
  }
  var obnovuje = false;
  async function obnov() {
    if (obnovuje || !S.me) return;
    obnovuje = true;
    try {
      var uloha = [nacitajPrevzatia(), nacitajMaklerov(), nacitajSchrankovanie(), nacitajPripomienky(), nacitajOznacenia(), nacitajTelefony()];
      if (Date.now() - S.lastInzLoad > 10 * 60000) uloha.push(nacitajInzeraty(), nacitajOdhady());
      await Promise.all(uloha);
      if (!S.me.aktivny) return odhlasit();
      prekresliObsah();
      ohlasSplatne();
      if (S.zvonOpen && !S.pripForm) vykresliZvoncek();
    } catch (e) { /* skúsime pri ďalšej obnove */ }
    obnovuje = false;
  }

  // ------------------------------------------------------------ kostra stránky
  function vykresli() {
    var tabs = [["inzeraty", "Inzeráty"], ["schrankovanie", "Schránkovanie"]];
    if (admin()) tabs.push(["makleri", "Makléri"]);
    $("#app").innerHTML =
      '<header class="top"><div class="wrap">' +
      '<div class="brand"><img src="logo.png?v=202610181400" alt="Alpha Reality"><span class="brand-sub">Realitný<br>skener</span></div>' +
      '<nav class="tabs" aria-label="Sekcie">' + tabs.map(function (t) {
        return '<button type="button" data-tab="' + t[0] + '"' + (S.tab === t[0] ? ' aria-current="page"' : "") + ">" + t[1] + "</button>";
      }).join("") + "</nav>" +
      '<div class="user">' +
      '<button type="button" class="bell" data-act="zvoncek" id="zvon-btn" aria-label="Pripomienky">🔔<span class="badge" id="zvon-n" hidden></span></button>' +
      '<button type="button" class="me-btn" data-act="profil" title="Môj profil">' + avatar(S.me.id, 28) + '<span class="email">' + esc(S.me.meno || S.me.email) + (admin() ? " · admin" : "") + "</span></button>" +
      '<button type="button" class="theme-btn" data-act="tema" id="tema-btn"></button>' +
      '<button type="button" data-act="odhlasit">Odhlásiť</button></div>' +
      "</div>" + (S.tab === "inzeraty" ? '<div class="wrap stats" id="stats"></div>' : "") + "</header>" +
      '<div id="filters"></div><main><div class="wrap"><div id="pwd"></div><div id="zvon"></div><div id="obsah"></div></div></main>' +
      '<footer><div class="wrap" id="foot"></div></footer>';
    $("header.top").addEventListener("click", function (e) {
      var t = e.target.closest("[data-tab]");
      if (t) { S.tab = t.dataset.tab; S.shown = 100; ulozFiltre(); vykresli(); window.scrollTo(0, 0); return; }
      var a = e.target.closest("[data-act]");
      if (!a) return;
      if (a.dataset.act === "odhlasit") odhlasit();
      if (a.dataset.act === "tema") prepniTemu();
      if (a.dataset.act === "profil") { S.pwdOpen = !S.pwdOpen; vykresliHeslo(); if (S.pwdOpen) window.scrollTo({ top: 0, behavior: "smooth" }); }
      if (a.dataset.act === "zvoncek") { S.zvonOpen = !S.zvonOpen; S.pripForm = null; vykresliZvoncek(); if (S.zvonOpen) window.scrollTo({ top: 0, behavior: "smooth" }); }
      if (a.dataset.act === "preset") predvolba(a.dataset.v);
    });
    vykresliHeslo();
    vykresliZvoncek();
    popisTemy();
    popisZvoncek();
    if (S.tab === "inzeraty") vykresliFiltreInz();
    else if (S.tab === "schrankovanie") vykresliFiltreSch();
    else $("#filters").innerHTML = "";
    prekresliObsah();
  }

  function prekresliObsah() {
    if (S.tab === "inzeraty") { vykresliStaty(); vykresliZoznam(); }
    else if (S.tab === "schrankovanie") vykresliSchrankovanie();
    else if (S.tab === "makleri") vykresliMaklerov();
    var m = S.meta || {};
    $("#foot").textContent = (m.posledna_kontrola ? "Posledná kontrola portálov " + datum(m.posledna_kontrola, true) + ". " : "") +
      "Sleduje Bazoš, Nehnuteľnosti.sk, Reality.sk a TopReality.sk v okresoch Spišská Nová Ves a Levoča." +
      (m.chyby && m.chyby.length ? " Pri poslednej kontrole sa nepodarilo načítať: " + m.chyby.join("; ") : "");
  }

  function vykresliHeslo() {
    var el = $("#pwd");
    if (!el) return;
    if (!S.pwdOpen) { el.innerHTML = ""; return; }
    el.innerHTML = '<div class="box"><h3>Môj profil</h3>' + fotoVolba("ja", S.me.id) + "</div>" +
      '<form class="box" id="f-pwd"><h3>Zmena vášho hesla</h3><div class="form-grid">' +
      '<label class="field"><span>Nové heslo (aspoň 8 znakov)</span><input type="password" id="pw1" minlength="8" autocomplete="new-password" required></label>' +
      '<label class="field"><span>Zopakujte heslo</span><input type="password" id="pw2" minlength="8" autocomplete="new-password" required></label></div>' +
      '<div class="form-actions"><button class="btn primary" type="submit">Uložiť heslo</button><button class="btn ghost" type="button" id="pw-x">Zrušiť</button></div></form>';
    pridajOko(el);
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
        (!f.okres || (f.okres.indexOf("o:") === 0 ? z.okres === f.okres.slice(2) : z.obec === f.okres)) &&
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
    if ($("#vsetky-inz")) $("#vsetky-inz").onclick = function () { S.jedenId = null; vykresliZoznam(); };
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
      '<div class="row">' + foto + '<div class="body">' +
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
    mojePrip.slice(0, 2).forEach(function (x) { znacky.push('<span class="' + (new Date(x.cas) <= new Date() ? "due" : "ok") + '">🔔 ' + datum(x.cas, true) + "</span>" + (x.poznamka ? " " + esc(x.poznamka) : "")); });
    if (mojePrip.length > 2) znacky.push("🔔 +" + (mojePrip.length - 2) + " ďalšie");
    if (znacky.length) h += '<div class="marks">' + znacky.join(" · ") + "</div>";
    h += '<div class="actions">';
    if (!maj) h += '<button class="btn primary" type="button" data-act="prevziat">Prevziať</button>';
    if (mozeUpravit) {
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
      S.open[id] = null; toast("Hovor je zapísaný.");
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
  function vykresliMaklerov() {
    var el = $("#obsah"); if (!el || !admin()) return;
    var prevzate = {}, hovory = {};
    Object.values(S.prev).forEach(function (p) { if (p.makler_id) prevzate[p.makler_id] = (prevzate[p.makler_id] || 0) + 1; });
    var h = '<form class="box" id="f-novy"><h3>Pridať makléra</h3><div class="form-grid">' +
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
          " · prevzatých " + (prevzate[m.id] || 0) + "</div></div>" +
          '<div class="mk-prava"><select data-f="rola"' + (ja ? " disabled" : "") + ' aria-label="Rola"><option value="makler"' + (m.rola === "makler" ? " selected" : "") + '>Maklér</option><option value="admin"' + (m.rola === "admin" ? " selected" : "") + ">Administrátor</option></select>" +
          '<label class="toggle"><input type="checkbox" data-f="aktivny"' + (m.aktivny ? " checked" : "") + (ja ? " disabled" : "") + "> Aktívny</label>" +
          '<label class="toggle"><input type="checkbox" data-f="vidi"' + (m.vidi_podhodnotene || m.rola === "admin" ? " checked" : "") + (m.rola === "admin" ? " disabled" : "") + "> Vidí podhodnotené</label></div>" +
          '<div class="mk-heslo"><span class="meta">Heslo</span>' + bunkaHeslo(m) + "</div>" +
          '<div class="mk-akcie"><button class="btn" type="button" data-m-act="ulozit">Uložiť</button></div></div>';
      }).join("") + "</div>" +
      '<p class="meta">Administrátor vidí podhodnotené ponuky vždy. Maklérom ich zapnete v stĺpci „Vidí podhodnotené“. Deaktivovaný maklér sa neprihlási a nič nevidí; jeho prevzaté inzeráty mu ostanú, kým ich nepresuniete.</p>';
    el.innerHTML = h;
    vykresliNahladNoveho();
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
        await nacitajMaklerov(); toast("Uložené.");
      } catch (err) { toast(chybaText(err), true); }
      vykresliMaklerov();
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
        '<div class="prip-text">' + (cudzia ? avatar(p.makler_id, 20) + " <b>" + esc(meno(p.makler_id)) + "</b> · " : "") + esc(p.poznamka || "Pripomienka") +
        (ciel ? '<div class="meta">' + ciel + "</div>" : "") +
        (p.vytvoril && p.vytvoril !== p.makler_id ? '<div class="meta">Nastavil: ' + esc(meno(p.vytvoril)) + "</div>" : "") +
        (p.email_chyba ? '<div class="error">Email sa nepodarilo odoslať: ' + esc(p.email_chyba) + "</div>" : p.email_odoslany ? '<div class="meta">✓ Email odoslaný</div>' : "") + "</div>" +
        '<div class="prip-akcie"><button class="btn" type="button" data-prip-act="hotovo">✓ Hotovo</button>' +
        '<button class="btn ghost" type="button" data-prip-act="upravit">Upraviť</button>' +
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
      S.jedenId = li.dataset.pripInz;
      if (S.tab !== "inzeraty") { S.tab = "inzeraty"; vykresli(); } else vykresliZoznam();
      return;
    }
    var ls = e.target.closest("[data-prip-sch]");
    if (ls) {
      e.preventDefault();
      var r = S.sch.find(function (x) { return x.id === Number(ls.dataset.pripSch); });
      S.sf.q = r ? r.lokalita : ""; S.sf.makler = ""; S.sf.typ = "";
      S.tab = "schrankovanie"; vykresli();
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
    spracujFoto(inp.files[0]).then(function (url) {
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
