#!/usr/bin/env node
/**
 * The round policy: what leaves the tier THIS round, from what the proposal says may leave.
 *
 * Evidence tiers, surest first — categorical, never a probability:
 *   A  an exact duplicate: probes and kills identical to a kept test in the same class, own kills > 0
 *   B  kill-carried with own kills, two or more kept tests that each alone carry all of it
 *   C  kill-carried with own kills, one such carrier
 *   D  kills nothing the matrix models: equivalence on coverage only, on mutation-exercised lines
 * Hard gates before any tier: CONFIRMED; run by the kill matrix; a carrier in the same class or a
 * kept representative of its duplicate cluster; probes identical across two armed runs when a
 * second run is given (otherwise the pack is `provisional`); not flaky (a flaky test is never a
 * candidate); not name-flagged (`boundary`, `regression`, `issue-` … wait on the look-twice list
 * until a person clears them).
 *
 * Budget: a share of the tier's seconds and a test count, whichever is spent first, taken from
 * tier A downward; never more than a share of any class in one round; tier D never while A–C
 * still hold anything. The caller passes the budget the ratchet decided (plan §17): it doubles
 * after a clean round and halves after a failed re-measurement. `saturated` means A–C are empty
 * at these gates; what remains is a person's list.
 *
 *   node tools/subsume/pack.mjs --report reports/subsume/subsume-report.json --out reports/subsume
 *        [--budget-share 0.10] [--budget-tests 300] [--class-cap 0.5] [--frozen A,D]
 *        [--cleared docs/testing/governance/cleared.json] [--probes2 <probes.jsonl of a second armed run>]
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, sep } from 'node:path';

import { readJsonl } from './load.mjs';

export const NAME_FLAGS =
  /boundary|edge|regression|\bbug\b|issue-|null|empty|invalid|limit|overflow|concurren|race|timeout/i;

const r1 = (x) => Math.round(x * 10) / 10;

/**
 * The tier a candidate belongs to after the gates, or null with the gate that stopped it.
 * @param {any} c a candidate of the proposal
 * @param {{ cleared?: Set<string>, deterministic?: Map<string, boolean> | null }} [options]
 */
export function tierOf(c, { cleared = new Set(), deterministic = null } = {}) {
  if (c.tier !== 'CONFIRMED') return { tier: null, gate: 'not-confirmed' };
  if (!c.why.mutationObserved) return { tier: null, gate: 'not-mutation-observed' };
  if (!(c.why.sameClassCarrier || c.clusterRepresentativeKept))
    return { tier: null, gate: 'no-carrier-in-class' };
  if (deterministic && deterministic.get(c.test) === false)
    return { tier: null, gate: 'nondeterministic' };
  const name = c.test.includes(' :: ') ? c.test.slice(c.test.indexOf(' :: ') + 4) : c.test;
  if (NAME_FLAGS.test(name) && !cleared.has(c.test)) return { tier: null, gate: 'look-twice' };
  if (c.reason === 'kills-nothing') return { tier: 'D', gate: null };
  if (c.why.exactDuplicateOf) return { tier: 'A', gate: null };
  if ((c.why.fullCarriers ?? 0) >= 2) return { tier: 'B', gate: null };
  return { tier: 'C', gate: null };
}

/** Per-test probe-set equality between two armed runs: Map<testId, boolean>. */
export function determinismOf(probesA, probesB) {
  const sig = (path) => {
    const m = new Map();
    for (const rec of readJsonl(path)) {
      if (rec.final) continue;
      const parts = [];
      for (const [unit, h] of Object.entries(rec.hits).sort())
        parts.push(
          unit,
          typeof h === 'string' ? h : JSON.stringify([h.s ?? [], h.f ?? [], h.b ?? []]),
        );
      m.set(rec.test, parts.join('|'));
    }
    return m;
  };
  const a = sig(probesA);
  const b = sig(probesB);
  const out = new Map();
  for (const [id, s] of a) out.set(id, b.has(id) && b.get(id) === s);
  return out;
}

