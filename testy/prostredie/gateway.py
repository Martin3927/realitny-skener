#!/usr/bin/env python3
"""Lokálna náhrada Supabase pre testy: statické súbory z docs/, /rest/v1 -> PostgREST,
jednoduché /auth/v1 (heslo z auth.users cez crypt), /functions a /storage odpovedajú prázdno."""
import base64, hashlib, hmac, json, os, sys, time, uuid, urllib.request, urllib.error
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
import subprocess

DOCS = os.environ.get("DOCS", "/home/claude/realitny-skener/docs")
SECRET = b"lokalny-tajny-kluc-pre-testy-0123456789abcdef"
PGRST = "http://127.0.0.1:3000"
PSQL = ["psql", "-h", "127.0.0.1", "-p", "54322", "-U", "postgres", "-d", "typek", "-tAc"]


def b64(d):
    return base64.urlsafe_b64encode(d).rstrip(b"=").decode()


def jwt(claims):
    h = b64(json.dumps({"alg": "HS256", "typ": "JWT"}).encode())
    p = b64(json.dumps(claims).encode())
    s = b64(hmac.new(SECRET, f"{h}.{p}".encode(), hashlib.sha256).digest())
    return f"{h}.{p}.{s}"


def claims_z(token):
    try:
        p = token.split(".")[1]
        return json.loads(base64.urlsafe_b64decode(p + "=" * (-len(p) % 4)))
    except Exception:
        return None


ANON = jwt({"role": "anon", "iss": "lokal", "exp": 4102444800})
REFRESH = {}


def sql(q):
    return subprocess.run(PSQL + [q], capture_output=True, text=True).stdout.strip()


def user_obj(uid):
    row = sql(f"select json_build_object('id', id, 'email', email, 'aud', 'authenticated', 'role', 'authenticated', 'user_metadata', coalesce(raw_user_meta_data,'{{}}'), 'app_metadata', json_build_object('provider','email'), 'created_at', created_at) from auth.users where id = '{uid}'")
    return json.loads(row) if row else None


def session(uid):
    now = int(time.time())
    at = jwt({"sub": uid, "role": "authenticated", "aud": "authenticated", "iat": now, "exp": now + 3600, "email": (user_obj(uid) or {}).get("email")})
    rt = uuid.uuid4().hex
    REFRESH[rt] = uid
    return {"access_token": at, "token_type": "bearer", "expires_in": 3600, "expires_at": now + 3600, "refresh_token": rt, "user": user_obj(uid)}


class H(SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=DOCS, **k)

    def log_message(self, *a):
        pass

    def _json(self, code, obj):
        b = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(b)))
        self.end_headers()
        self.wfile.write(b)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,PATCH,PUT,DELETE,OPTIONS")
        self.end_headers()

    def _body(self):
        n = int(self.headers.get("Content-Length") or 0)
        return self.rfile.read(n) if n else b""

    def _token_uid(self):
        a = self.headers.get("Authorization", "")
        c = claims_z(a[7:]) if a.startswith("Bearer ") else None
        return c.get("sub") if c else None

    def route(self, method):
        p = self.path
        if p.startswith("/config.js"):
            b = f'window.SKENER_CONFIG = {{ supabaseUrl: "http://localhost:8000", supabaseKey: "{ANON}" }};'.encode()
            self.send_response(200); self.send_header("Content-Type", "application/javascript"); self.send_header("Content-Length", str(len(b))); self.end_headers(); self.wfile.write(b); return
        if p.startswith("/rest/v1/"):
            return self.proxy(method)
        if p.startswith("/auth/v1/token"):
            body = json.loads(self._body() or b"{}")
            if "grant_type=refresh_token" in p:
                uid = REFRESH.get(body.get("refresh_token"))
                return self._json(200, session(uid)) if uid else self._json(400, {"error": "invalid_grant", "error_description": "Invalid Refresh Token"})
            em = (body.get("email") or "").replace("'", "''"); pw = (body.get("password") or "").replace("'", "''")
            uid = sql(f"select id from auth.users where email = '{em}' and encrypted_password = extensions.crypt('{pw}', encrypted_password)")
            if not uid:
                return self._json(400, {"error": "invalid_grant", "error_description": "Invalid login credentials", "code": "invalid_credentials"})
            return self._json(200, session(uid))
        if p.startswith("/auth/v1/user"):
            uid = self._token_uid()
            if method == "PUT":
                body = json.loads(self._body() or b"{}")
                if body.get("password"):
                    pw = body["password"].replace("'", "''")
                    sql(f"update auth.users set encrypted_password = extensions.crypt('{pw}', extensions.gen_salt('bf')) where id = '{uid}'")
            u = user_obj(uid) if uid else None
            return self._json(200, u) if u else self._json(401, {"msg": "bad jwt"})
        if p.startswith("/auth/v1/logout"):
            self.send_response(204); self.end_headers(); return
        if p.startswith("/functions/v1/") or p.startswith("/storage/v1/"):
            self._body()
            return self._json(200, {} if method != "GET" else [])
        if method == "GET":
            return super().do_GET()
        self._json(404, {})

    def proxy(self, method):
        url = PGRST + self.path[len("/rest/v1"):]
        data = self._body() if method in ("POST", "PATCH", "PUT", "DELETE") else None
        h = {k: v for k, v in self.headers.items() if k.lower() in ("content-type", "prefer", "accept", "range", "range-unit", "content-profile", "accept-profile")}
        a = self.headers.get("Authorization", "")
        c = claims_z(a[7:]) if a.startswith("Bearer ") else None
        h["Authorization"] = a if c and c.get("role") else "Bearer " + ANON
        req = urllib.request.Request(url, data=data, method=method, headers=h)
        try:
            r = urllib.request.urlopen(req, timeout=60)
            code, body, hdrs = r.status, r.read(), r.headers
        except urllib.error.HTTPError as e:
            code, body, hdrs = e.code, e.read(), e.headers
        self.send_response(code)
        for k in ("Content-Type", "Content-Range", "Preference-Applied"):
            if hdrs.get(k):
                self.send_header(k, hdrs.get(k))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Expose-Headers", "Content-Range")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self): self.route("GET")
    def do_POST(self): self.route("POST")
    def do_PATCH(self): self.route("PATCH")
    def do_PUT(self): self.route("PUT")
    def do_DELETE(self): self.route("DELETE")


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "secret":
        print(SECRET.decode()); sys.exit()
    ThreadingHTTPServer(("127.0.0.1", 8000), H).serve_forever()
