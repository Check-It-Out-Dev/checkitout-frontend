// Generates src/app/feature/survey/showcases/graph-topology-data.ts from the
// Neo4j dump of the CheckItOutSystem namespace.
//
// The technical survey draws the knowledge graph the backend is modelled as:
// one NavigationMaster, fifteen domain navigators, 130 concrete components,
// and the 22 typed relationships between components — each node with the
// `ai_description` an agent reads there, each relationship with its
// `ai_context`. None of that is retyped: it is read from the dump the graph
// was exported to on 2026-09-06 (Neo4j itself was wiped that day) and copied
// here, descriptions cut at a sentence boundary so the survey chunk stays
// small. Re-run after restoring or re-modelling the namespace:
//
//   node tools/gen-graph-topology.mjs            # reads ~/.neo4j-backups/2026-09-06-full
//   NEO4J_DUMP=path/to/dump node tools/gen-graph-topology.mjs
import { createReadStream, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const DUMP = process.env['NEO4J_DUMP'] ?? join(homedir(), '.neo4j-backups', '2026-09-06-full');
const OUT = join(
  here,
  '..',
  'src',
  'app',
  'feature',
  'survey',
  'showcases',
  'graph-topology-data.ts',
);
const NS = 'CheckItOutSystem';
/** Bytes the generated file may take before gzip; the survey route is lazy but not free. */
const BUDGET = 80_000;
const DESC_MAX = 190;
const WHY_MAX = 120;
const PATH_MAX = 72;

/** Cut at the last sentence end (or word) that fits, with an ellipsis when cut. */
function clip(text, max) {
  const t = String(text ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  if (t.length <= max) return t;
  const head = t.slice(0, max);
  const sentence = Math.max(head.lastIndexOf('. '), head.lastIndexOf('; '));
  if (sentence > max * 0.45) return head.slice(0, sentence + 1);
  const word = head.lastIndexOf(' ');
  return head.slice(0, word > 0 ? word : max).trimEnd() + '…';
}
const slug = (s) =>
  String(s)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/** Stream a JSON-lines file; `keep` is a cheap substring pre-filter (nodes
 * carry the namespace in their props, relationships do not). */
async function readLines(file, onLine, keep = () => true) {
  const rl = createInterface({ input: createReadStream(file, { encoding: 'utf8' }) });
  for await (const line of rl) if (keep(line)) onLine(JSON.parse(line));
}

const nodes = new Map();
await readLines(
  join(DUMP, 'nodes.jsonl'),
  (n) => {
    if (n.props?.namespace === NS) nodes.set(n.id, n);
  },
  (line) => line.includes(NS),
);
const rels = [];
await readLines(join(DUMP, 'rels.jsonl'), (r) => {
  if (nodes.has(r.start) && nodes.has(r.end)) rels.push(r);
});

const byLabel = (label) => [...nodes.values()].filter((n) => n.labels.includes(label));
const [masterNode] = byLabel('NavigationMaster');
const navigators = byLabel('EntityNavigator');
const impls = byLabel('ConcreteImpl');
if (!masterNode || navigators.length === 0 || impls.length === 0) {
  throw new Error(`dump at ${DUMP} holds no ${NS} graph`);
}

/** `behavioral_category` holds the role's name; six of them, the paper's C/F/S/I/D/L. */
const ROLE = {
  controller: 'controller',
  configuration: 'configuration',
  security: 'security',
  implementation: 'implementation',
  diagnostics: 'diagnostics',
  lifecycle: 'lifecycle',
};
/** The first of a node's paths, without the repo prefix, its tail when long. */
function shortPath(p) {
  const first = String(p ?? '')
    .split(';')[0]
    .trim()
    .replace(/^checkItOut-(be2|fe-greenfield)\//, '');
  return first.length <= PATH_MAX ? first : '…' + first.slice(-PATH_MAX);
}
const domainOf = new Map(); // impl id -> navigator key
for (const r of rels) {
  if (r.type === 'IMPLEMENTS') domainOf.set(r.end, nodes.get(r.start).props.key);
}
const CAT_ORDER = ['app', 'infra', 'quality'];
const domains = navigators
  .map((n) => ({
    key: n.props.key,
    name: n.props.name,
    cat: n.props.category,
    ai_description: n.props.ai_description ?? '',
  }))
  .sort(
    (a, b) => CAT_ORDER.indexOf(a.cat) - CAT_ORDER.indexOf(b.cat) || a.name.localeCompare(b.name),
  );

const leafId = new Map(); // node id -> leaf id
const leaves = impls
  .map((n) => {
    const domain = domainOf.get(n.id);
    if (!domain) throw new Error(`${n.props.name} has no IMPLEMENTS parent`);
    const roleName = String(n.props.behavioral_category ?? '').toLowerCase();
    if (roleName && !ROLE[roleName]) throw new Error(`${n.props.name}: unknown role ${roleName}`);
    const id = `${domain}/${slug(n.props.name)}`;
    leafId.set(n.id, id);
    return {
      id,
      name: n.props.name,
      domain,
      role: roleName ? ROLE[roleName] : undefined,
      status: n.props.status ?? '',
      path: shortPath(n.props.path),
      ai_description: clip(n.props.ai_description, DESC_MAX),
      why: n.props.why ? clip(n.props.why, WHY_MAX) : undefined,
    };
  })
  .sort((a, b) => a.domain.localeCompare(b.domain) || a.name.localeCompare(b.name));
const seen = new Set();
for (const l of leaves) {
  if (seen.has(l.id)) throw new Error(`duplicate leaf id ${l.id}`);
  seen.add(l.id);
}
const edges = rels
  .filter((r) => r.type !== 'IMPLEMENTS' && r.type !== 'GUIDES')
  .map((r) => ({
    from: leafId.get(r.start),
    to: leafId.get(r.end),
    type: r.type,
    ai_context: r.props?.ai_context ?? '',
  }))
  .sort((a, b) => a.type.localeCompare(b.type) || a.from.localeCompare(b.from));

const master = {
  name: masterNode.props.name,
  angle: masterNode.props.angle ?? '',
  rebuilt: masterNode.props.rebuilt ?? '',
  ai_description: masterNode.props.ai_description ?? '',
};
const data = { master, domains, leaves, edges };
const body = JSON.stringify(data, null, 1);
const out = `// GENERATED by tools/gen-graph-topology.mjs from the Neo4j dump of ${NS}
// (${nodes.size} nodes, ${rels.length} relationships; descriptions cut at ${DESC_MAX} chars). Do not edit.

export type GraphCat = 'app' | 'infra' | 'quality';
export type GraphRole =
  | 'controller'
  | 'configuration'
  | 'security'
  | 'implementation'
  | 'diagnostics'
  | 'lifecycle';

export interface GraphMaster {
  readonly name: string;
  readonly angle: string;
  readonly rebuilt: string;
  readonly ai_description: string;
}
export interface GraphDomain {
  readonly key: string;
  readonly name: string;
  readonly cat: GraphCat;
  readonly ai_description: string;
}
export interface GraphLeaf {
  readonly id: string;
  readonly name: string;
  readonly domain: string;
  readonly role?: GraphRole;
  readonly status: string;
  readonly path: string;
  readonly ai_description: string;
  readonly why?: string;
}
export interface GraphEdge {
  readonly from: string;
  readonly to: string;
  readonly type: string;
  readonly ai_context: string;
}
export interface GraphData {
  readonly master: GraphMaster;
  readonly domains: readonly GraphDomain[];
  readonly leaves: readonly GraphLeaf[];
  readonly edges: readonly GraphEdge[];
}

// prettier-ignore
export const GRAPH_DATA: GraphData = ${body} as const;
`;
writeFileSync(OUT, out);
const size = statSync(OUT).size;
console.log(
  `wrote ${OUT}: ${domains.length} domains, ${leaves.length} leaves (${leaves.filter((l) => l.role).length} with a role), ${edges.length} edges — ${size} bytes`,
);
if (size > BUDGET) {
  console.error(`generated file is ${size} bytes, over the ${BUDGET} budget`);
  process.exit(1);
}
