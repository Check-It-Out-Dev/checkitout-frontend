/**
 * Phantom ↔ Sandbox component-pair registry.
 *
 * Each entry pairs a legacy phantom fixture (`/__phantom/<id>` in
 * the legacy frontend) with the matching greenfield sandbox fixture
 * (`/__sandbox/<id>` in `checkitout-frontend`). Stage 6g per-component
 * visual-parity sweeps assign a verdict and a one-paragraph rationale; the
 * verdict lives here, not in markdown, so future sweeps + future cutover
 * gates can read it programmatically.
 *
 * Source of truth for the parity-review markdown at
 * `docs/parity-review/stage-6g-<date>.md` — the markdown narrates *why*; this
 * file enforces *what*. When the two disagree, this file wins.
 *
 * **Adding a new pair.** Register the phantom in the legacy frontend's
 * `src/app/phantom/phantom-registry.ts`, the sandbox fixture in this
 * repo's `src/app/sandbox/sandbox-registry.ts`, then add an entry here
 * with a verdict. TypeScript strict-mode forces the verdict + reason.
 *
 * **Resolving a `needsFix`.** Set `resolvedAt` + `resolvedCommit` when the
 * fix lands. Verdict stays `needsFix` until a subsequent Stage 6g sweep
 * verifies re-convergence; the sweep then flips it to `parity` (or back to
 * `needsFix` if the fix is incomplete).
 */
export type ComponentPairVerdict =
  /** Pixel-diff should be within threshold. Future sweep fails on regression. */
  | 'parity'
  /** Design-intent preserved; layout/typography divergence is deliberate. */
  | 'expectedDiverged'
  /** Diff blocked on shared global state; needs reset helper (#236). */
  | 'pendingStateReset'
  /** Greenfield bug or missing feature; cutover-blocking. */
  | 'needsFix';

/**
 * Content assertions enforced by `phantom-sandbox-parity.spec.ts` against
 * each pair's live render. Authored from the iter-40 + iter-43 live-Chrome
 * MCP captures — the EXACT Polish phrases / testids the running stack
 * surfaces today. Catches regressions a plain non-empty assertion misses
 * (e.g. removing the "Wyślij ponownie" CTA from verify-email would still
 * leave a non-empty page, but the spec now hard-fails on absent text).
 *
 * Greenfield assertions are **required** — the greenfield side is the
 * moving target whose changes the spec guards. Legacy assertions are
 * optional because the legacy phantom-host occasionally renders the
 * global cookie-banner as occluding overlay (varies by stack state) —
 * we don't want the spec to fail on banner-collision flakes.
 */
export interface ContentAssertions {
  /** Substrings (Polish) that MUST appear in greenfield's innerText. */
  readonly greenfieldContains?: readonly string[];
  /** CSS selectors that MUST resolve to a non-null element on greenfield. */
  readonly greenfieldSelectors?: readonly string[];
  /** Substrings that MUST appear in legacy's innerText. */
  readonly legacyContains?: readonly string[];
}

export interface ComponentPair {
  /**
   * Canonical slug for the pair — usually matches the phantom + sandbox id
   * verbatim. Use the phantom slug when they diverge (rare, see
   * `sign-out-in-progress` below).
   */
  readonly id: string;
  /**
   * Override when the legacy phantom slug differs from `id` (e.g. legacy
   * renames a slug for accuracy but the greenfield sandbox keeps the
   * original name).
   */
  readonly phantomId?: string;
  /** Override when the greenfield sandbox slug differs from `id`. */
  readonly sandboxId?: string;
  /** One-line human description shown in sweep reports. */
  readonly description: string;
  readonly verdict: ComponentPairVerdict;
  /** Why the verdict was assigned. Cite the parity-review markdown row. */
  readonly reason: string;
  /** ISO date when the verdict was assigned (e.g. '2026-05-13'). */
  readonly classifiedAt: string;
  /** Reference to the sweep markdown (e.g. 'stage-6g-2026-05-13.md'). */
  readonly classifiedIn: string;
  /** For `needsFix` / `pendingStateReset`: what unblocks it. */
  readonly followUp?: string;
  /** ISO date of the resolving commit (when applicable). */
  readonly resolvedAt?: string;
  /** Short SHA of the resolving commit (when applicable). */
  readonly resolvedCommit?: string;
  /** Content-presence assertions enforced by the executable parity spec. */
  readonly contentAssertions?: ContentAssertions;
}

