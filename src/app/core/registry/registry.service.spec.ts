import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { RegistryService as GeneratedRegistryService } from '../../api/api/registry.api';
import type { NipLookupResponse } from '../../api/model/nip-lookup-response';
import { CompanyRegistryService } from './registry.service';

describe('CompanyRegistryService', () => {
  let service: CompanyRegistryService;
  let api: { lookupByNip: jest.Mock };

  beforeEach(() => {
    api = { lookupByNip: jest.fn() };
    TestBed.configureTestingModule({
      providers: [CompanyRegistryService, { provide: GeneratedRegistryService, useValue: api }],
    });
    service = TestBed.inject(CompanyRegistryService);
  });

  it('lookup(nip) wraps the value in the nipLookupRequest envelope', () => {
    const response = { companyName: 'Acme', nip: '5261040828' } as unknown as NipLookupResponse;
    api.lookupByNip.mockReturnValue(of(response));

    let received: NipLookupResponse | undefined;
    service.lookup('5261040828').subscribe((r) => (received = r));

    expect(api.lookupByNip).toHaveBeenCalledTimes(1);
    expect(api.lookupByNip).toHaveBeenCalledWith({ nipLookupRequest: { nip: '5261040828' } });
    expect(received).toBe(response);
  });

  it('passes the NIP verbatim — no trimming / normalisation', () => {
    // BE owns NIP validation; client-side trimming would mask a real
    // "user typed whitespace" UX bug. Other registry tests verify the
    // contract is "send what you got".
    api.lookupByNip.mockReturnValue(of({} as NipLookupResponse));

    service.lookup('  5261040828  ').subscribe();
    expect(api.lookupByNip).toHaveBeenCalledWith({
      nipLookupRequest: { nip: '  5261040828  ' },
    });

    service.lookup('').subscribe();
    expect(api.lookupByNip).toHaveBeenLastCalledWith({
      nipLookupRequest: { nip: '' },
    });
  });
});
