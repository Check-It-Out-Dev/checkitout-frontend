import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  PLATFORM_ID,
  type WritableSignal,
  computed,
  inject,
  signal,
} from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { TranslocoModule } from '@ngneat/transloco';
import { DashboardPostMockComponent } from './dashboard-post-mock.component';

/** Chip temperature: waiting (pending), fresh news (alert), settled (done). */
type Tone = 'active' | 'alert' | 'pending' | 'done';

/** The two cards' chip tone at each beat. */
const TONES: Record<string, { brand: Tone; influencer: Tone }> = {
  campaign_created: { brand: 'active', influencer: 'active' },
  influencer_application: { brand: 'alert', influencer: 'active' },
  review_selection: { brand: 'active', influencer: 'done' },
  agreement_planning: { brand: 'done', influencer: 'done' },
  content_creation: { brand: 'pending', influencer: 'active' },
  content_approval: { brand: 'done', influencer: 'done' },
  publication_results: { brand: 'done', influencer: 'done' },
};

/** How long a message takes to cross from one pane to the other. The
 * receiving pane's tiles hold their entry until it lands; the CSS keyframes
 * carry the same number. */
const FLIGHT_MS = 700;
/** Having landed, the cargo dissolves into the receiver's tile over this long. */
const ABSORB_MS = 260;
/** The cargo's whole life: appear (105 ms), cross, land, dissolve — one animation. */
const CARGO_MS = FLIGHT_MS + ABSORB_MS;
/* The two inner moments as keyframe selectors, percentages of CARGO_MS.
   Written out, not computed: a component's styles must evaluate statically,
   and a call in the template literal leaves the compiler with the last good
   build. The sandbox tier pins them — at 105 ms the cargo is whole and
   unmoved, at 700 ms flush with the receiver. */
const APPEAR_PCT = '10.9375%'; // 105 / 960
const LAND_PCT = '72.9167%'; // 700 / 960

/** The narration badge per beat: the icon, and whose move it is. */
const BADGES: Record<string, { icon: string; actor: 'brand' | 'influencer' }> = {
  campaign_created: { icon: 'campaign', actor: 'brand' },
  influencer_application: { icon: 'send', actor: 'influencer' },
  review_selection: { icon: 'fact_check', actor: 'brand' },
  agreement_planning: { icon: 'handshake', actor: 'brand' },
  content_creation: { icon: 'videocam', actor: 'influencer' },
  content_approval: { icon: 'verified', actor: 'brand' },
  publication_results: { icon: 'insights', actor: 'influencer' },
};

/**
 * Interactive dashboard preview — the landing's "watch a collaboration
 * happen" widget. Two modes:
 *
 *   • overview   — the static tableau: the two panes settled on the finished
 *     collaboration, the seven steps all done. No timers.
 *   • simulation — the guided run: it starts playing the moment the visitor
 *     opens it (owner, 2026-09-04: the presentation must run, not wait for
 *     clicks), one beat per hold, with pause / step / reset controls.
 *
 * THE STAGE. Everything renders inside one <article> whose height does not
 * change at lg — not between beats, and not at the finale. Before this the
 * component was a content-sized three-column grid: the middle column stacked
 * seven steps with their descriptions and set the height of everything
 * (~800 px, taller than a 768-px laptop with the toolbar), the controls sat at
 * the bottom of that column, and the finale replaced the whole grid with a
 * small card, so the section dropped by ~500 px and visitors thought the
 * component had vanished. Now: a transport bar on top (play / pause, the seven
 * step pills — clickable — with the countdown inside the active one, the
 * step's action), the brand pane and the influencer pane as product windows,
 * and a channel between them that carries the narration. The finale takes the
 * bar's row and the channel; the panes stay on their last beat.
 *
 * Both panes play the beat: the brand pane counts applications, picks a
 * candidate, signs the terms, stamps the approval and closes with the result
 * tile; the influencer pane starts with her browsing the campaign, applies,
 * accepts, produces the reel and ends on published metrics. The beat blocks
 * stay mounted across beats (only the tile inside is swapped), because
 * re-creating them blinked to nothing on every beat. All motion is dropped
 * under `prefers-reduced-motion`.
 *
 * Fitting the budget: the brand's brief shows only while the campaign is being
 * set up and applied to (beats 0–1, and the overview), the influencer's stat
 * tiles only until the agreement (beats 0–3, and the overview) — from there
 * the chapter's content takes the room. `overflow-hidden` on the panes plus a
 * sandbox assertion keep any beat from growing past the stage.
 *
 * The autoplay timer starts ONLY from click handlers, so the prerendered
 * route never runs a timer during SSR; ngOnDestroy, every mode/reset
 * transition and a hidden tab clear it.
 */
