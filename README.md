<div align="center">

# checkItOut — Frontend

**A production Angular rewrite where the test strategy is the architecture.**

Types are generated from the backend's OpenAPI spec, so a contract change is a compile error before
it is ever a bug. Every tier above that re-proves the same truth at a higher level of integration.

[![License: MIT](https://img.shields.io/badge/License-MIT-1f6feb.svg)](LICENSE)
[![Angular](https://img.shields.io/badge/Angular-22-dd0031.svg)](https://angular.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-6.0-3178c6.svg)](https://www.typescriptlang.org/)
[![Tests](https://img.shields.io/badge/tests-1884-15c213.svg)](#-testing)
[![Coverage](https://img.shields.io/badge/lines_covered-78.1%25-yellow.svg)](#coverage)
[![CI](https://github.com/Check-It-Out-Dev/checkitout-frontend/actions/workflows/ci-tests.yml/badge.svg)](https://github.com/Check-It-Out-Dev/checkitout-frontend/actions/workflows/ci-tests.yml)

<sub>The two count badges are static, measured 2026-09-08, and reproduced by
<code>npm test&nbsp;--&nbsp;--coverage</code>. The CI badge is the workflow's own and is live.</sub>

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

| Pipeline                                                                | Trigger                             | What runs                                                                                                                                                                                                                                                                                                                                                         | Time                                   |
| :---------------------------------------------------------------------- | :---------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------- |
| [`ci-tests.yml`](.github/workflows/ci-tests.yml) ✅                     | every push and pull request to main | The same fifteen gates as the hook, on a GitHub-hosted runner: eleven static gates, two typechecks, `ng build` with strictTemplates, 1181 Jest tests with coverage. **Hermetic** — no backend, no browsers, no Docker — so a fork's pull request never touches self-hosted infrastructure.                                                                        | **147 s**, median of the last six runs |
| [`nightly-full-stack.yml`](.github/workflows/nightly-full-stack.yml) ⬜ | on demand                           | Four shards — BDD, integration ×2, scenarios + sandbox — each with its own PostgreSQL 16, Redis 7 and GreenMail on its own ports; Playwright blob reports merged with `merge-reports` into one HTML report; pass, fail and _flaky_ counted apart. Not on a schedule until the backend image runs in CI: a red cron nobody has seen green is worse than no cron.   | 75 min budget                          |
| [`perf-k6.yml`](.github/workflows/perf-k6.yml) ✅                       | on demand, any base URL             | [`e2e-tests/perf/k6/demo-routes.js`](e2e-tests/perf/k6/demo-routes.js): six public routes, smoke (1 VU) or load (ramp to 10 VUs), thresholds that fail the job — p95 per route, error rate under 1 %, checks over 99 %. Summary JSON kept 30 days. On demand because the demo sits behind Cloudflare; a scheduled run would measure the edge as often as the app. | 30 s – 75 s                            |
| Deploy — [`tools/deploy-demo.mjs`](tools/deploy-demo.mjs) ✅            | `npm run deploy:demo -- --build`    | Demo build, tar over SSH, atomic directory swap with three rollback copies, CDN purge, the served bundle hash verified on both domains past the cache. The two self-hosted deploy workflows ported from the legacy pipeline remain and are the older path.                                                                                                        | ~3 min                                 |

Two tiers stay out of the pull-request run on purpose, and the workflow header says so: the visual
tiers (a Linux runner rasterises different pixels than the machine that captured the baselines) and
the live-stack tiers (they belong in the nightly run). Hosting is Docker Compose and systemd on one
VPS, right-sized for this product; Kubernetes appears below only as the substrate for running tests.

---

## 📋 In progress

Work under way, dated 2026-09, so that nothing on this page reads as finished-and-abandoned. ✅
shipped · 🟡 under way · ⬜ designed, not started.

|     | What                                                     | Detail                                                                                                                                                                                            |
| :-- | :------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| ✅  | Contract pipeline, end to end                            | Spec → codegen → wrappers → compile-time proofs → every tier                                                                                                                                      |
| ✅  | Fifteen-gate wall, local and in CI                       | Identical locally and on pull requests                                                                                                                                                            |
| ✅  | 1181 Jest unit + component tests                         | Coverage measured and gated                                                                                                                                                                       |
| ✅  | 148 BDD scenarios from the backend corpus                | 27 feature files; 26 of 34 backend features ported, 8 waived, gated by G7                                                                                                                         |
| ✅  | 222 live-backend integration tests                       | Each citing the feature it ports                                                                                                                                                                  |
| ✅  | 142 visual snapshots over 144 fixtures + 41 parity diffs | Coverage gated by G4, freshness by G5                                                                                                                                                             |
| ✅  | Experience tier — 82 measurements                        | Nine error classes closed, each swept across all seven journeys                                                                                                                                   |
| ✅  | k6 performance gate                                      | Thresholds on the public routes, local and on demand in CI                                                                                                                                        |
| ✅  | Live demo, fully mocked                                  | [checkitout.app](https://checkitout.app), with the technical survey prerendered and described for link previews                                                                                   |
| 🟡  | Test execution on Kubernetes                             | Playwright and JUnit suites sharded across ephemeral runners (Testkube Test Workflows on GitHub ARC), blob reports merged after the run, `--fail-on-flaky-tests` on main, `--only-changed` on PRs |
| 🟡  | k6 on Kubernetes                                         | The same script as a k6-operator `TestRun`, thresholds as the pass condition of a release                                                                                                         |
| 🟡  | Branch and function coverage                             | 68.0 % and 65.7 %. The floors stop a slide; they do not fix the gap.                                                                                                                              |
| ⬜  | Nightly full-stack run on a schedule                     | Needs the backend image published for CI; the workflow is written and runs by hand                                                                                                                |
| ⬜  | Report aggregation and a flaky policy                    | Allure Report first, ReportPortal when history matters: run history, a quarantine lane readmitted at 99 % pass, error clustering                                                                  |
| ⬜  | Lighthouse CI and web-vitals budgets                     | The vitals above are one lab run; a `budget.json` on every pull request — warn first, error at p90 — is the real version                                                                          |
| ⬜  | Schemathesis against the running backend                 | The one gap in the contract chain                                                                                                                                                                 |
| ⬜  | Visual tiers in CI                                       | Needs a runner whose rasterisation matches the captured baselines                                                                                                                                 |
| ⬜  | Colour contrast on small coral text                      | The one failing accessibility audit                                                                                                                                                               |

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
