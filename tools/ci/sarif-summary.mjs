#!/usr/bin/env node
/**
 * Count what the security scanners found, from their own SARIF, and say it in one table.
 *
 * The security tier uploads its SARIF to code scanning, where the findings are browsable but the
 * SHAPE of the run is not: how many tools ran, which produced nothing, whether the count moved since
 * last night. This writes that shape as a small JSON the dashboard trends, the same way
 * lighthouse-summary.mjs does for Lighthouse.
 *
 * A tool that ran and found nothing is recorded at zero rather than omitted. That distinction is the
 * whole point: a scanner that silently stops running looks exactly like a clean repository unless
 * somebody counts the scans.
 *
 *   node tools/ci/sarif-summary.mjs "*.sarif" [more globs] --json security.json
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

const argv = process.argv.slice(2);
const jsonAt = argv.indexOf('--json');
const outPath = jsonAt >= 0 ? argv[jsonAt + 1] : 'security.json';
const patterns = argv.filter((a, i) => !a.startsWith('--') && (jsonAt < 0 || i !== jsonAt + 1));

/** Same shallow glob the metrics collector uses: a directory plus a `*` name pattern. */
function glob(pattern) {
  if (!pattern.includes('*')) return existsSync(pattern) ? [pattern] : [];
  const dir = dirname(pattern) || '.';
  if (!existsSync(dir)) return [];
  const re = new RegExp(
    '^' + basename(pattern).replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$'
  );
  return readdirSync(dir).filter((f) => re.test(f)).map((f) => join(dir, f));
}

const files = patterns.flatMap(glob);
const byLevel = { error: 0, warning: 0, note: 0 };
const tools = {};
const unreadable = [];

for (const f of files) {
  let d;
  try {
    d = JSON.parse(readFileSync(f, 'utf8'));
  } catch {
    unreadable.push(f);
    continue;
  }
  for (const run of d.runs || []) {
    const tool = run.tool?.driver?.name || basename(f);
    tools[tool] ??= 0;
    for (const r of run.results || []) {
      const lvl = String(r.level || 'warning').toLowerCase();
      if (lvl in byLevel) byLevel[lvl]++;
      tools[tool]++;
    }
  }
}

const summary = {
  total: byLevel.error + byLevel.warning + byLevel.note,
  ...byLevel,
  tools,
  scans: files.length,
  ...(unreadable.length ? { unreadable } : {}),
};

const lines = ['### Security findings', ''];
if (!files.length) {
  // No SARIF is not a clean run. It is a tier that produced nothing, and it says so.
  lines.push('_No SARIF was found. That is reported as silence rather than as a clean scan._');
} else {
  lines.push(
    `**${summary.total} finding${summary.total === 1 ? '' : 's'}** across ${files.length} ` +
      `scan${files.length === 1 ? '' : 's'} — ${byLevel.error} error, ${byLevel.warning} warning, ` +
      `${byLevel.note} note.`
  );
  lines.push('');
  lines.push('| tool | findings |');
  lines.push('| --- | ---: |');
  for (const [tool, n] of Object.entries(tools).sort((a, b) => b[1] - a[1])) {
    lines.push(`| ${tool} | ${n === 0 ? '0 — ran, found nothing' : n} |`);
  }
}
if (unreadable.length) {
  lines.push('');
  lines.push(`_${unreadable.length} file(s) were not readable SARIF and were skipped: ${unreadable.join(', ')}._`);
}
lines.push('');

console.log(lines.join('\n'));
writeFileSync(outPath, JSON.stringify(summary, null, 1));
