import { Component, ChangeDetectionStrategy } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoPipe } from '@ngneat/transloco';
import { SurveyCardComponent } from '../ui/survey-card.component';
import { CodePanelComponent } from '../ui/code-panel.component';

/**
 * Mail + notifications showcase. Verified against be2 recon (EmailService,
 * NotificationEmailService, EmailCronJob, NotificationEventListener):
 *   • Seven transactional flows via @Async EmailService (verification,
 *     step-up code, password reset, ticket created, admin response,
 *     deauthorization notice, admin new-registration), each through Thymeleaf
 *     templates with GDPR-masked recipient logging; dev mode logs
 *     "Would have sent" instead of sending.
 *   • Ten subscription NotificationTypes render the HTML
 *     subscription-notification template with MessageSource-localized
 *     subjects (EN+PL) and priority header colors.
 *   • Delivery pipeline: domain event → @TransactionalEventListener
 *     (AFTER_COMMIT — a rollback never sends mail) → email queue →
 *     EmailCronJob every 15 min under ShedLock (lockAtMostFor 14m), batch
 *     100, each email in its OWN transaction.
 *   • E2E: GreenMail in-memory SMTP :3025; RunNotificationIT asserts real
 *     message content. SMTP: STARTTLS required, password from Secret Manager.
 * Honesty: provider is plain Gmail SMTP today (fine at this scale, swappable
 * by config); "magic links" are Firebase oobCode action links brokered
 * server-side; non-subscription notifications are deliberately plain text.
 *
 * Ported from the legacy demo build (feature/demo) into the greenfield
 * editorial system: shared <app-survey-card> + <app-code-panel>; cream/beige
 * pipeline cells with the coral structural accent; semantic emerald facts.
 */
@Component({
  selector: 'app-mail-notifications-showcase',
  imports: [MatIconModule, TranslocoPipe, SurveyCardComponent, CodePanelComponent],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <app-survey-card
      tag="MAIL"
      [title]="'landing.survey.mail.title' | transloco"
      [subtitle]="'landing.survey.mail.subtitle' | transloco"
    >
      <!-- the delivery pipeline -->
      <p class="mt-6 font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-slate2">
        {{ 'landing.survey.mail.pipeLabel' | transloco }}
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
              {{ 'landing.survey.mail.pipe.' + s.k + '.t' | transloco }}
            </div>
            <div class="font-mono text-[10px] leading-tight text-slate2">
              {{ 'landing.survey.mail.pipe.' + s.k + '.d' | transloco }}
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

      <!-- the transactional flows -->
      <p class="mt-6 font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-slate2">
        {{ 'landing.survey.mail.flowsLabel' | transloco }}
      </p>
      <div class="mt-2 flex flex-wrap gap-2">
        @for (f of flows; track f) {
          <span
            class="inline-flex items-center gap-1.5 rounded-full bg-cream px-3 py-1 text-xs font-medium text-ink ring-1 ring-beige"
          >
            <mat-icon class="!h-3.5 !w-3.5 !text-sm text-coral-600">mail</mat-icon>
            {{ 'landing.survey.mail.flows.' + f | transloco }}
          </span>
        }
      </div>
      <p class="mt-1.5 text-[11px] text-slate2">{{ 'landing.survey.mail.subTypes' | transloco }}</p>

      <!-- facts -->
      <div class="mt-5 grid gap-x-8 gap-y-2 sm:grid-cols-2">
        @for (f of facts; track f) {
          <div class="flex items-start gap-2 text-xs text-slate2">
            <mat-icon class="mt-0.5 !h-4 !w-4 shrink-0 !text-base text-emerald-500">
              check_circle
            </mat-icon>
            <span class="leading-relaxed">{{ 'landing.survey.mail.facts.' + f | transloco }}</span>
          </div>
        }
      </div>

      <!-- real outbox machinery -->
      <div class="mt-5">
        <app-code-panel file="EmailCronJob.java · NotificationEventListener.java">
          {{ snippet }}
        </app-code-panel>
      </div>
      <p class="mt-2 text-[11px] text-slate2">
        {{ 'landing.survey.mail.snippetCaption' | transloco }}
      </p>
      <p class="mt-1 text-[11px] text-slate2">{{ 'landing.survey.mail.caveat' | transloco }}</p>
    </app-survey-card>
  `,
})
export class MailNotificationsShowcaseComponent {
  readonly pipeline = [
    { k: 'event', icon: 'bolt' },
    { k: 'commit', icon: 'commit' },
    { k: 'queue', icon: 'inbox' },
    { k: 'cron', icon: 'schedule' },
  ];

  readonly flows = ['verify', 'stepup', 'reset', 'ticket', 'adminresp', 'deauth', 'adminreg'];

  readonly facts = ['tpl', 'gdpr', 'greenmail', 'smtp'];

  readonly snippet = `// NotificationEventListener — mail is a side-effect of a COMMITTED fact
@TransactionalEventListener(phase = AFTER_COMMIT)
public void onOpportunityStatusChange(...) { queueEmail(...); }

// EmailCronJob — the outbox drains itself
@Scheduled(cron = "\${notification.email.cron:0 0/15 * * * *}")
@SchedulerLock(name = "notifications:emailQueueProcessor",
               lockAtMostFor = "14m")           // one node sends, ever
// batch 100 · each email in its OWN transaction — one failure never
// rolls back the rest · E2E: GreenMail :3025 asserts real content`;
}
