import { provideHttpClient, withXhr } from '@angular/common/http';
import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { MatDialogRef } from '@angular/material/dialog';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@ngneat/transloco';
import { Observable, of, throwError } from 'rxjs';
import type { ConsentRecordDtoIn } from '../../api/model/consent-record-dto-in';
import type { LegalDocumentDtoOut } from '../../api/model/legal-document-dto-out';
import { LegalApiService } from '../../core/legal/legal-api.service';
import { ShellStatusService } from '../../core/shell/shell-status.service';
import { ReconsentDialogComponent } from './reconsent-dialog.component';

const DOCS: LegalDocumentDtoOut[] = [
  { type: 'TERMS_OF_SERVICE', version: 3, contentHash: 'hash-tos' } as LegalDocumentDtoOut,
  { type: 'PRIVACY_POLICY', version: 2, contentHash: 'hash-pp' } as LegalDocumentDtoOut,
  { type: 'COOKIE_POLICY', version: 2, contentHash: 'hash-cp' } as LegalDocumentDtoOut,
];

class FakeLegalApi {
  batches: ConsentRecordDtoIn[][] = [];
  failBatch = false;

  getCurrentDocuments(): Observable<LegalDocumentDtoOut[]> {
    return of(DOCS);
  }
  prepareConsentCookie(): Observable<void> {
    return of(undefined);
  }
  recordConsentBatch(records: ConsentRecordDtoIn[]): Observable<unknown> {
    if (this.failBatch) return throwError(() => ({ status: 500 }));
    this.batches.push(records);
    return of({});
  }
}

class FakeDialogRef {
  closed: unknown[] = [];
  close(result?: unknown): void {
    this.closed.push(result);
  }
}

describe('ReconsentDialogComponent', () => {
  let fixture: ComponentFixture<ReconsentDialogComponent>;
  let api: FakeLegalApi;
  let dialogRef: FakeDialogRef;
  let status: ShellStatusService;

  beforeEach(fakeAsync(() => {
    api = new FakeLegalApi();
    dialogRef = new FakeDialogRef();
    TestBed.configureTestingModule({
      imports: [
        ReconsentDialogComponent,
        TranslocoTestingModule.forRoot({
          langs: { pl: {} },
          translocoConfig: { availableLangs: ['pl'], defaultLang: 'pl' },
        }),
      ],
      providers: [
        provideHttpClient(withXhr()),
        provideAnimationsAsync(),
        provideRouter([]),
        { provide: LegalApiService, useValue: api },
        { provide: MatDialogRef, useValue: dialogRef },
      ],
    });
    status = TestBed.inject(ShellStatusService);
    status.setBlockedForTerms(true, 4);
    fixture = TestBed.createComponent(ReconsentDialogComponent);
    fixture.detectChanges();
    tick();
  }));

  afterEach(() => TestBed.resetTestingModule());

  function clickEvent(): MouseEvent {
    return new MouseEvent('click', { screenX: 10, screenY: 20 });
  }

  it('keeps accept disabled until the clickwrap reports all-accepted', () => {
    const c = fixture.componentInstance;
    expect(c.allAccepted()).toBe(false);
    c.accept(clickEvent());
    expect(api.batches).toHaveLength(0);
  });

  it('submits ALL THREE GRANTED records with per-document hashes, clears state, closes(true)', fakeAsync(() => {
    const c = fixture.componentInstance;
    c.allAccepted.set(true);
    c.accept(clickEvent());
    tick();

    expect(api.batches).toHaveLength(1);
    const records = api.batches[0]!;
    expect(records.map((r) => r.documentType)).toEqual([
      'TERMS_OF_SERVICE',
      'PRIVACY_POLICY',
      'COOKIE_POLICY',
    ]);
    expect(records.every((r) => r.action === 'GRANTED')).toBe(true);
    expect(records.map((r) => r.proof?.documentHash)).toEqual(['hash-tos', 'hash-pp', 'hash-cp']);
    expect(records[0]?.proof?.checkboxId).toBe('reconsent-terms_of_service');

    expect(status.blockedForTerms()).toBe(false);
    expect(dialogRef.closed).toEqual([true]);
  }));

  it('surfaces a batch failure inline and stays open', fakeAsync(() => {
    api.failBatch = true;
    const c = fixture.componentInstance;
    c.allAccepted.set(true);
    c.accept(clickEvent());
    tick();

    expect(c.errorKey()).toBe('legal.reconsent.error');
    expect(c.submitting()).toBe(false);
    expect(dialogRef.closed).toHaveLength(0);
    expect(status.blockedForTerms()).toBe(true);
  }));
});
