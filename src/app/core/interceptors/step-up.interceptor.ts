import { HttpHandlerFn, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { STEP_UP_TOKEN } from '../step-up/step-up-context';

/**
 * Reads `STEP_UP_TOKEN` from the outgoing request's `HttpContext`. When set,
 * adds an `X-Step-Up-Token: <token>` header. The BE consumes the token and
 * deletes it from Redis (single-use), so we don't cache it on the client.
 *
 * Wired first in the `withInterceptors([...])` chain so the step-up header
 * lands before any subsequent interceptors transform the request. Auth
 * itself is cookie-only — no Bearer interceptor to coordinate with.
 */
export const stepUpInterceptor: HttpInterceptorFn = (
  req: HttpRequest<unknown>,
  next: HttpHandlerFn,
) => {
  const token = req.context.get(STEP_UP_TOKEN);
  if (!token) return next(req);

  return next(
    req.clone({
      setHeaders: { 'X-Step-Up-Token': token },
    }),
  );
};
