import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { RouterLink } from '@angular/router';
import { TranslocoModule, TranslocoService } from '@ngneat/transloco';
import { SessionStateService } from '../../../core/auth/session-state.service';
import { storeLangChoice } from '../../../core/i18n/lang-preference';

type Locale = 'en' | 'pl';

/** One entry in the bar or the menu. `id` is only a stable test handle — the
 * anchor and route ones used to be addressed differently, so half the list was
 * unreachable by a test that did not already know which half it was in. */
interface NavItem {
  id: string;
  key: string;
  anchor?: string;
  route?: string;
}

/**
 * Public marketing toolbar rendered at the top of the bare landing route (`/`).
 * Restores legacy parity: brand mark, in-page nav anchors, sign-in link,
 * "Join for free" CTA, and the 🇬🇧 / 🇵🇱 language switcher the user flagged
 * missing.
 *
 * Lives under feature/landing/ rather than layout/ because the landing route
 * is intentionally bare (no LayoutComponent wrap — see app.routes Section 3).
 *
 * Mobile: nav items collapse to a hamburger menu (mat-menu). Brand + CTAs
 * stay visible at all viewport widths.
 */
@Component({
  selector: 'app-marketing-toolbar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, MatButtonModule, MatIconModule, MatMenuModule, TranslocoModule],
  templateUrl: './marketing-toolbar.component.html',
})
export class MarketingToolbarComponent {
  private readonly transloco = inject(TranslocoService);
  private readonly session = inject(SessionStateService);

  /**
   * Session CACHE only (same rule as noAuthGuard / the support centre): a
   * signed-in visitor on /support or /grants gets "Przejdź do aplikacji"
   * instead of "Zaloguj się / Dołącz za darmo". A cold public page stays
   * anonymous-looking until an app route probes — no request from here.
   */
  readonly signedIn = computed(() => this.session.probed() && this.session.isAuthenticated());

  readonly activeLang = signal<Locale>((this.transloco.getActiveLang() as Locale) || 'en');

  /** The bar. Landing sections are in-page anchors; the rest are real routes and
   * carry `route` instead of `anchor`.
   *
   * `header.nav.survey` was the missing one, and its absence was expensive: the
   * technical survey is five chapters and twenty-four showcases arguing the
   * whole engineering case, and its only entrance anywhere on the site was a
   * card below the fold inside a section headed "Open source". Nothing in the
   * toolbar and nothing in the footer led to it. A visitor who judged the page
   * from the first screen never learned it existed.
   *
   * Seven, not eight. All eight fit (measured at 1280 px in Polish, which has
   * the longer labels, with 67 px to spare), so this is a priority list and not
   * a width constraint. A bar is read left to right and its right-hand end is
   * where attention has already gone. The EU-funding disclosure earns its place:
   * the owner asked for it back in the bar (2026-09-07); it is an obligation of
   * the grant and a page visitors are sent to. The about-us does not, and stays
   * one click away in the menu and in the footer, where
   * `e2e-tests/sandbox/marketing-toolbar.spec.ts` fails if it disappears. */
  readonly navItems: readonly NavItem[] = [
    { id: 'how-it-works', key: 'header.nav.how_it_works', anchor: 'how-it-works' },
    { id: 'pricing', key: 'header.nav.pricing', anchor: 'pricing' },
    { id: 'survey', key: 'header.nav.survey', route: '/technical-survey' },
    { id: 'codemap', key: 'header.nav.codemap', route: '/codemap' },
    { id: 'grants', key: 'header.nav.grants', route: '/grants' },
    { id: 'faq', key: 'header.nav.faq', anchor: 'faq' },
    { id: 'contact', key: 'header.nav.contact', anchor: 'contact' },
  ];

  /** The menu's list: the bar's, plus the one that was demoted from it. The
   * menu carries everything, because below `lg` it is the only navigation
   * there is. */
  readonly menuItems: readonly NavItem[] = [
    ...this.navItems,
    { id: 'team', key: 'header.nav.team', route: '/team' },
  ];

  setLang(lang: Locale): void {
    storeLangChoice(lang);
    this.transloco.setActiveLang(lang);
    this.activeLang.set(lang);
  }
}
