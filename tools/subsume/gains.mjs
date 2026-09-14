#!/usr/bin/env node
/**
 * The gains diagram: before → after of a governance round, what went down beside what stayed
 * flat, drawn from governance-ledger.json only (plan §16 step 3, §15). Mermaid, one row per
 * measure, left the base, right this pull request; the edge says the change. Numbers come from
 * the ledger and nowhere else.
 *
 *   node tools/subsume/gains.mjs --ledger reports/subsume/governance-ledger.json --out reports/subsume
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, sep } from 'node:path';

const n = (x) => (x == null ? '—' : Number(x).toLocaleString('en-US'));

export function gains(l) {
  const rows = [
    [
      'Tests in the tier',
      n(l.before.tests),
      n(l.after.tests),
      l.gains.tests != null
        ? l.gains.tests >= 0
          ? `−${n(l.gains.tests)}`
          : `+${n(-l.gains.tests)}`
        : '—',
      'down',
    ],
    [
      'Tier seconds',
      `${n(l.before.seconds)} s`,
      `${n(l.after.seconds)} s`,
      l.gains.secondsPct != null ? `${l.gains.secondsPct} %` : '—',
      'down',
    ],
    [
      'Coverage on unchanged code',
      l.probes ? `${n(l.probes.checked?.methods)} methods` : '—',
      l.kept.coverageUnchangedCode ? 'unchanged' : `${n(l.probes?.regressions)} lower`,
      l.kept.coverageUnchangedCode ? '=' : 'LOWER',
      'flat',
    ],
    [
      'Kills on unchanged code',
      l.mutation ? `${n(l.mutation.killedBefore)} killed` : '—',
      l.mutation ? `${n(l.mutation.killedAfter)} killed` : '—',
      l.mutation ? (l.mutation.lost.length ? `${n(l.mutation.lost.length)} LOST` : '=') : '—',
      'flat',
    ],
    [
      'Mutation score',
      l.mutation ? `${l.mutation.scoreBefore} %` : '—',
      l.mutation ? `${l.mutation.scoreAfter} %` : '—',
      l.mutation ? (l.mutation.scoreAfter >= l.mutation.scoreBefore ? '=' : 'LOWER') : '—',
      'flat',
    ],
  ];
  const lines = ['```mermaid', 'flowchart LR'];
  lines.push(`  subgraph before["Before · ${esc(l.baseCommit ?? 'base')}"]`, '    direction TB');
  rows.forEach(([label, b], i) => lines.push(`    b${i}["${esc(label)}<br/>${esc(b)}"]`));
  lines.push('  end', `  subgraph after["After · round ${l.round}"]`, '    direction TB');
  rows.forEach(([, , a], i) =>
    lines.push(`    a${i}["${esc(a)}"]${rows[i][4] === 'down' ? ':::gain' : ':::kept'}`),
  );
  lines.push('  end');
  rows.forEach(([, , , edge], i) => lines.push(`  b${i} -- "${esc(edge)}" --> a${i}`));
  lines.push(
    '  classDef gain stroke-width:2px',
    '  classDef kept stroke-dasharray: 2 2',
    '```',
    '',
    `Verdict: **${l.verdict}**${l.incomplete?.length ? ` — missing: ${l.incomplete.join(', ')}` : ''}.`,
    '',
  );
  return lines.join('\n');
}

function esc(s) {
  return String(s)
    .replace(/"/g, '#quot;')
    .replace(/#(?!quot;|35;)/g, '#35;')
    .replace(/[<>]/g, (c) => (c === '<' ? '#lt;' : '#gt;'))
    .replace(/#lt;br\/#gt;/g, '<br/>');
}

const isMain = Boolean(process.argv[1]) && /gains\.mjs$/.test(process.argv[1].split(sep).join('/'));
if (isMain) {
  const arg = (name, dflt) => {
    const i = process.argv.indexOf(`--${name}`);
    return i > 0 ? process.argv[i + 1] : dflt;
  };
  const l = JSON.parse(
    readFileSync(arg('ledger', 'reports/subsume/governance-ledger.json'), 'utf8'),
  );
  const out = arg('out', 'reports/subsume');
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'gains.md'), gains(l));
  console.log(`gains: ${out}/gains.md`);
}