/**
 * @param {any} report the proposal (`subsume-report.json`)
 * @param {{ budgetShare?: number, budgetTests?: number, classCap?: number, frozen?: Set<string>, cleared?: Set<string>, deterministic?: Map<string, boolean> | null }} [options]
 */
export function pack(
  report,
  {
    budgetShare = 0.1,
    budgetTests = 300,
    classCap = 0.5,
    frozen = new Set(),
    cleared = new Set(),
    deterministic = null,
  } = {},
) {
  const tierSeconds = report.summary.prTierSeconds.before;
  const budgetSeconds = r1(tierSeconds * budgetShare);
  const unitTests = report.unitTests ?? {};
  /** @type {Record<string, any[]>} */
  const tiers = { A: [], B: [], C: [], D: [] };
  /** @type {Record<string, number>} */
  const gates = {};
  const lookTwice = [];
  for (const c of report.candidates) {
    const { tier, gate } = tierOf(c, { cleared, deterministic });
    if (tier) tiers[tier].push(c);
    else {
      gates[gate] = (gates[gate] ?? 0) + 1;
      if (gate === 'look-twice') lookTwice.push({ test: c.test, unit: c.unit, seconds: c.seconds });
    }
  }
  const bySeconds = (a, b) =>
    (b.redundancy?.redundantSeconds ?? b.seconds) - (a.redundancy?.redundantSeconds ?? a.seconds) ||
    a.unit.localeCompare(b.unit) ||
    a.test.localeCompare(b.test);
  for (const t of Object.keys(tiers)) tiers[t].sort(bySeconds);

  const taken = [];
  const perClass = new Map();
  let seconds = 0;
  const abcAvailable = tiers.A.length + tiers.B.length + tiers.C.length;
  const order = abcAvailable > 0 ? ['A', 'B', 'C'] : ['D'];
  let capped = 0;
  outer: for (const tier of order) {
    if (frozen.has(tier)) continue;
    for (const c of tiers[tier]) {
      if (taken.length >= budgetTests || seconds + (c.seconds ?? 0) > budgetSeconds) break outer;
      const total = unitTests[c.unit] ?? 0;
      const cap = Math.floor(total * classCap);
      const used = perClass.get(c.unit) ?? 0;
      if (cap < 1 || used >= cap) {
        capped += 1;
        continue;
      }
      perClass.set(c.unit, used + 1);
      seconds = r1(seconds + (c.seconds ?? 0));
      taken.push({
        test: c.test,
        unit: c.unit,
        tier,
        seconds: c.seconds,
        carriers: c.subsumedBy,
        exactDuplicateOf: c.why.exactDuplicateOf ?? null,
      });
    }
  }
  const remaining = (t) => tiers[t].filter((c) => !taken.some((x) => x.test === c.test));
  const sum = (cs) => r1(cs.reduce((a, c) => a + (c.seconds ?? 0), 0));
  const forecast = {};
  for (const t of ['A', 'B', 'C', 'D']) {
    const rest = remaining(t);
    forecast[t] = { tests: rest.length, seconds: sum(rest) };
  }
  const abcLeft = forecast.A.seconds + forecast.B.seconds + forecast.C.seconds;
  const abcLeftTests = forecast.A.tests + forecast.B.tests + forecast.C.tests;
  const rounds = Math.max(
    budgetSeconds > 0 ? Math.ceil(abcLeft / budgetSeconds) : 0,
    budgetTests > 0 ? Math.ceil(abcLeftTests / budgetTests) : 0,
  );
  return {
    schema: 1,
    repo: report.repo,
    commit: report.commit ?? null,
    budget: { share: budgetShare, seconds: budgetSeconds, tests: budgetTests, classCap },
    gates: {
      determinism: deterministic ? 'measured' : 'unmeasured',
      frozen: [...frozen].sort(),
      excluded: gates,
    },
    provisional: !deterministic,
    tiers: Object.fromEntries(
      ['A', 'B', 'C', 'D'].map((t) => [
        t,
        {
          available: tiers[t].length,
          seconds: sum(tiers[t]),
          taken: taken.filter((x) => x.tier === t).length,
        },
      ]),
    ),
    taken,
    seconds,
    classesTouched: perClass.size,
    classCapped: capped,
    lookTwice: lookTwice.sort(
      (a, b) => a.unit.localeCompare(b.unit) || a.test.localeCompare(b.test),
    ),
    saturated: abcAvailable - taken.filter((x) => x.tier !== 'D').length === 0,
    forecast: {
      ...forecast,
      roundsToSaturationAtThisBudget: rounds,
    },
  };
}

