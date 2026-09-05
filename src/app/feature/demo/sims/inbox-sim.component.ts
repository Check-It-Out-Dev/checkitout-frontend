import { ChangeDetectionStrategy, Component, OnInit, inject, input, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoPipe } from '@ngneat/transloco';
import { WorldSimShellComponent } from './world-sim-shell.component';
import { DEMO_STEP_UP_KEY, markCompanyMailVerified } from '../../../core/demo/demo-fixtures';
import { SandboxDirectorService } from '../../../core/demo/sandbox-director.service';

/**
 * Inbox simulator — "the user's mailbox". Shows one branded CheckItOut
 * message in a mail-client frame. Two variants:
 *   • verify  — the activation mail; its CTA reports the click to the
 *     director (notify with the current step id) and the scenario moves on
 *     once the step is an event step.
 *   • code    — the step-up mail carrying the one-time code (read from
 *     sessionStorage `demoStepUpCode`, written by the step-up demo fixture).
 * Mail opens immediately (list row is pre-selected) — one less dead click.
 *
 * Editorial restyle: cream client chrome with beige borders; the CheckItOut
 * brand inside the mail is coral now (avatar + CTA), because the mail is OUR
 * mail — the vendor sims keep their own colors instead.
 */
@Component({
  selector: 'app-inbox-sim',
  imports: [MatIconModule, TranslocoPipe, WorldSimShellComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-world-sim-shell
      [position]="variant() === 'code' ? 'dock' : 'center'"
      [caption]="'demo.sims.inbox.caption' | transloco"
    >
      <div
        class="overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-beige"
        [class]="variant() === 'code' ? 'w-[20rem]' : 'w-[28rem] max-w-[calc(100vw-3rem)]'"
      >
        <!-- mail client chrome -->
        <div class="flex items-center gap-2 border-b border-beige bg-cream px-4 py-2.5">
          <mat-icon class="!h-4 !w-4 !text-base text-slate2">inbox</mat-icon>
          <span class="text-xs font-semibold text-ink">
            {{ 'demo.sims.inbox.title' | transloco }}
          </span>
          <span class="ml-auto font-mono text-[10px] text-slate2/70">demo&#64;checkitout.app</span>
        </div>
        <!-- the message -->
        <div class="p-5">
          <div class="flex items-center gap-2.5">
            <span
              class="inline-flex h-9 w-9 items-center justify-center rounded-full bg-coral-700 text-xs font-bold text-white"
            >
              C
            </span>
            <div class="min-w-0">
              <div class="text-sm font-bold text-ink">CheckItOut</div>
              <div class="truncate font-mono text-[11px] text-slate2">
                noreply&#64;checkitout.app
              </div>
            </div>
            <span class="ml-auto shrink-0 text-[10px] text-slate2/70">
              {{ 'demo.sims.inbox.now' | transloco }}
            </span>
          </div>
          <div class="mt-3 text-sm font-semibold text-ink">
            {{
              (variant() === 'verify'
                ? 'demo.sims.inbox.subjectVerify'
                : 'demo.sims.inbox.subjectCode'
              ) | transloco
            }}
          </div>
          <div class="mt-3 rounded-xl border border-beige bg-cream p-4">
            <p class="text-xs leading-relaxed text-slate2">
              {{
                (variant() === 'verify' ? 'demo.sims.inbox.bodyVerify' : 'demo.sims.inbox.bodyCode')
                  | transloco
              }}
            </p>
            <!-- verify: the branded CTA the real mail carries -->
            @if (variant() === 'verify') {
              <button
                type="button"
                (click)="clickCta()"
                data-testid="inbox-sim-cta"
                class="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-coral-700 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-coral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-300"
              >
                {{ 'demo.sims.inbox.verifyCta' | transloco }}
                <mat-icon class="!h-4 !w-4 !text-base">check_circle</mat-icon>
              </button>
            }
            <!-- code: the step-up one-time code -->
            @if (variant() === 'code') {
              <div class="mt-3 rounded-lg border border-beige bg-white py-3 text-center">
                <span class="font-mono text-2xl font-bold tabular-nums tracking-[0.3em] text-ink">
                  {{ stepUpCode() }}
                </span>
              </div>
            }
          </div>
        </div>
      </div>
    </app-world-sim-shell>
  `,
})
export class InboxSimComponent implements OnInit {
  private readonly director = inject(SandboxDirectorService);

  /** 'verify' = activation mail with CTA; 'code' = step-up code mail. */
  readonly variant = input.required<'verify' | 'code'>();

  readonly stepUpCode = signal('');

  ngOnInit(): void {
    if (this.variant() !== 'code') {
      return;
    }
    // The step-up fixture's code wins when present; until that slice lands,
    // the mailbox mints one itself — a stored code is never overwritten, so
    // the fixture and the mail always agree.
    let code = sessionStorage.getItem(DEMO_STEP_UP_KEY);
    if (!code) {
      code = String(Math.floor(100000 + Math.random() * 900000));
      sessionStorage.setItem(DEMO_STEP_UP_KEY, code);
    }
    this.stepUpCode.set(code);
  }

  clickCta(): void {
    // The link in the mail is what activates the account — before this, the
    // onboarding screen behind this card says the address is still to be
    // verified, because that is what it is.
    if (this.variant() === 'verify') markCompanyMailVerified();
    const step = this.director.step();
    if (step) {
      this.director.notify(step.id);
    }
  }
}
