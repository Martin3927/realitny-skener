// Odošle emaily k pripomienkam, ktorým nastal čas (aj automatické uvoľnenie a zníženú cenu),
// a v pondelok ráno týždenný prehľad výkonu maklérov administrátorom.
// Volá ju databáza každú minútu (pg_cron); chránená tajným kľúčom v hlavičke x-kluc.
// Email: Brevo (BREVO_API_KEY) alebo SMTP cez port 465 (SMTP_HOST, SMTP_USER, SMTP_PASS).
import { createClient } from "jsr:@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6.9.16";

const APP_URL = Deno.env.get("APP_URL") || "https://app.realitnytypek.sk/";

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
  const odMeno = "Realitný týpek · Alpha Reality";
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

const DRUH: Record<string, [string, string]> = {
  pripomienka: ["🔔", "Pripomienka"],
  uvolnenie: ["🔓", "Inzerát sa uvoľnil"],
  cena: ["📉", "Znížená cena"],
  zmluva: ["📝", "Končí zmluva"],
  zhoda: ["🎯", "Ponuka pre vášho klienta"],
  obhliadka: ["🗝️", "Obhliadka"],
};
const WEB_URL = APP_URL.replace(/\/?$/, "/");

// týždenný report majiteľom (len ponuky so zapnutým reportom a emailom majiteľa)
// deno-lint-ignore no-explicit-any
async function reportyMajitelom(db: any) {
  const { data: zoz, error } = await db.rpc("_reporty_na_odoslanie");
  if (error) return { ok: false, chyba: error.message };
  let odoslane = 0;
  const chyby: string[] = [];
  // deno-lint-ignore no-explicit-any
  for (const r of (zoz as any[]) ?? []) {
    try {
      const { data: rep } = await db.rpc("report_majitela", { p_token: r.token });
      if (!rep) continue;
      const { data: m } = await db.from("makleri").select("meno, email, telefon").eq("id", r.makler_id).maybeSingle();
      // deno-lint-ignore no-explicit-any
      const obh = (rep.obhliadky as any[]) || [];
      const tyzden = obh.filter((o) => new Date(o.cas).getTime() > Date.now() - 7 * 864e5 && new Date(o.cas).getTime() <= Date.now()).length;
      const odkaz = WEB_URL + "report.html?t=" + encodeURIComponent(r.token);
      const riadok = (k: string, v: unknown) => `<tr><td style="padding:6px 0;color:#666">${esc(k)}</td><td style="padding:6px 0;text-align:right"><b>${esc(v)}</b></td></tr>`;
      const html = `<div style="font-family:Arial,sans-serif;max-width:560px;color:#23272e">
        <div style="border-bottom:3px solid #dab967;padding-bottom:8px;font-size:18px"><b>📊 Týždenný report k vašej nehnuteľnosti</b></div>
        <p style="font-size:15px;margin:16px 0 4px">Dobrý deň${r.majitel ? ", " + esc(r.majitel) : ""},</p>
        <p style="margin:0 0 12px">posielame prehľad o ponuke <b>${esc(r.nazov)}</b>.</p>
        <table style="width:100%;border-collapse:collapse;font-size:14px">
          ${riadok("Obhliadky za posledný týždeň", tyzden)}${riadok("Obhliadky spolu", obh.length)}
          ${riadok("Zobrazenia ponuky za týždeň", rep.zobrazenia_7)}${riadok("Klienti, ktorí hľadajú podobnú nehnuteľnosť", rep.zaujemcovia)}
          ${riadok("Dní v ponuke", rep.dni_v_ponuke)}</table>
        <p style="margin:22px 0"><a href="${esc(odkaz)}" style="background:#dab967;color:#1f2a37;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:700">Zobraziť celý report</a></p>
        <p style="margin:0">${m ? "S pozdravom<br><b>" + esc(m.meno) + "</b>, Alpha Reality" + (m.telefon ? "<br>" + esc(m.telefon) : "") + (m.email ? "<br>" + esc(m.email) : "") : ""}</p>
        <p style="color:#999;font-size:12px;margin-top:20px">Tento email dostávate, pretože predávate nehnuteľnosť cez Alpha Reality. Ak ho nechcete dostávať, dajte vedieť svojmu maklérovi.</p></div>`;
      await posli(r.email, "📊 Report k ponuke: " + String(r.nazov).slice(0, 80), html);
      await db.from("nehnutelnosti_interne").update({ report_odoslany: new Date().toISOString() }).eq("nehnutelnost_id", r.id);
      odoslane++;
    } catch (e) { chyby.push(String((e as Error).message || e)); }
  }
  return { ok: chyby.length === 0, odoslane, chyby };
}

const VYSLEDKY = ["Nedvíha", "Volať neskôr", "Nemá záujem o RK", "Predáva cez inú RK", "Už predané",
  "Záujem – stretnutie dohodnuté", "Získaný do ponuky", "Iné"];

