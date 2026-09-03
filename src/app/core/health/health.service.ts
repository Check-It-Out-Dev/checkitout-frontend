import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, of } from 'rxjs';
import { HealthControllerService } from '../../api/api/health-controller.api';

/**
 * Thin wrapper over the generated health endpoint. The 503 error page's
 * "Check again" button (iter-54, audit P0 #8) polls this to decide whether
 * the backend recovered; any successful response counts as healthy, any
 * transport/5xx failure maps to `false` instead of an error so callers can
 * treat it as a plain boolean probe.
 */
@Injectable({ providedIn: 'root' })
export class HealthApiService {
  private readonly api = inject(HealthControllerService);

  isHealthy(): Observable<boolean> {
    return this.api.health().pipe(
      map(() => true),
      catchError(() => of(false)),
    );
  }
}
