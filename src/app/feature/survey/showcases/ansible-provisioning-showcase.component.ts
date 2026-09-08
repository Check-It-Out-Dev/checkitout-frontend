import { Component, ChangeDetectionStrategy } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { SURVEY_RUN_BTN, SURVEY_REPLAY_BTN } from '../ui/survey-run-button';
import { TranslocoPipe } from '@ngneat/transloco';
import { SurveyCardComponent } from '../ui/survey-card.component';
import { CodePanelComponent } from '../ui/code-panel.component';

/**
 * Ansible provisioning showcase: bare Ubuntu -> hardened prod via `make deploy`
 * (site.yml), phased with hardening LAST. 16-slot role scheme (role 12 skipped =>
 * 15 active). Honesty register: branding still instagram-platform, single OVH
 * host, Ansible Vault disabled (placeholder secrets).
 *
 * Ported from the legacy demo build into the greenfield editorial system:
 * shared <app-survey-card> + <app-code-panel>, coral accent for the phase
 * timeline, semantic amber kept ONLY for the hardening roles/tools, coral-pill
 * Run control (house button idiom — greenfield has no shared button primitive).
 */
@Component({
  selector: 'app-ansible-provisioning-showcase',
  imports: [MatIconModule, TranslocoPipe, SurveyCardComponent, CodePanelComponent],
  template: `
    <app-survey-card
      tag="INFRA"
      [title]="'landing.survey.ansible.title' | transloco"
      [subtitle]="'landing.survey.ansible.subtitle' | transloco"
    >
      <!-- phased timeline (interactive) -->
      <div class="mt-6 flex items-center justify-between gap-3">
        <p class="font-mono text-[10px] uppercase tracking-[0.18em] text-slate2">
          {{ 'landing.survey.ansible.timelineLabel' | transloco }}
        </p>
        <div class="flex items-center gap-2">
          @if (done) {
            <span
              class="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700"
            >
              <mat-icon class="!h-3.5 !w-3.5 !text-sm">check_circle</mat-icon>
              {{ 'landing.survey.ansible.run.hardened' | transloco }}
            </span>
          }
          <button type="button" (click)="advance()" [class]="done ? replayBtn : runBtn">
            <mat-icon class="!h-4 !w-4 !text-base">{{ done ? 'replay' : 'play_arrow' }}</mat-icon>
            {{
              (done ? 'landing.survey.ansible.run.replay' : 'landing.survey.ansible.run.cta')
                | transloco
            }}
          </button>
        </div>
      </div>
      <div class="mt-5 space-y-3">
        @for (p of phases; track p.key; let i = $index) {
          <div
            class="relative overflow-hidden rounded-xl border p-4 pl-5 transition-all duration-300"
            [class]="isLit(i) ? 'border-coral-100 bg-white shadow-sm' : 'border-beige bg-cream'"
          >
            <div
              class="absolute inset-y-0 left-0 w-1 transition-all duration-300"
              [class]="isLit(i) ? 'bg-coral-500' : 'bg-beige'"
              [class.ansible-current]="isCurrent(i)"
            ></div>
            <div class="flex items-center gap-2">
              <span
                class="flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold transition-colors"
                [class]="isLit(i) ? 'bg-coral-500 text-white' : 'bg-coral-50 text-coral-600'"
              >
                {{ i + 1 }}
              </span>
              <span
                class="font-mono text-[10px] uppercase tracking-[0.18em] transition-colors"
                [class]="isLit(i) ? 'text-coral-600' : 'text-slate2'"
              >
                {{ 'landing.survey.ansible.phases.' + p.key | transloco }}
              </span>
            </div>
            <div class="mt-2.5 flex flex-wrap gap-2">
              @for (r of p.roles; track r.name) {
                <span
                  class="rounded-md border px-2.5 py-1 font-mono text-xs"
                  [class]="
                    r.hard
                      ? 'border-amber-200 bg-amber-50 text-amber-700'
                      : 'border-beige bg-white text-slate2'
                  "
                >
                  {{ r.name }}
                </span>
              }
            </div>
          </div>
        }
      </div>

      <p class="mt-3 inline-flex items-center gap-1.5 text-[11px] text-slate2">
        <span class="inline-block h-2.5 w-2.5 rounded-sm bg-amber-400"></span>
        {{ 'landing.survey.ansible.legend' | transloco }}
      </p>

      <!-- hardening that runs on the hardened box (semantic amber) -->
      <p class="mt-4 font-mono text-[10px] uppercase tracking-[0.18em] text-slate2">
        {{ 'landing.survey.ansible.toolsLabel' | transloco }}
      </p>
      <div class="mt-2 flex flex-wrap gap-2">
        @for (h of hardening; track h) {
          <span
            class="inline-flex items-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700"
          >
            <mat-icon class="!h-3.5 !w-3.5 !text-sm">shield</mat-icon>
            {{ h }}
          </span>
        }
      </div>

      <p class="mt-4 text-sm font-medium text-ink">
        {{ 'landing.survey.ansible.tagline' | transloco }}
      </p>

      <!-- annotated real roles — terminal-style panel -->
      <div class="mt-4">
        <app-code-panel file="ansible/roles/">{{ snippet }}</app-code-panel>
      </div>
    </app-survey-card>
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: [
    `
      .ansible-current {
        box-shadow: 0 0 6px 1px rgba(255, 90, 54, 0.5);
      }
    `,
  ],
})
export class AnsibleProvisioningShowcaseComponent {
  // Hardening that runs on the box. fail2ban / AppArmor / unattended-upgrades are
  // role-provisioned (01-base-system + 14-security); rkhunter runs on the host.
  readonly hardening = ['fail2ban', 'rkhunter', 'AppArmor', 'unattended-upgrades'];

  // Explicit element type: `hard` is optional, and strictTemplates rejects
  // access to a property the narrowed per-phase inference would drop.
  readonly phases: Array<{ key: string; roles: Array<{ name: string; hard?: boolean }> }> = [
    {
      key: 'foundation',
      roles: [
        { name: '01-base-system' },
        { name: '02-users-groups' },
        { name: '03-directories' },
        { name: '04-docker' },
      ],
    },
    {
      key: 'config',
      roles: [
        { name: '05-secrets' },
        { name: '06-scripts' },
        { name: '07-systemd' },
        { name: '09-sudoers', hard: true },
      ],
    },
    {
      key: 'web',
      roles: [{ name: '08-nginx' }, { name: '10-monitoring' }, { name: '11-docker-compose' }],
    },
    {
      key: 'automation',
      roles: [{ name: '13-automation' }, { name: '14-security', hard: true }],
    },
    {
      key: 'final',
      roles: [{ name: '15-final-hardening', hard: true }, { name: '16-zsh-set-up' }],
    },
  ];

  // Interactive walkthrough: each click runs the next provisioning phase (bare
  // Ubuntu -> hardened). Synchronous state — no timers/rAF, reliable + verifiable.
  step = 0;
  get done(): boolean {
    return this.step >= this.phases.length;
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

  // House button idiom (marketing-toolbar CTA) — flat while running, stroked replay.
  readonly runBtn = SURVEY_RUN_BTN;
  readonly replayBtn = SURVEY_REPLAY_BTN;

  readonly snippet = `# 09-sudoers — refuse to ship a broken sudoers (validated BEFORE install)
visudo -cf /tmp/candidate && install -m 0440 /tmp/candidate /etc/sudoers.d/90-...

# 01-base-system sshd_hardening.conf.j2 — pinned modern crypto, nothing legacy
Ciphers chacha20-poly1305@openssh.com,aes256-gcm@openssh.com
MACs hmac-sha2-512-etm@openssh.com   # ETM-only; kex = curve25519
# operator login on the host: ED25519-SK (FIDO2 YubiKey, PIN + touch) in authorized_keys

# 15-final-hardening — applied LAST: default-DROP firewall + drop docker-group privilege`;
}
