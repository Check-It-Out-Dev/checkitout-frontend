# Quality metrics — the files every CI run publishes, and what the dashboard reads

_Schema of record for `tools/ci/quality-metrics.mjs`, `tools/ci/flaky-report.mjs` and the dashboard in
`tools/ci/pages/`. The backend and the graph repository run the same Node tool from a sparse checkout of
this repository (`tools/ci`) on their JUnit XML; only the `tiers` keys differ per repository._

## 1 · Where the files live

Each public repository publishes one GitHub Pages site from its `gh-pages` branch:

```
/                          the quality dashboard (static, reads the JSON below)
/quality-metrics.json      the latest run
/metrics/history.jsonl     one line per run, append-only, the scalar subset of quality-metrics.json
/metrics/tests/<run>.json  per-test outcomes of that run (for the flaky list); last 30 runs kept
/badges/<name>.json        shields.io endpoint badges (tests, coverage, k6, lighthouse, flaky)
/allure/<run>/  /allure/latest/          Allure 3 report; `latest` is a copy of the newest run
/allure/history-<workflow>.jsonl         Allure 3 history, one file per workflow (see 8)
/playwright/<run>/                       merged Playwright HTML report
/k6/<run>/                               k6 HTML summaries (one per runner) + JSON
/lighthouse/<run>/                       Lighthouse CI HTML
```

`<run>` is the workflow run number. Runs older than 30 are pruned from `allure/`, `playwright/`, `k6/`,
`lighthouse/` and `metrics/tests/`; `history.jsonl` and the Allure history files are never pruned
(the prune only removes numeric run directories). Artifacts (90 days) are the backup.

## 2 · `quality-metrics.json` (schema 1)

```json
{
  "schema": 1,
  "repo": "Check-It-Out-Dev/checkitout-frontend",
  "run": {
    "number": 45,
    "id": 987654321,
    "sha": "2d305c6",
    "branch": "main",
    "workflow": "browser-tiers",
    "startedAt": "2026-09-10T02:00:11Z",
    "durationSec": 362,
    "url": "https://github.com/Check-It-Out-Dev/checkitout-frontend/actions/runs/987654321"
  },
  "tests": {
    "total": 1884,
    "passed": 1870,
    "failed": 0,
    "flaky": 2,
    "skipped": 12,
    "passRate": 0.9989,
    "flakyRate": 0.0011,
    "durationMeanSec": 2.1,
    "durationP95Sec": 12.3,
    "tiers": {
      "jest": {
        "total": 1181,
        "passed": 1181,
        "failed": 0,
        "flaky": 0,
        "skipped": 0,
        "durationSec": 21
      },
      "sandbox": {
        "total": 61,
        "passed": 59,
        "failed": 0,
        "flaky": 2,
        "skipped": 0,
        "durationSec": 96
      },
      "integration": {
        "total": 222,
        "passed": 210,
        "failed": 0,
        "flaky": 0,
        "skipped": 12,
        "durationSec": 118
      }
    }
  },
  "coverage": { "lines": 78.06, "statements": 77.9, "branches": 66.4, "functions": 74.8 },
  "perf": {
    "k6": {
      "profile": "load",
      "requests": 203,
      "failedRate": 0,
      "p95Ms": 118.4,
      "thresholdsOk": true,
      "journeys": {
        "browse": { "p95Ms": 64.8, "p99Ms": 92.8, "budgetMs": 800, "ok": true },
        "apply": { "p95Ms": 151.2, "p99Ms": 256.3, "budgetMs": 1500, "ok": true }
      }
    }
  },
  "lighthouse": {
    "url": "/",
    "performance": 100,
    "accessibility": 100,
    "bestPractices": 100,
    "seo": 100
  },
  "kubernetes": { "shards": 4, "wallSec": 116, "k6Runners": 2 },
  "flaky": [
    {
      "title": "Sandbox · CookieBannerComponent › clicking accept-all hides the banner",
      "file": "e2e-tests/sandbox/cookie-banner.spec.ts",
      "window": 10,
      "runsFlaky": 2,
      "runsFailed": 1,
      "lastSeen": 45,
      "history": ["pass", "pass", "fail", "pass", "pass", "pass", "flaky", "pass", "pass", "flaky"]
    }
  ],
  "reports": {
    "allure": "allure/45/",
    "playwright": "playwright/45/",
    "k6": "k6/45/",
    "lighthouse": "lighthouse/45/"
  }
}
```

