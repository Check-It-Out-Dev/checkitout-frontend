import { RegistryApi } from '../../_framework/api/registry.api';
import { TestSession } from '../../_framework/api/test-session';
import { After, Given, Then, When, expect } from './fixtures';

/**
 * Registry company-flow oracle — Layer 2 (registry-company-flow.feature).
 *
 * All 18 scenarios drive the production lookup→confirm→get/refresh endpoints
 * against the LIVE BE with the e2e registry stubs scripting KRS/CEIDG/GUS
 * per-NIP. Each scenario mints a FRESH throwaway user (mirrors the BE glue's
 * registry-<role>-<timestamp>@e2e.test) so NIP uniqueness never leaks across
 * scenarios or runs on the persistent dev DB. The stub configuration runs on
 * an unauthenticated transport (the /test hooks are public in the e2e
 * profile) before the user session exists — same ordering as the BE feature.
 */

interface RegistryWorld {
  registrySession?: TestSession;
  registryUid?: string;
  /** Unauthenticated transport for stub configuration + the 401 scenario. */
  registryAnon?: TestSession;
  lastLookup?: Record<string, unknown>;
  lastConfirm?: Record<string, unknown>;
  lastCompanyData?: Record<string, unknown> | null;
  lastResponse?: { status: number; headers: Record<string, string>; body?: string };
}

function record(
  world: RegistryWorld,
  r: { status: number; headers: Record<string, string>; body: string },
): void {
  world.lastResponse = { status: r.status, headers: r.headers, body: r.body };
}

function sessionApi(world: RegistryWorld): RegistryApi {
  if (!world.registrySession) throw new Error('registry user not authenticated — Given missing?');
  return new RegistryApi(world.registrySession.api);
}

/** Stub/staging transport — anonymous context opened lazily per scenario. */
async function anonApi(
  playwright: Parameters<typeof TestSession.openAnonymous>[0],
  world: RegistryWorld,
): Promise<RegistryApi> {
  world.registryAnon ??= await TestSession.openAnonymous(playwright);
  return new RegistryApi(world.registryAnon.api);
}

After(async ({ world }) => {
  await world.registrySession?.dispose().catch(() => undefined);
  await world.registryAnon?.dispose().catch(() => undefined);
});

// ── Stub configuration (anonymous transport) ─────────────────────────────────

Given('registry stubs are reset', async ({ playwright, world }) => {
  await (await anonApi(playwright, world)).resetStubs();
});

Given(
  'a KRS company is configured for NIP {string}',
  async ({ playwright, world }, nip: string) => {
    await (await anonApi(playwright, world)).configureKrsCompany(nip);
  },
);

Given(
  'a JDG company is configured for NIP {string}',
  async ({ playwright, world }, nip: string) => {
    await (await anonApi(playwright, world)).configureJdgCompany(nip);
  },
);

Given('GUS returns not-found for NIP {string}', async ({ playwright, world }, nip: string) => {
  await (await anonApi(playwright, world)).configureGusNotFound(nip);
});

Given(
  'an inactive company is configured for NIP {string}',
  async ({ playwright, world }, nip: string) => {
    await (await anonApi(playwright, world)).configureInactiveCompany(nip);
  },
);

Given(
  'another user already has company data with NIP {string}',
  async ({ playwright, world }, nip: string) => {
    const api = await anonApi(playwright, world);
    const uid = await api.ensureUser(`existing-nip-${Date.now()}@e2e.test`, 'COMPANY');
    await api.createCompanyData(uid, nip);
  },
);

// ── Fresh per-scenario user sessions ─────────────────────────────────────────

Given(
  /^an? (\w+) user is authenticated for registry tests$/,
  async ({ playwright, world }, role: string) => {
    const email = `registry-${role.toLowerCase()}-${Date.now()}@e2e.test`;
    world.registrySession = await TestSession.open(playwright, {
      id: email,
      email,
      role: role as 'COMPANY' | 'INFLUENCER',
    });
    // firebaseUid of the fresh user — needed for the emailVerified staging hook.
    const me = await world.registrySession.api.get<{ firebaseUserId?: string }>('/users/me');
    expect(me.ok, `post-auth /users/me (HTTP ${me.status})`).toBeTruthy();
    world.registryUid = me.json.firebaseUserId;
  },
);

