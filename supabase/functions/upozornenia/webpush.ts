// Web Push bez knižníc – len WebCrypto (šifrovanie aes128gcm podľa RFC 8291, podpis VAPID podľa RFC 8292).
// Kľúče VAPID sú tie isté, ktoré používa skener (verejný v nastaveniach, súkromný vo Vaulte).

const te = new TextEncoder();

export function b64u(b: Uint8Array): string {
  let s = "";
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function zB64u(s: string): Uint8Array {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  const r = atob(s), o = new Uint8Array(r.length);
  for (let i = 0; i < r.length; i++) o[i] = r.charCodeAt(i);
  return o;
}

function spoj(...casti: Uint8Array[]): Uint8Array {
  const o = new Uint8Array(casti.reduce((n, c) => n + c.length, 0));
  let i = 0;
  for (const c of casti) { o.set(c, i); i += c.length; }
  return o;
}

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, dlzka: number): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, k, dlzka * 8));
}

export type Vapid = { verejny: string; kluc: CryptoKey; kontakt: string };

// súkromný kľúč = 32 bajtov „d“ (base64url), verejný = 65 bajtov 0x04‖x‖y (base64url)
export async function vapid(verejny: string, sukromny: string, kontakt: string): Promise<Vapid> {
  const p = zB64u(verejny);
  if (p.length !== 65 || p[0] !== 4) throw new Error("Neplatný verejný kľúč VAPID");
  const kluc = await crypto.subtle.importKey("jwk",
    { kty: "EC", crv: "P-256", x: b64u(p.slice(1, 33)), y: b64u(p.slice(33, 65)), d: sukromny, ext: true },
    { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  return { verejny, kluc, kontakt };
}

async function jwt(v: Vapid, aud: string): Promise<string> {
  const h = b64u(te.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const c = b64u(te.encode(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: v.kontakt })));
  const podpis = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, v.kluc, te.encode(h + "." + c)));
  return h + "." + c + "." + b64u(podpis);
}

// zašifruje správu pre jeden telefón (p256dh a auth z jeho odberu)
export async function zasifruj(p256dh: string, auth: string, data: Uint8Array): Promise<Uint8Array> {
  const ua = zB64u(p256dh), tajne = zB64u(auth);
  const docasny = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]) as CryptoKeyPair;
  const as = new Uint8Array(await crypto.subtle.exportKey("raw", docasny.publicKey));
  const uaKluc = await crypto.subtle.importKey("raw", ua, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const spolocne = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKluc }, docasny.privateKey, 256));
  const ikm = await hkdf(tajne, spolocne, spoj(te.encode("WebPush: info\0"), ua, as), 32);
  const sol = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(sol, ikm, te.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(sol, ikm, te.encode("Content-Encoding: nonce\0"), 12);
  const k = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const sifra = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, k, spoj(data, new Uint8Array([2]))));
  const hlavicka = new Uint8Array(21);
  hlavicka.set(sol);
  new DataView(hlavicka.buffer).setUint32(16, 4096);
  hlavicka[20] = as.length;
  return spoj(hlavicka, as, sifra);
}

export type Odber = { id: number; endpoint: string; p256dh: string; auth: string };

// pošle správu na jeden telefón; vráti HTTP stav (201 = doručené službe, 404/410 = telefón odber zrušil)
export async function posli(o: Odber, sprava: unknown, v: Vapid, ttl = 3600): Promise<number> {
  const telo = await zasifruj(o.p256dh, o.auth, te.encode(JSON.stringify(sprava)));
  const aud = new URL(o.endpoint).origin;
  const r = await fetch(o.endpoint, {
    method: "POST",
    headers: {
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: String(ttl),
      Urgency: "high",
      Authorization: "vapid t=" + (await jwt(v, aud)) + ", k=" + v.verejny,
    },
    body: telo,
  });
  await r.body?.cancel();
  return r.status;
}
