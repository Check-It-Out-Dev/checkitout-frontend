<div align="center">

# checkItOut — Frontend

**A production Angular rewrite where the test strategy is the architecture.**

Types are generated from the backend's OpenAPI spec, so a contract change is a compile error before
it is ever a bug. Every tier above that re-proves the same truth at a higher level of integration.

[![License: MIT](https://img.shields.io/badge/License-MIT-1f6feb.svg)](LICENSE)
[![Angular](https://img.shields.io/badge/Angular-22-dd0031.svg)](https://angular.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-6.0-3178c6.svg)](https://www.typescriptlang.org/)
[![Tests](https://img.shields.io/badge/tests-1884-15c213.svg)](#-testing)
[![Coverage](https://img.shields.io/endpoint?url=https://check-it-out-dev.github.io/checkitout-frontend/badges/coverage.json)](https://check-it-out-dev.github.io/checkitout-frontend/)
[![Flaky](https://img.shields.io/endpoint?url=https://check-it-out-dev.github.io/checkitout-frontend/badges/flaky.json)](https://check-it-out-dev.github.io/checkitout-frontend/)
[![Lighthouse](https://img.shields.io/endpoint?url=https://check-it-out-dev.github.io/checkitout-frontend/badges/lighthouse.json)](https://check-it-out-dev.github.io/checkitout-frontend/lighthouse/latest.json)

[![gates](https://github.com/Check-It-Out-Dev/checkitout-frontend/actions/workflows/ci-tests.yml/badge.svg)](https://github.com/Check-It-Out-Dev/checkitout-frontend/actions/workflows/ci-tests.yml)
[![browser tiers](https://github.com/Check-It-Out-Dev/checkitout-frontend/actions/workflows/browser-tiers.yml/badge.svg)](https://github.com/Check-It-Out-Dev/checkitout-frontend/actions/workflows/browser-tiers.yml)
[![kubernetes](https://github.com/Check-It-Out-Dev/checkitout-frontend/actions/workflows/k8s-test-execution.yml/badge.svg)](https://github.com/Check-It-Out-Dev/checkitout-frontend/actions/workflows/k8s-test-execution.yml)
[![security](https://github.com/Check-It-Out-Dev/checkitout-frontend/actions/workflows/security.yml/badge.svg)](https://github.com/Check-It-Out-Dev/checkitout-frontend/actions/workflows/security.yml)
[![Quality Gate](https://sonarcloud.io/api/project_badges/measure?project=Check-It-Out-Dev_checkitout-frontend&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=Check-It-Out-Dev_checkitout-frontend)
[![contract](https://github.com/Check-It-Out-Dev/checkitout-frontend/actions/workflows/contract-check.yml/badge.svg)](https://github.com/Check-It-Out-Dev/checkitout-frontend/actions/workflows/contract-check.yml)
[![dependency review](https://github.com/Check-It-Out-Dev/checkitout-frontend/actions/workflows/dependency-review.yml/badge.svg)](https://github.com/Check-It-Out-Dev/checkitout-frontend/actions/workflows/dependency-review.yml)

<sub>Only the test count is static — 1884 across every tier, measured 2026-09-08 and gated by G15.
Coverage, the flaky list and the Lighthouse scores are read live from the
<a href="https://check-it-out-dev.github.io/checkitout-frontend/">quality dashboard</a>, which every run on <code>main</code> republishes.</sub>

### ▶ [**checkitout.app**](https://checkitout.app) — the live demo

_Frontend only. Every `/api` call answered in the browser. No account, no backend, no payment._

**[Backend](https://github.com/Check-It-Out-Dev/checkitout-backend)** ·
**[Graph-theory method](https://github.com/Check-It-Out-Dev/graph-theory-system-modeling)** ·
**[Technical survey](https://checkitout.app/technical-survey/engineering)**

</div>

---

## What this is

checkItOut is an influencer-marketing platform: companies publish campaigns, creators apply, money
moves through Stripe, invoices go out through Fakturownia and on to the Polish national e-invoicing
system. It ran in production with real users; today it is an open demo. This repository is the
**greenfield rewrite of its frontend** — from a template-heavy Angular 17 app to Angular 22
standalone + Material, rebuilt route by route without a feature freeze on the product.

Three claims, and the rest of this page is where you check them:

| Claim                                                                                                                                                                                                                              | Where to check it                               |
| :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :---------------------------------------------- |
| **The backend contract cannot silently drift.** 181 model types and 41 API services are generated from the backend's spec; three separate mechanisms refuse to let hand-written code diverge from them.                            | [The contract pipeline](#the-contract-pipeline) |
| **1,884 tests across nine tiers, and each proves something the others structurally cannot.** 1181 Jest · 148 BDD scenarios · 222 live-backend integration · 142 visual · 82 experience · counted by the runners, skipped included. | [Testing](#-testing)                            |
| **Fifteen gates run before any commit lands, and each was born from a specific defect that got through.**                                                                                                                          | [Quality gates](#-quality-gates)                |

> [!NOTE]
> Every number on this page was measured on **2026-09-08** with a command you can run yourself, and
> `npm run check:published-numbers` fails the build if any of them drifts from the code. Where
> something is designed but not yet running, it is marked ⬜ and appears under
> [in progress](#-in-progress). Nothing here is aspirational unless it says so.

---

## 🚀 Run it

Three levels, and only the third one costs you anything.

**1 · Look at it — 0 minutes.** [checkitout.app](https://checkitout.app): the whole product, guided
tours and all. Every `/api` call is answered inside the browser. No account, no backend, no payment.

**2 · Run the frontend yourself — 2 minutes, no credentials.** The demo build serves every `/api`
response from in-memory fixtures — the _same typed builders the test tiers use_ — and hosts as
plain static files:

```bash
npm ci
npm run build:demo
npx http-server dist/check-it-out-fe-greenfield/browser
```

That is also enough to run **1,467 of the 1,884 tests**: every Jest test, the fifteen-gate wall, and
the sandbox, visual and experience tiers.

**3 · Run the whole platform — a weekend.** From the
[backend repository](https://github.com/Check-It-Out-Dev/checkitout-backend), `node tools/dev-lite.mjs`
brings up PostgreSQL, Redis, the backend on a credential-less profile and this frontend, with a seeded
world and accounts to sign in as. Payments, invoicing, social connections, geolocation and the Polish
registries need your own accounts (Google Cloud Storage, Stripe, Fakturownia, Meta, MaxMind, GUS/KSeF);
not one secret is committed here, so on a machine without them the live-backend tiers skip by name,
with the reason printed — 180 inline `test.skip(condition, reason)` calls, on purpose. A suite that
fails on a machine that was never going to run it teaches people to ignore red.

**Development mode.** Node `^22.22.3 || ^24.15.0`, npm 10+, backend on `https://localhost:8080`.
The dev certificate is generated per clone rather than committed.

```bash
npm ci
npx playwright install chromium webkit   # one-time, ~300 MB, for the e2e tiers
npm run start                            # https://localhost:4201
```

<details>
<summary><b>Every test command</b></summary>

```bash
npm test                  # 1181 Jest unit + component tests          ~20 s
npm test -- --coverage    # …with coverage, gated by a threshold
npm run check:full        # the entire fifteen-gate wall, exactly as CI runs it
npm run test:bdd          # 148 Cucumber scenarios       (needs the stack)
npm run test:integration  # 222 live-backend cases       (needs the stack)
npm run test:sandbox      # 61 component-sandbox tests
npm run test:visual       # 142 byte-stable snapshots over 144 fixtures
npm run test:parity       # legacy-vs-greenfield pixel diff, 4 device projects
npm run test:perf         # 82 experience measurements   (serves a real build)
npm run perf:k6           # k6 thresholds on the demo's public routes
npm run openapi:cycle     # regenerate the client from the backend spec
npm run measure:counts    # re-ask the runners; writes docs/testing/measured-counts.json
```

</details>

---

## 🔺 Testing

**1,884 tests.** Five layers in the pyramid, four tiers beside it. The point is not the count — it
is that the layers are **connected**: each is built from the artifacts of the one below, so a
regression cannot pass a lower layer and hide in a higher one. The tiers beside the pyramid are
there because they answer questions the chain structurally cannot.

```text
                        ┌──────────────────────────────────────┐
                        │  L4 · VISUAL                         │  142 tests · 144 fixtures
                        │  what a person actually sees         │  + 41 parity × 4 devices
                    ┌───┴──────────────────────────────────────┴───┐
                    │  L3 · BDD ORACLE — the live backend          │  148 tests
                    │  the business rules, re-proven through the   │  27 feature files
                    │  screens a real user touches                 │  needs the full stack
                ┌───┴──────────────────────────────────────────────┴───┐
                │  L2 · COMPONENT                                      │
                │  UI logic against service interfaces, never HTTP     │  1181 tests
            ┌───┴──────────────────────────────────────────────────────┴───┐
            │  L1 · SERVICE                                                │  135 suites
            │  every wrapper's URL, verb, body and return type             │  ~20 s
        ┌───┴──────────────────────────────────────────────────────────────┴───┐
        │  L0 · CONTRACT — compile time, zero runtime cost                     │  18 assertions
        │  the wrapper's signature IS the generated model                      │  41 services · 181 models
        └──────────────────────────────────────────────────────────────────────┘

   beside the pyramid, because they answer questions it cannot:

   ▸ INTEGRATION · trace-equivalence   222 tests · 40 files · each cites its backend feature
   ▸ SANDBOX     · component states     61 tests · every fixture, mocked
   ▸ SCENARIOS   · multi-actor flows     6 tests ·  3 files · two people, one campaign
   ▸ EXPERIENCE  · perf                 82 tests · 15 files · smooth, readable, honest in motion

   1181 Jest + 703 Playwright = 1,884 tests. Counted by the runners themselves,
   skipped and fixme included — `npx playwright test <dir> --list` says so.
```

| Tier              | Proves                                                                                                                                                                        | Cost                     | Blind to                                               |
| :---------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :----------------------- | :----------------------------------------------------- |
| **L0 Contract**   | A wrapper's signature is _exactly_ the generated model. Drift is a `tsc` error.                                                                                               | 0 runtime                | Anything at runtime. It is a type proof, nothing more. |
| **L1 Service**    | Each wrapper serialises the right URL, verb and body, and types the response. Services read as executable API documentation.                                                  | ms                       | Whether the real backend agrees.                       |
| **L2 Component**  | UI logic against service _interfaces_, with builder-shaped data.                                                                                                              | ms                       | Wiring, routing, and anything the DOM does.            |
| **L3 BDD oracle** | 148 scenarios of business rules — ported from the backend's own Cucumber corpus — re-proven through the frontend, against a live backend, with real auth and multiple actors. | minutes, needs the stack | Pixels, timing, motion.                                |
| **L4 Visual**     | Byte-stable snapshots of 144 component fixtures, plus legacy-vs-greenfield pixel diff across four device projects.                                                            | minutes                  | Behaviour. A beautiful broken button passes.           |
| **Integration**   | The API call _trace_ the app actually emits: header semantics, retry behaviour, cookie domains, ordering. Every spec cites the backend Cucumber feature it ports.             | minutes, needs the stack | Rendering.                                             |
| **Experience**    | Long animation frames, layout stability, main-thread answerability, how long evidence stays readable on screen.                                                               | 24 min                   | Correctness.                                           |
| **Performance**   | k6 against the public routes: p95 per route under a budget, error rate under 1 %, the SSR shell present — a threshold, not a lab number.                                      | 30 s – 75 s              | Everything but latency and availability.               |

**Not Pact, and worth naming precisely.** Pact is consumer-driven contract testing: the consumer
records expectations, the provider verifies them in isolation. What happens here is the inverse —
**spec-first integration testing**: the provider publishes an OpenAPI document, the consumer
_generates_ its types from it, a compile-time layer proves the hand-written code still matches, and
the same typed services are then exercised against a **live** backend with real authentication and
multi-actor flows. The honest gap: nothing checks that the _running server_ matches its own published
spec. [Schemathesis](https://schemathesis.io/) would close it, and it is not installed. ⬜

### Coverage

Measured 2026-09-08. Coverage excludes `src/app/api/**` — 271 generated files nobody edits, and
counting them would move the number without moving the truth.

|                          |                                                                                                Measured | Gate                            |
| :----------------------- | ------------------------------------------------------------------------------------------------------: | :------------------------------ |
| **Lines**                |                                                                               **78.06 %** (5885 / 7539) | fails under 75                  |
| **Statements**           |                                                                               **76.54 %** (6558 / 8567) | fails under 74                  |
| **Branches**             |                                                                               **67.98 %** (2264 / 3330) | fails under 66                  |
| **Functions**            |                                                                               **65.68 %** (1378 / 2098) | fails under 62                  |
| **Files in scope**       | **242** — every hand-written file under `src/app`; **80 of them have no test at all** and count as zero | —                               |
| **Test code : app code** |                                              **0.75 : 1** — 50,639 lines of tests against 67,409 of app | —                               |
| **Initial bundle**       |                                                                **1.09 MB** raw · **250 kB** transferred | 1250 kB warning / 1500 kB error |

Function coverage is the weak number and it is published because a threshold you cannot see is not
a threshold. Every floor sits two points below what was measured, so the number can only be raised.
Web Vitals are a single lab run of the demo build (LCP 185 ms, CLS 0.00, Lighthouse accessibility
97, best practices and SEO 100); there is no field data, and a budget in CI is
[in progress](#-in-progress).

📄 The reasoning behind the layering: **[docs/testing/LAYERED-TEST-ARCHITECTURE.md](docs/testing/LAYERED-TEST-ARCHITECTURE.md)** ·
the error-class register and the instrument laws: **[docs/testing/BROWSER-QA-METHODOLOGY.md](docs/testing/BROWSER-QA-METHODOLOGY.md)**

---

## 🏗 Architecture

Feature-first, standalone, signal-driven. A feature owns its routes, its components and its state,
and reaches the outside world through one door.

```
src/app/
├── api/          271 generated files — 181 models, 41 services.  NEVER hand-edited.
├── core/         the only code allowed to import from api/. One wrapper per domain.
├── feature/      routed features. Standalone components, signals, mostly OnPush.
├── layout/       shells and chrome.
├── shared/       genuinely shared UI. Small on purpose.
└── testing/      9 builders + 18 compile-time contract assertions. Ships with the tests.
```

| Decision                                                 | Why                                                                                                                                                                                                                                                                    |
| :------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Angular 22 standalone + signals**                      | The rewrite started on 17 and migrated in place; no NgModules were ever written. `OnPush` on 82 of 123 components; 36 are deliberately `Eager` (the editorial survey pages, where content is static and the ceremony buys nothing). Zone-based, not zoneless.          |
| **Tailwind with preflight OFF**, beside Angular Material | Preflight and Material's own resets fight each other. The resets we actually need — `box-sizing`, button and border defaults — live explicitly in `styles.scss @layer base`. A missing rule there looks like a whole-app styling bug, which is why it is written down. |
| **Transloco** for i18n, `pl` + `en`                      | Key sets are gated to be identical, so a missed translation is a failed commit rather than a raw key in production.                                                                                                                                                    |
| **SSR built, prerender used**                            | `ng build` emits browser + server bundles and prerenders `/` and the technical survey. Only `browser/` is deployed; nginx serves it with an index fallback.                                                                                                            |
| **A demo build with a mocked interceptor**               | Same code, same components, every `/api` answered in-browser. It is what [checkitout.app](https://checkitout.app) serves, and it is how the whole product is demonstrable without an account.                                                                          |

**Rewriting a live product** is harder than greenfield: every strange branch in the old code encodes
a customer bug fix, a regulation, or a UX lesson. Five rules kept that knowledge: never feature-freeze
the product; freeze the URL surface on day one; the OpenAPI spec is the contract and the client is
generated, never hand-written; visual baselines are committed artifacts reviewed as images; one
cutover unit per route.

### The contract pipeline

The backend owns the truth; the frontend never restates it. Five steps, one command —
`npm run openapi:cycle` ([tools/openapi-cycle.mjs](tools/openapi-cycle.mjs)):

1. **Backend regenerates the spec** — `mvnw verify -Pintegration OpenApiSpecGeneratorTest`, under
   Testcontainers, so the document describes a server that actually booted.
2. **The spec is committed here** — [docs/openapi/openapi.json](docs/openapi/openapi.json). The
   generator sorts the JSON keys so that two repositories hold the _identical file_:
   `sha256sum docs/openapi/openapi.json` →
   `96ceb20f44831ba48ac6a01349e953c0131260ff8db84b447d704893b01e7cbb`, in either repository.
3. **Codegen** — `openapi-generator-cli generate -g typescript-angular`, output wiped and rewritten,
   then a post-processor pass.
4. **`npm run typecheck`** — every contract break in the entire application surfaces here.
5. **`npx bddgen`** — the Cucumber steps recompile against the new models.

Three mechanisms keep hand-written code from drifting around the generated types: feature code may
not import the generated client ([`check-api-wrappers`](tools/check-api-wrappers.mjs) — one
`Observable<any>` at a call site turns every downstream type into a lie); each wrapper's signature is
proven identical to the generated model by the compiler:

```ts
// src/testing/contract/address.contract.ts — zero runtime cost, pure type-level proof
type _createForUser = Expect<
  Equal<
    AddressApi['createForUser'],
    (userId: number, dto: AddressDtoIn) => Observable<AddressDtoOut>
  >
>;
```

and the proofs are coverage-gated ([`check-contract-coverage`](tools/check-contract-coverage.mjs)):
**19 of 31 wrappers under an L0 contract, 12 waived** with a written reason each.

**Modelled as a graph.** The application is also maintained as a knowledge graph in Neo4j — a
three-level topology, a six-entity behavioural lens, state machines as data — so that a person and
an agent can navigate it without reading everything. The method and the tooling are published in
[graph-theory-system-modeling](https://github.com/Check-It-Out-Dev/graph-theory-system-modeling);
the graph, drawn from the real data with the cost of an answer measured against grep-and-read, is on
[checkitout.app/technical-survey/engineering#graph-topology](https://checkitout.app/technical-survey/engineering#graph-topology).

**How it was built.** An AI agent did much of the typing in this repository, inside a loop where
something other than the agent decides whether its output survives: `tsc` under `strict` and
`strictTemplates` in seconds, the fifteen-gate wall in minutes, the live-backend tiers when the stack
is up. The human owned what to test, at which layer, and which business paths mattered enough to
port; most of the engineering went into instruments — a per-frame DOM sampler, a screencast pipeline,
an error-class register — rather than into prompting. The numbers behind "why this loop is fast" are
on [#velocity](https://checkitout.app/technical-survey/engineering#velocity).

---

## 🛡 Quality gates

Fifteen gates, run by `npm run check:full` and by CI on every pull request. Twelve are custom scripts
written for this repository, and each exists because something specific got through:

| #   | Gate                                  | Refuses                                                                                                                                      | Born from                                                                                      |
| :-- | :------------------------------------ | :------------------------------------------------------------------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------- |
| G1  | `check:no-legacy-ui`                  | Any import from the old template library                                                                                                     | The rewrite's whole point                                                                      |
| G2  | `check:api-wrappers`                  | Feature code importing the generated client directly                                                                                         | `Observable<any>` leaking through casts                                                        |
| G3  | `check:i18n-parity`                   | `en.json` and `pl.json` having different key sets — 4656 keys and 52 templates, checked pairwise                                             | A typo'd key shipping as raw text                                                              |
| G4  | `check:visual-fixture-coverage`       | A sandbox fixture with no visual baseline — 144/144 registered and captured                                                                  | Silent coverage loss when new fixtures land                                                    |
| G5  | `check:visual-baseline-freshness`     | Baselines older than the components they claim to show                                                                                       | An editorial sweep touched 27 templates without regenerating baselines                         |
| G6  | `check:integration-cucumber-citation` | An integration spec that does not cite the backend feature it ports — 67/67 cite theirs                                                      | The tier is a _port_ of the backend corpus, not a parallel one                                 |
| G7  | `check:bdd-corpus`                    | A backend Cucumber feature that is neither ported nor explicitly waived — 34 accounted for, 26 ported, 8 waived                              | Completeness you can measure beats completeness you assume                                     |
| G8  | `check:component-pair-sync`           | A component pair pointing at a fixture that no longer exists                                                                                 | Dangling parity pairs passing vacuously                                                        |
| G9  | `check:contract-coverage`             | A core wrapper that is neither under an L0 type proof nor explicitly waived — 19/31 proven, 12 waived with reasons                           | See above                                                                                      |
| G10 | `check:icon-subset`                   | An icon used in code but missing from the shipped font subset                                                                                | A missing glyph is invisible in review and obvious in production                               |
| G11 | `check:i18n-cache-buster`             | A stale translation-bundle hash                                                                                                              | Users served yesterday's copy                                                                  |
| G12 | `typecheck` + `typecheck:e2e`         | Any type error, app or test                                                                                                                  | Strict everywhere, tests included                                                              |
| G13 | `build:check`                         | Template type errors — `strictTemplates` only fires in `ng build`                                                                            | `tsc --noEmit` does **not** check templates                                                    |
| G14 | `jest --bail` + coverage threshold    | A failing test, or coverage sliding below the floor                                                                                          | —                                                                                              |
| G15 | `check:published-numbers`             | Any number this repo publishes about itself disagreeing with the measured one — 73 figures across the README, both locales and one component | The site said 216 generated models against a directory holding 181, and 949 Jest against 1,141 |

The pre-commit hook runs G1–G10 and G12–G15 by name; G11 rides in `check:static`, which CI runs and
the hook does not — a gap worth knowing about rather than papering over.

---

## ⚙️ CI/CD

Everything below runs on GitHub-hosted runners on the free tier. Speed comes from sharding across
several of them, never from a bigger one — and no workflow on this public repository runs on
self-hosted infrastructure, so a fork's pull request can never reach the box.

| Pipeline                                                             | Trigger                          | What runs                                                                                                                                                                                                                                                                                                                                 | Time          |
| :------------------------------------------------------------------- | :------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------ |
| [`ci-tests.yml`](.github/workflows/ci-tests.yml)                     | push, pull request               | The same fifteen gates as the pre-commit hook: eleven static gates, two typechecks, `ng build` with strictTemplates, the Jest suite with coverage. **Hermetic** — no backend, no browsers, no Docker.                                                                                                                                     | ~150 s        |
| [`browser-tiers.yml`](.github/workflows/browser-tiers.yml)           | push, pull request               | Nine runners: sandbox and MSW over four shards, the smoothness tier over three (one worker each, because two workers on one machine drop frames in each other's measurements), and the visual tier inside the pinned Playwright image. Blob reports merged into one HTML report, one Allure report and one verdict.                       | ~20 min       |
| [`k8s-test-execution.yml`](.github/workflows/k8s-test-execution.yml) | weekly, on demand                | A kind cluster on the runner: PostgreSQL, Redis, the backend image on `dev-lite`, the frontend behind nginx. Playwright runs as an **Indexed Job** of four pods, k6-operator as a `TestRun` of two, generating load against the in-cluster services. Metrics remote-written to Grafana Cloud.                                             | ~11 min       |
| [`nightly-full-stack.yml`](.github/workflows/nightly-full-stack.yml) | 02:00 UTC, on demand             | Four shards — BDD, integration ×2, scenarios and sandbox — each with its own PostgreSQL 16, Redis 7 and GreenMail, against the published backend image.                                                                                                                                                                                   | 75 min budget |
| [`lighthouse.yml`](.github/workflows/lighthouse.yml)                 | push, on demand                  | Lighthouse CI against the demo build served in the job, asserted against `lighthouserc.json` and `budget.json`.                                                                                                                                                                                                                           | ~4 min        |
| [`contract-check.yml`](.github/workflows/contract-check.yml)         | daily, on demand                 | Boots the backend on the runner, takes the OpenAPI document from it, and compares it with the copy committed here. On a difference it regenerates the TypeScript client and compiles against it, so drift is a build error rather than a runtime surprise.                                                                                | ~6 min        |
| [`dependency-review.yml`](.github/workflows/dependency-review.yml)   | pull request                     | Compares the dependency manifests of the base and the head and fails a pull request that introduces a known high-severity advisory. CodeQL is not here: the organisation runs it through **default setup** on the extended query suite, and the two cannot coexist — GitHub refuses SARIF from a workflow while default setup is enabled. | ~2 min        |
| [`security.yml`](.github/workflows/security.yml)                     | push, pull request, weekly       | Semgrep, Checkov, Trivy and an SBOM on every push; a ZAP baseline against the live sandbox on the weekly run. Every scanner writes SARIF into code scanning.                                                                                                                              | ~6 min        |
| [`sonar.yml`](.github/workflows/sonar.yml)                           | push, pull request               | SonarQube Cloud, fed the same lcov coverage the gate wall measures.                                                                                                                                                                                                                      | ~4 min        |
| [`deploy-sandbox.yml`](.github/workflows/deploy-sandbox.yml)         | push to main                     | Builds the image, then waits for a human in the `sandbox` environment. Rollout keeps the previous tags, gates on health, and rolls back by itself when the gate does not clear.                                                                                                                                                           | ~4 min        |
| Demo — [`tools/deploy-demo.mjs`](tools/deploy-demo.mjs)              | `npm run deploy:demo -- --build` | Demo build, tar over SSH, atomic directory swap with three rollback copies, CDN purge, the served bundle hash verified on both domains past the cache.                                                                                                                                                                                    | ~3 min        |

Every run publishes to the [quality dashboard](https://check-it-out-dev.github.io/checkitout-frontend/): pass rate, flaky list over the last ten
runs, per-tier durations, and the reports themselves — [Allure](https://check-it-out-dev.github.io/checkitout-frontend/allure/latest/) with history,
the merged Playwright report, k6 summaries and Lighthouse. Two public Grafana dashboards carry the k6
[API journeys](https://checkitoutapp.grafana.net/public-dashboards/bc4987ccdb234296a33afd3a794f1f4e)
and the [sandbox](https://checkitoutapp.grafana.net/public-dashboards/f48c40b8b3244bdfa019117fa9fdcbbe).

The visual tier is rasterised in one place, by design: baselines are captured and compared inside the
same pinned `mcr.microsoft.com/playwright` image, on the dev box and on the runner alike, because a
Linux runner draws text differently from a Windows one and two sets of baselines drift apart
([ADR](docs/ci/ADR-visual-baselines.md)). Hosting stays Docker Compose and systemd on one VPS,
right-sized for this product; Kubernetes appears here only as the substrate for running tests.

---

## 📋 In progress

Work under way, dated 2026-09, so that nothing on this page reads as finished-and-abandoned. ✅
shipped · 🟡 under way · ⬜ designed, not started.

|     | What                                                     | Detail                                                                                                                                                                   |
| :-- | :------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ✅  | Contract pipeline, end to end                            | Spec → codegen → wrappers → compile-time proofs → every tier                                                                                                             |
| ✅  | Fifteen-gate wall, local and in CI                       | Identical locally and on pull requests                                                                                                                                   |
| ✅  | 1181 Jest unit + component tests                         | Coverage measured and gated                                                                                                                                              |
| ✅  | 148 BDD scenarios from the backend corpus                | 27 feature files; 26 of 34 backend features ported, 8 waived, gated by G7                                                                                                |
| ✅  | 222 live-backend integration tests                       | Each citing the feature it ports                                                                                                                                         |
| ✅  | 142 visual snapshots over 144 fixtures + 41 parity diffs | Coverage gated by G4, freshness by G5                                                                                                                                    |
| ✅  | Experience tier — 82 measurements                        | Nine error classes closed, each swept across all seven journeys                                                                                                          |
| ✅  | k6 performance gate                                      | Thresholds on the public routes, local and on demand in CI                                                                                                               |
| ✅  | Live demo, fully mocked                                  | [checkitout.app](https://checkitout.app), with the technical survey prerendered and described for link previews                                                          |
| ✅  | Test execution on Kubernetes                             | kind on the runner: Playwright as a four-pod Indexed Job, reports collected off a hostPath and merged                                                                    |
| ✅  | k6 on Kubernetes                                         | k6-operator `TestRun`, two runners against the in-cluster services, thresholds as the pass condition, metrics remote-written to Grafana Cloud                            |
| 🟡  | Branch and function coverage                             | 68.0 % and 65.7 %. The floors stop a slide; they do not fix the gap.                                                                                                     |
| 🟡  | Nightly full-stack run on a schedule                     | Runs at 02:00 UTC against the published backend image; the first scheduled run passed all four shards and went red on 16 Firebase-dependent scenarios, because the nightly's backend service has no emulator beside it the way the backend's own tier does |
| ✅  | Report aggregation and a flaky list                      | Allure 3 with history on Pages, plus a dashboard listing every test that failed or flaked in the last ten runs. Quarantine remains a policy question, not a tooling one. |
| ✅  | Lighthouse CI and web-vitals budgets                     | `lighthouserc.json` and `budget.json` on every push; the scores are the badge above                                                                                      |
| ✅  | Secret scanning, push protection, CodeQL                 | Enabled 2026-09-09 after a credential was found in the backend's test corpus; dependency review fails a pull request that adds a high-severity advisory                  |
| ✅  | Schemathesis against the running backend                 | Property-based fuzzing of the running provider, in the backend repository where it lives. It found the gap on its first run: every secured operation answered 401 while the document declared none — a contract defect, since this repository's client is generated from that document |
| ✅  | Visual tiers in CI                                       | One rasteriser: the pinned Playwright image, on the dev box and the runner alike                                                                                         |
| ✅  | OWASP Top 10 in the pipeline                             | `security.yml`: Semgrep over the OWASP/secrets/TypeScript rule sets, Checkov on the manifests and workflows, Trivy for CVEs and an SBOM, and a ZAP baseline against the live sandbox — the dynamic half, which nothing covered before. All SARIF into code scanning |
| ✅  | SonarQube Cloud quality gate                             | Free for public repositories. Answers what CodeQL does not: whether new code is worse than the code already there, and — the reason it matters here — a coverage *trend* rather than only a floor |
| ⬜  | Colour contrast on small coral text                      | The one failing accessibility audit                                                                                                                                      |

---

## 🧭 The rest of the estate

Three repositories and a running site, and each answers the question the previous one raises.

| If you are wondering                                            | Go here                                                                                                                                                                                                                                                                       |
| :-------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "Is any of this actually running?"                              | **[checkitout.app/technical-survey/engineering](https://checkitout.app/technical-survey/engineering)** — the estate in one screen, the pipelines, the graph drawn from its data, what is under way                                                                            |
| "Is the backend real, or is this a frontend talking to a mock?" | **[checkitout-backend](https://github.com/Check-It-Out-Dev/checkitout-backend)** — where the business rules live, and where the contract above is generated from a server that actually booted. It owns the Cucumber corpus this repository's BDD tier ports.                 |
| "How did one person build and navigate a system this size?"     | **[graph-theory-system-modeling](https://github.com/Check-It-Out-Dev/graph-theory-system-modeling)** — the method: the system modelled as a knowledge graph, plus the retrieval, prompt-evaluation and agentic tooling built on it, and where that evaluation work goes next. |

## 📚 Documentation

Start at **[docs/README.md](docs/README.md)** — it splits the reading by what you are here for:
evaluating the engineering, or taking a piece of it and using it.

| Document                                                                  | What it is                                                                                                    |
| :------------------------------------------------------------------------ | :------------------------------------------------------------------------------------------------------------ |
| [LAYERED-TEST-ARCHITECTURE.md](docs/testing/LAYERED-TEST-ARCHITECTURE.md) | Why the tiers are connected rather than parallel                                                              |
| [BROWSER-QA-METHODOLOGY.md](docs/testing/BROWSER-QA-METHODOLOGY.md)       | The error-class register, the instrument laws, and the run log                                                |
| [SANDBOX-TODO.md](docs/testing/SANDBOX-TODO.md)                           | Nine error classes, their instruments, and what is open by decision                                           |
| [docs/openapi/openapi.json](docs/openapi/openapi.json)                    | The committed contract                                                                                        |
| [docs/testing/measured-counts.json](docs/testing/measured-counts.json)    | Every number on this page, as the runners reported it. G15 fails the build if the page and this file disagree |

## 🔐 Security

No credentials in the repository. The development certificate is generated per clone. The demo build
contains no backend, no accounts and no payment path. An external penetration test was carried out
against the platform; the findings that apply to the frontend were fixed here, two were accepted as
design decisions and two were deferred with a written reason. The full response is documented in the
backend repository.

## 📄 License

MIT — see [LICENSE](LICENSE).
