import { expect, test } from '@playwright/test';

/**
 * Visual regression tier — one screenshot per sandbox fixture per device.
 * First run writes baselines under `__screenshots__/`; later runs diff
 * against them. Run with `--update-snapshots` after intentional UI changes
 * to refresh the baselines.
 *
 * Threshold: Playwright defaults — `maxDiffPixelRatio: 0.05` (5%) per the
 * plan target in 11-PLAYWRIGHT-MATRIX. Tighter thresholds catch more
 * regressions but risk flakiness from font rendering / animation.
 *
 * The fixture list is duplicated here (rather than read from
 * SANDBOX_REGISTRY at runtime) so visual diffs are predictable in CI even
 * if a registry refactor reorders entries.
 */
const FIXTURES = [
  'sign-in-empty',
  'sign-in-invalid-credentials',
  'forgot-password-empty',
  'forgot-password-rate-limited',
  'reset-password-valid-link',
  'reset-password-invalid-link',
  'reset-password-no-oob-code',
  'sign-out-in-progress',
  'sign-up-chooser',
  'sign-up-influencer-empty',
  'sign-up-influencer-email-taken',
  'sign-up-business-empty',
  'sign-up-business-nip-not-found',
  'verify-email-success',
  'verify-email-invalid',
  'verify-email-no-oob-code',
  'verify-email-verifying',
  'confirmation-required-default',
  'action-router-unknown-mode',
  'auth-error-generic',
  'auth-error-consent-required',
  'two-factor-verify-dialog-default',
  'two-factor-setup-default',
  'legal-clickwrap-default',
  'legal-clickwrap-load-failed',
  'cookie-banner',
  'cookie-banner-expanded',
  'landing',
  'survey-hub',
  'profile-influencer',
  'profile-company',
  'profile-error',
  'profile-loading',
  'preferences-loaded',
  'preferences-error',
  'addresses-with-list',
  'addresses-empty',
  'step-up-dialog-awaiting',
  'step-up-dialog-requesting',
  'step-up-dialog-invalid-code',
  'social-connections-loaded',
  'social-connections-empty',
  'social-connections-error',
  'email-change-collapsed',
  'profile-picture-upload-empty',
  'profile-picture-upload-existing',
  'plan-billing-free-trial-eligible',
  'plan-billing-business',
  'plan-billing-downgrade-pending',
  'plan-billing-error',
  'plan-billing-payment-failed',
  'plan-billing-payments-disabled',
  'plan-billing-trial-enterprise',
  'upgrade-confirm-business',
  'upgrade-confirm-enterprise',
  'trial-consent-dialog',
  'downgrade-confirm-business-to-free',
  'opportunities-list-loaded',
  'opportunities-list-empty',
  'opportunities-list-error',
  'opportunities-list-loading',
  'opportunity-detail-loaded',
  'opportunity-detail-company-view',
  'opportunity-detail-not-found',
  'my-campaigns-loaded',
  'my-campaigns-empty',
  'my-campaigns-loading',
  'my-campaigns-error',
  'opportunity-form-create',
  'opportunity-form-edit',
  'opportunity-form-not-found',
  'campaign-applicants-loaded',
  'campaign-applicants-empty',
  'campaign-applicants-error',
  'campaign-applicants-not-found',
  'content-review-loaded',
  'content-review-empty',
  'content-review-error',
  'content-submission-with-history',
  'content-submission-first-visit',
  'content-submission-error',
  'social-callback-processing',
  'social-callback-cancelled',
  'social-callback-csrf-failed',
  'auth-success-completing',
  'auth-success-exchange-failed',
  'notification-panel-unread-mix',
  'notification-panel-empty',
  'notification-panel-error',
  'notification-bell-badged',
  'shell-banner-blocked-terms',
  'shell-banner-rate-limit',
  'shell-banner-trial-offer',
  'reconsent-dialog-default',
  'security-settings-default',
  'applied-opportunities-list-loaded',
  'applied-opportunities-list-empty',
  'applied-opportunities-list-error',
  'applied-opportunity-detail-decision',
  'applied-opportunity-detail-posted',
  'applied-opportunity-detail-posted-rejected',
  'collaboration-dashboard-in-progress-company',
  'collaboration-dashboard-in-progress-influencer',
  'collaboration-dashboard-finished',
  'collaboration-dashboard-empty',
  'collaboration-dashboard-error',
  'company-setup-idle',
  'company-setup-confirmed',
  'delete-confirmation-dialog',
  'delete-blockers-dialog',
  'error-page-404',
  'error-page-500',
  'error-page-503',
  'team',
  'grants',
  'support-home',
  'create-ticket',
  'ticket-status-lookup',
  'ticket-status-loaded',
  'my-tickets-loaded',
  'my-tickets-empty',
  'admin-tickets-loaded',
  'admin-ticket-detail',
  'admin-user-list-loaded',
  'admin-user-list-empty',
  'admin-user-list-error',
  'admin-dictionary-loaded',
  'admin-dictionary-empty',
  'admin-dictionary-error',
  'admin-cascade-delete-preview',
  'icon-audit',
  'codemap-page-hero',
  'codemap-player-idle',
  'codemap-player-honest-done',
] as const;

