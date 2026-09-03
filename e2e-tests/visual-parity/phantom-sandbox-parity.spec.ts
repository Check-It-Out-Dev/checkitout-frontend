import { test, expect, type Page } from '@playwright/test';
import {
  clearGreenfieldConsentState,
  clearLegacyConsentAndSession,
} from '../_framework/parity-state-reset';
import { COMPONENT_PAIRS, type ComponentPair } from './component-pairs';

/**
 * Stage 6g — Executable phantom↔sandbox parity sweep.
 *
 * Automates the iter-40 manual Chrome-MCP-driven sweep
 * (`docs/parity-review/stage-6g-2026-05-13-resweep.md`) so future sweeps
 * are a `npm run test:component-pair-parity` away. Reads
 * `COMPONENT_PAIRS` from the typed registry and visits each pair's
 * `/__phantom/<id>` (legacy) + `/__sandbox/<id>` (greenfield) URLs.
 *
 * **Iter-44 enhancement**: every pair with `contentAssertions` defined in
 * the registry gets enforced — greenfield (required) + legacy (optional)
 * substring + CSS-selector presence checks. Replaces the iter-41
 * "asserts non-empty" floor with real regression-catching power. A pair
 * whose greenfield slice removes the "Wyślij ponownie" CTA (e.g.) now
 * fails the spec instead of silently passing.
 *
 * Verdict semantics:
 *   - `expectedDiverged` — navigate both sides + run assertions if
 *     present. Different content per side is expected; assertions
 *     specify per-side phrasing.
 *   - `parity` — navigate both sides + run assertions; greenfield +
 *     legacy MUST satisfy their respective assertions.
 *   - `needsFix` / `pendingStateReset` — same handling; assertions
 *     document the current (broken) state so a fix moving toward parity
 *     is detectable.
 *
 * What this spec does NOT do:
 *
 *   - Pixel-diff. Text-diff is sufficient for the current set of pairs
 *     (Material vs Fuse render text identically; what differs is layout,
 *     and the editorial-reskin pairs are deliberately divergent). Pixel
 *     is a separate dimension if ever needed; the existing
 *     `parity.spec.ts` for ROUTE-level handles it.
 *
 *   - Auto-flip verdicts. The verdict registry remains human-curated;
 *     the spec is a tool that ASSISTS the curator, not a replacement.
 *
 * **Running this spec**:
 *
 *   - Requires both legacy (`:4200`) and greenfield (`:4201`) FE
 *     servers up. The BE is not strictly required (phantom/sandbox host
 *     pages render purely client-side), but the cookie-banner pair's
 *     state-reset helper does call BE clear-session.
 *
 *   - Defaults: `LEGACY_URL=https://localhost:4200`,
 *     `GREENFIELD_URL=https://localhost:4201`. Override via env.
 *
 *   - Runs in `chromium-desktop` project only — text-diff is
 *     platform-agnostic; multiplying by 4 projects adds time, not
 *     coverage.
 */

const LEGACY_URL = process.env['LEGACY_URL'] ?? 'https://localhost:4200';
const GREENFIELD_URL = process.env['GREENFIELD_URL'] ?? 'https://localhost:4201';

/** Pairs whose stateful render needs the cookie-state cleared first. */
const STATEFUL_PAIRS: ReadonlySet<string> = new Set(['cookie-banner']);

interface CaptureOk {
  ok: true;
  text: string;
  /**
   * Pre-resolved selector results — keyed by selector string. The map is
   * populated EAGERLY during navigation so the page can navigate away
   * (e.g. capturing greenfield then legacy on the same Page) without
   * invalidating the queries. Lazy `(s) => page.evaluate(...)` closures
   * would query the wrong-side page after the second nav (iter-44 bug).
   */
  selectorMatches: ReadonlyMap<string, boolean>;
}
interface CaptureFail {
  ok: false;
  reason: string;
}
type Capture = CaptureOk | CaptureFail;

async function navigateAndCapture(
  page: Page,
  url: string,
  selectorsToCheck: readonly string[],
): Promise<Capture> {
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 15_000 });
    await page.evaluate(() => document.fonts.ready).catch(() => undefined);
    // Sandbox-host bootstraps Angular + Transloco i18n + component-DI on
    // load — empirically settles ~1.5s. The earlier 300ms was too tight
    // and several fixtures captured empty innerText before render
    // finished (iter-44 first run found 6/12 false-empties).
    await page.waitForTimeout(1500);
    const text = await page.evaluate(() =>
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      (document.body.innerText ?? '').slice(0, 1500),
    );
    // Resolve every selector NOW while the page is on the correct URL.
    // Lazy lookup post-navigation would query the wrong page.
    const matches = new Map<string, boolean>();
    for (const sel of selectorsToCheck) {
      // eslint-disable-next-line no-await-in-loop
      const found = await page.evaluate((s) => !!document.querySelector(s), sel);
      matches.set(sel, found);
    }
    return { ok: true, text, selectorMatches: matches };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  }
}

