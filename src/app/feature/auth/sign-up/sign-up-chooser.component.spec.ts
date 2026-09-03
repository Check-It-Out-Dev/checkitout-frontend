import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@ngneat/transloco';
import { SignUpChooserComponent } from './sign-up-chooser.component';

describe('SignUpChooserComponent', () => {
  let fixture: ComponentFixture<SignUpChooserComponent>;
  let host: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        SignUpChooserComponent,
        TranslocoTestingModule.forRoot({
          langs: { pl: {} },
          translocoConfig: { availableLangs: ['pl'], defaultLang: 'pl' },
        }),
      ],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(SignUpChooserComponent);
    host = fixture.nativeElement;
    fixture.detectChanges();
  });

  it('renders both role choices', () => {
    expect(host.querySelector('[data-testid="sign-up-as-influencer"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="sign-up-as-business"]')).not.toBeNull();
  });

  it('influencer card routes to /auth/sign-up/influencer', () => {
    const a = host.querySelector<HTMLAnchorElement>('[data-testid="sign-up-as-influencer"]');
    expect(a?.getAttribute('ng-reflect-router-link') ?? a?.getAttribute('routerlink')).toBe(
      '/auth/sign-up/influencer',
    );
  });

  it('business card routes to /auth/sign-up/business', () => {
    const a = host.querySelector<HTMLAnchorElement>('[data-testid="sign-up-as-business"]');
    expect(a?.getAttribute('ng-reflect-router-link') ?? a?.getAttribute('routerlink')).toBe(
      '/auth/sign-up/business',
    );
  });

  it('"already have an account" link routes to /auth/sign-in', () => {
    const a = host.querySelector<HTMLAnchorElement>('[data-testid="sign-up-chooser-sign-in"]');
    expect(a?.getAttribute('ng-reflect-router-link') ?? a?.getAttribute('routerlink')).toBe(
      '/auth/sign-in',
    );
  });

  it('uses routerLink (no raw href) so SPA navigation is preserved', () => {
    // If someone "tidies up" the template and replaces routerLink with
    // raw href="...", the SPA would full-page reload on click. Lock in
    // that none of the role anchors carry a raw `href` attribute (they
    // only carry the routerLink directive's reflected attribute).
    const anchors = host.querySelectorAll<HTMLAnchorElement>('a[data-testid^="sign-up-"]');
    expect(anchors.length).toBeGreaterThan(0);
    for (const a of Array.from(anchors)) {
      expect(a.getAttribute('href')?.startsWith('http') ?? false).toBe(false);
    }
  });
});
