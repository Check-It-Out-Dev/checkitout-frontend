import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@ngneat/transloco';
import { ConfirmationRequiredComponent } from './confirmation-required.component';

describe('ConfirmationRequiredComponent', () => {
  let fixture: ComponentFixture<ConfirmationRequiredComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [
        ConfirmationRequiredComponent,
        TranslocoTestingModule.forRoot({
          langs: { en: {} },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
        }),
      ],
      providers: [provideRouter([])],
    });
    fixture = TestBed.createComponent(ConfirmationRequiredComponent);
    fixture.detectChanges();
  });

  afterEach(() => TestBed.resetTestingModule());

  it('renders the static "check your email" panel', () => {
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('[data-testid="confirmation-required"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="confirmation-required-title"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="confirmation-required-info"]')).not.toBeNull();
  });

  it('exposes a sign-in link routed to /auth/sign-in', () => {
    const link = fixture.nativeElement.querySelector(
      '[data-testid="confirmation-required-sign-in"]',
    ) as HTMLAnchorElement | null;
    expect(link).not.toBeNull();
    expect(link?.getAttribute('href')).toBe('/auth/sign-in');
  });
});
