import { CommonModule } from '@angular/common';
import { LocalizedDatePipe } from '../../../core/i18n/localized-date.pipe';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  ViewChild,
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
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslocoModule } from '@ngneat/transloco';
import { finalize, switchMap } from 'rxjs';
import { TicketCategory } from '../../../api/model/ticket-category';
import { TicketStatus } from '../../../api/model/ticket-status';
import type { SupportTicketDtoOut } from '../../../api/model/support-ticket-dto-out';
import { SessionStateService } from '../../../core/auth/session-state.service';
import {
  SupportTicketApiService,
  TICKET_CATEGORY_LABEL_KEYS,
  TICKET_STATUS_CHIP_CLASSES,
  TICKET_STATUS_LABEL_KEYS,
  TICKET_STATUS_OPTIONS,
} from '../../../core/support/support-ticket.service';

/**
 * `/support/admin/tickets/:id` — the admin ticket workspace, ported from
 * legacy (iter-62, audit P0 #8 — the last placeholder). Full detail (meta,
 * description, the admin-only technical error dump, attachments,
 * conversation) plus the admin reply form: content, an optional status
 * transition and a notify-by-email toggle, sent as one addAdminResponse
 * call. After a reply the whole ticket is re-fetched — the BE owns status
 * transitions (including the auto OPEN→IN_PROGRESS on first admin touch).
 *
 * The technical dump rides on getTicketById only for admins — a
 * FE-port-discovered contract fix on the BE greenfield branch; legacy's
 * dump panel could never render because the old DtoOut never carried the
 * field.
 */
@Component({
  selector: 'app-admin-ticket-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    LocalizedDatePipe,
    ReactiveFormsModule,
    TranslocoModule,
    MatButtonModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatIconModule,
    RouterLink,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSelectModule,
  ],
  templateUrl: './admin-ticket-detail.component.html',
})
export class AdminTicketDetailComponent implements OnInit {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly api = inject(SupportTicketApiService);
  private readonly session = inject(SessionStateService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly statusOptions = TICKET_STATUS_OPTIONS;

  readonly ticket = signal<SupportTicketDtoOut | null>(null);
  /** A reply went out on this visit: the page then says what comes next. */
  readonly replied = signal(false);
  readonly loading = signal(false);
  readonly submitting = signal(false);
  readonly errorKey = signal<string | null>(null);

  readonly responseForm = this.fb.group({
    content: ['', [Validators.required, Validators.maxLength(5000)]],
    newStatus: this.fb.control<TicketStatus | null>(null),
    sendEmail: [true],
  });

  /**
   * Clears the directive's `submitted` flag after a successful reply so the
   * emptied required field doesn't re-render red (e2e-2026-09-02 finding —
   * same pattern as the public ticket-status page).
   */
  @ViewChild('responseFormDir') private responseFormDir?: FormGroupDirective;

  ngOnInit(): void {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    if (!id) {
      void this.router.navigate(['/support/admin/tickets']);
      return;
    }
    this.loadTicket(id);
  }

  loadTicket(id: number): void {
    this.loading.set(true);
    this.errorKey.set(null);
    this.api
      .getTicketById(id)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.loading.set(false)),
      )
      .subscribe({
        next: (ticket) => this.ticket.set(ticket),
        error: () => this.errorKey.set('support.admin.ticket_detail.errors.ticket_not_found'),
      });
  }

  submitResponse(): void {
    const ticket = this.ticket();
    if (this.submitting() || this.responseForm.invalid || !ticket?.id) {
      this.responseForm.markAllAsTouched();
      return;
    }

    this.submitting.set(true);
    this.errorKey.set(null);

    const ticketId = ticket.id;
    const { content, newStatus, sendEmail } = this.responseForm.getRawValue();
    const user = this.session.user();
    const adminName =
      [user?.firstName, user?.lastName].filter(Boolean).join(' ') || 'Support Agent';

    this.api
      .addAdminResponse(ticketId, {
        content,
        ...(newStatus ? { newStatus } : {}),
        adminName,
        sendEmail,
      })
      .pipe(
        // Re-fetch the whole ticket — the BE owns transitions (incl. the
        // implicit OPEN→IN_PROGRESS on first admin response).
        switchMap(() => this.api.getTicketById(ticketId)),
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.submitting.set(false)),
      )
      .subscribe({
        next: (refreshed) => {
          this.ticket.set(refreshed);
          this.replied.set(true);
          // resetForm (not reset) also clears the directive's submitted flag.
          this.responseFormDir?.resetForm({ content: '', newStatus: null, sendEmail: true });
          this.responseForm.reset({ content: '', newStatus: null, sendEmail: true });
        },
        error: () => this.errorKey.set('support.tickets.submit_response_error'),
      });
  }

  goBack(): void {
    void this.router.navigate(['/support/admin/tickets']);
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
