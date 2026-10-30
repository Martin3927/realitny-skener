// AI v Realitnom skeneri (Claude Sonnet 5.5):
//  * KONTROLA (volá databáza s kľúčom x-kluc – hneď po uložení nového inzerátu a každých 10 minút):
//    posúdi inzeráty, ktoré skener nezaradil medzi realitky – súkromník, asi realitka, alebo neisté – a zapíše do inzeraty_ai.
//    AI len označuje, inzerát nepresúva (o tom rozhoduje maklér).
//  * NÁVRH HOVORU (volá aplikácia s prihlásením makléra): čo povedať v prvom telefonáte a SMS pre predajcu.
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const DAVKA = 10;
const PORTAL: Record<string, string> = { bazos: "Bazoš", nehnutelnosti: "Nehnutelnosti.sk", reality: "Reality.sk", topreality: "TopReality.sk" };

const SYSTEM_KONTROLA = `Si skúsený slovenský realitný maklér. Posudzuješ inzeráty z portálov (Bazoš, Nehnutelnosti.sk, Reality.sk, TopReality.sk), ktoré skener nezaradil medzi realitné kancelárie. Zisti, či inzeruje súkromný predajca (majiteľ), alebo realitná kancelária či maklér, ktorí sa tvária ako súkromník.

Znaky realitky: text v tretej osobe a reklamný štýl („ponúkame na predaj“, „exkluzívne“, „v ponuke našej kancelárie“, „pre našich klientov“), zmienka o provízii, maklérovi alebo obhliadke „po dohode s maklérom“, hypotéka či právny servis ako služba, číslo alebo kód ponuky, štruktúra z realitného softvéru (dlhý zoznam parametrov s odrážkami, „cena vrátane provízie“), vodotlač alebo logo realitky na fotke, profesionálne fotky, meno predajcu ako firma.
Znaky súkromníka: prvá osoba („predám svoj byt“, „predávame byt po rodičoch“), osobné dôvody predaja, hovorový štýl, preklepy, „RK nevolať“, amatérske fotky z mobilu, krátky text.
Pozor: aj súkromníci niekedy píšu „ponúkame“ alebo dajú dlhší zoznam parametrov – jeden slabý znak nestačí. Prehliadnuť skutočného súkromníka je pre makléra drahé, preto „rk“ daj len pri jasných znakoch; keď to nie je jasné, daj „neiste“.

Vráť IBA JSON bez ďalšieho textu a bez \`\`\`:
{"verdikt": "sukromny" alebo "rk" alebo "neiste", "istota": číslo 0 až 100, "dovod": "jedna krátka veta po slovensky (najviac 15 slov) – konkrétne, čo rozhodlo"}`;

const SYSTEM_HOVOR = `Si skúsený realitný maklér. Pripravuješ kolegu na prvý kontakt so súkromným predajcom, ktorý sám inzeruje nehnuteľnosť.
Vráť IBA JSON bez ďalšieho textu a bez \`\`\`: {"hovor": "…", "sms": "…"}

"hovor": čo povedať v prvých 30 sekundách telefonátu – 3 až 5 krátkych viet hovorovou slovenčinou, vykanie. Maklér sa predstaví menom a kanceláriou, spomenie 1–2 konkrétne veci z inzerátu (aby bolo jasné, že ho čítal), ponúkne úžitok bez tlaku (kupujúci, ktorí hľadajú v okolí; pomoc s cenou, katastrom a zmluvami; predajca nemusí nič riešiť sám) a skončí otázkou (napr. či je nehnuteľnosť ešte na predaj alebo kedy by sa hodila krátka obhliadka). Bez úvodzoviek a poznámok v zátvorkách.
"sms": jedna SMS najviac 300 znakov, vykanie, bez emoji. Spomeň konkrétny inzerát (typ a obec), meno makléra, kanceláriu a telefón.

Ak predajca v inzeráte píše, že si neželá realitky, buď obzvlášť ohľaduplný: v hovore to hneď na začiatku rešpektuj a ponúkni len nezáväznú pomoc alebo kupujúceho.
Nevymýšľaj fakty, ktoré v inzeráte nie sú. Píš po slovensky, bez anglicizmov.`;

async function sha256(t: string) {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t));
  return Array.from(new Uint8Array(h)).map((x) => x.toString(16).padStart(2, "0")).join("");
}

