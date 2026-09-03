import { Component, ChangeDetectionStrategy } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { SURVEY_RUN_BTN, SURVEY_REPLAY_BTN } from '../ui/survey-run-button';
import { TranslocoPipe } from '@ngneat/transloco';
import { SurveyCardComponent } from '../ui/survey-card.component';
import { CodePanelComponent } from '../ui/code-panel.component';

/**
 * Consent / RODO showcase: court-defensible proof that a *human* accepted a
 * specific document version. Built on the real subsystem (verified): trusted-event
 * click capture (Event.isTrusted), HMAC-SHA256 cookie signing, versioned docs + a
 * 38-day re-consent grace, soft-block enforcement, structured GDPR audit with PII
 * masking. Honesty register: this HMAC is consent-cookie / Meta-callback / session
 * fingerprint signing — distinct from step-up auth (SHA-256(code)+UUID via Redis).
 *
 * Ported from the legacy demo build (feature/demo) into the greenfield editorial
 * system: shared <app-survey-card> + <app-code-panel>; the legacy indigo/primary
 * seal-flow accent becomes coral; feather svgIcons become Material ligatures;
 * the legacy ButtonComponent becomes the native coral pill CTA. Semantic emerald/rose
 * stay only on the human-vs-robot proof and the final "sealed" state.
 */
