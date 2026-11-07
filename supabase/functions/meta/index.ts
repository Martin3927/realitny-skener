// Prepojenie kancelárie s Facebookom a Instagramom (bez Make).
//
// Postup:
//  1. Aplikácia (administrátor kancelárie) → POST {akcia: "zacat"} → odkaz na prihlásenie Facebookom.
//  2. Facebook vráti človeka sem (GET ?code=…&state=…). Kód vymeníme za dlhodobý kľúč a načítame stránky,
//     ktoré spravuje (aj s prepojeným Instagramom). Jedna stránka → hneď uložená; viac → výber v aplikácii.
//  3. Aplikácia: POST {akcia: "stranky"} (zoznam bez kľúčov) a POST {akcia: "vyber", stranka: id}.
//  4. POST {akcia: "odpojit"} – zmaže prepojenie kancelárie.
//
// Kľúč stránky (bez dátumu konca, ak vznikol z dlhodobého kľúča) ukladáme zašifrovaný (AES-GCM);
// kľúč na šifrovanie je SIETE_KLUC, inak odvodený z META_APP_SECRET. Aplikácia kľúče nikdy nedostane.
// Tajomstvá funkcií: META_APP_ID, META_APP_SECRET, voliteľne META_CONFIG_ID (Facebook Login for Business)
// a APP_URL (predvolene https://app.realitnytypek.sk/).
import { createClient } from "jsr:@supabase/supabase-js@2";

const G = "https://graph.facebook.com/v25.0";
const DIALOG = "https://www.facebook.com/v25.0/dialog/oauth";
const APP = (Deno.env.get("APP_URL") || "https://app.realitnytypek.sk/").replace(/\/?$/, "/");
const SCOPE = "pages_show_list,pages_read_engagement,pages_manage_posts,instagram_basic,instagram_content_publish,business_management";
const PLATNOST_MIN = 30;   // ako dlho platí rozbehnuté prihlásenie
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };

// ---------- šifrovanie kľúčov
const enc = new TextEncoder();
function b64(a: Uint8Array) { let s = ""; for (const x of a) s += String.fromCharCode(x); return btoa(s); }
function zB64(s: string) { const t = atob(s); const a = new Uint8Array(t.length); for (let i = 0; i < t.length; i++) a[i] = t.charCodeAt(i); return a; }
async function aesKluc() {
  const tajne = Deno.env.get("SIETE_KLUC") || Deno.env.get("META_APP_SECRET") || "";
  if (!tajne) throw new Error("Chýba META_APP_SECRET.");
  const h = await crypto.subtle.digest("SHA-256", enc.encode("typek-siete|" + tajne));
  return crypto.subtle.importKey("raw", h, "AES-GCM", false, ["encrypt", "decrypt"]);
}
async function zasifruj(t: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const c = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await aesKluc(), enc.encode(t)));
  return "v1." + b64(iv) + "." + b64(c);
}
async function desifruj(s: string) {
  const [v, iv, c] = String(s || "").split(".");
  if (v !== "v1" || !iv || !c) throw new Error("Neznámy formát kľúča.");
  return new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: zB64(iv) }, await aesKluc(), zB64(c)));
}
async function sha256(t: string) { return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(t)))).map((x) => x.toString(16).padStart(2, "0")).join(""); }
function nahodne(n = 32) { return Array.from(crypto.getRandomValues(new Uint8Array(n))).map((x) => x.toString(16).padStart(2, "0")).join(""); }

// ---------- Graph API
// deno-lint-ignore no-explicit-any
async function gGet(path: string, params: Record<string, string>): Promise<any> {
  const r = await fetch(G + path + "?" + new URLSearchParams(params));
  const d = await r.json().catch(() => ({}));
  if (!r.ok || d.error) throw new Error((d.error && d.error.message) || ("Facebook odpovedal " + r.status));
  return d;
}

// kancelária volajúceho: hlavný správca v režime podpory pracuje v kancelárii, do ktorej je prepnutý
// deno-lint-ignore no-explicit-any
async function kancelariaVolajuceho(db: any, userId: string, vlastna: number) {
  const { data: hs } = await db.from("hlavni_spravcovia").select("user_id").eq("user_id", userId).maybeSingle();
  if (!hs) return vlastna;
  const { data: pod } = await db.from("spravca_podpora").select("kancelaria_id").eq("user_id", userId).maybeSingle();
  return Number(pod?.kancelaria_id || vlastna);
}

