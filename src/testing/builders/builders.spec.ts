import type { PageAppliedOpportunityDtoOut } from '../../app/api/model/page-applied-opportunity-dto-out';
import type { PagePartnershipOpportunityDtoOut } from '../../app/api/model/page-partnership-opportunity-dto-out';
import { OpportunityStatus } from '../../app/api/model/opportunity-status';
import {
  buildAddress,
  buildApplication,
  buildCompanyUser,
  buildInfluencerUser,
  buildNotification,
  buildOpportunity,
  buildOpportunityStatus,
  buildPage,
  mergeDto,
} from './index';

/**
 * Smoke tier for the builder library. The heavy lifting is COMPILE-TIME
 * (strict generated-model return types — an out-of-contract default
 * breaks `tsc`, not this spec); here we pin the runtime semantics every
 * layer depends on: deep-merge override behavior and page-envelope math.
 */
describe('testing/builders', () => {
  it('every builder constructs with defaults', () => {
    expect(buildOpportunity().id).toBe(501);
    expect(buildApplication().opportunityStatus?.value).toBe(OpportunityStatus.APPLIED);
    expect(buildCompanyUser().userType?.value).toBe('COMPANY');
    expect(buildInfluencerUser().userType?.value).toBe('INFLUENCER');
    expect(buildNotification().isRead).toBe(false);
    expect(buildAddress().city).toBe('Kraków');
  });

  it('deep-merges nested overrides without clobbering sibling fields', () => {
    const opp = buildOpportunity({ compensationType: { label: 'Barter+' } });
    expect(opp.compensationType?.label).toBe('Barter+');
    expect(opp.compensationType?.value).toBeDefined(); // sibling survived
    expect(opp.title).toBe('Letnia kampania specjałów kawowych');
  });

  it('replaces arrays wholesale instead of merging element-wise', () => {
    const opp = buildOpportunity({ photos: [] });
    expect(opp.photos).toEqual([]);
    const user = buildCompanyUser({ profileMissingFields: ['nip'] });
    expect(user.profileMissingFields).toEqual(['nip']);
  });

  it('mergeDto treats undefined overrides as no-op and does not mutate the base', () => {
    const base = buildApplication();
    const merged = mergeDto(base, { note: 'zmieniona notatka' });
    expect(merged.note).toBe('zmieniona notatka');
    expect(base.note).not.toBe('zmieniona notatka');
  });

  it('buildOpportunityStatus carries a PL label for every lifecycle state', () => {
    for (const value of Object.values(OpportunityStatus)) {
      const status = buildOpportunityStatus(value);
      expect(status.value).toBe(value);
      expect(status.label).toBeTruthy();
    }
  });

  it('buildPage computes envelope math and assigns to any generated Page type', () => {
    const empty: PagePartnershipOpportunityDtoOut = buildPage([]);
    expect(empty.empty).toBe(true);
    expect(empty.totalPages).toBe(1);

    const page: PageAppliedOpportunityDtoOut = buildPage(
      [buildApplication(), buildApplication({ id: 9002 })],
      { totalElements: 42, size: 2, number: 1 },
    );
    expect(page.content).toHaveLength(2);
    expect(page.totalPages).toBe(21);
    expect(page.first).toBe(false);
    expect(page.last).toBe(false);
  });
});
