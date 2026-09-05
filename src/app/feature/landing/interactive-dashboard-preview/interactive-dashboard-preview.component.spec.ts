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
      // The influencer joins the story at the application beat.
      const her = fixture.nativeElement.querySelector(
        `[data-testid="dashboard-influencer-${key}"]`,
      );
      expect(her === null).toBe(i === 0);
    }
  });

  it('keeps every step description in the DOM so the card never grows mid-story', () => {
    component.setMode('simulation');
    component.togglePlay();
    fixture.detectChanges();

    const descriptions = fixture.nativeElement.querySelectorAll(
      '[data-testid="dashboard-progress-steps"] li p:nth-of-type(2)',
    );
    expect(descriptions).toHaveLength(component.stepKeys.length);
    // the ones still to come are faded, not absent — the height is reserved
    expect(descriptions[6].className).toContain('opacity-0');
    expect(descriptions[6].getAttribute('aria-hidden')).toBe('true');
    expect(descriptions[0].className).not.toContain('opacity-0');
    expect(descriptions[0].getAttribute('aria-hidden')).toBeNull();
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
    component.previewBeat = 6;
    fixture.detectChanges();
    expect(component.reach()).toBe(12000);
    expect(
      fixture.nativeElement.querySelector('[data-testid="dashboard-followers"]').textContent,
    ).toContain('12');
    expect(component.fmt(12000)).toBe('12\u00a0000');
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