function datumSk(iso: string) {
  return new Date(iso).toLocaleDateString("sk-SK", { timeZone: "Europe/Bratislava", day: "numeric", month: "numeric", year: "numeric" });
}

// týždenný prehľad výkonu maklérov – posiela sa aktívnym administrátorom
// deno-lint-ignore no-explicit-any
async function tyzdennyPrehlad(db: any) {
  const { data: v, error } = await db.rpc("_vykon_minuly_tyzden");
  if (error) return { ok: false, chyba: error.message };
  // deno-lint-ignore no-explicit-any
  const riadky = (v.makleri as any[]).filter((m) => m.aktivny || m.hovory || m.prevzate || m.sms || m.emaily);
  const sum = (k: string) => riadky.reduce((a, m) => a + Number(m[k] || 0), 0);
  const td = 'style="padding:6px 8px;border-bottom:1px solid #eee;text-align:center"';
  const th = 'style="padding:6px 8px;border-bottom:2px solid #dab967;text-align:center;font-size:12px;color:#666"';
  const vysl = (o: Record<string, number>) =>
    VYSLEDKY.filter((k) => o[k]).map((k) => `${esc(k)}: <b>${o[k]}</b>`).join("<br>") || "–";
  const tab = `<table style="border-collapse:collapse;width:100%;font-size:14px">
    <tr><th style="padding:6px 8px;border-bottom:2px solid #dab967;text-align:left;font-size:12px;color:#666">Maklér</th><th ${th}>Prevzal</th><th ${th}>Hovory</th><th ${th}>SMS</th><th ${th}>Email</th>
    <th ${th}>Uvoľnil</th><th ${th}>Uvoľnené automaticky</th><th ${th}>Schránkovanie</th><th ${th}>Drží teraz</th></tr>
    ${riadky.map((m) => `<tr><td style="padding:6px 8px;border-bottom:1px solid #eee"><b>${esc(m.meno)}</b></td>
      <td ${td}>${m.prevzate}</td><td ${td}><b>${m.hovory}</b></td><td ${td}>${m.sms}</td><td ${td}>${m.emaily}</td>
      <td ${td}>${m.uvolnene}</td><td ${m.auto_uvolnene ? 'style="padding:6px 8px;border-bottom:1px solid #eee;text-align:center;color:#b3261e;font-weight:700"' : td}>${m.auto_uvolnene}</td>
      <td ${td}>${m.schrankovanie}</td><td ${td}>${m.drzi}</td></tr>`).join("")}
    <tr><td style="padding:6px 8px"><b>Spolu</b></td><td ${td}><b>${sum("prevzate")}</b></td><td ${td}><b>${sum("hovory")}</b></td>
      <td ${td}><b>${sum("sms")}</b></td><td ${td}><b>${sum("emaily")}</b></td><td ${td}><b>${sum("uvolnene")}</b></td>
      <td ${td}><b>${sum("auto_uvolnene")}</b></td><td ${td}><b>${sum("schrankovanie")}</b></td><td ${td}><b>${sum("drzi")}</b></td></tr></table>`;
  const vysledky = riadky.filter((m) => m.hovory).map((m) =>
    `<p style="margin:10px 0 0"><b>${esc(m.meno)}</b><br><span style="font-size:13px">${vysl(m.vysledky)}</span></p>`).join("");
  const doDen = new Date(new Date(v.do).getTime() - 864e5).toISOString();
  const obdobie = datumSk(v.od) + " – " + datumSk(doDen);
  const html = `<div style="font-family:Arial,sans-serif;max-width:720px;color:#23272e">
    <div style="border-bottom:3px solid #dab967;padding-bottom:8px;font-size:18px"><b>📊 Týždenný prehľad maklérov</b>
    <span style="color:#888;font-size:14px"> · ${esc(obdobie)}</span></div>
    <p style="margin:14px 0">Nových súkromných inzerátov za týždeň: <b>${v.nove_sukromne}</b></p>${tab}
    ${vysledky ? `<h3 style="font-size:15px;margin:22px 0 0">Výsledky hovorov</h3>${vysledky}` : ""}
    <p style="margin:22px 0"><a href="${esc(APP_URL)}" style="background:#dab967;color:#1f2a37;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:700">Otvoriť skener</a></p>
    <p style="color:#999;font-size:12px">Realitný týpek · Alpha Reality · posiela sa každý pondelok ráno len administrátorom</p></div>`;
  const { data: admini } = await db.from("makleri").select("email").eq("rola", "admin").eq("aktivny", true);
  let odoslane = 0;
  const chyby: string[] = [];
  for (const a of admini ?? []) {
    if (!a.email) continue;
    try { await posli(a.email, "📊 Týždenný prehľad maklérov · " + obdobie, html); odoslane++; }
    catch (e) { chyby.push(String((e as Error).message || e)); }
  }
  return { ok: chyby.length === 0, odoslane, chyby };
}

