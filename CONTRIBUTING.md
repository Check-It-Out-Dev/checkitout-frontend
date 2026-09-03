# Contributing to checkItOut

Thanks for considering a contribution. This repo is the **frontend** of a
Polish marketplace platform connecting companies with influencers. The
backend lives in a separate repository.

The project ships with strong opinions about quality — they're not
optional barriers, they're the reason adopters trust this template.
Please read this guide before opening a PR.

## Quick start for contributors

```bash
git clone https://github.com/Check-It-Out-Dev/checkitout-frontend
cd checkitout-frontend
# Node ^22.22.3 || ^24.15.0 — `.nvmrc` pins 24.15.0 (Node 23 breaks the
# dev-server; see README → Toolchain notes)
npm ci
# Backend must be running for integration tests:
# see ../checkitout-backend/README.md for BE setup
npm run check:full   # the full gate wall — must be green to commit
```

## The pre-commit gates

Every commit runs the full gate wall (`npm run check:full`) via husky.
**All gates must be green to commit.** The canonical, always-current
G1..G14 table — legacy-UI ban, wrapper discipline, i18n parity, fixture
coverage, baseline freshness, Cucumber citations, BDD-corpus
completeness, component-pair sync, contract coverage, icon subset,
i18n cache-buster, strict typecheck (app + e2e), `ng build` template
check, unit tests — lives in
[README.md → Gates](./README.md#gates-codified). This file
deliberately doesn't duplicate the table; duplicated tables drift.

**If a gate fails, fix the cause — never bypass.** Skipping `build:check`
in particular lets template type errors slip through silently;
`ng serve` keeps the last-good build so the bug looks like "my edits
aren't reaching the browser."

CI enforces the same wall on every PR (`ci-tests.yml`, GitHub-hosted) —
a PR that skipped the local hook still can't merge red.

## Test tiers

| Tier              | Command                    | What it tests                                                    |
| ----------------- | -------------------------- | ---------------------------------------------------------------- |
| **Unit**          | `npm test`                 | Components + services in isolation (jest + jest-preset-angular)  |
| **Sandbox**       | `npm run test:sandbox`     | Component-level visual fixtures (Playwright)                     |
| **Visual**        | `npm run test:visual`      | Byte-stable pixel snapshots on the two chromium device projects  |
| **Visual parity** | `npm run test:parity`      | Legacy ≡ greenfield pixel diff (4 device projects, incl. webkit) |
| **Integration**   | `npm run test:integration` | Live BE round-trip; ports of BE Cucumber scenarios 1:1           |
| **Scenarios**     | `npm run test:scenarios`   | Cucumber-style FE actor scenarios                                |
| **BDD oracle**    | `npm run test:bdd:stack`   | playwright-bdd port of the BE Cucumber corpus vs the live stack  |
| **MSW**           | `npm run test:msw`         | Mocked-service-worker tier                                       |

The **Integration** and **BDD** tiers are the most important to keep
green for new adopters — they are the FE port of the BE Cucumber corpus
and verify the contract end-to-end against a real backend.

## How to propose a change

### Bug fixes

1. **Open an issue first** if the bug isn't already filed. Include
   reproduction steps + observed vs expected behavior.
2. **Reference the issue in your PR** (`Fixes #123`).
3. **Add a regression test** — unit test if it's component logic,
   integration test if it touches the BE contract. Use the existing
   spec files as templates.

### New features

1. **Open an issue first** to discuss scope. Features that don't fit
   the platform's MVP (`COMPANY` / `INFLUENCER` / `ADMIN` actors,
   Polish-marketplace flow) may not be accepted.
2. **Match BE Cucumber 1:1** for integration tests. The integration
   suite is a _port_ of the BE Cucumber corpus, not a separate
   FE-additional-coverage tier — every integration spec cites the
   feature file it ports, and a gate enforces the citation.
3. **Write the i18n keys in both `en.json` and `pl.json`** — G3 blocks
   the commit otherwise.

### Architectural changes

1. **Discuss before coding.** Architectural shifts (auth model,
   state-machine changes, security filter ordering) need a design doc
   before implementation. Open a GitHub Discussion or email
   `norbert_marchewka@checkitout.app`.

## Commit message style

Looking at the git log:

```
feat(opportunities): inline address on create-campaign form (un-fixme T11)
fix(legal): null-safe ConsentProofDtoIn in prepareConsentCookie
test(integration): T15 — port payments-off.feature (3 scenarios)
docs(fe-greenfield): full audit pass — status banners + supersede stale plans
```

Format: `<type>(<scope>): <subject>`

**Types:** `feat`, `fix`, `test`, `docs`, `refactor`, `chore`, `style`.
**Scopes:** the affected feature folder (`opportunities`, `auth`,
`legal`, etc.) or `integration`/`unit` for cross-cutting test work.
**Subject:** present tense, concise. Reference the BE Cucumber scenario
ID (e.g. `T15`, `T16`) when the commit ports one.

The commit body should explain **why**, not just **what**. The diff
shows what; the body explains the intent so future readers (including
yourself in 6 months) understand the motivation.

## Code style

- **No comments that restate what the code does.** Identifier names
  should already say "what." Comments should say "why" — hidden
  constraints, subtle invariants, workarounds for specific bugs.
- **Default to no comments.** Add them only when removing them would
  confuse a future reader.
- **No backwards-compat shims for hypothetical futures.** Three similar
  lines beat a premature abstraction.
- **Don't validate inputs from internal code.** Trust the type system
  and framework guarantees. Validate at system boundaries (user input,
  external APIs).

## Review process

- **One reviewer is sufficient** for non-architectural changes.
- **Maintainer (Norbert) approval required** for changes to:
  - `src/app/core/auth/**` (auth flow)
  - `src/app/core/legal/**` (RODO/consent flow)
  - `e2e-tests/integration/_actor.ts` (test harness)
  - Pre-commit gate scripts under `tools/`
  - This file or `LICENSE` or `SECURITY.md`
- **PR-ready checklist:**
  - [ ] `npm run check:full` passes locally
  - [ ] New integration tests cite the BE Cucumber scenario they port
  - [ ] i18n keys added to both `en.json` and `pl.json`
  - [ ] Commit message follows the format above
  - [ ] PR description explains the why

## Becoming a maintainer

Three substantial PRs merged → maintainer status (commit access). The
goal is to grow the Polish + European contributor base.

## Code of conduct

Be respectful. The full
[Contributor Covenant 2.1](CODE_OF_CONDUCT.md) applies. Report
violations to `norbert_marchewka@checkitout.app`.

## License

By contributing, you agree your contribution is licensed under the
MIT License (see `LICENSE`). You retain copyright on your contribution.
