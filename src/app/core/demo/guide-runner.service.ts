import { DOCUMENT } from '@angular/common';
import { Injectable, NgZone, inject } from '@angular/core';
import { Router } from '@angular/router';
import type { GuideAction, StepDone } from './scenario-registry';
import { scrollBehaviourFor } from './reduced-motion';

const DEFAULT_TIMEOUT_MS = 4000;
/** Safety re-check behind the observer — covers state that changes with no
 * DOM mutation at all (a timer, a hidden tab waking up). */
const SAFETY_TICK_MS = 400;

/**
 * Executes a step's `perform` recipe against the live DOM when the visitor
 * takes the guide's offer instead of doing the step by hand, and watches for
 * the step's `done` condition either way. Recipes only know selectors (the
 * components' `data-testid` hooks), so the director stays route-agnostic and
 * no feature template learns about the tour.
 *
 * Everything here is event-driven: waits resolve on the next DOM mutation or
 * navigation (one evaluation per animation frame at most), never on a poll
 * interval, and nothing sleeps between two actions of a recipe. A step that
 * used to take half a second of scripted pauses now lands within a frame or
 * two — the guide reads as the app doing the work, not as a slideshow.
 * Observers run outside Angular; only the resolution re-enters it.
 *
 * Filling goes through the native value setter plus an `input` event, which
 * is what Angular's value accessors listen to; a control that is disabled,
 * or that the visitor already filled by hand, is left alone. Every action
 * tolerates a missing element by giving up after a timeout — the director
 * then advances anyway, the tour never traps the visitor.
 */
@Injectable({ providedIn: 'root' })
export class GuideRunnerService {
  private readonly router = inject(Router);
  private readonly doc = inject(DOCUMENT);
  private readonly zone = inject(NgZone);

  /**
   * Runs the actions in order; false when one of them could not complete.
   *
   * An action whose control is not there, while a control from later in the
   * same recipe is, gets skipped rather than waited for. A recipe is a route to
   * an outcome, and a visitor who has already walked part of it themselves
   * leaves the earlier controls gone: the cascade's Confirm button no longer
   * exists once they have confirmed, and the e-mail form's opening button no
   * longer exists once the form is open.
   *
   * Waited for, each of those costs the full four-second lookup with the page
   * shielded and the panel saying it is working. That is the freeze the owner
   * reported, and it appears only when someone helps: measured at 4048 ms on
   * the cascade and 4067 ms on the e-mail change, and never once on a tour
   * driven entirely by the guide.
   *
   * The rule is deliberately narrow. It fires only when the current control is
   * absent AND a later one is present, so it can never shorten a recipe that
   * was going to work.
   */
  async run(actions: readonly GuideAction[]): Promise<boolean> {
    let ok = true;
    for (let i = 0; i < actions.length; i++) {
      const action = actions[i];
      if (this.overtakenBy(actions.slice(i + 1), action)) continue;
      if (!(await this.perform(action))) ok = false;
      // One frame between actions: Angular renders what the last action
      // changed before the next selector is looked up.
      await this.frame();
    }
    return ok;
  }

  /** Is this action's control missing while something later in the recipe is already here? */
  private overtakenBy(rest: readonly GuideAction[], action: GuideAction): boolean {
    if (!('selector' in action) || !action.selector) return false;
    if (this.visible(action.selector)) return false;
    return rest.some((a) => 'selector' in a && a.selector && this.visible(a.selector));
  }

