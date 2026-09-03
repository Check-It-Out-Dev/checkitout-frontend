import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, of, shareReplay } from 'rxjs';
import { PublicConfigControllerService as GeneratedPublicConfigService } from '../../api/api/public-config-controller.api';

/**
 * Read-only wrapper for the anonymous runtime-config endpoint
 * (`GET /public-config`). Surfaces the feature flags the FE needs at bootstrap.
 *
 * `paymentsEnabled` mirrors the BE `app.payments.enabled` toggle. When it is
 * OFF, `SubscriptionPaidController` (upgrade / trial / downgrade / portal) is
 * never registered — those endpoints 404 — so the FE must HIDE those actions
 * rather than let a click 404 on a free-only deployment. The flag is fetched
 * once and cached (`shareReplay`); a failed fetch fails SAFE to `true` (show
 * the actions — the paid calls keep their own error handling) so a transient
 * config blip never hides billing on a paid deployment.
 */
@Injectable({ providedIn: 'root' })
export class PublicConfigApiService {
  private readonly api = inject(GeneratedPublicConfigService);

  private readonly paymentsEnabled$: Observable<boolean> = this.api.getConfig().pipe(
    map((c) => c.paymentsEnabled ?? true),
    catchError(() => of(true)),
    shareReplay(1),
  );

  /** Whether paid subscription actions are available on this deployment. */
  paymentsEnabled(): Observable<boolean> {
    return this.paymentsEnabled$;
  }
}
