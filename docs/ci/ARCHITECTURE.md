# CI architecture — what runs where, and the Kubernetes test-execution substrate

_Design of record, 2026-09-09. The plan behind it lives outside the repo; this page is what a reader
of the public repository needs to run, extend or judge the pipelines. Hosting is unchanged: the
product runs on Docker Compose and systemd on one VPS, and the docs that say why still stand.
Kubernetes appears here for one purpose only: executing tests and generating load._

## 1 · The shape

```
PR / push main                     nightly 02:00                     weekly + dispatch
──────────────                     ─────────────                     ─────────────────
FE  ci-tests (147 s)  ───────┐     FE  nightly-full-stack            FE  k8s-test-execution
FE  browser-tiers ×4 shards  │         services: pg, redis,               kind cluster on the runner
    blob → merge → Allure    │         greenmail + BE image                ├─ postgres, redis
FE  lighthouse (demo build)  │         bdd + integration shards            ├─ backend (ghcr, dev-lite)
BE  ci-tests unit + integr.  │         → Allure + merged HTML              ├─ frontend (nginx) + ingress
BE  build-image → ghcr       │     BE  e2e (9 min) → Allure               ├─ Playwright Indexed Job ×4
GR  ci (test_app, MCP)  ─────┘                                            ├─ k6-operator TestRun ×2
        │                                   │                             └─ ./ci-reports → merge → Allure
        ▼                                   ▼                                        │
   GitHub Pages per repo  ◄─────────────────┴────────────────────────────────────────┘
   /                 quality dashboard: metrics, trends, flaky list, links to every report
   /allure/<run>     Allure 3 with history                       /playwright/<run>  merged HTML
   /k6/<run>         k6 summary (+ Grafana Cloud dashboard)      /lighthouse/<run>  Lighthouse CI
   metrics/history.jsonl   one line per run       badges/*.json   shields endpoints for the READMEs
```

