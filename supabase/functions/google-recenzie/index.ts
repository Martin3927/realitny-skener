// Google recenzie kancelárie pre web kancelárie (Google Places API).
//  • akcia "nacitat" – administrátor z editora webu kancelárie: nájde firmu podľa odkazu z Google Máp alebo podľa názvu a adresy,
//    načíta hodnotenie, počet recenzií a najnovšie recenzie a uloží ich (nastavenia.kluc = 'google_recenzie')
//  • akcia "obnovit" – verejný web kancelárie bez prihlásenia: ak sú uložené údaje staršie ako 20 hodín, načíta ich znova
//    (raz za 20 hodín, takže návštevníci nemôžu Google zaťažiť ani minúť kredit)
// Kľúč GOOGLE_PLACES_KEY sa zadáva v Supabase → Edge Functions → Secrets (Google Cloud, zapnuté Places API (New)).
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const OBNOVA_MS = 20 * 3600e3;

function sCasom<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error("Google neodpovedá včas.")), ms))]);
}

async function hladaj(kluc: string, text: string) {
  const r = await sCasom(fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": kluc, "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress" },
    body: JSON.stringify({ textQuery: text, languageCode: "sk", regionCode: "SK" }),
  }), 8000);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j as { error?: { message?: string } })?.error?.message || "Google vyhľadávanie neodpovedá.");
  // deno-lint-ignore no-explicit-any
  return ((j as any).places || [])[0] || null;
}

// deno-lint-ignore no-explicit-any
async function detail(kluc: string, id: string): Promise<any> {
  const r = await sCasom(fetch("https://places.googleapis.com/v1/places/" + encodeURIComponent(id) + "?languageCode=sk&regionCode=SK", {
    headers: { "X-Goog-Api-Key": kluc, "X-Goog-FieldMask": "id,displayName,formattedAddress,rating,userRatingCount,googleMapsUri,reviews" },
  }), 8000);
  // deno-lint-ignore no-explicit-any
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error?.message || "Google neodpovedá.");
  // deno-lint-ignore no-explicit-any
  const recenzie = ((j.reviews || []) as any[]).map((x) => ({
    meno: String(x.authorAttribution?.displayName || "Používateľ Google").slice(0, 80),
    foto: /^https:\/\//.test(String(x.authorAttribution?.photoUri || "")) ? String(x.authorAttribution.photoUri) : "",
    profil: /^https:\/\//.test(String(x.authorAttribution?.uri || "")) ? String(x.authorAttribution.uri) : "",
    hodnotenie: Math.max(1, Math.min(5, Math.round(Number(x.rating) || 5))),
    text: String(x.text?.text || x.originalText?.text || "").slice(0, 1500),
    pred: String(x.relativePublishTimeDescription || "").slice(0, 40),
    kedy: String(x.publishTime || "").slice(0, 30),
  })).filter((x) => x.text);
  return {
    place_id: j.id, nazov: j.displayName?.text || "", adresa: j.formattedAddress || "",
    hodnotenie: typeof j.rating === "number" ? Math.round(j.rating * 10) / 10 : null,
    pocet: typeof j.userRatingCount === "number" ? j.userRatingCount : 0,
    url: /^https:\/\//.test(String(j.googleMapsUri || "")) ? j.googleMapsUri : "",
    recenzie, kedy: new Date().toISOString(),
  };
}