@Component({
  selector: 'app-interactive-dashboard-preview',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIconModule, RouterLink, TranslocoModule, DashboardPostMockComponent],
  templateUrl: './interactive-dashboard-preview.component.html',
  styles: `
    /* Tailwind's preflight is off in this app, so headings, paragraphs and
       lists keep their user-agent margins unless something removes them. In a
       stage with a fixed height every one of those margins is unbudgeted
       height: a tile's <p> at 24 px carried 24 px above and below, the step
       row's <ol> carried 16 px each way and made the bar 80 px instead of 56.
       Measured, not guessed — see e2e-tests/sandbox/dashboard-preview.spec.ts.
       Scoped to this component by emulated encapsulation. */
    h3,
    p,
    ol,
    ul,
    dl,
    dd,
    dt {
      margin: 0;
    }
    ol,
    ul {
      padding: 0;
      list-style: none;
    }

    /* Each beat's tile enters; staggered children add their own delay. It
       starts part-visible on purpose — from zero it read as a blink.
       \`--land\` is set by the pane: the flight's length when the pane is the
       receiver, so the tile holds its \`from\` state (fill-mode both) until
       the cargo arrives and then enters. \`--stagger\` is per child. */
    .beat-enter {
      animation: beat-enter 200ms ease-out both;
      animation-delay: calc(var(--land, 0ms) + var(--stagger, 0ms));
    }

    /* The cargo. The lane is a size container, so travel is written in its
       own units — the lane's length less the cargo's — and the message lands
       flush with the far edge whatever the channel measures. At lg the lane is
       a strip across the channel and the message goes left or right; below lg
       the panes stack, the lane stands on end, and it goes down (brand →
       influencer) or up. Having landed it dissolves as the receiver's tile
       enters: the message is consumed, not left lying on the pane. Transform
       and opacity only.

       One animation per rule, on purpose. The dissolve used to be a second
       name in the \`animation-name\` list, and the production build scoped
       only the first name inside the @media block — the dev server scoped
       both, so every test passed while the live site kept the cargo. Appear,
       cross, land and dissolve are one set of keyframes; the fade's segment
       carries its own timing function. */
    .flight-lane {
      container-type: size;
    }
    .flight[data-direction='ltr'] {
      top: 0;
      left: 50%;
      animation: flight-down ${CARGO_MS}ms cubic-bezier(0.4, 0, 0.2, 1) both;
    }
    .flight[data-direction='rtl'] {
      bottom: 0;
      left: 50%;
      animation: flight-up ${CARGO_MS}ms cubic-bezier(0.4, 0, 0.2, 1) both;
    }
    @media (min-width: 1280px) {
      .flight[data-direction='ltr'] {
        top: 0;
        left: 0;
        animation: flight-ltr ${CARGO_MS}ms cubic-bezier(0.4, 0, 0.2, 1) both;
      }
      .flight[data-direction='rtl'] {
        top: 0;
        bottom: auto;
        left: auto;
        right: 0;
        animation: flight-rtl ${CARGO_MS}ms cubic-bezier(0.4, 0, 0.2, 1) both;
      }
    }
    @keyframes flight-ltr {
      from {
        opacity: 0;
        transform: translateX(0) scale(0.92);
      }
      ${APPEAR_PCT} {
        opacity: 1;
        transform: translateX(0) scale(1);
      }
      ${LAND_PCT} {
        opacity: 1;
        transform: translateX(calc(100cqw - 100%)) scale(1);
        animation-timing-function: ease-in;
      }
      to {
        opacity: 0;
        transform: translateX(calc(100cqw - 100%)) scale(1);
      }
    }
    @keyframes flight-rtl {
      from {
        opacity: 0;
        transform: translateX(0) scale(0.92);
      }
      ${APPEAR_PCT} {
        opacity: 1;
        transform: translateX(0) scale(1);
      }
      ${LAND_PCT} {
        opacity: 1;
        transform: translateX(calc(100% - 100cqw)) scale(1);
        animation-timing-function: ease-in;
      }
      to {
        opacity: 0;
        transform: translateX(calc(100% - 100cqw)) scale(1);
      }
    }
    @keyframes flight-down {
      from {
        opacity: 0;
        transform: translate(-50%, 0) scale(0.92);
      }
      ${APPEAR_PCT} {
        opacity: 1;
        transform: translate(-50%, 0) scale(1);
      }
      ${LAND_PCT} {
        opacity: 1;
        transform: translate(-50%, calc(100cqh - 100%)) scale(1);
        animation-timing-function: ease-in;
      }
      to {
        opacity: 0;
        transform: translate(-50%, calc(100cqh - 100%)) scale(1);
      }
    }
    @keyframes flight-up {
      from {
        opacity: 0;
        transform: translate(-50%, 0) scale(0.92);
      }
      ${APPEAR_PCT} {
        opacity: 1;
        transform: translate(-50%, 0) scale(1);
      }
      ${LAND_PCT} {
        opacity: 1;
        transform: translate(-50%, calc(100% - 100cqh)) scale(1);
        animation-timing-function: ease-in;
      }
      to {
        opacity: 0;
        transform: translate(-50%, calc(100% - 100cqh)) scale(1);
      }
    }

    @keyframes beat-enter {
      from {
        opacity: 0.25;
        transform: translateY(6px);
      }
      to {
        opacity: 1;
        transform: none;
      }
    }

    .bump {
      animation: bump 420ms cubic-bezier(0.2, 0.9, 0.3, 1.4) both;
    }

    @keyframes bump {
      0% {
        transform: scale(0.7);
        opacity: 0;
      }
      60% {
        transform: scale(1.12);
        opacity: 1;
      }
      100% {
        transform: scale(1);
      }
    }

    .stamp-in {
      animation: stamp-in 340ms cubic-bezier(0.2, 0.9, 0.3, 1.4) both;
    }

    @keyframes stamp-in {
      from {
        opacity: 0;
        transform: scale(1.25) rotate(-4deg);
      }
      to {
        opacity: 1;
        transform: none;
      }
    }

    /* Both bars scale rather than animate their width: a transform is a
       compositor job, a width is a layout job on every frame. */
    .fill-bar,
    .beat-bar {
      width: 100%;
      transform-origin: left center;
    }

    /* The reel filling up while she produces it. */
    .fill-bar {
      animation: beat-fill 2200ms ease-in-out forwards;
    }

    /* Beat countdown; the element overrides the duration with its own beat's. */
    .beat-bar {
      animation: beat-fill 2600ms linear forwards;
    }

    @keyframes beat-fill {
      from {
        transform: scaleX(0);
      }
      to {
        transform: scaleX(1);
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .beat-bar,
      .fill-bar {
        transform: scaleX(1);
        animation: none;
      }

      .beat-enter,
      .bump,
      .stamp-in {
        animation: none;
      }
      /* No flight: the receiver simply updates. */
      .flight-lane {
        display: none;
      }
    }
  `,
})
export class InteractiveDashboardPreviewComponent implements OnDestroy {
  /** The seven lifecycle beats, in play order (legacy collaborationSteps). */
  readonly stepKeys = [
    'campaign_created',
    'influencer_application',
    'review_selection',
    'agreement_planning',
    'content_creation',
    'content_approval',
    'publication_results',
  ] as const;

