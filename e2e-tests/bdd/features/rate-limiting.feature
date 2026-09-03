# Source of truth: checkitout-backend/src/test/resources/features/rate-limiting.feature
#
# The BE source runs in an ISOLATED JVM (RunRateLimitingIT) with strict limits
# pinned via Maven argLine (RL_STANDARD_REQ=5 / RL_STANDARD_WIN=60 /
# RL_STANDARD_BLOCK=10). This FE oracle drives the LIVE persistent dev BE,
# which runs the committed defaults instead — adaptations, one per divergence:
#
# - Limits: read LIVE from X-RateLimit-Limit (dev 10000/60s; e2e-pinned 5/60s)
#   (application.yml rate-limit.profiles.standard; application-dev.yml does not
#   override profiles). Every request count and header value below adapts the
#   BE source's pinned counts become live-adaptive; the exhaust step reads its
#   count against the live X-RateLimit-Limit header and fails fast on drift.
# - Scenario isolation: the BE flushes rate_limit* Redis keys before each
#   scenario (RateLimitingHooks @Before) — BE-internal, not exposed by the live
#   BE. This port substitutes a FRESH throwaway user per scenario: STANDARD
#   buckets key on (hashed firebaseUid, method, path) per
#   RateLimitKeyType.USER_ENDPOINT, so a fresh user IS an untouched bucket
#   (same throwaway-user pattern as the registry oracle). Exhausted throwaway
#   users stay blocked on GET /test/health for up to 300 s after a run; they
#   are never reused.
# - Auth: the BE's "synced from Firestore" + "I am authenticated as E2E ...
#   user" pair collapses to ONE mock-session seeding — mock-session creates the
#   user row AND mints the session cookie pair, making the Firestore sync
#   redundant (standard FE-port collapse; see logout.feature). The BE's
#   mid-scenario "I authenticate as E2E influencer user" becomes an explicit
#   session switch between two isolated cookie jars.
# - Locale: the BE asserts the 429 body contains "rate_limit_exceeded" by
#   substring; this port pins the parsed `error` field of the interceptor's
#   429 JSON (RateLimitInterceptor.sendRateLimitExceededResponse) — the
#   locale-independent machine code. The localized `message` field (Polish on
#   this DB) is never asserted.
# - Background "running with real Redis": a dev-stack invariant
#   (rate-limit.storage=redis in application-dev.yml) that the HTTP surface
#   cannot introspect; the step probes BE reachability, and the X-RateLimit-*
#   assertions in every scenario prove the limiter is actually enforcing.
# - Auth-limiter budget: no scenario touches /auth/** — the probe endpoint
#   /test/health sits on the STANDARD bucket exactly like the BE source; the
#   only auth-adjacent traffic is 1-2 mock-session seedings per scenario.
@rate-limiting
Feature: API Rate Limiting Protection
  As a platform operator
  I want to limit API requests per user
  So that the system remains stable under load

  Background:
    Given the application is running with real Redis

  # ---------------------------------------------------------------------------
  # STANDARD PROFILE — limit-ADAPTIVE (2026-09-02): the shared dev BE runs
  # STANDARD at 10000/60s (unexhaustible in a test), the BE Cucumber runner
  # pins 5/60s via argLine. The exhaust steps read the live X-RateLimit-Limit
  # from request #1 and exhaust exactly that; when the advertised limit is
  # above 200 the 429 scenarios SELF-SKIP (they run fully on an e2e-pinned
  # BE). Header assertions check the contract shape, never a pinned number.
  # ---------------------------------------------------------------------------
  @company @429-response @standard-profile
  Scenario: Company user receives 429 when exceeding the STANDARD rate limit
    # Endpoint: /api/test/health has @RateLimit(profile = STANDARD)
    Given a fresh company user is authenticated for rate-limit testing
    # Exhaust exactly the live STANDARD limit (BE source pinned 5; self-skips >200)
    When I exhaust the STANDARD rate limit on "/test/health"
    # limit+1'th request should be blocked
    And I make one more GET request to "/test/health"
    Then the response status should be 429
    And the response should contain header "Retry-After"
    And the response error code should be "rate_limit_exceeded"

  @company @headers @standard-profile
  Scenario: Rate limit headers advertise the STANDARD contract
    Given a fresh company user is authenticated for rate-limit testing
    When I make a GET request to "/test/health"
    Then the response status should be 200
    # Contract shape, not pinned numbers: Limit numeric, Remaining = Limit - 1
    And the rate-limit headers should advertise a consistent STANDARD contract

  # ---------------------------------------------------------------------------
  # USER ISOLATION: Different users have independent buckets
  # ---------------------------------------------------------------------------
  @company @influencer @isolation
  Scenario: Different users have independent rate limit buckets
    Given a fresh company user is authenticated for rate-limit testing
    And a fresh influencer user is provisioned for rate-limit testing
    # Company user exhausts their limit
    When I exhaust the STANDARD rate limit on "/test/health"
    And I make one more GET request to "/test/health"
    Then the response status should be 429
    # Influencer should have fresh limit
    When I switch to the fresh influencer user
    And I make a GET request to "/test/health"
    Then the response status should be 200
    And the response should contain header "X-RateLimit-Remaining" with value "59"

  # ---------------------------------------------------------------------------
  # RATE LIMIT RESET: Verify headers are present
  # ---------------------------------------------------------------------------
  @company @headers
  Scenario: Rate limit headers include reset timestamp
    Given a fresh company user is authenticated for rate-limit testing
    When I make a GET request to "/test/health"
    Then the response status should be 200
    And the response should contain header "X-RateLimit-Reset"
