import { HttpErrorResponse, HttpHandlerFn, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { RateLimitStateService } from '../rate-limit/rate-limit-state.service';

/**
 * Surfaces 429 (Too Many Requests) to the user instead of failing silently.
 * On a 429 it parses `Retry-After` and pushes it into
 * {@link RateLimitStateService}, which the shell renders as an amber banner
 * that auto-dismisses after the window. The response is re-thrown unchanged
 * so each calling component still handles its own error path.
 *
 * (Legacy also cached GET responses during the cool-down; that piece stays
 * deferred — caching without a UI signal masks the limit.)
 */
export const rateLimitInterceptor: HttpInterceptorFn = (
  req: HttpRequest<unknown>,
  next: HttpHandlerFn,
) => {
  const rateLimit = inject(RateLimitStateService);
  return next(req).pipe(
    catchError((err) => {
      if (err instanceof HttpErrorResponse && err.status === 429) {
        // Retry-After is either delta-seconds or an HTTP-date. We honour the
        // common delta-seconds form; a date (rare here) falls back to null.
        const raw = err.headers.get('Retry-After')?.trim() ?? '';
        const seconds = /^\d+$/.test(raw) ? Number(raw) : null;
        rateLimit.notify(seconds);
      }
      return throwError(() => err);
    }),
  );
};
