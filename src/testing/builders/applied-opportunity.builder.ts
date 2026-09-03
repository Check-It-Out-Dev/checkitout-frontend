import type { AppliedOpportunityDtoOut } from '../../app/api/model/applied-opportunity-dto-out';
import { OpportunityStatus } from '../../app/api/model/opportunity-status';
import { buildOpportunityStatus } from './opportunity.builder';
import { mergeDto, type DeepPartial } from './merge';

/**
 * An influencer's application to a campaign, freshly APPLIED. Use
 * `buildOpportunityStatus(...)` in overrides to move it along the
 * lifecycle — the status wrapper carries the PL labels components render.
 */
export function buildApplication(
  overrides?: DeepPartial<AppliedOpportunityDtoOut>,
): AppliedOpportunityDtoOut {
  return mergeDto<AppliedOpportunityDtoOut>(
    {
      id: 9001,
      opportunityStatus: buildOpportunityStatus(OpportunityStatus.APPLIED),
      note: 'Dzień dobry! Prowadzę krakowski profil kawowy i chętnie pokażę Waszą letnią kartę.',
      executionDate: '2026-09-02T12:00:00',
      createdTime: '2026-09-01T14:05:00',
      lastUpdateTime: '2026-09-01T14:05:00',
      influencer: {
        id: 301,
        name: 'Marta Vlogs',
        email: 'marta.vlogs@example.com',
        profilePicture: undefined,
      },
      partnershipOpportunity: {
        id: 501,
        title: 'Letnia kampania specjałów kawowych',
        name: 'Kawiarnia Złote Ziarno',
        city: 'Kraków',
      },
      contentSubmissions: [],
      version: 0,
    },
    overrides,
  );
}