Two dashboards live outside Pages, on Grafana Cloud, public without a login: the k6 API journeys
(<https://checkitoutapp.grafana.net/public-dashboards/bc4987ccdb234296a33afd3a794f1f4e>, the whole time
range with one weekly cluster run in view, fed by the runners' remote write when the `grafana-cloud`
environment holds the `K6_PROMETHEUS_RW_*` secrets; `docs/ci/grafana/k6.json` is the source) and the sandbox
(<https://checkitoutapp.grafana.net/public-dashboards/f48c40b8b3244bdfa019117fa9fdcbbe>, `SANDBOX.md` §5).

Every job runs on GitHub-hosted `ubuntu-latest` (4 vCPU, 16 GB, free and unlimited for public
repositories). Nothing runs on a self-hosted runner: on a public repository that would let any pull
request execute on the machine. Speed comes from sharding across runners, never from a larger one.

| Workflow | Trigger | Wall time (budget) | What must be true |
| --- | --- | --- | --- |
| `ci-tests.yml` | PR, push main | ~2.5 min (25) | static gates, typecheck, build, Jest; measured median in `docs/testing/measured-counts.json`; on push the newest unit results and coverage go to the Pages site |
| `browser-tiers.yml` | PR, push main | ~6 min (20) | sandbox, msw, perf, visual across 4 shards; blob reports merged; Allure with history |
| `lighthouse.yml` | push main | ~4 min (10) | demo build served on 4300; assertions warn, budgets error later |
| `nightly-full-stack.yml` | 02:00 UTC, dispatch | ~15 min (75) | backend image from GHCR with the dev-lite profile; bdd + integration + scenarios |
| `k8s-test-execution.yml` | weekly, dispatch | ~20–25 min (40) | everything in §2 |
| `deploy-demo.yml` | push main (environment `demo`) | ~3 min | tar over ssh, atomic swap, hash verified on both domains |
| `deploy-sandbox.yml` | push main, dispatch (environment `sandbox`) | ~6 min (25) | frontend image to ghcr; `rollout.sh deploy` over a forced-command key; smoke + the k6 persona profile from the outside; rollback on failure (`SANDBOX.md`) |
| `contract-check.yml` | daily 04:30 UTC, dispatch, `backend-published` | ~8 min (30) | the OpenAPI document taken from a booted backend equals the frontend's copy, or the regenerated client compiles (§6) |
| BE `ci-tests.yml` | PR, push, nightly | unit ~2.5 / integration ~4 / e2e ~10 min | JUnit XML from every tier to Allure 3 with history on Pages |
| BE `build-image.yml` | push main / greenfield | ~4 min | `ghcr.io/…/checkitout-backend:<sha>`, `:<branch>`, `:latest`; asks the frontend to check the contract when the dispatch token exists |
| graph `ci.yml` | PR, push main, weekly | ~5 min | the two MCP servers' pytest suites with the model mocked (CPU torch wheels), the CodeMap engine check when its pack exists; JUnit XML into the same metrics tool and Pages |

## 2 · The Kubernetes substrate (`deploy/k8s/`)

```
deploy/k8s/
  kind-config.yaml               one node; ./ci-reports mounted at /var/lib/ci-reports; ingress :80 → localhost:8081
  base/                          kubectl apply -k deploy/k8s/base
    postgres.yaml                postgres:17-alpine, the compose superuser, emptyDir
    redis.yaml                   redis:7-alpine
    backend.yaml                 ghcr image, SPRING_PROFILES_ACTIVE=dev-lite, hosts by env, probes, 2 Gi limit
    frontend.yaml                nginx + the production browser bundle; /api proxied to the backend Service
    ingress.yaml                 app.local → frontend (host access only)
    kustomization.yaml           image tags pinned by the caller
  frontend/                      Dockerfile + nginx.conf for the frontend image
  tests/
    Dockerfile.playwright        mcr.microsoft.com/playwright:v<pinned> + this repo + bddgen output
    playwright-indexed-job.yaml  Indexed Job, completions = parallelism = 4, index → --shard
    k6-testrun.yaml              k6-operator TestRun, parallelism 2, script from a ConfigMap
```

**Why it works on one 4-vCPU runner.** Requests add up to about 3.5 CPU and 6.5 Gi: postgres 250m,
redis 100m, backend 800m / 1 Gi, frontend 100m, four Playwright pods at 400m / 1 Gi each, two k6 runners
at 250m. Playwright shards run with `--workers=1`, so each pod is one browser. The k6 numbers in kind
measure the mechanics, not the product's capacity; the profile is `load` (10 VUs) with the same thresholds
as the local run, and the run is declared green by thresholds, never by absolute latency.

**The job, step by step** (what `k8s-test-execution.yml` does; the manifests carry the detail):

1. `npm ci`, `npm run build` (production configuration, not demo), `docker build` the frontend image
   from `deploy/k8s/frontend/Dockerfile` and the test image from `deploy/k8s/tests/Dockerfile.playwright`
   with `PW_VERSION` read from `@playwright/test`.
2. Render `kind-config.yaml` with `CI_REPORTS_DIR=$GITHUB_WORKSPACE/ci-reports`, create the cluster
   (`helm/kind-action`), install ingress-nginx for kind, install the k6-operator bundle.
3. `kind load docker-image` for the two local images; `kustomize edit set image` to the backend SHA;
   `kubectl apply -k deploy/k8s/base`; wait for `backend` readiness (the startup probe allows five minutes
   for Liquibase to seed the demo world).
4. Smoke the origin the tests will use: `kubectl run curl … http://frontend.checkitout.svc/healthz` and a
   `POST /api/test/auth/mock-session` through nginx, asserting a session cookie comes back without the
   `Secure` flag (the nginx `proxy_cookie_flags` rule is what makes sign-in work over plain HTTP).
5. `kubectl apply -f deploy/k8s/tests/playwright-indexed-job.yaml`; wait for the Job; on failure dump
   `kubectl get events` and the pod logs into `ci-reports/`.
6. `kubectl create configmap k6-scripts --from-file=e2e-tests/perf/k6/`; apply the TestRun; wait for the
   operator to report the TestRun finished; collect the runner logs.
7. Copy every `ci-reports/blob-<n>/report-*.zip` into one directory and merge that directory (the
   command takes exactly one): `npx playwright merge-reports --reporter html,json ci-reports/blobs` →
   `ci-reports/merged/` and `merged.json`; Allure results from `allure-playwright`; k6 summary JSON and
   HTML from `ci-reports/`. The verdict is the merged JSON plus the `shard-<n>.exit` files, never a pod's
   exit code: every shard exits 0 so one red shard cannot make the Job terminate the others.
8. Upload `ci-reports/` as an artifact; publish to Pages; write the step summary (expected, unexpected,
   flaky, skipped per shard; k6 p95 and error rate per journey; pod resource peaks from `kubectl top`).
9. `kind delete cluster` (the runner is ephemeral anyway; deleting keeps the logs honest).

**Collecting results without copying out of pods.** The node's `/var/lib/ci-reports` is a kind
`extraMount` of the runner's `./ci-reports`. Every Playwright pod writes `blob-<shard>/` and
`shard-<shard>.log` there, the k6 runners write their summaries there, and the workflow reads them as
plain files. No `kubectl cp`, no sidecars, no object storage.

**Cookies over plain HTTP.** The backend issues session cookies for a browser on HTTPS. Inside the cluster
the origin is `http://frontend.checkitout.svc`, so nginx rewrites `Domain` to the request host and drops
`Secure` while forcing `SameSite=Lax` (`proxy_cookie_flags`). That is the single rule that decides
whether sign-in works in the shards; step 4 above asserts it before any test runs.

**Kubernetes is not the only way to run these tiers.** `nightly-full-stack.yml` runs the same tiers
against the same backend image using GitHub's `services:` block, in about fifteen minutes and with none of
the cluster machinery. The cluster run exists because the question "how does a test land on Kubernetes,
and how does traffic get generated inside the cluster" deserves a working answer, not a slide.

## 3 · Rehearsing locally (WSL, Docker)

```
go install sigs.k8s.io/kind@latest            # or the release binary
export CI_REPORTS_DIR=$PWD/ci-reports && mkdir -p ci-reports
envsubst < deploy/k8s/kind-config.yaml | kind create cluster --config -
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/kind/deploy.yaml
kubectl apply -f https://raw.githubusercontent.com/grafana/k6-operator/main/bundle.yaml
npm run build && docker build -f deploy/k8s/frontend/Dockerfile -t checkitout-frontend:ci .
docker build -f deploy/k8s/tests/Dockerfile.playwright --build-arg PW_VERSION=$(node -p "require('@playwright/test/package.json').version") -t checkitout-tests:ci .
kind load docker-image checkitout-frontend:ci checkitout-tests:ci --name checkitout-ci
kubectl apply -k deploy/k8s/base && kubectl -n checkitout rollout status deploy/backend --timeout=600s
kubectl apply -f deploy/k8s/tests/playwright-indexed-job.yaml && kubectl -n checkitout wait --for=condition=complete job/playwright-shards --timeout=40m
kubectl -n checkitout create configmap k6-scripts --from-file=e2e-tests/perf/k6/ && kubectl apply -f deploy/k8s/tests/k6-testrun.yaml
npx playwright merge-reports --reporter html ci-reports/blob-*
```

Until the backend image is published (`build-image.yml` in the backend repository), build it locally from
`checkItOut-be2` with `docker build -f docker/instagram-platform/Dockerfile -t ghcr.io/check-it-out-dev/checkitout-backend:main .`
and `kind load` it like the others.

### The cluster's lifetime, and how to take it down

In CI the cluster is created inside the job and dies with the runner: `helm/kind-action` builds it in
about a minute, the manifests apply, the tests run, the artifacts are uploaded, and the runner is
destroyed. Nothing persists, nothing bills, nothing has to be torn down; every run starts from a known
state. That is the right shape for a free hosted runner. What it costs is provisioning time, three to
four minutes of the 25-minute budget, spent almost entirely on images: the Playwright image (about
2 GB), the backend image from ghcr.io, Postgres and Redis. The job keeps that down by pulling the
backend from GitHub's own registry, building the test image on the runner with the layer cache
(`cache-from: type=gha`), and pulling the base images in parallel with the cluster's start. A cluster kept
alive between runs would save those minutes and cost a machine that is idle six days out of seven; for
this estate the ephemeral cluster wins.

On the dev box the cluster is a convenience that stays until you delete it. Three levels:

```bash
kubectl delete -k deploy/k8s/base -n checkitout       # the stack only; the cluster and its loaded images stay (seconds to bring back)
kind delete cluster --name checkitout-ci              # the whole cluster; recreating it and loading images takes 2–3 min
docker image rm checkitout-tests:ci checkitout-frontend:ci   # the local images too (the test image is 4.6 GB)
```

`kubectl get pods -A` and `docker ps` tell you which level you are at. Reports in `./ci-reports/` are
files on the host and survive all three.

## 4 · Rehearsed on the dev box, 2026-09-09

The manifests were run end to end on a kind cluster under Docker Desktop before any workflow existed,
with the backend image built from the repository's jar, the frontend from `npm run build`, and the test
image from the Dockerfile above. What the rehearsal measured and what it found:

| Step | Result |
| --- | --- |
| Cluster + ingress-nginx + k6-operator | under 1 min after the images were loaded |
| Backend on dev-lite (Postgres, Redis, Liquibase seed) | started in 16 s; ready when the probes pointed at the `/api` context path |
| In-cluster smoke through nginx | `/healthz` 200, `/api/actuator/health` UP, mock-session cookies without `Secure`, `/api/users/me` and the seeded campaigns 200 |
| Playwright Indexed Job, 4 pods, `--workers=1` each | 4/4 complete in 116 s wall; merged report 249 expected, 1 unexpected, 1 flaky, 34 skipped |
| k6-operator TestRun, `parallelism: 2`, `load` profile | both runners finished; 1,776 checks, 100 % passed; p95 0.7 ms in-cluster (nginx serving the shell); thresholds green |

Defects the rehearsal caught before they cost a CI round-trip, each now fixed in the files above:

- The image already selects the G1 collector; adding a second one through `JAVA_TOOL_OPTIONS` stops the JVM.
- Tomcat serves under `/api`, so every probe path carries that prefix.
- `K6_DNS` is reserved by k6 itself (its DNS configuration); the script's own switch is `K6_DNS_POLICY`.
- A shard that exits non-zero makes the Job terminate its siblings: shards exit 0 and leave `shard-<n>.exit`.
- `merge-reports` takes exactly one directory: the blob zips are copied into `ci-reports/blobs` first.
- With `parallelism > 1`, `--summary-export` makes every k6 runner overwrite the same file; the script's
  `handleSummary` writes one timestamped file per runner instead.
- Two upload tests asserted a Google Cloud Storage URL and one asserted GeoIP data; all three now
  recognise the credential-less profile (local sink paths, `known:false` lookups) and skip or accept.
- The four "legacy ≡ greenfield" parity captures need a retired frontend on :4200 and are excluded by title.
- Three integration tests are excluded by the tag `@needs-firebase`, in the cluster and in the nightly, and
  this is why. The backend image both of them run comes from the public mirror, where
  `src/main/resources/service-account.json` is gitignored, so `GoogleCredentialsProvider` falls back to
  synthetic offline credentials and every call to Google's identity toolkit fails: `verify-reset-code` and
  `confirm-password-reset` answer 503 where the test expects Firebase's own 400, and the account-activation
  path's role-claim write answers 401. The three assert Firebase's behaviour, not ours, and they still run
  wherever real credentials exist. `@tier-2 apply-action-code` deliberately stays in every tier: our own
  Redis-backed one-shot check refuses that code, with no Firebase involved, so it is ours to prove.
  An exclusion without a written reason is a deletion; these are the only two in the estate.

Left as found, on purpose: `Sandbox · CookieBannerComponent › clicking accept-all hides the banner` was flaky
in one run and red in the next inside the cluster (the banner stays after the click for 5 s). That is the
first entry for the flaky list the quality dashboard exists to show, not something the harness should hide.

Frame-timing budgets on shared runners: the smoothness tier's absolute timings (slow frames in the
landing story, long animation frames and blocking time through a tour) failed on `ubuntu-latest` with
readings that belong to the runner, not the application: one or two 67 ms frames under 4x throttle in
a twenty-second story, 10 to 14 long frames through a tour where the dev box reads 8, blamed on the
mocked XHR's `onload`. The same tier on the dev box, the same afternoon, on the same commit: 81 of 82 in
32 minutes, the one failure being blocking time 401 ms against a 400 ms budget on a box also running
Docker, kind and a compose stack. So `browser-tiers.yml` runs the tier with `PERF_TIMING=report`: those
five budgets are measured and written to the report as `timing` annotations, never asserted, while the
structural budgets (card heights, opacity, beat tempo, a way forward at every step) stay hard. The
timings are asserted where the clock is quiet: `npm run test:perf` on the dev box before a deploy. A
dedicated runner would let CI assert them too.

