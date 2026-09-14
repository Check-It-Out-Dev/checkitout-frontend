/**
 * The minimum-cost core, exactly — and a certificate that says how far from the minimum the
 * answer is when the solver runs out of time.
 *
 * Greedy weighted set cover (cover.mjs) is a heuristic within a few percent of the optimum on
 * suites like these (Noemmer & Haas, SWQD 2020) and stays the incumbent. What it cannot give is
 * a bound. This file states the same problem as the integer programme of Black, Melachrinoudis
 * & Kaeli (ICSE 2004) and Hsu & Orso's MINTS (ICSE 2009), with both criteria as hard
 * constraints and seconds as the objective:
 *
 *     minimise   Σ seconds(t) · x_t
 *     subject to Σ_{t covers r} x_t ≥ 1   for every row r     (a probe, or a killed mutant)
 *                x_t ∈ {0, 1}             for every reliable test t
 *
 * and hands it to HiGHS (pinned `highs`, MIT, WebAssembly) after the reductions from the
 * set-cover literature that keep the optimum (Beasley 1987; Tallam & Gupta, PASTE 2005):
 * rows with identical coverers merge into one; a row only one test reaches forces that test;
 * a test whose rows another test covers at no greater cost is dropped. Dominated rows are left
 * to the solver's presolve. Flaky tests are never coverers and are always kept.
 *
 * The result is the cheaper of the greedy cover and the solver's incumbent, with the solver's
 * dual bound and gap reported as they are. A per-test judgement (subsume.mjs) is still made on
 * every test outside the core — the solver decides, the invariants verify.
 */
import { greedyCover } from './cover.mjs';
import { realTests } from './load.mjs';

const ms = (t) => Math.max(1, Math.round((t.seconds ?? 0.001) * 1000));
// a separator no test id contains, spelled so that a formatter cannot turn it into a raw byte
const SEP = String.fromCharCode(31);

/**
 * The set-cover instance after the optimum-preserving reductions, iterated to a fixpoint.
 * Returns the eligible columns, the forced tests, the dropped (dominated) tests and the
 * distinct rows (each a set of eligible coverers) not already covered by a forced test.
 */
export function reduce(matrix) {
  const tests = realTests(matrix).filter((t) => !t.flaky);
  const byId = new Map(tests.map((t) => [t.id, t]));
  const cost = (id) => ms(byId.get(id));
  const unitsOf = new Map(
    tests.map((t) => [t.id, [...t.probes, ...[...t.kills].map((k) => `kill:${k}`)]]),
  );
  const coverers = new Map(); // element -> Set<testId>
  for (const t of tests)
    for (const u of unitsOf.get(t.id)) {
      if (!coverers.has(u)) coverers.set(u, new Set());
      coverers.get(u).add(t.id);
    }

  const forced = new Set();
  const dropped = new Set();
  const eligible = () => tests.filter((t) => !forced.has(t.id) && !dropped.has(t.id));
  let rows;
  for (let changed = true; changed;) {
    changed = false;
    // rows: elements no forced test covers, keyed by their eligible coverers (R2)
    rows = new Map();
    const rowsOf = new Map(); // testId -> Set<rowKey>
    for (const [u, cs] of coverers) {
      if ([...cs].some((id) => forced.has(id))) continue;
      const cov = [...cs].filter((id) => !dropped.has(id)).sort();
      if (cov.length === 0) continue; // R1: nobody reliable covers it; reported by the cover
      const key = cov.join(''); // a separator no test id contains
      if (!rows.has(key)) {
        rows.set(key, { coverers: cov, elements: [] });
        for (const id of cov) {
          if (!rowsOf.has(id)) rowsOf.set(id, new Set());
          rowsOf.get(id).add(key);
        }
      }
      rows.get(key).elements.push(u);
    }
    // R4: a row with one coverer forces it
    for (const row of rows.values())
      if (row.coverers.length === 1 && !forced.has(row.coverers[0])) {
        forced.add(row.coverers[0]);
        changed = true;
      }
    if (changed) continue;
    // R5: a test whose rows another test also covers, at no greater cost, is dominated
    for (const a of eligible()) {
      const mine = rowsOf.get(a.id);
      if (!mine || mine.size === 0) {
        dropped.add(a.id); // covers nothing the forced tests do not already cover
        changed = true;
        continue;
      }
      let rarest = null;
      for (const key of mine) {
        const row = rows.get(key);
        if (!rarest || row.coverers.length < rarest.coverers.length) rarest = row;
      }
      for (const b of rarest.coverers) {
        if (b === a.id || dropped.has(b) || forced.has(b)) continue;
        if (cost(b) > cost(a.id) || (cost(b) === cost(a.id) && b > a.id)) continue;
        const theirs = rowsOf.get(b);
        let subset = true;
        for (const key of mine)
          if (!theirs.has(key)) {
            subset = false;
            break;
          }
        if (subset) {
          dropped.add(a.id);
          changed = true;
          break;
        }
      }
    }
  }
  return {
    columns: eligible().map((t) => t.id),
    forced,
    dropped,
    rows: [...rows.values()],
    cost,
  };
}

let loader = null;
/** The solver, loaded once; null when the package is not installed. */
async function highs() {
  if (loader === null) loader = import('highs').then((m) => (m.default ?? m)()).catch(() => null);
  return loader;
}

