import { ACTORS } from '../../_framework/actor';
import type { ApiResult } from '../../_framework/api/http-client';
import { FileUploadApi } from '../../_framework/api/file-upload.api';
import { ProfileApi } from '../../_framework/api/profile.api';
import { TestSession } from '../../_framework/api/test-session';
import { After, Given, Then, When, expect, test } from './fixtures';

import {
  FileUploadRequestContentTypeEnum,
  type FileUploadRequest,
} from '../../../src/app/api/model/file-upload-request';
import type { FileUploadResponse } from '../../../src/app/api/model/file-upload-response';
import type { RateLimitInfo } from '../../../src/app/api/model/rate-limit-info';

/**
 * File-upload oracle — Layer 2 (functional), for the BE corpus
 * files/file-upload-signed-url.feature, driven THROUGH the Layer-1 services
 * against the LIVE BE, mirroring the BE glue (FileUploadSteps.java).
 *
 * ProfileApi owns the typed signed-URL surface (request / PUT-to-storage /
 * confirm / limits — written for the profile-photo flow, endpoints
 * identical); FileUploadApi adds the deliberately OFF-contract request the
 * validation scenarios need (contentType off the generated enum). The steps
 * below are thin orchestration + soft assertions, so a BE contract change
 * breaks L0 (generated FileUploadRequest/Response) → L1 → here at compile
 * time.
 *
 * One mock-session actor per scenario (company1 or influencer1 — the BE's
 * real-Firebase password/OAuth logins collapse per the S6 port rule). Both
 * scenarios self-skip when GET /upload/limits 404s: FileUploadController is
 * @ConditionalOnBean(SignedUrlService.class) and is absent on a BE without
 * Firebase Storage config (profile.steps.ts precedent).
 *
 * Test images are deterministic byte buffers with the right magic numbers
 * (PNG/JPEG/GIF/WebP) padded to the requested size — the FE analogue of the
 * BE glue's ImageIO generator. Unlike the BE glue (which converts WebP→PNG
 * because ImageIO cannot encode WebP), the WebP step uploads REAL RIFF/WEBP
 * bytes under the image/webp type the URL was signed for.
 *
 * State lives on a local World view (cast pattern — fixtures.ts untouched)
 * under fu*-prefixed keys so the other oracles' After hooks ignore it.
 */

interface FileUploadWorld {
  /** Session of the uploading actor (company1 or influencer1 mock-session). */
  fuSession?: TestSession;
  /** Numeric user id of the actor (PATCH /users/{id} for the profilePicture step). */
  fuUserId?: number;
  /** Signed-URL response of the last successful /upload/signed-url call. */
  fuUpload?: FileUploadResponse;
  /** Content type the last signed URL was requested with (the PUT must match it). */
  fuUploadContentType?: string;
  lastResponse?: { status: number; headers: Record<string, string>; body?: string };
}

type Table = { rowsHash(): Record<string, string> };

// ── Helpers ──────────────────────────────────────────────────────────────────

function record(w: FileUploadWorld, r: ApiResult): void {
  w.lastResponse = { status: r.status, headers: r.headers, body: r.body };
}

function snippet(w: FileUploadWorld): string {
  return (w.lastResponse?.body ?? '(none)').slice(0, 300);
}

function requireSession(w: FileUploadWorld): TestSession {
  if (!w.fuSession) throw new Error('no file-upload actor session — did the signed-in Given run?');
  return w.fuSession;
}

function requireUserId(w: FileUploadWorld): number {
  if (w.fuUserId == null) throw new Error('no file-upload user id — did the signed-in Given run?');
  return w.fuUserId;
}

function requireUpload(w: FileUploadWorld): FileUploadResponse {
  if (!w.fuUpload) throw new Error('no signed-url response — did the request step succeed?');
  return w.fuUpload;
}

