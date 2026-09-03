#!/usr/bin/env node
/**
 * AI-driven visual-parity loop — capture legacy vs greenfield screenshots
 * for a given route, write a findings stub for Claude to fill in.
 *
 * Usage:
 *   node tools/ai-parity-loop.mjs <slug> <path> [--viewport=1440x900] [--auth=<actor>]
 *
 * Examples:
 *   node tools/ai-parity-loop.mjs landing /
 *   node tools/ai-parity-loop.mjs auth-sign-in /auth/sign-in
 *   node tools/ai-parity-loop.mjs profile-account /user/settings/account --auth=influencer1
 *
 * Output:
 *   docs/parity-review/<YYYY-MM-DD>/<slug>-legacy.png
 *   docs/parity-review/<YYYY-MM-DD>/<slug>-greenfield.png
 *   docs/parity-review/<YYYY-MM-DD>/<slug>.md
 */

import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { argv } from 'node:process';

const args = argv.slice(2);
const slug = args[0];
const path = args[1];
if (!slug || !path) {
  console.error('usage: node tools/ai-parity-loop.mjs <slug> <path> [--viewport=WxH] [--auth=<actor>]');
  process.exit(2);
}
const viewportArg = (args.find((a) => a.startsWith('--viewport=')) || '--viewport=1440x900').slice(11);
const [w, h] = viewportArg.split('x').map(Number);
const actor = (args.find((a) => a.startsWith('--auth=')) || '').slice(7);

const today = new Date().toISOString().slice(0, 10);
const outDir = join('docs', 'parity-review', today);
mkdirSync(outDir, { recursive: true });

const LEGACY = process.env.LEGACY_URL || 'https://localhost:4200';
const GREENFIELD = process.env.GREENFIELD_URL || 'https://localhost:4201';
const BE = process.env.BE_URL || 'https://localhost:8080';

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: w, height: h } });

async function maybeLogin(page) {
  if (!actor) return;
  const res = await page.request.post(`${BE}/api/test/auth/mock-session`, {
    data: { email: `${actor}@e2e.test`, role: actor.startsWith('company') ? 'COMPANY' : actor.startsWith('influencer') ? 'INFLUENCER' : 'ADMIN', partial: false },
    ignoreHTTPSErrors: true,
  });
  if (!res.ok()) throw new Error(`mock-session failed: ${res.status()}`);
}

async function capture(label, baseUrl) {
  const page = await context.newPage();
  const errs = [];
  const net = [];
  page.on('pageerror', (e) => errs.push(`pageerror: ${e.message.slice(0, 200)}`));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(`console.error: ${m.text().slice(0, 200)}`); });
  page.on('response', (r) => { if (r.status() >= 400) net.push(`HTTP ${r.status()}: ${r.request().method()} ${r.url()}`); });

  await maybeLogin(page);
  const resp = await page.goto(baseUrl + path, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(800);
  const file = join(outDir, `${slug}-${label}.png`);
  await page.screenshot({ path: file, fullPage: true });
  const meta = { httpStatus: resp?.status() ?? 0, errs, net, finalUrl: page.url() };
  await page.close();
  return { file, meta };
}

console.log(`Capturing ${slug} (${path}) at ${w}x${h}${actor ? ` as ${actor}` : ''}...`);
const legacy = await capture('legacy', LEGACY);
const greenfield = await capture('greenfield', GREENFIELD);
await browser.close();

const md = `# Parity review — \`${slug}\` (\`${path}\`)

**Date:** ${today}
**Viewport:** ${w}×${h}
**Actor:** ${actor || 'anonymous'}
**Status:** ☐ PENDING (AI review)

## Capture results

| App | HTTP | Final URL | console.errors | HTTP 4xx-5xx |
|---|---|---|---|---|
| Legacy | ${legacy.meta.httpStatus} | \`${legacy.meta.finalUrl}\` | ${legacy.meta.errs.length} | ${legacy.meta.net.length} |
| Greenfield | ${greenfield.meta.httpStatus} | \`${greenfield.meta.finalUrl}\` | ${greenfield.meta.errs.length} | ${greenfield.meta.net.length} |

${legacy.meta.errs.length ? `### Legacy console errors\n\n${legacy.meta.errs.map((e) => `- ${e}`).join('\n')}\n` : ''}
${greenfield.meta.errs.length ? `### Greenfield console errors\n\n${greenfield.meta.errs.map((e) => `- ${e}`).join('\n')}\n` : ''}
${legacy.meta.net.length ? `### Legacy 4xx/5xx\n\n${legacy.meta.net.map((n) => `- ${n}`).join('\n')}\n` : ''}
${greenfield.meta.net.length ? `### Greenfield 4xx/5xx\n\n${greenfield.meta.net.map((n) => `- ${n}`).join('\n')}\n` : ''}

## Screenshots

### Legacy

![legacy](./${slug}-legacy.png)

### Greenfield

![greenfield](./${slug}-greenfield.png)

## AI semantic diff (Claude to fill in)

### 1. Header / toolbar
- _present / absent / partial in greenfield?_

### 2. Hero section
- _hero structure / imagery / copy_

### 3. Typography
- _font family / weight / size / line-height parity_

### 4. Colors / theme
- _primary / secondary / gradient parity_

### 5. Buttons / CTAs
- _shape / size / color / hover state_

### 6. Cards / containers
- _border / shadow / spacing_

### 7. Navigation / menu
- _items / order / labels_

### 8. Language switcher
- _present / location / interaction_

### 9. Cookie banner / consent
- _rendered on first visit?_

### 10. Footer
- _present / content parity_

### 11. Interactions (sign-in, sign-up, primary CTA)
- _reachable from this view?_

### 12. Responsive / mobile considerations
- _captured here at desktop; flag mobile-only checks needed_

### 13. i18n
- _EN / PL text parity at this viewport_

### 14. a11y
- _aria-labels / heading hierarchy / focus order_

## Findings (severity: critical / major / minor / waive)

- _Fill in after AI review_

## Resolution

- _Commit SHA(s) that close each finding_
- _Re-run \`node tools/ai-parity-loop.mjs ${slug} ${path}\` after fix; this file gets re-stamped_
`;

const mdFile = join(outDir, `${slug}.md`);
if (existsSync(mdFile)) {
  console.log(`Skip writing ${mdFile} (already exists — won't clobber findings; delete it manually to regenerate stub)`);
} else {
  writeFileSync(mdFile, md);
  console.log(`Wrote ${mdFile}`);
}
console.log(`  - ${legacy.file}`);
console.log(`  - ${greenfield.file}`);
