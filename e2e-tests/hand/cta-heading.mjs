// Why is the CTA strip's heading off-centre on a wide (zoomed-out) screen?
// usage: node e2e-tests/hand/cta-heading.mjs [baseUrl] [width]
import { chromium } from '@playwright/test';

const BASE = process.argv[2] ?? 'https://localhost:4201';
const W = Number(process.argv[3] ?? 2880);
const browser = await chromium.launch();
const ctx = await browser.newContext({
  ignoreHTTPSErrors: true,
  viewport: { width: W, height: 1300 },
});
const page = await ctx.newPage();
await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
const geo = await page.evaluate(() => {
  const sec = document.querySelector('[data-testid="landing-cta-strip"]');
  const h2 = sec?.querySelector('h2');
  const p = h2?.nextElementSibling;
  const r = (el) => {
    const b = el.getBoundingClientRect();
    return [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)];
  };
  const cs = (el) => {
    const c = getComputedStyle(el);
    return {
      display: c.display,
      ml: c.marginLeft,
      mr: c.marginRight,
      ta: c.textAlign,
      maxW: c.maxWidth,
      w: c.width,
    };
  };
  const chain = [];
  let el = h2;
  while (el && el !== document.body) {
    chain.push(
      `${el.tagName.toLowerCase()}${el.dataset?.testid ? '#' + el.dataset.testid : ''} ${JSON.stringify(r(el))} ${getComputedStyle(el).display}/${getComputedStyle(el).textAlign}`,
    );
    el = el.parentElement;
  }
  return {
    viewport: innerWidth,
    section: r(sec),
    h2: r(h2),
    h2cs: cs(h2),
    p: r(p),
    pcs: cs(p),
    chain,
  };
});
console.log(JSON.stringify(geo, null, 1));
await page.screenshot({
  path: 'qa-shots/cta-heading.png',
  clip: { x: 0, y: geo.section[1], width: W, height: 300 },
});
await browser.close();
