import { Component, ChangeDetectionStrategy } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoPipe } from '@ngneat/transloco';
import { SurveyCardComponent } from '../ui/survey-card.component';
import { CodePanelComponent } from '../ui/code-panel.component';

/**
 * Secrets + KMS showcase. Verified against domains/secrets-crypto.md:
 *   • Two purpose-isolated Cloud KMS keys (ring instagram-tokens(-prod),
 *     europe-central2): token-encryption-key (Instagram tokens, AES-256-GCM,
 *     encrypted before the Firestore write) and totp-secrets-key (admin TOTP
 *     seeds + BCrypt-12 backup codes). KMSValidationService runs a
 *     @PostConstruct encrypt→decrypt round-trip + latency probe.
 *   • Three independently rotatable HMAC secrets: jwt.secret,
 *     cookie.hmac.secret, consent.hmac-secret (+ derived -fingerprint key).
 *   • Pipeline: GSM PROD_ secrets → init container writes secrets.env with an
 *     encrypted local cache fallback → .init-complete marker gates the app →
 *     entrypoint waits up to 120 s and logs secret LENGTHS only.
 *   • Hygiene: Ansible 05-secrets enforces 0640/0750 with a verify play that
 *     halts on drift, no_log: true; HashingUtil.generateRedisKey makes every
 *     Redis key a SHA-256 pseudonym (rate-limit / geo / user-cache / step-up).
 * Honesty: KMS-managed envelope under two purpose-isolated keys (not a
 * hand-rolled DEK/KEK scheme); boot self-test warns-and-boots — runtime
 * encryption is fail-closed.
 *
 * Greenfield port (feature/demo → editorial system): emerald kept as the
 * established "encrypted at rest" semantic accent; structural tiles moved
 * from legacy indigo/primary to coral on cream/beige surfaces.
 */
@Component({
  selector: 'app-secrets-kms-showcase',
  imports: [MatIconModule, TranslocoPipe, SurveyCardComponent, CodePanelComponent],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <app-survey-card
      tag="SECRETS"
      [title]="'landing.survey.secrets.title' | transloco"
      [subtitle]="'landing.survey.secrets.subtitle' | transloco"
    >
      <!-- the two keys -->
      <p class="mt-6 font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-slate2">
        {{ 'landing.survey.secrets.keysLabel' | transloco }}
      </p>
      <div class="mt-2 grid gap-3 sm:grid-cols-2">
        @for (k of kmsKeys; track k.k) {
          <div class="rounded-xl bg-emerald-50 p-4 ring-1 ring-emerald-200">
            <div class="flex items-center gap-2">
              <span
                class="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500 text-white shadow-sm"
              >
                <mat-icon class="!h-4 !w-4 !text-base">vpn_key</mat-icon>
              </span>
              <span class="font-mono text-sm font-semibold text-ink">{{ k.name }}</span>
            </div>
            <p class="mt-2 text-xs leading-relaxed text-slate2">
              {{ 'landing.survey.secrets.keys.' + k.k + '.d' | transloco }}
            </p>
          </div>
        }
      </div>

      <!-- three rotatable HMAC secrets -->
      <p class="mt-6 font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-slate2">
        {{ 'landing.survey.secrets.hmacLabel' | transloco }}
      </p>
      <div class="mt-2 flex flex-wrap gap-2">
        @for (s of hmacSecrets; track s) {
          <span
            class="rounded-md bg-cream px-2.5 py-1 font-mono text-[11px] text-slate2 ring-1 ring-beige"
          >
            {{ s }}
          </span>
        }
      </div>
      <p class="mt-1.5 text-[11px] leading-relaxed text-slate2">
        {{ 'landing.survey.secrets.hmacNote' | transloco }}
      </p>

      <!-- the pipeline -->
      <p class="mt-6 font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-slate2">
        {{ 'landing.survey.secrets.pipeLabel' | transloco }}
      </p>
      <div class="mt-2 grid grid-cols-2 gap-2 lg:grid-cols-4">
        @for (s of pipeline; track s.k; let last = $last) {
          <div class="relative rounded-xl bg-cream p-4 ring-1 ring-beige">
            <div
              class="flex h-9 w-9 items-center justify-center rounded-lg bg-coral-50 text-coral-600"
            >
              <mat-icon class="!h-5 !w-5 !text-xl">{{ s.icon }}</mat-icon>
            </div>
            <div class="mt-2.5 text-xs font-semibold leading-tight text-ink">
              {{ 'landing.survey.secrets.pipe.' + s.k + '.t' | transloco }}
            </div>
            <div class="font-mono text-[10px] leading-tight text-slate2">
              {{ 'landing.survey.secrets.pipe.' + s.k + '.d' | transloco }}
            </div>
            @if (!last) {
              <mat-icon
                class="absolute -right-3 top-8 z-10 hidden !h-5 !w-5 !text-xl text-beige lg:block"
              >
                chevron_right
              </mat-icon>
            }
          </div>
        }
      </div>

      <!-- hygiene facts -->
      <div class="mt-5 grid gap-x-8 gap-y-2 sm:grid-cols-2">
        @for (h of hygiene; track h) {
          <div class="flex items-start gap-2 text-xs text-slate2">
            <mat-icon class="mt-0.5 !h-4 !w-4 !text-base shrink-0 text-emerald-500">
              shield
            </mat-icon>
            <span class="leading-relaxed">
              {{ 'landing.survey.secrets.hygiene.' + h | transloco }}
            </span>
          </div>
        }
      </div>

      <!-- real config -->
      <div class="mt-5">
        <app-code-panel
          file="ansible/roles/05-secrets"
          path="ansible/roles/05-secrets/defaults/main.yml"
        >
          {{ snippet }}
        </app-code-panel>
      </div>
      <p class="mt-2 text-[11px] text-slate2">
        {{ 'landing.survey.secrets.snippetCaption' | transloco }}
      </p>
      <p class="mt-1 text-[11px] text-slate2">
        {{ 'landing.survey.secrets.caveat' | transloco }}
      </p>
    </app-survey-card>
  `,
})
export class SecretsKmsShowcaseComponent {
  readonly kmsKeys = [
    { k: 'token', name: 'token-encryption-key' },
    { k: 'totp', name: 'totp-secrets-key' },
  ];

  readonly hmacSecrets = [
    'jwt.secret',
    'cookie.hmac.secret',
    'consent.hmac-secret',
    '↳ derived -fingerprint key',
  ];

  readonly pipeline = [
    { k: 'gsm', icon: 'cloud' },
    { k: 'init', icon: 'download' },
    { k: 'gate', icon: 'fact_check' },
    { k: 'boot', icon: 'bolt' },
  ];

  readonly hygiene = ['perm', 'nolog', 'len', 'redis'];

  readonly snippet = `# ansible/roles/05-secrets — permissions are an asserted invariant
secret_file_permissions: "0640"   # CRITICAL - do not change
secret_dir_permissions:  "0750"
# verify.yml: stat each secret file + assert mode == '0640'
#             fail_msg on drift -> the play HALTS
# prod-secrets.yml: vault_gcp_service_account_prod -> service-account.json
#                   no_log: true  (values never reach the Ansible log)`;
}
