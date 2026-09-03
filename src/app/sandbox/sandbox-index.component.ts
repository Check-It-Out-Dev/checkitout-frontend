import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SANDBOX_REGISTRY } from './sandbox-registry';

/**
 * Sandbox index page — lists every registered fixture with a link to its
 * harness URL. Visited at `/__sandbox`. Doubles as the entry point for
 * Playwright snapshot iteration during local dev.
 */
@Component({
  selector: 'app-sandbox-index',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    <section class="p-6">
      <h1 class="text-2xl font-semibold mb-1">Sandbox</h1>
      <p class="text-slate-500 mb-4 text-sm">
        Per-component visual harness. {{ fixtures.length }} fixtures registered.
      </p>
      <ul class="space-y-1">
        @for (f of fixtures; track f.id) {
          <li>
            <a [routerLink]="['/__sandbox', f.id]" class="text-blue-600 hover:underline">
              {{ f.label }}
            </a>
            <code class="text-xs text-slate-400 ml-2">{{ f.id }}</code>
          </li>
        }
      </ul>
    </section>
  `,
})
export class SandboxIndexComponent {
  readonly fixtures = SANDBOX_REGISTRY;
}
