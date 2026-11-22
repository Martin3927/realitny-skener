// Správa účtov maklérov (vytvorenie účtu, zmena hesla, zabudnuté heslo e-mailom).
// Beží v Supabase s administrátorským kľúčom; volajúceho overuje sama.
// Kancelárie: administrátor pracuje len s maklérmi svojej (aktívnej) kancelárie; nový maklér dostane jeho kanceláriu.
// Hlavný správca Týpka môže založiť účet aj do inej kancelárie (telo.kancelaria – prvý správca novej kancelárie).
import { createClient } from "jsr:@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6.9.16";

const APP_URL = Deno.env.get("APP_URL") || "https://app.realitnytypek.sk/";

function esc(s: unknown) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

// E-mail rovnako ako vo funkcii pripomienky: Brevo (BREVO_API_KEY) alebo SMTP cez port 465.
async function posli(komu: string, predmet: string, html: string) {
  const od = Deno.env.get("EMAIL_FROM") || Deno.env.get("SMTP_USER") || "";
  const brevo = Deno.env.get("BREVO_API_KEY");
  if (brevo) {
    const r = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": brevo, "Content-Type": "application/json", accept: "application/json" },
      body: JSON.stringify({ sender: { name: "Realitný týpek", email: od }, to: [{ email: komu }], subject: predmet, htmlContent: html }),
    });
    if (!r.ok) throw new Error("Brevo " + r.status + ": " + (await r.text()).slice(0, 200));
    return;
  }
  const host = Deno.env.get("SMTP_HOST");
  if (!host) throw new Error("Email nie je nastavený");
  const t = nodemailer.createTransport({
    host, port: Number(Deno.env.get("SMTP_PORT") || 465), secure: (Deno.env.get("SMTP_SECURE") ?? "true") !== "false",
    auth: { user: Deno.env.get("SMTP_USER"), pass: Deno.env.get("SMTP_PASS") },
  });
  await t.sendMail({ from: { name: "Realitný týpek", address: od }, to: komu, subject: predmet, html });
}

