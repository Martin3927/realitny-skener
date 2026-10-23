// verejný web makléra: načítanie zverejneného webu, formuláre, návštevy
(function () {
  "use strict";
  var CFG = window.SKENER_CONFIG, T = window.TYPEK_WEB, W = T.W;
  var sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey);
  var q = new URLSearchParams(location.search);
  // adresa: stranka.html?m=jana-kovacova, stranka.html?jana-kovacova alebo vlastná doména
  var adresa = q.get("m") || (location.search.replace(/^\?/, "").split("&")[0].indexOf("=") < 0 ? location.search.replace(/^\?/, "").split("&")[0] : "") ||
    (/realitnytypek\.sk$|github\.io$|localhost|^127\./.test(location.hostname) ? "" : location.hostname.replace(/^www\./, ""));
  var nahlad = q.get("nahlad") === "1";
  var site = document.getElementById("site");
  function chyba(t) { site.innerHTML = '<div class="nacitavam">' + t + "</div>"; }
  if (!adresa) return chyba("Stránka sa nenašla.");

  sb.rpc("verejny_web", { p_adresa: adresa, p_nahlad: nahlad }).then(function (r) {
    if (r.error) throw r.error;
    var d = r.data;
    if (!d) return chyba(nahlad ? "Náhľad uvidíš, keď si v rovnakom prehliadači prihlásený v Realitnom týpkovi." : "Táto stránka zatiaľ nie je zverejnená.");
    var m = d.makler || {}, s = T.merge(d.web || {});
    if (!s.name) s.name = m.meno || "";
    if (!s.phone) s.phone = m.telefon || "";
    if (!s.email) s.email = m.email || "";
    if (!s.photo && m.foto) s.photo = m.foto;
    W.S = s;
    if (!d.nahlad) W.adresa = adresa;
    W.CTX = { ponuky: (d.ponuky || []).map(T.prevod), predane: (d.predane || []).map(T.prevod), recenzie: d.recenzie, makler: m, ukazka: false };
    try { if (localStorage.getItem("typek-web-cookies")) W.CK.bar = false; } catch (e) { /* nič */ }
    W.odoslat = function (o) {
      return sb.rpc("web_kontakt", { p_adresa: adresa, p_zdroj: o.zdroj, p_kontakt: o.kontakt, p_meno: o.meno || null, p_co: o.co || null, p_ponuka: o.ponuka || null, p_dopyt: o.dopyt || null })
        .then(function (x) { if (x.error) throw new Error(x.error.message || "Správu sa nepodarilo odoslať."); return x.data; });
    };
    document.getElementById("nahladPas").hidden = !d.nahlad;
    // titulok, popis a ikona pre prehliadač aj zdieľanie
    var titul = s.share.title || (s.name + " | Realitn" + (m.pohlavie === "zena" ? "á maklérka" : "ý maklér") + (s.area ? ", " + s.area : ""));
    document.title = titul;
    var popis = s.share.desc || T.heroTx().l || ("Predaj, kúpa a prenájom nehnuteľností v regióne " + s.area + ".");
    document.querySelector('meta[name="description"]').setAttribute("content", popis);
    [["og:title", titul], ["og:description", popis], ["og:image", s.heroImg || s.photo && !/^data:/.test(s.photo) && s.photo || T.aiSrc(T.heroAi(s.tpl === "mestska" ? "mesto" : "dom"))]].forEach(function (x) {
      if (!x[1]) return; var el = document.createElement("meta"); el.setAttribute("property", x[0]); el.setAttribute("content", x[1]); document.head.appendChild(el);
    });
    if (s.logo) document.getElementById("ikona").href = s.logo;
    else { var P = T.pal(); document.getElementById("ikona").href = "data:image/svg+xml," + encodeURIComponent(T.favSvg(P).replace("<svg ", '<svg xmlns="http://www.w3.org/2000/svg" ')); }
    document.documentElement.style.background = T.pal().bg; document.body.style.background = T.pal().bg;
    W.poDetaile = function (x) { if (x.id && !d.nahlad) sb.rpc("zaznamenat_zobrazenie", { p_id: x.id }).then(function () {}); };
    T.napoj(site);
    // ponuka z odkazu: stranka.html?m=adresa&p=ID alebo #p-ID
    var hm = location.hash.match(/^#p-(\d+)$/), pid = hm ? hm[1] : String(q.get("p") || "").replace(/\D/g, "");
    var i = pid ? W.CTX.ponuky.findIndex(function (x) { return String(x.id) === pid; }) : -1;
    if (i < 0 && pid) { var j = W.CTX.predane.findIndex(function (x) { return String(x.id) === pid; }); if (j >= 0) { W.CTX.ponuky = W.CTX.ponuky.concat([W.CTX.predane[j]]); i = W.CTX.ponuky.length - 1; } }
    if (i >= 0) W.PAGE = { v: "detail", i: i };
    T.render();
    if (!d.nahlad) { try { if (!sessionStorage.getItem("typek-web-" + adresa)) { sessionStorage.setItem("typek-web-" + adresa, "1"); sb.rpc("zaznamenat_navstevu_webu", { p_adresa: adresa }).then(function () {}); } } catch (e) { /* nič */ } }
  }).catch(function () { chyba("Stránku sa nepodarilo načítať. Skúste to o chvíľu znova."); });
})();
