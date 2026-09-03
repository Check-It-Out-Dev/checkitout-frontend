import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoModule, TranslocoService } from '@ngneat/transloco';
import { finalize } from 'rxjs';
import { TicketCategory } from '../../../api/model/ticket-category';
import type { SupportTicketDtoIn } from '../../../api/model/support-ticket-dto-in';
import type { SupportTicketDtoOut } from '../../../api/model/support-ticket-dto-out';
import { SessionStateService } from '../../../core/auth/session-state.service';
import {
  SupportTicketApiService,
  TICKET_CATEGORY_OPTIONS,
} from '../../../core/support/support-ticket.service';
import { MarketingToolbarComponent } from '../../landing/marketing-toolbar/marketing-toolbar.component';

/**
 * `/support/tickets/create` — public ticket form, ported from legacy
 * (iter-58a, audit P0 #8). Anonymous users type a contact email; authed
 * users see their address read-only (the BE overrides it server-side
 * anyway). The error interceptor can deep-link here with `errorData` /
 * `subject` / `timestamp` query params — the form pre-fills a translated
 * "application error" report and carries a technical dump (browser info +
 * raw error JSON, admin-only, ≤100k chars) alongside the user description.
 *
 * File attachments are deliberately NOT in this slice — legacy uploads
 * them via the signed-URL flow before the ticket exists; that arrives with
 * the upload wiring (iter-58b). The anonymous-warning card already points
 * at links/e-mail as the interim channel, exactly like legacy.
 */
