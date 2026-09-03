#!/usr/bin/env node
/**
 * Ensure the test-container stack is up before a live-BE test tier runs.
 *
 * Automates the "cycle of the test containers" the harness depends on:
 *   1. Docker deps (postgres + redis) — `docker compose up -d` (idempotent).
 *   2. BE on https://localhost:8080 — if the health probe fails, boot it via
 *      pm2 (the start-be.js shim: corretto-21 + e2e,dev,ssl profiles) and
 *      wait for health.
 *   3. ng serve on https://localhost:4201 — Playwright's webServer block
 *      reuses it, so we only warn if it's down (playwright boots it).
 *
 * Idempotent + fast when everything is already up (the common case under the
 * pm2 stack): the health probes short-circuit in ~1s. Used by
 * `npm run test:bdd:stack`. Not a teardown — the dev stack stays up.
 */
import { spawnSync } from 'node:child_process';

const BE_HEALTH = 'https://localhost:8080/api/actuator/health';
const FE_URL = 'https://localhost:4201/';

function log(m) {
  console.log(`\x1b[36m[ensure-stack] ${m}\x1b[0m`);
}

/** curl -k probe; returns the HTTP status or 0 on failure. Node fetch can't
 *  ignore the self-signed cert cleanly across versions, so shell out to curl. */
function probe(url) {
  const r = spawnSync('curl', ['-sk', '-o', '/dev/null', '-w', '%{http_code}', '--max-time', '4', url], {
    encoding: 'utf8',
    shell: true,
  });
  return parseInt((r.stdout || '').trim(), 10) || 0;
}

function sh(cmd) {
  return spawnSync(cmd, { stdio: 'inherit', shell: true }).status ?? 1;
}

// ── 1. Docker deps ─────────────────────────────────────────────────────────
log('bringing up docker deps (postgres + redis)…');
if (sh('docker compose -f ../checkitout-backend/docker-compose-dev-redis.yml up -d postgres redis') !== 0) {
  console.error('\x1b[31m[ensure-stack] docker compose failed — is Docker running?\x1b[0m');
  process.exit(1);
}

// ── 2. BE ──────────────────────────────────────────────────────────────────
if (probe(BE_HEALTH) === 200) {
  log('BE already healthy ✓');
} else {
  log('BE down — starting via pm2 (be)…');
  sh('pm2 start ecosystem.config.cjs --only be');
  let up = false;
  for (let i = 0; i < 24; i++) {
    spawnSync('node', ['-e', 'setTimeout(()=>{},5000)']); // ~5s tick without a foreground sleep
    if (probe(BE_HEALTH) === 200) {
      up = true;
      log(`BE healthy after ~${(i + 1) * 5}s ✓`);
      break;
    }
  }
  if (!up) {
    console.error('\x1b[31m[ensure-stack] BE never became healthy — check pm2 logs be\x1b[0m');
    process.exit(1);
  }
}

// ── 3. FE dev server (Playwright reuses/boots it) ──────────────────────────
log(probe(FE_URL) === 200 ? 'ng serve already up ✓' : 'ng serve down — Playwright webServer will boot it.');

log('stack ready.');
