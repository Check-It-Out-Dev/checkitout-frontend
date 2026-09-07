import { ChangeDetectionStrategy, Component } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { TranslocoModule } from '@ngneat/transloco';
import { SCENARIOS } from '../../../core/demo/scenario-registry';
import { SURVEY_CHAPTERS } from '../../survey/ui/chapter-registry';

interface TeamMember {
  /** Proper nouns and titles — identical across languages, so literals. */
  readonly name: string;
  readonly role: string;
  readonly photo: string;
  readonly linkedin: string;
}

/**
 * OSS story — the landing's "demo showcase" section (ported from the legacy
 * feature/demo build, where it sits directly under the hero and doubles as
 * the teaser for BOTH guided journeys). Four beats in one section:
 *
 *   1. The announcement — backend public on GitHub under MIT, with the
 *      business-turned-OSS story and the live pentest trust line (WCSS /
 *      WRO4digITal — real engagement, hence the pulsing dot).
 *   2. Two equal journey cards — technical survey (chapter mini-index from
 *      SURVEY_CHAPTERS) and interactive demo (sandbox mini-index from
 *      SCENARIOS). The registries are the single source of truth; the minis
 *      stay in lock-step with the hubs they tease.
 *   3. The team — three people, three LinkedIn profiles, one honest note.
 *
 * All copy ships from the long-staged `landing.oss.*` corpus (already in
 * both language files). Deep links: /technical-survey/<path> per chapter,
 * /demo?start=<key> per sandbox — in the demo build the tour starts
 * immediately; in other builds the links land on the hubs.
 */
