import type { APIRequestContext, APIResponse } from '@playwright/test';
import type { ApiHttp, ApiResult } from './http-client';
import type { TestSession } from './test-session';

import type { UserDtoIn } from '../../../src/app/api/model/user-dto-in';
import type { UserDtoOut } from '../../../src/app/api/model/user-dto-out';
import type { UserPreferencesDtoIn } from '../../../src/app/api/model/user-preferences-dto-in';
import type { UserPreferencesDtoOut } from '../../../src/app/api/model/user-preferences-dto-out';
import type { AddressDtoIn } from '../../../src/app/api/model/address-dto-in';
import type { AddressDtoOut } from '../../../src/app/api/model/address-dto-out';
import type { FileUploadRequest } from '../../../src/app/api/model/file-upload-request';
import type { FileUploadResponse } from '../../../src/app/api/model/file-upload-response';

/**
 * Layer 1 — Profile domain service (users/me profile edits, addresses,
 * preferences, signed-URL profile-photo uploads).
 *
 * Typed methods over the OpenAPI-generated DTOs, mirroring the BE Cucumber
 * glue (ProfileUpdateSteps.java + FileUploadSteps.java): profile edits are
 * sparse PATCHes of /users/{id}, user addresses go through
 * /address/user/{userId} (POST /address is admin-only), preferences through
 * PATCH /user-preferences/me. The BDD steps stay thin; a BE contract change
 * breaks here at compile time.
 *
 * Constructed from a TestSession (not a bare ApiHttp) because two endpoints
 * need the raw APIRequestContext: DELETE /address/{id} (ApiHttp exposes no
 * delete verb) and the PUT to the absolute storage.googleapis.com signed URL.
 */

/**
 * The sparse-PATCH surface of PATCH /users/{id}. The endpoint accepts a
 * partial map (BE ProfileUpdateSteps.java sends single-key maps), so every
 * UserDtoIn field is optional here. `companyDescription` and `nip` are
 * PATCHable and round-trip through UserDtoOut but are MISSING from the
 * generated UserDtoIn (BE schema-annotation gap, 5c candidate) — they are
 * pulled from UserDtoOut so contract drift still breaks compilation.
 */
export type UserProfilePatch = Partial<UserDtoIn> &
  Partial<Pick<UserDtoOut, 'companyDescription' | 'nip'>>;

export class ProfileApi {
  private readonly http: ApiHttp;
  private readonly raw: APIRequestContext;

  constructor(session: TestSession) {
    this.http = session.api;
    this.raw = session.raw;
  }

  /** Build an ApiResult from a raw APIResponse (same shape ApiHttp returns). */
  private async toResult<T = unknown>(res: APIResponse): Promise<ApiResult<T>> {
    const body = await res.text();
    let json: T;
    try {
      json = (body ? JSON.parse(body) : {}) as T;
    } catch {
      json = {} as T;
    }
    return { status: res.status(), ok: res.ok(), headers: res.headers(), body, json };
  }

  // ── Profile (users) ─────────────────────────────────────────────────────────

  me(): Promise<ApiResult<UserDtoOut>> {
    return this.http.get<UserDtoOut>('/users/me');
  }

  /**
   * Sparse profile update — PATCH /users/{id}. Email changes additionally
   * require an X-Step-Up-Token header; calling this with `email` set and no
   * step-up token is the 401 contract the validation oracle asserts.
   */
  patchUser(userId: number, patch: UserProfilePatch): Promise<ApiResult<UserDtoOut>> {
    return this.http.patch<UserDtoOut>(`/users/${userId}`, patch);
  }

  // ── Addresses ───────────────────────────────────────────────────────────────

  /** POST /address/user/{userId} — the user-scoped create (POST /address is admin-only). */
  createAddressForUser(userId: number, dto: AddressDtoIn): Promise<ApiResult<AddressDtoOut>> {
    return this.http.post<AddressDtoOut>(`/address/user/${userId}`, dto);
  }

  /**
   * GET /address/user/{userId}. The generated client flattens the return to a
   * single AddressDtoOut, but the wire response is a JSON array (BE glue
   * parses List) — typed as an array here.
   */
  listUserAddresses(userId: number): Promise<ApiResult<AddressDtoOut[]>> {
    return this.http.get<AddressDtoOut[]>(`/address/user/${userId}`);
  }

  /** Sparse PATCH /address/{id} (generated Patch12 takes a key/value map). */
  patchAddress(addressId: number, patch: Partial<AddressDtoIn>): Promise<ApiResult<AddressDtoOut>> {
    return this.http.patch<AddressDtoOut>(`/address/${addressId}`, patch);
  }

  /** DELETE /address/{id} — via the raw context (ApiHttp has no delete verb). */
  async deleteAddress(addressId: number): Promise<ApiResult<unknown>> {
    return this.toResult(await this.raw.delete(`/api/address/${addressId}`));
  }

  // ── Preferences ─────────────────────────────────────────────────────────────

  /** Sparse PATCH /user-preferences/me over the generated DTO. */
  patchMyPreferences(patch: UserPreferencesDtoIn): Promise<ApiResult<UserPreferencesDtoOut>> {
    return this.http.patch<UserPreferencesDtoOut>('/user-preferences/me', patch);
  }

  /**
   * Deliberately OFF-contract PATCH /user-preferences/me body. Only for the
   * validation oracle: it must send values the generated enums forbid
   * (e.g. language "verylonglanguagecode") to prove the BE rejects them.
   */
  patchMyPreferencesRaw(body: Record<string, unknown>): Promise<ApiResult<unknown>> {
    return this.http.patch('/user-preferences/me', body);
  }

  // ── Signed-URL uploads ──────────────────────────────────────────────────────

  /**
   * GET /upload/limits — availability probe. The whole upload controller is
   * @ConditionalOnBean(SignedUrlService.class); without Firebase Storage
   * config this returns 404 and upload scenarios should self-skip.
   */
  uploadLimits(): Promise<ApiResult<unknown>> {
    return this.http.get('/upload/limits');
  }

  /** POST /upload/signed-url — typed request/response (FileUploadRequest/Response). */
  requestSignedUrl(req: FileUploadRequest): Promise<ApiResult<FileUploadResponse>> {
    return this.http.post<FileUploadResponse>('/upload/signed-url', req);
  }

  /**
   * PUT the file bytes to the ABSOLUTE signed URL (storage.googleapis.com) —
   * exactly what the browser does with the uploadUrl the BE returned.
   */
  async uploadToSignedUrl(
    uploadUrl: string,
    contentType: string,
    bytes: Buffer,
  ): Promise<ApiResult<unknown>> {
    return this.toResult(
      await this.raw.put(uploadUrl, { headers: { 'Content-Type': contentType }, data: bytes }),
    );
  }

  /** POST /upload/confirm/{uploadId}?filePath=… (filePath is a query param). */
  confirmUpload(uploadId: string, filePath: string): Promise<ApiResult<Record<string, unknown>>> {
    return this.http.post<Record<string, unknown>>(
      `/upload/confirm/${encodeURIComponent(uploadId)}`,
      undefined,
      { filePath },
    );
  }
}
