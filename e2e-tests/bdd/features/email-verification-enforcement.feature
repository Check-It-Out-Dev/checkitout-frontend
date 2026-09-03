# Source of truth: checkitout-backend/src/test/resources/features/email-enforcement-filter.feature
#
# BUG-6 regression: EmailVerificationEnforcementFilter gates
# POST /applied-opportunity + /partnership-opportunity on emailVerified
# (read from the user cache), returning 403 X-Email-Verification-Required
# for an unverified user. The BE source logs an influencer in via real
# Firebase OAuth; this oracle seeds via mock-session then flips the same
# unverified state via /test/auth/reset-influencer-for-verification.
@influencer-verification
Feature: EmailVerificationEnforcementFilter blocks unverified users from creating applications

  @enforcement-filter @bug-6
  Scenario: Unverified influencer is blocked from POST /applied-opportunity
    Given a influencer user is signed in
    And the influencer is reset to unverified email state
    When the influencer attempts to create an application
    Then the application request is rejected with status 403
    And the response carries the X-Email-Verification-Required marker
