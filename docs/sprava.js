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
  var STAVY = [["zaujemca", "Záujemca"], ["skusobna", "Skúšobná doba"], ["aktivny", "Platiaci"], ["pozastaveny", "Pozastavený"], ["zruseny", "Zrušený"], ["vlastna", "Vlastná kancelária Týpka (neplatí)"]];
  var TYP = { kancelaria: "Realitná kancelária", makler: "Samostatný maklér" };

  var S = { zak: [], platby: [], filter: { q: "", typ: "", produkt: "", stav: "pozornost_vsetci" } };
  // prepínače v zozname zákazníkov (typ zákazníka a objednaný produkt) – pamätajú si poslednú voľbu
  var F_TYP = [["", "Všetci"], ["kancelaria", "Realitné kancelárie"], ["makler", "Samostatní makléri"]];
  var F_PRODUKT = [["", "Všetko"], ["skener", "Skener"], ["web", "Web makléra"], ["oboje", "Skener aj web"]];
  try {
    var ulozeny = JSON.parse(localStorage.getItem("sprava-filter") || "{}");
    if (F_TYP.some(function (o) { return o[0] === ulozeny.typ; })) S.filter.typ = ulozeny.typ;
    if (F_PRODUKT.some(function (o) { return o[0] === ulozeny.produkt; })) S.filter.produkt = ulozeny.produkt;
  } catch (e) { /* bez pamäte */ }
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

  // cenník (s DPH, od 1. 11. 2026): skener 21 € + 2 € za každý ďalší okres, osobný web 57 €
  // (od 3. 11. 2026 pre kancelárie podľa počtu webov: 2–4 po 45 €, 5–9 po 35 €, od 10 po 29 € za web);
  // s osobným webom je skener za polovicu (balík Jednotlivec = web + skener + pracovný e-mail, správa ponúk a AI v cene)
  function cenaSkenera(pocetOkresov, sWebom) { return (21 + 2 * (Math.max(1, pocetOkresov) - 1)) * (sWebom ? 0.5 : 1); }
  function cenaZaWeb(pocet) { return pocet >= 10 ? 29 : pocet >= 5 ? 35 : pocet >= 2 ? 45 : 57; }
  function cenaWebov(pocet) { pocet = Math.max(1, pocet || 1); return pocet * cenaZaWeb(pocet); }
  function cenaPodlaCennika(moduly, pocetOkresov, pocetWebov) {
    var c = 0, nezname = [], web = moduly.indexOf("web") >= 0, sk = moduly.indexOf("skener") >= 0;
    moduly.forEach(function (m) {
      if (m === "skener") c += cenaSkenera(pocetOkresov, web);
      else if (m === "web") c += cenaWebov(pocetWebov);
      else if (web && (m === "ponuky" || m === "ai" || (m === "pracovny_email" && sk))) { /* v cene webu / balíka */ }
      else nezname.push(MOD_N[m] || m);
    });
    return { cena: c, nezname: nezname };
  }

  // ---------------------------------------------------------------- stav zákazníka
  function stav(z) {
    if (z.stav === "vlastna") return { t: z.typ === "makler" ? "Z vlastnej kancelárie · neplatí" : "Vlastná kancelária Týpka", c: "dobry", poradie: 8 };
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
    var m = (z.moduly || []).map(function (k) {
      if (k === "skener" && (z.okresy || []).length) return "Skener (" + z.okresy.length + " " + (z.okresy.length === 1 ? "okres" : z.okresy.length < 5 ? "okresy" : "okresov") + ")";
      if (k === "web" && z.typ === "kancelaria" && z.pocet_webov > 1) return "Osobné weby (" + z.pocet_webov + ")";
      return MOD_N[k] || k;
    });
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
    if (h === "#kontakty") return kontaktyPrehlad();
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
    var aktivni = S.zak.filter(function (z) { return z.stav !== "zruseny" && z.stav !== "vlastna"; });
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
        dlazdica("Zákazníci", aktivni.length, "bez zrušených a vlastnej kancelárie") +
        dlazdica("Na skúšku", skusobna.length, skusobna.filter(function (z) { return z.skusobna_do && rozdielDni(z.skusobna_do) <= 7; }).length + " končí do 7 dní") +
        dlazdica("Platiaci", platiaci.length, eur(mesacne) + " mesačne") +
        dlazdica("Treba riešiť", pozor.length, "po splatnosti, koniec skúšky", pozor.length ? "pozor" : "") +
        dlazdica("Uhradené tento mesiac", eur(mesiac), "spolu od začiatku " + eur(spolu)) +
      "</div>" +
      '<div class="sp-filtre">' +
        '<input type="search" id="f-q" placeholder="Hľadať názov, IČO, kontakt, okres…" value="' + esc(S.filter.q) + '">' +
        '<select id="f-stav"><option value="pozornost_vsetci">Všetci okrem zrušených</option><option value="pozor">Treba riešiť</option>' +
          '<option value="nekontaktovani">Na skúšku – nekontaktovaní</option>' +
          STAVY.map(function (s) { return '<option value="' + s[0] + '">' + s[1] + "</option>"; }).join("") + '<option value="">Úplne všetci</option></select>' +
      "</div>" +
      '<div class="sp-prepinace" id="sp-prepinace"></div>' +
      '<div id="sp-zoznam"></div>';
    $("#f-stav").value = S.filter.stav;
    $("#f-q").addEventListener("input", function (e) { S.filter.q = e.target.value; zoznam(); });
    $("#f-stav").addEventListener("change", function (e) { S.filter.stav = e.target.value; zoznam(); });
    $("#sp-prepinace").addEventListener("click", function (e) {
      var b = e.target.closest("button[data-f]");
      if (!b) return;
      S.filter[b.dataset.f] = b.dataset.v;
      try { localStorage.setItem("sprava-filter", JSON.stringify({ typ: S.filter.typ, produkt: S.filter.produkt })); } catch (er) { /* bez pamäte */ }
      zoznam();
    });
    zoznam();
  }
  function maProdukt(z, p) {
    var m = z.moduly || [], sk = m.indexOf("skener") >= 0, web = m.indexOf("web") >= 0;
    return p === "skener" ? sk : p === "web" ? web : p === "oboje" ? sk && web : true;
  }
  // zákazník prejde filtrom; „okrem“ = prepínač, pre ktorý práve rátame počty
  function prejdeFiltrom(z, okrem) {
    var f = S.filter, q = f.q.trim().toLowerCase();
    if (okrem !== "typ" && f.typ && z.typ !== f.typ) return false;
    if (okrem !== "produkt" && !maProdukt(z, f.produkt)) return false;
    if (f.stav === "pozornost_vsetci" && z.stav === "zruseny") return false;
    if (f.stav === "pozor" && !stav(z).pozor) return false;
    if (f.stav === "nekontaktovani" && (z.stav !== "skusobna" || z.kontaktovany)) return false;
    if (f.stav && f.stav !== "pozor" && f.stav !== "pozornost_vsetci" && f.stav !== "nekontaktovani" && z.stav !== f.stav) return false;
    if (q && [z.nazov, z.ico, z.kontakt_meno, z.email, z.telefon, (z.okresy || []).join(" ")].join(" ").toLowerCase().indexOf(q) < 0) return false;
    return true;
  }
  function prepinac(kluc, nazov, moznosti) {
    return '<div class="sp-filt" role="group" aria-label="' + esc(nazov) + '"><span class="sp-filt-n">' + esc(nazov) + "</span>" +
      moznosti.map(function (o) {
        var pocet = S.zak.filter(function (z) { return prejdeFiltrom(z, kluc) && (kluc === "typ" ? !o[0] || z.typ === o[0] : maProdukt(z, o[0])); }).length;
        var akt = S.filter[kluc] === o[0];
        return '<button type="button" data-f="' + kluc + '" data-v="' + o[0] + '" aria-pressed="' + akt + '"' + (akt ? ' class="akt"' : "") + ">" +
          esc(o[1]) + " <small>" + pocet + "</small></button>";
      }).join("") + "</div>";
  }
  function dlazdica(n, v, pod, trieda) {
    return '<div class="sp-dl ' + (trieda || "") + '"><span>' + esc(n) + "</span><b>" + esc(v) + "</b><small>" + esc(pod) + "</small></div>";
  }
  function zoznam() {
    if ($("#sp-prepinace")) $("#sp-prepinace").innerHTML = S.zak.length ? prepinac("typ", "Zobraziť", F_TYP) + prepinac("produkt", "Produkt", F_PRODUKT) : "";
    var rows = S.zak.filter(function (z) { return prejdeFiltrom(z); }).sort(function (a, b) { return stav(a).poradie - stav(b).poradie || a.nazov.localeCompare(b.nazov, "sk"); });

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
          '<span data-n="Stav"><i class="sp-stav ' + st.c + '">' + esc(st.t) + "</i>" +
            (z.kontaktovany ? '<small class="sp-zn">✓ kontaktovaný ' + dat(z.kontaktovany) + "</small>" :
              z.registrovany && z.stav === "skusobna" ? '<small class="sp-zn sp-zn-nie">zaregistrovaný ' + dat(z.registrovany) + " · nekontaktovaný</small>" : "") + "</span>" +
          '<span data-n="Skúšobná do">' + dat(z.skusobna_do) + "</span>" +
          '<span data-n="Zaplatené do">' + dat(z.zaplatene_do) + "</span>" +
          '<span data-n="Mesačne" class="r">' + eur(z.mesacna_cena) + (z.mesacna_cena != null && z.cena_zamrazena_do && rozdielDni(z.cena_zamrazena_do) >= 0 ? ' <i class="sp-zamraz" title="Cena zamrazená do ' + dat(z.cena_zamrazena_do) + '">❄</i>' : "") + "</span>" +
          '<span data-n="Uhradené" class="r">' + eur(uhradene(z.id)) + "</span></a>";
      }).join("") + "</div>";
  }

  // ---------------------------------------------------------------- detail / nový zákazník
  // všetkých 79 okresov SR podľa krajov (názvy presne ako v tabuľke lokality aj v objednávke na webe)
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
  function pole(id, n, val, typ, extra) {
    return '<label class="field"><span>' + n + '</span><input type="' + (typ || "text") + '" id="' + id + '" value="' + esc(val == null ? "" : val) + '"' + (extra || "") + "></label>";
  }
  function detail(z) {
    var novy = !z;
    if (novy) {
      var d = dnes();
      z = { typ: "kancelaria", nazov: "", stav: "skusobna", moduly: ["skener"], okresy: [], pocet_maklerov: 1, skusobna_od: d, skusobna_do: plusDni(d, 14),
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
          '<div class="sp-okresy"><span class="sp-okresy-l">Okresy pre skener</span><div id="z-okresy" class="sp-okr-zoz"></div>' +
            '<button type="button" class="btn ghost sp-okr-plus" id="z-okr-plus"><b aria-hidden="true">+</b> Pridať ďalší okres</button>' +
            '<p class="sp-pozn">' + (z.stav === "vlastna" ? "Okresy určujú, ktoré inzeráty kancelária vidí v skeneri." : "Prvý je hlavný okres, každý ďalší je +2 € mesačne.") + "</p></div>" +
          '<div class="form-grid">' +
            pole("z-pocet", "Počet maklérov", z.pocet_maklerov, "number", ' min="0" step="1"') +
            '<label class="field" id="z-weby-pole"><span>Počet osobných webov maklérov</span><input type="number" id="z-weby" min="1" step="1" value="' + esc(z.pocet_webov || 1) + '"></label>' +
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
          (novy || (z.stav === "vlastna" && z.typ === "kancelaria") ? "" : '<button type="button" class="btn danger sp-zmaz" id="z-zmaz">Zmazať zákazníka</button>') + "</div>" +
      "</form>" +
      (novy ? "" : kontaktHtml(z) + pristupHtml(z) + platbyHtml(z, platby));

    okresyNaplnit(z.okresy || []);
    zobrazPoleWebov();
    document.querySelectorAll('[name="typ"], [name="mod"]').forEach(function (x) { x.addEventListener("change", zobrazPoleWebov); });
    $("#z-obdobie").value = z.platba_obdobie || "mesacne";
    $("#z-stav").value = z.stav;
    var form = $("#sp-form");

    $("#z-cennik").addEventListener("click", function () {
      var moduly = Array.from(form.querySelectorAll('[name="mod"]:checked')).map(function (x) { return x.value; });
      var okr = okresyZPola();
      var weby = pocetWebovZPola();
      var c = cenaPodlaCennika(moduly, okr.length, weby);
      $("#z-cena").value = c.cena || "";
      var sWebom = moduly.indexOf("web") >= 0;
      $("#z-cennik-info").textContent = (moduly.indexOf("skener") >= 0 ? "Skener: " + Math.max(1, okr.length) + " okr. = " + eur(cenaSkenera(okr.length, sWebom)) + (sWebom ? " (s webom za polovicu)" : "") + ". " : "") +
        (sWebom ? (weby > 1 ? "Osobné weby: " + weby + " × " + eur(cenaZaWeb(weby)) + " = " + eur(cenaWebov(weby)) + ". " : "Osobný web 57 €. ") : "") + (c.nezname.length ? "Bez ceny v cenníku: " + c.nezname.join(", ") + " – dopíš ručne." : "") +
        ($("#z-obdobie").value === "rocne" && c.cena ? " Ročne: " + eur(c.cena * 11) + "." : "");
    });
    form.querySelector("[data-predlz]").addEventListener("click", function () {
      var v = $("#z-sk-do").value; var zaklad = v && v > dnes() ? v : dnes();
      $("#z-sk-do").value = plusDni(zaklad, 14);
    });
    form.addEventListener("submit", function (e) { e.preventDefault(); ulozZakaznika(novy ? null : z); });
    if (!novy) {
      if ($("#z-zmaz")) $("#z-zmaz").addEventListener("click", function () { zmazZakaznika(z); });
      document.querySelectorAll("[data-akcia]").forEach(function (b) { b.addEventListener("click", function () { rychlaAkcia(z, b.dataset.akcia); }); });
      platbyUdalosti(z);
      kontaktUdalosti(z);
    } else {
      $("#z-nazov").focus();
    }
    window.scrollTo(0, 0);
  }
  // okresy: jedna roleta na okres, „+ Pridať ďalší okres“ pridá ďalšiu; ten istý okres sa nedá vybrať dvakrát
  function okresMoznosti(navyse) {
    return '<option value="">Vyber okres</option>' + (navyse ? '<option value="' + esc(navyse) + '">' + esc(navyse) + " (mimo zoznamu)</option>" : "") +
      KRAJE.map(function (k) { return '<optgroup label="' + esc(k[0]) + '">' + k[1].map(function (o) { return '<option value="' + esc(o) + '">' + esc(o) + "</option>"; }).join("") + "</optgroup>"; }).join("");
  }
  function okresVZozname(o) { return KRAJE.some(function (k) { return k[1].indexOf(o) >= 0; }); }
  function okresRiadok(hodnota) {
    var zoz = $("#z-okresy"), w = document.createElement("div"), n = zoz.children.length + 1;
    w.className = "sp-okr-r";
    w.innerHTML = '<div class="field"><select aria-label="Okres ' + n + '">' +
      okresMoznosti(hodnota && !okresVZozname(hodnota) ? hodnota : "") + "</select></div>" +
      '<button type="button" class="btn ghost sp-okr-x" aria-label="Odobrať okres" title="Odobrať okres">×</button>';
    zoz.appendChild(w);
    var sel = w.querySelector("select");
    sel.value = hodnota || "";
    sel.addEventListener("change", okresyObnov);
    w.querySelector(".sp-okr-x").addEventListener("click", function () {
      zoz.removeChild(w);
      if (!zoz.children.length) okresRiadok("");
      okresyObnov();
    });
    return sel;
  }
  function okresyObnov() {
    var ss = Array.from(document.querySelectorAll("#z-okresy select")), vyb = ss.map(function (x) { return x.value; });
    ss.forEach(function (x, i) {
      Array.from(x.options).forEach(function (o) { if (o.value) o.disabled = o.value !== x.value && vyb.indexOf(o.value) >= 0; });
      x.closest(".sp-okr-r").classList.toggle("hlavny", i === 0);
      x.setAttribute("aria-label", i === 0 ? "Hlavný okres" : "Okres " + (i + 1));
    });
    var plus = $("#z-okr-plus"); if (plus) plus.disabled = ss.length >= 79;
  }
  function okresyNaplnit(okresy) {
    $("#z-okresy").innerHTML = "";
    var zoz = (okresy || []).filter(function (o, i, a) { return o && a.indexOf(o) === i; });
    if (!zoz.length) zoz = [""];
    zoz.forEach(function (o) { okresRiadok(o); });
    okresyObnov();
    $("#z-okr-plus").addEventListener("click", function () { var s = okresRiadok(""); okresyObnov(); s.focus(); });
  }
  // počet webov má zmysel len pri kancelárii s objednaným osobným webom (samostatný maklér má vždy 1)
  function pocetWebovZPola() {
    var kanc = (document.querySelector('[name="typ"]:checked') || {}).value === "kancelaria";
    return kanc ? Math.max(1, parseInt($("#z-weby").value, 10) || 1) : 1;
  }
  function zobrazPoleWebov() {
    var kanc = (document.querySelector('[name="typ"]:checked') || {}).value === "kancelaria";
    var web = !!document.querySelector('[name="mod"][value="web"]:checked');
    $("#z-weby-pole").hidden = !(kanc && web);
  }
  function okresyZPola() {
    return Array.from(document.querySelectorAll("#z-okresy select")).map(function (x) { return x.value; })
      .filter(function (o, i, a) { return o && a.indexOf(o) === i; });
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
      pocet_webov: pocetWebovZPola(),
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
    if (z.stav === "zaujemca") b.push(["skuska", "Spustiť skúšobnú dobu (14 dní)"]);
    if (z.stav === "skusobna") b.push(["predlz14", "Predĺžiť skúšku o 14 dní"], ["aktivny", "Prešiel na platenú verziu"]);
    if (z.stav === "aktivny") b.push(["pozastavit", "Pozastaviť"]);
    if (z.stav === "pozastaveny") b.push(["aktivny", "Obnoviť"]);
    if (z.stav === "zruseny") b.push(["obnovit_zaujemca", "Vrátiť medzi záujemcov"]);
    else if (z.stav !== "vlastna" || z.typ === "makler") b.push(["zrusit", "Zrušiť spoluprácu"]);
    return '<div class="sp-akcie">' + b.map(function (x) { return '<button type="button" class="btn' + (x[0] === "zrusit" ? " ghost danger" : "") + '" data-akcia="' + x[0] + '">' + x[1] + "</button>"; }).join("") +
      (z.telefon ? '<a class="btn ghost" href="tel:' + esc(z.telefon.replace(/\s/g, "")) + '">📞 ' + esc(z.telefon) + "</a>" : "") +
      (z.email ? '<a class="btn ghost" href="mailto:' + esc(z.email) + '">✉ ' + esc(z.email) + "</a>" : "") + "</div>";
  }
  async function rychlaAkcia(z, a) {
    var zmena = {};
    if (a === "skuska") { zmena = { stav: "skusobna", skusobna_od: dnes(), skusobna_do: plusDni(dnes(), 14) }; }
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
  // prístup: zákazník sa registruje sám cez odkaz z e-mailu (101_samoregistracia.sql)
  function pristupHtml(z) {
    var h = '<section class="sp-box sp-pristup"><h3>Prístup do aplikácie</h3>';
    if (z.stav === "vlastna") return h + "<p>Vlastná kancelária Týpka – prístup bez obmedzenia.</p></section>";
    if (z.registrovany) return h + "<p>✓ Zaregistrovaný " + dat(z.registrovany) + ". Prihlasuje sa e-mailom " + esc(z.email || "") + ".</p></section>";
    var st = z.registracia_poslat ? "E-mail s odkazom na registráciu čaká na odoslanie (odíde do pár minút)." :
      z.registracia_email ? "E-mail s odkazom na registráciu odišiel " + dat(z.registracia_email) + (z.registracia_do ? ", odkaz platí do " + dat(z.registracia_do) : "") + "." :
      "E-mail s odkazom na registráciu zatiaľ neodišiel.";
    return h + "<p>" + st + " Cez odkaz si zákazník sám nastaví heslo, telefón a najviac 3 okresy a hneď mu začne 14-dňová skúšobná doba.</p>" +
      (z.email && z.stav !== "zruseny" ? '<div class="sp-akcie" style="margin:0"><button type="button" class="btn" id="z-reg">' +
        (z.registracia_email || z.registracia_poslat ? "Poslať odkaz znova" : "Poslať odkaz na registráciu") + "</button></div>" :
        "<p>" + (z.stav === "zruseny" ? "Zákazník je zrušený." : "Na poslanie odkazu treba vyplniť e-mail.") + "</p>") + "</section>";
  }
  // kontakt kvôli predĺženiu / platenej verzii
  function kontaktHtml(z) {
    if (z.stav === "vlastna") return "";
    return '<section class="sp-box sp-kontakt"><h3>Kontakt kvôli predĺženiu</h3>' +
      (z.kontaktovany ? '<p class="sp-kont-ok">✓ Kontaktovaný ' + dat(z.kontaktovany) + "</p>" : '<p class="sp-kont-nie">Zatiaľ nekontaktovaný.</p>') +
      '<label class="field"><span>Poznámka ku kontaktu</span><textarea id="z-kont-pozn" rows="2" maxlength="1000" placeholder="napr. volal som, rozmýšľa do piatku">' + esc(z.kontakt_poznamka || "") + "</textarea></label>" +
      '<div class="sp-akcie" style="margin:0"><button type="button" class="btn primary" id="z-kont">' + (z.kontaktovany ? "Uložiť a označiť dnešným dátumom" : "Označiť ako kontaktovaný") + "</button>" +
      (z.kontaktovany ? '<button type="button" class="btn ghost" id="z-kont-zrus">Zrušiť označenie</button>' : "") + "</div></section>";
  }
  function kontaktUdalosti(z) {
    async function uloz(zmena, sprava) {
      var r = await sb.from("zakaznici").update(zmena).eq("id", z.id).select().single();
      if (r.error) return toast(chybaText(r.error), true);
      await nacitaj(); toast(sprava); detail(S.zak.find(function (x) { return x.id === z.id; }));
    }
    var k = $("#z-kont");
    if (k) k.addEventListener("click", function () {
      uloz({ kontaktovany: new Date().toISOString(), kontakt_poznamka: $("#z-kont-pozn").value.trim() || null }, "Označené ako kontaktovaný.");
    });
    var kz = $("#z-kont-zrus");
    if (kz) kz.addEventListener("click", function () { uloz({ kontaktovany: null }, "Označenie je zrušené."); });
    var rg = $("#z-reg");
    if (rg) rg.addEventListener("click", async function () {
      if ((z.registracia_email || z.registracia_poslat) && !confirm("Poslať nový odkaz na " + z.email + "? Starý odkaz prestane platiť.")) return;
      rg.disabled = true;
      var r = await sb.rpc("poslat_registraciu", { p_zakaznik: z.id });
      rg.disabled = false;
      if (r.error) return toast(chybaText(r.error), true);
      await nacitaj(); toast("Odkaz na registráciu odíde na " + z.email + " do pár minút.");
      detail(S.zak.find(function (x) { return x.id === z.id; }));
    });
  }

  // ---------------------------------------------------------------- články na portáli (Týpkove nehnuteľnosti)
  var PORTAL = "https://realitnytypek.sk/nehnutelnosti/";
  var KNIZNICA = ["byt-obyvacka", "byt-kuchyna", "byt-spalna", "byt-centrum", "byt-tehla", "byt-dom", "dom-rodinny", "dom-novostavba", "dom-zahrada", "dom-obyvacka",
    "luxus-obyvacka", "chata", "chata-krb", "chatka", "pozemok", "mesto-namestie", "mesto-letecky"];
  S.clanky = null;
  function zalozky(akt) {
    return '<nav class="sp-zalozky" aria-label="Časti správy">' +
      '<a href="#"' + (akt === "zak" ? ' aria-current="page"' : "") + ">Zákazníci</a>" +
      '<a href="#clanky"' + (akt === "cl" ? ' aria-current="page"' : "") + ">Články na portáli</a>" +
      '<a href="#kontakty"' + (akt === "ko" ? ' aria-current="page"' : "") + ">Kontakty na predaj</a></nav>";
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

  // ---------------------------------------------------------------- kontakty na predaj (migrácia 117)
  // žiadosti o odhad z vybraných okresov idú „na predaj“ kanceláriám: nastavenie, čo je na predaji, reklamácie, kredit kancelárií
  function cas(s) { if (!s) return "–"; var d = new Date(s); return d.getDate() + ". " + (d.getMonth() + 1) + ". " + String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0"); }
  function odpocet(kedy) {
    var ms = new Date(kedy) - Date.now(); if (ms <= 60000) return "o chvíľu";
    var h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000);
    return "o " + (h ? h + " h" + (m ? " " : "") : "") + (m ? m + " min" : "");
  }
  async function kontaktyPrehlad() {
    if (!$(".sp-kontakty")) $("#sp").innerHTML = zalozky("ko") + '<div class="boot">Načítavam kontakty…</div>';
    var r = await sb.rpc("kontakty_sprava");
    if (r.error) { $("#sp").innerHTML = zalozky("ko") + '<p class="sp-nic">Kontakty sa nepodarilo načítať: ' + esc(chybaText(r.error)) + "</p>"; return; }
    var D = r.data, N = D.nastavenie, vybrane = {};
    var cenyOkr = JSON.parse(JSON.stringify(N.ceny_okresy || {}));   // vlastné ceny okresov (118)
    (N.okresy || []).forEach(function (o) { vybrane[o] = true; });
    var naPredaj = D.trh.filter(function (t) { return !t.predane; }), predane = D.trh.filter(function (t) { return t.predane; });
    var cakaRekl = D.reklamacie.filter(function (x) { return x.stav === "caka"; });
    var trzba = D.kancelarie.reduce(function (s, k) { return s + Number(k.zaplatene || 0); }, 0);
    var kredity = D.kancelarie.reduce(function (s, k) { return s + Number(k.kredit || 0); }, 0);
    var kupene = predane.filter(function (t) { return t.ako === "nakup"; });

    var h = zalozky("ko") +
      '<div class="sp-uvod"><div><h1>Kontakty na predaj</h1><p>Žiadosti o odhad z vybraných okresov nedostane maklér hneď – kancelárie s týmto okresom vidia náhľad bez osobných údajov ' +
        "a kontakt dostane tá, ktorá ho prevezme prvá. Cena klesá, prvé kontakty sú zadarmo, potom sa platí z kreditu, ktorý pripíšeš po platbe. " +
        "Ak ho nikto neprevezme, dostane ho záložný maklér.</p></div></div>" +
      '<div class="sp-dlazdice sp-kontakty">' +
        dlazdica("Na predaj teraz", naPredaj.length, (N.okresy || []).length ? (N.okresy || []).length + " " + ((N.okresy || []).length === 1 ? "okres" : (N.okresy || []).length < 5 ? "okresy" : "okresov") + " zapnuté" : "predaj je vypnutý", (N.okresy || []).length ? "" : "pozor") +
        dlazdica("Prevzaté (60 dní)", kupene.length, predane.length - kupene.length + " dostal záložný maklér") +
        dlazdica("Reklamácie", cakaRekl.length, "čakajú na vybavenie", cakaRekl.length ? "pozor" : "") +
        dlazdica("Zaplatené za kontakty", eur(trzba), "spolu, po vrátených reklamáciách") +
        dlazdica("Kredit kancelárií", eur(kredity), "nevyčerpaný") +
      "</div>";

    // reklamácie
    if (D.reklamacie.length) h += '<section class="sp-box"><h3>Reklamácie</h3><div class="sp-ko-zoz">' + D.reklamacie.map(function (x) {
      return '<div class="sp-ko-r"><span class="sp-meno"><b>' + esc(x.nazov || "Kontakt") + "</b><small>" + esc(x.kancelaria || "") + (x.kto ? " · " + esc(x.kto) : "") +
          " · prevzaté " + cas(x.predane) + " za " + (x.zadarmo ? "0 € (zadarmo)" : eur(x.cena)) + "</small>" +
          "<small><b>" + esc(x.dovod) + "</b>" + (x.text ? " – " + esc(x.text) : "") + "</small>" +
          '<small class="sp-ko-kl">Klient: ' + esc([x.meno, x.telefon, x.email].filter(Boolean).join(", ")) + "</small></span>" +
        (x.stav === "caka" ? '<span class="sp-ko-akc"><button type="button" class="btn primary" data-rekl-uznat="' + x.id + '">Uznať</button>' +
          '<button type="button" class="btn ghost" data-rekl-zamietnut="' + x.id + '">Zamietnuť</button></span>'
          : '<i class="sp-stav ' + (x.stav === "uznana" ? "dobry" : "sivy") + '">' + (x.stav === "uznana" ? "Uznaná" : "Zamietnutá") + (x.odpoved ? " – " + esc(x.odpoved) : "") + "</i>") + "</div>";
    }).join("") + "</div></section>";

    // na predaj teraz
    h += '<section class="sp-box"><h3>Na predaj teraz</h3>' + (naPredaj.length ? '<div class="sp-ko-zoz">' + naPredaj.map(function (t) {
      return '<div class="sp-ko-r"><span class="sp-meno"><b>' + esc(t.nazov || "") + "</b><small>" + esc(t.dovod || "") + " · prišla " + cas(t.vytvorene) +
          (new Date(t.od) > Date.now() ? " · cena beží od " + cas(t.od) : "") + " · " + t.kupci + " " + (t.kupci === 1 ? "kancelária ju vidí" : t.kupci < 5 ? "kancelárie ju vidia" : "kancelárií ju vidí") + "</small>" +
          "<small>Teraz <b>" + eur(t.cena) + "</b>" + (t.dalsia ? " · " + odpocet(t.dalsia.kedy) + " " + eur(t.dalsia.c) : "") + " · záložnému maklérovi " + cas(t.koniec) + "</small></span>" +
        '<span class="sp-ko-akc"><button type="button" class="btn ghost" data-zaloha="' + t.id + '">Dať záložnému maklérovi</button></span></div>';
    }).join("") + "</div>" : '<p class="sp-pozn">Teraz nie je na predaj nič.</p>') + "</section>";

    // kancelárie a kredit
    h += '<section class="sp-box"><h3>Kancelárie a kredit</h3><div class="sp-ko-zoz">' + D.kancelarie.map(function (k) {
      return '<div class="sp-ko-r"><span class="sp-meno"><b>' + esc(k.nazov) + (k.aktivna ? "" : " (neaktívna)") + "</b><small>" + esc((k.okresy || []).join(", ") || "bez okresov") + "</small>" +
          "<small>Prevzaté " + k.kupene + " · zaplatené " + eur(k.zaplatene) + " · dobité " + eur(k.dobite) + (Number(N.zadarmo) ? " · zadarmo ešte " + k.zadarmo : "") + "</small></span>" +
        '<span class="sp-ko-akc"><b class="sp-ko-kredit">' + eur(k.kredit) + '</b><button type="button" class="btn" data-dobit="' + k.id + '" data-nazov="' + esc(k.nazov) + '">Pripísať kredit</button></span></div>';
    }).join("") + "</div></section>";

    // nastavenie
    var okresy = D.vsetky_okresy || [];
    h += '<form class="sp-box sp-ko-nast" id="ko-nast" novalidate><h3>Nastavenie</h3>' +
      '<div class="sp-okresy"><span class="sp-okresy-l">Okresy, v ktorých sa žiadosti o odhad predávajú (ostatné idú maklérovi z obce ako doteraz)</span>' +
        '<input type="search" id="ko-hladaj" placeholder="Hľadať okres…">' +
        '<div class="sp-ko-okresy" id="ko-okresy">' + okresy.map(function (o) {
          var n = (D.pokrytie || {})[o] || 0;
          return '<label data-okres="' + esc(o.toLowerCase()) + '"><input type="checkbox" value="' + esc(o) + '"' + (vybrane[o] ? " checked" : "") + "><span>" + esc(o) +
            (n ? " <small>" + n + " " + (n === 1 ? "kancelária" : n < 5 ? "kancelárie" : "kancelárií") + "</small>" : "") +
            (cenyOkr[o] && cenyOkr[o].length ? ' <small class="sp-ko-vl">' + esc(cenyOkr[o][0].c) + " €</small>" : "") + "</span></label>";
        }).join("") + "</div>" +
        '<p class="sp-pozn">Okres funguje len tam, kde ho má v nastavení aspoň jedna aktívna kancelária s odhadmi – inak žiadosť ide po starom maklérovi.</p></div>' +
      '<div class="sp-okresy"><span class="sp-okresy-l">Spoločná cena kontaktu s DPH – po koľkých hodinách koľko €</span><div class="sp-ko-ceny-blok"><div class="sp-ko-ceny" id="ko-ceny">' +
        (N.ceny || []).map(cenaRiadok).join("") + '</div><button type="button" class="btn ghost sp-okr-plus" data-cena-plus><b>+</b> Ďalšie zlacnenie</button></div>' +
        '<p class="sp-pozn">Platí vo všetkých okresoch, ktoré nemajú vlastné ceny. Prvá cena platí od 0 hodín. Keď žiadosť príde v noci (21:00 – 7:00), hodiny sa rátajú od 7:00.</p></div>' +
      '<div class="sp-okresy"><span class="sp-okresy-l">Ceny podľa okresu</span><div id="ko-okr-ceny"></div>' +
        '<div class="sp-akcie" style="margin:0"><button type="button" class="btn ghost" id="ko-median">Navrhnúť ceny podľa mediánu</button>' +
        '<span class="sp-pozn">Začiatočná cena = medián bytov €/m² ÷ 35 (40 – 150 €), zlacnenia v pomere spoločných cien. Prepíše vlastné ceny všetkých okresov.</span></div></div>' +
      '<div class="sp-ko-cisla">' +
        '<label class="field"><span>Záložnému maklérovi po (hodinách)</span><input id="ko-koniec" type="number" min="1" max="336" value="' + esc(N.koniec_h) + '"></label>' +
        '<label class="field"><span>Kontaktov zadarmo pre kanceláriu</span><input id="ko-zadarmo" type="number" min="0" max="20" value="' + esc(N.zadarmo) + '"></label>' +
        '<label class="field"><span>Reklamácia do (hodín)</span><input id="ko-rekl" type="number" min="1" max="336" value="' + esc(N.reklamacia_h) + '"></label>' +
        '<label class="field"><span>Záložný maklér</span><select id="ko-zaloha"><option value="">Hlavný správca</option>' +
          (D.zalohy || []).map(function (m) { return '<option value="' + m.id + '"' + (m.id === N.zaloha_makler ? " selected" : "") + ">" + esc(m.meno) + "</option>"; }).join("") + "</select></label>" +
      "</div>" +
      '<div class="sp-akcie" style="margin:0"><button type="submit" class="btn primary">Uložiť nastavenie</button>' +
        (N.upravene ? '<span class="sp-pozn">Naposledy zmenené ' + cas(N.upravene) + "</span>" : "") + "</div>" +
      '<p class="sp-pozn">Zmena cien platí pre nové žiadosti – tie, ktoré už sú na predaji, dobehnú s pôvodnými cenami.</p></form>';

    // predané a pohyby
    if (predane.length) h += '<section class="sp-box"><h3>Prevzaté za 60 dní</h3><div class="sp-ko-zoz">' + predane.map(function (t) {
      return '<div class="sp-ko-r"><span class="sp-meno"><b>' + esc(t.nazov || "") + "</b><small>" + (t.ako === "zaloha" ? "Záložný maklér" : esc(t.kancelaria || "")) +
          (t.kto ? " · " + esc(t.kto) : "") + " · " + cas(t.predane) + (t.reklamacia ? " · reklamácia: " + (t.reklamacia === "caka" ? "čaká" : t.reklamacia === "uznana" ? "uznaná" : "zamietnutá") : "") + "</small></span>" +
        '<span class="sp-ko-akc"><b>' + (t.ako === "zaloha" ? "–" : t.zadarmo ? "zadarmo" : eur(t.predane_cena)) + "</b></span></div>";
    }).join("") + "</div></section>";
    if (D.pohyby.length) h += '<section class="sp-box"><h3>Pohyby kreditu</h3><div class="sp-pl-zoznam">' + D.pohyby.map(function (p) {
      var n = { dobitie: "Dobitie", nakup: "Prevzatý kontakt", vratenie: "Vrátené", oprava: "Oprava" }[p.druh] || p.druh;
      return '<div class="sp-pl"><span class="sp-pl-d">' + cas(p.vytvorene) + "</span><b>" + (p.zadarmo && !Number(p.suma) ? (p.druh === "vratenie" ? "+1 zadarmo" : "zadarmo") : (Number(p.suma) > 0 ? "+" : "") + eur(p.suma)) + "</b>" +
        "<span>" + esc(p.kancelaria || "") + " · " + n + (p.poznamka ? " · " + esc(p.poznamka) : "") + "</span><span>" + esc(p.kto || "") + "</span></div>";
    }).join("") + "</div></section>";

    $("#sp").innerHTML = h;
    var znova = function () { kontaktyPrehlad(); };
    $("#ko-hladaj").addEventListener("input", function () {
      var q = this.value.trim().toLowerCase();
      $("#ko-okresy").querySelectorAll("label").forEach(function (l) { l.hidden = q && l.dataset.okres.indexOf(q) < 0 && !l.querySelector("input").checked; });
    });
    // ceny: pridať / odobrať riadok (spoločné aj okresy)
    var precitajCeny = function (box) {
      return Array.from(box.querySelectorAll(".sp-ko-cena")).map(function (r) { return { h: r.querySelector("[name=h]").value.trim(), c: r.querySelector("[name=c]").value.trim() }; });
    };
    var spolocne = function () { return precitajCeny($("#ko-ceny")); };
    var cenyText = function (c) {
      return (c || []).map(function (x) { return x.c + " €" + (Number(x.h) ? " po " + x.h + " h" : ""); }).join(" → ");
    };
    // vlastné ceny z otvorených editorov okresov do cenyOkr (pred prekreslením aj pred uložením)
    var zberOkr = function () {
      $("#ko-okr-ceny").querySelectorAll("[data-okr]").forEach(function (b) {
        var box = b.querySelector(".sp-ko-ceny"); if (box) cenyOkr[b.dataset.okr] = precitajCeny(box);
      });
    };
    var vykresliOkrCeny = function () {
      var vyb = Array.from($("#ko-okresy").querySelectorAll("input:checked")).map(function (i) { return i.value; });
      $("#ko-okr-ceny").innerHTML = vyb.length ? vyb.map(function (o) {
        var vl = cenyOkr[o] && cenyOkr[o].length;
        return '<div class="sp-ko-okr" data-okr="' + esc(o) + '"><div class="sp-ko-okr-h"><b>' + esc(o) + "</b>" +
          (vl ? '<button type="button" class="btn ghost" data-okr-spolocne>Späť na spoločné ceny</button>'
              : '<span class="sp-pozn">spoločné ceny: ' + esc(cenyText(spolocne())) + '</span><button type="button" class="btn ghost" data-okr-vlastne>Nastaviť vlastné ceny</button>') + "</div>" +
          (vl ? '<div class="sp-ko-ceny-blok"><div class="sp-ko-ceny">' + cenyOkr[o].map(cenaRiadok).join("") + '</div><button type="button" class="btn ghost sp-okr-plus" data-cena-plus><b>+</b> Ďalšie zlacnenie</button></div>' : "") +
          "</div>";
      }).join("") : '<p class="sp-pozn">Najprv vyber okresy hore – pri každom potom môžeš nastaviť vlastné ceny.</p>';
    };
    vykresliOkrCeny();
    $("#ko-okresy").addEventListener("change", function () { zberOkr(); vykresliOkrCeny(); });
    var obnovSpolocne = function () {
      $("#ko-okr-ceny").querySelectorAll("[data-okr] .sp-pozn").forEach(function (p) { p.textContent = "spoločné ceny: " + cenyText(spolocne()); });
    };
    $("#ko-ceny").addEventListener("input", obnovSpolocne);
    $("#ko-nast").addEventListener("click", function (e) {
      var plus = e.target.closest("[data-cena-plus]"), x = e.target.closest("[data-cena-x]");
      var vl = e.target.closest("[data-okr-vlastne]"), sp = e.target.closest("[data-okr-spolocne]");
      if (plus) {
        var box = plus.closest(".sp-ko-ceny-blok").querySelector(".sp-ko-ceny"), rows = box.querySelectorAll(".sp-ko-cena"), last = rows[rows.length - 1];
        var h0 = last ? Number(last.querySelector("[name=h]").value) + 12 : 0, c0 = last ? Math.max(1, Math.round(Number(last.querySelector("[name=c]").value) / 2)) : 50;
        box.insertAdjacentHTML("beforeend", cenaRiadok({ h: h0, c: c0 }));
        obnovSpolocne();
      } else if (x) {
        var zoz = x.closest(".sp-ko-ceny");
        if (zoz.children.length > 1) x.closest(".sp-ko-cena").remove();
        obnovSpolocne();
      } else if (vl) {
        zberOkr(); cenyOkr[vl.closest("[data-okr]").dataset.okr] = spolocne(); vykresliOkrCeny();
      } else if (sp) {
        zberOkr(); delete cenyOkr[sp.closest("[data-okr]").dataset.okr]; vykresliOkrCeny();
      }
    });
    $("#ko-nast").addEventListener("submit", async function (e) {
      e.preventDefault();
      var p = {
        okresy: Array.from($("#ko-okresy").querySelectorAll("input:checked")).map(function (i) { return i.value; }),
        ceny: spolocne(),
        ceny_okresy: (zberOkr(), cenyOkr),
        koniec_h: $("#ko-koniec").value, zadarmo: $("#ko-zadarmo").value, reklamacia_h: $("#ko-rekl").value, zaloha_makler: $("#ko-zaloha").value,
      };
      var btn = this.querySelector("[type=submit]"); btn.disabled = true;
      var x = await sb.rpc("kontakty_nastavit", { p: p });
      btn.disabled = false;
      if (x.error) return toast(chybaText(x.error), true);
      toast(p.okresy.length ? "Uložené – kontakty sa predávajú v " + p.okresy.length + " " + (p.okresy.length === 1 ? "okrese" : "okresoch") + "." : "Uložené – predaj kontaktov je vypnutý.");
      znova();
    });
    $("#ko-median").addEventListener("click", async function () {
      if (!confirm("Prepočítať vlastné ceny všetkých okresov podľa mediánu bytov? Neuložené zmeny v nastavení sa stratia.")) return;
      var x = await sb.rpc("kontakty_ceny_podla_medianu", { p_delitel: 35, p_prepisat: true });
      if (x.error) return toast(chybaText(x.error), true);
      toast("Ceny okresov sú prepočítané podľa mediánu."); znova();
    });
    $("#sp").querySelectorAll("[data-dobit]").forEach(function (b) {
      b.addEventListener("click", async function () {
        var suma = prompt("Koľko € pripísať kancelárii " + b.dataset.nazov + "? (s DPH; mínus = oprava)", "100");
        if (suma === null) return;
        suma = Number(String(suma).replace(",", ".").replace(/\s|€/g, ""));
        if (!suma) return toast("Zadaj sumu.", true);
        var pozn = prompt("Poznámka (napr. číslo faktúry alebo platby):", "") || "";
        var x = await sb.rpc("kontakty_dobit", { p_kancelaria: Number(b.dataset.dobit), p_suma: suma, p_poznamka: pozn });
        if (x.error) return toast(chybaText(x.error), true);
        toast("Kredit kancelárie je teraz " + eur(x.data) + "."); znova();
      });
    });
    $("#sp").querySelectorAll("[data-zaloha]").forEach(function (b) {
      b.addEventListener("click", async function () {
        if (!confirm("Dať kontakt hneď záložnému maklérovi? Z predaja zmizne a nikto zaň nezaplatí.")) return;
        var x = await sb.rpc("kontakt_odovzdat_zalohe", { p_id: Number(b.dataset.zaloha) });
        if (x.error) return toast(chybaText(x.error), true);
        toast("Kontakt dostal záložný maklér."); znova();
      });
    });
    $("#sp").querySelectorAll("[data-rekl-uznat],[data-rekl-zamietnut]").forEach(function (b) {
      b.addEventListener("click", async function () {
        var uznat = !!b.dataset.reklUznat, id = Number(b.dataset.reklUznat || b.dataset.reklZamietnut);
        var odp = prompt(uznat ? "Uznať reklamáciu – kancelárii sa vráti kredit (alebo kontakt zadarmo). Poznámka pre kanceláriu (nepovinné):" :
          "Prečo reklamáciu zamietaš? Kancelária uvidí tvoju odpoveď.", "");
        if (odp === null) return;
        var x = await sb.rpc("kontakt_reklamacia_vybav", { p_id: id, p_uznat: uznat, p_odpoved: odp });
        if (x.error) return toast(chybaText(x.error), true);
        toast(uznat ? "Reklamácia je uznaná – kredit sa vrátil." : "Reklamácia je zamietnutá."); znova();
      });
    });
  }
  function cenaRiadok(c) {
    return '<div class="sp-ko-cena"><label class="field"><span>Po hodinách</span><input name="h" type="number" min="0" max="336" step="1" value="' + esc(c.h) + '"></label>' +
      '<label class="field"><span>Cena (€)</span><input name="c" type="number" min="1" max="500" step="1" value="' + esc(c.c) + '"></label>' +
      '<button type="button" class="btn ghost sp-okr-x" data-cena-x aria-label="Odstrániť">×</button></div>';
  }

  start().catch(function (e) { hlaska("Niečo sa pokazilo", chybaText(e)); });
})();
