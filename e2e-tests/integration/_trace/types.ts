/**
 * Stage 5b — live-BE integration tier types.
 *
 * `TraceEntry` = one observed request/response pair.
 * `CanonicalEntry` = the same with volatile data scrubbed.
 * Two flows are equivalent iff their canonical traces are equal.
 *
 * Tier overview: `docs/testing/LAYERED-TEST-ARCHITECTURE.md` (this repo).
 */

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS' | 'HEAD';

/**
 * Raw observation. Captured by the Playwright route() handler in
 * `recorder.ts`. Contains all request + response data we observed,
 * with no scrubbing — preserved for forensic debugging when a diff
 * fires.
 */
export interface TraceEntry {
  readonly method: HttpMethod;
  readonly url: string;
  readonly path: string;
  readonly query: Readonly<Record<string, string>>;
  readonly requestHeaders: Readonly<Record<string, string>>;
  readonly requestBody: unknown;
  readonly responseStatus: number;
  readonly responseHeaders: Readonly<Record<string, string>>;
  readonly responseBody: unknown;
  readonly elapsedMs: number;
  readonly startedAt: number;
}

/**
 * Canonical form. `canonicalize(TraceEntry)` produces this — equivalence
 * is structural equality between two `CanonicalEntry` values.
 *
 * Differences from `TraceEntry`:
 * - `path` has UUID/numeric-id segments replaced with `:id` placeholders
 * - `query` keys sorted, values scrubbed of UUIDs/timestamps
 * - `requestHeaders` filtered to a semantic whitelist
 * - `requestBody` recursively canonicalized (sort keys, scrub volatile fields)
 * - `responseHeaders` filtered to a semantic whitelist
 * - `responseBody` recursively canonicalized
 * - `elapsedMs` dropped (informational only)
 */
export interface CanonicalEntry {
  readonly method: HttpMethod;
  readonly path: string;
  readonly query: Readonly<Record<string, string>>;
  readonly requestHeaders: Readonly<Record<string, string>>;
  readonly requestBody: unknown;
  readonly responseStatus: number;
  readonly responseHeaders: Readonly<Record<string, string>>;
  readonly responseBody: unknown;
}

/** A full captured trace before canonicalization. */
export type Trace = readonly TraceEntry[];

/** A full canonicalized trace ready for diff. */
export type CanonicalTrace = readonly CanonicalEntry[];

/**
 * Result of comparing two canonical traces. `equivalent === true` is the
 * pass condition for an integration spec.
 */
export interface TraceDiff {
  readonly equivalent: boolean;
  /** Calls in `actual` not present in `expected` (greenfield extra),
   *  excluding any matched by `DiffOptions.expectedAdded`. */
  readonly added: readonly CanonicalEntry[];
  /** Calls in `expected` not present in `actual` (greenfield missing),
   *  excluding any matched by `DiffOptions.expectedRemoved`. */
  readonly removed: readonly CanonicalEntry[];
  /** Same path+method but different shape. */
  readonly changed: readonly TraceDiffChanged[];
  /** Index swaps in ordered mode (same multiset, different order). */
  readonly reordered: readonly TraceReorder[];
  /** Performance deltas — informational, never blocks equivalence. */
  readonly latencyDeltas: readonly LatencyDelta[];
  /** Calls matched by `DiffOptions.expectedRemoved` — surfaced for the
   *  audit trail, but did not contribute to the equivalence verdict. */
  readonly expectedDriftRemoved: readonly CanonicalEntry[];
  /** Calls matched by `DiffOptions.expectedAdded` — surfaced for the
   *  audit trail, but did not contribute to the equivalence verdict. */
  readonly expectedDriftAdded: readonly CanonicalEntry[];
  /** Changed calls matched by `DiffOptions.expectedChanged` — same shape
   *  drift, but documented as intentional. Surfaced for the audit trail. */
  readonly expectedDriftChanged: readonly TraceDiffChanged[];
}

export interface TraceDiffChanged {
  readonly index: number;
  readonly path: string;
  readonly method: HttpMethod;
  readonly differences: readonly TraceFieldDiff[];
}

export interface TraceFieldDiff {
  readonly field:
    | 'requestHeaders'
    | 'requestBody'
    | 'responseStatus'
    | 'responseHeaders'
    | 'responseBody'
    | 'query';
  readonly expected: unknown;
  readonly actual: unknown;
}

export interface TraceReorder {
  readonly expectedIndex: number;
  readonly actualIndex: number;
  readonly path: string;
  readonly method: HttpMethod;
}

export interface LatencyDelta {
  readonly path: string;
  readonly method: HttpMethod;
  readonly expectedMs: number;
  readonly actualMs: number;
  readonly factor: number;
}

/** Comparison mode. Default is `ordered`; `set` is the relaxed form. */
export type DiffMode = 'ordered' | 'set';

/** Identifies a call by canonical method + path, used in expected-drift lists. */
export interface ExpectedCall {
  readonly method: HttpMethod;
  readonly path: string;
}

export interface DiffOptions {
  readonly mode?: DiffMode;
  /** If a request matches one of these paths, skip it from the comparison
   *  (e.g. `/api/test/auth/mock-session` is a fixture, not part of the
   *  user flow being compared). Path is the post-canonicalization form. */
  readonly ignorePaths?: readonly string[];
  /** Calls expected to appear in `expected` (legacy) but NOT `actual`
   *  (greenfield). Documented intentional drift — does not fail the diff,
   *  but UNEXPECTED removed calls (anything not in this list) still does. */
  readonly expectedRemoved?: readonly ExpectedCall[];
  /** Calls expected to appear in `actual` but NOT `expected`. Documented
   *  intentional additions (greenfield does something legacy didn't). */
  readonly expectedAdded?: readonly ExpectedCall[];
  /** Calls expected to differ in shape between expected and actual on the
   *  same path+method. Use sparingly — most shape diffs are real bugs.
   *  Each entry must be paired with a written triage doc explaining the
   *  architectural rationale. Matched entries move from `changed` to
   *  `expectedDriftChanged` so they're surfaced in the audit trail but
   *  don't fail the equivalence verdict. */
  readonly expectedChanged?: readonly ExpectedCall[];
}
