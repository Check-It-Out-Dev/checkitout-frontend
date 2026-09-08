import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';

import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatMenuModule } from '@angular/material/menu';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TranslocoModule, TranslocoService } from '@ngneat/transloco';
import { ThemeService } from '../core/theme/theme.service';
import { storeLangChoice } from '../core/i18n/lang-preference';
import { NotificationBellComponent } from './notification-bell/notification-bell.component';
import { ShellBannersComponent } from '../feature/shell/shell-banners.component';
import { ShellStatusService } from '../core/shell/shell-status.service';
import { AddressApi } from '../core/address/address.service';
import { UserApiService } from '../core/user/user.service';
import { PublicConfigApiService } from '../core/config/public-config.service';
import { SubscriptionApiService } from '../core/subscription/subscription.service';
import { SubscriptionStatus } from '../core/api-frozen/hidden-models';
import { CookieBannerComponent } from '../shared/components/cookie-banner/cookie-banner.component';
import { isDemoMode } from '../core/demo/demo-mode';
import { SandboxDirectorService } from '../core/demo/sandbox-director.service';

type Locale = 'en' | 'pl';

interface NavEntry {
  readonly label: string;
  readonly route: string;
  readonly icon: string;
}

/** Company/influencer surface. Routes match `app.routes.ts` as of Stage 4. */
const STANDARD_NAV: readonly NavEntry[] = [
  { label: 'nav.discover', route: '/collaborations/list', icon: 'explore' },
  { label: 'nav.applications', route: '/collaborations/registrations', icon: 'send' },
  { label: 'nav.my_campaigns', route: '/collaborations/my-campaigns', icon: 'campaign' },
  { label: 'nav.profile', route: '/user/settings/account', icon: 'person' },
  { label: 'nav.plan_billing', route: '/user/settings/plan-billing', icon: 'credit_card' },
];

/**
 * Admin surface — mirrors legacy `adminNavigation` (navigation.ts): user
 * management, the collaborations overview, browse, and the admin ticket
 * queue; greenfield adds its dictionary editor (unreachable otherwise).
 * No Profile/Plan entries, like legacy: account access lives in the
 * toolbar user menu, and admins hold no subscription.
 */
const ADMIN_NAV: readonly NavEntry[] = [
  { label: 'nav.admin_users', route: '/user/list', icon: 'group' },
  { label: 'nav.discover', route: '/collaborations/list', icon: 'explore' },
  { label: 'nav.applications', route: '/collaborations/registrations', icon: 'send' },
  { label: 'nav.admin_dictionary', route: '/admin/dictionary', icon: 'menu_book' },
  { label: 'nav.admin_tickets', route: '/support/admin/tickets', icon: 'support_agent' },
];

/**
 * Role-shaped surfaces. A brand runs campaigns and pays for a plan; a
 * creator applies to campaigns and never sees billing. Both share the
 * marketplace and the collaboration board ("Współprace").
 */
const COMPANY_NAV: readonly NavEntry[] = [
  { label: 'nav.discover', route: '/collaborations/list', icon: 'explore' },
  { label: 'nav.my_campaigns', route: '/collaborations/my-campaigns', icon: 'campaign' },
  { label: 'nav.cooperations', route: '/collaborations/in-progress', icon: 'handshake' },
  { label: 'nav.profile', route: '/user/settings/account', icon: 'person' },
  { label: 'nav.plan_billing', route: '/user/settings/plan-billing', icon: 'credit_card' },
];

const INFLUENCER_NAV: readonly NavEntry[] = [
  { label: 'nav.discover', route: '/collaborations/list', icon: 'explore' },
  { label: 'nav.applications', route: '/collaborations/registrations', icon: 'send' },
  { label: 'nav.cooperations', route: '/collaborations/in-progress', icon: 'handshake' },
  { label: 'nav.profile', route: '/user/settings/account', icon: 'person' },
];

