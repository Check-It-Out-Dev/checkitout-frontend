#!/usr/bin/env node
/**
 * Turn a raw capture into something a person and an agent can both read.
 *
 * `film.spec.ts` leaves a directory of timestamped JPEGs and a line of DOM
 * state per animation frame. This does three things with that, and no judging
 * of any kind:
 *
 *   1. assembles the frames into a real-time movie, holding each one for
 *      exactly as long as it was on screen (the capture is change-driven, so a
 *      still beat is one frame and a transition is many);
 *   2. cuts the run into phases, from the map and the step changes in the DOM
 *      stream, and works out the machine-checkable half — every atomic check,
 *      when it first held, and every interval the guide spent saying it was
 *      working;
 *   3. selects the frames worth looking at, labels each with its own number and
 *      millisecond, and tiles them into contact sheets — one pack per phase,
 *      ready for an agent that will be asked what it can see.
 *
 * Selection is deliberately uneven: every frame within 400 ms of a phase
 * boundary, every frame where the DOM changed, and 2 fps through the quiet
 * parts. Transitions are where the ugliness lives and a still beat needs one
 * picture.
 *
 *   node tools/film-cut.mjs                      # the newest run
 *   node tools/film-cut.mjs qa-film/2026-09-06   # a named one
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const BOUNDARY_MS = 400;
const QUIET_FPS = 2;
/**
 * Nine tiles, not sixteen, and they are for localisation only.
 *
 * A contact sheet is a lossy instrument and the arithmetic is unforgiving: tile
 * a 1440 px frame into a 4x4 grid and each tile is ~360 px, so a 14 px label
 * lands at 3-4 px — below the 28 px patch a vision model sees with, i.e.
 * unreadable by construction. Asked to read it anyway, a model guesses rather
 * than declines. So the sheet answers "which tile does this first appear in",
 * and every question about *reading* something is escalated to a full frame or
 * to a crop taken from it at the coordinates the DOM stream recorded.
 */
const SHEET_COLS = 3;
const SHEET_ROWS = 3;
const CELL_W = 640;
/** Magnification for a crop, so small copy survives the model's patch grid. */
const CROP_ZOOM = 2;
/** Breathing room around a cropped element, in source pixels. */
const CROP_PAD = 24;
const FONT = 'C\\:/Windows/Fonts/arial.ttf';

const log = (m) => console.log(`\x1b[36m[cut] ${m}\x1b[0m`);

function ffmpeg(args) {
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], {
    stdio: ['ignore', 'ignore', 'pipe'],
  });
}