Given('the registry user has emailVerified set to {word}', async ({ world }, value: string) => {
  await sessionApi(world).setEmailVerified(world.registryUid!, value === 'true');
});

// ── Production flow ──────────────────────────────────────────────────────────

When('the user performs a registry lookup for NIP {string}', async ({ world }, nip: string) => {
  const r = await sessionApi(world).lookup(nip);
  record(world, r);
  if (r.ok) world.lastLookup = r.json;
});

When(
  'an unauthenticated user performs a registry lookup for NIP {string}',
  async ({ playwright, world }, nip: string) => {
    const r = await (await anonApi(playwright, world)).lookup(nip);
    record(world, r);
  },
);

When('the user confirms company data for NIP {string}', async ({ world }, nip: string) => {
  const r = await sessionApi(world).confirm(nip);
  record(world, r);
  if (r.ok) world.lastConfirm = r.json;
});

When('the user requests their company data', async ({ world }) => {
  const r = await sessionApi(world).companyData();
  record(world, r);
  world.lastCompanyData = r.ok ? r.json : null;
});

When('the user refreshes their company data', async ({ world }) => {
  const r = await sessionApi(world).refresh();
  record(world, r);
  if (r.ok) world.lastLookup = r.json;
});

// ── Assertions ───────────────────────────────────────────────────────────────

Then('the lookup response should contain NIP {string}', async ({ world }, nip: string) => {
  expect(String(world.lastLookup?.['nip'] ?? '')).toBe(nip);
});

Then('the lookup response companyType should be {string}', async ({ world }, expected: string) => {
  expect(world.lastLookup?.['companyType']).toBe(expected);
});

Then('the lookup response should contain company name', async ({ world }) => {
  expect(String(world.lastLookup?.['companyName'] ?? '').length).toBeGreaterThan(0);
});

Then('the lookup response should contain address fields', async ({ world }) => {
  const l = world.lastLookup ?? {};
  expect(
    String(l['street'] ?? l['city'] ?? '').length,
    `address fields in ${JSON.stringify(l).slice(0, 200)}`,
  ).toBeGreaterThan(0);
});

Then('the lookup response should contain owner name', async ({ world }) => {
  const l = world.lastLookup ?? {};
  const owner = l['ownerFirstName'] ?? l['ownerName'] ?? l['ownerLastName'];
  expect(
    String(owner ?? '').length,
    `owner name in ${JSON.stringify(l).slice(0, 200)}`,
  ).toBeGreaterThan(0);
});

Then('the confirm response activated should be {word}', async ({ world }, expected: string) => {
  expect(world.lastConfirm?.['activated']).toBe(expected === 'true');
});

Then(
  'the confirm response accountStatus should be {string}',
  async ({ world }, expected: string) => {
    expect(world.lastConfirm?.['accountStatus']).toBe(expected);
  },
);

Then('the company data response should contain NIP {string}', async ({ world }, nip: string) => {
  expect(String(world.lastCompanyData?.['nip'] ?? '')).toBe(nip);
});

Then('the company data response should contain company name', async ({ world }) => {
  expect(String(world.lastCompanyData?.['companyName'] ?? '').length).toBeGreaterThan(0);
});

Then('the company data response should contain owner name', async ({ world }) => {
  const d = world.lastCompanyData ?? {};
  const owner = d['ownerFirstName'] ?? d['ownerName'] ?? d['ownerLastName'];
  expect(String(owner ?? '').length, `owner in ${JSON.stringify(d).slice(0, 200)}`).toBeGreaterThan(
    0,
  );
});

Then('the company data response body should be empty', async ({ world }) => {
  const d = world.lastCompanyData;
  const empty = d == null || Object.keys(d).length === 0;
  expect(empty, `expected empty company data, got ${JSON.stringify(d).slice(0, 200)}`).toBe(true);
});
