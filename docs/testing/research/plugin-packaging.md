# Packaging the film harness as a Claude Code plugin — research findings

Researched 2026-09-06. Verification level is marked inline: **[cli]** = read from `--help` on the
locally installed Claude Code **2.1.263**; **[docs]** = read from the official docs page listed at the
end; **[api]** = GitHub REST API, fetched same day; **[inferred]** = my reasoning from the two
preceding, not something I read; **[unverified]** = I did not check it.

---

## 1. Mechanics of a plugin that runs on the user's own tokens

A plugin is a directory. Claude Code loads it from a marketplace, from `--plugin-dir`, from
`--plugin-url` (a `.zip`), or automatically from `~/.claude/skills/<name>/` if it carries a manifest
(a "skills-dir plugin", loaded as `<name>@skills-dir`, no install step). **[docs]**

```
film-qa/
├─ .claude-plugin/plugin.json     ← ONLY the manifest goes in here
├─ skills/<name>/SKILL.md         ← model- or user-invoked skills
├─ agents/*.md                    ← subagent definitions
├─ commands/*.md                  ← flat-file skills (legacy shape; prefer skills/)
├─ hooks/hooks.json               ├─ .mcp.json        ├─ .lsp.json
├─ monitors/monitors.json         ├─ bin/             ├─ settings.json
├─ package.json + package-lock.json
└─ evals/**/case.yaml | prompt.md + graders/*.md
```

Putting `agents/`, `skills/`, `hooks/` _inside_ `.claude-plugin/` is the documented most-common
mistake — they must sit at the plugin root. **[docs]**

Manifest: `name` is the only required field. Useful others are `version`, `description`, `author{}`,
`homepage`, `repository`, `license`, `keywords`, `defaultEnabled`, `dependencies[]`,
`experimental.evals` (relocates the eval dir), and `userConfig{}` — typed, per-install options
(`string|number|boolean|directory|file`, with `sensitive`, `required`, `default`, `min`, `max`).
Config values surface as `${user_config.KEY}` in skill/agent text and as
`CLAUDE_PLUGIN_OPTION_<KEY>` to hook and MCP commands. **[docs]**

Three path variables substitute in commands, args and env: `${CLAUDE_PLUGIN_ROOT}` (install dir),
`${CLAUDE_PLUGIN_DATA}` (`~/.claude/plugins/data/{id}/`, survives updates, deleted on uninstall
unless `--keep-data`), `${CLAUDE_PROJECT_DIR}`. **[docs]**

Marketplace entry — a `.claude-plugin/marketplace.json` at a repo root:

```json
{
  "name": "checkitout-tools",
  "owner": { "name": "Norbert Marchewka" },
  "plugins": [
    {
      "name": "film-qa",
      "source": "./plugins/film-qa",
      "description": "Verifies a guided tour keeps the promises its narration makes"
    }
  ]
}
```

`source` may also be `{"source":"github","repo":"o/r","ref":..,"sha":..}`, `url`, `git-subdir`,
`npm`, `archive` (+`sha256`), or `command`. Users add it with `/plugin marketplace add owner/repo`
and install `film-qa@checkitout-tools`. Release tagging is built in: `claude plugin tag --push`
creates `{name}--v{version}` and validates that plugin.json and the marketplace entry agree. **[cli]**

**Nothing blocks bundling our own subagents or Node tools.** `agents/*.md` is a first-class
directory; agent frontmatter supports `name, description, model, effort, maxTurns, tools,
disallowedTools, skills, memory, background, isolation`. Two real limits: plugin agents do **not**
support `hooks`, `mcpServers`, or `permissionMode` frontmatter, and `isolation` accepts only
`worktree`. **[docs]** Node code ships fine under `bin/` (added to the Bash tool's PATH while the
plugin is enabled) or `scripts/`. One caveat: `bin/` **cannot** be used by a plugin distributed
through claude.ai organization settings. **[docs]**

**Cost model.** Everything model-backed runs on the installing user's own session credential.
I found no token-pooling, plugin-supplied-quota, or billing-indirection mechanism anywhere in the
manifest schema or marketplace docs — stated as absence of evidence, not a documented denial.
**[docs, absence]** The one indirection available is routing work through our own MCP server holding
a `sensitive` `userConfig` key; skills, agents and `prompt`/`agent` hooks invoked by Claude Code
itself always spend the user's quota. **[inferred]**

Cost levers the format does give us:

