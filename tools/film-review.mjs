#!/usr/bin/env node
/**
 * The review stage: prompts out, verdicts in, neither of them trusted blindly.
 *
 * A Claude Code subagent has no schema field — structured output is an API and
 * SDK feature, and a subagent hands its parent a final text message and nothing
 * else. So conformance here is prompting plus this: tolerant parsing, real
 * validation, and a re-prompt when it does not hold up. Assuming the platform
 * enforces the shape would be assuming something that is documented not to be
 * true.
 *
 * Two subcommands:
 *
 *   prompts   write one prompt per phase into review/pending/, ready to hand to
 *             an agent. Sheets and crops are named by absolute path; the
 *             tile→millisecond manifest is text, because a model is given no
 *             image metadata and cannot read a filename off a picture.
 *
 *   check     read review/*.json, validate every verdict against the pack it
 *             answers, and report what has to go back. A verdict that cites a
 *             tile which is not in its own manifest, or claims to have seen
 *             something without quoting any of it, is rejected here rather than
 *             carried into the report as evidence.
 *
 *   node tools/film-review.mjs prompts
 *   node tools/film-review.mjs check
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const log = (m) => console.log(`\x1b[36m[review] ${m}\x1b[0m`);

function pickRun() {
  const arg = process.argv[3];
  if (arg) return resolve(arg);
  const root = resolve('qa-film');
  if (!existsSync(root)) throw new Error('nothing has been filmed yet');
  const runs = readdirSync(root, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
  if (!runs.length) throw new Error('qa-film holds no runs');
  return join(root, runs.at(-1));
}

/** One prompt per phase. Paths absolute; the manifest in words, not filenames. */
function writePrompts(run) {
  const { cuts } = JSON.parse(readFileSync(join(run, 'cut.json'), 'utf8'));
  const out = join(run, 'review', 'pending');
  mkdirSync(out, { recursive: true });
  let n = 0;

  for (const cut of cuts) {
    for (const pack of cut.packs) {
      const dir = resolve(cut.dir);
      const sheets = pack.sheets.map((f) => join(dir, 'sheets', f));
      const crops = (pack.crops ?? []).map((c) => ({ ...c, path: join(dir, 'sheets', c.file) }));
      const body = [
        'Review one phase of a filmed demo tour.',
        '',
        '<phase>',
        `tour: ${cut.tour}`,
        `path: ${cut.path}`,
        `step: ${pack.step}`,
        '</phase>',
        '',
        '<says>',
        pack.says,
        '</says>',
        '',
        '<sheets>',
        'Read these in order. Each is a 3x3 grid of frames in time order, left to',
        'right then top to bottom, and every tile carries its frame number and',
        'millisecond burned into the top-left corner in yellow.',
        '',
        ...sheets,
        '</sheets>',
        '',
        ...(crops.length
          ? [
              '<crops>',
              'Magnified 2x, cut from the full-resolution frame. Use these for',
              'anything that has to be read rather than merely spotted.',
              '',
              ...crops.map(
                (c) => `${c.path}
    for requirement "${c.requirement}" — ${c.of}, tile ${c.frame}`,
              ),
              '</crops>',
              '',
            ]
          : []),
        '<manifest>',
        `The phase runs from ${String(pack.fromMs)} ms to ${String(pack.toMs)} ms.`,
        'Every tile label you may cite, in time order:',
        pack.frames.map((f) => f.frame).join(' '),
        '</manifest>',
        '',
        '<requires>',
        ...pack.requires.map(
          (r, i) =>
            `${String(i + 1)}. id "${r.id}" — ${r.see}` +
            // Only claim the machine is timing it when the machine can: the
            // requirement has to name the element whose lifetime answers it.
            (r.readableMs && r.via
              ? ` (how long it stayed on screen is measured separately — judge only whether it is legible)`
              : ''),
        ),
        '</requires>',
        '',
        'The interface is in Polish. Transcribe what you see; do not translate it.',
        '',
        '<write_your_answer_here>',
        join(run, 'review', `${cut.tour}-${cut.path}-${pack.step}.json`),
        '</write_your_answer_here>',
        '',
        'Follow your instructions exactly. Write the JSON object to the path',
        'above, then reply with one short line naming the file and your verdict.',
      ].join('\n');

      writeFileSync(join(out, `${cut.tour}-${cut.path}-${pack.step}.md`), body);
      n++;
    }
  }
  log(`${String(n)} prompt(s) → ${out}`);
}

