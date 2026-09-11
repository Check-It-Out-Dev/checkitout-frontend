#!/usr/bin/env node
/**
 * The container that rasterises the visual baselines must be the version the repository installs.
 *
 * `docs/ci/ADR-visual-baselines.md` says the baselines have exactly one rasteriser: the pinned
 * Playwright image. What it did not say is that the image tag and the `@playwright/test`
 * devDependency are the SAME pin written twice, in two files, that nothing compared.
 *
 * On 2026-09-11 Dependabot moved the dependency 1.59.1 -> 1.63.0 and the workflow kept
 * `mcr.microsoft.com/playwright:v1.59.1-noble`. `npm ci` inside the old image installed the new
 * client, which does not drive the browser build the image ships, and the night's visual tier
 * reported **338 unexpected** out of 584 -- every snapshot in the suite. The pull request had been
 * green, because the fast tier skips the visual job and the visual job is `continue-on-error`, so
 * only the merged verdict twelve hours later noticed.
 *
 * Two seconds, in the gate wall, so the next bump fails the pull request that makes it.
 *
 *   node tools/ci/check-playwright-image-pin.mjs
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const WORKFLOWS = '.github/workflows';
const IMAGE = /mcr\.microsoft\.com\/playwright:v([0-9]+\.[0-9]+\.[0-9]+)(-\w+)?/g;

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const declared = (pkg.devDependencies?.['@playwright/test'] ?? pkg.dependencies?.['@playwright/test'] ?? '')
  .replace(/^[\^~]/, '');

if (!declared) {
  console.error('check:playwright-image-pin FAILED — package.json declares no @playwright/test');
  process.exit(1);
}

const problems = [];
let found = 0;

for (const file of readdirSync(WORKFLOWS).filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'))) {
  const path = join(WORKFLOWS, file);
  const text = readFileSync(path, 'utf8');
  for (const match of text.matchAll(IMAGE)) {
    found++;
    if (match[1] !== declared) {
      const line = text.slice(0, match.index).split('\n').length;
      problems.push(
        `${path}:${line} pins the image at v${match[1]}, but package.json installs ${declared}. ` +
          `They are one pin written twice: a client that does not match the browsers the image ships ` +
          `rasterises differently, and every visual baseline fails.`
      );
    }
  }
}

if (!found) {
  console.error(
    'check:playwright-image-pin FAILED — no workflow pins mcr.microsoft.com/playwright. ' +
      'The visual tier must run in the pinned image (docs/ci/ADR-visual-baselines.md); if that has ' +
      'genuinely changed, this check needs to change with it.'
  );
  process.exit(1);
}

if (problems.length) {
  console.error('check:playwright-image-pin FAILED\n  ' + problems.join('\n  '));
  console.error(
    `\nFix: set the image to v${declared} AND regenerate the baselines inside it ` +
      '(docs/ci/ADR-visual-baselines.md). Changing only the tag swaps the rasteriser under ' +
      'baselines that were made by the old one.'
  );
  process.exit(1);
}

console.log(
  `check:playwright-image-pin OK — ${found} workflow pin(s) at v${declared}, the version package.json installs.`
);
