# ADR — the transition table is the source; the enum, the diagram and the counts are generated from it

_2026-09-12. Status: accepted (design); execution is the subscription slice of the invariant arc._

## Context

The subscription lifecycle exists in three places that nothing compares.
`docs/StripeGateway/REQUIREMENTS.md` §11 and the Neo4j `subscription` namespace both say 10 states
and 56 transitions. `SubscriptionStatus.java` has 9 constants and no transition data; the documented
`ACCOUNT_CREATED` is absent. `SubscriptionService.java` performs 16 `setStatus` writes across 16
methods of 948 lines, each guarded by an ad-hoc `if`/`throw`.

Nobody wrote three models deliberately: one was designed, one implemented, one accreted. The
disagreement is invisible because no check reads more than one of them.

There is a second cost that decided the priority. PIT excludes this domain, and the exclusion is
documented as deliberate: the tests are Testcontainers integration tests, so mutants would report
`NO_COVERAGE` and the report would say nothing about the tests. The highest-stakes logic in the
product is the one place mutation testing cannot reach, _because_ the logic is entangled with the
database.

## Options

1. **Neo4j as the source.** The graph already holds states, transitions and rules; generate the enum
   and a diagram from it. The model is rich and queryable, and it is where the design was done.
2. **A table in Java as the source.** A `SubscriptionTransition(from, event, to)` record and an
   immutable table beside the enum; the graph and the diagram are generated from it.
3. **Prose as the source, checked by tests.** Keep the requirement document canonical and write tests
   asserting the code matches it.

## Decision

Option 2. The transition table in the repository is the source; the enum delegates to it, the
diagram is rendered from it, and the published counts are derived from it.

Reasons, in the order they mattered:

- **The compiler is the cheapest checker available, and it only reads the repository.** A
  `default`-less exhaustive switch over the enum makes a tenth constant a compile error. Nothing in
  Neo4j or in prose can produce that.
- **Extraction must be decidable.** A table is data — a syntactic property, exactly extractable.
  Rice's theorem is why option 3 can never be finished: recovering a state machine from branching
  code is a semantic property, approximable at best.
- **Purity unblocks three tiers at once.** A table plus a pure transition function needs no Spring,
  no database and no containers, so it becomes unit-testable, mutable by PIT, and checkable by
  random command sequences against a reference model. That directly removes the documented reason
  for the PIT exclusion.
- **The graph stays valuable in its own role.** It is where design, discussion and cross-subsystem
  queries live. It is a projection target and a review surface, not the build's source of truth: the
  build must not depend on a database being up and correct.

## Consequences

- `SubscriptionStatus` gains `canTransitionTo`, `getPossibleTransitions` and `isTerminal`, in the
  shape this codebase already uses at `OpportunityStatus.java:195` and `ContentApprovalStatus.java:29`.
  A new pattern is not invented for this.
- All 16 writes collapse into one `applyTransition`, and an ArchUnit rule forbids `setStatus`
  anywhere else. The rule is the thing that keeps the table canonical once the refactor is over.
- `tools/ci/render-state-machine.mjs` emits `docs/subscription/state-machine.mmd` from the table, and
  `git diff --exit-code` on that file makes the diagram an invariant: the picture cannot drift from
  the code without failing a build.
- The README's state and transition counts join `measure-counts.mjs`, so they are re-derived rather
  than typed — the failure documented in `GOVERNING-MACHINE-WRITTEN-CHANGE.md` §10.
- `ACCOUNT_CREATED` is resolved rather than left ambiguous: either it becomes a constant or it leaves
  the requirement document, in the same commit, with the reason recorded.
- One-way door, acknowledged: the table becomes the place every future transition is added. A
  transition added anywhere else fails ArchUnit, which is the intent, but it does mean the table must
  stay easy to read — hence a record with three fields and nothing else.

## Rejected

**Neo4j as the source** (option 1): it would make the build depend on a running database, and the
graph is maintained by a different loop than the code. That is precisely the two-sources-of-truth
arrangement this ADR exists to end. **Prose as the source** (option 3): the check would have to
recover behaviour from branches, which is undecidable in general and unreliable in practice; a test
asserting "the code matches the document" is a test of a summary, not of the system.
