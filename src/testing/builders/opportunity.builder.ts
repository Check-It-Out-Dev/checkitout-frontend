import { CompensationTypeDtoOutValueEnum } from '../../app/api/model/compensation-type-dto-out';
import { OpportunityStatus } from '../../app/api/model/opportunity-status';
import type { OpportunityStatusDtoOut } from '../../app/api/model/opportunity-status-dto-out';
import type { PartnershipOpportunityDtoOut } from '../../app/api/model/partnership-opportunity-dto-out';
import { mergeDto, type DeepPartial } from './merge';

/**
 * Canonical campaign: a Kraków café barter collab — the same register the
 * sandbox fixtures already speak (realistic PL market data, no lorem).
 */
export function buildOpportunity(
  overrides?: DeepPartial<PartnershipOpportunityDtoOut>,
): PartnershipOpportunityDtoOut {
  return mergeDto<PartnershipOpportunityDtoOut>(
    {
      id: 501,
      name: 'Kawiarnia Złote Ziarno',
      city: 'Kraków',
      title: 'Letnia kampania specjałów kawowych',
      details:
        'Szukamy twórców lifestyle z Krakowa do pokazania naszej letniej karty — ' +
        'zdjęcia wnętrza, relacja z degustacji i jedna rolka z baristą.',
      requirements: 'Min. 5 000 obserwujących, treści po polsku, Kraków lub okolice.',
      followersMin: 5000,
      followersMax: 50000,
      compensationType: {
        value: CompensationTypeDtoOutValueEnum.BARTER,
        label: 'Barter',
      },
      compensationDescription: 'Voucher degustacyjny dla dwóch osób + paczka kawy.',
      currency: { id: 1, name: 'złoty', isoCode: 'PLN', sign: 'zł', countryCode: 'PL' },
      startDate: '2026-09-02T00:00:00',
      endDate: '2026-09-03T00:00:00',
      active: true,
      photos: [],
      appliedOpportunities: [],
      createdTime: '2026-06-15T10:30:00',
      lastUpdateTime: '2026-09-01T09:12:00',
      version: 0,
    },
    overrides,
  );
}

/** Status wrapper the BE nests inside applications (`opportunityStatus`). */
export function buildOpportunityStatus(
  value: OpportunityStatus = OpportunityStatus.APPLIED,
  overrides?: DeepPartial<OpportunityStatusDtoOut>,
): OpportunityStatusDtoOut {
  const labels: Record<OpportunityStatus, string> = {
    [OpportunityStatus.APPLIED]: 'Zgłoszono',
    [OpportunityStatus.ACCEPTED_BY_COMPANY]: 'Zaakceptowano przez firmę',
    [OpportunityStatus.REJECTED_BY_COMPANY]: 'Odrzucono przez firmę',
    [OpportunityStatus.ACCEPTED_BY_INFLUENCER]: 'Zaakceptowano przez twórcę',
    [OpportunityStatus.REJECTED_BY_INFLUENCER]: 'Odrzucono przez twórcę',
    [OpportunityStatus.CONTENT_SEND_TO_ACCEPT]: 'Treść do akceptacji',
    [OpportunityStatus.CONTENT_APPROVED]: 'Treść zaakceptowana',
    [OpportunityStatus.CONTENT_REJECTED]: 'Treść odrzucona',
    [OpportunityStatus.CONTENT_POSTED]: 'Treść opublikowana',
    [OpportunityStatus.CONTENT_POSTED_REJECTED]: 'Publikacja odrzucona',
    [OpportunityStatus.TO_BE_PAID]: 'Do rozliczenia',
    [OpportunityStatus.DONE]: 'Zakończono',
  };
  return mergeDto<OpportunityStatusDtoOut>({ value, label: labels[value] }, overrides);
}
