import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslocoModule } from '@ngneat/transloco';
import { HealthApiService } from '../../core/health/health.service';

type ErrorType = '404' | '500' | '503';

/**
 * `/error/:type` — real error pages replacing the shipped placeholder
 * (iter-54, audit P0 #8). Ports legacy's ErrorPageComponent: the route
 * param picks 404/500/503 copy (invalid or missing params keep the 404
 * default, matching legacy), and 503 offers a "Check again" probe that
 * navigates back once the BE reports healthy — honoring the
 * `health-check-redirect-url` sessionStorage handoff legacy's health
 * interceptor writes before redirecting here.
 *
 * Legacy's SeoService calls are intentionally dropped: the greenfield has
 * no SEO service yet, and error pages are noindex-by-content anyway.
 */
@Component({
  selector: 'app-error-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatIconModule, MatProgressSpinnerModule, TranslocoModule],
  templateUrl: './error-page.component.html',
})
export class ErrorPageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly health = inject(HealthApiService);
  private readonly destroyRef = inject(DestroyRef);

  readonly errorType = signal<ErrorType>('404');
  readonly isRefreshing = signal(false);

  ngOnInit(): void {
    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      const type = params.get('type');
      if (type === '404' || type === '500' || type === '503') {
        this.errorType.set(type);
      }
    });
  }

  refreshStatus(): void {
    if (this.errorType() !== '503' || this.isRefreshing()) return;
    this.isRefreshing.set(true);
    this.health.isHealthy().subscribe((healthy) => {
      this.isRefreshing.set(false);
      if (!healthy) return;
      const redirectUrl =
        typeof sessionStorage !== 'undefined'
          ? sessionStorage.getItem('health-check-redirect-url')
          : null;
      if (redirectUrl) {
        sessionStorage.removeItem('health-check-redirect-url');
        void this.router.navigateByUrl(redirectUrl);
      } else {
        this.goHome();
      }
    });
  }

  goHome(): void {
    void this.router.navigateByUrl('/');
  }
}
