#!/usr/bin/env node
/**
 * Applies a round pack: every test it names is demoted from the pull-request tier — never
 * deleted — with a marker naming what carries it.
 *
 *   JUnit  `@Tag("subsumed")` above the method's annotations; surefire's `excludedGroups` in the
 *          backend's `test` profile leaves it out and the nightly passes
 *          `-Dsubsume.excludedGroups=never`. A tag, not @Disabled: junit-platform.properties
 *          deactivates every DisabledCondition on purpose.
 *   Jest   `it(` → `subsumed(it)(` — the global from setup-jest.ts that returns `it` under
 *          SUITE=nightly and `it.skip` otherwise.
 *
 * What it will not touch, and says so: a parameterised invocation (the method is one unit until
 * instance 1b), a test whose name is not a string literal, one already demoted, one it cannot
 * find where its id says it lives. The round file docs/testing/governance/round.json is the link
 * between the branch and the proposal run — a tracked file, never the pull-request body.
 *
 *   node tools/subsume/apply.mjs --repo backend|frontend --pack <pack.json> --root <repo>
 *        --round N --run-id <id> --base-commit <sha> [--dry-run]
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, sep } from 'node:path';

import ts from 'typescript';

import { short } from './ident.mjs';

// ── JUnit ─────────────────────────────────────────────────────────────────────────────────────

/** `[engine:…]/[class:com.x.Top]/[nested-class:A]/[method:m(java.lang.String)]/[test-template-invocation:#2]` */
export function parseJUnitId(id) {
  const cls = id.match(/\[class:([^\]]+)\]/);
  // a parameterised method is a [test-template:…], its runs [test-template-invocation:#n]
  const method = id.match(/\[(?:method|test-template):([^(\]]+)\(([^)]*)\)\]/);
  if (!cls || !method) return null;
  const chain = [...id.matchAll(/\[nested-class:([^\]]+)\]/g)].map((m) => m[1]);
  const invocation = id.match(/\[test-template-invocation:#(\d+)\]/);
  const parts = cls[1].split('.');
  const top = parts.pop();
  return {
    fqcn: cls[1],
    file: `src/test/java/${parts.join('/')}/${top}.java`,
    top,
    chain,
    method: method[1],
    params: method[2],
    invocation: invocation ? Number(invocation[1]) : null,
  };
}

const CLASS_DECL =
  /^\s*(?:(?:public|private|protected|static|final|abstract)\s+)*class\s+([A-Za-z0-9_$]+)/;
const braceCount = (line) => {
  const code = line
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/'(?:[^'\\]|\\.)*'/g, "''")
    .replace(/\/\/.*$/, '');
  let n = 0;
  for (const ch of code) n += ch === '{' ? 1 : ch === '}' ? -1 : 0;
  return n;
};

/**
 * Tags one test method in a Java source: the method `method` inside the nested-class chain
 * `chain` (outer to inner, top-level class excluded). Returns the new source and what happened.
 */
export function tagJavaMethod(source, chain, method, marker) {
  const eol = source.includes('\r\n') ? '\r\n' : '\n';
  const lines = source.split(eol);
  const stack = []; // { name, depth }
  let depth = 0;
  let target = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const decl = line.match(CLASS_DECL);
    if (decl) stack.push({ name: decl[1], depth });
    const inner = stack.slice(1).map((s) => s.name);
    if (
      target < 0 &&
      inner.length === chain.length &&
      inner.every((n, k) => n === chain[k]) &&
      new RegExp(
        `^\\s*(?:(?:public|protected|private|static|final)\\s+)*void\\s+${method}\\s*\\(`,
      ).test(line)
    ) {
      target = i;
      break;
    }
    depth += braceCount(line);
    while (stack.length && depth <= stack[stack.length - 1].depth && !decl) stack.pop();
  }
  if (target < 0) return { source, applied: false, reason: 'not-found' };
  // the annotation block: contiguous non-blank lines above that do not end a statement or a body
  let start = target;
  while (start > 0) {
    const prev = lines[start - 1].trim();
    if (prev === '' || /[;{}]$/.test(prev) || CLASS_DECL.test(prev)) break;
    start -= 1;
  }
  const block = lines.slice(start, target + 1).join('\n');
  if (/@Tag\(\s*"subsumed"\s*\)/.test(block)) return { source, applied: false, reason: 'already' };
  const indent = (lines[target].match(/^\s*/) ?? [''])[0];
  lines.splice(start, 0, `${indent}// subsumed-by: ${marker}`, `${indent}@Tag("subsumed")`);
  let out = lines.join(eol);
  if (!/^import org\.junit\.jupiter\.api\.Tag;/m.test(out)) {
    const imports = [...out.matchAll(/^import org\.junit\.jupiter\.api\.[^;]+;/gm)];
    const anchor = imports.length ? imports[imports.length - 1] : out.match(/^package [^;]+;/m);
    const at = anchor.index + anchor[0].length;
    out = `${out.slice(0, at)}${eol}import org.junit.jupiter.api.Tag;${out.slice(at)}`;
  }
  return { source: out, applied: true, reason: null };
}

