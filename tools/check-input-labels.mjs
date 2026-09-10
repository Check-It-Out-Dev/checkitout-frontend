#!/usr/bin/env node
/**
 * Every form control in the application has an accessible name.
 *
 * Sonar reports 67 of these (Web:InputWithoutLabelCheck) and 66 of them are not real: those inputs
 * sit inside an Angular Material `<mat-form-field>` with a `<mat-label>`, and Material wires
 * `aria-labelledby` from one to the other at runtime. A static HTML checker cannot see a runtime
 * association, so it reports every one. Adding `aria-label` to all 67 to quiet it would
 * double-announce -- the label element and the attribute both -- and leave the page worse to listen
 * to than it is now.
 *
 * The answer to a checker that does not understand the framework is not to contort the code around
 * it. It is to state the rule the code actually follows and enforce that instead, which is what this
 * does. A control is named when any of these holds:
 *
 *   1. it carries aria-label or aria-labelledby, static or bound;
 *   2. it is inside a <mat-form-field> that contains a <mat-label>;
 *   3. it has an id with a matching <label for="..."> in the same template;
 *   4. a <label> wraps it;
 *   5. it is type="hidden", which is not a control at all.
 *
 * Anything else fails, so a new unlabelled input fails at commit time instead of appearing in a
 * report nobody reads.
 */
import { readFileSync, globSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const CONTROLS = new Set(['input', 'textarea', 'select']);
const WINDOWS_SEPARATOR = String.fromCharCode(92);

/** Tags in document order, with their attribute text and whether they close. */
function scanTags(html) {
  const tags = [];
  const re = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)(\/?)>/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    tags.push({
      closing: m[1] === '/',
      name: m[2].toLowerCase(),
      attrs: m[3] ?? '',
      selfClosing: m[4] === '/',
      index: m.index,
    });
  }
  return tags;
}

function lineOf(html, index) {
  return html.slice(0, index).split('\n').length;
}

/** static, [bound] and [attr.bound] spellings all count as present. */
function hasAttr(attrs, name) {
  return (
    new RegExp('(^|\\s)' + name + '\\s*=', 'i').test(attrs) ||
    new RegExp('(^|\\s)\\[' + name + '\\]\\s*=', 'i').test(attrs) ||
    new RegExp('(^|\\s)\\[attr\\.' + name + '\\]\\s*=', 'i').test(attrs)
  );
}

function attrValue(attrs, name) {
  const m = attrs.match(new RegExp('(^|\\s)' + name + '\\s*=\\s*"([^"]*)"', 'i'));
  return m ? m[2] : null;
}

function unlabelledIn(html) {
  const tags = scanTags(html);

  const labelFor = new Set();
  for (const t of tags) {
    if (t.name === 'label' && !t.closing) {
      const f = attrValue(t.attrs, 'for');
      if (f) labelFor.add(f);
    }
  }

  const problems = [];
  let formFieldDepth = 0;
  let formFieldHasLabel = false;
  let labelWrapDepth = 0;

  for (const t of tags) {
    if (t.name === 'mat-form-field') {
      if (t.closing) formFieldDepth = Math.max(0, formFieldDepth - 1);
      else if (!t.selfClosing) {
        formFieldDepth += 1;
        formFieldHasLabel = false;
      }
      continue;
    }
    if (t.name === 'mat-label' && !t.closing) {
      formFieldHasLabel = true;
      continue;
    }
    if (t.name === 'label') {
      if (t.closing) labelWrapDepth = Math.max(0, labelWrapDepth - 1);
      else if (!t.selfClosing) labelWrapDepth += 1;
      continue;
    }
    if (t.closing || !CONTROLS.has(t.name)) continue;

    const type = (attrValue(t.attrs, 'type') ?? '').toLowerCase();
    if (type === 'hidden') continue;
    if (hasAttr(t.attrs, 'aria-label') || hasAttr(t.attrs, 'aria-labelledby')) continue;
    if (formFieldDepth > 0 && formFieldHasLabel) continue;
    if (labelWrapDepth > 0) continue;

    const id = attrValue(t.attrs, 'id');
    if (id && labelFor.has(id)) continue;

    problems.push({ tag: t.name, index: t.index, type });
  }
  return problems;
}

const templates = globSync('src/app/**/*.html', { cwd: ROOT }).sort((a, b) =>
  a < b ? -1 : a > b ? 1 : 0,
);

let controls = 0;
const failures = [];
for (const rel of templates) {
  const html = readFileSync(join(ROOT, rel), 'utf8');
  controls += scanTags(html).filter((t) => !t.closing && CONTROLS.has(t.name)).length;
  const shown = relative(ROOT, rel).split(WINDOWS_SEPARATOR).join('/');
  for (const p of unlabelledIn(html)) {
    const withType = p.type ? p.tag + ' type="' + p.type + '"' : p.tag;
    failures.push(shown + ':' + lineOf(html, p.index) + '  <' + withType + '>');
  }
}

if (failures.length === 0) {
  console.log(
    `check:input-labels OK — ${controls} form control(s) across ${templates.length} template(s), every one with an accessible name.`,
  );
  process.exit(0);
}

console.error(`check:input-labels FAILED — ${failures.length} control(s) with no accessible name:`);
for (const f of failures) console.error(`  ${f}`);
console.error(
  '\n  Give it a <mat-label> inside its <mat-form-field>, an aria-label, or a <label for="...">.',
);
process.exit(1);