// nové žiadosti o bezplatnú verziu z predajného webu → e-mail hlavnému správcovi
// deno-lint-ignore no-explicit-any
async function webZiadosti(db: any) {
  const { data: rows, error } = await db.from("zakaznici")
    .update({ web_oznamene: new Date().toISOString() })
    .eq("zdroj", "web").is("web_oznamene", null)
    .select("id, email, poznamky");
  if (error || !rows?.length) return 0;
  const komu: string[] = [];
  const { data: sp } = await db.from("hlavni_spravcovia").select("user_id");
  for (const s of sp ?? []) {
    const { data: u } = await db.auth.admin.getUserById(s.user_id);
    if (u?.user?.email) komu.push(u.user.email);
  }
  if (!komu.length) return 0;
  // deno-lint-ignore no-explicit-any
  const zoz = (rows as any[]).map((z) =>
    `<li style="margin:0 0 10px"><b>${esc(z.email)}</b><br><span style="font-size:13px;color:#555">${esc(String(z.poznamky || "").split("\n").pop())}</span></li>`).join("");
  const html = `<div style="font-family:Arial,sans-serif;max-width:560px;color:#1e2a35">
    <div style="border-bottom:3px solid #db9522;padding-bottom:8px;font-size:18px"><b>Nová žiadosť o bezplatnú verziu</b></div>
    <p style="margin:16px 0 8px">Z webu realitnytypek.sk ${rows.length === 1 ? "prišla nová žiadosť" : "prišlo " + rows.length + " nových žiadostí"}:</p>
    <ul style="padding-left:18px;margin:0">${zoz}</ul>
    <p style="margin:22px 0"><a href="${esc(WEB_URL + "sprava.html")}" style="background:#db9522;color:#1e2a35;padding:10px 18px;border-radius:999px;text-decoration:none;font-weight:700">Otvoriť Správu zákazníkov</a></p>
    <p style="color:#999;font-size:12px">Realitný týpek · posiela sa len hlavnému správcovi</p></div>`;
  let odoslane = 0;
  for (const e of komu) {
    try { await posli(e, "Nová žiadosť o bezplatnú verziu: " + rows[0].email + (rows.length > 1 ? " a ďalší" : ""), html); odoslane++; }
    catch { /* žiadosť ostáva v Správe zákazníkov */ }
  }
  return odoslane;
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
  let telo: { prehlad?: boolean; reporty?: boolean } = {};
  try { telo = await req.json(); } catch { /* prázdne telo */ }
  if (telo.prehlad) return Response.json(await tyzdennyPrehlad(db));
  if (telo.reporty) return Response.json(await reportyMajitelom(db));

  // zaberieme pripomienky (aby sa ten istý email neposlal dvakrát)
  const { data: rows, error } = await db.from("pripomienky")
    .update({ email_odoslany: new Date().toISOString() })
    .is("hotovo", null).is("zrusena", null).is("email_odoslany", null)
    .lte("cas", new Date().toISOString())
    .select("id, makler_id, inzerat_id, schrankovanie_id, nehnutelnost_id, cas, poznamka, druh");
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
      if (p.nehnutelnost_id) {
        const { data: n } = await db.from("nehnutelnosti").select("id, nazov, typ, obec, cena, cislo").eq("id", p.nehnutelnost_id).maybeSingle();
        if (n) {
          suvis = `<p style="margin:14px 0 0"><b>Ponuka:</b> <a href="${esc(WEB_URL + "ponuka.html?id=" + n.id)}">${esc(n.nazov || [n.typ, n.obec].filter(Boolean).join(", "))}</a>` +
            `${n.cislo ? " · č. " + esc(n.cislo) : ""}${n.cena ? " · " + Number(n.cena).toLocaleString("sk-SK") + " €" : ""}</p>`;
        }
      }
      const [ikona, nazov] = DRUH[p.druh as string] || DRUH.pripomienka;
      const html = `<div style="font-family:Arial,sans-serif;max-width:560px;color:#23272e">
        <div style="border-bottom:3px solid #dab967;padding-bottom:8px;font-size:18px"><b>${ikona} ${nazov}</b>
        <span style="color:#888;font-size:14px"> · ${esc(casSk(p.cas))}</span></div>
        <p style="font-size:16px;margin:16px 0 0">${esc(p.poznamka || "Pripomienka bez poznámky")}</p>${suvis}
        <p style="margin:22px 0"><a href="${esc(APP_URL)}" style="background:#dab967;color:#1f2a37;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:700">Otvoriť Realitného týpka</a></p>
        <p style="color:#999;font-size:12px">Realitný týpek · Alpha Reality</p></div>`;
      const predmet = p.druh && p.druh !== "pripomienka" ? ikona + " " + String(p.poznamka).slice(0, 110) : ikona + " " + nazov + ": " + (p.poznamka || "skener").slice(0, 80);
      await posli(m.email, predmet, html);
      odoslane++;
    } catch (e) {
      await db.from("pripomienky").update({ email_chyba: String((e as Error).message || e).slice(0, 300) }).eq("id", p.id);
    }
  }
  const web = await webZiadosti(db).catch(() => 0);
  return Response.json({ ok: true, odoslane, web });
});
