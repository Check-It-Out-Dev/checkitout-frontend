# Source of truth: checkitout-backend/src/test/resources/features/partnership/partnership-flow.feature
#
# The BE Cucumber corpus drives the partnership-opportunity state machine end to
# end. This FE oracle mirrors it 1:1 against the LIVE BE, but substitutes the
# real admin-2FA + Instagram-OAuth login preamble with the test-infra
# mock-session seeding the integration tier already uses (POST
# /api/test/auth/mock-session sets role + ACTIVE status directly — the same
# end-state the BE's "Admin syncs the target user to ACTIVE/ROLE" steps reach).
# Two isolated APIRequestContexts hold the COMPANY and INFLUENCER sessions
# concurrently so one scenario can drive both sides of the collaboration.
#
# Request/response bodies use the OpenAPI-generated model types (src/app/api/model),
# so a BE contract change breaks this oracle at compile time.
@partnership-flow @journey-opportunities @be-suite:RunPartnershipFlowIT
Feature: Partnership Opportunity Lifecycle
  As a COMPANY user I want to create partnership opportunities
  As an INFLUENCER I want to discover and apply to opportunities
  So that brands and influencers can collaborate on campaigns

  Background:
    Given the company actor is signed in and active
    And the influencer actor is signed in and active

  @happy-path @create-opportunity
  Scenario: Company creates a partnership opportunity successfully
    When the company creates partnership opportunity "campaign1":
      | name             | Summer Fashion 2026                                              |
      | city             | Warszawa                                                        |
      | title            | Summer Fashion Campaign                                         |
      | details          | Looking for fashion influencers to promote our summer collection |
      | requirements     | Min 1K followers, fashion niche                                 |
      | followersMin     | 1                                                               |
      | followersMax     | 100000                                                          |
      | compensationType | CASH                                                            |
      | compensationMin  | 500                                                             |
      | compensationMax  | 2000                                                            |
      | platforms        | 1                                                               |
      | contentTypes     | 1                                                               |
      | serviceType      | 1                                                               |
    Then the response status should be 200
    And opportunity "campaign1" should have name "Summer Fashion 2026"
    And opportunity "campaign1" should have city "Warszawa"
    And opportunity "campaign1" should have title "Summer Fashion Campaign"
    And opportunity "campaign1" should be active

  @happy-path @full-lifecycle @state-machine
  Scenario: Complete partnership lifecycle with content rejection and ratings
    # STEP 1: Company creates the opportunity
    When the company creates partnership opportunity "lifecycleCampaign":
      | name             | Complete Lifecycle Campaign                                       |
      | city             | Kraków                                                           |
      | title            | Full State Machine Test                                          |
      | details          | Testing complete partnership lifecycle with all state transitions |
      | requirements     | Active Instagram account, min 100 followers                     |
      | followersMin     | 1                                                               |
      | followersMax     | 1000000                                                         |
      | compensationType | CASH                                                            |
      | compensationMin  | 500                                                             |
      | compensationMax  | 1000                                                            |
      | platforms        | 1                                                               |
      | contentTypes     | 1                                                               |
      | serviceType      | 1                                                               |
    Then the response status should be 200

    # STEP 2: Influencer applies (APPLIED)
    When the influencer applies to opportunity "lifecycleCampaign" with note "Excited to test the full lifecycle!" storing the application as "lifecycleApp"
    Then the response status should be 200
    And application "lifecycleApp" should have opportunity status "APPLIED"

    # STEP 3: Company accepts application (APPLIED -> ACCEPTED_BY_COMPANY)
    When the company accepts application "lifecycleApp"
    Then the response status should be 200
    And application "lifecycleApp" should have opportunity status "ACCEPTED_BY_COMPANY"

    # STEP 4: Influencer accepts offer (ACCEPTED_BY_COMPANY -> ACCEPTED_BY_INFLUENCER)
    When the influencer accepts application "lifecycleApp"
    Then the response status should be 200
    And application "lifecycleApp" should have opportunity status "ACCEPTED_BY_INFLUENCER"

    # STEP 5: Influencer submits content (-> CONTENT_SEND_TO_ACCEPT)
    When the influencer submits content for application "lifecycleApp" storing the content as "firstDraft":
      | urls        | https://vimeo.com/first-draft-content |
      | description | First draft of promotional content    |
      | tags        | fashion,summer,lifestyle              |
    Then the response status should be 201
    And application "lifecycleApp" should have opportunity status "CONTENT_SEND_TO_ACCEPT"

    # STEP 6: Company rejects content — Vimeo level (-> CONTENT_REJECTED)
    When the company rejects content "firstDraft" with notes "Please add more product close-ups and improve lighting"
    Then the response status should be 200
    And application "lifecycleApp" should have opportunity status "CONTENT_REJECTED"

    # STEP 7: Influencer resubmits revised content (-> CONTENT_SEND_TO_ACCEPT)
    When the influencer submits content for application "lifecycleApp" storing the content as "revisedContent":
      | urls        | https://vimeo.com/revised-content                       |
      | description | Revised content with better lighting and product shots  |
      | tags        | fashion,summer,lifestyle,revised                        |
    Then the response status should be 201
    And application "lifecycleApp" should have opportunity status "CONTENT_SEND_TO_ACCEPT"

    # STEP 8: Company approves content (-> CONTENT_APPROVED)
    When the company approves content "revisedContent" with notes "Great improvements! Approved for posting."
    Then the response status should be 200
    And application "lifecycleApp" should have opportunity status "CONTENT_APPROVED"

    # STEP 9: Influencer posts to Instagram (-> CONTENT_POSTED)
    When the influencer posts content "revisedContent" to Instagram with link "https://instagram.com/p/wrong-post-123"
    Then the response status should be 200
    And application "lifecycleApp" should have opportunity status "CONTENT_POSTED"

    # STEP 10: Company rejects Instagram post (-> CONTENT_POSTED_REJECTED)
    When the company rejects the Instagram post for application "lifecycleApp" with reason "Wrong hashtags used, please repost with #BrandXSummer"
    Then the response status should be 200
    And application "lifecycleApp" should have opportunity status "CONTENT_POSTED_REJECTED"

    # STEP 11: Influencer reposts correct content (-> CONTENT_POSTED)
    When the influencer posts content "revisedContent" to Instagram with link "https://instagram.com/p/correct-post-456"
    Then the response status should be 200
    And application "lifecycleApp" should have opportunity status "CONTENT_POSTED"

    # STEP 12: Company verifies Instagram post (-> TO_BE_PAID)
    When the company verifies the Instagram post for application "lifecycleApp"
    Then the response status should be 200
    And application "lifecycleApp" should have opportunity status "TO_BE_PAID"

    # STEP 13: Company confirms payment (-> DONE)
    When the company confirms payment for application "lifecycleApp"
    Then the response status should be 200
    And application "lifecycleApp" should have opportunity status "DONE"

    # STEP 14: Both parties rate each other POSITIVE
    When the company rates the influencer "POSITIVE" for application "lifecycleApp"
    Then the response status should be 200
    When the influencer rates the company "POSITIVE" for application "lifecycleApp"
    Then the response status should be 200

    # FINAL: collaboration completed with mutual positive ratings
    And application "lifecycleApp" should have opportunity status "DONE"
    And application "lifecycleApp" should have company rating "POSITIVE"
    And application "lifecycleApp" should have influencer rating "POSITIVE"

  @happy-path @multi-rejection @state-machine
  Scenario: Content can be rejected multiple times before approval at Vimeo and Instagram levels
    When the company creates partnership opportunity "multiRejectCampaign":
      | name             | Multi Rejection Campaign            |
      | city             | Warszawa                            |
      | title            | Multiple Rejection Cycles           |
      | details          | Testing multiple content rejections |
      | requirements     | Active Instagram account            |
      | followersMin     | 1                                   |
      | followersMax     | 1000000                             |
      | compensationType | CASH                                |
      | compensationMin  | 300                                 |
      | compensationMax  | 600                                 |
      | platforms        | 1                                   |
      | contentTypes     | 1                                   |
      | serviceType      | 1                                   |
    Then the response status should be 200

    When the influencer applies to opportunity "multiRejectCampaign" with note "Ready for multiple revisions" storing the application as "multiRejectApp"
    Then the response status should be 200
    When the company accepts application "multiRejectApp"
    Then the response status should be 200
    When the influencer accepts application "multiRejectApp"
    Then the response status should be 200

    # VIMEO LEVEL: reject #1 -> resubmit -> reject #2 -> resubmit -> approve
    When the influencer submits content for application "multiRejectApp" storing the content as "draftV1":
      | urls        | https://vimeo.com/draft-v1 |
      | description | First draft attempt        |
      | tags        | fashion,test               |
    Then the response status should be 201
    When the company rejects content "draftV1" with notes "Lighting is too dark, reshoot needed"
    Then the response status should be 200
    And application "multiRejectApp" should have opportunity status "CONTENT_REJECTED"

    When the influencer submits content for application "multiRejectApp" storing the content as "draftV2":
      | urls        | https://vimeo.com/draft-v2        |
      | description | Second draft with better lighting |
      | tags        | fashion,test,revised              |
    Then the response status should be 201
    And application "multiRejectApp" should have opportunity status "CONTENT_SEND_TO_ACCEPT"
    When the company rejects content "draftV2" with notes "Good lighting but missing brand logo overlay"
    Then the response status should be 200
    And application "multiRejectApp" should have opportunity status "CONTENT_REJECTED"

    When the influencer submits content for application "multiRejectApp" storing the content as "draftV3":
      | urls        | https://vimeo.com/draft-v3                |
      | description | Third draft with logo and lighting fixed  |
      | tags        | fashion,test,final                        |
    Then the response status should be 201
    And application "multiRejectApp" should have opportunity status "CONTENT_SEND_TO_ACCEPT"
    When the company approves content "draftV3" with notes "Perfect! Ready for Instagram."
    Then the response status should be 200
    And application "multiRejectApp" should have opportunity status "CONTENT_APPROVED"

    # INSTAGRAM LEVEL: post -> reject #1 -> repost -> reject #2 -> repost -> verify
    When the influencer posts content "draftV3" to Instagram with link "https://instagram.com/p/wrong-hashtags"
    Then the response status should be 200
    And application "multiRejectApp" should have opportunity status "CONTENT_POSTED"
    When the company rejects the Instagram post for application "multiRejectApp" with reason "Missing required hashtag #BrandXPartner"
    Then the response status should be 200
    And application "multiRejectApp" should have opportunity status "CONTENT_POSTED_REJECTED"

    When the influencer posts content "draftV3" to Instagram with link "https://instagram.com/p/wrong-caption"
    Then the response status should be 200
    And application "multiRejectApp" should have opportunity status "CONTENT_POSTED"
    When the company rejects the Instagram post for application "multiRejectApp" with reason "Caption needs product link in bio mention"
    Then the response status should be 200
    And application "multiRejectApp" should have opportunity status "CONTENT_POSTED_REJECTED"

    When the influencer posts content "draftV3" to Instagram with link "https://instagram.com/p/correct-final"
    Then the response status should be 200
    And application "multiRejectApp" should have opportunity status "CONTENT_POSTED"
    When the company verifies the Instagram post for application "multiRejectApp"
    Then the response status should be 200
    And application "multiRejectApp" should have opportunity status "TO_BE_PAID"

    When the company confirms payment for application "multiRejectApp"
    Then the response status should be 200
    And application "multiRejectApp" should have opportunity status "DONE"

  # Regression net for the 2026-09-02 review-page 500 (LazyInitializationException
  # on the BE's per-application content read): unlike the API-driven lifecycle
  # scenarios above, this one opens the REAL review page as the company — the
  # exact request that used to die on a lazy ContentType proxy — then approves
  # through the UI. No TOTP precondition, so it never self-skips.
  @content-review-ui @happy-path
  Scenario: Company reviews and approves content through the review page
    Given the company actor is signed in and active
    And the influencer actor is signed in and active
    When the company creates partnership opportunity "review-camp":
      | name             | Review Net 2026                          |
      | city             | Warszawa                                 |
      | title            | Review-page regression campaign          |
      | details          | UI-driven content review oracle           |
      | requirements     | Min 1 follower, oracle niche             |
      | followersMin     | 1                                        |
      | followersMax     | 100000                                   |
      | compensationType | CASH                                     |
      | compensationMin  | 100                                      |
      | compensationMax  | 500                                      |
      | platforms        | 1                                        |
      | contentTypes     | 1                                        |
      | serviceType      | 1                                        |
    Then the response status should be 200
    When the influencer applies to opportunity "review-camp" with note "review oracle" storing the application as "A"
    And the company accepts application "A"
    And the influencer accepts application "A"
    And the influencer submits content for application "A" storing the content as "C":
      | contentTypeId | 1 |
      | contentCount  | 1 |
    When the company opens the content review page for application "A"
    Then the review page lists content "C"
    When the company approves content "C" from the review page
    Then application "A" should have opportunity status "CONTENT_APPROVED"
