import { HttpEvent, HttpHandlerFn, HttpInterceptorFn, HttpRequest, HttpResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { tap } from 'rxjs';
import { ShellStatusService } from '../shell/shell-status.service';

/**
 * Taps every API response, reads the BE's custom shell-status headers
 * (`X-Consent-Required`, `X-Email-Verification-Required`), and updates the
 * `ShellStatusService` so the shell-banners component can show the right
 * obligations.
 *
 * It doesn't need to be in any specific position relative to
 * `errorInterceptor` — both observe the response stream independently.
 *
 * The interceptor is purely observational: it doesn't transform requests,
 * doesn't throw, doesn't drop responses. If the headers are absent the
 * service stays untouched.
 */
export const shellHeadersInterceptor: HttpInterceptorFn = (
  req: HttpRequest<unknown>,
  next: HttpHandlerFn,
) => {
  const shellStatus = inject(ShellStatusService);
  return next(req).pipe(
    tap((event: HttpEvent<unknown>) => {
      if (event instanceof HttpResponse) {
        shellStatus.noteResponseHeaders(event.headers);
      }
    }),
  );
};
