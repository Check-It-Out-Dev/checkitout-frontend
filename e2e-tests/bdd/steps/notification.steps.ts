import type { ApiResult } from '../../_framework/api/http-client';
import { NotificationExtraApi } from '../../_framework/api/notification-extra.api';
import { NotificationsApi } from '../../_framework/api/notifications.api';
import { TestSession } from '../../_framework/api/test-session';
import { flushPendingEmails, listInbox } from '../../_framework/test-email';
import { BE_URL } from '../../integration/_actor';
import { After, Given, Then, When, expect } from './fixtures';

import type { NotificationDtoOut } from '../../../src/app/api/model/notification-dto-out';
import { NotificationType } from '../../../src/app/api/model/notification-type';
import type { PageNotificationDtoOut } from '../../../src/app/api/model/page-notification-dto-out';

/**
 * Notification-system oracle — Layer 2 (notification-e2e.feature +
 * account-activation-e2e.feature).
 *
 * Thin orchestration over Layer 1: `NotificationsApi` (read side + admin
 * enable-all), `NotificationExtraApi` (mark-read / read-all / archive-DELETE /
 * partnership-prefs disable / set-account-status), and the `test-email`
 * GreenMail helpers pointed straight at the BE (`BE_URL`) so no dev-server
 * proxy hop is involved. Actor seeding, opportunity creation and the apply are
 * REUSED from partnership.steps.ts / consent.steps.ts / registry.steps.ts —
 * this file adds only the notification-domain steps.
 *
 * Assertions anchor on the GENERATED models: NotificationType guards every
 * type-name literal in the features, NotificationDtoOut/PageNotificationDtoOut
 * shape the read paths — a BE contract change breaks compilation here.
 */

interface NotificationWorld {
  // Shared with partnership.steps.ts (company/influencer Givens) + consent.steps.ts (admin).
  companySession?: TestSession;
  influencerSession?: TestSession;
  adminSession?: TestSession;
  companyUserId?: number;
  // Shared with registry.steps.ts (fresh throwaway user for account activation).
  registrySession?: TestSession;
  lastResponse?: { status: number; headers: Record<string, string>; body?: string };
  // Notification-oracle state (this file only).
  lastUnreadCount?: number;
  storedCounts?: Record<string, number>;
  storedNotificationIds?: Record<string, number>;
  lastNotificationsPage?: PageNotificationDtoOut;
  lastNotification?: NotificationDtoOut;
  companyPrefsDisabled?: boolean;
}

function record(world: NotificationWorld, r: ApiResult): void {
  world.lastResponse = { status: r.status, headers: r.headers, body: r.body };
}

function sessionFor(world: NotificationWorld, who: string): TestSession {
  const s = who === 'company' ? world.companySession : world.influencerSession;
  if (!s) throw new Error(`no ${who} session — did the seeding Given run?`);
  return s;
}

function requireAdmin(world: NotificationWorld): TestSession {
  if (!world.adminSession) {
    throw new Error('no admin session — "the admin is signed in with a mock session" missing?');
  }
  return world.adminSession;
}

function requireRegistry(world: NotificationWorld): TestSession {
  if (!world.registrySession) {
    throw new Error('no registry session — "a COMPANY user is authenticated for registry tests"?');
  }
  return world.registrySession;
}

function requireCount(world: NotificationWorld): number {
  if (world.lastUnreadCount === undefined) {
    throw new Error(
      'no unread count captured — did a "checks unread notification count" step run?',
    );
  }
  return world.lastUnreadCount;
}

function requireStored(world: NotificationWorld, ref: string): number {
  const n = world.storedCounts?.[ref];
  if (n === undefined) throw new Error(`no stored unread count "${ref}"`);
  return n;
}

function requireNotifId(world: NotificationWorld, ref: string): number {
  const id = world.storedNotificationIds?.[ref];
  if (id === undefined) throw new Error(`no stored notification id "${ref}"`);
  return id;
}

function requirePage(world: NotificationWorld): PageNotificationDtoOut {
  if (!world.lastNotificationsPage) {
    throw new Error(
      `no notifications page captured (last response: HTTP ${world.lastResponse?.status} ` +
        `${(world.lastResponse?.body ?? '').slice(0, 200)})`,
    );
  }
  return world.lastNotificationsPage;
}

/** Any authenticated transport works for the public /api/test/email endpoints. */
function emailCtx(world: NotificationWorld) {
  const s = world.companySession ?? world.influencerSession ?? world.registrySession;
  if (!s) throw new Error('no session for GreenMail access — seeding Given missing?');
  return s.raw;
}

/** Contract guard: the feature's type literal must be a generated enum member. */
function assertKnownType(expected: string): void {
  expect(
    Object.values(NotificationType),
    `"${expected}" is not a NotificationType member`,
  ).toContain(expected);
}

