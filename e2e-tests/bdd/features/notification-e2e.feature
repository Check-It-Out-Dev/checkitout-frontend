# Source of truth: checkitout-backend/src/test/resources/features/notification/notification-e2e.feature
#
# Adaptations for the FE oracle (mock-session actors, live persistent dev BE):
# - BE Background ("application running with real Redis" + "GreenMail SMTP
#   running") collapses into the fixtures.ts BE-reachability guard — the dev BE
#   wires spring.mail.* at GreenMail and exposes it via /api/test/email
#   (TestEmailController, @Profile e2e|dev).
# - The admin real-Firebase login + KMS 2FA and the fixed-UID COMPANY password /
#   INFLUENCER OAuth logins collapse to mock-session seeding (same convention as
#   logout.feature): "the company actor is signed in and active" seeds
#   company1 with ENTERPRISE + ACTIVE, the influencer Given seeds ACTIVE + a
#   CONNECTED Instagram — which is exactly what the BE's admin "target user is
#   synced ... ACTIVE" staging achieved. "Then X should be authenticated" is
#   implied: the seeding Givens throw unless /users/me answers for the session.
# - "stores the created opportunity as ..." collapses into the reused
#   partnership create/apply steps, which key the opportunity by its quoted name.
# - The BE ran against a per-suite fresh GreenMail; the persistent dev BE
#   accumulates messages and pending notification emails across scenarios/runs.
#   So: the inbox is cleared BEFORE the apply in the lifecycle scenario (any
#   email arriving after the clear is attributable — even if the BE's 15-min
#   EmailCronJob races our explicit flush), and the preferences scenario drains
#   the pending queue BEFORE clearing so the final flush provably sends nothing.
# - Named actors ("NotifCompany"/"PrefCompany"/"NotifInfluencer"...) map onto
#   the shared company1/influencer1/admin1 mock actors.
@notification-e2e
Feature: Notification System E2E with Real Email Delivery
  As a platform user I want to receive in-app notifications and email alerts
  So that I am informed about partnership activity and account events

  # ===========================================================================
  # SCENARIO: Full notification lifecycle — create, email, read, archive, isolation
  # ===========================================================================
  @notification-lifecycle
  Scenario: Full notification lifecycle with email delivery, archive, and cross-user isolation
    # --- SETUP: seeded actors replace the BE's admin-staged sync/ACTIVE steps ---
    Given the company actor is signed in and active
    And the influencer actor is signed in and active
    And the admin is signed in with a mock session
    And the admin enables all notification preferences for the company

    # Check initial unread count
    When the company checks unread notification count
    Then the unread count is stored as "initialCount"

    # Company creates partnership opportunity
    When the company creates partnership opportunity "NotifCampaign":
      | name             | Notification Test Campaign                |
      | city             | Warszawa                                  |
      | title            | E2E Notification Testing                  |
      | details          | Testing notifications with email delivery |
      | requirements     | Any influencer                            |
      | followersMin     | 1                                         |
      | followersMax     | 1000000                                   |
      | compensationType | CASH                                      |
      | compensationMin  | 100                                       |
      | compensationMax  | 500                                       |
      | platforms        | 1                                         |
      | contentTypes     | 1                                         |
      | serviceType      | 1                                         |
    Then the response status should be 200

    # (adaptation) clear the shared inbox BEFORE the apply so every email that
    # lands afterwards belongs to this scenario's APPLICATION_RECEIVED.
    And the GreenMail inbox is cleared

    # --- Influencer applies (should trigger APPLICATION_RECEIVED notification) ---
    When the influencer applies to opportunity "NotifCampaign" with note "Testing notification delivery!" storing the application as "notifApp"
    Then the response status should be 200

    # --- PART 1: Verify notification appeared for company ---
    When the company checks unread notification count
    Then the unread count should be greater than "initialCount"

    When the company fetches notifications page 0 size 10
    Then the response status should be 200
    And the notifications response should contain at least 1 notification
    And the first notification should have type "APPLICATION_RECEIVED"
    And the first notification id is stored as "notifId"

    # --- PART 2: Verify email delivery via GreenMail ---
    When the email queue is processed
    Then GreenMail should have received at least 1 email
    And the last GreenMail email should contain subject "[CheckItOut]"

    # --- PART 3: Mark notification as read ---
    When the company marks notification "notifId" as read
    Then the response status should be 200
    And the notification response should have isRead true

    # --- PART 4: Mark all as read ---
    When the company marks all notifications as read
    Then the response status should be 200

    When the company checks unread notification count
    Then the unread count should be 0

    # --- PART 5: Archive notification and verify it disappears ---
    When the company fetches notifications page 0 size 10
    Then the response status should be 200
    And the notifications response should contain at least 1 notification

    When the company archives notification "notifId"
    Then the response status should be 204

    When the company fetches notifications page 0 size 10
    Then the response status should be 200
    And the notifications response should not contain notification "notifId"

    # --- PART 6: Cross-user isolation — influencer should NOT see company's notifications ---
    When the influencer fetches notifications page 0 size 10
    Then the response status should be 200
    And the notifications response should not contain notification "notifId"

  # ===========================================================================
  # SCENARIO: Preferences gate notifications and email
  # ===========================================================================
  @notification-preferences
  Scenario: Disabled preferences suppress notifications and email
    # --- SETUP: seeded actors, then DISABLE partnership notification preferences ---
    Given the company actor is signed in and active
    And the influencer actor is signed in and active
    And the admin is signed in with a mock session
    And the admin disables partnership notification preferences for the company

    When the company checks unread notification count
    Then the unread count is stored as "beforeCount"

    # Company creates opportunity
    When the company creates partnership opportunity "PrefCampaign":
      | name             | Preferences Test Campaign      |
      | city             | Warszawa                       |
      | title            | Preference Gating Test         |
      | details          | Testing preference suppression |
      | requirements     | Any                            |
      | followersMin     | 1                              |
      | followersMax     | 1000000                        |
      | compensationType | CASH                           |
      | compensationMin  | 100                            |
      | compensationMax  | 500                            |
      | platforms        | 1                              |
      | contentTypes     | 1                              |
      | serviceType      | 1                              |
    Then the response status should be 200

    # Influencer applies (should NOT trigger notification because prefs are off)
    When the influencer applies to opportunity "PrefCampaign" with note "Should be suppressed" storing the application as "prefApp"
    Then the response status should be 200

    # Company should NOT have a new notification
    When the company checks unread notification count
    Then the unread count should equal "beforeCount"

    # (adaptation) drain leftovers from earlier scenarios first, then clear the
    # inbox — the final flush must provably deliver nothing new.
    When the email queue is processed
    And the GreenMail inbox is cleared
    And the email queue is processed
    Then GreenMail should have received 0 emails
