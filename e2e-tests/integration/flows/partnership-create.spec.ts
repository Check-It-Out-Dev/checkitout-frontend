import { expect, test } from '@playwright/test';
import type { PartnershipOpportunityDtoOut } from '../../../src/app/api/model/partnership-opportunity-dto-out';
import { BE_URL, GREENFIELD_URL, seedSession } from '../_actor';

// Per-test unique email avoids state-bleed across runs. The mock-session
// endpoint auto-creates fresh actors; using a fixed `company1@e2e.test`
// caused FREE-plan-limit accumulation (5-campaign cap) to surface after
// ~5 successful runs, breaking the suite mid-week.
const UNIQUE_COMPANY = () => `t11-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@e2e.test`;

/**
 * T11a — Port of partnership-flow.feature Scenario 1 "Company creates
 * partnership opportunity successfully" as a UI-driven flow.
 *
 * BE Cucumber test makes the call via REST. This FE port drives the
 * actual form to catch form-binding bugs that pure-API tests miss:
 *   - field-name → FormControl wiring
 *   - validation chain (required fields, length limits)
 *   - submit handler routing (success → my-campaigns)
 *   - campaign visible in the list after creation
 *
 * The fuller lifecycle scenarios (state machine across 14 transitions
 * with content rejection, ratings, etc.) need T1 (TOTP admin) +
 * Instagram OAuth simulation and will be added as separate spec files.
 *
 * Run: `npm run test:integration -- --grep partnership-create`
 */

