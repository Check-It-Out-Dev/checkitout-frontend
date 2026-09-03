import { expect, test, type APIResponse, type Page } from '@playwright/test';
import type { CompanyDataConfirmResponse } from '../../../src/app/api/model/company-data-confirm-response';
import type { NotificationDtoOut } from '../../../src/app/api/model/notification-dto-out';
import type { PageNotificationDtoOut } from '../../../src/app/api/model/page-notification-dto-out';
import { BE_URL, GREENFIELD_URL, seedSession } from '../_actor';

/** Test-only `/api/test/auth/mock-session` response. */
interface MockSessionResponse {
  firebaseUid?: string;
  email?: string;
  role?: string;
}

/** `/notifications/unread/count` — not in OpenAPI spec. */
interface UnreadCountResponse {
  count?: number;
}

/**
 * T14 — Port of `notification/account-activation-e2e.feature` (1 scenario,
 * 8+ assertions).
 *
 * Source of truth:
 *   `checkitout-backend/.../features/notification/account-activation-e2e.feature`
 *
 * Coverage: ACCOUNT_ACTIVATED notification (NTF-003) fires when a COMPANY
 * user transitions ACTIVE via the auto-activation path:
 *   1. emailVerified=true
 *   2. user starts IN_VALIDATION
 *   3. confirmCompanyData() → BE flips status to ACTIVE
 *   4. AccountActivatedEvent → NotificationEventListener → DB row +
 *      unread-count delta
 *
 * Bug class caught: notification-event listener regression. If the
 * @TransactionalEventListener wiring for AccountActivatedEvent ever
 * breaks (decoupling lost, async-event drop, type mismatch), users would
 * activate their account without seeing the welcome notification.
 *
 * Endpoints exercised:
 *   POST /test/registry/reset                  — wipe stub state
 *   POST /test/registry/configure-krs-company  — pre-seed KRS for NIP
 *   POST /test/registry/set-email-verified     — bypass Firebase verify
 *   POST /test/auth/set-account-status         — force IN_VALIDATION
 *   POST /registry/lookup                      — fetch company-data preview
 *   POST /registry/confirm                     — commit → auto-activate
 *   GET  /notifications/unread/count           — verify ≥1 unread
 *   GET  /notifications?page=0&size=10         — verify ACCOUNT_ACTIVATED row
 *
 * Run: `npm run test:integration -- --grep account-activation-e2e`
 */

const TEST_NIP = '5261040828';
const UNIQUE_COMPANY = () =>
  `t14-actv-co-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@e2e.test`;

async function api(
  page: Page,
  method: 'GET' | 'POST',
  path: string,
  data?: unknown,
): Promise<APIResponse> {
  const url = `${GREENFIELD_URL}/api${path}`;
  if (method === 'GET') {
    return page.request.get(url, { ignoreHTTPSErrors: true, failOnStatusCode: false });
  }
  return page.request.post(url, {
    data,
    ignoreHTTPSErrors: true,
    failOnStatusCode: false,
  });
}

