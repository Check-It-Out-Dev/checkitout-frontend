#!/usr/bin/env node
/**
 * The report: what each process did, when, and whether anyone could see it.
 *
 * Two witnesses are collated here and they are deliberately independent.
 *
 *   • The machine half comes from `cut.json` — the per-animation-frame DOM
 *     stream. It is exact about time and blind about appearance: it knows a
 *     dialog was in the document and nothing about whether it was legible,
 *     covered, or gone in a tenth of a second.
 *
 *   • The seen half comes from `review/*.json` — agents reading labelled
 *     frames against the requirements in the process map. It is the opposite:
 *     good at "could a person read this", bad at exact time.
 *
 * Where they agree, the phase is done. Where they disagree — the DOM says the
 * state held and the frames do not show it, or the frames show something the
 * DOM never recorded — that row is the finding, and it is printed on its own.
 * This whole harness exists for that column.
 *
 * Runs with or without the review: with only `cut.json` you get the machine
 * half, which is worth having on its own.
 *
 *   node tools/film-report.mjs                      # the newest run
 *   node tools/film-report.mjs qa-film/2026-09-06
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const log = (m) => console.log(`\x1b[36m[report] ${m}\x1b[0m`);

function pickRun() {
  if (process.argv[2]) return resolve(process.argv[2]);
  const root = resolve('qa-film');
  if (!existsSync(root)) throw new Error('nothing has been filmed yet');
  const runs = readdirSync(root, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
  if (!runs.length) throw new Error('qa-film holds no runs');
  return join(root, runs.at(-1));
}

const tick = (b) => (b === true ? '[x]' : b === false ? '[ ]' : '[?]');
const ms = (n) => (n === null || n === undefined ? '—' : `${String(n)} ms`);

/** Every review verdict for a run, keyed by `<tour>/<path>/<step>`. */
function loadReviews(run) {
  const dir = join(run, 'review');
  const by = new Map();
  if (!existsSync(dir)) return by;
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
    try {
      const v = JSON.parse(readFileSync(join(dir, file), 'utf8'));
      by.set(`${v.tour}/${v.path}/${v.step}`, v);
    } catch (e) {
      log(`skipping ${file}: ${e.message}`);
    }
  }
  return by;
}

/**
 * The column this tool exists for.
 *
 * A requirement and an atomic check are two descriptions of one thing. When one
 * says yes and the other says no, one of them is wrong — and which one it is
 * cannot be decided from here, which is exactly why it gets printed rather than
 * resolved. Every finding of that shape today turned out to be worth chasing:
 * three were the app, and the rest were the instrument.
 */
function reconcile(cut, reviews) {
  const rows = [];
  for (const pack of cut.packs) {
    const v = reviews.get(`${cut.tour}/${cut.path}/${pack.step}`);
    if (!v) continue;
    const atomicHere = cut.atomic.filter((a) => a.phase === `${cut.tour}/${pack.step}`);
    const domSaysYes = atomicHere.length > 0 && atomicHere.every((a) => a.met);
    const seenSaysYes = v.verdict === 'pass';
    if (domSaysYes !== seenSaysYes) {
      rows.push({
        phase: `${cut.tour}/${pack.step}`,
        path: cut.path,
        dom: domSaysYes ? 'held' : 'did not hold',
        seen: v.verdict,
        unmetChecks: atomicHere.filter((a) => !a.met).map((a) => a.check),
        unmetRequirements: (v.checks ?? []).filter((c) => !c.met).map((c) => c.id),
        anomalies: v.anomalies ?? [],
      });
    }
  }
  return rows;
}

