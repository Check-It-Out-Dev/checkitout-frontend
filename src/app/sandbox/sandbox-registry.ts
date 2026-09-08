import { Provider, Type } from '@angular/core';
import { ACCOUNT_DELETION_FIXTURES } from './fixtures/account-deletion.fixture';
import { REJECT_APPLICANT_FIXTURES } from './fixtures/reject-applicant.fixture';
import { ACTION_ROUTER_FIXTURES } from './fixtures/action-router.fixture';
import { ADDRESSES_FIXTURES } from './fixtures/addresses.fixture';
import { ADMIN_TICKET_DETAIL_FIXTURES } from './fixtures/admin-ticket-detail.fixture';
import { ADMIN_TICKETS_LIST_FIXTURES } from './fixtures/admin-tickets-list.fixture';
import { ADMIN_USER_LIST_FIXTURES } from './fixtures/admin-user-list.fixture';
import { ADMIN_CASCADE_DELETE_FIXTURES } from './fixtures/admin-cascade-delete.fixture';
import { ADMIN_DICTIONARY_FIXTURES } from './fixtures/admin-dictionary.fixture';
import { AUTH_ERROR_FIXTURES } from './fixtures/auth-error.fixture';
import { APPLIED_OPPORTUNITIES_LIST_FIXTURES } from './fixtures/applied-opportunities-list.fixture';
import { APPLIED_OPPORTUNITY_DETAIL_FIXTURES } from './fixtures/applied-opportunity-detail.fixture';
import { COMPANY_SETUP_FIXTURES } from './fixtures/company-setup.fixture';
import { COLLABORATION_DASHBOARD_FIXTURES } from './fixtures/collaboration-dashboard.fixture';
import { CONFIRMATION_REQUIRED_FIXTURES } from './fixtures/confirmation-required.fixture';
import { COOKIE_BANNER_FIXTURES } from './fixtures/cookie-banner.fixture';
import { SOCIAL_CONNECTIONS_FIXTURES } from './fixtures/social-connections.fixture';
import { CREATE_TICKET_FIXTURES } from './fixtures/create-ticket.fixture';
import { DOWNGRADE_CONFIRM_FIXTURES } from './fixtures/downgrade-confirm.fixture';
import { EMAIL_CHANGE_FIXTURES } from './fixtures/email-change.fixture';
import { ERROR_PAGE_FIXTURES } from './fixtures/error-page.fixture';
import { FORGOT_PASSWORD_FIXTURES } from './fixtures/forgot-password.fixture';
import { GRANTS_FIXTURES } from './fixtures/grants.fixture';
import { LANDING_FIXTURES } from './fixtures/landing.fixture';
import { SURVEY_HUB_FIXTURES } from './fixtures/survey-hub.fixture';
import { LEGAL_CLICKWRAP_FIXTURES } from './fixtures/legal-clickwrap.fixture';
import { AUTH_SUCCESS_FIXTURES } from './fixtures/auth-success.fixture';
import { CAMPAIGN_APPLICANTS_FIXTURES } from './fixtures/campaign-applicants.fixture';
import { CONTENT_REVIEW_FIXTURES } from './fixtures/content-review.fixture';
import { CONTENT_SUBMISSION_FIXTURES } from './fixtures/content-submission.fixture';
import { MY_CAMPAIGNS_FIXTURES } from './fixtures/my-campaigns.fixture';
import { NOTIFICATION_PANEL_FIXTURES } from './fixtures/notification-panel.fixture';
import { RECONSENT_FIXTURES } from './fixtures/reconsent.fixture';
import { SECURITY_SETTINGS_FIXTURES } from './fixtures/security-settings.fixture';
import { OPPORTUNITIES_LIST_FIXTURES } from './fixtures/opportunities-list.fixture';
import { OPPORTUNITY_DETAIL_FIXTURES } from './fixtures/opportunity-detail.fixture';
import { OPPORTUNITY_FORM_FIXTURES } from './fixtures/opportunity-form.fixture';
import { PLAN_BILLING_FIXTURES } from './fixtures/plan-billing.fixture';
import { PREFERENCES_FIXTURES } from './fixtures/preferences.fixture';
import { PROFILE_FIXTURES } from './fixtures/profile.fixture';
import { PROFILE_PICTURE_UPLOAD_FIXTURES } from './fixtures/profile-picture-upload.fixture';
import { RESET_PASSWORD_FIXTURES } from './fixtures/reset-password.fixture';
import { SIGN_IN_FIXTURES } from './fixtures/sign-in.fixture';
import { SOCIAL_CALLBACK_FIXTURES } from './fixtures/social-callback.fixture';
import { SIGN_OUT_FIXTURES } from './fixtures/sign-out.fixture';
import { SIGN_UP_FIXTURES } from './fixtures/sign-up.fixture';
import { STEP_UP_DIALOG_FIXTURES } from './fixtures/step-up-dialog.fixture';
import { SUPPORT_FIXTURES } from './fixtures/support.fixture';
import { TEAM_FIXTURES } from './fixtures/team.fixture';
import { TICKET_STATUS_FIXTURES } from './fixtures/ticket-status.fixture';
import { TRIAL_CONSENT_FIXTURES } from './fixtures/trial-consent.fixture';
import { TWO_FACTOR_SETUP_FIXTURES } from './fixtures/two-factor-setup.fixture';
import { TWO_FACTOR_VERIFY_DIALOG_FIXTURES } from './fixtures/two-factor-verify-dialog.fixture';
import { UPGRADE_CONFIRM_FIXTURES } from './fixtures/upgrade-confirm.fixture';
import { USER_TICKETS_LIST_FIXTURES } from './fixtures/user-tickets-list.fixture';
import { VERIFY_EMAIL_FIXTURES } from './fixtures/verify-email.fixture';
import { ICON_AUDIT_FIXTURES } from './fixtures/icon-audit.fixture';
import { GRAPH_TOPOLOGY_FIXTURES } from './fixtures/graph-topology.fixture';
import { CODEMAP_FIXTURES } from './fixtures/codemap.fixture';
import { SURVEY_ENTRY_FIXTURES } from './fixtures/survey-entry.fixture';

