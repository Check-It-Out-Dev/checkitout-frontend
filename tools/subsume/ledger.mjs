#!/usr/bin/env node
/**
 * The net-worth ledger of a governance round, and the merge rule — measured on the reduced tier,
 * never inferred (plan §16 step 3). Before comes from the proposal run's artefacts; after from
 * the pull request's own runs.
 *
 *   node tools/subsume/ledger.mjs --round docs/testing/governance/round.json
 *        --proposal <subsume-report.json of the proposal run>
 *        --invariants <invariant-report.json of this run>
 *        --suite <surefire-reports dir | jest-results.json> --seconds-after <tier wall seconds>
 *        [--seconds-before <tier wall seconds of the proposal run>]
 *        [--kills-before <kills.json|mutation.json> --kills-after <kills.json|mutation.json>]
 *        [--random-order pass|fail] --out reports/subsume
 *
 * Merge rule, machine-checked: at least one of {tests, seconds, lines} lower AND none of
 * {coverage on unchanged code (I1), kills on unchanged code (I2), mutation score} lower, the suite
 * green in declared and in random order, the published numbers consistent. Anything unmeasured
 * is INCOMPLETE — silence is not success.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, sep } from 'node:path';

import { readSuite } from './invariant.mjs';

const r1 = (x) => Math.round(x * 10) / 10;
const pct = (a, b) => (b ? Math.round(((a - b) / b) * 1000) / 10 : null);

/** Killed-mutant ids and the score from a PIT kills.json or a Stryker mutation.json. */
export function killsOf(path) {
  if (!path || !existsSync(path)) return null;
  const j = JSON.parse(readFileSync(path, 'utf8'));
  const killed = new Set();
  let total = 0;
  const files = new Map(); // mutant id -> file
  if (j.mutants) {
    for (const [id, mu] of Object.entries(j.mutants)) {
      total += 1;
      files.set(id, mu.file);
      if (mu.status === 'KILLED') killed.add(id);
    }
  } else if (j.files) {
    for (const [file, fv] of Object.entries(j.files))
      for (const mu of fv.mutants) {
        total += 1;
        const id = `${file.replace(/\\/g, '/')}#${mu.id}`;
        files.set(id, file.replace(/\\/g, '/'));
        if (mu.status === 'Killed') killed.add(id);
      }
  }
  return {
    killed,
    total,
    files,
    score: total ? Math.round((killed.size / total) * 10000) / 100 : null,
  };
}

/**
 * @param {{ round: any, proposal?: any, invariants?: any, suiteAfter?: { tests: number, failed: number } | null,
 *   secondsBefore?: number | null, secondsAfter?: number | null, killsBefore?: any, killsAfter?: any,
 *   changed?: Set<string>, randomOrder?: string | null }} input
 */
export function ledger({
  round,
  proposal = null,
  invariants = null,
  suiteAfter = null,
  secondsBefore = null,
  secondsAfter = null,
  killsBefore = null,
  killsAfter = null,
  changed = new Set(),
  randomOrder = null,
}) {
  const incomplete = [];
  if (!invariants) incomplete.push('invariant-report');
  if (!suiteAfter) incomplete.push('suite after');
  if (secondsAfter == null) incomplete.push('seconds after');
  if (randomOrder !== 'pass' && randomOrder !== 'fail') incomplete.push('random-order run');
  if (!killsAfter) incomplete.push('kill matrix after');
  const testsBefore = proposal?.summary?.tests ?? null;
  const testsAfter = suiteAfter?.tests ?? null;
  const before = {
    tests: testsBefore,
    seconds: secondsBefore ?? proposal?.summary?.prTierSeconds?.before ?? null,
  };
  const after = { tests: testsAfter, seconds: secondsAfter ?? null };

  // mutation: every mutant killed before, in a file the change did not touch, still killed after
  let mutation = null;
  if (killsBefore && killsAfter) {
    const lost = [];
    let checked = 0;
    for (const id of killsBefore.killed) {
      const file = killsBefore.files.get(id);
      if (changed.has(file)) continue;
      checked += 1;
      if (!killsAfter.killed.has(id)) lost.push(id);
    }
    mutation = {
      scoreBefore: killsBefore.score,
      scoreAfter: killsAfter.score,
      killedBefore: killsBefore.killed.size,
      killedAfter: killsAfter.killed.size,
      checkedUnchanged: checked,
      lost: lost.sort(),
    };
  }
  const gains = {
    tests: testsBefore != null && testsAfter != null ? testsBefore - testsAfter : null,
    seconds:
      before.seconds != null && after.seconds != null ? r1(before.seconds - after.seconds) : null,
    secondsPct:
      before.seconds != null && after.seconds != null ? pct(after.seconds, before.seconds) : null,
  };
  const kept = {
    coverageUnchangedCode: invariants ? invariants.i1?.status === 'PASS' : null,
    killsUnchangedCode: invariants ? invariants.i2?.status === 'PASS' : null,
    mutationScore: mutation
      ? mutation.lost.length === 0 && mutation.scoreAfter >= mutation.scoreBefore
      : null,
    suiteGreen: suiteAfter ? suiteAfter.failed === 0 : null,
    randomOrderGreen: randomOrder === 'pass' ? true : randomOrder === 'fail' ? false : null,
    publishedNumbers: invariants ? invariants.i4?.status === 'PASS' : null,
  };
  const gained = (gains.tests ?? 0) > 0 || (gains.seconds ?? 0) > 0;
  const heldAll = Object.values(kept).every((v) => v === true);
  const verdict = incomplete.length
    ? 'INCOMPLETE'
    : gained && heldAll
      ? 'MERGEABLE'
      : 'NOT-MERGEABLE';
  return {
    schema: 1,
    repo: round.repo,
    round: round.round,
    runId: round.runId,
    baseCommit: round.baseCommit,
    demoted: round.demoted?.length ?? 0,
    notApplied: round.notApplied?.length ?? 0,
    tiers: round.tiers ?? null,
    before,
    after,
    gains,
    kept,
    mutation,
    probes: invariants
      ? {
          checked: invariants.i1?.checked ?? null,
          regressions: invariants.i1?.regressions?.length ?? null,
        }
      : null,
    verdict,
    incomplete: incomplete.sort(),
  };
}

