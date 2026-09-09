import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Router } from '@angular/router';
import { TranslocoModule } from '@ngneat/transloco';
import { catchError, of } from 'rxjs';
import { SandboxAuthService } from '../../../core/auth/sandbox-auth.service';
import { SANDBOX_PERSONAS, type SandboxPersona, type SandboxPersonaKey } from '../../../core/auth/sandbox-personas';

/**
 * The sign-in page of the public sandbox: two shared accounts to choose from, the honest line about
 * what the sandbox is, no Firebase form. Rendered by `SignInComponent` when `isSandboxMode()`.
 */
@Component({
  selector: 'app-sandbox-persona-picker',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatProgressSpinnerModule, TranslocoModule],
  templateUrl: './sandbox-persona-picker.component.html',
})
export class SandboxPersonaPickerComponent {
  private readonly sandboxAuth = inject(SandboxAuthService);
  private readonly router = inject(Router);

  protected readonly personas = SANDBOX_PERSONAS;
  protected readonly pending = signal<SandboxPersonaKey | null>(null);
  protected readonly errorKey = signal<string | null>(null);

  protected choose(persona: SandboxPersona): void {
    if (this.pending() !== null) return;
    this.pending.set(persona.key);
    this.errorKey.set(null);
    this.sandboxAuth
      .signInAs(persona)
      .pipe(
        catchError((err: unknown) => {
          const refused = err instanceof HttpErrorResponse && err.status === 403;
          this.errorKey.set(refused ? 'auth.sandbox.persona_only' : 'auth.sandbox.failed');
          return of(null);
        }),
      )
      .subscribe((user) => {
        if (user) {
          void this.router.navigateByUrl(persona.home);
          return;
        }
        if (this.errorKey() === null) this.errorKey.set('auth.sandbox.failed');
        this.pending.set(null);
      });
  }
}
