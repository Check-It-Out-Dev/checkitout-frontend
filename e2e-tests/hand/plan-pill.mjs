// Where does the pill land on the plan page's upgrade beat, and what is under it?
// usage: node e2e-tests/hand/plan-pill.mjs [baseUrl]
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
for (let s = 1; s <= 4; s++) {
  await pressPill();
  await waitStep(s);
}
await page.waitForURL(/plan-billing/, { timeout: 15000 });
await page.waitForTimeout(1500);
const geo = await page.evaluate(() => {
  const r = (el) => {
    if (!el) return null;
    const b = el.getBoundingClientRect();
    return {
      l: Math.round(b.left),
      t: Math.round(b.top),
      r: Math.round(b.right),
      b: Math.round(b.bottom),
      w: Math.round(b.width),
      h: Math.round(b.height),
    };
  };
  const pill = document.querySelector('[data-testid="guide-spot-next"]');
  const q = pill?.getBoundingClientRect();
  const under = [];
  if (q) {
    for (const y of [q.top + 2, q.top + q.height / 2, q.bottom - 2]) {
      for (let i = 0; i < 8; i++) {
        const x = q.left + 4 + ((q.width - 8) * i) / 7;
        const el = document.elementFromPoint(x, y);
        under.push(
          `${Math.round(x)},${Math.round(y)}:${el?.tagName}${el?.dataset?.testid ? '#' + el.dataset.testid : ''}${el?.className && typeof el.className === 'string' ? '.' + el.className.split(' ').slice(0, 2).join('.') : ''}`,
        );
      }
    }
  }
  return {
    viewport: [innerWidth, innerHeight],
    pill: r(pill),
    ring: r(document.querySelector('[data-testid="guide-spotlight"]')),
    cards: [...document.querySelectorAll('[data-testid^="plan-billing-plan-"]')].map((c) => ({
      id: c.dataset.testid,
      box: r(c),
    })),
    buttons: [...document.querySelectorAll('[data-testid^="plan-billing-plan-"] button')].map(
      (b) => ({
        id: b.dataset.testid,
        text: b.textContent.trim().slice(0, 30),
        box: r(b),
        disabled: b.disabled,
      }),
    ),
    under: [...new Set(under.map((u) => u.split(':')[1]))],
  };
});
console.log(JSON.stringify(geo, null, 1));
await page.screenshot({ path: 'qa-shots/plan-pill.png' });
await browser.close();
