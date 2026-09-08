// Frame gaps of the graph map on the dev server, idle and under a real pointer sweep,
// at a big sharp display. usage: node e2e-tests/hand/map-frames.mjs [baseUrl] [dpr]
import { chromium } from '@playwright/test';

const BASE = process.argv[2] ?? 'https://localhost:4201';
const DPR = Number(process.argv[3] ?? 1.5);
// HEADED=1 runs the real Chrome with the GPU — the owner's rendering path, not SwiftShader
const browser = await chromium.launch(
  process.env['HEADED'] ? { headless: false, channel: 'chrome' } : {},
);
const ctx = await browser.newContext({
  ignoreHTTPSErrors: true,
  viewport: { width: 1920, height: 1080 },
  deviceScaleFactor: DPR,
});
const page = await ctx.newPage();
await page.goto(`${BASE}/technical-survey/engineering`, { waitUntil: 'networkidle' });
const map = page.locator('[data-testid="graphtopo-map"]');
await map.scrollIntoViewIfNeeded();
await page.waitForTimeout(500);
const box = await map.locator('svg').first().boundingBox();

const arm = () =>
  page.evaluate(() => {
    const w = window;
    w.__frames = [];
    w.__long = [];
    w.__muts = 0;
    let last = performance.now();
    const tick = () => {
      const now = performance.now();
      w.__frames.push(now - last);
      last = now;
      w.__raf = requestAnimationFrame(tick);
    };
    w.__raf = requestAnimationFrame(tick);
    try {
      new PerformanceObserver((l) =>
        l.getEntries().forEach((e) => w.__long.push(Math.round(e.duration))),
      ).observe({ type: 'longtask' });
    } catch {}
    const base = document.querySelector('[data-testid="graphtopo-svg"]');
    w.__mo = new MutationObserver((ms) => (w.__muts += ms.length));
    if (base) w.__mo.observe(base, { attributes: true, subtree: true, childList: true });
  });
const read = (label) =>
  page.evaluate((label) => {
    const w = window;
    cancelAnimationFrame(w.__raf);
    w.__mo?.disconnect();
    const f = w.__frames.slice(3);
    const sorted = [...f].sort((a, b) => a - b);
    const pct = (p) => Math.round(sorted[Math.floor((sorted.length - 1) * p)]);
    return `${label}: ${f.length} frames, mean ${(f.reduce((a, b) => a + b, 0) / f.length).toFixed(1)} ms, p95 ${pct(0.95)} ms, worst ${Math.round(Math.max(...f))} ms, >33ms: ${f.filter((x) => x > 33).length}, >50ms: ${f.filter((x) => x > 50).length}, long tasks ${JSON.stringify(w.__long)}, base-svg mutations ${w.__muts}`;
  }, label);

// idle: pointer parked off the map
await page.mouse.move(5, 5);
await arm();
await page.waitForTimeout(2000);
console.log(await read('idle 2s'));

// sweep: a real pointer path around the leaf ring and across the arcs, 4 px steps
await arm();
const cx = box.x + box.width / 2;
const cy = box.y + box.height / 2;
const scale = box.width / 760;
const t0 = Date.now();
for (const r of [231, 143]) {
  for (let deg = 0; deg < 360; deg += 1.2) {
    const a = ((deg - 90) * Math.PI) / 180;
    await page.mouse.move(cx + r * scale * Math.cos(a), cy + r * scale * Math.sin(a));
  }
}
await page.waitForTimeout(400);
console.log(await read(`sweep (${Date.now() - t0} ms of pointer travel)`));
console.log('svg px', JSON.stringify([Math.round(box.width), Math.round(box.height)]), 'dpr', DPR);
await browser.close();
