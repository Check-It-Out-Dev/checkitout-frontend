#!/usr/bin/env bash
# Smoke the sandbox from the outside, the way the deploy workflow does after every rollout:
#   deploy/sandbox/smoke.sh https://sandbox.checkitout.app            # guarded sandbox (the default)
#   SANDBOX_GUARD=0 deploy/sandbox/smoke.sh http://127.0.0.1:8090     # a local stack on plain dev-lite
# Every check prints one line; the script exits non-zero on the first failure. Persona e-mails are the
# seeded dev-lite accounts (docs/ci/SANDBOX.md §4).
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
code() { curl -sS -m 15 -o "${2:-/dev/null}" -w '%{http_code}' -b "$JAR" -c "$JAR" "${@:3}" "$1"; }

c=$(code "$BASE/healthz");                          [[ $c == 200 ]] && ok "frontend /healthz $c" || bad "frontend /healthz $c"
c=$(code "$BASE/" /tmp/smoke-index.html);           [[ $c == 200 ]] && grep -q "<app-root" /tmp/smoke-index.html && ok "shell served" || bad "shell $c"
c=$(code "$BASE/api/actuator/health" /tmp/smoke-h); [[ $c == 200 ]] && grep -q '"UP"' /tmp/smoke-h && ok "backend health UP" || bad "backend health $c"
c=$(code "$BASE/api/actuator/prometheus");         [[ $c == 404 ]] && ok "actuator beyond health is not public ($c)" || bad "actuator/prometheus reachable: $c"
c=$(code "$BASE/api/v3/api-docs" /tmp/smoke-spec); [[ $c == 200 ]] && grep -q '"openapi"' /tmp/smoke-spec && ok "OpenAPI published at /api/v3/api-docs" || bad "api-docs $c"
c=$(code "$BASE/api/test/auth/mock-session" /tmp/smoke-ms -X POST -H 'Content-Type: application/json' -d "{\"email\":\"$INFLUENCER\",\"role\":\"INFLUENCER\"}")
[[ $c == 200 ]] && grep -q 'session' "$JAR" && ok "persona sign-in $INFLUENCER (cookies set)" || bad "persona sign-in $c"
c=$(code "$BASE/api/users/me" /tmp/smoke-me);       [[ $c == 200 ]] && grep -q "$INFLUENCER" /tmp/smoke-me && ok "/users/me is the persona" || bad "/users/me $c"
c=$(code "$BASE/api/partnership-opportunity/paged?page=0&size=5&active=true" /tmp/smoke-c)
[[ $c == 200 ]] && grep -q '"content"' /tmp/smoke-c && ok "campaigns listed" || bad "campaigns $c"
if [[ $GUARD == 1 ]]; then
  : > "$JAR"
  c=$(code "$BASE/api/test/auth/mock-session" /dev/null -X POST -H 'Content-Type: application/json' -d '{"email":"anyone@example.com","role":"ADMIN"}')
  [[ $c == 403 ]] && ok "guard: an unknown persona is refused ($c)" || bad "guard: unknown persona got $c"
  c=$(code "$BASE/api/test/auth/ensure-user" /dev/null -X POST -H 'Content-Type: application/json' -d '{}')
  [[ $c == 404 || $c == 403 || $c == 405 ]] && ok "guard: ensure-user is closed ($c)" || bad "guard: ensure-user answered $c"
fi
[[ $fail == 0 ]] && echo "smoke: all green" || { echo "smoke: FAILED"; exit 1; }
