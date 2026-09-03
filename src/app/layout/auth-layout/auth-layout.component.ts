import { Component, signal, ChangeDetectionStrategy } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { RouterOutlet } from '@angular/router';
import { TranslocoModule, TranslocoService } from '@ngneat/transloco';
import { CookieBannerComponent } from '../../shared/components/cookie-banner/cookie-banner.component';
import { storeLangChoice } from '../../core/i18n/lang-preference';

type Locale = 'en' | 'pl';

/**
 * Auth shell — used by all `/auth/*` routes. Two-column layout matching the
 * legacy `LayoutWithBannerComponent`:
 *
 *   - Left half (always visible): gray-100 form panel with `<router-outlet>`
 *     for the sign-in / sign-up / forgot-password / etc. component.
 *     Languages dropdown floats top-right.
 *   - Right half (`lg:` and up only): dark gray banner with the welcome
 *     headline, tagline, and the legacy ring + dots SVG decorations.
 *
 * Differs from legacy on purpose:
 *   - No carousel — only the welcome message renders. The legacy 5-second
 *     rotation is purely decorative; greenfield keeps it static so visual
 *     parity diffs are deterministic. If we want it back later it's a 5-line
 *     `setInterval` add.
 *   - Plain Material `MatButton` for the language switcher (legacy used a
 *     custom `<languages>` legacy component).
 */
@Component({
  selector: 'app-auth-layout',
  imports: [
    RouterOutlet,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    TranslocoModule,
    CookieBannerComponent,
  ],
  templateUrl: './auth-layout.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './auth-layout.component.scss',
})
export class AuthLayoutComponent {
  readonly activeLang = signal<Locale>('en');

  constructor(private readonly transloco: TranslocoService) {
    this.activeLang.set((this.transloco.getActiveLang() as Locale) || 'en');
  }

  setLang(lang: Locale): void {
    storeLangChoice(lang);
    this.transloco.setActiveLang(lang);
    this.activeLang.set(lang);
  }
}
