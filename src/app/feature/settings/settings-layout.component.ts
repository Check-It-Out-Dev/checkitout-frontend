import { ChangeDetectionStrategy, Component } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatTabsModule } from '@angular/material/tabs';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TranslocoModule } from '@ngneat/transloco';

interface Tab {
  readonly route: string;
  readonly icon: string;
  readonly labelKey: string;
}

/**
 * Tabbed shell for `/user/settings/*`. Each tab routes to its own page
 * (account / preferences / addresses); the active tab pulls from
 * `routerLinkActive`. The router-outlet underneath renders the selected
 * page so navigation between tabs preserves URL + back-button history.
 *
 * Stage 2 ports 3 tabs; the legacy 4th tab (Plan & Billing) lands when
 * the subscription module ships in Stage 3 — at that point we add the
 * `plan-billing` tab + route.
 */
@Component({
  selector: 'app-settings-layout',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    RouterLinkActive,
    RouterOutlet,
    MatIconModule,
    MatTabsModule,
    TranslocoModule,
  ],
  template: `
    <section class="mx-auto max-w-4xl p-4" data-testid="settings-layout">
      <header class="mb-3">
        <h1 class="font-display text-4xl font-normal text-ink">
          {{ 'settings.title' | transloco }}
        </h1>
      </header>

      <nav
        mat-tab-nav-bar
        class="!mb-4 !border-b !border-beige"
        [tabPanel]="settingsPanel"
        data-testid="settings-tabs"
      >
        @for (tab of tabs; track tab.route) {
          <a
            mat-tab-link
            [routerLink]="['./' + tab.route]"
            routerLinkActive
            #rla="routerLinkActive"
            [active]="rla.isActive"
            [attr.data-testid]="'settings-tab-' + tab.route"
          >
            <mat-icon class="!mr-1">{{ tab.icon }}</mat-icon>
            {{ tab.labelKey | transloco }}
          </a>
        }
      </nav>

      <mat-tab-nav-panel #settingsPanel>
        <router-outlet />
      </mat-tab-nav-panel>
    </section>
  `,
})
export class SettingsLayoutComponent {
  readonly tabs: readonly Tab[] = [
    { route: 'account', icon: 'person', labelKey: 'settings.tabs.account' },
    { route: 'addresses', icon: 'location_on', labelKey: 'settings.tabs.addresses' },
    { route: 'security', icon: 'shield', labelKey: 'settings.tabs.security' },
    { route: 'social', icon: 'share', labelKey: 'settings.tabs.social' },
    { route: 'preferences', icon: 'tune', labelKey: 'settings.tabs.preferences' },
    { route: 'plan-billing', icon: 'credit_card', labelKey: 'settings.tabs.plan_billing' },
  ];
}
