import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  NgZone,
  OnDestroy,
  Output,
  ViewChild,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoPipe } from '@ngneat/transloco';
import { GuideRunnerService } from '../../core/demo/guide-runner.service';
import { glideIntoView } from '../../core/demo/glide';

interface SpotRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

/** Where the pill sits relative to the ring. */
type Side = 'right' | 'left' | 'above' | 'below' | 'above-end' | 'below-end' | 'inside-end';

/** Ring padding around the control, in pixels. */
const PAD = 6;
/** Gap between the ring and the pill. */
const GAP = 8;
/** Keep the pill this far from the viewport edges. */
const EDGE = 8;
/** Fallbacks until the pill has been measured. */
const PILL_W = 180;
const PILL_H = 26;

/**
 * The pill with its words dropped — just the arrow. Inside a simulator card on
 * a phone the full pill has nowhere to go: the card fills the width, so every
 * side of the control it points at has copy on it, and the pill lands on a
 * sentence. A chip this size fits the gaps a 136 px pill cannot.
 *
 * These are constants rather than a measurement on purpose. Deciding
 * compactness from the *rendered* pill would feed back on itself — narrow
 * because compact, compact because narrow — and the pill would flicker between
 * the two on every placement.
 */
const CHIP_W = 30;
const CHIP_H = 22;

/** Where the full pill may go: always outside the control it points at. */
const OUTSIDE: readonly Side[] = ['right', 'left', 'above', 'below', 'above-end', 'below-end'];
/** The chip may also tuck into the control's own trailing edge. */
const CHIP_SIDES: readonly Side[] = [...OUTSIDE, 'inside-end'];
/** Below this distance from the top edge the pill cannot sit above the ring. */
const PILL_ROOM = 44;
/** A scroll gets this long to land before the ring gives up waiting for it. */
const SETTLE_MS = 700;
/** Frames of stillness before the pill is allowed to pick a new side. */
const STILL_FRAMES = 8;
/** A glide eases in, so its first frames barely move: two equal boxes there
 * are the start of a scroll, not the end of one. The settle check may not
 * read stillness until the glide has had this long to show its motion. */
const GLIDE_SHOW_MS = 100;
/** A control that is on the page but cannot be reached — behind a dialog, or
 * scrolled away — gets this long before the panel is told to take over. The
 * visitor can act on it themselves, so the alternative should come quickly. */
const MISS_MS = 500;
/** A control that is not on the page yet gets far longer. A route change, a
 * reload or a world simulator opening takes a moment to mount what the step
 * points at, and a Next button that flashes into the panel and straight back
 * out is its own kind of jitter — measured on the ksef beat, where the panel's
 * button appeared and was replaced by the pill while it was still animating
 * in (2026-09-04). Long enough to cover that, short enough to rescue a visitor
 * from a control that never arrives. */
const ABSENT_MS = 2000;

/**
 * The tour's spotlight: a ring around the control the current step waits for,
 * carrying the only "next" control the guided demo has — a pill that performs
 * the step in the real application and moves the tour on (owner, 2026-09-04:
 * "the next button should be a button around the thing that runs the app").
 * The narration panel then only ever describes the step the visitor is on.
 *
 * Both are positioned by writing a transform straight to the element from a
 * `requestAnimationFrame` loop that runs OUTSIDE Angular. Nothing about
 * following a control goes through change detection, so a scroll costs the
 * application nothing per frame; measured before this, one 600 px scroll ran
 * 60 change-detection passes and 249 hit tests, and the ring visibly trailed
 * the control it was pointing at.
 *
 * The pill keeps its side while the page moves and only asks the page for a
 * free spot when the layout actually changes — the control resizes, the
 * viewport resizes, or the page has been still for a few frames. Asking on
 * every frame made it hop around the control while someone was typing.
 *
 * A step's control is scrolled into view smoothly, with the ring held back
 * until the page has landed: measuring mid-glide is what painted the ring at
 * positions the page had already left.
 *
 * While the guide performs a step the ring hides and a transparent shield
 * covers the page: scripted clicks must not race the visitor's own. Keyboard
 * input is swallowed for the same reason (Escape excepted); the recipe types
 * through the native value setter, not through key events, so it is
 * unaffected. The shield sits under the guide panel, so restart and exit stay
 * reachable.
 *
 * Accessibility note: inside an open Material dialog everything outside the
 * overlay is `aria-hidden` and focus is trapped, so the pill is unreachable
 * for screen-reader and keyboard visitors on those steps. They act on the
 * dialog itself and the director's done-watcher advances the tour.
 */
