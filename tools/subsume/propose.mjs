#!/usr/bin/env node
/**
 * The proposal: which tests the matrices say may leave the pull-request tier, in the report shape
 * of tools/subsume/README.md (`subsume-report.json` + `subsume-report.md`), plus the Mermaid
 * diagram (`diagram.md`). Nothing here decides — greedy cover picks the core, subsume.mjs judges
 * every residual test on its own, and this file only writes down what they found, with the tier
 * rule applied: CONFIRMED is the only tier an agent may act on.
 *
 *   node tools/subsume/propose.mjs --repo frontend --probes … --maps … --mutation … [--flaky …] --out reports/subsume [--commit sha]
 *   node tools/subsume/propose.mjs --repo backend  --probes … --classes … --kills … [--flaky …] --out reports/subsume [--commit sha]
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, sep } from 'node:path';

import { clusters } from './cluster.mjs';
import { diagram } from './diagram.mjs';
import { short } from './ident.mjs';
import { loadJava, loadJest, realTests } from './load.mjs';
import { suiteMetrics, testMetrics } from './metrics.mjs';
import { exactCover } from './solve.mjs';
import { carriedUnion, carriers, judge } from './subsume.mjs';

const sha = (path) =>
  path && existsSync(path) ? createHash('sha256').update(readFileSync(path)).digest('hex') : null;
const r1 = (x) => Math.round(x * 10) / 10;
const r4 = (x) => Math.round(x * 10000) / 10000;

/**
 * @param {ReturnType<typeof import('./load.mjs').newMatrix>} matrix
 * @param {{ commit?: string | null, inputs?: Record<string, string | null>, window?: number, timeLimit?: number, gap?: number }} [options]
 */
export async function propose(
  matrix,
  { commit = null, inputs = {}, window = 10, timeLimit = 120, gap = 0.005 } = {},
) {
  const tests = realTests(matrix);
  const cover = await exactCover(matrix, { timeLimit, gap });
  const cl = clusters(matrix);

  // how many non-flaky tests reach each unit — a unit with count 1 is unique to its test
  const reach = new Map();
  for (const t of tests) {
    if (t.flaky) continue;
    for (const p of t.probes) reach.set(p, (reach.get(p) ?? 0) + 1);
    for (const k of t.kills) reach.set(`kill:${k}`, (reach.get(`kill:${k}`) ?? 0) + 1);
  }
  const uniqueUnits = (t) =>
    [...t.probes].filter((p) => reach.get(p) === 1).length +
    [...t.kills].filter((k) => reach.get(`kill:${k}`) === 1).length;

  const perTest = testMetrics(matrix);
  const candidates = [];
  for (const id of cover.residual) {
    const j = judge(matrix, id, cover.kept);
    const t = matrix.tests.get(id);
    const c = j.tier === 'KEEP' ? { carriers: [] } : carriers(matrix, id, cover.kept);
    const r = perTest.get(id);
    candidates.push({
      test: id,
      tier: j.tier,
      reason: j.reason,
      unit: t.spec,
      seconds: t.seconds,
      subsumedBy: c.carriers,
      why: {
        probes: { own: t.probes.size, unique: j.missingProbes.length },
        kills: { own: t.kills.size, unique: j.missingKills.length, covers: t.covers?.size ?? 0 },
        soleKiller: !j.killsOk,
        inMutationScope: j.inScope,
        mutationObserved: j.mutationObserved,
        unitsOutOfScope: j.outOfScope.length,
      },
      redundancy: {
        covRed: r.covRed,
        killRed: r.killRed,
        score: r.score,
        redundantSeconds: r.redundantSeconds,
        killsNothing: r.killsNothing,
      },
    });
  }
  const order = { CONFIRMED: 0, SUSPECTED: 1, KEEP: 2 };
  candidates.sort(
    (a, b) =>
      order[a.tier] - order[b.tier] || a.unit.localeCompare(b.unit) || a.test.localeCompare(b.test),
  );

  const confirmed = new Set(candidates.filter((c) => c.tier === 'CONFIRMED').map((c) => c.test));
  const kept = tests.filter((t) => !confirmed.has(t.id)).map((t) => t.id);
  const metrics = suiteMetrics(matrix, new Set(kept), perTest);
  // individual redundancy (each test against the rest) is not what can go together — that is
  // the confirmed set, stated beside it so the two are never confused
  metrics.removableTogether = {
    tests: confirmed.size,
    seconds: r1(candidates.filter((c) => confirmed.has(c.test)).reduce((a, c) => a + c.seconds, 0)),
  };
  const all = carriedUnion(
    matrix,
    tests.map((t) => t.id),
  );
  const after = carriedUnion(matrix, kept);
  const seconds = (ids) => r1(ids.reduce((a, id) => a + (matrix.tests.get(id).seconds ?? 0), 0));

  const slowest = tests
    .filter((t) => (t.seconds ?? 0) > 0)
    .map((t) => {
      const u = uniqueUnits(t);
      return {
        test: t.test ?? t.id,
        seconds: r4(t.seconds),
        uniqueUnits: u,
        secondsPerUniqueUnit: u ? r4(t.seconds / u) : null,
      };
    })
    .sort(
      (a, b) =>
        (b.secondsPerUniqueUnit ?? Infinity) - (a.secondsPerUniqueUnit ?? Infinity) ||
        b.seconds - a.seconds,
    )
    .slice(0, 20);

  const report = {
    schema: 1,
    repo: matrix.repo,
    commit,
    generatedAt: new Date().toISOString(),
    inputs: { ...inputs, window },
    summary: {
      tests: tests.length,
      units: new Set(tests.map((t) => t.spec)).size,
      confirmed: confirmed.size,
      confirmedKillsNothing: candidates.filter((c) => c.reason === 'kills-nothing').length,
      suspected: candidates.filter((c) => c.tier === 'SUSPECTED').length,
      notMutationObserved: candidates.filter((c) => c.reason === 'not-mutation-observed').length,
      kept: kept.length,
      unobserved: tests.filter((t) => t.probes.size === 0).length,
      inMutationScope: tests.filter((t) => judge(matrix, t.id, cover.kept).inScope).length,
      probes: { total: all.probes.size, carriedAfter: after.probes.size },
      kills: { total: all.kills.size, carriedAfter: after.kills.size },
      prTierSeconds: { before: seconds(tests.map((t) => t.id)), after: seconds(kept) },
      duplicateClusters: cl.length,
      uncoveredByReliableTests: cover.uncovered.length,
    },
    metrics,
    solver: cover.solver,
    candidates,
    clusters: cl,
    slowest,
  };
  return report;
}