### The k6 API journeys, rehearsed the same afternoon

`e2e-tests/perf/k6/api-journeys.js` drives the backend through nginx the way a browser would: `browse`
(one signed-in influencer per virtual user reading the catalogue) and `apply` (the seeded influencer
applying to campaigns it has not applied to yet). The TestRun with `parallelism: 2` finished with both
runners at 100 % checks, 0 % failed requests, thresholds green; p95 in-cluster 65–150 ms per runner
(the backend on 800 m CPU, real Postgres queries). The rules the script had to learn, kept on by design:

- Rate limits stay on in the cluster. The standard profile allows 60 requests a minute per **user** on
  most endpoints (120 on the paged campaign list), the auth profile 50 a minute per **IP**, and
  `POST /api/applied-opportunity` 20 an hour per user. So every browse VU gets its own mock-session
  account and signs in once; sharing one account across VUs measures the limiter, not the app.
- k6 empties every VU's cookie jar at the start of each iteration unless `noCookiesReset: true` is set.
  Without it every call after the first iteration is anonymous and the run is a wall of 401s that look
  like a broken proxy. That option is now in the script's options.
- Only an account with a social connection, an active status and the influencer role may apply; a fresh
  mock-session account is refused with 403. The `apply` journey therefore uses the seeded
  `test.influencer@test.com`, reads its follower count from `/api/users/me`, and applies only to campaigns
  whose follower band it fits and which it has not applied to yet; when none is left the iteration counts
  as `apply_skipped`, not as a failure.