/** Typed signed-URL surface (request/PUT/confirm/limits) — endpoints shared with the profile flow. */
function profileApi(w: FileUploadWorld): ProfileApi {
  return new ProfileApi(requireSession(w));
}

function uploadApi(w: FileUploadWorld): FileUploadApi {
  return new FileUploadApi(requireSession(w));
}

/**
 * Deterministic fake image: the format's magic numbers padded with zeros to
 * the requested size — the FE analogue of the BE glue's ImageIO generator
 * (GCS validates the signed Content-Type, not the pixel payload).
 */
function testImageBytes(contentType: string, sizeBytes: number): Buffer {
  let magic: Buffer;
  switch (contentType) {
    case 'image/png':
      magic = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      break;
    case 'image/gif':
      magic = Buffer.from('GIF89a', 'ascii');
      break;
    case 'image/webp': {
      // RIFF container: 'RIFF' + little-endian payload size + 'WEBP'.
      const riff = Buffer.alloc(12);
      riff.write('RIFF', 0, 'ascii');
      riff.writeUInt32LE(Math.max(4, sizeBytes - 8), 4);
      riff.write('WEBP', 8, 'ascii');
      magic = riff;
      break;
    }
    default:
      magic = Buffer.from([0xff, 0xd8, 0xff, 0xe0]); // JPEG SOI + APP0 marker
  }
  return Buffer.concat([magic, Buffer.alloc(Math.max(0, sizeBytes - magic.length), 0)]);
}

/** PUT a generated test image of the given size to the last signed URL. */
async function putToSignedUrl(w: FileUploadWorld, sizeBytes: number): Promise<void> {
  const upload = requireUpload(w);
  expect(upload.uploadUrl, 'signed-url response must carry uploadUrl').toBeTruthy();
  const contentType = w.fuUploadContentType ?? 'image/jpeg';
  record(
    w,
    await profileApi(w).uploadToSignedUrl(
      upload.uploadUrl!,
      contentType,
      testImageBytes(contentType, sizeBytes),
    ),
  );
}

/** POST /upload/confirm/{uploadId}?filePath=… for the last signed URL. */
async function confirmUpload(w: FileUploadWorld): Promise<void> {
  const upload = requireUpload(w);
  expect(upload.uploadId, 'signed-url response must carry uploadId').toBeTruthy();
  expect(upload.filePath, 'signed-url response must carry filePath').toBeTruthy();
  record(w, await profileApi(w).confirmUpload(upload.uploadId!, upload.filePath!));
}

After(async ({ world }) => {
  const w = world as FileUploadWorld;
  await w.fuSession?.dispose().catch(() => undefined);
  w.fuSession = undefined;
});

// ── Actor seeding (mock-session collapse of the BE login variants) ───────────

Given(
  'the {word} actor is signed in for file uploads',
  async ({ playwright, world }, who: string) => {
    const w = world as FileUploadWorld;
    const actor = ACTORS[`${who}1`];
    if (!actor) throw new Error(`unknown actor role "${who}" — expected company or influencer`);
    w.fuSession = await TestSession.open(playwright, actor);
    // Order-independence: another oracle can leave the fixed actor non-ACTIVE.
    await w.fuSession.activate();
    w.fuUserId = await w.fuSession.userId();
  },
);

Given('signed-url uploads are available to this actor', async ({ world }) => {
  const w = world as FileUploadWorld;
  const r = await profileApi(w).uploadLimits();
  test.skip(
    r.status === 404,
    'SignedUrlService bean absent (no Firebase Storage in this BE profile) — /upload/** 404s',
  );
});

// ── Signed-URL request (table form, incl. uploadType) ────────────────────────