/**
 * The exact cover. Options: `timeLimit` seconds (default 120), `gap` relative (default 0.005).
 * Always returns a feasible kept set; `method` says whether it came from the solver or greedy.
 */
export async function exactCover(matrix, { timeLimit = 120, gap = 0.005 } = {}) {
  const started = Date.now();
  const greedy = greedyCover(matrix);
  const inst = reduce(matrix);
  const flaky = new Set(
    realTests(matrix)
      .filter((t) => t.flaky)
      .map((t) => t.id),
  );
  const costOf = (ids) =>
    [...ids].reduce((a, id) => a + (flaky.has(id) ? 0 : inst.cost(id)), 0) / 1000;
  // what only a flaky test reaches is reported, never credited and never dropped silently
  const reliable = new Set();
  for (const t of realTests(matrix))
    if (!t.flaky)
      for (const u of [...t.probes, ...[...t.kills].map((k) => `kill:${k}`)]) reliable.add(u);
  const flakyOnly = new Set();
  for (const id of flaky)
    for (const u of [
      ...matrix.tests.get(id).probes,
      ...[...matrix.tests.get(id).kills].map((k) => `kill:${k}`),
    ])
      if (!reliable.has(u)) flakyOnly.add(u);
  const base = {
    greedyCost: costOf(greedy.kept),
    forced: inst.forced.size,
    dominatedDropped: inst.dropped.size,
    distinctRows: inst.rows.length,
    columns: inst.columns.length,
    timeLimit,
    gapLimit: gap,
  };
  const finish = (kept, extra) => ({
    kept,
    order: greedy.order.filter((id) => kept.has(id)),
    residual: realTests(matrix)
      .filter((t) => !t.flaky && !kept.has(t.id))
      .map((t) => t.id),
    uncovered: [...new Set([...greedy.uncovered, ...flakyOnly])].sort(),
    solver: {
      ...base,
      ...extra,
      flakyOnly: flakyOnly.size,
      seconds: Math.round((Date.now() - started) / 100) / 10,
    },
  });

  if (inst.columns.length === 0 || inst.rows.length === 0) {
    const kept = new Set([...inst.forced, ...flaky]);
    return finish(kept, {
      method: 'reduction',
      status: 'Optimal',
      incumbentCost: costOf(kept),
      dualBound: costOf(kept),
      gapPct: 0,
      nodes: 0,
    });
  }
  const h = await highs();
  if (!h) return finish(greedy.kept, { method: 'greedy', status: 'solver unavailable' });

  const col = new Map(inst.columns.map((id, i) => [id, i]));
  const starts = [0];
  const indices = [];
  for (const row of inst.rows) {
    for (const id of row.coverers) if (col.has(id)) indices.push(col.get(id));
    starts.push(indices.length);
  }
  const numCols = inst.columns.length;
  const numRows = inst.rows.length;
  const model = h.createModel({
    numCols,
    numRows,
    colCost: inst.columns.map((id) => inst.cost(id)),
    colLower: new Array(numCols).fill(0),
    colUpper: new Array(numCols).fill(1),
    rowLower: new Array(numRows).fill(1),
    rowUpper: new Array(numRows).fill(h.infinity),
    matrix: {
      format: 'csr',
      numRows,
      numCols,
      starts,
      indices,
      values: new Array(indices.length).fill(1),
    },
    integrality: new Int32Array(numCols).fill(1),
  });
  try {
    model.options.set({ time_limit: timeLimit, mip_rel_gap: gap, output_flag: false });
    const warm = inst.columns.map((id, i) => (greedy.kept.has(id) ? i : -1)).filter((i) => i >= 0);
    if (warm.length) model.setSolution({ indices: warm, values: warm.map(() => 1) });
    const run = model.run();
    const status = statusName(h, run.modelStatus);
    const x = model.getSolution().colValue;
    const info = (name) => {
      try {
        return Number(model.info.get(name));
      } catch {
        return null;
      }
    };
    let kept = new Set([...inst.forced, ...flaky]);
    for (let i = 0; i < numCols; i++) if (x[i] > 0.5) kept.add(inst.columns[i]);
    // the solver decides, the analysis verifies: every row must be covered
    const feasible = inst.rows.every((row) => row.coverers.some((id) => kept.has(id)));
    const incumbent = feasible ? costOf(kept) : Infinity;
    const dual = info('mip_dual_bound');
    let method = 'mip';
    if (!feasible || incumbent > base.greedyCost) {
      kept = greedy.kept;
      method = 'greedy';
    }
    const cost = costOf(kept);
    // the solver's bound is on the reduced model; the forced tests' cost sits outside it
    const dualBound = dual === null ? null : Math.min(costOf(inst.forced) + dual / 1000, cost);
    return finish(kept, {
      method,
      status,
      incumbentCost: cost,
      dualBound,
      gapPct:
        dualBound === null || cost === 0
          ? null
          : Math.round(((cost - dualBound) / cost) * 10000) / 100,
      nodes: info('mip_node_count'),
    });
  } finally {
    model.dispose();
  }
}

function statusName(h, code) {
  const table = h.constants?.modelStatus ?? {};
  for (const [name, value] of Object.entries(table)) if (value === code) return name;
  return String(code);
}
