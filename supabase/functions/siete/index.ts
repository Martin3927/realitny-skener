// Príspevok ponuky na Facebook a Instagram jedným klikom.
// Aplikácia (prihlásený maklér) → táto funkcia →
//  a) kancelária má prepojenie s Meta (Vzhľad → Facebook a Instagram kancelárie, funkcia meta): zverejní priamo cez Graph API,
//  b) inak scenár Make „Realitný týpek – príspevok FB + IG“ (nastavenia_kancelarie.make_siete_webhook).
// Výsledok sa zapíše k príspevku (prispevky_siete.vysledok) – pri Make ho pošle Make späť (callback).
import { createClient } from "jsr:@supabase/supabase-js@2";

const G = "https://graph.facebook.com/v25.0";
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;

// ---------- kľúč stránky je zašifrovaný (rovnako ako vo funkcii meta)
const enc = new TextEncoder();
function zB64(s: string) { const t = atob(s); const a = new Uint8Array(t.length); for (let i = 0; i < t.length; i++) a[i] = t.charCodeAt(i); return a; }
async function desifruj(s: string) {
  const tajne = Deno.env.get("SIETE_KLUC") || Deno.env.get("META_APP_SECRET") || "";
  const [v, iv, c] = String(s || "").split(".");
  if (!tajne || v !== "v1" || !iv || !c) throw new MetaChyba({ code: 190, message: "Kľúč prepojenia sa nedá prečítať." });
  const k = await crypto.subtle.importKey("raw", await crypto.subtle.digest("SHA-256", enc.encode("typek-siete|" + tajne)), "AES-GCM", false, ["decrypt"]);
  try { return new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: zB64(iv) }, k, zB64(c))); }
  catch { throw new MetaChyba({ code: 190, message: "Kľúč prepojenia sa nedá prečítať." }); }
}

// ---------- Graph API
class MetaChyba extends Error {
  code: number; subcode: number;
  constructor(e: { code?: number; error_subcode?: number; message?: string; error_user_msg?: string }) {
    super(String(e.error_user_msg || e.message || "Neznáma chyba Facebooku").slice(0, 300));
    this.code = Number(e.code || 0); this.subcode = Number(e.error_subcode || 0);
  }
}
// deno-lint-ignore no-explicit-any
async function graph(metoda: "GET" | "POST", path: string, params: Record<string, string>): Promise<any> {
  const q = new URLSearchParams(params);
  const r = metoda === "GET" ? await fetch(G + path + "?" + q) : await fetch(G + path, { method: "POST", body: q });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || d.error) throw new MetaChyba(d.error || { message: "Facebook odpovedal " + r.status });
  return d;
}
const cakaj = (ms: number) => new Promise((r) => setTimeout(r, ms));
// prepojenie treba obnoviť (neplatný kľúč, odobraté povolenie)
const zlyKluc = (e: unknown) => e instanceof MetaChyba && (e.code === 190 || e.code === 102 || e.code === 10 || (e.code >= 200 && e.code < 300));
function hlaska(e: unknown) {
  if (zlyKluc(e)) return "Facebook prestal prepojenie prijímať – administrátor ho pripojí znova vo Vzhľade (Facebook a Instagram kancelárie).";
  return String((e as Error)?.message || e).slice(0, 300);
}

async function naFacebook(stranka: string, kluc: string, text: string, fotky: string[]) {
  // fotky najprv nahrať nezverejnené, potom jeden príspevok so všetkými
  const id: string[] = await Promise.all(fotky.map((url) => graph("POST", "/" + stranka + "/photos", { url, published: "false", access_token: kluc }).then((d) => String(d.id))));
  const p: Record<string, string> = { message: text, access_token: kluc };
  id.forEach((x, i) => { p["attached_media[" + i + "]"] = JSON.stringify({ media_fbid: x }); });
  return String((await graph("POST", "/" + stranka + "/feed", p)).id || "");
}
async function hotovyKontajner(id: string, kluc: string) {
  for (let i = 0; i < 20; i++) {
    const d = await graph("GET", "/" + id, { fields: "status_code", access_token: kluc });
    if (d.status_code === "FINISHED") return;
    if (d.status_code === "ERROR" || d.status_code === "EXPIRED") throw new MetaChyba({ message: "Instagram fotku nespracoval (" + d.status_code + ")." });
    await cakaj(1500);
  }
  throw new MetaChyba({ message: "Instagram fotky nespracoval včas – skúste to znova." });
}
async function naInstagram(ig: string, kluc: string, text: string, fotky: string[]) {
  let kontajner: string;
  if (fotky.length === 1) {
    kontajner = String((await graph("POST", "/" + ig + "/media", { image_url: fotky[0], caption: text, access_token: kluc })).id);
  } else {
    const deti: string[] = await Promise.all(fotky.map((url) => graph("POST", "/" + ig + "/media", { image_url: url, is_carousel_item: "true", access_token: kluc }).then((d) => String(d.id))));
    for (const d of deti) await hotovyKontajner(d, kluc);
    kontajner = String((await graph("POST", "/" + ig + "/media", { media_type: "CAROUSEL", children: deti.join(","), caption: text, access_token: kluc })).id);
  }
  await hotovyKontajner(kontajner, kluc);
  return String((await graph("POST", "/" + ig + "/media_publish", { creation_id: kontajner, access_token: kluc })).id || "");
}