/**
 * Top-level shell — Material sidenav + toolbar. Built from scratch using only
 * Angular Material primitives (no @fuse/* anywhere; the whole point of this
 * rewrite is to eliminate the legacy commercial UI).
 *
 * Responsive behaviour driven by the Material CDK BreakpointObserver:
 * - <960px (handset/tablet): sidenav is a slide-over `over` mode, toggled
 *   by the hamburger button in the toolbar.
 * - >=960px: sidenav is permanent on the left.
 *
 * Theme + language switchers are wired here. Both will get richer UX
 * (dropdown with all locales, palette-picker) in later slices; for the
 * Phase 2 shell they're plain toggle buttons.
 */
@Component({
  selector: 'app-layout',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // Everything under this shell depends on who is signed in, and the server
  // does not know: it renders the default persona's rows, the client renders
  // the visitor's, and hydration then keeps the server's nodes — a status chip
  // came through with the server's green classes AND the client's blue ones
  // (the registrations list, 2026-09-07). The server-rendered shell is thrown
  // away and rebuilt on the client instead; the public pages keep hydrating.
  host: { ngSkipHydration: 'true' },
  imports: [
    RouterLink,
    RouterLinkActive,
    RouterOutlet,
    MatButtonModule,
    MatDividerModule,
    MatIconModule,
    MatListModule,
    MatMenuModule,
    MatSidenavModule,
    MatToolbarModule,
    TranslocoModule,
    CookieBannerComponent,
    NotificationBellComponent,
    ShellBannersComponent,
  ],
  templateUrl: './layout.component.html',
  styleUrl: './layout.component.scss',
})
export class LayoutComponent {
  private readonly breakpointObserver = inject(BreakpointObserver);
  private readonly theme = inject(ThemeService);
  private readonly transloco = inject(TranslocoService);
  private readonly userApi = inject(UserApiService);
  private readonly addressApi = inject(AddressApi);
  private readonly shellStatus = inject(ShellStatusService);
  private readonly publicConfig = inject(PublicConfigApiService);
  private readonly subscriptionApi = inject(SubscriptionApiService);
  private readonly director = inject(SandboxDirectorService);

  /**
   * Where the brand mark leads. In the app it is the front page a signed-in
   * user lands on anyway. In the demo it is the hub, and the click also
   * ends the sandbox: the director signs the persona out and boots there,
   * so the hub, the landing page and the next tour start clean. Pointed at
   * `/` it went nowhere — the landing bounces a signed-in persona straight
   * back — and read as a dead button (owner, 2026-09-07).
   */
  readonly brandLink = isDemoMode() ? '/demo' : '/collaborations/list';

  onBrand(event: Event): void {
    if (!isDemoMode()) return;
    event.preventDefault();
    this.director.exit();
  }

  /** True on handset / small tablet (<960px). */
  readonly isMobile = signal(false);

  /** Sidenav open state — driven by the hamburger button on mobile. */
  readonly sidenavOpen = signal(true);

  readonly themeMode = this.theme.mode;

  /**
   * The toolbar's sun/moon button flipped a `dark-theme` class that no
   * stylesheet styles (material-theme.scss has no dark palette yet), so it
   * did nothing visible. Hidden until a dark palette ships; ThemeService and
   * the stored `cio.theme` choice stay so nothing is lost when it does.
   */
  readonly themeToggleEnabled = false;

  /** Currently active language; mirrors Transloco state into a signal so the
   * template can show a check-mark next to the active locale. */
  readonly activeLang = signal<Locale>('pl');

  /** Role from `/users/me` — drives the nav surface below. */
  private readonly userType = signal<string | null>(null);

  // ADMIN gets the legacy admin surface, a brand the campaign-owner one, a
  // creator the applicant one; pre-resolution null keeps the standard
  // union so the rail never blanks while /users/me is in flight. Routes
  // the actor can't access are BE-authorized anyway.
  readonly navEntries = computed<readonly NavEntry[]>(() => {
    switch (this.userType()) {
      case 'ADMIN':
        return ADMIN_NAV;
      case 'COMPANY':
        return COMPANY_NAV;
      case 'INFLUENCER':
        return INFLUENCER_NAV;
      default:
        return STANDARD_NAV;
    }
  });

