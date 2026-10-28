/* Skladačka karty nehnuteľnosti (stránka ponuky ponuka.html) – len administrátor.
   Poradie častí, hlavný stĺpec / bočný panel, zapnuté / vypnuté a pár možností.
   Náhľad je skutočná stránka ponuky v rámčeku; rozpracované nastavenie dostane bez uloženia. */
(function () {
  "use strict";
  var T = window.TYPEK, sb = T.sb, esc = T.esc;
  var NAZVY = {
    galeria: ["Fotky", "Galéria s náhľadmi, zväčšenie na celú obrazovku"],
    zaklad: ["Názov a cena", "Typ, lokalita, cena, štítky a hlavné údaje – vždy zapnuté"],
    media: ["Videá a 3D prehliadka", "YouTube, Matterport a ďalšie – len ak ich ponuka má"],
    popis: ["Popis", "Úvodná veta a celý text ponuky"],
    parametre: ["Parametre", "Plochy, poschodie, stav, energetická trieda…"],
    vybavenie: ["Vybavenie a siete", "Loggia, pivnica, výťah, internet…"],
    mapa: ["Mapa", "Orientačná poloha a odkaz do Google Máp"],
    hypoteka: ["Hypotekárna kalkulačka", "Pri predaji s cenou, s tlačidlom Chcem ponuku hypotéky"],
    makler: ["Kontakt na makléra", "Telefón, WhatsApp, SMS, e-mail a hodnotenie"],
    zaujem: ["Formulár záujmu", "Obhliadka, otázka, zavolajte mi; pri predanej Hľadáte podobnú?"]
  };
  var IK = {
    uchop: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg>',
    hore: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7"/></svg>',
    dole: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12l7 7 7-7"/></svg>',
    doBoku: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h14M13 6l6 6-6 6"/></svg>',
    doHlavneho: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12H6M11 6l-6 6 6 6"/></svg>',
    zamok: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>'
  };
  var ULOZENE = T.normKarta(null), K = T.normKarta(null), ZAR = "pc", PONUKA = null, tahane = null, WEB = null;
  // farebné sady a farby ako v editore webu (aby karta ladila s webom)
  var SADY = [
    { id: "alpha", n: "Alpha zlatá", a: "#DAB967", b: "#1E2A35", bg: "svetle" }, { id: "spis", n: "Spišská zlatá", a: "#DB9522", b: "#4A6074", bg: "kremove" },
    { id: "tatry", n: "Tatranská zelená", a: "#1F6B57", b: "#C98A2B", bg: "svetle" }, { id: "noc", n: "Nočný luxus", a: "#C9A45C", b: "#8C9BA8", bg: "tmave" },
    { id: "more", n: "More a koral", a: "#1D6F8F", b: "#D9664A", bg: "svetle" }, { id: "tehla", n: "Tehla a krém", a: "#A8482E", b: "#2F4152", bg: "kremove" },
    { id: "slivka", n: "Slivka a med", a: "#6E3A5E", b: "#D9A441", bg: "svetle" }, { id: "cierna", n: "Čierna klasika", a: "#15191C", b: "#DB9522", bg: "svetle" },
    { id: "salvia", n: "Šalvia a terakota", a: "#5F7A61", b: "#B4654A", bg: "kremove" }];
  var FARBY_WEBU = { alpha: "#DAB967", zlata: "#DB9522", atrament: "#1E2A35", smaragd: "#1F6B57", tehla: "#A8482E", more: "#1D6F8F", slivka: "#6E3A5E", oliva: "#6E7B2C", sivomodra: "#4A6074" };
  var POZADIA = [["svetle", "Svetlé"], ["kremove", "Krémové"], ["tmave", "Tmavé"]];
  function hex(x) { return /^#[0-9a-f]{6}$/i.test(String(x || "")); }
  function farbyWebu(w) {
    if (!w) return null;
    return { a: (w.color === "vlastna" && hex(w.cc) ? w.cc : FARBY_WEBU[w.color] || "#DAB967").toLowerCase(), b: (hex(w.b2) ? w.b2 : "#1E2A35").toLowerCase(),
      bg: ["svetle", "kremove", "tmave"].indexOf(w.bg) >= 0 ? w.bg : "svetle", zdroj: "web" };
  }
  function $(id) { return document.getElementById(id); }
  function kopia(x) { return JSON.parse(JSON.stringify(x)); }
  function zmenene() { return JSON.stringify(K) !== JSON.stringify(ULOZENE); }
  function chybaText(e) { return (e && (e.message || e.error_description)) || "Niečo sa nepodarilo. Skúste to znova."; }
  var tt;
  function toast(t, zle) { var x = $("toast"); x.textContent = t; x.className = "kp-toast" + (zle ? " zle" : ""); x.hidden = false; clearTimeout(tt); tt = setTimeout(function () { x.hidden = true; }, 3200); }
  function stav() {
    var z = zmenene();
    $("stav").className = "kp-stav" + (z ? " zmeny" : "");
    $("stav").lastChild.textContent = z ? "Neuložené zmeny" : "Uložené";
    $("ulozit").disabled = !z;
  }

  // ---------------------------------------------------------------- zoznamy častí
  function riadok(b, prvy, posledny) {
    var n = NAZVY[b.id] || [b.id, ""], zamk = b.id === "zaklad";
    return '<div class="kp-riadok' + (b.zap ? "" : " vyp") + '" draggable="true" data-id="' + b.id + '">' +
      '<span class="kp-uchop" title="Chyť a presuň">' + IK.uchop + "</span>" +
      '<div class="kp-txt"><b>' + esc(n[0]) + "</b><small>" + esc(n[1]) + "</small></div>" +
      '<div class="kp-ak">' +
      '<button type="button" class="kp-ik" data-pohyb="-1" aria-label="Posunúť vyššie" title="Vyššie"' + (prvy ? " disabled" : "") + ">" + IK.hore + "</button>" +
      '<button type="button" class="kp-ik" data-pohyb="1" aria-label="Posunúť nižšie" title="Nižšie"' + (posledny ? " disabled" : "") + ">" + IK.dole + "</button>" +
      '<button type="button" class="kp-ik" data-presun aria-label="' + (b.stlpec === "bok" ? "Presunúť do hlavného stĺpca" : "Presunúť do bočného panela") + '" title="' +
        (b.stlpec === "bok" ? "Do hlavného stĺpca" : "Do bočného panela") + '">' + (b.stlpec === "bok" ? IK.doHlavneho : IK.doBoku) + "</button>" +
      (zamk ? '<span class="kp-zamok" title="Názov a cena sú vždy zapnuté">' + IK.zamok + "</span>"
        : '<label class="kp-prep" title="' + (b.zap ? "Vypnúť" : "Zapnúť") + '"><input type="checkbox" data-zap' + (b.zap ? " checked" : "") + ' aria-label="Zobraziť: ' + esc(n[0]) + '"><i></i></label>') +
      "</div></div>";
  }
  function kresliZoznamy() {
    ["hlavny", "bok"].forEach(function (st) {
      var L = K.bloky.filter(function (b) { return b.stlpec === st; });
      $("z-" + st).innerHTML = L.length ? L.map(function (b, i) { return riadok(b, i === 0, i === L.length - 1); }).join("")
        : '<div class="kp-prazdny-st">Prázdne – sem presuň časť, ktorú chceš mať ' + (st === "bok" ? "vpravo" : "v hlavnom stĺpci") + ". Bez bočného panela bude karta v jednom stĺpci.</div>";
    });
  }
  function kresliMoznosti() {
    var m = K.moznosti;
    function prep(k, nazov, popis) {
      return '<label class="kp-moz"><span><b>' + esc(nazov) + "</b><small>" + esc(popis) + '</small></span><span class="kp-prep"><input type="checkbox" data-moz="' + k + '"' + (m[k] ? " checked" : "") + "><i></i></span></label>";
    }
    $("moznosti").innerHTML =
      prep("termin", "Kalendár vo formulári", "Klient si pri obhliadke vyberie deň a čas podľa voľna v kalendári makléra") +
      prep("dalsie", "Ďalšie ponuky pod kartou", "Ďalšie ponuky makléra a kancelárie na konci stránky") +
      prep("zdielat", "Tlačidlá Zdieľať a Leták", "Zdieľanie odkazu a leták na tlač") +
      '<label class="kp-moz"><span><b>Úrok v kalkulačke</b><small>Predvolený úrok, klient si ho môže posunúť</small></span>' +
        '<span class="kp-urok"><input type="number" id="urok" min="0.5" max="10" step="0.1" inputmode="decimal" value="' + m.urok + '"><em>%</em></span></label>';
  }
  function rovnake(x, y) { return !!x && !!y && x.a === y.a && (x.b || "") === (y.b || "") && x.bg === y.bg; }
  function kresliFarby() {
    var f = K.farby, rez = !f ? "vzhlad" : f.zdroj === "web" ? "web" : "vlastne", fw = farbyWebu(WEB);
    function vzorka(x) { return '<span class="kp-vz"><i style="background:' + esc(x.a) + '"></i><i style="background:' + esc(x.b || x.a) + '"></i><i class="bg-' + x.bg + '"></i></span>'; }
    var h = '<div class="kp-rezim" role="radiogroup" aria-label="Odkiaľ brať farby">' +
      '<button type="button" role="radio" data-rezim="vzhlad" aria-checked="' + (rez === "vzhlad") + '"><b>Ako Vzhľad kancelárie</b><small>Farby a logo z aplikácie</small></button>' +
      '<button type="button" role="radio" data-rezim="web" aria-checked="' + (rez === "web") + '"' + (fw ? "" : " disabled") + "><b>Podľa webu kancelárie</b><small>" +
        (fw ? (WEB.zverejneny ? "Rovnaké ako na webe" : "Podľa rozpracovaného webu") : "Web kancelárie ešte nemáš") + "</small></button>" +
      '<button type="button" role="radio" data-rezim="vlastne" aria-checked="' + (rez === "vlastne") + '"><b>Vlastné</b><small>Farebná sada alebo vlastná farba</small></button></div>';
    if (rez === "vzhlad") h += '<p class="kp-pozn">Karta má rovnaké farby ako aplikácia, leták a report – nastavíš ich vo Vzhľade kancelárie.</p>';
    if (rez === "web") {
      h += '<div class="kp-web-farby">' + vzorka(f) + "<span>" + (fw && !rovnake(fw, f) ? "Web kancelárie má medzitým iné farby." : "Farby z webu kancelárie.") + "</span>" +
        (fw && !rovnake(fw, f) ? '<button type="button" class="kp-b kp-b-jemne kp-b-male" data-z-webu>Načítať nové farby z webu</button>' : "") + "</div>" +
        '<p class="kp-pozn">Keď zmeníš farby webu kancelárie, pri zverejnení webu sa ťa Týpek spýta, či ich nastaviť aj na kartu.</p>';
    }
    if (rez === "vlastne") {
      h += '<div class="kp-sady">' + SADY.map(function (x) {
        var zvol = f && f.a === x.a.toLowerCase() && (f.b || "") === x.b.toLowerCase() && f.bg === x.bg;
        return '<button type="button" class="kp-sada" data-sada="' + x.id + '" aria-pressed="' + zvol + '">' + vzorka({ a: x.a, b: x.b, bg: x.bg }) + "<span>" + esc(x.n) + "</span></button>";
      }).join("") + "</div>" +
        '<div class="kp-vlastna"><label class="kp-farba"><input type="color" id="farba-a" value="' + esc(f.a) + '" aria-label="Hlavná farba"><span><b>Hlavná farba</b><small>Tlačidlá, cena a zvýraznenia</small></span></label>' +
        '<div class="kp-seg" role="group" aria-label="Pozadie">' + POZADIA.map(function (x) { return '<button type="button" data-pozadie="' + x[0] + '" aria-pressed="' + (f.bg === x[0]) + '">' + x[1] + "</button>"; }).join("") + "</div></div>";
    }
    $("farby").innerHTML = h;
  }
  function zmenaFarieb() { kresliFarby(); stav(); posliDoNahladu(); }
  document.addEventListener("click", function (e) {
    var r = e.target.closest("[data-rezim]");
    if (r && !r.disabled) {
      var rz = r.dataset.rezim;
      if (rz === "vzhlad") K.farby = null;
      else if (rz === "web") K.farby = farbyWebu(WEB);
      else if (!K.farby || K.farby.zdroj === "web") { var z = K.farby || SADY[1]; K.farby = { a: z.a.toLowerCase(), b: (z.b || "#1E2A35").toLowerCase(), bg: z.bg, zdroj: "vlastne" }; }
      zmenaFarieb(); return;
    }
    if (e.target.closest("[data-z-webu]")) { K.farby = farbyWebu(WEB); zmenaFarieb(); return; }
    var sd = e.target.closest("[data-sada]");
    if (sd) { var x = SADY.find(function (q) { return q.id === sd.dataset.sada; }); K.farby = { a: x.a.toLowerCase(), b: x.b.toLowerCase(), bg: x.bg, zdroj: "vlastne" }; zmenaFarieb(); return; }
    var pz = e.target.closest("[data-pozadie]");
    if (pz && K.farby) { K.farby.bg = pz.dataset.pozadie; zmenaFarieb(); }
  });
  document.addEventListener("input", function (e) {
    if (e.target.id !== "farba-a" || !K.farby) return;
    K.farby.a = e.target.value.toLowerCase(); stav(); posliDoNahladu();
    document.querySelectorAll("[data-sada]").forEach(function (b) { b.setAttribute("aria-pressed", "false"); });
  });
  function vsetko() { kresliFarby(); kresliZoznamy(); kresliMoznosti(); stav(); posliDoNahladu(); }
  function zmena() { kresliZoznamy(); stav(); posliDoNahladu(); }

  // posun v rámci stĺpca: vymení sa so susedom v tom istom stĺpci
  function posun(id, smer) {
    var i = K.bloky.findIndex(function (b) { return b.id === id; }), st = K.bloky[i].stlpec, j = i + smer;
    while (j >= 0 && j < K.bloky.length && K.bloky[j].stlpec !== st) j += smer;
    if (j < 0 || j >= K.bloky.length) return;
    var x = K.bloky[i]; K.bloky[i] = K.bloky[j]; K.bloky[j] = x;
    zmena();
    var r = document.querySelector('.kp-riadok[data-id="' + id + '"] [data-pohyb="' + smer + '"]'); if (r && !r.disabled) r.focus();
  }
  // presun do stĺpca pred danú časť (alebo na koniec stĺpca)
  function presunDo(id, st, predId) {
    var i = K.bloky.findIndex(function (b) { return b.id === id; }); if (i < 0) return;
    var b = K.bloky.splice(i, 1)[0]; b.stlpec = st;
    var k = predId ? K.bloky.findIndex(function (x) { return x.id === predId; }) : -1;
    if (k < 0) { k = -1; K.bloky.forEach(function (x, n) { if (x.stlpec === st) k = n; }); k = k + 1; if (k === 0) k = K.bloky.length; }
    K.bloky.splice(k, 0, b);
    zmena();
  }
  document.addEventListener("click", function (e) {
    var r = e.target.closest(".kp-riadok"); if (!r) return;
    var p = e.target.closest("[data-pohyb]"); if (p) { posun(r.dataset.id, Number(p.dataset.pohyb)); return; }
    if (e.target.closest("[data-presun]")) {
      var b = K.bloky.find(function (x) { return x.id === r.dataset.id; });
      presunDo(b.id, b.stlpec === "bok" ? "hlavny" : "bok", null);
      toast(NAZVY[b.id][0] + (b.stlpec === "bok" ? " je v bočnom paneli." : " je v hlavnom stĺpci."));
    }
  });
  document.addEventListener("change", function (e) {
    var z = e.target.closest("[data-zap]");
    if (z) { var r = z.closest(".kp-riadok"), b = K.bloky.find(function (x) { return x.id === r.dataset.id; }); b.zap = z.checked; zmena(); return; }
    var m = e.target.closest("[data-moz]");
    if (m) { K.moznosti[m.dataset.moz] = m.checked; stav(); posliDoNahladu(); return; }
    if (e.target.id === "urok") {
      var u = Number(String(e.target.value).replace(",", "."));
      K.moznosti.urok = u >= 0.5 && u <= 10 ? Math.round(u * 10) / 10 : ULOZENE.moznosti.urok; e.target.value = K.moznosti.urok; stav(); posliDoNahladu();
    }
  });

  // ťahanie myšou (na dotykových zariadeniach šípky)
  document.addEventListener("dragstart", function (e) {
    var r = e.target.closest && e.target.closest(".kp-riadok"); if (!r) return;
    tahane = r.dataset.id; r.classList.add("tahane");
    try { e.dataTransfer.setData("text/plain", tahane); e.dataTransfer.effectAllowed = "move"; } catch (x) { /* nič */ }
  });
  document.addEventListener("dragend", function () {
    tahane = null;
    document.querySelectorAll(".tahane, .ciel-pred, .ciel-koniec").forEach(function (x) { x.classList.remove("tahane", "ciel-pred", "ciel-koniec"); });
  });
  function cielTahania(e) {
    var zoz = e.target.closest && e.target.closest(".kp-zoznam"); if (!zoz) return null;
    var riadky = Array.prototype.slice.call(zoz.querySelectorAll(".kp-riadok")).filter(function (x) { return x.dataset.id !== tahane; });
    var pred = riadky.find(function (x) { var r = x.getBoundingClientRect(); return e.clientY < r.top + r.height / 2; });
    return { zoz: zoz, pred: pred || null };
  }
  document.addEventListener("dragover", function (e) {
    if (!tahane) return; var c = cielTahania(e); if (!c) return;
    e.preventDefault();
    document.querySelectorAll(".ciel-pred, .ciel-koniec").forEach(function (x) { x.classList.remove("ciel-pred", "ciel-koniec"); });
    if (c.pred) c.pred.classList.add("ciel-pred"); else c.zoz.classList.add("ciel-koniec");
  });
  document.addEventListener("drop", function (e) {
    if (!tahane) return; var c = cielTahania(e); if (!c) return;
    e.preventDefault();
    presunDo(tahane, c.zoz.dataset.stlpec, c.pred ? c.pred.dataset.id : null);
  });

  // ---------------------------------------------------------------- náhľad
  var casovac;
  function posliDoNahladu() {
    clearTimeout(casovac);
    casovac = setTimeout(function () {
      var w = $("ifr").contentWindow;
      try { if (w && w.TYPEK_KARTA) w.TYPEK_KARTA(kopia(K)); } catch (e) { /* rámček sa ešte načítava */ }
    }, 80);
  }
  function rozmer() {
    var sc = $("scena"), ram = $("ramik"), ifr = $("ifr");
    var W = sc.clientWidth - 32, H = sc.clientHeight - 32;
    if (ZAR === "pc") {
      var s = Math.min(1, W / 1280);
      ifr.style.width = "1280px"; ifr.style.height = Math.round(H / s) + "px"; ifr.style.transform = "scale(" + s + ")";
      ram.style.width = Math.round(1280 * s) + "px"; ram.style.height = H + "px";
    } else {
      var s2 = Math.min(1, (H - 16) / 844);   // 16 px = rámik telefónu
      ifr.style.width = "390px"; ifr.style.height = "844px"; ifr.style.transform = "scale(" + s2 + ")";
      ram.style.width = Math.round(390 * s2) + "px"; ram.style.height = Math.round(844 * s2) + "px";
    }
    ram.className = "kp-ramik zar-" + ZAR;
  }
  function nacitajNahlad() {
    if (!PONUKA) return;
    var url = "ponuka.html?id=" + PONUKA + "&nahlad=1";
    $("otvorit").href = url;
    $("ifr").src = url;
  }
  $("ifr").addEventListener("load", posliDoNahladu);
  window.addEventListener("resize", rozmer);
  document.querySelectorAll("[data-zar]").forEach(function (b) {
    b.onclick = function () {
      ZAR = b.dataset.zar;
      document.querySelectorAll("[data-zar]").forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); });
      rozmer();
    };
  });
  $("ponuka").onchange = function () { PONUKA = Number(this.value); nacitajNahlad(); };

  // ---------------------------------------------------------------- uloženie
  $("ulozit").onclick = function () {
    var b = this; b.disabled = true; b.textContent = "Ukladám…";
    T.rpc("ulozit_kartu_ponuky", { p: kopia(K) }).then(function (v) {
      ULOZENE = T.normKarta(v); K = kopia(ULOZENE); vsetko();
      toast("Uložené. Karta platí pre všetky ponuky – klienti ju uvidia najneskôr o pol minúty.");
    }, function (e) { toast(chybaText(e), true); stav(); }).then(function () { b.textContent = "Uložiť pre celú kanceláriu"; });
  };
  $("predvolene").onclick = function () {
    K = T.normKarta(null); vsetko();
    toast("Predvolené poradie je pripravené – ak sa ti páči, ulož ho.");
  };
  window.addEventListener("beforeunload", function (e) { if (zmenene()) { e.preventDefault(); e.returnValue = ""; } });

  // ---------------------------------------------------------------- štart (len administrátor)
  function zamknute(nadpis, text) {
    $("brana").innerHTML = '<img src="typek-hlavicka.png" alt="" width="64" height="64"><h2>' + esc(nadpis) + "</h2><p>" + esc(text) + '</p><a class="kp-b kp-b-zlate" href="./">Späť do Realitného týpka</a>';
  }
  var STAVY = { aktivne: "aktívna", rezervovane: "rezervovaná", predane: "predaná", koncept: "koncept", neaktivne: "neaktívna", archiv: "archív" };
  function start(karta, ponuky) {
    ULOZENE = T.normKarta(karta); K = kopia(ULOZENE);
    ponuky = (ponuky || []).filter(function (p) { return p.stav !== "archiv"; });
    var poradie = { aktivne: 0, rezervovane: 1, predane: 2 };
    ponuky.sort(function (a, b) { return (poradie[a.stav] == null ? 9 : poradie[a.stav]) - (poradie[b.stav] == null ? 9 : poradie[b.stav]); });
    $("ponuka").innerHTML = ponuky.map(function (p) {
      return '<option value="' + p.id + '">' + esc((p.nazov || [p.typ || "Nehnuteľnosť", p.obec].filter(Boolean).join(", ")) + (p.cislo ? " · " + p.cislo : "") + " (" + (STAVY[p.stav] || p.stav) + ")") + "</option>";
    }).join("");
    PONUKA = ponuky.length ? ponuky[0].id : null;
    $("prazdne").hidden = !!PONUKA; $("ramik").hidden = !PONUKA; $("ponuka").disabled = !PONUKA;
    $("brana").hidden = true; $("app").hidden = false; $("akcie").hidden = false;
    vsetko(); rozmer(); nacitajNahlad();
  }
  sb.auth.getSession().then(function (r) {
    var ses = r.data && r.data.session;
    if (!ses) { zamknute("Najprv sa prihlás", "Kartu nehnuteľnosti upravíš po prihlásení v Realitnom týpkovi."); return; }
    return sb.from("makleri").select("rola,aktivny").eq("id", ses.user.id).maybeSingle().then(function (q) {
      if (q.error) throw q.error;
      if (!q.data || q.data.rola !== "admin" || q.data.aktivny === false) { zamknute("Len pre administrátora", "Kartu nehnuteľnosti upravuje administrátor kancelárie."); return; }
      return Promise.all([
        T.rpc("karta_ponuky", {}),
        T.rpc("farby_webu_kancelarie", {}).catch(function () { return null; }),
        sb.from("nehnutelnosti").select("id,nazov,typ,obec,stav,cislo,upravene").order("upravene", { ascending: false }).limit(100).then(function (x) { if (x.error) throw x.error; return x.data; })
      ]).then(function (v) { WEB = v[1] || null; start(v[0], v[2]); });
    });
  }).catch(function (e) { zamknute("Niečo sa nepodarilo", chybaText(e)); });
})();
