#!/usr/bin/env node
/**
 * Four things a YAML parser and `bash -n` both wave through. The first took a release chain down
 * for six hours without producing a single line of log; the third quietly switched half of a
 * dashboard off for a day and kept every job green while it did; the fourth is the one that would
 * not announce itself at all.
 *
 * 1. A DUPLICATE KEY in a step's `env:` block. YAML libraries keep the last one silently -- js-yaml
 *    and PyYAML both do -- so the file parses, the shell script parses, and every local check is
 *    green. GitHub's own validator rejects it, and the run it rejects has zero jobs and no log: it
 *    shows up only as a red row named after the workflow's own path. The way this got in was a
 *    mechanical rewrite that bound `${{ }}` expressions to env vars and derived each name from the
 *    last path segment, so `steps.check.outputs.errors`, `steps.format.outputs.errors` and
 *    `steps.templates.outputs.errors` all became OUT_ERRORS. Even had GitHub accepted it, the shell
 *    below summed one value three times and labelled it three different ways.
 *
 * 2. A SINGLE-QUOTED expansion, `VAR='${OTHER}'`. In bash that is a literal seven-character string,
 *    not the value. It is the natural output of rewriting `VAR='${{ inputs.x }}'` -- where the
 *    single quotes were doing real work, keeping the interpolated JSON in one word -- into an env
 *    reference, where they now prevent the expansion entirely. Downstream `jq` gets the string
 *    "${IN_CONFIG_JSON}" and fails somewhere far from the cause.
 *
 * 3. A LITERAL BACKSLASH-N where a line continuation was meant: `foo \n            bar`, the two
 *    characters rather than a real newline. It is what an editing script leaves behind when its own
 *    escaping collapses, and the eye reads it as a wrapped line. bash reads `\n` as an escaped `n`,
 *    so the command gains a bare argument `n` and the flags after it land somewhere the tool never
 *    looks. Nothing fails: the step exits 0, the job is green, and those flags simply had no
 *    effect. That is how the backend's dashboard came to trend tests and coverage but never
 *    mutation or security, with `--mutation` and `--security` sitting right there in the workflow.
 *
 * 4. AN ACTION ON A MUTABLE REF, `uses: owner/action@v4`. A tag is a pointer its owner can move,
 *    so the step that ran yesterday is not necessarily the step that runs today, and a compromised
 *    or retagged action executes with whatever the job's token can reach. Pinning to the commit
 *    SHA is what makes a workflow reproducible and what a supply-chain review asks for first.
 *    Semgrep's github-actions-mutable-action-tag finds these, but only in the security tier and
 *    only as a warning, and by then the change is on main; this is the same check on the PR gate.
 *    Keep the version in a trailing comment -- `@<sha>  # v4.38.0` -- because the SHA is the
 *    contract and the comment is how a human reads it. Local `./.github/workflows/...` references
 *    and `docker://` images are not tags and are left alone.
 *
 * Scans every workflow in the repositories given on the command line (default: this one).
 *
 *   node tools/ci/check-workflow-env.mjs [repoRoot ...]
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const roots = process.argv.slice(2);
if (!roots.length) roots.push('.');

/** `env:` blocks are found by indentation rather than by parsing, because the parser is the thing
 *  that hides the bug: it collapses the duplicate before anyone can see it. */
function duplicateEnvKeys(text) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const found = [];
  for (let i = 0; i < lines.length; i++) {
    const open = /^(\s*)env:\s*$/.exec(lines[i]);
    if (!open) continue;
    const indent = open[1].length;
    const seen = new Map();
    let j = i + 1;
    for (; j < lines.length; j++) {
      const line = lines[j];
      if (line.trim() === '') continue;
      const ind = line.length - line.trimStart().length;
      if (ind <= indent) break;
      const key = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*:/.exec(line);
      if (key) {
        const at = seen.get(key[1]) || [];
        at.push(j + 1);
        seen.set(key[1], at);
      }
    }
    for (const [key, at] of seen) if (at.length > 1) found.push({ key, at });
    i = j - 1;
  }
  return found;
}

