import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@ngneat/transloco';
import { CollabHeroComponent } from './collab-hero.component';

describe('CollabHeroComponent', () => {
  let fixture: ComponentFixture<CollabHeroComponent>;
  let component: CollabHeroComponent;

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [
        CollabHeroComponent,
        TranslocoTestingModule.forRoot({
          langs: { pl: {}, en: {} },
          translocoConfig: { availableLangs: ['pl', 'en'], defaultLang: 'pl' },
        }),
      ],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(CollabHeroComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('shows the three landing campaigns and no panel until one is opened', () => {
    const cards = fixture.nativeElement.querySelectorAll('[data-testid^="collab-campaign-"]');
    expect(cards.length).toBe(3);
    expect(fixture.nativeElement.querySelector('[data-testid="collab-panel"]')).toBeNull();
  });

  it('sends a proposal: persists to localStorage, shows success + the sent row', () => {
    component.open('coffee_shop');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="collab-panel"]')).toBeTruthy();

    component.send('coffee_shop', '  Chętnie pokażę Waszą letnią kartę  ');
    fixture.detectChanges();

    const stored = JSON.parse(localStorage.getItem('demoCollabRequests')!);
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({
      campaignId: 'coffee_shop',
      note: 'Chętnie pokażę Waszą letnią kartę',
    });
    expect(fixture.nativeElement.querySelector('[data-testid="collab-success"]')).toBeTruthy();
    expect(
      fixture.nativeElement.querySelectorAll('[data-testid="collab-sent-list"] li').length,
    ).toBe(1);
  });

  it('caps stored proposals at 20, newest first', () => {
    for (let i = 0; i < 25; i++) {
      component.send('zero_waste', `note ${i}`);
    }
    const stored = JSON.parse(localStorage.getItem('demoCollabRequests')!);
    expect(stored).toHaveLength(20);
    expect(stored[0].note).toBe('note 24');
  });
});
