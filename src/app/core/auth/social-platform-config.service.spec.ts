import { TestBed } from '@angular/core/testing';
import { SocialPlatformConfigService } from './social-platform-config.service';

describe('SocialPlatformConfigService', () => {
  let svc: SocialPlatformConfigService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    svc = TestBed.inject(SocialPlatformConfigService);
    // Clean any leftover state cookies between tests.
    document.cookie = 'oauth_state=; Max-Age=0; Path=/';
  });

  it('returns null for unsupported platform', () => {
    // Greenfield supports Instagram only (legacy parity); any unknown
    // platform should yield null. Using a deliberately-fake name to make
    // the intent obvious.
    expect(svc.getOAuthUrl('not-a-real-platform')).toBeNull();
  });

  it('builds an Instagram OAuth URL with required params', () => {
    const url = svc.getOAuthUrl('instagram');
    expect(url).not.toBeNull();
    const u = new URL(url as string);
    expect(u.origin + u.pathname).toBe('https://www.instagram.com/oauth/authorize');
    const params = u.searchParams;
    expect(params.get('client_id')).toBeTruthy();
    expect(params.get('response_type')).toBe('code');
    expect(params.get('scope')).toBe('instagram_business_basic');
    expect(params.get('redirect_uri')).toContain('/auth/social/callback/instagram');
    expect(params.get('state')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('persists state in a cookie that validateOAuthState() then accepts', () => {
    const url = svc.getOAuthUrl('instagram') as string;
    const issuedState = new URL(url).searchParams.get('state') as string;
    expect(svc.validateOAuthState(issuedState)).toBe(true);
  });

  it('rejects validateOAuthState() for a mismatched state', () => {
    svc.getOAuthUrl('instagram');
    expect(svc.validateOAuthState('not-the-state')).toBe(false);
  });

  it('rejects validateOAuthState() for null state', () => {
    svc.getOAuthUrl('instagram');
    expect(svc.validateOAuthState(null)).toBe(false);
  });

  it('clears the state cookie after a single validation attempt', () => {
    const url = svc.getOAuthUrl('instagram') as string;
    const issuedState = new URL(url).searchParams.get('state') as string;
    expect(svc.validateOAuthState(issuedState)).toBe(true);
    // Second attempt with the same state should now fail (cookie cleared).
    expect(svc.validateOAuthState(issuedState)).toBe(false);
  });

  it('clearOAuthState() removes the cookie', () => {
    svc.getOAuthUrl('instagram');
    svc.clearOAuthState();
    // No state stored → any subsequent validate returns false.
    expect(svc.validateOAuthState('anything')).toBe(false);
  });
});
