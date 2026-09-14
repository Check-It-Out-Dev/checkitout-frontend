#!/usr/bin/env node
/**
 * The core run against real artefacts, numbers only — what a proposal would be built on, before
 * one exists. Prints tests, probes, mutants, the mutation-scope fraction (how many tests touch
 * only units the kill matrix covers), duplicate clusters, the greedy cover, and the judgement
 * tiers of the residual. Nothing is written.
 *
 *   node tools/subsume/stats.mjs --repo frontend --probes reports/subsume/probes.jsonl --maps reports/subsume/maps.json --mutation reports/mutation/mutation.json
 *   node tools/subsume/stats.mjs --repo backend  --probes <be>/target/subsume/probes.jsonl --classes <be>/target/subsume/classes.json --kills reports/subsume/kills.backend.json
 */
import { clusters } from './cluster.mjs';
import { greedyCover } from './cover.mjs';
import { loadJava, loadJest, realTests } from './load.mjs';
import { inMutationScope, judge } from './subsume.mjs';

const arg = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : dflt;
};

const repo = arg('repo', 'frontend');
const t0 = performance.now();
const matrix =
  repo === 'backend'
    ? loadJava({
        probes: arg('probes'),
        classes: arg('classes'),
        kills: arg('kills'),
        flaky: arg('flaky'),
      })
    : loadJest({
        probes: arg('probes'),
        maps: arg('maps'),
        mutation: arg('mutation'),
        flaky: arg('flaky'),
      });
const tests = realTests(matrix);
const withProbes = tests.filter((t) => t.probes.size > 0);
const inScope = tests.filter((t) => inMutationScope(matrix, t.id));
const killed = [...matrix.mutants.values()].filter((m) => /^killed$/i.test(m.status));
const seconds = tests.reduce((a, t) => a + (t.seconds ?? 0), 0);
console.log(
  `${repo}: ${tests.length} tests (${withProbes.length} with probes, ${seconds.toFixed(1)} s), ${matrix.probes.size} probes over ${new Set([...matrix.probes.values()].map((p) => p.unit)).size} units, ${matrix.mutants.size} mutants (${killed.length} killed) over ${matrix.scope.size} units in scope`,
);
console.log(
  `mutation scope: ${inScope.length}/${tests.length} tests touch only units the kill matrix covers (${((100 * inScope.length) / Math.max(1, tests.length)).toFixed(1)} %)`,
);

const cl = clusters(matrix);
const dup = cl.reduce((a, c) => a + c.members.length - 1, 0);
console.log(
  `duplicates: ${cl.length} clusters, ${dup} tests share another test's exact probe set (largest ${cl[0]?.members.length ?? 0})`,
);

const cover = greedyCover(matrix);
const tiers = { CONFIRMED: 0, SUSPECTED: 0, KEEP: 0 };
let residualSeconds = 0;
for (const id of cover.residual) {
  const j = judge(matrix, id, cover.kept);
  tiers[j.tier] += 1;
  if (j.tier === 'CONFIRMED') residualSeconds += matrix.tests.get(id).seconds ?? 0;
}
console.log(
  `cover: ${cover.kept.size} kept, ${cover.residual.length} residual (${cover.uncovered.length} units reachable only by flaky tests)`,
);
console.log(
  `residual tiers: CONFIRMED ${tiers.CONFIRMED}, SUSPECTED ${tiers.SUSPECTED}, KEEP ${tiers.KEEP}; confirmed would free ${residualSeconds.toFixed(1)} s of ${seconds.toFixed(1)} s`,
);
console.log(`(${((performance.now() - t0) / 1000).toFixed(1)} s)`);
