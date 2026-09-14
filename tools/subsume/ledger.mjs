#!/usr/bin/env node
/**
 * The net-worth ledger of a governance round, and the merge rule — measured on the reduced tier,
 * never inferred (plan §16 step 3). Before comes from the proposal run's artefacts; after from
 * the pull request's own runs.
 *
 *   node tools/subsume/ledger.mjs --round docs/testing/governance/round.json
 *        --proposal <subsume-report.json of the proposal run>
 *        --invariants <invariant-report.json of this run>
 *        --suite <surefire-reports dir | jest-results.json> --head-probes <probes.jsonl of this run>
 *        [--before-probes <probes.jsonl of the full tier, run in the same job>]
 *        [--seconds-after <tier wall seconds, reported beside the per-test sum>]
 *        [--kills-before <kills.json|mutation.json> --kills-after <kills.json|mutation.json>]
 *        [--random-order pass|fail] --out reports/subsume
 *
 * Tests and seconds are counted by the probes on both sides — the proposal's before and this
 * run's after — never one side by surefire and the other by the probes: surefire counts
 * parameterised invocations, the probes count methods, and wall seconds include compilation.
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

/**
 * Killed-mutant ids, their killers and the score from a PIT kills.json or a Stryker mutation.json.
 * Killers are test identities (tools/subsume/README.md, "One identity for a test"), so a lost
 * mutant can be asked whether any test that killed it was demoted.
 */
export function killsOf(path) {
  if (!path || !existsSync(path)) return null;
  const j = JSON.parse(readFileSync(path, 'utf8'));
  const killed = new Set();
  let total = 0;
  const files = new Map(); // mutant id -> file
  const killers = new Map(); // mutant id -> test identities that killed it
  if (j.mutants) {
    // PIT's own notion of detected: a mutant that timed out or blew the heap is one the suite
    // caught, and a slower machine turns a KILLED into a TIMED_OUT without anything being lost
    for (const [id, mu] of Object.entries(j.mutants)) {
      total += 1;
      files.set(id, mu.file);
      if (['KILLED', 'TIMED_OUT', 'MEMORY_ERROR', 'RUN_ERROR'].includes(mu.status)) {
        killed.add(id);
        killers.set(id, mu.killedBy ?? []);
      }
    }
  } else if (j.files) {
    const byId = new Map();
    for (const [file, tf] of Object.entries(j.testFiles ?? {}))
      for (const tt of tf.tests ?? [])
        byId.set(String(tt.id), `${file.replace(/\\/g, '/')} :: ${tt.name}`);
    for (const [file, fv] of Object.entries(j.files))
      for (const mu of fv.mutants) {
        total += 1;
        const id = `${file.replace(/\\/g, '/')}#${mu.id}`;
        files.set(id, file.replace(/\\/g, '/'));
        if (mu.status === 'Killed' || mu.status === 'Timeout') {
          killed.add(id);
          killers.set(
            id,
            (mu.killedBy ?? []).map((x) => byId.get(String(x)) ?? `stryker-test:${x}`),
          );
        }
      }
  }
  return {
    killed,
    killers,
    total,
    files,
    score: total ? Math.round((killed.size / total) * 10000) / 100 : null,
  };
}

/** Tests and the sum of their own seconds in an armed run's probes.jsonl — the same instrument
 *  the proposal's "before" used, so before and after are counted alike (surefire counts
 *  parameterised invocations, the probes count methods; wall seconds include compilation). */
export function probesTally(path) {
  if (!path || !existsSync(path)) return null;
  let tests = 0;
  let seconds = 0;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    const r = JSON.parse(line);
    if (
      r.final ||
      /^\((plan setup|plan teardown)\)$/.test(r.test) ||
      / :: \(module load\)$/.test(r.test)
    )
      continue;
    tests += 1;
    seconds += r.seconds ?? 0;
  }
  return { tests, seconds: r1(seconds) };
}

/**
 * @param {{ round: any, proposal?: any, invariants?: any, suiteAfter?: { tests: number, failed: number } | null,
 *   probesBefore?: { tests: number, seconds: number } | null,
 *   probesAfter?: { tests: number, seconds: number } | null, wallSecondsAfter?: number | null,
 *   killsBefore?: any, killsAfter?: any, changed?: Set<string>, randomOrder?: string | null }} input
 */
