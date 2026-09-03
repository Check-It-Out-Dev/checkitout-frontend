import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { ActionRouterComponent } from '../../feature/auth/action-router/action-router.component';
import type { SandboxFixture } from '../sandbox-registry';

const STUB_ROUTE_UNKNOWN: ActivatedRoute = {
  snapshot: {
    queryParamMap: convertToParamMap({ mode: 'recoverEmail' }),
  },
} as unknown as ActivatedRoute;

export const ACTION_ROUTER_FIXTURES: readonly SandboxFixture[] = [
  {
    id: 'action-router-unknown-mode',
    label: 'Action router · unknown mode (error panel)',
    component: ActionRouterComponent,
    providers: [{ provide: ActivatedRoute, useValue: STUB_ROUTE_UNKNOWN }],
  },
];
