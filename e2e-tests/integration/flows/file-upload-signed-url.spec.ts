import { expect, test } from '@playwright/test';
import { BE_URL, GREENFIELD_URL, seedSession } from '../_actor';
import { getMyId, uploadTrackedPhoto } from '../_helpers';

/**
 * T21 — Port of `file-upload-signed-url.feature` (2 consolidated scenarios,
 * each with 15+ assertions split across TEST 1..8 sections).
 *
 * Source of truth: `checkitout-backend/.../features/files/file-upload-signed-url.feature`
 *
 * Coverage strategy: each TEST section of the BE consolidated scenario
 * maps to one Playwright test here. The PUT-to-storage + confirm steps
 * work against the real bucket since the direct-to-bucket CORS setup
 * (BE 388358dc) — the full round-trips are live tests now; they still
 * self-skip when the upload controller is absent in the profile.
 *
 * Coverage map (BE TEST → FE test):
 *
 *   ✅ Company TEST 1 "Successful profile photo upload" — full pipeline
 *      (signed-url → PUT → confirm → PATCH tracked uploadId → canonical URL)
 *   ✅ Company TEST 2 "Content upload" — full pipeline, CONTENT uploadType
 *   ✅ Company TEST 3 "File too large (15MB)" — validation, no PUT
 *   ✅ Company TEST 4 "Invalid content type (PDF)" — validation
 *   ✅ Company TEST 5 "Boundary 5MB exact" — validation
 *   ✅ Company TEST 6 "Over boundary 5MB+1" — validation
 *   ✅ Company TEST 7 "Invalid filename pattern" — validation
 *   ✅ Company TEST 8 "WebP format" — request-only part portable
 *   ✅ Influencer TEST 1 (partial) "Profile photo signed URL + rateLimitInfo"
 *   ✅ Influencer TEST 2 "GIF format" — request-only
 *
 * Bug class caught: signed-URL contract drift (response shape, rate-limit
 * info field names, validation message format). Used by FE
 * content-submission + profile-photo-upload flows.
 *
 * The controller is `@ConditionalOnBean(SignedUrlService.class)` — in a
 * dev profile without Firebase Storage configured, all endpoints 404.
 * The spec probes the controller via GET /upload/limits and skips
 * gracefully if absent.
 *
 * Run: `npm run test:integration -- --grep file-upload-signed-url`
 */

const UNIQUE_COMPANY = () =>
  `t21-co-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@e2e.test`;
const UNIQUE_INFLUENCER = () =>
  `t21-in-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@e2e.test`;

async function probeUploadControllerOrSkip(page: import('@playwright/test').Page): Promise<void> {
  const probe = await page.request.get(`${GREENFIELD_URL}/api/upload/limits`, {
    ignoreHTTPSErrors: true,
    failOnStatusCode: false,
  });
  if (probe.status() === 404) {
    test.skip(
      true,
      'FileUploadController is @ConditionalOnBean(SignedUrlService.class) — bean unregistered (no Firebase Storage config in this profile). Set GOOGLE_APPLICATION_CREDENTIALS + firebase.storage.bucket to exercise these scenarios.',
    );
  }
}

