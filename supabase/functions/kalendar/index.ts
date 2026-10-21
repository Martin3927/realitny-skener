// Odber kalendára makléra vo formáte iCalendar (.ics) – Google Kalendár, Apple Kalendár, Outlook.
//   GET /functions/v1/kalendar?t=<tajný kľúč makléra>
// Obsahuje udalosti, obhliadky, pripomienky a konce zmlúv. Kalendáre si odber obnovujú samy (Google cca každých 8–24 h).
import { createClient } from "jsr:@supabase/supabase-js@2";

function esc(s: unknown) {
  return String(s ?? "").replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}
function utc(d: string | Date) {
  return new Date(d).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}
function den(d: string) { return d.slice(0, 10).replace(/-/g, ""); }
function dalsiDen(d: string) { const x = new Date(d.slice(0, 10) + "T12:00:00Z"); x.setUTCDate(x.getUTCDate() + 1); return x.toISOString().slice(0, 10).replace(/-/g, ""); }
// riadky dlhšie ako 75 znakov sa podľa normy zalamujú
function zlom(r: string) {
  const out: string[] = []; let s = r;
  while (new TextEncoder().encode(s).length > 73) { let n = 73; while (new TextEncoder().encode(s.slice(0, n)).length > 73) n--; out.push(s.slice(0, n)); s = " " + s.slice(n); }
  out.push(s); return out.join("\r\n");
}

Deno.serve(async (req) => {
  const t = new URL(req.url).searchParams.get("t") || "";
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const { data, error } = await db.rpc("_kalendar_feed", { p_token: t });
  if (error) return new Response("Chyba", { status: 500 });
  if (!data) return new Response("Neplatný odkaz na kalendár", { status: 404 });
  const ted = utc(new Date());
  const ev: string[] = [];
  function pridaj(uid: string, nazov: string, zac: string, kon: string | null, celyDen: boolean, miesto?: string, popis?: string, alarmMin?: number) {
    const r = ["BEGIN:VEVENT", "UID:" + uid + "@realitny-typek", "DTSTAMP:" + ted, "SUMMARY:" + esc(nazov)];
    if (celyDen) { r.push("DTSTART;VALUE=DATE:" + den(zac), "DTEND;VALUE=DATE:" + dalsiDen(zac)); }
    else { r.push("DTSTART:" + utc(zac), "DTEND:" + utc(kon || new Date(new Date(zac).getTime() + 3600e3))); }
    if (miesto) r.push("LOCATION:" + esc(miesto));
    if (popis) r.push("DESCRIPTION:" + esc(popis));
    if (alarmMin) r.push("BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:" + esc(nazov), "TRIGGER:-PT" + alarmMin + "M", "END:VALARM");
    r.push("END:VEVENT");
    ev.push(r.map(zlom).join("\r\n"));
  }
  const TYP: Record<string, string> = { stretnutie: "🤝", obhliadka: "🗝️", podpis: "✍️", telefonat: "📞", osobne: "🙂", ine: "📌" };
  // deno-lint-ignore no-explicit-any
  for (const u of (data.udalosti as any[]) || []) {
    const popis = [u.mena ? "👥 " + u.mena : "", u.poznamka || ""].filter(Boolean).join("\n");
    pridaj("u" + u.id, (TYP[u.typ] || "") + " " + u.nazov, u.zaciatok, u.koniec, u.cely_den, u.miesto, popis, u.cely_den ? 0 : 30);
  }
  // deno-lint-ignore no-explicit-any
  for (const o of (data.obhliadky as any[]) || []) pridaj("o" + o.id, "🗝️ Obhliadka: " + o.nazov, o.cas, null, false, o.miesto, [o.klient, o.telefon].filter(Boolean).join(", "), 60);
  // deno-lint-ignore no-explicit-any
  for (const p of (data.pripomienky as any[]) || []) if (p.druh === "pripomienka") pridaj("p" + p.id, "🔔 " + String(p.poznamka || "Pripomienka").slice(0, 120), p.cas, new Date(new Date(p.cas).getTime() + 15 * 60000).toISOString(), false, "", p.poznamka, 0);
  // deno-lint-ignore no-explicit-any
  for (const z of (data.zmluvy as any[]) || []) pridaj("z" + z.id + "-" + z.do, "📝 Končí zmluva: " + z.nazov, z.do, null, true, "", z.majitel ? "Majiteľ: " + z.majitel : "", 0);
  const ics = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Alpha Reality//Realitny typek//SK", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    zlom("X-WR-CALNAME:Realitný týpek – " + esc(data.meno)), "X-WR-TIMEZONE:Europe/Bratislava", "REFRESH-INTERVAL;VALUE=DURATION:PT1H", "X-PUBLISHED-TTL:PT1H",
    ...ev, "END:VCALENDAR"].join("\r\n") + "\r\n";
  return new Response(ics, { headers: { "Content-Type": "text/calendar; charset=utf-8", "Cache-Control": "no-cache", "Content-Disposition": 'inline; filename="realitny-typek.ics"' } });
});