@Component({
  selector: 'app-oss-story-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIconModule, RouterLink, TranslocoModule],
  template: `
    <section
      id="demo-showcase"
      data-testid="landing-oss"
      class="relative overflow-hidden bg-white px-4 py-16 md:py-24"
    >
      <div class="oss-grid pointer-events-none absolute inset-0" aria-hidden="true"></div>

      <div class="relative mx-auto max-w-6xl">
        <!-- 1 · the announcement -->
        <span class="eyebrow" data-testid="landing-oss-eyebrow">
          {{ 'landing.oss.eyebrow' | transloco }}
        </span>
        <h2 class="font-display mt-4 max-w-4xl text-4xl leading-tight text-ink sm:text-5xl">
          {{ 'landing.oss.title' | transloco }}
        </h2>

        <div class="mt-6 flex flex-wrap items-center gap-3">
          @for (repo of repos; track repo.key) {
            <a
              [href]="repo.href"
              target="_blank"
              rel="noopener noreferrer"
              class="inline-flex items-center gap-2 rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-cream transition-colors hover:bg-navy-600"
              [attr.data-testid]="'landing-oss-github-' + repo.key"
            >
              <svg viewBox="0 0 16 16" class="h-4 w-4 fill-current" aria-hidden="true">
                <path
                  d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z"
                />
              </svg>
              {{ 'landing.oss.' + repo.labelKey | transloco }}
            </a>
          }
          <span
            class="inline-flex items-center rounded-full border border-beige bg-cream px-3.5 py-1.5 font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-slate2"
          >
            {{ 'landing.oss.mit' | transloco }}
          </span>
        </div>

        <p class="mt-6 max-w-3xl text-lg leading-relaxed text-slate2">
          {{ 'landing.oss.story' | transloco }}
        </p>

        <!-- independent security audit — completed result panel -->
        <div
          class="mt-5 max-w-3xl rounded-xl border border-beige bg-cream/70 p-5"
          data-testid="landing-oss-pentest"
        >
          <div class="flex flex-wrap items-center gap-x-3 gap-y-2">
            <span
              class="inline-flex items-center gap-2 text-sm font-semibold text-ink"
              data-testid="landing-oss-pentest-status"
            >
              <mat-icon class="!h-5 !w-5 shrink-0 !text-xl text-emerald-600" aria-hidden="true">
                verified_user
              </mat-icon>
              {{ 'landing.oss.security.eyebrow' | transloco }}
            </span>
            <span
              class="inline-flex items-center rounded-full bg-emerald-100 px-3 py-1 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-800"
              data-testid="landing-oss-pentest-rating"
            >
              {{ 'landing.oss.security.rating' | transloco }}
            </span>
          </div>

          <p class="mt-3 text-sm leading-relaxed text-slate2">
            {{ 'landing.oss.pentest' | transloco }}
          </p>

          <!-- severity breakdown — every finding shown, honestly -->
          <div class="mt-4 flex flex-wrap gap-2" data-testid="landing-oss-pentest-severities">
            @for (s of pentestSeverities; track s.key) {
              <span
                class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[11px] font-medium"
                [class]="s.cls"
              >
                <span class="tabular-nums font-semibold">{{ s.count }}</span>
                {{ 'landing.oss.security.sev.' + s.key | transloco }}
              </span>
            }
          </div>

          <p class="mt-3 flex items-start gap-2 text-sm leading-relaxed text-slate2">
            <mat-icon
              class="!h-4 !w-4 mt-0.5 shrink-0 !text-base text-emerald-600"
              aria-hidden="true"
            >
              task_alt
            </mat-icon>
            {{ 'landing.oss.security.remediated' | transloco }}
          </p>

          <p
            class="mt-3 border-t border-beige/80 pt-3 text-xs leading-relaxed text-slate2/90"
            data-testid="landing-oss-pentest-disclosure"
          >
            {{ 'landing.oss.security.disclosure' | transloco }}
            <a
              href="mailto:security@check-it-out.pl"
              class="font-semibold text-coral-600 transition-colors hover:text-coral-500"
            >
              security&#64;check-it-out.pl
            </a>
          </p>
        </div>

        <p class="mt-8 max-w-3xl text-slate2">{{ 'landing.oss.invite' | transloco }}</p>

        <!-- 2 · the two journeys -->
        <div class="mt-8 grid gap-5 lg:grid-cols-2">
          <!-- survey card -->
          <article
            class="flex flex-col rounded-2xl border border-beige bg-cream/60 p-6 md:p-7"
            data-testid="landing-oss-survey-card"
          >
            <span
              class="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-coral-600"
            >
              {{ 'landing.oss.survey.tag' | transloco }}
            </span>
            <h3 class="font-display mt-3 text-2xl text-ink">
              {{ 'landing.oss.survey.title' | transloco }}
            </h3>
            <p class="mt-3 text-sm leading-relaxed text-slate2">
              {{ 'landing.oss.survey.p1' | transloco }}
            </p>
            <p class="mt-2.5 text-sm leading-relaxed text-slate2">
              {{ 'landing.oss.survey.p2' | transloco }}
            </p>

            <div
              class="mt-5 font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-slate2/80"
            >
              {{ 'landing.oss.survey.browse' | transloco }}
            </div>
            <ul class="mt-2 flex-grow divide-y divide-beige/80">
              @for (c of chapters; track c.key) {
                <li>
                  <a
                    [routerLink]="['/technical-survey', c.path]"
                    class="group flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-white"
                  >
                    <span class="select-none text-lg leading-none" aria-hidden="true">
                      {{ c.emoji }}
                    </span>
                    <span class="min-w-0 flex-grow">
                      <span class="block text-sm font-semibold text-ink sm:truncate">
                        {{ 'landing.survey.chapters.' + c.key + '.name' | transloco }}
                      </span>
                      <span class="block text-xs text-slate2 sm:truncate">
                        {{ 'landing.survey.chapters.' + c.key + '.question' | transloco }}
                      </span>
                    </span>
                    <span class="shrink-0 font-mono text-[10px] tabular-nums text-slate2/70">
                      {{
                        'landing.survey.hub.meta'
                          | transloco: { cards: c.cards, minutes: c.minutes }
                      }}
                    </span>
                    <mat-icon
                      class="!h-4 !w-4 shrink-0 !text-base text-coral-500 transition-transform duration-300 group-hover:translate-x-0.5"
                    >
                      arrow_forward
                    </mat-icon>
                  </a>
                </li>
              }
            </ul>

            <div class="mt-5">
              <a
                routerLink="/technical-survey"
                class="cta-primary"
                data-testid="landing-oss-survey-cta"
              >
                {{ 'landing.oss.survey.cta' | transloco }}
              </a>
            </div>
          </article>

          <!-- demo card -->
          <article
            class="flex flex-col rounded-2xl border border-beige bg-cream/60 p-6 md:p-7"
            data-testid="landing-oss-demo-card"
          >
            <span
              class="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-coral-600"
            >
              {{ 'landing.oss.demo.tag' | transloco }}
            </span>
            <h3 class="font-display mt-3 text-2xl text-ink">
              {{ 'landing.oss.demo.title' | transloco }}
            </h3>
            <p class="mt-3 text-sm leading-relaxed text-slate2">
              {{ 'landing.oss.demo.p1' | transloco }}
            </p>
            <p class="mt-2.5 text-sm leading-relaxed text-slate2">
              {{ 'landing.oss.demo.p2' | transloco }}
            </p>

            <div
              class="mt-5 font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-slate2/80"
            >
              {{ 'landing.oss.demo.browse' | transloco }}
            </div>
            <ul class="mt-2 flex-grow divide-y divide-beige/80">
              @for (s of sandboxes; track s.key) {
                <li>
                  <a
                    routerLink="/demo"
                    [queryParams]="{ start: s.key }"
                    class="group flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-white"
                  >
                    <span class="select-none text-lg leading-none" aria-hidden="true">
                      {{ s.emoji }}
                    </span>
                    <span class="min-w-0 flex-grow">
                      <span class="block text-sm font-semibold text-ink sm:truncate">
                        {{ 'demo.sandboxes.' + s.key + '.title' | transloco }}
                      </span>
                    </span>
                    <span
                      class="inline-flex shrink-0 items-center rounded-full px-2 py-0.5 font-mono text-[9px] font-medium uppercase tracking-[0.16em]"
                      [class]="roleCls[s.role]"
                    >
                      {{ 'demo.hub.roles.' + s.role | transloco }}
                    </span>
                    <span class="shrink-0 font-mono text-[10px] tabular-nums text-slate2/70">
                      ~{{ s.minutes }} min
                    </span>
                    <mat-icon
                      class="!h-4 !w-4 shrink-0 !text-base text-coral-500 transition-transform duration-300 group-hover:translate-x-0.5"
                    >
                      arrow_forward
                    </mat-icon>
                  </a>
                </li>
              }
            </ul>

            <div class="mt-5">
              <a routerLink="/demo" class="cta-primary" data-testid="landing-oss-demo-cta">
                {{ 'landing.oss.demo.cta' | transloco }}
              </a>
            </div>
          </article>
        </div>

        <!-- 3 · the team -->
        <div class="mt-14">
          <h3 class="font-display text-2xl text-ink">
            {{ 'landing.oss.team.heading' | transloco }}
          </h3>
          <div class="mt-6 grid gap-5 sm:grid-cols-3" data-testid="landing-oss-team">
            @for (m of team; track m.name) {
              <div
                class="flex items-center gap-4 rounded-2xl border border-beige bg-white p-4 shadow-sm"
              >
                <!-- Not lazy: three 56px avatars save nothing worth having, and
                     deferring them is the only way they can fail to appear at
                     all — a lazy image whose load never fires renders as a
                     broken icon next to the person's name. -->
                <img
                  [src]="m.photo"
                  [alt]="m.name"
                  width="56"
                  height="56"
                  decoding="async"
                  class="h-14 w-14 shrink-0 rounded-full border border-beige object-cover"
                />
                <div class="min-w-0">
                  <div class="truncate text-sm font-bold text-ink">{{ m.name }}</div>
                  <div class="truncate text-xs text-slate2">{{ m.role }}</div>
                  <a
                    [href]="m.linkedin"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="mt-1 inline-flex items-center gap-1.5 text-xs font-semibold text-coral-600 transition-colors hover:text-coral-500"
                  >
                    <svg viewBox="0 0 16 16" class="h-3.5 w-3.5 fill-current" aria-hidden="true">
                      <path
                        d="M12.68 12.68h-2.37V8.96c0-.89-.02-2.03-1.24-2.03-1.24 0-1.43.97-1.43 1.96v3.79H5.27V5.03h2.28v1.05h.03c.32-.6 1.09-1.24 2.25-1.24 2.4 0 2.85 1.58 2.85 3.64v4.2ZM2.6 3.98a1.38 1.38 0 1 1 0-2.75 1.38 1.38 0 0 1 0 2.75Zm1.19 8.7H1.41V5.03h2.38v7.65ZM13.86 0H1.32C.59 0 0 .58 0 1.29v13.42C0 15.42.59 16 1.32 16h12.54c.73 0 1.32-.58 1.32-1.29V1.29C15.18.58 14.59 0 13.86 0Z"
                      />
                    </svg>
                    {{ 'landing.oss.team.linkedin' | transloco }}
                  </a>
                </div>
              </div>
            }
          </div>
          <p class="mt-5 text-sm text-slate2">{{ 'landing.oss.team.note' | transloco }}</p>
        </div>
      </div>
    </section>
  `,
  styles: [
    `
      /* Preflight is off in this app; the landing page removes the user-agent
         margins on headings, paragraphs and lists, and this section renders
         inside it with its own encapsulation, so it does the same. */
      h1,
      h2,
      h3,
      p,
      ul,
      ol {
        margin: 0;
      }
      /* The prose here runs in paragraph pairs; a paragraph following a
         paragraph gets one line of air — the gap the user agent used to give
         every paragraph, now given on purpose to the ones that need it. */
      p + p {
        margin-top: 1em;
      }

      /* Blueprint grid substrate — the same restrained texture the survey and
         demo hubs stand on, so the teaser reads as a doorway to them. */
      .oss-grid {
        background-image:
          linear-gradient(to right, rgba(14, 17, 22, 0.04) 1px, transparent 1px),
          linear-gradient(to bottom, rgba(14, 17, 22, 0.04) 1px, transparent 1px);
        background-size: 32px 32px;
        -webkit-mask-image: radial-gradient(ellipse 70% 55% at 50% 30%, #000 30%, transparent 100%);
        mask-image: radial-gradient(ellipse 70% 55% at 50% 30%, #000 30%, transparent 100%);
      }
    `,
  ],
})
export class OssStorySectionComponent {
  readonly chapters = SURVEY_CHAPTERS;
  readonly sandboxes = SCENARIOS;

