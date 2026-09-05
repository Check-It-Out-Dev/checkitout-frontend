---
name: browser-qa-sandbox
description: >
  Drives the checkitout guided demo in a real Chrome window and judges its
  visual and interaction quality state by state, turning "that looks off" into
  a measured finding or discarding it. Use when asked to watch, look at, click
  through, review, or QA the demo, sandbox, tour or presentation in a browser
  rather than in tests — including reports that it is jittery, frozen, ugly,
  too fast, too slow, or that something on screen contradicts something else.
allowed-tools: mcp__claude-in-chrome__tabs_context_mcp, mcp__claude-in-chrome__tabs_create_mcp, mcp__claude-in-chrome__tabs_close_mcp, mcp__claude-in-chrome__navigate, mcp__claude-in-chrome__computer, mcp__claude-in-chrome__browser_batch, mcp__claude-in-chrome__javascript_tool, mcp__claude-in-chrome__read_page, mcp__claude-in-chrome__find, mcp__claude-in-chrome__read_console_messages, Bash, Read, Write, Edit
---

# Watching the sandbox

The automated tiers prove the demo does not stutter and does not break. They
cannot say it looks right. This is how an agent looks at it.

Full methodology, kept in step with this skill:
`docs/testing/BROWSER-QA-METHODOLOGY.md`.

## The one rule

**A screenshot may raise a suspicion. Only the DOM settles it.** Four of the
first six suspicions in this repo's runs were artifacts of the screenshot
itself. Never report clipping, misalignment or absence from a picture.

## Order of work

1. **Calibrate** (always first, every session — the numbers change with the
   window).
2. **Walk** every state in `references/state-map.md`.
3. **Force** every case in `references/edge-cases.md`, each in a fresh tour.
4. **Sample variants** — phone, English, reduced motion. Do not multiply the
   whole state list by every variant.
5. **Triage** by severity, fix, add a regression test per fix, re-verify in the
   browser against the deployed build.
6. **Append** the run to §11 of the methodology, and any new law to §3.2.

## Calibrate

```
tabs_context_mcp {createIfEmpty:true}          → tabId
browser_batch [
  navigate {tabId, url},
  computer {action:"wait", duration:3},
  javascript_tool {text:"JSON.stringify({inner:[innerWidth,innerHeight],dpr:devicePixelRatio})"},
  computer {action:"screenshot"}
]
```

Record `scale = screenshotWidth / innerWidth`. Every coordinate you read off a
screenshot must be divided by it before it means anything to the DOM.

## What to point it at

- **`https://www.checkitout.app`** — the deployed demo. This is what the owner
  is looking at when they report something, so a report is reproduced here
  first, and a fix is re-verified here after deploying.
- **`http://localhost:4300`** — the **built** demo served the way the VPS
  serves it: `npm run serve:demo` (builds first if needed). `npm run test:perf`
  starts the same thing when nothing is listening, and rebuilds when anything
  under `src/` is newer than the bundle.

  Use this, not `ng serve`. Production is a directory of built files behind
  nginx; a dev build with a dev-mode renderer is a different application for
  measurement purposes, and `tools/serve-demo.mjs` reproduces the four serving
  rules a browser can tell apart — SPA fallback, a never-cached shell, immutable
  hashed assets, and gzip — plus the same security headers.

Start a tour with `/demo?start=<key>`. The keys are in `references/state-map.md`:
`admin-2fa`, `admin-ops`, `company-campaign`, `influencer-collab`,
`nip-to-ksef`, `stepup-email`, `support-ticket`.

## The state probe

The most-used call of any run. Where the tour is, what it offers, and where to
click for it — in one call, with the coordinate already converted:

```js
const s = JSON.parse(sessionStorage.getItem('demoSandbox') || '{}');
const p = document.querySelector('[data-testid="guide-spot-next"]');
const n = document.querySelector('[data-testid="guide-next"]');
const sc = 1568 / innerWidth; // the measured scale
const b = (p || n)?.getBoundingClientRect();
JSON.stringify({
  tour: s.key,
  step: s.step,
  done: s.done,
  way: p ? 'pill' : n ? 'panel-next' : 'none',
  shot: b && [Math.round((b.left + b.width / 2) * sc), Math.round((b.top + b.height / 2) * sc)],
  shield: !!document.querySelector('[data-testid="guide-shield"]'),
  sim: !!document.querySelector('app-world-sim-shell'),
  lang: document.documentElement.lang,
});
```

