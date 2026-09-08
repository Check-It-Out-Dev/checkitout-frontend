import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoPipe } from '@ngneat/transloco';
import { WorldSimShellComponent } from './world-sim-shell.component';
import { DEMO_CHECKOUT_KEY, DEMO_PLAN_KEY } from '../../../core/demo/demo-fixtures';
import { SandboxDirectorService } from '../../../core/demo/sandbox-director.service';
import { SUBSCRIPTION_CHANGED, announce } from '../../../core/cross-tab';

/**
 * Stripe Checkout, simulated.
 *
 * The real upgrade dialog hands the browser to checkout.stripe.com: the
 * order on the left, the payment form on the right, one button. The demo
 * used to skip that page entirely — the hand-off was a same-origin reload
 * that came back with the plan already active, and the owner saw a screen
 * flash where a purchase should have been (2026-09-07). This card is that
 * page: the same shape, Stripe's test card already typed in, and paying is
 * what the completed-payment webhook would do — the plan is stored and the
 * plan page is told to read it again.
 */
const PRICES: Record<string, string> = { BUSINESS: '29,00', ENTERPRISE: '99,00' };

@Component({
  selector: 'app-checkout-sim',
  imports: [MatIconModule, TranslocoPipe, WorldSimShellComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-world-sim-shell [caption]="'demo.sims.checkout.caption' | transloco">
      <div
        class="w-[46rem] max-w-[calc(100vw-3rem)] overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-beige"
        data-testid="checkout-sim"
      >
        <!-- browser chrome: this is another site -->
        <div class="flex items-center gap-2 border-b border-beige bg-cream px-4 py-2.5">
          <span class="flex gap-1.5" aria-hidden="true">
            <i class="block h-2.5 w-2.5 rounded-full bg-coral-300"></i>
            <i class="block h-2.5 w-2.5 rounded-full bg-amber-300"></i>
            <i class="block h-2.5 w-2.5 rounded-full bg-emerald-300"></i>
          </span>
          <span
            class="ml-2 flex-1 truncate rounded-md bg-white px-3 py-1 font-mono text-[11px] text-slate2 ring-1 ring-beige"
          >
            <mat-icon class="!h-3.5 !w-3.5 !text-sm align-[-2px]">lock</mat-icon>
            checkout.stripe.com/c/pay/cs_test_demo_{{ plan().toLowerCase() }}
          </span>
          <span
            class="rounded-full bg-amber-100 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-amber-800"
          >
            {{ 'demo.sims.checkout.testMode' | transloco }}
          </span>
        </div>

        <div class="grid sm:grid-cols-[1fr_1.1fr]">
          <!-- the order -->
          <div class="bg-navy-900 p-6 text-cream">
            <p class="font-mono text-[10px] uppercase tracking-[0.18em] text-cream/60">
              {{ 'demo.sims.checkout.subscribeTo' | transloco }}
            </p>
            <p class="mt-2 font-display text-3xl">checkItOut {{ planName() }}</p>
            <p class="mt-1 text-sm text-cream/80">
              {{ 'demo.sims.checkout.perMonth' | transloco: { price: price() } }}
            </p>
            <dl class="mt-6 space-y-2 border-t border-cream/15 pt-4 text-sm">
              <div class="flex justify-between">
                <dt class="text-cream/70">
                  {{ 'demo.sims.checkout.lineSubscription' | transloco }}
                </dt>
                <dd>{{ price() }} zł</dd>
              </div>
              <div class="flex justify-between">
                <dt class="text-cream/70">{{ 'demo.sims.checkout.lineVat' | transloco }}</dt>
                <dd>{{ 'demo.sims.checkout.included' | transloco }}</dd>
              </div>
              <div class="flex justify-between border-t border-cream/15 pt-2 font-semibold">
                <dt>{{ 'demo.sims.checkout.total' | transloco }}</dt>
                <dd data-testid="checkout-sim-total">{{ price() }} zł</dd>
              </div>
            </dl>
            <p class="mt-8 text-[11px] text-cream/50">
              {{ 'demo.sims.checkout.poweredBy' | transloco }}
              <span class="font-semibold text-cream/80">stripe</span>
            </p>
          </div>

          <!-- the payment form, already filled with the test card -->
          <form class="p-6" (submit)="$event.preventDefault(); pay()">
            <label class="block">
              <span class="font-mono text-[10px] uppercase tracking-[0.18em] text-slate2">
                {{ 'demo.sims.checkout.email' | transloco }}
              </span>
              <input
                class="mt-1 w-full rounded-lg border border-beige bg-cream/60 px-3 py-2 text-sm text-ink"
                value="demo@checkitout.app"
                readonly
              />
            </label>
            <label class="mt-3 block">
              <span class="font-mono text-[10px] uppercase tracking-[0.18em] text-slate2">
                {{ 'demo.sims.checkout.card' | transloco }}
              </span>
              <span
                class="mt-1 flex items-center gap-2 rounded-lg border border-beige bg-cream/60 px-3 py-2 text-sm text-ink"
              >
                <mat-icon class="!h-4 !w-4 !text-base text-navy-500">credit_card</mat-icon>
                <input
                  class="min-w-0 flex-1 bg-transparent font-mono tracking-[0.12em]"
                  value="4242 4242 4242 4242"
                  readonly
                  data-testid="checkout-sim-card"
                />
                <span class="rounded bg-navy-500 px-1.5 py-0.5 font-mono text-[9px] text-white">
                  VISA
                </span>
              </span>
            </label>
            <div class="mt-3 grid grid-cols-2 gap-3">
              <label class="block">
                <span class="font-mono text-[10px] uppercase tracking-[0.18em] text-slate2">
                  {{ 'demo.sims.checkout.expiry' | transloco }}
                </span>
                <input
                  class="mt-1 w-full rounded-lg border border-beige bg-cream/60 px-3 py-2 font-mono text-sm text-ink"
                  value="12 / 34"
                  readonly
                />
              </label>
              <label class="block">
                <span class="font-mono text-[10px] uppercase tracking-[0.18em] text-slate2">
                  CVC
                </span>
                <input
                  class="mt-1 w-full rounded-lg border border-beige bg-cream/60 px-3 py-2 font-mono text-sm text-ink"
                  value="123"
                  readonly
                />
              </label>
            </div>
            <label class="mt-3 block">
              <span class="font-mono text-[10px] uppercase tracking-[0.18em] text-slate2">
                {{ 'demo.sims.checkout.cardholder' | transloco }}
              </span>
              <input
                class="mt-1 w-full rounded-lg border border-beige bg-cream/60 px-3 py-2 text-sm text-ink"
                value="Demo Brand Sp. z o.o."
                readonly
              />
            </label>
            <!-- the note sits above the button: on a phone the guide's pill lands
                 under the button, and words there would be words it covers -->
            <p class="mt-4 text-center text-[11px] text-slate2">
              {{ 'demo.sims.checkout.testCardNote' | transloco }}
            </p>
            <button
              type="submit"
              data-testid="checkout-sim-pay"
              class="mb-4 mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#635bff] px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#5851e6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b4b0ff]"
            >
              <mat-icon class="!h-4 !w-4 !text-base">lock</mat-icon>
              {{ 'demo.sims.checkout.pay' | transloco: { price: price() } }}
            </button>
          </form>
        </div>
      </div>
    </app-world-sim-shell>
  `,
})
export class CheckoutSimComponent {
  private readonly director = inject(SandboxDirectorService);

  /** The tier the dialog asked for — the upgrade fixture leaves it for us. */
  readonly plan = signal<string>(
    (typeof sessionStorage !== 'undefined' && sessionStorage.getItem(DEMO_CHECKOUT_KEY)) ||
      'ENTERPRISE',
  );
  readonly planName = () => this.plan().charAt(0) + this.plan().slice(1).toLowerCase();
  readonly price = () => PRICES[this.plan()] ?? PRICES['ENTERPRISE'];

  /** The successful-payment webhook, played by hand. */
  pay(): void {
    sessionStorage.setItem(DEMO_PLAN_KEY, this.plan());
    announce(SUBSCRIPTION_CHANGED);
    const step = this.director.step();
    if (step) this.director.notify(step.id);
  }
}
