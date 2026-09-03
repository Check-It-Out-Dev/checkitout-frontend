import { TestBed } from '@angular/core/testing';
import { Observable, lastValueFrom, of } from 'rxjs';
import { LegalControllerService as LegalService } from '../../api/api/legal-controller.api';
import type { AnonymousConsentDtoIn } from '../../api/model/anonymous-consent-dto-in';
import type { AnonymousConsentDtoOut } from '../../api/model/anonymous-consent-dto-out';
import type { ConsentProofDtoIn } from '../../api/model/consent-proof-dto-in';
import type { ConsentStatusDtoOut } from '../../api/model/consent-status-dto-out';
import { LegalDocumentType } from '../../api/model/legal-document-type';
import type { LegalDocumentDtoOut } from '../../api/model/legal-document-dto-out';
import { LegalApiService } from './legal-api.service';

class FakeGeneratedLegal {
  prepareCalls: Array<unknown> = [];
  anonymousCalls: Array<unknown> = [];
  documentsResponse: LegalDocumentDtoOut[] = [];
  statusResponse: ConsentStatusDtoOut = {} as ConsentStatusDtoOut;

  getCurrentDocuments(): Observable<LegalDocumentDtoOut[]> {
    return of(this.documentsResponse);
  }
  getMyConsentStatus(): Observable<ConsentStatusDtoOut> {
    return of(this.statusResponse);
  }
  prepareConsentCookie(req: unknown): Observable<unknown> {
    this.prepareCalls.push(req);
    return of({});
  }
  recordAnonymousConsent(req: unknown): Observable<AnonymousConsentDtoOut> {
    this.anonymousCalls.push(req);
    return of({} as AnonymousConsentDtoOut);
  }
}

function setup(): { service: LegalApiService; api: FakeGeneratedLegal } {
  const api = new FakeGeneratedLegal();
  TestBed.configureTestingModule({
    providers: [LegalApiService, { provide: LegalService, useValue: api }],
  });
  const service = TestBed.inject(LegalApiService);
  return { service, api };
}

describe('LegalApiService', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('proxies getCurrentDocuments to the generated client', async () => {
    const { service, api } = setup();
    api.documentsResponse = [
      { type: LegalDocumentType.PRIVACY_POLICY, version: 3, contentHash: 'abc' },
    ];

    const docs = await lastValueFrom(service.getCurrentDocuments());

    expect(docs).toEqual([
      { type: LegalDocumentType.PRIVACY_POLICY, version: 3, contentHash: 'abc' },
    ]);
  });

  it('forwards prepareConsentCookie payload + the BE-correct documentType string', async () => {
    const { service, api } = setup();
    const proof: ConsentProofDtoIn = {
      timestamp: 1700000000000,
      eventTrusted: true,
      checkboxId: 'tos-checkbox',
      documentHash: 'hash-abc',
    } as ConsentProofDtoIn;

    await lastValueFrom(
      service.prepareConsentCookie({
        documentType: LegalDocumentType.TERMS_OF_SERVICE,
        version: 3,
        documentHash: 'hash-abc',
        proof,
      }),
    );

    expect(api.prepareCalls).toHaveLength(1);
    expect(api.prepareCalls[0]).toEqual({
      consentPrepareRequest: {
        // Critical: BE accepts these literal strings (LegalDocumentType.valueOf
        // on the server). Don't conflate with the buggy
        // ConsentPrepareRequestDocumentTypeEnum which has stale values.
        documentType: 'TERMS_OF_SERVICE',
        version: 3,
        documentHash: 'hash-abc',
        proof,
      },
    });
  });

  it('forwards COOKIE_POLICY (no S — matches BE LegalDocumentType enum)', async () => {
    const { service, api } = setup();

    await lastValueFrom(
      service.prepareConsentCookie({
        documentType: LegalDocumentType.COOKIE_POLICY,
        version: 1,
        documentHash: 'h',
        proof: {} as ConsentProofDtoIn,
      }),
    );

    const call = api.prepareCalls[0] as {
      consentPrepareRequest: { documentType: string };
    };
    expect(call.consentPrepareRequest.documentType).toBe('COOKIE_POLICY');
  });

  it('proxies recordAnonymousConsent', async () => {
    const { service, api } = setup();
    const dto = { documentType: 'PRIVACY_POLICY' } as AnonymousConsentDtoIn;

    await lastValueFrom(service.recordAnonymousConsent(dto));

    expect(api.anonymousCalls).toEqual([{ anonymousConsentDtoIn: dto }]);
  });

  it('proxies getMyConsentStatus', async () => {
    const { service, api } = setup();
    api.statusResponse = {
      newestConsentsAccepted: false,
      daysToAcceptNewTerms: 7,
    } as ConsentStatusDtoOut;

    const status = await lastValueFrom(service.getMyConsentStatus());

    expect(status.newestConsentsAccepted).toBe(false);
    expect(status.daysToAcceptNewTerms).toBe(7);
  });
});
