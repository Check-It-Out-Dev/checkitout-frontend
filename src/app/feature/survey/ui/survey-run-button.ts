/**
 * Shared class idiom for the survey showcases' "run / retry" demo triggers.
 *
 * Every interactive showcase (cicd, observability, ansible, billing-saga, …)
 * has a small button that plays or replays its walkthrough. They had drifted
 * into ~9 hand-rolled variants (flat `bg-coral-500` pills, some without a
 * focus ring, inconsistent padding/hover). These two constants unify them on
 * the site's editorial CTA language: coral fill with a coral-tinted depth
 * shadow that lifts + grows on hover (mirrors `.cta-primary` in styles.scss),
 * a visible `:focus-visible` ring, and an `:active` press — so the demo
 * buttons feel like the same product as the marketing CTAs.
 *
 * Used via `[class]="done ? SURVEY_REPLAY_BTN : SURVEY_RUN_BTN"` (bind the
 * constant on a component field, since templates cannot import).
 */
export const SURVEY_RUN_BTN =
  'inline-flex cursor-pointer items-center gap-1.5 rounded-full border-0 bg-coral-700 px-4 py-2 ' +
  'text-sm font-semibold text-white shadow-[0_6px_18px_-6px_rgba(255,90,54,0.5)] ' +
  'transition duration-200 hover:-translate-y-0.5 hover:bg-coral-600 ' +
  'hover:shadow-[0_12px_24px_-8px_rgba(255,90,54,0.55)] focus-visible:outline-none ' +
  'focus-visible:ring-2 focus-visible:ring-coral-500/55 focus-visible:ring-offset-2 ' +
  'focus-visible:ring-offset-cream active:translate-y-0';

export const SURVEY_REPLAY_BTN =
  'inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-coral-200 bg-white ' +
  'px-4 py-2 text-sm font-semibold text-coral-600 shadow-sm transition duration-200 ' +
  'hover:-translate-y-0.5 hover:border-coral-300 hover:bg-coral-50 hover:text-coral-700 ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500/40 ' +
  'focus-visible:ring-offset-2 focus-visible:ring-offset-cream active:translate-y-0';
