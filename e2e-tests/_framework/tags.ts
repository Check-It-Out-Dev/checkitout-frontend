/**
 * Tag taxonomy — kept in sync with the BE Cucumber tag set.
 *
 * Tags appear in `test.describe()` titles like
 *
 *     test.describe(`${tags.PARTNERSHIP_FLOW} ${tags.INFLUENCER} · Apply to a campaign`, …)
 *
 * which makes Playwright's `--grep '@partnership-flow'` work the same way
 * `mvn -Dcucumber.filter.tags=@partnership-flow` works on the BE.
 *
 * Source of truth: `checkitout-backend/src/test/resources/features/*.feature`.
 * When a new BE tag appears, add it here.
 */
export const tags = Object.freeze({
  // Feature domains
  AUTHENTICATION: '@authentication',
  LOGIN: '@login',
  PARTNERSHIP_FLOW: '@partnership-flow',
  ADMIN_OPS: '@admin-ops',
  CONSENT: '@consent',
  NOTIFICATION: '@notification',
  PAYMENTS: '@payments',
  PROFILE: '@profile',

  // Infrastructure modes
  MULTI_USER: '@multi-user',
  MULTI_ACTOR: '@multi-actor',

  // User types
  COMPANY: '@company',
  INFLUENCER: '@influencer',
  ADMIN: '@admin',

  // Flow variants
  HAPPY_PATH: '@happy-path',
  SMOKE: '@smoke',
  FULL_AUTH: '@full-auth',
  TWO_FA: '@2fa',
  STEP_UP_AUTH: '@step-up-auth',
} as const);

export type TagValue = (typeof tags)[keyof typeof tags];
