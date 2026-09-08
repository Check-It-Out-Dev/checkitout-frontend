// Walk the nip-to-ksef tour on the demo dev server and photograph each beat.
// usage: node e2e-tests/hand/ksef-walk.mjs [baseUrl] [shotDir]
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const BASE = process.argv[2] ?? 'https://localhost:4201';
const DIR = process.argv[3] ?? 'qa-shots/ksef';
mkdirSync(DIR, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({
  ignoreHTTPSErrors: true,
  viewport: { width: 1440, height: 900 },
});
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 160)));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text().slice(0, 160));
});

const beat = () =>
  page.evaluate(() => {
    const s = JSON.parse(sessionStorage.getItem('demoSandbox') ?? 'null');
    return {
      url: location.pathname,
      step: s?.step,
      done: s?.done,
      pill: !!document.querySelector('[data-testid="guide-spot-next"]'),
      next: !!document.querySelector('[data-testid="guide-next"]'),
      plan: sessionStorage.getItem('demoPlan'),
    };
  });
const shot = (name) => page.screenshot({ path: `${DIR}/${name}.png`, fullPage: false });
const waitStep = (n, ms = 25000) =>
  page.waitForFunction(
    (n) => JSON.parse(sessionStorage.getItem('demoSandbox') ?? '{}').step === n,
    n,
    { timeout: ms },
  );
const pressPill = async () => {
  await page.waitForSelector('[data-testid="guide-spot-next"]', { timeout: 15000 });
  await page.waitForTimeout(700);
  await page.click('[data-testid="guide-spot-next"]');
};
const log = async (label) => console.log(label, JSON.stringify(await beat()));

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
await log('step0');
await pressPill();
await waitStep(1);
await page.waitForTimeout(600);
await log('step1');
await shot('01-confirm');
await pressPill();
await waitStep(2);
await page.waitForTimeout(900);
await log('step2 (mail)');
const inbox = await page.evaluate(() => ({
  docked: !!document.querySelector('[data-testid="inbox-sim-cta"]'),
  pos: document.querySelector('[data-testid="inbox-sim-cta"]')?.getBoundingClientRect().toJSON(),
  pending: document.querySelector('[data-testid="company-setup-done-title"]')?.textContent.trim(),
}));
console.log('inbox', JSON.stringify(inbox));
await shot('02-mail');
await pressPill();
await waitStep(3);
await page.waitForTimeout(900);
await log('step3 (active)');
const active = await page.evaluate(() => ({
  title: document.querySelector('[data-testid="company-setup-done-title"]')?.textContent.trim(),
  sub: !!document.querySelector('[data-testid="company-setup-subscription"]'),
}));
console.log('active', JSON.stringify(active));
await shot('03-active');
await pressPill();
await waitStep(4);
await page.waitForURL(/plan-billing/, { timeout: 15000 });
await page.waitForTimeout(1200);
await log('step4 (plans)');
const plans = await page.evaluate(() =>
  [...document.querySelectorAll('[data-testid^="plan-billing-plan-"]')].map(
    (c) =>
      c.dataset.testid +
      ':' +
      [...c.querySelectorAll('button')]
        .map((b) => b.dataset.testid + (b.disabled ? '(off)' : ''))
        .join('+'),
  ),
);
console.log('plans', JSON.stringify(plans));
await shot('04-plans');
await pressPill();
await waitStep(5);
await page.waitForTimeout(800);
await log('step5 (dialog)');
const dlg = await page.evaluate(() => {
  const d = document.querySelector('mat-dialog-container');
  return {
    w: d?.getBoundingClientRect().width,
    actionsPad: getComputedStyle(document.querySelector('mat-dialog-actions')).paddingBottom,
  };
});
console.log('dialog', JSON.stringify(dlg));
await shot('05-dialog');
// backdrop click must NOT close it
await page.mouse.click(200, 300);
await page.waitForTimeout(400);
console.log(
  'after backdrop click, dialog still open:',
  await page.evaluate(() => !!document.querySelector('[data-testid="upgrade-confirm-submit"]')),
);
await pressPill();
await waitStep(6);
await page.waitForTimeout(600);
await log('step6 (ticked)');
await shot('06-terms');
await pressPill();
await waitStep(7);
await page.waitForTimeout(1200);
await log('step7 (checkout)');
const co = await page.evaluate(() => ({
  sim: !!document.querySelector('[data-testid="checkout-sim"]'),
  pay: !!document.querySelector('[data-testid="checkout-sim-pay"]'),
  total: document.querySelector('[data-testid="checkout-sim-total"]')?.textContent.trim(),
  dialogGone: !document.querySelector('[data-testid="upgrade-confirm-submit"]'),
}));
console.log('checkout', JSON.stringify(co));
await shot('07-checkout');
await pressPill();
await waitStep(8);
await page.waitForTimeout(1500);
await log('step8 (invoice)');
const planNow = await page.evaluate(() => ({
  plan: document.querySelector('[data-testid="plan-billing-card"] h1')?.textContent.trim(),
  sim: !!document.querySelector('[data-testid="fakturownia-sim-send"]'),
}));
console.log('after pay', JSON.stringify(planNow));
await shot('08-invoice');
await pressPill();
await waitStep(9);
await page.waitForTimeout(1000);
await log('step9 (ksef)');
await shot('09-ksef');
await page.click('[data-testid="guide-next"]').catch(() => {});
await page.waitForTimeout(800);
await log('end');
console.log('errors', JSON.stringify(errors.slice(0, 6)));
await browser.close();
