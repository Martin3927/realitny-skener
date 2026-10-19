/* Spoločné pomôcky verejných stránok (ponuka, leták, report) – Realitný týpek · Alpha Reality */
(function () {
  var CFG = window.SKENER_CONFIG || {};
  var nf = new Intl.NumberFormat("sk-SK");
  var sb = window.supabase && CFG.supabaseUrl ? window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey) : null;

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; });
  }
  function eur(n) { return nf.format(Math.round(Number(n))) + " €"; }
  function rpc(fn, args) {
    if (sb) return sb.rpc(fn, args).then(function (r) { if (r.error) throw r.error; return r.data; });
    return fetch(CFG.supabaseUrl + "/rest/v1/rpc/" + fn, {
      method: "POST", headers: { apikey: CFG.supabaseKey, "Content-Type": "application/json" }, body: JSON.stringify(args || {}),
    }).then(function (r) {
      return r.text().then(function (t) {
        var d = null; try { d = t ? JSON.parse(t) : null; } catch (e) { /* nie JSON */ }
        if (!r.ok) throw new Error((d && d.message) || "Údaje sa nepodarilo načítať (" + r.status + ").");
        return d;
      });
    });
  }
  function fotkaUrl(f) {
    if (!f) return "";
    if (f.url) return f.url;
    return CFG.supabaseUrl + "/storage/v1/object/public/ponuky/" + f.cesta;
  }
  function nazov(p) { return p.nazov || [p.typ || "Nehnuteľnosť", p.obec].filter(Boolean).join(", "); }
  function lokalita(p) { return [p.ulica, p.cast_obce, p.obec].filter(Boolean).join(", ") + (p.okres && p.okres !== p.obec ? ", okres " + p.okres : ""); }
  function cena(p) {
    if (p.zobrazit_cenu === false || p.cena == null) return p.typ_ceny === "na vyžiadanie" ? "Cena na vyžiadanie" : "Cena dohodou";
    if (p.typ_ceny === "dohodou") return eur(p.cena) + " · dohodou";
    return eur(p.cena) + (p.typ_ceny && p.typ_ceny !== "za nehnuteľnosť" && p.typ_ceny !== "na vyžiadanie" ? " " + p.typ_ceny : "");
  }
  function cenaM2(p) {
    var pl = p.kategoria === "pozemky" ? p.plocha_pozemku : p.plocha_uzitkova;
    if (!p.cena || !pl || p.zobrazit_cenu === false || p.transakcia === "prenajom" || (p.typ_ceny && p.typ_ceny !== "za nehnuteľnosť")) return "";
    return nf.format(Math.round(p.cena / pl)) + " €/m²";
  }
  var CISELNE = [["plocha_uzitkova", "Úžitková plocha", " m²"], ["plocha_zastavana", "Zastavaná plocha", " m²"], ["plocha_pozemku", "Pozemok", " m²"],
    ["izby", "Izby", ""], ["poschodie", "Poschodie", ""], ["pocet_podlazi", "Podlažia", ""], ["rok_vystavby", "Rok výstavby", ""]];
  var TEXTOVE = [["stav_objektu", "Stav"], ["konstrukcia", "Konštrukcia"], ["vlastnictvo", "Vlastníctvo"], ["kurenie", "Kúrenie"], ["energ_certifikat", "Energetický certifikát"]];
  function parametre(p) {
    var out = [];
    CISELNE.forEach(function (k) {
      var v = p[k[0]]; if (v === null || v === undefined || v === "") return;
      if (k[0] === "poschodie") v = Number(v) === 0 ? "prízemie" : v + (p.pocet_podlazi ? " z " + p.pocet_podlazi : "");
      else v = nf.format(v) + k[2];
      if (k[0] === "pocet_podlazi" && p.poschodie !== null && p.poschodie !== undefined && p.poschodie !== "") return;
      out.push([k[1], v]);
    });
    TEXTOVE.forEach(function (k) { if (p[k[0]]) out.push([k[1], p[k[0]]]); });
    if ((p.orientacia || []).length) out.push(["Orientácia", p.orientacia.join(", ")]);
    if (p.cena_energie) out.push(["Energie", p.cena_energie]);
    return out;
  }
  function telOdkaz(t) { return String(t || "").replace(/[^\d+]/g, ""); }
  function waOdkaz(t) {
    var c = telOdkaz(t); if (c.indexOf("+") === 0) c = c.slice(1); else if (c.indexOf("00") === 0) c = c.slice(2); else if (c.indexOf("0") === 0) c = "421" + c.slice(1);
    return c;
  }
  function avatar(m, px) {
    var ini = String((m && m.meno) || "?").split(/\s+/).filter(function (x) { return !/\.$/.test(x); }).map(function (x) { return x.charAt(0); }).slice(0, 2).join("").toUpperCase();
    if (m && m.foto) return '<img class="v-av" style="width:' + px + "px;height:" + px + 'px" src="' + esc(m.foto) + '" alt="">';
    return '<span class="v-av v-av-ini" style="width:' + px + "px;height:" + px + "px;font-size:" + Math.round(px * 0.38) + 'px">' + esc(ini) + "</span>";
  }
  function param(n) { return new URLSearchParams(location.search).get(n); }
  function datum(iso, cas) {
    var d = new Date(iso);
    return d.toLocaleDateString("sk-SK", { day: "numeric", month: "numeric", year: "numeric" }) + (cas ? " " + d.toLocaleTimeString("sk-SK", { hour: "2-digit", minute: "2-digit" }) : "");
  }
  function verejnyOdkaz(id) { return new URL("ponuka.html?id=" + id, location.href).href; }

  // vzhľad kancelárie (logo a farba z nastavení administrátora) – aj na verejných stránkach
  function hexRgb(h) { h = String(h).replace("#", ""); return [0, 2, 4].map(function (i) { return parseInt(h.slice(i, i + 2), 16); }); }
  function zmiesaj(a, b, t) { var x = hexRgb(a), y = hexRgb(b); return "#" + x.map(function (v, i) { return Math.round(v + (y[i] - v) * t).toString(16).padStart(2, "0"); }).join(""); }
  var SCH = { zlata: ["#dab967", "#a8862f"], typek: ["#f0ad1c", "#a36d00"], modra: ["#4c8df6", "#2560c4"], smaragd: ["#2fb380", "#16845a"], vinova: ["#c4566a", "#9a2d42"],
    oranzova: ["#f08a2c", "#b85c0c"], fialova: ["#8d73ee", "#6247cc"], grafit: ["#a3adbb", "#566170"] };
  function aplikujVzhlad(v) {
    if (!v) return;
    var f = v.schema === "vlastna" && /^#[0-9a-f]{6}$/i.test(v.farba || "") ? [v.farba, zmiesaj(v.farba, "#000000", 0.3)] : SCH[v.schema];
    if (f && v.schema !== "zlata") {
      var st = document.createElement("style");
      st.textContent = ":root{--gold:" + f[1] + ";--gold-strong:" + f[0] + ";--gold-soft:" + zmiesaj(f[0], "#ffffff", 0.84) + "}" +
        '@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--gold:' + f[0] + ";--gold-soft:" + zmiesaj("#1f2228", f[0], 0.18) + "}}";
      document.head.appendChild(st);
    }
    if (v.logo) document.querySelectorAll('img[src^="logo.png"]').forEach(function (i) { i.src = v.logo; if (v.nazov) i.alt = v.nazov; });
  }
  try { aplikujVzhlad(JSON.parse(localStorage.getItem("typek-vzhlad") || "null")); } catch (e) { /* bez úložiska */ }
  function vzhladZoServera() {
    rpc("vzhlad_kancelarie", {}).then(function (v) {
      try { localStorage.setItem("typek-vzhlad", JSON.stringify(v || {})); } catch (e) { /* nič */ }
      aplikujVzhlad(v);
    }).catch(function () {});
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", vzhladZoServera); else vzhladZoServera();
  // logá vložené neskôr (napr. leták) sa prepnú tiež
  new MutationObserver(function () {
    var v = null; try { v = JSON.parse(localStorage.getItem("typek-vzhlad") || "null"); } catch (e) { /* nič */ }
    if (v && v.logo) document.querySelectorAll('img[src^="logo.png"]').forEach(function (i) { i.src = v.logo; });
  }).observe(document.documentElement, { childList: true, subtree: true });

  window.TYPEK = { CFG: CFG, sb: sb, nf: nf, esc: esc, eur: eur, rpc: rpc, fotkaUrl: fotkaUrl, nazov: nazov, lokalita: lokalita, cena: cena, cenaM2: cenaM2,
    parametre: parametre, telOdkaz: telOdkaz, waOdkaz: waOdkaz, avatar: avatar, param: param, datum: datum, verejnyOdkaz: verejnyOdkaz };
})();
