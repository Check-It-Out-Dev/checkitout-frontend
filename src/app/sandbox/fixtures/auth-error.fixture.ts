import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { AuthErrorComponent } from '../../feature/auth/auth-error/auth-error.component';
import type { SandboxFixture } from '../sandbox-registry';

/** /auth/error fixtures — both query-param branches are init-reachable. */

function routeWithError(error: string | null): ActivatedRoute {
  return {
    snapshot: { queryParamMap: convertToParamMap(error ? { error } : {}) },
  } as unknown as ActivatedRoute;
}

export const AUTH_ERROR_FIXTURES: readonly SandboxFixture[] = [
  {
    id: 'auth-error-generic',
    label: 'Auth error · generic failure (expired action link)',
    component: AuthErrorComponent,
    providers: [{ provide: ActivatedRoute, useValue: routeWithError(null) }],
  },
  {
    id: 'auth-error-consent-required',
    label: 'Auth error · consent_required branch',
    component: AuthErrorComponent,
    providers: [{ provide: ActivatedRoute, useValue: routeWithError('consent_required') }],
  },
];
