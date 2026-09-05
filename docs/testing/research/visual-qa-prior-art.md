# Visual QA prior art — midscene internals + the research behind doing this well

Research brief for the locally-run Claude Code plugin for model-assisted visual QA.
Web-only research, 2026-09-06. No code was read from a midscene checkout — all midscene
claims come from its published docs, its README and issue tracker, DeepWiki's generated
architecture summary, or practitioner write-ups, and are marked accordingly.

## How claims are marked

| Marker         | Means                                                                                          |
| -------------- | ---------------------------------------------------------------------------------------------- |
| `[docs]`       | Read it in midscene's own documentation                                                        |
| `[repo]`       | Read it in the GitHub README / issue tracker                                                   |
| `[wiki]`       | DeepWiki's generated summary of the repo — machine-derived from source, not authoritative      |
| `[paper]`      | Read the paper (abstract + results as fetched; partial PDF extraction noted where it happened) |
| `[spec]`       | Read a W3C spec or vendor API doc                                                              |
| `[3p]`         | Third-party practitioner write-up                                                              |
| `[inferred]`   | My reasoning from the above, not stated anywhere                                               |
| `[unverified]` | Could not confirm — treat as a lead, not a fact                                                |

---

# PART A — how midscene actually works

`web-infra-dev/midscene`, MIT, ~14.8k stars, active. `[repo]`

## A1. What it feeds the model

- **Screenshot-first, DOM opt-in.** Element location is done by a vision-language model
  emitting coordinates from a screenshot; the docs describe it as working "from
  screenshots — no selectors or annotations" and reaching "unlabeled elements, canvas,
  native apps, and cross-origin frames". `[docs]`
- The query/assertion family takes per-call options `domIncluded?: boolean | 'visible-only'`
  ("include DOM data and attributes") and `screenshotIncluded?: boolean`, plus a free-text
  `context?: string`. So the DOM is available but **off by default**. `[docs]`
- DeepWiki describes the design as "vision-first ... bypasses large DOM trees, cutting
  costs and speeding up runs", and names `@ui-tars/action-parser` as the library that turns
  visual-grounding output into executable actions. `[wiki]`
- **No set-of-mark overlay in the default loop.** I found no numbered-marker annotation
  step; grounding output is coordinates. `[inferred from docs + wiki; nowhere stated as a negative]`
- **A vision model is required.** The model list is entirely VL: Doubao-Seed, DeepSeek V4
  Flash Vision, Qwen(-VL), GPT, Gemini, Kimi, GLM-4V, UI-TARS. The docs grade them on
  "visual grounding" strength and warn DeepSeek V4 Flash Vision is "less reliable on
  complex interfaces". `[docs]` `[repo]`
- **Role-split models.** A `ModelConfigManager` "routes different task types to specialized
  AI models based on intent" — planner, grounder and judge can be different models. `[wiki]`
- **deepThink** is two-pass grounding: the model first picks a broader region, then
  re-focuses on it to locate the element precisely. Documented as available only on models
  with real visual grounding (qwen2.5-vl named). Motivated by dense custom UI where
  one-shot coordinates are wrong. `[docs]`

## A2. What it records per step, and where

- Per-run **execution dump**: step-by-step tasks and plans with status and timing, the
  screenshot, the bounding box the model targeted, the instruction, and the model's
  reasoning. `[docs]` `[3p — qaskills.sh is the source for the "bounding box + reasoning" phrasing]`
- **Report = a single self-contained HTML file** written to
  `midscene_run/report/<reportFileName>.html`; single-html is the default output format. `[docs]`
- **JSON dump is opt-in**: `persistExecutionDump: true` writes a per-execution JSON file
  alongside the report, and requires `generateReport` to stay true. `[docs]`
- **v1.7.0 added report parsing**, via CLI or JS SDK: extract raw screenshots and JSON out
  of a report file, or convert a report to Markdown (execution start time, task count, plan
  details with status and timing, screenshots as image links) so other tools can consume
  it. `[docs]`
- The report is **view-only, per run**. I searched specifically for a run-to-run report
  diff, a baseline concept, or a comparison view and **found nothing**. Treat "midscene can
  diff two runs" as false until someone reads the source. `[unverified — searched; absence of evidence, not evidence of absence]`
