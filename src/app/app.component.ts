import {
  Component,
  DOCUMENT,
  afterNextRender,
  inject,
  ChangeDetectionStrategy,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterOutlet } from '@angular/router';
import { TranslocoService } from '@ngneat/transloco';
import { DemoGuideComponent } from './feature/demo/demo-guide.component';
import { SessionStateService } from './core/auth/session-state.service';
import { isDemoMode } from './core/demo/demo-mode';

/**
 * Top-level shell. Just a `<router-outlet />` — each route in `app.routes.ts`
 * decides whether to wrap in `LayoutComponent` (auth/public/authenticated
 * sections) or render bare (sandbox, error pages). This way the sandbox
 * harness doesn't inherit the layout chrome (sidenav, toolbar, cookie
 * banner) which lets fixtures snapshot their target component cleanly.
 */
@Component({
  selector: 'app-root',
  imports: [RouterOutlet, DemoGuideComponent],
  // The demo guide overlay mounts app-wide in the DEMO build only — it
  // narrates the guided tours over every route the scenarios visit. In
  // normal builds the @if strips it (isDemoMode is a build-time constant,
  // so the demo chunk tree-shakes out of production bundles).
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <router-outlet />
    @if (demo) {
      <app-demo-guide />
    }
  `,
})
export class AppComponent {
  readonly demo = isDemoMode();
  constructor() {
    // `<html lang>` follows the active language. index.html shipped it as
    // "en" for a Polish UI and nothing wrote it on a switch, so screen
    // readers and search engines saw the wrong language. langChanges$ is a
    // BehaviorSubject: the attribute is right from the first render, on the
    // server too.
    const doc = inject(DOCUMENT);
    inject(TranslocoService)
      .langChanges$.pipe(takeUntilDestroyed())
      .subscribe((lang) => (doc.documentElement.lang = lang));

    // iter-107 deep-link guard: index.html hides the prerendered landing
    // markup on non-"/" paths (static hosts serve that HTML everywhere);
    // once the client router has rendered the real page, unhide.
    afterNextRender(() => document.documentElement.classList.remove('csr-deep-link'));

    if (this.demo) {
      // Public-capable surfaces (support centre) read the session CACHE
      // only — a cold deep-link would greet a signed-in persona as
      // anonymous. Warm the cache once at boot; the demo interceptor
      // answers /users/me instantly (null while the persona is signed out,
      // which SessionState caches without an error or a redirect).
      inject(SessionStateService).probe().subscribe();
    }
  }
}
