// AI pre panel Sociálne siete pri ponuke (Claude Sonnet 5.5 s obrázkami):
//  * doplní 2–5 výhod z popisu ponuky (riadky s emoji), doladí úvodný text
//  * vyberie najviac 10 fotiek – titulnú a z každej miestnosti jednu, v poradí na zverejnenie
// Štruktúru príspevku (nadpis, lokalita, cena, odkaz, kontakt, hashtagy) skladá aplikácia sama – AI ju nemení.
// Volá ju aplikácia s prihlásením makléra; počíta sa do denného limitu AI asistenta (asistent_pocitaj).
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const MAX_FOTIEK = 30, MAX_NAHLAD = 400_000;

const SYSTEM = `Si skúsený realitný maklér a textár kancelárie Alpha Reality (Spiš, Slovensko). Pripravuješ podklady pre príspevok ponuky na Facebook a Instagram.
Dostaneš údaje o nehnuteľnosti, popis od makléra a prípadne náhľady fotiek (každá má číslo).
Vráť IBA jeden JSON objekt, bez ďalšieho textu a bez \`\`\`, v tvare:
{"vyhody": ["🚗 parkovanie pred domom"], "uvod": "…", "fotky": [3, 0, 7], "miestnosti": {"3": "exteriér", "0": "obývačka", "7": "kuchyňa"}}

Pravidlá pre "vyhody":
- 2 až 5 ďalších výhod, ktoré sú VÝSLOVNE uvedené v popise alebo v údajoch. Nevymýšľaj nič, čo tam nie je.
- Neopakuj, čo už v príspevku je (zoznam dostaneš): úžitková plocha, pozemok, počet izieb, stav objektu.
- Každá výhoda začína jedným vhodným emoji, potom medzera a krátky text (najviac 6 slov), malým písmenom, bez bodky na konci.
- Prednosť majú veci, ktoré kupujúcich zaujímajú: terasa, balkón, loggia, záhrada, parkovanie, garáž, pivnica, nové okná, kúrenie, energetická trieda, nízke náklady, tichá lokalita, blízkosť školy alebo obchodov.

Pravidlá pre "uvod":
- 2 až 3 vety po slovensky, priateľsky a vecne, nech to láka prísť na obhliadku.
- Bez emoji, bez ceny a bez kontaktu (tie sú v príspevku zvlášť), bez superlatívov ako „najlepší“ či „jedinečný“, bez anglicizmov.
- Nevymýšľaj fakty, ktoré nie sú v údajoch.

Pravidlá pre "fotky" (len ak dostaneš náhľady, inak vráť prázdne pole):
- Najviac 10 čísel fotiek v poradí, v akom sa majú zverejniť.
- Prvá je titulná: najkrajší celkový pohľad (exteriér domu, obývačka alebo najsvetlejšia izba).
- Potom z každej miestnosti po jednej najlepšej fotke: obývačka, kuchyňa, každá izba a spálňa, kúpeľňa, WC, balkón, loggia alebo terasa, záhrada, výhľad, pivnica, garáž.
- Kým nie je zastúpená každá miestnosť, nevyberaj dve podobné fotky tej istej miestnosti.
- Vynechaj rozmazané, tmavé a nepodstatné zábery (pôdorys, detail vypínača, prázdna chodba), ak je z čoho vyberať.
- Prednosť majú fotky na šírku – Instagram neberie úzke fotky na výšku.
- "miestnosti": ku každej vybranej fotke krátky názov miestnosti po slovensky (napr. „kuchyňa“, „spálňa“, „kúpeľňa“, „exteriér“).`;

