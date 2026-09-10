# CI runbook — reading a red run, re-running one piece, operating the sandbox

_The operational page of the CI/CD estate. What each workflow is for is in `ARCHITECTURE.md`; what the
numbers mean is in `METRICS.md`; how the sandbox is built is in `SANDBOX.md`. This page is for the moment
something is red or needs a hand._

## 1 · Where to look, in order

1. **The step summary of the run** (Actions → the run → Summary). Every workflow writes one: counts per
   tier or per shard, the names of unexpected and flaky tests, the k6 budget that was crossed, the
   Lighthouse scores, the rollout tags. Most answers are there.
2. **The dashboard** (`https://check-it-out-dev.github.io/<repo>/`): the verdict sentence, the thirty-run
   ribbon (a slow or red run stands out), the flaky list with each test's last ten runs.
3. **The report of the run**: Playwright's merged HTML (traces on failure), Allure with history (the
   backend), the k6 summaries, the Lighthouse HTML: linked from the dashboard and kept for thirty runs.
4. **The artifact** (`ci-reports`, `nightly-report-<run>`, `k8s-reports-<run>`, `unit-results` …): the raw
   files, kept for thirty days.

## 2 · Re-running one piece

| What failed                               | Locally                                                                                                                                 | On GitHub                                                                                            |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| One browser test                          | `npx playwright test <spec> --project=chromium-desktop --grep "<title>"`                                                                | Re-run the shard job (the shards are fixed: the summary names the shard)                             |
| One Playwright shard from the cluster run | `npx playwright test e2e-tests/integration --shard=2/4 --workers=1` against the compose stack (`SANDBOX.md` §7, `BE_PROFILES=dev-lite`) | Dispatch `k8s-test-execution` with `shards` = 1 to reproduce in one pod                              |
| The k6 journeys                           | `BASE_URL=http://127.0.0.1:8090 K6_DNS_POLICY=preferIPv4 npm run perf:k6:api` (compose stack)                                           | Dispatch `k8s-test-execution`; or `deploy-sandbox` runs the persona profile against the live sandbox |
| Backend unit / integration / e2e          | `./mvnw -B test -Ptest -DskipITs` / `verify -Pintegration -DskipPmd=true` / `verify -Pe2e -DskipPmd=true`                               | Dispatch `ci-tests` with `tier`                                                                      |
| The contract                              | `node tools/openapi-cycle.mjs` (needs the backend checkout and Docker)                                                                  | Dispatch `contract-check` with `backend_ref`                                                         |
| Lighthouse                                | `npm run build:demo && node tools/serve-demo.mjs --no-build --port 4300` then `npx lhci autorun`                                        | Dispatch `lighthouse`                                                                                |
| The rollout                               | `SANDBOX_ROOT=<dir> SANDBOX_BUNDLE_LOCAL=$PWD SANDBOX_SKIP_PULL=1 bash deploy/sandbox/rollout.sh deploy ci main main` (local images)    | Dispatch `deploy-sandbox` with `backend_tag` and, to redeploy a known image, `frontend_tag`          |

## 3 · Flaky, and what to do about it

A test is flaky when it failed and passed on a retry in the same run. It appears on the dashboard's list
for ten runs with its status in each of them. Rules:

- One flake in ten runs: watch, do nothing.
- Three or more flaky or failed in ten: `test.fixme('<issue url>', …)` on the test, with the issue holding
  the trace. The test stays in the report as skipped; nothing is deleted.
