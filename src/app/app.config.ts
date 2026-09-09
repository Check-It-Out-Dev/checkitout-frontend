import { OVERLAY_DEFAULT_CONFIG } from '@angular/cdk/overlay';
import { MAT_DIALOG_DEFAULT_OPTIONS, MatDialogConfig } from '@angular/material/dialog';
import { provideHttpClient, withInterceptors, withXhr } from '@angular/common/http';
import { APP_INITIALIZER, ApplicationConfig, isDevMode } from '@angular/core';
import { MatPaginatorIntl } from '@angular/material/paginator';
import { TitleStrategy, provideRouter, withInMemoryScrolling } from '@angular/router';

import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { TRANSLOCO_LOADER, TranslocoService, provideTransloco } from '@ngneat/transloco';
import { firstValueFrom } from 'rxjs';
import { Configuration as ApiConfiguration } from './api/configuration';
import { BASE_PATH } from './api/variables';
import { environment } from '../environments/environment';
import { errorInterceptor } from './core/interceptors/error.interceptor';
import { languageInterceptor } from './core/interceptors/language.interceptor';
import { rateLimitInterceptor } from './core/interceptors/rate-limit-cache.interceptor';
import { setToArrayInterceptor } from './core/interceptors/set-to-array.interceptor';
import { shellHeadersInterceptor } from './core/interceptors/shell-headers.interceptor';
import { ssrCookieForwardInterceptor } from './core/interceptors/ssr-cookie-forward.interceptor';
import { stepUpInterceptor } from './core/interceptors/step-up.interceptor';
import { demoInterceptor } from './core/demo/demo.interceptor';
import { isDemoMode } from './core/demo/demo-mode';
import { HttpTranslocoLoader } from './core/i18n/transloco-loader';
import { TranslocoPaginatorIntl } from './core/i18n/paginator-intl';
import { SeoTitleStrategy } from './core/i18n/seo-title.strategy';
import { readLangChoice } from './core/i18n/lang-preference';
import { routes } from './app.routes';
import {
  provideClientHydration,
  withEventReplay,
  withNoIncrementalHydration,
} from '@angular/platform-browser';

