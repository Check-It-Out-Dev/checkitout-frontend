/**
 * Stage 5b trace-equivalence module — barrel export.
 *
 * Flow specs in `flows/` import from this module. Internals in
 * canonicalize.ts / diff.ts / recorder.ts / types.ts.
 */

export {
  canonicalize,
  canonicalizeBody,
  canonicalizePath,
  canonicalizeTrace,
} from './canonicalize';
export { diff, renderDiffMarkdown } from './diff';
export { TraceRecorder } from './recorder';
export {
  BOOT_TIME_LEGACY_ONLY,
  BOOT_TIME_GREENFIELD_ONLY,
  FIXTURE_PATHS_TO_IGNORE,
} from './expected-drift';
export type {
  CanonicalEntry,
  CanonicalTrace,
  DiffMode,
  DiffOptions,
  ExpectedCall,
  HttpMethod,
  LatencyDelta,
  Trace,
  TraceDiff,
  TraceDiffChanged,
  TraceEntry,
  TraceFieldDiff,
  TraceReorder,
} from './types';