  /**
   * Calls `onTrue` the first time `pred()` holds, then stops. Driven by DOM
   * mutations, router navigation and a slow safety tick — no busy loop, so a
   * watch can sit on a step for as long as the visitor takes. Returns a
   * cancel function.
   */
  watch(pred: () => boolean, onTrue: () => void): () => void {
    if (pred()) {
      onTrue();
      return () => undefined;
    }
    let stopped = false;
    let queued = false;
    let observer: MutationObserver | undefined;
    let timer: ReturnType<typeof setInterval> | null = null;
    const sub = this.router.events?.subscribe(() => check());

    const stop = (): void => {
      if (stopped) return;
      stopped = true;
      observer?.disconnect();
      sub?.unsubscribe();
      if (timer !== null) clearInterval(timer);
    };
    const check = (): void => {
      if (stopped || queued) return;
      // A recipe fires hundreds of mutations and the predicate touches the
      // DOM: evaluate at most once per frame.
      queued = true;
      this.nextFrame(() => {
        queued = false;
        if (stopped || !pred()) return;
        stop();
        this.zone.run(onTrue);
      });
    };

    this.zone.runOutsideAngular(() => {
      const view = this.doc.defaultView;
      const root = this.doc.documentElement ?? this.doc.body;
      if (view?.MutationObserver && root) {
        observer = new view.MutationObserver(check);
        observer.observe(root, { childList: true, subtree: true, attributes: true });
      }
      timer = setInterval(check, SAFETY_TICK_MS);
    });
    return stop;
  }

