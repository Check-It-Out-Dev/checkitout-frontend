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

Every job runs on GitHub-hosted `ubuntu-latest` (4 vCPU, 16 GB, free and unlimited for public
repositories). Nothing runs on a self-hosted runner: on a public repository that would let any pull
request execute on the machine. Speed comes from sharding across runners, never from a larger one.

| Workflow | Trigger | Wall time (budget) | What must be true |
| --- | --- | --- | --- |
| `ci-tests.yml` | PR, push main | ~2.5 min (25) | static gates, typecheck, build, Jest; measured median in `docs/testing/measured-counts.json` |
| `browser-tiers.yml` | PR, push main | ~6 min (20) | sandbox, msw, perf, visual across 4 shards; blob reports merged; Allure with history |
| `lighthouse.yml` | push main | ~4 min (10) | demo build served on 4300; assertions warn, budgets error later |
| `nightly-full-stack.yml` | 02:00 UTC, dispatch | ~15 min (75) | backend image from GHCR with the dev-lite profile; bdd + integration + scenarios |
| `k8s-test-execution.yml` | weekly, dispatch | ~20–25 min (40) | everything in §2 |
| `deploy-demo.yml` | push main (environment `demo`) | ~3 min | tar over ssh, atomic swap, hash verified on both domains |

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
7. `npx playwright merge-reports --reporter html,json ci-reports/blob-*` → `ci-reports/merged/`; Allure
   results from `allure-playwright`; k6 summary JSON and HTML from `ci-reports/`.
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

## 4 · What "done" means for the cluster run

- One green run on `ubuntu-latest` inside 25 minutes, all four shards complete, the TestRun finished with
  thresholds evaluated, `ci-reports/merged/index.html` and the k6 summary uploaded and published.
- The step summary reads like a test report, not a log: counts per shard, flaky tests named, k6 p95 and
  error rate per journey, and the pod resource peaks that justify the requests above.
- The README's "In progress" rows for Kubernetes test execution and k6 flip from planned to running, with
  the run link; the entry page's CI/CD card shows the same numbers through the published-numbers gate.
