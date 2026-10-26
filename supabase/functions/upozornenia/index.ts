// Upozornenia do mobilu (Web Push) na novú správu v chate a nový kontakt z webu.
// Databáza ich zaradí do push_fronta a hneď zavolá túto funkciu (záložne aj každú minútu cez pg_cron).
// Chránená tajným kľúčom v hlavičke x-kluc (rovnaký ako pri pripomienkach). Nové inzeráty posiela skener.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { type Odber, posli, vapid } from "./webpush.ts";

const KONTAKT = "https://app.realitnytypek.sk";

async function sha256(t: string) {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t));
  return Array.from(new Uint8Array(h)).map((x) => x.toString(16).padStart(2, "0")).join("");
}

type Polozka = { id: number; sprava: Record<string, unknown>; odbery: Odber[] };

Deno.serve(async (req) => {
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
  const { data: n } = await db.from("nastavenia").select("hodnota").eq("kluc", "pripomienky_kluc_hash").maybeSingle();
  const kluc = req.headers.get("x-kluc") || "";
  if (!n?.hodnota || !kluc || (await sha256(kluc)) !== n.hodnota) return new Response("Nepovolené", { status: 401 });

  const { data, error } = await db.rpc("_push_na_odoslanie", { p_limit: 200 });
  if (error) return Response.json({ ok: false, chyba: error.message }, { status: 500 });
  const zoz = ((data?.spravy as Polozka[]) || []).filter((p) => p.odbery?.length);
  if (!zoz.length) return Response.json({ ok: true, odoslane: 0 });
  if (!data?.vapid?.public || !data?.vapid?.private) return Response.json({ ok: false, chyba: "chýbajú kľúče VAPID" }, { status: 500 });

  const v = await vapid(data.vapid.public, data.vapid.private, KONTAKT);
  const ok: number[] = [], zrusit: number[] = [], chyby: string[] = [];
  await Promise.all(zoz.flatMap((p) => p.odbery.map(async (o) => {
    try {
      const stav = await posli(o, p.sprava, v, 3600);
      if (stav >= 200 && stav < 300) ok.push(o.id);
      else if (stav === 404 || stav === 410) zrusit.push(o.id);   // telefón odber zrušil
      else chyby.push(String(stav));
    } catch (e) {
      chyby.push(String((e as Error).message || e).slice(0, 120));
    }
  })));
  await db.rpc("_push_vysledok", { p_ok: [...new Set(ok)], p_zrusit: [...new Set(zrusit)] });
  return Response.json({ ok: true, spravy: zoz.length, odoslane: ok.length, zrusene: zrusit.length, chyby: chyby.slice(0, 10) });
});
