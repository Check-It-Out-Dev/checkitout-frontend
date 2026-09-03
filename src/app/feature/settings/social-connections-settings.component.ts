import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DestroyRef } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { TranslocoModule, TranslocoService } from '@ngneat/transloco';
import { SocialConnectionsApi } from '../../core/social/social-connections.service';
import { SocialAuthService } from '../../core/auth/social-auth.service';
import { groupedNumber } from '../../core/i18n/number-format';
import type { UserSocialConnectionDtoOut } from '../../api/model/user-social-connection-dto-out';

/**
 * Settings › Social connections — the influencer's linked platform accounts.
 * Lists connections from the BE (platform, handle, followers, status),
 * disconnects one at a time (per-row busy state; the row leaves the list on
 * success), and starts the Instagram OAuth flow for new connections via the
 * same `SocialAuthService` the sign-in flow uses (FE builds the provider URL
 * → provider redirects to the BE callback → BE writes UserSocialConnection).
 *
 * States: loading spinner → loaded rows / empty CTA / error with retry.
 * All data flows through the `SocialConnectionsApi` wrapper (G2) and the
 * generated `UserSocialConnectionDtoOut` type (L0-pinned).
 */
@Component({
  selector: 'app-social-connections-settings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatIconModule, MatProgressSpinnerModule, TranslocoModule],
  template: `
    <section class="mx-auto max-w-3xl" data-testid="social-connections">
      <h2 class="font-display text-xl text-ink">
        {{ 'settings.social.title' | transloco }}
      </h2>
      <p class="mt-1 text-sm text-slate2">
        {{ 'settings.social.subtitle' | transloco }}
      </p>

      @if (loading()) {
        <div class="mt-8 flex justify-center" data-testid="social-connections-loading">
          <mat-spinner diameter="36"></mat-spinner>
        </div>
      } @else if (error()) {
        <div
          class="mt-6 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"
          data-testid="social-connections-error"
        >
          <p>{{ 'settings.social.error' | transloco }}</p>
          <button mat-stroked-button type="button" class="!mt-3" (click)="load()">
            {{ 'settings.social.retry' | transloco }}
          </button>
        </div>
      } @else {
        @if (connections().length === 0) {
          <div
            class="mt-6 rounded-2xl border border-beige bg-cream p-8 text-center"
            data-testid="social-connections-empty"
          >
            <mat-icon class="!h-10 !w-10 !text-4xl text-coral-500">share</mat-icon>
            <p class="mt-3 text-sm font-semibold text-ink">
              {{ 'settings.social.empty.title' | transloco }}
            </p>
            <p class="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-slate2">
              {{ 'settings.social.empty.body' | transloco }}
            </p>
          </div>
        } @else {
          <ul class="mt-6 space-y-3" data-testid="social-connections-list">
            @for (c of connections(); track c.id) {
              <li
                class="flex items-center gap-4 rounded-xl border border-beige bg-white p-4 shadow-sm"
                [attr.data-testid]="'social-connection-' + c.id"
              >
                @if (c.profilePictureUrl) {
                  <img
                    [src]="c.profilePictureUrl"
                    alt=""
                    class="h-10 w-10 rounded-full object-cover"
                  />
                } @else {
                  <span
                    class="flex h-10 w-10 items-center justify-center rounded-full bg-coral-50 text-coral-600"
                  >
                    <mat-icon class="!h-5 !w-5 !text-xl">share</mat-icon>
                  </span>
                }
                <div class="min-w-0 flex-1">
                  <div class="flex flex-wrap items-baseline gap-x-2">
                    <span class="text-sm font-semibold text-ink">
                      {{ c.displayName || c.socialUserId }}
                    </span>
                    <span class="font-mono text-[11px] uppercase tracking-wide text-slate2">
                      {{ c.platform?.name }}
                    </span>
                    @if (c.connectionStatus === 'CONNECTED') {
                      <span
                        class="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase text-emerald-700"
                      >
                        {{ 'settings.social.status.connected' | transloco }}
                      </span>
                    } @else if (c.connectionStatus) {
                      <span
                        class="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase text-amber-700"
                      >
                        {{ c.connectionStatus }}
                      </span>
                    }
                  </div>
                  @if (c.followersCount != null) {
                    <p class="mt-0.5 text-xs text-slate2">
                      {{
                        'settings.social.followers'
                          | transloco: { count: formatCount(c.followersCount) }
                      }}
                    </p>
                  }
                </div>
                <button
                  mat-stroked-button
                  type="button"
                  [disabled]="disconnecting() === c.id"
                  (click)="disconnect(c)"
                  [attr.data-testid]="'social-disconnect-' + c.id"
                >
                  @if (disconnecting() === c.id) {
                    <mat-spinner diameter="16" class="!inline-block"></mat-spinner>
                  } @else {
                    {{ 'settings.social.disconnect' | transloco }}
                  }
                </button>
              </li>
            }
          </ul>
        }

        <!-- connect a new platform — same OAuth flow as social sign-in -->
        <div class="mt-6 rounded-xl border border-beige bg-cream p-4">
          <p class="text-sm font-semibold text-ink">
            {{ 'settings.social.connect.title' | transloco }}
          </p>
          <p class="mt-1 text-xs leading-relaxed text-slate2">
            {{ 'settings.social.connect.body' | transloco }}
          </p>
          <button
            mat-flat-button
            color="primary"
            type="button"
            class="!mt-3"
            [disabled]="socialAuth.starting()"
            (click)="connectInstagram()"
            data-testid="social-connect-instagram"
          >
            <mat-icon class="!mr-1 !h-4 !w-4 !text-base">instagram</mat-icon>
            {{ 'settings.social.connect.instagram' | transloco }}
          </button>
          @if (connectError()) {
            <p class="mt-2 text-xs text-rose-700" data-testid="social-connect-error">
              {{ 'settings.social.connect.unsupported' | transloco }}
            </p>
          }
        </div>
      }
    </section>
  `,
})
export class SocialConnectionsSettingsComponent implements OnInit {
  private readonly api = inject(SocialConnectionsApi);
  private readonly destroyRef = inject(DestroyRef);
  readonly socialAuth = inject(SocialAuthService);

  readonly loading = signal(true);
  readonly error = signal(false);
  readonly connections = signal<UserSocialConnectionDtoOut[]>([]);
  /** id currently being disconnected — drives the per-row busy state. */
  readonly disconnecting = signal<number | null>(null);
  readonly connectError = signal(false);

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set(false);
    this.api
      .list()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (page) => {
          this.connections.set(page.content ?? []);
          this.loading.set(false);
        },
        error: () => {
          this.error.set(true);
          this.loading.set(false);
        },
      });
  }

  disconnect(c: UserSocialConnectionDtoOut): void {
    if (c.id == null || this.disconnecting() !== null) return;
    this.disconnecting.set(c.id);
    this.api
      .disconnect(c.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.connections.update((list) => list.filter((x) => x.id !== c.id));
          this.disconnecting.set(null);
        },
        error: () => this.disconnecting.set(null),
      });
  }

  connectInstagram(): void {
    this.connectError.set(!this.socialAuth.startOAuthFlow('instagram'));
  }

  private readonly transloco = inject(TranslocoService);

  /** Locale-aware grouping — "12 800" in Polish, "12,800" in English. */
  formatCount(n: number): string {
    return groupedNumber(this.transloco.getActiveLang(), n);
  }
}