type Stranka = { id: string; name: string; access_token: string; tasks?: string[]; instagram_business_account?: { id: string; username?: string } };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
  const URL_DB = Deno.env.get("SUPABASE_URL")!;
  const NAVRAT = URL_DB + "/functions/v1/meta";   // presne táto adresa musí byť v aplikácii Meta (Valid OAuth Redirect URIs)
  const APP_ID = Deno.env.get("META_APP_ID") || "", APP_SECRET = Deno.env.get("META_APP_SECRET") || "", CONFIG = Deno.env.get("META_CONFIG_ID") || "";
  const db = createClient(URL_DB, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

  // uloží vybranú stránku ako prepojenie kancelárie
  async function ulozPrepojenie(kancelaria: number, makler: string, s: Stranka, fbUser: { id?: string; meno?: string }) {
    const { error } = await db.from("siete_prepojenia").upsert({
      kancelaria_id: kancelaria, fb_page_id: s.id, fb_page_nazov: s.name, fb_page_token: await zasifruj(s.access_token),
      ig_id: s.instagram_business_account?.id || null, ig_meno: s.instagram_business_account?.username || null,
      fb_user_id: fbUser.id || null, fb_user_meno: fbUser.meno || null, pripojil: makler, pripojene: new Date().toISOString(),
      chyba: null, chyba_kedy: null,
    }, { onConflict: "kancelaria_id" });
    if (error) throw new Error(error.message);
  }

  // ---------- návrat z Facebooku (prehliadač, bez prihlásenia do Týpka)
  if (req.method === "GET") {
    const u = new URL(req.url);
    const spat = (vysledok: string) => Response.redirect(APP + "#vzhlad/meta-" + vysledok, 302);
    const state = u.searchParams.get("state") || "";
    if (!state) return spat("chyba-vyprsalo");
    const { data: pr } = await db.from("siete_prihlasenia").select("*").eq("stav_hash", await sha256(state)).maybeSingle();
    if (!pr || pr.hotovo || Date.now() - new Date(pr.vytvorene).getTime() > PLATNOST_MIN * 60000) return spat("chyba-vyprsalo");
    const hotovo = () => db.from("siete_prihlasenia").update({ hotovo: true }).eq("id", pr.id);
    if (u.searchParams.get("error") || !u.searchParams.get("code")) { await hotovo(); return spat("chyba-zrusene"); }
    try {
      const kratky = await gGet("/oauth/access_token", { client_id: APP_ID, client_secret: APP_SECRET, redirect_uri: NAVRAT, code: u.searchParams.get("code")! });
      let token = String(kratky.access_token || "");
      // dlhodobý kľúč (~60 dní) – kľúče stránok z neho potom nemajú dátum konca
      try {
        const dlhy = await gGet("/oauth/access_token", { grant_type: "fb_exchange_token", client_id: APP_ID, client_secret: APP_SECRET, fb_exchange_token: token });
        if (dlhy.access_token) token = String(dlhy.access_token);
      } catch (_) { /* kľúč z Facebook Login for Business môže byť dlhodobý už sám */ }
      const ja = await gGet("/me", { fields: "id,name", access_token: token });
      const zoz = await gGet("/me/accounts", { fields: "id,name,access_token,tasks,instagram_business_account{id,username}", limit: "100", access_token: token });
      const stranky: Stranka[] = (zoz.data || []).filter((s: Stranka) => s.access_token && (!s.tasks || s.tasks.includes("CREATE_CONTENT") || s.tasks.includes("MANAGE")));
      const fbUser = { id: String(ja.id || ""), meno: String(ja.name || "") };
      if (!stranky.length) { await hotovo(); return spat("chyba-ziadna_stranka"); }
      if (stranky.length === 1) {
        await ulozPrepojenie(pr.kancelaria_id, pr.makler_id, stranky[0], fbUser);
        await hotovo();
        return spat("ok");
      }
      await db.from("siete_prihlasenia").update({ stranky: await zasifruj(JSON.stringify(stranky)), fb_user_id: fbUser.id, fb_user_meno: fbUser.meno }).eq("id", pr.id);
      return spat("vyber");
    } catch (e) {
      console.error("meta-navrat", String((e as Error).message || e).slice(0, 300));
      await hotovo();
      return spat("chyba-facebook");
    }
  }

  // ---------- požiadavky z aplikácie
  let telo: { akcia?: string; stranka?: string } = {};
  try { telo = await req.json(); } catch { /* nič */ }
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: u } = await db.auth.getUser(token);
  if (!u?.user) return json({ chyba: "Prihláste sa znova." }, 401);
  const { data: m } = await db.from("makleri").select("id, aktivny, rola, kancelaria_id").eq("id", u.user.id).maybeSingle();
  if (!m?.aktivny) return json({ chyba: "Účet nie je aktívny." }, 403);
  if (m.rola !== "admin") return json({ chyba: "Facebook a Instagram kancelárie pripája administrátor." }, 403);
  const k = await kancelariaVolajuceho(db, m.id, m.kancelaria_id);

  if (telo.akcia === "zacat") {
    if (!APP_ID || !APP_SECRET) return json({ chyba: "Prepojenie s Facebookom ešte nie je nastavené – chýba aplikácia Meta. Ozvite sa na info@realitnytypek.sk." }, 503);
    await db.from("siete_prihlasenia").delete().lt("vytvorene", new Date(Date.now() - 86400000).toISOString());
    const state = nahodne();
    const { error } = await db.from("siete_prihlasenia").insert({ stav_hash: await sha256(state), kancelaria_id: k, makler_id: m.id });
    if (error) return json({ chyba: error.message }, 500);
    const p = new URLSearchParams({ client_id: APP_ID, redirect_uri: NAVRAT, state, response_type: "code" });
    if (CONFIG) p.set("config_id", CONFIG); else p.set("scope", SCOPE);
    return json({ url: DIALOG + "?" + p });
  }

  // posledné rozbehnuté prihlásenie tohto človeka s viacerými stránkami
  async function cakajuce() {
    const { data } = await db.from("siete_prihlasenia").select("*").eq("makler_id", m!.id).eq("kancelaria_id", k).eq("hotovo", false)
      .not("stranky", "is", null).gte("vytvorene", new Date(Date.now() - PLATNOST_MIN * 60000).toISOString())
      .order("vytvorene", { ascending: false }).limit(1).maybeSingle();
    return data;
  }

  if (telo.akcia === "stranky") {
    const pr = await cakajuce();
    if (!pr) return json({ chyba: "Prihlásenie vypršalo – kliknite znova na Pripojiť Facebook a Instagram." }, 404);
    const stranky: Stranka[] = JSON.parse(await desifruj(pr.stranky));
    return json({ stranky: stranky.map((s) => ({ id: s.id, nazov: s.name, instagram: s.instagram_business_account?.username || (s.instagram_business_account ? "Instagram" : null) })) });
  }

  if (telo.akcia === "vyber") {
    const pr = await cakajuce();
    if (!pr) return json({ chyba: "Prihlásenie vypršalo – kliknite znova na Pripojiť Facebook a Instagram." }, 404);
    const stranky: Stranka[] = JSON.parse(await desifruj(pr.stranky));
    const s = stranky.find((x) => x.id === String(telo.stranka || ""));
    if (!s) return json({ chyba: "Túto stránku ste pri prihlásení nevybrali." }, 400);
    await ulozPrepojenie(k, m.id, s, { id: pr.fb_user_id, meno: pr.fb_user_meno });
    await db.from("siete_prihlasenia").update({ hotovo: true, stranky: null }).eq("id", pr.id);
    return json({ ok: true, stranka: s.name, instagram: s.instagram_business_account?.username || null });
  }

  if (telo.akcia === "odpojit") {
    const { error } = await db.from("siete_prepojenia").delete().eq("kancelaria_id", k);
    if (error) return json({ chyba: error.message }, 500);
    return json({ ok: true });
  }

  return json({ chyba: "Neznáma akcia." }, 400);
});
