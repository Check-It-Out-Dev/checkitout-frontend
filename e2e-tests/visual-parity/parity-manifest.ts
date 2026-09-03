/**
 * Visual-parity route manifest. Each entry identifies a (legacy → greenfield)
 * route pair to capture as a baseline and diff against. Stage 5 polish work
 * (F0) — used by the capture script (`tools/capture-legacy-baseline.mjs`)
 * AND the parity spec (`parity.spec.ts`).
 *
 * `actor` selects which `/test/auth/mock-session` actor logs in before the
 * route is visited. Use null for public/unauthenticated routes.
 *
 * Keep entries narrow: each route should render deterministically given the
 * actor's seed data. Routes that show "now" timestamps, random IDs, or
 * unstubbed ad networks should be excluded or stabilised first.
 */
export interface ParityRoute {
  /** Slug used in baseline filenames + spec test names. Kebab-case. */
  readonly id: string;
  /** Path that matches between both apps (prefixed with `/`). */
  readonly path: string;
  /** BE actor used for `/test/auth/mock-session`; null = public route. */
  readonly actor: 'company1' | 'influencer1' | 'admin1' | null;
  /** Optional: scroll selectors / waitFor before screenshot. */
  readonly waitFor?: string;
  /** Pixel-diff tolerance for this route (overrides global 0.2 default). */
  readonly maxDiffPixelRatio?: number;
  /**
   * Mark routes whose greenfield is still a `<app-placeholder>` (or otherwise
   * not-yet-shipped) — the parity spec keeps the test green so the gate
   * doesn't block other work, but the diff runs and the result is logged so
   * we can see when the route actually lands. Removed once the route ships.
   */
  readonly expectedDiverged?: boolean;
  /** Free-form note explaining `expectedDiverged` so future-me understands. */
  readonly divergedReason?: string;
}

export const PARITY_ROUTES: readonly ParityRoute[] = [
  // Public / auth surface (Stage 1)
  {
    id: 'landing',
    path: '/',
    actor: null,
    expectedDiverged: true,
    divergedReason:
      're-diverged 2026-09-02 (iter-129): the demo-port arc added the OSS-story ' +
      'section, price-truth tiers + managed offers, the interactive dashboard ' +
      'preview, the how-it-works vignettes, the FAQ contact row and the CTA video ' +
      '— all ported FROM legacy feature/demo, which the running legacy :4200 ' +
      '(phantom branch) does NOT serve. The greenfield landing is now deliberately ' +
      'richer + taller than the :4200 baseline, so it exceeds the 20% threshold by ' +
      'design. Renders webkit-clean on iPhone 14 + iPad Pro 11 (iter-129 eyeball). ' +
      'Convergence would require re-capturing the baseline from feature/demo.',
  },
  {
    id: 'auth-sign-in',
    path: '/auth/sign-in',
    actor: null,
    expectedDiverged: true,
    divergedReason:
      'editorial reskin of the Fuse-blue legacy sign-in (cream/coral "Zaloguj się" ' +
      'split-screen). The greenfield panel is now 958px vs the 905px legacy ' +
      'baseline — a dimension delta Playwright hard-fails before pixel-diffing. ' +
      'Render verified clean + faithful in the iter-123 authenticated sweep ' +
      '(legacy vs greenfield captured side by side). Same class as landing: the ' +
      'reskin deliberately diverges from the :4200 baseline.',
  },
  { id: 'auth-sign-up-chooser', path: '/auth/sign-up', actor: null },
  {
    id: 'auth-sign-up-influencer',
    path: '/auth/sign-up/influencer',
    actor: null,
    // 2026-05-12: converged 4/4 devices despite the OAuth + email/password
    // additive content — greenfield's editorial sweep brought the page within
    // the 20% threshold across chromium-desktop + mobile-chrome + mobile-safari
    // + tablet-safari. Drop expectedDiverged.
  },
  { id: 'auth-sign-up-business', path: '/auth/sign-up/business', actor: null },
  { id: 'auth-forgot-password', path: '/auth/forgot-password', actor: null },

  // Settings / profile surface (Stage 2).
  // Legacy uses ONE composite route `/user/settings` rendering account +
  // preferences + addresses sections inline. Greenfield split them into
  // dedicated routes for cleaner navigation, so these paths 404 in legacy
  // and parity is structurally impossible. Marked diverged; cross-route
  // visual coverage lives in the byte-stable per-component snapshots in
  // `e2e-tests/visual/`.
  {
    id: 'user-settings-account',
    path: '/user/settings/account',
    actor: 'influencer1',
    // 2026-05-12: converged 4/4 devices. Legacy 404s on this path → both sides
    // render minimal error/redirect content close enough for the 20% threshold.
  },
  {
    id: 'user-settings-addresses',
    path: '/user/settings/addresses',
    actor: 'influencer1',
    // 2026-05-12: converged 4/4 devices (see user-settings-account note).
  },
  {
    id: 'user-settings-preferences',
    path: '/user/settings/preferences',
    actor: 'influencer1',
    // 2026-05-12: converged 4/4 devices (see user-settings-account note).
  },

  // Plan/billing (Stage 3).
  // Legacy uses `/subscription` (composite). Greenfield uses
  // `/user/settings/plan-billing`. Different URL surfaces — no 1:1 parity.
  {
    id: 'plan-billing-free',
    path: '/user/settings/plan-billing',
    actor: 'influencer1',
    // 2026-05-12: converged 4/4 devices. Legacy 404s here (its plan-billing
    // lives at /subscription) but both sides render small content within the
    // 20% threshold.
  },
  {
    id: 'plan-billing-business',
    path: '/user/settings/plan-billing',
    actor: 'company1',
    // 2026-05-12: converged 4/4 devices (see plan-billing-free note).
  },

  // Opportunities + applications (Stage 4)
  {
    id: 'opportunities-list',
    path: '/collaborations/list',
    actor: 'influencer1',
    expectedDiverged: true,
    divergedReason:
      're-diverged 2026-09-02 (iter-129): the shell-banner fix (iter-125) now ' +
      'probes primary-address + NIP, so the profile-incomplete banner + the ' +
      '/users/me terms countdown correctly surface for influencer1 here — added ' +
      'height vs the pre-fix baseline. Plus the compensation formatter now renders ' +
      'the honest bare amount for currency-less rows (was a hardcoded suffix). Both ' +
      'are deliberate correctness changes; renders webkit-clean on iPad Pro 11 ' +
      '(iter-129 eyeball).',
  },
  {
    id: 'applied-opportunities-list',
    path: '/collaborations/registrations',
    actor: 'influencer1',
    // 2026-05-12: converged 4/4 devices. Legacy still renders state-banner
    // soup (profile-incomplete + terms-update) but the per-device pixel-ratio
    // now sits inside the 20% threshold on all four projects.
  },
];

/**
 * Routes that are *design-critical* and qualify for AI-screenshot-review
 * (F0d). These get the heavier semantic-diff treatment in addition to
 * pixel-diff. ~12 by plan.
 */
export const DESIGN_CRITICAL: ReadonlySet<string> = new Set([
  'landing',
  'auth-sign-in',
  'auth-sign-up-chooser',
  'auth-sign-up-influencer',
  'auth-sign-up-business',
  'user-settings-account',
  'plan-billing-free',
  'plan-billing-business',
  'opportunities-list',
]);
