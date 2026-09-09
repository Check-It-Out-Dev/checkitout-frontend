import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, switchMap } from 'rxjs';
import type { UserDtoOut } from '../../api/model/user-dto-out';
import type { SandboxPersona } from './sandbox-personas';
import { SessionStateService } from './session-state.service';

/**
 * Sign-in for the public sandbox: the backend's test-session endpoint mints the persona's HttpOnly
 * session cookies (no Firebase involved), then the cached session state is refreshed from `/users/me`,
 * which is the app's only source of truth for "signed in". The endpoint has no generated client on
 * purpose: it exists only on the dev-lite profile and is not part of the product's OpenAPI contract.
 */
@Injectable({ providedIn: 'root' })
export class SandboxAuthService {
  private readonly http = inject(HttpClient);
  private readonly session = inject(SessionStateService);

  signInAs(persona: SandboxPersona): Observable<UserDtoOut | null> {
    return this.http
      .post<unknown>('/api/test/auth/mock-session', { email: persona.email, role: persona.role }, { withCredentials: true })
      .pipe(switchMap(() => this.session.probe()));
  }
}
