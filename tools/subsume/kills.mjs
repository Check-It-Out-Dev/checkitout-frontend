/** Kill-matrix views: what a set of tests kills, and which mutants have a single reliable killer. */
export function killsOf(matrix, testIds) {
  const out = new Set();
  for (const id of testIds) {
    const t = matrix.tests.get(id);
    if (!t || t.flaky) continue;
    for (const k of t.kills) out.add(k);
  }
  return out;
}

/** mutantId -> the one non-flaky test that kills it, for mutants with exactly one such killer. */
export function soleKillers(matrix) {
  const out = new Map();
  for (const [id, mu] of matrix.mutants) {
    const reliable = [...mu.killers].filter((k) => {
      const t = matrix.tests.get(k);
      return t && !t.flaky;
    });
    if (reliable.length === 1) out.set(id, reliable[0]);
  }
  return out;
}

/** Mutants `main` killed whose code is unchanged and no kept test kills any more. */
export function lostKills(matrix, keep, unchangedUnits) {
  const kept = killsOf(matrix, keep);
  const lost = [];
  for (const [id, mu] of matrix.mutants) {
    if (mu.status !== 'KILLED' && mu.status !== 'Killed') continue;
    if (unchangedUnits && !unchangedUnits.has(mu.unit)) continue;
    if (!kept.has(id))
      lost.push({ mutant: id, unit: mu.unit, line: mu.line, killedByOnBase: [...mu.killers] });
  }
  return lost;
}
