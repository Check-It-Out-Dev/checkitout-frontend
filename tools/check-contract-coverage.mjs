#!/usr/bin/env node
/**
 * L0 type-contract coverage gate (audit wf_dfde554b, FE-pyramid P1).
 *
 * L0 of the layered pyramid is the compile-time contract tier:
 * src/testing/contract/*.contract.ts assert (via Expect<Equal<…>>) that each
 * core wrapper service's public method signatures match the generated OpenAPI
 * model types, and they ride `npm run typecheck` (tsconfig.app.json includes
 * src/testing/**). But nothing guarded COVERAGE: a new wrapper service could
 * ship with zero L0 contract, or a contract could be deleted, and no gate
 * would fail — exactly the erosion the other tiers are protected from
 * (check-visual-fixture-coverage does this for L4).
 *
 * This gate asserts every `*.service.ts` under src/app/core is either:
 *   (a) COVERED — imported by at least one *.contract.ts, or
 *   (b) WAIVED  — listed below with a reason, in one of two buckets:
 *       • CLIENT_SIDE   — no generated-API surface (theme, routing, signal
 *         stores). Permanent; there is nothing to contract against.
 *       • TRANSFORMED_BOUNDARY — wraps a generated service internally but
 *         deliberately exposes a transformed local/primitive public surface
 *         (e.g. health → Observable<boolean>, upload → local UploadResult), so
 *         there is no generated model at the boundary to Expect<Equal> against.
 *       • CONTRACT_PENDING — a real API wrapper (imports the generated client)
 *         whose L0 contract is not yet written. A tracked backlog that should
 *         shrink to zero; every entry is a known gap, not an invisible one.
 *
 * Fails (exit 1) if:
 *   - an uncovered service is in NEITHER waiver bucket (new gap), or
 *   - a waiver names a service that no longer exists (stale), or
 *   - a waived service is now actually covered by a contract (promote it out
 *     of the waiver so the backlog stays honest).
 *
 * Wired into check:full + .husky/pre-commit.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const CORE = join(ROOT, 'src', 'app', 'core');
const CONTRACT_DIR = join(ROOT, 'src', 'testing', 'contract');

// Services with no generated-API surface — permanently waived (nothing to
// assert against a generated model). Keyed by core-relative path w/o ext.
const CLIENT_SIDE = {
  'auth/location-redirect.service': 'client-side post-login redirect resolver; no generated-API surface',
  'auth/social-auth.service': 'drives OAuth via window.location + auth-api.service; imports no generated model',
  'auth/social-platform-config.service': 'static social-platform config map; no generated-API surface',
  'auth/sandbox-auth.service': 'the public sandbox sign-in: posts to the dev-lite test-session endpoint, which is not part of the OpenAPI contract by design; no generated model at the boundary',
  'consent/consent.service': 'reads consent signals routed through other wrappers; imports no generated model',
  'demo/sandbox-director.service': 'demo/sandbox harness infra, not a production API wrapper',
  'demo/guide-runner.service': 'demo/sandbox harness infra: runs a tour step recipe against the DOM; no generated-API surface',
  'rate-limit/rate-limit-state.service': 'client-side 429 banner state (signal-backed, auto-dismiss timer); no generated-API surface',
  'shell/shell-status.service': 'derives shell banner state from signals; imports no generated model',
  'theme/theme.service': 'client-side light/dark theme store; no generated-API surface',
};

// Wraps a generated service internally but exposes a transformed local/
// primitive public surface — no generated model at the boundary to contract.
const TRANSFORMED_BOUNDARY = {
  'health/health.service': 'wraps HealthController but exposes Observable<boolean> — no model at the boundary',
  'upload/upload.service': 'wraps FileUploadService but exposes a local UploadResult (publicUrl/filePath/uploadId)',
  'config/public-config.service': 'wraps PublicConfigController but exposes Observable<boolean> paymentsEnabled — no model at the boundary',
};

// Real API wrappers (import the generated client) whose L0 contract is not yet
// written. TRACKED BACKLOG — drain to zero by adding src/testing/contract/*.
// (user + session-state drained in the same slice that added this category.)
const CONTRACT_PENDING = {};

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (entry.endsWith('.service.ts') && !entry.endsWith('.spec.ts')) out.push(p);
  }
  return out;
}

const services = walk(CORE).map((p) =>
  relative(CORE, p).replace(/\\/g, '/').replace(/\.ts$/, ''),
);

const contractText = readdirSync(CONTRACT_DIR)
  .filter((f) => f.endsWith('.contract.ts'))
  .map((f) => readFileSync(join(CONTRACT_DIR, f), 'utf8'))
  .join('\n');

const isCovered = (svc) => contractText.includes(`app/core/${svc}`);

const problems = [];
let covered = 0;
const clientSide = [];
const transformed = [];
const pending = [];

for (const svc of services) {
  if (isCovered(svc)) {
    covered++;
    if (CLIENT_SIDE[svc]) problems.push(`stale waiver: ${svc} is now COVERED — remove it from CLIENT_SIDE`);
    if (TRANSFORMED_BOUNDARY[svc]) problems.push(`stale waiver: ${svc} is now COVERED — remove it from TRANSFORMED_BOUNDARY`);
    if (CONTRACT_PENDING[svc]) problems.push(`stale waiver: ${svc} is now COVERED — remove it from CONTRACT_PENDING (backlog drained ✓)`);
    continue;
  }
  if (CLIENT_SIDE[svc]) {
    clientSide.push(svc);
  } else if (TRANSFORMED_BOUNDARY[svc]) {
    transformed.push(svc);
  } else if (CONTRACT_PENDING[svc]) {
    pending.push(svc);
  } else {
    problems.push(
      `UNCOVERED wrapper with no waiver: ${svc}\n` +
        `      → add src/testing/contract/<domain>.contract.ts importing it,\n` +
        `        or waive it (CLIENT_SIDE if it has no generated-API surface).`,
    );
  }
}

// Stale-waiver check: a waiver naming a service that no longer exists.
const known = new Set(services);
for (const svc of [
  ...Object.keys(CLIENT_SIDE),
  ...Object.keys(TRANSFORMED_BOUNDARY),
  ...Object.keys(CONTRACT_PENDING),
]) {
  if (!known.has(svc)) problems.push(`stale waiver: '${svc}' no longer exists under src/app/core — remove it`);
}

if (problems.length > 0) {
  console.error('check:contract-coverage FAILED — L0 type-contract coverage gap:\n');
  for (const p of problems) console.error(`  • ${p}`);
  console.error(
    `\n  L0 contracts assert wrapper signatures against generated OpenAPI models at\n` +
      `  compile time. Every core wrapper needs one (or an explicit waiver).`,
  );
  process.exit(1);
}

console.log(
  `check:contract-coverage OK — ${covered}/${services.length} wrappers under an L0 contract; ` +
    `${clientSide.length} client-side + ${transformed.length} transformed-boundary waived; ` +
    `${pending.length} contract-pending (backlog: ${pending.join(', ') || 'none'}).`,
);
process.exit(0);