const PRVY_ADMIN = "augustinak@alphareality.sk";

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

  // Zabudnuté heslo: odkaz na nové heslo e-mailom. Volá sa bez prihlásenia, preto:
  //  • odpoveď je vždy rovnaká (nedá sa zistiť, či účet s e-mailom existuje),
  //  • najviac 3 žiadosti za hodinu na jeden e-mail a 10 z jednej adresy,
  //  • odkaz je jednorazový a platí 1 hodinu (overuje ho prihlasovanie Supabase); heslo sa mení až po jeho otvorení.
  if (telo.akcia === "zabudnute") {
    const email = String(telo.email || "").trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 200) return odpoved(400, { chyba: "Zadajte platný email." });
    const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim().slice(0, 60);
    const hodina = new Date(Date.now() - 3600e3).toISOString();
    await admin.from("obnova_hesla_pokusy").delete().lt("cas", new Date(Date.now() - 864e5).toISOString());
    const { count: naEmail } = await admin.from("obnova_hesla_pokusy").select("id", { count: "exact", head: true }).eq("email", email).gt("cas", hodina);
    const { count: zAdresy } = ip
      ? await admin.from("obnova_hesla_pokusy").select("id", { count: "exact", head: true }).eq("ip", ip).gt("cas", hodina)
      : { count: 0 };
    await admin.from("obnova_hesla_pokusy").insert({ email, ip: ip || null });
    if ((naEmail ?? 0) >= 3 || (zAdresy ?? 0) >= 10) return odpoved(200, { ok: true });
    const praca = (async () => {
      const { data: m } = await admin.from("makleri").select("meno, aktivny").eq("email", email).maybeSingle();
      if (!m || !m.aktivny) return;
      const { data, error } = await admin.auth.admin.generateLink({ type: "recovery", email });
      const kluc = data?.properties?.hashed_token;
      if (error || !kluc) { console.error("obnova-hesla", error?.message || "bez odkazu"); return; }
      const odkaz = APP_URL + "#obnova=" + encodeURIComponent(kluc);
      const html = `<div style="font-family:Arial,sans-serif;max-width:560px;color:#23272e">
        <div style="border-bottom:3px solid #dab967;padding-bottom:8px;font-size:18px"><b>🔑 Nové heslo do Realitného týpka</b></div>
        <p style="font-size:16px;margin:16px 0 0">Dobrý deň${m.meno ? ", " + esc(String(m.meno).split(" ")[0]) : ""},</p>
        <p style="margin:10px 0 0">požiadali ste o nové heslo. Kliknite na tlačidlo a nastavte si ho. Odkaz platí 1 hodinu a dá sa použiť len raz.</p>
        <p style="margin:22px 0"><a href="${esc(odkaz)}" style="background:#dab967;color:#1f2a37;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:700">Nastaviť nové heslo</a></p>
        <p style="color:#666;font-size:13px">Ak ste o nové heslo nežiadali, tento e-mail si nevšímajte – vaše heslo ostáva bez zmeny.</p>
        <p style="color:#999;font-size:12px">Realitný týpek</p></div>`;
      await posli(email, "🔑 Nové heslo do Realitného týpka", html);
    })().catch((e) => console.error("obnova-hesla", String((e as Error).message || e).slice(0, 200)));
    // e-mail sa odosiela na pozadí, aby čas odpovede neprezradil, či účet existuje
    // deno-lint-ignore no-explicit-any
    const er = (globalThis as any).EdgeRuntime;
    if (er?.waitUntil) er.waitUntil(praca); else await praca;
    return odpoved(200, { ok: true });
  }

  // Kto volá?
  // pri akejkoľvek chybe sa NEberie ako prvé spustenie (bezpečná predvoľba)
  const { data: prve, error: ePrve } = await admin.rpc("je_prve_spustenie");
  const prveSpustenie = !ePrve && prve === true;
  let volajuciJeAdmin = false, hlavnySpravca = false;
  let kancelaria: number | null = null;   // aktívna kancelária volajúceho (v režime podpory zvolená)
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (token && !prveSpustenie) {
    const { data } = await admin.auth.getUser(token);
    if (data?.user) {
      const { data: m } = await admin.from("makleri").select("rola, aktivny, kancelaria_id").eq("id", data.user.id).maybeSingle();
      volajuciJeAdmin = !!m && m.aktivny && m.rola === "admin";
      kancelaria = m?.kancelaria_id ?? null;
      const { data: h } = await admin.from("hlavni_spravcovia").select("user_id").eq("user_id", data.user.id).maybeSingle();
      hlavnySpravca = !!h && volajuciJeAdmin;
      if (hlavnySpravca) {
        const { data: pod } = await admin.from("spravca_podpora").select("kancelaria_id").eq("user_id", data.user.id).maybeSingle();
        if (pod?.kancelaria_id) kancelaria = pod.kancelaria_id;
      }
    }
  }

  if (telo.akcia === "vytvorit") {
    if (!prveSpustenie && !volajuciJeAdmin) return odpoved(403, { chyba: "Účty maklérov môže vytvárať len administrátor." });
    if (!prveSpustenie && !kancelaria) return odpoved(403, { chyba: "Váš účet nemá kanceláriu." });
    // samostatný maklér (kancelária typu „makler“) si kolegov nepridáva – len hlavný správca Týpka
    if (!prveSpustenie && !hlavnySpravca) {
      const { data: k } = await admin.from("kancelarie").select("typ").eq("id", kancelaria).maybeSingle();
      if (k?.typ === "makler") return odpoved(403, { chyba: "Samostatný maklér si kolegov nepridáva. Pre tím si objednajte balík pre realitnú kanceláriu." });
    }
    const email = String(telo.email || "").trim().toLowerCase();
    const heslo = String(telo.heslo || "");
    const meno = String(telo.meno || "").trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return odpoved(400, { chyba: "Zadajte platný email." });
    if (heslo.length < 8) return odpoved(400, { chyba: "Heslo musí mať aspoň 8 znakov." });
    if (!meno) return odpoved(400, { chyba: "Zadajte meno makléra." });
    // prvý (administrátorský) účet si môže založiť len majiteľ kancelárie
    if (prveSpustenie && email !== PRVY_ADMIN) {
      return odpoved(403, { chyba: "Účet administrátora sa dá vytvoriť len pre email " + PRVY_ADMIN + "." });
    }

    const { data, error } = await admin.auth.admin.createUser({
      email, password: heslo, email_confirm: true, user_metadata: { meno },
    });
    if (error) {
      const msg = /already/i.test(error.message) ? "Účet s týmto emailom už existuje." : error.message;
      return odpoved(400, { chyba: msg });
    }
    const rola = prveSpustenie ? "admin" : (telo.rola === "admin" ? "admin" : "makler");
    const doKancelarie = prveSpustenie ? 1 : (hlavnySpravca && Number(telo.kancelaria) > 0 ? Number(telo.kancelaria) : kancelaria);
    const { error: e2 } = await admin.from("makleri").insert({
      id: data.user!.id, meno, email, rola, aktivny: true, vidi_podhodnotene: rola === "admin", kancelaria_id: doKancelarie,
    });
    if (e2) {
      await admin.auth.admin.deleteUser(data.user!.id);
      return odpoved(500, { chyba: "Účet sa nepodarilo uložiť: " + e2.message });
    }
    return odpoved(200, { ok: true, id: data.user!.id, rola });
  }

  if (telo.akcia === "heslo") {
    if (!volajuciJeAdmin) return odpoved(403, { chyba: "Heslo môže zmeniť len administrátor." });
    const { data: ciel } = await admin.from("makleri").select("kancelaria_id").eq("id", String(telo.id)).maybeSingle();
    if (!ciel || ciel.kancelaria_id !== kancelaria) return odpoved(403, { chyba: "Heslo môžete zmeniť len maklérovi svojej kancelárie." });
    // účet hlavného správcu Týpka: heslo mu mení len hlavný správca (nie iný administrátor tej istej kancelárie);
    // pri chybe čítania sa heslo nemení (bezpečná predvoľba)
    const { data: cielHlavny, error: eHlavny } = await admin.from("hlavni_spravcovia").select("user_id").eq("user_id", String(telo.id)).maybeSingle();
    if (eHlavny) return odpoved(500, { chyba: "Heslo sa nepodarilo zmeniť, skúste to znova." });
    if (cielHlavny && !hlavnySpravca) return odpoved(403, { chyba: "Heslo hlavného správcu môže zmeniť len hlavný správca." });
    const heslo = String(telo.heslo || "");
    if (heslo.length < 8) return odpoved(400, { chyba: "Heslo musí mať aspoň 8 znakov." });
    const { error } = await admin.auth.admin.updateUserById(String(telo.id), { password: heslo });
    if (error) return odpoved(400, { chyba: error.message });
    return odpoved(200, { ok: true });
  }

  return odpoved(400, { chyba: "Neznáma akcia." });
});
