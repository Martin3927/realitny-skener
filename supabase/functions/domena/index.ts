// Vlastná doména pre web makléra a web kancelárie.
//  • akcia "dostupnost": je doména voľná? .sk/.cz/.eu sa pýta priamo registra (WHOIS), ostatné cez RDAP podľa IANA
//  • akcia "overit": skontroluje DNS – TXT záznam s kódom (vlastníctvo) a A/CNAME na náš server (smerovanie)
//    a výsledok zapíše do databázy; pri overenej a nasmerovanej doméne dostane admin žiadosť o pripojenie
//  • akcia "info": IP adresy nášho servera (čo má maklér nastaviť v A zázname)
// Volá ju editor webu; overuje prihlásenie makléra. Limit 40 dopytov za hodinu na makléra.
import { createClient } from "jsr:@supabase/supabase-js@2";

const CIEL = "app.realitnytypek.sk";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...CORS, "Content-Type": "application/json" } });

function cistaDomena(v: unknown) {
  return String(v ?? "").trim().toLowerCase().replace(/^(https?:\/\/)?(www\.)?/, "").replace(/[/?#].*$/, "");
}
const PLATNA = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/;

function sCasom<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error("čas vypršal")), ms))]);
}

async function whois(host: string, dotaz: string): Promise<string> {
  const c = await sCasom(Deno.connect({ hostname: host, port: 43 }), 5000);
  try {
    await c.write(new TextEncoder().encode(dotaz + "\r\n"));
    const casti: Uint8Array[] = [];
    let spolu = 0;
    const buf = new Uint8Array(4096);
    const koniec = Date.now() + 7000;
    while (Date.now() < koniec && spolu < 65536) {
      const n = await sCasom(c.read(buf), Math.max(500, koniec - Date.now()));
      if (n === null) break;
      casti.push(buf.slice(0, n));
      spolu += n;
    }
    const vsetko = new Uint8Array(spolu);
    let i = 0;
    for (const x of casti) { vsetko.set(x, i); i += x.length; }
    return new TextDecoder().decode(vsetko);
  } finally {
    try { c.close(); } catch { /* už zatvorené */ }
  }
}

async function dns(meno: string, typ: string): Promise<{ status: number; data: string[] }> {
  const zdroje = [
    `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(meno)}&type=${typ}`,
    `https://dns.google/resolve?name=${encodeURIComponent(meno)}&type=${typ}`,
  ];
  for (const u of zdroje) {
    try {
      const r = await sCasom(fetch(u, { headers: { accept: "application/dns-json" } }), 5000);
      if (!r.ok) continue;
      const j = await r.json();
      const typy: Record<string, number> = { A: 1, CNAME: 5, NS: 2, TXT: 16, AAAA: 28 };
      // deno-lint-ignore no-explicit-any
      const data = ((j.Answer || []) as any[]).filter((a) => a.type === typy[typ]).map((a) => String(a.data).replace(/^"|"$/g, "").replace(/"\s*"/g, "").replace(/\.$/, ""));
      return { status: Number(j.Status), data };
    } catch { /* skúsi ďalší */ }
  }
  throw new Error("DNS teraz neodpovedá");
}

let rdapMapa: Record<string, string> | null = null;
async function rdapServer(tld: string) {
  if (!rdapMapa) {
    rdapMapa = {};
    const r = await sCasom(fetch("https://data.iana.org/rdap/dns.json"), 6000);
    const j = await r.json();
    for (const s of j.services || []) for (const t of s[0]) rdapMapa[t] = String(s[1][0]).replace(/\/?$/, "/");
  }
  return rdapMapa[tld] || "";
}

async function dostupnost(d: string) {
  const tld = d.split(".").pop()!;
  try {
    if (tld === "sk") {
      const t = await whois("whois.sk-nic.sk", d);
      if (/Domain not found/i.test(t)) return { stav: "volna", zdroj: "SK-NIC" };
      if (/^Domain:\s/m.test(t)) {
        const m = t.match(/^Valid Until:\s*(\S+)/m);
        return { stav: "obsadena", zdroj: "SK-NIC", platnost: m ? m[1] : null };
      }
    } else if (tld === "cz") {
      const t = await whois("whois.nic.cz", d);
      if (/no entries found/i.test(t)) return { stav: "volna", zdroj: "CZ.NIC" };
      if (/^domain:\s/mi.test(t)) {
        const m = t.match(/^expire:\s*(\S+)/m);
        return { stav: "obsadena", zdroj: "CZ.NIC", platnost: m ? m[1] : null };
      }
    } else if (tld === "eu") {
      const t = await whois("whois.eu", d);
      if (/Status:\s*AVAILABLE/i.test(t)) return { stav: "volna", zdroj: "EURid" };
      if (/^Domain:\s/m.test(t)) return { stav: "obsadena", zdroj: "EURid" };
    } else {
      const srv = await rdapServer(tld);
      if (srv) {
        const r = await sCasom(fetch(srv + "domain/" + encodeURIComponent(d), { headers: { accept: "application/rdap+json" } }), 6000);
        if (r.status === 404) return { stav: "volna", zdroj: "RDAP" };
        if (r.ok) {
          const j = await r.json();
          // deno-lint-ignore no-explicit-any
          const exp = ((j.events || []) as any[]).find((e) => e.eventAction === "expiration");
          return { stav: "obsadena", zdroj: "RDAP", platnost: exp ? String(exp.eventDate).slice(0, 10) : null };
        }
      }
    }
  } catch { /* náhradné overenie cez DNS nižšie */ }
  // náhrada: DNS vie povedať len to, že doména určite existuje
  try {
    const r = await dns(d, "NS");
    if (r.status === 3) return { stav: "asi_volna", zdroj: "DNS" };
    return { stav: "obsadena", zdroj: "DNS" };
  } catch {
    return { stav: "nezname" };
  }
}

