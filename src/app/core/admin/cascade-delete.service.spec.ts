import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { AdminCascadeDeleteControllerService as GeneratedCascadeApi } from '../../api/api/admin-cascade-delete-controller.api';
import type { CascadeDeletePreview } from '../../api/model/cascade-delete-preview';
import { CascadeDeleteApiService } from './cascade-delete.service';

describe('CascadeDeleteApiService', () => {
  let service: CascadeDeleteApiService;
  let api: {
    previewPartnershipOpportunityDeletion: jest.Mock;
    forceDeletePartnershipOpportunity: jest.Mock;
  };

  beforeEach(() => {
    api = {
      previewPartnershipOpportunityDeletion: jest.fn(),
      forceDeletePartnershipOpportunity: jest.fn(),
    };
    TestBed.configureTestingModule({
      providers: [CascadeDeleteApiService, { provide: GeneratedCascadeApi, useValue: api }],
    });
    service = TestBed.inject(CascadeDeleteApiService);
  });

  it('previewPartnership() forwards the id in the envelope', () => {
    const preview: CascadeDeletePreview = { confirmationCode: 'ABC123', totalEntityCount: 7 };
    api.previewPartnershipOpportunityDeletion.mockReturnValue(of(preview));

    let result: CascadeDeletePreview | undefined;
    service.previewPartnership(501).subscribe((v) => (result = v));

    expect(api.previewPartnershipOpportunityDeletion).toHaveBeenCalledWith({ poId: 501 });
    expect(result?.confirmationCode).toBe('ABC123');
  });

  it('forceDeletePartnership() echoes code + expected count in the confirmation body — the BE re-verifies both', () => {
    api.forceDeletePartnershipOpportunity.mockReturnValue(of({ success: true }));

    service.forceDeletePartnership(501, 'ABC123', 7, 'duplikat kampanii').subscribe();

    expect(api.forceDeletePartnershipOpportunity).toHaveBeenCalledWith({
      poId: 501,
      cascadeDeleteConfirmationRequest: {
        confirmationCode: 'ABC123',
        expectedEntityCount: 7,
        reason: 'duplikat kampanii',
      },
    });
  });

  it('forceDeletePartnership() sends undefined reason when the admin gives none', () => {
    api.forceDeletePartnershipOpportunity.mockReturnValue(of({ success: true }));

    service.forceDeletePartnership(501, 'ABC123', 7).subscribe();

    expect(api.forceDeletePartnershipOpportunity).toHaveBeenCalledWith({
      poId: 501,
      cascadeDeleteConfirmationRequest: {
        confirmationCode: 'ABC123',
        expectedEntityCount: 7,
        reason: undefined,
      },
    });
  });
});