export const appConfig: ApplicationConfig = {
  providers: [
    // anchorScrolling: the marketing toolbar's "Jak to działa / Cennik / FAQ /
    // Kontakt" are landing sections; from /grants, /support, /codemap… they
    // navigate to "/#section" and must land on it. scrollPositionRestoration:
    // a new page starts at the top, Back returns where the reader was.
    provideRouter(
      routes,
      withInMemoryScrolling({ anchorScrolling: 'enabled', scrollPositionRestoration: 'enabled' }),
    ),
    // Route `title` values are translation keys — see SeoTitleStrategy for
    // the `<page> | <site>` rendering + live re-title on language switch.
    { provide: TitleStrategy, useClass: SeoTitleStrategy },
    // Paginator labels follow the active language (Material ships English only).
    { provide: MatPaginatorIntl, useClass: TranslocoPaginatorIntl },
    provideAnimationsAsync(),
    // Demo build only: CDK 22 mounts overlays in the browser's top layer
    // (Popover API), which no z-index can reach — the guide panel and the
    // world simulators would sit under every dialog's backdrop, and the
    // admin-2fa tour needs the phone clickable while the TOTP dialog is
    // open. Classic stacking keeps them above (guide 99990 / sims 99980 vs
    // overlays at 1000); production keeps the CDK default.
    ...(isDemoMode() ? [{ provide: OVERLAY_DEFAULT_CONFIG, useValue: { usePopover: false } }] : []),
    provideHttpClient(
      withXhr(),
      withInterceptors([
        // Order matters: step-up (per-call X-Step-Up-Token), then language
        // (sets Accept-Language), then rate-limit (catches 429 on the way
        // back), then shell-headers (taps response headers for
        // X-Consent-Required + X-Email-Verification-Required), then error
        // (catches 401 → SessionState.clear + redirect). Interceptors run
        // top-to-bottom on the way out and bottom-to-top on the way back.
        // No auth interceptor — auth is cookie-based (withCredentials=true
        // on the OpenAPI Configuration provider). See feedback memory
        // `feedback_no_client_token_storage`.
        // demoInterceptor is FIRST: in the demo build it serves every /api
        // call from builders-backed fixtures before any other interceptor
        // runs; in normal builds it is a no-op pass-through.
        // setToArrayInterceptor sits right after: it normalizes Set values in
        // request bodies to JSON arrays (JSON.stringify(new Set) === '{}' —
        // the generated client types Java Set<> relations as TS Set) before
        // anything downstream reads the body.
        demoInterceptor,
        setToArrayInterceptor,
        // ssrCookieForward: server-only — forwards the incoming SSR
        // request's Cookie header onto /api calls so the authGuard probe
        // sees the browser's session during SSR (no-op in the browser and
        // under the prod CommonEngine).
        ssrCookieForwardInterceptor,
        stepUpInterceptor,
        languageInterceptor,
        rateLimitInterceptor,
        shellHeadersInterceptor,
        errorInterceptor,
      ]),
    ),
    provideTransloco({
      config: {
        availableLangs: ['en', 'pl'],
        // iter-107: pinned to 'pl'. The earlier browser-language pick
        // destroyed SSR hydration whenever the browser preferred EN (the
        // client re-rendered English over the prerendered Polish DOM —
        // full destructive re-render, Lantern LCP stuck at ~9s). The
        // product is Polish-first (legacy prod serves PL); EN stays one
        // click away in the toolbar switcher. Side effect: the visual
        // baselines now render PL — matching the legacy phantom side,
        // which the parity spec always forced to pl-PL anyway.
        defaultLang: 'pl',
        fallbackLang: 'en',
        // Reload missing keys instead of crashing — easier dev experience.
        missingHandler: { allowEmpty: true, useFallbackTranslation: true },
        reRenderOnLangChange: true,
        prodMode: !isDevMode(),
      },
    }),
    { provide: TRANSLOCO_LOADER, useClass: HttpTranslocoLoader },
    // Block bootstrap until the active language file is loaded. Without
    // this the first client render (hydration) paints with EMPTY strings
    // and re-paints when pl.json resolves — measured as a pair of
    // equal-and-opposite 0.357 layout shifts (toolbar shrinks, hero jumps
    // 16px up, cookie banner collapses 132px→28px, then all revert).
    // pl.json is <link rel=preload>-ed in index.html, so the wait is a
    // cache hit. The server config has the same initializer (bundled
    // loader) — both renders start from resolved translations.
    // An EXPLICIT switcher choice (lang-preference.ts) survives hard
    // navigations; with nothing stored (and always under SSR) this is
    // byte-identical to the iter-107 'pl' pin.
    {
      provide: APP_INITIALIZER,
      multi: true,
      useFactory: (transloco: TranslocoService) => () => {
        const lang = readLangChoice() ?? 'pl';
        transloco.setActiveLang(lang);
        return firstValueFrom(transloco.load(lang));
      },
      deps: [TranslocoService],
    },
    // Generated OpenAPI client — the base lines up with the dev-server proxy in proxy.conf.js
    // (`/api` → `https://localhost:8080`), and the absolute origin is whichever host serves the bundle.
    // The sandbox build overrides it to '/sandbox/api' because it shares checkitout.app with the demo.
    {
      provide: ApiConfiguration,
      useValue: new ApiConfiguration({ basePath: environment.apiBase, withCredentials: true }),
    },
    // The frozen payments client (core/api-frozen) reads this token instead of ApiConfiguration, and
    // falls back to its own '/api' when nothing provides it — which under a path prefix is the demo's.
    { provide: BASE_PATH, useValue: environment.apiBase },
    // withEventReplay: clicks that land between first paint and hydration
    // completion are captured and replayed once listeners attach. Without it
    // an early click on the SSR'd authed shell (e.g. the user menu right
    // after a hard navigation) is silently dropped — surfaced by the logout
    // oracle once guarded routes started SSR-rendering (2026-09-02).
    provideClientHydration(withNoIncrementalHydration(), withEventReplay()),
    // A guided tour cannot recover a dialog that a click on the backdrop
    // dismissed — the beat points at a control that is gone. In the demo a
    // dialog closes only through its own buttons; production keeps the
    // Material default.
    {
      provide: MAT_DIALOG_DEFAULT_OPTIONS,
      useFactory: () => Object.assign(new MatDialogConfig(), { disableClose: isDemoMode() }),
    },
  ],
};
