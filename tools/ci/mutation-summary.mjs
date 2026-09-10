#!/usr/bin/env node
/**
 * What Stryker found, in a form somebody will act on.
 *
 * A mutation report is 486 mutants of JSON. The number at the top of it is the least useful part:
 * it moves by a point and nobody knows which test to write. What is useful is the list of mutants
 * that LIVED - each one a line the tests execute without ever checking, which is to say a line that
 * could be wrong tomorrow and every gate would still be green.
 *
 * Two scores, because they answer different questions and blurring them flatters the suite:
 *   - mutation score          killed / (killed + survived + no-coverage). What the tests are worth.
 *   - score on covered code   killed / (killed + survived). How good the tests that DO exist are.
 * A file with no spec drags the first down and leaves the second untouched; that gap is the
 * difference between "write a test" and "fix a test", and it is worth being able to see.
 *
 *   node tools/ci/mutation-summary.mjs [--report reports/mutation/mutation.json]
 *                                      [--json mutation-summary.json] [--break 70] [--top 25]
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};

const reportPath = flag('report', 'reports/mutation/mutation.json');
const outPath = flag('json', 'mutation-summary.json');
const top = Number(flag('top', '25'));
const breakAt = flag('break') === undefined ? null : Number(flag('break'));

// A missing report is not a passing report. Stryker crashing and Stryker finding nothing wrong
// look identical from the outside unless somebody says so out loud.
if (!existsSync(reportPath)) {
  const message =
    `### Mutation testing\n\n**No report at \`${reportPath}\`.** Stryker did not finish, so this ` +
    `tier has no verdict. That is reported as silence rather than as success.\n`;
  console.log(message);
  writeFileSync(outPath, JSON.stringify({ mutationScore: null, ran: false }, null, 1));
  process.exit(1);
}

const report = JSON.parse(readFileSync(reportPath, 'utf8'));

const counts = { Killed: 0, Survived: 0, NoCoverage: 0, Timeout: 0, CompileError: 0, RuntimeError: 0, Ignored: 0 };
/** @type {{file: string, line: number, mutator: string, replacement: string, status: string}[]} */
const alive = [];
const perFile = [];

for (const [file, entry] of Object.entries(report.files || {})) {
  const own = { file, killed: 0, survived: 0, noCoverage: 0 };
  for (const m of entry.mutants || []) {
    counts[m.status] = (counts[m.status] || 0) + 1;
    if (m.status === 'Killed' || m.status === 'Timeout') own.killed++;
    if (m.status === 'Survived') own.survived++;
    if (m.status === 'NoCoverage') own.noCoverage++;
    if (m.status === 'Survived' || m.status === 'NoCoverage') {
      alive.push({
        file,
        line: m.location?.start?.line ?? 0,
        mutator: m.mutatorName,
        replacement: (m.replacement || '').replace(/\s+/g, ' ').slice(0, 60),
        status: m.status,
      });
    }
  }
  if (own.killed + own.survived + own.noCoverage > 0) perFile.push(own);
}

const detected = counts.Killed + counts.Timeout;
const covered = detected + counts.Survived;
const total = covered + counts.NoCoverage;
const pct = (n, d) => (d === 0 ? null : Math.round((n / d) * 10000) / 100);

const mutationScore = pct(detected, total);
const coveredScore = pct(detected, covered);

const scoreOf = (f) => pct(f.killed, f.killed + f.survived + f.noCoverage) ?? 0;
perFile.sort((a, b) => scoreOf(a) - scoreOf(b));

const short = (f) => f.replace(/\\/g, '/').replace(/^.*?src\/app\//, '');

const lines = [];
lines.push('### Mutation testing');
lines.push('');
lines.push(
  `**Mutation score ${mutationScore}%** across ${total} mutants — ` +
    `${detected} caught, ${counts.Survived} survived, ${counts.NoCoverage} never executed by any test.`
);
lines.push('');
lines.push(`On covered code alone the score is **${coveredScore}%**.`);
lines.push('');

if (counts.CompileError || counts.RuntimeError) {
  lines.push(
    `_${counts.CompileError} mutants did not compile and ${counts.RuntimeError} errored at runtime; ` +
      'neither counts either way, which is why the totals above exclude them._'
  );
  lines.push('');
}

lines.push('| file | score | caught | survived | no test runs it |');
lines.push('| --- | ---: | ---: | ---: | ---: |');
for (const f of perFile) {
  lines.push(`| \`${short(f.file)}\` | ${scoreOf(f)}% | ${f.killed} | ${f.survived} | ${f.noCoverage} |`);
}
lines.push('');

if (alive.length) {
  const survivors = alive.filter((m) => m.status === 'Survived');
  lines.push(`<details><summary>${survivors.length} mutants the tests did not notice</summary>`);
  lines.push('');
  lines.push('| file:line | mutator | became |');
  lines.push('| --- | --- | --- |');
  for (const m of survivors.slice(0, top)) {
    lines.push(`| \`${short(m.file)}:${m.line}\` | ${m.mutator} | \`${m.replacement || '(removed)'}\` |`);
  }
  if (survivors.length > top) lines.push(`| … | ${survivors.length - top} more in the artifact | |`);
  lines.push('');
  lines.push('</details>');
  lines.push('');
}

const failed = breakAt !== null && mutationScore !== null && mutationScore < breakAt;
if (breakAt !== null) {
  lines.push(
    failed
      ? `**Below the floor of ${breakAt}%.** The floor is a ratchet: it moves up when the score does, ` +
          'and is never lowered to make a red run green.'
      : `_Floor: ${breakAt}%._`
  );
  lines.push('');
}

const out = lines.join('\n');
console.log(out);

writeFileSync(
  outPath,
  JSON.stringify(
    {
      // The nightly verdict harvests `mutationScore` by name; keep the key stable.
      mutationScore,
      coveredScore,
      mutants: { total, ...counts },
      floor: breakAt,
      ran: true,
      files: perFile.map((f) => ({ file: short(f.file), score: scoreOf(f), ...f })),
    },
    null,
    1
  )
);

process.exit(failed ? 1 : 0);
