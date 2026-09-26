/**
 * Does this visitor want motion?
 *
 * CSS answers this on its own through `@media (prefers-reduced-motion)`, but
 * the tour scrolls from script — and a scroll started with
 * `behavior: 'smooth'` keeps gliding no matter what the stylesheet says. W3C
 * technique C39 is explicit that the preference has to be honoured in both
 * places, so every script-driven movement in the demo asks here first.
 *
 * SSR-safe: without a window there is no preference to read, and nothing is
 * moving anyway.
 */
export function prefersReducedMotion(view: Window | null | undefined): boolean {
  return (
    !!view &&
    typeof view.matchMedia === 'function' &&
    view.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/** The scroll behaviour this visitor should get: a glide, or an instant jump. */
export function scrollBehaviourFor(view: Window | null | undefined): ScrollBehavior {
  return prefersReducedMotion(view) ? 'auto' : 'smooth';
}