test.describe('@file-upload @signed-url — port of file-upload-signed-url.feature', () => {
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

  // ====================================================================
  // Full round-trips — live against the real bucket (CORS: BE 388358dc)
  // ====================================================================

  test('@company Successful PROFILE_PHOTO upload — full round-trip', async ({ page }) => {
    await seedSession(page, UNIQUE_COMPANY(), 'COMPANY');
    await probeUploadControllerOrSkip(page);
    const userId = await getMyId(page);

    const upload = await uploadTrackedPhoto(page, 'PROFILE_PHOTO');
    if (!upload) {
      test.skip(true, 'upload controller absent (no Firebase Storage in this profile)');
    }

    // The tracked uploadId is what profile PATCHes send; the BE resolves it
    // to ITS canonical stored URL (uploadId-only contract, pentest 3.1).
    const res = await page.request.patch(`${GREENFIELD_URL}/api/users/${userId}`, {
      data: { profilePicture: upload!.uploadId },
      ignoreHTTPSErrors: true,
      failOnStatusCode: false,
    });
    expect(
      res.status(),
      `PATCH tracked uploadId should be 200 — got ${res.status()}: ${await res.text()}`,
    ).toBe(200);
    const body = (await res.json()) as { profilePicture?: string };
    expect(body.profilePicture, 'BE returns its canonical stored URL').toBe(upload!.publicUrl);
  });

  test('@company Successful CONTENT upload — full round-trip', async ({ page }) => {
    await seedSession(page, UNIQUE_COMPANY(), 'COMPANY');
    await probeUploadControllerOrSkip(page);

    // CONTENT uploads attach to collaborations, not the user row — the
    // round-trip proof here is the tracked pipeline itself completing:
    // signed-url → PUT to the bucket → confirm all 2xx, with the canonical
    // public URL minted by the BE.
    const upload = await uploadTrackedPhoto(page, 'CONTENT');
    if (!upload) {
      test.skip(true, 'upload controller absent (no Firebase Storage in this profile)');
    }
    expect(upload!.uploadId, 'confirm returned a tracked uploadId').toBeTruthy();
    // A signed cloud URL in the real profiles; the dev-lite profile routes uploads to its local
    // sink and answers with the sink's own path, which is the same contract without the cloud.
    expect(upload!.publicUrl, 'BE mints the public URL').toMatch(/^(https:\/\/|\/api\/dev-lite\/files\/)/);
  });

  // ====================================================================
  // Validation-only scenarios — fully portable
  // ====================================================================

  // BE Company TEST 3: File too large (>10MB stated in BE comment, actual BE Max is 5MB)
  test('@company @validation file too large returns 400', async ({ page }) => {
    await seedSession(page, UNIQUE_COMPANY(), 'COMPANY');
    await probeUploadControllerOrSkip(page);
    const res = await page.request.post(`${GREENFIELD_URL}/api/upload/signed-url`, {
      data: {
        filename: 'huge-image.jpg',
        contentType: 'image/jpeg',
        fileSize: 15_000_000,
        uploadType: 'CONTENT',
      },
      ignoreHTTPSErrors: true,
      failOnStatusCode: false,
    });
    expect(res.status(), `15MB file should return 400 — got ${res.status()}`).toBe(400);
  });

  // BE Company TEST 4: Invalid content type (PDF)
  test('@company @validation invalid content type returns 400', async ({ page }) => {
    await seedSession(page, UNIQUE_COMPANY(), 'COMPANY');
    await probeUploadControllerOrSkip(page);
    const res = await page.request.post(`${GREENFIELD_URL}/api/upload/signed-url`, {
      data: {
        filename: 'document.pdf',
        contentType: 'application/pdf',
        fileSize: 500_000,
      },
      ignoreHTTPSErrors: true,
      failOnStatusCode: false,
    });
    expect(res.status(), `PDF content-type should return 400 — got ${res.status()}`).toBe(400);
  });

  // BE Company TEST 5: Exactly 5MB (boundary — should pass)
  test('@company @boundary exactly 5MB returns 200 with signed-URL fields', async ({ page }) => {
    await seedSession(page, UNIQUE_COMPANY(), 'COMPANY');
    await probeUploadControllerOrSkip(page);
    const res = await page.request.post(`${GREENFIELD_URL}/api/upload/signed-url`, {
      data: {
        filename: 'max-size.jpg',
        contentType: 'image/jpeg',
        fileSize: 5_242_880,
        uploadType: 'CONTENT',
      },
      ignoreHTTPSErrors: true,
      failOnStatusCode: false,
    });
    expect(res.status(), `5MB exact should return 200 — got ${res.status()}`).toBe(200);
    const body = await res.json();
    expect(body, 'response contains uploadUrl').toHaveProperty('uploadUrl');
    expect(body, 'response contains publicUrl').toHaveProperty('publicUrl');
    expect(body, 'response contains uploadId').toHaveProperty('uploadId');
    // Google Cloud Storage in the real profiles; the dev-lite profile hands out its local sink's
    // upload path instead — same contract, no cloud.
    expect(String(body.uploadUrl), 'uploadUrl is a GCS signed URL or the dev-lite sink').toMatch(
      /^(https:\/\/storage\.googleapis\.com|\/api\/dev-lite\/upload\/)/,
    );
  });

  // BE Company TEST 6: 5MB + 1 byte (over boundary — should fail)
  test('@company @boundary 5MB + 1 byte returns 400', async ({ page }) => {
    await seedSession(page, UNIQUE_COMPANY(), 'COMPANY');
    await probeUploadControllerOrSkip(page);
    const res = await page.request.post(`${GREENFIELD_URL}/api/upload/signed-url`, {
      data: {
        filename: 'over-max.jpg',
        contentType: 'image/jpeg',
        fileSize: 5_242_881,
      },
      ignoreHTTPSErrors: true,
      failOnStatusCode: false,
    });
    expect(res.status(), `5MB+1 should return 400 — got ${res.status()}`).toBe(400);
  });

  // BE Company TEST 7: Invalid filename pattern (spaces)
  test('@company @validation invalid filename pattern returns 400', async ({ page }) => {
    await seedSession(page, UNIQUE_COMPANY(), 'COMPANY');
    await probeUploadControllerOrSkip(page);
    const res = await page.request.post(`${GREENFIELD_URL}/api/upload/signed-url`, {
      data: {
        filename: 'file with spaces.jpg',
        contentType: 'image/jpeg',
        fileSize: 500_000,
      },
      ignoreHTTPSErrors: true,
      failOnStatusCode: false,
    });
    expect(res.status(), `filename-with-spaces should return 400 — got ${res.status()}`).toBe(400);
  });

  // BE Company TEST 8: WebP format (signed-URL request portion only)
  test('@company @format WebP format signed-URL request returns 200', async ({ page }) => {
    await seedSession(page, UNIQUE_COMPANY(), 'COMPANY');
    await probeUploadControllerOrSkip(page);
    const res = await page.request.post(`${GREENFIELD_URL}/api/upload/signed-url`, {
      data: {
        filename: 'modern-image.webp',
        contentType: 'image/webp',
        fileSize: 200_000,
      },
      ignoreHTTPSErrors: true,
      failOnStatusCode: false,
    });
    expect(res.status(), `WebP request should return 200 — got ${res.status()}`).toBe(200);
  });

  // BE Influencer TEST 1 (signed-URL request portion):
  //   Profile photo signed-URL + rateLimitInfo fields present
  test('@influencer @profile-photo PROFILE_PHOTO request returns 200 + rateLimitInfo', async ({
    page,
  }) => {
    await seedSession(page, UNIQUE_INFLUENCER(), 'INFLUENCER');
    await probeUploadControllerOrSkip(page);
    const res = await page.request.post(`${GREENFIELD_URL}/api/upload/signed-url`, {
      data: {
        filename: 'influencer-avatar.jpg',
        contentType: 'image/jpeg',
        fileSize: 300_000,
        uploadType: 'PROFILE_PHOTO',
      },
      ignoreHTTPSErrors: true,
      failOnStatusCode: false,
    });
    expect(res.status(), `PROFILE_PHOTO request should return 200 — got ${res.status()}`).toBe(200);
    const body = await res.json();
    expect(body, 'response contains rateLimitInfo').toHaveProperty('rateLimitInfo');
    expect(body.rateLimitInfo, 'rateLimitInfo.remainingHourly should be present').toHaveProperty(
      'remainingHourly',
    );
    expect(body.rateLimitInfo, 'rateLimitInfo.remainingDaily should be present').toHaveProperty(
      'remainingDaily',
    );
  });

  // BE Influencer TEST 2: GIF format
  test('@influencer @format GIF format signed-URL request returns 200', async ({ page }) => {
    await seedSession(page, UNIQUE_INFLUENCER(), 'INFLUENCER');
    await probeUploadControllerOrSkip(page);
    const res = await page.request.post(`${GREENFIELD_URL}/api/upload/signed-url`, {
      data: {
        filename: 'animated.gif',
        contentType: 'image/gif',
        fileSize: 800_000,
      },
      ignoreHTTPSErrors: true,
      failOnStatusCode: false,
    });
    expect(res.status(), `GIF request should return 200 — got ${res.status()}`).toBe(200);
  });
});