- A local **Playground** lets you jump to a failed step, edit the natural-language
  instruction and re-run just that step without re-running the suite. `[docs]` `[3p]`

## A3. Assertion model

Entirely imperative. Every check is written in the test, at the point it runs. `[docs]`

| Method                                                           | Behaviour                                                                                         |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `aiAssert(prompt)`                                               | Model judges an NL condition; the SDK **throws** on false, error includes the model's explanation |
| `aiQuery(dataDemand)`                                            | Structured extraction into a described shape (string / number / object / array)                   |
| `aiBoolean` / `aiNumber` / `aiString`                            | Single typed extraction                                                                           |
| `aiAsk`                                                          | Free-form question about the page, answer as a string                                             |
| `aiWaitFor(prompt, {timeout, interval})`                         | Poll until an NL condition becomes true                                                           |
| `aiTap` / `aiHover` / `aiInput` / `aiKeyboardPress` / `aiScroll` | "Instant actions" — model only locates, the framework performs the interaction                    |
| `ai` / `aiAct`                                                   | Planned multi-step flow (the LLM decides the steps)                                               |

- **There is no notion of a step promising something to be checked later.** No declared
  expectation, no contract, no deferred obligation. `[docs — searched the API reference for it]`
- **The one exception, and it is the interesting one:** `startObserving({ intervalMs,
maxFrames, watchdogMs })` samples screen frames over an explicit window while other agent
  calls run, returning a `UIObserver`. `observer.stop()` freezes the buffer into a
  `UIObservation` (`frameCount`, `startedAt`, `endedAt`) whose frames no longer change, and
  you then call `aiAssert` / `aiQuery` / `aiBoolean` / `aiNumber` / `aiString` / `aiAsk`
  **against the recorded frames only**. Documented purpose: transient UI — toasts, banners,
  screen transitions — that a single screenshot would miss. Defaults: `intervalMs` 1000
  (minimum 200), `maxFrames` 30, `watchdogMs` 300000 (0 disables). `[docs]`
- That is a recorded time window asserted after the fact. It is the closest primitive in
  the ecosystem to "this phase promised X", and it is the piece worth stealing. `[inferred]`

## A4. Caching and determinism

- Cache lives in `./midscene_run/cache` as `.cache.yaml` files. `[docs]`
- **Two things are cached: AI planning steps** (from `ai` / `aiAct`) **and element location
  XPaths** (from `aiLocate` / `aiTap`). `[docs]`
- **Cache key is the prompt string** — the task instruction for planning, the localization
  prompt for elements. `[docs]`
- **Validation on reuse:** the cached XPath is re-checked against current text content and
  DOM structure; on mismatch the entry is discarded and the model is called fresh. A cached
  `aiAct` plan that fails at runtime also falls back to fresh analysis. `[docs]`
- **Verdicts are never cached.** "The query results like `aiBoolean`, `aiQuery`, `aiAssert`
  will never be cached." Reruns therefore get cheaper navigation and _fresh, and so
  non-deterministic, judgements_ every time. `[docs]`
- `MIDSCENE_CACHE` env var controls caching behaviour. `[wiki]`
- One write-up describes the report timeline marking cached vs. fresh AI calls with a
  "frozen context" indicator. I did not find this in the official docs. `[3p]` `[unverified]`

## A5. Stated limits

