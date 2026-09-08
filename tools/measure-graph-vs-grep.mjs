// Measures what an answer costs with the knowledge graph against what the same
// answer costs by searching and reading the backend source, and writes the
// figures to src/app/feature/survey/showcases/graph-cost-data.ts for the
// survey's graph card. Nothing on that card is typed by hand.
//
// Four questions an engineer (or an agent) actually asks. For each:
//   graph  — the one-hop answer over the exported CheckItOutSystem graph
//            (graph-topology-data.ts, the same data the map draws): how many
//            nodes come back and how many characters they carry, timed in
//            memory (a Neo4j one-hop is single-digit milliseconds; this is the
//            size of the answer, not a database benchmark).
//   search — the plain route: find the term in checkItOut-be2/src/main/java,
//            then read the files that matched. Files, lines, bytes, and the
//            wall time of the search on this machine.
// Tokens are approximated as characters / 4, and said so on the card.
//
//   node tools/measure-graph-vs-grep.mjs           # backend at ../checkItOut-be2
//   BE_REPO=path node tools/measure-graph-vs-grep.mjs
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const FE = join(here, '..');
const BE = process.env['BE_REPO'] ?? join(FE, '..', 'checkItOut-be2');
const SRC = join(BE, 'src', 'main', 'java');
const DATA = join(FE, 'src', 'app', 'feature', 'survey', 'showcases', 'graph-topology-data.ts');
const OUT = join(FE, 'src', 'app', 'feature', 'survey', 'showcases', 'graph-cost-data.ts');

// ---- the graph, as the map has it ----
const ts = readFileSync(DATA, 'utf8');
const graph = JSON.parse(ts.slice(ts.indexOf('= {') + 2, ts.lastIndexOf('as const')).trim());
const leafById = new Map(graph.leaves.map((l) => [l.id, l]));
const byName = new Map(graph.leaves.map((l) => [l.name, l]));
const chars = (rows) => rows.reduce((n, r) => n + r.length, 0);

/** Each question: the graph query as a function returning the text an agent
 * would get, and the search terms an engineer would grep for. */
const QUESTIONS = [
  {
    key: 'dependents',
    graph: () => {
      const me = byName.get('SubscriptionService');
      const edges = graph.edges.filter((e) => e.from === me.id || e.to === me.id);
      return edges.map((e) => `${leafById.get(e.from).name} -${e.type}-> ${leafById.get(e.to).name}: ${e.ai_context}`);
    },
    hops: 1,
    terms: ['SubscriptionService'],
  },
  {
    key: 'billing',
    graph: () => graph.leaves.filter((l) => l.domain === 'billing').map((l) => `${l.name}: ${l.ai_description}`),
    hops: 1,
    terms: ['Stripe', 'Fakturownia', 'Invoice'],
  },
  {
    key: 'consent',
    graph: () => {
      const target = byName.get('ConsentCookieService');
      return graph.edges
        .filter((e) => e.to === target.id && e.type === 'PROTECTS')
        .map((e) => `${leafById.get(e.from).name} -PROTECTS-> ${target.name}: ${e.ai_context}`);
    },
    hops: 1,
    terms: ['ConsentCookie', 'Hmac'],
  },
  {
    key: 'scheduled',
    graph: () => graph.leaves.filter((l) => l.role === 'lifecycle' || /Cron/.test(l.name)).map((l) => `${l.name}: ${l.ai_description}`),
    hops: 1,
    terms: ['@Scheduled'],
  },
];

// ---- the source tree, walked once ----
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (name.endsWith('.java')) out.push({ path: p, size: st.size });
  }
  return out;
}
const files = walk(SRC);
const backendBytes = files.reduce((n, f) => n + f.size, 0);
/** grep -l: every file containing any of the terms, with matching line count,
 * timed as a cold read of the whole tree (the honest cost of a first search). */
function search(terms) {
  const t0 = performance.now();
  let matched = 0;
  let lines = 0;
  let bytes = 0;
  for (const f of files) {
    const text = readFileSync(f.path, 'utf8');
    let hit = false;
    for (const line of text.split('\n')) {
      if (terms.some((t) => line.includes(t))) {
        lines++;
        hit = true;
      }
    }
    if (hit) {
      matched++;
      bytes += f.size;
    }
  }
  return { files: matched, lines, bytes, ms: Math.round(performance.now() - t0) };
}
function timeGraph(fn) {
  const runs = 2000;
  const t0 = performance.now();
  let rows = [];
  for (let i = 0; i < runs; i++) rows = fn();
  return { rows, us: Math.round(((performance.now() - t0) / runs) * 1000) };
}

const questions = QUESTIONS.map((q) => {
  const g = timeGraph(q.graph);
  const s = search(q.terms);
  const gChars = chars(g.rows);
  return {
    key: q.key,
    graph: { hops: q.hops, nodes: g.rows.length, chars: gChars, tokens: Math.round(gChars / 4), us: g.us },
    search: { terms: q.terms, files: s.files, lines: s.lines, bytes: s.bytes, tokens: Math.round(s.bytes / 4), ms: s.ms },
    ratio: Math.round(s.bytes / 4 / Math.max(1, gChars / 4)),
  };
});
const data = {
  measuredAt: new Date().toISOString().slice(0, 10),
  backend: { root: relative(join(BE, '..'), SRC).replace(/\\/g, '/'), javaFiles: files.length, bytes: backendBytes },
  questions,
};
const out = `// GENERATED by tools/measure-graph-vs-grep.mjs — what an answer costs with the graph
// against searching and reading the backend source. Re-run to re-measure. Do not edit.

export interface GraphCostQuestion {
  readonly key: string;
  readonly graph: { readonly hops: number; readonly nodes: number; readonly chars: number; readonly tokens: number; readonly us: number };
  readonly search: { readonly terms: readonly string[]; readonly files: number; readonly lines: number; readonly bytes: number; readonly tokens: number; readonly ms: number };
  readonly ratio: number;
}
export interface GraphCostData {
  readonly measuredAt: string;
  readonly backend: { readonly root: string; readonly javaFiles: number; readonly bytes: number };
  readonly questions: readonly GraphCostQuestion[];
}

// prettier-ignore
export const GRAPH_COST: GraphCostData = ${JSON.stringify(data, null, 1)} as const;
`;
writeFileSync(OUT, out);
console.log(`backend: ${files.length} Java files, ${(backendBytes / 1024).toFixed(0)} KB under ${data.backend.root}`);
for (const q of questions) {
  console.log(
    `${q.key.padEnd(10)} graph ${q.graph.nodes} nodes / ~${q.graph.tokens} tokens / ${q.graph.us} µs   search ${q.search.files} files / ${q.search.lines} lines / ${(q.search.bytes / 1024).toFixed(0)} KB / ~${q.search.tokens} tokens / ${q.search.ms} ms   ×${q.ratio}`,
  );
}
console.log(`wrote ${OUT}`);
