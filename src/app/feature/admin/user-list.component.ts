import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { TranslocoModule } from '@ngneat/transloco';
import type { UserDtoOut } from '../../api/model/user-dto-out';
import { UserApiService } from '../../core/user/user.service';

type LoadState = 'loading' | 'loaded' | 'empty' | 'error';

const PAGE_SIZE = 20;

/**
 * Admin user-management table at `/user/list` (Journey 8; legacy
 * UserListComponent parity). Server-side paged `GET /users/paged` with the
 * legacy filter set — free-text search, userType, accountStatus (defaulting
 * to IN_VALIDATION like legacy: the admin's main job here is approving the
 * validation queue). Row chips reuse the legacy palette semantics. Row-level
 * editing (role/status PATCH) stays with the admin API through the detail
 * dialog in a follow-up; this slice is the list surface.
 */
@Component({
    selector: 'app-admin-user-list',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [
        CommonModule,
        ReactiveFormsModule,
        MatButtonModule,
        MatFormFieldModule,
        MatIconModule,
        MatInputModule,
        MatPaginatorModule,
        MatProgressSpinnerModule,
        MatSelectModule,
        TranslocoModule,
    ],
    templateUrl: './user-list.component.html'
})
export class AdminUserListComponent implements OnInit {
  private readonly api = inject(UserApiService);

  readonly state = signal<LoadState>('loading');
  readonly users = signal<UserDtoOut[]>([]);
  readonly totalElements = signal(0);
  readonly pageIndex = signal(0);
  readonly pageSize = PAGE_SIZE;

  readonly search = new FormControl('', { nonNullable: true });
  /** Legacy default: the IN_VALIDATION approval queue front and center. */
  readonly accountStatus = new FormControl('IN_VALIDATION', { nonNullable: true });
  readonly userType = new FormControl('', { nonNullable: true });

  readonly statusOptions = ['', 'IN_VALIDATION', 'ACTIVE', 'INACTIVE', 'BANNED'];
  readonly typeOptions = ['', 'INFLUENCER', 'COMPANY', 'ADMIN', 'PENDING_ADMIN'];

  ngOnInit(): void {
    this.load();
  }

  applyFilters(): void {
    this.pageIndex.set(0);
    this.load();
  }

  onPage(event: PageEvent): void {
    this.pageIndex.set(event.pageIndex);
    this.load();
  }

  load(): void {
    this.state.set('loading');
    const filters: Record<string, string> = {};
    if (this.search.value.trim()) filters['search'] = this.search.value.trim();
    if (this.userType.value) filters['userType'] = this.userType.value;
    if (this.accountStatus.value) filters['accountStatus'] = this.accountStatus.value;

    this.api.adminList(this.pageIndex(), this.pageSize, filters).subscribe({
      next: (page) => {
        const content = page.content ?? [];
        this.users.set(content);
        this.totalElements.set(page.totalElements ?? content.length);
        this.state.set(content.length === 0 ? 'empty' : 'loaded');
      },
      error: () => this.state.set('error'),
    });
  }

  displayName(user: UserDtoOut): string {
    const full = [user.firstName, user.lastName].filter(Boolean).join(' ');
    return full || user.email || '—';
  }

  typeChipClass(type?: string): string {
    switch (type) {
      case 'INFLUENCER':
        return 'bg-emerald-100 text-emerald-800';
      case 'COMPANY':
        return 'bg-blue-100 text-blue-800';
      case 'ADMIN':
        return 'bg-purple-100 text-purple-800';
      case 'PENDING_ADMIN':
        return 'bg-yellow-100 text-yellow-800';
      default:
        return 'bg-slate-100 text-slate-700';
    }
  }

  statusChipClass(status?: string): string {
    switch (status) {
      case 'ACTIVE':
        return 'bg-emerald-100 text-emerald-800';
      case 'IN_VALIDATION':
        return 'bg-amber-100 text-amber-800';
      case 'BANNED':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-slate-100 text-slate-700';
    }
  }
}