  constructor() {
    this.breakpointObserver
      .observe([
        Breakpoints.HandsetPortrait,
        Breakpoints.HandsetLandscape,
        Breakpoints.TabletPortrait,
      ])
      .pipe(takeUntilDestroyed())
      .subscribe((state) => {
        const mobile = state.matches;
        this.isMobile.set(mobile);
        // Default closed on mobile, open on desktop.
        this.sidenavOpen.set(!mobile);
      });

    this.activeLang.set(this.transloco.getActiveLang() as Locale);
    this.transloco.langChanges$
      .pipe(takeUntilDestroyed())
      .subscribe((lang) => this.activeLang.set(lang as Locale));

    // Fetch /api/users/me on shell mount + populate the profile-missing
    // signal so ShellBannersComponent renders the "Your profile is
    // incomplete" banner with concrete missing-field labels. Required by
    // both COMPANY (NIP, address, phone) and INFLUENCER (firstName,
    // lastName, phone, primary address) actors. Silently no-op on error
    // — the banner just stays hidden if /me fails.
    this.userApi.getCurrent().subscribe({
      next: (user) => {
        this.userType.set(user.userType?.value ?? null);
        const missing: string[] = [];
        if (!user.firstName?.trim()) missing.push('firstName');
        if (!user.lastName?.trim()) missing.push('lastName');
        if (!user.phoneNumber?.trim()) missing.push('phone');
        if (user.userType?.value === 'COMPANY' && !user.nip?.trim()) missing.push('nip');
        this.shellStatus.setProfileMissing(missing);
        // Primary address is its own endpoint (404 when unset) — probe it
        // and append; legacy flags exactly this for seeded company actors.
        if (user.id !== undefined) {
          this.addressApi.primaryForUser(user.id).subscribe({
            next: (primary) => {
              if (!primary?.id) {
                this.shellStatus.setProfileMissing([...missing, 'primaryAddress']);
              }
            },
            error: () => this.shellStatus.setProfileMissing([...missing, 'primaryAddress']),
          });
        }
        // J9 blocked-account enforcement: BE flips accountStatus to
        // BLOCKED_DUE_TO_NOT_ACCEPTING_TERMS after a terms-version bump
        // grace period. Read-only is server-enforced; the shell surfaces
        // the red banner + reconsent dialog (legacy parity).
        const blockedForTerms = user.accountStatus?.value === 'BLOCKED_DUE_TO_NOT_ACCEPTING_TERMS';
        this.shellStatus.setBlockedForTerms(blockedForTerms, user.daysToAcceptNewTerms ?? null);
        // Still ACTIVE but a terms grace period is running: the BE sends no
        // consent header here (live-verified) — the amber countdown banner
        // is driven by this field, exactly like legacy.
        if (!blockedForTerms) {
          this.shellStatus.setConsentPending(user.daysToAcceptNewTerms ?? null);
        }
        // Trial-offer nudge (audit P1): only companies hold subscriptions, and
        // only payments-enabled deploys can activate a trial. Sequenced so a
        // free-only deploy makes NO /subscription/status call — the anonymous
        // /public-config probe (cached, shareReplay) short-circuits first.
        // Errors are silent no-ops; the nudge simply stays hidden.
        if (user.userType?.value === 'COMPANY') {
          this.publicConfig.paymentsEnabled().subscribe((enabled) => {
            if (!enabled) return;
            this.subscriptionApi.getStatus().subscribe({
              next: (sub) =>
                this.shellStatus.setTrialOffer(
                  Boolean(
                    sub.trialEligible &&
                    !sub.trialUsed &&
                    sub.status === SubscriptionStatus.FREE_ACTIVE,
                  ),
                ),
              error: () => undefined,
            });
          });
        }
      },
      error: () => {
        /* leave the missing-fields signal empty; banner stays hidden */
      },
    });
  }

  toggleSidenav(): void {
    this.sidenavOpen.update((open) => !open);
  }

  toggleTheme(): void {
    this.theme.toggle();
  }

  setLang(lang: Locale): void {
    storeLangChoice(lang);
    this.transloco.setActiveLang(lang);
  }
}
