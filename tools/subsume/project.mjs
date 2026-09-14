/**
 * Projection of a set of tests onto what they cover, per unit and per member — the view I1 is
 * checked on. For JUnit the probe map gives source lines and branch lines; for Jest the counts
 * are of statement, function and branch-path ids, which are exact for an unchanged file.
 */
export function project(matrix, testIds) {
  const units = new Map(); // unit -> { probes:Set, lines:Set, branches:Set, members: Map<member, {probes, lines, branches}> }
  for (const id of testIds) {
    const t = matrix.tests.get(id);
    if (!t) continue;
    for (const key of t.probes) {
      const p = matrix.probes.get(key);
      if (!p) continue;
      let u = units.get(p.unit);
      if (!u) {
        u = { probes: new Set(), lines: new Set(), branches: new Set(), members: new Map() };
        units.set(p.unit, u);
      }
      let m = u.members.get(p.member);
      if (!m) {
        m = { probes: new Set(), lines: new Set(), branches: new Set() };
        u.members.set(p.member, m);
      }
      u.probes.add(key);
      m.probes.add(key);
      for (const line of p.lines ?? []) {
        u.lines.add(line);
        m.lines.add(line);
      }
      if (p.branch) {
        u.branches.add(key);
        m.branches.add(key);
      }
    }
  }
  return units;
}

/** Per unit and member: does `head` cover at least what `base` covers? Returns the regressions. */
export function regressions(base, head) {
  const out = [];
  for (const [unit, b] of base) {
    const h = head.get(unit);
    const check = (member, bm, hm) => {
      const lost = [...bm.probes].filter((p) => !hm?.probes.has(p));
      if (lost.length) {
        out.push({
          unit,
          member,
          lostProbes: lost.length,
          lines: { base: bm.lines.size, head: hm?.lines.size ?? 0 },
          branches: { base: bm.branches.size, head: hm?.branches.size ?? 0 },
        });
      }
    };
    for (const [member, bm] of b.members) check(member, bm, h?.members.get(member));
  }
  return out;
}