Rules:

- **passRate** = passed ÷ (passed + failed + flaky). Skipped tests are neither; they are shown, not scored.
- **flakyRate** = flaky ÷ (passed + failed + flaky). A test is flaky when it failed at least once and passed on
  a retry within the same run (Playwright `status: "flaky"`, Allure "flaky" from retries).
- **durationP95Sec** is over individual tests, not shards; it is the number that says which tests are slow.
- Sections a run did not produce are omitted, never zero-filled (`perf`, `lighthouse`, `kubernetes` are
  optional; `tests` and `run` are required).
- Every number is measured from the run's own artifacts: Jest `json-summary` + `jest-junit`, Playwright
  `merged.json`, JUnit XML (backend), pytest JUnit XML (graph), k6 summary JSON per runner, the LHCI
  `manifest.json`. Nothing is typed by hand.

## 3 · `metrics/history.jsonl`

One JSON object per line, appended after every run, in this shape:

```json
{
  "run": 45,
  "id": 987654321,
  "sha": "2d305c6",
  "at": "2026-09-10T02:00:11Z",
  "workflow": "browser-tiers",
  "durationSec": 362,
  "total": 1884,
  "passed": 1870,
  "failed": 0,
  "flaky": 2,
  "skipped": 12,
  "passRate": 0.9989,
  "flakyRate": 0.0011,
  "coverageLines": 78.06,
  "k6P95Ms": 118.4,
  "k6FailedRate": 0,
  "lhPerformance": 100,
  "lhAccessibility": 100,
  "mutationScore": 72.84,
  "mutationCoveredScore": 83.29,
  "securityFindings": 4,
  "securityErrors": 1
}
```

The dashboard draws its ribbon and sparklines from the last 30 lines; `id` is the workflow run id, so every bar
links to its run. Missing keys mean "this run did not measure that".

### The two quality-over-time keys

`mutationScore` and `securityFindings` answer the two questions a pass rate cannot.

**Test quality.** A pass rate says the tests agreed with the code; it says nothing about whether they would
have disagreed if the code were wrong. Mutation testing changes the code on purpose and reports the share of
those changes the tests noticed. Two numbers are recorded because averaging them hides which problem you have:
`mutationScore` is over everything in scope, `mutationCoveredScore` only over code some test reaches. A wide
gap between them is a _coverage_ gap — "write a test" — while a low covered score is a _test-quality_ gap —
"make an existing test assert something". Both repositories produce these: Stryker on the frontend
(`tools/ci/mutation-summary.mjs`), PIT on the backend (`tools/ci/pit-summary.mjs`), writing the same keys.

**Security quality.** `securityFindings` counts what the scanners found in THIS run, read from their own SARIF
by `tools/ci/sarif-summary.mjs`, rather than from the code-scanning API. Two reasons: the number is then the
run's own evidence and stays readable offline, and a tool that ran and found nothing is recorded at zero
instead of being omitted — a scanner that silently stops running otherwise looks exactly like a clean
repository. `securityErrors` is broken out because errors are the number that moves a decision; a linter
emitting four hundred style notes should not make the estate look on fire.

Neither tier publishes the full metrics document. Each writes one small file to the Pages branch —
`mutation/latest.json`, `security/latest.json` — and the publishers that do write the document pass those
paths in, exactly as they already do for `lighthouse/latest.json`. That keeps one document per run rather than
several partial ones racing to overwrite each other.

## 4 · `metrics/tests/<run>.json` and the flaky list

