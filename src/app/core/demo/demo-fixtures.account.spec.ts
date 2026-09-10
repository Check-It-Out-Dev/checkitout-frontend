import { currentDemoUser, matchDemoFixture, resetDemoTourStores } from './demo-fixtures';
import { setDemoRole } from './demo-mode';
import type { AddressDtoOut } from '../../api/model/address-dto-out';
import type { UserDtoOut } from '../../api/model/user-dto-out';
import type { UserPreferencesDtoOut } from '../../api/model/user-preferences-dto-out';

/**
 * The account half of the demo's fixture surface: profile, addresses, preferences, social
 * connections, the registry confirmation, and the two probes a page makes before it decides
 * anything. demo-fixtures.spec.ts covers campaigns, sign-in and the guided tours; these routes
 * had no test at all, which is why a profile edit could have stopped persisting, an address could
 * have stopped becoming primary, or /public-config could have started reporting payments off, and
 * nothing would have said so until someone walked the demo by hand.
 *
 * Written against matchDemoFixture only. A fixture that has to be reached through its own private
 * arrays is a fixture whose behaviour nobody is really asserting.
 */
describe('demo fixtures — account, addresses and preferences', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    resetDemoTourStores();
  });

  describe('profile', () => {
    it('serves a user by id as the current persona', () => {
      const byId = matchDemoFixture('GET', '/api/users/501', null) as UserDtoOut;
      expect(byId.id).toBe(currentDemoUser().id);
    });

    it('keeps a profile edit, and keeps it per persona', () => {
      const patched = matchDemoFixture('PATCH', '/api/users/501', {
        firstName: 'Zmieniona',
        lastName: 'Nazwa',
      }) as UserDtoOut;
      expect(patched.firstName).toBe('Zmieniona');

      // It survives the next read, which is the whole point of the store.
      expect((matchDemoFixture('GET', '/api/users/501', null) as UserDtoOut).lastName).toBe(
        'Nazwa',
      );

      // Another persona is another profile: the edit must not follow the visitor across roles.
      setDemoRole('INFLUENCER');
      expect((matchDemoFixture('GET', '/api/users/501', null) as UserDtoOut).firstName).not.toBe(
        'Zmieniona',
      );
    });

    it('ignores a field that is not editable, and a non-string value for one that is', () => {
      const before = matchDemoFixture('GET', '/api/users/501', null) as UserDtoOut;
      matchDemoFixture('PATCH', '/api/users/501', {
        email: 'somebody.else@example.com',
        firstName: 42,
      });
      const after = matchDemoFixture('GET', '/api/users/501', null) as UserDtoOut;

      expect(after.email).toBe(before.email);
      expect(after.firstName).toBe(before.firstName);
    });

    it('accepts the soft account deletion the screen makes before signing out', () => {
      expect(matchDemoFixture('DELETE', '/api/users/501', null)).toEqual({});
    });

    it('lists the directory the admin persona reads', () => {
      const page = matchDemoFixture('GET', '/api/users/paged', null) as {
        content?: unknown[];
        totalElements?: number;
      };
      expect(Array.isArray(page.content)).toBe(true);
      expect(page.content?.length).toBeGreaterThan(0);
      expect(page.totalElements).toBe(page.content?.length);
    });
  });

  describe('addresses', () => {
    const created = (body: Partial<AddressDtoOut>) =>
      matchDemoFixture('POST', '/api/address/user/501', body) as AddressDtoOut;

    it('creates one, defaulting the country and the type', () => {
      const a = created({ street: 'Prosta 51', city: 'Warszawa', postalCode: '00-838' });

      expect(a.id).toBeGreaterThan(0);
      expect(a.street).toBe('Prosta 51');
      expect(a.country).toBe('Polska');
      expect(a.addressType).toBe('MAIN');
      expect(a.userId).toBe(currentDemoUser().id);
    });

    it('moves primary to the newest one that asks for it, leaving exactly one', () => {
      const second = created({ street: 'Druga 2', primary: true });
      expect(second.primary).toBe(true);

      const list = matchDemoFixture('GET', '/api/address/user/501', null) as AddressDtoOut[];
      expect(list.filter((a) => a.primary)).toHaveLength(1);
      expect(list.find((a) => a.primary)?.id).toBe(second.id);
    });

    it('patches one in place and deletes it again', () => {
      const a = created({ street: 'Trzecia 3' });

      const patched = matchDemoFixture('PATCH', `/api/address/${a.id}`, {
        street: 'Trzecia 3a',
      }) as AddressDtoOut;
      expect(patched.street).toBe('Trzecia 3a');

      matchDemoFixture('DELETE', `/api/address/${a.id}`, null);
      const list = matchDemoFixture('GET', '/api/address/user/501', null) as AddressDtoOut[];
      expect(list.map((x) => x.id)).not.toContain(a.id);
    });
  });

  describe('preferences', () => {
    it('merges a patch rather than replacing the record, and stamps the update', () => {
      const before = matchDemoFixture(
        'GET',
        '/api/user-preferences/me',
        null,
      ) as UserPreferencesDtoOut;

      const after = matchDemoFixture('PATCH', '/api/user-preferences/me', {
        notificationPartnershipEnabled: false,
      }) as UserPreferencesDtoOut;

      expect(after.notificationPartnershipEnabled).toBe(false);
      expect(after.lastUpdateTime).not.toBe(before.lastUpdateTime);
      // Everything not named in the patch is still there.
      expect(Object.keys(after).length).toBeGreaterThanOrEqual(Object.keys(before).length);

      expect(
        (matchDemoFixture('GET', '/api/user-preferences/me', null) as UserPreferencesDtoOut)
          .notificationPartnershipEnabled,
      ).toBe(false);
    });
  });

  describe('social connections', () => {
    it('belong to the influencer persona and to no one else', () => {
      expect(matchDemoFixture('GET', '/api/user-social-connection', null)).toMatchObject({
        content: [],
      });

      setDemoRole('INFLUENCER');
      const page = matchDemoFixture('GET', '/api/user-social-connection', null) as {
        content: { id?: number }[];
      };
      expect(page.content.length).toBeGreaterThan(0);
    });

    it('disconnect removes the one that was asked for', () => {
      setDemoRole('INFLUENCER');
      const page = matchDemoFixture('GET', '/api/user-social-connection/paged', null) as {
        content: { id?: number }[];
      };
      const victim = page.content[0].id;

      matchDemoFixture('DELETE', `/api/user-social-connection/${victim}`, null);

      const after = matchDemoFixture('GET', '/api/user-social-connection', null) as {
        content: { id?: number }[];
      };
      expect(after.content.map((c) => c.id)).not.toContain(victim);
    });
  });

  describe('the probes a page makes before it decides anything', () => {
    it('reports the backend up, so the 503 page can send the visitor back', () => {
      expect(matchDemoFixture('GET', '/api/test/health', null)).toEqual({ status: 'UP' });
    });

    it('reports payments enabled — visible but mocked, so the plan screens render', () => {
      expect(matchDemoFixture('GET', '/api/public-config', null)).toEqual({
        paymentsEnabled: true,
      });
    });
  });

  describe('registry confirmation', () => {
    it('leaves the company waiting on the e-mail rather than announcing an active account', () => {
      // The beat the tour narrates next is "go and prove the address is yours". Answering ACTIVE
      // here once had the page behind the inbox card contradicting the guide asking for the step.
      const res = matchDemoFixture('POST', '/api/registry/confirm', { nip: '1234563218' }) as {
        activated?: boolean;
        accountStatus?: string;
        nip?: string;
        message?: string;
      };

      expect(res.activated).toBe(false);
      expect(res.accountStatus).toBe('IN_VALIDATION');
      expect(res.nip).toBe('1234563218');
      expect(res.message).toContain('e-mail');
    });

    it('falls back to the demo brand NIP when the body carries none', () => {
      const res = matchDemoFixture('POST', '/api/registry/confirm', {}) as { nip?: string };
      expect(res.nip).toBe('5260250995');
    });
  });

  describe('applying to a campaign', () => {
    it('creates the application the tour then finds in accepted, carrying the campaign', () => {
      const campaigns = matchDemoFixture('GET', '/api/partnership-opportunity/paged', null) as {
        content: { id?: number; title?: string }[];
      };
      const target = campaigns.content[0];

      const made = matchDemoFixture('POST', '/api/applied-opportunity', {
        partnershipOpportunity: target.id,
        note: 'Chętnie wezmę udział.',
      }) as {
        id?: number;
        note?: string;
        opportunityStatus?: { value?: string };
        partnershipOpportunity?: { id?: number; title?: string };
      };

      expect(made.note).toBe('Chętnie wezmę udział.');
      expect(made.opportunityStatus?.value).toBe('ACCEPTED_BY_COMPANY');
      expect(made.partnershipOpportunity?.id).toBe(target.id);

      // Applying twice replaces the row rather than adding a second one.
      matchDemoFixture('POST', '/api/applied-opportunity', { partnershipOpportunity: target.id });
      const list = matchDemoFixture('GET', '/api/applied-opportunity/paged', null) as {
        content: { id?: number }[];
      };
      expect(list.content.filter((a) => a.id === made.id)).toHaveLength(1);
    });

    it('still creates one when the campaign id matches nothing', () => {
      const made = matchDemoFixture('POST', '/api/applied-opportunity', {
        partnershipOpportunityId: 99999999,
      }) as { id?: number; partnershipOpportunity?: unknown };

      expect(made.id).toBeGreaterThan(0);
      expect(made.partnershipOpportunity).toBeUndefined();
    });
  });
});
