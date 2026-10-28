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
  var ULOZENE = T.normKarta(null), K = T.normKarta(null), ZAR = "pc", PONUKA = null, tahane = null;
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
  function vsetko() { kresliZoznamy(); kresliMoznosti(); stav(); posliDoNahladu(); }
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
        sb.from("nehnutelnosti").select("id,nazov,typ,obec,stav,cislo,upravene").order("upravene", { ascending: false }).limit(100).then(function (x) { if (x.error) throw x.error; return x.data; })
      ]).then(function (v) { start(v[0], v[1]); });
    });
  }).catch(function (e) { zamknute("Niečo sa nepodarilo", chybaText(e)); });
})();
