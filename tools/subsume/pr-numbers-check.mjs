#!/usr/bin/env node
/**
 * I5 — every number in the reviewer's comment appears in a report the gate produced. The reviewer
 * quotes; it never computes, estimates or rounds (tools/subsume/agent/reviewer.md). This step reads
 * the comment it posted and the reports it was given, and fails the job on the first number that
 * came from nowhere — a fabricated figure in a review is the one failure the story cannot afford.
 *
 *   node tools/subsume/pr-numbers-check.mjs --comment reports/review/comment.md --reports reports/review
 *
 * What counts as a number: a digit run with optional thousands separators and decimals, outside
 * fenced code (the diagrams are pasted from the reports and checked at their source), outside
 * URLs, and not one of the shapes that are names rather than measurements — I1…I5, #30, a date,
 * a commit hash, a clock time, a version. What counts as a source: every numeric leaf of every
 * JSON report, every numeric string in them, and every number in the markdown reports (gains.md,
 * diagram.md, pack.md), each also in its grouped form and rounded to one and two decimals, because
 * a step summary prints 5,190 for 5190 and 39.9 for 39.93.
 */
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, sep } from 'node:path';

const NOT_A_MEASUREMENT = [
  /\bI[1-5]\b/g, // the invariants' names
  /#\d+/g, // pull requests, issues, test-template invocations
  /\b\d{4}-\d{2}-\d{2}(?:T[\d:.]+Z?)?\b/g, // dates
  /\b(?=[0-9a-f]*[a-f])[0-9a-f]{7,40}\b/g, // commit hashes — with a letter in them, so a count of seven digits stays a count
  /\b\d{1,2}:\d{2}(?::\d{2})?\b/g, // clock times
  /\bv?\d+\.\d+\.\d+\b/g, // versions
  /\bround \d+\b/gi, // the round's ordinal
  /\b20[23]\d\b/g, // a year of this decade on its own — 2,014 tests is a count, not a year
];

/** Numbers in a text, as normalised strings: no separators, no sign. */
export function numbersIn(text) {
  let t = text.replace(/```[\s\S]*?```/g, ' ').replace(/https?:\/\/\S+/g, ' ');
  for (const re of NOT_A_MEASUREMENT) t = t.replace(re, ' ');
  return [...t.matchAll(/(?<![\w.])\d[\d,]*(?:\.\d+)?(?![\w.]|,\d)/g)].map((m) =>
    m[0].replace(/,/g, ''),
  );
}

const forms = (n) => {
  const out = new Set();
  const abs = Math.abs(n);
  out.add(String(abs));
  out.add(abs.toLocaleString('en-US'));
  out.add(abs.toFixed(1));
  out.add(abs.toFixed(2));
  out.add(String(Math.round(abs * 10) / 10));
  out.add(String(Math.round(abs * 100) / 100));
  out.add(String(Math.round(abs)));
  return [...out].map((s) => s.replace(/,/g, ''));
};

/** Every number a set of report files vouches for, in every form a summary might print it. */
export function vouchedBy(dir) {
  const set = new Set();
  const addValue = (v) => {
    if (typeof v === 'number' && Number.isFinite(v)) for (const f of forms(v)) set.add(f);
    else if (typeof v === 'string') for (const s of numbersIn(v)) set.add(s);
    else if (Array.isArray(v)) v.forEach(addValue);
    else if (v && typeof v === 'object') Object.values(v).forEach(addValue);
  };
  const walk = (d) => {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.json$/i.test(name)) {
        try {
          addValue(JSON.parse(readFileSync(p, 'utf8')));
        } catch {
          /* not a report */
        }
      } else if (/\.(md|txt|jsonl)$/i.test(name)) {
        // markdown reports and the probes: numbers inside fences count here — they are the source
        for (const s of numbersIn(readFileSync(p, 'utf8').replace(/```/g, ''))) set.add(s);
      }
    }
  };
  if (existsSync(dir)) walk(dir);
  return set;
}

/** The numbers of the comment that no report vouches for. */
export function unvouched(comment, vouched) {
  return [...new Set(numbersIn(comment))].filter((n) => !vouched.has(n)).sort();
}

const isMain =
  Boolean(process.argv[1]) && /pr-numbers-check\.mjs$/.test(process.argv[1].split(sep).join('/'));
if (isMain) {
  const arg = (name, dflt) => {
    const i = process.argv.indexOf(`--${name}`);
    return i > 0 ? process.argv[i + 1] : dflt;
  };
  const commentPath = arg('comment', 'reports/review/comment.md');
  if (!existsSync(commentPath)) {
    console.error(`I5: no comment at ${commentPath} — the reviewer wrote nothing`);
    process.exit(2);
  }
  const comment = readFileSync(commentPath, 'utf8');
  const vouched = vouchedBy(arg('reports', 'reports/review'));
  const bad = unvouched(comment, vouched);
  const line = bad.length
    ? `I5: FAIL — ${bad.length} number(s) in the review are in no report: ${bad.join(', ')}`
    : `I5: PASS — every number in the review is in a report (${vouched.size} vouched forms)`;
  console.log(line);
  if (process.env.GITHUB_STEP_SUMMARY)
    writeFileSync(process.env.GITHUB_STEP_SUMMARY, line + '\n', { flag: 'a' });
  process.exit(bad.length ? 1 : 0);
}
