/**
 * Exact-duplicate clusters: tests whose probe sets are identical. The cheapest signal there is,
 * and the one that needs the kill matrix most — identical execution says nothing about the
 * assertions. The representative of a cluster is its fastest member, then the first by name.
 */
import { createHash } from 'node:crypto';

import { realTests } from './load.mjs';

export function vectorHash(probes) {
  return createHash('sha1')
    .update([...probes].sort().join('\n'))
    .digest('hex')
    .slice(0, 16);
}

export function clusters(matrix) {
  const groups = new Map();
  for (const t of realTests(matrix)) {
    if (t.probes.size === 0) continue;
    const h = vectorHash(t.probes);
    if (!groups.has(h)) groups.set(h, []);
    groups.get(h).push(t);
  }
  const out = [];
  for (const [vector, members] of groups) {
    if (members.length < 2) continue;
    const sorted = [...members].sort(
      (a, b) => (a.seconds ?? Infinity) - (b.seconds ?? Infinity) || a.id.localeCompare(b.id),
    );
    out.push({
      vector,
      members: sorted.map((t) => t.id),
      representative: sorted[0].id,
      probes: sorted[0].probes.size,
    });
  }
  return out.sort(
    (a, b) => b.members.length - a.members.length || a.vector.localeCompare(b.vector),
  );
}
