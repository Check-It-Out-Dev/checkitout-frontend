# Documentation

The [README](../README.md) argues the case. This is the reading behind it, for two
different people: someone deciding whether the engineering here is any good, and someone
who wants to take a piece of it and use it.

## If you are evaluating

| Read this                                                                        | To answer                                                                                                                                                                                                                                                                                                             |
| :------------------------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **[testing/LAYERED-TEST-ARCHITECTURE.md](testing/LAYERED-TEST-ARCHITECTURE.md)** | Why the tiers are _connected_ rather than parallel — a contract change detonates at compile time in L0, and every runtime tier above re-proves the same truth at a higher level of integration. Start here; the rest assumes it.                                                                                      |
| **[testing/BROWSER-QA-METHODOLOGY.md](testing/BROWSER-QA-METHODOLOGY.md)**       | The error-class register: nine classes, the instrument that sweeps each across all seven guided tours, and the rule that no class counts as closed until its instrument has been made to fail against a deliberately planted defect. Also the tool laws — each one cost a failed run to learn — and the full run log. |
| **[testing/SANDBOX-TODO.md](testing/SANDBOX-TODO.md)**                           | What is closed, what is open _by decision_ rather than by neglect, and the measurement each decision was made against.                                                                                                                                                                                                |
| **[openapi/openapi.json](openapi/openapi.json)**                                 | The contract itself. Byte-identical to the copy in the [backend repository](https://github.com/Check-It-Out-Dev/checkitout-backend) — `sha256sum` it in both and see.                                                                                                                                                 |

## If you want to use something here

Nothing in this repository is packaged for reuse, and pretending otherwise would waste
your time. These are the parts that transplant with the least effort, roughly in order:

| Part                                 | Where                                                                                     | What you would need to change                                                                                                                                                                                                      |
| :----------------------------------- | :---------------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **The contract pipeline**            | `tools/openapi-cycle.mjs`, `tools/suppress-api-types.mjs`, `tools/check-api-wrappers.mjs` | The spec path and your generator flags. The post-processor fixes three specific `typescript-angular` defects, each documented in its header — check whether your generator version still has them before keeping it.               |
| **Compile-time contract assertions** | `src/testing/contract/*.contract.ts`, `src/testing/type-assert.ts`                        | Nothing structural. `Expect<Equal<A, B>>` is fourteen lines of TypeScript and works in any project with a generated client. This is the highest value-per-line thing here.                                                         |
| **The gate wall**                    | `tools/check-*.mjs`, `.husky/pre-commit`                                                  | Each script is standalone and prints its own fix hint. Take the two or three whose failure mode you actually have; copying all eleven would be cargo cult.                                                                         |
| **The guided-tour instruments**      | `e2e-tests/perf/`                                                                         | These assume the demo build and its scenario registry. The _ideas_ transplant better than the code: sample the DOM per animation frame, measure how long evidence stays readable, and plant the defect before you trust the sweep. |
| **The typed builders**               | `src/testing/builders/`                                                                   | They are shaped to this domain, but the pattern — one builder per aggregate, `merge` for overrides, shared between Jest and Playwright — is the point.                                                                             |

## What you cannot run without bringing your own

The demo build, the 1181 Jest tests and the gate wall run on a clean clone with nothing
installed but npm packages. Everything that talks to a real backend does not, and the
[README explains why](../README.md#-getting-it-running) — in short, this is a commercial
product, no secret is committed, and the live tiers need a Google Cloud Storage bucket, a
VPS, Grafana and Loki, and credentials for Meta, MaxMind, Fakturownia, Stripe and the
Polish public registries.

## Research notes

[`testing/research/`](testing/research/) holds two literature reviews written while
building the filmed tier — prior art in visual QA, and what packaging this as a tool would
involve. They are working notes with their sources attached, not conclusions, and they
record the places where the evidence turned out to be weaker than the claim.
