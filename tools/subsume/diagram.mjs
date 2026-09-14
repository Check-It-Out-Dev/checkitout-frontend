/**
 * The picture a reviewer sees: one Mermaid subgraph per test class that would lose a test, the
 * demoted tests dashed, an edge to the test that carries each of them, the edge labelled with
 * what is carried. One level of abstraction and no more (GOVERNING-MACHINE-WRITTEN-CHANGE.md §4).
 *
 * Shape, after the first render on GitHub came out as a column of tall boxes holding full test
 * ids: left to right, demoted → carrier; inside a class box a test is named by its method (or its
 * Jest name), a carrier from another class by class and method, every label cut at 48 characters
 * with the full ids in the report; at most six classes and four rows each, the rest in a table
 * beneath, so the comment stays readable on a phone. Generated from subsume-report.json only —
 * never edited by hand, never by a model.
 */
import { short } from './ident.mjs';

const MAX_SUBGRAPHS = 6;
const MAX_PER_CLASS = 4;
const MAX_LABEL = 48;

export function diagram(report) {
  const byUnit = new Map();
  for (const c of report.candidates) {
    if (c.tier !== 'CONFIRMED') continue;
    if (!byUnit.has(c.unit)) byUnit.set(c.unit, []);
    byUnit.get(c.unit).push(c);
  }
  const units = [...byUnit].sort((a, b) => b[1].length - a[1].length);
  if (units.length === 0) return '_No test leaves the pull-request tier in this change._\n';

  const ids = new Map();
  const nodeId = (key) => {
    if (!ids.has(key)) ids.set(key, `n${ids.size}`);
    return ids.get(key);
  };
  const declared = new Set();
  const lines = ['```mermaid', 'flowchart LR'];
  const foreign = []; // carriers from other classes, declared once outside every box
  const shown = units.slice(0, MAX_SUBGRAPHS);
  for (const [unit, cs] of shown) {
    lines.push(`  subgraph ${nodeId('unit:' + unit)}["${esc(label(unit))}"]`, '    direction LR');
    for (const c of cs.slice(0, MAX_PER_CLASS)) {
      const a = nodeId(c.test);
      lines.push(`    ${a}["${esc(nodeLabel(c.test, unit))}"]:::demoted`);
      declared.add(a);
      const carrier = c.subsumedBy[0];
      if (!carrier) continue;
      const b = nodeId(carrier);
      if (sameUnit(carrier, unit)) {
        if (!declared.has(b)) lines.push(`    ${b}["${esc(nodeLabel(carrier, unit))}"]`);
      } else if (!declared.has(b)) foreign.push(`  ${b}["${esc(nodeLabel(carrier, unit))}"]`);
      declared.add(b);
      lines.push(`    ${a} -- "${c.why.probes.own} probes · ${c.why.kills.own} kills" --> ${b}`);
    }
    if (cs.length > MAX_PER_CLASS)
      lines.push(`    ${nodeId(unit + '#more')}["… ${cs.length - MAX_PER_CLASS} more"]:::demoted`);
    lines.push('  end');
  }
  lines.push(...foreign, '  classDef demoted stroke-dasharray: 4 3', '```', '');
  if (units.length > MAX_SUBGRAPHS) {
    lines.push('| Class | Demoted | Carried by |', '| --- | --- | --- |');
    for (const [unit, cs] of units.slice(MAX_SUBGRAPHS)) {
      const carriers = new Set(cs.flatMap((c) => c.subsumedBy));
      lines.push(`| \`${label(unit)}\` | ${cs.length} | ${carriers.size} tests |`);
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

/** The short id split into its class part and its own part (`#method()` or the Jest name). */
function parts(test) {
  const s = short(test);
  const i = s.includes(' :: ') ? s.indexOf(' :: ') : s.lastIndexOf('#');
  if (i < 0) return { cls: '', own: s };
  return s.includes(' :: ')
    ? { cls: s.slice(0, i), own: s.slice(i + 4) }
    : { cls: s.slice(0, i), own: s.slice(i) };
}

function sameUnit(test, unit) {
  return label(parts(test).cls) === label(unit);
}

/** Inside its own class box a test is its method or name; from another class, class and method. */
function nodeLabel(test, unit) {
  const { cls, own } = parts(test);
  const text =
    sameUnit(test, unit) || !cls ? own : `${label(cls)} ${own.startsWith('#') ? '' : ':: '}${own}`;
  return cut(text, MAX_LABEL);
}

function cut(s, n) {
  return s.length <= n ? s : s.slice(0, n - 1).trimEnd() + '…';
}

function esc(s) {
  return s
    .replace(/"/g, '#quot;')
    .replace(/#(?!quot;)/g, '#35;')
    .replace(/[<>]/g, (c) => (c === '<' ? '#lt;' : '#gt;'));
}
