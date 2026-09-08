// Photograph every item of the 2026-09-07 polish brief on the dev server.
// usage: node e2e-tests/hand/polish-shots.mjs [baseUrl] [shotDir]
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const BASE = process.argv[2] ?? 'https://localhost:4201';
const DIR = process.argv[3] ?? 'qa-shots/polish';
mkdirSync(DIR, { recursive: true });
const browser = await chromium.launch();
const ctx = await browser.newContext({
  ignoreHTTPSErrors: true,
  viewport: { width: 1440, height: 900 },
});
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 160)));
const shotOf = async (selector, name, pad = 24) => {
  const el = page.locator(selector).first();
  await el.scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  const b = await el.boundingBox();
  if (!b) return console.log(name, 'NOT FOUND');
  await page.screenshot({
    path: `${DIR}/${name}.png`,
    clip: {
      x: Math.max(0, b.x - pad),
      y: Math.max(0, b.y - pad),
      width: Math.min(1440, b.width + pad * 2),
      height: Math.min(900, b.height + pad * 2),
    },
  });
  console.log(
    name,
    JSON.stringify([Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height)]),
  );
};

// 1 + 2 + 12: landing strip, mock card, header
await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
await shotOf('app-marketing-toolbar', '12-header-1440', 0);
await shotOf('[data-testid="landing-cta-strip"]', '01-02-strip-1440', 0);
await shotOf('[data-testid="landing-cta-strip"] h2', '02-strip-heading-box', 8);
await shotOf(
  '[data-testid="landing-how-it-works"] .rounded-2xl.border.bg-white',
  '03-mock-card',
  12,
).catch(async () => {
  await shotOf('text=Letnia karta kawowa', '03-mock-card', 60);
});
await page.setViewportSize({ width: 2880, height: 1300 });
await page.waitForTimeout(500);
{
  const b = await page.locator('[data-testid="landing-cta-strip"] h2').boundingBox();
  console.log(
    '02 heading @2880',
    JSON.stringify(b && [Math.round(b.x), Math.round(b.width), Math.round(b.x + b.width / 2)]),
  );
}
await page.setViewportSize({ width: 1280, height: 900 });
await page.waitForTimeout(400);
{
  const nav = await page.evaluate(() =>
    [...document.querySelectorAll('nav[aria-label="Main navigation"] a')].map((a) => {
      const b = a.getBoundingClientRect();
      return `${a.textContent.trim()}@${Math.round(b.left)}-${Math.round(b.right)}/${Math.round(b.top)}`;
    }),
  );
  console.log('12 nav @1280', JSON.stringify(nav));
  await shotOf('app-marketing-toolbar', '12-header-1280', 0);
}
await page.setViewportSize({ width: 1440, height: 900 });

// 4 + 5 + 9: platform chapter
await page.goto(`${BASE}/technical-survey/platform`, { waitUntil: 'networkidle' });
await shotOf('app-tech-stack-strip', '05-stack', 0);
await page.locator('text=Ponowna zgoda na regulamin').first().click();
await page.waitForTimeout(2400);
await shotOf('app-subscription-state-machine-showcase', '09-fsm-terms', 0);
await page.locator('text=Ponowna zgoda na regulamin').first().click();
await page.waitForTimeout(300);
await shotOf('app-subscription-state-machine-showcase svg', '09-fsm-replay-early', 0);

// 4: compliance run button spacing
await page.goto(`${BASE}/technical-survey/compliance`, { waitUntil: 'networkidle' });
await shotOf('app-gdpr-compliance-showcase', '04-gdpr-run', 0);
await page.goto(`${BASE}/technical-survey/operations`, { waitUntil: 'networkidle' });
await shotOf('app-network-perimeter-showcase', '04-ops-run', 0).catch(() => {});

// 6 + 7 + 8 + 10: engineering chapter
await page.goto(`${BASE}/technical-survey/engineering`, { waitUntil: 'networkidle' });
await shotOf('[data-testid="graphtopo-svg"]', '06-topology', 16);
await shotOf('[data-testid="graphtopo-legend"]', '06-topology-legend', 16);
await shotOf('app-demo-meta-showcase', '08-demometa', 0);
await shotOf('text=Jak wchodzi jedna zmiana', '10-slice', 40);
await shotOf('text=To całe pudełko', '07-handoff', 40);

// 11: codemap film
await page.goto(`${BASE}/codemap`, { waitUntil: 'networkidle' });
await shotOf('[data-testid="codemap-hero"]', '11-codemap-hero', 0);
await page.locator('[data-testid="codemap-film-play"]').click();
await page.waitForTimeout(800);
console.log('11 video present:', await page.locator('[data-testid="codemap-film-video"]').count());
await shotOf('[data-testid="codemap-film"]', '11-codemap-playing', 8);
console.log('errors', JSON.stringify(errors.slice(0, 5)));
await browser.close();