async function fetchPage(
  world: NotificationWorld,
  session: TestSession,
  page: number,
  size: number,
): Promise<void> {
  const r = await new NotificationsApi(session.api).list(page, size);
  record(world, r);
  // Re-anchor the loose L1 read type on the generated page DTO (legal because
  // PageNotificationDtoOut is assignable to the L1 shape) — id/type/isRead
  // accesses below stay contract-typed.
  world.lastNotificationsPage = r.ok ? (r.json as PageNotificationDtoOut) : undefined;
}

async function checkUnread(world: NotificationWorld, session: TestSession): Promise<void> {
  const r = await new NotificationsApi(session.api).unreadCount();
  record(world, r);
  expect(
    r.ok,
    `GET /notifications/unread/count (HTTP ${r.status}): ${r.body.slice(0, 200)}`,
  ).toBeTruthy();
  world.lastUnreadCount = r.json.count ?? r.json.unreadCount ?? 0;
}

// ── Admin preference staging ─────────────────────────────────────────────────

Given('the admin enables all notification preferences for the company', async ({ world }) => {
  const w: NotificationWorld = world;
  if (w.companyUserId === undefined) throw new Error('companyUserId missing — company Given?');
  const r = await new NotificationsApi(requireAdmin(w).api).enableAllPreferences(w.companyUserId);
  record(w, r);
  expect(r.ok, `enableAllPreferences (HTTP ${r.status}: ${r.body.slice(0, 200)})`).toBeTruthy();
  w.companyPrefsDisabled = false;
});

Given(
  'the admin disables partnership notification preferences for the company',
  async ({ world }) => {
    const w: NotificationWorld = world;
    if (w.companyUserId === undefined) throw new Error('companyUserId missing — company Given?');
    const r = await new NotificationExtraApi(requireAdmin(w)).disablePartnershipPreferences(
      w.companyUserId,
    );
    record(w, r);
    expect(
      r.ok,
      `disablePartnershipPreferences (HTTP ${r.status}: ${r.body.slice(0, 200)})`,
    ).toBeTruthy();
    w.companyPrefsDisabled = true;
  },
);

After(async ({ world }) => {
  // Hygiene: never leave the shared company actor with partnership
  // notifications off — other oracles (and the next lifecycle run) expect the
  // default-on state. Best-effort: the admin session may already be disposed
  // by another file's After (global hooks run for every scenario).
  const w: NotificationWorld = world;
  if (w.companyPrefsDisabled && w.adminSession && w.companyUserId !== undefined) {
    await new NotificationsApi(w.adminSession.api)
      .enableAllPreferences(w.companyUserId)
      .catch(() => undefined);
    w.companyPrefsDisabled = false;
  }
});

// ── Unread count ─────────────────────────────────────────────────────────────

When('the {word} checks unread notification count', async ({ world }, who: string) => {
  const w: NotificationWorld = world;
  await checkUnread(w, sessionFor(w, who));
});

When('the registry user checks unread notification count', async ({ world }) => {
  const w: NotificationWorld = world;
  await checkUnread(w, requireRegistry(w));
});

Then('the unread count is stored as {string}', async ({ world }, name: string) => {
  const w: NotificationWorld = world;
  (w.storedCounts ??= {})[name] = requireCount(w);
});

Then('the unread count should be greater than {string}', async ({ world }, name: string) => {
  const w: NotificationWorld = world;
  expect(requireCount(w), `unread count vs stored "${name}"`).toBeGreaterThan(
    requireStored(w, name),
  );
});

Then('the unread count should equal {string}', async ({ world }, name: string) => {
  const w: NotificationWorld = world;
  expect(requireCount(w), `unread count vs stored "${name}"`).toBe(requireStored(w, name));
});

Then('the unread count should be {int}', async ({ world }, n: number) => {
  const w: NotificationWorld = world;
  expect(requireCount(w)).toBe(n);
});

Then('the unread count should be at least {int}', async ({ world }, n: number) => {
  const w: NotificationWorld = world;
  expect(requireCount(w)).toBeGreaterThanOrEqual(n);
});

// ── Notification feed ────────────────────────────────────────────────────────

When(
  'the {word} fetches notifications page {int} size {int}',
  async ({ world }, who: string, page: number, size: number) => {
    const w: NotificationWorld = world;
    await fetchPage(w, sessionFor(w, who), page, size);
  },
);

When(
  'the registry user fetches notifications page {int} size {int}',
  async ({ world }, page: number, size: number) => {
    const w: NotificationWorld = world;
    await fetchPage(w, requireRegistry(w), page, size);
  },
);

Then(
  'the notifications response should contain at least {int} notification',
  async ({ world }, n: number) => {
    const w: NotificationWorld = world;
    expect((requirePage(w).content ?? []).length).toBeGreaterThanOrEqual(n);
  },
);

Then('the first notification should have type {string}', async ({ world }, expected: string) => {
  const w: NotificationWorld = world;
  assertKnownType(expected);
  const first = requirePage(w).content?.[0];
  expect(first, 'notifications page must not be empty').toBeDefined();
  expect(first?.type).toBe(expected);
});

