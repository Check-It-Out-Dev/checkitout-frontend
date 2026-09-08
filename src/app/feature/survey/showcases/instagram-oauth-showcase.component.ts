import { Component, ChangeDetectionStrategy } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { SURVEY_RUN_BTN, SURVEY_REPLAY_BTN } from '../ui/survey-run-button';
import { TranslocoPipe } from '@ngneat/transloco';
import { SurveyCardComponent } from '../ui/survey-card.component';
import { CodePanelComponent } from '../ui/code-panel.component';

/**
 * Instagram / Meta OAuth showcase. Verified against auth/social/instagram/
 * (InstagramService + InstagramStartupValidator): a real OAuth 2.0
 * authorization-code flow on Instagram Business Login (Meta tech-provider) —
 * authorize on instagram.com → POST api.instagram.com/oauth/access_token
 * (grant_type=authorization_code, client_secret server-side) → short-lived token
 * → exchange for a 60-day long-lived token (with retry) → profile via
 * graph.facebook.com. Security: client_secret never leaves the server, tokens are
 * redacted in logs (access_token=[redacted]), redirect_uri is validated, and a
 * startup validator checks the Meta app config. At rest the access token is
 * AES-256-GCM encrypted via Google Cloud KMS (TokenEncryptionService + KMSValidationService,
 * key ring instagram-tokens @ europe-central2, key token-encryption-key) — the key never
 * leaves KMS, so a database compromise yields only ciphertext; admin TOTP 2FA secrets get
 * the same treatment under a separate key (totp-secrets-key, TotpEncryptionService).
 * Honesty register: in this demo the connect button is impression-only; the real flow
 * runs in prod, where the app holds Meta tech-provider status today.
 *
 * Ported from the legacy demo build (feature/demo) into the greenfield editorial
 * system: shared <app-survey-card> + <app-code-panel>; the Instagram brand
 * gradient is contained to the brand mark only, the interactive flow uses the
 * single coral accent, and security facts/KMS keep semantic emerald.
 */
