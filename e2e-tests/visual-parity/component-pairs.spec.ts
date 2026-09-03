import { test, expect } from '@playwright/test';
import {
  COMPONENT_PAIRS,
  PERMANENTLY_DIVERGED_IDS,
  filterByVerdict,
  findComponentPair,
  type ComponentPairVerdict,
} from './component-pairs';

/**
 * Self-validation of the Stage 6g component-pair registry.
 *
 * Catches drift inside `component-pairs.ts` (duplicate ids, malformed dates,
 * resolved-but-no-commit, etc.) without coupling to the live phantom/sandbox
 * registries — running this requires no BE, no FE, no browser. Runs under
 * the regular Playwright test runner (matches the rest of `e2e-tests/`).
 *
 * For phantom/sandbox-vs-registry sync checks (slug X exists in registry
 * but no phantom/sandbox fixture renders it, or vice-versa) see the
 * separate audit tool — that one DOES need live FE.
 */
test.describe('Stage 6g component-pair registry · invariants', () => {
  test('no duplicate ids', () => {
    const ids = COMPONENT_PAIRS.map((p) => p.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  test('every entry has a valid verdict', () => {
    const valid: ReadonlySet<ComponentPairVerdict> = new Set([
      'parity',
      'expectedDiverged',
      'pendingStateReset',
      'needsFix',
    ]);
    for (const pair of COMPONENT_PAIRS) {
      expect(valid.has(pair.verdict), `${pair.id} has invalid verdict ${pair.verdict}`).toBe(true);
    }
  });

  test('classifiedAt is ISO date (YYYY-MM-DD)', () => {
    const isoDate = /^\d{4}-\d{2}-\d{2}$/;
    for (const pair of COMPONENT_PAIRS) {
      expect(isoDate.test(pair.classifiedAt), `${pair.id} classifiedAt malformed`).toBe(true);
      if (pair.resolvedAt) {
        expect(isoDate.test(pair.resolvedAt), `${pair.id} resolvedAt malformed`).toBe(true);
      }
    }
  });

  test('classifiedIn references a parity-review markdown', () => {
    for (const pair of COMPONENT_PAIRS) {
      expect(
        pair.classifiedIn.endsWith('.md'),
        `${pair.id} classifiedIn (${pair.classifiedIn}) should reference a .md file`,
      ).toBe(true);
    }
  });

  test('resolvedAt always pairs with resolvedCommit (and vice-versa)', () => {
    for (const pair of COMPONENT_PAIRS) {
      const hasDate = pair.resolvedAt !== undefined;
      const hasCommit = pair.resolvedCommit !== undefined;
      expect(hasDate, `${pair.id} resolvedAt/resolvedCommit must both be set or both unset`).toBe(
        hasCommit,
      );
    }
  });

  test('resolvedCommit is a short SHA (7+ hex chars)', () => {
    const sha = /^[0-9a-f]{7,40}$/;
    for (const pair of COMPONENT_PAIRS) {
      if (pair.resolvedCommit) {
        expect(sha.test(pair.resolvedCommit), `${pair.id} resolvedCommit malformed`).toBe(true);
      }
    }
  });

  test('needsFix / pendingStateReset entries declare a followUp', () => {
    for (const pair of COMPONENT_PAIRS) {
      if (pair.verdict === 'needsFix' || pair.verdict === 'pendingStateReset') {
        expect(
          (pair.followUp ?? '').length > 0,
          `${pair.id} is ${pair.verdict} but missing followUp`,
        ).toBe(true);
      }
    }
  });

  test('phantomId / sandboxId override only when slugs actually differ', () => {
    for (const pair of COMPONENT_PAIRS) {
      if (pair.phantomId !== undefined) {
        expect(pair.phantomId, `${pair.id} declared phantomId === id (redundant)`).not.toBe(
          pair.id,
        );
      }
      if (pair.sandboxId !== undefined) {
        expect(pair.sandboxId, `${pair.id} declared sandboxId === id (redundant)`).not.toBe(
          pair.id,
        );
      }
    }
  });

  test('PERMANENTLY_DIVERGED_IDS only contains registered ids', () => {
    const registered = new Set(COMPONENT_PAIRS.map((p) => p.id));
    for (const id of PERMANENTLY_DIVERGED_IDS) {
      expect(registered.has(id), `${id} is permanently-diverged but not in COMPONENT_PAIRS`).toBe(
        true,
      );
    }
  });

  test('findComponentPair lookups round-trip', () => {
    for (const pair of COMPONENT_PAIRS) {
      expect(findComponentPair(pair.id)?.id).toBe(pair.id);
    }
    expect(findComponentPair('nope-not-registered')).toBeUndefined();
  });

  test('filterByVerdict returns only matching pairs', () => {
    for (const verdict of [
      'parity',
      'expectedDiverged',
      'pendingStateReset',
      'needsFix',
    ] as const) {
      const filtered = filterByVerdict(verdict);
      for (const pair of filtered) {
        expect(pair.verdict).toBe(verdict);
      }
      // Sanity: every COMPONENT_PAIRS entry surfaces in exactly one bucket.
      // Re-asserted via cumulative count below.
    }
    const cumulative =
      filterByVerdict('parity').length +
      filterByVerdict('expectedDiverged').length +
      filterByVerdict('pendingStateReset').length +
      filterByVerdict('needsFix').length;
    expect(cumulative).toBe(COMPONENT_PAIRS.length);
  });
});

test.describe('Stage 6g component-pair registry · post-iter-83 state', () => {
  test('captures all 14 pairs (12 through iter-43 + 2 S3-core list pairs iter-83)', () => {
    expect(COMPONENT_PAIRS.length).toBe(14);
  });

  test('verdict distribution matches iter-83 state (post S3-core list additions)', () => {
    // iter-43 Tier-2 phantoms (#234) added plan-billing-business +
    // two-factor-verify-dialog-default; iter-83 (362f419) classified the two
    // S3-core list pairs (opportunities-list + applied-opportunities-list) as
    // expectedDiverged — all data/UX differences confirmed via live capture:
    //   - 11 expectedDiverged: 7 original + 2 Tier-2 phantoms + 2 S3-core lists
    //   - 3 parity: reset-password, verify-email, legal-clickwrap-default
    //     (all from iter-40 live resweep verification)
    //   - 0 pendingStateReset / 0 needsFix
    expect(filterByVerdict('expectedDiverged').length).toBe(11);
    expect(filterByVerdict('parity').length).toBe(3);
    expect(filterByVerdict('pendingStateReset').length).toBe(0);
    expect(filterByVerdict('needsFix').length).toBe(0);
  });

  test('5 resolved-in-code pairs cite a resolvedCommit', () => {
    // After iter-43: 3 parity + 2 expectedDiverged-with-resolution
    // (#1 cookie-banner via iter-38 helper, #6 sign-out via iter-36
    // phantom slug rename) all carry resolvedAt/resolvedCommit.
    // The 4 editorial-reskin pairs (#2-5) + #10 legal-clickwrap-load-failed
    // + iter-43 Tier-2 additions (#11, #12) don't have resolutions
    // because they never had a needsFix to resolve — always design-
    // intent divergences.
    const resolved = COMPONENT_PAIRS.filter((p) => p.resolvedAt !== undefined);
    expect(resolved.length).toBe(5);
    for (const pair of resolved) {
      expect(pair.resolvedCommit).toBeDefined();
    }
  });
});
