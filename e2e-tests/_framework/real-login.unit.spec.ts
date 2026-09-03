/**
 * Unit tests for the real-Firebase-login helper. Jest-tier (file ignored
 * by Playwright via playwright.config.ts testIgnore).
 *
 * Tests cover credential resolution + error paths. The network round-trips
 * (Identity Toolkit signInWithPassword + BE /auth/exchange-token) are
 * exercised in integration specs against the real services — unit tests
 * shouldn't mock them.
 */
import {
  hasRealCredentialsFor,
  MissingCredentialsError,
  realLogin,
  mintFirebaseIdToken,
} from './real-login';
import type { ActorProfile } from './actor';

interface FakeRequest {
  post: jest.Mock;
}

interface FakeContext {
  request: FakeRequest;
}

function fakeContext(post: jest.Mock = jest.fn()): FakeContext {
  return { request: { post } };
}

const ORIGINAL_ENV = process.env;

describe('real-login helpers', () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    delete process.env['FIREBASE_API_KEY'];
    delete process.env['FIREBASE_TEST_COMPANY_EMAIL'];
    delete process.env['FIREBASE_TEST_COMPANY_PASSWORD'];
    delete process.env['FIREBASE_TEST_INFLUENCER_EMAIL'];
    delete process.env['FIREBASE_TEST_INFLUENCER_PASSWORD'];
    delete process.env['FIREBASE_TEST_ADMIN_EMAIL'];
    delete process.env['FIREBASE_TEST_ADMIN_PASSWORD'];
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  describe('hasRealCredentialsFor', () => {
    it('returns false when FIREBASE_API_KEY is missing (any role)', () => {
      process.env['FIREBASE_TEST_COMPANY_EMAIL'] = 'a@b.test';
      process.env['FIREBASE_TEST_COMPANY_PASSWORD'] = 'pw';
      expect(hasRealCredentialsFor('COMPANY')).toBe(false);
    });

    it('returns false when role email is missing even though API key is set', () => {
      process.env['FIREBASE_API_KEY'] = 'key';
      process.env['FIREBASE_TEST_INFLUENCER_PASSWORD'] = 'pw';
      expect(hasRealCredentialsFor('INFLUENCER')).toBe(false);
    });

    it('returns false when role password is missing even though API key + email are set', () => {
      process.env['FIREBASE_API_KEY'] = 'key';
      process.env['FIREBASE_TEST_ADMIN_EMAIL'] = 'a@b.test';
      expect(hasRealCredentialsFor('ADMIN')).toBe(false);
    });

    it('returns true when API key + role email + role password are all set', () => {
      process.env['FIREBASE_API_KEY'] = 'key';
      process.env['FIREBASE_TEST_COMPANY_EMAIL'] = 'a@b.test';
      process.env['FIREBASE_TEST_COMPANY_PASSWORD'] = 'pw';
      expect(hasRealCredentialsFor('COMPANY')).toBe(true);
    });

    it('isolates roles — COMPANY creds do not unlock INFLUENCER', () => {
      process.env['FIREBASE_API_KEY'] = 'key';
      process.env['FIREBASE_TEST_COMPANY_EMAIL'] = 'a@b.test';
      process.env['FIREBASE_TEST_COMPANY_PASSWORD'] = 'pw';
      expect(hasRealCredentialsFor('COMPANY')).toBe(true);
      expect(hasRealCredentialsFor('INFLUENCER')).toBe(false);
      expect(hasRealCredentialsFor('ADMIN')).toBe(false);
    });
  });

  describe('mintFirebaseIdToken', () => {
    it('throws MissingCredentialsError when API key is empty', async () => {
      await expect(
        mintFirebaseIdToken(fakeContext() as never, 'a@b.test', 'pw', ''),
      ).rejects.toBeInstanceOf(MissingCredentialsError);
    });

    it('throws when Identity Toolkit returns non-OK', async () => {
      const post = jest.fn().mockResolvedValue({
        ok: () => false,
        status: () => 400,
        text: async () => '{"error":{"code":400,"message":"INVALID_PASSWORD"}}',
      });
      await expect(
        mintFirebaseIdToken(fakeContext(post) as never, 'a@b.test', 'wrong', 'key'),
      ).rejects.toThrow(/INVALID_PASSWORD/);
    });

    it('returns idToken on successful sign-in', async () => {
      const post = jest.fn().mockResolvedValue({
        ok: () => true,
        json: async () => ({
          idToken: 'fake.firebase.jwt',
          localId: 'uid-1',
          email: 'a@b.test',
          expiresIn: '3600',
          refreshToken: 'refresh-1',
        }),
      });
      const token = await mintFirebaseIdToken(fakeContext(post) as never, 'a@b.test', 'pw', 'key');
      expect(token).toBe('fake.firebase.jwt');
      expect(post).toHaveBeenCalledWith(
        expect.stringContaining('identitytoolkit.googleapis.com'),
        expect.objectContaining({
          data: { email: 'a@b.test', password: 'pw', returnSecureToken: true },
        }),
      );
    });

    it('throws when Identity Toolkit returns OK but no idToken (defense-in-depth)', async () => {
      const post = jest.fn().mockResolvedValue({
        ok: () => true,
        json: async () => ({ localId: 'uid-1', expiresIn: '3600' }),
      });
      await expect(
        mintFirebaseIdToken(fakeContext(post) as never, 'a@b.test', 'pw', 'key'),
      ).rejects.toThrow(/no idToken/);
    });
  });

  describe('realLogin', () => {
    const company: ActorProfile = { id: 'c', email: 'c@e2e.test', role: 'COMPANY' };

    it('throws MissingCredentialsError when API key is missing', async () => {
      await expect(realLogin(fakeContext() as never, company)).rejects.toBeInstanceOf(
        MissingCredentialsError,
      );
    });

    it('throws MissingCredentialsError when role email is missing', async () => {
      process.env['FIREBASE_API_KEY'] = 'key';
      process.env['FIREBASE_TEST_COMPANY_PASSWORD'] = 'pw';
      await expect(realLogin(fakeContext() as never, company)).rejects.toBeInstanceOf(
        MissingCredentialsError,
      );
    });

    it('mints token then POSTs idToken to /auth/exchange-token', async () => {
      process.env['FIREBASE_API_KEY'] = 'key';
      process.env['FIREBASE_TEST_COMPANY_EMAIL'] = 'c@e2e.test';
      process.env['FIREBASE_TEST_COMPANY_PASSWORD'] = 'pw';

      const post = jest
        .fn()
        // Identity Toolkit
        .mockResolvedValueOnce({
          ok: () => true,
          json: async () => ({
            idToken: 'fake.firebase.jwt',
            localId: 'uid-1',
            email: 'c@e2e.test',
            expiresIn: '3600',
            refreshToken: 'r',
          }),
        })
        // BE exchange-token
        .mockResolvedValueOnce({ ok: () => true });

      await realLogin(fakeContext(post) as never, company, 'https://localhost:4201');

      expect(post).toHaveBeenCalledTimes(2);
      expect(post.mock.calls[0][0]).toMatch(/identitytoolkit\.googleapis\.com/);
      expect(post.mock.calls[1][0]).toBe('https://localhost:4201/api/auth/exchange-token');
      expect(post.mock.calls[1][1].data).toEqual({ idToken: 'fake.firebase.jwt' });
    });

    it('threads expirationDays into the exchange-token body', async () => {
      process.env['FIREBASE_API_KEY'] = 'key';
      process.env['FIREBASE_TEST_INFLUENCER_EMAIL'] = 'i@e2e.test';
      process.env['FIREBASE_TEST_INFLUENCER_PASSWORD'] = 'pw';

      const post = jest
        .fn()
        .mockResolvedValueOnce({
          ok: () => true,
          json: async () => ({
            idToken: 'tok',
            localId: 'u',
            email: 'i@e2e.test',
            expiresIn: '3600',
            refreshToken: 'r',
          }),
        })
        .mockResolvedValueOnce({ ok: () => true });

      const influencer: ActorProfile = { id: 'i', email: 'i@e2e.test', role: 'INFLUENCER' };
      await realLogin(fakeContext(post) as never, influencer, 'https://localhost:4201', 14);

      expect(post.mock.calls[1][1].data).toEqual({ idToken: 'tok', expirationDays: 14 });
    });

    it('throws when /auth/exchange-token fails', async () => {
      process.env['FIREBASE_API_KEY'] = 'key';
      process.env['FIREBASE_TEST_COMPANY_EMAIL'] = 'c@e2e.test';
      process.env['FIREBASE_TEST_COMPANY_PASSWORD'] = 'pw';

      const post = jest
        .fn()
        .mockResolvedValueOnce({
          ok: () => true,
          json: async () => ({
            idToken: 'tok',
            localId: 'u',
            email: 'c@e2e.test',
            expiresIn: '3600',
            refreshToken: 'r',
          }),
        })
        .mockResolvedValueOnce({
          ok: () => false,
          status: () => 401,
          text: async () => 'token expired',
        });

      await expect(realLogin(fakeContext(post) as never, company)).rejects.toThrow(
        /exchange-token failed.*401.*token expired/,
      );
    });
  });
});