@Component({
  selector: 'app-guide-spotlight',
  imports: [MatIconModule, TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (working()) {
      <div
        class="fixed inset-0 z-[99989] cursor-progress"
        aria-busy="true"
        data-testid="guide-shield"
      ></div>
    }
    @if (visible()) {
      <div
        #ring
        class="guide-spot pointer-events-none fixed left-0 top-0 z-[99985] rounded-xl outline outline-2 outline-coral-500"
        data-testid="guide-spotlight"
      ></div>
      <button
        #pill
        type="button"
        (click)="act.emit()"
        [attr.aria-label]="(_acts() ? 'demo.guide.clickHere' : 'demo.guide.next') | transloco"
        data-testid="guide-spot-next"
        class="guide-pill fixed left-0 top-0 z-[99986] inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-coral-700 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-white shadow-lg transition-colors hover:bg-coral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-300"
        [class.px-2.5]="!compact()"
        [class.px-1.5]="compact()"
      >
        @if (!compact()) {
          {{ (_acts() ? 'demo.guide.clickHere' : 'demo.guide.next') | transloco }}
        }
        <!-- A trailing call-to-action glyph, the way the product uses it
             everywhere else — including the guide panel's own "Dalej →" a few
             inches away. One reviewer read it as a pointer aimed away from the
             control and I turned it around; a second measured the convention,
             cited "Dalej →" and "Dołącz za darmo →", and was right. Turned back,
             and the disagreement is why the second reader is worth having. -->
        <mat-icon class="!h-3.5 !w-3.5 !text-sm">arrow_forward</mat-icon>
      </button>
    }
  `,
  styles: [
    `
      /* Both start invisible: the element exists one frame before the loop has
         a position for it, and a ring flashing at the corner is exactly the
         kind of jitter this component is here to avoid. */
      .guide-spot,
      .guide-pill {
        opacity: 0;
        will-change: transform;
      }

      .guide-spot {
        animation: guideSpot 1.4s ease-in-out infinite;
      }

      @keyframes guideSpot {
        0%,
        100% {
          box-shadow: 0 0 0 0 rgba(255, 90, 54, 0.45);
        }
        50% {
          box-shadow: 0 0 0 8px rgba(255, 90, 54, 0);
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .guide-spot {
          animation: none;
        }
      }
    `,
  ],
})
export class GuideSpotlightComponent implements OnDestroy {
  private readonly doc = inject(DOCUMENT);
  private readonly zone = inject(NgZone);
  private readonly runner = inject(GuideRunnerService);

  @ViewChild('ring') private ringRef?: ElementRef<HTMLElement>;
  @ViewChild('pill') private pillRef?: ElementRef<HTMLElement>;

  private readonly _target = signal<string | undefined>(undefined);
  private readonly _busy = signal(false);
  private readonly _settling = signal(false);

  /** Selector of the control this step waits for; empty = nothing to point at. */
  @Input() set target(value: string | undefined) {
    this._target.set(value || undefined);
  }

  /** The guide is performing the step: ring off, page shielded. */
  @Input() set busy(value: boolean) {
    this._busy.set(value);
  }

  /**
   * The recipe has run and the application has not confirmed yet: ring off,
   * page NOT shielded.
   *
   * There is nothing for the visitor to press in this window, and a ring that
   * keeps tracking through it follows the page as it rearranges itself around
   * the outcome. At the end of the 2FA tour the dialog's error row cleared, the
   * field it marked moved 23 px down, and the ring dutifully re-placed onto it
   * about thirty milliseconds before the dialog unmounted — a spotlight on a
   * control nobody was being asked to use, drawn across a dialog on its way
   * out. Shielding here would be wrong: waiting is not working, and the page
   * was deliberately left interactive during it.
   */
  @Input() set settling(value: boolean) {
    this._settling.set(value);
  }

  /**
   * Whether pressing does anything in the application, or only moves the tour on.
   *
   * A beat with a ring and no recipe rings the thing to READ, and a pill on it
   * saying "kliknij tutaj" promises an action it does not perform.
   */
  @Input() set acts(value: boolean) {
    this._acts.set(value);
  }
  protected readonly _acts = signal(true);

  /** The visitor took the guide's offer — run this step and move on. */
  @Output() readonly act = new EventEmitter<void>();

  /** Whether the control is on screen. The panel keeps a Next button of its
   * own whenever it is not, so a missing, covered or scrolled-away control can
   * never leave the tour without a way forward. */
  @Output() readonly found = new EventEmitter<boolean>();

  /**
   * Whether the pill is on the screen this instant, with none of `found`'s
   * grace.
   *
   * `found` deliberately keeps saying yes for a second or two after a control
   * goes, because a control that has just gone is usually a control that is
   * about to come back somewhere else, and a Next that appears and is swapped
   * for the pill is its own jitter. But when a step has already failed and the
   * guide is asking the visitor to press again, that grace is a second and a
   * half in which the pill has gone, the panel has not taken over, and the only
   * thing on screen is a message telling them to do something they cannot do.
   */
  @Output() readonly drawing = new EventEmitter<boolean>();

  /** Whether the ring and its pill are in the DOM at all. */
  readonly visible = signal(false);
  /** The pill drops its words when they would land on the page's own. */
  protected readonly compact = signal(false);
  /** The pill's width with its words on — see CHIP_W for why this is cached. */
  /** Is this control inside an overlay that is still fading in or out? */
  private inFadingOverlay(el: Element): boolean {
    const view = this.doc.defaultView;
    if (!view) return false;
    const pane = el.closest('.cdk-overlay-pane');
    if (!pane) return false;
    const opacity = Number(view.getComputedStyle(pane).opacity);
    return Number.isFinite(opacity) && opacity < 0.99;
  }

  /**
   * The rectangle actually showing this control: the nearest ancestor that
   * clips its overflow, intersected with the window.
   */
  private clipper(el: Element): { left: number; top: number; right: number; bottom: number } {
    const view = this.doc.defaultView;
    let box = {
      left: 0,
      top: 0,
      right: view?.innerWidth ?? 0,
      bottom: view?.innerHeight ?? 0,
    };
    // Which ancestor clips this control is cached per control, because finding
    // it means asking the page for a computed style on every ancestor until one
    // says it clips — and this runs inside the loop, on every frame. Uncached it
    // roughly doubled the worst frame of a tour, from 145 ms to a number that
    // sat on the 250 ms budget and failed about a third of the time. The
    // ancestor's BOX is still read every frame; only the search is cached.
    if (this.clipOf?.el !== el) {
      let found: HTMLElement | null = null;
      for (let node = el.parentElement; node; node = node.parentElement) {
        const style = view?.getComputedStyle(node);
        if (!style) break;
        if (/(auto|scroll|hidden|clip)/.test(style.overflowX + style.overflowY)) {
          found = node;
          break;
        }
      }
      this.clipOf = { el, node: found };
    }
    const node = this.clipOf.node;
    if (node) {
      const b = node.getBoundingClientRect();
      box = {
        left: Math.max(box.left, b.left),
        top: Math.max(box.top, b.top),
        right: Math.min(box.right, b.right),
        bottom: Math.min(box.bottom, b.bottom),
      };
    }
    return box;
  }

  /** The clipping ancestor last found, and the control it was found for. */
  private clipOf: { el: Element; node: HTMLElement | null } | null = null;

  private fullBox: { width: number; height: number } | null = null;
  readonly working = this._busy.asReadonly();

  private frame: number | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private revealPending: string | undefined;
  private revealedFor: string | undefined;
  private settleDeadline = 0;
  /** When the current glide was started; see GLIDE_SHOW_MS. */
  private glideSince = 0;
  private lastGlideBox: SpotRect | null = null;
  /** The ring as drawn — the control's box cut down to what is showing. */
  private rect: SpotRect | null = null;
  /** The panel the control lives on, when it lives on one: a dialog, a sheet. */
  private surface: { left: number; top: number; right: number; bottom: number } | null = null;
  /** The control's own box, uncut. Only this answers "did the layout change". */
  private shape: SpotRect | null = null;
  private side: Side | null = null;
  private placedFor: SpotRect | null = null;
  private stillFrames = 0;
  private missSince: number | null = null;
  private viewport = { width: 0, height: 0 };
  private painted = { width: 0, height: 0 };
  private paintedOnce = false;
  /** What the guide was last told; null until the first report. A control
   * that was never found still has to be reported gone once its grace is
   * over — starting this at false swallowed exactly that report, and a page
   * reloaded mid-tour kept saying "click here" over nothing (owner,
   * 2026-09-07). */
  private onScreen: boolean | null = null;

  constructor() {
    effect(() => {
      const off = this._busy() || this._settling();
      const target = this._target();
      untracked(() => (off ? this.pause() : this.follow(target)));
    });
    effect(() => {
      const busy = this._busy();
      untracked(() => this.guardKeys(busy));
    });
  }

  ngOnDestroy(): void {
    this.follow(undefined);
    this.guardKeys(false);
  }

  /** The guide is performing the step: the ring comes off, but the panel's
   * view of it is left alone. A Next button that appears for the length of a
   * recipe and vanishes when the ring returns is the flicker all of this
   * grace exists to prevent. */
  private pause(): void {
    this.stop();
    this.hide(Infinity);
  }

  private follow(selector: string | undefined): void {
    this.stop();
    this.missSince = null;
    if (!selector || !this.doc.defaultView) {
      this.revealedFor = undefined;
      this.hide(); // a step with nothing to point at, said at once
      return;
    }
    // A new step's control is usually a frame or two away. Until measure()
    // has waited out its grace the panel keeps the benefit of the doubt.
    this.hide(Infinity);
    // Scroll to a control once per step. Coming back from a recipe is not a
    // new step, and re-scrolling to a control that never moved reads as a jump.
    if (selector !== this.revealedFor) {
      this.revealPending = selector;
      this.revealedFor = selector;
    }
    const tick = (): void => {
      this.measure(selector);
      this.schedule(tick);
    };
    this.zone.runOutsideAngular(() => this.schedule(tick));
  }

  /** Next frame, or 100 ms — whichever comes first. A backgrounded tab stops
   * painting altogether, and the ring must be in place the moment the visitor
   * comes back to it. */
  private schedule(tick: () => void): void {
    const view = this.doc.defaultView;
    if (!view) return;
    let fired = false;
    const once = (): void => {
      if (fired) return;
      fired = true;
      tick();
    };
    this.frame = view.requestAnimationFrame?.(once) ?? null;
    this.timer = setTimeout(once, 100);
  }

  private measure(selector: string): void {
    const found = this.doc.querySelector(selector);
    if (!(found instanceof HTMLElement) || found.getClientRects().length === 0) {
      this.hide(ABSENT_MS); // not mounted yet — the step is still arriving
      return;
    }
    // Ring the control the visitor sees, not the node the recipe types into.
    //
    // A step points at a field by the input's own testid, because that is what
    // a recipe can fill. But a Material field draws its border around the whole
    // form field, and the input inside it sits eight pixels in — so the ring,
    // six pixels outside the input, landed INSIDE the field's own outline, with
    // a stadium radius against the field's square corners. A reviewer measured
    // it on the 2FA code field and said it read as one thick uneven double line
    // rather than as a highlight, for seven of that film's twenty-six seconds.
    // The same ring on a plain button, six pixels clear of it, looks right.
    //
    // The wrapper and not `mat-form-field` itself: measured on that dialog, the
    // input is 454-986 x 438-462, the wrapper — the element carrying the visible
    // outline — is 438-1002 x 422-478, and `mat-form-field` is 22 px taller
    // again because it also holds the hint and error line under the box. Ringing
    // that would draw a highlight around a border and the words below it.
    const el =
      (found.closest('.mat-mdc-text-field-wrapper, mat-form-field') as HTMLElement | null) ?? found;
    const pane = el.closest('.cdk-overlay-pane, mat-dialog-container');
    this.surface = pane ? pane.getBoundingClientRect() : null;
    // A dialog on top of the control is the same as no control: the plan
    // upgrade opens one directly over its own button, and a ring floating over
    // a modal that points at something behind it is worse than no ring at all.
    if (this.runner.coveredByModal(el)) {
      this.hide(MISS_MS);
      return;
    }
    if (this.revealPending === selector) {
      this.revealPending = undefined;
      this.settleDeadline = this.now() + SETTLE_MS;
      this.glideSince = this.now();
      this.lastGlideBox = null;
      try {
        // The glide is the ring's own motion budget: it knows how long the
        // target will keep moving and waits that long before settling.
        const glide = this.zone.runOutsideAngular(() => glideIntoView(el));
        this.settleDeadline = this.now() + Math.max(SETTLE_MS, glide + 150);
      } catch {
        /* jsdom has no layout */
      }
      return;
    }

    // A dialog that is fading is a dialog whose layout is still moving, and a
    // ring painted onto it is drawn at a size the control does not really have.
    // At the end of the 2FA tour that produced one frame in which the ring sat
    // across a half-dissolved dialog, wider than the field it marked, with its
    // corner hooked into the floating label — the last visible fault in the
    // sandbox and the one a reviewer objected to twice.
    //
    // Opacity covers both directions, so this also keeps the guide off a dialog
    // that is still arriving, which is what it already does everywhere else.
    if (this.inFadingOverlay(el)) {
      this.hide(MISS_MS);
      return;
    }

    const box = el.getBoundingClientRect();
    // Clipped to whatever is actually clipping the control.
    //
    // A ring is a closed rectangle or it looks broken, and the admin ticket
    // rows are wider than the scrolling card that holds them: the row measures
    // to 1466 px inside a 1440 px window, so the ring ran off the right of the
    // screen and its fourth side was never drawn. Ringing the visible part of a
    // control is the honest thing anyway — that is the part a visitor can press.
    const clip = this.clipper(el);
    const left = Math.max(box.left, clip.left);
    const top = Math.max(box.top, clip.top);
    const right = Math.min(box.right, clip.right);
    const bottom = Math.min(box.bottom, clip.bottom);
    const next: SpotRect = {
      top: top - PAD,
      left: left - PAD,
      width: Math.max(0, right - left) + PAD * 2,
      height: Math.max(0, bottom - top) + PAD * 2,
    };
    // The control's own box, before the clip. What the visitor sees is `next`;
    // what the layout is doing is this. Keeping them apart is what stops a
    // scroll from being read as the page rearranging itself — see below.
    const shape: SpotRect = {
      top: box.top - PAD,
      left: box.left - PAD,
      width: box.width + PAD * 2,
      height: box.height + PAD * 2,
    };
    if (!this.landed(next)) return; // the page is still gliding
    // Nothing of it is showing. An empty intersection is not a small ring at
    // the edge of the card that swallowed it — a control scrolled out of the
    // pane that holds it is exactly as absent as one that is off the window,
    // and leaving a 12 px stub behind at the boundary would be a mark drawn
    // around nothing.
    if (right <= left || bottom <= top || this.offScreen(next)) {
      this.hide(MISS_MS);
      return;
    }
    this.missSince = null;
    this.report(true);

    const view = this.doc.defaultView;
    const width = view?.innerWidth ?? 0;
    const height = view?.innerHeight ?? 0;
    // Asked of the control, not of the part of it that happens to be showing.
    //
    // Clipping made the drawn ring change size on every frame of a scroll — the
    // visible slice of a row grows and shrinks as it passes the edge of its
    // pane — and "the ring changed size" is what tells the pill to ask the page
    // again which side is free. So a single 600 px scroll went from 8 hit tests
    // to 144, and the cost the placement code was written to avoid came
    // straight back. The control itself does not resize while you scroll past
    // it; the question is asked of that.
    const resized =
      !this.shape ||
      Math.abs(this.shape.width - shape.width) >= 2 ||
      Math.abs(this.shape.height - shape.height) >= 2;
    const viewportChanged = width !== this.viewport.width || height !== this.viewport.height;
    this.stillFrames = this.rect && !this.moved(this.rect, next) ? this.stillFrames + 1 : 0;
    const drifted =
      !this.placedFor ||
      Math.abs(this.placedFor.left - next.left) >= 4 ||
      Math.abs(this.placedFor.top - next.top) >= 4;
    // Choosing a side means asking the page what is where, which is the
    // expensive part; only the layout changing is a reason to ask again.
    if (!this.side || resized || viewportChanged || (drifted && this.stillFrames >= STILL_FRAMES)) {
      this.side = this.choose(next, width);
      this.placedFor = next;
    }

    const changed = !this.rect || this.moved(this.rect, next) || resized;
    this.rect = next;
    this.shape = shape;
    this.viewport = { width, height };
    if (!this.visible()) {
      // The elements are created on the next change detection; the frame after
      // that puts them where they belong.
      this.zone.run(() => {
        this.visible.set(true);
        this.drawing.emit(true);
      });
      return;
    }
    if (!this.paintedOnce) {
      // The side was chosen before the pill existed, from a guessed width; now
      // that it is rendered, choose once more from its real one.
      this.side = this.choose(next, width);
      this.placedFor = next;
    }
    // The first paint after the elements appear is never a "change": the rect
    // was already known when they were asked for.
    if (changed || !this.paintedOnce) this.paint(next);
  }

  /** Position both elements without touching Angular. */
  private paint(rect: SpotRect): void {
    const ring = this.ringRef?.nativeElement;
    const pill = this.pillRef?.nativeElement;
    if (!ring || !pill) return;
    // Whole pixels: a composited layer moved to a fractional offset is
    // resampled, and the pill's 10 px capitals came out soft at 100 % zoom
    // (owner, 2026-09-07).
    ring.style.transform = `translate3d(${Math.round(rect.left)}px, ${Math.round(rect.top)}px, 0)`;
    if (this.painted.width !== rect.width || this.painted.height !== rect.height) {
      ring.style.width = `${rect.width}px`;
      ring.style.height = `${rect.height}px`;
      this.painted = { width: rect.width, height: rect.height };
    }
    const spot = this.spotFor(rect, this.side ?? 'above', this.pillBox(pill));
    pill.style.transform = `translate3d(${Math.round(spot.left)}px, ${Math.round(spot.top)}px, 0)`;
    ring.style.opacity = '1';
    pill.style.opacity = '1';
    this.paintedOnce = true;
  }

  /** Has the smooth scroll landed? Two identical frames say yes; so does the
   * deadline, for a page that never stops moving. */
  private landed(rect: SpotRect): boolean {
    if (this.settleDeadline === 0) return true;
    // Measured on the campaign form: the publish button sat 1685 px down, the
    // glide's first two frames moved it less than half a pixel, that read as
    // landed, the control was then off screen for 500 ms of grace, and the
    // panel handed out a Next that the pill replaced 300 ms later when the
    // button arrived. The smoothness tier calls that a step changing its way
    // forward, and it is.
    const showing = this.now() - this.glideSince >= GLIDE_SHOW_MS;
    const still = showing && this.lastGlideBox !== null && !this.moved(this.lastGlideBox, rect);
    this.lastGlideBox = rect;
    if (still || this.now() >= this.settleDeadline) {
      this.settleDeadline = 0;
      return true;
    }
    return false;
  }

  /** A control the visitor would have to scroll to find is not on screen. */
  private offScreen(rect: SpotRect): boolean {
    const view = this.doc.defaultView;
    if (!view) return false;
    return (
      rect.top + rect.height <= 0 ||
      rect.left + rect.width <= 0 ||
      rect.top >= view.innerHeight ||
      rect.left >= view.innerWidth
    );
  }

  /**
   * Beside the ring when nothing is there, else above it, else below. A
   * floating affordance always covers something; asking the page which spot
   * is empty is what keeps it off the form the visitor is reading.
   */
  private choose(rect: SpotRect, viewWidth: number): Side {
    const width = viewWidth || Number.POSITIVE_INFINITY;
    // Measured only while the pill still has its words — once it is a chip its
    // own box would be the wrong question to ask (see CHIP_W).
    const pill = this.pillRef?.nativeElement;
    if (pill && !this.compact()) this.fullBox = this.pillBox(pill);
    const full = this.fullBox ?? { width: PILL_W, height: PILL_H };

    const whole = this.bestSide(rect, full, width, OUTSIDE);
    if (whole && whole.cost === 0) {
      this.setCompact(false);
      return whole.side;
    }
    // Nothing fits with the words on. Ask the same question of the chip before
    // settling for covering something — and let the chip use the one place the
    // full pill may not: inside the highlighted control itself.
    const chip = this.bestSide(rect, { width: CHIP_W, height: CHIP_H }, width, CHIP_SIDES, rect);
    if (chip && chip.cost === 0) {
      this.setCompact(true);
      return chip.side;
    }
    // Still nothing clear: take whichever covers least, words and all.
    this.setCompact(false);
    return whole?.side ?? (rect.top >= PILL_ROOM ? 'above' : 'below');
  }

  /** The cheapest side for a box of this size, or null if none can be placed. */
  private bestSide(
    rect: SpotRect,
    box: { width: number; height: number },
    width: number,
    order: readonly Side[],
    freeInside?: SpotRect,
  ): { side: Side; cost: number } | null {
    let best: { side: Side; cost: number } | null = null;
    for (const side of order) {
      const spot = this.spotFor(rect, side, box);
      if (spot.left < EDGE || spot.left + box.width + EDGE > width || spot.top < EDGE) continue;
      const cost = this.covers(spot, box, freeInside) + this.offSurface(spot, box);
      if (cost === 0) return { side, cost };
      if (!best || cost < best.cost) best = { side, cost };
    }
    return best;
  }

  /**
   * What a pill costs by hanging off the edge of the panel it belongs to.
   *
   * On the 2FA step the field runs nearly the width of its dialog, so the only
   * side with nothing under it was the one outside — and the pill was laid out
   * at 1016-1148 against a dialog ending at 1026, a fifth of it on the white
   * card and the rest on the dimmed page behind. It is legible against both and
   * belongs to neither. Two, deliberately: worse than resting on a word, better
   * than covering a control. Where every side is off the edge this changes
   * nothing, which is the right answer for a panel narrower than the pill.
   */
  private offSurface(
    at: { top: number; left: number },
    box: { width: number; height: number },
  ): number {
    const s = this.surface;
    if (!s) return 0;
    const inside =
      at.left >= s.left &&
      at.left + box.width <= s.right &&
      at.top >= s.top &&
      at.top + box.height <= s.bottom;
    return inside ? 0 : 2;
  }

  private setCompact(next: boolean): void {
    if (this.compact() !== next) this.zone.run(() => this.compact.set(next));
  }

  private spotFor(
    rect: SpotRect,
    side: Side,
    box: { width: number; height: number },
  ): { top: number; left: number } {
    const middle = Math.max(EDGE, rect.top + rect.height / 2 - box.height / 2);
    switch (side) {
      case 'right':
        return { top: middle, left: rect.left + rect.width + GAP };
      case 'left':
        return { top: middle, left: rect.left - GAP - box.width };
      case 'below':
        return { top: rect.top + rect.height + GAP, left: Math.max(EDGE, rect.left) };
      case 'above-end':
        return { top: rect.top - box.height - 4, left: rect.left + rect.width - box.width };
      case 'below-end':
        return { top: rect.top + rect.height + GAP, left: rect.left + rect.width - box.width };
      // Tucked inside the trailing edge of the control the ring is already
      // drawing attention to. Offered to the chip only: the one thing a chip
      // may sit on is the very control the visitor is being told to press,
      // since pressing the chip does that step anyway.
      case 'inside-end':
        return {
          top: rect.top + rect.height / 2 - box.height / 2,
          left: rect.left + rect.width - box.width - PAD,
        };
      default:
        return { top: rect.top - box.height - 4, left: Math.max(EDGE, rect.left) };
    }
  }

  private pillBox(pill: HTMLElement): { width: number; height: number } {
    const box = pill.getBoundingClientRect();
    return { width: box.width || PILL_W, height: box.height || PILL_H };
  }

  /**
   * How much of what the visitor needs to see or press would that box cover?
   * 0 means nothing — the only answer `choose` accepts outright; anything
   * higher is a cost it compares against the other sides.
   */
  private covers(
    at: { top: number; left: number },
    box: { width: number; height: number },
    freeInside?: SpotRect,
  ): number {
    // The whole box, not a line through the middle of it. Sampling only the
    // centre row let the pill sit with its top band over a paragraph and its
    // middle over the gap below it: on a phone the inbox beat put the pill
    // across the last line of the mail (measured 130x8 px) and the KSeF beat
    // across the "Status" label, because the text ended 3 px above the one row
    // this asked about.
    const ys = [at.top + 2, at.top + box.height / 2, at.top + box.height - 2];
    // Spaced closely enough that a short word cannot fall between two probes.
    // Three columns across a 136 px pill sit ~64 px apart, and that is exactly
    // how the KSeF "Status" label — 44 px wide, spanning x 48-92, with probes at
    // 34, 97 and 161 — went unseen while the pill was drawn straight over it.
    const cols = Math.max(3, Math.ceil(box.width / 18));
    const span = box.width - 8;
    const xs = Array.from({ length: cols }, (_, i) => at.left + 4 + (span * i) / (cols - 1));
    let cost = 0;
    for (const y of ys) {
      for (const x of xs) {
        const inside =
          !!freeInside &&
          x >= freeInside.left &&
          x <= freeInside.left + freeInside.width &&
          y >= freeInside.top &&
          y <= freeInside.top + freeInside.height;
        let el: Element | null = null;
        try {
          el = this.doc.elementFromPoint(x, y);
        } catch {
          return 0; // jsdom has no hit testing — nothing to avoid there
        }
        if (!el || el === this.doc.body || el === this.doc.documentElement) continue;
        if (el.closest('[data-testid="guide-spot-next"], [data-testid="guide-shield"]')) continue;
        // Inside the ring, the chip may rest on the control this step is about —
        // that is the whole point of the tucked-in placement — but not on its
        // words. It landed on the trailing edge of "Przejdź do płatności" and
        // took the final letter off it, which a reviewer caught by magnifying
        // the button and comparing it against the same button five seconds
        // earlier. So a control inside the ring is free and text inside it is
        // not.
        const words = el.childElementCount === 0 && (el.textContent ?? '').trim() !== '';
        if (inside) {
          if (words) cost += 1;
          continue;
        }
        // A word the pill sits on can still be read around; a control it sits
        // on cannot be pressed at all, so covering one costs more.
        if (el.closest('button, a, input, textarea, select, [role="button"], mat-form-field')) {
          cost += 3;
        } else if (words) {
          cost += 1;
        }
      }
    }
    return cost;
  }

  /** Sub-pixel churn would repaint the ring every frame for nothing. */
  private moved(a: SpotRect, b: SpotRect): boolean {
    return (
      Math.abs(a.top - b.top) >= 0.5 ||
      Math.abs(a.left - b.left) >= 0.5 ||
      Math.abs(a.width - b.width) >= 0.5 ||
      Math.abs(a.height - b.height) >= 0.5
    );
  }

  private hide(graceMs = 0): void {
    if (this.visible()) {
      this.zone.run(() => {
        this.visible.set(false);
        this.drawing.emit(false);
      });
    }
    this.rect = null;
    this.shape = null;
    this.surface = null;
    this.side = null;
    this.placedFor = null;
    this.painted = { width: 0, height: 0 };
    this.paintedOnce = false;
    this.stillFrames = 0;
    // Give the page its grace before handing the tour back to the panel.
    if (graceMs > 0) {
      this.missSince ??= this.now();
      if (this.now() - this.missSince < graceMs) return;
    }
    this.report(false);
  }

  /** Emit only when the answer changes; the loop asks on every frame. */
  private report(on: boolean): void {
    if (this.onScreen === on) return;
    this.onScreen = on;
    this.zone.run(() => this.found.emit(on));
  }

  private now(): number {
    return this.doc.defaultView?.performance?.now() ?? Date.now();
  }

  private stop(): void {
    if (this.frame !== null) {
      this.doc.defaultView?.cancelAnimationFrame?.(this.frame);
      this.frame = null;
    }
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private guardKeys(on: boolean): void {
    if (on) this.doc.addEventListener('keydown', this.swallow, true);
    else this.doc.removeEventListener('keydown', this.swallow, true);
  }

  private readonly swallow = (event: Event): void => {
    // Escape always gets through: it is the visitor's way out of a dialog,
    // and a recipe that loses a step to it times out anyway.
    if ((event as KeyboardEvent).key === 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
  };
}
