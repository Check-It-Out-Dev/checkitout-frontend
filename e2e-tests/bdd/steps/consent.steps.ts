import { ConsentApi } from '../../_framework/api/consent.api';
import { TestSession } from '../../_framework/api/test-session';
import { ACTORS } from '../../_framework/actor';
import { After, Given, Then, When, expect } from './fixtures';

/**
 * Consent-module oracle — Layer 2 (consent-module.feature).
 *
 * The anonymous flow (banner → prepare → register) runs on ONE anonymous
 * TestSession context so the HMAC consent cookies accumulate in its jar and
 * ride into registration, exactly like a browser. Blocked-user scenarios
 * stage BLOCKED_DUE_TO_NOT_ACCEPTING_TERMS via the /test hooks and hold their
 * own session; admin queries run on a separate admin mock-session.
 */

type Table = { raw(): string[][] };

interface ConsentWorld {
  consentAnon?: TestSession;
  adminSession?: TestSession;
  blockedSession?: TestSession;
  blockedEmail?: string;
  registeredEmail?: string;
  registeredUserId?: number;
  anonymousRecordId?: number;
  consentRecords?: Array<Record<string, unknown>>;
  orphanedRecords?: Array<Record<string, unknown>>;
  lastResponse?: { status: number; headers: Record<string, string>; body?: string };
}

function record(
  world: ConsentWorld,
  r: { status: number; headers: Record<string, string>; body: string },
): void {
  world.lastResponse = { status: r.status, headers: r.headers, body: r.body };
}

async function anon(
  playwright: Parameters<typeof TestSession.openAnonymous>[0],
  world: ConsentWorld,
): Promise<ConsentApi> {
  world.consentAnon ??= await TestSession.openAnonymous(playwright);
  return new ConsentApi(world.consentAnon.api);
}

After(async ({ world }) => {
  await world.consentAnon?.dispose().catch(() => undefined);
  await world.blockedSession?.dispose().catch(() => undefined);
  // adminSession is shared with the influencer oracle's After — already guarded there.
});

// ── Public legal documents ────────────────────────────────────────────────────

When('I request the current legal documents', async ({ playwright, world }) => {
  const r = await (await anon(playwright, world)).currentLegalDocuments();
  record(world, r);
  world.consentRecords = r.ok ? (r.json as Array<Record<string, unknown>>) : [];
});

Then('the response should contain legal documents with types', async ({ world }, table: Table) => {
  const types = (world.consentRecords ?? []).map((d) => d['type']);
  for (const [expected] of table.raw()) {
    expect(types, `legal docs must include ${expected} (got ${JSON.stringify(types)})`).toContain(
      expected,
    );
  }
});

// ── Anonymous banner + preparation (cookie-accumulating context) ─────────────

When(
  'I accept the cookie banner for document {string}',
  async ({ playwright, world }, doc: string) => {
    const r = await (await anon(playwright, world)).acceptCookieBanner(doc);
    record(world, r);
  },
);

Then('the response should contain a consent record ID', async ({ world }) => {
  const body = JSON.parse(world.lastResponse?.body ?? '{}') as {
    id?: number;
    recordId?: number;
    consentRecordId?: number;
  };
  expect(
    body.consentRecordId ?? body.id ?? body.recordId,
    `record id in ${(world.lastResponse?.body ?? '').slice(0, 160)}`,
  ).toBeDefined();
});

Then('I store the anonymous consent record ID', async ({ world }) => {
  const body = JSON.parse(world.lastResponse?.body ?? '{}') as {
    id?: number;
    recordId?: number;
    consentRecordId?: number;
  };
  world.anonymousRecordId = body.consentRecordId ?? body.id ?? body.recordId;
  expect(world.anonymousRecordId).toBeDefined();
});

Then('the response should set cookie {string}', async ({ world }, name: string) => {
  // Playwright folds repeated Set-Cookie headers into one \n-joined value.
  const setCookie = world.lastResponse?.headers['set-cookie'] ?? '';
  expect(setCookie, `Set-Cookie must carry ${name}`).toContain(`${name}=`);
});

When(
  'I prepare consent for document type {string} version {int}',
  async ({ playwright, world }, documentType: string, version: number) => {
    const r = await (await anon(playwright, world)).prepareConsent(documentType, version);
    record(world, r);
  },
);

// ── Registration ──────────────────────────────────────────────────────────────

