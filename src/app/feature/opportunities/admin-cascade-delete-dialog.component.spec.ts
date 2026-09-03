import { provideHttpClient, withXhr } from '@angular/common/http';
import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { TranslocoTestingModule } from '@ngneat/transloco';
import { Observable, of, throwError } from 'rxjs';
import type { CascadeDeletePreview } from '../../api/model/cascade-delete-preview';
import type { CascadeDeleteResult } from '../../api/model/cascade-delete-result';
import { CascadeDeleteApiService } from '../../core/admin/cascade-delete.service';
import { AdminCascadeDeleteDialogComponent } from './admin-cascade-delete-dialog.component';

const PREVIEW: CascadeDeletePreview = {
  totalEntityCount: 14,
  confirmationCode: 'code-abc',
  entityBreakdown: [
    { entityType: 'APPLIED_OPPORTUNITY', count: 5, description: 'Applications' },
    { entityType: 'CONTENT', count: 9, description: 'Content rows' },
  ],
  warnings: ['2 applications are in progress'],
};

class FakeCascadeApi {
  previewFn: () => Observable<CascadeDeletePreview> = () => of(PREVIEW);
  deleteCalls: { poId: number; code: string; expected: number }[] = [];
  deleteFn: () => Observable<CascadeDeleteResult> = () =>
    of({ success: true, totalDeleted: 14 } as CascadeDeleteResult);

  previewPartnership(): Observable<CascadeDeletePreview> {
    return this.previewFn();
  }
  forceDeletePartnership(
    poId: number,
    code: string,
    expected: number,
  ): Observable<CascadeDeleteResult> {
    this.deleteCalls.push({ poId, code, expected });
    return this.deleteFn();
  }
}

class FakeDialogRef {
  closed: unknown[] = [];
  close(result?: unknown): void {
    this.closed.push(result);
  }
}

describe('AdminCascadeDeleteDialogComponent', () => {
  let fixture: ComponentFixture<AdminCascadeDeleteDialogComponent>;
  let api: FakeCascadeApi;
  let dialogRef: FakeDialogRef;

  function create(): void {
    TestBed.configureTestingModule({
      imports: [
        AdminCascadeDeleteDialogComponent,
        TranslocoTestingModule.forRoot({
          langs: { pl: {} },
          translocoConfig: { availableLangs: ['pl'], defaultLang: 'pl' },
        }),
      ],
      providers: [
        provideHttpClient(withXhr()),
        provideAnimationsAsync(),
        { provide: CascadeDeleteApiService, useValue: api },
        { provide: MatDialogRef, useValue: dialogRef },
        {
          provide: MAT_DIALOG_DATA,
          useValue: { partnershipOpportunityId: 7, title: 'Sneaker drop', companyName: 'Acme' },
        },
      ],
    });
    fixture = TestBed.createComponent(AdminCascadeDeleteDialogComponent);
    fixture.detectChanges();
  }

  beforeEach(() => {
    api = new FakeCascadeApi();
    dialogRef = new FakeDialogRef();
  });
  afterEach(() => TestBed.resetTestingModule());

  it('loads the preview and lands in preview state', fakeAsync(() => {
    create();
    tick();
    expect(fixture.componentInstance.state()).toBe('preview');
    expect(fixture.componentInstance.preview()?.totalEntityCount).toBe(14);
  }));

  it('confirm echoes the code AND the expected count; success closes(true) via close()', fakeAsync(() => {
    create();
    tick();
    fixture.componentInstance.confirmDelete();
    tick();
    expect(api.deleteCalls).toEqual([{ poId: 7, code: 'code-abc', expected: 14 }]);
    expect(fixture.componentInstance.state()).toBe('success');
    fixture.componentInstance.close();
    expect(dialogRef.closed).toEqual([true]);
  }));

  it('maps success:false to the partial state and close() returns false', fakeAsync(() => {
    api.deleteFn = () =>
      of({ success: false, totalDeleted: 9, canRetry: true } as CascadeDeleteResult);
    create();
    tick();
    fixture.componentInstance.confirmDelete();
    tick();
    expect(fixture.componentInstance.state()).toBe('partial');
    fixture.componentInstance.close();
    expect(dialogRef.closed).toEqual([false]);
  }));

  it('preview failure lands in error; delete failure lands in error', fakeAsync(() => {
    api.previewFn = () => throwError(() => ({ status: 500 }));
    create();
    tick();
    expect(fixture.componentInstance.state()).toBe('error');
    TestBed.resetTestingModule();

    api = new FakeCascadeApi();
    api.deleteFn = () => throwError(() => ({ status: 500 }));
    dialogRef = new FakeDialogRef();
    create();
    tick();
    fixture.componentInstance.confirmDelete();
    tick();
    expect(fixture.componentInstance.state()).toBe('error');
  }));
});
