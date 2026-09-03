import { Routes } from '@angular/router';

export const SANDBOX_ROUTES: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () => import('./sandbox-index.component').then((m) => m.SandboxIndexComponent),
  },
  {
    path: ':id',
    loadComponent: () => import('./sandbox-host.component').then((m) => m.SandboxHostComponent),
  },
];
