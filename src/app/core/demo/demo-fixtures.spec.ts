import { HttpParams } from '@angular/common/http';
import {
  DEMO_NOT_FOUND,
  matchDemoFixture,
  currentDemoUser,
  resetDemoTourStores,
} from './demo-fixtures';
import type { PagePartnershipOpportunityDtoOut } from '../../api/model/page-partnership-opportunity-dto-out';
import type { UserDtoOut } from '../../api/model/user-dto-out';

describe('demo fixtures', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('answers /users/me with null while the persona is signed out (no bounce, no error)', () => {
    expect(matchDemoFixture('GET', '/api/users/me', null)).toBeNull();
  });

  it('signs the persona in on /auth/firebase/login — the e-mail picks the persona', () => {
    const brand = matchDemoFixture('POST', '/api/auth/firebase/login', {
      email: 'demo@checkitout.app',
      password: 'x',
    }) as { requires2FA?: boolean; registered?: boolean };
    expect(brand.registered).toBe(true);
    expect(brand.requires2FA).toBe(false);
    expect(localStorage.getItem('demoSession')).toBe('1');
    expect((matchDemoFixture('GET', '/api/users/me', null) as UserDtoOut).userType?.value).toBe(
      'COMPANY',
    );

    matchDemoFixture('POST', '/api/auth/firebase/login', { email: 'ola@example.com' });
    expect((matchDemoFixture('GET', '/api/users/me', null) as UserDtoOut).userType?.value).toBe(
      'INFLUENCER',
    );

    // Admin outside the 2FA sandbox: no TOTP dialog (no phone to hand out codes).
    const admin = matchDemoFixture('POST', '/api/auth/firebase/login', {
      email: 'admin@checkitout.app',
    }) as { requires2FA?: boolean };
    expect(admin.requires2FA).toBe(false);
    expect((matchDemoFixture('GET', '/api/users/me', null) as UserDtoOut).userType?.value).toBe(
      'ADMIN',
    );

    // …and inside it, the TOTP beat plays.
    sessionStorage.setItem('demoSandbox', JSON.stringify({ key: 'admin-2fa', step: 0 }));
    const adminInTour = matchDemoFixture('POST', '/api/auth/firebase/login', {
      email: 'admin@checkitout.app',
    }) as { requires2FA?: boolean };
    expect(adminInTour.requires2FA).toBe(true);
  });

  it('sign-up takes the role from the form and signs in; sign-out signs out', () => {
    window.history.pushState({}, '', '/auth/sign-up/business');
    matchDemoFixture('POST', '/api/auth/firebase/register', { email: 'new@brand.pl' });
    expect(localStorage.getItem('demoRole')).toBe('COMPANY');
    expect(localStorage.getItem('demoSession')).toBe('1');

    window.history.pushState({}, '', '/auth/sign-up/influencer');
    matchDemoFixture('POST', '/api/auth/firebase/register', { email: 'new@creator.pl' });
    expect(localStorage.getItem('demoRole')).toBe('INFLUENCER');

    matchDemoFixture('POST', '/api/auth/sign-out', null);
    expect(localStorage.getItem('demoSession')).toBe('0');
    expect(matchDemoFixture('GET', '/api/users/me', null)).toBeNull();
    window.history.pushState({}, '', '/');
  });

  it('serves the persona for /users/me, role-aware via localStorage', () => {
    localStorage.setItem('demoSession', '1');
    expect((matchDemoFixture('GET', '/api/users/me', null) as UserDtoOut).userType?.value).toBe(
      'COMPANY',
    );
    localStorage.setItem('demoRole', 'INFLUENCER');
    expect((matchDemoFixture('GET', '/api/users/me', null) as UserDtoOut).userType?.value).toBe(
      'INFLUENCER',
    );
    localStorage.setItem('demoRole', 'ADMIN');
    expect(currentDemoUser().userType?.value).toBe('ADMIN');
  });

  it('pages campaigns through the shared builder envelope', () => {
    const page = matchDemoFixture(
      'GET',
      'https://localhost:4201/api/partnership-opportunity?page=0&size=20',
      null,
    ) as PagePartnershipOpportunityDtoOut;
    expect(page.content?.length).toBeGreaterThanOrEqual(3);
    expect(page.empty).toBe(false);
    // Builder-backed: shapes are the generated contract's, PL-market data.
    expect(page.content?.[0]?.currency?.isoCode).toBe('PLN');
  });

  it('resolves campaign detail by id', () => {
    const detail = matchDemoFixture('GET', '/api/partnership-opportunity/502', null) as {
      id?: number;
    };
    expect(detail.id).toBe(502);
  });

  it('returns undefined for unmapped endpoints (interceptor answers {})', () => {
    expect(matchDemoFixture('GET', '/api/some/unknown/endpoint', null)).toBeUndefined();
    expect(matchDemoFixture('DELETE', '/api/users/me', null)).toBeUndefined();
  });

  it('echoes the typed NIP in the registry-lookup fixture (onboarding beat)', () => {
    const res = matchDemoFixture('POST', '/api/registry/lookup', { nip: '9481997433' }) as {
      nip?: string;
      companyName?: string;
      vatStatus?: string;
    };
    expect(res.nip).toBe('9481997433');
    expect(res.companyName).toBeTruthy();
    expect(res.vatStatus).toBe('Czynny');
  });

  it('serves the answered support thread to both my-tickets and the admin queue', () => {
    const mine = matchDemoFixture('GET', '/api/support/ticket/my-tickets', null) as {
      content?: Array<{ ticketReference?: string; responses?: unknown[] }>;
    };
    const queue = matchDemoFixture('GET', '/api/support/ticket', null) as {
      content?: Array<{ ticketReference?: string }>;
    };
    expect(mine.content?.[0]?.ticketReference).toBe('CIO-2026-0189');
    expect(mine.content?.[0]?.responses?.length).toBe(1);
    expect(queue.content?.[0]?.ticketReference).toBe('CIO-2026-0189');
  });

  it('answers /subscription/status with the generated DTO shape (plan page beat)', () => {
    const status = matchDemoFixture('GET', '/api/subscription/status', null) as {
      currentPlanName?: string;
      campaignLimit?: number;
      status?: string;
    };
    expect(status.currentPlanName).toBe('Business');
    expect(status.campaignLimit).toBe(5);
    expect(status.status).toBe('BUSINESS_ACTIVE');
  });

  it('admin persona flips the 2FA status fixture (AdminGuard admits)', () => {
    localStorage.setItem('demoRole', 'ADMIN');
    expect(matchDemoFixture('GET', '/api/twofactor/status', null)).toMatchObject({
      enabled: true,
    });
    localStorage.setItem('demoRole', 'COMPANY');
    expect(matchDemoFixture('GET', '/api/twofactor/status', null)).toMatchObject({
      enabled: false,
    });
  });

  it('speaks the whole step-up contract — one code, minted once, verified exactly', () => {
    sessionStorage.removeItem('demoStepUpCode');

    expect(matchDemoFixture('GET', '/api/step-up/check?actionType=EMAIL_CHANGE', null)).toEqual({
      required: true,
      challengeType: 'EMAIL_CODE',
    });

    matchDemoFixture('POST', '/api/step-up/request', { actionType: 'EMAIL_CHANGE' });
    const code = sessionStorage.getItem('demoStepUpCode');
    expect(code).toMatch(/^\d{6}$/);

    // Re-requesting never rotates the code — the inbox sim shows the same key.
    matchDemoFixture('POST', '/api/step-up/request', { actionType: 'EMAIL_CHANGE' });
    expect(sessionStorage.getItem('demoStepUpCode')).toBe(code);

    // The code the inbox shows is the code the validator accepts…
    expect(matchDemoFixture('POST', '/api/step-up/verify', { code })).toMatchObject({
      success: true,
      token: 'demo-step-up-token',
    });
    // …and a wrong one is a token-less body the dialog renders as invalid.
    expect(matchDemoFixture('POST', '/api/step-up/verify', { code: '000000' })).toEqual({
      success: false,
    });
  });

  it('answers an unknown campaign or application id with the 404 marker, a known one with the row', () => {
    expect(matchDemoFixture('GET', '/api/partnership-opportunity/999999', null)).toBe(
      DEMO_NOT_FOUND,
    );
    expect(matchDemoFixture('GET', '/api/applied-opportunity/1', null)).toBe(DEMO_NOT_FOUND);
    const known = matchDemoFixture('GET', '/api/partnership-opportunity/502', null) as {
      id?: number;
    };
    expect(known.id).toBe(502);
  });

  it('gives a created support ticket its own reference and lists it next to the seed', () => {
    resetDemoTourStores();
    const created = matchDemoFixture('POST', '/api/support/ticket', {
      subject: 'Pytanie o fakturę',
      description: 'Czy mogę dostać fakturę na inne dane?',
    }) as { ticketReference?: string; responses?: unknown[]; status?: string };
    expect(created.ticketReference).toBe('CIO-2026-0190');
    // …and an answer of its own. The support tour's second beat says support has
    // already replied and asks the visitor to open the ticket and read it; while
    // only the seeded ticket carried a reply, that beat had to ring a DIFFERENT
    // ticket from the one whose reference had just been issued.
    expect(created.responses).toHaveLength(1);
    expect((created.responses as { fromAdmin?: boolean }[])[0].fromAdmin).toBe(true);
    const mine = matchDemoFixture('GET', '/api/support/ticket/my-tickets', null) as {
      content?: { ticketReference?: string }[];
    };
    expect(mine.content?.map((t) => t.ticketReference)).toEqual(['CIO-2026-0190', 'CIO-2026-0189']);
    const byRef = matchDemoFixture(
      'GET',
      '/api/support/ticket/status',
      null,
      new HttpParams({ fromObject: { reference: 'CIO-2026-0190', email: 'demo@checkitout.app' } }),
    ) as { ticketReference?: string };
    expect(byRef.ticketReference).toBe('CIO-2026-0190');
    resetDemoTourStores();
  });

  it('answers the primary-address probe with a real address (no false banner)', () => {
    const primary = matchDemoFixture('GET', '/api/address/user/1001/primary', null) as {
      id?: number;
      primary?: boolean;
    };
    expect(primary.id).toBeDefined();
    expect(primary.primary).toBe(true);
    // The list endpoint keeps its own (array) shape.
    expect(Array.isArray(matchDemoFixture('GET', '/api/address/user/1001', null))).toBe(true);
  });

  it('serves all four classification dictionaries non-empty (create form binds them)', () => {
    for (const path of [
      '/api/platform/paged',
      '/api/content-type/paged',
      '/api/service-type/paged',
      '/api/currency/paged',
    ]) {
      const page = matchDemoFixture('GET', `${path}?size=100`, null) as {
        content?: Array<{ id?: number; name?: string }>;
      };
      expect(page.content?.length).toBeGreaterThan(0);
      expect(page.content?.[0]?.name).toBeTruthy();
    }
  });

  it('stores a created campaign — detail, list and PUT all see it (the meta-card promise)', () => {
    const created = matchDemoFixture('POST', '/api/partnership-opportunity', {
      name: 'Nocna kampania demo',
      title: 'Testy nocnej linii produktów',
      city: 'Kraków',
      compensationType: 'CASH',
      currency: 1,
      platforms: [1, 2],
      contentTypes: [1, 2],
      photos: [{ url: 'data:image/svg+xml;utf8,x', orderNumber: 0, isCover: true }],
    }) as { id?: number; title?: string; platforms?: unknown[]; photos?: unknown[] };
    expect(created.id).toBeGreaterThanOrEqual(90001);
    expect(created.title).toBe('Testy nocnej linii produktów');
    expect(created.platforms?.length).toBe(2);
    expect(created.photos?.length).toBe(1);

    const detail = matchDemoFixture('GET', `/api/partnership-opportunity/${created.id}`, null) as {
      id?: number;
    };
    expect(detail.id).toBe(created.id);

    const page = matchDemoFixture('GET', '/api/partnership-opportunity/paged', null) as {
      content?: Array<{ id?: number }>;
    };
    expect(page.content?.[0]?.id).toBe(created.id);

    const updated = matchDemoFixture('PUT', `/api/partnership-opportunity/${created.id}`, {
      title: 'Edytowany tytuł',
    }) as { title?: string };
    expect(updated.title).toBe('Edytowany tytuł');
  });

  it('plays the whole upgrade beat — consent, same-origin checkout, plan flip', () => {
    // Business before the upgrade…
    const before = matchDemoFixture('GET', '/api/subscription/status', null) as {
      currentPlanName?: string;
    };
    expect(before.currentPlanName).toBe('Business');

    expect(matchDemoFixture('POST', '/api/subscription/consent', {})).toMatchObject({
      recorded: true,
    });

    // …the "checkout" sessionUrl is same-origin, so the dialog's real
    // window.location.href redirect just reloads the plan page…
    const session = matchDemoFixture('POST', '/api/subscription/upgrade', {
      targetPlan: 'ENTERPRISE',
    }) as { sessionUrl?: string };
    expect(session.sessionUrl).toBe('/user/settings/plan-billing');

    // …where the plan is already flipped (the webhook-equivalent), the limit
    // matches the Enterprise offer, and the upgrade's invoice tops the list.
    const after = matchDemoFixture('GET', '/api/subscription/status', null) as {
      currentPlanName?: string;
      campaignLimit?: number;
      status?: string;
    };
    expect(after.currentPlanName).toBe('Enterprise');
    expect(after.campaignLimit).toBe(10);
    expect(after.status).toBe('ENTERPRISE_ACTIVE');

    const invoices = matchDemoFixture('GET', '/api/subscription/invoices', null) as Array<{
      amountPln?: number;
    }>;
    expect(invoices[0]?.amountPln).toBe(99);
    expect(invoices).toHaveLength(2);
  });

  it('decides applications state-aware — company first, influencer counter-signs', () => {
    // 8101 is Ola's fresh APPLIED row: an accept there is the company's move.
    const companyAccept = matchDemoFixture(
      'PATCH',
      '/api/applied-opportunity/status/update/8101?accept=true',
      null,
    ) as { opportunityStatus?: { value?: string } };
    expect(companyAccept.opportunityStatus?.value).toBe('ACCEPTED_BY_COMPANY');

    // 8102 already carries the company's acceptance: the same accept action
    // is now the influencer's counter-signature (the P0#5 machinery).
    const influencerAccept = matchDemoFixture(
      'PATCH',
      '/api/applied-opportunity/status/update/8102?accept=true',
      null,
    ) as { opportunityStatus?: { value?: string } };
    expect(influencerAccept.opportunityStatus?.value).toBe('ACCEPTED_BY_INFLUENCER');
  });

  it('answers the upload pipeline with an /api-scoped sink and an inline photo URL', () => {
    const signed = matchDemoFixture('POST', '/api/upload/signed-url', {}) as {
      uploadUrl?: string;
      publicUrl?: string;
      uploadId?: string;
      filePath?: string;
    };
    expect(signed.uploadUrl).toContain('/api/');
    expect(signed.publicUrl).toContain('data:image/svg+xml');
    expect(signed.uploadId).toBeTruthy();
    expect(signed.filePath).toBeTruthy();
    expect(matchDemoFixture('POST', '/api/upload/confirm/demo-upload-1', {})).toMatchObject({
      status: 'CONFIRMED',
    });
  });

  it('threads an admin reply onto the shared ticket (the refetch sees it)', () => {
    const before = (
      matchDemoFixture('GET', '/api/support/ticket/9001', null) as {
        responses?: unknown[];
      }
    ).responses?.length;

    const reply = matchDemoFixture('POST', '/api/support/ticket/9001/admin-response', {
      content: 'Sprawdziliśmy — limit edycji działa zgodnie z regulaminem.',
      newStatus: 'RESOLVED',
      adminName: 'Zespół checkItOut',
    }) as { content?: string; fromAdmin?: boolean };
    expect(reply.fromAdmin).toBe(true);

    const after = matchDemoFixture('GET', '/api/support/ticket/9001', null) as {
      responses?: Array<{ content?: string }>;
      status?: string;
      statusDisplay?: string;
    };
    expect(after.responses?.length).toBe((before ?? 0) + 1);
    expect(after.responses?.at(-1)?.content).toContain('limit edycji');
    expect(after.status).toBe('RESOLVED');
    expect(after.statusDisplay).toBe('Rozwiązany');
  });

  it('runs the admin cascade — preview with one-time code, then the campaign vanishes', () => {
    // Cascade a freshly created campaign so seeded fixtures stay untouched.
    const created = matchDemoFixture('POST', '/api/partnership-opportunity', {
      name: 'Kampania do kasacji',
      title: 'RODO test',
    }) as { id?: number };
    const id = created.id!;

    const preview = matchDemoFixture(
      'GET',
      `/api/admin/cascade-delete/partnership-opportunities/${id}/preview`,
      null,
    ) as { confirmationCode?: string; totalEntityCount?: number; systemsToClean?: string[] };
    expect(preview.confirmationCode).toBe(`DEL-${id}-DEMO`);
    expect(preview.totalEntityCount).toBe(9);
    expect(preview.systemsToClean).toContain('PostgreSQL');

    const result = matchDemoFixture(
      'DELETE',
      `/api/admin/cascade-delete/partnership-opportunities/${id}`,
      { confirmationCode: preview.confirmationCode, expectedEntityCount: 9 },
    ) as { success?: boolean; auditTrailId?: string };
    expect(result.success).toBe(true);
    expect(result.auditTrailId).toContain(String(id));

    const page = matchDemoFixture('GET', '/api/partnership-opportunity/paged', null) as {
      content?: Array<{ id?: number }>;
    };
    expect(page.content?.some((c) => c.id === id)).toBe(false);

    // A tour restart resets the store — the deleted campaign serves again
    // (else byId's fallback would show a different campaign on its route).
    resetDemoTourStores();
    const restored = matchDemoFixture('GET', '/api/partnership-opportunity/paged', null) as {
      content?: Array<{ id?: number }>;
    };
    expect(restored.content?.some((c) => c.id === id)).toBe(true);
  });

  it('localises persona enum labels from the stored language choice', () => {
    localStorage.setItem('cio-lang', 'en');
    const en = currentDemoUser();
    expect(en.userType?.label).toBe('Company');
    expect(en.accountStatus?.label).toBe('Active');

    localStorage.setItem('cio-lang', 'pl');
    const pl = currentDemoUser();
    expect(pl.userType?.label).toBe('Firma');
    expect(pl.accountStatus?.label).toBe('Aktywne');
  });

  it('serves the notification bell + panel on the generated /notifications paths', () => {
    const page = matchDemoFixture('GET', '/api/notifications', null) as {
      content?: Array<{ id?: number; isRead?: boolean }>;
    };
    expect(page.content?.length).toBeGreaterThan(0);
    const before = (
      matchDemoFixture('GET', '/api/notifications/unread/count', null) as {
        count?: number;
      }
    ).count;
    expect(before).toBeGreaterThan(0);

    const unread = page.content?.find((n) => !n.isRead);
    matchDemoFixture('PATCH', `/api/notifications/${unread?.id}/read`, null);
    const after = (
      matchDemoFixture('GET', '/api/notifications/unread/count', null) as {
        count?: number;
      }
    ).count;
    expect(after).toBe((before ?? 0) - 1);

    matchDemoFixture('POST', '/api/notifications/read-all', null);
    expect(
      (matchDemoFixture('GET', '/api/notifications/unread/count', null) as { count?: number })
        .count,
    ).toBe(0);
  });

  it('serves the three clickwrap documents on /legal/current (sign-up can render)', () => {
    const docs = matchDemoFixture('GET', '/api/legal/current', null) as Array<{
      type?: string;
      downloadUrl?: string;
    }>;
    expect(docs.map((d) => d.type).sort()).toEqual([
      'COOKIE_POLICY',
      'PRIVACY_POLICY',
      'TERMS_OF_SERVICE',
    ]);
    expect(docs.every((d) => d.downloadUrl?.startsWith('/assets/docs/'))).toBe(true);
  });

  it('serves the dictionary editor: list, categories, add, remove', () => {
    resetDemoTourStores();
    const all = matchDemoFixture('GET', '/api/dictionary/all', null) as Array<{ id?: string }>;
    expect(all.length).toBeGreaterThan(0);
    const cats = matchDemoFixture('GET', '/api/dictionary/categories', null) as string[];
    expect(cats).toEqual(expect.arrayContaining(['service_type', 'content_type', 'platform']));

    const created = matchDemoFixture('POST', '/api/dictionary/entry', {
      key: 'platform.youtube',
      value: 'YouTube',
      languageCode: 'pl',
      category: 'platform',
    }) as { id?: string };
    expect(created.id).toBeTruthy();
    expect((matchDemoFixture('GET', '/api/dictionary/all', null) as unknown[]).length).toBe(
      all.length + 1,
    );

    matchDemoFixture(
      'DELETE',
      '/api/dictionary/entry',
      null,
      new HttpParams().set('id', created.id ?? ''),
    );
    expect((matchDemoFixture('GET', '/api/dictionary/all', null) as unknown[]).length).toBe(
      all.length,
    );
  });

  it('serves submitted content per application and records review decisions', () => {
    resetDemoTourStores();
    const rows = matchDemoFixture(
      'GET',
      '/api/applied-opportunity/content/applied-opportunity/8102',
      null,
    ) as Array<{ id?: number; approvalStatus?: string }>;
    expect(rows.length).toBe(3);
    expect(rows.some((r) => r.approvalStatus === 'PENDING')).toBe(true);
    expect(
      matchDemoFixture('GET', '/api/applied-opportunity/content/applied-opportunity/8101', null),
    ).toEqual([]);

    const pending = rows.find((r) => r.approvalStatus === 'PENDING');
    const rejected = matchDemoFixture(
      'PATCH',
      `/api/applied-opportunity/content/${pending?.id}/reject`,
      { approvalNotes: 'Popraw kadr' },
    ) as { approvalStatus?: string; approvalNotes?: string };
    expect(rejected.approvalStatus).toBe('REJECTED');
    expect(rejected.approvalNotes).toBe('Popraw kadr');

    const submitted = matchDemoFixture('POST', '/api/applied-opportunity/content', {
      appliedOpportunityId: 8101,
      contentTypeId: 1,
      contentCount: 1,
      socialMediaLink: 'https://instagram.com/p/x',
    }) as { id?: number; approvalStatus?: string };
    expect(submitted.approvalStatus).toBe('PENDING');
    expect(
      (
        matchDemoFixture(
          'GET',
          '/api/applied-opportunity/content/applied-opportunity/8101',
          null,
        ) as unknown[]
      ).length,
    ).toBe(1);
    const approved = matchDemoFixture(
      'PATCH',
      `/api/applied-opportunity/content/${submitted.id}/approve`,
      null,
    ) as { approvalStatus?: string };
    expect(approved.approvalStatus).toBe('APPROVED');
  });

  it('serves TOTP enrolment and the phone-sim verify beat (first code expired, second good)', () => {
    const setup = matchDemoFixture('POST', '/api/twofactor/setup', null) as {
      secret?: string;
      qrCodeImage?: string;
      backupCodes?: string[];
    };
    expect(setup.secret).toBeTruthy();
    expect(setup.qrCodeImage?.startsWith('data:image/svg+xml')).toBe(true);
    expect(setup.backupCodes?.length).toBe(8);
    expect(
      (
        matchDemoFixture('POST', '/api/twofactor/verify-setup', { code: '123456' }) as {
          success?: boolean;
        }
      ).success,
    ).toBe(true);

    // The refusal is keyed on submissions, not on how many codes the phone has
    // produced: a visitor who presses "generate" themselves — which is what the
    // ring tells them to do — must not spend the beat that shows the refusal.
    const verify = (code: string): boolean =>
      (matchDemoFixture('POST', '/api/twofactor/verify', { code }) as { success?: boolean })
        .success === true;

    resetDemoTourStores();
    sessionStorage.setItem('demoTotp', JSON.stringify({ attempt: 1, code: '111111' }));
    expect(verify('111111')).toBe(false); // the first code sent is always stale
    sessionStorage.setItem('demoTotp', JSON.stringify({ attempt: 2, code: '222222' }));
    expect(verify('222222')).toBe(true);
    expect(verify('999999')).toBe(false); // and it still has to be the current one

    // The phone generating three times before anything is sent changes nothing.
    resetDemoTourStores();
    sessionStorage.setItem('demoTotp', JSON.stringify({ attempt: 3, code: '333333' }));
    expect(verify('333333')).toBe(false);
    expect(verify('333333')).toBe(true);

    const status = matchDemoFixture('GET', '/api/twofactor/status', null) as {
      canAccessAdmin?: boolean;
    };
    expect(typeof status.canAccessAdmin).toBe('boolean');
  });

  describe('company accept/decline round-trip', () => {
    beforeEach(() => resetDemoTourStores());
    afterEach(() => resetDemoTourStores());

    it('moves the accepted application into the in-progress tab and its counter', () => {
      const before = matchDemoFixture('GET', '/api/applied-opportunity/statistics', null) as {
        inProgress: number;
        newOpportunities: number;
      };
      expect(before).toMatchObject({ inProgress: 1, newOpportunities: 1 });

      matchDemoFixture(
        'PATCH',
        '/api/applied-opportunity/status/update/8101',
        null,
        new HttpParams({ fromObject: { accept: 'true' } }),
      );

      const after = matchDemoFixture('GET', '/api/applied-opportunity/statistics', null) as {
        inProgress: number;
        newOpportunities: number;
      };
      expect(after).toMatchObject({ inProgress: 2, newOpportunities: 0 });
      const inProgress = matchDemoFixture(
        'GET',
        '/api/applied-opportunity/paged',
        null,
        new HttpParams({ fromObject: { 'filters.opportunityStatus': 'ACCEPTED_BY_COMPANY' } }),
      ) as { content: Array<{ id?: number }> };
      expect(inProgress.content.map((r) => r.id)).toEqual([8101, 8102]);
    });

    it('a new tour restores the seed statuses', () => {
      matchDemoFixture(
        'PATCH',
        '/api/applied-opportunity/status/update/8101',
        null,
        new HttpParams({ fromObject: { accept: 'true' } }),
      );
      resetDemoTourStores();
      const stats = matchDemoFixture('GET', '/api/applied-opportunity/statistics', null) as {
        inProgress: number;
      };
      expect(stats.inProgress).toBe(1);
    });
  });
});
