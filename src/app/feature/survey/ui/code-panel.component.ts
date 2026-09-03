import { Component, Input, ChangeDetectionStrategy } from '@angular/core';
import { beFileUrl } from './survey-links';

/**
 * Dark terminal / code panel primitive — traffic-light header plus a
 * monospace <pre><code> body, shared across the showcases. The dark surface
 * is intentional on the cream product canvas: it reads as "real infra" (the
 * one place a dark panel belongs). Ink-900 matches the auth welcome panel.
 *
 * Project the code text as content; pass the file/label via [file]. Optional
 * `path` makes the label a link into the public backend repo (BE_REPO_URL).
 * Optional `panelMeta` slot for a right-aligned header badge.
 *
 *   <app-code-panel file="nginx.conf" path="deployment/config/nginx-refactored/nginx.conf">{{ snippet }}</app-code-panel>
 */
@Component({
  selector: 'app-code-panel',
  standalone: true,
  template: `
    <div class="overflow-hidden rounded-xl bg-navy-900 shadow-sm">
      <div class="flex items-center gap-1.5 border-b border-white/5 px-4 py-2.5">
        <span class="h-2.5 w-2.5 rounded-full bg-coral-400/80"></span>
        <span class="h-2.5 w-2.5 rounded-full bg-amber-400/80"></span>
        <span class="h-2.5 w-2.5 rounded-full bg-emerald-400/80"></span>
        @if (file && path) {
          <a
            [href]="href"
            target="_blank"
            rel="noopener"
            class="ml-2 font-mono text-[11px] text-cream/50 underline decoration-cream/25 underline-offset-2 transition-colors hover:text-cream/90"
          >
            {{ file }}
          </a>
        }
        @if (file && !path) {
          <span class="ml-2 font-mono text-[11px] text-cream/50">{{ file }}</span>
        }
        <ng-content select="[panelMeta]"></ng-content>
      </div>
      <pre
        class="overflow-x-auto p-4 text-[11px] leading-relaxed text-cream/80"
      ><code><ng-content></ng-content></code></pre>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: [
    `
      :host {
        display: block;
      }
    `,
  ],
})
export class CodePanelComponent {
  /** Mono filename/label shown in the panel chrome. */
  @Input() file?: string;

  /** Repo-relative path; when set, the label links into the backend repo. */
  @Input() path?: string;

  get href(): string {
    return beFileUrl(this.path ?? '');
  }
}
