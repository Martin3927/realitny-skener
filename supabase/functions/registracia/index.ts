// Samoregistrácia na skúšobnú dobu z odkazu v e-maile (stránka registracia.html).
//   akcia "nacitaj"  { t }                                          → údaje z objednávky (e-mail, meno, balík, okresy)
//   akcia "dokoncit" { t, meno, telefon, nazov, okresy[], heslo }   → účet, kancelária, skúšobná doba 14 dní
// Odkaz (t) je náhodný reťazec z e-mailu; v databáze je len jeho odtlačok (sha256), platí 7 dní a len raz.
// Beží so service role, volajúci sa overuje odkazom.
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const odpoved = (stav: number, telo: unknown) =>
  new Response(JSON.stringify(telo), { status: stav, headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" } });

const NAZVY: Record<string, string> = {
  skener: "Realitný skener", web: "Osobný web", kancelaria: "Kancelária komplet", ponuky: "Správa ponúk",
  klienti_aml: "Klienti a AML", dokumenty: "Dokumenty", emailing: "Emailing", ai: "AI", pracovny_email: "Pracovný e-mail",
};
const CHYBY: Record<string, string> = {
  neplatny_odkaz: "Odkaz už neplatí. Mohol byť použitý alebo mu vypršala platnosť – napíš nám na info@realitnytypek.sk a pošleme ti nový.",
  meno: "Napíš meno a priezvisko.",
  telefon: "Napíš telefónne číslo (aspoň 9 číslic).",
  okresy: "Vyber aspoň jeden okres pre skener.",
  okresy_max: "Počas skúšobnej doby môžeš mať najviac 3 okresy.",
};

async function sha256(t: string) {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t));
  return Array.from(new Uint8Array(h)).map((x) => x.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return odpoved(405, { chyba: "Nepovolená metóda." });
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  // deno-lint-ignore no-explicit-any
  let telo: any = {};
  try { telo = await req.json(); } catch { return odpoved(400, { chyba: "Neplatná požiadavka." }); }

  const t = String(telo.t || "");
  if (!/^[0-9a-f]{64}$/.test(t)) return odpoved(400, { chyba: CHYBY.neplatny_odkaz });
  const hash = await sha256(t);
  const { data: z } = await db.from("zakaznici")
    .select("id, typ, nazov, email, kontakt_meno, telefon, moduly, okresy, stav, registracia_do, registrovany")
    .eq("registracia_hash", hash).maybeSingle();
  const platny = z && !z.registrovany && z.registracia_do && new Date(z.registracia_do).getTime() > Date.now() &&
    !["vlastna", "zruseny"].includes(z.stav);
  if (!platny) return odpoved(410, { chyba: CHYBY.neplatny_odkaz });
  const moduly: string[] = Array.isArray(z.moduly) ? z.moduly : [];

  if (telo.akcia === "nacitaj") {
    return odpoved(200, {
      ok: true, email: z.email, typ: z.typ, meno: z.kontakt_meno || "", telefon: z.telefon || "",
      nazov: z.typ === "kancelaria" && z.nazov !== z.email ? z.nazov : "",
      balik: moduly.map((m) => NAZVY[m] || m), skener: moduly.includes("skener"),
      okresy: (Array.isArray(z.okresy) ? z.okresy : []).slice(0, 3), max_okresov: 3, dni: 14,
    });
  }

  if (telo.akcia === "dokoncit") {
    const heslo = String(telo.heslo || "");
    if (heslo.length < 8) return odpoved(400, { chyba: "Heslo musí mať aspoň 8 znakov." });
    if (heslo.length > 72) return odpoved(400, { chyba: "Heslo môže mať najviac 72 znakov." });
    const meno = String(telo.meno || "").trim().slice(0, 120);
    const telefon = String(telo.telefon || "").trim().slice(0, 30);
    const nazov = String(telo.nazov || "").trim().slice(0, 160);
    const okresy = (Array.isArray(telo.okresy) ? telo.okresy : []).map((x: unknown) => String(x).trim()).filter(Boolean).slice(0, 10);
    if (meno.length < 3) return odpoved(400, { chyba: CHYBY.meno });
    if (telefon.replace(/\D/g, "").length < 9) return odpoved(400, { chyba: CHYBY.telefon });
    if (moduly.includes("skener") && !okresy.length) return odpoved(400, { chyba: CHYBY.okresy });
    if (moduly.includes("skener") && new Set(okresy).size > 3) return odpoved(400, { chyba: CHYBY.okresy_max });
    if (z.typ === "kancelaria" && !nazov) return odpoved(400, { chyba: "Napíš názov realitnej kancelárie." });

    const email = String(z.email || "").trim().toLowerCase();
    const { data: u, error: eU } = await db.auth.admin.createUser({ email, password: heslo, email_confirm: true, user_metadata: { meno } });
    if (eU || !u?.user) {
      const uz = /already|registered|exists/i.test(eU?.message || "");
      return odpoved(uz ? 409 : 500, {
        chyba: uz ? "Tento e-mail už má účet v Realitnom týpkovi. Prihlás sa svojím heslom."
                  : "Účet sa nepodarilo vytvoriť. Skús to o chvíľu znova.",
        prihlasit: uz,
      });
    }
    const { data: r, error } = await db.rpc("_registracia_dokoncit", {
      p_hash: hash, p_user: u.user.id, p_meno: meno, p_telefon: telefon, p_nazov: nazov, p_okresy: okresy,
    });
    if (error) {
      await db.auth.admin.deleteUser(u.user.id);
      const kod = Object.prototype.hasOwnProperty.call(CHYBY, String(error.message || "").trim()) ? String(error.message).trim() : "";
      if (!kod) console.error("registracia:", String(error.message || "").slice(0, 300));
      return odpoved(kod ? 400 : 500, { chyba: kod ? CHYBY[kod] : "Registráciu sa nepodarilo dokončiť. Skús to o chvíľu znova." });
    }
    return odpoved(200, { ok: true, email, skusobna_do: r?.skusobna_do });
  }

  return odpoved(400, { chyba: "Neznáma akcia." });
});