  /**
   * The WRO4digITal pentest disposition (report: 0 Critical / 1 High / 5
   * Medium / 3 Low / 2 Info, posture "above average"). Shown honestly —
   * every finding is on the panel; the "all closed" line covers fixed,
   * risk-accepted-by-design, and deferred-with-plan. Full audit trail:
   * checkitout-backend/docs/security/pentest-remediation-2026-09.md.
   */
  readonly pentestSeverities = [
    { key: 'high', count: 1, cls: 'bg-amber-100 text-amber-800' },
    { key: 'medium', count: 5, cls: 'bg-amber-50 text-amber-700' },
    { key: 'low', count: 3, cls: 'bg-navy-50 text-navy-600' },
    { key: 'info', count: 2, cls: 'bg-slate-100 text-slate-600' },
  ] as const;

  /**
   * The MIT family. The backend and the method are public today; the
   * greenfield frontend repo goes public with the v1.0 cutover — the link
   * ships now so the story is complete on day one (owner decision
   * 2026-09-02: the rewrite is entirely ours, so the whole stack lands
   * under MIT).
   */
  readonly repos = [
    {
      key: 'backend',
      labelKey: 'githubBackend',
      href: 'https://github.com/Check-It-Out-Dev/checkitout-backend',
    },
    {
      key: 'frontend',
      labelKey: 'githubFrontend',
      href: 'https://github.com/Check-It-Out-Dev/checkitout-frontend',
    },
    {
      key: 'method',
      labelKey: 'githubMethod',
      href: 'https://github.com/Check-It-Out-Dev/graph-theory-system-modeling',
    },
  ] as const;

  /** Same role palette as the demo hub — the minis tease the same cards. */
  readonly roleCls: Record<string, string> = {
    COMPANY: 'bg-coral-50 text-coral-700',
    INFLUENCER: 'bg-navy-50 text-navy-500',
    ADMIN: 'bg-amber-100 text-amber-800',
  };

  readonly team: TeamMember[] = [
    {
      name: 'Norbert Marchewka',
      role: 'Full Stack Developer',
      photo: 'assets/images/team/norbert.jpg',
      linkedin: 'https://www.linkedin.com/in/norbert-marchewka-292377129/',
    },
    {
      name: 'Jakub Sadowski',
      role: 'Backend Developer & QA',
      photo: 'assets/images/team/jakub.jpg',
      linkedin: 'https://www.linkedin.com/in/jakub-sadowski-33205995/',
    },
    {
      name: 'Piotr Żmudzki',
      role: 'Software Developer',
      photo: 'assets/images/team/piotr.jpg',
      linkedin: 'https://www.linkedin.com/in/piotr-%C5%BCmudzki-89a857278/',
    },
  ];
}