export function ledger({
  round,
  proposal = null,
  invariants = null,
  suiteAfter = null,
  probesBefore = null,
  probesAfter = null,
  wallSecondsAfter = null,
  killsBefore = null,
  killsAfter = null,
  changed = new Set(),
  randomOrder = null,
}) {
  const incomplete = [];
  if (!invariants) incomplete.push('invariant-report');
  if (!suiteAfter) incomplete.push('suite after');
  if (!probesAfter) incomplete.push('probes after');
  if (randomOrder !== 'pass' && randomOrder !== 'fail') incomplete.push('random-order run');
  if (!killsAfter) incomplete.push('kill matrix after');
  // The before is the full tier measured on the same machine, in the same job, when the job ran
  // it (the first backend round read 75.4 s on the box against 84.5 s on the runner and called
  // a faster tier slower); the proposal's figures only when nothing better was measured.
  const before = {
    tests: probesBefore?.tests ?? proposal?.summary?.tests ?? null,
    seconds: probesBefore?.seconds ?? proposal?.summary?.prTierSeconds?.before ?? null,
    sameMachine: Boolean(probesBefore),
  };
  const after = {
    tests: probesAfter?.tests ?? null,
    seconds: probesAfter?.seconds ?? null,
    wallSeconds: wallSecondsAfter,
    suiteTests: suiteAfter?.tests ?? null,
  };
  const testsBefore = before.tests;
  const testsAfter = after.tests;

  // mutation: every mutant killed before, in a file the change did not touch, still killed after.
  // A mutant no longer killed although every test that killed it is still in the tier was lost
  // by the machine, not by the round — the first backend round found one (a path conditional
  // killed on Windows by three kept tests, surviving the same three on Linux); it is listed, and
  // the round is not held to it. A mutant whose killers include a demoted test is the round's.
  let mutation = null;
  if (killsBefore && killsAfter) {
    const demotedSet = new Set(round.demoted ?? []);
    const lostByDemotion = [];
    const lostByEnvironment = [];
    let checked = 0;
    for (const id of killsBefore.killed) {
      const file = killsBefore.files.get(id);
      if (changed.has(file)) continue;
      checked += 1;
      if (killsAfter.killed.has(id)) continue;
      const k = killsBefore.killers?.get(id) ?? [];
      if (k.length && k.every((t) => !demotedSet.has(t))) lostByEnvironment.push(id);
      else lostByDemotion.push(id);
    }
    mutation = {
      scoreBefore: killsBefore.score,
      scoreAfter: killsAfter.score,
      killedBefore: killsBefore.killed.size,
      killedAfter: killsAfter.killed.size,
      checkedUnchanged: checked,
      lost: lostByDemotion.sort(),
      lostByEnvironment: lostByEnvironment.sort(),
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
    // held when no mutant was lost to the round: a score a hundredth lower because the machine
    // let one mutant through the same tests is reported beside it, not counted against it
    mutationScore: mutation
      ? mutation.lost.length === 0 &&
        mutation.scoreAfter + (mutation.lostByEnvironment.length * 100) / (killsAfter.total || 1) >=
          mutation.scoreBefore - 0.005
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
  const env = l.mutation?.lostByEnvironment?.length
    ? ` (${n(l.mutation.lostByEnvironment.length)} mutant(s) lost to the machine, not the round)`
    : '';
  return `Governance round ${l.round}: ${l.verdict} — ${n(l.demoted)} tests demoted · tests ${n(l.before.tests)} → ${n(l.after.tests)} · tier ${l.before.seconds} s → ${l.after.seconds} s (${l.gains.secondsPct ?? '—'} %${l.before.sameMachine ? ', same machine' : ', proposal vs this machine'}) · coverage on unchanged code ${l.kept.coverageUnchangedCode ? 'kept' : 'LOWER'} · kills on unchanged code ${l.kept.killsUnchangedCode ? 'kept' : 'LOST'} · mutation score ${l.mutation ? `${l.mutation.scoreBefore} → ${l.mutation.scoreAfter}` : '—'}${env} · suite ${l.kept.suiteGreen ? 'green' : 'RED'}, random order ${l.kept.randomOrderGreen ? 'green' : 'RED'}${held.length ? ` · not held: ${held.join(', ')}` : ''}`;
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
    probesBefore: probesTally(arg('before-probes')),
    probesAfter: probesTally(arg('head-probes')),
    wallSecondsAfter: arg('seconds-after') != null ? Number(arg('seconds-after')) : null,
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
