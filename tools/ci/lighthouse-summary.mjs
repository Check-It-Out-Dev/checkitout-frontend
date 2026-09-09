#!/usr/bin/env node
// Lighthouse CI wrote its runs to a directory (upload target "filesystem"); its manifest.json lists one
// entry per run with the median flagged. This prints a Markdown table of the median scores per page and
// writes a small JSON the quality metrics can read (METRICS.md: lighthouse.{performance,accessibility,
// bestPractices,seo} of the first page, plus every page for the report).
//
//   node tools/ci/lighthouse-summary.mjs lhci-report [--json out.json]
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const dir = args.find((a) => !a.startsWith('--')) || 'lhci-report';
const jsonOut = args.includes('--json') ? args[args.indexOf('--json') + 1] : null;
const manifestPath = join(dir, 'manifest.json');
if (!existsSync(manifestPath)) {
  console.log(`No Lighthouse manifest at ${manifestPath}.`);
  process.exit(1);
}
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const medians = manifest.filter((m) => m.isRepresentativeRun);
const pct = (x) => Math.round((x || 0) * 100);
const rows = medians.map((m) => ({
  url: new URL(m.url).pathname,
  performance: pct(m.summary.performance),
  accessibility: pct(m.summary.accessibility),
  bestPractices: pct(m.summary['best-practices']),
  seo: pct(m.summary.seo),
  html: m.htmlPath ? m.htmlPath.split(/[\\/]/).pop() : null,
}));
const lines = ['### Lighthouse (desktop, median of three runs)', '', '| page | performance | accessibility | best practices | seo |', '| --- | --- | --- | --- | --- |'];
for (const r of rows) lines.push(`| ${r.url} | ${r.performance} | ${r.accessibility} | ${r.bestPractices} | ${r.seo} |`);
console.log(lines.join('\n'));
if (jsonOut) {
  const first = rows[0] || {};
  writeFileSync(jsonOut, JSON.stringify({ url: first.url, performance: first.performance, accessibility: first.accessibility, bestPractices: first.bestPractices, seo: first.seo, pages: rows }, null, 2));
}
