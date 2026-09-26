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
import { MAT_DIALOG_DATA, MatDialog, MatDialogRef } from '@angular/material/dialog';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { findFixture, type SandboxFixture } from './sandbox-registry';

/**
 * Renders a single fixture from the registry. Reads `:id` from the route, looks
 * up the fixture, instantiates the target component, and assigns inputs.
 *
 * Snapshot tests target this component at URL `/__sandbox/<id>`. The host
 * applies the fixture viewport (width/height) so the screenshot is byte-stable.
 * Dialog fixtures (`frame: 'dialog'`) open through the real `MatDialog`, so
 * the baseline carries the surface, padding, backdrop and `mat-dialog-*`
 * layout the user actually sees — a bare dialog component has none of them
 * (the container's styles are registered only once a container exists).
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
          <p class="text-slate-500 mb-4" data-testid="sandbox-missing-id">{{ fixtureId() }}</p>
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
  private readonly dialog = inject(MatDialog);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  private currentRef?: ComponentRef<unknown>;
  private currentDialog?: MatDialogRef<unknown>;

  readonly params = toSignal(this.route.params, { initialValue: this.route.snapshot.params });
  /** The `:id` route param as a string (`''` when absent) — never the params object. */
  readonly fixtureId = computed(() => {
    const params = this.params();
    const id =
      typeof params === 'object' && params !== null
        ? (params as Record<string, unknown>)['id']
        : undefined;
    return typeof id === 'string' ? id : '';
  });
  readonly fixture = computed(() => {
    const id = this.fixtureId();
    return id ? findFixture(id) : undefined;
  });
  readonly notFound = computed(() => !this.fixture());

  readonly hostStyle = computed(() => {
    const f = this.fixture();
    const v = f?.viewport;
    if (!v || f?.frame === 'dialog') return '';
    // min(): a 1280-wide fixture lays out at phone width on the mobile
    // project instead of overflowing the device viewport and being clipped.
    return `width:min(${v.width}px,100%);height:${v.height}px;overflow:auto;`;
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
        this.teardown();
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
        if (f.frame === 'dialog') {
          this.openDialog(f, childInjector);
          return;
        }
        const ref = this.outlet.createComponent(f.component, { injector: childInjector });
        this.assignInputs(ref.instance, f);
        ref.changeDetectorRef.detectChanges();
        this.currentRef = ref;
      });
    });
  }

  private openDialog(f: SandboxFixture, childInjector: Injector): void {
    const ref = this.dialog.open(f.component, {
      injector: childInjector,
      data: childInjector.get(MAT_DIALOG_DATA, null),
      width: f.viewport ? `${f.viewport.width}px` : undefined,
      hasBackdrop: true,
      disableClose: true,
      // No programmatic focus: a focus ring on the first button would vary
      // the baseline with the browser's focus-visible heuristics.
      autoFocus: false,
      restoreFocus: false,
    });
    this.assignInputs(ref.componentInstance, f);
    this.currentDialog = ref;
  }

  private assignInputs(instance: unknown, f: SandboxFixture): void {
    if (!f.inputs || !instance) return;
    for (const [key, value] of Object.entries(f.inputs)) {
      (instance as Record<string, unknown>)[key] = value;
    }
  }

  private teardown(): void {
    this.currentRef?.destroy();
    this.currentRef = undefined;
    this.currentDialog?.close();
    this.currentDialog = undefined;
    this.outlet?.clear();
  }

  ngOnDestroy(): void {
    this.teardown();
  }
}