| Lever                                        | Effect                                                                                                                                      |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `claude plugin details <name>`               | Prints component inventory **and projected token cost** — run before publishing; it is the number an installer judges us by. **[cli]**      |
| Skill progressive disclosure                 | An idle plugin costs roughly the sum of its skill/agent `description` lines. **[docs]**                                                     |
| `disable-model-invocation: true` in SKILL.md | Skill fires only when the user types it. Essential — Claude must never spontaneously start a multi-dollar film review. **[docs]**           |
| `defaultEnabled: false`                      | Ships opt-in. Correct default for an expensive plugin. **[docs]**                                                                           |
| Agent `model` / `effort` / `maxTurns`        | Per-agent ceilings; our Sonnet-triage / Opus-examiner / Opus-max-critic split maps straight on. **[docs]**                                  |
| `bin/` + `monitors/`                         | Shell work costs zero tokens. Push capture, frame cutting, atomic predicates and ffmpeg down here; only judging reaches a model. **[docs]** |
| `${CLAUDE_PLUGIN_DATA}`                      | Cache frames, manifests and golden runs so a re-review does not re-spend on re-capture. **[docs]**                                          |
| `userConfig`                                 | Expose judge model, frames-per-phase, crops-per-requirement, spend ceiling. Let the installer pick their own cost/depth point. **[docs]**   |
| `prompt` / `agent` hook types                | Model-backed, fire per matching event, bill every time. Avoid for anything high-frequency. **[docs]**                                       |

---

## 2. `claude plugin eval` — what we would otherwise build

Exists and is fully implemented in 2.1.263; there is **no public docs page for it** — everything here
is from `--help`. **[cli]** It runs `<evaldir>/**/case.yaml` (or `prompt.md` + `graders/*.md`) against
a plugin and reports scored results. Target may be a path, a plugin name, or `plugin@marketplace`.

