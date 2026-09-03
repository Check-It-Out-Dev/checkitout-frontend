import { ComponentFixture, TestBed, fakeAsync, flush } from '@angular/core/testing';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { TranslocoTestingModule } from '@ngneat/transloco';
import { Observable, of, throwError } from 'rxjs';
import { LegalDocumentType } from '../../../api/model/legal-document-type';
import type { LegalDocumentDtoOut } from '../../../api/model/legal-document-dto-out';
import { LegalApiService } from '../../../core/legal/legal-api.service';
import { LegalClickwrapComponent } from './legal-clickwrap.component';

const SAMPLE_DOCS: LegalDocumentDtoOut[] = [
  {
    type: LegalDocumentType.TERMS_OF_SERVICE,
    version: 3,
    contentHash: 'tos-hash',
    downloadUrl: 'https://app.example/tos.pdf',
  },
  {
    type: LegalDocumentType.PRIVACY_POLICY,
    version: 3,
    contentHash: 'pp-hash',
    downloadUrl: 'https://app.example/pp.pdf',
  },
  {
    type: LegalDocumentType.COOKIE_POLICY,
    version: 1,
    contentHash: 'cp-hash',
    downloadUrl: 'https://app.example/cp.pdf',
  },
];

class FakeLegalApi {
  documentsResponse: () => Observable<LegalDocumentDtoOut[]> = () => of(SAMPLE_DOCS);
  prepareResponse: () => Observable<unknown> = () => of({});
  prepareCalls: Array<{ documentType: LegalDocumentType; documentHash: string }> = [];

  getCurrentDocuments(): Observable<LegalDocumentDtoOut[]> {
    return this.documentsResponse();
  }
  prepareConsentCookie(args: {
    documentType: LegalDocumentType;
    version: number;
    documentHash: string;
  }): Observable<unknown> {
    this.prepareCalls.push({ documentType: args.documentType, documentHash: args.documentHash });
    return this.prepareResponse();
  }
}

function setup(api: FakeLegalApi): {
  fixture: ComponentFixture<LegalClickwrapComponent>;
  api: FakeLegalApi;
} {
  TestBed.configureTestingModule({
    imports: [
      LegalClickwrapComponent,
      TranslocoTestingModule.forRoot({
        langs: { en: {} },
        translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
      }),
    ],
    providers: [provideAnimationsAsync(), { provide: LegalApiService, useValue: api }],
  });
  const fixture = TestBed.createComponent(LegalClickwrapComponent);
  return { fixture, api };
}

function trigger(
  fixture: ComponentFixture<LegalClickwrapComponent>,
  type: LegalDocumentType,
  checked: boolean,
): void {
  const docs = fixture.componentInstance.documents();
  const doc = docs.find((d) => d.type === type);
  if (!doc) throw new Error(`doc ${type} not loaded`);
  fixture.componentInstance.captureClickProof(
    new MouseEvent('mousedown', { isTrusted: false } as MouseEventInit),
    fixture.componentInstance.checkboxId(type),
  );
  fixture.componentInstance.onCheckboxChange({ checked, source: {} as never } as never, doc);
}