function filmSection(cut, reviews) {
  const out = [];
  out.push(`## ${cut.tour} — ${cut.path}`);
  out.push('');
  out.push(
    `${String(cut.framesCaptured)} frames over ${(cut.durationMs / 1000).toFixed(1)} s, ` +
      `${String(cut.framesSelected)} looked at. [movie](${cut.dir.replace(/\\/g, '/')}/movie.mp4)`,
  );
  out.push('');

  for (const pack of cut.packs) {
    const v = reviews.get(`${cut.tour}/${cut.path}/${pack.step}`);
    out.push(`### ${pack.step}  ·  ${ms(pack.fromMs)} → ${ms(pack.toMs)}`);
    out.push('');
    out.push(`> ${pack.says}`);
    out.push('');
    out.push('| | what | layer | when | evidence |');
    out.push('| --- | --- | --- | --- | --- |');

    for (const r of pack.requires) {
      const c = v?.checks?.find((x) => x.id === r.id);
      out.push(
        `| ${tick(c?.met)} | ${r.see} | seen | ${ms(c?.firstSeenMs)} | ${c?.frame ?? '—'} |`,
      );
    }
    for (const a of cut.atomic.filter((x) => x.phase === `${cut.tour}/${pack.step}`)) {
      out.push(`| ${tick(a.met)} | \`${a.check}\` (${a.kind}) | dom | ${ms(a.atMs)} | dom.jsonl |`);
    }
    out.push('');
    if (v?.anomalies?.length) {
      for (const an of v.anomalies) {
        out.push(`- **${an.severity ?? 'noted'}** — ${an.what} (${(an.frames ?? []).join(', ')})`);
      }
      out.push('');
    }
  }

  // The owner asked for this one by name.
  out.push('### how long the guide said it was working');
  out.push('');
  if (!cut.working.length) {
    out.push('It never did.');
  } else {
    out.push('| from | for | step |');
    out.push('| --- | --- | --- |');
    for (const w of cut.working) {
      out.push(`| ${ms(w.fromMs)} | ${ms(w.ms)} | ${String(w.step)} |`);
    }
    const longest = Math.max(...cut.working.map((w) => w.ms));
    const total = cut.working.reduce((n, w) => n + w.ms, 0);
    out.push('');
    out.push(
      `${String(cut.working.length)} intervals, ${ms(total)} in total, longest ${ms(longest)}.`,
    );
  }
  out.push('');

  // Things the visitor was told to read, and how long they were actually there.
  const unread = (cut.readable ?? []).filter((r) => !r.met);
  if ((cut.readable ?? []).length) {
    out.push('### long enough to read?');
    out.push('');
    out.push('| what | needs | longest unbroken | |');
    out.push('| --- | --- | --- | --- |');
    for (const r of cut.readable) {
      out.push(
        `| ${r.phase.split('/')[1]} · \`${r.requirement}\` | ${ms(r.needMs)} | ` +
          `${ms(r.longestMs)} | ${r.met ? 'yes' : '**no**'} |`,
      );
    }
    out.push('');
    if (unread.length) {
      out.push(
        `${String(unread.length)} thing(s) the tour asks the visitor to read were never on ` +
          'screen long enough to read.',
      );
      out.push('');
    }
  }

  if (cut.covering.length) {
    out.push('### moments the pill was drawn over words');
    out.push('');
    out.push('| from | for | step |');
    out.push('| --- | --- | --- |');
    for (const c of cut.covering) out.push(`| ${ms(c.fromMs)} | ${ms(c.ms)} | ${String(c.step)} |`);
    out.push('');
  }

  const gaps = reconcile(cut, reviews);
  if (gaps.length) {
    out.push('### where the DOM and the picture disagree');
    out.push('');
    for (const g of gaps) {
      out.push(
        `- **${g.phase}** — the DOM says the step ${g.dom}, the frames say \`${g.seen}\`.` +
          (g.unmetChecks.length ? ` Checks unmet: ${g.unmetChecks.join(', ')}.` : '') +
          (g.unmetRequirements.length
            ? ` Not visible: ${g.unmetRequirements.join(', ')}.`
            : ''),
      );
    }
    out.push('');
  }
  return out;
}

const run = pickRun();
const cutFile = join(run, 'cut.json');
if (!existsSync(cutFile)) throw new Error(`${cutFile} is missing — run tools/film-cut.mjs first`);
const { cuts } = JSON.parse(readFileSync(cutFile, 'utf8'));
const reviews = loadReviews(run);

const md = [
  `# The sandbox, filmed — ${run.replace(/\\/g, '/')}`,
  '',
  `${String(cuts.length)} films. ` +
    (reviews.size
      ? `${String(reviews.size)} phases reviewed against their frames.`
      : 'No frame review yet — the machine half only.'),
  '',
];

const allGaps = [];
for (const cut of cuts) {
  md.push(...filmSection(cut, reviews));
  allGaps.push(...reconcile(cut, reviews));
}

// What the agents found hard. Kept out of the verdicts on purpose: a model
// judging its own correctness is not worth much, but a model reporting which
// instruction it could not follow is worth a great deal, and mixing the two
// lets the second contaminate the first.
const friction = [...reviews.values()].flatMap((v) =>
  (v.selfReport?.friction ?? []).map((f) => ({ ...f, phase: `${v.tour}/${v.path}/${v.step}` })),
);
if (friction.length) {
  md.push('## what the review found hard');
  md.push('');
  md.push('| phase | kind | what |');
  md.push('| --- | --- | --- |');
  for (const f of friction) md.push(`| ${f.phase} | ${f.kind} | ${f.what} |`);
  md.push('');
}

writeFileSync(join(run, 'report.md'), md.join('\n'));
writeFileSync(
  join(run, 'report.json'),
  JSON.stringify({ run, films: cuts.length, reviewed: reviews.size, gaps: allGaps, friction }, null, 2),
);
log(`${join(run, 'report.md')} — ${String(allGaps.length)} DOM/picture disagreement(s)`);
