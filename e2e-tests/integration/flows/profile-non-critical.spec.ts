import { expect, test, type APIResponse, type Page } from '@playwright/test';
import type { AddressDtoOut } from '../../../src/app/api/model/address-dto-out';
import type { UserDtoOut } from '../../../src/app/api/model/user-dto-out';
import { BE_URL, GREENFIELD_URL, seedSession } from '../_actor';
import { getMyId, uploadTrackedPhoto } from '../_helpers';

/**
 * T14 — Port of `profile/profile-non-critical-consolidated.feature` (2 scenarios).
 *
 * Source of truth:
 *   `checkitout-backend/.../features/profile/profile-non-critical-consolidated.feature`
 *
 * Coverage map:
 *
 *   ✅ Scenario 1 COMPANY: profilePicture + companyDescription + address
 *      CRUD + preferences updates. All "non-critical" — they don't trigger
 *      Firebase claim updates so they're fully portable via mock-session.
 *   ✅ Scenario 2 INFLUENCER: same set of non-critical updates.
 *   ✅ Signed-URL profile-picture upload: the FULL pipeline (signed-url →
 *      PUT to storage → confirm → PATCH the tracked uploadId). The BE
 *      resolves the uploadId to ITS canonical URL and returns it — the
 *      client never chooses the stored URL (pentest 3.1, uploadId-only).
 *      Raw-URL PATCHes are the 400 contract asserted in
 *      profile-validation.spec.ts.
 *
 * Bug class caught: non-critical-field regression. If the BE classification
 * of "what counts as critical" ever drifts (e.g. profilePicture mistakenly
 * starts triggering Firebase claim refresh), users would get logged out
 * mid-edit — terrible UX. This spec catches that drift end-to-end.
 *
 * Run: `npm run test:integration -- --grep profile-non-critical`
 */

const UNIQUE_COMPANY = () =>
  `t14-pnc-co-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@e2e.test`;
const UNIQUE_INFLUENCER = () =>
  `t14-pnc-in-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@e2e.test`;

async function api(
  page: Page,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  data?: unknown,
): Promise<APIResponse> {
  const url = `${GREENFIELD_URL}/api${path}`;
  const opts = { ignoreHTTPSErrors: true, failOnStatusCode: false } as const;
  switch (method) {
    case 'GET':
      return page.request.get(url, opts);
    case 'POST':
      return page.request.post(url, { ...opts, data });
    case 'PATCH':
      return page.request.patch(url, { ...opts, data });
    case 'DELETE':
      return page.request.delete(url, opts);
  }
}

