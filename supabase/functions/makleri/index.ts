// Správa účtov maklérov (vytvorenie účtu, zmena hesla).
// Beží v Supabase s administrátorským kľúčom; volajúceho overuje sama.
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function odpoved(stav: number, telo: unknown) {
  return new Response(JSON.stringify(telo), { status: stav, headers: { ...CORS, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return odpoved(405, { chyba: "Nepovolená metóda." });

  const url = Deno.env.get("SUPABASE_URL")!;
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let telo: Record<string, string>;
  try {
    telo = await req.json();
  } catch {
    return odpoved(400, { chyba: "Neplatná požiadavka." });
  }

  // Kto volá?
  // pri akejkoľvek chybe sa NEberie ako prvé spustenie (bezpečná predvoľba)
  const { data: prve, error: ePrve } = await admin.rpc("je_prve_spustenie");
  const prveSpustenie = !ePrve && prve === true;
  let volajuciJeAdmin = false;
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (token && !prveSpustenie) {
    const { data } = await admin.auth.getUser(token);
    if (data?.user) {
      const { data: m } = await admin.from("makleri").select("rola, aktivny").eq("id", data.user.id).maybeSingle();
      volajuciJeAdmin = !!m && m.aktivny && m.rola === "admin";
    }
  }

  if (telo.akcia === "vytvorit") {
    if (!prveSpustenie && !volajuciJeAdmin) return odpoved(403, { chyba: "Účty maklérov môže vytvárať len administrátor." });
    const email = String(telo.email || "").trim().toLowerCase();
    const heslo = String(telo.heslo || "");
    const meno = String(telo.meno || "").trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return odpoved(400, { chyba: "Zadajte platný email." });
    if (heslo.length < 8) return odpoved(400, { chyba: "Heslo musí mať aspoň 8 znakov." });
    if (!meno) return odpoved(400, { chyba: "Zadajte meno makléra." });

    const { data, error } = await admin.auth.admin.createUser({
      email, password: heslo, email_confirm: true, user_metadata: { meno },
    });
    if (error) {
      const msg = /already/i.test(error.message) ? "Účet s týmto emailom už existuje." : error.message;
      return odpoved(400, { chyba: msg });
    }
    const rola = prveSpustenie ? "admin" : (telo.rola === "admin" ? "admin" : "makler");
    const { error: e2 } = await admin.from("makleri").insert({
      id: data.user!.id, meno, email, rola, aktivny: true, vidi_podhodnotene: rola === "admin",
    });
    if (e2) {
      await admin.auth.admin.deleteUser(data.user!.id);
      return odpoved(500, { chyba: "Účet sa nepodarilo uložiť: " + e2.message });
    }
    return odpoved(200, { ok: true, id: data.user!.id, rola });
  }

  if (telo.akcia === "heslo") {
    if (!volajuciJeAdmin) return odpoved(403, { chyba: "Heslo môže zmeniť len administrátor." });
    const heslo = String(telo.heslo || "");
    if (heslo.length < 8) return odpoved(400, { chyba: "Heslo musí mať aspoň 8 znakov." });
    const { error } = await admin.auth.admin.updateUserById(String(telo.id), { password: heslo });
    if (error) return odpoved(400, { chyba: error.message });
    return odpoved(200, { ok: true });
  }

  return odpoved(400, { chyba: "Neznáma akcia." });
});
