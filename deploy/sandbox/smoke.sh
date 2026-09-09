#!/usr/bin/env bash
# Smoke the sandbox from the outside, the way the deploy workflow does after every rollout:
#   deploy/sandbox/smoke.sh https://sandbox.checkitout.app            # guarded sandbox (the default)
#   SANDBOX_GUARD=0 deploy/sandbox/smoke.sh http://127.0.0.1:8090     # a local stack on plain dev-lite
#   SMOKE_RESOLVE=sandbox.checkitout.app:443:57.128.225.42 …          # pin to the origin, skip the CDN
# Every check prints one line; the script exits non-zero on the first failure. Persona e-mails are the
# seeded dev-lite accounts (docs/ci/SANDBOX.md §4).
#
# Why SMOKE_RESOLVE exists. The zone runs Cloudflare's Bot Fight Mode, which answers a datacentre curl
# with 403 — so from a GitHub runner every check here failed while the sandbox was perfectly healthy, and
# the deploy workflow rolled a good release back on the strength of it. Pinning the hostname to the origin
# address keeps the whole real path under test — public hostname, public certificate, host nginx, the
# container's nginx, the backend — and removes only the edge, which is not ours to test.
set -uo pipefail
BASE=${1:?base url}
BASE=${BASE%/}
GUARD=${SANDBOX_GUARD:-1}
INFLUENCER=${SANDBOX_INFLUENCER:-test.influencer@test.com}
JAR=$(mktemp)
trap 'rm -f "$JAR"' EXIT
fail=0
ok() { printf 'ok    %s\n' "$*"; }
bad() { printf 'FAIL  %s\n' "$*"; fail=1; }
RESOLVE=()
[[ -n ${SMOKE_RESOLVE:-} ]] && RESOLVE=(--resolve "$SMOKE_RESOLVE")
# Every request carries the Origin a browser would send. Without it these checks cannot see a CORS
# rejection, and that is not hypothetical: the public sandbox answered 403 "Invalid CORS request" to every
# browser POST from the day it went live, because the dev-lite profile allows loopback origins only —
# while this script, sending no Origin at all, reported ten green checks.
ORIGIN=${SMOKE_ORIGIN:-$BASE}
code() { curl -sS -m 15 ${RESOLVE[@]+"${RESOLVE[@]}"} -H "Origin: $ORIGIN" -o "${2:-/dev/null}" -w '%{http_code}' -b "$JAR" -c "$JAR" "${@:3}" "$1"; }

c=$(code "$BASE/healthz");                          [[ $c == 200 ]] && ok "frontend /healthz $c" || bad "frontend /healthz $c"
c=$(code "$BASE/" /tmp/smoke-index.html);           [[ $c == 200 ]] && grep -q "<app-root" /tmp/smoke-index.html && ok "shell served" || bad "shell $c"
c=$(code "$BASE/api/actuator/health" /tmp/smoke-h); [[ $c == 200 ]] && grep -q '"UP"' /tmp/smoke-h && ok "backend health UP" || bad "backend health $c"
# Assert on the body, not only on the status: a CDN block page is also a 4xx, and a check that reads one
# as the other is worse than no check. Here: the metrics must not be there, whoever answered.
c=$(code "$BASE/api/actuator/prometheus" /tmp/smoke-prom)
{ [[ $c == 404 ]] && ! grep -qE '^# (HELP|TYPE) ' /tmp/smoke-prom; } && ok "actuator beyond health is not public ($c)" || bad "actuator/prometheus reachable: $c"
c=$(code "$BASE/api/v3/api-docs" /tmp/smoke-spec); [[ $c == 200 ]] && grep -q '"openapi"' /tmp/smoke-spec && ok "OpenAPI published at /api/v3/api-docs" || bad "api-docs $c"
c=$(code "$BASE/api/test/auth/mock-session" /tmp/smoke-ms -X POST -H 'Content-Type: application/json' -d "{\"email\":\"$INFLUENCER\",\"role\":\"INFLUENCER\"}")
[[ $c == 200 ]] && grep -q 'session' "$JAR" && ok "persona sign-in $INFLUENCER (cookies set)" || bad "persona sign-in $c"
c=$(code "$BASE/api/users/me" /tmp/smoke-me);       [[ $c == 200 ]] && grep -q "$INFLUENCER" /tmp/smoke-me && ok "/users/me is the persona" || bad "/users/me $c"
c=$(code "$BASE/api/partnership-opportunity/paged?page=0&size=5&active=true" /tmp/smoke-c)
[[ $c == 200 ]] && grep -q '"content"' /tmp/smoke-c && ok "campaigns listed" || bad "campaigns $c"
if [[ $GUARD == 1 ]]; then
  : > "$JAR"
  # These two are the reason the body matters. Cloudflare's 403 made both of them print `ok` on 2026-09-09
  # while nothing of ours had been consulted at all: the guard must be shown refusing, in its own words.
  c=$(code "$BASE/api/test/auth/mock-session" /tmp/smoke-guard -X POST -H 'Content-Type: application/json' -d '{"email":"anyone@example.com","role":"ADMIN"}')
  { [[ $c == 403 ]] && grep -q '"path":"/api/test/auth/mock-session"' /tmp/smoke-guard; } &&
    ok "guard: the application refuses an unknown persona ($c)" || bad "guard: unknown persona got $c: $(head -c 90 /tmp/smoke-guard)"
  c=$(code "$BASE/api/test/auth/ensure-user" /tmp/smoke-guard -X POST -H 'Content-Type: application/json' -d '{}')
  { [[ $c == 404 ]] && grep -q '"path":"/api/test/auth/ensure-user"' /tmp/smoke-guard; } &&
    ok "guard: the application closes ensure-user ($c)" || bad "guard: ensure-user answered $c: $(head -c 90 /tmp/smoke-guard)"
fi
# When the checks went to the origin, say what the public name does as well — reported, never asserted:
# the edge's behaviour towards robots is Cloudflare's business, and a human browser is what it is tuned for.
if [[ -n ${SMOKE_RESOLVE:-} ]]; then
  edge=$(curl -sS -m 15 -o /dev/null -w '%{http_code}' "$BASE/healthz" 2>/dev/null || echo 000)
  if [[ $edge == 200 ]]; then ok "edge: the public name answers too ($edge)"
  else printf 'note  edge: the public name answered %s to this client — Cloudflare bot protection; the checks above went to the origin\n' "$edge"; fi
fi
[[ $fail == 0 ]] && echo "smoke: all green" || { echo "smoke: FAILED"; exit 1; }
