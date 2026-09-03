import { CookieBannerComponent } from '../../shared/components/cookie-banner/cookie-banner.component';
import type { SandboxFixture } from '../sandbox-registry';

/**
 * Cookie banner fixture. Only one variant — visibility is controlled by
 * `localStorage['cio.consent.v1']` which Playwright manipulates per-test
 * via `page.addInitScript`. DI overrides on `providedIn: 'root'` services
 * fall through to the root injector inside the sandbox host, so the
 * fixture provider pattern doesn't bind the way it does for plain
 * services. Manipulating localStorage directly is the clean win.
 */
export const COOKIE_BANNER_FIXTURES: readonly SandboxFixture[] = [
  {
    id: 'cookie-banner',
    label: 'Cookie banner',
    component: CookieBannerComponent,
  },
  {
    id: 'cookie-banner-expanded',
    label: 'Cookie banner · customize panel (3 GDPR categories)',
    component: CookieBannerComponent,
    inputs: { startExpanded: true },
  },
];
