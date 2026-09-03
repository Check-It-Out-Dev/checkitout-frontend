import { Observable } from 'rxjs';
import type { AuthOperationResponse } from '../../api/model/auth-operation-response';
import { AuthApiService } from '../../core/auth/auth-api.service';
import { SignOutComponent } from '../../feature/auth/sign-out/sign-out.component';
import type { SandboxFixture } from '../sandbox-registry';

class StubAuthApi {
  signOut(): Observable<AuthOperationResponse> {
    // Sandbox keeps the spinner up forever — production redirects after BE
    // resolves; sandbox stays on the in-progress visual for snapshot stability.
    return new Observable<AuthOperationResponse>(() => undefined);
  }
}

export const SIGN_OUT_FIXTURES: readonly SandboxFixture[] = [
  {
    id: 'sign-out-in-progress',
    label: 'Sign out · in progress',
    component: SignOutComponent,
    providers: [{ provide: AuthApiService, useClass: StubAuthApi }],
  },
];
