// Sample the company tour's step 2 every 50 ms: does the pill flicker, and why?
// usage: node e2e-tests/hand/step2-flicker.mjs [baseUrl]
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
  await page.waitForTimeout(500);
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
    `xpath=//*[self::h2 or self::h3][contains(normalize-space(.), "Poprowadź kampanię")]/ancestor::*[.//button][1]//button`,
  )
  .first()
  .click();
await page
  .waitForURL(/opportunities\/(create|new)|collaborations\/create/, { timeout: 20000 })
  .catch(() => {});
await pressPill();
await waitStep(1);
await pressPill();
// arm a sampler in the page: it starts recording the moment step 2 is stored
const rows = await page.evaluate(
  () =>
    new Promise((resolve) => {
      const out = [];
      const t0 = performance.now();
      let started = null;
      const tick = () => {
        const s = JSON.parse(sessionStorage.getItem('demoSandbox') ?? '{}');
        if (s.step === 2 && started === null) started = performance.now();
        if (started !== null) {
          const pill = document.querySelector('[data-testid="guide-spot-next"]');
          const ring = document.querySelector('[data-testid="guide-spotlight"]');
          const target = document.querySelector('[data-testid="opp-form-submit"]');
          const imgs = document.querySelectorAll('form img').length;
          const scroller = document.scrollingElement;
          out.push({
            t: Math.round(performance.now() - started),
            pill: !!pill,
            pillY: pill ? Math.round(pill.getBoundingClientRect().top) : null,
            ring: ring ? Math.round(ring.getBoundingClientRect().top) : null,
            targetY: target ? Math.round(target.getBoundingClientRect().top) : null,
            imgs,
            scrollY: Math.round(window.scrollY),
            working: !!document.querySelector('[data-testid="guide-working"]'),
            next: !!document.querySelector('[data-testid="guide-next"]'),
          });
          if (performance.now() - started > 3500) {
            resolve(out);
            return;
          }
        }
        if (performance.now() - t0 > 40000) {
          resolve(out);
          return;
        }
        setTimeout(tick, 50);
      };
      tick();
    }),
);
let last = '';
for (const r of rows) {
  const key = `${r.pill}|${r.pillY}|${r.ring}|${r.targetY}|${r.imgs}|${r.scrollY}|${r.working}|${r.next}`;
  if (key !== last) console.log(JSON.stringify(r));
  last = key;
}
await page.screenshot({ path: 'qa-shots/step2-flicker.png' });
await browser.close();
