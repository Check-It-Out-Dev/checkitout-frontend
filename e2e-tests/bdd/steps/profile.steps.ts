import { ACTORS } from '../../_framework/actor';
import type { ApiResult } from '../../_framework/api/http-client';
import { ProfileApi, type UserProfilePatch } from '../../_framework/api/profile.api';
import { TestSession } from '../../_framework/api/test-session';
import { After, Given, Then, When, expect, test } from './fixtures';

import { AccountStatus } from '../../../src/app/api/model/account-status';
import {
  AddressDtoInAddressTypeEnum,
  type AddressDtoIn,
} from '../../../src/app/api/model/address-dto-in';
import {
  FileUploadRequestContentTypeEnum,
  type FileUploadRequest,
} from '../../../src/app/api/model/file-upload-request';
import type { FileUploadResponse } from '../../../src/app/api/model/file-upload-response';
import {
  UserPreferencesDtoInCommunicationFrequencyEnum,
  UserPreferencesDtoInLanguageEnum,
  type UserPreferencesDtoIn,
} from '../../../src/app/api/model/user-preferences-dto-in';

/**
 * Profile oracle — Layer 2 (functional), for the three BE profile features
 * (profile-critical-consolidated / profile-non-critical-consolidated /
 * validation-edge-cases), driven THROUGH the Layer-1 ProfileApi against the
 * LIVE BE, mirroring the BE glue (ProfileUpdateSteps.java +
 * FileUploadSteps.java + the token checks from AdvancedSessionSecuritySteps).
 *
 * One edited actor per scenario (company1 or influencer1 mock-session) plus an
 * optional admin session for the restore steps. The edited actor's TestSession
 * doubles as the BE's "stored original token": the HttpOnly cookie jar minted
 * at sign-in keeps calling /users/me after each critical-field PATCH — if the
 * BE started invalidating sessions on profile edits, those calls would 401/419.
 *
 * Soft assertions are Playwright expect.soft — failures accumulate and fail
 * the scenario at teardown, exactly like the BE SoftAssertionContext; the
 * "all soft assertions should pass" step is the flush marker.
 *
 * State lives on a local World view (cast pattern — fixtures.ts untouched)
 * under profile*-prefixed keys so the other oracles' After hooks ignore it.
 */

