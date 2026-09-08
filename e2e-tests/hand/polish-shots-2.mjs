// Second pass over the polish brief: the surfaces the first pass sent back.
// usage: node e2e-tests/hand/polish-shots-2.mjs [baseUrl] [shotDir]
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

await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
// the reset: does a `mt-4` on a paragraph work now?
console.log(
  'margins',
  JSON.stringify(
    await page.evaluate(() => {
      const p = document.querySelector('[data-testid="landing-cta-strip"] p');
      const h2 = document.querySelector('[data-testid="landing-cta-strip"] h2');
      const hero = document.querySelector('[data-testid="landing-hero"] p, header p, section p');
      const cs = (el) =>
        el && {
          mt: getComputedStyle(el).marginTop,
          ml: getComputedStyle(el).marginLeft,
          mb: getComputedStyle(el).marginBottom,
        };
      return { stripP: cs(p), stripH2: cs(h2), firstP: cs(hero) };
    }),
  ),
);
await shotOf('[data-testid="landing-cta-strip"]', '01-02-strip-1440-b', 0);
await shotOf('#pricing', '00-pricing-sanity', 0).catch(() =>
  shotOf('[data-testid="landing-pricing"]', '00-pricing-sanity', 0),
);
await page.screenshot({
  path: `${DIR}/00-hero.png`,
  clip: { x: 0, y: 0, width: 1440, height: 900 },
});

await page.goto(`${BASE}/technical-survey/platform`, { waitUntil: 'networkidle' });
await shotOf('app-tech-stack-strip', '05-stack-b', 0);

await page.goto(`${BASE}/technical-survey/engineering`, { waitUntil: 'networkidle' });
await shotOf('[data-testid="graphtopo-svg"]', '06-topology-b', 16);

await page.goto(`${BASE}/codemap`, { waitUntil: 'networkidle' });
await shotOf('[data-testid="codemap-film"]', '11-codemap-poster-b', 24);

await page.goto(`${BASE}/technical-survey/compliance`, { waitUntil: 'networkidle' });
await shotOf('text=Śledź swoje dane', '04-gdpr-run-b', 120);
await browser.close();
