import { Component, ChangeDetectionStrategy } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoPipe } from '@ngneat/transloco';
import { SurveyCardComponent } from '../ui/survey-card.component';
import { CodePanelComponent } from '../ui/code-panel.component';

/**
 * Auth-depth showcase. Verified against domains/auth-identity.md:
 *   • Step-up (StepUpAuthService): SecureRandom 6-digit code, ONLY its SHA-256
 *     in Redis (10-min TTL), success mints a one-shot UUID consumed via atomic
 *     getAndDelete; lockout ladder 5 tries → 15-min cooldown → 3 cycles/24 h
 *     → HTTP 423; FE attaches X-Step-Up-Token.
 *   • Session fingerprint: HMAC-SHA256(ip + ":" + userAgent) under a dedicated
 *     derived key, constant-time compare (HmacUtils), fail-secure when absent.
 *   • Impossible travel: 500 km/h cap, 500 ms budget, fails closed for
 *     ADMIN/PENDING_ADMIN/COMPANY (full story in the GeoIP card below).
 *   • Instant revocation: JWT tokenVersion vs Redis (~1-2 ms) → HTTP 419 (not
 *     401) → FE silently refreshes once; /auth/refresh-session exempted to
 *     prevent loops.
 *   • Admin TOTP 2FA: Cloud-KMS-encrypted seed (totp-secrets-key), 10 backup
 *     codes BCrypt-12 then KMS-sealed, 2FA re-armed on every admin login.
 *   • Anti-enumeration password reset: identical real/fake responses, ~500 ms
 *     ± jitter normalized outside the DB transaction, persisted 60 s cooldown.
 * Honesty: step-up = SHA-256 + UUID (HMAC is consent cookies + session
 * fingerprint only); security metrics currently log-only.
 *
 * Greenfield port (feature/demo → editorial system): coral replaces the
 * legacy indigo/primary accent; feather/heroicons became Material ligatures.
 */
@Component({
  selector: 'app-auth-depth-showcase',
  imports: [MatIconModule, TranslocoPipe, SurveyCardComponent, CodePanelComponent],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <app-survey-card
      tag="IDENTITY"
      [title]="'landing.survey.authdepth.title' | transloco"
      [subtitle]="'landing.survey.authdepth.subtitle' | transloco"
    >
      <!-- the five locks -->
      <p class="mt-6 font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-slate2">
        {{ 'landing.survey.authdepth.layersLabel' | transloco }}
      </p>
      <div class="mt-3 space-y-2.5">
        @for (l of locks; track l.k; let i = $index) {
          <div class="flex items-center gap-3 rounded-xl bg-white p-3 ring-1 ring-beige/60">
            <div
              class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-coral-50 text-coral-600"
            >
              <mat-icon class="!h-5 !w-5 !text-xl">{{ l.icon }}</mat-icon>
            </div>
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2">
                <span class="font-mono text-[10px] font-bold text-slate2">{{ i + 1 }}</span>
                <span class="text-sm font-semibold text-ink">
                  {{ 'landing.survey.authdepth.layers.' + l.k + '.t' | transloco }}
                </span>
              </div>
              <div class="text-xs leading-snug text-slate2">
                {{ 'landing.survey.authdepth.layers.' + l.k + '.d' | transloco }}
              </div>
            </div>
            <span
              class="hidden shrink-0 rounded-md bg-cream px-2 py-1 font-mono text-[10px] text-slate2 ring-1 ring-beige sm:inline-flex"
            >
              {{ l.tag }}
            </span>
          </div>
        }
      </div>

      <!-- no user enumeration -->
      <div class="mt-5 rounded-xl bg-cream p-4 ring-1 ring-beige">
        <div class="flex items-center gap-2">
          <mat-icon class="!h-4 !w-4 !text-base text-coral-500">visibility_off</mat-icon>
          <span class="text-sm font-semibold text-ink">
            {{ 'landing.survey.authdepth.enumTitle' | transloco }}
          </span>
        </div>
        <p class="mt-1.5 text-xs leading-relaxed text-slate2">
          {{ 'landing.survey.authdepth.enumDesc' | transloco }}
        </p>
      </div>

      <!-- the 401 vs 419 contract -->
      <div class="mt-5">
        <app-code-panel file="JwtAuthenticationFilter.java · error.interceptor.ts">
          {{ snippet }}
        </app-code-panel>
      </div>
      <p class="mt-2 text-[11px] text-slate2">
        {{ 'landing.survey.authdepth.snippetCaption' | transloco }}
      </p>
      <p class="mt-1 text-[11px] text-slate2">
        {{ 'landing.survey.authdepth.caveat' | transloco }}
      </p>
    </app-survey-card>
  `,
})
export class AuthDepthShowcaseComponent {
  readonly locks = [
    { k: 'stepup', icon: 'vpn_key', tag: 'X-Step-Up-Token' },
    { k: 'fp', icon: 'fingerprint', tag: 'HmacUtils' },
    { k: 'travel', icon: 'place', tag: 'TravelPatternService' },
    { k: 'revoke', icon: 'block', tag: 'tokenVersion → 419' },
    { k: 'totp', icon: 'smartphone', tag: 'TwoFactorAuthService' },
  ];

  readonly snippet = `// The session contract every interceptor honors:
401 = real auth failure        -> log out, clear state
419 = stale-but-valid session  -> silent /auth/refresh-session, retry once

// JwtAuthenticationFilter: tokenVersion (JWT) != tokenVersion (Redis) -> 419
// ~1-2 ms per request; bump the version and every device dies mid-flight.
// /auth/refresh-session itself is exempt — no infinite refresh loops.
// Transient 5xx during refresh keeps the session (no mass-logout events).`;
}
