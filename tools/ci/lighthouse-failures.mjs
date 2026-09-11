#!/usr/bin/env node
/**
 * Which Lighthouse audits failed, and on which elements.
 *
 * `lighthouse-summary.mjs` answers "what were the four scores"; this answers the question you have
 * when one of them is red. The action prints a single line per failed assertion -- "`color-contrast`
 * failure for `minScore` assertion. Expected >= 1, but found 0" -- and then exits, which on the
 * night of 09-11 meant the artifact held a server log and no audit at all. The report names
 * forty-two elements, their selectors, their two colours and the ratio; that is the difference
 * between a fix and a guess.
 *
 * Reads the filesystem-target reports rather than .lighthouseci, because the manifest is what says
 * which report belongs to which URL.
 *
 *   node tools/ci/lighthouse-failures.mjs <lhci-report dir> [--max 12]
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const argv = process.argv.slice(2);
const dir = argv.find((a) => !a.startsWith('--')) || 'lhci-report';
const maxItems = Number((argv.includes('--max') && argv[argv.indexOf('--max') + 1]) || 12);

if (!existsSync(dir)) {
  console.log(`_No Lighthouse reports at \`${dir}\`, so there is nothing to explain._`);
  process.exit(0);
}

const manifestPath = join(dir, 'manifest.json');
const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : [];
// One report per (url, run); the representative run is the one the assertions are reported against.
const reports = manifest.length
  ? manifest.filter((e) => e.isRepresentativeRun !== false)
  : readdirSync(dir)
      .filter((f) => f.endsWith('.json') && f !== 'manifest.json')
      .map((f) => ({ jsonPath: join(dir, f), url: f }));

const out = [];
let failures = 0;

for (const entry of reports) {
  const path = entry.jsonPath && existsSync(entry.jsonPath) ? entry.jsonPath : join(dir, entry.url);
  if (!existsSync(path)) continue;
  let lhr;
  try {
    lhr = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    continue;
  }
  const url = lhr.finalDisplayedUrl || lhr.requestedUrl || entry.url;

  // score === 0 with details is a failed audit; score === null means "not applicable".
  const failed = Object.values(lhr.audits || {}).filter(
    (a) => a && a.score === 0 && a.scoreDisplayMode !== 'informative' && (a.details?.items || []).length
  );
  if (!failed.length) continue;
  failures += failed.length;

  out.push(`#### ${url}`);
  out.push('');
  for (const audit of failed) {
    const items = audit.details.items;
    out.push(`**${audit.id}** — ${audit.title} (${items.length} element${items.length === 1 ? '' : 's'})`);
    out.push('');
    out.push('| element | why |');
    out.push('| --- | --- |');
    for (const item of items.slice(0, maxItems)) {
      const node = item.node || {};
      const selector = (node.selector || node.snippet || '(no selector)').slice(0, 90);
      // The explanation is multi-line and starts with "Fix any of the following:"; the line that
      // carries the numbers is the one worth putting in a table cell.
      const why = String(node.explanation || item.subItems?.items?.[0]?.relatedNode?.snippet || '')
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith('Fix any of the following'))
        .join(' ')
        .slice(0, 200);
      out.push(`| \`${selector}\` | ${why || '—'} |`);
    }
    if (items.length > maxItems) {
      out.push(`| … | ${items.length - maxItems} more, in the lighthouse artifact |`);
    }
    out.push('');
  }
}

console.log(
  failures
    ? ['### What Lighthouse objected to', '', ...out].join('\n')
    : '_Every Lighthouse audit passed; nothing to explain._'
);
