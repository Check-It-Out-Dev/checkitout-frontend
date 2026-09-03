/**
 * Unit tests for the Firebase Admin + KMS bridge. Jest tier — Playwright
 * ignores `*.unit.spec.ts` via testIgnore in playwright.config.ts.
 *
 * The full network round-trips (real Firestore reads, real KMS decrypt)
 * are exercised by integration specs against the production-shaped
 * `instagram-platform-test` project. Unit tests cover the local
 * decisions: path resolution, error mapping, idempotency.
 *
 * The Firebase Admin + KMS clients are jest-mocked because they require
 * a service-account.json on disk, network access, and an authenticated
 * GCP project at construction time — none of which fit unit-test
 * latency or hermeticity.
 */

const mockFirestoreGet = jest.fn();
const mockFirestoreSet = jest.fn();
const mockFirestoreDoc = jest.fn();
const mockFirestoreCollection = jest.fn();
const mockKmsDecrypt = jest.fn();
const mockKmsEncrypt = jest.fn();
const mockKmsCryptoKeyPath = jest.fn(
  (project: string, location: string, ring: string, key: string) =>
    `projects/${project}/locations/${location}/keyRings/${ring}/cryptoKeys/${key}`,
);
const mockInitializeApp = jest.fn();
const mockGetApps = jest.fn(() => []);
const mockCert = jest.fn();
const mockGetFirestore = jest.fn();
const mockGetAuth = jest.fn();
const mockExistsSync = jest.fn<boolean, [string]>();

jest.mock('node:fs', () => ({
  ...jest.requireActual('node:fs'),
  existsSync: (path: string) => mockExistsSync(path),
}));

jest.mock('firebase-admin/app', () => ({
  initializeApp: (...args: unknown[]) => mockInitializeApp(...args),
  getApps: () => mockGetApps(),
  cert: (path: string) => mockCert(path),
}));

jest.mock('firebase-admin/firestore', () => ({
  getFirestore: () => mockGetFirestore() ?? makeFakeFirestore(),
}));

jest.mock('firebase-admin/auth', () => ({
  getAuth: () => mockGetAuth() ?? { __isFakeAuth: true },
}));

jest.mock('@google-cloud/kms', () => ({
  KeyManagementServiceClient: class {
    decrypt = (...args: unknown[]) => mockKmsDecrypt(...args);
    encrypt = (...args: unknown[]) => mockKmsEncrypt(...args);
    cryptoKeyPath = (p: string, l: string, r: string, k: string) =>
      mockKmsCryptoKeyPath(p, l, r, k);
  },
}));

function makeFakeFirestore() {
  return {
    collection: (...args: unknown[]) => {
      mockFirestoreCollection(...args);
      return {
        doc: (...args2: unknown[]) => {
          mockFirestoreDoc(...args2);
          return {
            get: () => mockFirestoreGet(),
            set: (...args3: unknown[]) => mockFirestoreSet(...args3),
          };
        },
      };
    },
  };
}

const ORIGINAL_ENV = process.env;