function pairSummary(pair: ComponentPair): string {
  return `${pair.id} [${pair.verdict}]`;
}

/**
 * Enforce a `ContentAssertions` block against a captured side. Per-pair
 * assertions are documented at the registry entry; this function turns
 * the declarative spec into `expect()` calls. Synchronous now that
 * selectorMatches is pre-resolved at navigation time.
 */
function assertContent(
  side: 'greenfield' | 'legacy',
  capture: CaptureOk,
  pair: ComponentPair,
  containsList: readonly string[] | undefined,
  selectorList: readonly string[] | undefined,
): void {
  if (containsList) {
    for (const needle of containsList) {
      expect(
        capture.text.includes(needle),
        `${side} for ${pair.id} should contain "${needle}". Captured (first 600 chars): ${capture.text.slice(0, 600)}`,
      ).toBe(true);
    }
  }
  if (selectorList) {
    for (const sel of selectorList) {
      const found = capture.selectorMatches.get(sel) ?? false;
      expect(found, `${side} for ${pair.id} should resolve selector "${sel}"`).toBe(true);
    }
  }
}

test.describe('Stage 6g · phantom↔sandbox executable parity sweep', () => {
  // Run only on chromium-desktop. Other projects don't add coverage for
  // text-diff and would 3x the runtime.
  test.skip(({ browserName }) => browserName !== 'chromium', 'text-diff is platform-agnostic');

  // Force Polish locale via Accept-Language. The registry's
  // contentAssertions are authored from live in-browser captures
  // which ran with the OS-default PL locale; Playwright would default
  // to en-US and the FE would render English copy, breaking every
  // assertion. Setting it at describe-scope applies to every test below.
  test.use({
    locale: 'pl-PL',
    extraHTTPHeaders: { 'Accept-Language': 'pl-PL,pl;q=0.9' },
  });

  for (const pair of COMPONENT_PAIRS) {
    test(pairSummary(pair), async ({ page, context }) => {
      const phantomSlug = pair.phantomId ?? pair.id;
      const sandboxSlug = pair.sandboxId ?? pair.id;

      // For stateful pairs, clear app state before capture so both sides
      // render the same "fresh-visit" surface. Failures here are not
      // test-fatal — the helper's behavior is exercised separately.
      if (STATEFUL_PAIRS.has(pair.id)) {
        await clearGreenfieldConsentState(context).catch(() => undefined);
        await clearLegacyConsentAndSession(context, LEGACY_URL).catch(() => undefined);
      }

      const greenfieldSelectors = pair.contentAssertions?.greenfieldSelectors ?? [];
      const greenfield = await navigateAndCapture(
        page,
        `${GREENFIELD_URL}/__sandbox/${sandboxSlug}`,
        greenfieldSelectors,
      );
      if (!greenfield.ok) {
        test.skip(
          true,
          `Greenfield sandbox not reachable at ${GREENFIELD_URL}/__sandbox/${sandboxSlug} — ${greenfield.reason}`,
        );
        return;
      }

      // Legacy has no selector-assertions in the current registry (kept
      // off to avoid cookie-banner-overlay flakes); pass empty list.
      const legacy = await navigateAndCapture(page, `${LEGACY_URL}/__phantom/${phantomSlug}`, []);
      if (!legacy.ok) {
        test.skip(
          true,
          `Legacy phantom not reachable at ${LEGACY_URL}/__phantom/${phantomSlug} — ${legacy.reason}`,
        );
        return;
      }

      // Evidence annotations — human-readable side-by-side in the test
      // report. The slicing here mirrors the iter-40 manual run's output.
      test.info().annotations.push({
        type: 'greenfield-text',
        description: greenfield.text.slice(0, 600),
      });
      test.info().annotations.push({
        type: 'legacy-text',
        description: legacy.text.slice(0, 600),
      });

      // Safety floor — both sides must render SOMETHING. Catches host-
      // page-broken / fixture-mis-registered failures before the
      // assertion-based regression catches drift. Floor at 10 chars to
      // accommodate minimal-render fixtures like sign-out-in-progress
      // greenfield which renders only "Wylogowywanie…" (14 chars).
      expect(greenfield.text.length, `greenfield rendered empty for ${pair.id}`).toBeGreaterThan(
        10,
      );
      expect(legacy.text.length, `legacy rendered empty for ${pair.id}`).toBeGreaterThan(10);

      // Content assertions (the iter-44 enhancement). Greenfield is
      // required when defined; legacy is optional — see ContentAssertions
      // docstring on why (cookie-banner overlay flakes).
      const a = pair.contentAssertions;
      if (a) {
        assertContent('greenfield', greenfield, pair, a.greenfieldContains, a.greenfieldSelectors);
        assertContent('legacy', legacy, pair, a.legacyContains, undefined);
      }

      // Optional synthesis annotation for parity verdicts.
      if (pair.verdict === 'parity') {
        test.info().annotations.push({
          type: 'parity-synthesis',
          description: `Both sides rendered (${greenfield.text.length} vs ${legacy.text.length} chars).`,
        });
      }
    });
  }
});