/**
 * Validate a verdict against the pack it answers.
 *
 * Everything here is a cross-check the model cannot satisfy by being confident.
 * A tile it cites has to exist; a `yes` has to come with text it says it read;
 * an enum has to be one of the values. A model claim that contradicts a
 * deterministic measurement loses, and the point of checking is to notice.
 */
function validate(verdict, pack, tour, path) {
  const bad = [];
  const tiles = new Set(pack.frames.map((f) => f.frame));
  const wantedIds = new Set(pack.requires.map((r) => r.id));

  if (verdict.tour !== tour || verdict.path !== path || verdict.step !== pack.step) {
    bad.push('it answers a different phase than the one it was given');
  }
  if (!Array.isArray(verdict.checks)) {
    bad.push('no checks array');
    return bad;
  }
  const answered = new Set(verdict.checks.map((c) => c.id));
  for (const id of wantedIds) {
    if (!answered.has(id)) bad.push(`requirement "${id}" was not answered`);
  }
  for (const c of verdict.checks) {
    if (!wantedIds.has(c.id)) bad.push(`"${c.id}" is not one of this phase's requirements`);
    if (!['yes', 'no', 'cannot_tell'].includes(c.met)) {
      bad.push(`"${c.id}" has met="${String(c.met)}", which is not one of the three answers`);
    }
    if (c.firstTile && !tiles.has(c.firstTile)) {
      bad.push(`"${c.id}" cites tile ${c.firstTile}, which is not in this phase's manifest`);
    }
    if (c.met === 'yes' && !c.firstTile) {
      bad.push(`"${c.id}" says yes but names no tile`);
    }
  }
  if (!['pass', 'fail', 'uncertain'].includes(verdict.verdict)) {
    bad.push(`verdict "${String(verdict.verdict)}" is not one of pass/fail/uncertain`);
  }
  const anyNo = verdict.checks.some((c) => c.met === 'no');
  const anyUnsure = verdict.checks.some((c) => c.met === 'cannot_tell');
  const expected = anyNo ? 'fail' : anyUnsure ? 'uncertain' : 'pass';
  if (verdict.verdict !== expected) {
    bad.push(`verdict says "${String(verdict.verdict)}" but the checks add up to "${expected}"`);
  }
  return bad;
}

/** Strip a fence or a preamble; a model told not to add one still sometimes does. */
function parseLoosely(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1] : text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
  return JSON.parse(raw);
}

function check(run) {
  const { cuts } = JSON.parse(readFileSync(join(run, 'cut.json'), 'utf8'));
  const dir = join(run, 'review');
  if (!existsSync(dir)) throw new Error(`${dir} does not exist — nothing to check`);
  const packs = new Map();
  for (const cut of cuts) {
    for (const pack of cut.packs) packs.set(`${cut.tour}/${cut.path}/${pack.step}`, { cut, pack });
  }

  let ok = 0;
  const rejected = [];
  // Not `validation.json` — this used to write its own report into the very
  // directory it globs for verdicts, so every run after the first rejected its
  // own output and exited 1.
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.json') && f !== 'validation.json')) {
    let verdict;
    try {
      verdict = parseLoosely(readFileSync(join(dir, file), 'utf8'));
    } catch (e) {
      rejected.push({ file, why: [`not parseable as JSON: ${e.message}`] });
      continue;
    }
    const key = `${verdict.tour}/${verdict.path}/${verdict.step}`;
    const found = packs.get(key);
    if (!found) {
      rejected.push({ file, why: [`no pack called ${key} in this run`] });
      continue;
    }
    const why = validate(verdict, found.pack, found.cut.tour, found.cut.path);
    if (why.length) rejected.push({ file, why });
    else ok++;
  }

  log(`${String(ok)} verdict(s) stand, ${String(rejected.length)} to send back`);
  for (const r of rejected) {
    console.log(`  ${r.file}`);
    for (const w of r.why) console.log(`    - ${w}`);
  }
  writeFileSync(join(run, 'validation.json'), JSON.stringify({ ok, rejected }, null, 2));
  return rejected.length;
}

/**
 * One prompt per FILM for the motion critic, as against one per phase.
 *
 * The critic's subject is the whole film's feel, so it gets the machine's
 * motion numbers up front — how often each thing moved, how far, how often it
 * reversed, how long the screen held still — and then a handful of short runs
 * of consecutive frames around the roughest instants. Short on purpose: a model
 * given thirty-five images answers worse than one given five, and asking it to
 * hold a whole film in mind is asking for the failure mode rather than the
 * answer.
 */