- With `parallelism > 1` the runners need one run id to share: the TestRun passes `K6_RUN_ID` (the
  workflow substitutes the run number), and each runner appends its pod name to the summary file names.
- Remote write to Grafana Cloud (`--out experimental-prometheus-rw`, credentials from the `grafana-cloud`
  environment into a `k6-remote-write` Secret) exports durations in **seconds** and, by default, only
  p(99) of each trend. The TestRun sets `K6_PROMETHEUS_RW_TREND_STATS=p(95),p(99),max` so the dashboard's
  p95 series exist, and the dashboard's units are `s`. Rehearsed on the dev box's kind cluster: 203
  requests under `testid=run-rehearsal-1707` landed and rendered.
- An externally shared Grafana dashboard supports no variables at all (a query containing one returns
  nothing, without an error), and instant queries at "now" find no run that ended minutes ago. The public
  k6 dashboard therefore has no run picker and every panel reads the whole time range (14 days by
  default, one weekly run in view); `testid` stays on every series for Explore.

## 5 · What "done" means for the cluster run

- One green run on `ubuntu-latest` inside 25 minutes, all four shards complete, the TestRun finished with
  thresholds evaluated, `ci-reports/merged/index.html` and the k6 summary uploaded and published.
- The step summary reads like a test report, not a log: counts per shard, flaky tests named, k6 p95 and
  error rate per journey, and the pod resource peaks that justify the requests above.