/**
 * Canonical verdict registry from Stage 6g 2026-05-13 sweep + iter-36
 * resolutions.
 *
 * Provenance: `docs/parity-review/stage-6g-2026-05-13.md` §findings table.
 */
export const COMPONENT_PAIRS: readonly ComponentPair[] = [
  // 1. cookie-banner — iter-40 resweep cleared state via the iter-38 helper
  // pattern (localStorage on greenfield; cio_cc + consent_cat_* cookies on
  // legacy) and both banners rendered cleanly. Designs intentionally
  // diverge: greenfield is a 2-button bottom strip ("Tylko niezbędne" +
  // "Akceptuj wszystkie"); legacy is a 3-button block ("Odrzuć wszystkie"
  // + "Dostosuj" + "Zaakceptuj wszystkie"). Both meet the
  // banner-on-first-visit functional requirement.
  {
    id: 'cookie-banner',
    description: 'First-visit cookie consent banner',
    verdict: 'expectedDiverged',
    reason:
      'Iter-40 resweep with state-reset helper: both banners render. Designs intentionally diverge (greenfield 2-button strip vs legacy 3-button block). Both satisfy the banner-on-first-visit functional requirement; pixel-diff blocked by design intent. State-reset helper pattern (iter-38) validated live.',
    classifiedAt: '2026-05-13',
    classifiedIn: 'stage-6g-2026-05-13.md',
    resolvedAt: '2026-05-13',
    resolvedCommit: '04ec8d6', // iter-38 state-reset helper that enables clean pair-diff
    contentAssertions: {
      greenfieldContains: ['Używamy plików cookie', 'Tylko niezbędne', 'Akceptuj wszystkie'],
      greenfieldSelectors: ['[data-testid="cookie-banner"]'],
      legacyContains: ['Używamy plików cookie', 'Zaakceptuj wszystkie'],
    },
  },

  // 2. confirmation-required-default — both show "Wymagane potwierdzenie"
  // with the back-to-login link. Layout is editorial-centered vs Fuse
  // 2-panel; intentional reskin.
  {
    id: 'confirmation-required-default',
    description: 'Post-signup "verify your email" landing',
    verdict: 'expectedDiverged',
    reason:
      'Identical headline ("Wymagane potwierdzenie") + instructional copy + "Wróć do Logowania" link. Layout divergence is the deliberate editorial-centered vs Fuse 2-panel reskin — design-intent preserved.',
    classifiedAt: '2026-05-13',
    classifiedIn: 'stage-6g-2026-05-13.md',
    contentAssertions: {
      greenfieldContains: ['Wymagane potwierdzenie'],
      legacyContains: ['Wymagane potwierdzenie'],
    },
  },

  // 3. action-router-unknown-mode — both show "Nieprawidłowy link"
  // + "Przejdź do logowania". Layout reskin.
  {
    id: 'action-router-unknown-mode',
    description: 'Email-action router with unknown mode= query param',
    verdict: 'expectedDiverged',
    reason:
      'Identical "Nieprawidłowy link" headline + body + sign-in link. Layout divergence per editorial reskin.',
    classifiedAt: '2026-05-13',
    classifiedIn: 'stage-6g-2026-05-13.md',
    contentAssertions: {
      greenfieldContains: ['Nieprawidłowy link'],
      legacyContains: ['Nieprawidłowy link'],
    },
  },

  // 4. sign-up-chooser — both render Influencer + Firma cards.
  {
    id: 'sign-up-chooser',
    description: 'Role chooser (Influencer vs Firma)',
    verdict: 'expectedDiverged',
    reason:
      'Identical "Zarejestruj się" headline + both Influencer and Firma role cards with icons. Layout divergence per editorial reskin.',
    classifiedAt: '2026-05-13',
    classifiedIn: 'stage-6g-2026-05-13.md',
    contentAssertions: {
      greenfieldContains: ['Influencer', 'Firma'],
      legacyContains: ['Influencer', 'Firma'],
    },
  },

  // 5. forgot-password-empty — identical email field + submit + back-link.
  {
    id: 'forgot-password-empty',
    description: 'Forgot-password form, empty state',
    verdict: 'expectedDiverged',
    reason:
      'Identical "Zapomniałeś hasła?" headline + email input + submit + back-to-login link. Layout divergence per editorial reskin.',
    classifiedAt: '2026-05-13',
    classifiedIn: 'stage-6g-2026-05-13.md',
    contentAssertions: {
      greenfieldContains: ['Zapomniałeś hasła'],
      legacyContains: ['Zapomniałeś hasła'],
    },
  },

  // 6. sign-out — legacy slug was renamed in iter-36 because its internal
  // countdown timer flips the component to post-success state before
  // phantom-host captures the screenshot. Greenfield's spinner-during-
  // signOut is fundamentally different UX (instant-redirect on legacy vs
  // wait-for-BE on greenfield). No pixel pairing is meaningful here.
  {
    id: 'sign-out-in-progress',
    phantomId: 'sign-out-success', // legacy renamed in iter-36; greenfield kept original slug
    description: 'Sign-out — legacy captures post-success, greenfield captures in-progress',
    verdict: 'expectedDiverged',
    reason:
      'Legacy renders "Zostałeś wylogowany!" + 5s countdown the entire time (instant title flip + redirect). Greenfield renders "Wylogowywanie…" with spinner during BE round-trip. Fundamentally different UX strategies — no pixel pairing meaningful.',
    classifiedAt: '2026-05-13',
    classifiedIn: 'stage-6g-2026-05-13.md',
    resolvedAt: '2026-05-13',
    resolvedCommit: 'aaeab40', // legacy: phantom slug rename
    contentAssertions: {
      greenfieldContains: ['Wylogowywanie'],
      legacyContains: ['Zostałeś wylogowany'],
    },
  },

  // 7. reset-password-no-oob-code — iter-36 conditional-headline fix
  // verified live in iter-40 resweep: greenfield now renders "Link wygasł"
  // headline + invalid-link banner + "Poproś o nowy link resetowania"
  // CTA. Both data-testids (reset-password-invalid-title +
  // reset-password-invalid-link) present in DOM. Verdict flipped to parity.
  {
    id: 'reset-password-no-oob-code',
    description: 'Reset-password page with missing oobCode query param',
    verdict: 'parity',
    reason:
      'Iter-40 resweep verified live: greenfield renders "Link wygasł" + invalid-link banner + request-new-link CTA with both data-testids present. Matches legacy semantic state. Cross-side pixel-diff still subject to legacy cookie-banner occlusion (pre-existing, see pair #1 helper).',
    classifiedAt: '2026-05-13',
    classifiedIn: 'stage-6g-2026-05-13.md',
    resolvedAt: '2026-05-13',
    resolvedCommit: '5052b7b', // greenfield: conditional headline
    contentAssertions: {
      greenfieldContains: ['Link wygasł', 'Poproś o nowy link'],
      greenfieldSelectors: [
        '[data-testid="reset-password-invalid-title"]',
        '[data-testid="reset-password-invalid-link"]',
      ],
      // Legacy assertion intentionally omitted — iter-40 capture showed
      // legacy phantom occluded by cookie banner globally.
    },
  },

  // 8. verify-email-no-oob-code — iter-36 resend-CTA fix verified live in
  // iter-40 resweep: both sides render identical content ("Weryfikacja nie
  // powiodła się" + invalid-link copy + "Wyślij ponownie email
  // weryfikacyjny" + "Przejdź do logowania"). Both verify-email-resend +
  // verify-email-invalid data-testids present in DOM. Verdict flipped
  // to parity.
  {
    id: 'verify-email-no-oob-code',
    description: 'Verify-email page with missing oobCode query param',
    verdict: 'parity',
    reason:
      'Iter-40 resweep verified live: both sides render identical content including "Wyślij ponownie email weryfikacyjny" CTA + "Przejdź do logowania" link. Greenfield resend-button + invalid-icon testids confirmed present.',
    classifiedAt: '2026-05-13',
    classifiedIn: 'stage-6g-2026-05-13.md',
    resolvedAt: '2026-05-13',
    resolvedCommit: '5052b7b', // greenfield: resend CTA + resendState
    contentAssertions: {
      greenfieldContains: [
        'Weryfikacja nie powiodła się',
        'Wyślij ponownie email weryfikacyjny',
        'Przejdź do logowania',
      ],
      greenfieldSelectors: [
        '[data-testid="verify-email-resend"]',
        '[data-testid="verify-email-invalid"]',
      ],
      legacyContains: ['Weryfikacja nie powiodła się', 'Wyślij ponownie email weryfikacyjny'],
    },
  },

  // 9. legal-clickwrap-default — was a triple-issue resolved across iter-36
  // (dedupe) + iter-39 (i18n drift). Iter-40 resweep verified live: both
  // sides render 3 checkboxes with "Regulamin" + "Politykę Cookies" + no
  // "Warunki Usługi" / "Politykę Plików Cookies" remaining. Minor copy
  // divergence in the "I have read" prefix is cosmetic (i18n_label, not
  // i18n_link). Verdict flipped to parity.
  {
    id: 'legal-clickwrap-default',
    description: '3-document consent clickwrap on sign-up forms',
    verdict: 'parity',
    reason:
      'Iter-40 resweep verified live: both sides render 3 rows + 3 checkboxes with aligned terminology (Regulamin / Politykę Cookies). Iter-36 dedupe (`5052b7b`) + iter-39 i18n drift (`a06b35e`) both verified. Minor cosmetic divergence remains in label-prefix ("Przeczytałem(-am)" with parens vs "Przeczytałem/am" with slash) — both Polish, conventions only.',
    classifiedAt: '2026-05-13',
    classifiedIn: 'stage-6g-2026-05-13.md',
    resolvedAt: '2026-05-13',
    resolvedCommit: 'a06b35e', // iter-39 i18n drift (iter-36 dedupe already cited above)
    contentAssertions: {
      greenfieldContains: ['Regulamin', 'Politykę Cookies'],
      legacyContains: ['Regulamin', 'Politykę Cookies'],
    },
  },

  // 10. legal-clickwrap-load-failed — greenfield hides checkboxes on error,
  // legacy keeps them with an appended error message. Greenfield's
  // cleaner-error UX is arguably the better choice; keep as expectedDiverged.
  {
    id: 'legal-clickwrap-load-failed',
    description: 'Clickwrap when /legal/current returns an error',
    verdict: 'expectedDiverged',
    reason:
      "Greenfield hides the 3 checkbox rows and shows only an inline error message; legacy keeps the checkboxes visible with a separate error banner. Greenfield's cleaner-error UX is arguably better — keep as-is (note in parity-review verdict #10).",
    classifiedAt: '2026-05-13',
    classifiedIn: 'stage-6g-2026-05-13.md',
    contentAssertions: {
      greenfieldSelectors: ['[data-testid="legal-clickwrap-load-error"]'],
    },
  },

  // 11. plan-billing-business — iter-43 added Tier-2 phantom for the
  // BUSINESS-active subscription page. Live capture confirms both sides
  // render the plan card with "Business" + "199 PLN" / "99 PLN" pricing
  // (stub data differs by side — not a parity concern), campaign-usage
  // bar, billing-period range. Greenfield additionally shows the
  // invoice list (Faktury); legacy doesn't. Both UX-equivalent within
  // the redesign brief.
  {
    id: 'plan-billing-business',
    description: 'Settings → Plan & Billing, BUSINESS_ACTIVE subscription',
    verdict: 'expectedDiverged',
    reason:
      'Both sides render the BUSINESS plan card + campaign-usage progress + billing-period dates + plan-change CTAs. Stub-data differs across sides (199 PLN/3-of-10 legacy vs 99 PLN/17-of-50 greenfield) and greenfield additionally renders the Faktury invoice list — by-design data divergence + UX additions, not a regression.',
    classifiedAt: '2026-05-13',
    classifiedIn: 'stage-6g-2026-05-13-iter-43.md',
    contentAssertions: {
      greenfieldContains: ['Business', 'PLN'],
      legacyContains: ['Business', 'PLN'],
    },
  },

  // 12'. opportunities-list — iter-83 (2026-09-02) added the legacy
  // phantom (CollaborationsListComponent stubbed with the SAME 3 sample
  // campaigns as the greenfield fixture). Live captures: legacy renders
  // "Kampanie" + 3 CampaignCards + "Zgłoś się" CTAs; greenfield renders
  // "Przeglądaj kampanie" editorial header + filter rail + 3 cream cards
  // with CASH/BARTER chips. Identical data + semantics; layout is the
  // deliberate reskin.
  {
    id: 'opportunities-list-loaded',
    description: 'Influencer discover/browse list · 3 sample campaigns',
    verdict: 'expectedDiverged',
    reason:
      'Iter-83 live captures: both sides render all 3 sample campaigns (titles, cities, PLN amounts) with an apply affordance. Legacy is the Fuse grid ("Kampanie" + Zgłoś się cards); greenfield is the editorial discover page ("Przeglądaj kampanie" + filter rail + compensation-type chips). Same data, same semantics — layout divergence per redesign brief. Legacy determinism caveat: component persists filters at localStorage `collaborations-list-filters` (Playwright contexts start clean; manual captures must clear).',
    classifiedAt: '2026-09-02',
    classifiedIn: 'stage-6g-2026-09-02-iter-83.md',
    contentAssertions: {
      greenfieldContains: [
        'Przeglądaj kampanie',
        'Spring sneaker drop — long-form review',
        'Coffee shop opening — barter pack',
        'Skincare line launch',
      ],
      legacyContains: [
        'Spring sneaker drop — long-form review',
        'Coffee shop opening — barter pack',
        'Skincare line launch',
        'Zgłoś się',
      ],
    },
  },

  // 12''. applied-opportunities-list — iter-83. Legacy has NO flat "my
  // applications" list; its closest peer is the dashboard Registrations
  // tab (CollaborationTabViewComponent, APPLIED + ACCEPTED_BY_COMPANY).
  // Greenfield "Moje aplikacje" ALSO buckets — W trakcie / Zgłoszenia /
  // Zakończone tabs — but assigns ACCEPTED_BY_COMPANY to "W trakcie"
  // (in-progress) while legacy keeps it in Registrations awaiting the
  // influencer's confirmation. Bucket-membership divergence is a
  // deliberate IA choice (greenfield treats company-accepted as already
  // moving); the DEFAULT greenfield tab (Zgłoszenia) therefore shows
  // only the APPLIED row.
  {
    id: 'applied-opportunities-list-loaded',
    description:
      'Influencer "my applications" · legacy Registrations tab vs greenfield Zgłoszenia tab',
    verdict: 'expectedDiverged',
    reason:
      'Iter-83 live captures: legacy Registrations tab renders 2 workflow cards ("Zgłoszenie oczekuje" 1/8 for APPLIED + "Potwierdź współpracę" 2/8 amber for ACCEPTED_BY_COMPANY). Greenfield "Moje aplikacje" defaults to the Zgłoszenia tab showing the APPLIED row ("Spring sneaker drop" + APPLIED chip + note); ACCEPTED_BY_COMPANY lives under "W trakcie". Same underlying data, different bucket taxonomy by design — no pixel pairing meaningful across the tab structures.',
    classifiedAt: '2026-09-02',
    classifiedIn: 'stage-6g-2026-09-02-iter-83.md',
    contentAssertions: {
      greenfieldContains: [
        'Moje aplikacje',
        'Zgłoszenia',
        'W trakcie',
        'Zakończone',
        'Spring sneaker drop — long-form review',
      ],
      legacyContains: [
        'Spring sneaker drop — long-form review',
        'Coffee shop opening — barter pack',
        'Zaakceptuj',
      ],
    },
  },

  // 12. two-factor-verify-dialog-default — iter-43 added Tier-2 phantom
  // for the TOTP-challenge dialog. Live capture confirms both sides
  // render the dialog header + instructional copy + 6-digit input +
  // Anuluj/Weryfikuj CTAs. Legacy additionally shows a session-expiry
  // countdown timer + backup-code toggle; greenfield omits those by
  // design (cleaner UX choice — backup codes are handled on the BE
  // recovery page, not inline in this dialog).
  {
    id: 'two-factor-verify-dialog-default',
    description: 'TOTP verify dialog · default render (sign-in 2FA challenge)',
    verdict: 'expectedDiverged',
    reason:
      'Both sides render the 2FA-dialog with localized title + 6-digit input + Anuluj/Weryfikuj CTAs. Legacy adds a session-expiry countdown + backup-code toggle; greenfield omits these by-design (cleaner UX — backup-code recovery moved off the dialog). Verb conjugation differs slightly ("Zweryfikuj" vs "Weryfikuj") — both Polish, conventions only.',
    classifiedAt: '2026-05-13',
    classifiedIn: 'stage-6g-2026-05-13-iter-43.md',
    contentAssertions: {
      greenfieldContains: ['Uwierzytelnianie dwuskładnikowe', 'Weryfikuj'],
      legacyContains: ['Uwierzytelnianie dwuskładnikowe', 'Zweryfikuj'],
    },
  },
];

