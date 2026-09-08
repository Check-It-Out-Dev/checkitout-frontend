import { prefersReducedMotion } from './reduced-motion';

/**
 * Bring a control into the middle of its scroller with a glide the eye can
 * follow.
 *
 * `scrollIntoView({ behavior: 'smooth' })` covers a long page in a few hundred
 * milliseconds, and on the campaign brief — where the tour fills the top of the
 * form and then points at the bottom of it — the owner read that as a jump, not
 * a scroll (2026-09-07). This one takes between MIN_MS and MAX_MS depending on
 * the distance, eases in and out, and yields to a newer glide on the same
 * scroller so a burst of reveals ends where the last one pointed.
 *
 * Returns how long the glide will take, so a caller that tracks the target's
 * box (the spotlight) knows how long "still moving" is expected to last.
 * Reduced motion: an instant jump, and 0.
 */
const MIN_MS = 650;
const MAX_MS = 1400;

/** The newest glide per scroller; an older tick that finds itself superseded stops. */
const CURRENT = new WeakMap<Element, number>();

function scrollParent(el: HTMLElement): HTMLElement | null {
  const view = el.ownerDocument.defaultView;
  if (!view) return null;
  let p = el.parentElement;
  while (p) {
    const overflow = view.getComputedStyle(p).overflowY;
    if ((overflow === 'auto' || overflow === 'scroll') && p.scrollHeight > p.clientHeight) return p;
    p = p.parentElement;
  }
  return null;
}

const easeInOutCubic = (x: number): number =>
  x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;

export function glideIntoView(el: HTMLElement): number {
  const doc = el.ownerDocument;
  const view = doc.defaultView;
  if (!view) return 0;
  if (prefersReducedMotion(view)) {
    if (typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'center' });
    return 0;
  }
  const box = el.getBoundingClientRect();
  const container = scrollParent(el);
  const root = (doc.scrollingElement ?? doc.documentElement) as HTMLElement;
  const scroller = container ?? root;
  let current: number;
  let target: number;
  let max: number;
  if (container) {
    const c = container.getBoundingClientRect();
    current = container.scrollTop;
    target = current + (box.top - c.top) - (c.height - box.height) / 2;
    max = container.scrollHeight - container.clientHeight;
  } else {
    current = root.scrollTop;
    target = current + box.top - (view.innerHeight - box.height) / 2;
    max = root.scrollHeight - view.innerHeight;
  }
  target = Math.max(0, Math.min(Math.max(0, max), target));
  const delta = target - current;
  if (Math.abs(delta) < 2) return 0;
  const duration = Math.round(Math.min(MAX_MS, Math.max(MIN_MS, 500 + Math.abs(delta) * 0.7)));
  const token = (CURRENT.get(scroller) ?? 0) + 1;
  CURRENT.set(scroller, token);
  const started = view.performance.now();
  const tick = (now: number): void => {
    if (CURRENT.get(scroller) !== token) return;
    const progress = Math.min(1, (now - started) / duration);
    scroller.scrollTop = current + delta * easeInOutCubic(progress);
    if (progress < 1) view.requestAnimationFrame(tick);
  };
  view.requestAnimationFrame(tick);
  return duration;
}