function writeCriticPrompts(run) {
  const { cuts } = JSON.parse(readFileSync(join(run, 'cut.json'), 'utf8'));
  const out = join(run, 'critic', 'pending');
  mkdirSync(out, { recursive: true });

  for (const cut of cuts) {
    const dir = resolve(cut.dir);
    const body = [
      `Judge how one filmed tour looks in motion: ${cut.tour}, the ${cut.path} way through it.`,
      '',
      '<film>',
      `tour: ${cut.tour}`,
      `path: ${cut.path}`,
      `ran for: ${String(Math.round(cut.durationMs / 100) / 10)} s`,
      `frames captured: ${String(cut.framesCaptured)}`,
      `how each beat was driven: ${
        Object.entries(cut.drivenBy ?? {})
          .map(([how, n]) => `${how} x${String(n)}`)
          .join(', ') || 'not recorded'
      }`,
      ...(cut.path === 'hand' && !(cut.drivenBy ?? {})['by hand']
        ? [
            'NOTE: this film is labelled the by-hand walk and not one beat of it was',
            'actually done by hand — every one fell through to the guide pill,',
            'because nothing the tour rings here looked clickable to the walker. Judge',
            'it as what it is, and say so.',
          ]
        : []),
      `movie (for a person, not for you — you cannot watch it): ${join(dir, 'movie.mp4')}`,
      '</film>',
      '',
      '<measurements>',
      'Already known exactly. Do not re-estimate any of it; cite it where it bears',
      'on what you see.',
      '',
      ...(cut.movement ?? []).map(
        (m) =>
          `${m.what}: moved ${String(m.moves)} time(s) in the whole film, ` +
          `largest single change ${String(m.biggestJumpPx)} px at ${String(m.biggestJumpAtMs)} ms, ` +
          `${String(m.reversals)} direction reversal(s)`,
      ),
      ...(cut.stills ?? [])
        .slice(0, 4)
        .map((st) => `nothing redrawn for ${String(st.ms)} ms from ${String(st.fromMs)} ms`),
      ...(cut.working ?? []).map(
        (w) => `the guide said it was working for ${String(w.ms)} ms from ${String(w.fromMs)} ms`,
      ),
      '</measurements>',
      '',
      '<moments>',
      'Each is a run of consecutive full-resolution frames in time order. Open',
      'every frame of a moment before judging it.',
      '',
      'After each path is what the page recorded of itself at that instant, as',
      'x,y,width,height in CSS pixels. It is there so that a question a picture',
      'cannot settle — whether a box was drawn too small, whether a highlight with',
      'no visible right-hand side is open or merely running off the screen — can be',
      'settled without estimating anything. Read it; do not add to it.',
      '',
      'It says where a thing was laid out, never whether it was painted. A box at',
      '0,0 is usually something measured before it was placed and invisible while',
      'it waited. The picture decides what was on screen; these figures decide',
      'where. A claim that contradicts the frames is a misreading of the figures.',
      '',
      ...(cut.moments ?? []).flatMap((m, i) => [
        `moment ${String(i + 1)} — at ${String(m.atMs)} ms, because ${m.why}:`,
        ...m.frames.flatMap((f) => {
          const state = Object.entries(f.state ?? {})
            .map(([k, v]) => `${k} ${String(v)}`)
            .join(' · ');
          return [
            `  ${f.frame} @ ${String(f.atMs)} ms — ${join(dir, 'frames', f.file)}`,
            ...(state ? [`      recorded: ${state}`] : []),
          ];
        }),
        '',
      ]),
      '</moments>',
      '',
      '<narration>',
      ...cut.packs.map((p) => `${String(p.fromMs)}–${String(p.toMs)} ms · ${p.step}: ${p.says}`),
      '</narration>',
      '',
      'The interface is in Polish. Describe what you see; do not translate it.',
      '',
      '<write_your_answer_here>',
      join(run, 'critic', `${cut.tour}-${cut.path}.json`),
      '</write_your_answer_here>',
      '',
      'Follow your instructions exactly. Write the JSON object to the path above,',
      'then reply with one short line naming the file and your overall verdict.',
    ].join('\n');
    writeFileSync(join(out, `${cut.tour}-${cut.path}.md`), body);
  }
  log(`${String(cuts.length)} critic prompt(s) → ${out}`);
}

const cmd = process.argv[2] ?? 'prompts';
const run = pickRun();
if (cmd === 'prompts') writePrompts(run);
else if (cmd === 'critic') writeCriticPrompts(run);
else if (cmd === 'check') process.exitCode = check(run) ? 1 : 0;
else throw new Error(`unknown command "${cmd}" — expected prompts, critic or check`);