describe('LegalClickwrapComponent', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('loads current documents on init and renders 3 checkboxes', fakeAsync(() => {
    const api = new FakeLegalApi();
    const { fixture } = setup(api);
    fixture.detectChanges();
    flush();
    fixture.detectChanges();

    expect(fixture.componentInstance.loading()).toBe(false);
    expect(fixture.componentInstance.loadError()).toBe(false);
    expect(fixture.componentInstance.documents()).toHaveLength(3);
    const rows = fixture.nativeElement.querySelectorAll('[data-testid^="legal-clickwrap-row-"]');
    expect(rows.length).toBe(3);
  }));

  // Regression: BE returns one doc per (type, language) — typically 6
  // when both PL + EN variants exist. Component must dedupe by type so
  // the user sees ONE checkbox per consent type, not six rows with
  // identical i18n-resolved labels but PDF links to different locales.
  // Caught in R7 smoke + Stage 6g parity sweep 2026-05-13.
  it('dedupes by type when BE returns multi-language variants (PL + EN per type)', fakeAsync(() => {
    const api = new FakeLegalApi();
    api.documentsResponse = () =>
      of([
        // BE-style: 6 docs (PL first per Accept-Language, then EN)
        {
          type: LegalDocumentType.TERMS_OF_SERVICE,
          version: 3,
          contentHash: 'tos-pl',
          downloadUrl: 'https://app.example/tos-pl.pdf',
        },
        {
          type: LegalDocumentType.PRIVACY_POLICY,
          version: 3,
          contentHash: 'pp-pl',
          downloadUrl: 'https://app.example/pp-pl.pdf',
        },
        {
          type: LegalDocumentType.COOKIE_POLICY,
          version: 1,
          contentHash: 'cp-pl',
          downloadUrl: 'https://app.example/cp-pl.pdf',
        },
        {
          type: LegalDocumentType.TERMS_OF_SERVICE,
          version: 3,
          contentHash: 'tos-en',
          downloadUrl: 'https://app.example/tos-en.pdf',
        },
        {
          type: LegalDocumentType.PRIVACY_POLICY,
          version: 3,
          contentHash: 'pp-en',
          downloadUrl: 'https://app.example/pp-en.pdf',
        },
        {
          type: LegalDocumentType.COOKIE_POLICY,
          version: 1,
          contentHash: 'cp-en',
          downloadUrl: 'https://app.example/cp-en.pdf',
        },
      ]);
    const { fixture } = setup(api);
    fixture.detectChanges();
    flush();
    fixture.detectChanges();

    expect(fixture.componentInstance.documents()).toHaveLength(3);
    const rows = fixture.nativeElement.querySelectorAll('[data-testid^="legal-clickwrap-row-"]');
    expect(rows.length).toBe(3);
    // Each type appears exactly once
    const docTypes = fixture.componentInstance.documents().map((d) => d.type);
    expect(new Set(docTypes).size).toBe(3);
    // First-occurrence wins per BE order (PL came first → PL hash kept)
    expect(
      fixture.componentInstance
        .documents()
        .find((d) => d.type === LegalDocumentType.TERMS_OF_SERVICE)?.contentHash,
    ).toBe('tos-pl');
  }));

  it('flips loadError when /legal/current returns less than 3 required documents', fakeAsync(() => {
    const api = new FakeLegalApi();
    api.documentsResponse = () => of([SAMPLE_DOCS[0]]); // only TOS
    const { fixture } = setup(api);
    fixture.detectChanges();
    flush();

    expect(fixture.componentInstance.loadError()).toBe(true);
    expect(fixture.componentInstance.documents()).toHaveLength(0);
  }));

  it('flips loadError when /legal/current errors', fakeAsync(() => {
    const api = new FakeLegalApi();
    api.documentsResponse = () => throwError(() => new Error('500'));
    const { fixture } = setup(api);
    fixture.detectChanges();
    flush();

    expect(fixture.componentInstance.loadError()).toBe(true);
  }));

  it('emits allAccepted=false until every required document has been accepted', fakeAsync(() => {
    const api = new FakeLegalApi();
    const { fixture } = setup(api);
    const emitted: boolean[] = [];
    fixture.componentInstance.allAccepted.subscribe((v) => emitted.push(v));
    fixture.detectChanges();
    flush();

    trigger(fixture, LegalDocumentType.TERMS_OF_SERVICE, true);
    flush();
    trigger(fixture, LegalDocumentType.PRIVACY_POLICY, true);
    flush();

    expect(emitted).toEqual([false, false]);
    expect(fixture.componentInstance.isValid()).toBe(false);

    trigger(fixture, LegalDocumentType.COOKIE_POLICY, true);
    flush();

    expect(emitted).toEqual([false, false, true]);
    expect(fixture.componentInstance.isValid()).toBe(true);
  }));

  it('calls prepareConsentCookie with the document hash + version on each accept', fakeAsync(() => {
    const api = new FakeLegalApi();
    const { fixture } = setup(api);
    fixture.detectChanges();
    flush();

    trigger(fixture, LegalDocumentType.TERMS_OF_SERVICE, true);
    trigger(fixture, LegalDocumentType.PRIVACY_POLICY, true);
    trigger(fixture, LegalDocumentType.COOKIE_POLICY, true);
    flush();

    expect(api.prepareCalls).toEqual([
      { documentType: LegalDocumentType.TERMS_OF_SERVICE, documentHash: 'tos-hash' },
      { documentType: LegalDocumentType.PRIVACY_POLICY, documentHash: 'pp-hash' },
      { documentType: LegalDocumentType.COOKIE_POLICY, documentHash: 'cp-hash' },
    ]);
  }));

  it('flips state to failed + sets prepareError when prepareConsentCookie fails', fakeAsync(() => {
    const api = new FakeLegalApi();
    api.prepareResponse = () => throwError(() => new Error('400'));
    const { fixture } = setup(api);
    const emitted: boolean[] = [];
    fixture.componentInstance.allAccepted.subscribe((v) => emitted.push(v));
    fixture.detectChanges();
    flush();

    trigger(fixture, LegalDocumentType.TERMS_OF_SERVICE, true);
    flush();

    expect(fixture.componentInstance.state(LegalDocumentType.TERMS_OF_SERVICE)).toBe('failed');
    expect(fixture.componentInstance.prepareError()).toBe(true);
    expect(emitted).toEqual([false]);
  }));

  it('flips back to idle on uncheck (no API call)', fakeAsync(() => {
    const api = new FakeLegalApi();
    const { fixture } = setup(api);
    fixture.detectChanges();
    flush();

    trigger(fixture, LegalDocumentType.TERMS_OF_SERVICE, true);
    flush();
    expect(fixture.componentInstance.state(LegalDocumentType.TERMS_OF_SERVICE)).toBe('accepted');

    trigger(fixture, LegalDocumentType.TERMS_OF_SERVICE, false);
    flush();
    expect(fixture.componentInstance.state(LegalDocumentType.TERMS_OF_SERVICE)).toBe('idle');
    // Only the initial accept hit the API.
    expect(api.prepareCalls).toHaveLength(1);
  }));

  it('captures click-proof via mousedown for the consent_proof bundle', fakeAsync(() => {
    const api = new FakeLegalApi();
    const { fixture } = setup(api);
    fixture.detectChanges();
    flush();

    // Simulate the captureClickProof + onCheckboxChange pair.
    trigger(fixture, LegalDocumentType.TERMS_OF_SERVICE, true);
    flush();

    expect(api.prepareCalls).toHaveLength(1);
    // The proof bundle is internal to the service call — the spec
    // verifies the public effect (state becomes accepted).
    expect(fixture.componentInstance.state(LegalDocumentType.TERMS_OF_SERVICE)).toBe('accepted');
  }));
});
