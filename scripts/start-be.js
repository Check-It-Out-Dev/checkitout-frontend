/**
 * pm2 launcher for the Spring Boot backend.
 *
 * Why a Node shim instead of `script: 'cmd.exe', args: '/c mvnw.cmd ...'`:
 * pm2's Windows argument assembly re-quotes the args string, and cmd.exe's
 * `/c` quote-stripping then mangles it — the be app crash-looped with
 * "'mvnw.cmd' is not recognized" no matter how the args were quoted.
 * Additionally, bare-name lookup from the cwd is disabled on hardened
 * Windows (NoDefaultCurrentDirectoryInExePath). Spawning from Node with
 * shell:true delegates the command-line assembly to Node itself, which
 * handles .cmd files correctly on every Node >= 20.12.
 *
 * Profile selection: SPRING_PROFILES_ACTIVE (defaults to e2e,dev,ssl).
 * - ssl is mandatory: both FE dev-server proxies target https://localhost:8080.
 * - e2e registers TestAuthController (/api/test/auth/mock-session), which the
 *   visual-parity and integration Playwright tiers use to mint sessions; the
 *   bean is @Profile("e2e & !prod & !test") so it needs the literal profile.
 * - ORDER MATTERS: dev comes AFTER e2e so dev's datasource / liquibase
 *   contexts / session durations override application-e2e.yml's
 *   Testcontainers placeholders (incl. the fail-fast ${FULLSESSION}
 *   session keys, which application-dev.yml re-defines with real values).
 */
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const REPO_ROOT = process.env.REPO_ROOT || path.resolve(__dirname, '..', '..');
const BE = path.resolve(REPO_ROOT, 'checkitout-backend');
const MVNW = path.join(BE, 'mvnw.cmd');

/**
 * The build enforces JDK [21,22) (maven-enforcer RequireJavaVersion) while
 * the machine-default JAVA_HOME points at openjdk-23 — Maven dies before
 * Spring even starts. Mirror the IntelliJ run config (corretto-21): pick the
 * newest corretto-21.* from ~/.jdks unless BE_JAVA_HOME overrides.
 */
function resolveJava21() {
  if (process.env.BE_JAVA_HOME) return process.env.BE_JAVA_HOME;
  const jdks = path.join(os.homedir(), '.jdks');
  try {
    const candidates = fs
      .readdirSync(jdks)
      .filter((d) => d.startsWith('corretto-21'))
      .sort()
      .reverse();
    if (candidates.length > 0) return path.join(jdks, candidates[0]);
  } catch {
    /* fall through to current JAVA_HOME */
  }
  return process.env.JAVA_HOME;
}

const JAVA_HOME = resolveJava21();
console.log(`[start-be] JAVA_HOME=${JAVA_HOME}`);

/**
 * application-e2e.yml also declares fail-fast rate-limit placeholders
 * (RL_{PROFILE}_{REQ|WIN|BLOCK}) with no defaults. These are the permissive
 * "normal suite" values from the BE pom argLine — high enough that local
 * dev/parity flows never trip a limiter.
 */
const rateLimitEnv = {};
for (const profile of [
  'STANDARD',
  'STRICT',
  'RELAXED',
  'HIGH',
  'AUTH',
  'ADMIN_AUTH',
  'COMPANY_AUTH',
  'INFLUENCER_AUTH',
  'UNKNOWN_AUTH',
]) {
  rateLimitEnv[`RL_${profile}_REQ`] = process.env[`RL_${profile}_REQ`] || '10000';
  rateLimitEnv[`RL_${profile}_WIN`] = process.env[`RL_${profile}_WIN`] || '60';
  rateLimitEnv[`RL_${profile}_BLOCK`] = process.env[`RL_${profile}_BLOCK`] || '10';
}

const child = spawn(`"${MVNW}" spring-boot:run`, {
  cwd: BE,
  shell: true,
  stdio: 'inherit',
  env: {
    ...process.env,
    ...rateLimitEnv,
    JAVA_HOME,
    PATH: `${path.join(JAVA_HOME, 'bin')};${process.env.PATH}`,
    SPRING_PROFILES_ACTIVE: process.env.SPRING_PROFILES_ACTIVE || 'e2e,dev,ssl',
    // application-e2e.yml declares fail-fast session placeholders with no
    // defaults (profile files override application.yml's values, so the
    // base 604800/600 never applies while e2e is active). These are the
    // "normal-e2e" values from the BE pom argLine.
    FULLSESSION: process.env.FULLSESSION || '604800',
    PARTIALSESSION: process.env.PARTIALSESSION || '600',
  },
});

child.on('exit', (code, signal) => {
  process.exit(signal ? 1 : (code ?? 1));
});
child.on('error', (err) => {
  console.error('[start-be] spawn failed:', err.message);
  process.exit(1);
});