```json
{
  "run": 45,
  "tests": [
    {
      "id": "e2e-tests/sandbox/cookie-banner.spec.ts › Sandbox · CookieBannerComponent › clicking accept-all hides the banner",
      "status": "flaky",
      "durationSec": 6.2,
      "retries": 1
    }
  ]
}
```

`id` is `file › full title`, stable across runs; Playwright entries end in ` [project]` (`chromium-desktop`,
`mobile-chrome`, `bdd`) because the same title runs once per project, Jest entries are `src/… › full name`,
JUnit entries `class › method`. `tools/ci/flaky-report.mjs` reads the last 10 of these files
and lists every `id` whose status was `flaky` or `failed` in at least one of them, with counts and the last
run it appeared in, plus `history`: the test's status in each of those runs, oldest first, one of `pass`,
`flaky`, `fail`, `skipped`, `absent`. That list is `flaky` in `quality-metrics.json` and the table on the
dashboard (the strip of ten squares is `history`). A test leaves the list by being green for 10 consecutive
runs, never by being deleted from the report.

## 5 · Badges (`badges/<name>.json`, shields.io endpoint format)

| File              | label           | message                 | colour rule                                                       |
| ----------------- | --------------- | ----------------------- | ----------------------------------------------------------------- |
| `tests.json`      | tests           | `1870 passed · 2 flaky` | green when failed = 0, yellow when flaky > 0, red when failed > 0 |
| `coverage.json`   | coverage        | `78.1 %`                | green ≥ 75, yellow ≥ 60, red below                                |
| `k6.json`         | k6 p95          | `118 ms · 0 % failed`   | green when thresholds ok, red otherwise                           |
| `lighthouse.json` | lighthouse      | `100 · 100 · 100 · 100` | green when all ≥ 90, yellow ≥ 75, red below                       |
| `flaky.json`      | flaky (10 runs) | `1 test`                | green at 0, yellow ≤ 3, red above                                 |

README usage: `![tests](https://img.shields.io/endpoint?url=https://check-it-out-dev.github.io/checkitout-frontend/badges/tests.json)`.

## 6 · What the dashboard shows (`tools/ci/pages/`)

Built in F4 (2026-09-09), previewable with fixture data: serve `tools/ci/pages/` statically and open
`index.html?data=fixtures`. Top to bottom:

1. **The verdict**, one sentence in the estate's serif: "1,870 of 1,872 tests passed on main, run 45: two
   flaky, none failed.", with the start time, duration, skipped count and the green streak under it.
2. **The ribbon**: the last 30 runs as bars, newest on the right; colour is the outcome (green, amber for
   flaky, coral for failed), height is the run's duration against the slowest in the window. Pointing at or
   focusing a bar writes that run's numbers into the caption; each bar links to its workflow run.
3. **Tiles**: pass rate, flaky-or-failing count over the last ten runs, line coverage, k6 p95, Lighthouse
   performance, each with its 30-run sparkline; the tile's colour follows the badge rule of §5.
4. **Run by tier** (the `tiers` table plus a totals row, the p95 test duration and the Kubernetes line) and
   **k6 journeys** (p95, p99, budget per journey).
5. **Flaky and failing tests, last ten runs**: title, file, the ten-run strip from `history`, counts, and a
   link to the Allure report of the run it was last seen in.
6. **Reports of the run**: Allure, Playwright, k6, Lighthouse, the workflow run, and the two data files.

No framework, no build step: `index.html`, `styles.css`, `dashboard.js`, fetching `quality-metrics.json` and
`metrics/history.jsonl`. Light and dark follow the viewer's theme; optional sections disappear when the run
did not produce them; with no run published yet the page says so instead of showing zeros.

## 7 · The tool that writes all of it (`tools/ci/quality-metrics.mjs`)

One Node script, no dependencies, run by the merge or report job of every workflow against the checked-out
`gh-pages` branch (`site/`), then published back with `peaceiris/actions-gh-pages` (`keep_files: false`,
the directory is the whole state):

