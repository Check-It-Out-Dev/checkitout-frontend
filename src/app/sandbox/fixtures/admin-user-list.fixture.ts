import { Observable, of, throwError } from 'rxjs';
import type { PageUserDtoOut } from '../../api/model/page-user-dto-out';
import { UserApiService } from '../../core/user/user.service';
import { AdminUserListComponent } from '../../feature/admin/user-list.component';
import type { SandboxFixture } from '../sandbox-registry';

/** Admin user-management list (Journey 8) fixtures. */

const USERS = [
  {
    id: 47001,
    firstName: 'Marta',
    lastName: 'Nowak',
    email: 'marta.nowak@example.com',
    userType: { value: 'INFLUENCER', label: 'Influencer' },
    accountStatus: { value: 'IN_VALIDATION', label: 'In validation' },
  },
  {
    id: 47002,
    firstName: 'Bistro',
    lastName: 'Widok',
    email: 'kontakt@bistrowidok.pl',
    userType: { value: 'COMPANY', label: 'Company' },
    accountStatus: { value: 'ACTIVE', label: 'Active' },
  },
  {
    id: 47003,
    email: 'pending.admin@checkitout.app',
    userType: { value: 'PENDING_ADMIN', label: 'Pending admin' },
    accountStatus: { value: 'IN_VALIDATION', label: 'In validation' },
  },
  {
    id: 47004,
    firstName: 'Zbanowany',
    lastName: 'User',
    email: 'banned@example.com',
    userType: { value: 'INFLUENCER', label: 'Influencer' },
    accountStatus: { value: 'BANNED', label: 'Banned' },
  },
] as never[];

class StubLoaded {
  adminList(): Observable<PageUserDtoOut> {
    return of({ content: USERS, totalElements: 4, number: 0, size: 20 } as PageUserDtoOut);
  }
}

class StubEmpty {
  adminList(): Observable<PageUserDtoOut> {
    return of({ content: [], totalElements: 0, number: 0, size: 20 } as PageUserDtoOut);
  }
}

class StubError {
  adminList(): Observable<PageUserDtoOut> {
    return throwError(() => ({ status: 500 }));
  }
}

export const ADMIN_USER_LIST_FIXTURES: readonly SandboxFixture[] = [
  {
    id: 'admin-user-list-loaded',
    label: 'Admin user list · 4 users across roles/statuses',
    component: AdminUserListComponent,
    providers: [{ provide: UserApiService, useClass: StubLoaded }],
  },
  {
    id: 'admin-user-list-empty',
    label: 'Admin user list · empty state',
    component: AdminUserListComponent,
    providers: [{ provide: UserApiService, useClass: StubEmpty }],
  },
  {
    id: 'admin-user-list-error',
    label: 'Admin user list · error state',
    component: AdminUserListComponent,
    providers: [{ provide: UserApiService, useClass: StubError }],
  },
];