// deno-lint-ignore no-explicit-any
async function claude(kluc: string, system: string, content: any[], maxTokens: number, effort: string) {
  const model = Deno.env.get("AI_MODEL") || "claude-sonnet-5-5";
  const bezPremyslania = model.startsWith("claude-sonnet-5-5") ? { thinking: { type: "between_tools" }, output_config: { effort } } : {};
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": kluc, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model, max_tokens: maxTokens, ...bezPremyslania, system, messages: [{ role: "user", content }] }),
  });
  // deno-lint-ignore no-explicit-any
  const d: any = await r.json().catch(() => ({}));
  // deno-lint-ignore no-explicit-any
  const text = ((d.content as any[]) || []).filter((c) => c.type === "text").map((c) => c.text).join("\n");
  // deno-lint-ignore no-explicit-any
  let v: any = null;
  try { v = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)); } catch { /* nečitateľné */ }
  return { ok: r.ok, status: r.status, model, v, stop: d.stop_reason, vstup: d.usage?.input_tokens, vystup: d.usage?.output_tokens, chyba: d.error?.message };
}

// deno-lint-ignore no-explicit-any
function opisInzeratu(z: any) {
  return [
    "Portál: " + (PORTAL[z.portal] || z.portal) + ((z.portaly || []).length > 1 ? " (aj na: " + (z.portaly || []).map((p: string) => PORTAL[p] || p).join(", ") + ")" : ""),
    "Nadpis: " + (z.nazov || ""),
    "Typ: " + (z.typ || "") + (z.podtyp ? " / " + z.podtyp : "") + (z.izby ? ", " + z.izby + " izby" : ""),
    "Obec: " + (z.obec || "okres " + (z.okres || "")),
    "Cena: " + (z.cena ? z.cena + " €" : "neuvedená") + (z.plocha ? ", plocha " + z.plocha + " m²" : ""),
    "Meno predajcu na portáli: " + (z.predajca || "neuvedené"),
    "Odhad skenera podľa pravidiel: " + (z.predajca_typ || "?") + (z.predajca_dovod ? " (" + z.predajca_dovod + ")" : ""),
    "",
    "TEXT INZERÁTU:",
    String(z.popis || "(bez textu)").slice(0, 4000),
  ].join("\n");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
  const kluc = Deno.env.get("ANTHROPIC_API_KEY");
  if (!kluc) return json({ chyba: "AI ešte nie je zapnutá – administrátor musí doplniť kľúč ANTHROPIC_API_KEY v nastaveniach Supabase." }, 503);
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  // deno-lint-ignore no-explicit-any
  let telo: any = {};
  try { telo = await req.json(); } catch { /* nič */ }

  // ---------------------------------------------------------------- NÁVRH HOVORU (prihlásený maklér)
  if (telo.hovor) {
    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const { data: u } = await db.auth.getUser(token);
    if (!u?.user) return json({ chyba: "Prihláste sa znova." }, 401);
    const { data: m } = await db.from("makleri").select("id, meno, telefon, aktivny, rola, pristup").eq("id", u.user.id).maybeSingle();
    if (!m?.aktivny || (m.rola !== "admin" && !(m.pristup || []).includes("inzeraty"))) return json({ chyba: "Nemáte prístup k Realitnému skeneru." }, 403);
    if (m.rola !== "admin" && !(m.pristup || []).includes("asistent")) return json({ chyba: "AI vám administrátor zatiaľ nezapol." }, 403);
    const { data: z } = await db.from("inzeraty").select("*").eq("id", String(telo.hovor)).maybeSingle();
    if (!z) return json({ chyba: "Inzerát sa nenašiel." }, 404);
    const limit = Math.max(1, Math.floor(Number(Deno.env.get("AI_DENNY_LIMIT"))) || 50);
    const { data: vLimite, error: chybaLimitu } = await db.rpc("asistent_pocitaj", { p_makler: m.id, p_limit: limit });
    if (!chybaLimitu && vLimite === false) return json({ chyba: "Dnes ste už AI použili " + limit + "-krát, čo je denný limit. Zajtra môžete pokračovať." }, 429);
    const o = await claude(kluc, SYSTEM_HOVOR, [{ type: "text", text:
      "MAKLÉR: " + (m.meno || "") + (m.telefon ? ", tel. " + m.telefon : "") + "\nKANCELÁRIA: Alpha Reality\n\nINZERÁT\n" + opisInzeratu(z) }], 1200, "medium");
    console.log("ai-skener hovor", JSON.stringify({ model: o.model, status: o.status, stop: o.stop, vstup: o.vstup, vystup: o.vystup }));
    if (!o.ok) return json({ chyba: "AI teraz neodpovedá (" + o.status + "). Skúste to o chvíľu." }, 502);
    const hovor = String(o.v?.hovor || "").trim().slice(0, 1200), sms = String(o.v?.sms || "").replace(/\s+/g, " ").trim().slice(0, 400);
    if (!hovor && !sms) return json({ chyba: "AI neposlala návrh. Skúste to znova." }, 502);
    await db.from("inzeraty_ai").upsert({ inzerat_id: z.id, hovor, sms, hovor_vytvoril: m.id, hovor_vytvorene: new Date().toISOString() }, { onConflict: "inzerat_id" });
    return json({ hovor, sms });
  }

  // ---------------------------------------------------------------- KONTROLA (databáza s kľúčom)
  const { data: n } = await db.from("nastavenia").select("hodnota").eq("kluc", "pripomienky_kluc_hash").maybeSingle();
  const xk = req.headers.get("x-kluc") || "";
  if (!n?.hodnota || !xk || (await sha256(xk)) !== n.hodnota) return json({ chyba: "kluc" }, 401);

  const STLPCE = "id, portal, portaly, nazov, typ, podtyp, izby, cena, plocha, obec, okres, predajca, predajca_typ, predajca_dovod, foto, popis, duplikat_z, aktivny";
  // deno-lint-ignore no-explicit-any
  let kandidati: any[] = [];
  if (telo.id) {
    const { data } = await db.from("inzeraty").select(STLPCE).eq("id", String(telo.id)).neq("predajca_typ", "rk").is("duplikat_z", null).limit(1);
    kandidati = data || [];
  } else {
    // vynechané a staršie aktívne, najnovšie prvé; inzeráty z posledných 2 minút rieši spúšťač pri uložení
    const { data } = await db.from("inzeraty").select(STLPCE).eq("aktivny", true).neq("predajca_typ", "rk").is("duplikat_z", null)
      .lt("prvy_krat", new Date(Date.now() - 120000).toISOString()).order("prvy_krat", { ascending: false }).limit(300);
    kandidati = data || [];
  }
  if (!kandidati.length) return json({ ok: true, skontrolovane: 0 });
  const ids = kandidati.map((z) => z.id);
  const [{ data: hotove }, { data: ozn }] = await Promise.all([
    db.from("inzeraty_ai").select("inzerat_id").in("inzerat_id", ids).not("verdikt", "is", null),
    db.from("oznacenia").select("inzerat_id").in("inzerat_id", ids),
  ]);
  const preskocit = new Set([...(hotove || []), ...(ozn || [])].map((x) => x.inzerat_id));   // už posúdené AI alebo ručne maklérom
  kandidati = kandidati.filter((z) => !preskocit.has(z.id)).slice(0, DAVKA);

  // deno-lint-ignore no-explicit-any
  const posud = async (z: any) => {
    const text = { type: "text", text: "INZERÁT\n" + opisInzeratu(z) + (z.foto ? "\n\nHlavná fotka inzerátu:" : "") };
    const sFotkou = z.foto && /^https:\/\//.test(z.foto) ? [text, { type: "image", source: { type: "url", url: z.foto } }] : [text];
    let o = await claude(kluc, SYSTEM_KONTROLA, sFotkou, 400, "medium");
    if (!o.ok && o.status === 400 && sFotkou.length > 1) o = await claude(kluc, SYSTEM_KONTROLA, [text], 400, "medium");   // fotku sa nepodarilo stiahnuť
    console.log("ai-skener kontrola", JSON.stringify({ id: z.id, model: o.model, status: o.status, stop: o.stop, vstup: o.vstup, vystup: o.vystup, verdikt: o.v?.verdikt, chyba: o.ok ? undefined : o.chyba }));
    if (!o.ok || !o.v) return false;
    const verdikt = ["sukromny", "rk", "neiste"].includes(o.v.verdikt) ? o.v.verdikt : "neiste";
    const istota = Math.max(0, Math.min(100, Math.round(Number(o.v.istota) || 0)));
    const dovod = String(o.v.dovod || "").replace(/\s+/g, " ").trim().slice(0, 200);
    const { error } = await db.from("inzeraty_ai").upsert({ inzerat_id: z.id, verdikt, istota, dovod, model: o.model, skontrolovane: new Date().toISOString() }, { onConflict: "inzerat_id" });
    return !error;
  };
  let ok = 0;
  for (let i = 0; i < kandidati.length; i += 5) {
    const vys = await Promise.all(kandidati.slice(i, i + 5).map((z) => posud(z).catch(() => false)));
    ok += vys.filter(Boolean).length;
  }
  return json({ ok: true, skontrolovane: ok, z: kandidati.length });
});
