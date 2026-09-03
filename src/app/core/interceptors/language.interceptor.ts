import { HttpHandlerFn, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { TranslocoService } from '@ngneat/transloco';

/**
 * Adds `Accept-Language` header from the Transloco active locale.
 * Falls back to navigator.language → 'pl' if Transloco isn't initialised
 * yet (e.g. on the very first request before bootstrap completes).
 */
export const languageInterceptor: HttpInterceptorFn = (
  req: HttpRequest<unknown>,
  next: HttpHandlerFn,
) => {
  const transloco = inject(TranslocoService, { optional: true });
  const lang =
    transloco?.getActiveLang() || (typeof navigator !== 'undefined' && navigator.language) || 'pl';

  return next(
    req.clone({
      setHeaders: { 'Accept-Language': lang },
    }),
  );
};
