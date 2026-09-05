import { test, type CDPSession, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync, appendFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { PROCESSES, technicalPhases } from './process-map';
import { TOURS, beat, open, press, ready, turned } from './walk';
import { scenarioByKey } from '../../src/app/core/demo/scenario-registry';

/**
 * Film every process in the sandbox, both ways through it.
 *
 * This does not assert anything. It is the capture stage: it drives each tour,
 * writes one JPEG per visual change with the millisecond in its filename, and
 * writes one line of DOM state per animation frame on the same clock. The
 * judging happens afterwards, offline, over the saved artifacts — so a review
 * can be re-run, or re-run more thoroughly, without filming again.
 *
 * The two streams are the whole design. The DOM stream is exact and blind: it
 * knows a dialog is in the document, and nothing about whether a person could
 * read it. The frames are the opposite. Every finding this harness is for lives
 * in the gap between them, so both are recorded against one clock
 * (`performance.timeOrigin + performance.now()`, which is also the epoch CDP
 * stamps its screencast frames with) and reconciled later.
 *
 * Screencast frames arrive on change, not on a timer — a beat where nothing
 * moves costs one frame, and a transition costs many. That is the right
 * sampling for analysis, and the movie is reassembled with per-frame durations
 * so it still plays back in real time.
 *
 *   npm run test:perf -- e2e-tests/perf/film.spec.ts
 *   FILM_TOURS=admin-2fa,nip-to-ksef npm run test:perf -- e2e-tests/perf/film.spec.ts
 */

/** No more than one frame per 40 ms: a 25 fps ceiling on a stream that has none. */
const MIN_FRAME_GAP_MS = 40;

/**
 * How long to stand on a beat before acting on it.
 *
 * Driven at machine speed the whole admin-2fa tour finishes in 1.3 seconds:
 * three presses, each the instant the pill appears. That is a real measurement
 * of the software and a useless film. No visitor sees it — they read the
 * narration first — and filming it would fail every "must stay readable"
 * requirement on the robot's impatience rather than on anything the app did.
 *
 * So the walk reads. Two seconds minimum to take in a beat at all, plus the
 * narration at 200 words a minute, capped so a long explanation does not stall
 * the run. This is the same rule the flash sweep uses to decide whether a
 * person could have read something, applied here to make sure they had the
 * chance.
 */
function dwellMs(narration: string): number {
  const words = narration.trim() ? narration.trim().split(/\s+/).length : 0;
  return Math.min(9000, Math.max(2000, Math.round((words / 200) * 60_000)));
}

const RUN = process.env['FILM_RUN'] ?? new Date().toISOString().slice(0, 10);
const ROOT = join('qa-film', RUN);
const ONLY = process.env['FILM_TOURS']?.split(',').filter(Boolean);
const PATHS = ['guided', 'hand'] as const;
type FilmPath = (typeof PATHS)[number];

/** One line of `dom.jsonl` — everything the machine can know, per animation frame. */
interface Sample {
  t: number;
  step: number | undefined;
  stepId: string | null;
  done: boolean;
  path: string;
  /** The guide is running a recipe — `[data-testid="guide-performing"]`. */
  working: boolean;
  shield: boolean;
  narration: string;
  ring: string | null;
  ringBox: [number, number, number, number] | null;
  pillBox: [number, number, number, number] | null;
  dialog: boolean;
  dialogBox: [number, number, number, number] | null;
  sim: boolean;
  retry: boolean;
  /**
   * Every watched testid that is visible right now, with its box.
   *
   * The boxes are what let the cut stage crop. A contact sheet scales a
   * 1440 px frame into a ~360 px tile, which turns a 14 px label into 4 px —
   * unreadable by construction, and a model asked to read it will guess rather
   * than decline. So anything a requirement says must be *readable* is cut out
   * of the full-resolution frame at the coordinates recorded here.
   */
  seen: Record<string, [number, number, number, number]>;
  /** Text the pill is drawn over — the covering question, per frame. */
  pillOver: string[];
  storage: Record<string, string>;
}

/**
 * Installed before the first document and re-installed after the checkout's
 * reload. Writes into `window.__film`, which the test drains periodically —
 * draining rather than reading at the end means a reload cannot lose the frames
 * before it.
 */
function sampler(stepIds: Record<string, string[]>): void {
  const w = window as unknown as Record<string, unknown>;
  if (w['__filmOn']) return;
  w['__filmOn'] = true;
  const out: unknown[] = [];
  w['__film'] = out;

  const box = (el: Element | null | undefined): [number, number, number, number] | null => {
    if (!el) return null;
    const b = el.getBoundingClientRect();
    return [Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height)];
  };

  const tick = (): void => {
    let step: number | undefined;
    let done = false;
    let key = '';
    try {
      const s = JSON.parse(sessionStorage.getItem('demoSandbox') ?? '{}') as {
        step?: number;
        done?: boolean;
        key?: string;
      };
      step = s.step;
      done = s.done === true;
      key = s.key ?? '';
    } catch {
      /* mid-write is not a fault */
    }

    const ringEl = document.querySelector('[data-testid="guide-spotlight"]');
    const pill = document.querySelector('[data-testid="guide-spot-next"]');
    const ringBox = box(ringEl);

    // Which control the ring is drawn around — it sits 6 px outside it.
    let ring: string | null = null;
    if (ringBox) {
      for (const el of document.querySelectorAll('[data-testid]')) {
        const e = el.getBoundingClientRect();
        if (
          e.width > 0 &&
          Math.abs(e.left - (ringBox[0] + 6)) < 3 &&
          Math.abs(e.top - (ringBox[1] + 6)) < 3
        ) {
          ring = el.getAttribute('data-testid');
          break;
        }
      }
    }

    // Text the pill is drawn over, top layer only — behind a backdrop nobody
    // is reading, so a dialog narrows the search to its own contents.
    const pillOver: string[] = [];
    const q = pill?.getBoundingClientRect();
    if (q && q.width > 0) {
      const modal = document.querySelector('.cdk-overlay-backdrop-showing')
        ? document.querySelector('mat-dialog-container')
        : null;
      (modal ?? document.body).querySelectorAll('*').forEach((el) => {
        if (el.childElementCount > 0) return;
        if (el.closest('.guide-pop, [data-testid="guide-spot-next"]')) return;
        const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
        if (!text) return;
        const b = el.getBoundingClientRect();
        if (b.width === 0 || b.height === 0) return;
        if (
          ringBox &&
          b.left >= ringBox[0] &&
          b.top >= ringBox[1] &&
          b.right <= ringBox[0] + ringBox[2] &&
          b.bottom <= ringBox[1] + ringBox[3]
        ) {
          return; // resting on the highlighted control is allowed
        }
        const ox = Math.min(q.right, b.right) - Math.max(q.left, b.left);
        const oy = Math.min(q.bottom, b.bottom) - Math.max(q.top, b.top);
        if (ox > 2 && oy > 2) pillOver.push(text.slice(0, 44));
      });
    }

    const wanted = stepIds[key] ?? [];
    const seen: Record<string, [number, number, number, number]> = {};
    for (const id of wanted) {
      const b = box(document.querySelector(`[data-testid="${id}"]`));
      if (b && b[2] > 0) seen[id] = b;
    }

    const storage: Record<string, string> = {};
    try {
      for (const k of ['demoPlan', 'demoTotp', 'demoRole']) {
        const v = sessionStorage.getItem(k) ?? localStorage.getItem(k);
        if (v) storage[k] = v;
      }
    } catch {
      /* storage can be denied; the rest of the sample still stands */
    }

    out.push({
      t: Math.round(performance.timeOrigin + performance.now()),
      step,
      stepId: null,
      done,
      path: location.pathname,
      working: !!document.querySelector('[data-testid="guide-performing"]'),
      shield: !!document.querySelector('[data-testid="guide-shield"]'),
      narration: (document.querySelector('[data-testid="guide-narration"]')?.textContent ?? '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 120),
      ring,
      ringBox,
      pillBox: box(pill),
      dialog: !!document.querySelector('mat-dialog-container'),
      dialogBox: box(document.querySelector('mat-dialog-container')),
      sim: !!document.querySelector('app-world-sim-shell'),
      retry: !!document.querySelector('[data-testid="guide-retry"]'),
      seen,
      pillOver,
      storage,
    });
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/** Every testid any phase of this tour names, so the sampler knows what to look for. */
function watchedIds(): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const process of PROCESSES) {
    const ids = new Set<string>();
    for (const phase of process.phases) {
      for (const check of phase.atomic) {
        if ('testid' in check) ids.add(check.testid);
      }
      // The elements whose visible lifetime answers a "must stay readable"
      // requirement. Leaving these out meant the cut stage had nothing to time
      // and reported no readability problems anywhere — a clean bill of health
      // from measuring nothing, which is the worst way for an instrument to
      // fail because it looks exactly like good news.
      for (const req of phase.requires) {
        if (req.via) ids.add(req.via);
      }
    }
    for (const step of scenarioByKey(process.tour)?.steps ?? []) {
      const target = step.target?.match(/data-testid[\^]?="([^"]+)"/)?.[1];
      if (target) ids.add(target);
    }
    out[process.tour] = [...ids];
  }
  return out;
}