describe('firebase-admin-bridge', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env = { ...ORIGINAL_ENV };
    delete process.env['E2E_GCP_SERVICE_ACCOUNT_JSON_PATH'];
    delete process.env['GOOGLE_APPLICATION_CREDENTIALS'];
    delete process.env['FIREBASE_PROJECT_ID'];
    delete process.env['E2E_KMS_LOCATION'];
    delete process.env['E2E_KMS_KEY_RING'];
    delete process.env['E2E_KMS_TOTP_KEY'];
    mockExistsSync.mockReset();
    mockGetApps.mockReturnValue([]);
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  describe('isBridgeAvailable', () => {
    it('returns false when no service-account.json on any path', async () => {
      mockExistsSync.mockReturnValue(false);
      const mod = await import('./firebase-admin-bridge');
      expect(mod.isBridgeAvailable()).toBe(false);
    });

    it('returns true when the explicit cfg.serviceAccountPath exists', async () => {
      mockExistsSync.mockImplementation((p: string) => p === '/tmp/my-sa.json');
      const mod = await import('./firebase-admin-bridge');
      expect(mod.isBridgeAvailable({ serviceAccountPath: '/tmp/my-sa.json' })).toBe(true);
    });

    it('returns true when E2E_GCP_SERVICE_ACCOUNT_JSON_PATH points at an existing file', async () => {
      process.env['E2E_GCP_SERVICE_ACCOUNT_JSON_PATH'] = '/etc/sa.json';
      mockExistsSync.mockImplementation((p: string) => p === '/etc/sa.json');
      const mod = await import('./firebase-admin-bridge');
      expect(mod.isBridgeAvailable()).toBe(true);
    });

    it('falls back to GOOGLE_APPLICATION_CREDENTIALS', async () => {
      process.env['GOOGLE_APPLICATION_CREDENTIALS'] = '/run/gcp.json';
      mockExistsSync.mockImplementation((p: string) => p === '/run/gcp.json');
      const mod = await import('./firebase-admin-bridge');
      expect(mod.isBridgeAvailable()).toBe(true);
    });
  });

  describe('readTotpSecret', () => {
    function happyPath() {
      mockExistsSync.mockReturnValue(true);
      mockFirestoreGet.mockResolvedValue({
        exists: true,
        data: () => ({ encryptedSecret: Buffer.from('CIPHERTEXT_BYTES').toString('base64') }),
      });
      mockKmsDecrypt.mockResolvedValue([{ plaintext: Buffer.from('JBSWY3DPEHPK3PXP', 'utf8') }]);
    }

    it('throws BridgeUnavailableError when service-account.json missing', async () => {
      mockExistsSync.mockReturnValue(false);
      const mod = await import('./firebase-admin-bridge');
      await expect(mod.readTotpSecret('uid-1')).rejects.toBeInstanceOf(mod.BridgeUnavailableError);
    });

    it('throws TotpSecretMissingError when Firestore doc absent', async () => {
      mockExistsSync.mockReturnValue(true);
      mockFirestoreGet.mockResolvedValue({ exists: false, data: () => undefined });
      const mod = await import('./firebase-admin-bridge');
      await expect(mod.readTotpSecret('uid-missing')).rejects.toBeInstanceOf(
        mod.TotpSecretMissingError,
      );
    });

    it('throws TotpSecretMissingError when encryptedSecret field empty', async () => {
      mockExistsSync.mockReturnValue(true);
      mockFirestoreGet.mockResolvedValue({
        exists: true,
        data: () => ({ enabled: true, setupAt: new Date() }),
      });
      const mod = await import('./firebase-admin-bridge');
      await expect(mod.readTotpSecret('uid-empty')).rejects.toBeInstanceOf(
        mod.TotpSecretMissingError,
      );
    });

    it('returns the plaintext Base32 secret on happy path', async () => {
      happyPath();
      const mod = await import('./firebase-admin-bridge');
      await expect(mod.readTotpSecret('uid-ok')).resolves.toBe('JBSWY3DPEHPK3PXP');
      expect(mockFirestoreCollection).toHaveBeenCalledWith('totpSecrets');
      expect(mockFirestoreDoc).toHaveBeenCalledWith('uid-ok');
    });

    it('uses default KMS path when env unset', async () => {
      happyPath();
      const mod = await import('./firebase-admin-bridge');
      await mod.readTotpSecret('uid-default');
      expect(mockKmsCryptoKeyPath).toHaveBeenCalledWith(
        'check-it-out-47c50',
        'europe-central2',
        'instagram-tokens',
        'totp-secrets-key',
      );
    });

    it('honors cfg overrides for KMS path', async () => {
      happyPath();
      const mod = await import('./firebase-admin-bridge');
      await mod.readTotpSecret('uid-cfg', {
        projectId: 'other-proj',
        kmsLocation: 'us-central1',
        kmsKeyRing: 'other-ring',
        kmsTotpKey: 'other-key',
      });
      expect(mockKmsCryptoKeyPath).toHaveBeenCalledWith(
        'other-proj',
        'us-central1',
        'other-ring',
        'other-key',
      );
    });

    it('maps KMS PERMISSION_DENIED to KmsPermissionError', async () => {
      mockExistsSync.mockReturnValue(true);
      mockFirestoreGet.mockResolvedValue({
        exists: true,
        data: () => ({ encryptedSecret: 'BASE64==' }),
      });
      mockKmsDecrypt.mockRejectedValue(
        Object.assign(new Error('Permission cloudkms.cryptoKeyVersions.useToDecrypt denied'), {
          code: 7,
        }),
      );
      const mod = await import('./firebase-admin-bridge');
      await expect(mod.readTotpSecret('uid-denied')).rejects.toBeInstanceOf(mod.KmsPermissionError);
    });

    it('passes through non-permission errors unchanged', async () => {
      mockExistsSync.mockReturnValue(true);
      mockFirestoreGet.mockResolvedValue({
        exists: true,
        data: () => ({ encryptedSecret: 'BASE64==' }),
      });
      mockKmsDecrypt.mockRejectedValue(new Error('UNAVAILABLE: gRPC transport down'));
      const mod = await import('./firebase-admin-bridge');
      await expect(mod.readTotpSecret('uid-network')).rejects.toThrow(/UNAVAILABLE/);
    });
  });

  describe('seedTotpSecret', () => {
    it('encrypts via KMS + writes to Firestore (merge:true)', async () => {
      mockExistsSync.mockReturnValue(true);
      mockKmsEncrypt.mockResolvedValue([{ ciphertext: Buffer.from('NEW_CIPHER_BYTES', 'utf8') }]);
      mockFirestoreSet.mockResolvedValue({});

      const mod = await import('./firebase-admin-bridge');
      const cipher = await mod.seedTotpSecret('uid-seed', 'JBSWY3DPEHPK3PXP');
      expect(cipher).toBe(Buffer.from('NEW_CIPHER_BYTES', 'utf8').toString('base64'));
      expect(mockKmsEncrypt).toHaveBeenCalledWith({
        name: expect.stringContaining('totp-secrets-key'),
        plaintext: Buffer.from('JBSWY3DPEHPK3PXP', 'utf8'),
      });
      const setArgs = mockFirestoreSet.mock.calls[0];
      expect(setArgs[0]).toMatchObject({
        encryptedSecret: expect.any(String),
        enabled: true,
      });
      expect(setArgs[1]).toEqual({ merge: true });
    });

    it('maps KMS PERMISSION_DENIED on encrypt to KmsPermissionError', async () => {
      mockExistsSync.mockReturnValue(true);
      mockKmsEncrypt.mockRejectedValue(
        Object.assign(new Error('PERMISSION_DENIED on encrypt'), { code: 7 }),
      );
      const mod = await import('./firebase-admin-bridge');
      await expect(mod.seedTotpSecret('uid', 'X')).rejects.toBeInstanceOf(mod.KmsPermissionError);
    });
  });
});
