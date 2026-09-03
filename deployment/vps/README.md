# deployment/vps — the greenfield demo on the small test VPS

FE-only serving (no backend on this box — the demo build mocks every `/api`
call in the browser), so this infra lives in the FE repo.

Provisioned 2026-09-03 on `vps-a1b53328.vps.ovh.net` (**57.128.225.42**, OVH
offer "VPS vps2023-le-4": 4 vcore / 4 GB / 80 GB), rebuilt via the OVH API to
Ubuntu 24.04 with the dedicated key `~/.ssh/id_ed25519_greenfield_vps`
(ssh alias `gvps`, user `ubuntu`). Prod (vpsnew 51.38.135.102) untouched.

## Shape

- **nginx** (`check-it-out.pl.conf` here = live `sites-available/greenfield.conf`)
  serves the DEMO build statically from `/var/www/check-it-out.pl` (SPA
  fallback to the prerendered `index.html`). A second block
  (`qa-hostname.conf`, on the box) serves the same root under
  `https://vps-a1b53328.vps.ovh.net/` with a real Let's Encrypt cert for
  browser QA before the DNS flip.
- **checkitout-gate** (`gate.py`, systemd `checkitout-gate.service`) is the
  "htaccess": nginx `auth_request` -> `127.0.0.1:5000/validate_session`;
  no cookie -> 302 `/login-tst`; the login form sets a 30-day HMAC cookie.
  Change the password on the box: `echo 'new-pw' | sudo gate-passwd`.
- **`set-domain.sh <domain> [--issue]`** — the one-liner domain swap
  (rewrites `server_name`, optional Let's Encrypt webroot issue, reload).
- `/api/` on the domain block returns a 503 JSON stub — irrelevant to the
  demo build (its interceptor answers before the network), but honest if
  something escapes.
- ufw: OpenSSH/80/443 only. TLS on the domain block: self-signed until the
  Cloudflare origin flips here (CF "Full" accepts it), then
  `set-domain.sh check-it-out.pl --issue`.

## Build + deploy the demo bundle

```
npm run build -- --configuration demo
cd dist/check-it-out-fe-greenfield/browser
scp -r . gvps:/var/www/check-it-out.pl/       # or: tar czf - . | ssh gvps 'tar xzf - -C /var/www/check-it-out.pl'
```

`--configuration demo` uses `src/environments/environment.demo.ts` — fully
mocked backend (`core/demo/demo.interceptor.ts`), FE-only sandboxes, guided
journeys, interactive showcases; never creates accounts, takes payments, or
contacts a real backend.

## Verified 2026-09-03

curl `--resolve` chain: no-cookie `/` -> 302 `/login-tst`; login POST ->
HMAC cookie; gated `/` -> 200 with the prerendered greenfield title;
`/health` 200. Chrome (real LE cert): gate page renders, no interstitial.

## Cutover (owner)

1. Cloudflare: point the `check-it-out.pl` A record at 57.128.225.42.
2. `ssh gvps 'sudo set-domain.sh check-it-out.pl --issue'` for a real cert.
3. Any later domain: `sudo set-domain.sh <new-domain> --issue`.
