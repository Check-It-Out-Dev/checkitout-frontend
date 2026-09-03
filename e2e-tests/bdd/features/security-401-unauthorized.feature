# Source of truth: checkitout-backend/src/test/resources/features/security-401-unauthorized.feature
#
# Adaptations (every divergence from the BE source):
#
# 1. Background "the application is running with real Redis" — collapsed into
#    the tier-wide reachability guard: the fixtures.ts Before hook probes
#    /api/public-config and self-skips every scenario when the composed live
#    stack (BE + Postgres + the real Redis the BE Background asserts) is down.
#
# 2. Message-literal swap (both scenarios). The BE glue asserts English
#    body.message fragments ("not authenticated" / "Invalid authentication
#    token"). JwtAuthenticationFilter.writeErrorResponse localizes message via
#    the BE dictionary — this stack answers Polish (LocaleContextHolder
#    defaults to pl) — and never sets messageKey on the ErrorResponse it mints
#    (the class-level @JsonInclude(NON_NULL) then drops the null field), so the
#    EN literals are locale-fragile and the stable key is not on the wire
#    today. The port asserts the locale-stable envelope instead (status +
#    error "Unauthorized" + path + requestId + X-Request-ID header, typed by
#    the generated ApiErrorResponse model) and pins the expected dictionary key
#    the moment the BE starts exposing messageKey on this body.
#
# 3. Real-Firebase login collapse (scenario 2). The BE syncs the company user
#    from Firestore by UID, logs in with real credentials and exchanges the
#    Firebase idToken. This oracle seeds the SAME HttpOnly session/session_sig
#    cookie pair via mock-session (full-fidelity login is login.feature's
#    oracle); no uid-keyed /test hook or real token is used afterwards, so no
#    firebaseUid pin is required. Zero /auth/firebase/* calls (limiter budget).
#
# 4. Expiry mechanics swap (scenario 2). "I wait for the session to expire"
#    relies on the BE e2e profile's 15-second session duration; the live dev
#    BE issues standard-duration cookies and TestAuthController has no hook to
#    shorten sessions or bump tokenVersion (a tokenVersion mismatch is the 419
#    silent-refresh contract anyway, not this 401). On the BE run the expired
#    JWT is rejected by the generic invalid-token branch — ExpiredJwtException
#    escapes parseClaimsJws before the dedicated token_expired check, landing
#    in the catch-all → 401 error.auth.invalid_token — which is exactly why
#    the BE source expects "Invalid authentication token" rather than "token
#    has expired". The port reaches the same writeErrorResponse(401,
#    error.auth.invalid_token) contract deterministically with the
#    dispose-and-reuse-stale-cookies pattern: prove 200, store the cookie pair
#    (as the BE glue's context does), dispose the original transport, then
#    replay the stored pair from a fresh transport with a signature that no
#    longer validates against the token (validateHmacSignature → the same 401
#    rejection family). @slow dropped — no wall-clock wait remains.
#
# 5. Step-text rename: "the user should be able to access {string}" is owned
#    by the oauth-consent-cookie-survival oracle (bound to its re-login
#    session), so the fresh-session probe here is "the fresh session should be
#    able to access {string}". "the response status should be {int}" is the
#    shared step from partnership.steps.ts, as across this tier.
@security @401 @authentication
Feature: Authentication Boundary Protection
  As the platform
  I must reject all unauthenticated requests to protected resources
  So that user data remains secure

  # ===========================================================================
  # UNAUTHENTICATED ACCESS TESTS
  # ===========================================================================
  # These scenarios verify that protected endpoints return 401 when accessed
  # without valid session cookies.

  Scenario: Visitor without login cannot access protected profile endpoint
    Given I am not logged in
    When I try to access the protected endpoint "/users/me"
    Then the response status should be 401
    And the response should carry the unauthorized error envelope for "/users/me"
    And the rejection reason should map to messageKey "error.auth.not_authenticated"

  # ===========================================================================
  # EXPIRED SESSION TESTS
  # ===========================================================================
  # Verifies that a session that once granted access no longer does once its
  # cookie pair stops validating — the same 401 invalid-token contract the BE
  # source pins after its 15-second expiry (see adaptation 4).

  @session-expiry
  Scenario: User with expired session cannot access protected endpoints
    Given a company user is signed in with a backend session
    Then a valid session cookie "session" should be set
    And the fresh session should be able to access "/users/me"
    When the stored session cookie pair is invalidated
    And I try to access the protected endpoint "/users/me" with my expired session
    Then the response status should be 401
    And the response should carry the unauthorized error envelope for "/users/me"
    And the rejection reason should map to messageKey "error.auth.invalid_token"