export function toMarkdown(p) {
  const t = p.tiers;
  const lines = [
    `# Round pack — ${p.repo}${p.commit ? ` @ ${p.commit}` : ''}`,
    '',
    `${p.taken.length} tests leave this round (${p.seconds} s of a ${p.budget.seconds} s budget, ${p.classesTouched} classes, at most ${Math.round(p.budget.classCap * 100)} % of any class): A ${t.A.taken} of ${t.A.available}, B ${t.B.taken} of ${t.B.available}, C ${t.C.taken} of ${t.C.available}, D ${t.D.taken} of ${t.D.available}. Determinism ${p.gates.determinism}${p.provisional ? ' — the pack is provisional until a second armed run confirms it' : ''}. ${p.lookTwice.length} look-twice tests wait for a person. ${p.saturated ? 'Saturated: tiers A–C are empty at these gates.' : `${p.forecast.roundsToSaturationAtThisBudget} more rounds to saturation at this budget.`}`,
    '',
    '| Tier | Test | Class | s | carried by |',
    '| --- | --- | --- | --- | --- |',
  ];
  for (const x of p.taken.slice(0, 60))
    lines.push(
      `| ${x.tier} | \`${x.test}\` | \`${x.unit}\` | ${x.seconds} | ${x.exactDuplicateOf ? `duplicate of \`${x.exactDuplicateOf}\`` : x.carriers.map((c) => `\`${c}\``).join(', ')} |`,
    );
  if (p.taken.length > 60) lines.push(`| … | ${p.taken.length - 60} more in pack.json | | | |`);
  return lines.join('\n') + '\n';
}

const isMain = Boolean(process.argv[1]) && /pack\.mjs$/.test(process.argv[1].split(sep).join('/'));
if (isMain) {
  const arg = (name, dflt) => {
    const i = process.argv.indexOf(`--${name}`);
    return i > 0 ? process.argv[i + 1] : dflt;
  };
  const report = JSON.parse(
    readFileSync(arg('report', 'reports/subsume/subsume-report.json'), 'utf8'),
  );
  const clearedPath = arg('cleared');
  const cleared = new Set(
    clearedPath && existsSync(clearedPath)
      ? (JSON.parse(readFileSync(clearedPath, 'utf8')).tests ?? [])
      : [],
  );
  const probes2 = arg('probes2');
  const probes1 = arg('probes');
  const deterministic = probes1 && probes2 ? determinismOf(probes1, probes2) : null;
  const p = pack(report, {
    budgetShare: Number(arg('budget-share', 0.1)),
    budgetTests: Number(arg('budget-tests', 300)),
    classCap: Number(arg('class-cap', 0.5)),
    frozen: new Set((arg('frozen', '') || '').split(',').filter(Boolean)),
    cleared,
    deterministic,
  });
  const out = arg('out', 'reports/subsume');
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'pack.json'), JSON.stringify(p, null, 1));
  writeFileSync(join(out, 'pack.md'), toMarkdown(p));
  console.log(toMarkdown(p).split('\n')[2]);
}
