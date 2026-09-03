import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { Router, provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@ngneat/transloco';
import type { NotificationDtoOut } from '../../api/model/notification-dto-out';
import { NotificationCenterService } from '../../core/notifications/notification-center.service';
import { NotificationPanelComponent } from './notification-panel.component';

// a11y: the notification rows are non-semantic <li> made keyboard-operable
// (tabindex + keydown.enter). The row's Enter handler is guarded by
// `$event.target === $event.currentTarget`, so an Enter that bubbles up from a
// nested icon button (mark-read / archive) does NOT also open the row. These
// specs lock both halves of that guard against regression.
describe('NotificationPanelComponent (keyboard a11y)', () => {
  let fixture: ComponentFixture<NotificationPanelComponent>;
  let host: HTMLElement;
  let center: StubCenter;

  const ITEMS: NotificationDtoOut[] = [
    {
      id: 1,
      title: 'Nowe zgłoszenie',
      message: 'Ktoś zgłosił się do kampanii.',
      category: 'PARTNERSHIP' as never,
      isRead: false,
      createdAt: '2026-09-02T09:15:00Z',
      actionUrl: '/collaborations/1/applicants',
    },
  ];

  /** Signal-surface stub matching NotificationCenterService's public API. */
  class StubCenter {
    readonly unreadCount = signal(1);
    readonly items = signal<NotificationDtoOut[]>(ITEMS);
    readonly loading = signal(false);
    readonly hasMore = signal(false);
    readonly loadError = signal(false);
    loadFirstPage(): void {
      /* pre-seeded */
    }
    loadMore(): void {
      /* no-op */
    }
    readonly markAsRead = jest.fn();
    markAllAsRead(): void {
      /* no-op */
    }
    archive(): void {
      /* no-op */
    }
  }

  const enter = (el: Element): void => {
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  };

  const setup = async (): Promise<void> => {
    center = new StubCenter();
    await TestBed.configureTestingModule({
      imports: [
        NotificationPanelComponent,
        NoopAnimationsModule,
        TranslocoTestingModule.forRoot({
          langs: { en: {} },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
        }),
      ],
      providers: [provideRouter([]), { provide: NotificationCenterService, useValue: center }],
    }).compileComponents();

    jest.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);

    fixture = TestBed.createComponent(NotificationPanelComponent);
    host = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  };

  it('opens the row (mark-read + navigate) on Enter over the row itself', async () => {
    await setup();
    const navigate = TestBed.inject(Router).navigateByUrl as jest.Mock;

    enter(host.querySelector('[data-testid="notification-1"]') as HTMLElement);

    expect(center.markAsRead).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith('/collaborations/1/applicants');
  });

  it('does NOT open the row when Enter bubbles from a nested action button (guard)', async () => {
    await setup();
    const navigate = TestBed.inject(Router).navigateByUrl as jest.Mock;

    enter(host.querySelector('[data-testid="notification-archive-1"]') as HTMLElement);

    expect(center.markAsRead).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });
});
