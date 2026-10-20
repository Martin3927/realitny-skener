/*
 * Realitný týpek – ponuky na web realitnej kancelárie alebo osobný web makléra.
 * Vloženie do stránky:
 *   <div data-typek-ponuky data-filtre="1"></div>
 *   <script src="https://app.realitnytypek.sk/widget.js" async></script>
 * Voliteľné: data-makler="<id makléra>", data-transakcia="predaj|prenajom", data-kategoria="byty|domy|…",
 *            data-limit="12", data-filtre="1" (prepínače nad ponukami), data-tema="tmava"
 */
(function () {
  var skript = document.currentScript;
  var BASE = skript ? skript.src.replace(/[^/]*$/, "") : "https://app.realitnytypek.sk/";
  var CFG = window.SKENER_CONFIG || { supabaseUrl: "https://uwxziqapghlyktwpipjd.supabase.co", supabaseKey: "sb_publishable_ukjo7DCX1FMYly7NU4gtxg_suIF66nf" };
  var nf = new Intl.NumberFormat("sk-SK");
  var KAT = [["", "Všetko"], ["byty", "Byty"], ["domy", "Domy"], ["pozemky", "Pozemky"], ["chaty", "Chaty"], ["priestory", "Priestory"], ["objekty", "Objekty"], ["garaze", "Garáže"]];
  var IKONA = { byty: "🏢", domy: "🏠", chaty: "🏡", pozemky: "🌳", priestory: "🏬", objekty: "🏭", garaze: "🚗" };
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function foto(f) { return !f ? "" : f.url ? f.url : CFG.supabaseUrl + "/storage/v1/object/public/ponuky/" + f.cesta; }
  function cena(p) {
    if (p.zobrazit_cenu === false || p.cena == null) return p.typ_ceny === "na vyžiadanie" ? "Cena na vyžiadanie" : "Cena dohodou";
    return nf.format(Math.round(p.cena)) + " €" + (p.typ_ceny && p.typ_ceny !== "za nehnuteľnosť" && p.typ_ceny !== "dohodou" && p.typ_ceny !== "na vyžiadanie" ? " " + p.typ_ceny : "");
  }
  var CSS = ":host{all:initial;display:block;font-family:'Public Sans','Segoe UI',Arial,sans-serif;color:#1f2329;--z:#a8862f;--zs:#dab967;--l:#e6e2d8;--s:#fff;--m:#686c73}" +
    ":host([data-tema=tmava]){color:#eceae4;--l:#33373e;--s:#1f2228;--m:#a3a5a9;--z:#dab967}" +
    "*{box-sizing:border-box}.f{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 16px}.f button{font:inherit;font-size:14px;border:1px solid var(--l);background:var(--s);color:inherit;border-radius:999px;padding:7px 14px;cursor:pointer}" +
    ".f button[aria-pressed=true]{background:var(--zs);border-color:var(--zs);color:#1f1b12;font-weight:700}" +
    ".g{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:18px}" +
    "a.k{display:flex;flex-direction:column;text-decoration:none;color:inherit;background:var(--s);border:1px solid var(--l);border-radius:14px;overflow:hidden;transition:transform .15s,box-shadow .15s}" +
    "a.k:hover{transform:translateY(-2px);box-shadow:0 10px 24px rgba(0,0,0,.10)}a.k:focus-visible{outline:2px solid var(--zs);outline-offset:2px}" +
    ".i{position:relative;aspect-ratio:3/2;background:#f4ecd9;display:grid;place-items:center;font-size:44px}.i img{width:100%;height:100%;object-fit:cover;display:block}" +
    ".st{position:absolute;left:10px;top:10px;background:var(--zs);color:#1f1b12;font-size:12px;font-weight:700;padding:3px 9px;border-radius:999px}" +
    ".t{padding:14px 16px 16px;display:grid;gap:4px}.tr{font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--m);font-weight:600}" +
    ".n{font-weight:700;font-size:16px;line-height:1.3}.lo{font-size:14px;color:var(--m)}.c{font-weight:800;font-size:19px;color:var(--z);margin-top:4px}" +
    ".p{font-size:13px;color:var(--m)}.x{padding:30px;text-align:center;color:var(--m);border:1px dashed var(--l);border-radius:14px}" +
    ".ft{margin-top:12px;font-size:12px;color:var(--m);text-align:right}.ft a{color:inherit}";
  function nacitaj(makler) {
    return fetch(CFG.supabaseUrl + "/rest/v1/rpc/verejne_ponuky", {
      method: "POST", headers: { apikey: CFG.supabaseKey, "Content-Type": "application/json" },
      body: JSON.stringify({ p_kancelaria: "alpha", p_makler: makler || null }),
    }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); });
  }
  function spusti(el) {
    if (el.__typek) return; el.__typek = true;
    var root = el.attachShadow ? el.attachShadow({ mode: "open" }) : el;
    var st = { tr: el.dataset.transakcia || "", kat: el.dataset.kategoria || "" }, limit = Number(el.dataset.limit) || 0, data = [];
    function kresli() {
      var zoz = data.filter(function (p) { return (!st.tr || p.transakcia === st.tr) && (!st.kat || p.kategoria === st.kat); });
      if (limit) zoz = zoz.slice(0, limit);
      var kat = KAT.filter(function (k) { return !k[0] || data.some(function (p) { return p.kategoria === k[0]; }); });
      var filtre = el.dataset.filtre === "1" ? '<div class="f">' + [["", "Predaj aj prenájom"], ["predaj", "Predaj"], ["prenajom", "Prenájom"]].map(function (x) {
        return '<button type="button" data-tr="' + x[0] + '" aria-pressed="' + (st.tr === x[0]) + '">' + x[1] + "</button>";
      }).join("") + "</div>" + (kat.length > 2 ? '<div class="f">' + kat.map(function (k) { return '<button type="button" data-kat="' + k[0] + '" aria-pressed="' + (st.kat === k[0]) + '">' + k[1] + "</button>"; }).join("") + "</div>" : "") : "";
      root.innerHTML = "<style>" + CSS + "</style>" + filtre + (zoz.length ? '<div class="g">' + zoz.map(function (p) {
        var f = (p.fotky || [])[0], par = [p.plocha_uzitkova ? nf.format(p.plocha_uzitkova) + " m²" : p.plocha_pozemku ? nf.format(p.plocha_pozemku) + " m²" : "", p.izby ? p.izby + " izby" : ""].filter(Boolean).join(" · ");
        var stitok = p.stav === "rezervovane" ? "Rezervované" : p.exkluzivne ? "Exkluzívne" : (p.specialne || [])[0] || "";
        return '<a class="k" href="' + esc(BASE + "ponuka.html?id=" + p.id) + '" target="_blank" rel="noopener"><span class="i">' +
          (f ? '<img loading="lazy" src="' + esc(foto(f)) + '" alt="">' : (IKONA[p.kategoria] || "🏠")) + (stitok ? '<span class="st">' + esc(stitok) + "</span>" : "") + "</span>" +
          '<span class="t"><span class="tr">' + (p.transakcia === "prenajom" ? "Prenájom" : "Predaj") + (p.typ ? " · " + esc(p.typ) : "") + "</span>" +
          '<span class="n">' + esc(p.nazov || [p.typ, p.obec].filter(Boolean).join(", ")) + '</span><span class="lo">📍 ' + esc([p.cast_obce, p.obec].filter(Boolean).join(", ")) + "</span>" +
          '<span class="c">' + esc(cena(p)) + "</span>" + (par ? '<span class="p">' + esc(par) + "</span>" : "") + "</span></a>";
      }).join("") + "</div>" : '<div class="x">Momentálne tu nie sú žiadne ponuky.</div>') +
        '<div class="ft">Ponuky Alpha Reality</div>';
      root.querySelectorAll("[data-tr]").forEach(function (b) { b.onclick = function () { st.tr = b.dataset.tr; kresli(); }; });
      root.querySelectorAll("[data-kat]").forEach(function (b) { b.onclick = function () { st.kat = b.dataset.kat; kresli(); }; });
    }
    root.innerHTML = "<style>" + CSS + '</style><div class="x">Načítavam ponuky…</div>';
    nacitaj(el.dataset.makler).then(function (d) { data = d || []; kresli(); }, function () { root.innerHTML = "<style>" + CSS + '</style><div class="x">Ponuky sa nepodarilo načítať.</div>'; });
  }
  function vsetky() { document.querySelectorAll("[data-typek-ponuky]").forEach(spusti); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", vsetky); else vsetky();
  window.TypekPonuky = { obnov: vsetky };
})();
