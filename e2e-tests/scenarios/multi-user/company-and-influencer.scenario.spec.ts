import { expect, test } from '@playwright/test';
import { ActorRegistry, given, tags, then, when } from '../../_framework';

/**
 * G1c — proves the multi-actor isolation primitive works.
 *
 * Two actors live in the same `test()` body, each with their own
 * `BrowserContext`. The `ActorRegistry` keeps them separate; switching
 * with `reg.switchTo(name)` doesn't bleed cookies or localStorage.
 *
 * The flow asserted here is intentionally trivial — both actors visit
 * their own role-appropriate landing page and observe distinct UI. A
 * full "company creates campaign + influencer applies + company sees
 * applicant" flow can layer on once E7 (active cooperation lifecycle)
 * makes the applicants-per-campaign view visible.
 */
test.describe(`${tags.MULTI_USER} ${tags.PARTNERSHIP_FLOW} · Two actors don't share session`, () => {
  let reg: ActorRegistry;

  test.beforeEach(({ browser }) => {
    reg = new ActorRegistry(browser);
  });

  test.afterEach(async () => {
    await reg.closeAll();
  });

  test('company and influencer have isolated browser contexts', async () => {
    await test.step('Given FashionCo (company) and Anna (influencer) are both logged in', async () => {
      await given.userIsLoggedIn(reg, 'FashionCo', 'company1');
      await given.userIsLoggedIn(reg, 'Anna', 'influencer1');
    });

    await test.step('When FashionCo opens her campaign dashboard', async () => {
      const fashionco = reg.switchTo('FashionCo');
      await when.actorVisits(fashionco, '/collaborations/my-campaigns');
    });

    await test.step('And Anna opens the influencer browse view', async () => {
      const anna = reg.switchTo('Anna');
      await when.actorVisits(anna, '/collaborations/list');
    });

    await test.step('Then each actor stays on their own URL', async () => {
      await then.actorSeesUrl(reg.get('FashionCo'), /\/collaborations\/my-campaigns/);
      await then.actorSeesUrl(reg.get('Anna'), /\/collaborations\/list/);
    });

    await test.step('And the two BrowserContexts have distinct cookies', async () => {
      const companyCookies = await reg.get('FashionCo').context.cookies();
      const influencerCookies = await reg.get('Anna').context.cookies();
      // Both sessions exist
      expect(companyCookies.find((c) => c.name === 'session')).toBeDefined();
      expect(influencerCookies.find((c) => c.name === 'session')).toBeDefined();
      // The two session JWTs are different (different mock-session calls)
      const companySession = companyCookies.find((c) => c.name === 'session')?.value;
      const influencerSession = influencerCookies.find((c) => c.name === 'session')?.value;
      expect(companySession).toBeTruthy();
      expect(influencerSession).toBeTruthy();
      expect(companySession).not.toEqual(influencerSession);
    });
  });
});
