import { expect, test, type Page } from '@playwright/test';

/**
 * Sandbox · the knowledge-graph map and its inspector.
 *
 * The map is a hand-rolled SVG whose whole value is the card beside it: what
 * an agent reads at the node under the pointer. So the things to prove in a
 * real browser are the ones jsdom cannot — that hovering an arc changes the
 * card, that a click pins it and Escape lets go, that the keyboard reaches
 * the arcs, that nothing animates under reduced motion, and that below `md`
 * the accordion stands in for the map with the same card.
 */
const INSPECTOR = '[data-testid="graphtopo-inspector"]';
const NAME = '[data-testid="graphtopo-inspector-name"]';

async function open(page: Page, width: number): Promise<void> {
  await page.setViewportSize({ width, height: 1000 });
  await page.goto('/__sandbox/graph-topology');
  await page.waitForLoadState('networkidle');
}

test.describe('Sandbox · GraphTopologyShowcaseComponent', () => {
  test('hover previews a domain, click pins it, Escape returns to the master', async ({
    page,
  }, info) => {
    test.skip(info.project.name !== 'chromium-desktop', 'the radial map is md and up');
    await open(page, 1280);
    // the accordion renders its own copy of the card once a domain is pinned;
    // CSS hides it above md, so ask for the visible one
    const inspector = page.locator(INSPECTOR + ':visible').first();
    await expect(inspector).toHaveAttribute('data-kind', 'master');
    const master = await inspector.locator(NAME).textContent();

    const billing = page.locator('.gt-arc[data-domain="billing"]');
    // the group's box reaches out to its label; the fill is the thing under the pointer
    await billing.locator('.gt-arc-fill').hover();
    await expect(inspector).toHaveAttribute('data-kind', 'domain');
    await expect(inspector.locator(NAME)).toHaveText('Billing Saga');
    await expect(inspector.locator('[data-testid="graphtopo-inspector-desc"]')).toContainText(
      'Stripe',
    );
    // a preview is not a pin: leaving the map brings the master back
    await page.mouse.move(5, 5);
    await expect(inspector.locator(NAME)).toHaveText(master ?? '');

    await billing.locator('.gt-arc-fill').click();
    await page.mouse.move(5, 5);
    await expect(inspector.locator(NAME)).toHaveText('Billing Saga');
    await expect(billing).toHaveAttribute('aria-pressed', 'true');
    await expect(inspector.locator('[data-testid="graphtopo-inspector-edges"] li')).toHaveCount(6);
    // the lit chords are the domain's own six
    expect(await page.locator('[data-testid="graphtopo-overlay"] .gt-lit').count()).toBe(6);

    // a component from the inspector's chip list
    await inspector
      .locator('[data-testid="graphtopo-inspector-leaves"] button', {
        hasText: 'StripeWebhookHandler',
      })
      .click();
    await expect(inspector).toHaveAttribute('data-kind', 'leaf');
    await expect(inspector).toContainText('Implementation');
    await expect(inspector.locator('[data-testid="graphtopo-inspector-edges"] li')).toHaveCount(3);

    await page.keyboard.press('Escape');
    await expect(inspector).toHaveAttribute('data-kind', 'master');
  });

  test('the arcs are reachable from the keyboard', async ({ page }, info) => {
    test.skip(info.project.name !== 'chromium-desktop', 'the radial map is md and up');
    await open(page, 1280);
    const arc = page.locator('.gt-arc[data-domain="cicd"]');
    await arc.focus();
    await page.keyboard.press('Enter');
    await expect(
      page
        .locator(INSPECTOR + ':visible')
        .first()
        .locator(NAME),
    ).toHaveText('Secure CI/CD');
    await expect(arc).toHaveAttribute('aria-pressed', 'true');
  });

  test('nothing in the block animates under reduced motion', async ({ page }, info) => {
    test.skip(info.project.name !== 'chromium-desktop', 'the radial map is md and up');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await open(page, 1280);
    const running = await page.evaluate(
      () =>
        document.getAnimations().filter((a) => {
          const el = (a as CSSAnimation).effect && (a.effect as KeyframeEffect).target;
          return el instanceof Element && el.closest('[data-testid="graphtopo-map"]') !== null;
        }).length,
    );
    expect(running).toBe(0);
  });

  test('below md the accordion stands in for the map, with the same card', async ({
    page,
  }, info) => {
    test.skip(info.project.name !== 'mobile-chrome', 'the accordion is the phone layout');
    await open(page, 390);
    await expect(page.locator('[data-testid="graphtopo-map"]')).toBeHidden();
    const accordion = page.locator('[data-testid="graphtopo-accordion"]');
    await expect(accordion).toBeVisible();
    const row = accordion.locator('button[data-domain="observability"][aria-expanded]');
    await row.click();
    await expect(row).toHaveAttribute('aria-expanded', 'true');
    const card = accordion.locator(INSPECTOR);
    await expect(card).toHaveAttribute('data-kind', 'domain');
    await expect(card.locator(NAME)).toHaveText('Observability');
    await expect(card.locator('[data-testid="graphtopo-inspector-leaves"] button')).toHaveCount(10);
  });
});
