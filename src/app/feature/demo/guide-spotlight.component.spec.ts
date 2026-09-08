import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@ngneat/transloco';
import { GuideSpotlightComponent } from './guide-spotlight.component';

@Component({
  imports: [GuideSpotlightComponent],
  template: `
    <button type="button" data-testid="spot-target">Zweryfikuj NIP</button>
    <app-guide-spotlight
      [target]="target()"
      [busy]="busy()"
      (act)="acted = acted + 1"
      (found)="seen.push($event)"
      (drawing)="drawn.push($event)"
    />
  `,
})
class HostComponent {
  readonly target = signal<string | undefined>(undefined);
  readonly busy = signal(false);
  acted = 0;
  seen: boolean[] = [];
  drawn: boolean[] = [];
}

/** jsdom has no layout: the target's box is stubbed per test. */
function placeTarget(host: HTMLElement, top: number): void {
  const el = host.querySelector<HTMLElement>('[data-testid="spot-target"]')!;
  el.getClientRects = () => [{}] as unknown as DOMRectList;
  el.getBoundingClientRect = () =>
    ({ top, left: 100, width: 160, height: 40, right: 260, bottom: top + 40 }) as DOMRect;
}

/** Several animation frames: the loop reveals, waits for the scroll to land,
 * asks Angular to render the ring, then paints it. */
async function frames(fixture: ComponentFixture<HostComponent>): Promise<void> {
  for (let i = 0; i < 4; i++) {
    await new Promise((resolve) => setTimeout(resolve, 120));
    fixture.detectChanges();
  }
}

