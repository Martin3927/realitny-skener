// Export ponúk do Realsoftu cez United Classifieds (formát „Import API v1 Realsoft“).
//   GET  ?t=<tajný kľúč>                → JSON pole OfficeData (súbor, ktorý si UC sťahuje každých 12 hodín)
//   POST {akcia:"kontrola"} (admin JWT) → zostavené údaje + problémy pri ponukách + výsledok overenia na serveri UC
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };
const VALIDACIA = "https://plt.unitedclassifieds.sk/import/api/v1/realsoft/validation";

// ---------------------------------------------------------------- číselníky (kódy UC)
const KATEGORIA: Record<string, number> = {
  "Garsónka": 9, "1-izbový byt": 11, "2-izbový byt": 12, "3-izbový byt": 13, "4-izbový byt": 14, "5 a viac izbový byt": 15, "Mezonet": 18, "Apartmán": 16, "Loft": 17,
  "Rodinný dom": 20, "Vila": 20, "Bungalov": 20, "Dvojdom": 20, "Radový dom": 20, "Mobilný / modulový dom": 23, "Rekreačný dom": 27, "Zrub": 26, "Farma / usadlosť": 22, "Iný dom": 20,
  "Chata": 26, "Chalupa": 27, "Záhradná chatka": 28, "Rekreačné zariadenie": 27,
  "Stavebný pozemok – rodinné domy": 30, "Stavebný pozemok – bytová výstavba": 32, "Rekreačný pozemok": 31, "Záhrada": 37, "Sad / vinica": 38, "Orná pôda": 41,
  "Lúka / pasienok": 40, "Les": 42, "Komerčná zóna": 34, "Priemyselná zóna": 35, "Iný pozemok": 30746,
  "Kancelárie": 46, "Obchodné priestory": 47, "Reštaurácia": 48, "Sklad": 49, "Výrobné priestory": 50, "Ubytovanie": 47, "Ambulancia": 47, "Iný priestor": 47,
  "Hotel / penzión": 65, "Polyfunkčný objekt": 60, "Administratívna budova": 57, "Skladový objekt": 61, "Výrobný objekt": 62, "Poľnohospodársky objekt": 64, "Iný objekt": 58,
  "Garáž": 8, "Garážové státie": 8, "Parkovacie miesto": 8,
};
const TYP_DOMU: Record<string, number> = { "Rodinný dom": 975, "Vila": 976, "Bungalov": 977, "Dvojdom": 980 };
const PARKOVANIE: Record<string, number> = { "Garáž": 30748, "Garážové státie": 30750, "Parkovacie miesto": 30751 };
const STAV: Record<string, number> = { "novostavba": 136, "vo výstavbe": 140, "developerský projekt": 141, "kompletná rekonštrukcia": 138, "čiastočná rekonštrukcia": 137, "pôvodný stav": 139, "na rekonštrukciu": 139, "na zbúranie": 142 };
const VLASTNICTVO: Record<string, number> = { "osobné": 344, "družstevné": 340, "obecné": 343, "štátne": 345, "firemné": 341, "iné": 346 };
const KONSTRUKCIA: Record<string, number> = { "tehla": 418, "panel": 416, "drevostavba": 411, "zrub": 411, "kameň": 413, "nepálená tehla": 412, "skelet": 417, "kombinovaná": 419, "iná": 422 };
const CERTIFIKAT: Record<string, number> = { "A0": 305, "A1": 305, "B": 306, "C": 307, "D": 308, "E": 309, "F": 310, "G": 20029, "nemá": 20030, "v konaní": 20030 };
const KURENIE: Record<string, number> = { "ústredné plynové": 717, "diaľkové (centrálne)": 717, "podlahové": 722, "kozub / krb": 729, "elektrické": 728, "tepelné čerpadlo": 728, "tuhé palivo": 723, "solárne": 728, "iné": 728 };
const ORIENTACIA: Record<string, number> = { "J": 381, "Z": 382, "JZ": 383, "S": 384, "V": 385, "JV": 386, "SZ": 387, "SV": 388 };
const VYBAVA: Record<string, number> = { "balkón": 533, "lodžia": 534, "terasa": 535, "záhrada": 536, "garáž": 537, "pivnica": 538, "parkovacie miesto": 541, "komora": 543, "výťah": 556 };
const KOMUNIKACIE: Record<string, number> = { "telefón": 734, "internet": 735, "satelit": 736, "káblová TV": 737, "optická sieť": 738 };