When(
  'I attempt to register without consent cookies as a new COMPANY user',
  async ({ playwright, world }) => {
    // FRESH context — deliberately no consent cookies in its jar.
    const bare = await TestSession.openAnonymous(playwright);
    try {
      const r = await new ConsentApi(bare.api).register(
        `consent-nocons-${Date.now()}@e2e.test`,
        'TestPassword123!',
        'COMPANY',
      );
      record(world, r);
    } finally {
      await bare.dispose();
    }
  },
);

Given('a user already exists with email {string}', async ({ playwright }, email: string) => {
  const bare = await TestSession.openAnonymous(playwright);
  try {
    const r = await bare.api.post('/test/auth/ensure-user', { email, role: 'COMPANY' });
    expect(r.ok, `ensure-user (HTTP ${r.status})`).toBeTruthy();
  } finally {
    await bare.dispose();
  }
});

When(
  'I attempt to register without consent cookies using email {string}',
  async ({ playwright, world }, email: string) => {
    const bare = await TestSession.openAnonymous(playwright);
    try {
      const r = await new ConsentApi(bare.api).register(email, 'TestPassword123!', 'COMPANY');
      record(world, r);
    } finally {
      await bare.dispose();
    }
  },
);

When(
  'I register a new COMPANY user with the accumulated consent cookies',
  async ({ playwright, world }) => {
    world.registeredEmail = `consent-happy-${Date.now()}@e2e.test`;
    const r = await (
      await anon(playwright, world)
    ).register(world.registeredEmail, 'TestPassword123!', 'COMPANY');
    record(world, r);
    const body = JSON.parse(r.body || '{}') as { userId?: number; id?: number };
    world.registeredUserId = body.userId ?? body.id;
  },
);

Then('the registration should be successful', async ({ world }) => {
  expect(world.lastResponse?.status).toBe(200);
  expect(
    world.registeredUserId,
    `userId in ${(world.lastResponse?.body ?? '').slice(0, 200)}`,
  ).toBeDefined();
});

// ── Admin verification ───────────────────────────────────────────────────────

Given('the admin is signed in with a mock session', async ({ playwright, world }) => {
  world.adminSession ??= await TestSession.open(playwright, ACTORS['admin1']);
});

When('the admin queries consent records for the newly registered user', async ({ world }) => {
  const r = await new ConsentApi(world.adminSession!.api).consentRecordsFor(
    world.registeredUserId!,
  );
  record(world, r);
  world.consentRecords = r.ok ? (r.json as Array<Record<string, unknown>>) : [];
});

When('the admin checks orphaned anonymous consent records', async ({ world }) => {
  const r = await new ConsentApi(world.adminSession!.api).orphanedAnonymousRecords(1);
  record(world, r);
  world.orphanedRecords = r.ok ? (r.json as Array<Record<string, unknown>>) : [];
});

Then('the orphaned records should contain the stored anonymous record ID', async ({ world }) => {
  const ids = (world.orphanedRecords ?? []).map((rec) => rec['id']);
  expect(ids, `orphans ${JSON.stringify(ids).slice(0, 200)}`).toContain(world.anonymousRecordId);
});

Then('the consent records should contain {int} entries', async ({ world }, n: number) => {
  expect(world.consentRecords ?? []).toHaveLength(n);
});

Then('the consent records should contain at least {int} entry', async ({ world }, n: number) => {
  expect((world.consentRecords ?? []).length).toBeGreaterThanOrEqual(n);
});

Then(
  'one record should have source {string} with the user linked',
  async ({ world }, source: string) => {
    const hit = (world.consentRecords ?? []).find(
      (rec) => rec['source'] === source && rec['userId'] != null,
    );
    expect(
      hit,
      `no ${source} record with user linked in ${JSON.stringify(world.consentRecords).slice(0, 300)}`,
    ).toBeDefined();
  },
);

Then('one record should have document type {string}', async ({ world }, type: string) => {
  const hit = (world.consentRecords ?? []).find((rec) => rec['documentType'] === type);
  expect(hit, `no record of type ${type}`).toBeDefined();
});

Then('the linked record ID should match the stored anonymous record ID', async ({ world }) => {
  const hit = (world.consentRecords ?? []).find(
    (rec) => rec['source'] === 'COOKIE_BANNER' && rec['userId'] != null,
  );
  expect(hit?.['id']).toBe(world.anonymousRecordId);
});