interface ProfileWorld {
  /** Session of the actor whose profile is being edited (the "original token"). */
  profileSession?: TestSession;
  /** Admin session for the restore/cleanup steps. */
  profileAdminSession?: TestSession;
  /** Numeric user id of the edited actor (PATCH /users/{id}). */
  profileUserId?: number;
  /** firstName/lastName captured at scenario start, for the admin restore. */
  profileOriginal?: { firstName?: string; lastName?: string };
  /** id of the address created by the last create-address step. */
  profileAddressId?: number;
  /** Last companyDescription value set, for the GET /users/me echo assert. */
  profileLastDescription?: string;
  /** Signed-URL response of the last /upload/signed-url call. */
  profileUpload?: FileUploadResponse;
  /** Content type the signed URL was requested with (the PUT must match it). */
  profileUploadContentType?: string;
  lastResponse?: { status: number; headers: Record<string, string>; body?: string };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function record(w: ProfileWorld, r: ApiResult): void {
  w.lastResponse = { status: r.status, headers: r.headers, body: r.body };
}

function snippet(w: ProfileWorld): string {
  return (w.lastResponse?.body ?? '(none)').slice(0, 300);
}

function requireSession(w: ProfileWorld): TestSession {
  if (!w.profileSession) throw new Error('no profile actor session — did the signed-in Given run?');
  return w.profileSession;
}

function profileApi(w: ProfileWorld): ProfileApi {
  return new ProfileApi(requireSession(w));
}

function adminApi(w: ProfileWorld): ProfileApi {
  if (!w.profileAdminSession) throw new Error('no admin session — did the admin Given run?');
  return new ProfileApi(w.profileAdminSession);
}

function requireUserId(w: ProfileWorld): number {
  if (w.profileUserId == null) throw new Error('no profile user id — did the signed-in Given run?');
  return w.profileUserId;
}

function requireOriginal(w: ProfileWorld): { firstName?: string; lastName?: string } {
  if (!w.profileOriginal) {
    throw new Error('no stored original profile values — did the stores-original Given run?');
  }
  return w.profileOriginal;
}

function requireUpload(w: ProfileWorld): FileUploadResponse {
  if (!w.profileUpload) throw new Error('no signed-url response — did the request step run?');
  return w.profileUpload;
}

function softStatus(w: ProfileWorld, expected: number, label: string): void {
  expect
    .soft(w.lastResponse?.status, `${label} status; response body: ${snippet(w)}`)
    .toBe(expected);
}

function softStatusIn(w: ProfileWorld, allowed: number[], label: string): void {
  const status = w.lastResponse?.status ?? -1;
  expect
    .soft(allowed, `${label} status — got ${status}; response body: ${snippet(w)}`)
    .toContain(status);
}

/**
 * Typed sparse-PATCH body for one profile field. Each branch is checked
 * against the generated models (UserProfilePatch), so a renamed/removed DTO
 * field breaks this oracle at compile time.
 */
function userPatchFor(field: string, value: string): UserProfilePatch {
  switch (field) {
    case 'firstName':
      return { firstName: value };
    case 'lastName':
      return { lastName: value };
    case 'phoneNumber':
      return { phoneNumber: value };
    case 'name':
      return { name: value };
    case 'email':
      return { email: value };
    case 'profilePicture':
      return { profilePicture: value };
    case 'companyDescription':
      return { companyDescription: value };
    case 'nip':
      return { nip: value };
    default:
      throw new Error(`unsupported profile field "${field}"`);
  }
}

/**
 * users.phone_number is DB-UNIQUE, and the corpus' literal phone constants
 * are already held by the BE Cucumber suite's real actors (both suites run
 * against the same database). Rotate every digit by an actor-derived offset
 * — length, charset and layout are preserved, so format/boundary semantics
 * stay exactly what the corpus tests, while values become collision-free
 * per actor (a fixed literal would 409 "already exists").
 */
function actorUniquePhone(w: ProfileWorld, value: string): string {
  const offset = requireUserId(w) % 9 || 1;
  return value.replace(/\d/g, (d) => String((Number(d) + offset) % 10));
}

async function patchProfileField(w: ProfileWorld, field: string, value: string): Promise<void> {
  const body =
    field === 'phoneNumber'
      ? userPatchFor(field, actorUniquePhone(w, value))
      : userPatchFor(field, value);
  const r = await profileApi(w).patchUser(requireUserId(w), body);
  record(w, r);
  if (field === 'companyDescription') w.profileLastDescription = value;
}

/**
 * Typed preferences patch for one field. Enum-backed fields are guarded
 * against the generated enums, so a contract change breaks the oracle.
 */
function prefsPatchFor(field: string, value: string): UserPreferencesDtoIn {
  switch (field) {
    case 'language': {
      const languages = Object.values(UserPreferencesDtoInLanguageEnum) as string[];
      if (!languages.includes(value)) {
        throw new Error(`"${value}" is not a UserPreferencesDtoInLanguageEnum member`);
      }
      return { language: value as UserPreferencesDtoInLanguageEnum };
    }
    case 'timezone':
      return { timezone: value };
    case 'communicationFrequency': {
      const frequencies = Object.values(UserPreferencesDtoInCommunicationFrequencyEnum) as string[];
      if (!frequencies.includes(value)) {
        throw new Error(
          `"${value}" is not a UserPreferencesDtoInCommunicationFrequencyEnum member`,
        );
      }
      return { communicationFrequency: value as UserPreferencesDtoInCommunicationFrequencyEnum };
    }
    case 'gdprMarketingConsent':
      return { gdprMarketingConsent: value === 'true' };
    case 'sharePhoneForPayments':
      return { sharePhoneForPayments: value === 'true' };
    default:
      throw new Error(`unsupported preferences field "${field}"`);
  }
}

/** The BE glue's full valid address, on the generated contract enum. */
function baseAddress(): AddressDtoIn {
  return {
    street: 'Test Street',
    city: 'Test City',
    postalCode: '00-001',
    country: 'Poland',
    primary: false,
    addressType: AddressDtoInAddressTypeEnum.SECONDARY,
  };
}

async function createAddress(
  w: ProfileWorld,
  street: string,
  city: string,
  postalCode: string,
  country: string,
): Promise<void> {
  const dto: AddressDtoIn = {
    street,
    city,
    postalCode,
    country,
    primary: false,
    addressType: AddressDtoInAddressTypeEnum.SECONDARY,
  };
  const r = await profileApi(w).createAddressForUser(requireUserId(w), dto);
  record(w, r);
  if (r.ok && typeof r.json.id === 'number') w.profileAddressId = r.json.id;
}

async function deleteCreatedAddress(w: ProfileWorld): Promise<void> {
  // Mirrors the BE glue: silently skip when creation failed — the soft-assert
  // flow keeps going and the creation failure is already recorded.
  if (w.profileAddressId == null) return;
  record(w, await profileApi(w).deleteAddress(w.profileAddressId));
  w.profileAddressId = undefined;
}

/** Deterministic fake image bytes with the right magic numbers for the PUT. */
function fakeImageBytes(contentType: string): Buffer {
  const magic =
    contentType === 'image/png'
      ? Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
      : Buffer.from([0xff, 0xd8, 0xff, 0xe0]); // JPEG SOI + APP0 marker
  return Buffer.concat([magic, Buffer.alloc(1024, 0)]);
}

async function adminRestore(
  w: ProfileWorld,
  fields: Array<'firstName' | 'lastName'>,
): Promise<void> {
  const original = requireOriginal(w);
  const patch: UserProfilePatch = {};
  if (fields.includes('firstName') && original.firstName) patch.firstName = original.firstName;
  if (fields.includes('lastName') && original.lastName) patch.lastName = original.lastName;
  // Fresh mock-session actors are created without names — nothing to restore
  // on the very first run against a clean dev DB.
  if (Object.keys(patch).length === 0) return;
  const r = await adminApi(w).patchUser(requireUserId(w), patch);
  record(w, r);
  expect(
    r.ok,
    `admin restore ${fields.join('+')} failed: HTTP ${r.status} ${snippet(w)}`,
  ).toBeTruthy();
}

After(async ({ world }) => {
  const w = world as ProfileWorld;
  await w.profileSession?.dispose().catch(() => undefined);
  await w.profileAdminSession?.dispose().catch(() => undefined);
});

// ── Actor seeding (mock-session collapse of the BE login variants) ───────────

Given(
  'the {word} actor is signed in for profile editing',
  async ({ playwright, world }, who: string) => {
    const w = world as ProfileWorld;
    const actor = ACTORS[`${who}1`];
    if (!actor) throw new Error(`unknown actor role "${who}" — expected company or influencer`);
    w.profileSession = await TestSession.open(playwright, actor);
    // Order-independence: another oracle can leave the fixed actor non-ACTIVE.
    await w.profileSession.activate();
    w.profileUserId = await w.profileSession.userId();
  },
);

Given('the {word} stores their original profile values', async ({ world }, _who: string) => {
  const w = world as ProfileWorld;
  const r = await profileApi(w).me();
  expect(r.ok, `GET /users/me failed: HTTP ${r.status}`).toBeTruthy();
  w.profileOriginal = { firstName: r.json.firstName, lastName: r.json.lastName };
});

Given('the admin actor is signed in for profile cleanup', async ({ playwright, world }) => {
  const w = world as ProfileWorld;
  // The BE's ADMIN password + KMS-2FA login collapses to mock-session — the
  // 2FA upgrade path has its own oracle (admin-2fa-kms.feature).
  w.profileAdminSession = await TestSession.open(playwright, ACTORS['admin1']);
});

// ── Profile field updates ────────────────────────────────────────────────────

When(
  'the {word} updates their {word} to {string}',
  async ({ world }, _who: string, field: string, value: string) => {
    await patchProfileField(world as ProfileWorld, field, value);
  },
);

When(
  'the {word} attempts to update {word} with value {string}',
  async ({ world }, _who: string, field: string, value: string) => {
    await patchProfileField(world as ProfileWorld, field, value);
  },
);

When(
  'the {word} attempts to update {word} with value that is {int} characters',
  async ({ world }, _who: string, field: string, length: number) => {
    await patchProfileField(world as ProfileWorld, field, 'X'.repeat(length));
  },
);

When(
  'the {word} attempts to update {word} with URL of {int} characters',
  async ({ world }, _who: string, field: string, length: number) => {
    // Same construction as the BE glue: a valid HTTPS URL padded to length.
    const base = 'https://example.com/';
    const value = base + 'x'.repeat(Math.max(0, length - base.length));
    await patchProfileField(world as ProfileWorld, field, value);
  },
);

When(
  'the {word} updates profilePicture and companyDescription together',
  async ({ world }, _who: string) => {
    const w = world as ProfileWorld;
    const description = `Batch update description at ${Date.now()}`;
    const r = await profileApi(w).patchUser(requireUserId(w), {
      profilePicture: 'https://example.com/batch-photo.jpg',
      companyDescription: description,
    });
    record(w, r);
    // Deliberately NOT recording the description: the avatar is uploadId-only
    // (pentest 3.1), so this batch is rejected atomically — the BE keeps the
    // previous description, and the feature's follow-up GET asserts exactly
    // that by comparing against the last ACCEPTED description.
  },
);

// ── Session continuity (the BE's stored-token checks) ────────────────────────

Then(
  'the {word} original session calling {string} should return {int}',
  async ({ world }, _who: string, path: string, status: number) => {
    const w = world as ProfileWorld;
    // The SAME cookie jar minted at sign-in — the FE analogue of the BE's
    // "using stored token original_token".
    const r = await requireSession(w).api.get(path);
    expect(r.status, `original session GET ${path}; body: ${r.body.slice(0, 300)}`).toBe(status);
  },
);

Then('the {word} session remains valid without refresh', async ({ world }, _who: string) => {
  const w = world as ProfileWorld;
  const r = await requireSession(w).api.get('/users/me');
  expect(
    r.status,
    'session must survive a critical-field edit without any refresh (no token-version bump)',
  ).toBe(200);
});

Then(
  'the {word} can see their account status as {string}',
  async ({ world }, _who: string, expected: string) => {
    const w = world as ProfileWorld;
    expect(Object.values(AccountStatus), `"${expected}" is not an AccountStatus member`).toContain(
      expected,
    );
    const r = await profileApi(w).me();
    expect(r.ok, `GET /users/me failed: HTTP ${r.status}`).toBeTruthy();
    expect(r.json.accountStatus?.value, 'accountStatus.value').toBe(expected);
  },
);

// ── Soft assertions (Playwright expect.soft ≙ BE SoftAssertionContext) ───────

Then('soft assert update status is {int}', async ({ world }, expected: number) => {
  softStatus(world as ProfileWorld, expected, 'profile update');
});

Then('soft assert profile update status is {int}', async ({ world }, expected: number) => {
  softStatus(world as ProfileWorld, expected, 'profile update');
});

Then('soft assert response status is {int}', async ({ world }, expected: number) => {
  softStatus(world as ProfileWorld, expected, 'response');
});

Then('soft assert status {int} for description update', async ({ world }, expected: number) => {
  softStatus(world as ProfileWorld, expected, 'companyDescription update');
});

Then('soft assert batch update status is {int}', async ({ world }, expected: number) => {
  softStatus(world as ProfileWorld, expected, 'batch profile update');
});

Then(
  'soft assert the {word} accountStatus is {string}',
  async ({ world }, _who: string, expected: string) => {
    const w = world as ProfileWorld;
    // Contract guard: the feature's status name must be a real generated enum member.
    expect(Object.values(AccountStatus), `"${expected}" is not an AccountStatus member`).toContain(
      expected,
    );
    const r = await profileApi(w).me();
    expect.soft(r.ok, `GET /users/me failed: HTTP ${r.status}`).toBeTruthy();
    expect.soft(r.json.accountStatus?.value, 'accountStatus.value').toBe(expected);
  },
);

Then('soft assert GET \\/users\\/me returns updated description', async ({ world }) => {
  const w = world as ProfileWorld;
  const r = await profileApi(w).me();
  expect.soft(r.ok, `GET /users/me failed: HTTP ${r.status}`).toBeTruthy();
  expect
    .soft(r.json.companyDescription, 'companyDescription after update')
    .toBe(w.profileLastDescription);
});

Then('soft assert error contains validation error for {word}', async ({ world }, field: string) => {
  const w = world as ProfileWorld;
  let hasError = false;
  try {
    const parsed = JSON.parse(w.lastResponse?.body ?? '') as Record<string, unknown>;
    hasError = 'errors' in parsed || 'message' in parsed || 'error' in parsed;
  } catch {
    hasError = false;
  }
  expect
    .soft(hasError, `response should carry a validation error for ${field}; body: ${snippet(w)}`)
    .toBe(true);
});

Then('all soft assertions should pass', async () => {
  // Flush marker mirroring the BE SoftAssertionContext hook: Playwright itself
  // fails the scenario at teardown when any expect.soft above recorded a
  // failure, so this step needs no body.
});

// ── Admin restore (cleanup) ──────────────────────────────────────────────────

When(
  'the admin updates the {word} firstName to original value',
  async ({ world }, _who: string) => {
    await adminRestore(world as ProfileWorld, ['firstName']);
  },
);

When('the admin updates the {word} lastName to original value', async ({ world }, _who: string) => {
  await adminRestore(world as ProfileWorld, ['lastName']);
});

When('the admin restores the {word} original profile values', async ({ world }, _who: string) => {
  await adminRestore(world as ProfileWorld, ['firstName', 'lastName']);
});

// ── Addresses ────────────────────────────────────────────────────────────────

When(
  'the {word} creates address with street {string} city {string} postalCode {string} country {string}',
  async (
    { world },
    _who: string,
    street: string,
    city: string,
    postalCode: string,
    country: string,
  ) => {
    await createAddress(world as ProfileWorld, street, city, postalCode, country);
  },
);

When('the {word} creates valid address with all fields', async ({ world }, _who: string) => {
  await createAddress(world as ProfileWorld, 'Valid Street 123', 'Valid City', '00-001', 'Poland');
});

When(
  'the {word} attempts to create address without {word}',
  async ({ world }, _who: string, missing: string) => {
    const w = world as ProfileWorld;
    const dto = baseAddress();
    switch (missing) {
      case 'street':
        delete dto.street;
        break;
      case 'city':
        delete dto.city;
        break;
      case 'postalCode':
        delete dto.postalCode;
        break;
      case 'country':
        delete dto.country;
        break;
      default:
        throw new Error(`unsupported missing address field "${missing}"`);
    }
    record(w, await profileApi(w).createAddressForUser(requireUserId(w), dto));
  },
);

When(
  'the {word} attempts to create address with {word} of {int} characters',
  async ({ world }, _who: string, field: string, length: number) => {
    const w = world as ProfileWorld;
    const dto = baseAddress();
    const long = 'X'.repeat(length);
    switch (field) {
      case 'street':
        dto.street = long;
        break;
      case 'city':
        dto.city = long;
        break;
      case 'postalCode':
        dto.postalCode = long;
        break;
      case 'country':
        dto.country = long;
        break;
      default:
        throw new Error(`unsupported address field "${field}"`);
    }
    record(w, await profileApi(w).createAddressForUser(requireUserId(w), dto));
  },
);

When(
  'the {word} updates the created address city to {string}',
  async ({ world }, _who: string, city: string) => {
    const w = world as ProfileWorld;
    if (w.profileAddressId == null) throw new Error('no created address to update');
    record(w, await profileApi(w).patchAddress(w.profileAddressId, { city }));
  },
);

When('the {word} deletes the created test address', async ({ world }, _who: string) => {
  await deleteCreatedAddress(world as ProfileWorld);
});

When('the {word} deletes the created address', async ({ world }, _who: string) => {
  await deleteCreatedAddress(world as ProfileWorld);
});

Then(
  'soft assert address creation status is {int} or {int}',
  async ({ world }, s1: number, s2: number) => {
    softStatusIn(world as ProfileWorld, [s1, s2], 'address creation');
  },
);

Then('soft assert address update status is {int}', async ({ world }, expected: number) => {
  softStatus(world as ProfileWorld, expected, 'address update');
});

Then(
  'soft assert address deletion status is {int} or {int}',
  async ({ world }, s1: number, s2: number) => {
    softStatusIn(world as ProfileWorld, [s1, s2], 'address deletion');
  },
);

Then('soft assert address appears in user addresses', async ({ world }) => {
  const w = world as ProfileWorld;
  const r = await profileApi(w).listUserAddresses(requireUserId(w));
  expect.soft(r.ok, `GET /address/user/{id} failed: HTTP ${r.status}`).toBeTruthy();
  // The BE glue only asserted the 200; the list containment is a free tightening.
  const list = Array.isArray(r.json) ? r.json : [];
  expect
    .soft(
      list.some((a) => a.id === w.profileAddressId),
      `created address ${w.profileAddressId} present in the user's address list`,
    )
    .toBe(true);
});

// ── Preferences ──────────────────────────────────────────────────────────────

When(
  'the {word} updates preferences with {word} {word}',
  async ({ world }, _who: string, field: string, value: string) => {
    const w = world as ProfileWorld;
    record(w, await profileApi(w).patchMyPreferences(prefsPatchFor(field, value)));
  },
);

When(
  'the {word} updates preferences with language {string} and {word} {word}',
  async ({ world }, _who: string, language: string, field: string, value: string) => {
    const w = world as ProfileWorld;
    const patch: UserPreferencesDtoIn = {
      ...prefsPatchFor('language', language),
      ...prefsPatchFor(field, value),
    };
    record(w, await profileApi(w).patchMyPreferences(patch));
  },
);

When(
  'the {word} attempts to update preferences with {word} {string}',
  async ({ world }, _who: string, field: string, value: string) => {
    const w = world as ProfileWorld;
    // Negative contract guard: the invalid value must genuinely be OFF the
    // generated enum — if the BE ever legalises it, this oracle breaks here.
    if (field === 'language') {
      expect(
        Object.values(UserPreferencesDtoInLanguageEnum) as string[],
        `"${value}" unexpectedly became a legal language`,
      ).not.toContain(value);
    }
    if (field === 'communicationFrequency') {
      expect(
        Object.values(UserPreferencesDtoInCommunicationFrequencyEnum) as string[],
        `"${value}" unexpectedly became a legal communicationFrequency`,
      ).not.toContain(value);
    }
    record(w, await profileApi(w).patchMyPreferencesRaw({ [field]: value }));
  },
);

When(
  'the {word} attempts to update preferences with {word} of {int} characters',
  async ({ world }, _who: string, field: string, length: number) => {
    const w = world as ProfileWorld;
    record(w, await profileApi(w).patchMyPreferencesRaw({ [field]: 'X'.repeat(length) }));
  },
);

Then('soft assert preferences update status is {int}', async ({ world }, expected: number) => {
  softStatus(world as ProfileWorld, expected, 'preferences update');
});

// ── Signed-URL profile-photo upload (gated scenarios) ────────────────────────

Given('signed-url uploads are available on this stack', async ({ world }) => {
  const w = world as ProfileWorld;
  const r = await profileApi(w).uploadLimits();
  test.skip(
    r.status === 404,
    'SignedUrlService bean absent (no Firebase Storage in this BE profile) — /upload/** 404s',
  );
});

When(
  'the {word} requests signed URL for file {string} type {string} size {int}',
  async ({ world }, _who: string, filename: string, contentType: string, fileSize: number) => {
    const w = world as ProfileWorld;
    // Contract guard: the feature's content type must be a generated enum member.
    expect(
      Object.values(FileUploadRequestContentTypeEnum) as string[],
      `"${contentType}" is not a FileUploadRequestContentTypeEnum member`,
    ).toContain(contentType);
    const req: FileUploadRequest = {
      filename,
      contentType: contentType as FileUploadRequestContentTypeEnum,
      fileSize,
    };
    const r = await profileApi(w).requestSignedUrl(req);
    record(w, r);
    if (r.ok) {
      w.profileUpload = r.json;
      w.profileUploadContentType = contentType;
    }
  },
);

Then('soft assert signed URL response is successful', async ({ world }) => {
  softStatus(world as ProfileWorld, 200, '/upload/signed-url');
});

When('the {word} uploads file to signed URL', async ({ world }, _who: string) => {
  const w = world as ProfileWorld;
  const upload = requireUpload(w);
  expect(upload.uploadUrl, 'signed-url response must carry uploadUrl').toBeTruthy();
  const contentType = w.profileUploadContentType ?? 'image/jpeg';
  record(
    w,
    await profileApi(w).uploadToSignedUrl(
      upload.uploadUrl!,
      contentType,
      fakeImageBytes(contentType),
    ),
  );
});

Then('soft assert upload succeeds', async ({ world }) => {
  softStatus(world as ProfileWorld, 200, 'signed-URL PUT');
});

When('the {word} confirms upload', async ({ world }, _who: string) => {
  const w = world as ProfileWorld;
  const upload = requireUpload(w);
  expect(upload.uploadId, 'signed-url response must carry uploadId').toBeTruthy();
  expect(upload.filePath, 'signed-url response must carry filePath').toBeTruthy();
  record(w, await profileApi(w).confirmUpload(upload.uploadId!, upload.filePath!));
});

Then('soft assert confirm succeeds', async ({ world }) => {
  softStatus(world as ProfileWorld, 200, '/upload/confirm');
});

When(
  'the {word} updates their profilePicture to the uploaded URL',
  async ({ world }, _who: string) => {
    const w = world as ProfileWorld;
    const upload = requireUpload(w);
    // uploadId-only contract (pentest 3.1): the PATCH carries the tracked
    // uploadId; the BE resolves ownership against file_uploads and derives
    // the stored URL itself. Step text kept as the BE corpus spells it.
    expect(upload.uploadId, 'signed-url response must carry uploadId').toBeTruthy();
    record(w, await profileApi(w).patchUser(requireUserId(w), { profilePicture: upload.uploadId }));
  },
);
