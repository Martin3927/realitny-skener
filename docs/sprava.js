/* Realitný týpek – správa zákazníkov (vidí iba hlavný správca) */
(function () {
  "use strict";

  var CFG = window.SKENER_CONFIG;
  var sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey, { auth: { persistSession: true, autoRefreshToken: true } });

  var MODULY = [
    ["skener", "Realitný skener"], ["web", "Osobný web"], ["kancelaria", "Kancelária komplet"], ["ponuky", "Správa ponúk"],
    ["klienti_aml", "Klienti a AML"], ["dokumenty", "Dokumenty"], ["emailing", "Emailing"], ["ai", "AI"], ["pracovny_email", "Pracovný e-mail"],
  ];
  var MOD_N = {}; MODULY.forEach(function (m) { MOD_N[m[0]] = m[1]; });
  var STAVY = [["zaujemca", "Záujemca"], ["skusobna", "Skúšobná doba"], ["aktivny", "Platiaci"], ["pozastaveny", "Pozastavený"], ["zruseny", "Zrušený"]];
  var TYP = { kancelaria: "Realitná kancelária", makler: "Samostatný maklér" };

  var S = { zak: [], platby: [], filter: { q: "", typ: "", stav: "pozornost_vsetci" } };
  var $ = function (s, r) { return (r || document).querySelector(s); };

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function toast(t, chyba) {
    var e = $("#toast"); e.textContent = t; e.className = chyba ? "err" : ""; e.hidden = false;
    clearTimeout(toast.t); toast.t = setTimeout(function () { e.hidden = true; }, chyba ? 6000 : 3000);
  }
  function chybaText(e) { return (e && (e.message || e.error_description)) || String(e); }

  // ---------------------------------------------------------------- dátumy a peniaze
  function dnes() { var d = new Date(); return iso(d); }
  function iso(d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
  function zIso(s) { var p = String(s).split("-"); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function plusDni(s, n) { var d = zIso(s || dnes()); d.setDate(d.getDate() + n); return iso(d); }
  function plusMes(s, n) { var d = zIso(s || dnes()); var den = d.getDate(); d.setDate(1); d.setMonth(d.getMonth() + n); var max = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate(); d.setDate(Math.min(den, max)); return iso(d); }
  function rozdielDni(s) { return Math.round((zIso(s) - zIso(dnes())) / 86400000); }
  function dat(s) { if (!s) return "–"; var p = String(s).slice(0, 10).split("-"); return +p[2] + ". " + +p[1] + ". " + p[0]; }
  function eur(n) { if (n == null || n === "") return "–"; return Number(n).toLocaleString("sk-SK", { minimumFractionDigits: Number(n) % 1 ? 2 : 0, maximumFractionDigits: 2 }) + " €"; }
  function dni(n) { n = Math.abs(n); return n === 1 ? "1 deň" : n < 5 ? n + " dni" : n + " dní"; }

  // cenník (s DPH): skener 19 € + 2 € za každý ďalší okres, osobný web 69 €
  function cenaPodlaCennika(moduly, pocetOkresov) {
    var c = 0, nezname = [];
    moduly.forEach(function (m) {
      if (m === "skener") c += 19 + 2 * (Math.max(1, pocetOkresov) - 1);
      else if (m === "web") c += 69;
      else nezname.push(MOD_N[m] || m);
    });
    return { cena: c, nezname: nezname };
  }

  // ---------------------------------------------------------------- stav zákazníka
  function stav(z) {
    if (z.stav === "zruseny") return { t: "Zrušený", c: "sivy", poradie: 9 };
    if (z.stav === "pozastaveny") return { t: "Pozastavený", c: "zly", poradie: 3, pozor: true };
    if (z.stav === "zaujemca") return { t: "Záujemca", c: "info", poradie: 5 };
    if (z.stav === "skusobna") {
      if (!z.skusobna_do) return { t: "Skúšobná doba", c: "info", poradie: 4 };
      var d = rozdielDni(z.skusobna_do);
      if (d < 0) return { t: "Skúšobná skončila pred " + dni(d), c: "zly", poradie: 1, pozor: true };
      if (d <= 7) return { t: d === 0 ? "Skúšobná končí dnes" : "Skúšobná končí o " + dni(d), c: "pozor", poradie: 2, pozor: true };
      return { t: "Skúšobná doba – ešte " + dni(d), c: "info", poradie: 4 };
    }
    if (!z.zaplatene_do) return { t: "Platiaci – bez zapísanej platby", c: "pozor", poradie: 2, pozor: true };
    var p = rozdielDni(z.zaplatene_do);
    if (p < 0) return { t: "Po splatnosti " + dni(p), c: "zly", poradie: 0, pozor: true };
    if (p <= 7) return { t: p === 0 ? "Platba končí dnes" : "Platba končí o " + dni(p), c: "pozor", poradie: 2, pozor: true };
    return { t: "Platí", c: "dobry", poradie: 6 };
  }
  function uhradene(id) { return S.platby.filter(function (p) { return p.zakaznik_id === id; }).reduce(function (s, p) { return s + Number(p.suma); }, 0); }
  function objednane(z) {
    var m = (z.moduly || []).map(function (k) { return k === "skener" && (z.okresy || []).length ? "Skener (" + z.okresy.length + " " + (z.okresy.length === 1 ? "okres" : z.okresy.length < 5 ? "okresy" : "okresov") + ")" : MOD_N[k] || k; });
    return m.length ? m.join(", ") : "nič zatiaľ";
  }

  // ---------------------------------------------------------------- načítanie
  async function nacitaj() {
    var r = await Promise.all([
      sb.from("zakaznici").select("*").order("nazov"),
      sb.from("zakaznici_platby").select("*").order("datum", { ascending: false }),
    ]);
    if (r[0].error) throw r[0].error;
    if (r[1].error) throw r[1].error;
    S.zak = r[0].data; S.platby = r[1].data;
  }

  async function start() {
    var s = await sb.auth.getSession();
    if (!s.data.session) return hlaska("Najprv sa prihlás", "Správa zákazníkov používa rovnaké prihlásenie ako aplikácia.", '<a class="btn primary" href="./">Prihlásiť sa</a>');
    var h = await sb.rpc("je_hlavny_spravca");
    if (h.error) return hlaska("Správa zákazníkov sa ešte pripravuje", "Databáza ešte nie je aktualizovaná. Skús to o pár minút.", '<a class="btn" href="./">Späť do aplikácie</a>');
    if (h.data !== true) return hlaska("Sem nemáš prístup", "Správu zákazníkov vidí iba hlavný správca Realitného týpka.", '<a class="btn" href="./">Späť do aplikácie</a>');
    try { await nacitaj(); } catch (e) { return hlaska("Nepodarilo sa načítať zákazníkov", chybaText(e), '<button class="btn" onclick="location.reload()">Skúsiť znova</button>'); }
    window.addEventListener("hashchange", trasa);
    trasa();
  }
  function hlaska(nadpis, text, tlacidlo) {
    $("#sp").innerHTML = '<div class="sp-hlaska"><img src="typek-postava.png" alt="" width="96" height="108"><h2>' + esc(nadpis) + "</h2><p>" + esc(text) + "</p>" + (tlacidlo || "") + "</div>";
  }
  function trasa() {
    var h = location.hash;
    if (h === "#clanky") return clankyPrehlad();
    if (h === "#clanok-novy") return clanokEditor(null);
    var mc = h.match(/^#clanok\/(\d+)$/);
    if (mc) return clanokEditor(Number(mc[1]));
    var m = h.match(/^#z\/(\d+)$/);
    if (m) { var z = S.zak.find(function (x) { return x.id === Number(m[1]); }); if (z) return detail(z); }
    if (h === "#novy") return detail(null);
    prehlad();
  }

  // ---------------------------------------------------------------- prehľad
  function prehlad() {
    var aktivni = S.zak.filter(function (z) { return z.stav !== "zruseny"; });
    var skusobna = S.zak.filter(function (z) { return z.stav === "skusobna"; });
    var platiaci = S.zak.filter(function (z) { return z.stav === "aktivny"; });
    var pozor = S.zak.filter(function (z) { return stav(z).pozor; });
    var mesacne = platiaci.reduce(function (s, z) { return s + Number(z.mesacna_cena || 0); }, 0);
    var spolu = S.platby.reduce(function (s, p) { return s + Number(p.suma); }, 0);
    var tento = dnes().slice(0, 7);
    var mesiac = S.platby.filter(function (p) { return String(p.datum).slice(0, 7) === tento; }).reduce(function (s, p) { return s + Number(p.suma); }, 0);

    $("#sp").innerHTML = zalozky("zak") +
      '<div class="sp-uvod"><div><h1>Zákazníci</h1><p>Kancelárie a samostatní makléri, ktorí používajú Realitný týpek.</p></div>' +
        '<a class="btn primary sp-novy" href="#novy">+ Nový zákazník</a></div>' +
      '<div class="sp-dlazdice">' +
        dlazdica("Zákazníci", aktivni.length, "bez zrušených") +
        dlazdica("Na skúšku", skusobna.length, skusobna.filter(function (z) { return z.skusobna_do && rozdielDni(z.skusobna_do) <= 7; }).length + " končí do 7 dní") +
        dlazdica("Platiaci", platiaci.length, eur(mesacne) + " mesačne") +
        dlazdica("Treba riešiť", pozor.length, "po splatnosti, koniec skúšky", pozor.length ? "pozor" : "") +
        dlazdica("Uhradené tento mesiac", eur(mesiac), "spolu od začiatku " + eur(spolu)) +
      "</div>" +
      '<div class="sp-filtre">' +
        '<input type="search" id="f-q" placeholder="Hľadať názov, IČO, kontakt…" value="' + esc(S.filter.q) + '">' +
        '<select id="f-typ"><option value="">Všetky typy</option><option value="kancelaria">Realitné kancelárie</option><option value="makler">Samostatní makléri</option></select>' +
        '<select id="f-stav"><option value="pozornost_vsetci">Všetci okrem zrušených</option><option value="pozor">Treba riešiť</option>' +
          STAVY.map(function (s) { return '<option value="' + s[0] + '">' + s[1] + "</option>"; }).join("") + '<option value="">Úplne všetci</option></select>' +
      "</div>" +
      '<div id="sp-zoznam"></div>';
    $("#f-typ").value = S.filter.typ; $("#f-stav").value = S.filter.stav;
    $("#f-q").addEventListener("input", function (e) { S.filter.q = e.target.value; zoznam(); });
    $("#f-typ").addEventListener("change", function (e) { S.filter.typ = e.target.value; zoznam(); });
    $("#f-stav").addEventListener("change", function (e) { S.filter.stav = e.target.value; zoznam(); });
    zoznam();
  }
  function dlazdica(n, v, pod, trieda) {
    return '<div class="sp-dl ' + (trieda || "") + '"><span>' + esc(n) + "</span><b>" + esc(v) + "</b><small>" + esc(pod) + "</small></div>";
  }
  function zoznam() {
    var q = S.filter.q.trim().toLowerCase(), f = S.filter;
    var rows = S.zak.filter(function (z) {
      if (f.typ && z.typ !== f.typ) return false;
      if (f.stav === "pozornost_vsetci" && z.stav === "zruseny") return false;
      if (f.stav === "pozor" && !stav(z).pozor) return false;
      if (f.stav && f.stav !== "pozor" && f.stav !== "pozornost_vsetci" && z.stav !== f.stav) return false;
      if (q && [z.nazov, z.ico, z.kontakt_meno, z.email, z.telefon, (z.okresy || []).join(" ")].join(" ").toLowerCase().indexOf(q) < 0) return false;
      return true;
    }).sort(function (a, b) { return stav(a).poradie - stav(b).poradie || a.nazov.localeCompare(b.nazov, "sk"); });

    if (!S.zak.length) {
      $("#sp-zoznam").innerHTML = '<div class="sp-prazdne"><img src="typek-postava.png" alt="" width="110" height="124"><h3>Zatiaľ žiadni zákazníci</h3>' +
        "<p>Keď sa ozve záujemca, zapíš ho sem. Uvidíš, čo si objednal, kedy mu končí skúšobná doba a koľko už zaplatil.</p>" +
        '<a class="btn primary" href="#novy">+ Pridať prvého zákazníka</a></div>';
      return;
    }
    if (!rows.length) { $("#sp-zoznam").innerHTML = '<p class="sp-nic">Tomuto filtru nezodpovedá žiadny zákazník.</p>'; return; }

    $("#sp-zoznam").innerHTML = '<div class="sp-tab" role="table">' +
      '<div class="sp-riadok sp-th" role="row"><span>Zákazník</span><span>Objednané</span><span>Stav</span><span>Skúšobná do</span><span>Zaplatené do</span><span class="r">Mesačne</span><span class="r">Uhradené</span></div>' +
      rows.map(function (z) {
        var st = stav(z);
        return '<a class="sp-riadok" role="row" href="#z/' + z.id + '">' +
          '<span class="sp-meno"><b>' + esc(z.nazov) + '</b><small>' + TYP[z.typ] + (z.typ === "kancelaria" ? " · " + z.pocet_maklerov + " " + (z.pocet_maklerov === 1 ? "maklér" : z.pocet_maklerov < 5 ? "makléri" : "maklérov") : "") +
            (z.kontakt_meno ? " · " + esc(z.kontakt_meno) : "") + "</small></span>" +
          '<span data-n="Objednané">' + esc(objednane(z)) + "</span>" +
          '<span data-n="Stav"><i class="sp-stav ' + st.c + '">' + esc(st.t) + "</i></span>" +
          '<span data-n="Skúšobná do">' + dat(z.skusobna_do) + "</span>" +
          '<span data-n="Zaplatené do">' + dat(z.zaplatene_do) + "</span>" +
          '<span data-n="Mesačne" class="r">' + eur(z.mesacna_cena) + (z.mesacna_cena != null && z.cena_zamrazena_do && rozdielDni(z.cena_zamrazena_do) >= 0 ? ' <i class="sp-zamraz" title="Cena zamrazená do ' + dat(z.cena_zamrazena_do) + '">❄</i>' : "") + "</span>" +
          '<span data-n="Uhradené" class="r">' + eur(uhradene(z.id)) + "</span></a>";
      }).join("") + "</div>";
  }

  // ---------------------------------------------------------------- detail / nový zákazník
  function pole(id, n, val, typ, extra) {
    return '<label class="field"><span>' + n + '</span><input type="' + (typ || "text") + '" id="' + id + '" value="' + esc(val == null ? "" : val) + '"' + (extra || "") + "></label>";
  }
  function detail(z) {
    var novy = !z;
    if (novy) {
      var d = dnes();
      z = { typ: "kancelaria", nazov: "", stav: "skusobna", moduly: ["skener"], okresy: [], pocet_maklerov: 1, skusobna_od: d, skusobna_do: plusDni(d, 30),
        platba_obdobie: "mesacne", cena_zamrazena_do: plusMes(d, 36) };
    }
    var platby = novy ? [] : S.platby.filter(function (p) { return p.zakaznik_id === z.id; });
    var st = novy ? null : stav(z);

    $("#sp").innerHTML =
      '<a class="sp-spat" href="#">← Všetci zákazníci</a>' +
      '<div class="sp-uvod"><div><h1>' + (novy ? "Nový zákazník" : esc(z.nazov)) + "</h1>" +
        (novy ? "<p>Vyplň, čo vieš. Zvyšok doplníš neskôr.</p>" : '<p><i class="sp-stav ' + st.c + '">' + esc(st.t) + "</i> · " + TYP[z.typ] + " · zapísaný " + dat(z.vytvorene) + "</p>") + "</div>" +
        (novy ? "" : '<div class="sp-sumar"><span>Uhradené spolu</span><b>' + eur(uhradene(z.id)) + "</b></div>") + "</div>" +
      (novy ? "" : rychleAkcie(z)) +
      '<form id="sp-form" class="sp-form" novalidate>' +
        '<section class="sp-box"><h3>Kto to je</h3>' +
          '<div class="sp-seg" role="radiogroup" aria-label="Typ zákazníka">' +
            ["kancelaria", "makler"].map(function (t) { return '<label><input type="radio" name="typ" value="' + t + '"' + (z.typ === t ? " checked" : "") + "><span>" + TYP[t] + "</span></label>"; }).join("") + "</div>" +
          '<div class="form-grid">' +
            pole("z-nazov", "Názov / meno *", z.nazov, "text", " required") + pole("z-ico", "IČO", z.ico) + pole("z-dic", "DIČ", z.dic) + pole("z-icdph", "IČ DPH", z.ic_dph) +
          "</div>" + '<div class="form-grid">' + pole("z-adresa", "Adresa / sídlo", z.adresa) + "</div></section>" +

        '<section class="sp-box"><h3>Kontakt</h3><div class="form-grid">' +
          pole("z-kontakt", "Kontaktná osoba", z.kontakt_meno) + pole("z-tel", "Telefón", z.telefon, "tel") + pole("z-email", "E-mail", z.email, "email") + pole("z-web", "Web", z.web, "url") +
        "</div></section>" +

        '<section class="sp-box"><h3>Čo má objednané</h3>' +
          '<div class="sp-moduly">' + MODULY.map(function (m) {
            return '<label class="chk"><input type="checkbox" name="mod" value="' + m[0] + '"' + ((z.moduly || []).indexOf(m[0]) >= 0 ? " checked" : "") + ">" + m[1] + "</label>";
          }).join("") + '</div><p class="sp-pozn">Kataster a mapa, Kalendár a Chat sú zadarmo pre každého.</p>' +
          '<div class="form-grid">' +
            pole("z-okresy", "Okresy pre skener (oddeľ čiarkou)", (z.okresy || []).join(", "), "text", ' placeholder="napr. Poprad, Kežmarok"') +
            pole("z-pocet", "Počet maklérov", z.pocet_maklerov, "number", ' min="0" step="1"') +
            '<label class="field"><span>Platí</span><select id="z-obdobie"><option value="mesacne">mesačne</option><option value="rocne">ročne (11 mesiacov)</option></select></label>' +
          "</div>" +
          '<div class="form-grid sp-cena">' +
            '<label class="field"><span>Mesačná cena s DPH (€)</span><span class="sp-s-tl"><input type="number" id="z-cena" min="0" step="0.01" value="' + esc(z.mesacna_cena == null ? "" : z.mesacna_cena) + '"><button type="button" class="btn" id="z-cennik">Podľa cenníka</button></span></label>' +
            pole("z-zamraz", "Cena zamrazená do", z.cena_zamrazena_do, "date") +
          '</div><p class="sp-pozn" id="z-cennik-info"></p></section>' +

        '<section class="sp-box"><h3>Stav a termíny</h3><div class="form-grid">' +
          '<label class="field"><span>Stav</span><select id="z-stav">' + STAVY.map(function (s) { return '<option value="' + s[0] + '">' + s[1] + "</option>"; }).join("") + "</select></label>" +
          pole("z-sk-od", "Skúšobná od", z.skusobna_od, "date") +
          '<label class="field"><span>Skúšobná do</span><span class="sp-s-tl"><input type="date" id="z-sk-do" value="' + esc(z.skusobna_do || "") + '"><button type="button" class="btn" data-predlz="14">+14 dní</button></span></label>' +
          pole("z-zapl", "Zaplatené do", z.zaplatene_do, "date") +
        '</div><p class="sp-pozn">„Zaplatené do“ sa posúva samo, keď zapíšeš platbu nižšie.</p></section>' +

        '<section class="sp-box"><h3>Poznámky</h3><div class="form-grid">' + pole("z-zdroj", "Odkiaľ prišiel", z.zdroj, "text", ' placeholder="odporúčanie, web, telefonát…"') + "</div>" +
          '<label class="field"><span>Poznámky pre mňa</span><textarea id="z-pozn" rows="4" placeholder="dohody, sľuby, s kým som hovoril…">' + esc(z.poznamky || "") + "</textarea></label></section>" +

        '<div class="sp-uloz"><button type="submit" class="btn primary">' + (novy ? "Uložiť zákazníka" : "Uložiť zmeny") + '</button><a class="btn ghost" href="#">Zrušiť</a>' +
          (novy ? "" : '<button type="button" class="btn danger sp-zmaz" id="z-zmaz">Zmazať zákazníka</button>') + "</div>" +
      "</form>" +
      (novy ? "" : platbyHtml(z, platby) + pristupHtml());

    $("#z-obdobie").value = z.platba_obdobie || "mesacne";
    $("#z-stav").value = z.stav;
    var form = $("#sp-form");

    $("#z-cennik").addEventListener("click", function () {
      var moduly = Array.from(form.querySelectorAll('[name="mod"]:checked')).map(function (x) { return x.value; });
      var okr = okresyZPola();
      var c = cenaPodlaCennika(moduly, okr.length);
      $("#z-cena").value = c.cena || "";
      $("#z-cennik-info").textContent = (moduly.indexOf("skener") >= 0 ? "Skener: " + Math.max(1, okr.length) + " okr. = " + eur(19 + 2 * (Math.max(1, okr.length) - 1)) + ". " : "") +
        (moduly.indexOf("web") >= 0 ? "Osobný web 69 €. " : "") + (c.nezname.length ? "Bez ceny v cenníku: " + c.nezname.join(", ") + " – dopíš ručne." : "") +
        ($("#z-obdobie").value === "rocne" && c.cena ? " Ročne: " + eur(c.cena * 11) + "." : "");
    });
    form.querySelector("[data-predlz]").addEventListener("click", function () {
      var v = $("#z-sk-do").value; var zaklad = v && v > dnes() ? v : dnes();
      $("#z-sk-do").value = plusDni(zaklad, 14);
    });
    form.addEventListener("submit", function (e) { e.preventDefault(); ulozZakaznika(novy ? null : z); });
    if (!novy) {
      $("#z-zmaz").addEventListener("click", function () { zmazZakaznika(z); });
      document.querySelectorAll("[data-akcia]").forEach(function (b) { b.addEventListener("click", function () { rychlaAkcia(z, b.dataset.akcia); }); });
      platbyUdalosti(z);
    } else {
      $("#z-nazov").focus();
    }
    window.scrollTo(0, 0);
  }
  function okresyZPola() {
    return $("#z-okresy").value.split(/[,;\n]/).map(function (s) { return s.trim(); }).filter(Boolean);
  }
  function hodnota(id) { var v = $(id).value.trim(); return v === "" ? null : v; }

  async function ulozZakaznika(z) {
    var form = $("#sp-form");
    var nazov = $("#z-nazov").value.trim();
    if (!nazov) { $("#z-nazov").focus(); return toast("Doplň názov alebo meno zákazníka.", true); }
    var skOd = hodnota("#z-sk-od"), skDo = hodnota("#z-sk-do");
    if (skOd && skDo && skDo < skOd) return toast("Koniec skúšobnej doby je pred jej začiatkom.", true);
    var data = {
      typ: form.querySelector('[name="typ"]:checked').value, nazov: nazov,
      ico: hodnota("#z-ico"), dic: hodnota("#z-dic"), ic_dph: hodnota("#z-icdph"), adresa: hodnota("#z-adresa"),
      kontakt_meno: hodnota("#z-kontakt"), telefon: hodnota("#z-tel"), email: hodnota("#z-email"), web: hodnota("#z-web"),
      moduly: Array.from(form.querySelectorAll('[name="mod"]:checked')).map(function (x) { return x.value; }),
      okresy: okresyZPola(),
      pocet_maklerov: Math.max(0, parseInt($("#z-pocet").value, 10) || 0),
      platba_obdobie: $("#z-obdobie").value,
      mesacna_cena: hodnota("#z-cena") == null ? null : Number(hodnota("#z-cena")),
      cena_zamrazena_do: hodnota("#z-zamraz"),
      stav: $("#z-stav").value, skusobna_od: skOd, skusobna_do: skDo, zaplatene_do: hodnota("#z-zapl"),
      zdroj: hodnota("#z-zdroj"), poznamky: hodnota("#z-pozn"),
    };
    var btn = form.querySelector('[type="submit"]'); btn.disabled = true;
    try {
      var r = z ? await sb.from("zakaznici").update(data).eq("id", z.id).select().single()
                : await sb.from("zakaznici").insert(data).select().single();
      if (r.error) throw r.error;
      await nacitaj();
      toast(z ? "Zmeny sú uložené." : "Zákazník je zapísaný.");
      if (z) detail(S.zak.find(function (x) { return x.id === r.data.id; }));
      else location.hash = "#z/" + r.data.id;
    } catch (e) { toast(chybaText(e), true); btn.disabled = false; }
  }
  async function zmazZakaznika(z) {
    var pl = S.platby.filter(function (p) { return p.zakaznik_id === z.id; }).length;
    if (!confirm("Naozaj zmazať zákazníka „" + z.nazov + "“" + (pl ? " aj s " + pl + " zapísanými platbami" : "") + "?\n\nAk už nespolupracujete, radšej mu nastav stav Zrušený – história ostane.")) return;
    var r = await sb.from("zakaznici").delete().eq("id", z.id);
    if (r.error) return toast(chybaText(r.error), true);
    await nacitaj(); toast("Zákazník je zmazaný."); location.hash = "";
  }

  // ---------------------------------------------------------------- rýchle akcie
  function rychleAkcie(z) {
    var b = [];
    if (z.stav === "zaujemca") b.push(["skuska", "Spustiť skúšobnú dobu (30 dní)"]);
    if (z.stav === "skusobna") b.push(["predlz14", "Predĺžiť skúšku o 14 dní"], ["aktivny", "Prešiel na platenú verziu"]);
    if (z.stav === "aktivny") b.push(["pozastavit", "Pozastaviť"]);
    if (z.stav === "pozastaveny") b.push(["aktivny", "Obnoviť"]);
    if (z.stav !== "zruseny") b.push(["zrusit", "Zrušiť spoluprácu"]); else b.push(["obnovit_zaujemca", "Vrátiť medzi záujemcov"]);
    return '<div class="sp-akcie">' + b.map(function (x) { return '<button type="button" class="btn' + (x[0] === "zrusit" ? " ghost danger" : "") + '" data-akcia="' + x[0] + '">' + x[1] + "</button>"; }).join("") +
      (z.telefon ? '<a class="btn ghost" href="tel:' + esc(z.telefon.replace(/\s/g, "")) + '">📞 ' + esc(z.telefon) + "</a>" : "") +
      (z.email ? '<a class="btn ghost" href="mailto:' + esc(z.email) + '">✉ ' + esc(z.email) + "</a>" : "") + "</div>";
  }
  async function rychlaAkcia(z, a) {
    var zmena = {};
    if (a === "skuska") { zmena = { stav: "skusobna", skusobna_od: dnes(), skusobna_do: plusDni(dnes(), 30) }; }
    if (a === "predlz14") { var zaklad = z.skusobna_do && z.skusobna_do > dnes() ? z.skusobna_do : dnes(); zmena = { skusobna_do: plusDni(zaklad, 14) }; }
    if (a === "aktivny") zmena = { stav: "aktivny" };
    if (a === "pozastavit") { if (!confirm("Pozastaviť zákazníka „" + z.nazov + "“?")) return; zmena = { stav: "pozastaveny" }; }
    if (a === "zrusit") { if (!confirm("Zrušiť spoluprácu so zákazníkom „" + z.nazov + "“? Údaje aj platby ostanú zapísané.")) return; zmena = { stav: "zruseny" }; }
    if (a === "obnovit_zaujemca") zmena = { stav: "zaujemca" };
    var r = await sb.from("zakaznici").update(zmena).eq("id", z.id).select().single();
    if (r.error) return toast(chybaText(r.error), true);
    await nacitaj();
    toast(a === "predlz14" ? "Skúšobná doba je predĺžená do " + dat(r.data.skusobna_do) + "." : "Uložené.");
    detail(S.zak.find(function (x) { return x.id === z.id; }));
  }

  // ---------------------------------------------------------------- platby
  function platbyHtml(z, platby) {
    var od = z.zaplatene_do && z.zaplatene_do >= dnes() ? plusDni(z.zaplatene_do, 1) : dnes();
    return '<section class="sp-box sp-platby"><h3>Platby</h3>' +
      '<form id="pl-form" class="sp-pl-form" novalidate>' +
        '<div class="sp-pl-rychle"><span>Vyplniť za:</span><button type="button" class="btn" data-obd="1">1 mesiac</button><button type="button" class="btn" data-obd="12">1 rok (11 mes.)</button></div>' +
        '<div class="form-grid">' +
          pole("pl-datum", "Dátum platby", dnes(), "date") +
          pole("pl-suma", "Suma s DPH (€) *", "", "number", ' step="0.01"') +
          pole("pl-od", "Obdobie od", od, "date") +
          pole("pl-do", "Obdobie do", "", "date") +
          pole("pl-zaco", "Za čo", "", "text", ' placeholder="napr. skener november"') +
          pole("pl-fa", "Číslo faktúry", "") +
        '</div><div class="form-actions"><button type="submit" class="btn primary">Zapísať platbu</button></div></form>' +
      (platby.length ? '<div class="sp-pl-zoznam">' + platby.map(function (p) {
        return '<div class="sp-pl"><span class="sp-pl-d">' + dat(p.datum) + "</span><b>" + eur(p.suma) + "</b>" +
          "<span>" + (p.obdobie_od || p.obdobie_do ? dat(p.obdobie_od) + " – " + dat(p.obdobie_do) : "") + (p.za_co ? " · " + esc(p.za_co) : "") + (p.cislo_faktury ? " · FA " + esc(p.cislo_faktury) : "") + "</span>" +
          '<button type="button" class="btn ghost danger" data-zmaz-pl="' + p.id + '" title="Zmazať platbu" aria-label="Zmazať platbu">×</button></div>';
      }).join("") + "</div>" : '<p class="sp-nic">Zatiaľ žiadna platba.</p>') + "</section>";
  }
  function platbyUdalosti(z) {
    var f = $("#pl-form");
    f.querySelectorAll("[data-obd]").forEach(function (b) {
      b.addEventListener("click", function () {
        var mes = Number(b.dataset.obd), od = $("#pl-od").value || dnes();
        $("#pl-do").value = plusDni(plusMes(od, mes), -1);
        if (z.mesacna_cena) $("#pl-suma").value = mes === 12 ? Number(z.mesacna_cena) * 11 : Number(z.mesacna_cena);
        if (!$("#pl-zaco").value) $("#pl-zaco").value = mes === 12 ? "ročné predplatné" : "mesačné predplatné";
      });
    });
    f.addEventListener("submit", async function (e) {
      e.preventDefault();
      var suma = Number($("#pl-suma").value);
      if (!suma) { $("#pl-suma").focus(); return toast("Zadaj sumu platby.", true); }
      var od = hodnota("#pl-od"), d = hodnota("#pl-do");
      if (od && d && d < od) return toast("Obdobie „do“ je pred „od“.", true);
      var btn = f.querySelector('[type="submit"]'); btn.disabled = true;
      var r = await sb.from("zakaznici_platby").insert({ zakaznik_id: z.id, datum: hodnota("#pl-datum") || dnes(), suma: suma, obdobie_od: od, obdobie_do: d, za_co: hodnota("#pl-zaco"), cislo_faktury: hodnota("#pl-fa") });
      if (r.error) { btn.disabled = false; return toast(chybaText(r.error), true); }
      await nacitaj();
      var nz = S.zak.find(function (x) { return x.id === z.id; });
      toast("Platba je zapísaná" + (nz.zaplatene_do ? " – zaplatené do " + dat(nz.zaplatene_do) : "") + ".");
      detail(nz);
    });
    document.querySelectorAll("[data-zmaz-pl]").forEach(function (b) {
      b.addEventListener("click", async function () {
        if (!confirm("Zmazať túto platbu?")) return;
        var r = await sb.from("zakaznici_platby").delete().eq("id", Number(b.dataset.zmazPl));
        if (r.error) return toast(chybaText(r.error), true);
        await nacitaj(); toast("Platba je zmazaná."); detail(S.zak.find(function (x) { return x.id === z.id; }));
      });
    });
  }
  function pristupHtml() {
    return '<section class="sp-box sp-pristup"><h3>Prístup do aplikácie</h3>' +
      "<p>Vlastný účet pre túto kanceláriu a pozvánky pre jej maklérov pribudnú v ďalšom kroku, keď budú kancelárie v databáze od seba oddelené. " +
      "Dovtedy zákazníkovi ukazuj aplikáciu iba osobne.</p></section>";
  }

  // ---------------------------------------------------------------- články na portáli (Týpkove nehnuteľnosti)
  var PORTAL = "https://realitnytypek.sk/nehnutelnosti/";
  var KNIZNICA = ["byt-obyvacka", "byt-kuchyna", "byt-spalna", "byt-centrum", "byt-tehla", "byt-dom", "dom-rodinny", "dom-novostavba", "dom-zahrada", "dom-obyvacka",
    "luxus-obyvacka", "chata", "chata-krb", "chatka", "pozemok", "mesto-namestie", "mesto-letecky"];
  S.clanky = null;
  function zalozky(akt) {
    return '<nav class="sp-zalozky" aria-label="Časti správy">' +
      '<a href="#"' + (akt === "zak" ? ' aria-current="page"' : "") + ">Zákazníci</a>" +
      '<a href="#clanky"' + (akt === "cl" ? ' aria-current="page"' : "") + ">Články na portáli</a></nav>";
  }
  function fotoClanku(f, maly) {
    if (!f) return "";
    if (/^https:\/\//.test(f)) return f;
    return /^[a-z0-9-]{2,60}$/.test(f) ? "img/web/" + f + (maly ? "-m" : "") + ".webp" : "";
  }
  async function nacitajClanky() {
    var r = await sb.rpc("portal_clanky_sprava");
    if (r.error) throw r.error;
    S.clanky = r.data || [];
  }
  async function clankyPrehlad() {
    $("#sp").innerHTML = zalozky("cl") + '<div class="boot">Načítavam články…</div>';
    try { await nacitajClanky(); } catch (e) { $("#sp").innerHTML = zalozky("cl") + '<p class="sp-nic">Články sa nepodarilo načítať: ' + esc(chybaText(e)) + "</p>"; return; }
    var zv = S.clanky.filter(function (c) { return c.stav === "zverejnene"; }).length;
    $("#sp").innerHTML = zalozky("cl") +
      '<div class="sp-uvod"><div><h1>Články na portáli</h1><p>Články v Týpkových nehnuteľnostiach (' + zv + " zverejnených). " +
        '<a href="' + PORTAL + '#clanky" target="_blank" rel="noopener">Pozrieť na portáli</a></p></div>' +
        '<a class="btn primary sp-novy" href="#clanok-novy">+ Nový článok</a></div>' +
      (S.clanky.length ? '<div class="sp-clanky">' + S.clanky.map(function (c) {
        var f = fotoClanku(c.foto, true);
        return '<a class="sp-cl" href="#clanok/' + c.id + '">' + (f ? '<img src="' + esc(f) + '" alt="" loading="lazy">' : '<span class="sp-cl-bez"></span>') +
          "<span><b>" + esc(c.nadpis) + "</b><small>" + dat(c.datum) + (c.autor ? " · " + esc(c.autor) : "") + "</small>" +
          (c.perex ? "<em>" + esc(c.perex) + "</em>" : "") + "</span>" +
          '<i class="sp-stav ' + (c.stav === "zverejnene" ? "dobry" : "sivy") + '">' + (c.stav === "zverejnene" ? "Zverejnený" : "Koncept") + "</i></a>";
      }).join("") + "</div>"
      : '<div class="sp-prazdne"><img src="typek-postava.png" alt="" width="110" height="124"><h3>Zatiaľ žiadne články</h3><p>Napíš prvý článok. Zobrazí sa v Týpkových nehnuteľnostiach v časti Články.</p><a class="btn primary" href="#clanok-novy">+ Nový článok</a></div>');
  }
  async function clanokEditor(id) {
    if (!S.clanky) { try { await nacitajClanky(); } catch (e) { return hlaska("Články sa nepodarilo načítať", chybaText(e), '<a class="btn" href="#clanky">Späť</a>'); } }
    var c = id ? S.clanky.find(function (x) { return x.id === id; }) : null;
    if (id && !c) { location.hash = "#clanky"; return; }
    var novy = !c;
    c = c || { nadpis: "", perex: "", text: "", foto: "", autor: "", stav: "koncept" };
    var vlastna = c.foto && !/^[a-z0-9-]{2,60}$/.test(c.foto) ? c.foto : "";
    $("#sp").innerHTML = zalozky("cl") +
      '<a class="sp-spat" href="#clanky">← Všetky články</a>' +
      '<div class="sp-uvod"><div><h1>' + (novy ? "Nový článok" : esc(c.nadpis)) + "</h1>" +
        (novy ? "<p>Článok sa zobrazí v Týpkových nehnuteľnostiach, keď ho zverejníš.</p>" :
          "<p>" + (c.stav === "zverejnene" ? 'Zverejnený ' + dat(c.datum) + ' · <a href="' + PORTAL + "clanky/" + esc(c.slug) + '" target="_blank" rel="noopener">Pozrieť na portáli</a>' : "Koncept – na portáli ho zatiaľ nikto nevidí") + "</p>") + "</div></div>" +
      '<form id="cl-form" class="sp-form" novalidate>' +
        '<section class="sp-box"><h3>Text</h3>' +
          '<label class="field"><span>Nadpis</span><input id="cl-nadpis" maxlength="140" required value="' + esc(c.nadpis) + '"></label>' +
          '<label class="field"><span>Úvod (zobrazí sa aj na karte článku)</span><textarea id="cl-perex" rows="3" maxlength="400">' + esc(c.perex) + "</textarea></label>" +
          '<label class="field"><span>Text článku</span><textarea id="cl-text" rows="16" maxlength="40000">' + esc(c.text) + "</textarea></label>" +
          '<p class="sp-pozn">Prázdny riadok = nový odsek. Riadok začínajúci <b>## </b> je medzinadpis. Riadky začínajúce <b>- </b> sú zoznam.</p>' +
          '<label class="field"><span>Autor (nepovinné)</span><input id="cl-autor" maxlength="80" value="' + esc(c.autor || "") + '" placeholder="napr. Martin Augustiňák"></label>' +
        "</section>" +
        '<section class="sp-box"><h3>Fotka</h3>' +
          '<div class="sp-kniznica" role="radiogroup" aria-label="Fotka z knižnice">' +
            '<label><input type="radio" name="cl-foto" value=""' + (!c.foto ? " checked" : "") + '><span class="sp-kn-bez">Bez fotky</span></label>' +
            KNIZNICA.map(function (k) { return '<label><input type="radio" name="cl-foto" value="' + k + '"' + (c.foto === k ? " checked" : "") + '><img src="img/web/' + k + '-m.webp" alt="' + k + '" loading="lazy"></label>'; }).join("") +
          "</div>" +
          '<label class="field"><span>Alebo adresa vlastnej fotky (https://…)</span><input id="cl-url" type="url" placeholder="https://" value="' + esc(vlastna) + '"></label>' +
        "</section>" +
        '<section class="sp-box"><h3>Zverejnenie</h3><div class="sp-seg" role="radiogroup" aria-label="Stav článku">' +
          [["koncept", "Koncept"], ["zverejnene", "Zverejnený na portáli"]].map(function (x) { return '<label><input type="radio" name="cl-stav" value="' + x[0] + '"' + (c.stav === x[0] ? " checked" : "") + "><span>" + x[1] + "</span></label>"; }).join("") +
        "</div></section>" +
        '<div class="sp-uloz"><button type="submit" class="btn primary">' + (novy ? "Uložiť článok" : "Uložiť zmeny") + '</button><a class="btn ghost" href="#clanky">Zrušiť</a>' +
          (novy ? "" : '<button type="button" class="btn danger sp-zmaz" id="cl-zmaz">Zmazať článok</button>') + "</div>" +
      "</form>";
    var form = $("#cl-form");
    $("#cl-url").addEventListener("input", function () { if (this.value.trim()) form.querySelectorAll('[name="cl-foto"]').forEach(function (r) { r.checked = false; }); });
    form.querySelectorAll('[name="cl-foto"]').forEach(function (r) { r.addEventListener("change", function () { $("#cl-url").value = ""; }); });
    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      var vyb = form.querySelector('[name="cl-foto"]:checked'), url = $("#cl-url").value.trim();
      var data = { id: novy ? null : c.id, nadpis: $("#cl-nadpis").value, perex: $("#cl-perex").value, text: $("#cl-text").value,
        autor: $("#cl-autor").value, foto: url || (vyb ? vyb.value : ""), stav: (form.querySelector('[name="cl-stav"]:checked') || {}).value || "koncept" };
      if (url && !/^https:\/\//.test(url)) return toast("Adresa fotky musí začínať https://", true);
      var btn = form.querySelector('[type="submit"]'); btn.disabled = true;
      var r = await sb.rpc("ulozit_portal_clanok", { p: data });
      btn.disabled = false;
      if (r.error) return toast(chybaText(r.error), true);
      await nacitajClanky();
      toast(r.data.stav === "zverejnene" ? "Článok je uložený a zverejnený na portáli." : "Článok je uložený ako koncept.");
      if (novy) location.hash = "#clanok/" + r.data.id; else clanokEditor(r.data.id);
    });
    if (!novy) $("#cl-zmaz").addEventListener("click", async function () {
      if (!confirm("Zmazať článok „" + c.nadpis + "“? Z portálu zmizne hneď.")) return;
      var r = await sb.rpc("zmazat_portal_clanok", { p_id: c.id });
      if (r.error) return toast(chybaText(r.error), true);
      await nacitajClanky(); toast("Článok je zmazaný."); location.hash = "#clanky";
    });
  }

  start().catch(function (e) { hlaska("Niečo sa pokazilo", chybaText(e)); });
})();