test.describe('@profile-non-critical — port of profile-non-critical-consolidated.feature', () => {
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
  // Scenario 1: COMPANY non-critical updates
  // --------------------------------------------------------------------
  test('@company profilePicture + companyDescription PATCH succeed (no token invalidation)', async ({
    page,
  }) => {
    const email = UNIQUE_COMPANY();
    await seedSession(page, email, 'COMPANY');
    const userId = await getMyId(page);

    // profilePicture — by the book: upload via signed URL, PATCH the tracked
    // uploadId, and the BE stores + returns ITS canonical URL.
    const upload = await uploadTrackedPhoto(page);
    if (!upload) {
      test.skip(true, 'upload controller absent (no Firebase Storage in this profile)');
    }
    const ppRes = await api(page, 'PATCH', `/users/${userId}`, {
      profilePicture: upload!.uploadId,
    });
    expect(
      ppRes.status(),
      `PATCH profilePicture should be 200, got ${ppRes.status()}: ${await ppRes.text()}`,
    ).toBe(200);
    const ppBody = (await ppRes.json()) as UserDtoOut;
    expect(
      ppBody.profilePicture,
      'the BE resolves the uploadId and returns its canonical stored URL',
    ).toBe(upload!.publicUrl);

    // Sanity: cookies still valid — /users/me works after profilePicture PATCH.
    // (Critical-field changes bump tokenVersion → next call would be 419.
    //  This proves profilePicture is non-critical.)
    const meAfterPp = await api(page, 'GET', '/users/me');
    expect(meAfterPp.status(), 'session should still be valid after profilePicture PATCH').toBe(
      200,
    );

    // companyDescription
    const desc = `E2E non-critical test ${Date.now()}`;
    const cdRes = await api(page, 'PATCH', `/users/${userId}`, { companyDescription: desc });
    expect(
      cdRes.status(),
      `PATCH companyDescription should be 200, got ${cdRes.status()}: ${await cdRes.text()}`,
    ).toBe(200);

    // Verify it stuck via /users/me
    const meAfter = await api(page, 'GET', '/users/me');
    expect(meAfter.status()).toBe(200);
    const meBody = (await meAfter.json()) as UserDtoOut;
    expect(meBody.companyDescription).toBe(desc);
  });

  test('@company batch update profilePicture + companyDescription in one PATCH', async ({
    page,
  }) => {
    const email = UNIQUE_COMPANY();
    await seedSession(page, email, 'COMPANY');
    const userId = await getMyId(page);

    const upload = await uploadTrackedPhoto(page);
    if (!upload) {
      test.skip(true, 'upload controller absent (no Firebase Storage in this profile)');
    }
    const desc = `Batch ${Date.now()}`;
    const batchRes = await api(page, 'PATCH', `/users/${userId}`, {
      profilePicture: upload!.uploadId,
      companyDescription: desc,
    });
    expect(
      batchRes.status(),
      `batch PATCH should be 200, got ${batchRes.status()}: ${await batchRes.text()}`,
    ).toBe(200);
    const body = (await batchRes.json()) as UserDtoOut;
    expect(body.profilePicture).toBe(upload!.publicUrl);
    expect(body.companyDescription).toBe(desc);
  });

  // --------------------------------------------------------------------
  // Address CRUD via /address/user/{userId}
  // --------------------------------------------------------------------
  test('@company address CRUD (create → update → delete)', async ({ page }) => {
    const email = UNIQUE_COMPANY();
    await seedSession(page, email, 'COMPANY');
    const userId = await getMyId(page);

    // Create
    const create = await api(page, 'POST', `/address/user/${userId}`, {
      street: 'E2E Test Street',
      city: 'Warsaw',
      postalCode: '00-001',
      country: 'Poland',
      primary: false,
      addressType: 'Test Address',
    });
    expect(
      [200, 201].includes(create.status()),
      `POST /address/user/${userId} should be 200/201, got ${create.status()}: ${await create.text()}`,
    ).toBe(true);
    const created = (await create.json()) as AddressDtoOut;
    const addressId = created.id;
    expect(
      typeof addressId === 'number' && Number.isFinite(addressId),
      'created address should have numeric id',
    ).toBe(true);

    // Update
    const update = await api(page, 'PATCH', `/address/${addressId}`, { city: 'Kraków' });
    expect(
      update.status(),
      `PATCH /address/${addressId} should be 200, got ${update.status()}`,
    ).toBe(200);

    // Delete
    const del = await api(page, 'DELETE', `/address/${addressId}`);
    expect(
      [200, 204].includes(del.status()),
      `DELETE /address/${addressId} should be 200/204, got ${del.status()}`,
    ).toBe(true);
  });

  // --------------------------------------------------------------------
  // User preferences (language, share-phone, communicationFrequency)
  // --------------------------------------------------------------------
  test('@company preferences PATCH language + sharePhoneForPayments', async ({ page }) => {
    const email = UNIQUE_COMPANY();
    await seedSession(page, email, 'COMPANY');

    const langRes = await api(page, 'PATCH', '/user-preferences/me', { language: 'pl' });
    expect(
      langRes.status(),
      `PATCH /user-preferences/me language should be 200, got ${langRes.status()}: ${await langRes.text()}`,
    ).toBe(200);

    const phoneRes = await api(page, 'PATCH', '/user-preferences/me', {
      sharePhoneForPayments: false,
    });
    expect(phoneRes.status(), 'PATCH preferences sharePhoneForPayments should be 200').toBe(200);
  });

  // --------------------------------------------------------------------
  // Scenario 2: INFLUENCER non-critical updates (mirror)
  // --------------------------------------------------------------------
  test('@influencer profilePicture + address + preferences non-critical updates', async ({
    page,
  }) => {
    const email = UNIQUE_INFLUENCER();
    await seedSession(page, email, 'INFLUENCER');
    const userId = await getMyId(page);

    // profilePicture — tracked uploadId, BE returns its canonical URL
    const upload = await uploadTrackedPhoto(page);
    if (!upload) {
      test.skip(true, 'upload controller absent (no Firebase Storage in this profile)');
    }
    const ppRes = await api(page, 'PATCH', `/users/${userId}`, {
      profilePicture: upload!.uploadId,
    });
    expect(ppRes.status(), 'INFLUENCER PATCH profilePicture should be 200').toBe(200);
    const ppBody = (await ppRes.json()) as UserDtoOut;
    expect(ppBody.profilePicture, 'BE-resolved canonical URL').toBe(upload!.publicUrl);

    // address create
    const create = await api(page, 'POST', `/address/user/${userId}`, {
      street: 'Influencer Street',
      city: 'Gdansk',
      postalCode: '80-001',
      country: 'Poland',
      primary: false,
      addressType: 'Test Address',
    });
    expect([200, 201].includes(create.status()), 'INFLUENCER address create').toBe(true);
    const created = (await create.json()) as AddressDtoOut;
    const addressId = created.id;

    // preferences batch
    const prefs = await api(page, 'PATCH', '/user-preferences/me', {
      language: 'en',
      sharePhoneForPayments: true,
    });
    expect(prefs.status(), 'INFLUENCER PATCH preferences batch should be 200').toBe(200);

    // cleanup
    if (typeof addressId === 'number' && Number.isFinite(addressId)) {
      await api(page, 'DELETE', `/address/${addressId}`);
    }
  });
});
