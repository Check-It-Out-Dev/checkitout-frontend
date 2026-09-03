# Source of truth: checkitout-backend/src/test/resources/features/registry/registry-company-flow.feature
#
# Company onboarding through the Polish public registries (KRS/CEIDG/GUS) vs
# the LIVE BE: lookup by NIP -> confirm -> get/refresh company data, with
# auto-activation when the email is verified. The BE's e2e profile stubs the
# upstream registries per-NIP (/test/registry/configure-*), so the flow is
# deterministic; each scenario authenticates a FRESH throwaway user
# (registry-<role>-<ts>@e2e.test, exactly like the BE glue) so NIP-uniqueness
# never pollutes across runs on the persistent dev DB.
@registry @be-suite:RunRegistryIT
Feature: Registry Company Flow
  As a company user
  I want to look up, confirm, and manage my company data from Polish public registries
  So that my account can be verified and activated

  @registry @lookup
  Scenario: KRS company lookup returns full company data
    Given registry stubs are reset
    And a KRS company is configured for NIP "5261040828"
    And a COMPANY user is authenticated for registry tests
    And the registry user has emailVerified set to true
    When the user performs a registry lookup for NIP "5261040828"
    Then the response status should be 200
    And the lookup response should contain NIP "5261040828"
    And the lookup response companyType should be "SP_ZOO"
    And the lookup response should contain company name
    And the lookup response should contain address fields

  @registry @lookup
  Scenario: JDG lookup returns company data with owner name
    Given registry stubs are reset
    And a JDG company is configured for NIP "7740001454"
    And a COMPANY user is authenticated for registry tests
    When the user performs a registry lookup for NIP "7740001454"
    Then the response status should be 200
    And the lookup response companyType should be "JDG"
    And the lookup response should contain owner name

  @registry @lookup
  Scenario: Invalid NIP format returns 400
    Given registry stubs are reset
    And a COMPANY user is authenticated for registry tests
    When the user performs a registry lookup for NIP "123"
    Then the response status should be 400

  @registry @lookup
  Scenario: Empty NIP returns 400
    Given registry stubs are reset
    And a COMPANY user is authenticated for registry tests
    When the user performs a registry lookup for NIP ""
    Then the response status should be 400

  @registry @lookup
  Scenario: NIP already registered returns 409
    Given registry stubs are reset
    And a KRS company is configured for NIP "5261040828"
    And a COMPANY user is authenticated for registry tests
    And another user already has company data with NIP "5261040828"
    When the user performs a registry lookup for NIP "5261040828"
    Then the response status should be 409
    And the error message should contain "already registered on the platform"

  @registry @lookup
  Scenario: GUS not found returns 404
    Given registry stubs are reset
    And GUS returns not-found for NIP "5261040828"
    And a COMPANY user is authenticated for registry tests
    When the user performs a registry lookup for NIP "5261040828"
    Then the response status should be 404

  @registry @lookup
  Scenario: Inactive company returns 409
    Given registry stubs are reset
    And an inactive company is configured for NIP "5261040828"
    And a COMPANY user is authenticated for registry tests
    When the user performs a registry lookup for NIP "5261040828"
    Then the response status should be 409
    And the error message should contain "no longer active"

  @registry @confirm
  Scenario: KRS confirm with emailVerified auto-activates account
    Given registry stubs are reset
    And a KRS company is configured for NIP "5261040828"
    And a COMPANY user is authenticated for registry tests
    And the registry user has emailVerified set to true
    When the user performs a registry lookup for NIP "5261040828"
    Then the response status should be 200
    When the user confirms company data for NIP "5261040828"
    Then the response status should be 200
    And the confirm response activated should be true
    And the confirm response accountStatus should be "ACTIVE"

  @registry @confirm
  Scenario: KRS confirm without emailVerified does not auto-activate
    Given registry stubs are reset
    And a KRS company is configured for NIP "5261040828"
    And a COMPANY user is authenticated for registry tests
    And the registry user has emailVerified set to false
    When the user performs a registry lookup for NIP "5261040828"
    Then the response status should be 200
    When the user confirms company data for NIP "5261040828"
    Then the response status should be 200
    And the confirm response activated should be false
    And the confirm response accountStatus should be "IN_VALIDATION"

  @registry @confirm
  Scenario: Duplicate NIP on confirm returns 409
    Given registry stubs are reset
    And a KRS company is configured for NIP "5261040828"
    And a COMPANY user is authenticated for registry tests
    And another user already has company data with NIP "5261040828"
    When the user confirms company data for NIP "5261040828"
    Then the response status should be 409

  @registry @confirm
  Scenario: JDG confirm with emailVerified auto-activates
    Given registry stubs are reset
    And a JDG company is configured for NIP "7740001454"
    And a COMPANY user is authenticated for registry tests
    And the registry user has emailVerified set to true
    When the user performs a registry lookup for NIP "7740001454"
    Then the response status should be 200
    When the user confirms company data for NIP "7740001454"
    Then the response status should be 200
    And the confirm response activated should be true
    And the confirm response accountStatus should be "ACTIVE"

  @registry @get-data
  Scenario: Get company data after confirm returns full data
    Given registry stubs are reset
    And a KRS company is configured for NIP "5261040828"
    And a COMPANY user is authenticated for registry tests
    And the registry user has emailVerified set to true
    When the user performs a registry lookup for NIP "5261040828"
    And the user confirms company data for NIP "5261040828"
    And the user requests their company data
    Then the response status should be 200
    And the company data response should contain NIP "5261040828"
    And the company data response should contain company name

  @registry @get-data
  Scenario: Get company data without prior confirm returns null
    Given registry stubs are reset
    And a COMPANY user is authenticated for registry tests
    When the user requests their company data
    Then the response status should be 200
    And the company data response body should be empty

  @registry @permissions
  Scenario: Unauthenticated request returns 401
    Given registry stubs are reset
    When an unauthenticated user performs a registry lookup for NIP "5261040828"
    Then the response status should be 401

  @registry @permissions
  Scenario: Influencer user cannot access registry
    Given registry stubs are reset
    And an INFLUENCER user is authenticated for registry tests
    When the user performs a registry lookup for NIP "5261040828"
    Then the response status should be 409
    And the error message should contain "only available for company"

  @registry @full-flow
  Scenario: Full KRS flow - lookup, confirm, get
    Given registry stubs are reset
    And a KRS company is configured for NIP "5261040828"
    And a COMPANY user is authenticated for registry tests
    And the registry user has emailVerified set to true
    When the user performs a registry lookup for NIP "5261040828"
    Then the response status should be 200
    And the lookup response should contain NIP "5261040828"
    When the user confirms company data for NIP "5261040828"
    Then the response status should be 200
    And the confirm response activated should be true
    When the user requests their company data
    Then the response status should be 200
    And the company data response should contain NIP "5261040828"

  @registry @full-flow
  Scenario: Full JDG flow - lookup, confirm, get
    Given registry stubs are reset
    And a JDG company is configured for NIP "7740001454"
    And a COMPANY user is authenticated for registry tests
    And the registry user has emailVerified set to true
    When the user performs a registry lookup for NIP "7740001454"
    Then the response status should be 200
    And the lookup response companyType should be "JDG"
    When the user confirms company data for NIP "7740001454"
    Then the response status should be 200
    And the confirm response activated should be true
    When the user requests their company data
    Then the response status should be 200
    And the company data response should contain NIP "7740001454"
    And the company data response should contain owner name

  @registry @full-flow
  Scenario: Refresh updates company data from registries
    Given registry stubs are reset
    And a KRS company is configured for NIP "5261040828"
    And a COMPANY user is authenticated for registry tests
    And the registry user has emailVerified set to true
    When the user performs a registry lookup for NIP "5261040828"
    And the user confirms company data for NIP "5261040828"
    Then the response status should be 200
    When the user refreshes their company data
    Then the response status should be 200
    And the lookup response should contain NIP "5261040828"