  /** Resolves as soon as `pred()` holds, or with its value at the timeout. */
  waitUntil(pred: () => boolean, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<boolean> {
    return new Promise((resolve) => {
      let cancel: (() => void) | null = null;
      const timer = setTimeout(() => {
        cancel?.();
        resolve(pred());
      }, timeoutMs);
      cancel = this.watch(pred, () => {
        clearTimeout(timer);
        resolve(true);
      });
    });
  }

  /** Resolves with the element once it exists and is rendered, else null. */
  async waitFor(selector: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<HTMLElement | null> {
    await this.waitUntil(() => this.visible(selector) !== null, timeoutMs);
    return this.visible(selector);
  }

  /** Does the DOM show this step as done right now? */
  isDone(done: StepDone): boolean {
    if (done.appears && !this.visible(done.appears)) return false;
    if (done.disappears && this.visible(done.disappears)) return false;
    if (done.route && !new RegExp(done.route).test(this.path())) return false;
    if (done.storage && !this.readStorage(done.storage)) return false;
    return true;
  }

  /**
   * A predicate for watching a step's done condition. A `disappears` clause
   * only starts counting once the element has actually been on screen: a step
   * arms while its route is still rendering, and "not there yet" must not read
   * as "already done".
   */
  doneWatcher(done: StepDone): () => boolean {
    const gate = done.disappears;
    let seen = !gate;
    return () => {
      if (!seen) {
        if (gate && this.visible(gate)) seen = true;
        return false;
      }
      return this.isDone(done);
    };
  }

  /**
   * Is a modal sitting on top of this control? Asked of the point in its
   * middle: whatever answers there is what a visitor's click would reach.
   * The guide's own ring and pill do not count — the ring ignores pointer
   * events and the pill is the tour's own furniture.
   */
  coveredByModal(el: HTMLElement): boolean {
    // No overlay on the page, nothing can be covering anything: a selector
    // lookup is free, a hit test forces layout, and the spotlight asks this
    // question on every animation frame.
    if (!this.doc.querySelector('.cdk-overlay-pane')) return false;
    const box = el.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) return false;
    const view = this.doc.defaultView;
    const x = Math.min(Math.max(box.left + box.width / 2, 1), (view?.innerWidth ?? 1) - 1);
    const y = Math.min(Math.max(box.top + box.height / 2, 1), (view?.innerHeight ?? 1) - 1);
    let hit: Element | null = null;
    try {
      hit = this.doc.elementFromPoint(x, y);
    } catch {
      return false; // jsdom has no hit testing
    }
    if (!hit || hit === el || el.contains(hit) || hit.contains(el)) return false;
    if (hit.closest('[data-testid="guide-spot-next"], [data-testid="guide-shield"]')) return false;
    return !!hit.closest('.cdk-overlay-container');
  }

  /** The element if it is in the DOM and rendered, else null. */
  visible(selector: string): HTMLElement | null {
    const el = this.doc.querySelector(selector);
    if (!(el instanceof HTMLElement)) return null;
    return el.getClientRects().length > 0 ? el : null;
  }

  private async perform(action: GuideAction): Promise<boolean> {
    switch (action.kind) {
      case 'wait':
        await new Promise((resolve) => setTimeout(resolve, action.ms));
        return true;
      case 'waitFor':
        return (await this.waitFor(action.selector, action.timeoutMs)) !== null;
      case 'ensure': {
        if (this.visible(action.selector)) return true;
        await this.router.navigateByUrl(action.url);
        return (await this.waitFor(action.selector)) !== null;
      }
      case 'click': {
        const el = await this.waitFor(action.selector);
        if (!el) return false;
        // A control a modal covers cannot be pressed by a person, and pressing
        // it in code opens a second dialog on top of the first — which is what
        // happened when the visitor opened the upgrade dialog themselves and
        // then took the guide's offer. The step is already under way; skip it.
        if (this.coveredByModal(el)) return true;
        this.reveal(el);
        el.click();
        return true;
      }
      case 'fill': {
        const el = await this.waitFor(action.selector);
        if (!el) return false;
        return this.fill(el, action.value, action.overwrite !== true);
      }
      case 'fillFromStorage': {
        const el = await this.waitFor(action.selector);
        if (!el) return false;
        const value = this.readStorage(action.key, action.field);
        if (!value) return false;
        // Minted codes always replace what is there: a stale first code
        // must give way to the fresh one.
        return this.fill(el, value, false);
      }
      default:
        return false;
    }
  }

  private fill(el: HTMLElement, value: string, keepExisting: boolean): boolean {
    if (!(el instanceof HTMLInputElement) && !(el instanceof HTMLTextAreaElement)) return false;
    if (el.disabled || el.readOnly) return true;
    // The visitor may have done the step by hand before taking the guide's
    // offer, and then their text wins over the recipe's example — but only
    // while the application accepts it. Submitting a half-typed value on their
    // behalf fails the step and leaves the tour narrating a screen that never
    // happened (typing "526" into the NIP field used to do exactly that), so
    // a value the form rejects is replaced by the demo's own.
    if (keepExisting && el.value.trim() !== '' && !this.rejected(el)) return true;
    // Keep the caret where the visitor put it: taking focus away mid-sentence
    // is the other half of "weird things happen when I type".
    const hadFocus = this.doc.activeElement === el;
    if (!hadFocus) {
      this.reveal(el);
      el.focus();
    }
    const proto =
      el instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    if (setter) setter.call(el, value);
    else el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    if (!hadFocus) el.dispatchEvent(new Event('blur'));
    return true;
  }

  /** Does the form consider what is in this control wrong? Angular marks the
   * control invalid and Material mirrors it onto the input. */
  private rejected(el: HTMLElement): boolean {
    return el.getAttribute('aria-invalid') === 'true' || el.classList.contains('ng-invalid');
  }

  private readStorage(key: string, field?: string): string {
    try {
      const raw = this.doc.defaultView?.sessionStorage.getItem(key) ?? '';
      if (!field) return raw;
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const v = parsed?.[field];
      return typeof v === 'string' ? v : v == null ? '' : String(v);
    } catch {
      return '';
    }
  }

  private path(): string {
    return (this.router.url ?? '/').split('?')[0].split('#')[0];
  }

  /** Bring a control into view — but only when it is not already there, and
   * by gliding rather than teleporting. Filling a seven-field form used to
   * snap the page to each field in turn: 1359 px in a single frame, measured. */
  private reveal(el: HTMLElement): void {
    try {
      const box = el.getBoundingClientRect();
      const view = this.doc.defaultView;
      const height = view?.innerHeight ?? 0;
      const width = view?.innerWidth ?? 0;
      if (box.top >= 0 && box.left >= 0 && box.bottom <= height && box.right <= width) return;
      el.scrollIntoView({ block: 'center', behavior: scrollBehaviourFor(view) });
    } catch {
      /* jsdom has no layout — nothing to reveal */
    }
  }

  private frame(): Promise<void> {
    return new Promise((resolve) => this.nextFrame(() => resolve()));
  }

  /** Next animation frame, or 32 ms — whichever comes first. A backgrounded
   * tab stops painting, and a wait must still end. */
  private nextFrame(cb: () => void): void {
    let fired = false;
    const once = (): void => {
      if (fired) return;
      fired = true;
      cb();
    };
    this.zone.runOutsideAngular(() => {
      this.doc.defaultView?.requestAnimationFrame?.(once);
      setTimeout(once, 32);
    });
  }
}