@Component({
  selector: 'app-create-ticket',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    TranslocoModule,
    RouterLink,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    MarketingToolbarComponent,
  ],
  templateUrl: './create-ticket.component.html',
})
export class CreateTicketComponent implements OnInit {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly api = inject(SupportTicketApiService);
  private readonly session = inject(SessionStateService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly transloco = inject(TranslocoService);
  private readonly destroyRef = inject(DestroyRef);

  readonly categories = TICKET_CATEGORY_OPTIONS;
  readonly supportEmail = 'support@checkitout.app';

  readonly submitting = signal(false);
  readonly created = signal<SupportTicketDtoOut | null>(null);
  readonly errorKey = signal<string | null>(null);
  /** Authed user (null when anonymous) — drives the read-only email row. */
  readonly sessionUser = this.session.user;

  /** Admin-only technical dump carried alongside an error-report autofill. */
  private technicalDescription: string | null = null;

  readonly form = this.fb.group({
    contactEmail: ['', [Validators.required, Validators.email]],
    subject: ['', [Validators.required, Validators.maxLength(255)]],
    description: ['', [Validators.required, Validators.maxLength(5000)]],
    category: this.fb.control<TicketCategory>(TicketCategory.ACCOUNT_ISSUE, Validators.required),
  });

  ngOnInit(): void {
    // Read the session CACHE only — never probe() here. An anonymous 401
    // from /users/me makes the error interceptor bounce non-/auth pages to
    // sign-in, which would lock anonymous users out of this public form.
    // Cost: an authed user deep-linking straight here (cold cache) gets the
    // editable email instead of the read-only row — harmless, the BE
    // overrides contactEmail server-side for authed submitters anyway.
    this.applyUserPrefill();
    this.applyErrorAutofill();
  }

  submitTicket(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.submitting.set(true);
    this.errorKey.set(null);

    const raw = this.form.getRawValue();
    const dto: SupportTicketDtoIn = {
      contactEmail: raw.contactEmail,
      subject: raw.subject,
      description: raw.description,
      category: raw.category,
    };
    if (this.technicalDescription) {
      dto.technicalDescription = this.technicalDescription.slice(0, 100000);
    }

    this.api
      .createTicket(dto)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.submitting.set(false)),
      )
      .subscribe({
        next: (ticket) => this.created.set(ticket),
        error: () => this.errorKey.set('support.tickets.create_error'),
      });
  }

  goToTicketStatus(): void {
    const ticket = this.created();
    if (!ticket?.ticketReference) return;
    void this.router.navigate(['/support/tickets/status'], {
      queryParams: { ref: ticket.ticketReference, email: this.form.getRawValue().contactEmail },
    });
  }

  createNewTicket(): void {
    const email = this.sessionUser()?.email ?? '';
    this.form.reset({
      contactEmail: email,
      subject: '',
      description: '',
      category: TicketCategory.ACCOUNT_ISSUE,
    });
    this.created.set(null);
    this.errorKey.set(null);
    this.technicalDescription = null;
  }

  private applyUserPrefill(): void {
    const email = this.sessionUser()?.email;
    if (email) {
      this.form.patchValue({ contactEmail: email });
    }
  }

  /**
   * Error-interceptor deep link: `?errorData=<json>&subject=...&timestamp=...`
   * pre-fills a TECHNICAL_PROBLEM report. Same behavior as legacy — the
   * subject becomes the translated application-error label (never the raw
   * backend message) and the technical dump stays out of the visible form.
   */
  private applyErrorAutofill(): void {
    const params = this.route.snapshot.queryParams;
    if (!params['errorData']) return;

    try {
      const errorData: unknown = JSON.parse(params['errorData'] as string);

      if (params['subject']) {
        this.form.patchValue({
          subject: this.transloco.translate('support.error.application_error_subject'),
        });
      }
      this.form.patchValue({ category: TicketCategory.TECHNICAL_PROBLEM });

      const { userDescription, technicalDetails } = this.formatErrorData(
        errorData,
        params['timestamp'] as string | undefined,
      );
      this.form.patchValue({ description: userDescription });
      this.technicalDescription = technicalDetails;
    } catch {
      // Malformed deep-link payload — leave the blank form; the user can
      // still describe the problem manually.
    }
  }

  private formatErrorData(
    errorData: unknown,
    timestamp: string | undefined,
  ): { userDescription: string; technicalDetails: string } {
    const t = (key: string): string => this.transloco.translate(`support.error.autofill.${key}`);
    const stamp = timestamp || new Date().toISOString();

    const userLines = [
      `=== ${t('user_description_title')} ===`,
      t('user_description_placeholder'),
      t('user_description_default'),
      '',
      `${t('timestamp')}: ${stamp}`,
    ];

    const technicalLines = [`=== ${t('error_details_title')} ===`, `${t('timestamp')}: ${stamp}`];

    // The deep link may carry the structured shape ({type, message, requestId,
    // error}) or a legacy direct-error object ({error: {...}}).
    let structured: Record<string, unknown> | null = null;
    if (typeof errorData === 'string') {
      try {
        structured = JSON.parse(errorData) as Record<string, unknown>;
      } catch {
        technicalLines.push(errorData);
      }
    } else if (errorData && typeof errorData === 'object') {
      structured = errorData as Record<string, unknown>;
    }

    let backendError: Record<string, unknown> | null = null;
    if (structured && structured['type'] && structured['message']) {
      technicalLines.push(`${t('error_type')}: ${String(structured['type'])}`);
      technicalLines.push(`${t('error_message')}: ${String(structured['message'])}`);
      if (structured['requestId']) {
        technicalLines.push(`${t('trace_id')}: ${String(structured['requestId'])}`);
      }
      if (structured['error'] && typeof structured['error'] === 'object') {
        backendError = structured['error'] as Record<string, unknown>;
        if (backendError['status']) {
          technicalLines.push(`${t('status_code')}: ${String(backendError['status'])}`);
        }
        if (backendError['path']) {
          technicalLines.push(`${t('api_path')}: ${String(backendError['path'])}`);
        }
      }
    } else if (structured && structured['error'] && typeof structured['error'] === 'object') {
      backendError = structured['error'] as Record<string, unknown>;
      if (backendError['status']) {
        technicalLines.push(`${t('status_code')}: ${String(backendError['status'])}`);
      }
      if (backendError['error']) {
        technicalLines.push(`${t('error_type')}: ${String(backendError['error'])}`);
      }
      if (backendError['message']) {
        technicalLines.push(`${t('error_message')}: ${String(backendError['message'])}`);
      }
      if (backendError['path']) {
        technicalLines.push(`${t('api_path')}: ${String(backendError['path'])}`);
      }
      if (backendError['requestId']) {
        technicalLines.push(`${t('trace_id')}: ${String(backendError['requestId'])}`);
      }
    }

    technicalLines.push('', `=== ${t('browser_info_title')} ===`);
    technicalLines.push(`${t('user_agent')}: ${navigator.userAgent}`);
    // eslint-disable-next-line @typescript-eslint/no-deprecated -- legacy dump shape includes it
    technicalLines.push(`${t('platform')}: ${navigator.platform}`);
    technicalLines.push(`${t('language')}: ${navigator.language}`);
    technicalLines.push(`${t('screen_resolution')}: ${screen.width}x${screen.height}`);
    technicalLines.push(`${t('window_size')}: ${window.innerWidth}x${window.innerHeight}`);
    technicalLines.push(`${t('timezone')}: ${Intl.DateTimeFormat().resolvedOptions().timeZone}`);
    technicalLines.push(`${t('online_status')}: ${navigator.onLine ? t('online') : t('offline')}`);

    technicalLines.push('', `=== ${t('technical_details_title')} ===`);
    const context = structured?.['context'] as Record<string, unknown> | undefined;
    const requestUrl =
      (context?.['url'] as string | undefined) ??
      (backendError?.['url'] as string | undefined) ??
      window.location.href;
    technicalLines.push(`${t('request_url')}: ${requestUrl}`);
    technicalLines.push(`${t('full_error_object')}:`);
    technicalLines.push(JSON.stringify(structured ?? errorData, null, 2));

    if (backendError) {
      technicalLines.push('', `${t('backend_response_object')}:`);
      technicalLines.push(JSON.stringify(backendError, null, 2));
    }

    return {
      userDescription: userLines.join('\n'),
      technicalDetails: technicalLines.join('\n'),
    };
  }
}
