# Layered Test Architecture (owner directive 2026-09-02)

One sentence: **every test tier consumes the same OpenAPI-generated types
and, where it needs data, the same typed builders — so a contract change
detonates at compile time in L0 and each runtime tier above it re-proves
the same truth at a higher level of integration.**

Confidence compounds because the layers are _connected_, not parallel:
L0 pins the types, L1 pins the wire protocol, L2 pins component logic
against L1's interfaces, L3 re-runs the business scenarios against the
live BE, L4 freezes what the user actually sees. A regression cannot
pass a lower layer and hide in a higher one, because the higher layer is
built from the lower layer's artifacts.

## The layers

| #   | Layer                       | Location                                                                                          | Proves                                                                                                                                         | Feedback speed                  |
| --- | --------------------------- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| L0  | **Contract** (compile time) | `src/app/api/**` (generated, never edited) + `src/testing/contract/*.contract.ts` type assertions | core/\*\* wrapper signatures are EXACTLY the generated models — no `any` leaks, no widened params, no drifted returns                          | `npm run typecheck` (0 runtime) |
| L1  | **Service**                 | `src/app/core/**/*.spec.ts` (jest + HttpTestingController)                                        | each wrapper serializes the right URL/verb/body and types the response — services read as executable API documentation                         | ms                              |
| L2  | **Component logic**         | `src/app/**/*.component.spec.ts` (jest, core services mocked with builder data)                   | UI logic against the service interfaces                                                                                                        | ms                              |
| L3  | **BDD oracle**              | `e2e-tests/bdd/` (playwright-bdd, live BE)                                                        | the BE Cucumber corpus, re-proven through the FE-visible surface; steps are thin orchestration over the typed `e2e-tests/_framework/api` layer | minutes, needs stack            |
| L4  | **Visual**                  | `e2e-tests/visual/` + `visual-parity/` (119 sandbox fixtures × 2 projects, 14 phantom pairs)      | pixels; fixtures render builder-shaped data                                                                                                    | minutes                         |

Existing tiers unchanged by this design: `e2e-tests/integration/` (50
specs, each citing its BE feature — gate G-cucumber-citation) and
`e2e-tests/scenarios/`.

## The two new pieces

### 1. `src/testing/` — builders + contract assertions (the DRY keystone)

```
src/testing/
  type-assert.ts            // Expect<Equal<A,B>> utilities (compile-time only)
  contract/
    opportunities.contract.ts   // binds OpportunityApiService methods ↔ generated DTOs
    …one file per core domain
  builders/
    index.ts
    opportunity.builder.ts      // buildOpportunity(overrides?): PartnershipOpportunityDtoOut
    …one file per DTO family
```

- A **builder** is `build<X>(overrides?: DeepPartial<X>): X` with strict
  generated-model return types and realistic Polish-market defaults. It
  is the ONLY place test data shapes live. Jest service specs, component
  specs, sandbox fixtures and MSW handlers all import from here.
- A **contract file** contains zero runtime code:

  ```ts
  type _list = Expect<
    Equal<ReturnType<OpportunityApiService['list']>, Observable<PagePartnershipOpportunityDtoOut>>
  >;
  ```

  It fails `tsc` the moment codegen output or a wrapper signature moves.
  This is the "extend in strict mode to check the api type and service
  layer" requirement: strict-mode compilation IS the test.

- Builders get one jest spec asserting they satisfy the strict DTO types
  with no casts (`satisfies` + a smoke construction per builder).

### 2. BDD corpus completion — 24 of 34 BE features still to port

Port order mirrors the BE directory grouping (collaboration → company →
influencer → gdpr → notification → admin → multiuser → edge-cases →
files). Rules per ported feature (unchanged from the S6 pattern already
in `e2e-tests/bdd/`):

- `.feature` mirrors the BE source scenario-for-scenario where
  UI-meaningful; header comment cites the BE path.