/** A single-quoted `${VAR}` that is NOT already inside a double-quoted string on the same line.
 *  `echo "value: '${VAR}'"` is fine -- the outer quotes expand and the inner ones are decoration. */
function deadSingleQuotedExpansions(text) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const found = [];
  lines.forEach((line, idx) => {
    const m = /'\$\{[A-Za-z_][A-Za-z0-9_]*\}'/.exec(line);
    if (!m) return;
    const before = line.slice(0, m.index);
    const doubleQuotesBefore = (before.match(/"/g) || []).length;
    if (doubleQuotesBefore % 2 === 1) return; // inside a double-quoted string: expands fine
    found.push({ line: idx + 1, text: line.trim() });
  });
  return found;
}

/** A literal backslash-n with whitespace on both sides. Inside quotes it is a legitimate escape
 *  (`printf 'a\nb'`, `tr '\n' ' '`), so the quote parity before it has to be even on both kinds of
 *  quote, which is the same test the rule above uses. */
function literalBackslashN(text) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const found = [];
  lines.forEach((line, idx) => {
    const m = /\s\\n\s/.exec(line);
    if (!m) return;
    const before = line.slice(0, m.index + 1);
    if ((before.match(/'/g) || []).length % 2 === 1) return;
    if ((before.match(/"/g) || []).length % 2 === 1) return;
    found.push({ line: idx + 1, text: line.trim() });
  });
  return found;
}

/** `uses:` on anything that is not a 40-hex commit SHA. Local paths and docker images are not
 *  pinnable refs and are skipped; everything else has to name a commit. */
function mutableActionRefs(text) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const found = [];
  lines.forEach((line, idx) => {
    const m = /^\s*(?:-\s*)?uses:\s*(\S+)/.exec(line);
    if (!m) return;
    const ref = m[1].replace(/^['"]|['"]$/g, '');
    if (ref.startsWith('./') || ref.startsWith('docker://')) return;
    const at = ref.lastIndexOf('@');
    if (at < 0) {
      found.push({ line: idx + 1, ref, why: 'no ref at all' });
      return;
    }
    const version = ref.slice(at + 1);
    if (!/^[0-9a-f]{40}$/.test(version)) {
      found.push({ line: idx + 1, ref, why: `@${version} is a tag or branch, not a commit` });
    }
  });
  return found;
}

let problems = 0;
let scanned = 0;
for (const root of roots) {
  const dir = join(root, '.github', 'workflows');
  if (!existsSync(dir)) continue;
  for (const name of readdirSync(dir).filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'))) {
    const path = join(dir, name);
    const text = readFileSync(path, 'utf8');
    scanned++;
    for (const d of duplicateEnvKeys(text)) {
      problems++;
      console.error(
        `${path}: env key ${d.key} defined ${d.at.length} times (lines ${d.at.join(', ')}) — ` +
          `GitHub rejects the workflow with a zero-job startup failure and no log`,
      );
    }
    for (const d of deadSingleQuotedExpansions(text)) {
      problems++;
      console.error(
        `${path}:${d.line}: single-quoted expansion never expands in bash — ${d.text}`,
      );
    }
    for (const d of literalBackslashN(text)) {
      problems++;
      console.error(
        `${path}:${d.line}: literal backslash-n where a line continuation was meant — bash ` +
          `passes a bare argument \`n\` and silently drops the flags after it — ${d.text}`,
      );
    }
    for (const d of mutableActionRefs(text)) {
      problems++;
      console.error(
        `${path}:${d.line}: ${d.ref} is not pinned to a commit SHA — ${d.why} — a tag is a ` +
          `pointer its owner can move, so pin the SHA and keep the version in a trailing comment`,
      );
    }
  }
}

if (problems) {
  console.error(`\ncheck:workflow-env FAILED — ${problems} problem(s) across ${scanned} workflow(s).`);
  process.exit(1);
}
console.log(
  `check:workflow-env OK — ${scanned} workflow(s): no duplicate env keys, no dead expansions,` +
    ` no literal backslash-n, every action pinned to a commit.`,
);
