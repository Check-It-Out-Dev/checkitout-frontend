# ADR — a test may leave the pull-request tier only when the tests that remain provably carry it: coverage necessary, mutant kills sufficient, a person merges

_2026-09-14. Status: accepted (design); the Jest instrument is shipped, the rest is being built.
Replaces the open problem in `GOVERNING-MACHINE-WRITTEN-CHANGE.md` §14._

## Context

§14 of the design of record asked which tests may be deleted once the suite, too, is
machine-written, and named the measurable that looked most promising: a test whose removal changes
no mutation outcome kills nothing its neighbours do not already kill. The suites stand at 9,101
backend test methods and 1,206 Jest tests, both published and gated, both grown by agents that
write the test and the code in one pass. Nothing in either repository can say whether the eleventh
assertion on a method adds a fact or restates ten others.

Most of the instruments already run: PIT and Stryker at night with floors (§5), per-test wall time
in every report, a ten-run flaky window. What was missing was per-test coverage — which statements,
functions and branches _this_ test moved — and a rule that turns the three matrices into a decision
a machine can make and a person can check.

The rule matters more than the tool. The agent that would propose the deletion is the same kind of
agent that wrote the test; if the criterion were its judgement, the oracle problem of §1 would
simply move one level up.

## Options

1. **Coverage alone.** Cluster tests whose coverage vectors are identical; keep one per cluster.
   Cheap, deterministic, and wrong in the one way that matters: two tests can execute the same lines
   and assert different things. Coverage sees the execution, not the oracle.
2. **Mutation alone** — §14's candidate. A test is redundant if removing it changes no mutation
   outcome. Sound where mutation reaches, and it reaches deliberately little here: four backend
   packages and five frontend areas. Everything outside that scope would be undecidable, and PIT's
   full matrix over the whole backend runs for hours.
3. **Both, as necessary and sufficient conditions, and demotion instead of deletion.** A test is
   _subsumed_ when (a) every probe it covers is covered by the tests that remain, (b) every mutant
   it kills is killed by the tests that remain, and (c) it is not the sole killer of any mutant once
   the flaky window is applied. Coverage is checked everywhere; kills are checked where mutation
   reaches; where mutation does not reach, the test is at most a suspect and is never acted on. A
   subsumed test leaves the pull-request tier and keeps running at night.

## Decision

Option 3, with four invariants a machine checks on every pull request and one it checks on the
reviewer:

|     | Invariant                                                                                                                               | Checked from                                                     |
| --- | --------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| I1  | For every file, class and method the pull request did not change, line and branch coverage are not lower than on `main`                 | the nightly's cached probe matrix and the pull request's own     |
| I2  | Every mutant that `main` killed, in code the pull request did not change, is still killed by a test that stays in the pull-request tier | the cached kill matrix                                           |
| I3  | The suite is green                                                                                                                      | the tier itself                                                  |
| I4  | Every published number moves in the same commit as the estate it describes                                                              | `check-published-numbers.mjs` (G15)                              |
| I5  | Every number in the reviewer's comment equals the gate's report                                                                         | a diff between the comment, the pull-request body and the report |

Three actors, one decision each. An **agent** proposes and applies the demotions: it edits test
annotations, never production code, and never touches a suspect. The **gate** decides whether the
invariants hold, from artefacts, with no model in the loop. A second **agent** writes the review —
what changed, drawn as a diagram from the same artefacts, every number quoted from the gate. A
**person** merges. No agent approves, and nothing is deleted.

Reasons, in the order they mattered:

- **The instrument was checked against itself before it was trusted.** The per-test hook records,
  for each spec file, both the per-test increments and the counters that ended above zero, and
  `check-probes.mjs` proves the union of the first equals the second — 140 of 140 spec files, 1,241
  tests, on the first full run (2026-09-14). istanbul's own summary was tried as the reference first
  and rejected: it is source-mapped back to TypeScript and counts a different set of statements than
  the runtime counters, so the two can never agree count for count.
  `SUBSUME_PROBES=1 npx jest --coverage && node tools/subsume/merge-probes.mjs && node tools/subsume/check-probes.mjs`
  reproduces it.
- **Demotion keeps every published claim true.** "9,101 test methods" and "`@Disabled` appears zero
  times" are gated facts about the repositories; a deleted test falsifies the first, a disabled one
  the second. A tag — `@Tag("subsumed")`, or a `subsumed()` wrapper in Jest — removes a test from the
  pull-request tier only. The nightly still runs everything, and the mutation score is still
  measured on the whole suite, which is what makes I2 checkable at all.
- **The invariant is on unchanged code, so it applies to every pull request, not only to this
  kind.** A change that adds code is judged by the existing coverage floors; a change that touches
  nothing but tests must leave the coverage of every method exactly where it was. That is the §8
  rule — a machine may lower a count, only a person may loosen a threshold — applied to the test
  population.
- **The reviewer is bound by I5 because the alternative is a comment that looks like assurance.** A
  reviewer that recomputes is a second oracle of unknown quality; a reviewer that quotes is a
  rendering. The diff between its numbers and the gate's is the cheapest attestation in §9: seconds
  if it read the report, a red job if it invented one.

## Consequences

- `tools/subsume/` is the home: the Jest hook (shipped), the JaCoCo listener, the PIT matrix
  parser, the core, the proposer, the invariants gate, the diagram and the two agent prompts. Its
  README carries the artefact and report contracts, so the parts can be built in any order and by
  any hand — including a different agent than the one that designed them.
- `stryker.conf.json` runs with `disableBail: true` from this commit: `killedBy` names every test
  that kills a mutant rather than the first. The job gets slower; the matrix exists. A report from
  a run that bailed is refused by the loader (it records `config.disableBail`; PIT's `kills.json`
  records `fullMatrix`): with one killer per mutant, kill-subsumption is vacuous and a proposal
  built on it is wrong from its first line.
- The pull-request tier gains an invariants job in both repositories, fed by the nightly's cache on
  Pages; the nightly gains the matrices. That is §5's "report on the diff, not at night" applied to
  the one metric an agent can most easily game.
- Seeded violations (§13) become concrete: six deliberate breakages — a lost probe, a lost kill, a
  flaky sole killer, a permuted input, an invented number in a pull-request body, a test with a
  unique probe proposed for demotion — each with the check that must catch it, run before the gate
  is believed.
- The first two reductions are merged by a person after reading the reviewer's comment. That is not
  ceremony; it is the only step that makes the word _governed_ true on a single-maintainer
  repository (§9).
- Parameterised tests are one unit for now. Per-invocation subsumption is possible — the listener
  sees each invocation — and is deferred until the method-level result is measured, because it
  multiplies the edit surface the agent touches.

## Rejected

**Deleting subsumed tests.** The same reduction with a worse property: the published counts change,
the nightly loses the evidence I2 needs, and "the agent deleted tests" is a sentence nobody wants to
defend at a review. **Coverage alone** (option 1), for the reason above — it cannot see assertions.
**Letting a model decide redundancy.** The proposer may choose which confirmed candidate to apply
first and how to name the representative it keeps; it may not decide that a test is redundant,
because that would reintroduce the dependence between the judge and the judged that this whole
document exists to remove. **A second monitoring surface.** The numbers go to the quality dashboard
on Pages through the existing `quality-metrics.mjs`; a second path is a second thing to keep honest.
