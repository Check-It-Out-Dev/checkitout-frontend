import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, PLATFORM_ID, inject } from '@angular/core';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Router } from '@angular/router';
import { TranslocoModule } from '@ngneat/transloco';
import { finalize } from 'rxjs';
import { AuthApiService } from '../../../core/auth/auth-api.service';
import { SessionStateService } from '../../../core/auth/session-state.service';

/**
 * Sign-out landing page. Asks BE to clear server-side session cookies +
 * resets the local SessionState cache, then redirects to /auth/sign-in.
 * Local state is wiped regardless of the BE call's outcome — a flaky BE
 * shouldn't leave a stale isAuthenticated signal around.
 */
@Component({
  selector: 'app-sign-out',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatProgressSpinnerModule, TranslocoModule],
  template: `
    <section
      class="flex min-h-[60vh] flex-col items-center justify-center gap-3 p-4 text-center"
      data-testid="sign-out"
    >
      <mat-spinner diameter="40"></mat-spinner>
      <p class="text-slate2">{{ 'auth.sign_out.in_progress' | transloco }}</p>
    </section>
  `,
})
export class SignOutComponent implements OnInit {
  private readonly auth = inject(AuthApiService);
  private readonly session = inject(SessionStateService);
  private readonly router = inject(Router);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  ngOnInit(): void {
    // SSR must not perform the sign-out: the server-side HttpClient has no
    // browser cookie jar, and navigating away during SSR serves the sign-in
    // shell without the client ever firing POST /auth/sign-out — the HttpOnly
    // session cookie would survive the "logout". Server renders the spinner;
    // the browser does the real sign-out after hydration.
    if (!this.isBrowser) {
      return;
    }
    this.auth
      .signOut()
      .pipe(
        finalize(() => {
          this.session.clear();
          void this.router.navigate(['/auth/sign-in']);
        }),
      )
      .subscribe({
        // BE 401/500 is fine — `finalize` clears state + navigates either way.
        error: () => undefined,
      });
  }
}
