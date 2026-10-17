// Odošle emaily k pripomienkam, ktorým nastal čas.
// Volá ju databáza každú minútu (pg_cron); chránená tajným kľúčom v hlavičke x-kluc.
// Email: Brevo (BREVO_API_KEY) alebo SMTP cez port 465 (SMTP_HOST, SMTP_USER, SMTP_PASS).
import { createClient } from "jsr:@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6.9.16";

const APP_URL = Deno.env.get("APP_URL") || "https://martin3927.github.io/realitny-skener/";

function esc(s: unknown) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

function casSk(iso: string) {
  return new Date(iso).toLocaleString("sk-SK", {
    timeZone: "Europe/Bratislava", day: "numeric", month: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

async function posli(komu: string, predmet: string, html: string) {
  const od = Deno.env.get("EMAIL_FROM") || Deno.env.get("SMTP_USER") || "";
  const odMeno = "Realitný skener Alpha Reality";
  const brevo = Deno.env.get("BREVO_API_KEY");
  if (brevo) {
    const r = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": brevo, "Content-Type": "application/json", accept: "application/json" },
      body: JSON.stringify({ sender: { name: odMeno, email: od }, to: [{ email: komu }], subject: predmet, htmlContent: html }),
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
  await t.sendMail({ from: `"${odMeno}" <${od}>`, to: komu, subject: predmet, html });
}

async function sha256(t: string) {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t));
  return Array.from(new Uint8Array(h)).map((x) => x.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
  // overenie volajúceho: odtlačok kľúča je v tabuľke nastavenia
  const { data: n } = await db.from("nastavenia").select("hodnota").eq("kluc", "pripomienky_kluc_hash").maybeSingle();
  const kluc = req.headers.get("x-kluc") || "";
  if (!n?.hodnota || !kluc || (await sha256(kluc)) !== n.hodnota) {
    return new Response("Nepovolené", { status: 401 });
  }
  if (!Deno.env.get("BREVO_API_KEY") && !Deno.env.get("SMTP_HOST")) {
    return Response.json({ ok: true, odoslane: 0, info: "email nie je nastavený" });
  }

  // zaberieme pripomienky (aby sa ten istý email neposlal dvakrát)
  const { data: rows, error } = await db.from("pripomienky")
    .update({ email_odoslany: new Date().toISOString() })
    .is("hotovo", null).is("zrusena", null).is("email_odoslany", null)
    .lte("cas", new Date().toISOString())
    .select("id, makler_id, inzerat_id, schrankovanie_id, cas, poznamka");
  if (error) return Response.json({ ok: false, chyba: error.message }, { status: 500 });

  let odoslane = 0;
  for (const p of rows ?? []) {
    try {
      const { data: m } = await db.from("makleri").select("meno, email, aktivny").eq("id", p.makler_id).maybeSingle();
      if (!m?.email || !m.aktivny) throw new Error("maklér nemá email alebo je neaktívny");
      let suvis = "";
      if (p.inzerat_id) {
        const { data: z } = await db.from("inzeraty").select("nazov, url, obec, cena").eq("id", p.inzerat_id).maybeSingle();
        if (z) {
          suvis = `<p style="margin:14px 0 0"><b>Inzerát:</b> <a href="${esc(z.url)}">${esc(z.nazov)}</a>` +
            `${z.obec ? " · " + esc(z.obec) : ""}${z.cena ? " · " + Number(z.cena).toLocaleString("sk-SK") + " €" : ""}</p>`;
        }
      }
      if (p.schrankovanie_id) {
        const { data: s } = await db.from("schrankovanie").select("lokalita, telefon, typ").eq("id", p.schrankovanie_id).maybeSingle();
        if (s) suvis = `<p style="margin:14px 0 0"><b>Schránkovanie:</b> ${esc(s.lokalita)}${s.telefon ? " · tel. " + esc(s.telefon) : ""}</p>`;
      }
      const html = `<div style="font-family:Arial,sans-serif;max-width:560px;color:#23272e">
        <div style="border-bottom:3px solid #dab967;padding-bottom:8px;font-size:18px"><b>🔔 Pripomienka</b>
        <span style="color:#888;font-size:14px"> · ${esc(casSk(p.cas))}</span></div>
        <p style="font-size:16px;margin:16px 0 0">${esc(p.poznamka || "Pripomienka bez poznámky")}</p>${suvis}
        <p style="margin:22px 0"><a href="${esc(APP_URL)}" style="background:#dab967;color:#1f2a37;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:700">Otvoriť skener</a></p>
        <p style="color:#999;font-size:12px">Realitný skener Alpha Reality</p></div>`;
      await posli(m.email, "🔔 Pripomienka: " + (p.poznamka || "skener").slice(0, 80), html);
      odoslane++;
    } catch (e) {
      await db.from("pripomienky").update({ email_chyba: String((e as Error).message || e).slice(0, 300) }).eq("id", p.id);
    }
  }
  return Response.json({ ok: true, odoslane });
});
