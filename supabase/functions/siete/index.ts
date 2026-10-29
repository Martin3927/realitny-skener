// Príspevok ponuky na Facebook a Instagram jedným klikom.
// Aplikácia (prihlásený maklér) → táto funkcia → scenár Make „Realitný týpek – príspevok FB + IG“ → FB stránka a IG účet kancelárie.
// Make po zverejnení zavolá späť (callback) a výsledok sa zapíše k príspevku.
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
  const URL_DB = Deno.env.get("SUPABASE_URL")!;
  const db = createClient(URL_DB, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  let telo: any = {};
  try { telo = await req.json(); } catch { /* nič */ }

  // ---------- spätné hlásenie z Make
  if (telo.callback) {
    if (!telo.kluc || typeof telo.kluc !== "string" || telo.kluc.length < 20) return json({ chyba: "kluc" }, 400);
    const { data: z } = await db.from("prispevky_siete").select("id, vysledok").eq("kluc", telo.kluc).maybeSingle();
    if (!z) return json({ chyba: "nenajdene" }, 404);
    const siet = telo.siet === "ig" ? "ig" : "fb";
    const v = { ...(z.vysledok || {}), [siet]: telo.chyba ? { ok: false, kedy: new Date().toISOString() } : { ok: true, post_id: String(telo.post_id || ""), kedy: new Date().toISOString() } };
    await db.from("prispevky_siete").update({ vysledok: v }).eq("id", z.id);
    return json({ ok: true });
  }

  // ---------- požiadavka z aplikácie
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: u } = await db.auth.getUser(token);
  if (!u?.user) return json({ chyba: "Prihláste sa znova." }, 401);
  const { data: m } = await db.from("makleri").select("id, aktivny, rola, pristup").eq("id", u.user.id).maybeSingle();
  if (!m?.aktivny) return json({ chyba: "Účet nie je aktívny." }, 403);
  // na FB a IG kancelárie zverejňuje administrátor alebo maklér, ktorému to administrátor povolil (Makléri → Môže)
  if (m.rola !== "admin" && !(m.pristup || []).includes("siete")) return json({ chyba: "Na Facebook a Instagram kancelárie zverejňuje administrátor alebo maklér, ktorému to povolí." }, 403);

  const siete: string[] = (Array.isArray(telo.siete) ? telo.siete : []).filter((s: string) => s === "fb" || s === "ig");
  if (!siete.length) return json({ chyba: "Vyberte Facebook alebo Instagram." }, 400);
  const text = String(telo.text || "").trim();
  if (!text) return json({ chyba: "Napíšte text príspevku." }, 400);
  if (text.length > 2200) return json({ chyba: "Text je dlhší ako 2 200 znakov (limit Instagramu)." }, 400);

  const { data: p } = await db.from("nehnutelnosti").select("id, makler_id, stav, fotky").eq("id", Number(telo.ponuka_id)).maybeSingle();
  if (!p) return json({ chyba: "Ponuka neexistuje." }, 404);
  // zverejniť môže len maklér, ktorému ponuka patrí, alebo administrátor
  if (p.makler_id !== m.id && m.rola !== "admin") return json({ chyba: "Zverejniť môžete len svoju ponuku." }, 403);
  if (!["aktivne", "rezervovane"].includes(p.stav)) return json({ chyba: "Zverejniť sa dá len aktívna alebo rezervovaná ponuka." }, 400);

  // fotky: verejné adresy, najviac 10; Instagram berie len pomer strán 4:5 až 1,91:1
  const vybrane: number[] = Array.isArray(telo.fotky) ? telo.fotky.map(Number) : [];
  const vsetky: any[] = Array.isArray(p.fotky) ? p.fotky : [];
  const zoznam = (vybrane.length ? vybrane.map((i) => vsetky[i]).filter(Boolean) : vsetky).slice(0, 10);
  if (!zoznam.length) return json({ chyba: "Ponuka nemá fotky." }, 400);
  const url = (f: any) => f.url || URL_DB + "/storage/v1/object/public/ponuky/" + f.cesta;
  const igFotky = zoznam.filter((f) => !f.w || !f.h || (f.w / f.h >= 0.8 && f.w / f.h <= 1.91));
  if (siete.includes("ig") && !igFotky.length) return json({ chyba: "Instagram neprijme fotky na výšku – vyberte aspoň jednu fotku na šírku alebo štvorcovú." }, 400);

  const kluc = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
  const { data: zaz, error } = await db.from("prispevky_siete").insert({ nehnutelnost_id: p.id, siete, text, makler_id: m.id, kluc, stav: "odoslane" }).select("id").single();
  if (error) return json({ chyba: error.message }, 500);

  const { data: wh } = await db.from("nastavenia").select("hodnota").eq("kluc", "make_siete_webhook").maybeSingle();
  if (!wh?.hodnota) return json({ chyba: "Prepojenie so sociálnymi sieťami nie je nastavené." }, 503);
  const ig = siete.includes("ig") ? igFotky : [];
  const r = await fetch(wh.hodnota, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      kluc, callback: URL_DB + "/functions/v1/siete", text,
      fb: siete.includes("fb"), fb_fotky: zoznam.map((f) => ({ type: "url", url: url(f) })),
      ig: siete.includes("ig"), ig_pocet: ig.length, ig_foto: ig.length ? url(ig[0]) : "",
      ig_subory: ig.map((f) => ({ media_type: "IMAGE", image_url: url(f) })),
    }),
  });
  if (!r.ok) {
    await db.from("prispevky_siete").update({ stav: "chyba" }).eq("id", zaz.id);
    return json({ chyba: "Make neprijal príspevok (" + r.status + "). Skúste to o chvíľu." }, 502);
  }
  return json({ ok: true, zaznam: zaz.id, ig_vynechane: siete.includes("ig") ? zoznam.length - ig.length : 0 });
});
