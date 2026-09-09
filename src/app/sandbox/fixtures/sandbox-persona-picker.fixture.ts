import { NEVER, Observable, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import type { UserDtoOut } from '../../api/model/user-dto-out';
import { SandboxAuthService } from '../../core/auth/sandbox-auth.service';
import { SandboxPersonaPickerComponent } from '../../feature/auth/sign-in/sandbox-persona-picker.component';
import type { SandboxFixture } from '../sandbox-registry';

/**
 * Sandbox fixtures for the public sandbox's persona picker. The sign-in call is stubbed: one fixture
 * never resolves (the pending state stays visible), one is refused the way the backend guard refuses an
 * unknown persona (403). The real call is exercised by deploy/sandbox/smoke.sh against the live stack.
 */
class StubSandboxAuthPending {
  signInAs(): Observable<UserDtoOut | null> {
    return NEVER;
  }
}

class StubSandboxAuthRefused {
  signInAs(): Observable<UserDtoOut | null> {
    return throwError(() => new HttpErrorResponse({ status: 403, statusText: 'Forbidden' }));
  }
}

export const SANDBOX_PERSONA_PICKER_FIXTURES: readonly SandboxFixture[] = [
  {
    id: 'sandbox-persona-picker',
    label: 'Sandbox · persona picker (pending after a choice)',
    component: SandboxPersonaPickerComponent,
    providers: [{ provide: SandboxAuthService, useClass: StubSandboxAuthPending }],
  },
  {
    id: 'sandbox-persona-picker-refused',
    label: 'Sandbox · persona picker (the guard refuses)',
    component: SandboxPersonaPickerComponent,
    providers: [{ provide: SandboxAuthService, useClass: StubSandboxAuthRefused }],
  },
];
