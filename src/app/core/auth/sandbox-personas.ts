export type SandboxPersonaKey = 'company' | 'influencer';

export interface SandboxPersona {
  readonly key: SandboxPersonaKey;
  /** The seeded dev-lite account; the backend's sandbox guard admits exactly these pairs. */
  readonly email: string;
  readonly role: 'COMPANY' | 'INFLUENCER';
  /** Where the persona lands after sign-in: the company on its campaigns, the influencer on the catalogue. */
  readonly home: string;
}

/**
 * The two shared accounts of the public sandbox. Both exist in the dev-lite seed with data (campaigns,
 * applications, a social connection), so the picker never creates anything; the backend activates the
 * account at sign-in (docs/ci/SANDBOX.md §4). Names and blurbs live in i18n under `auth.sandbox.persona`.
 */
export const SANDBOX_PERSONAS: readonly SandboxPersona[] = [
  { key: 'company', email: 'company@checkitout.app', role: 'COMPANY', home: '/collaborations/my-campaigns' },
  { key: 'influencer', email: 'test.influencer@test.com', role: 'INFLUENCER', home: '/collaborations/list' },
];
