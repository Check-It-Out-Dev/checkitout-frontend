import { expect, test } from '@playwright/test';
import { ActorRegistry, given, tags, then, when } from '../../_framework';

/**
 * Stage 4 / E5 — partial mirror of BE
 * `partnership/partnership-creation.feature`. The BE side covers the full
 * happy-path including DB seeding + auth setup; the FE half here verifies
 * that the company-side form renders, validates, and lands the user on the
 * campaign detail after submit.
 *
 * Currently asserts the form-shape preconditions only; the live submit-to-BE
 * round-trip moves into Stage 5 once seeded test data is reliable enough to
 * commit it as a hard gate.
 */
test.describe(`${tags.PARTNERSHIP_FLOW} ${tags.COMPANY} · Create a campaign`, () => {
  let reg: ActorRegistry;

  test.beforeEach(({ browser }) => {
    reg = new ActorRegistry(browser);
  });

  test.afterEach(async () => {
    await reg.closeAll();
  });

  test('company can open the new-campaign form', async () => {
    let fashionco: ReturnType<ActorRegistry['get']> | undefined;

    await test.step('Given FashionCo is logged in as a company', async () => {
      fashionco = await given.userIsLoggedIn(reg, 'FashionCo', 'company1');
    });

    await test.step('When FashionCo opens /collaborations/create', async () => {
      await when.actorVisits(fashionco!, '/collaborations/create');
    });

    await test.step('Then the campaign form is rendered', async () => {
      await then.actorIsAuthenticated(fashionco!);
      await expect(fashionco!.page.getByTestId('opp-form')).toBeVisible();
      await expect(fashionco!.page.getByTestId('opp-form-name')).toBeVisible();
      await expect(fashionco!.page.getByTestId('opp-form-title-input')).toBeVisible();
      await expect(fashionco!.page.getByTestId('opp-form-submit')).toBeVisible();
    });
  });

  test('submit is disabled until required fields are filled', async () => {
    const fashionco = await given.userIsLoggedIn(reg, 'FashionCo', 'company1');
    await when.actorVisits(fashionco, '/collaborations/create');

    await test.step('Then the submit button is disabled', async () => {
      await expect(fashionco.page.getByTestId('opp-form-submit')).toBeDisabled();
    });

    await test.step('When the company fills all required fields (name + title + address)', async () => {
      // Required fields per opportunity-form.component.ts:97-129 — name, title,
      // city, street, postalCode, country. Address fields landed when the
      // form was extended for inline Address DTO (#178).
      await fashionco.page.getByTestId('opp-form-name').fill('Spring Promo Internal');
      await fashionco.page.getByTestId('opp-form-title-input').fill('Spring Promo');
      await fashionco.page.getByTestId('opp-form-city').fill('Warszawa');
      await fashionco.page.getByTestId('opp-form-street').fill('Marszałkowska 12');
      await fashionco.page.getByTestId('opp-form-postal-code').fill('00-001');
      await fashionco.page.getByTestId('opp-form-country').fill('PL');
    });

    await test.step('Then the submit button becomes enabled', async () => {
      await expect(fashionco.page.getByTestId('opp-form-submit')).toBeEnabled();
    });
  });
});
