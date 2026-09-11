#!/usr/bin/env bash
# Exercise publish-pages.sh against a local bare repository: the overlay it must not break, the
# `latest` it must replace, and the retention it must apply per directory and per series.
#
# Two seconds, no network. It runs in CI on every push because this is a shell script that deletes
# directories on a branch the whole estate reads, and the failure mode is silent: a report that is
# simply not there any more.
set -euo pipefail

SCRIPT=${1:?usage: publish-pages.test.sh <path to publish-pages.sh>}
ROOT=$(mktemp -d)
BARE="$ROOT/remote.git"
out="$ROOT/out"
fail=0

note() { printf '%-58s %s\n' "$1" "$2"; }
check() { if [ "$2" = "$3" ]; then note "$1" "ok"; else note "$1" "FAIL: expected [$3], got [$2]"; fail=1; fi; }
fetch() { rm -rf "$out"; git clone --quiet --branch gh-pages "$BARE" "$out"; }
count() { find "$1" -mindepth 1 -maxdepth 1 -type d -name "$2" 2>/dev/null | wc -l | tr -d ' '; }
there() { if [ -d "$1" ]; then echo kept; else echo pruned; fi; }

git init --quiet --bare -b gh-pages "$BARE"

# ---------------------------------------------------------------- the overlay and `latest`
# Seed: one tier's report at `latest` with a stale attachment, forty per-run reports, a second tier.
seed="$ROOT/seed"
mkdir -p "$seed/playwright/latest" "$seed/k6/latest"
echo old > "$seed/playwright/latest/stale-attachment.txt"
echo old > "$seed/playwright/latest/index.html"
echo k6  > "$seed/k6/latest/index.html"
for n in $(seq 1 40); do mkdir -p "$seed/playwright/$n"; echo "run $n" > "$seed/playwright/$n/index.html"; done
echo hist > "$seed/playwright/history.jsonl"
PAGES_REMOTE="$BARE" PAGES_KEEP=0 bash "$SCRIPT" "$seed" "seed" > /dev/null

site="$ROOT/site"
mkdir -p "$site/playwright/latest" "$site/playwright/41"
echo new > "$site/playwright/latest/index.html"
echo new > "$site/playwright/41/index.html"
PAGES_REMOTE="$BARE" bash "$SCRIPT" "$site" "publish" > /dev/null
fetch

check "the stale attachment in latest is gone" \
      "$([ -e "$out/playwright/latest/stale-attachment.txt" ] && echo present || echo gone)" "gone"
check "latest is this run's report" "$(cat "$out/playwright/latest/index.html")" "new"
check "another tier's latest is untouched" "$(cat "$out/k6/latest/index.html")" "k6"
check "a non-numeric sibling is never pruned" \
      "$([ -f "$out/playwright/history.jsonl" ] && echo present || echo gone)" "present"
check "thirty per-run reports are kept by default" "$(count "$out/playwright" '[0-9]*')" "30"
check "the newest run is kept" "$(there "$out/playwright/41")" "kept"
check "run 12 is kept (41 down to 12 is thirty)" "$(there "$out/playwright/12")" "kept"
check "run 11 is pruned" "$(there "$out/playwright/11")" "pruned"
check "run 1 is pruned" "$(there "$out/playwright/1")" "pruned"

# A tier that publishes only its own directory leaves every other one alone.
other="$ROOT/other"
mkdir -p "$other/k6/7"
echo k6 > "$other/k6/7/index.html"
PAGES_REMOTE="$BARE" bash "$SCRIPT" "$other" "other tier" > /dev/null
fetch
check "another tier's publish leaves playwright alone" "$(cat "$out/playwright/latest/index.html")" "new"
check "and lands its own report" "$(cat "$out/k6/7/index.html")" "k6"

PAGES_REMOTE="$BARE" PAGES_KEEP=0 bash "$SCRIPT" "$other" "no prune" > /dev/null 2>&1 || true
fetch
check "PAGES_KEEP=0 prunes nothing" "$(count "$out/playwright" '[0-9]*')" "30"

# ---------------------------------------------------------------- series
# Report names carry the workflow that wrote them, because four of them share one run number under
# workflow_call. Retention counts each SERIES separately: the busiest workflow must not evict the
# reports of one that runs weekly.
series="$ROOT/series"
mkdir -p "$series/playwright"
for n in $(seq 1 35); do mkdir -p "$series/playwright/browser-tiers-$n"; echo x > "$series/playwright/browser-tiers-$n/i.html"; done
for n in $(seq 1 3); do mkdir -p "$series/playwright/k8s-test-execution-$n"; echo x > "$series/playwright/k8s-test-execution-$n/i.html"; done
PAGES_REMOTE="$BARE" bash "$SCRIPT" "$series" "series" > /dev/null
fetch

check "thirty of the busy series are kept" "$(count "$out/playwright" 'browser-tiers-*')" "30"
check "the busy series keeps its newest" "$(there "$out/playwright/browser-tiers-35")" "kept"
check "the busy series drops its oldest" "$(there "$out/playwright/browser-tiers-1")" "pruned"
check "a quiet series keeps all three" "$(count "$out/playwright" 'k8s-test-execution-*')" "3"
check "the quiet series survives the busy one's churn" "$(there "$out/playwright/k8s-test-execution-1")" "kept"
check "latest is still not a report directory" "$(there "$out/playwright/latest")" "kept"

# ---------------------------------------------------------------- per-directory keep
# An Allure report for a twelve-thousand-test suite is 24,000 files; thirty of them is a Pages
# deployment that times out. `allure` therefore keeps three unless told otherwise.
big="$ROOT/big"
mkdir -p "$big/allure/latest"
echo x > "$big/allure/latest/index.html"
for n in $(seq 1 9); do mkdir -p "$big/allure/ci-tests-$n"; echo x > "$big/allure/ci-tests-$n/i.html"; done
PAGES_REMOTE="$BARE" bash "$SCRIPT" "$big" "allure" > /dev/null
fetch
check "allure keeps three by default" "$(count "$out/allure" 'ci-tests-*')" "3"
check "allure keeps its newest three" "$(there "$out/allure/ci-tests-9")" "kept"
check "allure drops the fourth-newest" "$(there "$out/allure/ci-tests-6")" "pruned"
check "allure's latest is not a report directory" "$(there "$out/allure/latest")" "kept"
check "the default still governs other directories" "$(count "$out/playwright" 'browser-tiers-*')" "30"

more="$ROOT/more"
mkdir -p "$more/allure"
for n in $(seq 10 14); do mkdir -p "$more/allure/ci-tests-$n"; echo x > "$more/allure/ci-tests-$n/i.html"; done
PAGES_REMOTE="$BARE" PAGES_KEEP_allure=5 bash "$SCRIPT" "$more" "allure override" > /dev/null
fetch
check "PAGES_KEEP_allure raises it for that directory" "$(count "$out/allure" 'ci-tests-*')" "5"
check "and leaves the others on the default" "$(count "$out/playwright" 'browser-tiers-*')" "30"

rm -rf "$ROOT"
if [ "$fail" = 0 ]; then echo "ALL OK"; else echo "FAILURES"; exit 1; fi
