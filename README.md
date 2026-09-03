# checkItOut FE — greenfield

MIT · Angular 22 · TypeScript 6.0 · Material + Tailwind · Jest + Playwright

The new frontend for [checkItOut](https://checkitout.app), an influencer-marketing
platform. This is the rewrite repo: born from zero on Angular 17 + Material
(no Fuse template, no Firebase Web SDK), migrated in-place to Angular 22.
Auth proxies through the BE.

The companion BE (Spring Boot 3.4.5, Java 21) lives in the backend repository,
cloned next to this one. OpenAPI-driven: every DTO is generated from the BE
spec (committed here at `docs/openapi/openapi.json`); no hand-written mirror
types.

## Just want to look at it?

The demo build is hosted live at **<https://checkitout.app>** — FE-only
sandboxes, guided journeys and interactive showcases, every `/api` call
mocked in the browser. Or run it yourself, two ways, without touching a
single credential:

**The whole stack, one command** — from the backend repository:

```bash
node tools/dev-lite.mjs
```

Brings up PostgreSQL, Redis, the backend on its credential-less `dev-lite`
profile and this frontend, with a seeded world and demo accounts to sign in as.
Details: the backend's `docs/DEV-LITE.md`.

**Frontend only, no backend at all** — the demo build serves every `/api` call
from in-memory fixtures (the same typed builders the test tiers use), so it can
be hosted as plain static files:

```bash
npm run build:demo
npx http-server dist/check-it-out-fe-greenfield/browser   # or nginx, or any static host
```

Nothing leaves the browser: no backend, no network calls, no accounts, no
payments. Behind nginx, point `try_files` at `index.csr.html` for deep links.

## Quick start (development)

Prereqs: **Node `^22.22.3 || ^24.15.0`** (the Angular 22 dev-server calls
`tls.getCACertificates`, absent from Node 23 — see Toolchain notes), **npm 10+**,
and the BE running on `https://localhost:8080`. The dev-server proxy targets
HTTPS, so start the BE with the `ssl` profile — `dev-lite,ssl` for the
credential-less simulator, `e2e,dev,ssl` for the test-suite stack (`e2e`
registers the `mock-session` endpoint the E2E tiers authenticate with).

```bash
npm ci
npx playwright install chromium webkit   # one-time, ~300 MB; needed for e2e tiers
npm run start                            # ng serve on https://localhost:4201
```

The dev-server serves HTTPS from `server.key` / `server.crt`, which are not
committed — `npm start` generates a fresh self-signed pair for this clone first
(`npm run dev-cert` does it on its own). Your browser will ask you to accept it
once. Nothing about it is secret; it is regenerated rather than shipped because
a private key in a public repository looks like a leak whether or not it is one.

For the full multi-process stack (BE on :8080, legacy FE on :4200, greenfield FE on :4201),
use pm2:

```bash
npm run stack:up       # start BE + legacy FE + greenfield FE under pm2
npm run health         # PowerShell health check across all 3
npm run stack:down     # tear down
```

## Test tiers

| Suite            | Run                                     | What it does                                                   |
| ---------------- | --------------------------------------- | -------------------------------------------------------------- |
| Unit             | `npm test`                              | Jest, ~12s, 967 tests / 120 suites                             |
| Sandbox routes   | `npx playwright test e2e-tests/sandbox` | Per-component sandbox routes (functional)                      |
| Visual snapshots | `npm run test:visual`                   | Per-component byte-stable PNGs (chromium engines only)         |
| Visual parity    | `npm run test:parity`                   | Legacy vs greenfield diff at 20% threshold (4 device projects) |
| Integration      | `npm run test:integration`              | Live-BE trace-equivalence flows (chromium-desktop)             |
| Scenarios        | `npm run test:scenarios`                | Cucumber-style multi-actor flows                               |
| BDD oracle       | `npm run test:bdd:stack`                | playwright-bdd corpus ported from the BE Cucumber suite        |
| MSW              | `npm run test:msw`                      | Browser-side service worker intercepts                         |

After intentional UI changes: `npm run test:visual:update` to refresh sandbox baselines, or
`node tools/capture-legacy-baseline.mjs --route=<id>` to refresh legacy parity baselines.

For email-gated / auth-gated flows against the real stack (GreenMail inbox,
mock-session actors, the support magic-link matrix), follow the live-stack
runbook: the backend repository's `docs/Tests/E2E-TEST-SUITES-GUIDE.md`
§ _Live-Stack Manual E2E (Chrome + GreenMail)_.

## Gates (codified)

The pre-commit hook (`npm run check:full`) fails fast on any of these:

| #   | Gate                                                                        | Tool                                            |
| --- | --------------------------------------------------------------------------- | ----------------------------------------------- |
| G1  | No legacy-UI (`@fuse/*`) imports anywhere                                   | `tools/check-no-fuse.mjs`                       |
| G2  | No direct `api/api/*` imports outside `core/` (or `as Observable<…>` casts) | `tools/check-api-wrappers.mjs`                  |
| G3  | en/pl i18n key parity                                                       | `tools/check-i18n-parity.mjs`                   |
| G4  | Every sandbox-registry fixture has a baseline                               | `tools/check-visual-fixture-coverage.mjs`       |
| G5  | Visual baselines fresh vs component sources                                 | `tools/check-visual-baseline-freshness.mjs`     |
| G6  | Integration specs cite their Cucumber oracle                                | `tools/check-integration-cucumber-citation.mjs` |
| G7  | BDD corpus completeness vs BE feature files                                 | `tools/check-bdd-corpus-completeness.mjs`       |
| G8  | Sandbox/phantom component pairs in sync                                     | `tools/check-component-pair-sync.mjs`           |
| G9  | Contract coverage (generated client ↔ wrappers)                             | `tools/check-contract-coverage.mjs`             |
| G10 | Material icon subset up to date                                             | `tools/subset-material-icons.mjs --check`       |
| G11 | i18n JSON cache-buster fresh vs translation content                         | `tools/i18n-cache-buster.mjs --check`           |
| G12 | Strict TypeScript (app + e2e configs)                                       | `tsc --noEmit`                                  |
| G13 | Angular template type-checker                                               | `ng build` (runs `strictTemplates`)             |
| G14 | Unit tests                                                                  | `jest --bail`                                   |

`tsc --noEmit` does **not** run Angular's template type-checker — that's why
G13 exists as a separate `ng build`. Skipping it lets template type errors
slip through silently (`ng serve` keeps serving the last-good build).

CI runs the same wall on every PR and mainline push
([`.github/workflows/ci-tests.yml`](./.github/workflows/ci-tests.yml),
GitHub-hosted so fork PRs stay sandboxed). Two gates degrade gracefully in
a single-repo checkout: G7 self-skips without the BE sibling, and G5's
mtime tag is reset because a fresh checkout has no real edit times.

## Architecture

```
src/app/
  api/           generated OpenAPI client (git-TRACKED; regen via npm run openapi:gen)
  core/          BE access wrappers, interceptors, services, theme, shell-status
    api-frozen/  hand-frozen types+clients for spec-hidden surface (payments, 2FA)
  feature/       routes (auth, profile, plan-billing, opportunities, ...)
  layout/        sidenav + toolbar + auth layout
  sandbox/       per-component dev routes for visual tier
  shared/        cross-cutting components (cookie banner, ...)
```

**Wrapper discipline (G2):** feature/layout/shared code accesses the BE only
through `src/app/core/<domain>/<domain>.service.ts`. The generated client uses
overload signatures with `Observable<any>` as the implementation type;
calling them directly leaks `<any>` into call sites.

**Generated client is tracked, not ignored.** `src/app/api/` is committed so
contract changes show up as reviewable diffs and a fresh clone builds without
Docker. `npm run openapi:gen` wipes the directory and regenerates it —
never hand-edit anything under `src/app/api/`. The BE hides some endpoints
from the public spec (payments, 2FA internals); their types+clients are
hand-frozen under `src/app/core/api-frozen/` and updated deliberately.

**Auth model:** cookies-only end to end. The OpenAPI client is configured with
`withCredentials: true`; the BE sets HttpOnly + HMAC-signed `session` /
`session_sig` cookies (full or partial for ADMIN-pre-2FA), plus
`FirebaseIdToken` and consent cookies as needed. The FE never reads or stores
tokens — `localStorage` / `sessionStorage` / `Authorization: Bearer` are
unused for auth. `errorInterceptor` silently calls `/auth/refresh-session` on
401 (admin role-change / ban / unban) and retries the original request once;
on refresh failure it clears `SessionStateService` and routes to
`/auth/sign-in`.

## Contract round-trip (OpenAPI)

`npm run openapi:cycle` runs the whole contract loop in one command
(`tools/openapi-cycle.mjs`):

1. **BE spec regen** — `mvnw verify -Pintegration` scoped to
   `OpenApiSpecGeneratorTest` (Docker + corretto-21) → writes
   the backend repository's `docs/openapi/openapi.json`
2. **FE codegen** — `npm run openapi:gen` (wipe + regenerate `src/app/api/`)
3. **Typecheck** — every contract break surfaces as a compile error
4. **bddgen** — recompiles the Cucumber-oracle steps against the new models

Variants: `openapi:cycle:fast` / `--skip-be` (spec already fresh, ~seconds),
`--no-bdd` (stop after typecheck). Commit the results per the 3-commit repair
flow: BE fix → spec diff → FE codegen.

## Toolchain notes (Angular 22 migration, 2026-09-02)

Migrated 17→18→19→20→21→22 via sequential `ng update` majors in one arc.
Pins that matter — aligned as a set, do not bump individually:

| Piece                                          | Version                            | Why it's pinned this way                                                                           |
| ---------------------------------------------- | ---------------------------------- | -------------------------------------------------------------------------------------------------- |
| `@angular/*`                                   | ^22.0.6                            | latest stable; `ng update` schematics applied per major                                            |
| `typescript`                                   | ~6.0.3                             | Angular 22's supported range                                                                       |
| `jest` + `jest-cli` + `jest-environment-jsdom` | ^30.x                              | must move as one family — mixed 29/30 fails at runtime (`clearMocksOnScope is not a function`)     |
| `jest-preset-angular`                          | ^16                                | the jest-30-compatible line                                                                        |
| `@angular-builders/jest`                       | ^22                                | peer-pinned to the Angular major; add it to every `ng update` run                                  |
| `@types/jest`                                  | ^30                                | matches the jest family                                                                            |
| Node engines                                   | `^22.22.3 \|\| ^24.15.0 \|\| >=26` | the v22 dev-server calls `tls.getCACertificates()` — missing on Node 23 (odd releases are non-LTS) |

**jsdom 30 gotcha:** `window.location` is non-configurable AND non-writable —
property-level mocking (`Object.defineProperty`, spyOn assign) is unreliable
across suites. Pattern used instead: resolve the window through DI
(`inject(DOCUMENT).defaultView`) and stub the injected fake in tests — see
`src/app/core/auth/location-redirect.service.ts` + its spec. Any future code
touching `window.location` must go through that service.

## Documentation

In this repo:

- [`PARITY.md`](./PARITY.md) — journey-bucketed story map of the legacy→greenfield port: what shipped, the sanctioned divergences, and the migration log
- [`docs/testing/LAYERED-TEST-ARCHITECTURE.md`](./docs/testing/LAYERED-TEST-ARCHITECTURE.md) — how the FE tiers share one fixture source
- [`CONTRIBUTING.md`](./CONTRIBUTING.md) — gates, test tiers, commit style, review process
- [`SECURITY.md`](./SECURITY.md) — vulnerability reporting + disclosure policy

Feature + test-infrastructure docs in the BE repo:

- `docs/features/SUPPORT-TICKET-MAGIC-LINK.md` — signed one-click ticket access
- `docs/Tests/E2E-TEST-SUITES-GUIDE.md` — BE test pyramid + live-stack manual E2E runbook

## Sister repositories

The platform is published as three repos that reference each other, plus
the live page:

- **Live demo** — <https://checkitout.app> (this repo's demo build, static)
- **Backend** — [`checkitout-backend`](https://github.com/Check-It-Out-Dev/checkitout-backend): Spring Boot 3.4.5 / Java 21, the OpenAPI source of truth
- **Graph-theory research** — [`graph-theory-system-modeling`](https://github.com/Check-It-Out-Dev/graph-theory-system-modeling): the mathematics that models this platform, with [CodeMap](https://github.com/Check-It-Out-Dev/graph-theory-system-modeling/tree/main/applications/CodeMap) as its `applications/` layer
- **CodeMap for Windows** — one 22 MB installer, model auto-fetched:
  [`codemap-setup-1.2.0.exe`](https://storage.waw.cloud.ovh.net/v1/AUTH_62ce8c0b4d874faa89fb3e086832f1a6/downloads/codemap/codemap-setup-1.2.0.exe)

The rewrite's internal planning corpus (stage plans, parity checklists,
loop methodology) lives on a private planning branch by design and is
not part of the published history.

## Security

The platform was independently penetration-tested (GrayBox, OWASP
methodology) by WRO4digITal (EDIH Wrocław) and rated **above average** —
11 findings (0 Critical / 1 High / 5 Medium / 3 Low / 2 Info), every one
now fixed, consciously accepted as a design decision, or scheduled on a
documented plan. The full audit trail lives in the backend repo at
the backend repository's `docs/security/pentest-remediation.md`.

Found something we missed? Responsible disclosure: **security@check-it-out.pl**.

## License

MIT. See [LICENSE](./LICENSE).
