# Two instruments, and the traps in each

A screenshot raises a suspicion; only a measurement settles it. These are the
two shapes of measurement that have found real defects here. Both were wrong
the first time they ran, in ways that looked like findings — the traps are
listed with each because that is the part worth reading twice.

## Contents

- When to reach for which
- Recipe A — the cross-reload timeline
- Recipe B — the per-frame coexistence sampler
- Recipe C — fault injection
- Traps common to both

## When to reach for which

| The claim                                                                | The instrument                                           |
| ------------------------------------------------------------------------ | -------------------------------------------------------- |
| "this transition is too fast / too slow / flashes"                       | A — timeline                                             |
| "it froze", "these two things disagree", "it looks wrong at some moment" | B — sampler                                              |
| "does it cope when something goes wrong?"                                | C — fault injection                                      |
| "this is off by N pixels"                                                | neither: `getBoundingClientRect` on the two boxes        |
| "this text is clipped"                                                   | neither: `scrollWidth > clientWidth`, never a screenshot |

A answers _when did each thing happen_. B answers _what was true at the same
time_. A complaint about ugliness is almost always B: two surfaces holding
different beliefs about the same moment.

## Recipe A — the cross-reload timeline

For a sequence that crosses a navigation, where per-document timings are
useless because the document is replaced halfway through.

Shape (see `e2e-tests/perf/demo-checkout-timeline.spec.ts`):

1. `page.addInitScript(recorder)` — it runs in **every** document, before app
   code, so the second half of the sequence is instrumented too.
2. Stamp every mark with `performance.timeOrigin + performance.now()`. That is
   a high-resolution epoch, comparable **across** documents; `performance.now()`
   alone restarts at zero and silently lies about the join.
3. Append marks to a `sessionStorage` array. It survives the navigation, so
   what comes back is one timeline rather than two halves.
4. Record: the press, DOM appearances and disappearances, storage writes,
   network calls, navigation timing, paints.

What it produced here: the checkout dialog carrying a plan, a price and a
consent box lived **101 ms**, and the new tier was painted onto the reloaded
page 10 ms **before** its own first contentful paint — a change that never
appeared because it was never absent.

## Recipe B — the per-frame coexistence sampler

For "it freezes" and "it looks wrong", which are claims about what coexisted.

Shape (see `e2e-tests/perf/demo-2fa-coexistence.spec.ts`):

1. A `requestAnimationFrame` loop sampling one flat tuple: route, step,
   narration, panel busy state, way forward, every overlay, every busy flag,
   and the values a person could compare (a code on a phone vs a code in a
   field).
2. Collapse equal neighbours into intervals with durations.
3. Print the interval table — that _is_ the deliverable. Then assert on it:
   totals per state, the longest single run, and the combinations that should
   never coexist.

Frame granularity matters: it is the resolution a person perceives, and a
16 ms disagreement is not a defect while a 5-second one is.

What it produced here: "Working…" never exceeds 18 ms (patient, impatient, or
at 6× CPU throttle), so the reported freeze was not slowness at all — it was a
replayed tour inheriting the previous run's state.

## Recipe C — fault injection

For "does the product notice when its own action fails?" — the question behind
a tour that narrates something that did not happen.

Shape (see `e2e-tests/perf/demo-phantom-steps.spec.ts`):

1. Break exactly one thing, reversibly.
2. Drive the product normally.
3. Assert it notices — and then, with the fault removed, assert it recovers.

The fault that works here is **swallowing programmatic clicks**, everywhere
except the guide's own controls:

```js
const real = HTMLElement.prototype.click;
HTMLElement.prototype.click = function () {
  if (this.closest('[data-testid="guide-spot-next"], .guide-pop')) real.call(this);
};
```

The visitor's press still lands; everything it triggers reaches a page that
will not respond. One line to undo, and uniform across every step regardless of
what that step's recipe targets.

**Two injections that measured the wrong thing first.** Hiding the control also
hides the pill, so the press never happens and the run proves only that
pressing nothing does nothing. And renaming a `data-testid` does not hide the
element from a prefix selector — `[data-testid^="applicant-accept-"]` matched
`applicant-accept-8101--gone` perfectly well. Break the _effect_, not the name.

## Traps common to both

- **An init script runs before `documentElement` exists.** A `MutationObserver`
  pointed at it throws, and a swallowed throw means the DOM half of the
  timeline silently never records. Observe `document`.
- **A transient element is gone before the callback looks.** Anything that
  lives one frame — a dialog that opens and closes inside a recipe — must be
  read from the `MutationRecord`s, not from a live query.
- **Never wrap an API by name.** `Storage.prototype.setItem = function(){ Storage.prototype.setItem(...) }`
  captures itself; the first write recurses until the stack goes and takes the
  page with it. Capture the native reference first.
- **`textContent` is the untransformed source.** A badge uppercased by CSS
  reads lowercase there, so a case-sensitive match never fires — and an
  instrument that never fires reports the _absence_ of what it looked for.
- **Collapsing frames needs an explicit key.** Spreading the sample drags in
  the interval's own duration field, so no two frames compare equal and every
  frame becomes its own state.
- **Count what a thing does, not what it is called.** Counting "scrims" by
  class name counted card backgrounds and reported four dimming layers where
  there was one. A dimmer covers the viewport in a colour you can see through;
  test for that.

Every one of these produced a confident, wrong finding before it was caught.
When an instrument reports something dramatic, suspect the instrument first.
