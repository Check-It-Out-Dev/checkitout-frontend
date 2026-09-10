#!/usr/bin/env node
/**
 * Automated OpenAPI cycle: BE spec regen → FE codegen → typecheck → bddgen.
 *
 * This is the contract-driven loop the rewrite runs on (plan Part 2c): the
 * be2 `greenfield` branch is the single source of truth for types; the FE
 * regenerates its client and the BDD/integration tiers exercise those exact
 * generated models, so a BE contract change breaks the FE at compile time.
 *
 * Steps (skip the BE regen with --skip-be if the spec is already fresh):
 *   1. BE: mvnw verify -Pintegration OpenApiSpecGeneratorTest (Docker +
 *      corretto-21) → writes ../checkitout-backend/docs/openapi/openapi.json
 *   2. FE: npm run openapi:gen (reads that JSON → src/app/api typed client)
 *   3. FE: npm run typecheck (surfaces every contract break the regen caused)
 *   4. FE: npx bddgen (recompiles the Cucumber-oracle steps against the new
 *      generated models)
 *
 * Usage:
 *   node tools/openapi-cycle.mjs              full cycle
 *   node tools/openapi-cycle.mjs --skip-be    codegen + typecheck + bddgen only
 *   node tools/openapi-cycle.mjs --no-bdd     stop after typecheck
 *
 * Requires (step 1 only): Docker running, corretto-21 in ~/.jdks (or
 * BE_JAVA_HOME). The heavy Testcontainers boot (~40s) is why --skip-be
 * exists for fast codegen-only iterations.
 */
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FE_ROOT = resolve(__dirname, '..');
const BE_ROOT = resolve(FE_ROOT, '..', 'checkitout-backend');
const SPEC = join(BE_ROOT, 'docs', 'openapi', 'openapi.json');
// The FE keeps its OWN committed copy of the contract — codegen reads this
// one (see package.json openapi:gen), so a public clone without the be2
// sibling checkout is fully self-contained. The cycle syncs it from be2
// whenever the be2 spec is reachable.
const FE_SPEC = join(FE_ROOT, 'docs', 'openapi', 'openapi.json');

const args = new Set(process.argv.slice(2));
const skipBe = args.has('--skip-be');
const noBdd = args.has('--no-bdd');

function log(msg) {
  console.log(`\n\x1b[36m[openapi-cycle] ${msg}\x1b[0m`);
}
function die(msg) {
  console.error(`\n\x1b[31m[openapi-cycle] ${msg}\x1b[0m`);
  process.exit(1);
}

/** Newest corretto-21.* from ~/.jdks, mirroring scripts/start-be.js. */
function resolveJava21() {
  if (process.env.BE_JAVA_HOME) return process.env.BE_JAVA_HOME;
  try {
    const jdks = join(homedir(), '.jdks');
    const c = readdirSync(jdks)
      .filter((d) => d.startsWith('corretto-21'))
      .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
      .reverse();
    if (c.length) return join(jdks, c[0]);
  } catch {
    /* fall through */
  }
  return process.env.JAVA_HOME;
}

function run(cmd, argv, opts = {}) {
  const r = spawnSync(cmd, argv, { stdio: 'inherit', shell: true, ...opts });
  if (r.status !== 0) die(`step failed (exit ${r.status}): ${cmd} ${argv.join(' ')}`);
}

// ── Step 1: BE spec regen ──────────────────────────────────────────────────
if (skipBe) {
  if (existsSync(SPEC)) {
    log('--skip-be: syncing the FE copy from ' + SPEC);
  } else if (existsSync(FE_SPEC)) {
    log('--skip-be: be2 checkout not found — using the committed FE copy at ' + FE_SPEC);
  } else {
    die('no spec found (neither be2 nor the FE copy); run without --skip-be first');
  }
} else {
  const javaHome = resolveJava21();
  log(`BE spec regen (Docker + Testcontainers, JAVA_HOME=${javaHome})…`);
  const mvnw = join(BE_ROOT, 'mvnw.cmd');
  run(
    `"${mvnw}"`,
    [
      'verify',
      '-Pintegration',
      '-DskipPmd=true',
      '-Dfailsafe.includes=**/OpenApiSpecGeneratorTest.java',
    ],
    { cwd: BE_ROOT, env: { ...process.env, JAVA_HOME: javaHome } },
  );
  if (!existsSync(SPEC)) die('BE regen finished but the spec is missing: ' + SPEC);
  log(`spec written: ${SPEC} (${readFileSync(SPEC, 'utf8').length} bytes)`);
}

// ── Step 1b: sync the committed FE copy (codegen input) ────────────────────
if (existsSync(SPEC)) {
  mkdirSync(dirname(FE_SPEC), { recursive: true });
  copyFileSync(SPEC, FE_SPEC);
  log(`FE spec copy synced: ${FE_SPEC}`);
}

// ── Step 2: FE codegen ─────────────────────────────────────────────────────
log('FE codegen (npm run openapi:gen)…');
run('npm', ['run', 'openapi:gen'], { cwd: FE_ROOT });

// ── Step 3: typecheck — surfaces contract breaks ───────────────────────────
log('typecheck (contract-break detector)…');
run('npm', ['run', 'typecheck'], { cwd: FE_ROOT });

// ── Step 4: bddgen — recompile oracle steps against the new models ─────────
if (noBdd) {
  log('--no-bdd: stopping after typecheck.');
} else {
  log('bddgen (recompile Cucumber-oracle steps)…');
  run('npx', ['bddgen'], { cwd: FE_ROOT });
}

log('cycle complete ✓  (commit the spec diff + regenerated intent per the 3-commit repair flow)');
