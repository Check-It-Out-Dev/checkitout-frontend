#!/usr/bin/env bash
# Exercise publish-pages.sh against a local bare repository: latest-replacement, retention,
# and the overlay rule it must not break.
set -euo pipefail

SCRIPT=${1:?usage: test_publish_pages.sh <path to publish-pages.sh>}
ROOT=$(mktemp -d)
BARE="$ROOT/remote.git"
fail=0

note() { printf '%-58s %s\n' "$1" "$2"; }
check() { if [ "$2" = "$3" ]; then note "$1" "ok"; else note "$1" "FAIL: expected [$3], got [$2]"; fail=1; fi; }

git init --quiet --bare -b gh-pages "$BARE"

# seed the branch: one tier's report at `latest`, forty per-run directories, and a second tier
seed="$ROOT/seed"
mkdir -p "$seed/allure/latest" "$seed/playwright/latest"
echo old > "$seed/allure/latest/stale-attachment.txt"
echo old > "$seed/allure/latest/index.html"
echo pw  > "$seed/playwright/latest/index.html"
for n in $(seq 1 40); do mkdir -p "$seed/allure/$n"; echo "run $n" > "$seed/allure/$n/index.html"; done
echo hist > "$seed/allure/history.jsonl"
PAGES_REMOTE="$BARE" PAGES_KEEP=0 bash "$SCRIPT" "$seed" "seed" > /dev/null

# publish a fresh allure report only
site="$ROOT/site"
mkdir -p "$site/allure/latest" "$site/allure/41"
echo new > "$site/allure/latest/index.html"
echo new > "$site/allure/41/index.html"
PAGES_REMOTE="$BARE" PAGES_KEEP=30 bash "$SCRIPT" "$site" "publish" > /dev/null

out="$ROOT/out"
git clone --quiet --branch gh-pages "$BARE" "$out"

check "the stale attachment in allure/latest is gone" \
      "$([ -e "$out/allure/latest/stale-attachment.txt" ] && echo present || echo gone)" "gone"
check "allure/latest is this run's report" "$(cat "$out/allure/latest/index.html")" "new"
check "another tier's latest is untouched" "$(cat "$out/playwright/latest/index.html")" "pw"
check "a non-numeric sibling is never pruned" \
      "$([ -f "$out/allure/history.jsonl" ] && echo present || echo gone)" "present"
check "thirty per-run reports are kept" \
      "$(find "$out/allure" -mindepth 1 -maxdepth 1 -type d -regex '.*/[0-9][0-9]*$' | wc -l | tr -d ' ')" "30"
check "the newest run is kept" "$([ -d "$out/allure/41" ] && echo kept || echo pruned)" "kept"
check "run 12 is kept (41 down to 12 is thirty)" "$([ -d "$out/allure/12" ] && echo kept || echo pruned)" "kept"
check "run 11 is pruned" "$([ -d "$out/allure/11" ] && echo kept || echo pruned)" "pruned"
check "run 1 is pruned" "$([ -d "$out/allure/1" ] && echo kept || echo pruned)" "pruned"

# the overlay rule still holds: a tier that publishes only its own directory leaves the rest alone
other="$ROOT/other"
mkdir -p "$other/k6/7"
echo k6 > "$other/k6/7/index.html"
PAGES_REMOTE="$BARE" bash "$SCRIPT" "$other" "other tier" > /dev/null
rm -rf "$out" && git clone --quiet --branch gh-pages "$BARE" "$out"
check "another tier's publish leaves allure alone" "$(cat "$out/allure/latest/index.html")" "new"
check "and lands its own report" "$(cat "$out/k6/7/index.html")" "k6"

# pruning disabled leaves everything
PAGES_REMOTE="$BARE" PAGES_KEEP=0 bash "$SCRIPT" "$other" "no prune" > /dev/null 2>&1 || true
rm -rf "$out" && git clone --quiet --branch gh-pages "$BARE" "$out"
check "PAGES_KEEP=0 prunes nothing" \
      "$(find "$out/allure" -mindepth 1 -maxdepth 1 -type d -regex '.*/[0-9][0-9]*$' | wc -l | tr -d ' ')" "30"

# Report names carry the workflow that wrote them, because four of them share one run number under
# workflow_call. Retention counts each SERIES separately: the busiest workflow must not evict the
# reports of one that runs weekly.
series="$ROOT/series"
mkdir -p "$series/allure"
for n in $(seq 1 35); do mkdir -p "$series/allure/browser-tiers-$n"; echo x > "$series/allure/browser-tiers-$n/i.html"; done
for n in $(seq 1 3); do mkdir -p "$series/allure/k8s-test-execution-$n"; echo x > "$series/allure/k8s-test-execution-$n/i.html"; done
mkdir -p "$series/allure/latest"; echo x > "$series/allure/latest/i.html"
PAGES_REMOTE="$BARE" PAGES_KEEP=30 bash "$SCRIPT" "$series" "series" > /dev/null
rm -rf "$out" && git clone --quiet --branch gh-pages "$BARE" "$out"

check "thirty of the busy series are kept" \
      "$(find "$out/allure" -mindepth 1 -maxdepth 1 -type d -name 'browser-tiers-*' | wc -l | tr -d ' ')" "30"
check "the busy series keeps its newest" \
      "$([ -d "$out/allure/browser-tiers-35" ] && echo kept || echo pruned)" "kept"
check "the busy series drops its oldest" \
      "$([ -d "$out/allure/browser-tiers-1" ] && echo kept || echo pruned)" "pruned"
check "a quiet series keeps all three" \
      "$(find "$out/allure" -mindepth 1 -maxdepth 1 -type d -name 'k8s-test-execution-*' | wc -l | tr -d ' ')" "3"
check "the quiet series' oldest survives the busy one's churn" \
      "$([ -d "$out/allure/k8s-test-execution-1" ] && echo kept || echo pruned)" "kept"
check "latest is still not a report directory" \
      "$([ -d "$out/allure/latest" ] && echo kept || echo pruned)" "kept"

rm -rf "$ROOT"
[ "$fail" = 0 ] && echo "ALL OK" || { echo "FAILURES"; exit 1; }