export function toMarkdown(report) {
  const s = report.summary;
  const byUnit = new Map();
  for (const c of report.candidates) {
    if (c.tier !== 'CONFIRMED') continue;
    if (!byUnit.has(c.unit)) byUnit.set(c.unit, []);
    byUnit.get(c.unit).push(c);
  }
  const lines = [
    `# Subsumption proposal — ${report.repo}${report.commit ? ` @ ${report.commit}` : ''}`,
    '',
    `${s.confirmed} of ${s.tests} tests may leave the pull-request tier: ${s.probes.carriedAfter} of ${s.probes.total} probes and ${s.kills.carriedAfter} of ${s.kills.total} kills stay carried by the ${s.kept} that remain; PR tier ${s.prTierSeconds.before} s → ${s.prTierSeconds.after} s. ${s.suspected} more are coverage-carried but outside the kill matrix's scope or sole killers inside the flaky window, and are not proposed. ${s.inMutationScope} of ${s.tests} tests touch only units the kill matrix covers; ${s.unobserved} load nothing the instrument sees and are never candidates.`,
    '',
    '| Class | Demoted | Carried by |',
    '| --- | --- | --- |',
  ];
  for (const [unit, cs] of [...byUnit].sort((a, b) => b[1].length - a[1].length)) {
    const carriers = new Set(cs.flatMap((c) => c.subsumedBy));
    lines.push(
      `| \`${unit}\` | ${cs.length} | ${[...carriers]
        .slice(0, 3)
        .map((x) => `\`${short(x)}\``)
        .join(', ')}${carriers.size > 3 ? ` +${carriers.size - 3}` : ''} |`,
    );
  }
  const m = report.metrics;
  const v = report.solver;
  const pct = (x) => `${Math.round(x * 1000) / 10} %`;
  lines.push(
    '',
    `Not applied: ${s.suspected} suspected candidates (${s.notMutationObserved} the kill matrix never ran against a mutant, the rest outside its scope or sole killers). Look twice: ${s.confirmedKillsNothing} confirmed tests kill nothing the matrix models.`,
    '',
    '## Metrics',
    '',
    '| | Before | After |',
    '| --- | --- | --- |',
    `| Tests in the tier | ${m.tests.before} | ${m.tests.after} (−${pct(m.sizeReduction)}) |`,
    `| Tier seconds | ${m.seconds.before} | ${m.seconds.after} (−${pct(m.timeReduction)}) |`,
    `| Probes carried | ${s.probes.total} | ${s.probes.carriedAfter} (${m.probeLoss} lost) |`,
    `| Mutants killed | ${s.kills.total} | ${s.kills.carriedAfter} (${m.killLoss} lost) |`,
    `| Dominator score | ${m.dominatorScore.before ?? '—'} | ${m.dominatorScore.after ?? '—'} (${m.dominators} dominators) |`,
    '',
    `Individually redundant against the rest of the suite — each test on its own, not a count of what can go together: ${pct(m.redundancyShare)} of tier time, ${m.fullyRedundant} tests fully; ${m.soleKillers} sole killers, ${m.flaky} flaky. Removable together, which is what the cover decides: ${m.removableTogether.tests} tests, ${m.removableTogether.seconds} s. Core chosen by ${v.method} (${v.status}; ${v.columns} columns × ${v.distinctRows} rows after ${v.forced} forced and ${v.dominatedDropped} dominated; gap ${v.gapPct ?? '—'} %).`,
    '',
    '## Slowest tests per unique unit',
    '',
    '| Test | s | unique units | s per unit |',
    '| --- | --- | --- | --- |',
  );
  for (const t of report.slowest)
    lines.push(
      `| \`${short(t.test)}\` | ${t.seconds} | ${t.uniqueUnits} | ${t.secondsPerUniqueUnit ?? '—'} |`,
    );
  return lines.join('\n') + '\n';
}

