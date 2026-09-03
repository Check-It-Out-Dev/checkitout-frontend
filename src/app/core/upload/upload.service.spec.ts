import { HttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { FileUploadService as GeneratedFileUploadService } from '../../api/api/file-upload.api';
import { FileUploadRequestContentTypeEnum } from '../../api/model/file-upload-request';
import { PROFILE_PHOTO_LIMITS, UploadService } from './upload.service';

function fakeFile(opts: { name?: string; type?: string; size?: number }): File {
  const name = opts.name ?? 'photo.jpg';
  const type = opts.type ?? 'image/jpeg';
  // The Blob constructor uses byteLength of its parts. Construct a
  // size we can control via a single Uint8Array of the desired length.
  const bytes = new Uint8Array(opts.size ?? 100);
  return new File([bytes], name, { type });
}

describe('UploadService', () => {
  let service: UploadService;
  let api: {
    generateSignedUrl: jest.Mock;
    confirmUpload: jest.Mock;
  };
  let http: { put: jest.Mock };

  beforeEach(() => {
    api = {
      generateSignedUrl: jest.fn(),
      confirmUpload: jest.fn(),
    };
    http = { put: jest.fn() };
    TestBed.configureTestingModule({
      providers: [
        UploadService,
        { provide: GeneratedFileUploadService, useValue: api },
        { provide: HttpClient, useValue: http },
      ],
    });
    service = TestBed.inject(UploadService);
  });

  it('rejects an unsupported MIME type with upload.errors.invalid_type', (done) => {
    const file = fakeFile({ type: 'application/pdf', size: 1000 });
    service.uploadProfilePhoto(file).subscribe({
      next: () => done.fail('should not emit on invalid type'),
      error: (err: Error) => {
        expect(err.message).toBe('upload.errors.invalid_type');
        expect(api.generateSignedUrl).not.toHaveBeenCalled();
        done();
      },
    });
  });

  it('rejects an empty file with upload.errors.too_large', (done) => {
    const file = fakeFile({ type: 'image/png', size: 0 });
    service.uploadProfilePhoto(file).subscribe({
      next: () => done.fail('should not emit on zero-byte file'),
      error: (err: Error) => {
        expect(err.message).toBe('upload.errors.too_large');
        expect(api.generateSignedUrl).not.toHaveBeenCalled();
        done();
      },
    });
  });

  it('rejects a file over 5 MB with upload.errors.too_large', (done) => {
    const tooBig = PROFILE_PHOTO_LIMITS.maxBytes + 1;
    const file = fakeFile({ type: 'image/png', size: tooBig });
    service.uploadProfilePhoto(file).subscribe({
      next: () => done.fail('should not emit on over-limit file'),
      error: (err: Error) => {
        expect(err.message).toBe('upload.errors.too_large');
        expect(api.generateSignedUrl).not.toHaveBeenCalled();
        done();
      },
    });
  });

  it('accepts each allowed MIME type and forwards the right contentType to the signed-URL API', () => {
    api.generateSignedUrl.mockReturnValue(
      of({
        uploadUrl: 'https://gcs/signed',
        publicUrl: 'https://cdn/file.jpg',
        uploadId: 'u1',
        filePath: 'p1',
      }),
    );
    http.put.mockReturnValue(of({}));
    api.confirmUpload.mockReturnValue(of({}));

    for (const mime of PROFILE_PHOTO_LIMITS.allowedTypes) {
      api.generateSignedUrl.mockClear();
      const file = fakeFile({ type: mime, size: 100 });
      service.uploadProfilePhoto(file).subscribe();
      expect(api.generateSignedUrl).toHaveBeenCalledTimes(1);
      expect(api.generateSignedUrl.mock.calls[0]?.[0]?.fileUploadRequest?.contentType).toBe(mime);
    }
  });

  it('fails with signed_url_failed when BE omits any required upload field', (done) => {
    // Missing uploadId — the BE response is incomplete.
    api.generateSignedUrl.mockReturnValue(
      of({
        uploadUrl: 'https://gcs/signed',
        publicUrl: 'https://cdn/file.jpg',
        // uploadId missing
        filePath: 'p1',
      }),
    );

    const file = fakeFile({ type: 'image/jpeg', size: 500 });
    service.uploadProfilePhoto(file).subscribe({
      next: () => done.fail('should not emit when BE omits fields'),
      error: (err: Error) => {
        expect(err.message).toBe('upload.errors.signed_url_failed');
        expect(http.put).not.toHaveBeenCalled();
        expect(api.confirmUpload).not.toHaveBeenCalled();
        done();
      },
    });
  });

  it('completes the full chain on happy path and returns the UploadResult', (done) => {
    api.generateSignedUrl.mockReturnValue(
      of({
        uploadUrl: 'https://gcs/signed?token=abc',
        publicUrl: 'https://cdn/photo.jpg',
        uploadId: 'upload-123',
        filePath: 'users/abc/photo.jpg',
      }),
    );
    http.put.mockReturnValue(of({}));
    api.confirmUpload.mockReturnValue(of({}));

    const file = fakeFile({ name: 'p.jpg', type: 'image/jpeg', size: 500 });
    service.uploadProfilePhoto(file).subscribe({
      next: (result) => {
        expect(result).toEqual({
          publicUrl: 'https://cdn/photo.jpg',
          filePath: 'users/abc/photo.jpg',
          uploadId: 'upload-123',
        });

        // Validate the chain executed in order.
        expect(api.generateSignedUrl).toHaveBeenCalledWith({
          fileUploadRequest: {
            filename: 'p.jpg',
            contentType: FileUploadRequestContentTypeEnum.JPEG,
            fileSize: 500,
            uploadType: 'PROFILE_PHOTO',
          },
        });
        expect(http.put).toHaveBeenCalledTimes(1);
        const [putUrl, putBody, putOpts] = http.put.mock.calls[0] ?? [];
        expect(putUrl).toBe('https://gcs/signed?token=abc');
        expect(putBody).toBe(file);
        // GCS-flavoured PUT: explicit Content-Type, no credentials.
        expect(putOpts?.withCredentials).toBe(false);
        expect(putOpts?.headers?.get('Content-Type')).toBe(FileUploadRequestContentTypeEnum.JPEG);

        expect(api.confirmUpload).toHaveBeenCalledWith({
          uploadId: 'upload-123',
          filePath: 'users/abc/photo.jpg',
        });
        done();
      },
      error: (err) => done.fail(err),
    });
  });

  it('accepts a 5 MB file exactly (boundary)', (done) => {
    api.generateSignedUrl.mockReturnValue(
      of({
        uploadUrl: 'https://gcs/u',
        publicUrl: 'https://cdn/u',
        uploadId: 'u',
        filePath: 'p',
      }),
    );
    http.put.mockReturnValue(of({}));
    api.confirmUpload.mockReturnValue(of({}));

    const file = fakeFile({ type: 'image/png', size: PROFILE_PHOTO_LIMITS.maxBytes });
    service.uploadProfilePhoto(file).subscribe({
      next: () => {
        expect(api.generateSignedUrl).toHaveBeenCalledTimes(1);
        done();
      },
      error: (err) => done.fail(err),
    });
  });
});
