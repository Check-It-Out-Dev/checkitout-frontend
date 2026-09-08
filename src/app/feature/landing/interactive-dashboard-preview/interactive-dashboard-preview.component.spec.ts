import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@ngneat/transloco';
import { InteractiveDashboardPreviewComponent } from './interactive-dashboard-preview.component';

describe('InteractiveDashboardPreviewComponent', () => {
  let fixture: ComponentFixture<InteractiveDashboardPreviewComponent>;
  let component: InteractiveDashboardPreviewComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        InteractiveDashboardPreviewComponent,
        TranslocoTestingModule.forRoot({
          langs: { pl: {}, en: {} },
          translocoConfig: { availableLangs: ['pl', 'en'], defaultLang: 'pl' },
        }),
      ],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(InteractiveDashboardPreviewComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    // Simulation mode autoplays: destroy clears the interval so it cannot
    // outlive the test.
    fixture.destroy();
  });

  it('starts in the static overview with every step settled', () => {
    expect(component.mode()).toBe('overview');
    expect(component.stepState(0)).toBe('done');
    expect(component.stepState(6)).toBe('done');
    expect(component.playing()).toBe(false);
  });

  it('the timeline lists the same seven beats the narration reads', () => {
    const items = fixture.nativeElement.querySelectorAll(
      '[data-testid="dashboard-progress-steps"] li',
    );
    expect(items).toHaveLength(component.stepKeys.length);
    for (const key of component.stepKeys) {
      expect(
        fixture.nativeElement.querySelector(`[data-testid="dashboard-step-${key}"]`),
      ).toBeTruthy();
    }
  });

  it('in the overview the pills are a legend: each step shows its glyph and its short name', () => {
    const legend: NodeListOf<HTMLElement> = fixture.nativeElement.querySelectorAll(
      '[data-testid="dashboard-legend-step"]',
    );
    expect(legend).toHaveLength(component.stepKeys.length);
    const icons = [...legend].map((el) => el.querySelector('mat-icon')!.textContent!.trim());
    expect(icons).toEqual([
      'campaign',
      'send',
      'fact_check',
      'handshake',
      'videocam',
      'verified',
      'insights',
    ]);
    for (const el of legend) {
      expect(el.getAttribute('title')).toBeTruthy();
      expect(el.querySelector('span')!.textContent!.trim().length).toBeGreaterThan(0);
    }
    // Nothing to click in the overview; the simulation gets its buttons back.
    expect(
      fixture.nativeElement.querySelector('[data-testid="dashboard-progress-steps"] button'),
    ).toBeNull();
    component.setMode('simulation');
    fixture.detectChanges();
    expect(
      fixture.nativeElement.querySelectorAll('[data-testid="dashboard-legend-step"]'),
    ).toHaveLength(0);
    expect(
      fixture.nativeElement.querySelectorAll('[data-testid="dashboard-progress-steps"] button'),
    ).toHaveLength(component.stepKeys.length);
    component.setMode('overview'); // stops the story's timer
  });

  it('opening the presentation starts playing it', () => {
    jest.useFakeTimers();
    try {
      component.setMode('simulation');
      expect(component.playing()).toBe(true);

      jest.advanceTimersByTime(2600);
      expect(component.step()).toBe(1);

      component.togglePlay(); // pause
      jest.advanceTimersByTime(10000);
      expect(component.step()).toBe(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it('gives each beat its own hold instead of one metronome', () => {
    jest.useFakeTimers();
    try {
      component.setMode('simulation');
      expect(component.beatMs()).toBe(2400); // campaign created: sparse

      jest.advanceTimersByTime(2400);
      expect(component.step()).toBe(1);
      expect(component.beatMs()).toBe(2800); // her application arrives

      jest.advanceTimersByTime(2700);
      expect(component.step()).toBe(1); // not yet — this beat is longer
      jest.advanceTimersByTime(100);
      expect(component.step()).toBe(2);
      expect(component.beatMs()).toBe(3400); // three candidates to read
    } finally {
      jest.useRealTimers();
    }
  });

  it('a hidden tab pauses the run and showing it again resumes', () => {
    jest.useFakeTimers();
    const hidden = jest.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    try {
      component.setMode('simulation');
      document.dispatchEvent(new Event('visibilitychange'));
      jest.advanceTimersByTime(10000);
      expect(component.step()).toBe(0);

      hidden.mockReturnValue(false);
      document.dispatchEvent(new Event('visibilitychange'));
      jest.advanceTimersByTime(2600);
      expect(component.step()).toBe(1);
    } finally {
      hidden.mockRestore();
      jest.useRealTimers();
    }
  });

  it('simulation reveals steps progressively and finishes on the success panel', () => {
    component.setMode('simulation');
    component.togglePlay(); // pause the autoplay this test drives by hand
    fixture.detectChanges();
    expect(component.stepState(0)).toBe('current');
    expect(component.stepState(1)).toBe('todo');

    for (let i = 0; i < component.stepKeys.length; i++) {
      component.advance();
    }
    fixture.detectChanges();

    expect(component.done()).toBe(true);
    expect(component.playing()).toBe(false);
    expect(fixture.nativeElement.querySelector('[data-testid="dashboard-success"]')).toBeTruthy();
  });

  it('each beat renders both cards\u2019 state for that beat', () => {
    component.setMode('simulation');
    component.togglePlay();
    for (let i = 0; i < component.stepKeys.length; i++) {
      component.previewBeat = i;
      fixture.detectChanges();
      const key = component.stepKeys[i];
      expect(
        fixture.nativeElement.querySelector(`[data-testid="dashboard-brand-${key}"]`),
      ).toBeTruthy();
      // Her pane is there from the first beat: before she applies it shows
      // her browsing the campaign, not an empty box.
      const her = fixture.nativeElement.querySelector(
        `[data-testid="dashboard-influencer-${key}"]`,
      );
      expect(her).toBeTruthy();
      expect(her.querySelector('[data-testid="dashboard-influencer-discovering"]') !== null).toBe(
        i === 0,
      );
    }
  });

  it('the channel narrates the current beat, and only that beat', () => {
    component.setMode('simulation');
    component.togglePlay();
    component.previewBeat = 2;
    fixture.detectChanges();

    const narration = fixture.nativeElement.querySelector('[data-testid="dashboard-narration"]');
    expect(narration).toBeTruthy();
    // Step counter reads "<step> 3 <of> 7" — the numbers are the contract.
    expect(narration.textContent.replace(/\s+/g, ' ')).toContain('3');
    // The stepper still lists all seven, as pills, with the current one marked.
    const current = fixture.nativeElement.querySelectorAll(
      '[data-testid="dashboard-progress-steps"] [aria-current="step"]',
    );
    expect(current).toHaveLength(1);
    expect(current[0].closest('li').getAttribute('data-testid')).toBe(
      'dashboard-step-review_selection',
    );
  });

  it('the finale keeps both panes on stage and puts the banner in the bar', () => {
    component.setMode('simulation');
    component.togglePlay();
    for (let i = 0; i < component.stepKeys.length; i++) component.advance();
    fixture.detectChanges();

    expect(component.done()).toBe(true);
    const el = fixture.nativeElement;
    expect(el.querySelector('[data-testid="dashboard-success"]')).toBeTruthy();
    expect(el.querySelector('[data-testid="dashboard-transport"]')).toBeNull();
    // Nothing disappeared: the panes are still there, on the last beat.
    expect(el.querySelector('[data-testid="dashboard-pane-brand"]')).toBeTruthy();
    expect(el.querySelector('[data-testid="dashboard-pane-influencer"]')).toBeTruthy();
    expect(el.querySelector('[data-testid="dashboard-brand-publication_results"]')).toBeTruthy();
    expect(el.querySelector('[data-testid="dashboard-restart"]')).toBeTruthy();
  });

  it('content beats show the reel as a filled post, not a placeholder', () => {
    const el = fixture.nativeElement;
    component.previewBeat = 4; // content_creation: she is recording
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="dashboard-post-recording"]')).toBeTruthy();
    expect(el.querySelector('[data-testid="dashboard-post-stamp"]')).toBeNull();

    component.previewBeat = 5; // content_approval: both panes hold the approved reel
    fixture.detectChanges();
    expect(el.querySelectorAll('[data-testid="dashboard-post-approved"]')).toHaveLength(2);
    expect(el.querySelectorAll('[data-testid="dashboard-post-stamp"]')).toHaveLength(2);
    // The beige rectangles that stood in for content are gone for good.
    expect(el.querySelector('.bg-beige\\/70')).toBeNull();
  });

  it('each beat sends its message one way, and only while the story plays', () => {
    const el = fixture.nativeElement;
    // brand → her on the brand's moves; her → brand on hers
    const expected: Record<number, 'ltr' | 'rtl'> = {
      0: 'ltr',
      1: 'rtl',
      2: 'ltr',
      3: 'ltr',
      4: 'rtl',
      5: 'ltr',
      6: 'rtl',
    };
    for (let i = 0; i < component.stepKeys.length; i++) {
      component.previewBeat = i;
      fixture.detectChanges();
      expect(component.direction()).toBe(expected[i]);
      const cargo = el.querySelector('[data-testid="dashboard-flight"]');
      expect(cargo).toBeTruthy();
      expect(cargo.getAttribute('data-direction')).toBe(expected[i]);
    }
    // The receiving pane waits for the flight; the sending one does not.
    component.previewBeat = 1; // rtl: the brand receives
    fixture.detectChanges();
    expect(
      el.querySelector('[data-testid="dashboard-pane-brand"]').style.getPropertyValue('--land'),
    ).toBe('700ms');
    expect(
      el
        .querySelector('[data-testid="dashboard-pane-influencer"]')
        .style.getPropertyValue('--land'),
    ).toBe('0ms');

    // No flight in the tableau, none at the finale.
    component.setMode('overview');
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="dashboard-flight"]')).toBeNull();
    component.setMode('simulation');
    component.togglePlay();
    for (let i = 0; i < component.stepKeys.length; i++) component.advance();
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="dashboard-flight"]')).toBeNull();
  });

  it('a step pill jumps the story, and keeps its playing state', () => {
    jest.useFakeTimers();
    try {
      component.setMode('simulation'); // playing
      component.goTo(4);
      expect(component.step()).toBe(4);
      expect(component.playing()).toBe(true);
      jest.advanceTimersByTime(2800); // content_creation's own hold
      expect(component.step()).toBe(5);

      component.togglePlay(); // pause
      component.goTo(1);
      expect(component.step()).toBe(1);
      expect(component.playing()).toBe(false);
      jest.advanceTimersByTime(10000);
      expect(component.step()).toBe(1);

      component.goTo(99);
      expect(component.step()).toBe(component.stepKeys.length - 1);
      component.setMode('overview');
      component.goTo(3); // pills are inert in the overview
      expect(component.step()).toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });

  it('does not rebuild the beat block between beats (it used to blink to nothing)', () => {
    component.previewBeat = 1;
    fixture.detectChanges();
    const brandBefore = fixture.nativeElement.querySelector('[data-testid^="dashboard-brand-"]');
    const herBefore = fixture.nativeElement.querySelector('[data-testid^="dashboard-influencer-"]');

    component.previewBeat = 2;
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelector('[data-testid="dashboard-brand-review_selection"]'),
    ).toBe(brandBefore);
    expect(
      fixture.nativeElement.querySelector('[data-testid="dashboard-influencer-review_selection"]'),
    ).toBe(herBefore);
  });

  it('numbers settle instantly while the story is paused', () => {
    // Her followers count up on the application beat; the results count up on
    // the last one. Paused, both read the settled value at once.
    component.previewBeat = 1;
    fixture.detectChanges();
    expect(component.followers()).toBe(12000);
    expect(
      fixture.nativeElement.querySelector('[data-testid="dashboard-followers"]').textContent,
    ).toContain('12');

    component.previewBeat = 6;
    fixture.detectChanges();
    expect(component.reach()).toBe(12000);
    expect(
      fixture.nativeElement.querySelector('[data-testid="dashboard-influencer-metrics"]')
        .textContent,
    ).toContain('12');
    expect(component.fmt(12000)).toBe('12 000');
  });

  it('the finale’s restart plays the story again', () => {
    jest.useFakeTimers();
    try {
      component.setMode('simulation');
      for (let i = 0; i < component.stepKeys.length; i++) component.advance();
      expect(component.done()).toBe(true);

      component.restart();

      expect(component.done()).toBe(false);
      expect(component.step()).toBe(0);
      expect(component.playing()).toBe(true);
      jest.advanceTimersByTime(2600);
      expect(component.step()).toBe(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it('reset returns to step zero and drops the success panel', () => {
    component.setMode('simulation');
    component.togglePlay();
    for (let i = 0; i < component.stepKeys.length; i++) {
      component.advance();
    }
    component.reset();
    fixture.detectChanges();

    expect(component.done()).toBe(false);
    expect(component.step()).toBe(0);
    expect(fixture.nativeElement.querySelector('[data-testid="dashboard-success"]')).toBeNull();
  });

  it('autoplay toggles and mode switches always clear the timer', () => {
    jest.useFakeTimers();
    try {
      component.setMode('simulation');
      expect(component.playing()).toBe(true);

      jest.advanceTimersByTime(2600);
      expect(component.step()).toBe(1);

      component.setMode('overview'); // mode switch resets + stops
      expect(component.playing()).toBe(false);
      jest.advanceTimersByTime(10000);
      expect(component.step()).toBe(0); // no zombie interval kept advancing
    } finally {
      jest.useRealTimers();
    }
  });
});