- The README's "In progress" rows for Kubernetes test execution and k6 flip from planned to running, with
  the run link; the entry page's CI/CD card shows the same numbers through the published-numbers gate.

## 6 · The testing methodology, for the agent that executes it

**Where each tier runs, and why there.** Unit tests run anywhere. Integration tests run on the runner
with Testcontainers. Browser tiers run against a fresh dev-lite stack created inside the job (service
containers, or the kind cluster weekly) because they mint hundreds of throw-away accounts. The Cucumber
end-to-end suite runs in-process nightly. The public sandbox is verified as a deployment only (nine smoke
checks and the k6 persona profile after every rollout) and never used to measure code: a public host is
the wrong place to measure anything.

**Gates by trigger.** A pull request runs what is fast and deterministic: the frontend's static gates,
typecheck, build and Jest (about 2.5 min) and the backend's unit profile (about 2.5 min). A push to main
adds the sharded browser tiers, the backend's integration profile, both image builds, and the sandbox
rollout, which verifies itself. Nightly runs the full stack, the end-to-end suite and the contract check.
Weekly runs the kind cluster. A job that needs more than 4 vCPU gets one more shard, never a larger
runner.

**The contract.** `contract-check.yml` boots the newest backend on the runner, takes its OpenAPI
document through `OpenApiSpecGeneratorTest` (a real server on Testcontainers Postgres, the same test the
local `openapi:cycle` runs), and compares it with the frontend's committed copy. Unchanged: one line in
the summary. Changed: the client is regenerated with `openapi:gen`, then `typecheck`, `bddgen`,
`typecheck:e2e`, `build:check` and `check:contract-coverage` decide. A compile failure is the job
failing: a contract break is a build error. The repair is the three-commit flow the repository already
uses: backend fix, spec diff, frontend codegen.