// ── Blocked-user enforcement + reconsent ─────────────────────────────────────

Given('a consent-blocked user with a valid session', async ({ playwright, world }) => {
  world.blockedEmail = `consent-blocked-${Date.now()}@e2e.test`;
  const bare = await TestSession.openAnonymous(playwright);
  try {
    const ensure = await bare.api.post('/test/auth/ensure-user', {
      email: world.blockedEmail,
      role: 'COMPANY',
    });
    expect(ensure.ok, `ensure-user (HTTP ${ensure.status})`).toBeTruthy();
    const block = await bare.api.post('/test/auth/set-account-status', {
      email: world.blockedEmail,
      status: 'BLOCKED_DUE_TO_NOT_ACCEPTING_TERMS',
    });
    expect(block.ok, `set-account-status (HTTP ${block.status})`).toBeTruthy();
  } finally {
    await bare.dispose();
  }
  world.blockedSession = await TestSession.open(playwright, {
    id: world.blockedEmail,
    email: world.blockedEmail,
    role: 'COMPANY',
  });
});

When(
  'the blocked user sends POST to {string} with an empty body',
  async ({ world }, path: string) => {
    const r = await world.blockedSession!.api.post(path, {});
    record(world, r);
  },
);

When('the blocked user requests {string}', async ({ world }, path: string) => {
  const r = await world.blockedSession!.api.get(path);
  record(world, r);
});

Then('the response should have header {string}', async ({ world }, header: string) => {
  const headers = world.lastResponse?.headers ?? {};
  expect(
    Object.keys(headers).map((h) => h.toLowerCase()),
    `headers: ${Object.keys(headers).join(', ')}`,
  ).toContain(header.toLowerCase());
});

When('the blocked user records consent for all required documents', async ({ world }) => {
  const r = await new ConsentApi(world.blockedSession!.api).recordBatchConsent();
  record(world, r);
  expect(r.ok, `record-batch (HTTP ${r.status}: ${r.body.slice(0, 200)})`).toBeTruthy();
});

When('the blocked user refreshes their mock session', async ({ playwright, world }) => {
  await world.blockedSession?.dispose();
  world.blockedSession = await TestSession.open(playwright, {
    id: world.blockedEmail!,
    email: world.blockedEmail!,
    role: 'COMPANY',
  });
});

Then('the blocked user can access {string}', async ({ world }, path: string) => {
  const r = await world.blockedSession!.api.get(path);
  expect(r.status, `GET ${path} (body: ${r.body.slice(0, 160)})`).toBe(200);
});

// ── Consent status ───────────────────────────────────────────────────────────

Given('a registered user with all consents accepted', async ({ playwright, world }) => {
  // Full consented registration on a fresh accumulating context.
  const api = await anon(playwright, world);
  const banner = await api.acceptCookieBanner('cookie_policy_v2_pl.pdf');
  expect(banner.ok, `banner (HTTP ${banner.status})`).toBeTruthy();
  await api.prepareConsent('TERMS_OF_SERVICE', 2);
  await api.prepareConsent('PRIVACY_POLICY', 2);
  world.registeredEmail = `consent-status-${Date.now()}@e2e.test`;
  const reg = await api.register(world.registeredEmail, 'TestPassword123!', 'COMPANY');
  expect(reg.ok, `register (HTTP ${reg.status}: ${reg.body.slice(0, 200)})`).toBeTruthy();
  const body = JSON.parse(reg.body || '{}') as { userId?: number; id?: number };
  world.registeredUserId = body.userId ?? body.id;
  // Log the fresh user in (mock-session on the existing user keeps its state).
  world.blockedSession = await TestSession.open(playwright, {
    id: world.registeredEmail,
    email: world.registeredEmail,
    role: 'COMPANY',
  });
});

When('the user checks their consent status', async ({ world }) => {
  const r = await new ConsentApi(world.blockedSession!.api).consentStatus();
  record(world, r);
});

Then('the consent status should show newestConsentsAccepted is true', async ({ world }) => {
  const body = JSON.parse(world.lastResponse?.body ?? '{}') as {
    newestConsentsAccepted?: boolean;
  };
  expect(
    body.newestConsentsAccepted,
    `status body: ${(world.lastResponse?.body ?? '').slice(0, 200)}`,
  ).toBe(true);
});
