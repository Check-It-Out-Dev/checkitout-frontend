import { ChangeDetectionStrategy, Component, Input, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { TranslocoModule } from '@ngneat/transloco';
import { ConsentService } from '../../../core/consent/consent.service';

/**
 * Sticky bottom banner shown until the user makes an explicit consent
 * decision. First layer: "Accept all", "Necessary only" (reject-all parity —
 * one click, same layer) and "Customize". The customize panel expands inline
 * with per-category toggles (GDPR Art. 7 granularity): necessary is locked
 * on, analytics and marketing are opt-in and default OFF, saved via
 * `ConsentService.acceptCustom`. Decision lives in `ConsentService`
 * (localStorage-backed, mirrored to the BE consent cookies).
 *
 * Accessibility: `role="region"` with an `aria-label` so screen readers
 * announce the banner separately; the customize button carries
 * `aria-expanded`/`aria-controls` for the disclosure pattern.
 *
 * `startExpanded` exists for the sandbox fixture (renders the expanded
 * panel for its visual baseline) — production always starts collapsed.
 */
@Component({
  selector: 'app-cookie-banner',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatSlideToggleModule, TranslocoModule],
  template: `
    @if (consent.needsDecision()) {
      <aside
        role="region"
        [attr.aria-label]="'consent.banner.title' | transloco"
        data-testid="cookie-banner"
        class="fixed inset-x-0 bottom-0 z-50 border-t border-beige bg-cream px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-2xl"
      >
        <!-- pb uses max(py-3, safe-area-inset-bottom) so the fixed banner
             clears the iOS home indicator. Inert today (env()=0 without
             viewport-fit=cover in the meta) but correct-by-default when the
             cutover real-device sweep validates viewport-fit=cover — that
             meta change affects every screen on notched iPhones, so it is
             deliberately NOT flipped here (audit P2, disposition 2026-09-02). -->
        <div class="mx-auto max-w-5xl">
          <div
            class="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div class="text-sm text-ink">
              <strong class="block font-display text-base font-normal sm:inline">
                {{ 'consent.banner.title' | transloco }}
              </strong>
              <span class="block text-slate2 sm:ml-2 sm:inline">
                {{ 'consent.banner.body' | transloco }}
              </span>
            </div>
            <div class="flex shrink-0 flex-wrap items-center gap-2">
              <button
                mat-button
                type="button"
                [attr.aria-expanded]="expanded()"
                aria-controls="cookie-banner-categories"
                (click)="expanded.set(!expanded())"
                data-testid="cookie-banner-customize"
              >
                {{ 'consent.banner.customize' | transloco }}
              </button>
              <button
                mat-stroked-button
                type="button"
                (click)="consent.acceptNecessary()"
                data-testid="cookie-banner-necessary"
              >
                {{ 'consent.banner.necessary_only' | transloco }}
              </button>
              <button
                mat-flat-button
                color="primary"
                type="button"
                (click)="consent.acceptAll()"
                data-testid="cookie-banner-accept-all"
              >
                {{ 'consent.banner.accept_all' | transloco }}
              </button>
            </div>
          </div>

          @if (expanded()) {
            <div
              id="cookie-banner-categories"
              data-testid="cookie-banner-categories"
              class="mt-3 border-t border-beige pt-3"
            >
              <div class="grid gap-3 sm:grid-cols-3">
                <!-- necessary — locked on -->
                <div class="rounded-xl border border-beige bg-white p-3">
                  <mat-slide-toggle [checked]="true" [disabled]="true">
                    <span class="text-sm font-semibold text-ink">
                      {{ 'consent.banner.categories.necessary.name' | transloco }}
                    </span>
                  </mat-slide-toggle>
                  <p class="mt-1.5 text-xs leading-snug text-slate2">
                    {{ 'consent.banner.categories.necessary.desc' | transloco }}
                  </p>
                </div>
                <!-- analytics — opt-in, defaults OFF -->
                <div class="rounded-xl border border-beige bg-white p-3">
                  <mat-slide-toggle
                    [checked]="analytics()"
                    (change)="analytics.set($event.checked)"
                    data-testid="cookie-banner-toggle-analytics"
                  >
                    <span class="text-sm font-semibold text-ink">
                      {{ 'consent.banner.categories.analytics.name' | transloco }}
                    </span>
                  </mat-slide-toggle>
                  <p class="mt-1.5 text-xs leading-snug text-slate2">
                    {{ 'consent.banner.categories.analytics.desc' | transloco }}
                  </p>
                </div>
                <!-- marketing — opt-in, defaults OFF -->
                <div class="rounded-xl border border-beige bg-white p-3">
                  <mat-slide-toggle
                    [checked]="marketing()"
                    (change)="marketing.set($event.checked)"
                    data-testid="cookie-banner-toggle-marketing"
                  >
                    <span class="text-sm font-semibold text-ink">
                      {{ 'consent.banner.categories.marketing.name' | transloco }}
                    </span>
                  </mat-slide-toggle>
                  <p class="mt-1.5 text-xs leading-snug text-slate2">
                    {{ 'consent.banner.categories.marketing.desc' | transloco }}
                  </p>
                </div>
              </div>
              <div class="mt-3 flex justify-end">
                <button
                  mat-flat-button
                  color="primary"
                  type="button"
                  (click)="saveCustom()"
                  data-testid="cookie-banner-save"
                >
                  {{ 'consent.banner.save' | transloco }}
                </button>
              </div>
            </div>
          }
        </div>
      </aside>
    }
  `,
})
export class CookieBannerComponent {
  readonly consent = inject(ConsentService);

  /** Disclosure state of the customize panel. */
  readonly expanded = signal(false);
  /** Toggle states — opt-in categories default OFF (GDPR: no pre-ticked boxes). */
  readonly analytics = signal(false);
  readonly marketing = signal(false);

  /** Sandbox-fixture hook: render the expanded panel for the visual baseline. */
  @Input() set startExpanded(value: boolean) {
    this.expanded.set(value);
  }

  saveCustom(): void {
    this.consent.acceptCustom(this.analytics(), this.marketing());
  }
}
