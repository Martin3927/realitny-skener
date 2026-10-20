// Verejný feed aktívnych ponúk kancelárie – pre web RK, osobné weby maklérov a napojenie na portály.
//   GET /functions/v1/feed               → XML
//   GET /functions/v1/feed?format=json   → JSON
//   voliteľne &makler=<id makléra>
// Obsahuje len údaje, ktoré sa zverejňujú (bez majiteľa, zmluvy, provízie, internej adresy).
import { createClient } from "jsr:@supabase/supabase-js@2";

const WEB = (Deno.env.get("APP_URL") || "https://app.realitnytypek.sk/").replace(/\/?$/, "/");

function x(s: unknown) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c]!));
}
function el(n: string, v: unknown) {
  return v === null || v === undefined || v === "" ? "" : `<${n}>${x(v)}</${n}>`;
}

Deno.serve(async (req) => {
  const u = new URL(req.url);
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const makler = u.searchParams.get("makler");
  const { data, error } = await db.rpc("verejne_ponuky", { p_kancelaria: "alpha", p_makler: makler && /^[0-9a-f-]{36}$/.test(makler) ? makler : null });
  const hl = { "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=300" };
  if (error) return new Response("Chyba: " + error.message, { status: 500, headers: hl });
  const base = Deno.env.get("SUPABASE_URL") + "/storage/v1/object/public/ponuky/";
  // deno-lint-ignore no-explicit-any
  const ponuky = ((data as any[]) || []).map((p) => ({
    ...p,
    url: WEB + "ponuka.html?id=" + p.id,
    // deno-lint-ignore no-explicit-any
    fotky: (p.fotky || []).map((f: any) => f.url || base + f.cesta),
    // videá sú v stĺpci uložené po riadkoch – do feedu idú ako zoznam (prvé zostáva aj v poli `video`)
    videa: String(p.video || "").split(/[\r\n]+/).map((v: string) => v.trim()).filter(Boolean),
  }));
  for (const p of ponuky) p.video = p.videa[0] || null;
  if (u.searchParams.get("format") === "json") {
    return Response.json({ kancelaria: "Alpha Reality", vygenerovane: new Date().toISOString(), pocet: ponuky.length, ponuky }, { headers: hl });
  }
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<ponuky kancelaria="Alpha Reality" vygenerovane="${new Date().toISOString()}" pocet="${ponuky.length}">
${ponuky.map((p) => `  <ponuka id="${p.id}">
    ${el("cislo", p.cislo)}${el("stav", p.stav)}${el("transakcia", p.transakcia)}${el("kategoria", p.kategoria)}${el("typ", p.typ)}
    ${el("nazov", p.nazov)}${el("intro", p.intro)}${el("popis", p.popis)}
    <lokalita>${el("kraj", p.kraj)}${el("okres", p.okres)}${el("obec", p.obec)}${el("cast_obce", p.cast_obce)}${el("ulica", p.ulica)}${el("lat", p.lat)}${el("lon", p.lon)}</lokalita>
    <cena>${el("suma", p.cena)}${el("mena", p.cena != null ? "EUR" : "")}${el("typ_ceny", p.typ_ceny)}${el("text", p.text_k_cene)}${el("energie", p.cena_energie)}</cena>
    <parametre>${["plocha_uzitkova", "plocha_zastavana", "plocha_pozemku", "izby", "poschodie", "pocet_podlazi", "rok_vystavby", "vlastnictvo", "stav_objektu", "konstrukcia", "energ_certifikat", "kurenie"].map((k) => el(k, p[k])).join("")}${el("exkluzivne", p.exkluzivne ? "1" : "")}</parametre>
    <vybavenie>${(p.vybavenie || []).map((v: string) => el("polozka", v)).join("")}</vybavenie>
    <fotky>${p.fotky.map((f: string, i: number) => `<foto poradie="${i + 1}">${x(f)}</foto>`).join("")}</fotky>
    ${el("virtualna_prehliadka", p.virtualna_prehliadka)}${el("video", p.videa[0])}<videa>${p.videa.map((v: string) => el("video", v)).join("")}</videa>
    <makler>${el("meno", p.makler?.meno)}${el("telefon", p.makler?.telefon)}${el("email", p.makler?.email)}</makler>
    ${el("url", p.url)}${el("upravene", p.upravene)}
  </ponuka>`).join("\n")}
</ponuky>`;
  return new Response(xml, { headers: { ...hl, "Content-Type": "application/xml; charset=utf-8" } });
});
