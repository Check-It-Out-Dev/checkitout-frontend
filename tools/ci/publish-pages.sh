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
#
# Two things it also has to do, learned the hard way on 2026-09-11.
#
# REPLACE THE `latest` REPORTS. The overlay never removes anything, so `allure/latest` was not the
# latest report: it was every report ever published, merged. 19,757 files and 621 MB on the frontend
# site, 143 MB on the backend's, growing by a report a run. Any `<dir>/latest` that THIS run
# provides in full is dropped from the remote copy before the overlay, so `latest` means latest.
# Only directories this run actually writes are touched; another tier's `latest` is none of our
# business, which is the same rule the overlay already follows.
#
# PRUNE THE PER-RUN REPORTS. `allure/37`, `allure/61` and a hundred siblings were kept for ever.
# Every numerically-named subdirectory is a run, so the newest PAGES_KEEP of them stay and the rest
# go; anything not named as a number -- `latest`, `history-*.jsonl` -- is never a candidate.
#
# Together those two are why a publish took SEVEN MINUTES on one attempt and the backend's security
# summary hit its ten-minute job timeout in the middle of the retry (run 34569994510). The clone is
# blobless for the same reason: this script writes files and reads almost none, so fetching the
# content of 57,000 files it will never open was pure latency. Git fetches a blob on demand if it
# ever needs one, so correctness does not depend on the guess.
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
# How many per-run report directories to keep under each top-level directory. 0 disables pruning.
KEEP=${PAGES_KEEP:-30}
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
  # Blobless: the tree comes down, file contents do not. This script overwrites and deletes but
  # hardly ever reads, and git fetches any blob it genuinely needs on demand.
  if ! git clone --quiet --filter=blob:none --branch "$BRANCH" --single-branch --depth 1 "$REMOTE" "$WORK" 2>/dev/null; then
    echo "publish-pages: branch $BRANCH does not exist yet — creating it"
    git -C "$WORK" init --quiet -b "$BRANCH"
    git -C "$WORK" remote add origin "$REMOTE"
  fi

  # Lay this run's site over it. Deliberately an overlay, not a replacement: another publisher's
  # directories are none of our business.
  for owned in $REPLACE; do
    rm -rf "${WORK:?}/${owned}"
  done

  # A `latest` this run provides in full replaces the remote one instead of merging into it.
  # Without this, `latest` is the union of every report ever published under that name.
  for candidate in "$SRC"/*/latest; do
    [ -d "$candidate" ] || continue
    owned=${candidate#"$SRC"/}
    rm -rf "${WORK:?}/${owned}"
  done

  # tar rather than rsync: portable to any runner and to Git Bash, so the retry below is testable.
  (cd "$SRC" && tar -cf - --exclude=.git .) | (cd "$WORK" && tar -xf -)

  # Retention, applied to the site as it will be published rather than as it was found.
  #
  # A report directory is named for the run that wrote it: `browser-tiers-120`, `nightly-3`, or a
  # bare number from before the workflow prefix existed. The newest PAGES_KEEP of each SERIES stay,
  # where the series is the name with its trailing number removed -- otherwise the busiest workflow
  # evicts every other one's reports, and a tier that runs weekly would never keep a single report.
  # Anything without a trailing number, `latest` and the history files included, is not a report
  # directory and is never a candidate.
  #
  # One pass: each name becomes "series <tab> number <tab> name", sorted by series and then by
  # number descending, and awk prints the ones past the keep count. The series is often empty, which
  # is exactly why this is not a loop over prefixes: an empty one disappears in word splitting.
  if [ "$KEEP" -gt 0 ]; then
    for parent in "$WORK"/*/; do
      [ -d "$parent" ] || continue
      find "$parent" -mindepth 1 -maxdepth 1 -type d -printf '%f\n' 2>/dev/null |
        sed -n 's/^\(.*[^0-9]\)\{0,1\}\([0-9][0-9]*\)$/\1\t\2\t&/p' |
        sort -t "$(printf '\t')" -k1,1 -k2,2nr |
        awk -F'\t' -v keep="$KEEP" '{ n[$1]++; if (n[$1] > keep) print $3 }' |
        while read -r old; do
          [ -n "$old" ] || continue
          rm -rf "${parent:?}${old}"
        done
    done
  fi

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