function norm(s: unknown) {
  return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
function ulicaBezCisla(s: unknown) { return String(s || "").replace(/\s*\d+[a-zA-Z]?(\s*\/\s*\d+[a-zA-Z]?)?\s*$/, "").trim(); }
function cisloDomu(s: unknown) { const m = String(s || "").match(/(\d+[a-zA-Z]?(\s*\/\s*\d+[a-zA-Z]?)?)\s*$/); return m ? m[1].replace(/\s+/g, "") : null; }
const num = (v: unknown) => (v === null || v === undefined || v === "" || isNaN(Number(v)) ? null : Number(v));

async function vsetko(db: any, tab: string, stlpce: string, filter?: (q: any) => any) {
  const out: any[] = [];
  for (let od = 0; ; od += 1000) {
    let q = db.from(tab).select(stlpce).range(od, od + 999);
    if (filter) q = filter(q);
    const { data, error } = await q;
    if (error) throw new Error(tab + ": " + error.message);
    out.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

async function zostav(db: any, urlDb: string) {
  const { data: kn } = await db.from("nastavenia").select("hodnota").eq("kluc", "kancelaria").maybeSingle();
  const K = kn?.hodnota ? JSON.parse(kn.hodnota) : {};
  const ponuky = await vsetko(db, "nehnutelnosti", "*", (q) => q.in("stav", ["aktivne", "rezervovane"]).eq("uc_export", true));
  const makleri = await vsetko(db, "makleri", "id, meno, email, telefon, aktivny");
  const okresy = await vsetko(db, "uc_okres", "district_id, county_id, nazov");
  const okresPodla = new Map(okresy.map((o: any) => [norm(o.nazov), o]));
  // obce, časti a ulice len pre okresy, kde máme ponuky
  const potrebneOkresy = new Set<number>();
  for (const p of ponuky) { const o = okresPodla.get(norm(p.okres)); if (o) potrebneOkresy.add(o.district_id); }
  const obce = potrebneOkresy.size ? await vsetko(db, "uc_obec", "region_id, district_id, nazov, lat, lon", (q) => q.in("district_id", [...potrebneOkresy])) : [];
  const obecIds = obce.map((o: any) => o.region_id);
  const casti = obecIds.length ? await vsetko(db, "uc_cast", "citypart_id, region_id, nazov", (q) => q.in("region_id", obecIds)) : [];
  const ulice = obecIds.length ? await vsetko(db, "uc_ulica", "street_id, region_id, citypart_id, nazov", (q) => q.in("region_id", obecIds)) : [];

  const problemyKancelarie: string[] = [];
  for (const [k, n] of [["nazov", "názov"], ["telefon", "telefón"], ["email", "email"], ["mesto", "mesto"], ["psc", "PSČ"], ["ulica", "ulica"], ["cislo", "číslo domu"]]) {
    if (!K[k]) problemyKancelarie.push("Chýba " + n + " kancelárie.");
  }
  const office = {
    source_id: "alpha", name: K.nazov || "", phone: K.telefon || "", email: K.email || "", city: K.mesto || "", zip: K.psc || "",
    street: K.ulica || "", street_number: K.cislo || "", contact_person: K.kontakt || null,
  };

  const vysledky: any[] = [];
  const podlaMaklera = new Map<string, any[]>();
  for (const p of ponuky) {
    const chyby: string[] = [], upozornenia: string[] = [];
    const nazov = p.nazov || [p.typ, p.obec].filter(Boolean).join(", ");
    const kat = KATEGORIA[p.typ] || (p.kategoria === "byty" ? ({ 1: 11, 2: 12, 3: 13, 4: 14 } as any)[p.izby] || (p.izby >= 5 ? 15 : null) : null);
    if (!kat) chyby.push("Druh nehnuteľnosti „" + (p.typ || "nevyplnený") + "“ – vyberte typ v ponuke.");
    // lokalita
    const okres = okresPodla.get(norm(p.okres));
    if (!okres) chyby.push("Okres „" + (p.okres || "") + "“ sa nenašiel v číselníku Realsoftu.");
    let obec = p.uc_obec_id ? obce.find((o: any) => o.region_id === p.uc_obec_id) : null;
    if (!obec && okres) obec = obce.find((o: any) => o.district_id === okres.district_id && norm(o.nazov) === norm(p.obec));
    if (!obec && okres) chyby.push("Obec „" + (p.obec || "") + "“ sa nenašla v okrese " + okres.nazov + ".");
    let cast = p.uc_cast_id ? casti.find((c: any) => c.citypart_id === p.uc_cast_id) : null;
    if (!cast && obec && p.cast_obce) cast = casti.find((c: any) => c.region_id === obec.region_id && norm(c.nazov) === norm(p.cast_obce));
    let ulica = p.uc_ulica_id ? ulice.find((x: any) => x.street_id === p.uc_ulica_id) : null;
    const ulTxt = ulicaBezCisla(p.ulica);
    if (!ulica && obec && ulTxt) {
      const n = norm(ulTxt), vObci = ulice.filter((x: any) => x.region_id === obec.region_id);
      ulica = vObci.find((x: any) => norm(x.nazov) === n) || vObci.find((x: any) => norm(x.nazov).replace(/ /g, "") === n.replace(/ /g, "")) ||
        vObci.find((x: any) => n.length >= 4 && (norm(x.nazov).startsWith(n) || n.startsWith(norm(x.nazov))));
    }
    if (!ulica && obec) {
      const vObci = ulice.filter((x: any) => x.region_id === obec.region_id);
      ulica = vObci.find((x: any) => norm(x.nazov) === norm(obec.nazov)) || null;
      if (!ulica) chyby.push(vObci.length ? "Ulica „" + (ulTxt || "nevyplnená") + "“ sa nenašla – vyberte ju zo zoznamu." : "Obec " + obec.nazov + " nemá v Realsofte ulice – vyberte ulicu ručne alebo kontaktujte UC.");
    }
    // povinné podmienené parametre (podľa kategórie)
    const byt = kat >= 9 && kat <= 18, dom = kat >= 20 && kat <= 28, objekt = kat === 8 || (kat >= 55 && kat <= 72), priestor = kat >= 46 && kat <= 53, pozemok = (kat >= 30 && kat <= 44) || kat === 30746 || kat === 30747;
    const transakcia = p.transakcia === "prenajom" ? 123 : 127;
    const stav = STAV[p.stav_objektu];
    const konstr = KONSTRUKCIA[p.konstrukcia];
    const cert = CERTIFIKAT[p.energ_certifikat];
    if (!pozemok) {
      if (!stav) chyby.push("Chýba stav nehnuteľnosti.");
      if (!p.rok_vystavby) chyby.push("Chýba rok výstavby.");
      if (!konstr) chyby.push("Chýba konštrukcia (materiál stavby).");
      if (!cert) upozornenia.push("Energetický certifikát nie je vyplnený – pošle sa „nemá“.");
      if (!p.plocha_uzitkova) chyby.push("Chýba úžitková plocha.");
    }
    if ((dom || objekt) && !p.plocha_zastavana) upozornenia.push("Chýba zastavaná plocha – pošle sa úžitková.");
    if ((byt || dom || objekt) && !p.pocet_podlazi) chyby.push("Chýba počet podlaží budovy.");
    if ((byt || priestor) && (p.poschodie === null || p.poschodie === undefined)) chyby.push("Chýba poschodie.");
    if (pozemok && !p.plocha_pozemku) chyby.push("Chýba výmera pozemku.");
    if ((dom || pozemok) && !p.uc_teren) chyby.push("Chýba terén pozemku – vyberte ho tu.");
    if (!(p.fotky || []).length) chyby.push("Ponuka nemá fotky.");
    if (!(p.popis || "").trim()) chyby.push("Chýba popis.");
    const vyb: string[] = p.vybavenie || [];
    const siete = (dom || objekt || pozemok);
    if (siete && !vyb.some((v) => /vodovod|studňa|elektrina|plyn|kanalizácia|žumpa|ČOV/.test(v))) upozornenia.push("Inžinierske siete nie sú vyplnené – pošlú sa ako „nedostupné“.");
    const pozicia = (p.poschodie === 0) ? 368 : (p.pocet_podlazi && p.poschodie >= p.pocet_podlazi) ? 26103 : (p.poschodie > 0 ? 30826 : null);
    const typCeny = String(p.typ_ceny || "");
    const units = transakcia === 127 ? (typCeny === "za m²" ? 148 : 147) : (typCeny === "za rok" ? 150 : 149);
    const fotky = (p.fotky || []).slice(0, 40).map((f: any) => ({ url: f.url || urlDb + "/storage/v1/object/public/ponuky/" + f.cesta }));
    const ad: any = {
      source_id: String(p.id), internal_reference: p.cislo || null, category: kat || 0, transaction: transakcia,
      title: nazov.slice(0, 120), description: [p.intro, p.popis].filter((x: string) => x && x.trim()).join("\n\n"),
      price: Number(p.cena) || 0, units, price_by_agreement: !p.zobrazit_cenu || /dohodou|vyžiadanie/.test(typCeny) || !p.cena,
      currency: 167, note_to_price: p.text_k_cene || null, power_costs: num(String(p.cena_energie || "").replace(",", ".").replace(/[^\d.]/g, "")),
      usable_area: Number(p.plocha_uzitkova) || 0, building_area: Number(p.plocha_zastavana) || Number(p.plocha_uzitkova) || 0, land_area: Number(p.plocha_pozemku) || 0,
      availability: p.stav === "rezervovane" ? 242 : 30822,
      ownership: VLASTNICTVO[p.vlastnictvo] || 344,
      real_estate_state: stav || null, year_of_construction: p.rok_vystavby && p.rok_vystavby >= 1900 ? p.rok_vystavby : null,
      building_energy_rating_certificate: cert || 20030, building_type: konstr ? [konstr] : [],
      position: byt || priestor ? pozicia : null, floor: p.poschodie ?? null, number_of_overhead_floors: p.pocet_podlazi || null,
      rooms_count: p.izby || null, ground_type: p.uc_teren || null,
      orientation: (p.orientacia || []).map((o: string) => ORIENTACIA[o]).filter(Boolean),
      estate_equipment: vyb.map((v) => VYBAVA[v]).filter(Boolean),
      equip_type: vyb.includes("zariadený") ? 531 : vyb.includes("čiastočne zariadený") ? 529 : vyb.includes("nezariadený") ? 530 : null,
      heating_system: p.kurenie && KURENIE[p.kurenie] ? [KURENIE[p.kurenie]] : [],
      communication_and_data_line: vyb.map((v) => KOMUNIKACIE[v]).filter(Boolean),
      utility_lines: [vyb.some((v) => /vodovod|studňa/.test(v)) ? 686 : 0, vyb.some((v) => /elektrina/.test(v)) ? 687 : 0, vyb.includes("plyn") ? 688 : 0,
        vyb.some((v) => /kanalizácia/.test(v)) ? 689 : 0].filter(Boolean),
      type_of_house: TYP_DOMU[p.typ] || null, type_of_parking: PARKOVANIE[p.typ] ? [PARKOVANIE[p.typ]] : [],
      video_url: String(p.video || "").split(/[\r\n]+/).map((v: string) => v.trim()).filter(Boolean).slice(0, 10),
      street: ulica ? ulica.nazov : (ulTxt || p.obec || ""), street_number: cisloDomu(p.ulica), show_street: !!p.ulica,
      location: { state_id: 1, county_id: okres ? okres.county_id : 0, district_id: okres ? okres.district_id : 0, region_id: obec ? obec.region_id : 0,
        citypart_id: cast ? cast.citypart_id : null, street_id: ulica ? ulica.street_id : 0 },
      geo_point: p.lat && p.lon ? { lat: String(p.lat), lon: String(p.lon) } : (obec && obec.lat ? { lat: String(obec.lat), lon: String(obec.lon) } : null),
      images: fotky, client_created_at: p.vytvorene, client_updated_at: p.upravene,
      extra: {
        water: siete ? [vyb.includes("verejný vodovod") ? 691 : vyb.includes("vlastná studňa") ? 694 : 24704] : null,
        electric: siete ? [vyb.includes("elektrina 400 V") ? 701 : vyb.includes("elektrina 230 V") ? 700 : 24707] : null,
        gas: siete ? [vyb.includes("plyn") ? 705 : 24709] : null,
        sewage: siete ? [vyb.includes("verejná kanalizácia") ? 710 : vyb.includes("žumpa") ? 712 : vyb.includes("ČOV") ? 708 : 24711] : null,
      },
    };
    // nepovinné prázdne hodnoty vynecháme
    for (const k of Object.keys(ad)) if (ad[k] === null || (Array.isArray(ad[k]) && !ad[k].length && !["images", "building_type"].includes(k))) delete ad[k];
    if (!siete) delete ad.extra;
    if (ad.location.citypart_id === null) delete ad.location.citypart_id;
    vysledky.push({ id: p.id, cislo: p.cislo, nazov, obec: p.obec, ulica: p.ulica, makler_id: p.makler_id, region_id: obec ? obec.region_id : null,
      ulica_uc: ulica ? ulica.nazov : null, ulica_id: ulica ? ulica.street_id : null, teren: p.uc_teren, potrebuje_teren: dom || pozemok, chyby, upozornenia });
    if (!chyby.length) {
      const kluc = p.makler_id || "kancelaria";
      if (!podlaMaklera.has(kluc)) podlaMaklera.set(kluc, []);
      podlaMaklera.get(kluc)!.push(ad);
    }
  }
  const userData = [...podlaMaklera.entries()].map(([id, ads]) => {
    const mk = makleri.find((x: any) => x.id === id) || {};
    const casti = String(mk.meno || K.nazov || "Maklér").trim().split(/\s+/);
    return {
      user: { source_id: String(id), first_name: casti.length > 1 ? casti.slice(0, -1).join(" ") : null, last_name: casti[casti.length - 1],
        phone: String(mk.telefon || "").replace(/\D/g, "").length >= 5 ? mk.telefon : (K.telefon || ""), email: mk.email || K.email || "" },
      advertisements: ads,
    };
  });
  return { data: [{ office, user_data: userData }], vysledky, problemyKancelarie };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" } });
  const urlDb = Deno.env.get("SUPABASE_URL")!;
  const db = createClient(urlDb, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  try {
    if (req.method === "GET") {
      const t = new URL(req.url).searchParams.get("t") || "";
      const { data: tok } = await db.from("nastavenia").select("hodnota").eq("kluc", "uc_token").maybeSingle();
      if (!tok?.hodnota || t.length < 20 || t !== tok.hodnota) return json({ chyba: "Neplatný odkaz." }, 403);
      const z = await zostav(db, urlDb);
      return json(z.data);
    }
    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const { data: u } = await db.auth.getUser(token);
    const { data: m } = u?.user ? await db.from("makleri").select("rola, aktivny").eq("id", u.user.id).maybeSingle() : { data: null };
    if (!m?.aktivny || m.rola !== "admin") return json({ chyba: "Export môže kontrolovať len administrátor." }, 403);
    const z = await zostav(db, urlDb);
    let overenie: any = null;
    const pocet = z.data[0].user_data.reduce((a: number, x: any) => a + x.advertisements.length, 0);
    if (pocet && !z.problemyKancelarie.length) {
      try {
        const r = await fetch(VALIDACIA, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(z.data), signal: AbortSignal.timeout(45000) });
        const t = await r.text();
        let d: any = t; try { d = JSON.parse(t); } catch { /* text */ }
        overenie = { ok: r.ok, status: r.status, odpoved: d };
      } catch (e) {
        overenie = { ok: false, status: "nedostupné", odpoved: "Server United Classifieds teraz neodpovedá (" + String((e as Error).message || e) + "). Skúste kontrolu o chvíľu." };
      }
    }
    return json({ pocet, vysledky: z.vysledky, problemyKancelarie: z.problemyKancelarie, overenie });
  } catch (e) {
    return json({ chyba: String((e as Error).message || e) }, 500);
  }
});
