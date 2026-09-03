import { Component, Input, ChangeDetectionStrategy } from '@angular/core';

/**
 * Canonical card surface for every technical-survey showcase — the greenfield
 * white-card-on-cream pattern (landing feature cards), so all showcases share
 * ONE container. The optional category eyebrow is a mono coral pill; the
 * heading speaks the editorial display serif.
 *
 * Usage:
 *   <app-survey-card tag="INFRA"
 *     [title]="'landing.survey.x.title' | transloco"
 *     [subtitle]="'landing.survey.x.subtitle' | transloco">
 *     …body…
 *   </app-survey-card>
 */
@Component({
  selector: 'app-survey-card',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <div class="rounded-2xl border border-beige bg-white p-6 shadow-sm sm:p-8">
      @if (tag) {
        <div class="mb-3">
          <span
            class="inline-flex items-center rounded-full bg-coral-50 px-3 py-1 font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-coral-600"
          >
            {{ tag }}
          </span>
        </div>
      }
      <!-- h2: cards sit directly under the page h1 (chapter question / hub hero) -->
      @if (title) {
        <h2 class="font-display text-2xl text-ink">{{ title }}</h2>
      }
      @if (subtitle) {
        <p class="mt-2 leading-relaxed text-slate2">{{ subtitle }}</p>
      }
      <ng-content></ng-content>
    </div>
  `,
})
export class SurveyCardComponent {
  /** Optional uppercase category eyebrow (e.g. "INFRA"). Omit for plain cards. */
  @Input() tag?: string;
  /** Card heading. */
  @Input() title?: string;
  /** Lead paragraph under the heading. */
  @Input() subtitle?: string;
}