**Reading a red run.** The step summary first (counts, the failing names, the k6 budget that was
crossed), then Allure (`allure/<run>/`, with the test's history across runs), then the artifact
(traces for Playwright, the JUnit XML, the k6 JSON). Re-run one shard with the same `--grep` and
`--shard=n/4`; re-run one k6 runner with `K6_PROFILE=smoke` locally against the same target.

**Flaky.** A test is flaky when it failed and then passed on a retry in the same run. It is listed on
the dashboard for ten runs (`METRICS.md` §4). At three flaky or failed runs out of ten it gets
`test.fixme` with an issue link, and stays in the report; nothing is deleted to make a run green. The
cookie-banner sandbox test is the first entry, on purpose.

**Backend, if O1 has not landed yet.** The commands below were run on the dev box on 2026-09-09 and are
the ones the workflow uses:

| Tier | Command | Measured |
| --- | --- | --- |
| unit | `./mvnw -B -ntp test -Ptest -DskipITs` | 2 min 21 s, green |
| integration | `./mvnw -B -ntp verify -Pintegration -DskipPmd=true` (Testcontainers; delete the two `ClientProviderStrategy` lines of `testcontainers.properties` on Linux) | ≈ 4 min per the earlier estate audit |
| end to end | `./mvnw -B -ntp verify -Pe2e -DskipPmd=true` (Firebase steps must `assumeTrue` themselves away without credentials) | ≈ 9–10 min |
| the contract | `./mvnw -B -ntp verify -Pintegration -DskipPmd=true -Dfailsafe.includes='**/OpenApiSpecGeneratorTest.java'` | ≈ 1 min after the boot |

The report job feeds every tier's JUnit XML to Allure 3 (`npx allure generate`), copies the previous
`allure/latest/history` in first, and publishes `allure/<run>/` and `allure/latest/` on `gh-pages`;
the first run is where the JUnit reader and the history copy are verified, then `quality-metrics`
(O7) hangs off the same job.
