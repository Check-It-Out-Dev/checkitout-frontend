import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { RouterLink } from '@angular/router';
import { TranslocoModule, TranslocoService } from '@ngneat/transloco';
import { storeLangChoice } from '../../../core/i18n/lang-preference';

type Locale = 'en' | 'pl';

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

  readonly activeLang = signal<Locale>((this.transloco.getActiveLang() as Locale) || 'en');

  /** Landing sections are in-page anchors; `/grants` is a real route (the EU
   * co-funding disclosure page) so it carries `route` instead of `anchor`. */
  readonly navItems: readonly { key: string; anchor?: string; route?: string }[] = [
    { key: 'header.nav.how_it_works', anchor: 'how-it-works' },
    { key: 'header.nav.pricing', anchor: 'pricing' },
    { key: 'header.nav.faq', anchor: 'faq' },
    { key: 'header.nav.codemap', route: '/codemap' },
    { key: 'header.nav.grants', route: '/grants' },
    { key: 'header.nav.contact', anchor: 'contact' },
  ];

  setLang(lang: Locale): void {
    storeLangChoice(lang);
    this.transloco.setActiveLang(lang);
    this.activeLang.set(lang);
  }

  flag(lang: Locale): string {
    return lang === 'pl' ? '🇵🇱' : '🇬🇧';
  }
}
