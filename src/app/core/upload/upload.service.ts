import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, switchMap, throwError } from 'rxjs';
import { FileUploadService as GeneratedFileUploadService } from '../../api/api/file-upload.api';
import { FileUploadRequestContentTypeEnum } from '../../api/model/file-upload-request';
import type { FileUploadResponse } from '../../api/model/file-upload-response';
import { UploadType } from '../api-frozen/hidden-models';

const ALLOWED: ReadonlyArray<FileUploadRequestContentTypeEnum> = [
  FileUploadRequestContentTypeEnum.JPEG,
  FileUploadRequestContentTypeEnum.JPG,
  FileUploadRequestContentTypeEnum.PNG,
  FileUploadRequestContentTypeEnum.GIF,
  FileUploadRequestContentTypeEnum.WEBP,
];

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // BE hard cap

export interface UploadResult {
  readonly publicUrl: string;
  readonly filePath: string;
  readonly uploadId: string;
}

/**
 * Three-step direct-upload flow: ask BE for a signed URL, PUT the raw bytes
 * to GCS, then POST the upload-confirm to register the file server-side.
 *
 * The PUT to the signed URL bypasses our HTTP interceptors deliberately —
 * GCS rejects requests carrying our auth header (`Authorization`) or
 * `Content-Length` overrides. We use a fresh `HttpClient` call without our
 * usual interceptor chain by setting an explicit empty `HttpHeaders` and
 * letting the BE-issued URL provide all the auth via query params.
 */
@Injectable({ providedIn: 'root' })
export class UploadService {
  private readonly api = inject(GeneratedFileUploadService);
  private readonly http = inject(HttpClient);

  /**
   * Validates the file (image MIME type + ≤5 MB) and runs the full upload
   * pipeline. Returns the final `publicUrl` to attach to the relevant DTO
   * (e.g. `User.profilePicture`).
   */
  uploadProfilePhoto(file: File): Observable<UploadResult> {
    return this.uploadImage(file, UploadType.PROFILE_PHOTO);
  }

  /**
   * Same three-step pipeline for any image `UploadType` — campaign photos
   * use CAMPAIGN_MEDIA (task #35a follow-up: the photos slice).
   */
  uploadImage(file: File, uploadType: UploadType): Observable<UploadResult> {
    const contentType = this.detectContentType(file);
    if (!contentType) {
      return throwError(() => new Error('upload.errors.invalid_type'));
    }
    if (file.size <= 0 || file.size > MAX_FILE_SIZE_BYTES) {
      return throwError(() => new Error('upload.errors.too_large'));
    }

    return this.api
      .generateSignedUrl({
        fileUploadRequest: {
          filename: file.name,
          contentType,
          fileSize: file.size,
          uploadType,
        },
      })
      .pipe(
        switchMap((res: FileUploadResponse) => {
          if (!res.uploadUrl || !res.publicUrl || !res.uploadId || !res.filePath) {
            return throwError(() => new Error('upload.errors.signed_url_failed'));
          }
          return this.putToSignedUrl(res.uploadUrl, file, contentType).pipe(
            switchMap(() =>
              this.api.confirmUpload({ uploadId: res.uploadId!, filePath: res.filePath! }),
            ),
            switchMap(
              () =>
                new Observable<UploadResult>((sub) => {
                  sub.next({
                    publicUrl: res.publicUrl!,
                    filePath: res.filePath!,
                    uploadId: res.uploadId!,
                  });
                  sub.complete();
                }),
            ),
          );
        }),
      );
  }

  private putToSignedUrl(
    signedUrl: string,
    file: File,
    contentType: FileUploadRequestContentTypeEnum,
  ): Observable<unknown> {
    // Empty headers + explicit Content-Type. GCS signs the URL against the
    // exact Content-Type the FE will send, so this must match what we passed
    // to /upload/signed-url. Other browsers' default headers (Authorization,
    // X-Requested-With) are stripped by the empty HttpHeaders.
    const headers = new HttpHeaders({ 'Content-Type': contentType });
    return this.http.put(signedUrl, file, { headers, withCredentials: false });
  }

  private detectContentType(file: File): FileUploadRequestContentTypeEnum | null {
    const t = (file.type ?? '').toLowerCase();
    return ALLOWED.find((m) => m === t) ?? null;
  }
}

export const PROFILE_PHOTO_LIMITS = {
  maxBytes: MAX_FILE_SIZE_BYTES,
  allowedTypes: ALLOWED,
} as const;
