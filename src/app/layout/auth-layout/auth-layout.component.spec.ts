import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withXhr } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TranslocoService, TranslocoTestingModule } from '@ngneat/transloco';
import { AuthLayoutComponent } from './auth-layout.component';

describe('AuthLayoutComponent', () => {
  let fixture: ComponentFixture<AuthLayoutComponent>;
  let component: AuthLayoutComponent;
  let transloco: TranslocoService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        AuthLayoutComponent,
        TranslocoTestingModule.forRoot({
          langs: { pl: {}, en: {} },
          translocoConfig: { availableLangs: ['pl', 'en'], defaultLang: 'pl' },
        }),
      ],
      providers: [provideRouter([]), provideHttpClient(withXhr()), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(AuthLayoutComponent);
    component = fixture.componentInstance;
    transloco = TestBed.inject(TranslocoService);
  });

  it('initial activeLang mirrors Transloco active lang (defaultLang=pl)', () => {
    expect(component.activeLang()).toBe('pl');
  });

  it('setLang() flips Transloco active lang AND the local signal', () => {
    component.setLang('en');
    expect(transloco.getActiveLang()).toBe('en');
    expect(component.activeLang()).toBe('en');

    component.setLang('pl');
    expect(transloco.getActiveLang()).toBe('pl');
    expect(component.activeLang()).toBe('pl');
  });

  it('falls back to "en" when Transloco initially has no active lang', () => {
    // The constructor falls back when getActiveLang() returns falsy.
    // Simulate by manufacturing a separate fixture with a hijacked
    // Transloco that reports falsy active lang at construction time.
    TestBed.resetTestingModule();
    const fakeTransloco = {
      getActiveLang: jest.fn().mockReturnValue(''),
      setActiveLang: jest.fn(),
    };
    TestBed.configureTestingModule({
      imports: [AuthLayoutComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(withXhr()),
        provideHttpClientTesting(),
        { provide: TranslocoService, useValue: fakeTransloco },
      ],
    });
    // Component requires a fresh injection so we re-create it after the
    // module reset rather than reusing the outer fixture.
    const f = TestBed.createComponent(AuthLayoutComponent);
    expect(f.componentInstance.activeLang()).toBe('en');
  });
});
