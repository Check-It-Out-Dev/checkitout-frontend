import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@ngneat/transloco';

interface CollabCampaign {
  readonly id: string;
  readonly icon: string;
  readonly accent: 'rose' | 'emerald' | 'sky';
}

interface CollabRequest {
  readonly campaignId: string;
  readonly note: string;
  readonly at: string;
}

const STORAGE_KEY = 'demoCollabRequests';
const MAX_REQUESTS = 20;

/**
 * /demo/collaborate — the "collaborate straight from the card" vignette
 * (ported from the legacy feature/demo build). The influencer-side pitch:
 * a campaign card IS the entry point — no separate forms to hunt for.
 *
 * The dark inverse of the marketing pages on purpose (navy-900 canvas):
 * the visitor plays a DIFFERENT persona here, and the palette flip makes
 * the role switch legible. Proposals persist to localStorage only (cap
 * 20) — the honesty line under the list says exactly that. Campaign
 * content reuses the landing's campaign_examples corpus, so the cards
 * here and on the landing never drift apart.
 */
@Component({
    selector: 'app-collab-hero',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [MatIconModule, RouterLink, TranslocoPipe],
    template: `
    <div class="min-h-screen bg-navy-900 px-4 py-10 text-cream antialiased md:px-8">
      <div class="mx-auto max-w-5xl">
        <!-- top bar: back + persona chip -->
        <div class="flex flex-wrap items-center justify-between gap-3">
          <a
            routerLink="/"
            class="inline-flex items-center gap-1.5 text-sm font-medium text-cream/60 transition-colors hover:text-cream"
          >
            <mat-icon class="!h-4 !w-4 !text-base">arrow_back</mat-icon>
            {{ 'landing.collab.back' | transloco }}
          </a>
          <span
            class="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-cream/80"
          >
            <span class="h-1.5 w-1.5 rounded-full bg-coral-400" aria-hidden="true"></span>
            {{ 'landing.collab.viewingAs' | transloco }}
          </span>
        </div>

        <!-- hero -->
        <div class="mt-10 max-w-2xl">
          <h1 class="font-display text-4xl leading-tight md:text-5xl">
            {{ 'landing.collab.title' | transloco }}
          </h1>
          <p class="mt-4 leading-relaxed text-cream/70">
            {{ 'landing.collab.subtitle' | transloco }}
          </p>
        </div>

        <!-- campaign cards — same corpus as the landing examples -->
        <div class="mt-10 grid grid-cols-1 gap-5 md:grid-cols-3">
          @for (c of campaigns; track c.id) {
            <article
              class="flex flex-col gap-3 rounded-2xl bg-white p-6 text-ink shadow-2xl"
              [attr.data-testid]="'collab-campaign-' + c.id"
            >
              <span
                class="flex h-11 w-11 items-center justify-center self-start rounded-xl"
                [class.bg-rose-50]="c.accent === 'rose'"
                [class.bg-emerald-50]="c.accent === 'emerald'"
                [class.bg-sky-50]="c.accent === 'sky'"
              >
                <mat-icon
                  class="!h-6 !w-6 !text-2xl"
                  [class.text-rose-600]="c.accent === 'rose'"
                  [class.text-emerald-600]="c.accent === 'emerald'"
                  [class.text-sky-600]="c.accent === 'sky'"
                >
                  {{ c.icon }}
                </mat-icon>
              </span>
              <span class="font-mono text-[0.6rem] uppercase tracking-[0.18em] text-slate2">
                {{ 'landing.campaign_examples.cards.' + c.id + '.category' | transloco }}
              </span>
              <h2 class="font-display text-xl leading-snug text-ink">
                {{ 'landing.campaign_examples.cards.' + c.id + '.title' | transloco }}
              </h2>
              <p class="flex-grow text-sm leading-relaxed text-slate2">
                {{ 'landing.campaign_examples.cards.' + c.id + '.description' | transloco }}
              </p>
              <dl class="flex flex-col gap-1 border-t border-beige pt-3 text-xs text-slate2">
                <div class="flex justify-between">
                  <dt>{{ 'landing.campaign_examples.cards.compensation_label' | transloco }}</dt>
                  <dd class="font-semibold text-ink">
                    {{
                      'landing.campaign_examples.cards.' + c.id + '.compensation_value' | transloco
                    }}
                  </dd>
                </div>
                <div class="flex justify-between">
                  <dt>{{ 'landing.campaign_examples.cards.location_label' | transloco }}</dt>
                  <dd class="font-semibold text-ink">
                    {{ 'landing.campaign_examples.cards.' + c.id + '.location_value' | transloco }}
                  </dd>
                </div>
              </dl>
              <button
                type="button"
                (click)="open(c.id)"
                class="mt-1 inline-flex items-center justify-center gap-2 rounded-full bg-coral-700 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-coral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-300"
                [attr.data-testid]="'collab-apply-' + c.id"
              >
                {{ 'landing.collab.apply' | transloco }}
                <mat-icon class="!h-4 !w-4 !text-base">handshake</mat-icon>
              </button>
            </article>
          }
        </div>

        <!-- proposal panel — appears for the selected campaign -->
        @if (selected(); as sel) {
          <div
            class="mt-8 rounded-2xl border border-white/10 bg-white/5 p-6"
            data-testid="collab-panel"
          >
            <div class="flex items-center justify-between gap-3">
              <h3 class="font-display text-2xl">{{ 'landing.collab.panelTitle' | transloco }}</h3>
              <span class="font-mono text-[10px] uppercase tracking-[0.16em] text-cream/60">
                {{ 'landing.collab.forCampaign' | transloco }}:
                {{ 'landing.campaign_examples.cards.' + sel + '.title' | transloco }}
              </span>
            </div>
            <textarea
              #noteBox
              rows="3"
              [placeholder]="'landing.collab.notePlaceholder' | transloco"
              class="mt-4 w-full rounded-xl border border-white/15 bg-navy-900/60 p-3.5 text-sm text-cream placeholder:text-cream/40 focus:border-coral-400 focus:outline-none"
              data-testid="collab-note"
            ></textarea>
            <div class="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                (click)="send(sel, noteBox.value); noteBox.value = ''"
                class="inline-flex items-center gap-2 rounded-full bg-coral-700 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-coral-800"
                data-testid="collab-send"
              >
                {{ 'landing.collab.send' | transloco }}
                <mat-icon class="!h-4 !w-4 !text-base">send</mat-icon>
              </button>
              <button
                type="button"
                (click)="selected.set(null)"
                class="inline-flex items-center rounded-full border border-white/15 px-5 py-2 text-sm font-semibold text-cream/80 transition-colors hover:bg-white/10"
              >
                {{ 'landing.collab.cancel' | transloco }}
              </button>
              @if (justSent()) {
                <span
                  class="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-300"
                  data-testid="collab-success"
                >
                  <mat-icon class="!h-4 !w-4 !text-base">check_circle</mat-icon>
                  {{ 'landing.collab.success' | transloco }}
                </span>
              }
            </div>
          </div>
        }

        <!-- sent proposals -->
        <div class="mt-12">
          <h3 class="font-display text-2xl">{{ 'landing.collab.sentTitle' | transloco }}</h3>
          @if (requests().length === 0) {
            <p class="mt-3 text-sm text-cream/60">{{ 'landing.collab.sentEmpty' | transloco }}</p>
          } @else {
            <ul class="mt-4 flex flex-col gap-2.5" data-testid="collab-sent-list">
              @for (r of requests(); track r.at) {
                <li class="flex items-start gap-3 rounded-xl border border-white/10 bg-white/5 p-4">
                  <span class="min-w-0 flex-grow">
                    <span class="block truncate text-sm font-semibold text-cream">
                      {{ 'landing.campaign_examples.cards.' + r.campaignId + '.title' | transloco }}
                    </span>
                    @if (r.note) {
                      <span class="mt-0.5 block text-xs leading-relaxed text-cream/60">
                        {{ r.note }}
                      </span>
                    }
                  </span>
                  <span
                    class="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-emerald-300"
                  >
                    <mat-icon class="!h-3 !w-3 !text-xs">check</mat-icon>
                    {{ 'landing.collab.statusSent' | transloco }}
                  </span>
                </li>
              }
            </ul>
          }
          <p class="mt-5 text-[11px] leading-relaxed text-cream/50">
            {{ 'landing.collab.demoNote' | transloco }}
            <span class="text-cream/40">· {{ 'landing.collab.voiceNote' | transloco }}</span>
          </p>
        </div>
      </div>
    </div>
  `
})
export class CollabHeroComponent {
  /** Same three campaigns the landing showcases — one corpus, two surfaces. */
  readonly campaigns: readonly CollabCampaign[] = [
    { id: 'coffee_shop', icon: 'coffee', accent: 'rose' },
    { id: 'zero_waste', icon: 'eco', accent: 'emerald' },
    { id: 'summer_sports', icon: 'sports_tennis', accent: 'sky' },
  ];

  readonly selected = signal<string | null>(null);
  readonly justSent = signal(false);
  readonly requests = signal<readonly CollabRequest[]>(readRequests());

  open(campaignId: string): void {
    this.justSent.set(false);
    this.selected.set(campaignId);
  }

  send(campaignId: string, note: string): void {
    const next: CollabRequest[] = [
      { campaignId, note: note.trim(), at: new Date().toISOString() },
      ...this.requests(),
    ].slice(0, MAX_REQUESTS);
    this.requests.set(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Storage full or blocked — the in-memory list still shows the send.
    }
    this.justSent.set(true);
  }
}

function readRequests(): readonly CollabRequest[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as CollabRequest[]) : [];
  } catch {
    return [];
  }
}