@Component({
  selector: 'app-consent-proof-showcase',
  imports: [MatIconModule, TranslocoPipe, SurveyCardComponent, CodePanelComponent],
  template: `
    <app-survey-card
      tag="SECURITY"
      [title]="'landing.survey.consent.title' | transloco"
      [subtitle]="'landing.survey.consent.subtitle' | transloco"
    >
      <!-- Human vs Robot proof cards (semantic) -->
      <div class="mt-6 grid gap-4 sm:grid-cols-2">
        <div class="rounded-xl bg-emerald-50 p-4 ring-1 ring-emerald-200">
          <div class="flex items-center gap-2">
            <span
              class="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700"
            >
              <mat-icon class="!h-4 !w-4 !text-base">verified_user</mat-icon>
            </span>
            <span
              class="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-700"
            >
              {{ 'landing.survey.consent.human.label' | transloco }}
            </span>
          </div>
          <pre
            class="m-0 mt-2 overflow-x-auto rounded-lg bg-white p-3 font-mono text-[11px] leading-relaxed text-slate2 ring-1 ring-emerald-100"
          ><code>{{ humanProof }}</code></pre>
          <p
            class="mt-1.5 inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700"
          >
            <mat-icon class="!h-3.5 !w-3.5 !text-sm">check</mat-icon>
            {{ 'landing.survey.consent.human.verdict' | transloco }}
          </p>
        </div>
        <div class="rounded-xl bg-rose-50 p-4 ring-1 ring-rose-200">
          <div class="flex items-center gap-2">
            <span
              class="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-rose-100 text-rose-600"
            >
              <mat-icon class="!h-4 !w-4 !text-base">terminal</mat-icon>
            </span>
            <span
              class="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-rose-600"
            >
              {{ 'landing.survey.consent.robot.label' | transloco }}
            </span>
          </div>
          <pre
            class="m-0 mt-2 overflow-x-auto rounded-lg bg-white p-3 font-mono text-[11px] leading-relaxed text-slate2 ring-1 ring-rose-100"
          ><code>{{ robotProof }}</code></pre>
          <p class="mt-1.5 inline-flex items-center gap-1 text-[11px] font-semibold text-rose-600">
            <mat-icon class="!h-3.5 !w-3.5 !text-sm">close</mat-icon>
            {{ 'landing.survey.consent.robot.verdict' | transloco }}
          </p>
        </div>
      </div>

      <!-- capture -> HMAC -> sealed (interactive) -->
      <div class="mt-6 flex items-center justify-between gap-3">
        <p class="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-slate2">
          {{ 'landing.survey.consent.sealLabel' | transloco }}
        </p>
        <button type="button" [class]="done ? replayBtn : runBtn" (click)="advance()">
          <mat-icon class="!h-4 !w-4 !text-base">{{ done ? 'refresh' : 'shield' }}</mat-icon>
          {{
            (done ? 'landing.survey.consent.seal.replay' : 'landing.survey.consent.seal.cta')
              | transloco
          }}
        </button>
      </div>
      <div class="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
        <span
          class="rounded-md px-2.5 py-1 font-mono ring-1 transition-all duration-300"
          [class]="
            isLit(0)
              ? 'bg-coral-50 ring-coral-100 text-coral-600'
              : 'bg-cream ring-beige text-slate2'
          "
        >
          ConsentProof
        </span>
        <mat-icon
          class="!h-4 !w-4 !text-base transition-colors"
          [class]="isLit(1) ? 'text-coral-500' : 'text-beige'"
        >
          arrow_forward
        </mat-icon>
        <span
          class="rounded-md px-2.5 py-1 font-mono ring-1 transition-all duration-300"
          [class.consent-current]="isCurrent(1)"
          [class]="
            isLit(1)
              ? 'bg-coral-50 ring-coral-100 text-coral-600'
              : 'bg-cream ring-beige text-slate2'
          "
        >
          HMAC&#8209;SHA256
        </span>
        <mat-icon
          class="!h-4 !w-4 !text-base transition-colors"
          [class]="isLit(2) ? 'text-coral-500' : 'text-beige'"
        >
          arrow_forward
        </mat-icon>
        <span
          class="rounded-md px-2.5 py-1 font-mono ring-1 transition-all duration-300"
          [class]="
            isLit(2)
              ? 'bg-emerald-50 ring-emerald-300 text-emerald-700'
              : 'bg-cream ring-beige text-slate2'
          "
        >
          {{ 'landing.survey.consent.sealed' | transloco }}
        </span>
      </div>

      <!-- fact chips -->
      <div class="mt-5 grid gap-x-8 gap-y-2 sm:grid-cols-2">
        @for (f of facts; track f) {
          <div class="flex items-start gap-2 text-xs text-slate2">
            <span class="mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-coral-500"></span>
            <span class="leading-relaxed">
              {{ 'landing.survey.consent.facts.' + f | transloco }}
            </span>
          </div>
        }
      </div>

      <!-- annotated capture + sign — terminal-style panel -->
      <div class="mt-5">
        <app-code-panel file="legal-clickwrap + HmacUtils">{{ snippet }}</app-code-panel>
      </div>
      <p class="mt-2 text-[11px] text-slate2">
        {{ 'landing.survey.consent.codeCaption' | transloco }}
      </p>
    </app-survey-card>
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: [
    `
      /* Coral pulse on the currently-signing seal step (legacy used indigo). */
      .consent-current {
        box-shadow: 0 0 0 3px rgba(255, 90, 54, 0.22);
      }
    `,
  ],
})
export class ConsentProofShowcaseComponent {
  readonly runBtn = SURVEY_RUN_BTN;
  readonly replayBtn = SURVEY_REPLAY_BTN;

  // Interactive seal walkthrough: click steps ConsentProof -> HMAC -> Sealed.
  // Synchronous state (no timers/rAF) — reliable + verifiable. 3 nodes.
  step = 0;
  get done(): boolean {
    return this.step >= 3;
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

  // The real ConsentProof shape (subscription-api.types ConsentProof): a genuine
  // human click stamps isTrusted=true + screen coords + the document content hash.
  readonly humanProof = `{
  "isTrusted": true,        // real user input
  "screenX": 842, "screenY": 511,
  "documentHash": "sha256:9f2c…",
  "checkboxId": "tos-v4",
  "timestamp": "2026-06-07T14:20:18Z"
}`;

  // A JavaScript-synthesised element.click() can never set isTrusted=true.
  readonly robotProof = `{
  "isTrusted": false,       // element.click()
  "screenX": 0, "screenY": 0,
  "documentHash": "sha256:9f2c…",
  "checkboxId": "tos-v4",
  "timestamp": "2026-06-07T14:20:18Z"
}`;

  readonly facts = ['grace', 'header', 'softblock', 'audit'];

  readonly snippet = `// FE — capture proof on a genuine mousedown (legal-clickwrap.component)
captureClickProof(e: MouseEvent) {
  return { isTrusted: e.isTrusted,        // false for element.click()
           screenX: e.screenX, screenY: e.screenY,
           documentHash: this.doc.contentHash };
}

// BE — seal it: value + _sig = Base64(HMAC-SHA256(json, consent.hmac-secret))
// reads verify with MessageDigest.isEqual (constant-time); a flipped byte ->
// "SECURITY: Invalid HMAC signature", treated as absent.`;
}
