#!/usr/bin/env node
/**
 * PIT's full mutation matrix → kills.json (the contract in tools/subsume/README.md).
 *
 * Reads target/pit-reports/mutations.xml written with -DfullMutationMatrix=true, where every
 * mutation carries <killingTests>, <succeedingTests> and <coveringTests> as pipe-joined JUnit
 * unique ids prefixed with the top-level test class and a dot. The prefix is stripped so the id
 * is the same string the probe listener records. Each mutant gets a stable id from what defines
 * it — class, method, line, mutator, PIT's own index — and the sha256 of its source file as it
 * is on disk when this runs, which is what lets the invariants gate skip mutants whose code the
 * pull request changed.
 *
 *   node tools/subsume/pit-matrix.mjs --xml <mutations.xml> --root <backend repo> --out <kills.json> [--commit <sha>]
 *
 * No XML library: PIT writes one <mutation> element per line with a fixed set of child tags, and
 * a parser that assumes that shape is smaller than one that does not — the unit spec pins it.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, sep } from 'node:path';

export function parseMutations(xml) {
  const out = [];
  const re = /<mutation\b([^>]*)>([\s\S]*?)<\/mutation>/g;
  let m;
  while ((m = re.exec(xml))) {
    const attrs = Object.fromEntries(
      [...m[1].matchAll(/(\w+)='([^']*)'/g)].map((a) => [a[1], a[2]]),
    );
    const tag = (name) => {
      const t = m[2].match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`));
      return t ? t[1] : '';
    };
    const tests = (name) =>
      tag(name)
        .split('|')
        .filter(Boolean)
        .map((s) => decode(s.slice(Math.max(0, s.indexOf('[engine:')))));
    out.push({
      status: attrs.status,
      detected: attrs.detected === 'true',
      numberOfTestsRun: Number(attrs.numberOfTestsRun ?? 0),
      sourceFile: tag('sourceFile'),
      class: tag('mutatedClass'),
      method: tag('mutatedMethod') + tag('methodDescription'),
      line: Number(tag('lineNumber')),
      mutator: tag('mutator').replace(/^.*\./, ''),
      index: tag('index'),
      block: tag('block'),
      description: decode(tag('description')),
      killedBy: tests('killingTests'),
      succeededBy: tests('succeedingTests'),
      coveredBy: tests('coveringTests'),
    });
  }
  return out;
}

function decode(s) {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

export function mutantId(mu) {
  return createHash('sha1')
    .update([mu.class, mu.method, mu.line, mu.mutator, mu.index, mu.block].join('|'))
    .digest('hex')
    .slice(0, 12);
}

export function toKills(mutations, { root, commit, tool }) {
  const shas = new Map();
  const fileOf = (mu) => {
    const pkg = mu.class.split('.').slice(0, -1).join('/');
    return `src/main/java/${pkg}/${mu.sourceFile}`;
  };
  const shaOf = (file) => {
    if (!root) return null;
    if (!shas.has(file)) {
      const p = join(root, ...file.split('/'));
      shas.set(
        file,
        existsSync(p) ? createHash('sha256').update(readFileSync(p)).digest('hex') : null,
      );
    }
    return shas.get(file);
  };
  const mutants = {};
  for (const mu of mutations) {
    const file = fileOf(mu);
    mutants[mutantId(mu)] = {
      file,
      fileSha: shaOf(file),
      class: mu.class,
      method: mu.method,
      line: mu.line,
      mutator: mu.mutator,
      description: mu.description,
      status: mu.status,
      killedBy: mu.killedBy,
      coveredBy: mu.coveredBy,
    };
  }
  // A run without fullMutationMatrix writes <killingTest> (singular), which the parser does not
  // read; every KILLED mutant then has no killer, and the loader refuses the file.
  const killed = Object.values(mutants).filter((mu) => mu.status === 'KILLED');
  const fullMatrix = killed.length > 0 && killed.every((mu) => mu.killedBy.length > 0);
  return {
    schema: 1,
    repo: 'backend',
    commit: commit ?? null,
    tool,
    fullMatrix,
    generatedAt: new Date().toISOString(),
    mutants,
  };
}

export function summarize(kills) {
  const byStatus = {};
  const killers = new Set();
  let killedWithoutKiller = 0;
  let invocations = 0;
  for (const mu of Object.values(kills.mutants)) {
    byStatus[mu.status] = (byStatus[mu.status] ?? 0) + 1;
    if (mu.status === 'KILLED' && mu.killedBy.length === 0) killedWithoutKiller += 1;
    for (const t of mu.killedBy) {
      killers.add(t);
      if (t.includes('test-template-invocation')) invocations += 1;
    }
  }
  return {
    mutants: Object.keys(kills.mutants).length,
    byStatus,
    distinctKillers: killers.size,
    killedWithoutKiller,
    invocationKills: invocations,
  };
}

// Main-module detection without import.meta, which Jest's CommonJS transform leaves undefined.
const isMain =
  Boolean(process.argv[1]) && /pit-matrix\.mjs$/.test(process.argv[1].split(sep).join('/'));
if (isMain) {
  const arg = (name, dflt) => {
    const i = process.argv.indexOf(`--${name}`);
    return i > 0 ? process.argv[i + 1] : dflt;
  };
  const xmlPath = arg('xml', 'target/pit-reports/mutations.xml');
  const root = arg('root', process.cwd());
  const out = arg('out', 'target/subsume/kills.json');
  const commit = arg('commit', null);
  const xml = readFileSync(xmlPath, 'utf8');
  const mutations = parseMutations(xml);
  const kills = toKills(mutations, { root, commit, tool: 'pitest' });
  writeFileSync(out, JSON.stringify(kills));
  const s = summarize(kills);
  console.log(
    `pit-matrix: ${s.mutants} mutants ${JSON.stringify(s.byStatus)}; ${s.distinctKillers} distinct killing tests (${s.invocationKills} invocation-level kills); ${s.killedWithoutKiller} KILLED without a killer -> ${out}`,
  );
  if (s.killedWithoutKiller > 0 || s.mutants === 0) process.exit(1);
}