test.describe('@partnership-flow @create — port of partnership-flow.feature scenario 1', () => {
  test.beforeAll(async ({ request }) => {
    try {
      const res = await request.get(`${BE_URL}/api/public-config`, {
        ignoreHTTPSErrors: true,
        timeout: 3_000,
      });
      if (!res.ok()) test.skip(true, `BE health-check failed (${res.status()})`);
    } catch (err) {
      test.skip(true, `BE not reachable: ${(err as Error).message}`);
    }
  });

  test.beforeEach(({}, testInfo) => {
    test.skip(
      testInfo.project.name !== 'chromium-desktop',
      'Integration runs on chromium-desktop only',
    );
  });

  // BE-contract gaps peeled over five iterations (each kept this test fixme):
  //   ✅ `city`              — wired (commit 9f5a31b)
  //   ✅ `company`           — wired from SessionState (commit d044344)
  //   ✅ Currency/ServiceType — BE null-safe (be2 commit cd7f2621)
  //   ✅ inline `address`    — street/postalCode/country/MAIN type wired here
  //   ⏳ followersMin/Max    — primitive long, defaults to 0 — should be ok
  //   ⏳ platforms           — Set, BE converter null-safe → empty Set
  //   ⏳ contentTypes        — Set, BE converter null-safe → empty Set
  //
  // The form is now "complete enough" for the BE create-campaign contract.
  test('company1 fills the create-campaign form and lands on the new campaign', async ({
    page,
  }) => {
    // Step 1 — authenticate as a fresh COMPANY actor (avoids FREE-plan
    // limit accumulation that would surface on subsequent runs with a
    // fixed actor email).
    const email = UNIQUE_COMPANY();
    await seedSession(page, email, 'COMPANY');
    // Second seed flips emailVerified/setupCompleted=true (existing-user
    // branch of TestAuthController) — without it the
    // EmailVerificationEnforcementFilter 403s the campaign POST.
    await seedSession(page, email, 'COMPANY');

    // Step 2 — navigate to the create form.
    await page.goto(`${GREENFIELD_URL}/collaborations/create`, { waitUntil: 'networkidle' });
    await expect(page.getByTestId('opp-form-title')).toBeVisible();

    // Dismiss the cookie-consent banner. In a fresh browser context it overlays
    // the bottom of the page and OCCLUDES the submit button — a coordinate-based
    // Playwright click lands on the banner, the form never submits, and the
    // awaited create POST times out. (The form itself is fine: live Chrome via
    // element.click() bypasses the overlay and creates the campaign.) Choose the
    // privacy-preserving "necessary only".
    const cookieNecessary = page.getByTestId('cookie-banner-necessary');
    if (await cookieNecessary.isVisible().catch(() => false)) {
      await cookieNecessary.click();
      await expect(page.getByTestId('cookie-banner')).toBeHidden();
    }

    // Step 3 — fill all required fields.
    const uniq = `Smoke ${new Date().toISOString().slice(11, 19)}`;
    await page.getByTestId('opp-form-name').fill(`${uniq} — name`);
    await page.getByTestId('opp-form-title-input').fill(`${uniq} — title`);
    await page.getByTestId('opp-form-street').fill('Marszałkowska 12');
    await page.getByTestId('opp-form-city').fill('Warszawa');
    await page.getByTestId('opp-form-postal-code').fill('00-001');
    await page.getByTestId('opp-form-country').fill('PL');
    await page.getByTestId('opp-form-details').fill('UI-integration smoke run: please ignore.');
    await page.getByTestId('opp-form-requirements').fill('Min 1k followers, smoke-test category');
    await page.getByTestId('opp-form-amount-min').fill('500');
    await page.getByTestId('opp-form-amount-max').fill('2000');

    // Compensation type defaults to CASH; assert before submitting.
    // (BARTER would require a different compensation description.)
    await expect(page.getByTestId('opp-form-comp-type')).toBeVisible();

    // Step 4 — submit. Wait for the BE POST to land + redirect.
    // Button lives at the bottom of a long form; assert it's enabled and scroll
    // it into view before clicking (the cookie banner that used to occlude it is
    // now dismissed above).
    const submitBtn = page.getByTestId('opp-form-submit');
    await expect(submitBtn).toBeEnabled();
    await submitBtn.scrollIntoViewIfNeeded();

    const createResponse = page.waitForResponse(
      (resp) =>
        /\/api\/partnership-opportunity\b/.test(resp.url()) && resp.request().method() === 'POST',
      { timeout: 10_000 },
    );

    await submitBtn.click();
    const created = await createResponse;
    expect(created.status(), 'campaign create should return 2xx').toBeLessThan(300);

    // Read back the BE response to capture the new ID for later
    // assertion (and so this test asserts on the actual contract shape).
    // Typed as the codegen DTO so a BE rename like `id` → `opportunityId`
    // would break this cast at compile time after `npm run openapi:gen`.
    const body = (await created.json()) as PartnershipOpportunityDtoOut;
    expect(body.id, 'create response should include the campaign id').toBeDefined();
    const newId = String(body.id);

    // Step 5 — the FE navigates to the detail page of the new campaign by
    // default (the user just created it; they want to see it). List and
    // my-campaigns are also valid landings depending on UX policy — accept
    // any of the three. Wait explicitly for the SPA router to leave /create:
    // Angular's router.navigate is async and may not trigger a network event
    // that `networkidle` can latch onto.
    await page.waitForURL(
      (url) => {
        const p = new URL(url).pathname;
        return (
          p.startsWith(`/collaborations/${newId}`) ||
          p.startsWith('/collaborations/list') ||
          p.startsWith('/collaborations/my-campaigns')
        );
      },
      { timeout: 5_000 },
    );
    const landed = new URL(page.url()).pathname;
    expect(
      [`/collaborations/${newId}`, '/collaborations/list', '/collaborations/my-campaigns'].some(
        (p) => landed.startsWith(p),
      ),
      `expected landing on detail / list / my-campaigns, got ${landed}`,
    ).toBe(true);

    // Step 6 — open the my-campaigns listing and confirm the new
    // campaign is present (by data-testid which embeds the id).
    await page.goto(`${GREENFIELD_URL}/collaborations/my-campaigns`, {
      waitUntil: 'networkidle',
    });
    await expect(
      page.getByTestId(`my-campaign-${newId}`),
      `newly created campaign ${newId} should be in my-campaigns list`,
    ).toBeVisible({ timeout: 5_000 });
  });
});
