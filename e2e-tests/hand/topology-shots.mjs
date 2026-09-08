// Photograph the graph map on the dev server: at rest, previewing, pinned, and as the phone accordion.
// usage: node e2e-tests/hand/topology-shots.mjs [baseUrl] [shotDir]
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const BASE = process.argv[2] ?? 'https://localhost:4201';
const DIR = process.argv[3] ?? 'qa-shots/topology';
mkdirSync(DIR, { recursive: true });
const browser = await chromium.launch();
const ctx = await browser.newContext({
  ignoreHTTPSErrors: true,
  viewport: { width: 1440, height: 1000 },
});
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 160)));

const block = () => page.locator('app-graph-topology-showcase');
const shot = async (name) => {
  const grid = block().locator('[data-testid="graphtopo-map"]').first();
  await grid.scrollIntoViewIfNeeded();
  await page.waitForTimeout(350);
  const g = await grid.locator('..').boundingBox();
  if (!g) return console.log(name, 'NOT FOUND');
  await page.screenshot({
    path: `${DIR}/${name}.png`,
    clip: {
      x: Math.max(0, g.x - 12),
      y: Math.max(0, g.y - 12),
      width: Math.min(1440, g.width + 24),
      height: Math.min(1000, g.height + 24),
    },
  });
  console.log(
    name,
    JSON.stringify([Math.round(g.x), Math.round(g.y), Math.round(g.width), Math.round(g.height)]),
  );
};

await page.goto(`${BASE}/technical-survey/engineering`, { waitUntil: 'networkidle' });
await shot('01-rest-1440');
await page.locator('.gt-arc[data-domain="billing"] .gt-arc-fill').hover();
await page.waitForTimeout(300);
await shot('02-hover-billing');
await page.locator('.gt-arc[data-domain="billing"] .gt-arc-fill').click();
await page.mouse.move(5, 5);
await page.waitForTimeout(300);
await shot('03-pinned-billing');
await page
  .locator(
    '[data-testid="graphtopo-inspector"]:visible [data-testid="graphtopo-inspector-leaves"] button',
    {
      hasText: 'StripeWebhookHandler',
    },
  )
  .first()
  .click();
await page.waitForTimeout(300);
await shot('04-leaf-handler');
// label geometry: every domain label inside the svg box, no two leaf marks overlapping
const geo = await page.evaluate(() => {
  const svg = document.querySelector('[data-testid="graphtopo-svg"]');
  const box = svg.getBoundingClientRect();
  const labels = [...svg.querySelectorAll('.gt-label')].map((t) => {
    const b = t.getBoundingClientRect();
    return {
      text: t.textContent.trim(),
      inside:
        b.left >= box.left - 1 &&
        b.right <= box.right + 1 &&
        b.top >= box.top - 1 &&
        b.bottom <= box.bottom + 1,
    };
  });
  const marks = [...svg.querySelectorAll('.gt-leaf')].map((g) => {
    const b = g.getBoundingClientRect();
    return [b.left + b.width / 2, b.top + b.height / 2];
  });
  let minD = Infinity;
  for (let i = 0; i < marks.length; i++)
    for (let j = i + 1; j < marks.length; j++)
      minD = Math.min(minD, Math.hypot(marks[i][0] - marks[j][0], marks[i][1] - marks[j][1]));
  return {
    svg: [Math.round(box.width), Math.round(box.height)],
    labelsOutside: labels.filter((l) => !l.inside).map((l) => l.text),
    marks: marks.length,
    minMarkDistancePx: Math.round(minD * 10) / 10,
  };
});
console.log('geometry', JSON.stringify(geo));
await page.setViewportSize({ width: 1024, height: 1000 });
await page.keyboard.press('Escape');
await page.waitForTimeout(400);
await shot('05-rest-1024');
await page.setViewportSize({ width: 390, height: 900 });
await page.waitForTimeout(400);
const acc = page.locator('[data-testid="graphtopo-accordion"]');
await acc.locator('button[data-domain="observability"][aria-expanded]').click();
await page.waitForTimeout(300);
await acc.scrollIntoViewIfNeeded();
const a = await acc.boundingBox();
await page.screenshot({
  path: `${DIR}/06-accordion-390.png`,
  clip: { x: 0, y: Math.max(0, a.y - 8), width: 390, height: 880 },
});
console.log('accordion', JSON.stringify(a && [Math.round(a.y), Math.round(a.height)]));
console.log('errors', JSON.stringify(errors.slice(0, 5)));
await browser.close();
