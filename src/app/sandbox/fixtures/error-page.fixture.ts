import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { of } from 'rxjs';
import { ErrorPageComponent } from '../../feature/error-page/error-page.component';
import type { SandboxFixture } from '../sandbox-registry';

function routeFor(type: string): unknown {
  return { paramMap: of(convertToParamMap({ type })) };
}

export const ERROR_PAGE_FIXTURES: readonly SandboxFixture[] = [
  {
    id: 'error-page-404',
    label: 'Error page · 404 (iter-54 P0 #8)',
    component: ErrorPageComponent,
    providers: [{ provide: ActivatedRoute, useValue: routeFor('404') }],
  },
  {
    id: 'error-page-500',
    label: 'Error page · 500',
    component: ErrorPageComponent,
    providers: [{ provide: ActivatedRoute, useValue: routeFor('500') }],
  },
  {
    id: 'error-page-503',
    label: 'Error page · 503 with health re-probe',
    component: ErrorPageComponent,
    providers: [{ provide: ActivatedRoute, useValue: routeFor('503') }],
  },
];
