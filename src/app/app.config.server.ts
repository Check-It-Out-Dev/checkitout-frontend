import { provideServerRendering } from '@angular/ssr';
import { ApplicationConfig, mergeApplicationConfig } from '@angular/core';
import { TRANSLOCO_LOADER } from '@ngneat/transloco';

import { appConfig } from './app.config';
import { ServerTranslocoLoader } from './core/i18n/server-transloco-loader';

/**
 * Server (prerender) overrides. The base config already blocks bootstrap
 * on `transloco.load('pl')` via APP_INITIALIZER — both renders start from
 * resolved translations. Here we only swap the HTTP loader for the
 * bundled-JSON one: during prerender there is no origin to fetch
 * `assets/i18n/*.json` from, and the HTTP loader fails SILENTLY (the
 * page serializes with empty strings).
 *
 * Note (2026-09-02): we deliberately do NOT override the HTTP backend with
 * withFetch() here. authGuard renders the shell on the server without
 * probing (see auth.guards.ts), so no authenticated /api call happens
 * during SSR — the base config's withXhr() backend is never exercised
 * server-side. Adding withFetch() made the Angular SSR fetch guard reject
 * any relative call that resolves to a localhost origin ("URL with
 * hostname localhost is not allowed"), which 500'd the standalone SSR
 * server locally (demo build, `node server.mjs`). It was harmless in prod
 * (real hostname) but broke local serving for no gain, so it's out.
 */
const serverConfig: ApplicationConfig = {
  providers: [
    provideServerRendering(),
    { provide: TRANSLOCO_LOADER, useClass: ServerTranslocoLoader },
  ],
};

export const config = mergeApplicationConfig(appConfig, serverConfig);
