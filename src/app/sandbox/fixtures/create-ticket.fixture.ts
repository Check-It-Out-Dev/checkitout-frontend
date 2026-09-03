import { signal } from '@angular/core';
import { of } from 'rxjs';
import { CreateTicketComponent } from '../../feature/support/create-ticket/create-ticket.component';
import { SessionStateService } from '../../core/auth/session-state.service';
import type { SandboxFixture } from '../sandbox-registry';

/** Anonymous session stub — probed, no user, probe() resolves null. */
const anonymousSession = {
  provide: SessionStateService,
  useValue: { user: signal(null), probed: signal(true), probe: () => of(null) },
};

export const CREATE_TICKET_FIXTURES: readonly SandboxFixture[] = [
  {
    id: 'create-ticket',
    label: 'Create ticket · anonymous form + guidance card (iter-58a P0 #8)',
    component: CreateTicketComponent,
    providers: [anonymousSession],
    viewport: { width: 1280, height: 1500 },
  },
];
