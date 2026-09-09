# Quality metrics — the files every CI run publishes, and what the dashboard reads

_Schema of record for `tools/ci/quality-metrics.mjs`, `tools/ci/flaky-report.mjs` and the dashboard in
`tools/ci/pages/`. The same shape is produced by the backend (a Maven exec step) and the graph repository
(a Python twin); only the `tiers` keys differ per repository._

## 1 · Where the files live

Each public repository publishes one GitHub Pages site from its `gh-pages` branch:

```
/                          the quality dashboard (static, reads the JSON below)
/quality-metrics.json      the latest run
/metrics/history.jsonl     one line per run, append-only, the scalar subset of quality-metrics.json
/metrics/tests/<run>.json  per-test outcomes of that run (for the flaky list); last 30 runs kept
/badges/<name>.json        shields.io endpoint badges (tests, coverage, k6, lighthouse, flaky)
/allure/<run>/  /allure/latest/          Allure 3 with history; `latest` is a copy of the newest run
/playwright/<run>/                       merged Playwright HTML report
/k6/<run>/                               k6 HTML summaries (one per runner) + JSON
/lighthouse/<run>/                       Lighthouse CI HTML
```

`<run>` is the workflow run number. Runs older than 30 are pruned from `allure/`, `playwright/`, `k6/`,
`lighthouse/` and `metrics/tests/`; `history.jsonl` is never pruned. Artifacts (90 days) are the backup.

## 2 · `quality-metrics.json` (schema 1)

```json
{
  "schema": 1,
  "repo": "Check-It-Out-Dev/checkitout-frontend",
  "run": {
    "number": 45, "id": 987654321, "sha": "2d305c6", "branch": "main", "workflow": "browser-tiers",
    "startedAt": "2026-09-10T02:00:11Z", "durationSec": 362,
    "url": "https://github.com/Check-It-Out-Dev/checkitout-frontend/actions/runs/987654321"
  },
  "tests": {
    "total": 1884, "passed": 1870, "failed": 0, "flaky": 2, "skipped": 12,
    "passRate": 0.9926, "flakyRate": 0.0011,
    "durationMeanSec": 2.1, "durationP95Sec": 12.3,
    "tiers": {
      "jest":        { "total": 1181, "passed": 1181, "failed": 0, "flaky": 0, "skipped": 0, "durationSec": 21 },
      "sandbox":     { "total": 61,  "passed": 59,   "failed": 0, "flaky": 2, "skipped": 0, "durationSec": 96 },
      "integration": { "total": 222, "passed": 210,  "failed": 0, "flaky": 0, "skipped": 12, "durationSec": 118 }
    }
  },
  "coverage": { "lines": 78.06, "statements": 77.9, "branches": 66.4, "functions": 74.8 },
  "perf": {
    "k6": {
      "profile": "load", "requests": 816, "failedRate": 0, "p95Ms": 0.66, "thresholdsOk": true,
      "journeys": {
        "browse": { "p95Ms": 41.2, "p99Ms": 78.0, "budgetMs": 800,  "ok": true },
        "apply":  { "p95Ms": 96.5, "p99Ms": 140.3, "budgetMs": 1500, "ok": true }
      }
    }
  },
  "lighthouse": { "url": "/", "performance": 100, "accessibility": 100, "bestPractices": 100, "seo": 100 },
  "kubernetes": { "shards": 4, "wallSec": 116, "k6Runners": 2 },
  "flaky": [
    { "title": "Sandbox · CookieBannerComponent › clicking accept-all hides the banner",
      "file": "e2e-tests/sandbox/cookie-banner.spec.ts", "window": 10, "runsFlaky": 2, "runsFailed": 1,
      "lastSeen": 45 }
  ],
  "reports": { "allure": "allure/45/", "playwright": "playwright/45/", "k6": "k6/45/", "lighthouse": "lighthouse/45/" }
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
{"run":45,"sha":"2d305c6","at":"2026-09-10T02:00:11Z","workflow":"browser-tiers","durationSec":362,
 "total":1884,"passed":1870,"failed":0,"flaky":2,"skipped":12,"passRate":0.9926,"flakyRate":0.0011,
 "coverageLines":78.06,"k6P95Ms":0.66,"k6FailedRate":0,"lhPerformance":100,"lhAccessibility":100}
```

The dashboard draws its sparklines from the last 30 lines. Missing keys mean "this run did not measure that".

## 4 · `metrics/tests/<run>.json` and the flaky list

```json
{"run":45,"tests":[
  {"id":"e2e-tests/sandbox/cookie-banner.spec.ts › Sandbox · CookieBannerComponent › clicking accept-all hides the banner",
   "status":"flaky","durationSec":6.2,"retries":1}
]}
```

`id` is `file › full title`, stable across runs. `tools/ci/flaky-report.mjs` reads the last 10 of these files
and lists every `id` whose status was `flaky` or `failed` in at least one of them, with counts and the last
run it appeared in. That list is `flaky` in `quality-metrics.json` and the table on the dashboard. A test
leaves the list by being green for 10 consecutive runs, never by being deleted from the report.

## 5 · Badges (`badges/<name>.json`, shields.io endpoint format)

| File | label | message | colour rule |
| --- | --- | --- | --- |
| `tests.json` | tests | `1870 passed · 2 flaky` | green when failed = 0, yellow when flaky > 0, red when failed > 0 |
| `coverage.json` | coverage | `78.1 %` | green ≥ 75, yellow ≥ 60, red below |
| `k6.json` | k6 p95 | `0.7 ms · 0 % failed` | green when thresholds ok, red otherwise |
| `lighthouse.json` | lighthouse | `100 · 100 · 100 · 100` | green when all ≥ 90, yellow ≥ 75, red below |
| `flaky.json` | flaky (10 runs) | `1 test` | green at 0, yellow ≤ 3, red above |

README usage: `![tests](https://img.shields.io/endpoint?url=https://check-it-out-dev.github.io/checkitout-frontend/badges/tests.json)`.

## 6 · What the dashboard shows (`tools/ci/pages/`)

Top: the five badges' numbers as tiles with a 30-run sparkline each (pass rate, flaky, coverage, k6 p95,
Lighthouse performance). Middle: the tiers table of the latest run and the k6 journeys table. Bottom: the
flaky list with links into the Allure report of the last run it appeared in, and links to every report of
the latest run. No framework, no build step: one HTML file, one stylesheet, one script that fetches the
three JSON files above. Light and dark follow the viewer's theme.
