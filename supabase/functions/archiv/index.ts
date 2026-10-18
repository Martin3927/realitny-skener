// Uloží archív inzerátu (popis, parametre, fotky) – volá ho skener.
// Chránené kľúčom skenera v hlavičke x-kluc (overuje sa odtlačok v tabuľke nastavenia).
import { createClient } from "jsr:@supabase/supabase-js@2";

async function sha256(t: string) {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t));
  return Array.from(new Uint8Array(h)).map((x) => x.toString(16).padStart(2, "0")).join("");
}

function b64(s: string) {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Nepovolené", { status: 405 });
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
  const { data: n } = await db.from("nastavenia").select("hodnota").eq("kluc", "skener_kluc_hash").maybeSingle();
  const kluc = req.headers.get("x-kluc") || "";
  if (!n?.hodnota || !kluc || (await sha256(kluc)) !== n.hodnota) return new Response("Nepovolené", { status: 401 });

  let t: { inzerat_id: string; popis?: string; parametre?: Record<string, unknown>; fotky_portal?: string[]; fotky?: string[] };
  try { t = await req.json(); } catch { return Response.json({ ok: false, chyba: "neplatné dáta" }, { status: 400 }); }
  if (!t.inzerat_id) return Response.json({ ok: false, chyba: "chýba inzerat_id" }, { status: 400 });

  const bezpecne = t.inzerat_id.replace(/[^a-zA-Z0-9_-]/g, "_");
  const cesty: string[] = [];
  for (const [i, f] of (t.fotky || []).slice(0, 10).entries()) {
    const cesta = `${bezpecne}/${i + 1}.jpg`;
    const { error } = await db.storage.from("archiv").upload(cesta, b64(f), { contentType: "image/jpeg", upsert: true });
    if (!error) cesty.push(cesta);
  }
  const zaznam: Record<string, unknown> = {
    inzerat_id: t.inzerat_id,
    popis: t.popis ?? null,
    parametre: t.parametre ?? {},
    fotky_portal: (t.fotky_portal || []).slice(0, 30),
    ulozene: new Date().toISOString(),
  };
  if (cesty.length) zaznam.fotky = cesty;
  const { error } = await db.from("archiv").upsert(zaznam);
  if (error) return Response.json({ ok: false, chyba: error.message }, { status: 500 });
  return Response.json({ ok: true, fotky: cesty.length });
});
