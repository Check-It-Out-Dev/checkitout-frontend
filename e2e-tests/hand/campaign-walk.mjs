// Walk the company-campaign tour on the demo dev server and photograph each beat.
// usage: node e2e-tests/campaign-walk.mjs [baseUrl] [shotDir]
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const BASE = process.argv[2] ?? 'https://localhost:4201';
const DIR = process.argv[3] ?? 'qa-shots/campaign';
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
      panel: !!document.querySelector('[data-testid="guide-next"]'),
    };
  });
const shot = (name) => page.screenshot({ path: `${DIR}/${name}.png`, fullPage: false });
const waitStep = async (n, ms = 25000) => {
  await page.waitForFunction(
    (n) => JSON.parse(sessionStorage.getItem('demoSandbox') ?? '{}').step === n,
    n,
    { timeout: ms },
  );
};
const pressPill = async () => {
  await page.waitForSelector('[data-testid="guide-spot-next"]', { timeout: 15000 });
  await page.waitForTimeout(600);
  await page.click('[data-testid="guide-spot-next"]');
};
const scrollTop = () =>
  page.evaluate(() =>
    [
      document.querySelector('main')?.scrollTop ?? -1,
      document.querySelector('mat-sidenav-content')?.scrollTop ?? -1,
      document.scrollingElement.scrollTop,
    ].join('/'),
  );

await page.goto(`${BASE}/demo`, { waitUntil: 'networkidle' });
await page.evaluate(() => {
  localStorage.setItem('demoSession', '0');
  localStorage.setItem('demoRole', 'ADMIN');
  sessionStorage.removeItem('demoSandbox');
});
await page.reload({ waitUntil: 'networkidle' });
await page
  .locator(
    `xpath=//*[self::h2 or self::h3][contains(normalize-space(.), "Poprowadź kampanię")]/ancestor::*[.//button][1]//button`,
  )
  .first()
  .click();
await page.waitForURL(/\/collaborations\/create/, { timeout: 20000 });
await page.waitForSelector('[data-testid="guide-spot-next"]', { timeout: 20000 });
console.log('step0', JSON.stringify(await beat()));
await shot('01-create-step0');

// step 0 → 1: top of the form
await pressPill();
await waitStep(1);
await page.waitForTimeout(800);
console.log('step1', JSON.stringify(await beat()), 'scroll', await scrollTop());
const top = await page.evaluate(() => ({
  name: document.querySelector('[data-testid="opp-form-name"]').value,
  title: document.querySelector('[data-testid="opp-form-title-input"]').value,
  city: document.querySelector('[data-testid="opp-form-city"]').value,
}));
console.log('top fields', JSON.stringify(top));
await shot('02-top-filled');

// glide: sample the scroll position over time after the spotlight moves
const samples = [];
for (let i = 0; i < 8; i++) {
  samples.push(await scrollTop());
  await page.waitForTimeout(150);
}
console.log('scroll samples after step change', samples.join(' '));

// step 1 → 2: the rest of the brief incl. photos — sample the scroller while it performs
await pressPill();
const glide = [];
for (let i = 0; i < 20; i++) {
  glide.push(await scrollTop());
  await page.waitForTimeout(150);
}
console.log('scroll while performing step 1', glide.join(' '));
await waitStep(2, 40000);
await page.waitForTimeout(1500);
const rest = await page.evaluate(() => ({
  details: document.querySelector('[data-testid="opp-form-details"]').value.slice(0, 30),
  amountMin: document.querySelector('[data-testid="opp-form-amount-min"]').value,
  currency: document.querySelector('[data-testid="opp-form-currency"]')?.textContent.trim(),
  platforms: document.querySelector('[data-testid="opp-form-platforms"]')?.textContent.trim(),
  contentTypes: document
    .querySelector('[data-testid="opp-form-content-types"]')
    ?.textContent.trim(),
  serviceType: document.querySelector('[data-testid="opp-form-service-type"]')?.textContent.trim(),
  start: document.querySelector('[data-testid="opp-form-start-date"]').value,
  end: document.querySelector('[data-testid="opp-form-end-date"]').value,
  photos: [...document.querySelectorAll('[data-testid^="opp-form-photo-"]')]
    .filter((e) => e.tagName === 'IMG')
    .map((i) => i.getAttribute('src')),
  comp: document.querySelector('[data-testid="opp-form-comp-type"] input:checked')?.value,
  submitDisabled: document.querySelector('[data-testid="opp-form-submit"]').disabled,
  overlayOpen: !!document.querySelector('.cdk-overlay-pane'),
}));
console.log('step2', JSON.stringify(await beat()), 'scroll', await scrollTop());
console.log('rest', JSON.stringify(rest));
await shot('03-brief-complete');