  /** The three applicants the brand compares at the selection beat. */
  readonly candidates = [
    { initials: 'OK', name: 'Ola Kowalska', chosen: true },
    { initials: 'MW', name: 'Marta Wójcik', chosen: false },
    { initials: 'PZ', name: 'Piotr Zieliński', chosen: false },
  ] as const;

  readonly mode = signal<'overview' | 'simulation'>('overview');
  readonly step = signal(0);
  readonly playing = signal(false);
  readonly done = signal(false);

  /** Numbers the cards show. Count-ups run only while the story plays, so a
   * paused card (and every screenshot fixture) reads the settled value. */
  readonly followers = signal(12000);
  readonly reach = signal(12000);
  readonly likes = signal(1240);
  readonly comments = signal(86);

  /** Which beat the cards render — overview shows the finished collaboration. */
  readonly beatKey = computed(() =>
    this.mode() === 'overview'
      ? this.stepKeys[this.stepKeys.length - 1]
      : this.stepKeys[this.step()],
  );
  /** Motion belongs to the running story, not to the static tableau. */
  readonly animated = computed(() => this.mode() === 'simulation');
  readonly applicationCount = computed(() =>
    this.mode() === 'overview' || this.step() >= 1 ? 1 : 0,
  );
  readonly brandTone = computed(() => TONES[this.beatKey()].brand);
  readonly influencerTone = computed(() => TONES[this.beatKey()].influencer);

