/* Odhad hodnoty – Týpkove nehnuteľnosti (realitnytypek.sk/odhad).
   Formulár v 6 krokoch podľa martinaugustinak.sk/ocenenie. Žiadosť ukladá verejná funkcia odhad_ziadost (migrácia 108),
   dostane ju maklér, ktorý v obci pôsobí; cenu klient na stránke nevidí – povie mu ju maklér.
   Všetko je v tomto priečinku (obce.js, obrázky), aby stránka mohla neskôr bežať aj na vlastnej doméne. */
(function () {
  "use strict";

  var SUPA = "https://uwxziqapghlyktwpipjd.supabase.co";
  var KLUC = "sb_publishable_ukjo7DCX1FMYly7NU4gtxg_suIF66nf";
  var TYPY = { byt: "Byt", dom: "Rodinný dom", pozemok: "Pozemok", ine: "Iné" };

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  function esc(v) { return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function norm(s) { return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim(); }
  function pohybOk() { return document.documentElement.classList.contains("pohyb-vzdy") || !(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches); }

  // ---------------------------------------------------------------- spojenie s databázou
  function rpc(fn, args) {
    return fetch(SUPA + "/rest/v1/rpc/" + fn, {
      method: "POST", headers: { apikey: KLUC, "Content-Type": "application/json" }, body: JSON.stringify(args || {}),
    }).then(function (r) {
      return r.text().then(function (t) {
        var d = null; try { d = t ? JSON.parse(t) : null; } catch (e) { d = null; }
        if (!r.ok) throw new Error(d && d.message && ["22023", "54000", "42501", "P0001"].indexOf(d.code) >= 0 ? d.message : "Odoslanie sa nepodarilo.");
        return d;
      });
    });
  }

  // ---------------------------------------------------------------- ochrana proti robotom (rovnaká ako na portáli):
  // SHA-256 z „typek1|odhad|odhad|čas|číslo“ začína štyrmi (pri náraste podaní piatimi) nulami
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
  var POW = null;
  function overenie(nul) {
    nul = nul === 5 ? 5 : 4;
    var now = Math.floor(Date.now() / 1000);
    if (POW && POW.nul === nul && now - POW.ts < 1500) return POW.p;
    var pred = "typek1|odhad|odhad|" + now + "|", n = 0, posun = nul === 5 ? 12 : 16;
    var p = new Promise(function (res) {
      (function krok() {
        var t0 = Date.now();
        while (Date.now() - t0 < 25) { for (var i = 0; i < 400; i++, n++) { var k = n.toString(36); if ((sha256Zaciatok(pred + k) >>> posun) === 0) return res({ ts: String(now), n: k }); } }
        setTimeout(krok, 0);
      })();
    });
    POW = { ts: now, p: p, nul: nul };
    return p;
  }

  // ---------------------------------------------------------------- obce SR (obce.js) a výber obce
  var OBCE = null, POKRYTIE = null;
  function obce() {
    if (OBCE) return OBCE;
    OBCE = [];
    var K = window.ODHAD_OBCE || {};
    Object.keys(K).forEach(function (kraj) {
      Object.keys(K[kraj]).forEach(function (okres) {
        K[kraj][okres].forEach(function (n) { OBCE.push({ n: n, o: okres, k: kraj, s: norm(n) }); });
      });
    });
    OBCE.sort(function (a, b) { return a.n.localeCompare(b.n, "sk") || a.o.localeCompare(b.o, "sk"); });
    return OBCE;
  }
  function nacitajPokrytie() {
    if (POKRYTIE) return;
    POKRYTIE = [];
    rpc("odhad_pokrytie").then(function (d) { POKRYTIE = Array.isArray(d) ? d : []; infoObce(); }).catch(function () { POKRYTIE = null; });
  }
  var V = { obec: null };   // vybraná obec { n, o, k }
  function infoObce() {
    var el = $("#obec-info");
    if (!V.obec) { el.textContent = ""; el.className = "pole-info"; return; }
    var pokr = POKRYTIE && POKRYTIE.length ? POKRYTIE.indexOf(V.obec.o) >= 0 : null;
    el.className = "pole-info" + (pokr === false ? " mimo" : pokr ? " ok" : "");
    el.textContent = (/^(Bratislava|Košice) /.test(V.obec.o) ? V.obec.o : "Okres " + V.obec.o) + " · " + V.obec.k +
      (pokr === false ? ". V tomto okrese zatiaľ nemáme makléra – žiadosť môžete poslať, dáme vám vedieť, či vám vieme pomôcť."
        : pokr ? ". V okolí pôsobí maklér, ktorý vám odhad pripraví." : ".");
  }
  function napojObec() {
    var inp = $("#obec"), zoz = $("#obec-zoznam"), akt = -1, vysl = [];
    function zavri() { zoz.hidden = true; inp.setAttribute("aria-expanded", "false"); inp.removeAttribute("aria-activedescendant"); akt = -1; }
    function vyber(o) {
      V.obec = o; inp.value = o.n; inp.setAttribute("aria-invalid", "false"); zavri(); infoObce(); skryChybu();
    }
    function hladaj() {
      var q = norm(inp.value);
      if (V.obec && inp.value !== V.obec.n) { V.obec = null; infoObce(); }
      if (q.length < 2) { zavri(); return; }
      var zac = [], obs = [];
      obce().forEach(function (o) { var i = o.s.indexOf(q); if (i === 0) zac.push(o); else if (i > 0) obs.push(o); });
      vysl = zac.concat(obs).slice(0, 8);
      akt = vysl.length ? 0 : -1;
      zoz.innerHTML = vysl.length ? vysl.map(function (o, i) {
        return '<li role="option" id="obec-m' + i + '" aria-selected="' + (i === akt) + '" data-i="' + i + '"><b>' + esc(o.n) + "</b><span>" + esc(/^(Bratislava|Košice) /.test(o.o) ? o.o : "okres " + o.o) + "</span></li>";
      }).join("") : '<li class="prazdne" role="option" aria-disabled="true">Takú obec nepoznáme – skúste iný tvar názvu.</li>';
      zoz.hidden = false; inp.setAttribute("aria-expanded", "true");
      if (akt >= 0) inp.setAttribute("aria-activedescendant", "obec-m0");
    }
    function oznac(i) {
      akt = i;
      $$("li[data-i]", zoz).forEach(function (li) { var on = Number(li.dataset.i) === i; li.setAttribute("aria-selected", String(on)); if (on) li.scrollIntoView({ block: "nearest" }); });
      inp.setAttribute("aria-activedescendant", "obec-m" + i);
    }
    inp.addEventListener("input", hladaj);
    inp.addEventListener("focus", function () { nacitajPokrytie(); if (!V.obec && inp.value.length >= 2) hladaj(); });
    inp.addEventListener("keydown", function (e) {
      if (zoz.hidden) return;
      if (e.key === "ArrowDown") { e.preventDefault(); if (vysl.length) oznac((akt + 1) % vysl.length); }
      else if (e.key === "ArrowUp") { e.preventDefault(); if (vysl.length) oznac((akt - 1 + vysl.length) % vysl.length); }
      else if (e.key === "Enter") { if (akt >= 0) { e.preventDefault(); e.stopPropagation(); vyber(vysl[akt]); } }
      else if (e.key === "Escape") { zavri(); }
    });
    zoz.addEventListener("mousedown", function (e) { e.preventDefault(); });
    zoz.addEventListener("click", function (e) { var li = e.target.closest("li[data-i]"); if (li) vyber(vysl[Number(li.dataset.i)]); });
    inp.addEventListener("blur", function () {
      setTimeout(zavri, 120);
      // presná zhoda názvu (napísaná bez výberu zo zoznamu) – ak je obec s týmto názvom len jedna, vyberieme ju
      if (!V.obec && inp.value.trim()) {
        var q = norm(inp.value), zh = obce().filter(function (o) { return o.s === q; });
        if (zh.length === 1) vyber(zh[0]);
      }
    });
  }

  // ---------------------------------------------------------------- kroky
  var form, kroky, cur = 0, typ = "byt", dalejBtn, spatBtn;
  function el(id) { return document.getElementById(id); }
  function chyba(text, pole) {
    var c = el("chyba"); c.textContent = text; c.hidden = false;
    if (pole) {
      if (pole.setAttribute) pole.setAttribute("aria-invalid", "true");
      if (pole.focus) pole.focus({ preventScroll: true });
      (pole.closest ? pole.closest(".pole, .cipy, .pod") || pole : pole).scrollIntoView({ behavior: pohybOk() ? "smooth" : "auto", block: "center" });
    }
    return false;
  }
  function skryChybu() { el("chyba").hidden = true; $$('[aria-invalid="true"]', form).forEach(function (x) { x.setAttribute("aria-invalid", "false"); }); $$(".cipy.zle", form).forEach(function (x) { x.classList.remove("zle"); }); }
  function nastavTyp(t) {
    typ = t;
    $$(".pod[data-pre]", form).forEach(function (f) {
      var on = f.dataset.pre.split(" ").indexOf(t) >= 0;
      f.hidden = !on; f.disabled = !on;
    });
    $$("h2[data-titul-" + t + "]", form).forEach(function (h) { h.textContent = h.getAttribute("data-titul-" + t); });
    var povUl = t === "byt" || t === "dom";
    $("[data-ulica-nazov]").textContent = povUl ? "Ulica" : "Ulica alebo lokalita";
    $("[data-ulica-nepov]").hidden = povUl;
    el("ulica").required = povUl;
  }
  function ukaz(i, smer) {
    kroky[cur].hidden = true;
    cur = i;
    var k = kroky[cur];
    k.hidden = false;
    k.classList.remove("vstup", "vstup-spat");
    if (pohybOk() && smer) { void k.offsetWidth; k.classList.add(smer < 0 ? "vstup-spat" : "vstup"); }
    el("krok-c").textContent = cur + 1;
    el("krok-n").textContent = k.dataset.nazov;
    el("pas").style.width = ((cur + 1) / kroky.length * 100) + "%";
    spatBtn.hidden = cur === 0;
    dalejBtn.textContent = cur === kroky.length - 1 ? "Požiadať o odhad" : "Pokračovať";
    skryChybu();
    if (cur === 1) nacitajPokrytie();
    if (cur === kroky.length - 1) overenie();   // výpočet overenia sa pripraví vopred, kým človek píše kontakt
    if (smer) {
      var h = k.querySelector("h2");
      var karta = el("odhad"), r = karta.getBoundingClientRect();
      if (r.top < 0 || r.top > window.innerHeight * 0.4) karta.scrollIntoView({ behavior: pohybOk() ? "smooth" : "auto", block: "start" });
      if (h) h.focus({ preventScroll: true });
    }
  }
  function aktivne(sel) { return $$(sel, kroky[cur]).filter(function (x) { return !x.disabled && !x.closest("fieldset[disabled]"); }); }
  function cislo(inp, nazov) {
    var v = String(inp.value || "").replace(",", ".").trim();
    if (!v) return inp.required ? chyba("Vyplňte " + nazov + ".", inp) : true;
    var n = Number(v), min = Number(inp.min), max = Number(inp.max);
    if (!isFinite(n) || n < min || n > max) return chyba("Skontrolujte " + nazov + " (" + min + " – " + max.toLocaleString("sk-SK") + ").", inp);
    return true;
  }
  function radio(name, sprava) {
    var r = aktivne('input[name="' + name + '"]');
    if (!r.length || r.some(function (x) { return x.checked; })) return true;
    var g = r[0].closest(".cipy, .typy"); if (g) g.classList.add("zle");
    return chyba(sprava, r[0]);
  }
  function over() {
    skryChybu();
    var k = kroky[cur].dataset.nazov;
    if (k === "Typ nehnuteľnosti") return radio("typ", "Vyberte, čo chcete oceniť.");
    if (k === "Lokalita") {
      if (!V.obec) return chyba(el("obec").value.trim() ? "Vyberte obec zo zoznamu – začnite písať a ťuknite na ňu." : "Napíšte obec, kde je nehnuteľnosť.", el("obec"));
      if (el("ulica").required && !el("ulica").value.trim()) return chyba("Napíšte ulicu.", el("ulica"));
      return true;
    }
    if (k === "Veľkosť") {
      if (typ === "byt") return cislo(el("plocha-byt"), "plochu bytu") && radio("izby", "Vyberte počet izieb.") && cislo(el("posch"), "poschodie") && cislo(el("posch-sp"), "počet poschodí") &&
        (!el("posch-sp").value || Number(el("posch-sp").value) >= Number(el("posch").value) || chyba("Poschodie nemôže byť vyššie ako počet poschodí domu.", el("posch")));
      if (typ === "dom") return cislo(el("plocha-dom"), "úžitkovú plochu") && cislo(el("pozemok-dom"), "výmeru pozemku") && radio("izby", "Vyberte počet izieb.");
      if (typ === "pozemok") return cislo(el("plocha-poz"), "výmeru pozemku") && radio("druh_pozemku", "Vyberte druh pozemku.");
      if (!el("popis").value.trim()) return chyba("Napíšte, čo chcete oceniť.", el("popis"));
      return cislo(el("plocha-ine"), "plochu");
    }
    if (k === "Stav") {
      if (typ !== "pozemok") return radio("stav", "Vyberte stav.");
      if (!aktivne('input[name="siete"]').some(function (x) { return x.checked; })) { $('[data-povinna-skupina="siete"]').classList.add("zle"); return chyba("Vyberte siete – alebo „Neviem“.", aktivne('input[name="siete"]')[0]); }
      return true;
    }
    if (k === "Detaily") return radio("dovod", "Vyberte, prečo chcete odhad.");
    if (k === "Kontakt") {
      var m = el("meno"), t = el("telefon"), e = el("email");
      if (m.value.trim().length < 2) return chyba("Napíšte svoje meno.", m);
      var tc = t.value.replace(/[\s\/.-]/g, "");
      if (!/^(\+|00)?\d{9,15}$/.test(tc)) return chyba(t.value.trim() ? "Telefónne číslo nemá správny tvar." : "Napíšte telefónne číslo.", t);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e.value.trim())) return chyba(e.value.trim() ? "E-mail nemá správny tvar." : "Napíšte e-mail.", e);
      if (!el("podmienky-suhlas").checked) return chyba("Potvrďte súhlas s podmienkami odhadu.", el("podmienky-suhlas"));
      return true;
    }
    return true;
  }

  // ---------------------------------------------------------------- odoslanie
  function odkial() {
    var p = new URLSearchParams(location.search), o = [];
    ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"].forEach(function (k) { if (p.get(k)) o.push(k + "=" + p.get(k).slice(0, 60)); });
    if (p.get("fbclid")) o.push("fbclid"); if (p.get("gclid")) o.push("gclid");
    try { var r = document.referrer && new URL(document.referrer); if (r && r.host !== location.host) o.push("z " + r.host); } catch (e) { /* nič */ }
    return o.join("; ").slice(0, 300) || null;
  }
  function udaje() {
    var fd = new FormData(form), u = { typ: typ, obec: V.obec ? V.obec.n : "", okres: V.obec ? V.obec.o : "" };
    ["cast_obce", "ulica", "cislo", "plocha", "pozemok", "izby", "poschodie", "poschodi", "druh_pozemku", "popis", "stav", "dovod", "poznamka", "meno", "telefon", "email"].forEach(function (k) {
      var v = fd.get(k); if (v != null && String(v).trim() !== "") u[k] = String(v).trim();
    });
    u.siete = fd.getAll("siete"); u.doplnky = fd.getAll("doplnky");
    u.odkial = odkial();
    return u;
  }
  var DNI = ["v nedeľu", "v pondelok", "v utorok", "v stredu", "vo štvrtok", "v piatok", "v sobotu"];
  var SVIATKY = ["01-01", "01-06", "05-01", "05-08", "07-05", "08-29", "09-15", "11-01", "12-24", "12-25", "12-26"];
  var POZASTAVENE = { 2026: ["05-08", "09-15"] };
  function pad(x) { return (x < 10 ? "0" : "") + x; }
  function velkaNoc(y) {
    var a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3),
      h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451),
      mo = Math.floor((h + l - 7 * m + 114) / 31), da = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(y, mo - 1, da);
  }
  function pracovny(dt) {
    var wd = dt.getDay(); if (wd === 0 || wd === 6) return false;
    var y = dt.getFullYear(), md = pad(dt.getMonth() + 1) + "-" + pad(dt.getDate());
    if (SVIATKY.indexOf(md) > -1 && (POZASTAVENE[y] || []).indexOf(md) === -1) return false;
    var vn = velkaNoc(y), pi = new Date(vn), po = new Date(vn);
    pi.setDate(vn.getDate() - 2); po.setDate(vn.getDate() + 1);
    var rovnaky = function (x) { return x.getMonth() === dt.getMonth() && x.getDate() === dt.getDate(); };
    return !(rovnaky(pi) || rovnaky(po));
  }
  function kedy() {
    var dnes = new Date(), zajtra = new Date(dnes.getFullYear(), dnes.getMonth(), dnes.getDate() + 1);
    if (pracovny(dnes) && pracovny(zajtra)) return "do 24 hodín";
    var d = new Date(zajtra); while (!pracovny(d)) d.setDate(d.getDate() + 1);
    return "najneskôr " + DNI[d.getDay()] + " " + d.getDate() + ". " + (d.getMonth() + 1) + ".";
  }
  function inicialy(m) { return String(m || "").split(/[\s,]+/).filter(function (x) { return x && !/\.$/.test(x); }).slice(0, 2).map(function (x) { return x[0]; }).join("").toUpperCase(); }
  function hotovo(r, u) {
    var meno = (u.meno || "").split(/\s+/)[0], m = r && r.makler, zena = m && m.pohlavie === "zena";
    el("hotovo-t").textContent = "Ďakujeme, " + meno + ". Približnú hodnotu vám " + (m && r.pokryte ? (zena ? "maklérka" : "maklér") : "maklér") +
      " oznámi telefonicky alebo e-mailom " + kedy().replace(/\.$/, "") + ".";
    var mk = el("makler"), mimo = el("hotovo-mimo");
    if (m && r.pokryte) {
      var tel = String(m.telefon || "").trim();
      mk.innerHTML = '<span class="makler-foto">' + (m.foto ? '<img src="' + esc(m.foto) + '" alt="">' : esc(inicialy(m.meno))) + "</span>" +
        "<span><small>Žiadosť dostal" + (zena ? "a" : "") + "</small><b>" + esc(m.meno) + "</b>" + (m.kancelaria ? "<small>" + esc(m.kancelaria) + "</small>" : "") +
        (tel ? '<small><a href="tel:' + esc(tel.replace(/[^\d+]/g, "")) + '">' + esc(tel) + "</a></small>" : "") + "</span>";
      mk.hidden = false; mimo.hidden = true;
    } else {
      mk.hidden = true;
      mimo.textContent = "V okrese " + (r && r.okres || (V.obec && V.obec.o) || "") + " zatiaľ nemáme makléra, ktorý by používal Týpka. Žiadosť sme prijali a dáme vám vedieť, či vám vieme pomôcť.";
      mimo.hidden = false;
    }
    el("flow").hidden = true; el("hotovo").hidden = false;
    el("odhad").scrollIntoView({ behavior: pohybOk() ? "smooth" : "auto", block: "start" });
    el("hotovo-n").focus({ preventScroll: true });
  }
  function odosli() {
    var u = udaje(), med = el("web").value;
    dalejBtn.disabled = true; dalejBtn.textContent = "Odosielam…";
    function posli(nul) {
      return overenie(nul).then(function (ov) {
        POW = null;
        return rpc("odhad_ziadost", { p_udaje: u, p_overenie: { ts: ov.ts, n: ov.n, med: med } });
      });
    }
    posli(4).catch(function (e) { if (e && e.message === "tazsie-overenie") return posli(5); throw e; })
      .then(function (r) { hotovo(r || {}, u); })
      .catch(function (e) { chyba(((e && e.message) || "Odoslanie sa nepodarilo.") + " Ak to nepôjde, napíšte nám na info@realitnytypek.sk."); })
      .then(function () { dalejBtn.disabled = false; dalejBtn.textContent = cur === kroky.length - 1 ? "Požiadať o odhad" : "Pokračovať"; });
  }

  // ---------------------------------------------------------------- spustenie
  function start() {
    form = el("form"); if (!form) return;
    kroky = $$(".krok", form); dalejBtn = el("dalej"); spatBtn = el("spat");
    nastavTyp("byt");
    napojObec();
    dalejBtn.addEventListener("click", function () {
      if (!over()) return;
      if (cur < kroky.length - 1) ukaz(cur + 1, 1); else odosli();
    });
    spatBtn.addEventListener("click", function () { if (cur > 0) ukaz(cur - 1, -1); });
    // typ: výber hneď posunie na ďalší krok
    $$('input[name="typ"]', form).forEach(function (r) {
      r.addEventListener("change", function () {
        nastavTyp(r.value); skryChybu();
        setTimeout(function () { if (cur === 0) ukaz(1, 1); }, pohybOk() ? 260 : 0);
      });
    });
    // siete: „Žiadne siete“ a „Neviem“ vylučujú ostatné
    $$('input[name="siete"]', form).forEach(function (c) {
      c.addEventListener("change", function () {
        if (!c.checked) return;
        $$('input[name="siete"]', form).forEach(function (x) { if (x !== c && (c.hasAttribute("data-vylucne") || x.hasAttribute("data-vylucne"))) x.checked = false; });
      });
    });
    $$('input[name="dovod"]', form).forEach(function (r) {
      r.addEventListener("change", function () { el("platene-info").hidden = !r.hasAttribute("data-platene"); });
    });
    form.addEventListener("change", function (e) { if (e.target.matches("input[type=radio], input[type=checkbox]")) { var g = e.target.closest(".cipy.zle"); if (g) g.classList.remove("zle"); } });
    form.addEventListener("input", function (e) { if (e.target.getAttribute("aria-invalid") === "true") { e.target.setAttribute("aria-invalid", "false"); el("chyba").hidden = true; } });
    // Enter v poli = Pokračovať (v poznámke nový riadok)
    form.addEventListener("keydown", function (e) {
      if (e.key !== "Enter" || e.target.tagName === "TEXTAREA" || e.target.tagName === "BUTTON" || e.target.tagName === "A" || e.target.id === "obec" && !el("obec-zoznam").hidden) return;
      if (e.target.matches("input[type=checkbox]")) return;
      e.preventDefault(); dalejBtn.click();
    });
    form.addEventListener("submit", function (e) { e.preventDefault(); });
    el("znova").addEventListener("click", function () {
      var kontakt = { meno: el("meno").value, telefon: el("telefon").value, email: el("email").value };
      form.reset(); V.obec = null; infoObce(); el("platene-info").hidden = true;
      el("meno").value = kontakt.meno; el("telefon").value = kontakt.telefon; el("email").value = kontakt.email;
      nastavTyp("byt");
      el("hotovo").hidden = true; el("flow").hidden = false;
      kroky.forEach(function (k, i) { k.hidden = i !== 0; }); cur = 0; ukaz(0, -1);
    });
    // „Chcem aj ponuku na výkup“ – predvyplní dôvod
    $$("[data-vykup]").forEach(function (a) {
      a.addEventListener("click", function () { var r = $('input[name="dovod"][value="Mám záujem aj o ponuku na výkup"]'); if (r) r.checked = true; });
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
