import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ComponentRef,
  Injector,
  OnDestroy,
  PLATFORM_ID,
  ViewChild,
  ViewContainerRef,
  computed,
  effect,
  inject,
  untracked,
} from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { findFixture } from './sandbox-registry';

/**
 * Renders a single fixture from the registry. Reads `:id` from the route, looks
 * up the fixture, instantiates the target component, and assigns inputs.
 *
 * Snapshot tests target this component at URL `/__sandbox/<id>`. The host
 * applies the fixture viewport (width/height) so the screenshot is byte-stable.
 */
@Component({
  selector: 'app-sandbox-host',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    <div class="sandbox-host" [style]="hostStyle()">
      @if (notFound()) {
        <div class="p-6 text-center">
          <h1 class="text-xl font-semibold mb-2">Fixture not found</h1>
          <p class="text-slate-500 mb-4">{{ id() }}</p>
          <a routerLink="/__sandbox" class="text-blue-600 underline">← Back to index</a>
        </div>
      }
      <div #outlet></div>
    </div>
  `,
  styles: `
    .sandbox-host {
      display: block;
    }
  `,
})
export class SandboxHostComponent implements OnDestroy {
  @ViewChild('outlet', { read: ViewContainerRef, static: true })
  outlet!: ViewContainerRef;

  private readonly route = inject(ActivatedRoute);
  private readonly injector = inject(Injector);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  private currentRef?: ComponentRef<unknown>;

  readonly id = toSignal(this.route.params, { initialValue: this.route.snapshot.params });
  readonly fixture = computed(() => {
    const params = this.id();
    const id =
      typeof params === 'object' && params !== null
        ? (params as Record<string, string>)['id']
        : undefined;
    return id ? findFixture(id) : undefined;
  });
  readonly notFound = computed(() => !this.fixture());

  readonly hostStyle = computed(() => {
    const v = this.fixture()?.viewport;
    return v ? `width:${v.width}px;height:${v.height}px;overflow:auto;` : '';
  });

  constructor() {
    effect(() => {
      const f = this.fixture();
      // Instantiation, input assignment and the first CD pass run OUTSIDE the
      // reactive context: an @Input setter (or a lifecycle hook) that writes a
      // signal would otherwise throw NG0600 and the fixture would silently
      // render blank — the visual tier then baselines an empty page. Caught
      // 2026-09-02 by the cookie-banner-expanded fixture (startExpanded setter
      // calls expanded.set()). untracked() also stops the effect from picking
      // up accidental dependencies on fixture internals.
      untracked(() => {
        this.currentRef?.destroy();
        this.currentRef = undefined;
        this.outlet?.clear();
        // Browser-only: fixtures created here dynamically do not take part in
        // hydration, so an SSR'd fixture subtree gets adopted as inert DOM —
        // no __ngContext__, no listeners; reactive-forms fixtures then look
        // rendered but never react (sign-in/preferences/profile, 2026-09-02).
        // Skipping the server pass makes the client render the live tree.
        if (!f || !this.isBrowser) return;

        const childInjector = Injector.create({
          providers: [...(f.providers ?? [])],
          parent: this.injector,
        });
        const ref = this.outlet.createComponent(f.component, { injector: childInjector });
        if (f.inputs) {
          for (const [key, value] of Object.entries(f.inputs)) {
            (ref.instance as Record<string, unknown>)[key] = value;
          }
        }
        ref.changeDetectorRef.detectChanges();
        this.currentRef = ref;
      });
    });
  }

  ngOnDestroy(): void {
    this.currentRef?.destroy();
  }
}