// step 2 → 3: publish
await pressPill();
await waitStep(3);
await page.waitForURL(/\/collaborations\/\d+$/, { timeout: 15000 });
await page.waitForSelector('[data-testid="opportunity-detail-manage"]', { timeout: 15000 });
await page.waitForTimeout(1200);
const detail = await page.evaluate(() => ({
  title: document.querySelector('[data-testid="opportunity-detail-title"]')?.textContent.trim(),
  manage: !!document.querySelector('[data-testid="opportunity-detail-manage"]'),
  imgs: document.querySelectorAll('[data-testid="opportunity-detail-card"] img').length,
}));
console.log('step3', JSON.stringify(await beat()), JSON.stringify(detail));
await shot('04-published');

// step 3 → 4: manage applications → inbox
await pressPill();
await waitStep(4);
await page.waitForURL(/\/collaborations\/applicants$/, { timeout: 15000 });
await page.waitForSelector('[data-testid="applicants-list"]', { timeout: 15000 });
await page.waitForTimeout(1000);
const inbox = await page.evaluate(() =>
  [...document.querySelectorAll('[data-testid="applicants-list"] > li')].map((li) => ({
    id: li.dataset.testid,
    name: li.querySelector('[data-testid^="applicant-name-"]')?.textContent.trim(),
    status: li.querySelector('[data-testid^="applicant-status-"]')?.textContent.trim(),
    campaign: li
      .querySelector('[data-testid^="applicant-campaign-"]:not([data-testid*="stage"])')
      ?.textContent.trim(),
    stage: li.querySelector('[data-testid^="applicant-campaign-stage-"]')?.textContent.trim(),
    avatar: li.querySelector('[data-testid="avatar"]')?.textContent.trim(),
    avatarBg: getComputedStyle(li.querySelector('[data-testid="avatar"]')).backgroundColor,
    accept: !!li.querySelector('[data-testid^="applicant-accept-"]'),
    from: li.querySelector('figcaption')?.textContent.trim(),
  })),
);
console.log('step4', JSON.stringify(await beat()));
console.log('inbox', JSON.stringify(inbox));
await shot('05-inbox');

// step 4 → 5: accept Ola → in progress
await pressPill();
await waitStep(5);
await page.waitForURL(/\/collaborations\/in-progress/, { timeout: 15000 });
await page.waitForSelector('[data-testid="collaboration-dashboard-campaign"]', { timeout: 15000 });
await page.waitForTimeout(1200);
const groups = await page.evaluate(() =>
  [...document.querySelectorAll('[data-testid="collaboration-dashboard-campaign"]')].map((c) => ({
    title: c
      .querySelector('[data-testid="collaboration-dashboard-campaign-title"]')
      ?.textContent.trim(),
    stage: c
      .querySelector('[data-testid="collaboration-dashboard-campaign-stage"]')
      ?.textContent.trim(),
    rows: [...c.querySelectorAll('[data-testid="collaboration-dashboard-row"]')].map(
      (r) =>
        `${r.querySelector('[data-testid="collaboration-dashboard-counterparty"]')?.textContent.trim()} — ${r.querySelector('[data-testid="collaboration-dashboard-status"]')?.textContent.trim()}`,
    ),
  })),
);
console.log('step5', JSON.stringify(await beat()));
console.log('groups', JSON.stringify(groups));
await shot('06-in-progress');

// recap
await page.click('[data-testid="guide-next"]').catch(() => {});
await page.waitForTimeout(1200);
console.log('end', JSON.stringify(await beat()));
await shot('07-recap');
console.log('errors', JSON.stringify(errors.slice(0, 6)));
await browser.close();