| Flag                                                                                   | Replaces, in our harness                                                                                                                                                                                          |
| -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--ablation with-without` (default)                                                    | A no-plugin baseline arm plus score delta. Graders marked `with-only` (incl. `tool_used: Skill`) count as a plugin-fired indicator, not toward score. This is exactly the "does vision earn its cost" experiment. |
| `--runs <n>` (default `case.runs ?? 3`)                                                | Repeated runs for judge variance.                                                                                                                                                                                 |
| `--judge-model` (default **haiku**)                                                    | Cheap-judge default; escalation = a second case or a per-case model override via `--model`.                                                                                                                       |
| `--threshold <0..1>`                                                                   | Exit 1 below threshold — a gate, free.                                                                                                                                                                            |
| `--max-cost-usd`                                                                       | Hard ceiling, exit 2 with partial results; overrun bounded to one agent run, paid graders skipped first.                                                                                                          |
| `--mocks record\|off`                                                                  | MCP stand-ins from `<evaldir>/mocks/`.                                                                                                                                                                            |
| `--json [path]`, `--report <path>`                                                     | Full run result; self-contained HTML report, **published to claude.ai by default** (`--no-publish` opts out).                                                                                                     |
| `--case <glob>`, `--tag`, `--allow-tools`, `--scaffold`, `--keep-temp`, `--output-dir` | Selection, gated tool grants, scaffold scripts, artifact retention.                                                                                                                                               |

`claude plugin eval init` runs an authoring interview; `--bare <name>` writes a blank
`prompt.md` + `graders/criteria.md`. The `case.yaml` schema is not published anywhere I could find —
generating the bare template is the fastest way to read it. **[cli; schema unverified]**

**Where it does not fit us.** It grades _an agent's transcript_ against text graders. Our unit is a
phase window on a millisecond timeline, and our evidence is frames plus a per-rAF DOM log. Concretely:
(a) no notion of a time window, continuous-visibility duration, or motion — those stay ours;
(b) graders are prose/LLM over output, not predicates over an external artifact stream, so
`film-cut.mjs` results have to be reduced to something a grader can read; (c) `--runs 3` re-runs the
_agent_, which for us would mean re-driving the browser three times — expensive and, given
non-deterministic screencast timing, not the same film; (d) its ablation arm is
plugin-present/plugin-absent, not vision-on/vision-off, so our ablation needs to be expressed as two
plugins or two cases. Best use: eval the _plugin's judgment layer_ against a frozen set of recorded
films with known defects — not as the harness runner itself. **[inferred]**

---

## 3. Shelling out to Playwright and ffmpeg

What a plugin may assume: nothing beyond a shell and whatever is on the user's PATH. Node dependency
auto-install exists but is deliberately narrow — a `package.json` plus `bun.lock`/`bun.lockb`
(`bun install --frozen-lockfile --ignore-scripts`) or `npm-shrinkwrap.json`/`package-lock.json`
(`npm ci --ignore-scripts`), with a **60-second timeout**, yarn and pnpm skipped entirely. Failure
never blocks the plugin; a partial `node_modules` may be left behind after a timeout. **[docs]**

`--ignore-scripts` is the problem for us: Playwright downloads browser binaries in a postinstall
script, so auto-install will produce a Playwright package with no browsers. **[inferred from the
documented flag]** ffmpeg is a native binary and was never in scope for npm anyway.

The documented escape hatch is a `SessionStart` hook that installs into `${CLAUDE_PLUGIN_DATA}` and
no-ops when the cache is warm — the docs give a `diff -q` guard example for exactly this. **[docs]**

How others handle a heavy native dependency — three patterns I observed, none of whose install docs
I read in full, so treat the attribution as **[unverified]** even though the repos are real **[api]**:
`chrome-devtools-mcp` (51.1k★) connects to the user's _existing_ Chrome rather than shipping one;
`playwright-mcp` (36.8k★) is invoked on demand via npx, pushing the download to first use rather than
install; `midscene` (14.8k★) ships a Chrome extension as an alternative to a driven browser entirely.
The common thread is: do not bundle, detect — and fail with a precise instruction. For us that means a
preflight that checks `npx playwright --version`, the browser cache, and `ffmpeg -version`, then tells
the user the one command to run. A `Setup` or `SessionStart` hook is the natural home. **[inferred]**

---

## 4. Five to steal, five that will bite

**Steal.** (1) reg-suit's baseline storage model — goldens keyed by commit SHA, diff report as an
artifact, not a video. (2) argos-ci's review surface — approve/reject per image beats a wall of
markdown. (3) midscene's replay report — a scrubbable per-step screenshot+DOM view is the single
biggest usability gap in what we have. (4) coder_eval's declarative YAML case shape plus explicit
activation checks. (5) dbar's "first divergence + timeToDivergence" as the diff primitive for golden
runs, in place of whole-run equality.

**Constraints that will bite.** (1) `--ignore-scripts` + 60 s means we own dependency bootstrap
ourselves. (2) The screencast clock is not reproducible — CDP emits one frame per rendered frame,
ack-gated at `maxFramesInFlight` 3, and frames can be dropped, so filename-ms is wall-clock, not a
comparable axis; `Emulation.setVirtualTimePolicy` is the lever, and `HeadlessExperimental.beginFrame`
is gone in Chromium 147+ and never existed in `--headless=new`. (3) Every model call is the
installer's money, so anything auto-invocable must be cheap or gated with
`disable-model-invocation`. (4) `process-map.ts` encodes _our_ tour engine's contract — shipped as-is
it is a great in-repo harness and a plugin nobody can install; the adapter must be `userConfig`-injected.
(5) `bin/` is unavailable for claude.ai org-settings distribution, so the Node tooling needs a second
delivery path if that channel ever matters.

Two things worth doing regardless of packaging: replace frame-derived motion with
`PerformanceObserver('layout-shift')` (`sources[].previousRect/currentRect` names the element and the
distance, `hadRecentInput` separates user-caused motion) and diagnose freezes with
`long-animation-frame` entries, which name the blocking handler. Both are free and deterministic.
And rename `requires`/`atomic` to **applicability**/**expectations**: W3C ACT Rules Format 1.1 already
formalises atomic rules (one applicability, one or more plain-language expectations, one verdict per
target) and composite rules (combine atomic outcomes, must name their inputs, cannot nest). For the
"readable for 112 ms" class of defect, subtitling standards give a citable threshold instead of a
judgment call — Netflix minimum 5/6 second per event, 20 cps adult / 17 cps children; BBC 160–180 wpm.

---

## Sources actually read

- https://code.claude.com/docs/en/plugins
- https://code.claude.com/docs/en/plugins-reference
- https://code.claude.com/docs/en/plugin-marketplaces
- Local CLI, Claude Code 2.1.263: `claude plugin --help`, `plugin eval --help`, `plugin eval init --help`, `plugin validate --help`, `plugin details --help`, `plugin tag --help`
- https://www.w3.org/TR/act-rules-format/
- https://wicg.github.io/layout-instability/
- https://chromedevtools.github.io/devtools-protocol/tot/Emulation/
- https://chromedevtools.github.io/devtools-protocol/tot/HeadlessExperimental/
- https://github.com/pyyush/dbar
- GitHub REST API `/repos/{owner}/{repo}` for star counts and `pushed_at`: garris/BackstopJS, lost-pixel/lost-pixel, argos-ci/argos, web-infra-dev/midscene, browserbase/stagehand, microsoft/playwright-mcp, vitalets/playwright-bdd, reg-viz/reg-suit, americanexpress/jest-image-snapshot, Skyvern-AI/skyvern, browser-use/browser-use, antiwork/shortest, checkly/headless-recorder, ChromeDevTools/chrome-devtools-mcp, UiPath/coder_eval, anthropics/claude-plugins-official, anthropics/claude-plugins-community, microsoft/playwright

Read only as search-result summaries, not fetched in full — lower confidence, flagged where used:
Netflix/BBC subtitle timing guidance, CDP screencast frame-drop behaviour, 2026 CI-gating practice
for LLM-judge suites.
