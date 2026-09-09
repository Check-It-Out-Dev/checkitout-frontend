# ADR — visual baselines rasterised in one place: the pinned Playwright container

_2026-09-09. Status: accepted (design); execution is the browser-tiers slice of the CI arc._

## Context

The visual tier holds 335 baseline PNGs under `e2e-tests/visual/sandbox-snapshots.spec.ts-snapshots/` and
`e2e-tests/visual-parity/parity.spec.ts-snapshots/`, every one of them named `…-win32.png`: Playwright's
default snapshot name carries the platform, and every baseline so far was captured on the Windows dev box.
A Linux runner rasterises text and anti-aliasing differently, so the tier cannot run in CI against those
files; the README says so in its "in progress" table. Two gates depend on the baselines: G5
(`check-visual-baseline-freshness`, an mtime rule against `.last-regen.txt`) and the fixture-coverage gate
(`check-visual-fixture-coverage`, every sandbox fixture has a snapshot).

## Options

1. **One rasteriser: the container.** Baselines are captured and compared only inside
   `mcr.microsoft.com/playwright:v<pinned>-noble`, locally through Docker and in CI through the same image.
   The Windows set is deleted; the Linux set is committed once and regenerated the same way ever after.
2. **Two sets.** Keep `-win32` for local runs and add `-linux` for CI; Playwright picks by platform.
   Every visual change then needs two regenerations on two machines, and the freshness gate has to know
   which set is stale.
3. **Tolerances.** Raise `maxDiffPixelRatio` until cross-platform text differences pass. The tier would
   then stop seeing the one-pixel regressions it exists to catch.

## Decision

Option 1. The container is the canonical rasteriser. Reasons: one truth instead of two, the CI run and the
local run diff against the same pixels, the image is already pinned to the repository's Playwright version
(`deploy/k8s/tests/Dockerfile.playwright`), and a Docker run on the dev box costs seconds once the image is
cached. The 335 Windows files are replaced by their Linux equivalents in a single commit whose diff is the
migration itself.

## Consequences and the migration (execution slice)

- `npm run test:visual` and `test:visual:update` move behind a small wrapper, `tools/visual-docker.mjs`, that
  runs the same command inside the pinned image with `src/`, `e2e-tests/` and `tools/` mounted from the host and
  `node_modules` taken from the image. Snapshots land on the host as `…-linux.png`. Direct host runs stay
  possible for debugging but write nothing (`--ignore-snapshots` or an explicit `VISUAL_HOST=1` opt-in).
- Fonts are the one non-deterministic input. The app loads Inter with `font-display: optional`, which can
  skip the web font on first paint; the visual spec must wait for `document.fonts.ready` before every
  screenshot, and the acceptance for the slice is **two consecutive container runs with zero diffs**.
- `write-regen-tag.mjs` and the G5 rule stay as they are; the tag is written by the wrapper after a container
  regeneration. `check-visual-fixture-coverage` must match `-linux.png` names (it matched `-win32` by
  accident of the default; make the suffix explicit).
- CI: `browser-tiers.yml` runs the visual shard in the pinned image (`container:` or the test image from the
  Kubernetes slice), uploads the diff artefacts on failure, and never updates baselines on its own.
- The README row "Visual tiers in CI — needs a runner whose rasterisation matches the captured baselines"
  flips once the first CI run is green against the Linux set.

## Rejected

Two sets (double maintenance, drift between them) and tolerances (the tier would stop meaning anything).