test.describe('@account-activation-e2e — port of account-activation-e2e.feature', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async ({ request }) => {
    try {
      const res = await request.get(`${BE_URL}/api/public-config`, {
        ignoreHTTPSErrors: true,
        timeout: 3_000,
      });
      if (!res.ok()) test.skip(true, `BE health-check failed (${res.status()})`);
    } catch (err) {
      test.skip(true, `BE not reachable: ${(err as Error).message}`);
    }
  });

  test.beforeEach(({}, testInfo) => {
    test.skip(
      testInfo.project.name !== 'chromium-desktop',
      'Integration runs on chromium-desktop only',
    );
  });

  // --------------------------------------------------------------------
  // Single mega-scenario: NTF-003 ACCOUNT_ACTIVATED notification fires
  // when a COMPANY auto-activates via confirmCompanyData().
  // --------------------------------------------------------------------
  test('@ntf-003 @company COMPANY receives ACCOUNT_ACTIVATED notification after confirm-data auto-activation', async ({
    page,
  }) => {
    // Phase 0: reset registry stubs (idempotent)
    const reset = await api(page, 'POST', '/test/registry/reset', {});
    if (reset.status() === 404) {
      test.skip(true, '/test/registry/* not registered in this BE profile.');
    }
    await api(page, 'POST', '/test/registry/clear-cache', {});

    // Phase 1: configure KRS stub for the NIP
    const configureKrs = await api(page, 'POST', '/test/registry/configure-krs-company', {
      nip: TEST_NIP,
    });
    expect(
      configureKrs.status(),
      `configure-krs-company should be 2xx, got ${configureKrs.status()}`,
    ).toBeLessThan(300);

    // Phase 2: seed COMPANY actor via mock-session and capture firebaseUid
    // from the response body for downstream test endpoints.
    const email = UNIQUE_COMPANY();
    const mockSessionRes = await page.request.post(`${GREENFIELD_URL}/api/test/auth/mock-session`, {
      data: { email, role: 'COMPANY', partial: false },
      ignoreHTTPSErrors: true,
      failOnStatusCode: false,
    });
    expect(mockSessionRes.status(), 'mock-session should be 200').toBe(200);
    const session = (await mockSessionRes.json()) as MockSessionResponse;
    const firebaseUid = session.firebaseUid ?? '';
    expect(firebaseUid.length, 'mock-session should return firebaseUid').toBeGreaterThan(0);

    // Phase 3: mark email verified via firebaseUid lookup
    const setVerified = await api(page, 'POST', '/test/registry/set-email-verified', {
      firebaseUid,
      verified: true,
    });
    expect(
      setVerified.status(),
      `set-email-verified should be 2xx, got ${setVerified.status()}: ${await setVerified.text()}`,
    ).toBeLessThan(300);

    // Phase 4: force account back to IN_VALIDATION (TestRegistryController
    // auto-sets ACTIVE when emailVerified=true; we want the path through
    // confirmCompanyData to trigger AccountActivatedEvent).
    const setStatus = await api(page, 'POST', '/test/auth/set-account-status', {
      email,
      status: 'IN_VALIDATION',
    });
    expect(setStatus.status(), `set-account-status should be 2xx`).toBeLessThan(300);

    // Phase 5: registry lookup (returns KRS data preview)
    const lookup = await api(page, 'POST', '/registry/lookup', { nip: TEST_NIP });
    expect(lookup.status(), `registry lookup should be 200, got ${lookup.status()}`).toBe(200);

    // Phase 6: confirm company data — should auto-activate the user.
    const confirm = await api(page, 'POST', '/registry/confirm', { nip: TEST_NIP });
    expect(confirm.status(), `confirm should be 200, got ${confirm.status()}`).toBe(200);
    const confirmBody = (await confirm.json()) as CompanyDataConfirmResponse;
    expect(confirmBody.activated, `confirm.activated should be true`).toBe(true);
    expect(confirmBody.accountStatus, `confirm.accountStatus should be ACTIVE`).toBe('ACTIVE');

    // Phase 7: refresh session — tokenVersion incremented post-activation.
    // Clear stale cookies first; otherwise the BE session filter rejects
    // the (now-stale) tokenVersion with 419 BEFORE the mock-session
    // controller has a chance to issue a fresh session.
    await page.context().clearCookies();
    await seedSession(page, email, 'COMPANY');

    // Phase 8: verify unread notification count ≥ 1
    const unread = await api(page, 'GET', '/notifications/unread/count');
    expect(unread.status(), `/notifications/unread/count should be 200`).toBe(200);
    const unreadBody = (await unread.json()) as UnreadCountResponse;
    const unreadCount = unreadBody.count ?? 0;
    expect(
      unreadCount,
      `unread count should be ≥1 (got ${unreadCount}); ACCOUNT_ACTIVATED notification missing`,
    ).toBeGreaterThanOrEqual(1);

    // Phase 9: fetch notifications page 0 size 10, look for ACCOUNT_ACTIVATED
    const list = await api(page, 'GET', '/notifications?page=0&size=10');
    expect(list.status(), `/notifications?page=0&size=10 should be 200`).toBe(200);
    const listBody = (await list.json()) as PageNotificationDtoOut;
    const content: NotificationDtoOut[] = listBody.content ?? [];
    expect(Array.isArray(content), `notifications.content should be an array`).toBe(true);
    const types = content.map((n) => String(n.type ?? ''));
    expect(
      types.includes('ACCOUNT_ACTIVATED'),
      `notifications should contain ACCOUNT_ACTIVATED; got types=${JSON.stringify(types)}`,
    ).toBe(true);
  });
});
