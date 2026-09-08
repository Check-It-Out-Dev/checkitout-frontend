// Walk the support-ticket and admin-ops tours on the demo dev server; photograph each beat.
// usage: node e2e-tests/hand/last-two-walk.mjs [baseUrl] [shotDir]
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const BASE = process.argv[2] ?? 'https://localhost:4201';
const DIR = process.argv[3] ?? 'qa-shots/last-two';
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
    const pill = document.querySelector('[data-testid="guide-spot-next"]');
    return {
      url: location.pathname,
      step: s?.step,
      done: s?.done,
      pill: !!pill,
      pillPos: pill ? getComputedStyle(pill).transform : null,
      next: !!document.querySelector('[data-testid="guide-next"]'),
      finish: !!document.querySelector('[data-testid="guide-finish"]'),
      nextSandbox: !!document.querySelector('[data-testid="guide-next-sandbox"]'),
    };
  });
const shot = (name) => page.screenshot({ path: `${DIR}/${name}.png`, fullPage: false });
const waitStep = (n, ms = 25000) =>
  page.waitForFunction(
    (n) => JSON.parse(sessionStorage.getItem('demoSandbox') ?? '{}').step === n,
    n,
    { timeout: ms },
  );
const waitDone = (ms = 15000) =>
  page.waitForFunction(
    () => JSON.parse(sessionStorage.getItem('demoSandbox') ?? '{}').done === true,
    null,
    { timeout: ms },
  );
const pressPill = async () => {
  await page.waitForSelector('[data-testid="guide-spot-next"]', { timeout: 15000 });
  await page.waitForTimeout(700);
  await page.click('[data-testid="guide-spot-next"]');
};
const log = async (label) => console.log(label, JSON.stringify(await beat()));
const startTour = async (title) => {
  await page.goto(`${BASE}/demo`, { waitUntil: 'networkidle' });
  await page.evaluate(() => {
    localStorage.setItem('demoSession', '0');
    localStorage.setItem('demoRole', 'ADMIN');
    sessionStorage.clear();
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page
    .locator(
      `xpath=//*[self::h2 or self::h3][contains(normalize-space(.), "${title}")]/ancestor::*[.//button][1]//button`,
    )
    .first()
    .click();
};

// ── support-ticket ──────────────────────────────────────────────────────
await startTour('Pomoc, szybko');
await page.waitForURL(/\/support\/tickets\/create/, { timeout: 20000 });
await log('S step0');
await pressPill();
await waitStep(1);
await page.waitForTimeout(700);
await log('S step1 (send)');
const filled = await page.evaluate(() => ({
  subject: document.querySelector('[data-testid="create-ticket-subject"]')?.value,
  desc: document.querySelector('[data-testid="create-ticket-description"]')?.value.slice(0, 30),
  submitOff: document.querySelector('[data-testid="create-ticket-submit"]')?.disabled,
}));
console.log('S filled', JSON.stringify(filled));
await shot('S1-filled');
await pressPill();
await waitStep(2);
await page.waitForTimeout(700);
await log('S step2 (reference)');
const ringOn = await page.evaluate(() => {
  const r = document.querySelector('[data-testid="guide-spotlight"]')?.getBoundingClientRect();
  const b = document
    .querySelector('[data-testid="create-ticket-view-status"]')
    ?.getBoundingClientRect();
  return r && b
    ? {
        ringLeft: Math.round(r.left),
        btnLeft: Math.round(b.left),
        ringTop: Math.round(r.top),
        btnTop: Math.round(b.top),
      }
    : null;
});
console.log('S ring on view-status', JSON.stringify(ringOn));
await shot('S2-reference');
await pressPill();
await waitStep(3);
await page.waitForURL(/\/support\/tickets\/status/, { timeout: 15000 });
await page.waitForTimeout(1200);
await log('S step3 (status)');
const status = await page.evaluate(() => ({
  url: location.search,
  reply: !!document.querySelector('[data-testid="ticket-response-1"]'),
  ref: document.body.innerText.match(/CIO-2026-\d{4}/)?.[0],
}));
console.log('S status', JSON.stringify(status));
await shot('S3-status');
await page.click('[data-testid="guide-next"]').catch(() => {});
await page.waitForTimeout(800);
await log('S end');
await shot('S4-recap');

// ── admin-ops ───────────────────────────────────────────────────────────
await startTour('Operacje admina');
await page.waitForURL(/\/support\/admin\/tickets/, { timeout: 20000 });
await log('A step0');
await shot('A0-queue');
await pressPill();
await waitStep(1);
await page.waitForURL(/\/support\/admin\/tickets\/\d+/, { timeout: 15000 });
await page.waitForTimeout(900);
await log('A step1 (draft)');
const thread = await page.evaluate(() => ({
  responses: document.querySelectorAll('[data-testid^="admin-ticket-response-"]').length,
  noResponses: !!document.querySelector('[data-testid="admin-ticket-no-responses"]'),
}));
console.log('A thread before', JSON.stringify(thread));
await shot('A1-thread');
await pressPill();
await waitStep(2);
await page.waitForTimeout(700);
await log('A step2 (send)');
await shot('A2-drafted');
await pressPill();
await waitStep(3);
await page.waitForTimeout(1200);
await log('A step3 (to campaigns)');
const after = await page.evaluate(() => ({
  responses: document.querySelectorAll('[data-testid^="admin-ticket-response-"]').length,
  sent: !!document.querySelector('[data-testid="admin-response-sent"]'),
  cta: !!document.querySelector('[data-testid="admin-ticket-campaigns"]'),
}));
console.log('A thread after', JSON.stringify(after));
await shot('A3-sent');
await pressPill();
await waitStep(4);
await page.waitForURL(/\/collaborations\/502/, { timeout: 15000 });
await page.waitForTimeout(1000);
await log('A step4 (cascade)');
await pressPill();
await waitStep(5);
await page.waitForTimeout(800);
await log('A step5');
await pressPill();
await waitStep(6);
await page.waitForTimeout(800);
await log('A step6');
await pressPill();
await waitStep(7);
await page.waitForTimeout(1200);
await log('A step7 (by the book)');
await page.click('[data-testid="guide-next"]').catch(() => {});
await waitDone();
await page.waitForTimeout(800);
await log('A recap');
await shot('A8-recap');
console.log('errors', JSON.stringify(errors.slice(0, 6)));
await browser.close();
