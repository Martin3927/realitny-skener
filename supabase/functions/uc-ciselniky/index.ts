// Načíta číselníky lokalít Realsoftu (kraje, okresy, obce, časti, ulice SR) z dokumentácie United Classifieds do databázy.
// Spustí administrátor (alebo ktokoľvek, kým sú tabuľky prázdne – prvé naplnenie).
import { createClient } from "jsr:@supabase/supabase-js@2";

const ZAKLAD = "https://plt.unitedclassifieds.sk/import/docs/v1/realsoft/assets/js/";
const CHUNKY: Record<string, string> = { kraj: "5574", okres: "5990", obec: "4444", cast: "9079", ulica: "2471" };

// webpack: JSON.parse('...') – odstránenie JS escapovania
function jsRetazec(s: string): string {
  let o = "";
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c !== "\\") { o += c; continue; }
    const n = s[++i];
    if (n === "x") { o += String.fromCharCode(parseInt(s.substr(i + 1, 2), 16)); i += 2; }
    else if (n === "u") { o += String.fromCharCode(parseInt(s.substr(i + 1, 4), 16)); i += 4; }
    else if (n === "n") o += "\n"; else if (n === "t") o += "\t"; else if (n === "r") o += "\r";
    else o += n; // \\ \' \"
  }
  return o;
}
async function chunk(id: string, hash: string) {
  const t = await (await fetch(ZAKLAD + id + "." + hash + ".js")).text();
  const z = t.indexOf("JSON.parse('"), k = t.lastIndexOf("')");
  if (z < 0 || k < 0) throw new Error("Neznámy formát číselníka " + id);
  return JSON.parse(jsRetazec(t.slice(z + 12, k)));
}

Deno.serve(async (req) => {
  const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type" };
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const krokQ = new URL(req.url).searchParams.get("krok") || "lokality";
  // kým nie je prvé naplnenie hotové (časti obcí aj ulice), môže import spustiť ktokoľvek; potom len administrátor
  const { count: casti } = await db.from("uc_cast").select("*", { count: "exact", head: true });
  const { count: ulice } = await db.from("uc_ulica").select("*", { count: "exact", head: true });
  const hotovo = (casti || 0) > 0 && (ulice || 0) > 10000;
  if (hotovo) {
    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const { data: u } = await db.auth.getUser(token);
    const { data: m } = u?.user ? await db.from("makleri").select("rola, aktivny").eq("id", u.user.id).maybeSingle() : { data: null };
    if (!m || m.rola !== "admin" || !m.aktivny) return json({ chyba: "Číselníky môže obnoviť len administrátor." }, 403);
  }
  try {
    // názvy súborov sa menia s verziou dokumentácie → zistíme ich z runtime skriptu
    const html = await (await fetch("https://plt.unitedclassifieds.sk/import/docs/v1/realsoft/docs/import/counters/region")).text();
    const rt = (html.match(/runtime~main\.[0-9a-f]+\.js/) || [])[0];
    if (!rt) throw new Error("Nenašiel som skript dokumentácie.");
    const rtText = await (await fetch(ZAKLAD + rt)).text();
    const hash = (id: string) => { const m = rtText.match(new RegExp("[,{]" + id + ':"([0-9a-f]{8})"', "g")); return m ? m[m.length - 1].split('"')[1] : null; };
    const krok = new URL(req.url).searchParams.get("krok") || "lokality";
    const n = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));
    async function vloz(tab: string, vstup: any[], kluc: string) {
      const jedinecne = new Map<unknown, any>(); for (const r of vstup) jedinecne.set(r[kluc], r);
      const riadky = Array.from(jedinecne.values());
      for (let i = 0; i < riadky.length; i += 3000) {
        const { error } = await db.from(tab).upsert(riadky.slice(i, i + 3000), { onConflict: kluc });
        if (error) throw new Error(tab + ": " + error.message);
      }
    }
    if (krok === "ulice") {
      // ulice sú veľký súbor (celé SR aj ČR) – čítame ho postupne regulárnym výrazom, bez prevodu celého súboru
      // zoznam obcí SR po stránkach (databáza vráti naraz najviac 1000 riadkov)
      const ok = new Set<string>();
      for (let od = 0; ; od += 1000) {
        const { data, error } = await db.from("uc_obec").select("region_id").order("region_id").range(od, od + 999);
        if (error) throw new Error(error.message);
        (data || []).forEach((x: any) => ok.add(String(x.region_id)));
        if (!data || data.length < 1000) break;
      }
      const h = hash(CHUNKY.ulica); if (!h) throw new Error("Chýba číselník ulíc");
      const t = await (await fetch(ZAKLAD + CHUNKY.ulica + "." + h + ".js")).text();
      const re = /\{"street_id":"(\d+)","citypart_id":"(\d+)","region_id":"(\d+)","name":"((?:[^"\\]|\\.)*)"/g;
      let m: RegExpExecArray | null, davka: any[] = [], spolu = 0;
      while ((m = re.exec(t))) {
        if (!ok.has(m[3])) continue;
        davka.push({ street_id: Number(m[1]), region_id: Number(m[3]), citypart_id: Number(m[2]) || null, nazov: jsRetazec(m[4]).replace(/\\"/g, '"') });
        if (davka.length >= 3000) { await vloz("uc_ulica", davka, "street_id"); spolu += davka.length; davka = []; }
      }
      if (davka.length) { await vloz("uc_ulica", davka, "street_id"); spolu += davka.length; }
      return json({ ok: true, obce: ok.size, ulice: spolu });
    }
    const D: Record<string, any[]> = {};
    for (const k of ["kraj", "okres", "obec", "cast"]) { const h = hash(CHUNKY[k]); if (!h) throw new Error("Chýba číselník " + k); D[k] = await chunk(CHUNKY[k], h); }
    const kraje = D.kraj.filter((x) => x.state_id === "1");
    const krajIds = new Set(kraje.map((x) => x.county_id));
    const okresy = D.okres.filter((x) => krajIds.has(x.county_id));
    const okresIds = new Set(okresy.map((x) => x.district_id));
    const obce = D.obec.filter((x) => okresIds.has(x.district_id));
    const obecIds = new Set(obce.map((x) => x.region_id));
    const castiD = D.cast.filter((x) => obecIds.has(x.region_id));
    await vloz("uc_kraj", kraje.map((x) => ({ county_id: n(x.county_id), state_id: 1, nazov: x.name })), "county_id");
    await vloz("uc_okres", okresy.map((x) => ({ district_id: n(x.district_id), county_id: n(x.county_id), nazov: x.name })), "district_id");
    await vloz("uc_obec", obce.map((x) => ({ region_id: n(x.region_id), district_id: n(x.district_id), nazov: x.name, psc: x.psc || null, lat: n(x.latitude), lon: n(x.longitude) })), "region_id");
    await vloz("uc_cast", castiD.map((x) => ({ citypart_id: n(x.citypart_id), region_id: n(x.region_id), parent_id: n(x.citypart_parent_id) || null, nazov: x.name })), "citypart_id");
    return json({ ok: true, kraje: kraje.length, okresy: okresy.length, obce: obce.length, casti: castiD.length, dalej: "?krok=ulice" });
  } catch (e) {
    return json({ chyba: String((e as Error).message || e) }, 500);
  }
});
