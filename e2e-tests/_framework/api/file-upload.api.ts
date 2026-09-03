import type { ApiHttp, ApiResult } from './http-client';
import type { TestSession } from './test-session';

import type { FileUploadResponse } from '../../../src/app/api/model/file-upload-response';

/**
 * Layer 1 — file-upload validation extras, for the signed-URL oracle
 * (BE corpus files/file-upload-signed-url.feature).
 *
 * The TYPED signed-URL surface (request / PUT-to-storage / confirm / limits)
 * already lives on ProfileApi (it was written for the profile-photo flow and
 * the endpoints are identical) — the file-upload steps reuse it. This class
 * adds only what the typed surface CANNOT express:
 *
 * - `requestSignedUrlRaw()` — a deliberately OFF-contract POST
 *   /upload/signed-url body. The validation scenarios must send values the
 *   generated FileUploadRequest forbids (e.g. contentType "application/pdf",
 *   off the FileUploadRequestContentTypeEnum) to prove the BE rejects them
 *   with 400. Same policy as ProfileApi.patchMyPreferencesRaw. The response
 *   stays typed on the generated FileUploadResponse.
 */
export class FileUploadApi {
  private readonly http: ApiHttp;

  constructor(session: TestSession) {
    this.http = session.api;
  }

  /** Deliberately OFF-contract POST /upload/signed-url — validation oracle only. */
  requestSignedUrlRaw(body: Record<string, unknown>): Promise<ApiResult<FileUploadResponse>> {
    return this.http.post<FileUploadResponse>('/upload/signed-url', body);
  }
}