test.describe('Visual snapshots · Sandbox fixtures', () => {
  // Per-component byte-stable snapshots run on chromium engines only.
  // Cross-engine coverage is the visual-parity tier's job — that suite
  // already maintains baselines per device project (chromium-desktop,
  // mobile-chrome, mobile-safari, tablet-safari). Doubling sandbox
  // baselines onto safari would be ~54 extra files drifting independently
  // for no signal: chromium catches the layout/copy/state regressions
  // we care about; safari render quirks belong in visual-parity.
  test.beforeEach(({}, testInfo) => {
    test.skip(
      !['chromium-desktop', 'mobile-chrome'].includes(testInfo.project.name),
      'Sandbox visual snapshots run on chromium engines only — visual-parity covers cross-engine',
    );
  });

  for (const id of FIXTURES) {
    test(`fixture ${id}`, async ({ page }, testInfo) => {
      // icon-audit is a dense Material-glyph grid. At mobile-chrome's high
      // DPR its font rasterization is order/warmup-dependent — the same
      // glyphs rasterize slightly differently depending on how many fixtures
      // rendered before it in the run (document.fonts.ready guarantees the
      // font is loaded, not that the GPU raster cache is identical). A pixel
      // baseline is therefore inherently unstable there: a full-suite regen
      // never matches an isolated `-g` one (~6% churn, machine-verified over
      // iter-146..148). Its sizing/clip-guard intent is DPR-independent and
      // fully covered by chromium-desktop, so we run it there only.
      test.skip(
        id === 'icon-audit' && testInfo.project.name === 'mobile-chrome',
        'icon-audit font-glyph raster is order-flaky at high DPR; chromium-desktop covers its intent',
      );
      // A fixture that throws at runtime renders BLANK — and a blank page
      // would be silently baselined as "correct". Collect uncaught page
      // errors and fail loudly instead (caught 2026-09-02: NG0600 from a
      // signal-writing @Input setter inside the host's effect blanked the
      // cookie-banner-expanded fixture).
      const pageErrors: string[] = [];
      page.on('pageerror', (err) => pageErrors.push(String(err)));
      await page.goto(`/__sandbox/${id}`);
      // Give Material animations + font loading a beat to settle.
      await page.waitForLoadState('networkidle');
      await page.evaluate(() => document.fonts.ready);
      expect(pageErrors, `uncaught page error(s) rendering ${id}`).toEqual([]);
      await expect(page).toHaveScreenshot(`${id}.png`, {
        fullPage: false,
        // Mask any volatile region (none today; reserve hook for later).
        animations: 'disabled',
        maxDiffPixelRatio: 0.05,
      });
    });
  }
});
