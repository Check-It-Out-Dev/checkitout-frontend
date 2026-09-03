import { HttpErrorResponse, provideHttpClient, withXhr } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { TranslocoTestingModule } from '@ngneat/transloco';
import { Observable, of, throwError } from 'rxjs';
import type { UserDtoIn } from '../../api/model/user-dto-in';
import type { UserDtoOut } from '../../api/model/user-dto-out';
import { UploadService, type UploadResult } from '../../core/upload/upload.service';
import { UserApiService } from '../../core/user/user.service';
import { ProfilePictureUploadComponent } from './profile-picture-upload.component';

const USER: UserDtoOut = {
  id: 42,
  email: 'maja@example.com',
  emailVerified: true,
  userType: { value: 'INFLUENCER', label: 'Influencer' } as UserDtoOut['userType'],
  accountStatus: { value: 'ACTIVE', label: 'Active' } as UserDtoOut['accountStatus'],
};

class FakeUpload {
  next: () => Observable<UploadResult> = () =>
    of({
      publicUrl: 'https://example.com/p/42.jpg',
      filePath: 'profile/42.jpg',
      uploadId: 'u1',
    });
  uploadProfilePhoto(): Observable<UploadResult> {
    return this.next();
  }
}

class FakeUserApi {
  next: () => Observable<UserDtoOut> = () =>
    of({ ...USER, profilePicture: 'https://example.com/p/42.jpg' });
  nextCurrent: () => Observable<UserDtoOut> = () => of(USER);
  lastDto?: UserDtoIn;
  currentCalls = 0;
  patch(_id: number, dto: UserDtoIn): Observable<UserDtoOut> {
    this.lastDto = dto;
    return this.next();
  }
  getCurrent(): Observable<UserDtoOut> {
    this.currentCalls++;
    return this.nextCurrent();
  }
}

function fakeFile(name = 'photo.jpg', type = 'image/jpeg', size = 1024): File {
  return new File([new Uint8Array(size)], name, { type });
}

function fakeEvent(file: File | null): Event {
  const input = { value: '', files: file ? [file] : null } as unknown as HTMLInputElement;
  return { target: input } as unknown as Event;
}

function create(
  upload: FakeUpload,
  userApi: FakeUserApi,
): ComponentFixture<ProfilePictureUploadComponent> {
  TestBed.configureTestingModule({
    imports: [
      ProfilePictureUploadComponent,
      TranslocoTestingModule.forRoot({
        langs: { en: {} },
        translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
      }),
    ],
    providers: [
      provideHttpClient(withXhr()),
      provideAnimationsAsync(),
      { provide: UploadService, useValue: upload },
      { provide: UserApiService, useValue: userApi },
    ],
  });
  const fixture = TestBed.createComponent(ProfilePictureUploadComponent);
  fixture.componentRef.setInput('user', USER);
  fixture.detectChanges();
  return fixture;
}

describe('ProfilePictureUploadComponent', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('does nothing when no file selected', async () => {
    const fixture = create(new FakeUpload(), new FakeUserApi());
    await fixture.componentInstance.onFile(fakeEvent(null));

    expect(fixture.componentInstance.phase()).toBe('idle');
  });

  it('runs through upload + patch and lands in success state', async () => {
    const upload = new FakeUpload();
    const api = new FakeUserApi();
    const fixture = create(upload, api);
    let updatedEmitted: UserDtoOut | undefined;
    fixture.componentInstance.updated.subscribe((u) => (updatedEmitted = u));

    await fixture.componentInstance.onFile(fakeEvent(fakeFile()));

    expect(fixture.componentInstance.phase()).toBe('success');
    // The FE sends the tracked uploadId; the BE resolves it to the URL.
    expect(api.lastDto?.profilePicture).toBe('u1');
    expect(updatedEmitted?.profilePicture).toBe('https://example.com/p/42.jpg');
    expect(fixture.componentInstance.currentUrl()).toBe('https://example.com/p/42.jpg');
  });

  it('classifies upload-service error keys', async () => {
    const upload = new FakeUpload();
    upload.next = () => throwError(() => new Error('upload.errors.too_large'));
    const fixture = create(upload, new FakeUserApi());

    await fixture.componentInstance.onFile(fakeEvent(fakeFile()));

    expect(fixture.componentInstance.phase()).toBe('error');
    expect(fixture.componentInstance.errorKey()).toBe('upload.errors.too_large');
  });

  it('classifies generic error as upload.errors.failed', async () => {
    const upload = new FakeUpload();
    upload.next = () => throwError(() => new Error('boom'));
    const fixture = create(upload, new FakeUserApi());

    await fixture.componentInstance.onFile(fakeEvent(fakeFile()));

    expect(fixture.componentInstance.errorKey()).toBe('upload.errors.failed');
  });

  it('falls back to upload.errors.failed when patch fails after upload succeeded', async () => {
    const upload = new FakeUpload();
    const api = new FakeUserApi();
    api.next = () => throwError(() => new Error('boom'));
    const fixture = create(upload, api);

    await fixture.componentInstance.onFile(fakeEvent(fakeFile()));

    expect(fixture.componentInstance.phase()).toBe('error');
    expect(fixture.componentInstance.errorKey()).toBe('upload.errors.failed');
  });

  it('recovers when the PATCH response is lost but the BE shows the save landed', async () => {
    const upload = new FakeUpload();
    const api = new FakeUserApi();
    api.next = () =>
      throwError(() => new HttpErrorResponse({ status: 503, statusText: 'Service Unavailable' }));
    // The confirm probe: /users/me already carries the freshly uploaded URL.
    api.nextCurrent = () => of({ ...USER, profilePicture: 'https://example.com/p/42.jpg' });
    const fixture = create(upload, api);
    let updatedEmitted: UserDtoOut | undefined;
    fixture.componentInstance.updated.subscribe((u) => (updatedEmitted = u));

    await fixture.componentInstance.onFile(fakeEvent(fakeFile()));

    expect(api.currentCalls).toBe(1);
    expect(fixture.componentInstance.phase()).toBe('success');
    expect(updatedEmitted?.profilePicture).toBe('https://example.com/p/42.jpg');
    expect(fixture.componentInstance.currentUrl()).toBe('https://example.com/p/42.jpg');
  });

  it('surfaces the error when the probe shows the save did not land', async () => {
    const upload = new FakeUpload();
    const api = new FakeUserApi();
    api.next = () =>
      throwError(() => new HttpErrorResponse({ status: 503, statusText: 'Service Unavailable' }));
    api.nextCurrent = () => of({ ...USER, profilePicture: 'https://old.example.com/prev.jpg' });
    const fixture = create(upload, api);

    await fixture.componentInstance.onFile(fakeEvent(fakeFile()));

    expect(api.currentCalls).toBe(1);
    expect(fixture.componentInstance.phase()).toBe('error');
    expect(fixture.componentInstance.errorKey()).toBe('upload.errors.failed');
  });

  it('does not probe on a definitive 400 rejection', async () => {
    const upload = new FakeUpload();
    const api = new FakeUserApi();
    api.next = () =>
      throwError(() => new HttpErrorResponse({ status: 400, statusText: 'Bad Request' }));
    const fixture = create(upload, api);

    await fixture.componentInstance.onFile(fakeEvent(fakeFile()));

    expect(api.currentCalls).toBe(0);
    expect(fixture.componentInstance.phase()).toBe('error');
    expect(fixture.componentInstance.errorKey()).toBe('upload.errors.invalid_input');
  });
});
