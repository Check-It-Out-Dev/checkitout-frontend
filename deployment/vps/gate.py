#!/usr/bin/env python3
# checkitout-gate — the "htaccess" for the greenfield test domain, mirroring the
# prod pattern on vpsnew (nginx auth_request -> localhost:5000). Stdlib only.
#
#   GET  /login            login form
#   POST /login            password check -> signed cookie -> 302 /
#   GET  /validate_session 204 if the cookie's HMAC+expiry hold, else 401
#
# Secrets live in /etc/checkitout-gate/: `key` (32B hex, HMAC secret) and
# `password.scrypt` (salt$hash of the gate password). Rotate the password with:
#   sudo /usr/local/bin/gate-passwd 'new-password'   (regenerates the file)
import hashlib
import hmac
import http.server
import os
import secrets
import time
import urllib.parse

CONF = "/etc/checkitout-gate"
KEY = bytes.fromhex(open(os.path.join(CONF, "key")).read().strip())
SALT_HASH = open(os.path.join(CONF, "password.scrypt")).read().strip()
COOKIE = "cio_gate"
TTL = 30 * 24 * 3600  # 30 days

PAGE = """<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>check-it-out — dostep testowy</title>
<style>body{font:16px system-ui;display:grid;place-items:center;min-height:100vh;margin:0;background:#0f1115;color:#d7dde4}
form{background:#171a21;padding:2rem 2.5rem;border-radius:12px;box-shadow:0 8px 40px #0008}
input{font:inherit;padding:.55rem .8rem;border-radius:8px;border:1px solid #333;background:#0f1115;color:#d7dde4;width:16rem}
button{font:inherit;margin-top:1rem;padding:.55rem 1.4rem;border-radius:8px;border:0;background:#e8590c;color:#fff;cursor:pointer}
p.err{color:#ff6b6b}</style>
<form method="post" action="/login-tst">
  <h2>Wersja testowa</h2>
  <p>Podaj haslo dostepu.</p>%ERR%
  <input type="password" name="password" autofocus autocomplete="current-password">
  <button>Wejdz</button>
</form>"""


def check_password(pw):
    salt_hex, want = SALT_HASH.split("$")
    got = hashlib.scrypt(pw.encode(), salt=bytes.fromhex(salt_hex),
                         n=16384, r=8, p=1).hex()
    return hmac.compare_digest(got, want)


def make_cookie():
    exp = str(int(time.time()) + TTL)
    sig = hmac.new(KEY, exp.encode(), hashlib.sha256).hexdigest()
    return f"{exp}.{sig}"


def cookie_ok(value):
    try:
        exp, sig = value.split(".")
        want = hmac.new(KEY, exp.encode(), hashlib.sha256).hexdigest()
        return hmac.compare_digest(sig, want) and int(exp) > time.time()
    except (ValueError, AttributeError):
        return False


class H(http.server.BaseHTTPRequestHandler):
    server_version = "cio-gate"

    def _cookie(self):
        raw = self.headers.get("Cookie", "")
        for part in raw.split(";"):
            k, _, v = part.strip().partition("=")
            if k == COOKIE:
                return v
        return None

    def do_GET(self):
        path = urllib.parse.urlparse(self.path).path
        if path == "/validate_session":
            ok = cookie_ok(self._cookie())
            self.send_response(204 if ok else 401)
            self.end_headers()
            return
        if path == "/login":
            body = PAGE.replace("%ERR%", "").encode()
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)
            return
        self.send_response(404)
        self.end_headers()

    def do_POST(self):
        if urllib.parse.urlparse(self.path).path != "/login":
            self.send_response(404)
            self.end_headers()
            return
        n = int(self.headers.get("Content-Length", 0) or 0)
        data = urllib.parse.parse_qs(self.rfile.read(min(n, 4096)).decode())
        pw = (data.get("password") or [""])[0]
        time.sleep(0.4)  # flat cost per attempt; nginx rate-limits the flood
        if check_password(pw):
            self.send_response(302)
            self.send_header("Set-Cookie",
                             f"{COOKIE}={make_cookie()}; Path=/; Max-Age={TTL}; "
                             "HttpOnly; Secure; SameSite=Lax")
            self.send_header("Location", "/")
            self.end_headers()
            return
        body = PAGE.replace("%ERR%", '<p class="err">Nieprawidlowe haslo.</p>').encode()
        self.send_response(401)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt, *args):
        pass  # nginx logs access; the gate stays quiet


if __name__ == "__main__":
    http.server.ThreadingHTTPServer(("127.0.0.1", 5000), H).serve_forever()