/**
 * Find a pair by its canonical id. Used by sync-check scripts that want to
 * verify a phantom/sandbox slug has a classified verdict.
 */
export function findComponentPair(id: string): ComponentPair | undefined {
  return COMPONENT_PAIRS.find((p) => p.id === id);
}

/**
 * Filter pairs by verdict. Convenience for sweep-report generation.
 *
 *   filterByVerdict('needsFix')  // → cutover blockers
 *   filterByVerdict('parity')    // → pixel-diff candidates
 */
export function filterByVerdict(verdict: ComponentPairVerdict): readonly ComponentPair[] {
  return COMPONENT_PAIRS.filter((p) => p.verdict === verdict);
}

/**
 * Pairs that should NOT be auto-flipped to `parity` even after a fix lands
 * — these are fundamental UX divergences (legacy/greenfield captures
 * inherently-different states) and pixel-pairing isn't meaningful.
 */
export const PERMANENTLY_DIVERGED_IDS: ReadonlySet<string> = new Set([
  'sign-out-in-progress', // legacy is post-success-countdown; greenfield is in-flight spinner
  // legacy Registrations bucket vs greenfield Zgłoszenia/W-trakcie taxonomy —
  // ACCEPTED_BY_COMPANY lives in different tabs by design (iter-83)
  'applied-opportunities-list-loaded',
]);