/** The one line of the step summary. */
export function summaryLine(l) {
  if (l.verdict === 'INCOMPLETE')
    return `Governance round ${l.round}: INCOMPLETE — missing: ${l.incomplete.join(', ')}`;
  const n = (x) => (x ?? 0).toLocaleString('en-US');
  const held = Object.entries(l.kept)
    .filter(([, v]) => v === false)
    .map(([k]) => k);
  return `Governance round ${l.round}: ${l.verdict} — ${n(l.demoted)} tests demoted · tests ${n(l.before.tests)} → ${n(l.after.tests)} · tier ${l.before.seconds} s → ${l.after.seconds} s (${l.gains.secondsPct ?? '—'} %) · coverage on unchanged code ${l.kept.coverageUnchangedCode ? 'kept' : 'LOWER'} · kills on unchanged code ${l.kept.killsUnchangedCode ? 'kept' : 'LOST'} · mutation score ${l.mutation ? `${l.mutation.scoreBefore} → ${l.mutation.scoreAfter}` : '—'} · suite ${l.kept.suiteGreen ? 'green' : 'RED'}, random order ${l.kept.randomOrderGreen ? 'green' : 'RED'}${held.length ? ` · not held: ${held.join(', ')}` : ''}`;
}

const isMain =
  Boolean(process.argv[1]) && /ledger\.mjs$/.test(process.argv[1].split(sep).join('/'));
if (isMain) {
  const arg = (name, dflt) => {
    const i = process.argv.indexOf(`--${name}`);
    return i > 0 ? process.argv[i + 1] : dflt;
  };
  const json = (p) => (p && existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null);
  const changedFile = arg('changed');
  const changed = new Set(
    changedFile && existsSync(changedFile)
      ? readFileSync(changedFile, 'utf8')
          .split('\n')
          .map((l) => l.trim().replace(/\\/g, '/'))
          .filter(Boolean)
      : [],
  );
  const l = ledger({
    round: json(arg('round', 'docs/testing/governance/round.json')) ?? {},
    proposal: json(arg('proposal')),
    invariants: json(arg('invariants')),
    suiteAfter: readSuite(arg('suite')),
    secondsBefore: arg('seconds-before') != null ? Number(arg('seconds-before')) : null,
    secondsAfter: arg('seconds-after') != null ? Number(arg('seconds-after')) : null,
    killsBefore: killsOf(arg('kills-before')),
    killsAfter: killsOf(arg('kills-after')),
    changed,
    randomOrder: arg('random-order', null),
  });
  const out = arg('out', 'reports/subsume');
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'governance-ledger.json'), JSON.stringify(l, null, 1));
  const line = summaryLine(l);
  console.log(line);
  if (process.env.GITHUB_STEP_SUMMARY)
    writeFileSync(process.env.GITHUB_STEP_SUMMARY, line + '\n', { flag: 'a' });
  process.exit(l.verdict === 'MERGEABLE' ? 0 : l.verdict === 'NOT-MERGEABLE' ? 1 : 2);
}
