import { expect } from '@playwright/test';
import { createBdd, test as base } from 'playwright-bdd';
import type { ActorProfile } from '../../_framework/actor';
import type { TestSession } from '../../_framework/api/test-session';
import { BE_URL } from '../../integration/_actor';

/**
 * playwright-bdd World + bindings for the FE Cucumber oracle tier
 * (`e2e-tests/bdd/`). Each ported `.feature` mirrors a BE Cucumber source
 * (`checkitout-backend/src/test/resources/features/**`) and drives the greenfield
 * FE against the live BE — the executable rewrite oracle called for by the
 * plan (Part 3b) and memory `feedback_cucumber_bdd_oracle_for_rewrite`.
 *
 * The step layer reuses the existing `_framework` helpers (mock-session
 * `authenticate`, `ACTORS`, tags) so BDD and the trace-equivalence
 * integration tier share one seeding contract. Steps import the GENERATED
 * client models (`src/app/api/model/**`) so a BE contract change breaks the
 * oracle at compile time — the whole point of the greenfield-branch codegen.
 */
interface World {
  /** The actor seeded by the current scenario's Given step. */
  current?: ActorProfile;
  /** Status + headers + body of the last API call a When step made, for Then assertions. */
  lastResponse?: { status: number; headers: Record<string, string>; body?: string };
  /** Firebase UID of a mock-session admin, for KMS-backed TOTP scenarios. */
  adminUid?: string;
  /**
   * Multi-actor oracle sessions (Layer 1). Each TestSession owns one actor's
   * isolated APIRequestContext + cookie jar, so a single scenario can drive both
   * sides of a collaboration through the typed service layer.
   */
  companySession?: TestSession;
  influencerSession?: TestSession;
  /** The company actor's numeric user id (PartnershipOpportunityDtoIn.company). */
  companyUserId?: number;
  /** name -> created opportunity response. */
  opportunities?: Record<string, { id: number; [k: string]: unknown }>;
  /** name -> applied-opportunity response. */
  applications?: Record<string, { id: number; [k: string]: unknown }>;
  /** name -> { id, dto } of a submitted content record (dto reused for the Instagram PUT). */
  contents?: Record<string, { id: number; dto: Record<string, unknown> }>;
  /** Magic-link oracle: session bound to the real company account + captured email state. */
  magicSession?: TestSession;
  magicEmail?: string;
  lastEmailBody?: string;
  oobCode?: string;
  /** Influencer-verification oracle: OAuth-simulated session + admin staging session. */
  adminSession?: TestSession;
  influencerEmail?: string;
  influencerUserId?: number;
  /** Registry oracle: fresh per-scenario user + anonymous staging transport. */
  registrySession?: TestSession;
  registryUid?: string;
  registryAnon?: TestSession;
  lastLookup?: Record<string, unknown>;
  lastConfirm?: Record<string, unknown>;
  lastCompanyData?: Record<string, unknown> | null;
  /** Consent oracle: cookie-accumulating anonymous context + blocked-user session. */
  consentAnon?: TestSession;
  blockedSession?: TestSession;
  blockedEmail?: string;
  registeredEmail?: string;
  registeredUserId?: number;
  anonymousRecordId?: number;
  consentRecords?: Array<Record<string, unknown>>;
  orphanedRecords?: Array<Record<string, unknown>>;
}

export const test = base.extend<{ world: World }>({
  world: async ({}, use) => {
    await use({});
  },
});

export const { Given, When, Then, Before, After } = createBdd(test);

// BE-reachability guard — mirrors the integration tier's self-skip so a
// machine without the live BE stack reports skipped, not failed.
Before(async ({ page }) => {
  const res = await page.request
    .get(`${BE_URL}/api/public-config`, { ignoreHTTPSErrors: true, timeout: 3_000 })
    .catch(() => null);
  test.skip(
    !res || !res.ok(),
    `BE not reachable at ${BE_URL} — start the stack (npm run stack:up)`,
  );
});

export { expect };