When(
  'the {word} requests a signed URL for file:',
  async ({ world }, _who: string, table: Table) => {
    const w = world as FileUploadWorld;
    const row = table.rowsHash();
    const filename = row['filename'];
    const contentType = row['contentType'];
    const fileSize = Number(row['fileSize']);
    const uploadType = row['uploadType'];

    const legalContentTypes = Object.values(FileUploadRequestContentTypeEnum) as string[];
    let r: ApiResult<FileUploadResponse>;
    if (legalContentTypes.includes(contentType)) {
      const req: FileUploadRequest = {
        filename,
        contentType: contentType as FileUploadRequestContentTypeEnum,
        fileSize,
        ...(uploadType ? { uploadType } : {}),
      };
      r = await profileApi(w).requestSignedUrl(req);
    } else {
      // Deliberately OFF-contract (e.g. application/pdf): the value is off the
      // generated enum by construction — prove the BE rejects it with 400.
      r = await uploadApi(w).requestSignedUrlRaw({
        filename,
        contentType,
        fileSize,
        ...(uploadType ? { uploadType } : {}),
      });
    }
    record(w, r);
    if (r.ok) {
      w.fuUpload = r.json;
      w.fuUploadContentType = contentType;
    }
  },
);

// ── Signed-URL response assertions ───────────────────────────────────────────

Then('soft assert signed URL response status is {int}', async ({ world }, expected: number) => {
  const w = world as FileUploadWorld;
  expect
    .soft(w.lastResponse?.status, `/upload/signed-url status; response body: ${snippet(w)}`)
    .toBe(expected);
});

Then('soft assert response contains {word}', async ({ world }, field: string) => {
  const w = world as FileUploadWorld;
  // Typed switch over the generated FileUploadResponse — a renamed field
  // breaks this oracle at compile time.
  let value: unknown;
  switch (field) {
    case 'uploadUrl':
      value = w.fuUpload?.uploadUrl;
      break;
    case 'publicUrl':
      value = w.fuUpload?.publicUrl;
      break;
    case 'uploadId':
      value = w.fuUpload?.uploadId;
      break;
    case 'rateLimitInfo':
      value = w.fuUpload?.rateLimitInfo;
      break;
    default:
      throw new Error(`unsupported FileUploadResponse field "${field}"`);
  }
  expect
    .soft(value, `signed-url response should contain ${field}; body: ${snippet(w)}`)
    .toBeTruthy();
});

Then('soft assert rateLimitInfo.{word} is present', async ({ world }, field: string) => {
  const w = world as FileUploadWorld;
  const info: RateLimitInfo | undefined = w.fuUpload?.rateLimitInfo;
  let value: number | undefined;
  switch (field) {
    case 'remainingHourly':
      value = info?.remainingHourly;
      break;
    case 'remainingDaily':
      value = info?.remainingDaily;
      break;
    default:
      throw new Error(`unsupported RateLimitInfo field "${field}"`);
  }
  expect
    .soft(value != null, `rateLimitInfo.${field} should be present; body: ${snippet(w)}`)
    .toBe(true);
});

Then('soft assert uploadUrl starts with {string}', async ({ world }, prefix: string) => {
  const w = world as FileUploadWorld;
  const uploadUrl = w.fuUpload?.uploadUrl ?? '';
  expect
    .soft(
      uploadUrl.startsWith(prefix),
      `uploadUrl should start with ${prefix} — got "${uploadUrl.slice(0, 80)}"`,
    )
    .toBe(true);
});

// ── Upload to Firebase Storage (PUT to the signed URL) ───────────────────────

When(
  'the {word} uploads test image \\({int}KB\\) to the signed URL using PUT',
  async ({ world }, _who: string, sizeKB: number) => {
    await putToSignedUrl(world as FileUploadWorld, sizeKB * 1024);
  },
);

When(
  'the {word} uploads test image \\({int}MB\\) to the signed URL using PUT',
  async ({ world }, _who: string, sizeMB: number) => {
    await putToSignedUrl(world as FileUploadWorld, sizeMB * 1024 * 1024);
  },
);

