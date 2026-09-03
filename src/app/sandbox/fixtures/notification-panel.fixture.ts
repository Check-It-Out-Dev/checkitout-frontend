import { signal } from '@angular/core';
import type { NotificationDtoOut } from '../../api/model/notification-dto-out';
import { NotificationCenterService } from '../../core/notifications/notification-center.service';
import { NotificationBellComponent } from '../../layout/notification-bell/notification-bell.component';
import { NotificationPanelComponent } from '../../layout/notification-bell/notification-panel.component';
import type { SandboxFixture } from '../sandbox-registry';

/**
 * Notification center fixtures. The panel renders standalone here (in the
 * shell it lives inside the bell's mat-menu) so its states are
 * baseline-able without opening an overlay; the bell fixture covers the
 * badge treatment.
 */

const ITEMS: NotificationDtoOut[] = [
  {
    id: 1,
    title: 'Nowe zgłoszenie do kampanii',
    message: 'Anna Kowalska zgłosiła się do „Spring sneaker drop".',
    category: 'PARTNERSHIP' as never,
    isRead: false,
    createdAt: '2026-09-02T09:15:00Z',
    actionUrl: '/collaborations/1/applicants',
  },
  {
    id: 2,
    title: 'Treść czeka na akceptację',
    message: 'Nowa treść w kampanii „Coffee shop opening".',
    category: 'PARTNERSHIP' as never,
    isRead: false,
    createdAt: '2026-09-02T16:40:00Z',
    actionUrl: '/collaborations/applications/102/review',
  },
  {
    id: 3,
    title: 'Zmiana statusu konta',
    message: 'Twoje konto zostało aktywowane.',
    category: 'ACCOUNT' as never,
    isRead: true,
    createdAt: '2026-09-01T11:00:00Z',
  },
  {
    id: 4,
    title: 'Aktualizacja regulaminu',
    message: 'Opublikowaliśmy nową wersję regulaminu.',
    category: 'SYSTEM' as never,
    isRead: true,
    createdAt: '2026-09-01T08:00:00Z',
  },
];

/** Signal-surface stub matching NotificationCenterService's public API. */
class StubCenterBase {
  readonly unreadCount = signal(2);
  readonly items = signal<NotificationDtoOut[]>(ITEMS);
  readonly loading = signal(false);
  readonly hasMore = signal(true);
  readonly loadError = signal(false);
  loadFirstPage(): void {
    /* fixture state is pre-seeded */
  }
  loadMore(): void {
    /* no-op */
  }
  markAsRead(): void {
    /* no-op */
  }
  markAllAsRead(): void {
    /* no-op */
  }
  archive(): void {
    /* no-op */
  }
  startPolling(): void {
    /* no-op */
  }
  stopPollingAndReset(): void {
    /* no-op */
  }
}

class StubCenterEmpty extends StubCenterBase {
  constructor() {
    super();
    this.unreadCount.set(0);
    this.items.set([]);
    this.hasMore.set(false);
  }
}

class StubCenterError extends StubCenterBase {
  constructor() {
    super();
    this.unreadCount.set(0);
    this.items.set([]);
    this.hasMore.set(false);
    this.loadError.set(true);
  }
}

class StubCenterBadged extends StubCenterBase {
  constructor() {
    super();
    this.unreadCount.set(5);
  }
}

export const NOTIFICATION_PANEL_FIXTURES: readonly SandboxFixture[] = [
  {
    id: 'notification-panel-unread-mix',
    label: 'Notification panel · 2 unread + 2 read, load-more',
    component: NotificationPanelComponent,
    providers: [{ provide: NotificationCenterService, useClass: StubCenterBase }],
  },
  {
    id: 'notification-panel-empty',
    label: 'Notification panel · empty state',
    component: NotificationPanelComponent,
    providers: [{ provide: NotificationCenterService, useClass: StubCenterEmpty }],
  },
  {
    id: 'notification-panel-error',
    label: 'Notification panel · load failed',
    component: NotificationPanelComponent,
    providers: [{ provide: NotificationCenterService, useClass: StubCenterError }],
  },
  {
    id: 'notification-bell-badged',
    label: 'Notification bell · unread badge (5)',
    component: NotificationBellComponent,
    providers: [{ provide: NotificationCenterService, useClass: StubCenterBadged }],
  },
];