// ── Jest ──────────────────────────────────────────────────────────────────────────────────────

/** Wraps one `it`/`test` call whose full name (describe names + own name) is `fullName`. */
export function wrapJestTest(source, fullName, marker) {
  const sf = ts.createSourceFile('spec.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  let hit = null;
  let reason = 'not-found';
  const nameOf = (arg) =>
    arg && (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg)) ? arg.text : null;
  // a name built at run time — `it(\`step ${id}: …\`)` in a loop — is one generator for many
  // tests; its static parts become a pattern, and a demoted test that matches it is reported as
  // `generated`: wrapping the generator would demote every test it makes, which is a person's edit
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patternOf = (arg) => {
    if (!arg) return '.*';
    if (ts.isTemplateExpression(arg))
      return [arg.head.text, ...arg.templateSpans.map((s) => s.literal.text)].map(esc).join('.*');
    return '.*';
  };
  const matchesGenerated = (stack, arg) =>
    new RegExp(
      `^${[...stack.map((s) => (s === null ? '.*' : esc(s))), patternOf(arg)].join(' ')}$`,
    ).test(fullName);
  // `it.each(table)('%s/%#: …', fn)` — Jest's parameterised test: the callee is itself a call, the
  // name a format (`%s` `%d` `%#` `$key`…); its runs are one unit until instance 1b, as a JUnit
  // [test-template-invocation] is, and a match is declined as `parameterized`
  const eachOf = (node) => {
    const e = node.expression;
    if (ts.isCallExpression(e)) {
      const m = e.expression.getText(sf).match(/^(describe|it|test)\.(?:only\.|skip\.)?each$/);
      if (m) return m[1];
    }
    if (ts.isTaggedTemplateExpression(e)) {
      const m = e.tag.getText(sf).match(/^(describe|it|test)\.(?:only\.|skip\.)?each$/);
      if (m) return m[1];
    }
    return null;
  };
  const formatPattern = (arg) => {
    const text = nameOf(arg);
    if (text === null) return '.*';
    return text
      .split(/%[sdifjo#%]|\$[A-Za-z_][\w.]*/)
      .map(esc)
      .join('.*');
  };
  const visit = (node, stack) => {
    if (hit) return;
    if (ts.isCallExpression(node)) {
      const each = eachOf(node);
      if (each === 'describe') {
        for (const arg of node.arguments) ts.forEachChild(arg, (c) => visit(c, [...stack, null]));
        return;
      }
      if (each) {
        const re = new RegExp(
          `^${[...stack.map((s) => (s === null ? '.*' : esc(s))), formatPattern(node.arguments[0])].join(' ')}$`,
        );
        if (reason === 'not-found' && re.test(fullName)) reason = 'parameterized';
        return;
      }
      const callee = node.expression.getText(sf);
      const name = nameOf(node.arguments[0]);
      if (/^(describe|fdescribe|xdescribe)$/.test(callee)) {
        // a dynamic describe name is a wildcard in the chain
        for (const arg of node.arguments) ts.forEachChild(arg, (c) => visit(c, [...stack, name]));
        return;
      }
      if (/^(it|test)$/.test(callee) || /^subsumed\((it|test)\)$/.test(callee)) {
        const wrapped = callee.startsWith('subsumed(');
        if (name === null || stack.includes(null)) {
          // a generator that could have made this name — unless a plainer reason is known
          if (
            reason === 'not-found' &&
            matchesGenerated(stack, name === null ? node.arguments[0] : null)
          )
            reason = name === null ? 'generated' : 'generated-describe';
          return;
        }
        if ([...stack, name].join(' ') === fullName) {
          if (wrapped) reason = 'already';
          else hit = node;
        }
        return;
      }
      if (
        /^(it|test)\.(skip|only|each|todo|failing)$/.test(callee) ||
        /^(xit|fit|xtest)$/.test(callee)
      ) {
        if (name !== null && [...stack, name].join(' ') === fullName) reason = 'not-a-plain-it';
        return;
      }
    }
    ts.forEachChild(node, (c) => visit(c, stack));
  };
  visit(sf, []);
  if (!hit) return { source, applied: false, reason };
  const stmt = hit.parent;
  const stmtStart = ts.isExpressionStatement(stmt) ? stmt.getStart(sf) : hit.getStart(sf);
  const lineStart = source.lastIndexOf('\n', stmtStart - 1) + 1;
  const indent = source.slice(lineStart, stmtStart).match(/^\s*/)[0];
  const calleeStart = hit.expression.getStart(sf);
  const calleeEnd = hit.expression.getEnd();
  const callee = source.slice(calleeStart, calleeEnd);
  const eol = source.includes('\r\n') ? '\r\n' : '\n';
  const out =
    source.slice(0, lineStart) +
    `${indent}// subsumed-by: ${marker}${eol}` +
    source.slice(lineStart, calleeStart) +
    `subsumed(${callee})` +
    source.slice(calleeEnd);
  return { source: out, applied: true, reason: null };
}

// ── The pack ──────────────────────────────────────────────────────────────────────────────────

/** Applies every taken test of `pack` under `root`; returns what was and was not applied. */
export function applyPack(pack, { repo, root, round, runId, baseCommit, dryRun = false }) {
  const byFile = new Map();
  const notApplied = [];
  const marker = (x) =>
    `${x.exactDuplicateOf ? short(x.exactDuplicateOf) : x.carriers.map(short).join(', ')} (round ${round})`;
  for (const x of pack.taken) {
    if (repo === 'backend') {
      const p = parseJUnitId(x.test);
      if (!p) {
        notApplied.push({ test: x.test, reason: 'unparseable-id' });
        continue;
      }
      if (p.invocation !== null) {
        notApplied.push({ test: x.test, reason: 'parameterized' });
        continue;
      }
      if (!byFile.has(p.file)) byFile.set(p.file, []);
      byFile.get(p.file).push({ x, p });
    } else {
      const i = x.test.indexOf(' :: ');
      if (i < 0) {
        notApplied.push({ test: x.test, reason: 'unparseable-id' });
        continue;
      }
      const file = x.test.slice(0, i);
      if (!byFile.has(file)) byFile.set(file, []);
      byFile.get(file).push({ x, fullName: x.test.slice(i + 4) });
    }
  }
  const applied = [];
  const files = [];
  for (const [file, items] of [...byFile].sort()) {
    const path = join(root, ...file.split('/'));
    if (!existsSync(path)) {
      for (const { x } of items) notApplied.push({ test: x.test, reason: 'file-missing' });
      continue;
    }
    let source = readFileSync(path, 'utf8');
    let changed = false;
    for (const item of items) {
      const r =
        repo === 'backend'
          ? tagJavaMethod(source, item.p.chain, item.p.method, marker(item.x))
          : wrapJestTest(source, item.fullName, marker(item.x));
      if (r.applied) {
        source = r.source;
        changed = true;
        applied.push(item.x.test);
      } else notApplied.push({ test: item.x.test, reason: r.reason });
    }
    if (changed) {
      files.push(file);
      if (!dryRun) writeFileSync(path, source);
    }
  }
  const roundFile = {
    schema: 1,
    repo,
    round,
    runId,
    baseCommit,
    proposalCommit: pack.commit ?? null,
    demoted: applied.sort(),
    notApplied: notApplied.sort((a, b) => a.test.localeCompare(b.test)),
    tiers: pack.tiers,
    provisional: pack.provisional ?? true,
  };
  if (!dryRun) {
    const dir = join(root, 'docs', 'testing', 'governance');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'round.json'), JSON.stringify(roundFile, null, 1) + '\n');
  }
  return { applied, notApplied, files, roundFile };
}

const isMain = Boolean(process.argv[1]) && /apply\.mjs$/.test(process.argv[1].split(sep).join('/'));
if (isMain) {
  const arg = (name, dflt) => {
    const i = process.argv.indexOf(`--${name}`);
    return i > 0 ? process.argv[i + 1] : dflt;
  };
  const pack = JSON.parse(readFileSync(arg('pack', 'reports/subsume/pack.json'), 'utf8'));
  const r = applyPack(pack, {
    repo: arg('repo', 'frontend'),
    root: arg('root', '.'),
    round: Number(arg('round', 1)),
    runId: arg('run-id', 'local'),
    baseCommit: arg('base-commit', null),
    dryRun: process.argv.includes('--dry-run'),
  });
  const reasons = {};
  for (const n of r.notApplied) reasons[n.reason] = (reasons[n.reason] ?? 0) + 1;
  console.log(
    `apply: ${r.applied.length} demoted in ${r.files.length} files${process.argv.includes('--dry-run') ? ' (dry run)' : ''}; not applied ${r.notApplied.length} ${JSON.stringify(reasons)}`,
  );
}
