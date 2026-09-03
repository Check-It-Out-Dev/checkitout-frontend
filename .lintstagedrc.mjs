/**
 * lint-staged config (function form).
 *
 * Why not the old JSON one-liner: the generated OpenAPI client
 * (src/app/api, ~280 files) is git-tracked since 2026-09-02. A regen
 * stages all of it at once, and lint-staged then spawned ONE
 * `prettier --write <277 paths>` — over the Windows command-line
 * length limit ("The command line is too long"). Prettier would have
 * skipped those files anyway (.prettierignore), so:
 *   1. drop generated-client paths before they reach prettier;
 *   2. chunk whatever remains to stay far below the argv limit.
 */
// src/app/api = generated client; docs/openapi/openapi.json = the BE-generated
// spec copy, kept byte-identical to be2's canonical spec (prettier reformatting
// it would break the sha256 lockstep the contract loop audits).
const GENERATED = /[\\/]src[\\/]app[\\/]api[\\/]|[\\/]docs[\\/]openapi[\\/]openapi\.json$/;
const CHUNK = 40;

export default {
  '*.{ts,html,scss,css,json,md}': (files) => {
    const own = files.filter((f) => !GENERATED.test(f));
    const commands = [];
    for (let i = 0; i < own.length; i += CHUNK) {
      const batch = own
        .slice(i, i + CHUNK)
        .map((f) => JSON.stringify(f))
        .join(' ');
      commands.push(`prettier --write ${batch}`);
    }
    return commands;
  },
};