/**
 * One fixture entry — describes how to render a component in isolation for
 * visual snapshot tests. Inputs are arbitrary key/value pairs spread onto
 * the component instance by the host harness.
 */
export interface SandboxFixture {
  /** URL slug — `/__sandbox/<id>` renders this fixture. Kebab-case. */
  readonly id: string;
  /** Human label shown on the index page. */
  readonly label: string;
  /** Component class to render. */
  readonly component: Type<unknown>;
  /** Optional inputs assigned to the component instance after render. */
  readonly inputs?: Readonly<Record<string, unknown>>;
  /** Optional component-level providers (DI overrides for stubbing services). */
  readonly providers?: readonly Provider[];
  /** Optional fixed dimensions for snapshot stability (e.g. mobile width).
   * The host clamps the width to the device viewport (`min(width, 100%)`),
   * so a desktop-wide fixture lays out at phone width on the mobile project
   * instead of being clipped. For `frame: 'dialog'` the width becomes the
   * dialog's `width` (Material's default `maxWidth` still applies). */
  readonly viewport?: { readonly width: number; readonly height: number };
  /** `'dialog'` opens the component through the real `MatDialog` (surface,
   * padding, backdrop, `mat-dialog-*` styles) instead of rendering it bare
   * in the host outlet. `MAT_DIALOG_DATA` is read from `providers` and passed
   * as the dialog's `data`; the dialog's own `MatDialogRef` replaces any stub. */
  readonly frame?: 'dialog';
}

/**
 * Central fixture registry. Each feature slice adds one entry per visual
 * variant (eg `auth-sign-in-empty`, `auth-sign-in-error`). Faker-seeded for
 * snapshot stability.
 *
 * Kept as a const-spread (not lazy) — sandbox is dev-only so the bundle cost
 * is irrelevant; eager listing makes the index page deterministic.
 */
