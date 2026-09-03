import { test } from '@playwright/test';
import { ActorRegistry, given, tags, then, when } from '../../_framework';

/**
 * BE feature mirror: `checkitout-backend/src/test/resources/features/login.feature`.
 *
 * Scope here is the FE half of login: with a valid session already issued by
 * the BE (via `/test/auth/mock-session` — the F2 pattern), the user lands on
 * the authenticated home and the auth guard does NOT bounce them back to
 * `/auth/sign-in`. Real Firebase login + KMS + 2FA flow is BE-side and tested
 * there; the FE never carries those secrets.
 *
 * Tags `@authentication @login` make `--grep '@login'` match.
 */
test.describe(`${tags.AUTHENTICATION} ${tags.LOGIN} · Login session reaches authenticated UI`, () => {
  let reg: ActorRegistry;

  test.beforeEach(({ browser }) => {
    reg = new ActorRegistry(browser);
  });

  test.afterEach(async () => {
    await reg.closeAll();
  });

  test(`${tags.INFLUENCER} influencer with a session sees their applications page`, async () => {
    let anna: ReturnType<ActorRegistry['get']> | undefined;

    await test.step('Given Anna is logged in as an influencer', async () => {
      anna = await given.userIsLoggedIn(reg, 'Anna', 'influencer1');
    });

    await test.step('When Anna navigates to /collaborations/registrations', async () => {
      await when.actorVisits(anna!, '/collaborations/registrations');
    });

    await test.step('Then she is authenticated and sees her applications page', async () => {
      await then.actorIsAuthenticated(anna!);
      await then.actorSeesUrl(anna!, /\/collaborations\/registrations/);
    });
  });

  test(`${tags.COMPANY} company user with a session sees the authenticated shell`, async () => {
    let fashionco: ReturnType<ActorRegistry['get']> | undefined;

    await test.step('Given FashionCo is logged in as a company', async () => {
      fashionco = await given.userIsLoggedIn(reg, 'FashionCo', 'company1');
    });

    await test.step('When FashionCo navigates to /collaborations/list', async () => {
      await when.actorVisits(fashionco!, '/collaborations/list');
    });

    await test.step('Then they are authenticated and stay on the campaigns list', async () => {
      await then.actorIsAuthenticated(fashionco!);
      await then.actorSeesUrl(fashionco!, /\/collaborations\/list/);
    });
  });

  test(`${tags.INFLUENCER} unauthenticated visit to a protected route bounces to sign-in`, async ({
    browser,
  }) => {
    const { page } = await given.anonymousVisitor(browser);

    await test.step('When an anonymous visitor opens /collaborations/registrations', async () => {
      await when.anonymousVisits(page, '/collaborations/registrations');
    });

    await test.step('Then the auth guard sends them to /auth/sign-in', async () => {
      await then.pageHasUrl(page, /\/auth\/sign-in/);
    });

    await page.context().close();
  });
});