When('the {word} uploads test image to signed URL', async ({ world }, _who: string) => {
  // BE glue default: 100KB.
  await putToSignedUrl(world as FileUploadWorld, 100 * 1024);
});

When('the {word} uploads test webp image to signed URL', async ({ world }, _who: string) => {
  // BE glue: 50KB — but converted to PNG (ImageIO limitation). Here the bytes
  // are REAL RIFF/WEBP under the image/webp type stored by the request step.
  await putToSignedUrl(world as FileUploadWorld, 50 * 1024);
});

Then(
  'soft assert Firebase upload response is success \\({int}-{int}\\)',
  async ({ world }, min: number, max: number) => {
    const w = world as FileUploadWorld;
    const status = w.lastResponse?.status ?? -1;
    expect
      .soft(
        status >= min && status <= max,
        `Firebase upload should succeed (${min}-${max}), got ${status}; body: ${snippet(w)}`,
      )
      .toBe(true);
  },
);

// ── Confirm upload ───────────────────────────────────────────────────────────

When('the {word} confirms upload with uploadId and filePath', async ({ world }, _who: string) => {
  await confirmUpload(world as FileUploadWorld);
});

// BE source: '"X" confirms upload' — renamed (see feature header): the profile
// oracle owns 'the {word} confirms upload', bound to ITS scenario state.
When('the {word} confirms the upload', async ({ world }, _who: string) => {
  await confirmUpload(world as FileUploadWorld);
});

Then('soft assert confirm response status is {int}', async ({ world }, expected: number) => {
  const w = world as FileUploadWorld;
  expect
    .soft(w.lastResponse?.status, `/upload/confirm status; response body: ${snippet(w)}`)
    .toBe(expected);
});

// ── Update profile with the uploaded file ────────────────────────────────────

// BE source: '"X" updates their profilePicture to the uploaded URL' and
// '"X" updates profilePicture to publicUrl' — renamed (see feature header):
// the profile oracle owns the BE-literal text, bound to ITS scenario state.
When(
  'the {word} sets their profilePicture to the uploaded public URL',
  async ({ world }, _who: string) => {
    const w = world as FileUploadWorld;
    const upload = requireUpload(w);
    // uploadId-only contract (pentest 3.1): the PATCH carries the tracked
    // uploadId; the BE resolves ownership + blob existence and derives the
    // stored URL itself (a raw publicUrl — even our own — is rejected).
    expect(upload.uploadId, 'signed-url response must carry uploadId').toBeTruthy();
    record(w, await profileApi(w).patchUser(requireUserId(w), { profilePicture: upload.uploadId }));
  },
);

Then('soft assert GET \\/users\\/me shows the new profilePicture URL', async ({ world }) => {
  const w = world as FileUploadWorld;
  const r = await profileApi(w).me();
  expect.soft(r.ok, `GET /users/me failed: HTTP ${r.status}`).toBeTruthy();
  expect
    .soft(r.json.profilePicture, 'profilePicture should match the uploaded publicUrl')
    .toBe(requireUpload(w).publicUrl);
});

Then('soft assert profile update succeeds', async ({ world }) => {
  const w = world as FileUploadWorld;
  const status = w.lastResponse?.status ?? -1;
  expect
    .soft(
      status >= 200 && status < 300,
      `profile update should succeed (2xx), got ${status}; body: ${snippet(w)}`,
    )
    .toBe(true);
});

// ── Validation-error assertions ──────────────────────────────────────────────

Then(
  'soft assert upload error contains validation for {word}',
  async ({ world }, field: string) => {
    const w = world as FileUploadWorld;
    // The BE glue (FileUploadSteps.softAssert*Error) asserts ONLY the 400 — no
    // message inspection (and none here either: the BE dictionary answers
    // Polish on this DB). The field name keeps the feature line traceable.
    expect
      .soft(
        w.lastResponse?.status,
        `${field} validation should return 400; response body: ${snippet(w)}`,
      )
      .toBe(400);
  },
);
