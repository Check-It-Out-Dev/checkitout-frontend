import { Injectable, NgZone, PLATFORM_ID, effect, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Subscription, catchError, of, switchMap, timer } from 'rxjs';
import { NotificationsService as GeneratedNotificationsService } from '../../api/api/notifications.api';
import type { NotificationDtoOut } from '../../api/model/notification-dto-out';
import { SessionStateService } from '../auth/session-state.service';

/**
 * Signal-backed notification center (legacy `NotificationsService` parity).
 *
 * Semantics ported 1:1 from the legacy service:
 *  - Polls `/notifications/unread/count` every 30s while a session exists
 *    (`timer(0, 30_000)` — first tick immediate). Polling starts/stops
 *    reactively off `SessionStateService.isAuthenticated()`; a poll error
 *    is swallowed (next tick retries) so a transient 5xx never breaks the
 *    shell.
 *  - The panel list is fetched lazily (first `loadFirstPage()` on panel
 *    open, `loadMore()` appends the next page) — the bell itself only
 *    needs the count.
 *  - `markAsRead` / `markAllAsRead` / `archive` update BOTH the list and
 *    the unread count optimistically-after-response, exactly like legacy
 *    (decrement on read, zero on read-all, conditional decrement on
 *    archive of an unread row).
 */
@Injectable({ providedIn: 'root' })
export class NotificationCenterService {
  private readonly api = inject(GeneratedNotificationsService);
  private readonly session = inject(SessionStateService);
  private readonly zone = inject(NgZone);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  /** Legacy parity: 30-second unread-count poll. */
  private static readonly POLL_MS = 30_000;
  private static readonly PAGE_SIZE = 8;

  private pollSub?: Subscription;
  private page = 0;

  private readonly _unreadCount = signal<number>(0);
  private readonly _items = signal<NotificationDtoOut[]>([]);
  private readonly _loading = signal<boolean>(false);
  private readonly _hasMore = signal<boolean>(false);
  private readonly _loadError = signal<boolean>(false);

  readonly unreadCount = this._unreadCount.asReadonly();
  readonly items = this._items.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly hasMore = this._hasMore.asReadonly();
  readonly loadError = this._loadError.asReadonly();

  constructor() {
    // Signal writes inside effects are always allowed since Angular 19;
    // the old allowSignalWrites flag is a deprecated no-op that logs a
    // console warning on every authed route (tripped route-smoke).
    effect(() => {
      if (this.session.isAuthenticated()) {
        this.startPolling();
      } else {
        this.stopPollingAndReset();
      }
    });
  }

  /** Idempotent — a second call while polling is a no-op (legacy parity). */
  startPolling(): void {
    // SSR safety: the recurring `timer(0, 30_000)` is a periodic macrotask
    // that never lets Angular's zone reach stability, so on the server
    // `renderApplication()` would hang forever. The demo build's interceptor
    // authenticates server-side (no cookies needed), which flips
    // `isAuthenticated()` true during SSR and would otherwise start this poll
    // — the exact reason authed-route SSR hung. Poll only in the browser.
    if (!this.isBrowser || this.pollSub) return;
    // Hydration safety (NG0506): in the BROWSER the same recurring macrotask
    // holds ApplicationRef.isStable() false forever; hydration waits for
    // stability before attaching listeners / replaying events, so the SSR'd
    // authed shell stayed inert for 10s+ (dead user menu — diagnosed
    // 2026-09-02). Run the poll OUTSIDE the zone and re-enter only to write
    // the signal, so stability is reached right after first render.
    this.zone.runOutsideAngular(() => {
      this.pollSub = timer(0, NotificationCenterService.POLL_MS)
        .pipe(
          switchMap(() =>
            this.api.getUnreadCount().pipe(
              // Swallow poll errors — the next tick retries. Emitting null
              // (vs erroring) keeps the outer timer alive.
              catchError(() => of(null)),
            ),
          ),
        )
        .subscribe((dto) => {
          if (dto) this.zone.run(() => this._unreadCount.set(dto.count ?? 0));
        });
    });
  }

  stopPollingAndReset(): void {
    this.pollSub?.unsubscribe();
    this.pollSub = undefined;
    this.page = 0;
    this._unreadCount.set(0);
    this._items.set([]);
    this._hasMore.set(false);
    this._loadError.set(false);
  }

  /** Reload from page 0 — called when the panel opens. */
  loadFirstPage(): void {
    this.page = 0;
    this._items.set([]);
    this.fetchPage();
  }

  loadMore(): void {
    if (this._loading() || !this._hasMore()) return;
    this.page += 1;
    this.fetchPage();
  }

  private fetchPage(): void {
    this._loading.set(true);
    this._loadError.set(false);
    this.api
      .getNotifications({ page: this.page, size: NotificationCenterService.PAGE_SIZE })
      .subscribe({
        next: (result) => {
          this._items.update((all) => [...all, ...(result.content ?? [])]);
          this._hasMore.set(result.last === false);
          this._loading.set(false);
        },
        error: () => {
          this._loading.set(false);
          this._loadError.set(true);
        },
      });
  }

  markAsRead(notification: NotificationDtoOut): void {
    const id = notification.id;
    if (id == null || notification.isRead) return;
    this.api.markAsRead({ id }).subscribe({
      next: (updated) => {
        this._items.update((all) => all.map((n) => (n.id === id ? { ...n, ...updated } : n)));
        this._unreadCount.update((c) => Math.max(0, c - 1));
      },
      error: () => undefined, // row stays unread; user can retry by clicking again
    });
  }

  markAllAsRead(): void {
    this.api.markAllAsRead().subscribe({
      next: () => {
        this._items.update((all) => all.map((n) => ({ ...n, isRead: true })));
        this._unreadCount.set(0);
      },
      error: () => undefined,
    });
  }

  archive(notification: NotificationDtoOut): void {
    const id = notification.id;
    if (id == null) return;
    this.api.archiveNotification({ id }).subscribe({
      next: () => {
        this._items.update((all) => all.filter((n) => n.id !== id));
        if (!notification.isRead) this._unreadCount.update((c) => Math.max(0, c - 1));
      },
      error: () => undefined,
    });
  }
}
