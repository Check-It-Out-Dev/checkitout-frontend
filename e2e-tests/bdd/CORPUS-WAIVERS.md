# BDD corpus waivers

The FE BDD tier (`e2e-tests/bdd/`) re-proves the BE Cucumber corpus through
the FE-visible surface (layer L3 — see `docs/testing/LAYERED-TEST-ARCHITECTURE.md`).
`check:bdd-corpus` enforces completeness: **every** BE feature file under
`checkitout-backend/src/test/resources/features/**` must be either

- **ported** — an FE `.feature` cites it via a `# Source of truth: …` header, or
- **waived** — listed below with a one-line justification.

A waived feature is one whose behaviour is a pure server-side guarantee with
**no distinct FE surface to re-prove**: the FE only ever observes a generic
403 / redirect / degraded-to-anonymous outcome, which is already covered by
the auth flows, route guards, and the error interceptor. Porting them would
duplicate BE authorization assertions behind a mock-session with nothing
FE-specific to check.

If you give one of these a real FE surface (a dedicated forbidden page, a
geoip-block banner, a session-isolation UX), delete its waiver and port it.

## Waived

- `security-403-forbidden.feature` — BE authorization matrix returning 403 across protected endpoints (`@PreAuthorize`). The FE reaction is generic: the error interceptor + route guards handle 403 uniformly; no per-endpoint FE UI exists to assert.
- `security-company-forbidden.feature` — role-scoped endpoint-forbidden matrix for the COMPANY role. Server-enforced (`@PreAuthorize`); the FE only sees the generic 403 path above.
- `security-influencer-forbidden.feature` — same as above for the INFLUENCER role. Server-enforced; no FE-distinct surface.
- `security-unauthenticated-access.feature` — unauthenticated-access rejection matrix. The FE `authGuard` redirects anonymous users to `/auth/sign-in` (covered by the auth flows); the per-endpoint 401 matrix is a BE-filter guarantee.
- `security-advanced.feature` — advanced GDPR/authorization combination matrices. Server-enforced access control with no dedicated FE screen; outcomes collapse to the generic 403/redirect paths.
- `security-advanced-session.feature` — advanced session security (forged/expired/fingerprint-mismatch cookies). BE `JwtAuthenticationFilter` degrades these to anonymous on public endpoints or 401s them otherwise; the FE step-up (419) path that _does_ have a surface is exercised by the step-up flows. No further FE-distinct surface.
- `multiuser/multi-user-session-isolation.feature` — concurrent-user session isolation. A server-side guarantee of the cookie/session store; there is no FE surface that renders "isolation" — each session simply sees its own data (already asserted per-actor across the ported flows).
- `admin-geoip-analysis.feature` — login-velocity / impossible-travel geoip analysis. A BE security service; the FE only ever sees a normal login or a blocked login (covered by the auth flows). No geoip UI surface exists in the FE.