// z odkazu na Google Mapy vytiahne názov firmy (aj zo skráteného odkazu maps.app.goo.gl)
async function nazovZOdkazu(odkaz: string) {
  let u = odkaz.trim();
  if (!/^https:\/\/([a-z0-9-]+\.)*(google\.[a-z.]+|goo\.gl|g\.page)\//i.test(u)) return "";
  try {
    const r = await sCasom(fetch(u, { redirect: "follow" }), 6000);
    u = r.url || u;
    await r.body?.cancel();
  } catch { /* použije sa pôvodný odkaz */ }
  const m = u.match(/\/maps\/place\/([^/@?]+)/);
  return m ? decodeURIComponent(m[1].replace(/\+/g, " ")).slice(0, 120) : "";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ chyba: "Nepovolená metóda." }, 405);
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  // deno-lint-ignore no-explicit-any
  let telo: any = {};
  try { telo = await req.json(); } catch { /* prázdne */ }
  const akcia = String(telo.akcia || "");
  const kluc = (Deno.env.get("GOOGLE_PLACES_KEY") || "").trim();
  const { data: riadok } = await db.from("nastavenia").select("hodnota").eq("kluc", "google_recenzie").maybeSingle();
  // deno-lint-ignore no-explicit-any
  let ulozene: any = null;
  try { ulozene = riadok?.hodnota ? JSON.parse(riadok.hodnota) : null; } catch { ulozene = null; }
  const uloz = (o: unknown) => db.from("nastavenia").upsert({ kluc: "google_recenzie", hodnota: JSON.stringify(o) });
  const verejne = (o: Record<string, unknown> | null) => { if (!o) return null; const { place_id: _p, ...x } = o; return x; };

  if (akcia === "obnovit") {
    if (!kluc || !ulozene?.place_id) return json({ ok: true, google: verejne(ulozene) });
    const posledne = Math.max(Date.parse(ulozene.kedy || 0) || 0, Date.parse(ulozene.skusane || 0) || 0);
    if (Date.now() - posledne < OBNOVA_MS) return json({ ok: true, google: verejne(ulozene) });
    await uloz({ ...ulozene, skusane: new Date().toISOString() });
    try {
      const d = await detail(kluc, ulozene.place_id);
      const nove = { ...ulozene, ...d, hladane: ulozene.hladane || "", odkaz: ulozene.odkaz || "" };
      delete nove.skusane;
      await uloz(nove);
      return json({ ok: true, google: verejne(nove) });
    } catch (e) {
      console.error("google-recenzie obnovit:", String((e as Error).message || e).slice(0, 300));
      return json({ ok: true, google: verejne(ulozene) });
    }
  }

  if (akcia === "nacitat" || akcia === "zrusit") {
    const jwt = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    const { data: u } = jwt ? await db.auth.getUser(jwt) : { data: null };
    const id = u?.user?.id;
    if (!id) return json({ chyba: "Prihlás sa v Realitnom týpkovi." }, 401);
    const { data: ja } = await db.from("makleri").select("rola, aktivny").eq("id", id).maybeSingle();
    if (!ja?.aktivny || ja.rola !== "admin") return json({ chyba: "Google recenzie nastavuje administrátor." }, 403);
    if (akcia === "zrusit") { await db.from("nastavenia").delete().eq("kluc", "google_recenzie"); return json({ ok: true, google: null }); }
    if (!kluc) return json({ chyba: "Google recenzie ešte nie sú zapnuté. Treba doplniť kľúč GOOGLE_PLACES_KEY v Supabase (Edge Functions → Secrets).", kluc: false }, 503);
    const odkaz = String(telo.odkaz || "").slice(0, 500);
    const text = String(telo.text || "").replace(/\s+/g, " ").trim().slice(0, 200);
    try {
      let placeId = (odkaz.match(/ChIJ[\w-]{10,}/) || [""])[0];
      let hladane = "";
      if (!placeId) {
        const z = odkaz ? await nazovZOdkazu(odkaz) : "";
        hladane = [z, text].filter(Boolean).join(" ").trim() || text;
        if (!hladane) return json({ chyba: "Vlož odkaz na firmu v Google Mapách alebo doplň názov a adresu kancelárie." }, 400);
        const p = await hladaj(kluc, hladane);
        if (!p?.id) return json({ chyba: "Google firmu nenašiel. Skús odkaz z Google Máp (Zdieľať → Kopírovať odkaz)." }, 404);
        placeId = p.id;
      }
      const d = await detail(kluc, placeId);
      const nove = { ...d, hladane, odkaz };
      await uloz(nove);
      return json({ ok: true, google: verejne(nove) });
    } catch (e) {
      console.error("google-recenzie nacitat:", String((e as Error).message || e).slice(0, 300));
      return json({ chyba: "Google teraz neodpovedá: " + String((e as Error).message || e).slice(0, 200) }, 502);
    }
  }
  return json({ chyba: "Neznáma akcia." }, 400);
});
