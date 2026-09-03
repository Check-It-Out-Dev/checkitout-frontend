import { PLATFORM_ID, signal } from '@angular/core';
import { TestBed, discardPeriodicTasks, fakeAsync, tick } from '@angular/core/testing';
import { Observable, of, throwError } from 'rxjs';
import { NotificationsService as GeneratedNotificationsService } from '../../api/api/notifications.api';
import type { NotificationDtoOut } from '../../api/model/notification-dto-out';
import { SessionStateService } from '../auth/session-state.service';
import { NotificationCenterService } from './notification-center.service';

const N = (id: number, isRead: boolean): NotificationDtoOut =>
  ({ id, isRead, title: `n${id}` }) as NotificationDtoOut;

class FakeApi {
  unread = 3;
  unreadCalls = 0;
  pages: NotificationDtoOut[][] = [[N(1, false), N(2, true)], [N(3, false)]];
  failList = false;

  getUnreadCount(): Observable<{ count: number }> {
    this.unreadCalls += 1;
    return of({ count: this.unread });
  }
  getNotifications(params: { page?: number }): Observable<unknown> {
    if (this.failList) return throwError(() => ({ status: 500 }));
    const page = params.page ?? 0;
    return of({ content: this.pages[page] ?? [], last: page >= this.pages.length - 1 });
  }
  markAsRead(params: { id: number }): Observable<NotificationDtoOut> {
    return of(N(params.id, true));
  }
  markAllAsRead(): Observable<unknown> {
    return of({ updated: 3 });
  }
  archiveNotification(): Observable<unknown> {
    return of({});
  }
}

describe('NotificationCenterService', () => {
  let api: FakeApi;
  let authed: ReturnType<typeof signal<boolean>>;

  function create(platform: 'browser' | 'server' = 'browser'): NotificationCenterService {
    api = new FakeApi();
    authed = signal(false);
    TestBed.configureTestingModule({
      providers: [
        NotificationCenterService,
        { provide: GeneratedNotificationsService, useValue: api },
        { provide: SessionStateService, useValue: { isAuthenticated: () => authed() } },
        { provide: PLATFORM_ID, useValue: platform },
      ],
    });
    return TestBed.inject(NotificationCenterService);
  }

  afterEach(() => TestBed.resetTestingModule());

  it('polls unread count every 30s while authenticated and resets on logout', fakeAsync(() => {
    const svc = create();
    authed.set(true);
    TestBed.flushEffects();
    tick(0);
    expect(svc.unreadCount()).toBe(3);
    expect(api.unreadCalls).toBe(1);

    api.unread = 5;
    tick(30_000);
    expect(svc.unreadCount()).toBe(5);
    expect(api.unreadCalls).toBe(2);

    authed.set(false);
    TestBed.flushEffects();
    expect(svc.unreadCount()).toBe(0);
    tick(90_000); // no further polls after logout
    expect(api.unreadCalls).toBe(2);
    discardPeriodicTasks();
  }));

  it('does NOT poll during SSR (server platform) so the zone can go stable', fakeAsync(() => {
    // Regression: the demo build is SSR-enabled and its interceptor
    // authenticates server-side (no cookies needed), so `isAuthenticated()`
    // is true during SSR of any authGuard route. If the 30s poll's periodic
    // `timer` starts on the server, the zone never stabilizes and
    // `renderApplication()` hangs (curl'd HTTP 000 @15s, 0 bytes, on
    // /collaborations/create + /support/admin/tickets before this fix).
    const svc = create('server');
    authed.set(true);
    TestBed.flushEffects();
    tick(0);
    expect(api.unreadCalls).toBe(0);
    expect(svc.unreadCount()).toBe(0);
    tick(90_000);
    expect(api.unreadCalls).toBe(0); // still nothing — no periodic task scheduled
  }));

  it('pages the list: loadFirstPage then loadMore appends until last', fakeAsync(() => {
    const svc = create();
    // Flush the constructor effect FIRST — otherwise the initial
    // not-authenticated reset fires on the next tick() and wipes the
    // freshly-loaded page (test-ordering artifact, not a prod path).
    TestBed.flushEffects();
    svc.loadFirstPage();
    tick();
    expect(svc.items().map((n) => n.id)).toEqual([1, 2]);
    expect(svc.hasMore()).toBe(true);

    svc.loadMore();
    tick();
    expect(svc.items().map((n) => n.id)).toEqual([1, 2, 3]);
    expect(svc.hasMore()).toBe(false);

    svc.loadMore(); // no-op past the last page
    tick();
    expect(svc.items()).toHaveLength(3);
  }));

  it('markAsRead updates the row and decrements the badge (skips already-read)', fakeAsync(() => {
    const svc = create();
    authed.set(true);
    TestBed.flushEffects();
    tick(0);
    svc.loadFirstPage();
    tick();

    svc.markAsRead(svc.items()[0]!);
    tick();
    expect(svc.items()[0]?.isRead).toBe(true);
    expect(svc.unreadCount()).toBe(2);

    svc.markAsRead(svc.items()[1]!); // already read — must not decrement
    tick();
    expect(svc.unreadCount()).toBe(2);
    discardPeriodicTasks();
  }));

  it('markAllAsRead zeroes the badge and flips every row', fakeAsync(() => {
    const svc = create();
    authed.set(true);
    TestBed.flushEffects();
    tick(0);
    svc.loadFirstPage();
    tick();
    svc.markAllAsRead();
    tick();
    expect(svc.unreadCount()).toBe(0);
    expect(svc.items().every((n) => n.isRead)).toBe(true);
    discardPeriodicTasks();
  }));

  it('archive removes the row and decrements only when it was unread', fakeAsync(() => {
    const svc = create();
    authed.set(true);
    TestBed.flushEffects();
    tick(0);
    svc.loadFirstPage();
    tick();

    svc.archive(svc.items()[1]!); // read row → count untouched
    tick();
    expect(svc.items().map((n) => n.id)).toEqual([1]);
    expect(svc.unreadCount()).toBe(3);

    svc.archive(svc.items()[0]!); // unread row → decrement
    tick();
    expect(svc.items()).toHaveLength(0);
    expect(svc.unreadCount()).toBe(2);
    discardPeriodicTasks();
  }));

  it('surfaces list load errors without breaking the badge', fakeAsync(() => {
    const svc = create();
    TestBed.flushEffects(); // see paging test — flush the initial reset first
    api.failList = true;
    svc.loadFirstPage();
    tick();
    expect(svc.loadError()).toBe(true);
    expect(svc.loading()).toBe(false);
  }));
});
