// Browser-Back reproduction for the demo hub, with the back-forward cache ON.
// usage: node e2e-tests/bfcache-repro.mjs [--defeat]   (--defeat drops the
// app's pageshow listener = the build before the fix)
import { chromium } from '@playwright/test';

const BASE = 'http://localhost:4300';
const defeat = process.argv.includes('--defeat');
const browser = await chromium.launch({ ignoreDefaultArgs: ['--disable-back-forward-cache'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
if (defeat) {
  await ctx.addInitScript(() => {
    const orig = window.addEventListener.bind(window);
    window.addEventListener = (type, ...rest) => {
      if (type === 'pageshow') return;
      return orig(type, ...rest);
    };
  });
}
const page = await ctx.newPage();
const snap = async (label) => {
  const s = await page.evaluate(() => ({
    url: location.pathname,
    navType: performance.getEntriesByType('navigation')[0]?.type,
    sandbox: sessionStorage.getItem('demoSandbox'),
    signedIn: localStorage.getItem('demoSession'),
    guide: !!document.querySelector('[data-testid="guide-next"]'),
    pill: !!document.querySelector('[data-testid="guide-spot-next"]'),
    signIn: !!document.querySelector(
      '[data-testid="sign-in-submit"], form[action*="sign-in"], [data-testid="auth-sign-in"]',
    ),
    nrr: JSON.stringify(performance.getEntriesByType('navigation')[0]?.notRestoredReasons ?? null),
  }));
  console.log(label, JSON.stringify(s));
  return s;
};

await page.goto(`${BASE}/demo`, { waitUntil: 'networkidle' });
await page.evaluate(() => {
  localStorage.setItem('demoSession', '0');
  localStorage.setItem('demoRole', 'ADMIN');
  sessionStorage.removeItem('demoSandbox');
});
await page.reload({ waitUntil: 'networkidle' });
await snap('hub');

const startOf = (title) =>
  page
    .locator(
      `xpath=//*[self::h2 or self::h3][contains(normalize-space(.), "${title}")]/ancestor::*[.//button][1]//button`,
    )
    .first();
await startOf('Poprowadź kampanię').click();
await page.waitForURL(/\/collaborations\/create/, { timeout: 20000 });
await page.waitForSelector('[data-testid="guide-spot-next"]', { timeout: 20000 });
await snap('tour step 0');
await page.click('[data-testid="guide-spot-next"]');
await page.waitForTimeout(3000);
await snap('after pill');

await page.goBack({ waitUntil: 'load' }).catch(() => {});
await page.waitForTimeout(2500);
const back = await snap('after Back');

await startOf('Poprowadź kampanię')
  .click({ timeout: 10000 })
  .catch((e) => console.log('start again click failed:', e.message.slice(0, 80)));
await page.waitForTimeout(4000);
const end = await snap('after Start again');
const broken = back.guide || end.url.startsWith('/auth/');
console.log(defeat ? 'DEFEAT' : 'FIXED', broken ? 'BUG REPRODUCED' : 'clean');
await browser.close();
process.exit(defeat ? (broken ? 0 : 2) : broken ? 1 : 0);
