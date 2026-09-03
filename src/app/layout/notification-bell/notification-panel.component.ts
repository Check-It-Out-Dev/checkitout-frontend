import { CommonModule, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, EventEmitter, Output, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Router } from '@angular/router';
import { TranslocoModule } from '@ngneat/transloco';
import type { NotificationDtoOut } from '../../api/model/notification-dto-out';
import { NotificationCenterService } from '../../core/notifications/notification-center.service';

/**
 * Presentational notification list (legacy overlay-panel parity). Lives
 * inside the bell's mat-menu in the shell, and renders standalone in the
 * sandbox so the panel states are baseline-able without opening an
 * overlay.
 *
 * Interaction parity with legacy:
 *  - row click → markAsRead + navigate to `actionUrl` (panel closes via
 *    the emitted event; navigation only when actionUrl present)
 *  - per-row toggle-read + archive icon buttons (stopPropagation — the
 *    panel stays open)
 *  - header mark-all-read; footer load-more while `hasMore`
 */
@Component({
    selector: 'app-notification-panel',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [
        CommonModule,
        DatePipe,
        MatButtonModule,
        MatIconModule,
        MatProgressSpinnerModule,
        TranslocoModule,
    ],
    templateUrl: './notification-panel.component.html'
})
export class NotificationPanelComponent {
  readonly center = inject(NotificationCenterService);
  private readonly router = inject(Router);

  /** Emitted when a row navigation happened — the host menu should close. */
  @Output() readonly navigated = new EventEmitter<void>();

  open(notification: NotificationDtoOut, event: Event): void {
    event.stopPropagation();
    this.center.markAsRead(notification);
    if (notification.actionUrl) {
      void this.router.navigateByUrl(notification.actionUrl);
      this.navigated.emit();
    }
  }

  markRead(notification: NotificationDtoOut, event: Event): void {
    event.stopPropagation();
    this.center.markAsRead(notification);
  }

  archive(notification: NotificationDtoOut, event: Event): void {
    event.stopPropagation();
    this.center.archive(notification);
  }

  markAll(event: Event): void {
    event.stopPropagation();
    this.center.markAllAsRead();
  }

  loadMore(event: Event): void {
    event.stopPropagation();
    this.center.loadMore();
  }

  categoryChipClass(category?: string): string {
    switch (category) {
      case 'PARTNERSHIP':
        return 'bg-coral-50 text-coral-700';
      case 'ACCOUNT':
        return 'bg-amber-100 text-amber-800';
      case 'SUPPORT':
        return 'bg-sky-100 text-sky-800';
      default:
        return 'bg-slate-100 text-slate2';
    }
  }
}