- A test that flakes only on the cluster run and never on the nightly is a resource question first
  (the pod's CPU request, `--workers=1`), a test question second.
- The cookie-banner sandbox test is the first entry on the list, on purpose: it shows the list works.

## 4 · The sandbox host

All commands run on the VPS as the `deploy` user through `/opt/checkitout-sandbox/rollout.sh`
(`SANDBOX.md` §6–§7):

| Need                            | Command                                                                                                         |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| What is deployed                | `rollout.sh status` (tags, bundle sha, container health)                                                        |
| Logs                            | `rollout.sh logs 300 backend` (or `frontend`, `postgres`, `alloy`); Grafana Cloud for history                   |
| A deploy failed and rolled back | read `rollout.log` in the root; the failed tags are in `.env.failed`; fix, then dispatch `deploy-sandbox` again |
| Roll back by hand               | `rollout.sh rollback` (the tags in `.env.previous`)                                                             |
| Reset the data now              | `rollout.sh reseed` (about 40 s; the nightly timer does the same at 03:00 UTC)                                  |
| The timer                       | `systemctl status checkitout-sandbox-reseed.timer`; `journalctl -u checkitout-sandbox-reseed`                   |
| Disk                            | `df -h /opt/checkitout-sandbox/uploads` (the 2 GB image); `docker system df`                                    |
| Memory                          | `docker stats --no-stream`; the backend is capped at 1.5 GB                                                     |

**Rotating the deploy key.** Generate a new key on the owner's machine (`ssh-keygen -t ed25519 -C
github-deploy-sandbox`), replace the line in `/home/deploy/.ssh/authorized_keys` keeping the
`command="/opt/checkitout-sandbox/rollout.sh",no-port-forwarding,no-agent-forwarding,no-pty,no-X11-forwarding`
prefix, update `SANDBOX_SSH_KEY` in the `sandbox` environment, dispatch `deploy-sandbox` with the current
tags to prove it, delete the old key. Nothing else holds the key.

**Rotating the Grafana Cloud tokens.** They live only in `/opt/checkitout-sandbox/.env`; edit, then
`docker compose … up -d alloy` through `rollout.sh deploy` with the current tags (it re-reads the file).

## 5 · Pages and the dashboard

The site is the `gh-pages` branch of each repository, written by the last job of every workflow with
`tools/ci/quality-metrics.mjs` (`METRICS.md` §7). If a run published nothing: the job's "Pages site"
step is `continue-on-error` (the branch may not exist yet), the tool's output is in the step summary, and
`peaceiris/actions-gh-pages` needs `contents: write` on the job and Pages set to "deploy from branch
gh-pages, root" in the repository settings. To rebuild the dashboard files without a run:
`node tools/ci/quality-metrics.mjs --out site --run-number <n>` copies them into an existing site.

## 6 · Secrets and where they are not

| Secret                                                                       | Lives in                                                    | Used by                                                                                                |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `SANDBOX_SSH_KEY`, `SANDBOX_HOST`, `SANDBOX_KNOWN_HOSTS`                     | GitHub environment `sandbox` (required reviewer: the owner) | `deploy-sandbox.yml`                                                                                   |
| `FE_DISPATCH_TOKEN` (fine-grained, actions:write on the frontend repository) | backend repository secrets                                  | `build-image.yml` → `contract-check`                                                                   |
| Grafana Cloud Loki / Prometheus tokens                                       | the sandbox host's `.env` only                              | Alloy                                                                                                  |
| Nothing else                                                                 |                                                             | the kind cluster, the nightly stack and the sandbox backend run on dev-lite, which needs no credential |

## 7 · Rotating what expires

Nothing here is on a timer that will remind you. The order matters only in one
place: rotate the credential **before** revoking the old one where a running
service holds it, or the sandbox stops answering mid-rotation.

| What                        | Where it lives                                                                                                                              | How to rotate                                                                                                                                                                                                | What breaks until it is done                                                                   |
| :-------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------ | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------- |
| Sandbox deploy key          | `SANDBOX_SSH_KEY` in the frontend's `sandbox` environment; the public half in `deploy`'s `authorized_keys` on gvps, behind a forced command | `ssh-keygen -t ed25519 -C sandbox-deploy -f newkey`, append the public half **beside** the old line with the same `command=` prefix, replace the secret, run `deploy-sandbox` once, then delete the old line | `deploy-sandbox` — the demo and the sandbox keep running                                       |
| Grafana Cloud write tokens  | `K6_PROMETHEUS_RW_*` in the frontend's `grafana-cloud` environment; the Loki and Prometheus pair in `/opt/checkitout-sandbox/.env` on gvps  | New access policy token in Grafana Cloud, replace both, restart Alloy on the host (`docker compose -p checkitout-sandbox restart alloy`)                                                                     | k6 metrics from the cluster and the sandbox's logs; the tests themselves still pass            |
| Cloudflare API token        | `~/.cloudflare/credentials` on the dev box                                                                                                  | New token scoped to Zone:Cache Purge and Zone:Read on both zones                                                                                                                                             | `deploy:demo` cannot purge the CDN — the deploy still swaps, but a cached shell can survive it |
| GitHub PAT with `admin:org` | `~/.github-admin.env`, mode 600                                                                                                             | Only needed to change the organisation's security configuration; delete it when that is settled rather than keeping it                                                                                       | nothing routine                                                                                |
| Firebase service account    | `src/main/resources/service-account.json` in the backend working copy, gitignored                                                           | Owner-side, in the Firebase console                                                                                                                                                                          | nothing in CI — the tiers run against the emulator and hold no credential                      |

Two things are **not** rotatable and have to be replaced instead. A value that
has been committed to a public repository is public for good: git history and
every clone keep it, so the account behind it has to be deleted, not
re-secreted. And a token pasted into a chat transcript is in that transcript
forever, whatever is done to the file afterwards.

Secret scanning and push protection are enabled on all three public
repositories, so a recognised credential will now be refused at push time rather
than found later. Push protection only knows the patterns it knows: a plain
password in a Gherkin file is not one of them, which is exactly how the last one
got in.
