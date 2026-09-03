import { provideZoneChangeDetection } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';

/**
 * MSW gating — the browser worker is dynamic-imported only when the URL has
 * `?mock=1` or `localStorage.msw === 'on'`. Production bundles don't include
 * the mock module unless the chunk is explicitly fetched, and tree-shaking
 * keeps the import out of the prod initial-load path.
 */
async function maybeStartMsw(): Promise<void> {
  const params = new URLSearchParams(window.location.search);
  const enabledByQuery = params.get('mock') === '1';
  const enabledByStorage =
    typeof localStorage !== 'undefined' && localStorage.getItem('msw') === 'on';
  if (!enabledByQuery && !enabledByStorage) return;

  const { worker } = await import('./mocks/browser');
  await worker.start({ onUnhandledRequest: 'bypass' });
}

maybeStartMsw()
  .then(() =>
    bootstrapApplication(AppComponent, {
      ...appConfig,
      providers: [provideZoneChangeDetection(), ...appConfig.providers],
    }),
  )
  .catch((err) => console.error(err));