- Steps import generated models/enums directly; endpoint mechanics live
  in `e2e-tests/_framework/api/*` (extend that layer first when a
  domain's endpoints are missing — never inline fetch shapes in steps).
- Scenario data goes through `src/testing/builders` where a DTO body is
  needed.
- Compile gate: `npm run typecheck:e2e`. Runtime gate: scenario green
  against the live stack (`npm run stack:up`, self-skips without
  `e2e-tests/.env`).

Workflow fan-out (owner opted in): draft agents produce feature+steps
per BE file in parallel; the main agent reviews, compiles, runs, fixes
and commits each slice. Agents never commit.

## Fixture-migration policy (L4 stays pixel-stable)

Sandbox fixtures migrate to builders **without changing rendered data**:
the current hardcoded literals become the builder overrides (or builder
defaults where they already coincide). A migration that changes any
baseline PNG is wrong by definition — G5 freshness + the snapshot diff
are the enforcement. Migration is mechanical and can trail the other
slices; it is not a blocker for L0-L3.

## Gates

No new gate scripts: L0 rides `typecheck` (contract files are in the app
tsconfig), builders ride jest, BDD rides `typecheck:e2e` + the citation
pattern extended to `e2e-tests/bdd/features/**`. The one addition worth
making once the corpus is complete: extend
`check:integration-cucumber-citation` to also verify every BE feature
file has either an FE port or an explicit waiver entry (parity
completeness, not just citation validity).

## Slices (each = one commit, gates green)

1. ✅ `src/testing/` foundation: type-assert utils + builders for the top
   10 DTO families + contract files for opportunities/auth/profile +
   builder smoke spec.
2. ✅ Contract files for the remaining core domains (pure compile-time) —
   14 `contract/*.contract.ts`, all riding `npm run typecheck`.
3. ✅ Service-spec fill: every `core/**` wrapper has an L1 spec on builders
   — audited iter-128: 26 wrappers, 26 specs, zero gaps.
4. 🔶 `_framework/api` extension + BDD port, grouped by BE directory
   (collaboration first — biggest journey value), ~4-6 features per
   slice, live-verified. **26 of 34 BE features ported**; the remaining 8
   are waived (slice 5) — all BE-internal security/isolation matrices.
5. ✅ Corpus-completeness gate + waiver file — `check:bdd-corpus`
   (`tools/check-bdd-corpus-completeness.mjs`) fails unless every BE
   feature is ported (cited) or waived in `e2e-tests/bdd/CORPUS-WAIVERS.md`;
   also catches stale/double-covered waivers. Wired into `check:full` +
   pre-commit. This is the machine-enforcement that makes the layers
   _connected_: the BE corpus can't grow a feature that silently goes
   uncovered.
6. 🔶 Sandbox fixture builder migration (pixel-stable, trailing).
7. ✅ Visual polish pass — in-browser side-by-side parity sweep
   (iter-93 phantom sweep + iter-123-127 authenticated sweep; sanctioned
   divergences in `PARITY.md`).

## Decision log

- **Autonomy**: owner directive "work on your own" — design executed
  without per-section approval; this document is the reviewable artifact.
- **Why not MSW for L1**: the repo's L1 idiom mocks the GENERATED
  service class per method (jest.Mock) and asserts the wrapper→envelope
  translation (`requestParameters` shape) — synchronous, precise, and
  the generated class is exactly the boundary L0 pins. MSW stays for
  the sandbox/e2e contexts it already serves.
- **Why contract files instead of `tsd`/`expect-type` deps**: two type
  utilities cover the need; zero new dependencies.
- **Why builders in `src/testing` not `e2e-tests/`**: jest (src) and
  playwright (e2e-tests) both import them; `src/testing` is inside the
  app tsconfig so contract files typecheck in the main gate, and
  e2e-tests already imports from `../../src/app/api/model/*` so the
  direction is established.
