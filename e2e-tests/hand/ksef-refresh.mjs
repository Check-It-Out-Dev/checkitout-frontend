// Reload mid-tour at company-confirmed: does the guide hand back a Next, and does it rebuild the state?
import { chromium } from '@playwright/test';
const BASE = 'https://localhost:4201';
const browser = await chromium.launch();
const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const beat = () => page.evaluate(() => ({ url: location.pathname, step: JSON.parse(sessionStorage.getItem('demoSandbox') ?? '{}').step, pill: !!document.querySelector('[data-testid="guide-spot-next"]'), next: !!document.querySelector('[data-testid="guide-next"]'), pointer: !!document.querySelector('[data-testid="guide-pointer"]'), confirm: !!document.querySelector('[data-testid="company-setup-confirm"]'), done: !!document.querySelector('[data-testid="company-setup-done"]') }));
await page.goto(`${BASE}/demo`, { waitUntil: 'networkidle' });
await page.evaluate(() => { localStorage.setItem('demoSession', '0'); localStorage.setItem('demoRole', 'ADMIN'); sessionStorage.clear(); });
await page.reload({ waitUntil: 'networkidle' });
await page.locator(`xpath=//*[self::h2 or self::h3][contains(normalize-space(.), "Od NIP-u do KSeF")]/ancestor::*[.//button][1]//button`).first().click();
await page.waitForURL(/\/company\/setup/, { timeout: 20000 });
await page.waitForSelector('[data-testid="guide-spot-next"]', { timeout: 15000 }); await page.waitForTimeout(700);
await page.click('[data-testid="guide-spot-next"]');
await page.waitForFunction(() => JSON.parse(sessionStorage.getItem('demoSandbox') ?? '{}').step === 1, null, { timeout: 15000 });
await page.waitForTimeout(500); console.log('before reload', JSON.stringify(await beat()));
await page.reload({ waitUntil: 'networkidle' });
for (const ms of [500, 1500, 2500]) { await page.waitForTimeout(ms === 500 ? 500 : 1000); console.log(`after reload +${ms}`, JSON.stringify(await beat())); }
const next = await page.$('[data-testid="guide-next"]');
if (next) { await next.click(); await page.waitForTimeout(2500); console.log('after Next', JSON.stringify(await beat())); }
await page.screenshot({ path: 'qa-shots/ksef/10-after-refresh.png' });
await browser.close();
