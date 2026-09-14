# Subsumption proposal — frontend @ 6f797f5a0f5bc3e831b4696b379b78f34e5a2e33

134 of 1306 tests may leave the pull-request tier: 8574 of 8574 probes and 1892 of 1892 kills stay carried by the 1172 that remain; PR tier 84 s → 83.4 s. 300 more are coverage-carried but outside the kill matrix's scope or sole killers inside the flaky window, and are not proposed. 639 of 1306 tests touch only units the kill matrix covers; 235 load nothing the instrument sees and are never candidates.

| Class | Demoted | Carried by |
| --- | --- | --- |
| `src/app/core/demo/guide-hint.spec.ts` | 39 | `guide-hint.spec.ts :: E-PROMISE — what the guide may promise about a step admin-2fa/0: the footer matches what the beat can actually do`, `guide-hint.spec.ts :: E-PROMISE — what the guide may promise about a step stepup-email/6: the footer matches what the beat can actually do`, `guide-hint.spec.ts :: E-PROMISE — what the guide may promise about a step nip-to-ksef/24: the footer matches what the beat can actually do` +1 |
| `src/app/core/demo/sandbox-director.service.spec.ts` | 17 | `sandbox-director.service.spec.ts :: SandboxDirectorService a full load on the landing page with a stored tour drops it at construction`, `sandbox-director.service.spec.ts :: SandboxDirectorService a tour ends when the visitor leaves the app area the hub without a start link ends it; a start link and app routes keep it`, `sandbox-director.service.spec.ts :: SandboxDirectorService exit() closes any dialog the tour left open` +15 |
| `src/app/core/interceptors/error.interceptor.spec.ts` | 8 | `error.interceptor.spec.ts :: errorInterceptor on 401 from /auth/firebase/login — does NOT refresh, does NOT redirect (legitimate auth failure)`, `error.interceptor.spec.ts :: errorInterceptor on 401 with no signed-in user from a PROTECTED page — clears session + routes to /auth/sign-in (no refresh attempt)`, `error.interceptor.spec.ts :: errorInterceptor on authenticated 419 (tokenVersion mismatch) — refreshes once and retries the original request` +2 |
| `src/app/core/shell/shell-status.service.spec.ts` | 8 | `shell-banners.component.spec.ts :: ShellBannersComponent clearConsent hides the consent banner without affecting the others`, `shell-status.service.spec.ts :: ShellStatusService trialOffer the nudge is not an obligation — hasAnyBanner stays false`, `shell-headers.interceptor.spec.ts :: shellHeadersInterceptor leaves the service untouched when the headers are absent` +4 |
| `src/app/core/demo/demo-fixtures.spec.ts` | 7 | `demo-fixtures.spec.ts :: demo fixtures plays the whole upgrade beat — consent, a checkout to pay in, then the plan flip`, `demo-fixtures.spec.ts :: demo fixtures sign-up takes the role from the form and signs in; sign-out signs out`, `demo-fixtures.spec.ts :: demo fixtures company accept/decline round-trip moves the accepted application into the in-progress tab and its counter` +5 |
| `src/app/core/step-up/step-up-context.spec.ts` | 4 | `step-up.interceptor.spec.ts :: stepUpInterceptor does not leak the token across subsequent requests` |
| `src/app/core/theme/theme.service.spec.ts` | 4 | `theme.service.spec.ts :: ThemeService toggle() flips between light and dark`, `layout.component.spec.ts :: LayoutComponent nav surface exposes 5 standard nav entries in the expected order`, `theme.service.spec.ts :: ThemeService persists the mode to localStorage on every change` +1 |
| `src/app/core/consent/consent.service.spec.ts` | 3 | `consent.service.spec.ts :: ConsentService acceptCustom persists the mixed choice and mirrors it per-category to the BE`, `consent.service.spec.ts :: ConsentService acceptAll persists analytics+marketing and flips needsDecision`, `consent.service.spec.ts :: ConsentService acceptNecessary opts out of analytics+marketing` +2 |
| `src/app/core/i18n/seo-title.strategy.spec.ts` | 3 | `seo-title.strategy.spec.ts :: SeoTitleStrategy titles /error/:type through the resolver end to end`, `seo-title.strategy.spec.ts :: SeoTitleStrategy removes the description when the next page declares none` |
| `src/app/core/interceptors/rate-limit-cache.interceptor.spec.ts` | 3 | `rate-limit-cache.interceptor.spec.ts :: rateLimitInterceptor notifies with null when the 429 omits Retry-After`, `rate-limit-cache.interceptor.spec.ts :: rateLimitInterceptor does NOT notify on non-429 errors (5xx, 401, etc.)`, `rate-limit-cache.interceptor.spec.ts :: rateLimitInterceptor notifies the rate-limit state with the parsed Retry-After on 429` |
| `src/app/core/interceptors/set-to-array.interceptor.spec.ts` | 3 | `set-to-array.interceptor.spec.ts :: setToArrayInterceptor keeps body identity when no Set is present (no clone)` |
| `src/app/core/interceptors/shell-headers.interceptor.spec.ts` | 3 | `shell-headers.interceptor.spec.ts :: shellHeadersInterceptor leaves the service untouched when the headers are absent`, `shell-headers.interceptor.spec.ts :: shellHeadersInterceptor forwards X-Email-Verification-Required to the shell-status service`, `shell-status.service.spec.ts :: ShellStatusService noteResponseHeaders flips consentRequired when X-Consent-Required is "1"` |
| `src/app/core/interceptors/step-up.interceptor.spec.ts` | 3 | `step-up.interceptor.spec.ts :: stepUpInterceptor does not leak the token across subsequent requests` |
| `src/app/core/applied-opportunities/applied-opportunity.service.spec.ts` | 2 | `applied-opportunity.service.spec.ts :: AppliedOpportunityApiService apply(id, "") treats empty-string note as falsy → omits the key`, `applied-opportunity.service.spec.ts :: AppliedOpportunityApiService apply(id, note) includes note in the dto when truthy`, `applied-opportunity.service.spec.ts :: AppliedOpportunityApiService list() builds pageable + filters envelope with defaults` |
| `src/app/core/auth/auth.guards.spec.ts` | 2 | `auth.guards.spec.ts :: adminGuard probes once on a cold session and decides on the answer`, `auth.guards.spec.ts :: adminGuard sends a signed-in non-admin back to the dashboard`, `auth.guards.spec.ts :: noAuthGuard allows the route synchronously when probed + unauthenticated` |
| `src/app/core/auth/social-platform-config.service.spec.ts` | 2 | `social-platform-config.service.spec.ts :: SocialPlatformConfigService clears the state cookie after a single validation attempt` |
| `src/app/core/i18n/transloco-loader.spec.ts` | 2 | `transloco-loader.spec.ts :: HttpTranslocoLoader builds the URL from the lang string verbatim (no normalisation)` |
| `src/app/core/opportunities/opportunity.service.spec.ts` | 2 | `opportunity.service.spec.ts :: OpportunityApiService list() builds the pageable envelope with defaults` |
| `src/app/core/rate-limit/rate-limit-state.service.spec.ts` | 2 | `rate-limit-state.service.spec.ts :: RateLimitStateService re-notify resets the dismiss timer`, `rate-limit-state.service.spec.ts :: RateLimitStateService clear() dismisses immediately`, `rate-limit-state.service.spec.ts :: RateLimitStateService falls back to a default window when Retry-After is null` |
| `src/app/core/user/user.service.spec.ts` | 2 | `user.service.spec.ts :: UserApiService patch(id, dto) without stepUpToken passes options=undefined` |
| `e2e-tests/perf/process-map.unit.spec.ts` | 1 | `sandbox-director.service.spec.ts :: SandboxDirectorService a step done by hand advances the tour without touching the guide` |
| `src/app/core/address/address.service.spec.ts` | 1 | `address.service.spec.ts :: AddressApi passes dto by reference — no clone (caller mutation reaches BE)` |
| `src/app/core/admin/cascade-delete.service.spec.ts` | 1 | `cascade-delete.service.spec.ts :: CascadeDeleteApiService forceDeletePartnership() sends undefined reason when the admin gives none` |
| `src/app/core/auth/location-redirect.service.spec.ts` | 1 | `location-redirect.service.spec.ts :: LocationRedirectService preserves the exact URL string (no normalisation)` |
| `src/app/core/auth/sandbox-auth.service.spec.ts` | 1 | `sandbox-auth.service.spec.ts :: SandboxAuthService mints the persona session with credentials and then refreshes the session state` |
| `src/app/core/demo/demo-fixtures.account.spec.ts` | 1 | `demo-fixtures.account.spec.ts :: demo fixtures — account, addresses and preferences profile ignores a field that is not editable, and a non-string value for one that is` |
| `src/app/core/i18n/localized-date.pipe.spec.ts` | 1 | `localized-date.pipe.spec.ts :: LocalizedDatePipe prints English month names once the language flips (impure: no new input needed)` |
| `src/app/core/i18n/paginator-intl.spec.ts` | 1 | `paginator-intl.spec.ts :: TranslocoPaginatorIntl renders Polish labels and a Polish range on the Polish surface`, `number-format.spec.ts :: groupedNumber groups with a space for Polish (comma would read as a decimal separator)` |
| `src/app/core/interceptors/language.interceptor.spec.ts` | 1 | `language.interceptor.spec.ts :: languageInterceptor reflects locale changes between requests` |
| `src/app/core/legal/legal-api.service.spec.ts` | 1 | `legal-api.service.spec.ts :: LegalApiService forwards COOKIE_POLICY (no S — matches BE LegalDocumentType enum)` |
| `src/app/core/preferences/preferences.service.spec.ts` | 1 | `preferences.service.spec.ts :: PreferencesApiService patchMine() passes the dto by reference — no clone or normalisation` |
| `src/app/core/registry/registry.service.spec.ts` | 1 | `registry.service.spec.ts :: CompanyRegistryService passes the NIP verbatim — no trimming / normalisation` |
| `src/app/core/step-up/step-up.service.spec.ts` | 1 | `step-up.service.spec.ts :: StepUpService passes the code through verbatim (no trimming / normalisation)` |
| `src/app/core/upload/upload.service.spec.ts` | 1 | `upload.service.spec.ts :: UploadService completes the full chain on happy path and returns the UploadResult`, `upload.service.spec.ts :: UploadService rejects an unsupported MIME type with upload.errors.invalid_type` |
| `src/app/feature/survey/showcases/demo-export-zip.spec.ts` | 1 | `demo-export-zip.spec.ts :: demo-export-zip produces a well-formed STORED archive (signatures + EOCD entry count)` |

