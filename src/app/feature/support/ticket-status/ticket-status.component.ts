import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  ViewChild,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  FormGroupDirective,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoModule } from '@ngneat/transloco';
import { finalize, switchMap } from 'rxjs';
import { TicketCategory } from '../../../api/model/ticket-category';
import { TicketStatus } from '../../../api/model/ticket-status';
import type { SupportTicketDtoOut } from '../../../api/model/support-ticket-dto-out';
import {
  SupportTicketApiService,
  TICKET_CATEGORY_LABEL_KEYS,
  TICKET_STATUS_CHIP_CLASSES,
  TICKET_STATUS_LABEL_KEYS,
} from '../../../core/support/support-ticket.service';
import { MarketingToolbarComponent } from '../../landing/marketing-toolbar/marketing-toolbar.component';

/**
 * `/support/tickets/status` — public ticket lookup + conversation, ported
 * from legacy (iter-59, audit P0 #8). The reference + contact-email pair is
 * the anonymous authorization token: it looks the ticket up, and the same
 * pair authorizes customer replies. A successful lookup is mirrored into
 * the query params (`?ref&email`) so the view is shareable — which is also
 * how the create-page success panel deep-links here.
 *
 * Reply attachments are deferred to the upload slice alongside the
 * create-form ones; the reply itself (content) is fully wired.
 */
@Component({
  selector: 'app-ticket-status',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    TranslocoModule,
    RouterLink,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MarketingToolbarComponent,
  ],
  templateUrl: './ticket-status.component.html',
})
export class TicketStatusComponent implements OnInit {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly api = inject(SupportTicketApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly ticket = signal<SupportTicketDtoOut | null>(null);
  readonly loading = signal(false);
  readonly submitting = signal(false);
  readonly errorKey = signal<string | null>(null);

  readonly ticketClosed = computed(() => {
    const status = this.ticket()?.status;
    return status === TicketStatus.CLOSED || status === TicketStatus.RESOLVED;
  });

  readonly lookupForm = this.fb.group({
    reference: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]],
  });

  readonly responseForm = this.fb.group({
    content: ['', [Validators.required, Validators.maxLength(5000)]],
  });

  /**
   * Needed to clear the form's `submitted` flag after a successful reply —
   * `FormGroup.reset()` alone leaves `FormGroupDirective.submitted` true,
   * so Material immediately re-renders the emptied required field in its
   * red error state (e2e-2026-09-02 finding).
   */
  @ViewChild('responseFormDir') private responseFormDir?: FormGroupDirective;

  ngOnInit(): void {
    const params = this.route.snapshot.queryParams;
    const token = params['token'] as string | undefined;
    const reference = params['ref'] as string | undefined;
    const email = params['email'] as string | undefined;
    // Magic link from the support emails: ?ref=<ref>&token=<signed>. The
    // token alone authorizes a one-click open; ref is only used to prefill
    // the manual form if the token turns out expired/invalid.
    if (token) {
      this.loadByToken(token, reference);
      return;
    }
    if (reference && email) {
      this.lookupForm.patchValue({ reference, email });
      this.lookupTicket();
    }
  }

  /**
   * One-click open from an emailed magic link. The signed token is the
   * authorization; on failure (expired after 14 days, tampered) we fall back
   * to the manual reference+email form, prefilling the reference if the link
   * carried it, so the user is never stranded.
   */
  private loadByToken(token: string, reference?: string): void {
    this.loading.set(true);
    this.errorKey.set(null);

    this.api
      .getTicketByAccessToken(token)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.loading.set(false)),
      )
      .subscribe({
        next: (ticket) => this.ticket.set(ticket),
        error: () => {
          if (reference) {
            this.lookupForm.patchValue({ reference });
          }
          this.errorKey.set('support.tickets.status.errors.link_expired');
        },
      });
  }

  lookupTicket(): void {
    if (this.lookupForm.invalid) {
      this.lookupForm.markAllAsTouched();
      return;
    }

    this.loading.set(true);
    this.errorKey.set(null);

    const { reference, email } = this.lookupForm.getRawValue();
    this.api
      .getTicketByReference(reference, email)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.loading.set(false)),
      )
      .subscribe({
        next: (ticket) => {
          this.ticket.set(ticket);
          // Mirror the pair into the URL so the view is shareable.
          void this.router.navigate([], {
            relativeTo: this.route,
            queryParams: { ref: reference, email },
            queryParamsHandling: 'merge',
          });
        },
        error: () => this.errorKey.set('support.tickets.status.errors.ticket_not_found'),
      });
  }

  submitResponse(): void {
    const ticket = this.ticket();
    if (this.responseForm.invalid || !ticket?.ticketReference || !ticket.contactEmail) {
      this.responseForm.markAllAsTouched();
      return;
    }

    this.submitting.set(true);
    this.errorKey.set(null);

    const reference = ticket.ticketReference;
    const email = ticket.contactEmail;
    this.api
      .addCustomerResponse(reference, email, { content: this.responseForm.getRawValue().content })
      .pipe(
        // Refresh the whole thread after a successful reply — the BE owns
        // response ordering and any status transition the reply caused.
        switchMap(() => this.api.getTicketByReference(reference, email)),
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.submitting.set(false)),
      )
      .subscribe({
        next: (refreshed) => {
          this.ticket.set(refreshed);
          // resetForm (not reset) also clears the directive's `submitted`
          // flag so the emptied field doesn't render in error state.
          this.responseFormDir?.resetForm({ content: '' });
          this.responseForm.reset({ content: '' });
        },
        error: () => this.errorKey.set('support.tickets.submit_response_error'),
      });
  }

  backToLookup(): void {
    this.ticket.set(null);
    this.errorKey.set(null);
    void this.router.navigate([], { relativeTo: this.route, queryParams: {}, replaceUrl: true });
  }

  statusLabelKey(status: TicketStatus | undefined): string {
    return status ? TICKET_STATUS_LABEL_KEYS[status] : TICKET_STATUS_LABEL_KEYS[TicketStatus.OPEN];
  }

  statusChipClass(status: TicketStatus | undefined): string {
    return status
      ? TICKET_STATUS_CHIP_CLASSES[status]
      : TICKET_STATUS_CHIP_CLASSES[TicketStatus.OPEN];
  }

  categoryLabelKey(category: TicketCategory | undefined): string {
    return category
      ? TICKET_CATEGORY_LABEL_KEYS[category]
      : TICKET_CATEGORY_LABEL_KEYS[TicketCategory.OTHER];
  }

  fileIcon(contentType: string | undefined): string {
    if (!contentType) return 'insert_drive_file';
    if (contentType.startsWith('image/')) return 'image';
    if (contentType === 'application/pdf') return 'picture_as_pdf';
    if (contentType.startsWith('text/')) return 'description';
    return 'insert_drive_file';
  }

  formattedFileSize(size: number | undefined): string {
    if (!size || size <= 0) return '';
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  }
}