export const SANDBOX_REGISTRY: readonly SandboxFixture[] = [
  ...SIGN_IN_FIXTURES,
  ...FORGOT_PASSWORD_FIXTURES,
  ...RESET_PASSWORD_FIXTURES,
  ...SIGN_OUT_FIXTURES,
  ...SIGN_UP_FIXTURES,
  ...VERIFY_EMAIL_FIXTURES,
  ...CONFIRMATION_REQUIRED_FIXTURES,
  ...ACTION_ROUTER_FIXTURES,
  ...AUTH_ERROR_FIXTURES,
  ...TWO_FACTOR_VERIFY_DIALOG_FIXTURES,
  ...TWO_FACTOR_SETUP_FIXTURES,
  ...LEGAL_CLICKWRAP_FIXTURES,
  ...COOKIE_BANNER_FIXTURES,
  ...LANDING_FIXTURES,
  ...SURVEY_HUB_FIXTURES,
  ...PROFILE_FIXTURES,
  ...PREFERENCES_FIXTURES,
  ...ADDRESSES_FIXTURES,
  ...STEP_UP_DIALOG_FIXTURES,
  ...SOCIAL_CONNECTIONS_FIXTURES,
  ...EMAIL_CHANGE_FIXTURES,
  ...PROFILE_PICTURE_UPLOAD_FIXTURES,
  ...PLAN_BILLING_FIXTURES,
  ...UPGRADE_CONFIRM_FIXTURES,
  ...TRIAL_CONSENT_FIXTURES,
  ...DOWNGRADE_CONFIRM_FIXTURES,
  ...OPPORTUNITIES_LIST_FIXTURES,
  ...OPPORTUNITY_DETAIL_FIXTURES,
  ...MY_CAMPAIGNS_FIXTURES,
  ...OPPORTUNITY_FORM_FIXTURES,
  ...CAMPAIGN_APPLICANTS_FIXTURES,
  ...CONTENT_REVIEW_FIXTURES,
  ...CONTENT_SUBMISSION_FIXTURES,
  ...SOCIAL_CALLBACK_FIXTURES,
  ...AUTH_SUCCESS_FIXTURES,
  ...NOTIFICATION_PANEL_FIXTURES,
  ...RECONSENT_FIXTURES,
  ...SECURITY_SETTINGS_FIXTURES,
  ...APPLIED_OPPORTUNITIES_LIST_FIXTURES,
  ...APPLIED_OPPORTUNITY_DETAIL_FIXTURES,
  ...COLLABORATION_DASHBOARD_FIXTURES,
  ...COMPANY_SETUP_FIXTURES,
  ...ACCOUNT_DELETION_FIXTURES,
  ...REJECT_APPLICANT_FIXTURES,
  ...ERROR_PAGE_FIXTURES,
  ...TEAM_FIXTURES,
  ...GRANTS_FIXTURES,
  ...SUPPORT_FIXTURES,
  ...CREATE_TICKET_FIXTURES,
  ...TICKET_STATUS_FIXTURES,
  ...USER_TICKETS_LIST_FIXTURES,
  ...ADMIN_TICKETS_LIST_FIXTURES,
  ...ADMIN_TICKET_DETAIL_FIXTURES,
  ...ADMIN_USER_LIST_FIXTURES,
  ...ADMIN_DICTIONARY_FIXTURES,
  ...ADMIN_CASCADE_DELETE_FIXTURES,
  ...ICON_AUDIT_FIXTURES,
  ...GRAPH_TOPOLOGY_FIXTURES,
  ...CODEMAP_FIXTURES,
  ...SURVEY_ENTRY_FIXTURES,
];

export function findFixture(id: string): SandboxFixture | undefined {
  return SANDBOX_REGISTRY.find((f) => f.id === id);
}