```
node tools/ci/quality-metrics.mjs --out site --workflow browser-tiers   --started-at "$STARTED_AT" --duration-sec "$DURATION"   --playwright ci-reports/merged.json --copy playwright=ci-reports/merged   --k6 'ci-reports/api-*.json'      --copy k6=ci-reports/k6   --jest site/jest/latest.json --coverage site/coverage/latest.json --lighthouse site/lighthouse/latest.json
```

Readers: `--jest` (`jest --json`), `--coverage` (json-summary), `--playwright` (merged JSON, tiers from the
spec path), `--junit "glob:tier"` (surefire, failsafe, pytest; `flakyFailure` counts as flaky), `--jacoco`,
`--k6` (one JSON per runner: requests summed, failed rate weighted, p95 the worst runner, budgets read from
the threshold names), `--lighthouse` (the JSON of `lighthouse-summary.mjs`), `--kubernetes` (a literal).
Inputs that do not exist are skipped, so a workflow can always ask for "the latest" of another workflow's
output: the gate wall (`ci-tests.yml`) publishes `jest/latest.json` and `coverage/latest.json`,
`lighthouse.yml` publishes `lighthouse/<run>/` and `lighthouse/latest.json`, and the browser-tier runs
fold those into the run they publish. The run identity comes from the `GITHUB_*` environment. The tool
also copies the dashboard into the site root, appends the history line, writes the per-run outcomes, the
flaky list (via `flaky-report.mjs`), the badges, and prunes to the last 30 runs. Rehearsed on 2026-09-09
against real artifacts: 40 Jest tests, the 285-test cluster report, two k6 runners, and the backend's 2,410
surefire files.

## 8 · Allure history, and why it is one file per workflow

Allure 3 does not write the `history/` directory Allure 2 put inside the report. History is a single
JSON-lines file, named by `historyPath` in `allurerc.mjs`; `allure generate` reads it to mark new,
retried and flaky tests and to draw the trend, then appends the run to it. A job that only copies an old
`history/` directory into the results, as the backend job did until 2026-09-09, silently produces a
report with no history at all — the symptom is every test reported as new on every run.

Each publishing workflow therefore carries its own file on the Pages site:

| Workflow                      | File                                      |
| ----------------------------- | ----------------------------------------- |
| frontend `browser-tiers`      | `allure/history-browser-tiers.jsonl`      |
| frontend `nightly-full-stack` | `allure/history-nightly-full-stack.jsonl` |
| frontend `k8s-test-execution` | `allure/history-k8s-test-execution.jsonl` |
| backend `ci-tests`            | `allure/history-ci-tests.jsonl`           |

One file per workflow for the same reason the metrics files carry a workflow prefix: these workflows run
different suites, and a shared history would report every test of the other suite as new, every run.

The Playwright tiers reach Allure through the blobs, not through JUnit XML: the merge job runs
`playwright merge-reports --reporter allure-playwright` over the same blob archives it merges into the
HTML report, so the Allure report carries the Playwright steps, attachments and retries. The results land
in `./allure-results` (the reporter's default; the CLI cannot pass reporter options).

### The Cucumber tag-filter duplicates

The backend runs one Failsafe execution per suite, and every suite boots the whole feature corpus and
reports **every** scenario — the ones its tags select as executed, the rest as skipped. Fifteen suites
therefore emit fifteen results per scenario, and JUnit tells them apart only by `<testsuite name>`:
`classname` is the Gherkin feature. Allure keys on classname plus name, so a 277-scenario corpus was
published as 165 tests with 165 retries, and the dashboard counted 2,804 e2e tests.

`tools/ci/junit-collapse-tag-skips.mjs` runs over the e2e results before both readers and drops a
`<testcase>` only when it is skipped **and** the same test is executed in another file of the same tree —
exactly the tag-filter duplicate — fixing the `<testsuite>` counters as it goes. A scenario skipped in
every suite is a real skip and is kept. Measured on the 2026-09-09 credential-free run: 2,516 duplicates
dropped, 288 results kept, 277 executed, retries down from 165 to 14.
