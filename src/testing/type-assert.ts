/**
 * Compile-time-only assertion utilities for the L0 contract tier
 * (docs/testing/LAYERED-TEST-ARCHITECTURE.md). Zero runtime footprint —
 * a contract file that stops compiling IS the failing test.
 *
 * `Equal` is the invariance trick from type-challenges: two types are
 * equal only if they are mutually assignable in the *invariant* position
 * of a generic function signature — this distinguishes `any`, `unknown`,
 * optionality and readonly, which plain `extends` checks let through.
 */
export type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

/** Usage: `type _ok = Expect<Equal<Actual, Expected>>;` */
export type Expect<T extends true> = T;
