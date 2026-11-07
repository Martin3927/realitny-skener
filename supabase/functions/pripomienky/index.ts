// Odošle emaily k pripomienkam, ktorým nastal čas (aj automatické uvoľnenie a zníženú cenu), e-maily o konci skúšobnej doby,
// e-maily strážcu ponúk klientom z webu makléra aj z Týpkových nehnuteľností
// a v pondelok ráno týždenný prehľad výkonu maklérov administrátorom.
// Volá ju databáza každú minútu (pg_cron); chránená tajným kľúčom v hlavičke x-kluc.
// Email: Brevo (BREVO_API_KEY) alebo SMTP cez port 465 (SMTP_HOST, SMTP_USER, SMTP_PASS, EMAIL_FROM) – napr. vlastná schránka vo Websupporte.
// Porty 25 a 587 Supabase nepustí, preto SMTP len cez 465 (SSL).
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

type Moznosti = { odMeno?: string; odpovedat?: string; hlavicky?: Record<string, string> };
async function posli(komu: string, predmet: string, html: string, o: Moznosti = {}) {
  const od = Deno.env.get("EMAIL_FROM") || Deno.env.get("SMTP_USER") || "";
  const odMeno = (o.odMeno || "Realitný týpek").replace(/["<>\r\n]/g, "").slice(0, 70);
  const odpovedat = o.odpovedat && /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(o.odpovedat) ? o.odpovedat : "";
  const brevo = Deno.env.get("BREVO_API_KEY");
  if (brevo) {
    const r = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": brevo, "Content-Type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        sender: { name: odMeno, email: od }, to: [{ email: komu }], subject: predmet, htmlContent: html,
        ...(odpovedat ? { replyTo: { email: odpovedat } } : {}), ...(o.hlavicky ? { headers: o.hlavicky } : {}),
      }),
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
  try {
    await t.sendMail({ from: { name: odMeno, address: od }, to: komu, subject: predmet, html, ...(odpovedat ? { replyTo: odpovedat } : {}), ...(o.hlavicky ? { headers: o.hlavicky } : {}) });
  } catch (e) {
    // zlé prihlásenie do schránky: do záznamov funkcie len meno a vlastnosti hesla (nikdy nie heslo samotné)
    if (/Invalid login|535/i.test(String((e as Error).message || e))) smtpDiagnostika();
    throw e;
  }
}
let smtpDiagnostikaHotova = false;
function smtpDiagnostika() {
  if (smtpDiagnostikaHotova) return;
  smtpDiagnostikaHotova = true;
  const u = Deno.env.get("SMTP_USER") || "", h = Deno.env.get("SMTP_PASS") || "";
  console.error("smtp-prihlasenie", JSON.stringify({
    host: Deno.env.get("SMTP_HOST") || "", port: Deno.env.get("SMTP_PORT") || "", secure: Deno.env.get("SMTP_SECURE") ?? "(predvolené true)",
    user: u, user_dlzka: u.length, user_medzera: u !== u.trim(), from: Deno.env.get("EMAIL_FROM") || "",
    heslo_dlzka: h.length, heslo_medzera_zaciatok: /^\s/.test(h), heslo_medzera_koniec: /\s$/.test(h), heslo_novy_riadok: /[\r\n]/.test(h),
    heslo_uvodzovky: /^["']|["']$/.test(h), heslo_mimo_ascii: /[^\x20-\x7e]/.test(h),
  }));
}

const DRUH: Record<string, [string, string]> = {
  pripomienka: ["🔔", "Pripomienka"],
  uvolnenie: ["🔓", "Inzerát sa uvoľnil"],
  cena: ["📉", "Znížená cena"],
  zmluva: ["📝", "Končí zmluva"],
  zhoda: ["🎯", "Ponuka pre vášho klienta"],
  obhliadka: ["🗝️", "Obhliadka"],
  web: ["💬", "Kontakt z vášho webu"],
  zakaznik: ["🆕", "Nový zákazník"],
};
const WEB_URL = APP_URL.replace(/\/?$/, "/");

// názvy kancelárií (podpis v emailoch); kancelária 1 = Alpha Reality
// deno-lint-ignore no-explicit-any
async function nazvyKancelarii(db: any): Promise<Map<number, string>> {
  const { data } = await db.from("kancelarie").select("id, nazov");
  // deno-lint-ignore no-explicit-any
  return new Map(((data as any[]) ?? []).map((k) => [Number(k.id), String(k.nazov || "").trim()]));
}
const nazovK = (mapa: Map<number, string>, id: unknown) => mapa.get(Number(id ?? 1)) || "Realitná kancelária";

// týždenný report majiteľom (len ponuky so zapnutým reportom a emailom majiteľa)
// deno-lint-ignore no-explicit-any
async function reportyMajitelom(db: any) {
  const { data: zoz, error } = await db.rpc("_reporty_na_odoslanie");
  if (error) return { ok: false, chyba: error.message };
  let odoslane = 0;
  const chyby: string[] = [];
  const kancelarie = await nazvyKancelarii(db);
  // deno-lint-ignore no-explicit-any
  for (const r of (zoz as any[]) ?? []) {
    try {
      const { data: rep } = await db.rpc("report_majitela", { p_token: r.token });
      if (!rep) continue;
      const { data: m } = await db.from("makleri").select("meno, email, telefon, kancelaria_id").eq("id", r.makler_id).maybeSingle();
      const kn = nazovK(kancelarie, rep.kancelaria_id ?? m?.kancelaria_id);
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
        <p style="margin:0">${m ? "S pozdravom<br><b>" + esc(m.meno) + "</b>, " + esc(kn) + (m.telefon ? "<br>" + esc(m.telefon) : "") + (m.email ? "<br>" + esc(m.email) : "") : ""}</p>
        <p style="color:#999;font-size:12px;margin-top:20px">Tento email dostávate, pretože predávate nehnuteľnosť cez ${esc(kn)}. Ak ho nechcete dostávať, dajte vedieť svojmu maklérovi.</p></div>`;
      await posli(r.email, "📊 Report k ponuke: " + String(r.nazov).slice(0, 80), html, { odMeno: "Realitný týpek · " + kn });
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

// týždenný prehľad výkonu maklérov – každá aktívna kancelária dostane svoj, len jej administrátorom
// deno-lint-ignore no-explicit-any
async function tyzdennyPrehlad(db: any) {
  const { data: kanc, error } = await db.from("kancelarie").select("id, nazov").eq("aktivna", true).order("id");
  if (error) return { ok: false, chyba: error.message };
  let odoslane = 0;
  const chyby: string[] = [];
  // deno-lint-ignore no-explicit-any
  for (const k of (kanc as any[]) ?? []) {
    const r = await prehladKancelarie(db, Number(k.id), String(k.nazov || "").trim() || "Realitná kancelária");
    odoslane += r.odoslane;
    chyby.push(...r.chyby);
  }
  return { ok: chyby.length === 0, odoslane, chyby };
}

// deno-lint-ignore no-explicit-any
async function prehladKancelarie(db: any, kancId: number, kancNazov: string) {
  const { data: v, error } = await db.rpc("_vykon_minuly_tyzden", { p_kancelaria: kancId });
  if (error) return { odoslane: 0, chyby: [kancNazov + ": " + error.message] };
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
    <p style="color:#999;font-size:12px">Realitný týpek · ${esc(kancNazov)} · posiela sa každý pondelok ráno len administrátorom</p></div>`;
  const { data: admini } = await db.from("makleri").select("email").eq("kancelaria_id", kancId).eq("rola", "admin").eq("aktivny", true);
  let odoslane = 0;
  const chyby: string[] = [];
  for (const a of admini ?? []) {
    if (!a.email) continue;
    try { await posli(a.email, "📊 Týždenný prehľad maklérov · " + obdobie, html, { odMeno: "Realitný týpek · " + kancNazov }); odoslane++; }
    catch (e) { chyby.push(String((e as Error).message || e)); }
  }
  return { odoslane, chyby };
}

// nové objednávky a žiadosti o bezplatnú verziu z predajného webu → e-mail hlavnému správcovi (ku každej zvlášť)
// a potvrdenie tomu, kto formulár vyplnil. Do zvončeka a mobilu ich hneď dáva databáza (093_objednavka_upozornenie.sql).
const ODPOVED_TYPEK = "info@realitnytypek.sk";
// deno-lint-ignore no-explicit-any
function balikZakaznika(m: any) {
  const x: string[] = Array.isArray(m) ? m : [];
  if (x.includes("kancelaria")) return "Realitná kancelária";
  if (x.includes("skener") && x.includes("web")) return "Skener + osobný web";
  if (x.includes("skener")) return "Realitný skener";
  if (x.includes("web")) return "Osobný web";
  if (x.includes("kontakty")) return "Kontakty z odhadov hodnoty";
  return "";
}
// deno-lint-ignore no-explicit-any
async function webZiadosti(db: any) {
  const { data: rows, error } = await db.from("zakaznici")
    .update({ web_oznamene: new Date().toISOString() })
    .eq("zdroj", "web").is("web_oznamene", null)
    .select("id, email, poznamky, kontakt_meno, telefon, moduly, registracia_poslat");
  if (error || !rows?.length) return 0;
  const komu: string[] = [];
  const { data: sp } = await db.from("hlavni_spravcovia").select("user_id");
  for (const s of sp ?? []) {
    const { data: u } = await db.auth.admin.getUserById(s.user_id);
    if (u?.user?.email) komu.push(u.user.email);
  }
  let odoslane = 0;
  // deno-lint-ignore no-explicit-any
  for (const z of rows as any[]) {
    const riadok = String(z.poznamky || "").trim().split("\n").pop() || "";
    const obj = /^Objednávka/.test(riadok);
    const kont = /^Záujem o kontakty/.test(riadok);   // formulár realitnytypek.sk/kontakty (migrácia 121)
    const bal = balikZakaznika(z.moduly);
    const meno = String(z.kontakt_meno || "").trim();
    const tel = String(z.telefon || "").trim();
    const detail = ((riadok.match(/\d{2}:\d{2}\.\s*(.*)$/) || [])[1] || "").replace(/\s*Kontakt: .*$/, "");
    const r = (k: string, v: string) => v ? `<tr><td style="padding:5px 14px 5px 0;color:#4a6074;vertical-align:top">${k}</td><td style="padding:5px 0"><b>${v}</b></td></tr>` : "";
    const html = `<div style="font-family:Arial,sans-serif;max-width:560px;color:#1e2a35">
      <div style="border-bottom:3px solid #db9522;padding-bottom:8px;font-size:18px"><b>${kont ? "Záujem o kontakty z odhadov" : obj ? "Nová objednávka z webu" : "Nová žiadosť o bezplatnú verziu"}</b></div>
      <table style="border-collapse:collapse;font-size:15px;margin:14px 0 0">
        ${r("Balík", esc(bal))}${r("Meno", esc(meno))}
        ${r("Telefón", tel ? `<a href="tel:${esc(tel.replace(/[^\d+]/g, ""))}" style="color:#1e2a35">${esc(tel)}</a>` : "")}
        ${r("E-mail", `<a href="mailto:${esc(z.email)}" style="color:#1e2a35">${esc(z.email)}</a>`)}</table>
      ${detail ? `<p style="margin:12px 0 0;font-size:14px;color:#3a4b5a">${esc(detail)}</p>` : ""}
      ${kont ? `<p style="margin:12px 0 0;font-size:14px;color:#3a4b5a">Odkaz na registráciu sa neposlal. Over kanceláriu, v Správe skontroluj okresy a stav nastav na Platiaci (cena 0 €), potom „Poslať odkaz na registráciu“.</p>` : ""}
      <p style="margin:22px 0"><a href="${esc(WEB_URL + "sprava.html#z/" + z.id)}" style="background:#db9522;color:#1e2a35;padding:10px 18px;border-radius:999px;text-decoration:none;font-weight:700">Otvoriť v Správe zákazníkov</a></p>
      <p style="color:#999;font-size:12px">Realitný týpek · posiela sa len hlavnému správcovi · odpoveď na tento e-mail ide záujemcovi</p></div>`;
    const predmet = (kont ? "Záujem o kontakty z odhadov: " : obj ? "Nová objednávka z webu: " : "Nová žiadosť o bezplatnú verziu: ") + [kont ? "" : bal, meno || z.email].filter(Boolean).join(" – ");
    for (const e of komu) {
      try { await posli(e, predmet.slice(0, 140), html, { odMeno: "Realitný týpek", odpovedat: z.email }); odoslane++; }
      catch { /* objednávka ostáva v Správe zákazníkov aj v zvončeku */ }
    }
    // potvrdenie tomu, kto formulár vyplnil – ak čaká e-mail s odkazom na registráciu, potvrdením je ten (registracneEmaily)
    if (!z.email || z.registracia_poslat) continue;
    const potvrdenie = `<div style="font-family:Arial,sans-serif;max-width:560px;color:#1e2a35;line-height:1.55">
      <div style="border-bottom:3px solid #db9522;padding-bottom:8px;font-size:18px"><b>Realitný týpek</b></div>
      <p style="font-size:16px;margin:16px 0 0">Ahoj${meno ? " " + esc(meno.split(" ")[0]) : ""},</p>
      <p style="margin:10px 0 0">${kont ? "ďakujeme za záujem o kontakty z odhadov hodnoty. Ozveme sa ti do pracovného dňa, dohodneme okresy a pošleme ti odkaz na registráciu. Účet je bez mesačného poplatku – platíš len za kontakty, ktoré si prevezmeš, a prvé sú zadarmo." : "ďakujeme za záujem o Realitného týpka. " + (obj
        ? "Tvoju objednávku" + (bal ? " (" + esc(bal) + ")" : "") + " máme. Prvých 14 dní je zadarmo."
        : "Tvoju žiadosť o bezplatnú verziu na 14 dní máme.")}</p>
      ${kont ? `<p style="margin:10px 0 0">Ako to funguje a podmienky nájdeš na <a href="https://realitnytypek.sk/kontakty" style="color:#8a5a2b">realitnytypek.sk/kontakty</a>.</p>` : `<p style="margin:10px 0 0">Ozveme sa ti osobne, nastavíme ti všetko, čo potrebuješ, a pomôžeme ti so začiatkom.</p>`}
      <p style="margin:10px 0 0">Ak máš otázku, stačí odpísať na tento e-mail.</p>
      <p style="margin:18px 0 0">Tím Realitného týpka<br><a href="https://realitnytypek.sk/" style="color:#8a5a2b">realitnytypek.sk</a></p>
      <p style="color:#999;font-size:12px;margin-top:20px">Tento e-mail ti prišiel, lebo si na webe realitnytypek.sk ${kont ? "prejavil záujem o kontakty z odhadov" : obj ? "objednal Realitného týpka" : "požiadal o bezplatnú verziu"}. Ak si to nebol ty, správu pokojne ignoruj.</p></div>`;
    try { await posli(z.email, kont ? "Kontakty z odhadov – ozveme sa ti" : obj ? "Tvoja objednávka Realitného týpka" : "Tvoja žiadosť o Realitného týpka", potvrdenie, { odMeno: "Realitný týpek", odpovedat: ODPOVED_TYPEK }); }
    catch { /* potvrdenie nie je nutné */ }
  }
  return odoslane;
}

// e-mail s odkazom na dokončenie registrácie (skúšobná doba 14 dní) – nový záujemca z webu alebo „Poslať odkaz znova“ v Správe zákazníkov.
// Každý pokus vytvorí nový odkaz (v databáze je len jeho odtlačok), starý tým prestane platiť. Pri chybe sa skúša znova 3 dni.
function nahodnyKluc() {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  return Array.from(b).map((x) => x.toString(16).padStart(2, "0")).join("");
}
// deno-lint-ignore no-explicit-any
async function registracneEmaily(db: any) {
  const { data: rows, error } = await db.from("zakaznici")
    .select("id, email, kontakt_meno, typ, stav, moduly, registracia_poslat")
    .not("registracia_poslat", "is", null).gt("registracia_poslat", new Date(Date.now() - 3 * 864e5).toISOString())
    .is("registrovany", null).limit(20);
  if (error) return { ok: false, chyba: error.message };
  let odoslane = 0;
  const chyby: string[] = [];
  // deno-lint-ignore no-explicit-any
  for (const z of (rows as any[]) ?? []) {
    // zaberieme (aby ten istý e-mail neodišiel dvakrát, keď bežia dve volania naraz)
    const { data: zab } = await db.from("zakaznici").update({ registracia_poslat: null })
      .eq("id", z.id).eq("registracia_poslat", z.registracia_poslat).select("id");
    if (!zab?.length) continue;
    try {
      if (!z.email) throw new Error("zákazník nemá e-mail");
      const kluc = nahodnyKluc();
      const { error: eU } = await db.from("zakaznici").update({
        registracia_hash: await sha256(kluc), registracia_do: new Date(Date.now() + 7 * 864e5).toISOString(),
      }).eq("id", z.id);
      if (eU) throw new Error(eU.message);
      const meno = String(z.kontakt_meno || "").trim();
      const bal = balikZakaznika(z.moduly);
      const sk = Array.isArray(z.moduly) && z.moduly.includes("skener");
      const plati = z.stav === "aktivny";   // platiaci zákazník – bez skúšobnej doby
      const kont = Array.isArray(z.moduly) && z.moduly.includes("kontakty") && !sk;   // účet len na kontakty z odhadov (migrácia 120)
      const odkaz = WEB_URL + "registracia.html#t=" + kluc;
      const html = `<div style="font-family:Arial,sans-serif;max-width:560px;color:#1e2a35;line-height:1.55">
        <div style="border-bottom:3px solid #db9522;padding-bottom:8px;font-size:18px"><b>Realitný týpek</b></div>
        <p style="font-size:16px;margin:16px 0 0">Ahoj${meno ? " " + esc(meno.split(" ")[0]) : ""},</p>
        <p style="margin:10px 0 0">ďakujeme za záujem o Realitného týpka${bal ? " (" + esc(bal) + ")" : ""}. Registráciu dokončíš za minútu:
          nastavíš si heslo, telefón${sk ? " a okresy pre skener" : ""}. ${plati ? "Hneď potom sa prihlásiš a môžeš začať." : "Hneď potom sa ti spustí skúšobná doba na <b>14 dní zadarmo</b>."}</p>
        ${kont ? `<p style="margin:10px 0 0">Kontakty nájdeš v aplikácii v časti <b>Odhady → Kontakty na predaj</b>. Keď príde nová žiadosť o odhad z tvojich okresov, dostaneš upozornenie do mobilu – kontakt dostane kancelária, ktorá ho prevezme prvá. Platíš len za kontakty, ktoré si prevezmeš, žiadny mesačný poplatok.</p>` : ""}
        <p style="margin:22px 0"><a href="${esc(odkaz)}" style="background:#db9522;color:#1e2a35;padding:12px 22px;border-radius:999px;text-decoration:none;font-weight:700">Dokončiť registráciu</a></p>
        <p style="margin:0;font-size:14px;color:#3a4b5a">Odkaz platí 7 dní. Ako si dať Týpka do mobilu a zapnúť upozornenia, nájdeš v <a href="https://realitnytypek.sk/prve-kroky" style="color:#8a5a2b">Prvých krokoch</a>. Ak máš otázku, stačí odpísať na tento e-mail.</p>
        <p style="margin:18px 0 0">Tím Realitného týpka<br><a href="https://realitnytypek.sk/" style="color:#8a5a2b">realitnytypek.sk</a></p>
        <p style="color:#999;font-size:12px;margin-top:20px">${plati ? "Tento e-mail ti prišiel, lebo sme sa dohodli na spolupráci s Realitným týpkom." : "Tento e-mail ti prišiel, lebo si na webe realitnytypek.sk požiadal o skúšobnú verziu Realitného týpka."}
          Ak si to nebol ty, správu pokojne ignoruj – bez dokončenia registrácie sa nič nevytvorí.</p></div>`;
      await posli(z.email, plati ? "Dokonči registráciu – Realitný týpek" : "Dokonči registráciu – Realitný týpek na 14 dní zadarmo", html, { odMeno: "Realitný týpek", odpovedat: ODPOVED_TYPEK });
      await db.from("zakaznici").update({ registracia_email: new Date().toISOString() }).eq("id", z.id);
      odoslane++;
    } catch (e) {
      chyby.push(String((e as Error).message || e).slice(0, 200));
      // vrátime do fronty – skúsi sa pri ďalšom behu (do 3 dní od žiadosti)
      await db.from("zakaznici").update({ registracia_poslat: z.registracia_poslat }).eq("id", z.id).is("registrovany", null);
    }
  }
  return { ok: chyby.length === 0, odoslane, chyby };
}

// koniec skúšobnej doby: 3 dni pred koncom „končí“ a deň po konci „skončila“ – frontu plní databáza (_skusobna_koniec, ráno o 8:00)
// deno-lint-ignore no-explicit-any
async function skusobnaEmaily(db: any) {
  const { data: rows, error } = await db.from("zakaznici")
    .select("id, email, kontakt_meno, typ, nazov, moduly, skusobna_do, skusobna_email, platba_obdobie")
    .not("skusobna_email", "is", null).not("registrovany", "is", null).limit(20);
  if (error) return { ok: false, chyba: error.message };
  let odoslane = 0;
  const chyby: string[] = [];
  // deno-lint-ignore no-explicit-any
  for (const z of (rows as any[]) ?? []) {
    const { data: zab } = await db.from("zakaznici").update({ skusobna_email: null })
      .eq("id", z.id).eq("skusobna_email", z.skusobna_email).select("id");
    if (!zab?.length) continue;
    try {
      if (!z.email) throw new Error("zákazník nemá e-mail");
      const meno = String(z.kontakt_meno || "").trim();
      const bal = balikZakaznika(z.moduly);
      const konci = z.skusobna_email === "konci";
      const do_ = z.skusobna_do ? new Date(z.skusobna_do + "T12:00:00").toLocaleDateString("sk-SK", { day: "numeric", month: "numeric", year: "numeric" }) : "";
      const cennik = "https://realitnytypek.sk/#cennik";
      const html = `<div style="font-family:Arial,sans-serif;max-width:560px;color:#1e2a35;line-height:1.55">
        <div style="border-bottom:3px solid #db9522;padding-bottom:8px;font-size:18px"><b>Realitný týpek</b></div>
        <p style="font-size:16px;margin:16px 0 0">Ahoj${meno ? " " + esc(meno.split(" ")[0]) : ""},</p>
        ${konci
          ? `<p style="margin:10px 0 0">tvoja skúšobná doba Realitného týpka${bal ? " (" + esc(bal) + ")" : ""} <b>končí ${esc(do_)}</b>.
               Ak chceš pokračovať, stačí odpísať na tento e-mail alebo zavolať – pošleme ti údaje na platbu a nič sa nepreruší.
               Platíš mesačne, pri platbe na rok dopredu máš mesiac zdarma. Ceny sú vždy konečné, s DPH.</p>
             <p style="margin:10px 0 0">Ak sa neozveš, prístup sa po tomto dni pozastaví. Všetko, čo si si v Týpkovi uložil, ti ostáva – po zaplatení pokračuješ tam, kde si skončil.</p>`
          : `<p style="margin:10px 0 0">tvoja skúšobná doba Realitného týpka${bal ? " (" + esc(bal) + ")" : ""} <b>skončila ${esc(do_)}</b> a prístup je pozastavený.
               Všetko, čo si si uložil, ti ostáva.</p>
             <p style="margin:10px 0 0">Ak chceš pokračovať, odpíš na tento e-mail alebo zavolaj – pošleme ti údaje na platbu a hneď po nej pokračuješ tam, kde si skončil.
               Platíš mesačne, pri platbe na rok dopredu máš mesiac zdarma. Ceny sú vždy konečné, s DPH.</p>
             <p style="margin:10px 0 0">Ak ti niečo v Týpkovi chýbalo alebo nesedelo, napíš nám to – robíme ho pre maklérov a každá pripomienka nám pomôže.</p>`}
        <p style="margin:22px 0"><a href="${cennik}" style="background:#db9522;color:#1e2a35;padding:12px 22px;border-radius:999px;text-decoration:none;font-weight:700">Pozrieť cenník</a></p>
        <p style="margin:18px 0 0">Tím Realitného týpka<br><a href="https://realitnytypek.sk/" style="color:#8a5a2b">realitnytypek.sk</a> · <a href="mailto:${ODPOVED_TYPEK}" style="color:#8a5a2b">${ODPOVED_TYPEK}</a></p>
        <p style="color:#999;font-size:12px;margin-top:20px">Tento e-mail ti prišiel, lebo máš v Realitnom týpkovi skúšobnú dobu na 14 dní zadarmo.</p></div>`;
      await posli(z.email, konci ? `Skúšobná doba Realitného týpka ti končí ${do_}` : "Skúšobná doba Realitného týpka skončila – chceš pokračovať?", html,
        { odMeno: "Realitný týpek", odpovedat: ODPOVED_TYPEK });
      odoslane++;
    } catch (e) {
      chyby.push(String((e as Error).message || e).slice(0, 200));
      await db.from("zakaznici").update({ skusobna_email: z.skusobna_email }).eq("id", z.id).is("skusobna_email", null);
    }
  }
  return { ok: chyby.length === 0, odoslane, chyby };
}

// strážca ponúk z webu makléra: klientovi príde e-mail s novými alebo zlacnenými ponukami, ktoré zodpovedajú tomu, čo hľadá
// (najviac 1 e-mail za 12 hodín, odpoveď ide maklérovi, odhlásenie jedným klikom)
function cisloSk(n: unknown) {
  return Math.round(Number(n)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, "\u00a0");
}
// deno-lint-ignore no-explicit-any
function fotkaPonuky(x: any) {
  const f = Array.isArray(x.fotky) ? x.fotky[0] : null;
  if (typeof f === "string") return /^https:\/\//.test(f) ? f : "";
  if (f && typeof f.url === "string" && /^https:\/\//.test(f.url)) return f.url;
  if (f && f.cesta) return Deno.env.get("SUPABASE_URL") + "/storage/v1/object/public/ponuky/" + String(f.cesta).split("/").map(encodeURIComponent).join("/");
  return "";
}
// deno-lint-ignore no-explicit-any
function cenaPonuky(x: any) {
  if (x.zobrazit_cenu === false || x.cena == null) return x.typ_ceny === "na vyžiadanie" ? "Cena na vyžiadanie" : "Cena dohodou";
  return cisloSk(x.cena) + "\u00a0€" + (x.transakcia === "prenajom" ? " / mes." : "");
}
// deno-lint-ignore no-explicit-any
function nazovPonuky(x: any) {
  return String(x.nazov || "").trim() || [x.typ || "Nehnuteľnosť", x.obec].filter(Boolean).join(", ");
}
// deno-lint-ignore no-explicit-any
function parametrePonuky(x: any) {
  const poz = x.kategoria === "pozemky";
  const pl = poz ? x.plocha_pozemku : (x.plocha_uzitkova ?? x.plocha_zastavana ?? x.plocha_pozemku);
  const iz = Number(x.izby || 0);
  return [[x.obec, x.cast_obce].filter(Boolean).join(" – "), pl ? cisloSk(pl) + "\u00a0m²" : "",
    iz && !poz ? iz + (iz === 1 ? " izba" : iz < 5 ? " izby" : " izieb") : ""].filter(Boolean).join(" · ");
}

// deno-lint-ignore no-explicit-any
async function strazcaEmaily(db: any) {
  const { data: zoz, error } = await db.rpc("_strazca_na_odoslanie", { p_limit: 20 });
  if (error) return { ok: false, chyba: error.message };
  let odoslane = 0;
  const chyby: string[] = [];
  // deno-lint-ignore no-explicit-any
  for (const s of (zoz as any[]) ?? []) {
    try {
      const mk = s.makler || {}, w = s.web || {};
      const meno = String(w.name || mk.meno || "Váš maklér").trim();
      const zena = mk.pohlavie === "zena";
      const telefon = String(w.phone || mk.telefon || "").trim();
      const email = String(w.email || mk.email || "").trim();
      const kancelaria = String(w.office || "").trim();
      const zaklad = s.domena ? "https://" + s.domena + "/" : WEB_URL + "stranka.html?m=" + encodeURIComponent(s.adresa);
      const odkaz = (id: number) => zaklad + (s.domena ? "?p=" : "&p=") + id;
      const odhlasit = WEB_URL + "odhlasit.php?t=" + encodeURIComponent(s.token);
      // deno-lint-ignore no-explicit-any
      const ponuky = (s.ponuky as any[]) || [];
      if (!ponuky.length) continue;
      const karty = ponuky.map((x) => {
        const f = fotkaPonuky(x), u = odkaz(x.id);
        return `<tr><td style="padding:0 0 18px">
          <a href="${esc(u)}" style="display:block;text-decoration:none;color:#1e2a35;border:1px solid #e6dccb;border-radius:14px;overflow:hidden;background:#fff">
            ${f ? `<img src="${esc(f)}" alt="" width="520" style="display:block;width:100%;max-width:520px;height:auto;border:0">` : ""}
            <div style="padding:14px 16px">
              ${x.nova_cena ? `<div style="display:inline-block;background:#fdecc8;color:#7a4b00;font-size:12px;font-weight:700;padding:3px 9px;border-radius:999px;margin-bottom:6px">Znížená cena</div>` : ""}
              <div style="font-size:17px;font-weight:700;line-height:1.3">${esc(nazovPonuky(x))}</div>
              <div style="font-size:14px;color:#5a6470;margin-top:4px">${esc(parametrePonuky(x))}</div>
              <div style="font-size:18px;font-weight:700;margin-top:8px">${esc(cenaPonuky(x))}</div>
              <div style="margin-top:12px"><span style="display:inline-block;background:#1e2a35;color:#fff;font-weight:700;font-size:14px;padding:9px 16px;border-radius:999px">Pozrieť ponuku</span></div>
            </div></a></td></tr>`;
      }).join("");
      const jedna = ponuky.length === 1;
      const predmet = jedna
        ? (ponuky[0].nova_cena ? "Znížená cena: " : "Nová ponuka pre vás: ") + nazovPonuky(ponuky[0]).slice(0, 70) + " – " + cenaPonuky(ponuky[0])
        : ponuky.length + " nové ponuky podľa toho, čo hľadáte";
      const html = `<div style="background:#f7f2e8;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;color:#1e2a35">
        <table role="presentation" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;margin:0 auto"><tr><td>
        <p style="font-size:16px;margin:0 0 10px">Dobrý deň${s.meno ? ", " + esc(s.meno) : ""},</p>
        <p style="font-size:15px;line-height:1.55;margin:0 0 18px">${jedna ? "mám pre vás novú ponuku, ktorá zodpovedá tomu, čo hľadáte:" : "mám pre vás nové ponuky, ktoré zodpovedajú tomu, čo hľadáte:"}</p>
        <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%">${karty}</table>
        <p style="font-size:15px;line-height:1.55;margin:4px 0 0">Ak vás niektorá zaujala, stačí odpísať na tento e-mail${telefon ? " alebo zavolať na " + `<a href="tel:${esc(telefon.replace(/[^\d+]/g, ""))}" style="color:#8a5a2b;font-weight:700">${esc(telefon)}</a>` : ""}. Rád${zena ? "a" : ""} vám ju ukážem.</p>
        <p style="font-size:15px;line-height:1.5;margin:18px 0 0">S pozdravom<br><b>${esc(meno)}</b>${kancelaria ? "<br>" + esc(kancelaria) : ""}${email ? `<br><a href="mailto:${esc(email)}" style="color:#8a5a2b">${esc(email)}</a>` : ""}</p>
        <p style="font-size:12px;line-height:1.5;color:#7a828c;margin:26px 0 0;border-top:1px solid #e6dccb;padding-top:12px">Tento e-mail vám prišiel, lebo ste si na webe ${esc(meno)} zapli strážcu ponúk. Nové ponuky posielam najviac raz za 12 hodín.
          <a href="${esc(odhlasit)}" style="color:#7a828c">Odhlásiť strážcu ponúk</a></p>
        </td></tr></table></div>`;
      await posli(s.email, predmet, html, {
        odMeno: meno + (kancelaria ? " · " + kancelaria : ""), odpovedat: email,
        hlavicky: { "List-Unsubscribe": `<${odhlasit}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
      });
      odoslane++;
    } catch (e) {
      chyby.push(String((e as Error).message || e));
      await db.rpc("_strazca_chyba", { p_dopyt: s.dopyt_id, p_ids: s.ids, p_chyba: String((e as Error).message || e) });
    }
  }
  return { ok: chyby.length === 0, odoslane, chyby };
}

// potvrdenie strážcu (dvojité prihlásenie): klient, ktorý zadal e-mail, dostane jeden e-mail s odkazom na potvrdenie;
// ponuky mu chodia až po kliknutí. Kto nič nezadal, nič nedostane.
const KAT: Record<string, string> = { byty: "byt", domy: "dom", pozemky: "pozemok", chaty: "chata" };
// deno-lint-ignore no-explicit-any
async function strazcaPotvrdenia(db: any) {
  const { data: zoz, error } = await db.rpc("_strazca_potvrdenia", { p_limit: 20 });
  if (error) return { ok: false, chyba: error.message };
  let odoslane = 0;
  const chyby: string[] = [];
  // deno-lint-ignore no-explicit-any
  for (const s of (zoz as any[]) ?? []) {
    try {
      const mk = s.makler || {}, w = s.web || {}, h = s.hlada || {};
      const meno = String(w.name || mk.meno || "Váš maklér").trim();
      const kancelaria = String(w.office || "").trim();
      const email = String(w.email || mk.email || "").trim();
      const potvrdit = WEB_URL + "potvrdit.php?t=" + encodeURIComponent(s.token);
      const hlada = [((h.kategorie || []) as string[]).map((k) => KAT[k] || k).join(", ") || "nehnuteľnosť",
        h.transakcia === "prenajom" ? "na prenájom" : "", ((h.obce || []) as string[]).join(", "),
        h.cena_do ? "do " + cisloSk(h.cena_do) + "\u00a0€" : ""].filter(Boolean).join(" · ");
      const html = `<div style="background:#f7f2e8;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;color:#1e2a35">
        <table role="presentation" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;margin:0 auto"><tr><td>
        <p style="font-size:16px;margin:0 0 10px">Dobrý deň${s.meno ? ", " + esc(s.meno) : ""},</p>
        <p style="font-size:15px;line-height:1.55;margin:0 0 14px">na webe ${esc(meno)} ste si zapli strážcu ponúk: <b>${esc(hlada)}</b>.</p>
        <p style="font-size:15px;line-height:1.55;margin:0 0 20px">Potvrďte prosím, že nové ponuky môžeme posielať na tento e-mail:</p>
        <p style="margin:0 0 22px"><a href="${esc(potvrdit)}" style="display:inline-block;background:#1e2a35;color:#fff;font-weight:700;font-size:15px;padding:12px 22px;border-radius:999px;text-decoration:none">Áno, posielajte mi ponuky</a></p>
        <p style="font-size:14px;line-height:1.55;margin:0">S pozdravom<br><b>${esc(meno)}</b>${kancelaria ? "<br>" + esc(kancelaria) : ""}</p>
        <p style="font-size:12px;line-height:1.5;color:#7a828c;margin:24px 0 0;border-top:1px solid #e6dccb;padding-top:12px">Ak ste sa neprihlásili vy, tento e-mail pokojne ignorujte. Bez potvrdenia vám už nič nepríde.</p>
        </td></tr></table></div>`;
      await posli(s.email, "Potvrďte strážcu ponúk – " + meno, html, { odMeno: meno + (kancelaria ? " · " + kancelaria : ""), odpovedat: email });
      odoslane++;
    } catch (e) {
      chyby.push(String((e as Error).message || e));
      await db.rpc("_strazca_potvrdenie_chyba", { p_dopyt: s.dopyt_id });
    }
  }
  return { ok: chyby.length === 0, odoslane, chyby };
}

// strážca ponúk Týpkových nehnuteľností (realitnytypek.sk/nehnutelnosti): potvrdenie a e-maily s novými ponukami
const PORTAL = "https://realitnytypek.sk/nehnutelnosti/";
const PORTAL_OD = "Týpkove nehnuteľnosti";
const PORTAL_ODPOVED = "info@realitnytypek.sk";
function obalPortalu(obsah: string, pata: string) {
  return `<div style="background:#f7f2e8;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;color:#1e2a35">
    <table role="presentation" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;margin:0 auto"><tr><td>
    <p style="margin:0 0 18px;font-size:19px;font-weight:900;letter-spacing:-.3px;color:#15191c">Týpkove <span style="color:#b9771a">nehnuteľnosti</span></p>
    ${obsah}
    <p style="font-size:12px;line-height:1.5;color:#7a828c;margin:26px 0 0;border-top:1px solid #e6dccb;padding-top:12px">${pata}</p>
    </td></tr></table></div>`;
}
// deno-lint-ignore no-explicit-any
async function portalStrazcaPotvrdenia(db: any) {
  const { data: zoz, error } = await db.rpc("_portal_strazca_potvrdenia", { p_limit: 20 });
  if (error) return { ok: false, chyba: error.message };
  let odoslane = 0;
  const chyby: string[] = [];
  // deno-lint-ignore no-explicit-any
  for (const s of (zoz as any[]) ?? []) {
    try {
      const potvrdit = PORTAL + "strazca.php?a=potvrdit&t=" + encodeURIComponent(s.token);
      // jedno potvrdenie platí pre všetky čakajúce prihlásenia tejto adresy
      const popisy = (Array.isArray(s.popisy) && s.popisy.length ? s.popisy : [s.popis]).map((x: unknown) => String(x || "")).filter(Boolean);
      const co = popisy.length > 1
        ? `<p style="font-size:15px;line-height:1.55;margin:0 0 6px">zapli ste si strážcu ponúk:</p><ul style="font-size:15px;line-height:1.55;margin:0 0 14px;padding-left:20px">${popisy.map((x: string) => `<li><b>${esc(x)}</b></li>`).join("")}</ul>`
        : `<p style="font-size:15px;line-height:1.55;margin:0 0 14px">zapli ste si strážcu ponúk: <b>${esc(popisy[0] || "")}</b>.</p>`;
      const html = obalPortalu(`
        <p style="font-size:16px;margin:0 0 10px">Dobrý deň${s.meno ? ", " + esc(s.meno) : ""},</p>
        ${co}
        <p style="font-size:15px;line-height:1.55;margin:0 0 20px">Potvrďte prosím, že nové ponuky vám môžeme posielať na tento e-mail:</p>
        <p style="margin:0 0 8px"><a href="${esc(potvrdit)}" style="display:inline-block;background:#1e2a35;color:#fff;font-weight:700;font-size:15px;padding:12px 22px;border-radius:999px;text-decoration:none">Áno, posielajte mi ponuky</a></p>`,
        "Ak ste sa neprihlásili vy, tento e-mail pokojne ignorujte. Bez potvrdenia vám už nič nepríde.");
      await posli(s.email, "Potvrďte strážcu ponúk – Týpkove nehnuteľnosti", html, { odMeno: PORTAL_OD, odpovedat: PORTAL_ODPOVED });
      odoslane++;
    } catch (e) {
      chyby.push(String((e as Error).message || e));
      await db.rpc("_portal_strazca_potvrdenie_chyba", { p_id: s.id });
    }
  }
  return { ok: chyby.length === 0, odoslane, chyby };
}
// deno-lint-ignore no-explicit-any
async function portalStrazcaEmaily(db: any) {
  const { data: zoz, error } = await db.rpc("_portal_strazca_na_odoslanie", { p_limit: 20 });
  if (error) return { ok: false, chyba: error.message };
  let odoslane = 0;
  const chyby: string[] = [];
  // deno-lint-ignore no-explicit-any
  for (const s of (zoz as any[]) ?? []) {
    try {
      // deno-lint-ignore no-explicit-any
      const ponuky = (s.ponuky as any[]) || [];
      if (!ponuky.length) continue;
      const odhlasit = PORTAL + "strazca.php?a=odhlasit&t=" + encodeURIComponent(s.token);
      const karty = ponuky.map((x) => {
        const f = fotkaPonuky(x), u = /^https:\/\//.test(x.url || "") ? x.url : PORTAL;
        const kto = [x.makler_meno, x.kancelaria_nazov].filter(Boolean).join(" · ");
        return `<tr><td style="padding:0 0 18px">
          <a href="${esc(u)}" style="display:block;text-decoration:none;color:#1e2a35;border:1px solid #e6dccb;border-radius:14px;overflow:hidden;background:#fff">
            ${f ? `<img src="${esc(f)}" alt="" width="520" style="display:block;width:100%;max-width:520px;height:auto;border:0">` : ""}
            <div style="padding:14px 16px">
              ${x.nova_cena ? `<div style="display:inline-block;background:#fdecc8;color:#7a4b00;font-size:12px;font-weight:700;padding:3px 9px;border-radius:999px;margin-bottom:6px">Znížená cena</div>` : ""}
              <div style="font-size:17px;font-weight:700;line-height:1.3">${esc(nazovPonuky(x))}</div>
              <div style="font-size:14px;color:#5a6470;margin-top:4px">${esc(parametrePonuky(x))}</div>
              <div style="font-size:18px;font-weight:700;margin-top:8px">${esc(cenaPonuky(x))}</div>
              ${kto ? `<div style="font-size:13px;color:#5a6470;margin-top:6px">Maklér: ${esc(kto)}${x.makler_telefon ? " · " + esc(x.makler_telefon) : ""}</div>` : ""}
              <div style="margin-top:12px"><span style="display:inline-block;background:#1e2a35;color:#fff;font-weight:700;font-size:14px;padding:9px 16px;border-radius:999px">Pozrieť ponuku</span></div>
            </div></a></td></tr>`;
      }).join("");
      const jedna = ponuky.length === 1;
      const predmet = jedna
        ? (ponuky[0].nova_cena || s.cena ? "Znížená cena: " : "Nová ponuka: ") + nazovPonuky(ponuky[0]).slice(0, 70) + " – " + cenaPonuky(ponuky[0])
        : ponuky.length + " nové ponuky podľa toho, čo hľadáte";
      const html = obalPortalu(`
        <p style="font-size:16px;margin:0 0 10px">Dobrý deň${s.meno ? ", " + esc(s.meno) : ""},</p>
        <p style="font-size:15px;line-height:1.55;margin:0 0 18px">${s.cena ? "ponuka, ktorú sledujete, zlacnela:" : (jedna ? "pribudla ponuka, ktorá zodpovedá" : "pribudli ponuky, ktoré zodpovedajú") + ` tomu, čo hľadáte (<b>${esc(s.popis)}</b>):`}</p>
        <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%">${karty}</table>
        <p style="font-size:15px;line-height:1.55;margin:4px 0 0">Ak vás niektorá zaujala, napíšte maklérovi priamo pri ponuke. Správa mu príde hneď.</p>`,
        `Tento e-mail vám prišiel, lebo ste si v Týpkových nehnuteľnostiach zapli strážcu ponúk. Nové ponuky posielame najviac raz za 12 hodín.
          <a href="${esc(odhlasit)}" style="color:#7a828c">Vypnúť strážcu ponúk</a>`);
      await posli(s.email, predmet, html, {
        odMeno: PORTAL_OD, odpovedat: PORTAL_ODPOVED,
        hlavicky: { "List-Unsubscribe": `<${odhlasit}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
      });
      // odoslané sa označí až teraz – keď funkcia skončí skôr, ponuky sa pošlú pri ďalšom behu
      await db.rpc("_portal_strazca_odoslane", { p_id: s.id, p_ids: s.ids });
      odoslane++;
    } catch (e) {
      chyby.push(String((e as Error).message || e));
      await db.rpc("_portal_strazca_chyba", { p_id: s.id, p_ids: s.ids, p_chyba: String((e as Error).message || e) });
    }
  }
  return { ok: chyby.length === 0, odoslane, chyby };
}

async function sha256(t: string) {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t));
  return Array.from(new Uint8Array(h)).map((x) => x.toString(16).padStart(2, "0")).join("");
}

// ---------------------------------------------------------------- Odhad hodnoty (realitnytypek.sk/odhad, migrácia 108)
// 1) potvrdenie klientovi hneď po odoslaní žiadosti (od „Týpkove nehnuteľnosti“, odpoveď ide maklérovi)
// 2) odhad od makléra (tlačidlo „Poslať klientovi e-mailom“ v sekcii Odhady) – od mena makléra, odpoveď ide maklérovi
// Pri chybe sa nič neopakuje samo: potvrdenie nie je nutné a maklér vidí chybu pri žiadosti a môže odhad poslať znova alebo vlastným e-mailom.
const SVIATKY = ["01-01", "01-06", "05-01", "05-08", "07-05", "08-29", "09-15", "11-01", "12-24", "12-25", "12-26"];
const POZASTAVENE: Record<number, string[]> = { 2026: ["05-08", "09-15"] };   // v roku 2026 sa tieto sviatky nečerpajú (konsolidácia)
function velkaNoc(y: number) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3),
    h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451),
    mo = Math.floor((h + l - 7 * m + 114) / 31), da = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(y, mo - 1, da));
}
function pracovnyDen(d: Date) {   // d = dátum v UTC predstavujúci deň v Bratislave
  const wd = d.getUTCDay(); if (wd === 0 || wd === 6) return false;
  const y = d.getUTCFullYear(), md = String(d.getUTCMonth() + 1).padStart(2, "0") + "-" + String(d.getUTCDate()).padStart(2, "0");
  if (SVIATKY.includes(md) && !(POZASTAVENE[y] || []).includes(md)) return false;
  const vn = velkaNoc(y).getTime(), t = d.getTime();
  return t !== vn - 2 * 864e5 && t !== vn + 864e5;
}
function kedySaOzve(od: Date) {
  const s = od.toLocaleDateString("en-CA", { timeZone: "Europe/Bratislava" });   // YYYY-MM-DD
  const dnes = new Date(s + "T00:00:00Z"), zajtra = new Date(dnes.getTime() + 864e5);
  if (pracovnyDen(dnes) && pracovnyDen(zajtra)) return "do 24 hodín";
  const d = new Date(dnes.getTime() + 864e5);
  while (!pracovnyDen(d)) d.setUTCDate(d.getUTCDate() + 1);
  const dni = ["v nedeľu", "v pondelok", "v utorok", "v stredu", "vo štvrtok", "v piatok", "v sobotu"];
  return "najneskôr " + dni[d.getUTCDay()] + " " + d.getUTCDate() + ". " + (d.getUTCMonth() + 1) + ".";
}
function menoMaklera(m: { titul_pred?: string; meno?: string; titul_za?: string }) {
  return [m.titul_pred, m.meno].filter(Boolean).join(" ") + (m.titul_za ? ", " + m.titul_za : "");
}
const ODHAD_PODMIENKY = "https://realitnytypek.sk/odhad/#podmienky";
// deno-lint-ignore no-explicit-any
async function odhadEmaily(db: any) {
  const ted = new Date().toISOString(), vysl = { potvrdenia: 0, odhady: 0, chyby: [] as string[] };
  const kancelarie = await nazvyKancelarii(db);
  // deno-lint-ignore no-explicit-any
  const makleri = new Map<string, any>();
  async function makler(id: string) {
    if (!id) return null;
    if (!makleri.has(id)) {
      const { data } = await db.from("makleri").select("meno, titul_pred, titul_za, email, telefon, pohlavie, kancelaria_id").eq("id", id).maybeSingle();
      makleri.set(id, data);
    }
    return makleri.get(id);
  }
  const riadok = (k: string, v: string) => v ? `<tr><td style="padding:4px 14px 4px 0;color:#4a6074;vertical-align:top;white-space:nowrap">${k}</td><td style="padding:4px 0">${v}</td></tr>` : "";

  // 1) potvrdenia (len čerstvé – po dni už nemajú zmysel)
  const { data: pot } = await db.from("odhady_hodnoty")
    .update({ potvrdenie_poslat: false, potvrdenie_odoslane: ted })
    .eq("potvrdenie_poslat", true).gt("vytvorene", new Date(Date.now() - 864e5).toISOString())
    .select("id, meno, email, nazov, ulica, cislo, dovod, makler_id, kancelaria_id, vytvorene");
  await db.from("odhady_hodnoty").update({ potvrdenie_poslat: false }).eq("potvrdenie_poslat", true)
    .lte("vytvorene", new Date(Date.now() - 864e5).toISOString());   // staršie už nie
  // deno-lint-ignore no-explicit-any
  for (const o of (pot as any[]) ?? []) {
    try {
      if (!o.email) continue;
      // meno makléra klientovi neuvádzame (rozhodnutie 4. 11. 2026) – odpoveď na e-mail však ide maklérovi;
      // kontakt na predaj (migrácia 117) ešte makléra nemá – odpoveď ide na adresu Týpkových nehnuteľností
      const m = await makler(o.makler_id);
      const html = obalPortalu(`
        <p style="font-size:16px;margin:0 0 10px">Dobrý deň${o.meno ? ", " + esc(String(o.meno).split(" ")[0]) : ""},</p>
        <p style="font-size:15px;line-height:1.55;margin:0 0 12px">ďakujeme za žiadosť o odhad hodnoty nehnuteľnosti. ${m ? "Odovzdali sme ju maklérovi, ktorý vo vašom okolí pôsobí." : "Odovzdávame ju maklérovi, ktorý vo vašom okolí pôsobí."}</p>
        <p style="font-size:15px;line-height:1.55;margin:0 0 16px">Približnú hodnotu vám oznámi telefonicky alebo e-mailom <b>${esc(kedySaOzve(new Date(o.vytvorene)))}</b> (v pracovné dni).</p>
        <table role="presentation" style="border-collapse:collapse;font-size:14px;margin:0 0 16px;background:#fffdf8;border-radius:12px;padding:12px">
          ${riadok("Nehnuteľnosť", esc(o.nazov || ""))}${riadok("Adresa", esc([o.ulica, o.cislo].filter(Boolean).join(" ")))}${riadok("Dôvod", esc(o.dovod || ""))}</table>
        <p style="font-size:15px;line-height:1.55;margin:0">Ak chcete niečo doplniť, stačí odpísať na tento e-mail – ${m ? "správa pôjde priamo maklérovi." : "odovzdáme ju maklérovi, ktorý vám odhad pripraví."}</p>`,
        `Tento e-mail vám prišiel, lebo ste na realitnytypek.sk/odhad požiadali o odhad hodnoty nehnuteľnosti. Odhad je orientačný a nezáväzný – <a href="${ODHAD_PODMIENKY}" style="color:#7a828c">podmienky odhadu</a>.`);
      await posli(o.email, "Žiadosť o odhad hodnoty – " + String(o.nazov || "vaša nehnuteľnosť").slice(0, 90), html,
        { odMeno: PORTAL_OD, odpovedat: m?.email || PORTAL_ODPOVED });
      vysl.potvrdenia++;
    } catch (e) {
      const t = String((e as Error).message || e).slice(0, 300);
      vysl.chyby.push(t);
      await db.from("odhady_hodnoty").update({ potvrdenie_odoslane: null, potvrdenie_chyba: t }).eq("id", o.id);
    }
  }

  // 2) odhady od makléra
  const { data: odh } = await db.from("odhady_hodnoty")
    .update({ email_odoslany: ted })
    .not("email_poslat", "is", null).is("email_odoslany", null).is("email_chyba", null)
    .select("id, meno, email, nazov, ulica, cislo, cena_od, cena_do, text_klientovi, makler_id, email_kto, kancelaria_id, list_token");
  // deno-lint-ignore no-explicit-any
  for (const o of (odh as any[]) ?? []) {
    try {
      if (!o.email) throw new Error("klient nemá e-mail");
      const m = await makler(o.email_kto || o.makler_id) || await makler(o.makler_id);
      const kn = nazovK(kancelarie, m?.kancelaria_id ?? o.kancelaria_id);
      const mm = m ? menoMaklera(m) : kn;
      const tel = String(m?.telefon || "").trim();
      const suma = cisloSk(o.cena_od) + " €" + (o.cena_do && Number(o.cena_do) !== Number(o.cena_od) ? " – " + cisloSk(o.cena_do) + " €" : "");
      const datum = new Date().toLocaleDateString("sk-SK", { timeZone: "Europe/Bratislava", day: "numeric", month: "numeric", year: "numeric" });
      const text = esc(String(o.text_klientovi || "")).replace(/\r?\n/g, "<br>");
      const html = `<div style="background:#f7f2e8;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;color:#1e2a35">
        <table role="presentation" cellpadding="0" cellspacing="0" style="max-width:540px;width:100%;margin:0 auto"><tr><td>
        <p style="margin:0 0 4px;font-size:13px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#8a5a2b">Odhad hodnoty nehnuteľnosti</p>
        <p style="margin:0 0 18px;font-size:20px;font-weight:800;line-height:1.3">${esc(o.nazov || "Vaša nehnuteľnosť")}${o.ulica ? `<br><span style="font-size:15px;font-weight:400;color:#3a4b5a">${esc([o.ulica, o.cislo].filter(Boolean).join(" "))}</span>` : ""}</p>
        <div style="background:#1e2a35;border-radius:18px;padding:20px 22px;margin:0 0 20px">
          <p style="margin:0 0 6px;font-size:13px;color:#c9d4dd">Orientačná hodnota k ${esc(datum)}</p>
          <p style="margin:0;font-size:28px;font-weight:800;color:#db9522;letter-spacing:-.5px">${suma}</p></div>
        <div style="background:#fffdf8;border-radius:18px;padding:18px 22px;font-size:15px;line-height:1.6;margin:0 0 20px">${text}</div>
        ${o.list_token ? `<p style="margin:0 0 22px"><a href="${esc(WEB_URL + "odhad.html?t=" + o.list_token)}" style="display:inline-block;background:#db9522;color:#1e2a35;font-weight:700;font-size:15px;padding:12px 22px;border-radius:999px;text-decoration:none">Stiahnuť odhad v PDF</a></p>` : ""}
        <p style="margin:0;font-size:15px;line-height:1.5"><b>${esc(mm)}</b><br>${esc(kn)}${tel ? `<br><a href="tel:${esc(tel.replace(/[^\d+]/g, ""))}" style="color:#1e2a35">${esc(tel)}</a>` : ""}${m?.email ? `<br><a href="mailto:${esc(m.email)}" style="color:#1e2a35">${esc(m.email)}</a>` : ""}</p>
        <p style="font-size:12px;line-height:1.5;color:#7a828c;margin:26px 0 0;border-top:1px solid #e6dccb;padding-top:12px">Ide o orientačný odhad realitného makléra platný ku dňu vydania, nie o znalecký posudok. Presnejšiu cenu vie maklér určiť po obhliadke. Odhad je len pre vašu potrebu – <a href="${ODHAD_PODMIENKY}" style="color:#7a828c">podmienky odhadu</a>. Na tento e-mail môžete priamo odpísať.</p>
        </td></tr></table></div>`;
      await posli(o.email, "Odhad hodnoty: " + String(o.nazov || "vaša nehnuteľnosť").slice(0, 100), html,
        { odMeno: (mm + (kn && kn !== mm ? " · " + kn : "")).slice(0, 70), odpovedat: m?.email || PORTAL_ODPOVED });
      vysl.odhady++;
    } catch (e) {
      const t = String((e as Error).message || e).slice(0, 300);
      vysl.chyby.push(t);
      await db.from("odhady_hodnoty").update({ email_odoslany: null, email_chyba: t }).eq("id", o.id);
    }
  }
  // 3) fotky žiadostí starších ako 2 roky – zmazať z úložiska (žiadosť potom v noci zmaže databáza)
  const { data: stare } = await db.from("odhady_hodnoty").select("id, fotky_cesta")
    .not("fotky_cesta", "is", null).lt("vytvorene", new Date(Date.now() - 2 * 365.25 * 864e5).toISOString()).limit(20);
  // deno-lint-ignore no-explicit-any
  for (const o of (stare as any[]) ?? []) {
    const { data: subory } = await db.storage.from("odhady-fotky").list(o.fotky_cesta, { limit: 50 });
    // deno-lint-ignore no-explicit-any
    const cesty = ((subory as any[]) ?? []).map((x) => o.fotky_cesta + "/" + x.name);
    const { error } = cesty.length ? await db.storage.from("odhady-fotky").remove(cesty) : { error: null };
    if (!error) await db.from("odhady_hodnoty").update({ fotky_cesta: null, fotky: 0 }).eq("id", o.id);
  }
  return { ok: vysl.chyby.length === 0, ...vysl };
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
    .select("id, makler_id, inzerat_id, schrankovanie_id, nehnutelnost_id, zakaznik_id, cas, poznamka, druh");
  if (error) return Response.json({ ok: false, chyba: error.message }, { status: 500 });

  let odoslane = 0;
  const kancelarie = (rows ?? []).length ? await nazvyKancelarii(db) : new Map<number, string>();
  for (const p of rows ?? []) {
    try {
      const { data: m } = await db.from("makleri").select("meno, email, aktivny, kancelaria_id").eq("id", p.makler_id).maybeSingle();
      const kn = nazovK(kancelarie, m?.kancelaria_id);
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
      const ciel = p.zakaznik_id ? WEB_URL + "sprava.html#z/" + p.zakaznik_id : APP_URL;
      const html = `<div style="font-family:Arial,sans-serif;max-width:560px;color:#23272e">
        <div style="border-bottom:3px solid #dab967;padding-bottom:8px;font-size:18px"><b>${ikona} ${nazov}</b>
        <span style="color:#888;font-size:14px"> · ${esc(casSk(p.cas))}</span></div>
        <p style="font-size:16px;margin:16px 0 0">${esc(p.poznamka || "Pripomienka bez poznámky")}</p>${suvis}
        <p style="margin:22px 0"><a href="${esc(ciel)}" style="background:#dab967;color:#1f2a37;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:700">${p.zakaznik_id ? "Otvoriť v Správe zákazníkov" : "Otvoriť Realitného týpka"}</a></p>
        <p style="color:#999;font-size:12px">Realitný týpek · ${esc(kn)}</p></div>`;
      const predmet = p.druh && p.druh !== "pripomienka" ? ikona + " " + String(p.poznamka).slice(0, 110) : ikona + " " + nazov + ": " + (p.poznamka || "skener").slice(0, 80);
      await posli(m.email, predmet, html, { odMeno: "Realitný týpek · " + kn });
      odoslane++;
    } catch (e) {
      await db.from("pripomienky").update({ email_chyba: String((e as Error).message || e).slice(0, 300) }).eq("id", p.id);
    }
  }
  const web = await webZiadosti(db).catch(() => 0);
  const registracie = await registracneEmaily(db).catch((e) => ({ ok: false, chyba: String((e as Error).message || e) }));
  const skusobna = await skusobnaEmaily(db).catch((e) => ({ ok: false, chyba: String((e as Error).message || e) }));
  const potvrdenia = await strazcaPotvrdenia(db).catch((e) => ({ ok: false, chyba: String((e as Error).message || e) }));
  const strazca = await strazcaEmaily(db).catch((e) => ({ ok: false, chyba: String((e as Error).message || e) }));
  const portal = {
    potvrdenia: await portalStrazcaPotvrdenia(db).catch((e) => ({ ok: false, chyba: String((e as Error).message || e) })),
    strazca: await portalStrazcaEmaily(db).catch((e) => ({ ok: false, chyba: String((e as Error).message || e) })),
  };
  const odhad = await odhadEmaily(db).catch((e) => ({ ok: false, chyba: String((e as Error).message || e) }));
  return Response.json({ ok: true, odoslane, web, registracie, skusobna, potvrdenia, strazca, portal, odhad });
});
