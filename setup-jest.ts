import { setupZoneTestEnv } from 'jest-preset-angular/setup-env/zone';

setupZoneTestEnv();

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  }),
});

Object.defineProperty(window, 'CSS', { value: null });

// Per-test coverage probes for the subsumption analysis. Silent unless jest runs with --coverage;
// see tools/subsume/jest-probes.ts.
import './tools/subsume/jest-probes';

// A test the subsumption analysis demoted is written `subsumed(it)('name', …)`: it leaves the
// pull-request tier and still runs in the nightly (SUITE=nightly). Demote, never delete; the
// marker comment above it names what carries it. See tools/subsume/README.md.
(globalThis as { subsumed?: unknown }).subsumed = <T extends { skip: unknown }>(fn: T): T =>
  process.env['SUITE'] === 'nightly' ? fn : (fn.skip as T);