- **Viewport only** — `aiAction`, `aiAssert`, `aiQuery` operate on what is currently
  visible; content below the fold is out of reach (open feature request #493). `[repo]`
- **iframes** are called out as a gap. `[repo]`
- The framework "only covers scenarios of page query and user interaction, without
  supporting auxiliary operations related to test environments" — no fixture, seed or env
  control. `[repo]`
- Recurring user friction around env vars and model integration. `[repo]`
- No stated position on flakiness rates, cost, or assertion false-positive behaviour. Both
  the docs and the third-party guides present `aiAssert` uncritically. `[docs]` `[3p]`

---

# PART B — the research behind doing this well

## B1. VLM-based UI test oracles — what is measured

**WebTestBench** — arXiv 2603.25226. 100 AI-generated web apps, 7 categories, ~17.5 gold
test items each across Functionality / Constraint / Interaction / Content. 10 models
including Claude Opus and Sonnet 4.5, GPT-5.1/5.2, GLM-5, Qwen3-Coder-Next. `[paper]`

- **Every model scored below 30% F1.** Best: GPT-5.1 at 26.4%; MiMo-V2-Flash 25.1%.
- **Checklist generation is the bottleneck** — coverage below 70% for all models, so a
  large share of test items is never even considered. False negatives are baked in before
  any looking happens.
- Detection splits into aggressive (recall over precision) or conservative (misses
  defects). High false positives come specifically from **misreading transient rendering
  delays and async state updates as functional failures**.
- Degrades sharply on Search and User-Generated-Content categories that need semantic
  rather than state-change judgement; on long horizons ("dozens of turns and millions of
  tokens") tracking failures accumulate.
- **Act on it:** never let the model both author the checklist and grade it. Author the
  checks; the model judges one bounded question at a time.

**VLM detection of visual bugs in HTML5 canvas apps** — arXiv 2501.09236, published in
Empirical Software Engineering (2026). 100 screenshots, 20 PixiJS apps, 80 injected bugs in
4 classes; GPT-4o. `[paper]`

- Overall accuracy **26% with no context → 39%** with README + bug-type descriptions + a
  **bug-free reference screenshot**.
- **Median precision 34–50% without a reference screenshot → 100% with one.** The cheapest
  intervention in this whole brief.
- Recall by class: state 33%, rendering 30%, layout 20%, **appearance 14%**.
- Bug-free accuracy still only ~98% median _even when the analysed screenshot was identical
  to the reference_ — a residual false-positive floor.
- Passing raw image assets **hurt** rather than helped.
- Non-determinism across repetitions with identical inputs is explicitly acknowledged;
  pass@k gave 3–4 absolute points for doubling k.
- **Act on it:** always ship a known-good reference frame plus an explicit defect taxonomy;
  budget for appearance and layout blindness; sample more than once.

**Beyond Pixel Diffs / WUICC-bench** — arXiv 2607.01728. Reframes visual regression as image
_change captioning_. Pixel comparison is "semantically blind and treats rendering noise and
genuine defects identically, producing large volumes of false positives". Trained
change-captioning methods suppress non-meaningful visual noise far more selectively;
zero-shot general LLMs struggle on web UI because of layout diversity, dense text and
fine-grained changes. `[paper]`
**Act on it:** pixel-diff to _localise_, model to _describe and triage_. Not either/or.

**XBIDetective** — arXiv 2512.15804. VLMs on paired screenshots of the same page in
different browsers, to find content and structural cross-browser inconsistencies. Same
lesson as above: the model does better comparing a pair than judging a single image. `[paper]`

**VisionDroid** — arXiv 2407.03037. Vision-driven MLLM detection of _non-crash functional_
bugs on mobile: extracts GUI text and aligns it with the screenshot into one vision prompt,
and segments exploration history into logically cohesive parts for a logic-aware detector.
Found 29 new bugs on Google Play, 19 confirmed and fixed. `[paper]`
**Act on it:** DOM-extracted text aligned to the screenshot beats either alone.

**Grounding — two findings that pull in opposite directions:**

- **GUI-Lens**, arXiv 2608.03270: coordinate priming (OCR + component detection supplying
  labels and boxes) → coarse-to-fine cropping → **visual verification of the proposed crop
  and click before executing**, rejecting and restarting on failure. 87.9% on
  ScreenSpot-Pro with GPT-5.5, up to **+24.9 percentage points**; consistent across three
  VLM backends and four benchmarks; 95.1% of samples resolve within four crop rounds; a
  "balanced" configuration gains 10+ points for 1.27× latency. Limits: depends on the
  quality of the OCR/detection modules, and needs multiple VLM invocations. `[paper]`
  This is midscene's deepThink taken two steps further — and it says go further.
- **Do GUI Grounders Truly Understand UI Elements?** — Findings of EACL 2026, paper 144.
  Grounders confuse elements that look alike but function differently, and are weak on
  **state-dependent appearance (enabled/disabled, selected/unselected)** and on precise
  localisation despite looking right. The paper's own framing: VLMs suit an initial filter,
  not a final arbiter. `[paper — PDF fetched; the fetch could not extract the numeric tables, so the direction is confirmed and the magnitudes are not]` `[unverified: exact numbers]`
  **Act on it:** never ask a VLM for element _state_. Read state from the DOM or the
  accessibility tree; reserve the model for semantics and appearance.

**Accessibility tree vs. screenshot vs. set-of-mark:** a11y-tree coordinates can be mapped
to bounding boxes to _generate_ set-of-mark prompts, and the a11y tree is reported as more
precise and robust than a detection+OCR pipeline on dense screens where OCR fails — while
a11y trees themselves "widely suffer from incomplete and incorrect annotations". `[3p — search synthesis across OSCAR/UGround-adjacent work; I did not read a single paper stating this comparison head-to-head]` `[unverified]`

## B2. The oracle problem for visual and temporal properties

**Assessing Behavioral Validation in UI Component Test Suites Using Inferred Metamorphic
Relations** — arXiv 2608.03337. 214 UI components across four libraries. `[paper]`

- An MR is inferred as a 4-tuple: source condition, a transformation (input / interaction /
  state), an expected behavioural relation, and supporting evidence. Six categories:
  input-prop behaviour, state/event semantics, interaction/accessibility, visual/layout
  behaviour, composition/context behaviour, data flow.
- Distinguishes **Touch** (the test exercises the relation) from **Cover** (the test
  explicitly validates it).
- **MR Touch 82.2–89.4%, MR Cover only 42.5–47.6%.** Two-thirds to three-quarters of
  uncovered relations are exercised but never asserted — the "weak-oracle gap".
- Input components validate best (57.8%); **layout components worst (22.7–37.6%)** —
  precisely the class a screenshot tool exists to cover.
- MR coverage correlates only weakly with statement/branch coverage: a genuinely
  complementary adequacy measure.
- **Act on it:** report _promise coverage_ — declared / exercised / actually validated —
  rather than screens visited. That number is the plugin's reason to exist.

**Metamorphic testing as a partial oracle** — ACM Computing Surveys 51(1), the standard
review. MRs are necessary properties over _multiple executions_, used where no absolute
oracle exists; constructing meaningful MRs is the long-standing hard part, and recent work
shows LLMs can infer MRs from code and documentation. `[paper — survey abstract plus search synthesis]`

Cheap MRs for our case, none needing a ground-truth image `[inferred]`:
`prefers-reduced-motion` on/off, viewport rescale, locale swap, light/dark. Outputs must
_relate_, not be equal.

## B3. Flakiness and reproducibility in browser visual testing

**Root causes are settled.** UI-based flaky tests: **45% async wait**, 20% concurrency, 12%
test-order dependency; async-wait failures are tests interacting with elements not yet
delivered by the network, the browser rendering pipeline, or the graphics pipeline (ICSE'21,
arXiv 2103.02669). Concurrency-related flakiness is also the top cause in JavaScript
projects specifically (arXiv 2207.01047). A reproducible corpus of 49 async-wait flaky tests
and their fixes exists (arXiv 2305.08592). `[paper]`

**Practitioner floor for screenshot stability** `[3p — consistent across several 2026 Playwright guides; API details from the Playwright docs]`:

| Lever                                             | Why                                                                                                                                |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `animations: 'disabled'`                          | Playwright injects CSS that finishes transitions instantly and pauses infinite animations — deterministic, unlike guessing a sleep |
| `await page.evaluate(() => document.fonts.ready)` | Web fonts render differently and late; metric shifts read as diffs                                                                 |
| Fixed viewport, one Linux container               | OS-level font rasterisation differs; generate and verify baselines in the same image                                               |
| `mask` dynamic regions                            | Clocks, avatars, ids                                                                                                               |
| Hide the caret                                    | A blinking cursor is a per-frame diff                                                                                              |

**Time determinism — Playwright Clock API** `[spec — playwright.dev/docs/clock]`:
`clock.install()` overrides `Date`, `setTimeout`, `setInterval`, **`requestAnimationFrame`**
and `performance`; then `setFixedTime`, `setSystemTime`, `pauseAt`, `runFor`, `fastForward`,
`resume`. **`install` must be called before any other clock-related call** or behaviour is
undefined. `setFixedTime` is the recommended default; `install` only when you need
pause/resume.

**The tension nobody states out loud** `[inferred]`: `animations: 'disabled'` is correct for
_parity_ screenshots and destroys the very property a _temporal_ check exists to measure.
These need to be two run modes. A plugin with one global animation setting will silently
make its own temporal assertions vacuous.

## B4. Formalism for "this phase promises X for at least N ms"

**There is no UI-specific formalism for this. I looked and found nothing.** No Gherkin/BDD
extension with temporal or duration vocabulary; no established "UI contract" notation.
Recording that as a negative result rather than citing something adjacent as if it fit.
`[searched; negative result]`

What does exist, and is worth adopting deliberately:

- **Live Sequence Charts** (Damm & Harel 1998; Harel & Marelly, _Come, Let's Play_).
  Extends message sequence charts with universal/existential modalities and, crucially, a
  **temperature on locations and messages: hot = progress is enforced (it must happen),
  cold = it may be violated and the chart exits gracefully.** Both hot and cold conditions
  have an advance action; cold conditions additionally have a violation action. The
  **play-in** technique authors scenarios _directly from the system's GUI_; **play-out**
  executes them against it. `[paper — Weizmann LSC / play-engine material]`
  This is exactly the vocabulary for "a step promises": hot obligation vs. cold expectation.
- **Metric / Mission-time Temporal Logic (MTL, MLTL)** — LTL plus quantitative timing bounds
  on the modal operators, designed for runtime monitoring of traces; active work on
  synthesising _efficiently monitorable_ MTL formulas (arXiv 2310.17410) and on interactive
  validation of MLTL against traces (WEST, Science of Computer Programming 2025). Simulink
  Test's Temporal Assessments are the UX precedent: a GUI that composes temporal
  specifications so they read as English, without hand-writing formulae. `[paper]` `[3p — MathWorks]`
  A recorded frame window (§A3) _is_ a finite trace. MTL is its semantics.

**Real numbers to anchor promises against** `[spec — W3C]`:

| Source                           | Number                                                                                                                                                                                                                                                                 |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| WCAG 2.2.2 Pause, Stop, Hide (A) | Auto-starting moving / blinking / scrolling content presented in parallel with other content and lasting **more than 5 seconds** needs a pause, stop or hide mechanism, unless it is essential. Equivalently: cap it at 5 s.                                           |
| WCAG 2.2.1 Timing Adjustable (A) | Turn off; **or** adjust over a range **at least 10× the default**; **or** warn before expiry with **at least 20 seconds** to extend by a simple action, extendable **at least 10 times**. Exceptions: real-time event, essential, or a limit **longer than 20 hours**. |
| Reading-rate convention          | ~**200 wpm**; toast floor around 5–6 s — commonly 5 s plus ~1 s per 3 words, or 5 s plus 1 s per 120 words in another formulation. `[3p — design-system and a11y practitioner guidance, not a standard]` `[unverified as a standard]`                                  |

## B5. LLM-as-judge reliability on visual evidence

**Mitigating Perceptual Judgment Bias in Multimodal LLM-as-a-Judge** — arXiv 2606.02578,
June 2026. The most directly actionable paper in this brief. `[paper]`

- Under controlled visual perturbation, MLLM judges **anchor on the response text rather
  than their own perception** — they "reward plausible narratives over perceptually correct
  answers".
- Two distinct failure modes: **insufficient perceptual capability** (over-rewards coherent
  but visually wrong answers) and **response anchoring** (defaults to the visual description
  supplied _in the response text_ instead of looking).
- Their mitigation (Perception-Judge) gains up to 11% on batch-level metrics for
  Qwen3-VL-4B-Thinking and +15% single-score accuracy on Flex-Judge-7B.
- **Act on it:** "Does this screenshot match: &lt;expected&gt;?" is the wrong prompt shape.
  Two stages — describe the frame cold with no access to the claim, then compare the
  description to the promise, either programmatically or in a second call that never sees
  the image.

Supporting: **MM-JudgeBias** (arXiv 2604.18164) on compositional biases in MLLM judges;
**Reliability without Validity** (arXiv 2606.19544), a large-scale evaluation across
agreement, consistency and bias. `[paper — titles and framing only; the PDF fetches could not extract either paper's numbers, so I quote none]` `[unverified: their magnitudes]`

## B6. Note on `PerformanceObserver('layout-shift')` and our own furniture

The team lead's read is correct, and it constrains any recommendation of this kind.
`[spec — web.dev/articles/cls]`

- The Layout Instability API reports a `layout-shift` entry when a visible element "changes
  its **start position** ... between two frames" — start position meaning its top/left in
  the default writing mode.
- `transform` is the documented _escape_ from this: web.dev recommends `transform:
translate()` instead of changing `top` / `right` / `bottom` / `left`, and `transform:
scale()` instead of `height` / `width`, explicitly because transforms "let you animate
  elements without triggering layout shifts".
- **Therefore:** a `position: fixed` ring and pill moved by `transform` produce **no
  `layout-shift` entries at all**, however far or however abruptly they move. By design, not
  a threshold effect and not a bug.

What the observer _would_ see, in our setup `[inferred from the spec above — not measured against our app]`:

| Would produce entries                                                                                                                                  | Would not                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------ |
| Page content under the guide reflowing when a step mounts something in flow (a banner, an expanded panel, a late-loading image with no reserved space) | The ring and the pill themselves, at any transform           |
| An element the guide toggles between `display` and hidden **in normal flow**, shifting its siblings                                                    | Anything `position: fixed` that only ever moves by transform |
| A late web-font swap changing text metrics and pushing content                                                                                         | Opacity or visibility changes with no start-position change  |

So layout-shift is usable as a _page-health_ signal during a guided step, and is
structurally blind to the guide's own chrome. Any assertion about the ring or pill moving
must come from a different source: transform values read off the element, or the frame
buffer (§A3) plus a pixel/region check. Do not build a "did the ring jump?" check on CLS.

---

# Five things to steal from midscene

1. **One self-contained HTML report per run, plus a first-class parse-back path.** Human
   replay and machine consumption from a single artifact; ship the "report → JSON /
   Markdown" extraction (their v1.7 move) on day one rather than bolting it on. `[docs]`
2. **Record the model's bounding box and its reasoning next to every screenshot.** That is
   why a midscene failure is more informative than a selector stack trace — you can see what
   the model thought it was looking at. `[docs]` `[3p]`
3. **`startObserving` → frozen frame window → assert afterwards.** Sampled frames with an
   interval, a frame cap and a watchdog turn transient UI into durable evidence, and the
   frozen buffer makes the assertion reproducible against a fixed trace. This is our
   temporal-property primitive; everything in §B4 attaches to it. `[docs]`
4. **Cache navigation, never cache verdicts.** Plans and element locations keyed by prompt
   with structural re-validation on reuse; judgements always fresh. The split is right even
   though it means verdicts are never free. `[docs]`
5. **Role-split models behind one config, with atomic verbs kept separate from planned
   flows.** `aiTap` (model locates, framework acts) is deterministic where it can afford to
   be; `aiAct` is not. Keep that boundary explicit rather than letting one planner drive
   everything. `[docs]` `[wiki]`

# Five things the research says we should do that we probably are not

1. **Always pass a known-good reference frame plus an explicit defect taxonomy into the
   judge.** Median precision went 34–50% → 100% on that alone in the canvas study. If we are
   sending a bare screenshot and a question, this is the highest-value change available.
   (arXiv 2501.09236)
2. **Blind the judge to the claim.** Perceptual Judgment Bias means a judge shown the
   expected text will anchor on it instead of looking. Describe the frame cold, then compare
   descriptions in a second step that never sees the image. (arXiv 2606.02578)
3. **Pin time, not just animation.** `clock.install()` + `pauseAt` / `runFor` overrides
   `requestAnimationFrame` and gives frame-exact "visible for at least N ms" assertions —
   whereas `animations: 'disabled'`, correct for parity screenshots, makes temporal
   assertions vacuous. Two run modes, not one global setting. (playwright.dev/docs/clock)
4. **Never let the model author the checklist it grades, and report promise coverage.**
   Checklist coverage under 70% and F1 under 30% for every frontier model (WebTestBench);
   and the metamorphic study shows Touch 82–89% against Cover 42–48% — the gap between what
   a run exercised and what it actually validated is the number worth publishing, not
   screens visited. (arXiv 2603.25226, arXiv 2608.03337)
5. **Never ask a VLM for element state or fine layout.** Enabled/disabled, selected, focused
   and precise geometry come from the DOM or the accessibility tree; the model gets semantics
   and appearance only — and even there, budget for its weakest classes (appearance 14%,
   layout 20% recall). (EACL 2026 Findings 144, arXiv 2501.09236)

---

# Sources read

Midscene:

- https://midscenejs.com/ — landing page, model list, positioning
- https://midscenejs.com/caching.html — cache contents, keys, validation, what is never cached
- https://midscenejs.com/reference/ — API surface, `startObserving` / `UIObserver` / `UIObservation`, `domIncluded` / `screenshotIncluded`
- https://midscenejs.com/blog-introducing-instant-actions-and-deep-think — instant actions, deepThink two-pass grounding
- https://github.com/web-infra-dev/midscene — README, packages, models, licence
- https://github.com/web-infra-dev/midscene/issues/493 — viewport-only limitation
- https://deepwiki.com/web-infra-dev/midscene — generated architecture summary (Agent / AbstractInterface / ModelConfigManager, dumps, `@ui-tars/action-parser`)
- https://qaskills.sh/blog/midscene-ai-visual-testing-guide-2026 — third-party account of the report contents

Papers:

- https://arxiv.org/html/2603.25226 — WebTestBench
- https://arxiv.org/html/2501.09236 — VLMs for visual bugs in HTML5 canvas apps (also https://link.springer.com/article/10.1007/s10664-026-10906-3)
- https://arxiv.org/abs/2607.01728 — Beyond Pixel Diffs / WUICC-bench
- https://arxiv.org/html/2512.15804 — XBIDetective
- https://arxiv.org/abs/2407.03037 — VisionDroid
- https://arxiv.org/html/2608.03270 — GUI-Lens
- https://aclanthology.org/2026.findings-eacl.144.pdf — Do GUI Grounders Truly Understand UI Elements?
- https://arxiv.org/html/2608.03337 — Inferred metamorphic relations for UI component test suites
- https://dl.acm.org/doi/10.1145/3143561 — Metamorphic Testing: A Review of Challenges and Opportunities
- https://weihang-wang.github.io/papers/UIFlaky-icse21.pdf and https://arxiv.org/pdf/2103.02669 — An Empirical Analysis of UI-based Flaky Tests
- https://arxiv.org/pdf/2207.01047 — An Empirical Study of Flaky Tests in JavaScript
- https://arxiv.org/pdf/2305.08592 — Time-based Repair for Asynchronous Wait Flaky Tests in Web Testing
- https://arxiv.org/pdf/2310.17410 — Synthesizing Efficiently Monitorable Formulas in Metric Temporal Logic
- https://www.sciencedirect.com/science/article/abs/pii/S0167642325001042 — WEST, interactive MLTL validation
- https://wiki.weizmann.ac.il/playgo/index.php/Live_sequence_charts and https://www.weizmann.ac.il/math/harel/come-lets-play — Live Sequence Charts, hot/cold conditions, play-in / play-out
- https://arxiv.org/abs/2606.02578 — Perceptual Judgment Bias in multimodal LLM-as-a-judge
- https://arxiv.org/pdf/2604.18164 — MM-JudgeBias (title and framing only)
- https://arxiv.org/pdf/2606.19544 — Reliability without Validity (title and framing only; numbers not extracted)

Specs and vendor docs:

- https://www.w3.org/WAI/WCAG22/Understanding/timing-adjustable.html — SC 2.2.1 numbers
- https://www.w3.org/WAI/WCAG21/Understanding/pause-stop-hide.html — SC 2.2.2 five-second rule
- https://playwright.dev/docs/clock — Clock API and its ordering constraint
- https://web.dev/articles/cls — layout-shift start-position definition and the transform exclusion
- https://www.mathworks.com/company/technical-articles/specification-and-runtime-verification-of-temporal-assessments-in-simulink.html — GUI-composed temporal specifications, as UX precedent
