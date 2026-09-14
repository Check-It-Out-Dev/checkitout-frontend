/**
 * `subsumed(it)('name', fn)` — a test the subsumption analysis demoted from the pull-request tier.
 * Defined in setup-jest.ts: the real `it` when SUITE=nightly, `it.skip` otherwise. Demote, never
 * delete; see tools/subsume/README.md.
 */
declare function subsumed<T extends { skip: unknown }>(fn: T): T;