const RIADKY: [string, string][] = [
  ["kategoria", "Kategória"], ["typ", "Typ"], ["transakcia", "Transakcia"], ["nazov", "Názov"], ["obec", "Obec"], ["cast_obce", "Časť obce"],
  ["plocha_uzitkova", "Úžitková plocha m²"], ["plocha_zastavana", "Zastavaná plocha m²"], ["plocha_pozemku", "Pozemok m²"], ["izby", "Počet izieb"],
  ["poschodie", "Poschodie"], ["pocet_podlazi", "Počet podlaží"], ["rok_vystavby", "Rok výstavby"], ["stav_objektu", "Stav"], ["konstrukcia", "Konštrukcia"],
  ["kurenie", "Kúrenie"], ["energ_certifikat", "Energetický certifikát"], ["vlastnictvo", "Vlastníctvo"], ["orientacia", "Orientácia"], ["vybavenie", "Vybavenie"],
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
  const kluc = Deno.env.get("ANTHROPIC_API_KEY");
  if (!kluc) return json({ chyba: "AI ešte nie je zapnutá – administrátor musí doplniť kľúč ANTHROPIC_API_KEY v nastaveniach Supabase." }, 503);
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: u } = await db.auth.getUser(token);
  if (!u?.user) return json({ chyba: "Prihláste sa znova." }, 401);
  const { data: m } = await db.from("makleri").select("id, aktivny, rola, pristup").eq("id", u.user.id).maybeSingle();
  if (!m?.aktivny || (m.rola !== "admin" && !(m.pristup || []).includes("asistent"))) return json({ chyba: "Nemáte prístup k AI." }, 403);

  // deno-lint-ignore no-explicit-any
  let telo: any = {};
  try { telo = await req.json(); } catch { /* nič */ }
  const { data: p } = await db.from("nehnutelnosti").select("*").eq("id", Number(telo.ponuka_id)).maybeSingle();
  if (!p) return json({ chyba: "Ponuka neexistuje." }, 404);
  if (p.makler_id !== m.id && m.rola !== "admin") return json({ chyba: "AI môžete použiť len pri svojej ponuke." }, 403);

  // náhľady fotiek z aplikácie (JPEG, zmenšené v prehliadači); číslo = poradie fotky v ponuke
  const pocetFotiek = Array.isArray(p.fotky) ? p.fotky.length : 0;
  // deno-lint-ignore no-explicit-any
  const nahlady = (Array.isArray(telo.nahlady) ? telo.nahlady : []).filter((x: any) => Number.isInteger(x?.i) && x.i >= 0 && x.i < pocetFotiek &&
    typeof x.data === "string" && x.data.length > 100 && x.data.length < MAX_NAHLAD && /^[A-Za-z0-9+/=]+$/.test(x.data)).slice(0, MAX_FOTIEK);

  const limit = Math.max(1, Math.floor(Number(Deno.env.get("AI_DENNY_LIMIT"))) || 50);
  const { data: vLimite, error: chybaLimitu } = await db.rpc("asistent_pocitaj", { p_makler: m.id, p_limit: limit });
  if (!chybaLimitu && vLimite === false) return json({ chyba: "Dnes ste už AI použili " + limit + "-krát, čo je denný limit. Zajtra môžete pokračovať." }, 429);

  const hodnota = (v: unknown) => Array.isArray(v) ? v.join(", ") : String(v);
  const udaje = RIADKY.filter(([k]) => p[k] !== null && p[k] !== undefined && p[k] !== "" && !(Array.isArray(p[k]) && !p[k].length))
    .map(([k, n]) => n + ": " + hodnota(p[k])).join("\n");
  const uz = ["úžitková plocha", "pozemok", "počet izieb", "stav objektu"].filter((_, i) => [p.plocha_uzitkova, p.plocha_pozemku, p.izby, p.stav_objektu][i]);
  // deno-lint-ignore no-explicit-any
  const obsah: any[] = [{ type: "text", text:
    "ÚDAJE O NEHNUTEĽNOSTI\n" + udaje +
    (p.virtualna_prehliadka ? "\nMá 3D virtuálnu prehliadku." : "") +
    "\n\nKRÁTKY ÚVOD OD MAKLÉRA\n" + (p.intro || "(žiadny)") +
    "\n\nPOPIS OD MAKLÉRA\n" + String(p.popis || "(žiadny)").slice(0, 5000) +
    "\n\nV PRÍSPEVKU UŽ JE: " + (uz.length ? uz.join(", ") : "nič z parametrov") +
    (nahlady.length ? "\n\nNÁHĽADY FOTIEK (" + nahlady.length + "):" : "\n\nNáhľady fotiek nedostaneš – \"fotky\" a \"miestnosti\" nechaj prázdne.") }];
  for (const n of nahlady) {
    const w = Number(n.w) || 0, h = Number(n.h) || 0;
    obsah.push({ type: "text", text: "Fotka " + n.i + (w && h ? (w / h > 1.05 ? " (na šírku)" : w / h < 0.95 ? " (na výšku)" : " (štvorec)") : "") });
    obsah.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: n.data } });
  }

  const model = Deno.env.get("AI_MODEL") || "claude-sonnet-5-5";
  const bezPremyslania = model.startsWith("claude-sonnet-5-5") ? { thinking: { type: "between_tools" }, output_config: { effort: "medium" } } : {};
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": kluc, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model, max_tokens: 2000, ...bezPremyslania, system: SYSTEM, messages: [{ role: "user", content: obsah }] }),
  });
  // deno-lint-ignore no-explicit-any
  const d: any = await r.json().catch(() => ({}));
  console.log("ai-prispevok", JSON.stringify({ model, status: r.status, stop: d.stop_reason, fotky: nahlady.length, vstup: d.usage?.input_tokens, vystup: d.usage?.output_tokens, chyba: d.error?.type }));
  if (!r.ok) return json({ chyba: "AI teraz neodpovedá (" + r.status + "). Skúste to o chvíľu." }, 502);

  // deno-lint-ignore no-explicit-any
  const text = ((d.content as any[]) || []).filter((c) => c.type === "text").map((c) => c.text).join("\n");
  // deno-lint-ignore no-explicit-any
  let v: any = null;
  try { v = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)); } catch { /* nižšie */ }
  if (!v || typeof v !== "object") return json({ chyba: "AI vrátila nečitateľnú odpoveď. Skúste to znova." }, 502);

  const cisty = (s: unknown, max: number) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, max);
  const vyhody = (Array.isArray(v.vyhody) ? v.vyhody : []).map((x: unknown) => cisty(x, 80)).filter((x: string) => x.length > 2).slice(0, 5);
  const uvod = cisty(v.uvod, 600);
  const dovolene = new Set(nahlady.map((n: { i: number }) => n.i));
  const fotky: number[] = [];
  for (const x of Array.isArray(v.fotky) ? v.fotky : []) { const i = Number(x); if (dovolene.has(i) && !fotky.includes(i)) fotky.push(i); if (fotky.length >= 10) break; }
  const miestnosti: Record<string, string> = {};
  for (const i of fotky) { const nm = cisty(v.miestnosti?.[String(i)], 30); if (nm) miestnosti[String(i)] = nm; }
  if (!vyhody.length && !uvod && !fotky.length) return json({ chyba: "AI neposlala návrh. Skúste to znova." }, 502);
  return json({ vyhody, uvod, fotky, miestnosti });
});
