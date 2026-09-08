import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Meta, Title } from '@angular/platform-browser';
import {
  ActivatedRouteSnapshot,
  RouterStateSnapshot,
  TitleStrategy,
  convertToParamMap,
  provideRouter,
} from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { TranslocoService, TranslocoTestingModule } from '@ngneat/transloco';
import { SeoTitleStrategy, errorTitleKey } from './seo-title.strategy';

@Component({ template: '' })
class BlankComponent {}

describe('SeoTitleStrategy', () => {
  let transloco: TranslocoService;
  let title: Title;
  let meta: Meta;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        TranslocoTestingModule.forRoot({
          langs: {
            pl: {
              seo: {
                site_title: 'Check It Out',
                login: { title: 'Zaloguj się' },
                survey: { title: 'Jak testujemy?', intro: 'Nawyki stojące za platformą.' },
                '404': { title: '404 - Strona nie znaleziona' },
              },
            },
            en: {
              seo: {
                site_title: 'Check It Out',
                login: { title: 'Sign In' },
                survey: { title: 'How do we test?', intro: 'The habits behind the platform.' },
                '404': { title: '404 - Page Not Found' },
              },
            },
          },
          preloadLangs: true,
          translocoConfig: { availableLangs: ['pl', 'en'], defaultLang: 'pl' },
        }),
      ],
      providers: [
        provideRouter([
          { path: 'login', title: 'seo.login.title', component: BlankComponent },
          { path: 'plain', component: BlankComponent },
          {
            path: 'survey',
            title: 'seo.survey.title',
            data: { description: 'seo.survey.intro' },
            component: BlankComponent,
          },
          { path: 'error/:type', title: errorTitleKey, component: BlankComponent },
        ]),
        { provide: TitleStrategy, useClass: SeoTitleStrategy },
      ],
    }).compileComponents();
    transloco = TestBed.inject(TranslocoService);
    title = TestBed.inject(Title);
    meta = TestBed.inject(Meta);
  });

  it('describes a page that declares data.description — meta + Open Graph, translated', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/survey');
    expect(meta.getTag('name="description"')?.content).toBe('Nawyki stojące za platformą.');
    expect(meta.getTag('property="og:title"')?.content).toBe('Jak testujemy? | Check It Out');
    expect(meta.getTag('property="og:description"')?.content).toBe('Nawyki stojące za platformą.');
    expect(meta.getTag('property="og:url"')?.content).toBe('https://checkitout.app/survey');
    transloco.setActiveLang('en');
    await harness.fixture.whenStable();
    expect(meta.getTag('name="description"')?.content).toBe('The habits behind the platform.');
  });

  it('removes the description when the next page declares none', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/survey');
    expect(meta.getTag('name="description"')).toBeTruthy();
    await harness.navigateByUrl('/plain');
    expect(meta.getTag('name="description"')).toBeNull();
    expect(meta.getTag('property="og:url"')).toBeNull();
  });

  it('titles a routed page as "<page> | <site>"', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/login');
    expect(title.getTitle()).toBe('Zaloguj się | Check It Out');
  });

  it('falls back to the bare site title on routes without a title key', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/login');
    await harness.navigateByUrl('/plain');
    expect(title.getTitle()).toBe('Check It Out');
  });

  it('re-titles the current page on language switch without a navigation', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/login');
    transloco.setActiveLang('en');
    await harness.fixture.whenStable();
    expect(title.getTitle()).toBe('Sign In | Check It Out');
  });

  it('titles /error/:type through the resolver end to end', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/error/404');
    expect(title.getTitle()).toBe('404 - Strona nie znaleziona | Check It Out');
  });

  it('errorTitleKey maps known types and coerces the rest to 404', () => {
    const snap = (type: string) =>
      ({ paramMap: convertToParamMap({ type }) }) as ActivatedRouteSnapshot;
    const state = {} as RouterStateSnapshot;
    expect(errorTitleKey(snap('500'), state)).toBe('seo.500.title');
    expect(errorTitleKey(snap('503'), state)).toBe('seo.503.title');
    expect(errorTitleKey(snap('404'), state)).toBe('seo.404.title');
    expect(errorTitleKey(snap('teapot'), state)).toBe('seo.404.title');
  });
});
