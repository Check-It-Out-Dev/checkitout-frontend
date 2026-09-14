/**
 * The picture a reviewer sees: one Mermaid subgraph per class that would lose a test, demoted
 * tests dashed, an edge to each test that carries them, the edge labelled with what is carried.
 * One level of abstraction and no more (GOVERNING-MACHINE-WRITTEN-CHANGE.md §4). At most eight
 * subgraphs; the rest are listed in a table beneath, so the comment stays readable on a phone.
 * Generated from subsume-report.json only — never edited by hand, never by a model.
 */
import { short } from './ident.mjs';

const MAX_SUBGRAPHS = 8;
const MAX_PER_CLASS = 6;

const nodeId = (() => {
  const seen = new Map();
  return (id) => {
    if (!seen.has(id)) seen.set(id, `n${seen.size}`);
    return seen.get(id);
  };
})();

export function diagram(report) {
  const byUnit = new Map();
  for (const c of report.candidates) {
    if (c.tier !== 'CONFIRMED') continue;
    if (!byUnit.has(c.unit)) byUnit.set(c.unit, []);
    byUnit.get(c.unit).push(c);
  }
  const units = [...byUnit].sort((a, b) => b[1].length - a[1].length);
  if (units.length === 0) return '_No test leaves the pull-request tier in this change._\n';
  const lines = ['```mermaid', 'flowchart LR'];
  const shown = units.slice(0, MAX_SUBGRAPHS);
  for (const [unit, cs] of shown) {
    lines.push(`  subgraph ${nodeId('unit:' + unit)}["${esc(label(unit))}"]`);
    for (const c of cs.slice(0, MAX_PER_CLASS)) {
      const a = nodeId(c.test);
      lines.push(`    ${a}["${esc(short(c.test))}"]:::demoted`);
      for (const carrier of c.subsumedBy.slice(0, 2)) {
        const b = nodeId(carrier);
        lines.push(`    ${b}["${esc(short(carrier))}"]`);
        lines.push(`    ${a} -- "${c.why.probes.own} probes · ${c.why.kills.own} kills" --> ${b}`);
      }
    }
    if (cs.length > MAX_PER_CLASS)
      lines.push(`    ${nodeId(unit + '#more')}["… ${cs.length - MAX_PER_CLASS} more"]:::demoted`);
    lines.push('  end');
  }
  lines.push('  classDef demoted stroke-dasharray: 4 3', '```', '');
  if (units.length > MAX_SUBGRAPHS) {
    lines.push('| Class | Demoted | Carried by |', '| --- | --- | --- |');
    for (const [unit, cs] of units.slice(MAX_SUBGRAPHS)) {
      const carriers = new Set(cs.flatMap((c) => c.subsumedBy));
      lines.push(`| \`${unit}\` | ${cs.length} | ${carriers.size} tests |`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

/** A spec file's basename without its suffixes, or a Java class's simple name. */
function label(unit) {
  const isFile = unit.includes('/') || /\.[cm]?[jt]s$/.test(unit);
  if (isFile)
    return unit
      .split('/')
      .pop()
      .replace(/(\.unit)?\.spec\.[cm]?[jt]s$/, '');
  return unit.split('.').pop();
}

function esc(s) {
  return s.replace(/"/g, '#quot;').replace(/[<>]/g, (c) => (c === '<' ? '#lt;' : '#gt;'));
}