export { short };

const isMain =
  Boolean(process.argv[1]) && /propose\.mjs$/.test(process.argv[1].split(sep).join('/'));
if (isMain) {
  const arg = (name, dflt) => {
    const i = process.argv.indexOf(`--${name}`);
    return i > 0 ? process.argv[i + 1] : dflt;
  };
  const repo = arg('repo', 'frontend');
  const out = arg('out', 'reports/subsume');
  const paths = {
    probes: arg('probes'),
    maps: arg('maps'),
    mutation: arg('mutation'),
    classes: arg('classes'),
    kills: arg('kills'),
    flaky: arg('flaky'),
  };
  const matrix = repo === 'backend' ? loadJava(paths) : loadJest(paths);
  const inputs = Object.fromEntries(
    Object.entries(paths)
      .filter(([, v]) => v)
      .map(([k, v]) => [k, sha(v)]),
  );
  propose(matrix, {
    commit: arg('commit', null),
    inputs,
    timeLimit: Number(arg('time-limit', 120)),
    gap: Number(arg('gap', 0.005)),
  }).then((report) => {
    mkdirSync(out, { recursive: true });
    writeFileSync(join(out, 'subsume-report.json'), JSON.stringify(report, null, 1));
    writeFileSync(join(out, 'subsume-report.md'), toMarkdown(report));
    writeFileSync(join(out, 'diagram.md'), diagram(report));
    const s = report.summary;
    const v = report.solver;
    console.log(
      `propose: ${s.confirmed} CONFIRMED, ${s.suspected} SUSPECTED of ${s.tests} tests; PR tier ${s.prTierSeconds.before} s -> ${s.prTierSeconds.after} s; probes ${s.probes.carriedAfter}/${s.probes.total}, kills ${s.kills.carriedAfter}/${s.kills.total}; core by ${v.method} (${v.status}, ${v.columns} columns, ${v.distinctRows} rows, ${v.forced} forced, ${v.dominatedDropped} dominated, gap ${v.gapPct ?? '—'} %, ${v.seconds} s) -> ${out}`,
    );
  });
}