  /** The brief is the brand's card while the campaign is being set up and
   * applied to; afterwards the chapter's own content takes its room. */
  readonly showBrief = computed(() => this.mode() === 'overview' || this.step() <= 1);
  /** Her stat tiles introduce her; once terms are agreed the content is the point. */
  readonly showTiles = computed(() => this.mode() === 'overview' || this.step() <= 3);

  /** Which way this beat's message travels: the brand's moves go right, to
   * her; hers come left, to the brand. */
  readonly direction = computed<'ltr' | 'rtl'>(() =>
    BADGES[this.stepKeys[this.step()]].actor === 'brand' ? 'ltr' : 'rtl',
  );
  /** How long the cargo is in the air — the receiving pane's tiles wait this
   * long before they enter, so the arrival and the update are one event. */
  readonly landMs = computed(() => (this.animated() ? FLIGHT_MS : 0));
  readonly flightClass = computed(() =>
    BADGES[this.stepKeys[this.step()]].actor === 'brand'
      ? 'text-coral-700 ring-coral-200'
      : 'text-navy-500 ring-navy-500/20',
  );

  /** The narration's badge: who acts on this beat, and how. */
  readonly badgeIcon = computed(() => BADGES[this.stepKeys[this.step()]].icon);
  readonly badgeClass = computed(() =>
    BADGES[this.stepKeys[this.step()]].actor === 'brand'
      ? 'bg-coral-50 text-coral-600 ring-1 ring-coral-200'
      : 'bg-navy-50 text-navy-500 ring-1 ring-navy-500/20',
  );

  /** Jump straight to a beat with no timers — the sandbox fixtures' hook. */
  set previewBeat(index: number) {
    this.stopTimer();
    this.mode.set('simulation');
    this.step.set(Math.min(Math.max(index, 0), this.stepKeys.length - 1));
    this.playing.set(false);
    this.done.set(false);
  }

  /** How long each beat holds the stage. A beat that brings in three candidate
   * cards needs longer than one that flips a chip: a single tempo read as too
   * fast on the busy beats and too slow on the sparse ones (owner, 2026-09).
   * The countdown bar is bound to the same number. */
  private readonly beatHold: Readonly<Record<string, number>> = {
    campaign_created: 2400,
    influencer_application: 2800,
    review_selection: 3400,
    agreement_planning: 3000,
    content_creation: 2800,
    content_approval: 2400,
    publication_results: 3600,
  };

  /** The current beat's hold. */
  readonly beatMs = computed(() => this.beatHold[this.stepKeys[this.step()]] ?? 2600);
  private readonly doc = inject(DOCUMENT);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private timerId: ReturnType<typeof setTimeout> | null = null;
  private frameId: number | null = null;

  constructor() {
    // A backgrounded tab keeps firing timers, so a visitor who switches
    // away and returns finds the run already over. Pause on hide, resume on
    // show — `playing()` stays true, only the timer stops.
    if (this.isBrowser) {
      this.doc.addEventListener('visibilitychange', this.onVisibilityChange);
    }
  }

  /** 12000 → "12 000". Locale-independent so baselines stay byte-stable. */
  fmt(value: number): string {
    return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0');
  }

  /** Chip styling per tone — the beat's temperature at a glance. */
  chipClass(tone: Tone): string {
    const base =
      'inline-flex items-center gap-1.5 self-start rounded-full px-2.5 py-1 font-mono text-[10px] font-medium uppercase tracking-[0.18em] transition-colors duration-300';
    switch (tone) {
      case 'done':
        return `${base} bg-success-soft text-success-strong`;
      case 'pending':
        return `${base} bg-warning-soft text-warning-strong`;
      case 'alert':
        return `${base} bg-coral-50 text-coral-700`;
      default:
        return `${base} bg-navy-50 text-navy-500`;
    }
  }

  /** In overview every step shows settled; simulation reveals progressively. */
  stepState(index: number): 'done' | 'current' | 'todo' {
    if (this.mode() === 'overview') {
      return 'done';
    }
    const current = this.step();
    return index < current ? 'done' : index === current ? 'current' : 'todo';
  }

