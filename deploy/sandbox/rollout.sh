#!/usr/bin/env bash
# The sandbox rollout, run on the VPS as the deploy user. It is the ONLY command the deploy key may run:
# in ~/.ssh/authorized_keys the key is bound with
#   command="/opt/checkitout-sandbox/rollout.sh",no-port-forwarding,no-agent-forwarding,no-pty,no-X11-forwarding ssh-ed25519 AAAA…
# so whatever the runner sends arrives as SSH_ORIGINAL_COMMAND and is parsed here, never executed.
#
#   rollout.sh deploy <fe-tag> <be-tag> [bundle-sha]   fetch the bundle at the sha, pull, up --wait, health;
#                                                      on any failure the previous tags come back
#   rollout.sh rollback                                the previous tags, up --wait, health
#   rollout.sh reseed                                  drop the database volume and the uploads, start again
#   rollout.sh status | logs [lines] [service]         read-only
#
# Design of record: docs/ci/SANDBOX.md. Rehearse locally with SANDBOX_ROOT pointing at a scratch directory,
# SANDBOX_BUNDLE_LOCAL at the checkout (no pushed branch needed) and SANDBOX_SKIP_PULL=1 for local images.
set -euo pipefail

ROOT=${SANDBOX_ROOT:-/opt/checkitout-sandbox}
RAW=${SANDBOX_REPO_RAW:-https://raw.githubusercontent.com/Check-It-Out-Dev/checkitout-frontend}
BUNDLE_FILES=("deploy/sandbox/docker-compose.yml" "deploy/sandbox/alloy/config.alloy")
HEALTH_TRIES=${HEALTH_TRIES:-40}
LOG=$ROOT/rollout.log

if [[ -n "${SSH_ORIGINAL_COMMAND:-}" && $# -eq 0 ]]; then
  # shellcheck disable=SC2206
  set -- $SSH_ORIGINAL_COMMAND
fi
cmd=${1:-}
shift || true

say() { printf '%s %s\n' "$(date -u +%FT%TZ)" "$*" | tee -a "$LOG"; }
die() { say "ERROR: $*"; exit 1; }
tag_ok() { [[ $1 =~ ^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$ ]]; }
sha_ok() { [[ $1 =~ ^([0-9a-f]{7,40}|main)$ ]]; }
compose() { docker compose --project-directory "$ROOT" --env-file "$ROOT/.env" -f "$ROOT/bundle/deploy/sandbox/docker-compose.yml" "$@"; }
port() { sed -n 's/^SANDBOX_PORT=//p' "$ROOT/.env" | tail -1; }
profiles() { grep -q '^LOKI_URL=.\+' "$ROOT/.env" && echo "--profile logging" || true; }

healthy() {
  local p; p=$(port); p=${p:-8090}
  for ((i = 1; i <= HEALTH_TRIES; i++)); do
    if curl -fsS -m 5 "http://127.0.0.1:$p/api/actuator/health" 2>/dev/null | grep -q '"UP"' &&
       curl -fsS -m 5 -o /dev/null "http://127.0.0.1:$p/healthz"; then
      say "healthy after $i checks"
      return 0
    fi
    sleep 3
  done
  return 1
}

set_tags() {
  local fe=$1 be=$2
  cp "$ROOT/.env" "$ROOT/.env.previous"
  sed -i -e "s/^FE_TAG=.*/FE_TAG=$fe/" -e "s/^BE_TAG=.*/BE_TAG=$be/" "$ROOT/.env"
  grep -q '^FE_TAG=' "$ROOT/.env" || echo "FE_TAG=$fe" >> "$ROOT/.env"
  grep -q '^BE_TAG=' "$ROOT/.env" || echo "BE_TAG=$be" >> "$ROOT/.env"
}

fetch_bundle() {
  local sha=$1 tmp="$ROOT/bundle.new"
  rm -rf "$tmp"
  for f in "${BUNDLE_FILES[@]}"; do
    mkdir -p "$tmp/$(dirname "$f")"
    if [[ -n "${SANDBOX_BUNDLE_LOCAL:-}" ]]; then
      cp "$SANDBOX_BUNDLE_LOCAL/$f" "$tmp/$f" || die "no $f under SANDBOX_BUNDLE_LOCAL"
    else
      curl -fsSL -m 30 "$RAW/$sha/$f" -o "$tmp/$f" || die "could not fetch $f at $sha"
    fi
  done
  # shellcheck disable=SC2046
  docker compose --project-directory "$ROOT" --env-file "$ROOT/.env" -f "$tmp/deploy/sandbox/docker-compose.yml" config -q || die "bundle at $sha does not validate"
  rm -rf "$ROOT/bundle.old"
  [[ -d $ROOT/bundle ]] && mv "$ROOT/bundle" "$ROOT/bundle.old"
  mv "$tmp" "$ROOT/bundle"
  echo "$sha" > "$ROOT/bundle/SHA"
  say "bundle $sha in place"
}

bring_up() {
  # shellcheck disable=SC2046
  [[ -n "${SANDBOX_SKIP_PULL:-}" ]] || compose $(profiles) pull -q
  # shellcheck disable=SC2046
  compose $(profiles) up -d --remove-orphans --wait --wait-timeout 300
}

rollback() {
  say "rolling back to the previous tags"
  [[ -f $ROOT/.env.previous ]] || die "no previous tags to roll back to"
  cp "$ROOT/.env" "$ROOT/.env.failed"
  cp "$ROOT/.env.previous" "$ROOT/.env"
  if [[ -d $ROOT/bundle.old ]]; then rm -rf "$ROOT/bundle"; mv "$ROOT/bundle.old" "$ROOT/bundle"; fi
  bring_up && healthy || die "rollback did not become healthy; the stack needs a human"
  say "rolled back: $(grep -E '^(FE|BE)_TAG=' "$ROOT/.env" | tr '\n' ' ')"
}

case $cmd in
  deploy)
    fe=${1:-} be=${2:-} sha=${3:-main}
    tag_ok "$fe" && tag_ok "$be" && sha_ok "$sha" || die "usage: deploy <fe-tag> <be-tag> [bundle-sha]"
    say "deploy fe=$fe be=$be bundle=$sha"
    fetch_bundle "$sha"
    set_tags "$fe" "$be"
    if bring_up && healthy; then
      say "deployed: $(grep -E '^(FE|BE)_TAG=' "$ROOT/.env" | tr '\n' ' ')"
    else
      say "deploy failed"
      rollback
      exit 1
    fi
    ;;
  rollback) rollback ;;
  reseed)
    say "reseed: dropping the database volume and the uploads"
    compose stop backend
    compose rm -sf postgres
    docker volume rm -f checkitout-sandbox_pgdata >/dev/null
    find "$(sed -n 's/^UPLOADS_DIR=//p' "$ROOT/.env" | tail -1)" -mindepth 1 -delete 2>/dev/null || true
    bring_up && healthy || die "reseed did not become healthy"
    say "reseeded"
    ;;
  status)
    compose ps
    grep -E '^(FE|BE)_TAG=' "$ROOT/.env"
    [[ -f $ROOT/bundle/SHA ]] && echo "bundle $(cat "$ROOT/bundle/SHA")"
    ;;
  logs)
    lines=${1:-200}; svc=${2:-}
    [[ $lines =~ ^[0-9]{1,5}$ ]] || die "lines must be a number"
    [[ -z $svc || $svc =~ ^[a-z]+$ ]] || die "service must be a name"
    # shellcheck disable=SC2086
    compose logs --no-color --tail="$lines" $svc
    ;;
  *)
    echo "usage: rollout.sh deploy <fe-tag> <be-tag> [bundle-sha] | rollback | reseed | status | logs [lines] [service]" >&2
    exit 2
    ;;
esac
