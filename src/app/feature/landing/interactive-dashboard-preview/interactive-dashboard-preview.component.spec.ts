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

  it('starts in the static overview with every step settled', () => {
    expect(component.mode()).toBe('overview');
    expect(component.stepState(0)).toBe('done');
    expect(component.stepState(6)).toBe('done');
    expect(component.playing()).toBe(false);
  });

  it('simulation reveals steps progressively and finishes on the success panel', () => {
    component.setMode('simulation');
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

  it('reset returns to step zero and drops the success panel', () => {
    component.setMode('simulation');
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
      component.togglePlay();
      expect(component.playing()).toBe(true);

      jest.advanceTimersByTime(2800);
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