@Component({
  selector: 'app-instagram-oauth-showcase',
  imports: [MatIconModule, TranslocoPipe, SurveyCardComponent, CodePanelComponent],
  template: `
    <app-survey-card>
      <!-- branded header: IG mark (brand gradient, contained) + IDENTITY eyebrow -->
      <div class="flex items-center gap-3">
        <span
          class="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-yellow-400 via-pink-500 to-purple-600 text-white shadow-sm"
        >
          <mat-icon class="!h-5 !w-5 !text-xl">photo_camera</mat-icon>
        </span>
        <span
          class="inline-flex items-center rounded-full bg-coral-50 px-3 py-1 font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-coral-600"
        >
          IDENTITY
        </span>
      </div>
      <!-- h2: cards sit directly under the page h1 (chapter question) -->
      <h2 class="font-display mt-3 text-2xl text-ink">
        {{ 'landing.survey.instagram.title' | transloco }}
      </h2>
      <p class="mt-2 leading-relaxed text-slate2">
        {{ 'landing.survey.instagram.subtitle' | transloco }}
      </p>

      <!-- Meta tech-provider badge (verified -> semantic emerald) -->
      <div
        class="mt-4 inline-flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 ring-1 ring-emerald-200"
      >
        <mat-icon class="!h-4 !w-4 !text-base text-emerald-600">check_circle</mat-icon>
        <span class="text-sm font-semibold text-ink">
          {{ 'landing.survey.instagram.provider' | transloco }}
        </span>
      </div>

      <!-- OAuth handshake flow (interactive — step through the impression-only demo) -->
      <div class="mt-6 flex items-center justify-between gap-3">
        <p class="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-slate2">
          {{ 'landing.survey.instagram.flowLabel' | transloco }}
        </p>
        <div class="flex items-center gap-2">
          @if (done) {
            <span
              class="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-200"
            >
              <mat-icon class="!h-3.5 !w-3.5 !text-sm">check_circle</mat-icon>
              {{ 'landing.survey.instagram.run.connected' | transloco }}
            </span>
          }
          <button type="button" (click)="advance()" [class]="done ? replayBtn : runBtn">
            <mat-icon class="!h-4 !w-4 !text-base">{{ done ? 'refresh' : 'play_arrow' }}</mat-icon>
            {{
              (done ? 'landing.survey.instagram.run.replay' : 'landing.survey.instagram.run.cta')
                | transloco
            }}
          </button>
        </div>
      </div>
      <div class="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
        @for (f of flow; track f.key; let i = $index; let last = $last) {
          <div
            class="relative rounded-xl p-4 ring-1 transition-all duration-300"
            [class]="isLit(i) ? 'bg-white ring-coral-200 shadow-sm' : 'bg-cream ring-beige'"
          >
            <div
              class="flex h-9 w-9 items-center justify-center rounded-lg transition-all duration-300"
              [class]="isLit(i) ? 'bg-coral-500 text-white' : 'bg-coral-50 text-coral-600'"
              [class.oauth-current]="isCurrent(i)"
            >
              <mat-icon class="!h-5 !w-5 !text-xl">{{ f.icon }}</mat-icon>
            </div>
            <div
              class="mt-2.5 text-xs font-semibold leading-tight"
              [class]="isLit(i) ? 'text-ink' : 'text-slate2'"
            >
              {{ 'landing.survey.instagram.flow.' + f.key | transloco }}
            </div>
            <div class="break-all font-mono text-[10px] leading-tight text-slate2">{{ f.ep }}</div>
            @if (!last) {
              <mat-icon
                class="absolute -right-3 top-8 hidden !h-5 !w-5 !text-xl transition-colors sm:block"
                [class]="isLit(i + 1) ? 'text-coral-500' : 'text-beige'"
              >
                chevron_right
              </mat-icon>
            }
          </div>
        }
      </div>

      <!-- token lifecycle -->
      <div class="mt-4 flex flex-wrap items-center gap-2 text-[11px]">
        <span class="rounded-md bg-cream px-2.5 py-1 font-mono text-slate2 ring-1 ring-beige">
          {{ 'landing.survey.instagram.shortLived' | transloco }}
        </span>
        <mat-icon class="!h-4 !w-4 !text-base text-slate2">arrow_forward</mat-icon>
        <span
          class="rounded-md bg-emerald-50 px-2.5 py-1 font-mono text-emerald-700 ring-1 ring-emerald-200"
        >
          {{ 'landing.survey.instagram.longLived' | transloco }}
        </span>
        <span class="text-slate2">{{ 'landing.survey.instagram.tokenNote' | transloco }}</span>
      </div>

      <!-- security facts -->
      <div class="mt-5 grid gap-x-8 gap-y-2 sm:grid-cols-2">
        @for (k of facts; track k) {
          <div class="flex items-start gap-2 text-xs text-slate2">
            <mat-icon class="mt-0.5 !h-4 !w-4 shrink-0 !text-base text-emerald-500">
              shield
            </mat-icon>
            <span class="leading-relaxed">
              {{ 'landing.survey.instagram.facts.' + k | transloco }}
            </span>
          </div>
        }
      </div>

      <!-- KMS: encrypted at rest, so a stolen database yields nothing usable (semantic emerald) -->
      <div class="mt-5 rounded-xl bg-emerald-50 p-4 ring-1 ring-emerald-200">
        <div class="flex items-center gap-2">
          <span
            class="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500 text-white shadow-sm"
          >
            <mat-icon class="!h-4 !w-4 !text-base">vpn_key</mat-icon>
          </span>
          <span class="text-sm font-semibold text-ink">
            {{ 'landing.survey.instagram.kmsTitle' | transloco }}
          </span>
        </div>
        <p class="mt-2 text-xs leading-relaxed text-slate2">
          {{ 'landing.survey.instagram.kmsDesc' | transloco }}
        </p>
        <div class="mt-3 flex flex-wrap gap-2">
          @for (k of kmsKeys; track k.k) {
            <span
              class="inline-flex items-center gap-1.5 rounded-md bg-white px-2.5 py-1 text-[11px] text-slate2 ring-1 ring-emerald-200"
            >
              <mat-icon class="!h-3.5 !w-3.5 !text-sm text-emerald-500">lock</mat-icon>
              <span class="font-mono font-semibold text-ink">{{ k.key }}</span>
              <span class="text-slate2">
                · {{ 'landing.survey.instagram.kms.' + k.k | transloco }}
              </span>
            </span>
          }
        </div>
        <p class="mt-2 text-[11px] text-slate2">
          {{ 'landing.survey.instagram.kmsMeta' | transloco }}
        </p>
      </div>

      <!-- real token-exchange snippet -->
      <div class="mt-5">
        <app-code-panel file="InstagramService.java">{{ snippet }}</app-code-panel>
      </div>
      <p class="mt-2 text-[11px] text-slate2">
        {{ 'landing.survey.instagram.codeCaption' | transloco }}
      </p>
    </app-survey-card>
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: [
    `
      .oauth-current {
        box-shadow: 0 0 0 4px rgba(255, 90, 54, 0.2);
      }
    `,
  ],
})
export class InstagramOauthShowcaseComponent {
  readonly runBtn = SURVEY_RUN_BTN;
  readonly replayBtn = SURVEY_REPLAY_BTN;

  readonly flow = [
    { key: 'authorize', icon: 'login', ep: 'instagram.com/oauth/authorize' },
    { key: 'exchange', icon: 'swap_horiz', ep: 'api.instagram.com/oauth/access_token' },
    { key: 'longlived', icon: 'schedule', ep: 'ig_exchange_token · retry' },
    { key: 'profile', icon: 'person', ep: 'graph.facebook.com' },
  ];

  // Interactive walkthrough: each click lights the next handshake step. Synchronous
  // state — no timers/rAF, so it's reliable + verifiable. The demo fires no real OAuth.
  step = 0;
  get done(): boolean {
    return this.step >= this.flow.length;
  }
  advance(): void {
    this.step = this.done ? 0 : this.step + 1;
  }
  isLit(i: number): boolean {
    return i < this.step;
  }
  isCurrent(i: number): boolean {
    return i === this.step - 1;
  }

  readonly facts = ['secret', 'redact', 'redirect', 'validator'];

  // Both stored as KMS ciphertext under their own key in the instagram-tokens ring.
  readonly kmsKeys = [
    { key: 'token-encryption-key', k: 'igtoken' },
    { key: 'totp-secrets-key', k: 'totp' },
  ];

  readonly snippet = `// InstagramService — code → short-lived token (client_secret stays server-side)
formData.add("client_secret", config.getClientSecret());
formData.add("redirect_uri",  config.getRedirectUri());
formData.add("grant_type",    "authorization_code");
POST https://api.instagram.com/oauth/access_token   // → { access_token, user_id }

// exchange for a 60-day long-lived token (with retry), then fetch the profile
exchangeLongLivedTokenWithRetry(shortLivedToken);   // graph.facebook.com
// every log line is scrubbed:  access_token=[redacted]
// at rest the token is KMS-encrypted (AES-256-GCM) — the key lives in Google
// KMS, never in the database:  tokenEncryptionService.encryptToken(longLived);`;
}
