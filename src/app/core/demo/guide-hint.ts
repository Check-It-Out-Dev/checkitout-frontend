import type { ScenarioStep } from './scenario-registry';

/**
 * What the guide's footer may promise about a step — E-PROMISE.
 *
 * The panel told every beat the same thing: "kliknij podświetlony element —
 * wykona ten krok w aplikacji". It is false in two shapes and reviewers found
 * both. Over a reading beat, which has no recipe at all, the highlight is around
 * something already done — a posted reply, a receipt — and pressing only moves
 * the tour on. Over a form field it is worse: clicking an input does nothing
 * whatsoever, and the beats where that happens are the ones the 2FA tour is
 * about.
 *
 * The rule lives here, out of the template, so that it can be asserted against
 * every step of every scenario rather than against the two that happened to be
 * filmed. That is the difference between fixing a defect and closing a class.
 */
export type GuideHint =
  | 'demo.guide.readHint'
  | 'demo.guide.lookHint'
  | 'demo.guide.fillHint'
  | 'demo.guide.sandboxHint';

/** Does this step's recipe act on the control the ring is drawn around? */
export function actsOnTarget(step: ScenarioStep): 'click' | 'fill' | 'none' {
  const target = step.target;
  const acts = step.perform ?? [];
  if (!target || !acts.length) return 'none';
  const onTarget = acts.filter((a) => 'selector' in a && a.selector === target);
  // A recipe that clicks anything at all is a recipe a press performs; the
  // question the footer answers is what the RINGED control does.
  if (onTarget.some((a) => a.kind === 'click')) return 'click';
  if (onTarget.some((a) => a.kind === 'fill' || a.kind === 'fillFromStorage')) return 'fill';
  // Ringing one control and acting on another is still an acting beat — the
  // checkout's confirm beat re-opens its own dialog first — so fall back to
  // whether the recipe clicks at all.
  return acts.some((a) => a.kind === 'click') ? 'click' : 'none';
}

/**
 * `pointing` is whether the ring has the control on screen. With nothing to
 * point at, the panel carries the tour and says so.
 */
export function hintKeyFor(step: ScenarioStep | null | undefined, pointing: boolean): GuideHint {
  if (!step || !pointing) return 'demo.guide.readHint';
  switch (actsOnTarget(step)) {
    case 'click':
      return 'demo.guide.sandboxHint';
    case 'fill':
      return 'demo.guide.fillHint';
    default:
      return 'demo.guide.lookHint';
  }
}