Then('the first notification id is stored as {string}', async ({ world }, ref: string) => {
  const w: NotificationWorld = world;
  const first = requirePage(w).content?.[0];
  expect(first?.id, 'first notification must carry an id').toBeDefined();
  (w.storedNotificationIds ??= {})[ref] = first!.id!;
});

Then(
  'the notifications response should contain type {string}',
  async ({ world }, expected: string) => {
    const w: NotificationWorld = world;
    assertKnownType(expected);
    const types = (requirePage(w).content ?? []).map((n) => n.type);
    expect(types, `types on page: ${JSON.stringify(types)}`).toContain(expected);
  },
);

Then(
  'the notifications response should not contain notification {string}',
  async ({ world }, ref: string) => {
    const w: NotificationWorld = world;
    const ids = (requirePage(w).content ?? []).map((n) => n.id);
    expect(ids, `page ids: ${JSON.stringify(ids)}`).not.toContain(requireNotifId(w, ref));
  },
);

// ── Read / read-all / archive ────────────────────────────────────────────────

When(
  'the {word} marks notification {string} as read',
  async ({ world }, who: string, ref: string) => {
    const w: NotificationWorld = world;
    const r = await new NotificationExtraApi(sessionFor(w, who)).markAsRead(requireNotifId(w, ref));
    record(w, r);
    w.lastNotification = r.ok ? r.json : undefined;
  },
);

Then('the notification response should have isRead true', async ({ world }) => {
  const w: NotificationWorld = world;
  expect(w.lastNotification, 'no notification captured from the mark-as-read call').toBeDefined();
  expect(w.lastNotification?.isRead).toBe(true);
});

When('the {word} marks all notifications as read', async ({ world }, who: string) => {
  const w: NotificationWorld = world;
  record(w, await new NotificationExtraApi(sessionFor(w, who)).markAllAsRead());
});

When('the {word} archives notification {string}', async ({ world }, who: string, ref: string) => {
  const w: NotificationWorld = world;
  record(w, await new NotificationExtraApi(sessionFor(w, who)).archive(requireNotifId(w, ref)));
});

// ── GreenMail email delivery ─────────────────────────────────────────────────
// "the GreenMail inbox is cleared" is REUSED from magic-link.steps.ts (its
// emailSession falls back to world.influencerSession, which the partnership
// seeding Given sets). The steps below hit the BE's /api/test/email surface
// directly (BE_URL) — no dev-server proxy dependency.

When('the email queue is processed', async ({ world }) => {
  const w: NotificationWorld = world;
  await flushPendingEmails(emailCtx(w), BE_URL);
});

Then('GreenMail should have received at least {int} email', async ({ world }, n: number) => {
  const w: NotificationWorld = world;
  // Small poll: the flush endpoint is synchronous, but SMTP hand-off to
  // GreenMail can trail by a beat on the live BE.
  const deadline = Date.now() + 5_000;
  let inbox = await listInbox(emailCtx(w), { origin: BE_URL });
  while (inbox.length < n && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    inbox = await listInbox(emailCtx(w), { origin: BE_URL });
  }
  expect(inbox.length, 'GreenMail inbox size').toBeGreaterThanOrEqual(n);
});

Then('GreenMail should have received {int} emails', async ({ world }, n: number) => {
  const w: NotificationWorld = world;
  const inbox = await listInbox(emailCtx(w), { origin: BE_URL });
  expect(
    inbox.map((e) => e.subject),
    'GreenMail inbox subjects',
  ).toHaveLength(n);
});

Then(
  'the last GreenMail email should contain subject {string}',
  async ({ world }, fragment: string) => {
    const w: NotificationWorld = world;
    const inbox = await listInbox(emailCtx(w), { origin: BE_URL });
    expect(inbox.length, 'GreenMail inbox must not be empty').toBeGreaterThan(0);
    // listInbox returns newest first — [0] is the last email received.
    expect(inbox[0].subject).toContain(fragment);
  },
);

// ── Account-activation staging (registry oracle extensions) ─────────────────

Given('the registry user account status is set to {string}', async ({ world }, status: string) => {
  const w: NotificationWorld = world;
  const s = requireRegistry(w);
  await new NotificationExtraApi(s).setAccountStatus(s.actor.email, status);
});

When(
  'the registry user refreshes their session after activation',
  async ({ playwright, world }) => {
    const w: NotificationWorld = world;
    const s = requireRegistry(w);
    const email = s.actor.email;
    // Activation bumped tokenVersion; a fresh mock-session (same email) is the
    // FE-side equivalent of the BE's session-token refresh — same pattern as the
    // influencer-verification oracle's re-login step.
    await s.dispose();
    w.registrySession = await TestSession.open(playwright, { id: email, email, role: 'COMPANY' });
  },
);
