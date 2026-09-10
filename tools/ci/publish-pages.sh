#!/usr/bin/env bash
# Push a built site to the Pages branch, tolerating a publisher that got there first.
#
# The two pipelines run their tiers in parallel and several of them publish: the gate wall writes
# jest and coverage, the browser tiers write their report, Lighthouse writes its scores, the cluster
# tier writes its own. Before the restructure these were separate workflows that happened to run at
# different times. Now they finish within seconds of each other, and the loser of the race gets
#
#     ! [rejected]  gh-pages -> gh-pages (fetch first)
#
# and its whole report is lost -- which is how run 34467500363 failed.
#
# A concurrency group looks like the fix and is not: GitHub keeps at most ONE pending job per group,
# so with three publishers waiting, the third cancels the second outright. That turns a race into a
# silent loss, which is strictly worse than a loud one.
#
# So the publish retries. Each attempt starts from the CURRENT remote branch and lays this run's
# output on top, which means files another publisher added in the meantime survive. Files we both
# wrote -- quality-metrics.json, the badges, history.jsonl -- are last-writer-wins, exactly as they
# already are between two jobs that read the site at the same moment; the retry does not make that
# worse, it just stops the loser from dropping its report on the floor.
#
#   tools/ci/publish-pages.sh <dir> "<commit message>"
set -euo pipefail

SRC=${1:?usage: publish-pages.sh <dir> [message]}
MSG=${2:-"publish from ${GITHUB_WORKFLOW:-local} run ${GITHUB_RUN_NUMBER:-0}"}
BRANCH=${PAGES_BRANCH:-gh-pages}
ATTEMPTS=${PAGES_ATTEMPTS:-6}
# Paths (relative to the site root) this run OWNS: their remote content is dropped before the
# overlay, so a deletion here -- Lighthouse pruning all but the last thirty runs, say -- actually
# reaches the branch. Everything not listed is only ever added to, never removed, because it may
# belong to a tier that published a second ago.
REPLACE=${PAGES_REPLACE:-}
WORK=$(mktemp -d)
ERRFILE=$(mktemp)

# PAGES_REMOTE exists so the retry can be exercised against a local bare repository; CI never sets it.
if [ -n "${PAGES_REMOTE:-}" ]; then
  REMOTE=$PAGES_REMOTE
else
  : "${GITHUB_TOKEN:?GITHUB_TOKEN is required}"
  : "${GITHUB_REPOSITORY:?GITHUB_REPOSITORY is required}"
  REMOTE="https://x-access-token:${GITHUB_TOKEN}@github.com/${GITHUB_REPOSITORY}.git"
fi

if [ ! -d "$SRC" ]; then
  echo "publish-pages: no such directory: $SRC" >&2
  exit 1
fi

for attempt in $(seq 1 "$ATTEMPTS"); do
  rm -rf "$WORK"
  mkdir -p "$WORK"

  # Start from what is on the branch right now, not from what it looked like when this job began.
  if ! git clone --quiet --branch "$BRANCH" --single-branch --depth 1 "$REMOTE" "$WORK" 2>/dev/null; then
    echo "publish-pages: branch $BRANCH does not exist yet — creating it"
    git -C "$WORK" init --quiet -b "$BRANCH"
    git -C "$WORK" remote add origin "$REMOTE"
  fi

  # Lay this run's site over it. Deliberately an overlay, not a replacement: another publisher's
  # directories are none of our business.
  for owned in $REPLACE; do
    rm -rf "${WORK:?}/${owned}"
  done

  # tar rather than rsync: portable to any runner and to Git Bash, so the retry below is testable.
  (cd "$SRC" && tar -cf - --exclude=.git .) | (cd "$WORK" && tar -xf -)

  git -C "$WORK" add -A
  if git -C "$WORK" diff --cached --quiet; then
    echo "publish-pages: nothing changed on $BRANCH — nothing to publish"
    rm -rf "$WORK"
    exit 0
  fi

  git -C "$WORK" \
    -c user.name="github-actions[bot]" \
    -c user.email="41898282+github-actions[bot]@users.noreply.github.com" \
    commit --quiet -m "$MSG"

  if git -C "$WORK" push --quiet origin "$BRANCH" 2>"$ERRFILE"; then
    echo "publish-pages: published to $BRANCH on attempt $attempt"
    rm -rf "$WORK"
    exit 0
  fi

  echo "publish-pages: attempt $attempt/$ATTEMPTS rejected — another job published first:" >&2
  sed -e "s|${GITHUB_TOKEN:-__none__}|***|g" "$ERRFILE" >&2 || true
  sleep $((attempt * 5))
done

echo "publish-pages: gave up after $ATTEMPTS attempts. The report is still in this run's artifacts." >&2
rm -rf "$WORK" "$ERRFILE"
exit 1