async function drain(page: Page, file: string): Promise<void> {
  const rows = await page
    .evaluate(() => {
      const w = window as unknown as Record<string, unknown>;
      const a = (w['__film'] as unknown[] | undefined) ?? [];
      // Empty the array in place. Assigning a fresh one here left the sampler's
      // closure pushing into the old array for the rest of the run, so the DOM
      // stream stopped six seconds into an eighteen-second film and the frames
      // after that had no witness at all.
      const taken = a.slice();
      a.length = 0;
      return taken;
    })
    .catch(() => [] as unknown[]);
  if (rows.length) {
    appendFileSync(file, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
  }
}

test.describe('Film the sandbox', () => {
  const tours = TOURS.filter((t) => !ONLY || ONLY.includes(t));

  for (const tour of tours) {
    for (const path of PATHS) {
      test(`${tour} — ${path}`, async ({ page }) => {
        test.setTimeout(240_000);

        const dir = join(ROOT, `${tour}-${path}`);
        rmSync(dir, { recursive: true, force: true });
        mkdirSync(join(dir, 'frames'), { recursive: true });
        const domFile = join(dir, 'dom.jsonl');
        writeFileSync(domFile, '');

        await page.addInitScript(sampler, watchedIds());

        const frames: { file: string; t: number }[] = [];
        let last = 0;
        let n = 0;
        const cdp: CDPSession = await page.context().newCDPSession(page);
        let ackFailures = 0;
        cdp.on('Page.screencastFrame', (f) => {
          void cdp
            .send('Page.screencastFrameAck', { sessionId: f.sessionId })
            .catch(() => (ackFailures += 1));
          const t = Math.round((f.metadata.timestamp ?? 0) * 1000);
          if (t - last < MIN_FRAME_GAP_MS) return;
          last = t;
          const name = `f${String(n++).padStart(5, '0')}_t${String(t)}.jpg`;
          writeFileSync(join(dir, 'frames', name), Buffer.from(f.data, 'base64'));
          frames.push({ file: name, t });
        });
        await cdp.send('Page.startScreencast', {
          format: 'jpeg',
          // Text has to survive this. Heavy JPEG is the documented way to make
          // a screenshot unreadable, and the frames are re-encoded once more
          // when they are labelled for a contact sheet.
          quality: 90,
          maxWidth: 1440,
          maxHeight: 900,
          everyNthFrame: 1,
        });

        const trace: { step: number | undefined; t: number; how: string; dwellMs?: number }[] = [];
        await open(page, tour);
        let at = await ready(page);
        trace.push({ step: at.step, t: Date.now(), how: 'armed' });

        for (let i = 0; i < 16 && !at.done; i++) {
          const from = at.step;
          const target = at.ring;
          let how = 'pill';

          // Stand here and read it, the way the visitor this is filmed for
          // would. Everything the phase is supposed to show has to be on
          // screen for this long, or it is not on screen for anyone.
          const dwell = dwellMs((await beat(page)).narration ?? '');
          await page.waitForTimeout(dwell);

          // A ringed FIELD is done by hand by typing in it, not by clicking it.
          //
          // Every beat that points at a form field fell through to the pill,
          // because a click on an input cannot complete a step — which meant
          // that on the tour whose entire subject is a one-time code, the two
          // beats the tour is about were driven by the guide, the code was never
          // seen going into the dialog at all, and the only action button was
          // disabled in 402 of the 403 frames it was on screen. A reviewer
          // counted those frames. What a visitor does is type the value they
          // were given; the recipe knows what that value is, so the walk types
          // it, key by key, and lets the application confirm the step.
          if (path === 'hand' && target !== null) {
            const typed = await page
              .evaluate((id) => {
                const el = document.querySelector(`[data-testid="${id}"]`);
                const tag = el?.tagName.toLowerCase();
                return tag === 'input' || tag === 'textarea';
              }, target)
              .catch(() => false);
            // Either a literal from the recipe, or — for a minted one-time code —
            // whatever the application has just put in storage, which is exactly
            // what the visitor would be copying off the screen.
            const act = (scenarioByKey(tour)?.steps[from ?? -1]?.perform ?? []).find(
              (a2) =>
                (a2.kind === 'fill' || a2.kind === 'fillFromStorage') &&
                a2.selector.includes(`"${target}"`),
            );
            const value =
              act?.kind === 'fill'
                ? act.value
                : act?.kind === 'fillFromStorage'
                  ? await page
                      .evaluate(
                        ([key, field]) => {
                          const raw = sessionStorage.getItem(key) ?? localStorage.getItem(key);
                          if (!raw) return null;
                          if (!field) return raw;
                          try {
                            return String(
                              (JSON.parse(raw) as Record<string, unknown>)[field] ?? '',
                            );
                          } catch {
                            return null;
                          }
                        },
                        [act.key, act.field ?? null] as [string, string | null],
                      )
                      .catch(() => null)
                  : null;
            if (typed && value) {
              await page.click(`[data-testid="${target}"]`).catch(() => undefined);
              await page.type(`[data-testid="${target}"]`, String(value), { delay: 45 });
              await page.keyboard.press('Tab').catch(() => undefined);
              at = await turned(page, from);
              await drain(page, domFile);
              if (at.step !== from || at.done) {
                trace.push({ step: at.step, t: Date.now(), how: 'typed by hand' });
                continue;
              }
              how = 'pill after typing';
            }
          }

          if (path === 'hand' && target !== null && how === 'pill') {
            const actuable = await page
              .evaluate((id) => {
                const el = document.querySelector(`[data-testid="${id}"]`);
                if (!el) return false;
                const tag = el.tagName.toLowerCase();
                // `cursor: pointer` counts. A ticket row is a <tr> with a click
                // handler and no button in it, so the narrow test said it could
                // not be acted on — and the support-ticket "hand" film went down
                // the pill path for every one of its beats, coming out frame for
                // frame identical to the guided one while claiming to be the
                // other way round. A reviewer noticed and wrote that nothing in
                // the film was done by hand. Pointer is how the application tells
                // a visitor a thing is clickable.
                return (
                  tag === 'button' ||
                  tag === 'a' ||
                  el.getAttribute('role') === 'button' ||
                  !!el.querySelector('button, a, [role="button"]') ||
                  getComputedStyle(el).cursor === 'pointer'
                );
              }, target)
              .catch(() => false);
            if (actuable) {
              await page
                .evaluate(
                  (id) => document.querySelector<HTMLElement>(`[data-testid="${id}"]`)?.click(),
                  target,
                )
                .catch(() => undefined);
              at = await turned(page, from);
              await drain(page, domFile);
              if (at.step !== from || at.done) {
                trace.push({ step: at.step, t: Date.now(), how: 'by hand' });
                continue;
              }
              how = 'pill after hand';
            }
          }

          await press(page);
          at = await turned(page, from);
          await drain(page, domFile);
          trace.push({ step: at.step, t: Date.now(), how, dwellMs: dwell });
          if (at.step === from && !at.done) break;
        }

        // Stay for the ending.
        //
        // The camera stopped on the frame after the last press, so the recap —
        // the payoff every tour is built to reach — arrived in the final
        // captured frame or not at all, and three reviewers in a row wrote that
        // the film ends on several seconds of a screen with nothing alive in it
        // and then, abruptly, the completion card. Long enough to see the card
        // settle and read its first line.
        await page.waitForTimeout(4000);
        await drain(page, domFile);
        await cdp.send('Page.stopScreencast').catch(() => undefined);

        // The last thing on the screen, taken directly.
        //
        // Every film in a whole run ended within a fifth of a second of its own
        // last press, and three reviewers wrote that the payoff — the signed-in
        // application, the completion card — was never filmed. It was not the
        // camera: a probe proved the screencast is alive to the end and emits a
        // frame for any repaint. It was the 40 ms throttle above. The tour's
        // final transition repaints once, a few milliseconds after the previous
        // frame, so the throttle discards exactly the frame that carries the
        // ending — and because the screen is then perfectly still, nothing ever
        // replaces it. One screenshot, appended as the last frame, and the film
        // has an ending again.
        const endedAt = Date.now();
        const ending = `f${String(n++).padStart(5, '0')}_t${String(endedAt)}.jpg`;
        await page
          .screenshot({ path: join(dir, 'frames', ending), type: 'jpeg', quality: 90 })
          .then(() => frames.push({ file: ending, t: endedAt }))
          .catch(() => undefined);

        const steps = scenarioByKey(tour)?.steps ?? [];
        writeFileSync(
          join(dir, 'phases.json'),
          JSON.stringify(
            {
              tour,
              path,
              run: RUN,
              frames: frames.length,
              firstFrameMs: frames[0]?.t ?? null,
              lastFrameMs: frames.at(-1)?.t ?? null,
              trace,
              ackFailures,
              business: PROCESSES.find((p) => p.tour === tour)?.phases ?? [],
              technical: steps.flatMap((s) => technicalPhases(tour, s)),
            },
            null,
            2,
          ),
        );
        // Real-time playback out of an irregular stream: each frame is held for
        // exactly as long as it was on screen.
        writeFileSync(
          join(dir, 'frames.txt'),
          frames
            .map((f, i) => {
              const next = frames[i + 1]?.t ?? f.t + 100;
              return `file 'frames/${f.file}'\nduration ${((next - f.t) / 1000).toFixed(3)}`;
            })
            .join('\n') + `\nfile 'frames/${frames.at(-1)?.file ?? ''}'\n`,
        );

        // eslint-disable-next-line no-console -- the capture is the deliverable
        console.log(
          `  ${tour} ${path}: ${frames.length} frames over ` +
            `${(((frames.at(-1)?.t ?? 0) - (frames[0]?.t ?? 0)) / 1000).toFixed(1)}s → ${dir}`,
        );
      });
    }
  }
});
