// After the tour lands on the plan page: where is the pill, frame by frame, for 3 s?
// usage: node e2e-tests/hand/plan-pill-timeline.mjs [baseUrl]
import { chromium } from '@playwright/test';

const BASE = process.argv[2] ?? 'https://localhost:4201';
const browser = await chromium.launch();
const ctx = await browser.newContext({
  ignoreHTTPSErrors: true,
  viewport: { width: 1440, height: 900 },
});
const page = await ctx.newPage();
const waitStep = (n, ms = 30000) =>
  page.waitForFunction(
    (n) => JSON.parse(sessionStorage.getItem('demoSandbox') ?? '{}').step === n,
    n,
    { timeout: ms },
  );
const pressPill = async () => {
  await page.waitForSelector('[data-testid="guide-spot-next"]', { timeout: 15000 });
  await page.waitForTimeout(600);
  await page.click('[data-testid="guide-spot-next"]');
};
await page.goto(`${BASE}/demo`, { waitUntil: 'networkidle' });
await page.evaluate(() => {
  localStorage.setItem('demoSession', '0');
  localStorage.setItem('demoRole', 'ADMIN');
  sessionStorage.clear();
});
await page.reload({ waitUntil: 'networkidle' });
await page
  .locator(
    `xpath=//*[self::h2 or self::h3][contains(normalize-space(.), "Od NIP-u do KSeF")]/ancestor::*[.//button][1]//button`,
  )
  .first()
  .click();
await page.waitForURL(/\/company\/setup/, { timeout: 20000 });
for (let s = 1; s <= 3; s++) {
  await pressPill();
  await waitStep(s);
}
await pressPill();
const rows = await page.evaluate(
  () =>
    new Promise((resolve) => {
      const out = [];
      const t0 = performance.now();
      let started = null;
      const r = (el) => {
        if (!el) return null;
        const b = el.getBoundingClientRect();
        return [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)];
      };
      const tick = () => {
        const s = JSON.parse(sessionStorage.getItem('demoSandbox') ?? '{}');
        if (s.step === 4 && started === null) started = performance.now();
        if (started !== null) {
          out.push({
            t: Math.round(performance.now() - started),
            url: location.pathname,
            pill: r(document.querySelector('[data-testid="guide-spot-next"]')),
            ring: r(document.querySelector('[data-testid="guide-spotlight"]')),
            ent: r(document.querySelector('[data-testid="plan-billing-upgrade-enterprise"]')),
            biz: r(document.querySelector('[data-testid="plan-billing-upgrade-business"]')),
            cards: document.querySelectorAll('[data-testid^="plan-billing-plan-"]').length,
            next: !!document.querySelector('[data-testid="guide-next"]'),
          });
          if (performance.now() - started > 3500) return resolve(out);
        }
        if (performance.now() - t0 > 40000) return resolve(out);
        setTimeout(tick, 60);
      };
      tick();
    }),
);
let last = '';
for (const row of rows) {
  const key = JSON.stringify([row.pill, row.ring, row.ent, row.biz, row.cards, row.next, row.url]);
  if (key !== last) console.log(JSON.stringify(row));
  last = key;
}
await browser.close();
