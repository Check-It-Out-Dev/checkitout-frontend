import { Component, ChangeDetectionStrategy } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoPipe } from '@ngneat/transloco';
import { WorldSimShellComponent } from './world-sim-shell.component';

/**
 * Phone TOTP simulator — "the admin's phone". A phone frame with an
 * authenticator app that generates 6-digit codes for the 2FA scenario.
 *
 * The teaching beat (owner-designed): the FIRST generated code is recorded
 * as already-expired, so verification rejects it exactly like real TOTP
 * rejects a stale code; the second one is good. State lives in
 * sessionStorage (`demoTotp` = {attempt, code}) so the /twofactor/verify
 * demo fixture can compare against it — deterministic, no timers.
 *
 * Editorial restyle: ink bezel + navy-900 status bar (the one dark surface a
 * phone screen earns), cream code card with beige border, CSS-drawn signal
 * bars and battery (no extra icon-font glyphs).
 */
const TOTP_KEY = 'demoTotp';

export interface DemoTotpState {
  attempt: number;
  code: string;
}

export function readDemoTotp(): DemoTotpState | null {
  try {
    const raw = sessionStorage.getItem(TOTP_KEY);
    return raw ? (JSON.parse(raw) as DemoTotpState) : null;
  } catch {
    return null;
  }
}

@Component({
  selector: 'app-phone-totp-sim',
  imports: [MatIconModule, TranslocoPipe, WorldSimShellComponent],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <app-world-sim-shell position="dock" [caption]="'demo.sims.totp.caption' | transloco">
      <!-- the phone (docked: the 2FA dialog stays usable next to it) -->
      <div class="w-72 overflow-hidden rounded-[2rem] border-8 border-ink bg-white shadow-2xl">
        <!-- status bar -->
        <div
          class="flex items-center justify-between bg-navy-900 px-4 py-1.5 font-mono text-[10px] text-cream/70"
        >
          <span>9:41</span>
          <span class="flex items-center gap-1.5" aria-hidden="true">
            <span class="flex items-end gap-[2px]">
              <span class="h-1 w-0.5 rounded-sm bg-cream/70"></span>
              <span class="h-1.5 w-0.5 rounded-sm bg-cream/70"></span>
              <span class="h-2 w-0.5 rounded-sm bg-cream/70"></span>
            </span>
            <span class="flex h-2 w-4 items-center rounded-[3px] border border-cream/70 p-[1.5px]">
              <span class="h-full w-2/3 rounded-[1px] bg-cream/70"></span>
            </span>
          </span>
        </div>
        <!-- authenticator app -->
        <div class="p-5">
          <div class="flex items-center gap-2">
            <span
              class="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-navy-900 text-cream"
            >
              <mat-icon class="!h-4 !w-4 !text-base">smartphone</mat-icon>
            </span>
            <div>
              <div class="text-sm font-bold text-ink">{{ 'demo.sims.totp.title' | transloco }}</div>
              <div class="font-mono text-[10px] text-slate2">admin&#64;checkitout.app</div>
            </div>
          </div>

          <div class="mt-5 rounded-xl border border-beige bg-cream p-4 text-center">
            @if (code) {
              <div class="font-mono text-3xl font-bold tabular-nums tracking-[0.3em] text-ink">
                {{ code }}
              </div>
            } @else {
              <div class="font-mono text-3xl font-bold tracking-[0.3em] text-ink/20">••••••</div>
            }
            <div
              class="mt-2 text-[11px] font-medium"
              [class]="attempt === 1 ? 'text-amber-600' : 'text-slate2'"
            >
              {{
                (attempt === 0
                  ? 'demo.sims.totp.hintIdle'
                  : attempt === 1
                    ? 'demo.sims.totp.hintStale'
                    : 'demo.sims.totp.hintFresh'
                ) | transloco
              }}
            </div>
          </div>

          <button
            type="button"
            (click)="generate()"
            class="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-navy-900 px-4 py-2.5 text-sm font-semibold text-cream transition-colors hover:bg-navy-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-400"
          >
            <mat-icon class="!h-4 !w-4 !text-base">refresh</mat-icon>
            {{
              (attempt === 0 ? 'demo.sims.totp.generate' : 'demo.sims.totp.regenerate') | transloco
            }}
          </button>
        </div>
      </div>
    </app-world-sim-shell>
  `,
})
export class PhoneTotpSimComponent {
  code = '';
  attempt = 0;

  constructor() {
    const existing = readDemoTotp();
    if (existing) {
      this.code = existing.code;
      this.attempt = existing.attempt;
    }
  }

  generate(): void {
    // Deterministic-enough demo codes; the second one is the good one.
    this.attempt = Math.min(this.attempt + 1, 2);
    this.code = String(Math.floor(100000 + Math.random() * 900000));
    sessionStorage.setItem(
      TOTP_KEY,
      JSON.stringify({ attempt: this.attempt, code: this.code } satisfies DemoTotpState),
    );
  }
}
