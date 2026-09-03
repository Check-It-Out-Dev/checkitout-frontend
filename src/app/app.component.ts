import { Component, afterNextRender, inject, ChangeDetectionStrategy } from '@angular/core';
import { RouterOutlet } from '@angular/router';
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
    // iter-107 deep-link guard: index.html hides the prerendered landing
    // markup on non-"/" paths (static hosts serve that HTML everywhere);
    // once the client router has rendered the real page, unhide.
    afterNextRender(() => document.documentElement.classList.remove('csr-deep-link'));

    if (this.demo) {
      // The demo persona is signed in by definition, but public-capable
      // surfaces (support centre) read the session CACHE only — a cold
      // deep-link would greet the persona as anonymous. Warm the cache
      // once at boot; the demo interceptor answers /users/me instantly.
      inject(SessionStateService).probe().subscribe();
    }
  }
}
