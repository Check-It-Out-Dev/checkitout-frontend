import { Observable, of } from 'rxjs';
import type { UserDtoOut } from '../../api/model/user-dto-out';
import { UploadService, type UploadResult } from '../../core/upload/upload.service';
import { UserApiService } from '../../core/user/user.service';
import { ProfilePictureUploadComponent } from '../../feature/profile/profile-picture-upload.component';
import type { SandboxFixture } from '../sandbox-registry';

const USER_NO_PIC: UserDtoOut = {
  id: 42,
  email: 'maja@example.com',
  emailVerified: true,
  userType: { value: 'INFLUENCER', label: 'Influencer' } as UserDtoOut['userType'],
  accountStatus: { value: 'ACTIVE', label: 'Active' } as UserDtoOut['accountStatus'],
};

const USER_WITH_PIC: UserDtoOut = {
  ...USER_NO_PIC,
  profilePicture: 'https://placehold.co/200x200/e2e8f0/64748b?text=Maja',
};

class StubUpload {
  uploadProfilePhoto(): Observable<UploadResult> {
    return of({
      publicUrl: USER_WITH_PIC.profilePicture!,
      filePath: 'profile-pictures/42/photo.jpg',
      uploadId: 'fixture',
    });
  }
}

class StubUserApi {
  getCurrent(): Observable<UserDtoOut> {
    return of(USER_WITH_PIC);
  }
  patch(): Observable<UserDtoOut> {
    return of(USER_WITH_PIC);
  }
}

export const PROFILE_PICTURE_UPLOAD_FIXTURES: readonly SandboxFixture[] = [
  {
    id: 'profile-picture-upload-empty',
    label: 'Profile picture · empty (default avatar)',
    component: ProfilePictureUploadComponent,
    inputs: { user: USER_NO_PIC },
    viewport: { width: 560, height: 160 },
    providers: [
      { provide: UploadService, useClass: StubUpload },
      { provide: UserApiService, useClass: StubUserApi },
    ],
  },
  {
    id: 'profile-picture-upload-existing',
    label: 'Profile picture · existing image',
    component: ProfilePictureUploadComponent,
    inputs: { user: USER_WITH_PIC },
    viewport: { width: 560, height: 160 },
    providers: [
      { provide: UploadService, useClass: StubUpload },
      { provide: UserApiService, useClass: StubUserApi },
    ],
  },
];
