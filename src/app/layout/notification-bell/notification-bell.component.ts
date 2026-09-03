import { ChangeDetectionStrategy, Component, ViewChild, inject } from '@angular/core';
import { MatBadgeModule } from '@angular/material/badge';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule, MatMenuTrigger } from '@angular/material/menu';
import { TranslocoModule } from '@ngneat/transloco';
import { NotificationCenterService } from '../../core/notifications/notification-center.service';
import { NotificationPanelComponent } from './notification-panel.component';

/**
 * Toolbar notification bell (legacy `<notifications>` parity). The badge
 * shows the polled unread count (hidden at 0); opening the menu lazily
 * loads the first page of the list. A row-navigation inside the panel
 * closes the menu.
 */
@Component({
    selector: 'app-notification-bell',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [
        MatBadgeModule,
        MatButtonModule,
        MatIconModule,
        MatMenuModule,
        NotificationPanelComponent,
        TranslocoModule,
    ],
    template: `
    <button
      mat-icon-button
      type="button"
      [matMenuTriggerFor]="panelMenu"
      (menuOpened)="onOpened()"
      [matBadge]="center.unreadCount()"
      [matBadgeHidden]="center.unreadCount() === 0"
      matBadgeColor="warn"
      matBadgeSize="small"
      [attr.aria-label]="'notifications.title' | transloco"
      data-testid="notification-bell"
    >
      <mat-icon>notifications</mat-icon>
    </button>
    <mat-menu #panelMenu="matMenu" class="notification-menu" xPosition="before">
      <div (click)="$event.stopPropagation()" (keydown)="$event.stopPropagation()">
        <app-notification-panel (navigated)="close()"></app-notification-panel>
      </div>
    </mat-menu>
  `
})
export class NotificationBellComponent {
  readonly center = inject(NotificationCenterService);

  @ViewChild(MatMenuTrigger) private trigger?: MatMenuTrigger;

  onOpened(): void {
    this.center.loadFirstPage();
  }

  close(): void {
    this.trigger?.closeMenu();
  }
}