/** The run to cut: the argument, or the newest dated directory under qa-film. */
function pickRun() {
  if (process.argv[2]) return resolve(process.argv[2]);
  const root = resolve('qa-film');
  if (!existsSync(root)) throw new Error('nothing has been filmed yet — run film.spec.ts first');
  const runs = readdirSync(root, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
  if (!runs.length) throw new Error('qa-film exists but holds no runs');
  return join(root, runs.at(-1));
}

const frameMs = (name) => Number(name.match(/_t(\d+)\.jpg$/)?.[1] ?? 0);

/** Does one atomic check hold in this sample? */
function holds(check, s) {
  switch (check.kind) {
    case 'visible':
      return check.testid in (s.seen ?? {});
    case 'absent':
      return !(check.testid in (s.seen ?? {}));
    case 'ring':
      return s.ring === check.testid;
    case 'route':
      return new RegExp(check.pattern).test(s.path);
    case 'storage':
      return !!s.storage?.[check.key];
    case 'narration':
      return (s.narration ?? '').toLowerCase().includes(check.contains.toLowerCase());
    default:
      return false;
  }
}

/** Contiguous runs of equal value, as intervals. */
function intervals(samples, pick) {
  const out = [];
  let open = null;
  for (const s of samples) {
    const on = pick(s);
    if (on && !open) open = { from: s.t, to: s.t, step: s.step };
    else if (on && open) open.to = s.t;
    else if (!on && open) {
      out.push({ ...open, ms: open.to - open.from });
      open = null;
    }
  }
  if (open) out.push({ ...open, ms: open.to - open.from });
  return out;
}

/** Phase windows: one per business phase, bounded by its step's span. */
function windows(samples, business) {
  const spans = new Map();
  for (const s of samples) {
    if (s.step === undefined || s.step === null) continue;
    const span = spans.get(s.step) ?? { from: s.t, to: s.t };
    span.to = s.t;
    spans.set(s.step, span);
  }
  return business.map((phase, i) => {
    const span = spans.get(i) ?? { from: 0, to: 0 };
    return { ...phase, index: i, from: span.from, to: span.to, ms: span.to - span.from };
  });
}

/** Which frames are worth an agent's attention, and why. */
function selectFrames(frames, samples, wins) {
  const wanted = new Map();
  const add = (f, why) => {
    const had = wanted.get(f.file);
    wanted.set(f.file, { ...f, why: had ? `${had.why}, ${why}` : why });
  };

  const bounds = wins.flatMap((w) => [w.from, w.to]);
  let lastQuiet = -Infinity;
  let prevKey = '';

  for (const f of frames) {
    if (bounds.some((b) => Math.abs(f.t - b) <= BOUNDARY_MS)) add(f, 'boundary');
    // the DOM sample nearest this frame; a change in it is worth a picture
    const s = samples.reduce(
      (best, cur) => (Math.abs(cur.t - f.t) < Math.abs(best.t - f.t) ? cur : best),
      samples[0] ?? { t: 0 },
    );
    const key = JSON.stringify([
      s.step,
      s.path,
      s.working,
      s.dialog,
      s.sim,
      s.retry,
      s.ring,
      s.narration,
    ]);
    if (key !== prevKey) {
      add(f, 'state changed');
      prevKey = key;
    }
    if (f.t - lastQuiet >= 1000 / QUIET_FPS) {
      add(f, 'sampled');
      lastQuiet = f.t;
    }
  }
  return [...wanted.values()].sort((a, b) => a.t - b.t);
}

function cutOne(dir) {
  const phases = JSON.parse(readFileSync(join(dir, 'phases.json'), 'utf8'));
  const samples = readFileSync(join(dir, 'dom.jsonl'), 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l));
  const frames = readdirSync(join(dir, 'frames'))
    .filter((f) => f.endsWith('.jpg'))
    .map((file) => ({ file, t: frameMs(file) }))
    .sort((a, b) => a.t - b.t);

  if (!frames.length || !samples.length) {
    log(`${dir}: nothing captured, skipping`);
    return null;
  }
  const zero = Math.min(frames[0].t, samples[0].t);
  const rel = (t) => t - zero;

  // 1 — the movie
  // `-fps_mode vfr`, not `-vsync`: the latter was removed in ffmpeg 9.
  ffmpeg(['-f', 'concat', '-safe', '0', '-i', join(dir, 'frames.txt'), '-fps_mode', 'vfr',
          '-pix_fmt', 'yuv420p', '-c:v', 'libx264', '-crf', '24', join(dir, 'movie.mp4')]);

  // 2 — the machine's half
  const wins = windows(samples, phases.business);
  const working = intervals(samples, (s) => s.working).map((w) => ({
    fromMs: rel(w.from),
    ms: w.ms,
    step: w.step,
  }));
  const covering = intervals(samples, (s) => (s.pillOver?.length ?? 0) > 0).map((w) => ({
    fromMs: rel(w.from),
    ms: w.ms,
    step: w.step,
  }));

  /**
   * How long each thing the visitor is told to READ was actually on screen.
   *
   * The longest unbroken stretch inside the phase, not the sum: a sentence shown
   * for 40 ms eight times was never readable, however the milliseconds add up.
   * A requirement that names no element cannot be timed, and the prompt is told
   * not to claim otherwise.
   */
  const readable = [];
  for (const win of wins) {
    // From the phase's start, and deliberately NOT clipped at its end.
    //
    // The thing a phase asks the visitor to read is very often the same thing
    // that ends the phase — the refusal that confirms the code was rejected,
    // the confirm button that proves the preview opened. Clipped at the
    // boundary, each of those measured a single frame and read as a defect,
    // when in fact they stay on screen well into the next beat. How long
    // something was readable is a fact about the element, not about the tour's
    // bookkeeping.
    const inWin = samples.filter((s) => s.t >= win.from);
    for (const req of win.requires ?? []) {
      if (!req.readableMs || !req.via) continue;
      let best = 0;
      let open = null;
      for (const s of inWin) {
        const there = req.via in (s.seen ?? {});
        if (there && open === null) open = s.t;
        if (!there && open !== null) {
          best = Math.max(best, s.t - open);
          open = null;
        }
      }
      if (open !== null) best = Math.max(best, inWin.at(-1).t - open);
      // Never recorded at all is not "readable for 0 ms" — it means the sampler
      // was not watching this element, and a budget nobody measured must not be
      // reported as one that was.
      const everSeen = samples.some((s) => req.via in (s.seen ?? {}));
      // Something still on screen when the visitor acts did not need a budget:
      // it waited for them, which is the whole point of it. Only a thing that
      // went away on its own has to have lasted long enough — the same rule the
      // flash sweep uses, and the same trap it exists to avoid, because an
      // automated walk's pace is not the application's behaviour. The cascade
      // preview waits indefinitely and still "failed" an eleven-second budget,
      // for no reason but that the walker stood there for nine.
      const lastInPhase = samples.filter((s) => s.t <= win.to).at(-1);
      const waited = !!lastInPhase && req.via in (lastInPhase.seen ?? {});
      readable.push({
        phase: `${phases.tour}/${win.step}`,
        requirement: req.id,
        via: req.via,
        needMs: req.readableMs,
        longestMs: best,
        waited,
        met: everSeen ? waited || best >= req.readableMs : null,
        watched: everSeen,
      });
    }
  }

  /**
   * How the picture moves — the half of "is it smooth" that is arithmetic.
   *
   * "Jittery" is not a matter of taste. A thing that slides from A to B moves
   * the same way every frame; a thing that judders reverses direction. So for
   * each piece of the guide's furniture this counts direction reversals, finds
   * the largest single-frame jump, and marks the runs where the screen held
   * perfectly still. What is left over for a person to judge is whether a
   * transition LOOKS right — torn, half-drawn, ghosted — which no arithmetic
   * reaches.
   */
  function motion(pick, name) {
    const pts = samples.map((s) => ({ t: s.t, box: pick(s) })).filter((p) => p.box);
    let biggest = { px: 0, atMs: null };
    let reversals = 0;
    let lastDir = 0;
    const hops = [];
    for (let i = 1; i < pts.length; i++) {
      const [ax, ay] = pts[i - 1].box;
      const [bx, by] = pts[i].box;
      const dx = bx - ax;
      const dy = by - ay;
      const px = Math.round(Math.hypot(dx, dy));
      if (px === 0) continue;
      hops.push({ atMs: rel(pts[i].t), px });
      if (px > biggest.px) biggest = { px, atMs: rel(pts[i].t) };
      const dir = Math.sign(dx || dy);
      if (lastDir && dir && dir !== lastDir) reversals++;
      lastDir = dir || lastDir;
    }
    return {
      what: name,
      frames: pts.length,
      moves: hops.length,
      biggestJumpPx: biggest.px,
      biggestJumpAtMs: biggest.atMs,
      reversals,
      /** The moments worth looking at: the ten largest hops. */
      roughest: hops.sort((a, b) => b.px - a.px).slice(0, 10),
    };
  }

  const movement = [
    motion((s) => s.ringBox, 'the ring'),
    motion((s) => s.pillBox, 'the pill'),
    motion((s) => s.dialogBox, 'the dialog'),
  ].filter((m) => m.frames > 0);

  /** Stretches where nothing was redrawn at all, longest first. */
  const stills = [];
  for (let i = 1; i < frames.length; i++) {
    const gap = frames[i].t - frames[i - 1].t;
    if (gap >= 500) stills.push({ fromMs: rel(frames[i - 1].t), ms: gap });
  }
  stills.sort((a, b) => b.ms - a.ms);

  /**
   * The handful of instants worth a person's eyes.
   *
   * The arithmetic above says where the picture changed most and where it stood
   * still longest. It cannot say whether a change LOOKED like one motion or
   * like a stutter — whether something was drawn half-way, left a ghost behind,
   * or appeared before the page under it had finished arriving. So each of
   * those instants is packaged as a short run of consecutive full-resolution
   * frames: two before, the change, two after. Short on purpose. A model given
   * thirty-five images answers worse than one given five, and this is the one
   * question where its judgement is worth more than a number.
   */
  const moments = [];

  /**
   * The last sample written at or before an instant.
   *
   * Nearest is wrong, and a reviewer caught it: it can hand a frame the state
   * from twenty milliseconds AFTER it, so the picture appears to be ahead of the
   * record — a ring and pill plainly drawn against figures that say the pill has
   * not been placed yet. A frame carries the last paint that finished, so the
   * state that produced it is the last one written before the shutter.
   */
  const nearest = (t) => {
    let best = samples[0];
    for (const s of samples) {
      if (s.t <= t) best = s;
      else break;
    }
    return best;
  };

  /** A frame's recorded geometry, rounded, with the empty parts left out.
   * The sampler writes each box as [x, y, width, height]. */
  const rect = (b) =>
    Array.isArray(b) && b.some((n) => n) ? b.map((n) => Math.round(n)).join(',') : null;
  const box = (s) => {
    const out = {};
    if (s.ring) out.ringTarget = s.ring;
    if (rect(s.ringBox)) out.ring = rect(s.ringBox);
    if (rect(s.pillBox)) out.pill = rect(s.pillBox);
    if (rect(s.dialogBox)) out.dialog = rect(s.dialogBox);
    if (s.working) out.working = true;
    if (s.shield) out.shield = true;
    return out;
  };

  /**
   * Two flags become one moment when they would be packaged with the same
   * pictures.
   *
   * Rounding each instant into a 250 ms bucket let 26112 ms and 26128 ms fall
   * either side of a boundary, so the pill's 1092 px hop and its 1102 px hop
   * were sent out as two moments carrying an identical run of five frames. The
   * reviewer opened both, gave both the same verdict, and wrote back that from
   * the pictures it was one event seen twice and it could not tell whether it
   * was being asked about two faults. It was not: the number differs, the frames
   * do not. So the guard is now the distance to an instant already packaged, and
   * the second reason is added to the first moment rather than thrown away —
   * whoever reads it sees both figures against the run that shows them.
   */
  const packMoment = (atMs, why) => {
    const near = moments.find((m) => Math.abs(m.atMs - atMs) < 250);
    if (near) {
      if (!near.why.includes(why)) near.why += `; also ${why}`;
      return;
    }
    const i = frames.findIndex((f) => rel(f.t) >= atMs);
    if (i < 0) return;
    const run = frames.slice(Math.max(0, i - 2), i + 3);
    if (run.length < 2) return;
    const same = moments.find((m) => m.frames[0]?.file === run[0].file);
    if (same) {
      if (!same.why.includes(why)) same.why += `; also ${why}`;
      return;
    }
    moments.push({
      atMs,
      why,
      frames: run.map((f) => ({
        frame: f.file.slice(0, 6),
        atMs: rel(f.t),
        file: f.file,
        // What the page recorded of itself at that instant.
        //
        // Two reviewers in a row stopped at the same wall. One could see that a
        // ring in one frame sat tight against its control where every other ring
        // in the film stood clear of one, and that a short hook rose out of its
        // corner, and wrote that it could not tell from a picture whether the box
        // had been drawn too small or the mark was something else — "the ring's
        // recorded width and position on that frame would settle it". Another
        // could not tell whether a ring with no right-hand side was open or was a
        // closed box running off the viewport. Both figures were in the record
        // the whole time and neither was handed over. The rule that they must not
        // measure is a rule about estimating, not about being kept in the dark.
        state: box(nearest(f.t)),
      })),
    });
  };

  const hops = movement.flatMap((m) =>
    m.roughest.map((h) => ({ ...h, why: `${m.what} moved ${h.px} px` })),
  );

  // At least one moment per phase, BEFORE the roughest overall.
  //
  // Taking the eight biggest changes and stopping meant they clustered wherever
  // the tour happened to move most: on admin-ops that was the first twelve
  // seconds of a twenty-nine second film, so the entire cascade-confirm beat —
  // the one the split was made for — was never packaged at all. A reviewer
  // noticed the runs stopped early and went and opened the rest itself. A
  // sample that silently covers half the subject is the same failure as a
  // budget that measures nothing.
  for (const win of wins) {
    const from = rel(win.from);
    const to = rel(win.to);
    // The interior, not the edges. A phase's biggest hop is almost always the
    // arrival that opened it, which is the moment the PREVIOUS phase already
    // packaged; taking it again spent the phase's one look on a picture that had
    // been sent out and left the beat itself unseen. A reviewer put it plainly:
    // the runs jumped from the dialog appearing to the code already standing on
    // the phone, so the whole of step 2 was visible only at its two ends.
    const edge = Math.min(400, Math.round((to - from) / 4));
    const inside = hops.filter((h) => h.atMs >= from + edge && h.atMs <= to - edge);
    const pick = inside.sort((x, y) => y.px - x.px)[0];
    packMoment(
      pick ? pick.atMs : Math.round((from + to) / 2),
      pick ? pick.why : `the ${win.step} beat, which nothing else flagged`,
    );
  }
  for (const h of [...hops].sort((x, y) => y.px - x.px).slice(0, 6)) packMoment(h.atMs, h.why);
  for (const st of stills.slice(0, 2)) {
    packMoment(st.fromMs + st.ms, `nothing was redrawn for ${st.ms} ms`);
  }
  // The end, always. A reviewer was given a moment labelled with the last beat
  // whose five frames all sat before the thing that beat is about — the dialog
  // closing and the admin arriving happened after every picture it had — and
  // had to write that it could say nothing about the tour's payoff. The last
  // change in a film is the one nobody should have to ask for.
  if (frames.length >= 3) {
    packMoment(rel(frames.at(-3).t), 'the end of the film');
  }
  moments.sort((a, b) => a.atMs - b.atMs);

  const atomic = [];
  for (const win of wins) {
    // From the phase's start and not clipped at its end, for the same reason
    // the readable measurement is not: a step's `done` condition is precisely
    // the thing that ends the step, so the check for it lands on the boundary.
    // Clipped, the checkout's stored plan — written at the instant the next
    // beat begins — read as never having happened, in both paths, on a tour
    // that demonstrably completes.
    const inWin = samples.filter((s) => s.t >= win.from);
    for (const check of win.atomic ?? []) {
      const first = inWin.find((s) => holds(check, s));
      atomic.push({
        phase: `${phases.tour}/${win.step}`,
        check: check.id,
        kind: check.kind,
        met: !!first,
        atMs: first ? rel(first.t) : null,
      });
    }
  }

  // 3 — the packs
  const packs = [];
  const shot = join(dir, 'sheets');
  rmSync(shot, { recursive: true, force: true });
  mkdirSync(shot, { recursive: true });
  const tmp = join(dir, '.labelled');

  for (const win of wins) {
    const mine = selectFrames(
      frames.filter((f) => f.t >= win.from - BOUNDARY_MS && f.t <= win.to + BOUNDARY_MS),
      samples,
      [win],
    );
    if (!mine.length) continue;

    rmSync(tmp, { recursive: true, force: true });
    mkdirSync(tmp, { recursive: true });
    mine.forEach((f, i) => {
      const label = `${f.file.slice(0, 6)}  ${rel(f.t)}ms`.replace(/:/g, '\\:');
      ffmpeg([
        '-i', join(dir, 'frames', f.file),
        '-vf',
        `scale=${CELL_W}:-2,drawtext=fontfile='${FONT}':text='${label}':x=8:y=8:` +
          `fontsize=20:fontcolor=yellow:box=1:boxcolor=black@0.65:boxborderw=5`,
        join(tmp, `c${String(i).padStart(3, '0')}.jpg`),
      ]);
    });

    const per = SHEET_COLS * SHEET_ROWS;
    const sheets = [];
    for (let s = 0; s * per < mine.length; s++) {
      const name = `${win.step}_${String(s + 1).padStart(2, '0')}.jpg`;
      ffmpeg([
        '-start_number', String(s * per),
        '-i', join(tmp, 'c%03d.jpg'),
        '-frames:v', '1',
        '-vf', `tile=${SHEET_COLS}x${SHEET_ROWS}:margin=6:padding=4:color=0x111111`,
        join(shot, name),
      ]);
      sheets.push(name);
    }
    rmSync(tmp, { recursive: true, force: true });

    // Crops, one per requirement that has to be READ, aimed at the thing it is
    // about.
    //
    // These used to be one per phase, cut from the dialog at the phase's
    // midpoint. For a beat that stands still for six seconds and then changes,
    // the midpoint is the dull part — and for `fresh-code` the two things
    // needing a read live in the guide panel on the right edge and on the phone
    // at the bottom left, so a crop of the centred dialog was guaranteed to
    // miss both. A reviewer said so and went and magnified the full frames
    // itself.
    //
    // Now the requirement names its element, the DOM stream knows that
    // element's box frame by frame, and the crop is taken from the middle of
    // the stretch where it was actually on screen.
    const crops = [];
    for (const req of win.requires ?? []) {
      if (!req.readableMs || !req.via) continue;
      const withIt = samples.filter(
        (s) => s.t >= win.from && s.t <= win.to && req.via in (s.seen ?? {}),
      );
      if (!withIt.length) continue;
      const at = withIt[Math.floor(withIt.length / 2)];
      const near = frames.reduce(
        (best, f) => (Math.abs(f.t - at.t) < Math.abs(best.t - at.t) ? f : best),
        frames[0],
      );
      const [x, y, w, h] = at.seen[req.via];
      const cx = Math.max(0, x - CROP_PAD);
      const cy = Math.max(0, y - CROP_PAD);
      const name = `${win.step}_${req.id}.jpg`;
      try {
        ffmpeg([
          '-i', join(dir, 'frames', near.file),
          '-vf',
          `crop=${w + CROP_PAD * 2}:${h + CROP_PAD * 2}:${cx}:${cy},` +
            `scale=iw*${CROP_ZOOM}:ih*${CROP_ZOOM}:flags=lanczos`,
          '-q:v', '2',
          join(shot, name),
        ]);
      } catch {
        continue; // the box can fall outside the frame on a scrolled page
      }
      crops.push({
        file: name,
        requirement: req.id,
        frame: near.file.slice(0, 6),
        atMs: rel(near.t),
        of: `${req.see} (${req.via})`,
        zoom: CROP_ZOOM,
      });
    }

    packs.push({
      crops,
      phase: `${phases.tour}/${win.step}`,
      tour: phases.tour,
      path: phases.path,
      step: win.step,
      says: win.says,
      requires: win.requires,
      fromMs: rel(win.from),
      toMs: rel(win.to),
      sheets,
      frames: mine.map((f) => ({ frame: f.file.slice(0, 6), atMs: rel(f.t), file: f.file, why: f.why })),
    });
  }

  const cut = {
    tour: phases.tour,
    path: phases.path,
    run: phases.run,
    dir,
    durationMs: rel(frames.at(-1).t),
    framesCaptured: frames.length,
    framesSelected: packs.reduce((n, p) => n + p.frames.length, 0),
    working,
    covering,
    movement,
    stills: stills.slice(0, 8),
    /**
     * How each beat was actually driven.
     *
     * A "hand" film is a claim, and for one tour it was a false one: every beat
     * of support-ticket's hand walk fell through to the guide's pill, because
     * neither of its targets looked clickable to the walker, and the film came
     * out frame for frame identical to the guided one while being labelled the
     * other way round. A reviewer had to notice that from the trace. It is
     * counted here and stated in the brief instead.
     */
    drivenBy: (phases.trace ?? []).reduce((acc, t) => {
      const how = t.how ?? 'pill';
      acc[how] = (acc[how] ?? 0) + 1;
      return acc;
    }, {}),
    moments,
    /** How much of the film the packaged moments actually reach. */
    momentsCoverMs: moments.length ? moments.at(-1).atMs - moments[0].atMs : 0,
    readable,
    atomic,
    packs,
  };
  writeFileSync(join(dir, 'cut.json'), JSON.stringify(cut, null, 2));
  const unread = readable.filter((r) => r.met === false);
  const unwatched = readable.filter((r) => !r.watched);
  log(
    `${phases.tour} ${phases.path}: ${frames.length} frames → ${cut.framesSelected} selected, ` +
      `${packs.length} packs, ${working.length} working intervals` +
      (unread.length ? `, ${unread.length} thing(s) never readable long enough` : '') +
      (unwatched.length ? `, ${unwatched.length} NOT MEASURED (element never recorded)` : '') +
      (moments.length
        ? `, moments span ${Math.round((moments.at(-1).atMs - moments[0].atMs) / 100) / 10}s of ${Math.round(rel(frames.at(-1).t) / 100) / 10}s`
        : ''),
  );
  return cut;
}

const run = pickRun();
log(`cutting ${run}`);
const cuts = readdirSync(run, { withFileTypes: true })
  .filter((e) => e.isDirectory() && existsSync(join(run, e.name, 'phases.json')))
  .map((e) => cutOne(join(run, e.name)))
  .filter(Boolean);

writeFileSync(join(run, 'cut.json'), JSON.stringify({ run, films: cuts.length, cuts }, null, 2));
log(`${cuts.length} film(s) cut — ${join(run, 'cut.json')}`);