## Before each tour

**A tour is only fresh if storage is.** `?start=` resets the tour's own
position, and it is supposed to clear the artifacts a finished run leaves —
but a leaked one does not merely change a later step, it can advance the tour
with **no input at all**: a stale TOTP counter once put a freshly started
`admin-2fa` at step 2 of 3, on a sign-in error, before anything was pressed.

Starting a tour now sweeps every `demo…` key from **both** storages, keeping
only the persona (`demoRole`, `demoSession`) and the tour's own position — so
`?start=` is genuinely pristine. Still **assert `step === 0`** with the probe
above before judging anything: a run that begins at the wrong step produces
confident findings about states it never reached.

What the sweep must never take is anything not `demo`-prefixed — the language,
the theme, the consent record, a dismissed banner are the visitor's.
`e2e-tests/perf/demo-all-tours.spec.ts` holds both halves of that line.

The language choice also persists — switching to English for a variant check
leaves the next tour in English. Check `lang` in the probe rather than assuming
the narration will be Polish.

## Per state

1. **Reach it.** One `browser_batch`: act, wait, screenshot.
2. **Describe** what is on screen in one line, before judging anything.
3. **Measure** only what looks wrong, with `javascript_tool`.
4. **Record**: state id · screenshot id · verdict · evidence.

## Tool laws

Each cost a failed call. The full table is §3.2 of the methodology; these are
the ones that bite every session.

|                                                       |                                                                                |
| ----------------------------------------------------- | ------------------------------------------------------------------------------ |
| Screenshot pixels ≠ CSS pixels                        | convert with `scale`                                                           |
| `resize_window` may report success and change nothing | confirm `innerWidth`; use chrome-devtools-mcp `emulate` for a real viewport    |
| `zoom` is stateful and sticks                         | recover with a **new tab**, not a resize                                       |
| The extension disconnects mid-batch                   | retry once — and re-read state, because part of the batch may have run         |
| A batch stops at the first error                      | never batch a click whose coordinates come from a screenshot in the same batch |
| A downscaled JPEG fakes clipped text                  | `scrollWidth > clientWidth`                                                    |
| Anything outside `app-root` is not ours               | `elementFromPoint(x,y).closest('app-root')`                                    |
| Prefer `find` → `ref` over coordinates                | the page shifts between screenshot and click                                   |
| A backgrounded tab cannot be observed                 | reading it makes it visible; ask that question in Playwright                   |

## Which server

- **claude-in-chrome** — seeing. The owner's real Chrome, real profile.
- **chrome-devtools-mcp** — measuring. Traces, CPU throttle, real viewport
  emulation, insights. Reach for it the moment the question is a number, and
  always for a viewport change.
- **Neither** — reproducing a defect for keeps. That belongs in the Playwright
  tier (`npm run test:perf`), which is also the only place
  `prefers-reduced-motion` can be forced.

Never run two browsers measuring at once: they drop frames in each other's
numbers.

## Judging visual quality

Write the aesthetic verdict separately from the functional one, and give each
finding an expected-vs-observed pair plus a `data-testid` anchor — never pixel
coordinates.

Severity is binary-observable, not a feeling:

- **S1** blocks the step — no way forward, wrong control, dead control.
- **S2** breaks the promise — the copy names something that is not there; the
  ring is off its target.
- **S3** friction — covers text, needs a scroll to see, loses focus, flashes.
- **S4** cosmetic — spacing, weight, colour.

## Evidence gate

A finding needs a screenshot id, a measured number or DOM fact, and the
element's `data-testid`. A claim without all three is written `UNVERIFIED:` and
is not a finding.

## Stop conditions

Every state has a verdict · the same state repeats three times · a state is
blocked after two retries. Say which, verbatim.

## When something does not fit

If a tool behaves in a way the laws do not describe, add a law before
continuing. If the procedure itself is wrong, change the methodology file —
that document is meant to be edited from what running it teaches. Never work
around a rule silently.

## Files

- `references/state-map.md` — every tour, step and QA state (generated from
  Neo4j `DemoSandbox`).
- `references/edge-cases.md` — the twelve cases to force, with what must hold.
- `references/instrument-recipes.md` — the two measurement shapes that have
  found real defects here, and the traps that made each of them lie first.
