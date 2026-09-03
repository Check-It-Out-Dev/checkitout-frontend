import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TranslocoModule } from '@ngneat/transloco';
import { MarketingToolbarComponent } from '../landing/marketing-toolbar/marketing-toolbar.component';

interface ServiceCard {
  readonly id: 'security' | 'advisory' | 'funding';
  /** Heroicons-outline path data — legacy used the same three glyphs via its icon registry. */
  readonly svgPath: string;
}

/**
 * `/grants` — the public EU-funding disclosure page, ported from legacy
 * (iter-56, audit P0 #8; owner: port all placeholder routes). Structure is
 * verbatim from legacy — hero, WRO4digITal partnership logo, three service
 * cards, EU banner with the funding legal text — restyled to the design
 * language. The two images under `assets/images/euGraphics/` are official
 * EU-visibility artwork copied unmodified from legacy; all copy lives in
 * the pre-existing `landing.grants.*` i18n keys.
 */
@Component({
  selector: 'app-grants',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslocoModule, MarketingToolbarComponent],
  templateUrl: './grants.component.html',
})
export class GrantsComponent {
  readonly serviceCards: readonly ServiceCard[] = [
    {
      id: 'security',
      // heroicons outline: shield-check
      svgPath:
        'M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z',
    },
    {
      id: 'advisory',
      // heroicons outline: light-bulb
      svgPath:
        'M12 18v-5.25m0 0a6.01 6.01 0 0 0 1.5-.189m-1.5.189a6.01 6.01 0 0 1-1.5-.189m3.75 7.478a12.06 12.06 0 0 1-4.5 0m3.75 2.383a14.406 14.406 0 0 1-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 1 0-7.517 0c.85.493 1.509 1.333 1.509 2.316V18',
    },
    {
      id: 'funding',
      // heroicons outline: presentation-chart-line
      svgPath:
        'M3.75 3v11.25A2.25 2.25 0 0 0 6 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0 1 18 16.5h-2.25m-7.5 0h7.5m-7.5 0-1 3m8.5-3 1 3m0 0 .5 1.5m-.5-1.5h-10.5m0 0-.5 1.5m.75-9 3-3 2.148 2.148A12.061 12.061 0 0 1 16.5 7.605',
    },
  ];
}
