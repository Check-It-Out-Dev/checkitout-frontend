import { Component, ChangeDetectionStrategy } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoPipe } from '@ngneat/transloco';
import { SurveyCardComponent } from '../ui/survey-card.component';
import { CodePanelComponent } from '../ui/code-panel.component';

/**
 * Backups + DR showcase. Verified against domains/backups-dr.md:
 *   • Chain: backup lands (count + size sanity, backup-metadata.json) →
 *     chattr +i within ~1 s → validation (SHA-256 match, 600 s replay window,
 *     future timestamps rejected) → execution under timeout, relock,
 *     self-delete (validate-and-exec-ci-script.sh V10.1 +
 *     immutable-aware-backup.sh "Gold Standard V3").
 *   • Survival stories: total VPS loss costs zero secrets (IG tokens + TOTP
 *     seeds live off-host in Firestore, KMS-encrypted; OVH snapshot runbook
 *     restores the host); a bad deploy hits the fail-closed pre-deployment
 *     backup + automatic systemd rollback preserving PG volumes.
 *   • Log plane: versioned GCS bucket, 30-day lifecycle, PAP enforced;
 *     Redis Sentinel down-after 5 s / failover 10 s; 10-step executable
 *     immutability proof script.
 * HONEST GAP (must stay): no automated pg_dump/WAL cron — app-DB durability
 * today = Docker volume + OVH snapshots; logical backups are a tracked TODO.
 * Amber is semantic here: a real, disclosed gap.
 *
 * Ported from the legacy demo build into the greenfield editorial system
 * (shared <app-survey-card> + <app-code-panel>, coral accents, cream bands).
 */
@Component({
  selector: 'app-backups-dr-showcase',
  imports: [MatIconModule, TranslocoPipe, SurveyCardComponent, CodePanelComponent],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <app-survey-card
      tag="RESILIENCE"
      [title]="'landing.survey.backups.title' | transloco"
      [subtitle]="'landing.survey.backups.subtitle' | transloco"
    >
      <!-- the immutable chain -->
      <p class="mt-6 font-mono text-[10px] uppercase tracking-[0.18em] text-slate2">
        {{ 'landing.survey.backups.chainLabel' | transloco }}
      </p>
      <div class="mt-2 grid grid-cols-2 gap-2 lg:grid-cols-4">
        @for (s of chain; track s.k; let last = $last) {
          <div class="relative rounded-xl border border-beige bg-cream p-4">
            <div
              class="flex h-9 w-9 items-center justify-center rounded-lg bg-coral-50 text-coral-600"
            >
              <mat-icon class="!h-5 !w-5 !text-xl">{{ s.icon }}</mat-icon>
            </div>
            <div class="mt-2.5 text-xs font-semibold leading-tight text-ink">
              {{ 'landing.survey.backups.chain.' + s.k + '.t' | transloco }}
            </div>
            <div class="font-mono text-[10px] leading-tight text-slate2">
              {{ 'landing.survey.backups.chain.' + s.k + '.d' | transloco }}
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

      <!-- what survives what -->
      <p class="mt-6 font-mono text-[10px] uppercase tracking-[0.18em] text-slate2">
        {{ 'landing.survey.backups.surviveLabel' | transloco }}
      </p>
      <div class="mt-2 grid gap-3 sm:grid-cols-2">
        @for (s of survive; track s.k) {
          <div class="rounded-xl border border-beige bg-cream p-4">
            <div class="flex items-center gap-2">
              <mat-icon class="!h-4 !w-4 !text-base text-coral-500">{{ s.icon }}</mat-icon>
              <span class="text-sm font-semibold text-ink">
                {{ 'landing.survey.backups.survive.' + s.k + '.t' | transloco }}
              </span>
            </div>
            <p class="mt-1.5 text-xs leading-relaxed text-slate2">
              {{ 'landing.survey.backups.survive.' + s.k + '.d' | transloco }}
            </p>
          </div>
        }
      </div>

      <!-- fact chips -->
      <div class="mt-4 flex flex-wrap gap-2">
        @for (f of facts; track f) {
          <span
            class="inline-flex items-center gap-1.5 rounded-full border border-beige bg-white px-3 py-1 text-xs font-medium text-ink"
          >
            <mat-icon class="!h-3.5 !w-3.5 !text-sm text-coral-500">check_circle</mat-icon>
            {{ 'landing.survey.backups.facts.' + f | transloco }}
          </span>
        }
      </div>

      <!-- the honest gap (semantic amber: a real, disclosed limitation) -->
      <div class="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4">
        <div class="flex items-center gap-2">
          <mat-icon class="!h-4 !w-4 !text-base text-amber-600">warning</mat-icon>
          <span class="text-sm font-semibold text-ink">
            {{ 'landing.survey.backups.gapTitle' | transloco }}
          </span>
        </div>
        <p class="mt-1.5 text-xs leading-relaxed text-slate2">
          {{ 'landing.survey.backups.gapDesc' | transloco }}
        </p>
      </div>

      <!-- real validation logic -->
      <div class="mt-5">
        <app-code-panel
          file="validate-and-exec-ci-script.sh"
          path=".github/scripts/remote/validate-and-exec-ci-script.sh"
        >
          {{ snippet }}
        </app-code-panel>
      </div>
      <p class="mt-2 text-[11px] text-slate2">
        {{ 'landing.survey.backups.snippetCaption' | transloco }}
      </p>
      <p class="mt-1 text-[11px] text-slate2">
        {{ 'landing.survey.backups.caveat' | transloco }}
      </p>
    </app-survey-card>
  `,
})
export class BackupsDrShowcaseComponent {
  readonly chain = [
    { k: 'land', icon: 'download' },
    { k: 'lock', icon: 'lock' },
    { k: 'verify', icon: 'fact_check' },
    { k: 'exec', icon: 'bolt' },
  ];

  readonly survive = [
    { k: 'vps', icon: 'cloud_off' },
    { k: 'deploy', icon: 'replay' },
  ];

  readonly facts = ['gcs', 'sentinel', 'proof'];

  readonly snippet = `# Replay-window enforcement (default 600s) — V10.1
age = now - upload_timestamp        # from the immutable .metadata
reject if age > SCRIPT_EXECUTION_TIMEOUT_SECONDS
reject if upload_timestamp > now    # clock-skew / tamper attempt

# SHA-256: the argument checksum must match metadata AND sha256sum
# on success: the validator and the script rm -f THEMSELVES
# immutable-aware-backup.sh re-applies chattr +i to source AND backup`;
}