// kancelária volajúceho: hlavný správca v režime podpory pracuje v kancelárii, do ktorej je prepnutý
// deno-lint-ignore no-explicit-any
async function kancelariaVolajuceho(db: any, userId: string, vlastna: number) {
  const { data: hs } = await db.from("hlavni_spravcovia").select("user_id").eq("user_id", userId).maybeSingle();
  if (!hs) return vlastna;
  const { data: pod } = await db.from("spravca_podpora").select("kancelaria_id").eq("user_id", userId).maybeSingle();
  return Number(pod?.kancelaria_id || vlastna);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
  const URL_DB = Deno.env.get("SUPABASE_URL")!;
  const db = createClient(URL_DB, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  // deno-lint-ignore no-explicit-any
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
  const { data: m } = await db.from("makleri").select("id, aktivny, rola, pristup, kancelaria_id").eq("id", u.user.id).maybeSingle();
  if (!m?.aktivny) return json({ chyba: "Účet nie je aktívny." }, 403);
  // na FB a IG kancelárie zverejňuje administrátor alebo maklér, ktorému to administrátor povolil (Makléri → Môže)
  if (m.rola !== "admin" && !(m.pristup || []).includes("siete")) return json({ chyba: "Na Facebook a Instagram kancelárie zverejňuje administrátor alebo maklér, ktorému to povolí." }, 403);

  const siete: string[] = (Array.isArray(telo.siete) ? telo.siete : []).filter((s: string) => s === "fb" || s === "ig");
  if (!siete.length) return json({ chyba: "Vyberte Facebook alebo Instagram." }, 400);
  const text = String(telo.text || "").trim();
  if (!text) return json({ chyba: "Napíšte text príspevku." }, 400);
  if (text.length > 2200) return json({ chyba: "Text je dlhší ako 2 200 znakov (limit Instagramu)." }, 400);

  const { data: p } = await db.from("nehnutelnosti").select("id, makler_id, stav, fotky, kancelaria_id").eq("id", Number(telo.ponuka_id)).maybeSingle();
  // ponuka inej kancelárie sa tvári ako neexistujúca
  if (!p || p.kancelaria_id !== await kancelariaVolajuceho(db, m.id, m.kancelaria_id)) return json({ chyba: "Ponuka neexistuje." }, 404);
  // zverejniť môže len maklér, ktorému ponuka patrí, alebo administrátor
  if (p.makler_id !== m.id && m.rola !== "admin") return json({ chyba: "Zverejniť môžete len svoju ponuku." }, 403);
  if (!["aktivne", "rezervovane"].includes(p.stav)) return json({ chyba: "Zverejniť sa dá len aktívna alebo rezervovaná ponuka." }, 400);

  // fotky: verejné adresy, najviac 10; Instagram berie len pomer strán 4:5 až 1,91:1
  const vybrane: number[] = Array.isArray(telo.fotky) ? telo.fotky.map(Number) : [];
  // deno-lint-ignore no-explicit-any
  const vsetky: any[] = Array.isArray(p.fotky) ? p.fotky : [];
  const zoznam = (vybrane.length ? vybrane.map((i) => vsetky[i]).filter(Boolean) : vsetky).slice(0, 10);
  if (!zoznam.length) return json({ chyba: "Ponuka nemá fotky." }, 400);
  // deno-lint-ignore no-explicit-any
  const url = (f: any) => f.url || URL_DB + "/storage/v1/object/public/ponuky/" + f.cesta;
  const igFotky = zoznam.filter((f) => !f.w || !f.h || (f.w / f.h >= 0.8 && f.w / f.h <= 1.91));
  if (siete.includes("ig") && !igFotky.length) return json({ chyba: "Instagram neprijme fotky na výšku – vyberte aspoň jednu fotku na šírku alebo štvorcovú." }, 400);
  const ig = siete.includes("ig") ? igFotky : [];

  // kade pôjde príspevok: priame prepojenie s Meta má prednosť, inak Make
  const { data: pp } = await db.from("siete_prepojenia").select("*").eq("kancelaria_id", p.kancelaria_id).maybeSingle();
  let webhook = "";
  if (!pp) {
    const { data: wh } = await db.from("nastavenia_kancelarie").select("hodnota").eq("kancelaria_id", p.kancelaria_id).eq("kluc", "make_siete_webhook").maybeSingle();
    webhook = String(wh?.hodnota || "");
    if (!webhook) return json({ chyba: "Facebook a Instagram kancelárie ešte nie sú pripojené – administrátor ich pripojí vo Vzhľade (Facebook a Instagram kancelárie)." }, 503);
  } else if (siete.includes("ig") && !pp.ig_id) {
    return json({ chyba: "Stránka „" + (pp.fb_page_nazov || "kancelárie") + "“ nemá prepojený Instagram. Prepojte ho vo Facebooku (stránka → Prepojené účty) a vo Vzhľade pripojte Facebook znova – alebo zverejnite len na Facebook." }, 400);
  }

  const kluc = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
  const { data: zaz, error } = await db.from("prispevky_siete").insert({ nehnutelnost_id: p.id, siete, text, makler_id: m.id, kluc, stav: "odoslane" }).select("id").single();
  if (error) return json({ chyba: error.message }, 500);

  // ---------- a) priamo cez Meta – zverejní sa na pozadí, aplikácia si výsledok prečíta z prispevky_siete
  if (pp) {
    const praca = (async () => {
      const kedy = () => new Date().toISOString();
      const vysledok: Record<string, unknown> = {};
      let zly = false;
      const zapis = (s: string) => (id: string) => { vysledok[s] = { ok: true, post_id: id, kedy: kedy() }; };
      const chyba = (s: string) => (e: unknown) => {
        if (zlyKluc(e)) zly = true;
        console.error("siete-" + s, (e as MetaChyba)?.code, String((e as Error)?.message || e).slice(0, 200));
        vysledok[s] = { ok: false, chyba: hlaska(e), kedy: kedy() };
      };
      try {
        const kl = await desifruj(pp.fb_page_token);
        await Promise.all([
          siete.includes("fb") ? naFacebook(pp.fb_page_id, kl, text, zoznam.map(url)).then(zapis("fb"), chyba("fb")) : null,
          ig.length ? naInstagram(pp.ig_id, kl, text, ig.map(url)).then(zapis("ig"), chyba("ig")) : null,
        ]);
      } catch (e) { siete.forEach((s) => chyba(s)(e)); }
      await db.from("prispevky_siete").update({ vysledok, stav: Object.values(vysledok).some((v) => (v as { ok: boolean }).ok) ? "odoslane" : "chyba" }).eq("id", zaz.id);
      // prepojenie prestalo platiť → zapísať a raz upozorniť administrátorov kancelárie (zvonček)
      if (zly && !pp.chyba) {
        await db.from("siete_prepojenia").update({ chyba: "Facebook prestal prepojenie prijímať.", chyba_kedy: kedy() }).eq("kancelaria_id", p.kancelaria_id);
        await db.rpc("_oznam_adminom", { p_text: "📣 Facebook a Instagram kancelárie treba pripojiť znova – Facebook prestal prepojenie prijímať (napríklad po zmene hesla alebo odobratí roly na stránke). Vzhľad → Facebook a Instagram kancelárie → Pripojiť znova.", p_kancelaria: p.kancelaria_id });
      }
    })();
    if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(praca); else await praca;
    return json({ ok: true, zaznam: zaz.id, ig_vynechane: siete.includes("ig") ? zoznam.length - ig.length : 0, cez: "meta" });
  }

  // ---------- b) cez Make
  const r = await fetch(webhook, {
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
  return json({ ok: true, zaznam: zaz.id, ig_vynechane: siete.includes("ig") ? zoznam.length - ig.length : 0, cez: "make" });
});