Not applied: 300 suspected candidates (3 the kill matrix never ran against a mutant, the rest outside its scope or sole killers). Look twice: 1 confirmed tests kill nothing the matrix models.

## Metrics

| | Before | After |
| --- | --- | --- |
| Tests in the tier | 1306 | 1172 (−10.3 %) |
| Tier seconds | 84.049 | 83.387 (−0.8 %) |
| Probes carried | 8574 | 8574 (0 lost) |
| Mutants killed | 1892 | 1892 (0 lost) |
| Dominator score | 0.0528 | 0.0528 (271 dominators) |

Individually redundant against the rest of the suite — each test on its own, not a count of what can go together: 89.5 % of tier time, 749 tests fully; 230 sole killers, 0 flaky. Removable together, which is what the cover decides: 134 tests, 0.7 s. Core chosen by mip (optimal; 37 columns × 37 rows after 620 forced and 649 dominated; gap 0 %).

## Slowest tests per unique unit

| Test | s | unique units | s per unit |
| --- | --- | --- | --- |
| `guide-spotlight.component.spec.ts :: GuideSpotlightComponent reports whether the control is on screen, so the panel can take over` | 1.469 | 0 | — |
| `landing.component.spec.ts :: LandingComponent renders three campaign example cards` | 1.255 | 0 | — |
| `engineering-chapter.component.spec.ts :: EngineeringChapterComponent renders all ten showcase cards behind their stable deep-link anchors, the estate first` | 1.206 | 0 | — |
| `guide-spotlight.component.spec.ts :: GuideSpotlightComponent waits for a control that has not been mounted yet instead of flashing a Next` | 1.197 | 0 | — |
| `guide-spotlight.component.spec.ts :: GuideSpotlightComponent says the pill has gone the moment it goes, grace or no grace` | 0.797 | 0 | — |
| `engineering-chapter.component.spec.ts :: EngineeringChapterComponent testing card renders both pyramids narrow→wide and the real twenty-step gate chain` | 0.797 | 0 | — |
| `solve.unit.spec.ts :: exact cover finds the minimum where greedy does not, and certifies it` | 0.732 | 0 | — |
| `operations-chapter.component.spec.ts :: OperationsChapterComponent renders all five showcase cards behind their stable deep-link anchors` | 0.627 | 0 | — |
| `graph-topology-showcase.component.spec.ts :: GraphTopologyShowcaseComponent the drawing lays every domain out with a span, in category order, and no two marks on top of each other` | 0.625 | 0 | — |
| `applied-opportunity-detail.component.spec.ts :: AppliedOpportunityDetailComponent loads application + status history on init and renders both` | 0.611 | 0 | — |
| `engineering-chapter.component.spec.ts :: EngineeringChapterComponent velocity card renders the three latency-ordered loops with growing bars` | 0.606 | 0 | — |
| `platform-chapter.component.spec.ts :: PlatformChapterComponent renders all five showcase cards behind their stable deep-link anchors` | 0.602 | 0 | — |
| `landing.component.spec.ts :: LandingComponent never nests <details> inside a <dl> (valid dl content model)` | 0.583 | 0 | — |
| `engineering-chapter.component.spec.ts :: EngineeringChapterComponent velocity card cites the research stats and cross-references the contract card` | 0.562 | 0 | — |
| `engineering-chapter.component.spec.ts :: EngineeringChapterComponent contract card encodes the producer chain, the three same-type consumers and the research stats` | 0.557 | 0 | — |
| `graph-topology-showcase.component.spec.ts :: GraphTopologyShowcaseComponent the generated graph is the CheckItOutSystem namespace: 1 master, 15 domains, 130 components, 22 typed relationships` | 0.554 | 0 | — |
| `interactive-dashboard-preview.component.spec.ts :: InteractiveDashboardPreviewComponent starts in the static overview with every step settled` | 0.542 | 0 | — |
| `guide-spotlight.component.spec.ts :: GuideSpotlightComponent rings the control and carries the tour’s next control on it` | 0.535 | 0 | — |
| `engineering-chapter.component.spec.ts :: EngineeringChapterComponent mounts the graph map with the real namespace behind it (1→15→130) and the 6-entity lens` | 0.507 | 0 | — |
| `plan-billing.component.spec.ts :: PlanBillingComponent marks the current plan and keeps only the real upgrade clickable` | 0.5 | 0 | — |
