/* Realitný týpek – dokončenie registrácie na skúšobnú dobu (odkaz z e-mailu: registracia.html#t=…) */
(function () {
  "use strict";
  var CFG = window.SKENER_CONFIG;
  var sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey, { auth: { persistSession: true, autoRefreshToken: true } });
  var $ = function (s, r) { return (r || document).querySelector(s); };
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }

  // všetkých 79 okresov SR podľa krajov (rovnako ako v objednávke na webe a v Správe zákazníkov)
  var KRAJE = [
    ["Bratislavský kraj", ["Bratislava I", "Bratislava II", "Bratislava III", "Bratislava IV", "Bratislava V", "Malacky", "Pezinok", "Senec"]],
    ["Trnavský kraj", ["Dunajská Streda", "Galanta", "Hlohovec", "Piešťany", "Senica", "Skalica", "Trnava"]],
    ["Trenčiansky kraj", ["Bánovce nad Bebravou", "Ilava", "Myjava", "Nové Mesto nad Váhom", "Partizánske", "Považská Bystrica", "Prievidza", "Púchov", "Trenčín"]],
    ["Nitriansky kraj", ["Komárno", "Levice", "Nitra", "Nové Zámky", "Šaľa", "Topoľčany", "Zlaté Moravce"]],
    ["Žilinský kraj", ["Bytča", "Čadca", "Dolný Kubín", "Kysucké Nové Mesto", "Liptovský Mikuláš", "Martin", "Námestovo", "Ružomberok", "Turčianske Teplice", "Tvrdošín", "Žilina"]],
    ["Banskobystrický kraj", ["Banská Bystrica", "Banská Štiavnica", "Brezno", "Detva", "Krupina", "Lučenec", "Poltár", "Revúca", "Rimavská Sobota", "Veľký Krtíš", "Zvolen", "Žarnovica", "Žiar nad Hronom"]],
    ["Prešovský kraj", ["Bardejov", "Humenné", "Kežmarok", "Levoča", "Medzilaborce", "Poprad", "Prešov", "Sabinov", "Snina", "Stará Ľubovňa", "Stropkov", "Svidník", "Vranov nad Topľou"]],
    ["Košický kraj", ["Gelnica", "Košice I", "Košice II", "Košice III", "Košice IV", "Košice-okolie", "Michalovce", "Rožňava", "Sobrance", "Spišská Nová Ves", "Trebišov"]]
  ];
  var TOKEN = (location.hash.match(/(?:^#|&)t=([0-9a-f]{64})/) || [])[1] || "";
  var D = null, MAX = 3;

  function volaj(telo) {
    return fetch(CFG.supabaseUrl + "/functions/v1/registracia", {
      method: "POST", headers: { apikey: CFG.supabaseKey, Authorization: "Bearer " + CFG.supabaseKey, "Content-Type": "application/json" },
      body: JSON.stringify(Object.assign({ t: TOKEN }, telo)),
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) { j.status = r.status; return j; });
    });
  }

  function obal(obsah) {
    $("#app").innerHTML = '<div class="login reg"><div class="login-box">' +
      '<div class="reg-hlava"><img src="typek-hlavicka.png?v=202610251320" alt="Realitný týpek" width="239" height="240"><h1 class="login-nazov">Realitný <span>týpek</span></h1></div>' +
      obsah + '<p class="prava">© ' + new Date().getFullYear() + " Realitný týpek</p></div></div>";
  }
  function hlaska(nadpis, text, tlacidlo) {
    obal('<div class="reg-hotovo"><h2 style="margin:0;font-size:19px">' + esc(nadpis) + "</h2><p>" + esc(text) + "</p>" + (tlacidlo || "") + "</div>");
  }

  function okresSelect(hodnota) {
    return '<div class="reg-okr"><select aria-label="Okres" required><option value="">Vyberte okres…</option>' +
      KRAJE.map(function (k) {
        return '<optgroup label="' + esc(k[0]) + '">' + k[1].map(function (o) {
          return '<option' + (o === hodnota ? " selected" : "") + ">" + esc(o) + "</option>";
        }).join("") + "</optgroup>";
      }).join("") + '</select><button type="button" aria-label="Odobrať okres" title="Odobrať okres">×</button></div>';
  }
  function okresyObnov() {
    var zoz = $("#r-okresy-zoz"), riadky = zoz.querySelectorAll(".reg-okr");
    riadky.forEach(function (r) { r.querySelector("button").hidden = riadky.length < 2; });
    $("#r-okres-plus").hidden = riadky.length >= MAX;
  }

  function formular() {
    var okresy = D.okresy && D.okresy.length ? D.okresy.slice(0, MAX) : [""];
    obal(
      '<p class="reg-zadarmo">' + (D.platiaci ? "Ešte pár údajov a môžeš začať." : "Ešte pár údajov a máš " + D.dni + " dní zadarmo.") + "</p>" +
      (D.balik && D.balik.length ? '<div class="reg-balik">' + D.balik.map(function (b) { return "<span>" + esc(b) + "</span>"; }).join("") + "</div>" : "") +
      '<form id="r-form" novalidate class="login-box" style="padding:0;gap:14px;animation:none">' +
        '<label class="field"><span>E-mail (prihlasovacie meno)</span><input type="email" value="' + esc(D.email) + '" readonly autocomplete="username"></label>' +
        '<label class="field"><span>Meno a priezvisko</span><input id="r-meno" type="text" autocomplete="name" maxlength="120" required value="' + esc(D.meno) + '"></label>' +
        (D.typ === "kancelaria" ? '<label class="field"><span>Názov realitnej kancelárie</span><input id="r-nazov" type="text" autocomplete="organization" maxlength="160" required value="' + esc(D.nazov) + '"></label>' : "") +
        '<label class="field"><span>Telefón</span><input id="r-tel" type="tel" autocomplete="tel" inputmode="tel" maxlength="30" required placeholder="0900 123 456" value="' + esc(D.telefon) + '"></label>' +
        (D.skener ? '<div class="reg-okresy"><span>Okresy pre skener</span><div id="r-okresy-zoz" class="reg-okresy">' + okresy.map(okresSelect).join("") + "</div>" +
          '<button type="button" class="reg-plus" id="r-okres-plus">+ Pridať okres</button>' +
          '<p class="reg-pozn">' + (D.platiaci ? "Najviac " + MAX + " okresy. Ďalšie ti pridáme podľa objednávky." : "Počas skúšobnej doby najviac " + MAX + " okresy. Ďalšie si pridáš po objednaní.") + "</p></div>" : "") +
        '<label class="field"><span>Heslo (aspoň 8 znakov)</span><input id="r-heslo" type="password" autocomplete="new-password" minlength="8" maxlength="72" required></label>' +
        '<label class="field"><span>Heslo ešte raz</span><input id="r-heslo2" type="password" autocomplete="new-password" minlength="8" maxlength="72" required></label>' +
        '<label class="reg-suhlas"><input type="checkbox" id="r-suhlas" required><span>Súhlasím so <a href="https://realitnytypek.sk/ochrana-udajov.html" target="_blank" rel="noopener">spracovaním osobných údajov</a> na účely používania Realitného týpka.</span></label>' +
        '<div class="error" id="r-err" role="alert"></div>' +
        '<button class="btn primary wide" type="submit">Dokončiť registráciu a začať</button>' +
      "</form>");
    pridajOko();
    if (D.skener) {
      okresyObnov();
      $("#r-okres-plus").addEventListener("click", function () {
        $("#r-okresy-zoz").insertAdjacentHTML("beforeend", okresSelect(""));
        okresyObnov();
        var s = $("#r-okresy-zoz").querySelectorAll("select"); s[s.length - 1].focus();
      });
      $("#r-okresy-zoz").addEventListener("click", function (e) {
        var b = e.target.closest(".reg-okr button");
        if (b) { b.parentNode.remove(); okresyObnov(); }
      });
    }
    $("#r-form").addEventListener("submit", odoslat);
  }

  function pridajOko() {
    document.querySelectorAll('input[type="password"]').forEach(function (inp) {
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

  async function odoslat(e) {
    e.preventDefault();
    var err = $("#r-err"), btn = e.target.querySelector('button[type="submit"]');
    function chyba(t, el) { err.textContent = t; if (el) el.focus(); }
    err.textContent = "";
    var meno = $("#r-meno").value.trim(), tel = $("#r-tel").value.trim(), h = $("#r-heslo").value, h2 = $("#r-heslo2").value;
    var nazov = $("#r-nazov") ? $("#r-nazov").value.trim() : "";
    var okresy = D.skener ? Array.from(document.querySelectorAll("#r-okresy-zoz select")).map(function (s) { return s.value; })
      .filter(function (o, i, a) { return o && a.indexOf(o) === i; }) : [];
    if (meno.length < 3) return chyba("Napíš meno a priezvisko.", $("#r-meno"));
    if ($("#r-nazov") && !nazov) return chyba("Napíš názov realitnej kancelárie.", $("#r-nazov"));
    if (tel.replace(/\D/g, "").length < 9) return chyba("Napíš telefónne číslo (aspoň 9 číslic).", $("#r-tel"));
    if (D.skener && !okresy.length) return chyba("Vyber aspoň jeden okres pre skener.", document.querySelector("#r-okresy-zoz select"));
    if (h.length < 8) return chyba("Heslo musí mať aspoň 8 znakov.", $("#r-heslo"));
    if (h !== h2) return chyba("Heslá sa nezhodujú.", $("#r-heslo2"));
    if (!$("#r-suhlas").checked) return chyba("Potvrď súhlas so spracovaním osobných údajov.", $("#r-suhlas"));
    btn.disabled = true; btn.textContent = "Vytváram účet…";
    var r = await volaj({ akcia: "dokoncit", meno: meno, telefon: tel, nazov: nazov, okresy: okresy, heslo: h }).catch(function () { return { chyba: "Nepodarilo sa spojiť so serverom. Skontroluj internet a skús znova." }; });
    if (!r.ok) {
      btn.disabled = false; btn.textContent = "Dokončiť registráciu a začať";
      if (r.prihlasit) return hlaska("Účet už máš", r.chyba, '<a class="btn primary wide" href="./">Prihlásiť sa</a>');
      if (r.status === 410) return hlaska("Odkaz už neplatí", r.chyba, '<a class="btn primary wide" href="mailto:info@realitnytypek.sk">Napísať na info@realitnytypek.sk</a>');
      return chyba(r.chyba || "Registráciu sa nepodarilo dokončiť. Skús to o chvíľu znova.");
    }
    hlaska("Hotovo, vitaj v Týpkovi! 🎉", (r.skusobna_do ? "Skúšobná doba ti beží do " + datum(r.skusobna_do) + ". " : "") + "Prihlasujem ťa…");
    var s = await sb.auth.signInWithPassword({ email: r.email, password: h });
    if (s.error) return hlaska("Účet je hotový", "Prihlás sa svojím e-mailom a heslom, ktoré si si práve nastavil.", '<a class="btn primary wide" href="./">Prihlásiť sa</a>');
    try { history.replaceState(null, "", location.pathname); } catch (er) { /* nič */ }
    location.replace("./#domov");
  }
  function datum(s) { if (!s) return "konca skúšobnej doby"; var p = String(s).slice(0, 10).split("-"); return +p[2] + ". " + +p[1] + ". " + p[0]; }

  async function start() {
    if (!TOKEN) return hlaska("Odkaz nie je celý", "Otvor prosím odkaz z e-mailu ešte raz – celý, tak ako prišiel. Ak to nepomôže, napíš nám na info@realitnytypek.sk.");
    var r = await volaj({ akcia: "nacitaj" }).catch(function () { return { chyba: "Nepodarilo sa spojiť so serverom. Skontroluj internet a obnov stránku." }; });
    if (!r.ok) {
      return hlaska(r.status === 410 ? "Odkaz už neplatí" : "Niečo sa nepodarilo", r.chyba || "Skús to o chvíľu znova.",
        r.status === 410 ? '<a class="btn primary wide" href="mailto:info@realitnytypek.sk">Napísať na info@realitnytypek.sk</a>' : '<button class="btn primary wide" onclick="location.reload()">Skúsiť znova</button>');
    }
    D = r; MAX = r.max_okresov || 3;
    formular();
  }
  start();
})();