/** The elements are positioned with a transform, not with top/left. */
function at(el: HTMLElement): { left: number; top: number } {
  const [, x, y] = /translate3d\((-?[\d.]+)px, (-?[\d.]+)px/.exec(el.style.transform) ?? [];
  return { left: Number(x), top: Number(y) };
}

describe('GuideSpotlightComponent', () => {
  let fixture: ComponentFixture<HostComponent>;
  let host: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        HostComponent,
        TranslocoTestingModule.forRoot({
          langs: { pl: {}, en: {} },
          translocoConfig: { availableLangs: ['pl', 'en'], defaultLang: 'pl' },
        }),
      ],
      providers: [provideRouter([])],
    }).compileComponents();
    fixture = TestBed.createComponent(HostComponent);
    host = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  });

  afterEach(() => fixture.destroy());

  it('shows nothing until a step points at a control', () => {
    expect(host.querySelector('[data-testid="guide-spotlight"]')).toBeNull();
    expect(host.querySelector('[data-testid="guide-spot-next"]')).toBeNull();
  });

  it('rings the control and carries the tour’s next control on it', async () => {
    placeTarget(host, 300);
    fixture.componentInstance.target.set('[data-testid="spot-target"]');
    fixture.detectChanges();
    await frames(fixture);

    const ring = host.querySelector<HTMLElement>('[data-testid="guide-spotlight"]')!;
    expect(at(ring)).toEqual({ left: 94, top: 294 }); // the box, less 6 px of padding
    expect(ring.style.width).toBe('172px');
    expect(ring.style.opacity).toBe('1');

    const pill = host.querySelector<HTMLElement>('[data-testid="guide-spot-next"]')!;
    // beside the ring, vertically centred on it — covering nothing
    expect(at(pill)).toEqual({ left: 274, top: 307 });
    pill.click();

    expect(fixture.componentInstance.acted).toBe(1);
  });

  it('drops the pill below the ring on a narrow page with the control near the top', async () => {
    const width = window.innerWidth;
    Object.defineProperty(window, 'innerWidth', { value: 320, configurable: true });
    try {
      placeTarget(host, 12);
      fixture.componentInstance.target.set('[data-testid="spot-target"]');
      fixture.detectChanges();
      await frames(fixture);

      const pill = host.querySelector<HTMLElement>('[data-testid="guide-spot-next"]')!;
      expect(at(pill).top).toBe(66); // 12 - 6 + 52 + 8, under the ring
    } finally {
      Object.defineProperty(window, 'innerWidth', { value: width, configurable: true });
    }
  });

  it('reports whether the control is on screen, so the panel can take over', async () => {
    const seen: boolean[] = [];
    fixture.componentInstance.seen = seen;
    fixture.componentInstance.target.set('[data-testid="missing"]');
    fixture.detectChanges();
    await frames(fixture);
    expect(seen).toEqual([]); // nothing found, nothing to report yet

    placeTarget(host, 300);
    fixture.componentInstance.target.set('[data-testid="spot-target"]');
    fixture.detectChanges();
    await frames(fixture);
    expect(seen).toEqual([true]);

    fixture.componentInstance.target.set(undefined);
    fixture.detectChanges();
    await frames(fixture);
    expect(seen).toEqual([true, false]);
  });

  it('says the pill has gone the moment it goes, grace or no grace', async () => {
    // `found` keeps saying yes for up to two seconds after a control vanishes,
    // so that a Next does not flash into the panel between steps. The panel
    // needs the ungraced answer as well: when a step has already failed and the
    // guide is asking for another press, the pill is gone and the grace is a
    // second and a half with nothing on screen to press.
    const seen: boolean[] = [];
    const drawn: boolean[] = [];
    fixture.componentInstance.seen = seen;
    fixture.componentInstance.drawn = drawn;
    placeTarget(host, 300);
    fixture.componentInstance.target.set('[data-testid="spot-target"]');
    fixture.detectChanges();
    await frames(fixture);
    expect(drawn).toEqual([true]);

    host.querySelector('[data-testid="spot-target"]')!.remove();
    await new Promise((resolve) => setTimeout(resolve, 300));
    fixture.detectChanges();
    expect(drawn).toEqual([true, false]); // the pill is off the screen already
    expect(seen).toEqual([true]); // and the tour is still the ring's, for now
  });

  it('waits for a control that has not been mounted yet instead of flashing a Next', async () => {
    const seen: boolean[] = [];
    fixture.componentInstance.seen = seen;
    fixture.componentInstance.target.set('[data-testid="sim-not-open-yet"]');
    fixture.detectChanges();
    // A world simulator or a route takes a moment to render what the step
    // points at. Half a second in, the panel must still be quiet — its button
    // appearing here and being replaced by the pill is the flicker this guards.
    await new Promise((resolve) => setTimeout(resolve, 700));
    expect(seen).toEqual([]);

    // and when it does arrive, the ring takes over
    placeTarget(host, 300);
    fixture.componentInstance.target.set('[data-testid="spot-target"]');
    fixture.detectChanges();
    await frames(fixture);
    expect(seen).toEqual([true]);
  });

  it('keeps the panel quiet while a glide is still carrying the control into view', async () => {
    // The campaign form's publish button is 1685 px down when its step begins,
    // and the glide there eases in: its first frames move less than half a
    // pixel, which the settle check used to read as "landed". The control was
    // then off screen for its 500 ms of grace and the panel handed out a Next
    // that the pill replaced when the button arrived — the smoothness tier's
    // "step changed its way forward". The scroll is simulated the way the page
    // does it: a document tall enough to glide, and a control whose box
    // follows the glide's own curve.
    const seen: boolean[] = [];
    const drawn: boolean[] = [];
    fixture.componentInstance.seen = seen;
    fixture.componentInstance.drawn = drawn;
    placeTarget(host, 300);
    fixture.componentInstance.target.set('[data-testid="spot-target"]');
    fixture.detectChanges();
    await frames(fixture);
    expect(seen).toEqual([true]);

    const root = document.documentElement as unknown as Record<string, unknown>;
    Object.defineProperty(root, 'scrollHeight', { value: 3000, configurable: true });
    const far = document.createElement('button');
    far.dataset['testid'] = 'far-target';
    host.appendChild(far);
    far.getClientRects = () => [{}] as unknown as DOMRectList;
    const ease = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
    const started = performance.now();
    far.getBoundingClientRect = () => {
      const top = 1685 - 1321 * ease(Math.min(1, (performance.now() - started) / 1400));
      return { top, left: 100, width: 160, height: 40, right: 260, bottom: top + 40 } as DOMRect;
    };
    try {
      fixture.componentInstance.target.set('[data-testid="far-target"]');
      fixture.detectChanges();
      await new Promise((resolve) => setTimeout(resolve, 600));
      expect(seen).toEqual([true]); // still the ring's step: the control is on its way

      await new Promise((resolve) => setTimeout(resolve, 900));
      fixture.detectChanges();
      expect(drawn).toEqual([true, false, true]); // and the ring lands on it
      expect(seen).toEqual([true]);
    } finally {
      delete root['scrollHeight'];
      far.remove();
    }
  });

  it('hides the ring and shields the page while the guide performs the step', async () => {
    placeTarget(host, 300);
    fixture.componentInstance.target.set('[data-testid="spot-target"]');
    fixture.detectChanges();
    await frames(fixture);
    expect(host.querySelector('[data-testid="guide-spotlight"]')).not.toBeNull();

    fixture.componentInstance.busy.set(true);
    fixture.detectChanges();
    await frames(fixture);

    expect(host.querySelector('[data-testid="guide-spotlight"]')).toBeNull();
    expect(host.querySelector('[data-testid="guide-shield"]')).not.toBeNull();
    // Typing into the page must not race the recipe — but Escape still works.
    const typed = new KeyboardEvent('keydown', { key: 'a', cancelable: true, bubbles: true });
    document.body.dispatchEvent(typed);
    expect(typed.defaultPrevented).toBe(true);
    const escape = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true, bubbles: true });
    document.body.dispatchEvent(escape);
    expect(escape.defaultPrevented).toBe(false);
  });
});
