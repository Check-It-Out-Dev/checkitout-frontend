import { HttpErrorResponse, provideHttpClient, withXhr } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import type { UserDtoOut } from '../../api/model/user-dto-out';
import { SandboxAuthService } from './sandbox-auth.service';
import { SANDBOX_PERSONAS } from './sandbox-personas';
import { SessionStateService } from './session-state.service';

const INFLUENCER = { id: 201, email: 'test.influencer@test.com' } as unknown as UserDtoOut;

describe('SandboxAuthService', () => {
  let service: SandboxAuthService;
  let http: HttpTestingController;
  let probe: jest.Mock;

  beforeEach(() => {
    probe = jest.fn(() => of(INFLUENCER));
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withXhr()),
        provideHttpClientTesting(),
        { provide: SessionStateService, useValue: { probe } },
      ],
    });
    service = TestBed.inject(SandboxAuthService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('mints the persona session with credentials and then refreshes the session state', () => {
    const persona = SANDBOX_PERSONAS.find((p) => p.key === 'influencer')!;
    let result: UserDtoOut | null | undefined;
    service.signInAs(persona).subscribe((u) => (result = u));

    const req = http.expectOne('/api/test/auth/mock-session');
    expect(req.request.method).toBe('POST');
    expect(req.request.withCredentials).toBe(true);
    expect(req.request.body).toEqual({ email: 'test.influencer@test.com', role: 'INFLUENCER' });
    req.flush({ userId: 201 });

    expect(probe).toHaveBeenCalledTimes(1);
    expect(result).toBe(INFLUENCER);
  });

  it('surfaces the guard refusal (403) without touching the session state', () => {
    const persona = SANDBOX_PERSONAS.find((p) => p.key === 'company')!;
    let error: unknown;
    service.signInAs(persona).subscribe({ error: (e) => (error = e) });

    http.expectOne('/api/test/auth/mock-session').flush({ message: 'not a persona' }, { status: 403, statusText: 'Forbidden' });

    expect(error).toBeInstanceOf(HttpErrorResponse);
    expect((error as HttpErrorResponse).status).toBe(403);
    expect(probe).not.toHaveBeenCalled();
  });
});
