# CUTOVER-RUNBOOK — checkitout.app → demo VPS (manual path + emergencies)

The preferred path is the script: `pwsh -ExecutionPolicy Bypass -File
cutover-app.ps1` (config in `.env.cutover`, gitignored — see the example
file). Everything below is the same operation by hand, for when the script
cannot run. State as prepared on 2026-09-03; the `.app` TLS cert is already
issued on the VPS and renews itself (certbot DNS-01 hooks).

**What the cutover does:** checkitout.app + www start serving the greenfield
DEMO (FE-only, mocked backend) publicly from the small VPS 57.128.225.42;
the htaccess gate is removed (check-it-out.pl also becomes public);
`loki.checkitout.app` and everything else stays on vpsnew 51.38.135.102.
Prod on vpsnew keeps running — it just stops receiving `.app` web traffic.

## IDs and addresses (verified 2026-09-03)

| thing                           | value                                                                                               |
| ------------------------------- | --------------------------------------------------------------------------------------------------- |
| VPS (demo)                      | `57.128.225.42` = `vps-a1b53328.vps.ovh.net`, user `ubuntu`, key `~/.ssh/id_ed25519_greenfield_vps` |
| old origin (prod, vpsnew)       | `51.38.135.102`                                                                                     |
| CF zone `checkitout.app`        | `9926afdbfd68ded1ce973e51ca4df1e1`                                                                  |
| CF record apex `checkitout.app` | `fa2085b59bf342a6b76dfeea68e007db`                                                                  |
| CF record `www.checkitout.app`  | `efa938ef7b23c573415a6dbdfca567ab`                                                                  |
| CF zone `check-it-out.pl`       | `4b5c59cf31e37474c3293b454d74d5ee` (already flipped 03.09)                                          |
| CF API base                     | `https://api.cloudflare.com/client/v4`                                                              |

## Manual cutover (4 commands)

1. **VPS: enable the public configs, drop the gate** (nginx confs were
   prepared 03.09; this only swaps symlinks):

```
ssh -i %USERPROFILE%\.ssh\id_ed25519_greenfield_vps ubuntu@57.128.225.42 "sudo ln -sf /etc/nginx/sites-available/app-public.conf /etc/nginx/sites-enabled/app-public.conf && sudo ln -sf /etc/nginx/sites-available/greenfield-public.conf /etc/nginx/sites-enabled/greenfield.conf && sudo systemctl disable --now checkitout-gate; sudo nginx -t && sudo systemctl reload nginx"
```

2. **Cloudflare: flip apex** (replace `$TOKEN`):

```
curl -X PATCH "https://api.cloudflare.com/client/v4/zones/9926afdbfd68ded1ce973e51ca4df1e1/dns_records/fa2085b59bf342a6b76dfeea68e007db" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" --data "{\"content\":\"57.128.225.42\"}"
```

3. **Cloudflare: flip www**:

```
curl -X PATCH "https://api.cloudflare.com/client/v4/zones/9926afdbfd68ded1ce973e51ca4df1e1/dns_records/efa938ef7b23c573415a6dbdfca567ab" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" --data "{\"content\":\"57.128.225.42\"}"
```

4. **Test** (15 s after the flip; records are proxied so there is no DNS
   TTL wait — the origin change is effective as soon as CF applies it):

```
curl -s https://checkitout.app/health        <- expect: OK app-public
curl -s -o NUL -w "%{http_code}" https://checkitout.app/         <- 200
curl -s -o NUL -w "%{http_code}" https://www.checkitout.app/     <- 200
curl -s -o NUL -w "%{http_code}" https://check-it-out.pl/        <- 200 (no login redirect anymore)
```

## Rollback (any time, seconds)

`pwsh -File cutover-app.ps1 -Rollback`, or by hand: re-run steps 2+3
with `"content":"51.38.135.102"`, then restore the gate on the VPS:

```
ssh -i %USERPROFILE%\.ssh\id_ed25519_greenfield_vps ubuntu@57.128.225.42 "sudo ln -sf /etc/nginx/sites-available/greenfield.conf /etc/nginx/sites-enabled/greenfield.conf && sudo rm -f /etc/nginx/sites-enabled/app-public.conf && sudo systemctl enable --now checkitout-gate && sudo nginx -t && sudo systemctl reload nginx"
```

## Emergencies

- **526 after flip** (CF strict cannot validate origin cert): check the cert
  the VPS serves: `ssh … "echo | openssl s_client -connect 127.0.0.1:443
-servername checkitout.app 2>/dev/null | openssl x509 -noout -subject
-dates"`. If expired/missing, reissue:
  `ssh … "sudo certbot certonly --manual --preferred-challenges dns
--manual-auth-hook /root/.secrets/cf-auth-hook.sh --manual-cleanup-hook
/root/.secrets/cf-cleanup-hook.sh -d checkitout.app -d www.checkitout.app
--non-interactive"` then `sudo systemctl reload nginx`.
- **SSH dead**: OVH manager → the VPS → KVM console; or rescue mode. The
  DNS flip (steps 2+3) works without the VPS — but do NOT flip if the VPS
  is down; fix the VPS first (rollback needs nothing from the VPS).
- **CF token dead**: dash.cloudflare.com → checkitout.app → DNS → edit the
  A records `checkitout.app` and `www` by hand to `57.128.225.42` (keep the
  orange proxy cloud ON).
- **Page serves but looks stale**: re-deploy the bundle (see README.md in
  this folder), then Cloudflare → Caching → Purge Everything.
- **Something is deeply wrong**: rollback (above), everything returns to
  vpsnew, and the demo stays reachable gated at
  `https://vps-a1b53328.vps.ovh.net/` for debugging.
