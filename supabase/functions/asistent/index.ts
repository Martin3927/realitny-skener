// AI asistent pre maklérov (Claude). Kľúč ANTHROPIC_API_KEY sa zadáva v nastaveniach Supabase (Edge Functions → Secrets).
// Volá ju aplikácia s prihlásením makléra; overí sa, že je aktívny a má prístup k sekcii AI asistent.
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const SYSTEM = `Si AI asistent realitnej kancelárie Alpha Reality (okresy Spišská Nová Ves a Levoča, Slovensko).
Pomáhaš maklérom: popisy nehnuteľností, príspevky na sociálne siete, emaily a SMS klientom a majiteľom, odpovede na námietky, rady k predaju.
Píš po slovensky, priateľsky a profesionálne, bez zbytočných anglicizmov a bez prehnane formálnych fráz.
Nevymýšľaj fakty o nehnuteľnosti, ktoré nemáš – ak chýbajú, nechaj [doplniť]. Pri právnych a daňových otázkach upozorni, že nejde o právnu radu.
Odpovedaj stručne a prakticky; text na skopírovanie oddeľ, aby sa dal hneď použiť.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
  const kluc = Deno.env.get("ANTHROPIC_API_KEY");
  if (!kluc) return json({ chyba: "AI asistent ešte nie je zapnutý – administrátor musí doplniť kľúč ANTHROPIC_API_KEY v nastaveniach Supabase." }, 503);
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: u } = await db.auth.getUser(token);
  if (!u?.user) return json({ chyba: "Prihláste sa znova." }, 401);
  const { data: m } = await db.from("makleri").select("meno, aktivny, rola, pristup").eq("id", u.user.id).maybeSingle();
  if (!m?.aktivny || (m.rola !== "admin" && !(m.pristup || []).includes("asistent"))) return json({ chyba: "Nemáte prístup k AI asistentovi." }, 403);
  let telo: { spravy?: { role: string; content: string }[]; kontext?: string } = {};
  try { telo = await req.json(); } catch { /* nič */ }
  const spravy = (telo.spravy || []).filter((x) => (x.role === "user" || x.role === "assistant") && typeof x.content === "string")
    .slice(-12).map((x) => ({ role: x.role, content: x.content.slice(0, 8000) }));
  if (!spravy.length || spravy[spravy.length - 1].role !== "user") return json({ chyba: "Napíšte otázku." }, 400);
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": kluc, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: Deno.env.get("AI_MODEL") || "claude-sonnet-5-5", max_tokens: 1500,
      system: SYSTEM + "\nPíšeš pre makléra: " + m.meno + "." + (telo.kontext ? "\n\nPodklady (údaje z Realitného týpka):\n" + String(telo.kontext).slice(0, 6000) : ""),
      messages: spravy,
    }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) return json({ chyba: "AI asistent teraz neodpovedá (" + r.status + "). Skúste to o chvíľu." }, 502);
  // deno-lint-ignore no-explicit-any
  const text = ((d.content as any[]) || []).filter((c) => c.type === "text").map((c) => c.text).join("\n").trim();
  return json({ text });
});
