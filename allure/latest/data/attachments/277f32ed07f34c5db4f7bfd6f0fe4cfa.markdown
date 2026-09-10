# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: ../.features-gen/e2e-tests/bdd/features/magic-link-happy-path.feature.spec.js >> Magic Link Happy Path >> Email verification succeeds with valid oobCode
- Location: .features-gen/e2e-tests/bdd/features/magic-link-happy-path.feature.spec.js:6:7

# Error details

```
Error: send-verification-email failed: HTTP 401 (attempt 1/3): {"timestamp":"2026-09-10T22:00:35.053","status":401,"error":"Unauthorized","message":"User not authenticated","path":"/api/auth/send-verification-email","requestId":"REQ-6c311f42","messageKey":"error.
```

# Test source

```ts
  15  |  * message body (the BE glue's regex), and the production Firebase-proxy
  16  |  * endpoints consume it. Firebase state is staged/restored via AuthFlowsApi's
  17  |  * /test hooks. The session is a mock-session bound to the REAL company
  18  |  * account's email — the magic-link machinery operates on the Firebase account
  19  |  * itself, so a real password login is not required to exercise it.
  20  |  *
  21  |  * The BE feature hardcodes the company UID; we take the email/password from
  22  |  * e2e-tests/.env (same account) and the UID from the BE corpus constant.
  23  |  */
  24  | 
  25  | /** Single source: _framework/actor.ts (also pins the mock-session seed). */
  26  | const COMPANY_FIREBASE_UID = REAL_COMPANY_FIREBASE_UID;
  27  | 
  28  | /** The BE glue's oobCode extractor (MagicLinkSteps.java) — plain and HTML-escaped separators. */
  29  | const OOB_CODE_RE = /(?:[?&]|&amp;)oobCode=([A-Za-z0-9_-]+)/;
  30  | 
  31  | /**
  32  |  * The /test/email endpoint returns the RAW MIME body, which is
  33  |  * quoted-printable encoded: `=` appears as `=3D` and long lines carry `=\r\n`
  34  |  * soft breaks that can split the oobCode mid-token. (The BE glue never sees
  35  |  * this — GreenMailUtil.getBody decodes QP before its regex runs.) Decode soft
  36  |  * breaks first, then the =XX escapes.
  37  |  */
  38  | function decodeQuotedPrintable(raw: string): string {
  39  |   return raw
  40  |     .replace(/=\r?\n/g, '')
  41  |     .replace(/=([0-9A-F]{2})/gi, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));
  42  | }
  43  | 
  44  | interface MagicLinkWorld {
  45  |   magicSession?: TestSession;
  46  |   magicEmail?: string;
  47  |   lastEmailBody?: string;
  48  |   oobCode?: string;
  49  |   lastResponse?: { status: number; headers: Record<string, string>; body?: string };
  50  |   /** The /test staging transport; see hooks() below for why it is not the session's. */
  51  |   hookCtx?: APIRequestContext;
  52  | }
  53  | 
  54  | function flows(world: MagicLinkWorld): AuthFlowsApi {
  55  |   if (!world.magicSession) throw new Error('magic-link session not opened — Background missing?');
  56  |   return new AuthFlowsApi(world.magicSession.api);
  57  | }
  58  | 
  59  | /**
  60  |  * The same API, on a request context that belongs to no session.
  61  |  *
  62  |  * The `/test` hooks below need no authentication, but driving them through the magic-link
  63  |  * session's own context leaves that context unable to authenticate afterwards: the scenario
  64  |  * staged emailVerified, then asked for a verification email, and the backend saw no principal at
  65  |  * all -- FirebaseUID=null, and no session-validation line for the request. The same shape cost the
  66  |  * notification tier two rounds before it was recognised.
  67  |  *
  68  |  * So the staging calls get their own transport, created once per scenario and disposed with it,
  69  |  * and the session's context is used only for the call under test.
  70  |  */
  71  | async function hooks(playwright: PlaywrightRequestFactory, world: MagicLinkWorld): Promise<AuthFlowsApi> {
  72  |   if (!world.hookCtx) {
  73  |     world.hookCtx = await playwright.request.newContext({
  74  |       baseURL: BE_URL,
  75  |       ignoreHTTPSErrors: true,
  76  |     });
  77  |   }
  78  |   return new AuthFlowsApi(new ApiHttp(world.hookCtx!));
  79  | }
  80  | 
  81  | /**
  82  |  * The GreenMail steps below are shared with the influencer-verification oracle
  83  |  * (a different Background opens a different session) — resolve whichever
  84  |  * authenticated session the running scenario opened.
  85  |  */
  86  | function emailSession(world: MagicLinkWorld & { influencerSession?: TestSession }): TestSession {
  87  |   const s = world.magicSession ?? world.influencerSession;
  88  |   if (!s) throw new Error('no session for GreenMail access — Background missing?');
  89  |   return s;
  90  | }
  91  | 
  92  | function record(
  93  |   world: MagicLinkWorld,
  94  |   r: { status: number; headers: Record<string, string>; body: string },
  95  | ): void {
  96  |   world.lastResponse = { status: r.status, headers: r.headers, body: r.body };
  97  | }
  98  | 
  99  | /**
  100 |  * Email-trigger endpoints are strictly rate-limited per user; a prior run's
  101 |  * sends can leave the window hot. Mirror the BE glue's postWithRateLimitRetry:
  102 |  * up to 3 attempts, 15s apart, on 429 only.
  103 |  */
  104 | export async function withRateLimitRetry(
  105 |   send: () => Promise<{ ok: boolean; status: number; body: string }>,
  106 |   label: string,
  107 | ): Promise<void> {
  108 |   for (let attempt = 1; attempt <= 3; attempt++) {
  109 |     const r = await send();
  110 |     if (r.ok) return;
  111 |     if (r.status === 429 && attempt < 3) {
  112 |       await new Promise((resolve) => setTimeout(resolve, 15_000));
  113 |       continue;
  114 |     }
> 115 |     throw new Error(
      |           ^ Error: send-verification-email failed: HTTP 401 (attempt 1/3): {"timestamp":"2026-09-10T22:00:35.053","status":401,"error":"Unauthorized","message":"User not authenticated","path":"/api/auth/send-verification-email","requestId":"REQ-6c311f42","messageKey":"error.
  116 |       `${label} failed: HTTP ${r.status} (attempt ${attempt}/3): ${r.body.slice(0, 200)}`,
  117 |     );
  118 |   }
  119 | }
  120 | 
  121 | Given(
  122 |   'the real company user is signed in for magic-link testing',
  123 |   async ({ playwright, world }) => {
  124 |     const email = process.env['FIREBASE_TEST_COMPANY_EMAIL']!;
  125 |     world.magicEmail = email;
  126 |     // mock-session on the REAL account email: the BE binds the session to the
  127 |     // user row whose Firebase account the magic links act on.
  128 |     world.magicSession = await TestSession.open(playwright, {
  129 |       id: 'company-real',
  130 |       email,
  131 |       role: 'COMPANY',
  132 |       // Fresh-DB safety: pin the row to the REAL uid so the uid-keyed
  133 |       // /test hooks (set-email-verified, cooldown) and real oobCode flows
  134 |       // resolve the same user the Firebase account belongs to.
  135 |       firebaseUid: COMPANY_FIREBASE_UID,
  136 |     });
  137 |   },
  138 | );
  139 | 
  140 | After(async ({ world }) => {
  141 |   await world.magicSession?.dispose();
  142 |   await world.hookCtx?.dispose();
  143 |   world.hookCtx = undefined;
  144 | });
  145 | 
  146 | Given(
  147 |   'the Firebase user has emailVerified set to {word}',
  148 |   async ({ playwright, world }, value: string) => {
  149 |     await (await hooks(playwright, world)).setEmailVerified(COMPANY_FIREBASE_UID, value === 'true');
  150 |   },
  151 | );
  152 | 
  153 | Given('the password reset cooldown is cleared', async ({ playwright, world }) => {
  154 |   await (await hooks(playwright, world)).clearPasswordResetCooldown(COMPANY_FIREBASE_UID);
  155 | });
  156 | 
  157 | Given('the GreenMail inbox is cleared', async ({ world }) => {
  158 |   await clearInbox(emailSession(world).raw);
  159 | });
  160 | 
  161 | // ── Email triggering ─────────────────────────────────────────────────────────
  162 | 
  163 | When('the user requests a verification email', async ({ world }) => {
  164 |   await withRateLimitRetry(
  165 |     () => flows(world).requestVerificationEmail(),
  166 |     'send-verification-email',
  167 |   );
  168 | });
  169 | 
  170 | When('the user requests a password reset email', async ({ world }) => {
  171 |   await withRateLimitRetry(() => flows(world).forgotPassword(world.magicEmail!), 'forgot-password');
  172 | });
  173 | 
  174 | // ── GreenMail interception ───────────────────────────────────────────────────
  175 | 
  176 | Then('a magic-link email arrives within 10 seconds', async ({ world }) => {
  177 |   const email = await waitForEmail(emailSession(world).raw, {
  178 |     ...(world.magicEmail ? { to: world.magicEmail } : {}),
  179 |     timeoutMs: 10_000,
  180 |   });
  181 |   world.lastEmailBody = email.body ?? '';
  182 |   expect(world.lastEmailBody.length, 'captured email must have a body').toBeGreaterThan(0);
  183 | });
  184 | 
  185 | Then('the oobCode is extracted from the email', async ({ world }) => {
  186 |   const decoded = decodeQuotedPrintable(world.lastEmailBody ?? '');
  187 |   const match = OOB_CODE_RE.exec(decoded);
  188 |   expect(match, 'email body must carry an oobCode link').not.toBeNull();
  189 |   world.oobCode = match![1];
  190 | });
  191 | 
  192 | // ── Consuming the code via the production endpoints ──────────────────────────
  193 | 
  194 | When('the extracted oobCode is applied via apply-action-code', async ({ world }) => {
  195 |   record(world, await flows(world).applyActionCode(world.oobCode!));
  196 | });
  197 | 
  198 | When('the extracted oobCode is checked via verify-reset-code', async ({ world }) => {
  199 |   record(world, await flows(world).verifyResetCode(world.oobCode!));
  200 | });
  201 | 
  202 | When(
  203 |   'the password is reset via confirm-password-reset to {string}',
  204 |   async ({ world }, newPassword: string) => {
  205 |     record(world, await flows(world).confirmPasswordReset(world.oobCode!, newPassword));
  206 |   },
  207 | );
  208 | 
  209 | Then('the user can log in with password {string}', async ({ world }, password: string) => {
  210 |   const r = await flows(world).login(world.magicEmail!, password);
  211 |   expect(r.status, `login with the new password (body: ${r.body.slice(0, 200)})`).toBe(200);
  212 | });
  213 | 
  214 | Then('the original password is restored', async ({ world }) => {
  215 |   await flows(world).setPassword(
```