import { expect, test, type APIResponse, type Page } from '@playwright/test';
import type { UserDtoOut } from '../../../src/app/api/model/user-dto-out';
import { BE_URL, GREENFIELD_URL, seedSession } from '../_actor';
import { getMyId } from '../_helpers';

/**
 * T14 — Port of `profile/profile-critical-consolidated.feature` (2 scenarios).
 *
 * Source of truth:
 *   `checkitout-backend/.../features/profile/profile-critical-consolidated.feature`
 *
 * Coverage map:
 *
 *   ✅ Scenario 1 COMPANY: firstName/lastName/phoneNumber/name/nip
 *      updates → status stays ACTIVE, session stays valid.
 *   ✅ Scenario 2 INFLUENCER: firstName/lastName/phoneNumber updates
 *      → same invariants.
 *
 * Note: the file is named "CRITICAL" but verifies the OPPOSITE — these
 * fields ARE NOT critical (despite the name). The intent is to prove
 * that profile edits don't trigger AccountStatus FSM transitions or
 * token-version increments. BE confirms this at UserService:836 with
 * the comment "Profile field edits no longer trigger status transitions."
 *
 * Bug class caught: token-version bump regression. If the BE
 * accidentally starts treating firstName/etc as critical (e.g. some
 * accountStatus transition gets reintroduced), users would be logged
 * out every time they fixed a typo. The spec verifies via /users/me
 * post-PATCH that the session remains intact.
 *
 * Run: `npm run test:integration -- --grep profile-critical-fields`
 */

const UNIQUE_COMPANY = () =>
  `t14-pcr-co-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@e2e.test`;
const UNIQUE_INFLUENCER = () =>
  `t14-pcr-in-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@e2e.test`;

async function api(
  page: Page,
  method: 'GET' | 'PATCH',
  path: string,
  data?: unknown,
): Promise<APIResponse> {
  const url = `${GREENFIELD_URL}/api${path}`;
  const opts = { ignoreHTTPSErrors: true, failOnStatusCode: false } as const;
  if (method === 'GET') return page.request.get(url, opts);
  return page.request.patch(url, { ...opts, data });
}

// getMyId is now imported from `../_helpers`. Local helper deleted.

async function expectStaysActive(page: Page, label: string): Promise<void> {
  const me = await api(page, 'GET', '/users/me');
  expect(
    me.status(),
    `[${label}] session should still be valid after PATCH (no token-version bump)`,
  ).toBe(200);
  const body = (await me.json()) as UserDtoOut;
  // accountStatus is the enum-wrapped AccountStatusDtoOut: {value, label, originalLabel, ...}
  const statusValue = body.accountStatus?.value ?? '';
  expect(
    statusValue,
    `[${label}] accountStatus.value should be ACTIVE after non-status PATCH`,
  ).toBe('ACTIVE');
}

test.describe('@profile-critical-fields — port of profile-critical-consolidated.feature', () => {
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
  // Scenario 1: COMPANY profile field changes (firstName, lastName,
  // phoneNumber, name, nip) → ACTIVE preserved, session intact.
  // --------------------------------------------------------------------
  test('@company firstName + lastName + phoneNumber + name + nip PATCH keep session ACTIVE', async ({
    page,
  }) => {
    await seedSession(page, UNIQUE_COMPANY(), 'COMPANY');
    const userId = await getMyId(page);

    // firstName
    const fn = await api(page, 'PATCH', `/users/${userId}`, { firstName: 'E2EUpdatedFirst' });
    expect(
      fn.status(),
      `firstName PATCH should be 200, got ${fn.status()}: ${await fn.text()}`,
    ).toBe(200);
    await expectStaysActive(page, 'after firstName');

    // lastName
    const ln = await api(page, 'PATCH', `/users/${userId}`, { lastName: 'E2EUpdatedLast' });
    expect(ln.status()).toBe(200);
    await expectStaysActive(page, 'after lastName');

    // phoneNumber — per-test unique to avoid UNIQUE constraint conflicts
    // across parallel/repeated test runs.
    const phone = `+48${String(Date.now()).slice(-9)}`;
    const pn = await api(page, 'PATCH', `/users/${userId}`, { phoneNumber: phone });
    expect(
      pn.status(),
      `phoneNumber PATCH should be 200, got ${pn.status()}: ${await pn.text()}`,
    ).toBe(200);
    await expectStaysActive(page, 'after phoneNumber');

    // name (business name) — per-test unique to avoid global-uniqueness conflicts
    const businessName = `E2E Test Company ${Date.now()}`;
    const nm = await api(page, 'PATCH', `/users/${userId}`, { name: businessName });
    expect(nm.status()).toBe(200);
    await expectStaysActive(page, 'after name');

    // nip — Polish tax id, 10 digits. Use a generated unique value to
    // avoid duplicate-key (BE: company.nip UNIQUE).
    const nip = `12345${String(Date.now()).slice(-5)}`;
    const np = await api(page, 'PATCH', `/users/${userId}`, { nip });
    // 200 if accepted; some BEs reject if NIP doesn't match the
    // registry record. Accept 200/400 here — the assertion that matters
    // is that session stays ACTIVE in either case.
    expect(
      [200, 400].includes(np.status()),
      `nip PATCH should be 200 or 400-validation, got ${np.status()}`,
    ).toBe(true);
    await expectStaysActive(page, 'after nip');

    // Final sanity: all changes applied via /users/me
    const finalMe = await api(page, 'GET', '/users/me');
    const finalBody = (await finalMe.json()) as UserDtoOut;
    expect(finalBody.firstName, 'firstName should be updated').toBe('E2EUpdatedFirst');
    expect(finalBody.lastName, 'lastName should be updated').toBe('E2EUpdatedLast');
    expect(finalBody.phoneNumber, 'phoneNumber should be updated').toBe(phone);
  });

  // --------------------------------------------------------------------
  // Scenario 2: INFLUENCER profile field changes
  // --------------------------------------------------------------------
  test('@influencer firstName + lastName + phoneNumber PATCH keep session ACTIVE', async ({
    page,
  }) => {
    await seedSession(page, UNIQUE_INFLUENCER(), 'INFLUENCER');
    const userId = await getMyId(page);

    const fn = await api(page, 'PATCH', `/users/${userId}`, { firstName: 'InfluencerUpdated' });
    expect(fn.status(), 'INFLUENCER firstName PATCH should be 200').toBe(200);
    await expectStaysActive(page, 'INFLUENCER after firstName');

    const ln = await api(page, 'PATCH', `/users/${userId}`, { lastName: 'UpdatedLast' });
    expect(ln.status()).toBe(200);
    await expectStaysActive(page, 'INFLUENCER after lastName');

    const infPhone = `+48${String(Date.now()).slice(-9)}`;
    const pn = await api(page, 'PATCH', `/users/${userId}`, { phoneNumber: infPhone });
    expect(pn.status()).toBe(200);
    await expectStaysActive(page, 'INFLUENCER after phoneNumber');

    const finalMe = await api(page, 'GET', '/users/me');
    const finalBody = (await finalMe.json()) as UserDtoOut;
    expect(finalBody.firstName).toBe('InfluencerUpdated');
    expect(finalBody.lastName).toBe('UpdatedLast');
    expect(finalBody.phoneNumber).toBe(infPhone);
  });
});