  /** The step pill's look: done is settled navy, current is coral, to-do is beige. */
  pillClass(state: 'done' | 'current' | 'todo'): string {
    switch (state) {
      case 'done':
        return 'bg-navy-50 text-navy-500';
      case 'current':
        return 'bg-coral-50 text-coral-700 ring-1 ring-coral-300';
      default:
        return 'bg-cream text-slate2/70';
    }
  }

  /** A click on a step pill: jump there. Keeps playing if it was playing,
   * with the new beat's own hold; stays paused if it was paused. */
  goTo(index: number): void {
    if (this.mode() !== 'simulation') return;
    this.stopTimer();
    this.done.set(false);
    this.step.set(Math.min(Math.max(index, 0), this.stepKeys.length - 1));
    this.onBeatEnter();
    if (this.playing()) this.startTimer();
  }

  setMode(mode: 'overview' | 'simulation'): void {
    this.mode.set(mode);
    this.reset();
    // Opening the presentation starts it. Owner, 2026-09-04: a visitor had to
    // click through the beats to see anything move.
    if (mode === 'simulation') {
      this.play();
    }
  }

  togglePlay(): void {
    if (this.playing()) {
      this.stopTimer();
      this.playing.set(false);
      return;
    }
    this.play();
  }

  advance(): void {
    if (this.step() >= this.stepKeys.length - 1) {
      this.stopTimer();
      this.playing.set(false);
      this.done.set(true);
      return;
    }
    this.step.update((s) => s + 1);
    this.onBeatEnter();
  }

  /** "Spróbuj ponownie" / the reset icon: back to the first beat, playing —
   * a presentation that restarts into a still frame reads as broken. */
  restart(): void {
    this.reset();
    this.play();
  }

  reset(): void {
    this.stopTimer();
    this.stopCountUp();
    this.playing.set(false);
    this.step.set(0);
    this.done.set(false);
    this.followers.set(12000);
    this.reach.set(12000);
    this.likes.set(1240);
    this.comments.set(86);
  }

  ngOnDestroy(): void {
    this.stopTimer();
    this.stopCountUp();
    if (this.isBrowser) {
      this.doc.removeEventListener('visibilitychange', this.onVisibilityChange);
    }
  }

  private play(): void {
    this.playing.set(true);
    this.startTimer();
  }

  private startTimer(): void {
    this.stopTimer();
    // Click-started only — the prerendered route never runs this during SSR.
    // A timeout that reschedules itself, not an interval: every beat has its
    // own hold, so the tempo follows the story instead of a metronome.
    this.timerId = setTimeout(() => {
      this.advance();
      if (this.playing()) this.startTimer();
    }, this.beatMs());
  }

  private stopTimer(): void {
    if (this.timerId !== null) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
  }

  private readonly onVisibilityChange = (): void => {
    if (this.doc.hidden) {
      this.stopTimer();
    } else if (this.playing()) {
      this.startTimer();
    }
  };

  /** Numbers that land on a beat count themselves up as it opens. */
  private onBeatEnter(): void {
    const beat = this.beatKey();
    if (beat === 'influencer_application') {
      this.countUp([[this.followers, 12000]]);
    } else if (beat === 'publication_results') {
      this.countUp([
        [this.reach, 12000],
        [this.likes, 1240],
        [this.comments, 86],
      ]);
    }
  }

  private countUp(pairs: readonly (readonly [WritableSignal<number>, number])[]): void {
    // Paused cards, the server render and reduced-motion visitors get the
    // settled number; only a running story counts.
    if (!this.isBrowser || !this.playing() || this.reducedMotion()) {
      for (const [target, to] of pairs) target.set(to);
      return;
    }
    this.stopCountUp();
    const started = performance.now();
    const duration = 800;
    for (const [target] of pairs) target.set(0);
    const tick = (now: number): void => {
      const t = Math.min(1, (now - started) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      for (const [target, to] of pairs) target.set(Math.round(to * eased));
      this.frameId = t < 1 ? requestAnimationFrame(tick) : null;
    };
    this.frameId = requestAnimationFrame(tick);
  }

  private stopCountUp(): void {
    if (this.frameId !== null) {
      cancelAnimationFrame(this.frameId);
      this.frameId = null;
    }
  }

  private reducedMotion(): boolean {
    try {
      return this.doc.defaultView?.matchMedia('(prefers-reduced-motion: reduce)').matches === true;
    } catch {
      return false;
    }
  }
}
