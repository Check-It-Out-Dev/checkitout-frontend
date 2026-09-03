import { existsSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { ACTORS } from '../_framework/actor';
import { GREENFIELD_URL, authenticate } from '../_framework/auth';
import { PARITY_ROUTES } from './parity-manifest';

/**
 * F0b — Visual-parity diff spec.
 *
 * For each route in the manifest, drives the *greenfield* FE through the
 * same actor/path the legacy capture used and diffs the screenshot against
 * the legacy baseline at `parity.spec.ts-snapshots/<id>-<project>.png`.
 *
 * This is the "is the rewrite visually equivalent" gate, separate from the
 * byte-stable per-component snapshots in `e2e-tests/visual/`. Threshold is
 * deliberately looser (20%) — Material vs Fuse render text + spacing
 * slightly differently and we want the gate to fire on *real* divergence
 * (missing element, wrong layout direction, copy change), not font-rendering
 * jitter.
 *
 * Skips routes whose legacy baseline doesn't exist yet — run
 * `node tools/capture-legacy-baseline.mjs` first.
 *
 * GREENFIELD_URL defaults to PW_BASE_URL or http://localhost:4201.
 * Auth recipe (mock-session + addInitScript) lives in `_framework/auth.ts`.
 */

test.describe('Visual parity · legacy vs greenfield', () => {
  for (const route of PARITY_ROUTES) {
    test(route.id, async ({ page }) => {
      // Skip if no baseline captured yet — keeps the parity gate green
      // until F0a has been run for this route.
      //
      // Playwright's default snapshotPathTemplate is
      // `{arg}{-projectName}{-platform}{ext}` — so passing just `${route.id}.png`
      // resolves to `<id>-<project>-<platform>.png`, which matches the
      // capture-legacy-baseline.mjs output. Don't include projectName in the
      // arg or it gets duplicated.
      const snapshotName = `${route.id}.png`;
      const baseSnapshotPath = test.info().snapshotPath(snapshotName);
      const platformPath = baseSnapshotPath.replace(/\.png$/, `-${process.platform}.png`);
      if (!existsSync(baseSnapshotPath) && !existsSync(platformPath)) {
        test.skip(
          true,
          `No legacy baseline at ${platformPath}. Run \`node tools/capture-legacy-baseline.mjs --route=${route.id}\` first.`,
        );
        return;
      }

      if (route.actor) {
        await authenticate(page.context(), page, ACTORS[route.actor]);
      }

      await page.goto(`${GREENFIELD_URL}${route.path}`, { waitUntil: 'networkidle' });
      if (route.waitFor) {
        await page.waitForSelector(route.waitFor, { timeout: 15_000 });
      }
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(500);

      // Pass just `${route.id}.png` — Playwright's default
      // snapshotPathTemplate appends project + platform automatically.
      const screenshotOpts = {
        fullPage: true,
        animations: 'disabled',
        maxDiffPixelRatio: route.maxDiffPixelRatio ?? 0.2,
      } as const;

      if (route.expectedDiverged) {
        // Routes that haven't been ported yet (greenfield still renders
        // <app-placeholder> or partial layout) compare against the legacy
        // baseline, but the gate stays GREEN regardless of pixel/dimension
        // mismatch. The diff is still produced under `test-results/` so we
        // can eyeball progress, and the annotation surfaces in the report.
        // Once the route ships, drop `expectedDiverged` from the manifest
        // and the standard 20% gate enforces parity.
        try {
          await expect(page).toHaveScreenshot(snapshotName, screenshotOpts);
          test.info().annotations.push({
            type: 'parity-converged',
            description: `${route.id}: greenfield now matches legacy within threshold — drop expectedDiverged from manifest`,
          });
        } catch (err) {
          const reason = route.divergedReason ?? 'route not yet ported to greenfield';
          test.info().annotations.push({
            type: 'expected-diverged',
            description: `${route.id}: ${reason}`,
          });
        }
        return;
      }

      await expect(page).toHaveScreenshot(snapshotName, screenshotOpts);
    });
  }
});