async function cielIp() {
  return (await dns(CIEL, "A")).data.sort();
}

async function overit(d: string, token: string) {
  const [txt, a, cname, wwwC, wwwA, ip] = await Promise.all([
    dns("_realitnytypek." + d, "TXT").catch(() => ({ status: -1, data: [] as string[] })),
    dns(d, "A").catch(() => ({ status: -1, data: [] as string[] })),
    dns(d, "CNAME").catch(() => ({ status: -1, data: [] as string[] })),
    dns("www." + d, "CNAME").catch(() => ({ status: -1, data: [] as string[] })),
    dns("www." + d, "A").catch(() => ({ status: -1, data: [] as string[] })),
    cielIp().catch(() => [] as string[]),
  ]);
  const vlastnictvo = txt.data.some((x) => x.trim() === token);
  const naNas = (ipZoz: string[]) => ipZoz.length > 0 && ipZoz.every((x) => ip.includes(x));
  const smeruje = cname.data.includes(CIEL) || naNas(a.data);
  const www = wwwC.data.includes(CIEL) || wwwC.data.includes(d) || naNas(wwwA.data);
  return { vlastnictvo, smeruje, www, ip, a: a.data, txt: txt.data.slice(0, 5) };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ chyba: "Nepovolená metóda." }, 405);
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

  // diagnostika servera (dostupnosť a IP bez prihlásenia) – len s kľúčom, ktorého odtlačok je v tabuľke nastavenia
  const klucD = req.headers.get("x-kluc") || "";
  if (klucD) {
    const { data: n } = await db.from("nastavenia").select("hodnota").eq("kluc", "domena_diagnostika_hash").maybeSingle();
    const h = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(klucD)))).map((x) => x.toString(16).padStart(2, "0")).join("");
    if (!n?.hodnota || n.hodnota !== h) return json({ chyba: "Nepovolené." }, 401);
    // deno-lint-ignore no-explicit-any
    let t: any = {};
    try { t = await req.json(); } catch { /* prázdne */ }
    if (t.akcia === "info") return json({ ok: true, ciel: CIEL, ip: await cielIp() });
    const d = cistaDomena(t.domena);
    if (!PLATNA.test(d)) return json({ chyba: "Neplatná doména." }, 400);
    if (t.akcia === "dns") return json({ ok: true, ...(await overit(d, String(t.token || ""))) });
    return json({ ok: true, domena: d, ...(await dostupnost(d)) });
  }

  // prihlásený a aktívny maklér
  const jwt = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: u } = jwt ? await db.auth.getUser(jwt) : { data: null };
  const id = u?.user?.id;
  if (!id) return json({ chyba: "Prihlás sa v Realitnom týpkovi." }, 401);
  const { data: ja } = await db.from("makleri").select("id, rola, aktivny").eq("id", id).maybeSingle();
  if (!ja?.aktivny) return json({ chyba: "Účet nie je aktívny." }, 403);

  // deno-lint-ignore no-explicit-any
  let telo: any = {};
  try { telo = await req.json(); } catch { /* prázdne */ }
  const akcia = String(telo.akcia || "");

  const { count } = await db.from("web_domena_dotazy").select("id", { count: "exact", head: true })
    .eq("makler_id", id).gte("cas", new Date(Date.now() - 3600e3).toISOString());
  if ((count || 0) >= 40) return json({ chyba: "Príliš veľa kontrol za hodinu. Skús to neskôr." }, 429);
  await db.from("web_domena_dotazy").insert({ makler_id: id });

  try {
    if (akcia === "info") return json({ ok: true, ciel: CIEL, ip: await cielIp() });

    if (akcia === "dostupnost") {
      const d = cistaDomena(telo.domena);
      if (!PLATNA.test(d)) return json({ chyba: "Napíš doménu v tvare mojemeno.sk" }, 400);
      return json({ ok: true, domena: d, ...(await dostupnost(d)) });
    }

    if (akcia === "overit") {
      // web kancelárie (len administrátor) alebo osobný web makléra
      const kanc = telo.kancelaria === true;
      if (kanc && ja.rola !== "admin") return json({ chyba: "Web kancelárie môže kontrolovať len administrátor." }, 403);
      const ciel = telo.makler && telo.makler !== id ? String(telo.makler) : id;
      if (!kanc && ciel !== id && ja.rola !== "admin") return json({ chyba: "Web iného makléra môže kontrolovať len administrátor." }, 403);
      const { data: w } = kanc
        ? await db.from("weby").select("id, domena, domena_token").eq("kancelaria", true).maybeSingle()
        : await db.from("weby").select("id, domena, domena_token").eq("makler_id", ciel).eq("kancelaria", false).maybeSingle();
      if (!w?.domena || !w.domena_token) return json({ chyba: "Najprv ulož doménu." }, 400);
      const v = await overit(w.domena, w.domena_token);
      const { data: zapis, error } = await db.rpc("_zapis_kontrolu_domeny", { p_web: w.id, p_domena: w.domena, p_txt: v.vlastnictvo, p_smeruje: v.smeruje });
      if (error) throw error;
      return json({ ok: true, domena: w.domena, ...v, ...(zapis || {}) });
    }
    return json({ chyba: "Neznáma akcia." }, 400);
  } catch (e) {
    console.error("domena:", String((e as Error).message || e).slice(0, 300));
    return json({ chyba: "Kontrola teraz nefunguje. Skús to o chvíľu." }, 502);
  }
});
