import { HttpInterceptorFn, HttpResponse } from '@angular/common/http';
import { of } from 'rxjs';
import { isDemoMode } from './demo-mode';
import { matchDemoFixture } from './demo-fixtures';

/**
 * Demo-mode interceptor (ported from the legacy demo build).
 *
 * When `environment.demo` is true, every backend (`/api`) call is served
 * from in-memory fixtures — no network, no real backend, no accounts, no
 * payments. Registered FIRST in the interceptor chain (app.config) so it
 * short-circuits before step-up/language/rate-limit/error ever run. In
 * every non-demo build it is a no-op pass-through, so it is safe to keep
 * permanently in the chain.
 */
export const demoInterceptor: HttpInterceptorFn = (req, next) => {
  if (!isDemoMode()) {
    return next(req);
  }

  // Only mock backend API calls; assets and i18n pass through untouched.
  if (!req.url.includes('/api/')) {
    return next(req);
  }

  const body = matchDemoFixture(req.method, req.url, req.body, req.params);
  // Unmapped calls resolve to a benign empty 200 so nothing errors; a rule
  // that deliberately returns null KEEPS null ("no data yet" semantics).
  return of(new HttpResponse({ status: 200, body: body === undefined ? {} : body }));
};
