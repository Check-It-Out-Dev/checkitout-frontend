/**
 * Frozen contract types for the BE surface that is deliberately EXCLUDED
 * from the published OpenAPI spec (`@Hidden` on `SubscriptionController` /
 * `SubscriptionPaidController` since be2 4a10f8e3 "subscription excluded")
 * or that springdoc cannot derive (`TwoFactorStatusController` and
 * `StepUpAuthController` return `ResponseEntity<?>`, so their response
 * schemas never reach the spec).
 *
 * These endpoints EXIST and are called at runtime — only the contract hides
 * them, so `openapi:gen` cannot produce these types. Shapes are frozen from
 * the last generated client, verified against the BE sources on 2026-09-02:
 *  - subscription/*: be2 spec @93ccb950 (components.schemas)
 *  - TotpSetupResponse: be2 auth/dto/TotpSetupResponse.java
 *  - TwoFactor*Response: TwoFactorStatusController response maps
 *  - StepUpRequestResponse: StepUpAuthController /request response map
 *  - UploadType: StorageRateLimitService.UploadType
 *
 * If the BE un-hides these controllers, delete this module and let the
 * generated client take over (imports keep the same symbol names).
 */

// ── Subscription / billing (spec-hidden via @Hidden) ────────────────────────

export enum SubscriptionStatus {
  FREE_ACTIVE = 'FREE_ACTIVE',
  TRIAL_ENTERPRISE = 'TRIAL_ENTERPRISE',
  BUSINESS_ACTIVE = 'BUSINESS_ACTIVE',
  ENTERPRISE_ACTIVE = 'ENTERPRISE_ACTIVE',
  DOWNGRADE_PENDING = 'DOWNGRADE_PENDING',
  PAYMENT_FAILED = 'PAYMENT_FAILED',
  TERMS_PENDING = 'TERMS_PENDING',
  SUSPENDED_LEGAL = 'SUSPENDED_LEGAL',
  ACCOUNT_DEACTIVATED = 'ACCOUNT_DEACTIVATED',
}

export enum InvoiceStatus {
  PENDING = 'PENDING',
  SENT = 'SENT',
  FAILED = 'FAILED',
  DEAD_LETTER = 'DEAD_LETTER',
}

export interface SubscriptionStatusDtoOut {
  currentPlanName?: string;
  currentPlanPrice?: number;
  campaignLimit?: number;
  campaignsUsedThisPeriod?: number;
  status?: SubscriptionStatus;
  billingPeriodStart?: string;
  billingPeriodEnd?: string;
  trialEligible?: boolean;
  trialUsed?: boolean;
  trialEndDate?: string;
  targetPlanName?: string;
  hasStripeSubscription?: boolean;
}

export interface InvoiceRecordDtoOut {
  id?: number;
  invoiceType?: string;
  amountPln?: number;
  status?: InvoiceStatus;
  retryCount?: number;
  maxRetries?: number;
  errorMessage?: string;
  lastAttemptAt?: string;
  createdTime?: string;
}

export interface CheckoutSessionDtoOut {
  sessionUrl?: string;
}

export enum UpgradeRequestDtoInTargetPlanEnum {
  BUSINESS = 'BUSINESS',
  ENTERPRISE = 'ENTERPRISE',
}

export interface UpgradeRequestDtoIn {
  targetPlan: UpgradeRequestDtoInTargetPlanEnum;
}

export enum DowngradeRequestDtoInTargetPlanEnum {
  FREE = 'FREE',
  BUSINESS = 'BUSINESS',
}

export interface DowngradeRequestDtoIn {
  targetPlan: DowngradeRequestDtoInTargetPlanEnum;
}

export interface ConsentProofPayload {
  timestamp?: string;
  isTrusted?: boolean;
  documentHash?: string;
  userAgent?: string;
  language?: string;
  documentName?: string;
  screenX?: number;
  screenY?: number;
  checkboxId?: string;
  consentRecordId?: number;
  categories?: { [key: string]: boolean };
}

// ── Two-factor auth (/twofactor/*, ResponseEntity<?> — schemaless) ─────────

export interface TotpSetupResponse {
  qrCodeUrl?: string;
  /** Base64-encoded PNG data URL rendered by the setup screen. */
  qrCodeImage?: string;
  googleChartsUrl?: string;
  backupCodes?: string[];
  secret?: string;
  secretFormatted?: string;
  issuer?: string;
  email?: string;
  error?: string;
  alreadyEnabled?: boolean;
}

export interface TwoFactorStatusResponse {
  role?: string;
  has2FA?: boolean;
  requires2FASetup?: boolean;
  canAccessAdmin?: boolean;
  warning?: string;
  integrityIssue?: string;
}

export interface TwoFactorOperationResponse {
  success?: boolean;
  message?: string;
  newRole?: string;
  requiresRelogin?: boolean;
  autoLoggedIn?: boolean;
  twoFactorVerified?: boolean;
  canAccessAdmin?: boolean;
  reuseIdToken?: boolean;
  verified?: boolean;
}

export interface BackupCodesResponse {
  success?: boolean;
  backupCodes?: string[];
  message?: string;
}

// ── Step-up auth (/step-up/request — ResponseEntity<?>) ────────────────────

// StepUpChallengeType IS in the contract (StepUpAuthController exposes it via
// typed params), so reuse the generated enum rather than re-freezing it.
import type { StepUpChallengeType } from '../../api/model/step-up-challenge-type';

export interface StepUpRequestResponse {
  success?: boolean;
  required?: boolean;
  challengeType?: StepUpChallengeType;
  message?: string;
}

// ── Global error envelope (GlobalExceptionHandler body, never a spec schema) ─

export interface ApiErrorResponse {
  status?: number;
  error?: string;
  message?: string;
  messageKey?: string;
  path?: string;
  requestId?: string;
  timestamp?: string;
}

// ── Storage upload type (inner enum, never a spec schema) ──────────────────

export enum UploadType {
  PROFILE_PHOTO = 'PROFILE_PHOTO',
  CONTENT = 'CONTENT',
  CAMPAIGN_MEDIA = 'CAMPAIGN_MEDIA',
}
