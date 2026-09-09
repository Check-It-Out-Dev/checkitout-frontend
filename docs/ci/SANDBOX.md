# The public sandbox — the real stack on one VPS, two shared accounts, reset every night

_Design of record, 2026-09-09. Companion to `ARCHITECTURE.md` (the test substrate) and `METRICS.md` (the
published numbers). The files it describes live in `deploy/sandbox/` and `deploy/k8s/frontend/`; the
frontend and backend changes it asks for are slices S1–S4 in the plan and are for Opus to land._

## 1 · What it is, and the one honest line about it

`sandbox.checkitout.app` is the application as it runs, not a mock: the Spring Boot backend on its
credential-less `dev-lite` profile plus a `sandbox` guard, Postgres, Redis, the Angular build in front,
the same images the kind cluster tests. A visitor signs in as one of two shared personas, browses real
campaigns, applies to one, sees the application arrive on the company's side, opens Swagger and the
health endpoint next to it. The mock demo at checkitout.app stays exactly as it is: its guided tour is
deterministic and tuned, and a visitor who wants the story goes there; a visitor who wants to see it
work goes to the sandbox.

The honest line, printed on the sign-in page and in the footer: **Public sandbox. Two shared accounts,
anyone may be using them right now; everything resets at 03:00 UTC.**

## 2 · Shape

```
Cloudflare (proxy, TLS)
   │ sandbox.checkitout.app
   ▼
host nginx (existing, /etc/nginx/sites-enabled)  ──►  127.0.0.1:8090
                                                        │
        docker compose project `checkitout-sandbox` (deploy/sandbox/docker-compose.yml)
        ┌──────────────────────────────────────────────────────────────────────────────┐
        │ frontend   nginx + the production,sandbox build   /api → backend:8080         │
        │ backend    ghcr.io/…/checkitout-backend:<tag>     profiles dev-lite,sandbox   │
        │ postgres   17-alpine, volume pgdata (recreated nightly)                       │
        │ redis      7-alpine, 48 MB, no persistence                                    │
        │ alloy      logs of every container → Grafana Cloud Loki; /actuator/prometheus │
        │            → Grafana Cloud Metrics   (compose profile `logging`)              │
        └──────────────────────────────────────────────────────────────────────────────┘
                 ▲                                              ▲
   GitHub Actions deploy-sandbox.yml                 systemd timer 03:00 UTC
   ssh deploy@host  "deploy <fe> <be> <sha>"         rollout.sh reseed
   (the key can run rollout.sh and nothing else)
```

Memory on the 4 GB box: backend 1.5 GB (the image's `MaxRAMPercentage=70` gives it a 1 GB heap),
Postgres 256 MB, Redis 64 MB, frontend 64 MB, Alloy 160 MB: 2.1 GB, next to the static demo the host
already serves. It fits; the upgrade to 8 GB is what makes the blue-green rollout of §6 possible.

## 3 · Preparing the frontend (slice S2)

Already in the repository: `src/environments/environment.sandbox.ts` (`sandbox: true`), the `sandbox`
build configuration (`ng build --configuration production,sandbox`, `npm run build:sandbox`), and the
frontend image whose nginx takes `BACKEND_UPSTREAM` and `COOKIE_FLAGS` from the environment.

To land:

| Piece | Where | What |
| --- | --- | --- |
| Persona picker | `src/app/feature/auth/sign-in/` (a sibling component, rendered when `environment.sandbox`) | Two large buttons, "Sign in as the company" and "Sign in as the influencer", each with the persona's name and two lines of what that side can do; the honest line from §1 under them; no Firebase form, no sign-up or password links (those routes redirect to sign-in in the sandbox) |
| Sign-in call | `src/app/core/auth/sandbox-auth.service.ts` | `POST /api/test/auth/mock-session` with `{ email, role }` of the chosen persona; on 200 call `SessionStateService.probe()` (the cookies are HttpOnly, `/users/me` is the source of truth) and navigate to the role's home. On 403 show "This sandbox admits its two personas only." |
| Personas | `src/app/core/auth/sandbox-personas.ts` | `company@checkitout.app` / COMPANY and `test.influencer@test.com` / INFLUENCER: the accounts the dev-lite seed creates with data (campaigns, applications, a social connection with 15,000 followers, qualifying for 23 of the 49 active campaigns), so the picker never mints anything; the backend activates the persona at sign-in (§4) |
| Footer line | the app footer, when `environment.sandbox` | "Public sandbox · resets 03:00 UTC" with a link to this document on GitHub |
| i18n | `src/assets/i18n/{en,pl}.json` | every string above, gated by `check:i18n-parity` |
| Tests | Jest for the service (200 → probe + navigate; 403 → message), sandbox tier for the picker (fixture per `check:visual-fixture-coverage`), a visual baseline for the sign-in page in sandbox mode | |

Payments stay disabled on dev-lite (the boot guard), so the plan page's checkout shows the "payments
unavailable" state the app already has; nothing else in the UI needs a sandbox branch.

## 4 · Preparing the backend (slice S1)

`dev-lite` was made for a laptop: its `TestAuthController` (`@Profile("(e2e | dev-lite) & !prod & !test")`)
mints a session for any e-mail and any role, admin included, and `ensure-user` creates accounts on
request. Public means a guard, as a profile on top of dev-lite so nothing in dev-lite itself changes:

`application-sandbox.yml`

```yaml
checkitout:
  sandbox:
    enabled: true
    personas:
      - { email: company@checkitout.app,     role: COMPANY }
      - { email: test.influencer@test.com,   role: INFLUENCER }
management:
  endpoints:
    web:
      exposure:
        include: health,info,prometheus        # env, beans, heapdump, threaddump: never on a public host
logging:
  structured:
    format:
      console: ecs                              # JSON lines for Loki; MDC (correlationId) becomes fields
file-upload:
  local-sink:
    dir: /data/uploads
spring:
  servlet:
    multipart:
      max-file-size: 10MB
      max-request-size: 12MB
```

Code, all inside `auth/controller` and `config`:

- `SandboxProperties` (`@ConfigurationProperties("checkitout.sandbox")`): `enabled`, `personas`.
- In `TestAuthController.createMockSession`: when the sandbox is enabled and `(email, role)` is not a
  persona → 403 with message key `error.auth.sandbox_persona_only`; `partial` (the admin two-factor
  path) and `firebaseUid` are ignored. A persona sign-in also normalises the account to `ACTIVE`: the
  seed creates every influencer as `IN_VALIDATION` (awaiting the admin's check), and an influencer in
  that state cannot apply (`AppliedOpportunityService.saveAsDto` requires an active account, a social
  connection and the influencer role). Found on 2026-09-09 on a fresh reseed; in the kind cluster the
  browser tiers had activated the account before k6 ran, which is ordering, not a guarantee.
  `ensure-user` and `set-account-status` → 404 when the sandbox is enabled. `clear-session` stays (it
  is sign-out). `TestLegalController` gets the same `enabled` check on its mutating endpoints.
- Rate limits unchanged: 60 a minute per user on the standard profile, 120 on the paged campaign list,
  50 a minute per IP on auth, 20 an hour on apply. They are the load ceiling of the sandbox by design.
- The actuator: the compose nginx already answers 404 for everything under `/api/actuator/` except
  `health`; the exposure list above is the second wall, and the main security chain's ADMIN rule on
  `/actuator/**` the third (verified: `env` and `beans` answer 401 even from inside the network). Alloy
  scrapes `prometheus` on the internal network through `SandboxActuatorSecurity`, a sandbox-only filter
  chain that permits that one path; the backend port is never published. One trap, found on 2026-09-09:
  the image's `JAVA_OPTS` carries `-Dmanagement.endpoints.web.exposure.include=health,info,metrics`, a JVM
  system property that beats every profile file, so the yml above alone exposes nothing new; the compose
  file repeats the property after it on the command line (the last `-D` wins) and the image stays as it is.
- Structured logs: `logback-spring.xml` gains a `<springProfile name="sandbox">` whose console appender
  uses Spring Boot's `StructuredLogEncoder` with `format=ecs` (Spring Boot 3.4), so the property above
  takes effect under the custom logback file too.
- Uploads: the sink is a bind mount of a 2 GB ext4 image file (§7), so a visitor who uploads until the
  disk is full fills 2 GB and gets a 500 on the next upload; the host and the database are untouched,
  and the nightly reseed empties it.
- Tests: `SandboxPersonaPolicyTest` (the allow-list: persona admitted, case and whitespace forgiven;
  unknown e-mail, wrong role, admin, nulls refused with 403) and `SandboxGuardFilterTest` (the two doors
  pass, eight closed helpers answer 404 as JSON, the context path is stripped). The end-to-end proof is
  `SANDBOX_GUARD=1 smoke.sh` against the compose stack, green on 2026-09-09.

Landed on 2026-09-09 (backend `greenfield`): `auth/sandbox/` (`SandboxProperties`, `SandboxConfig`,
`SandboxPersonaPolicy`, `SandboxGuardFilter`, `SandboxActuatorSecurity`), the persona check and activation
in `TestAuthController.createMockSession`, `application-sandbox.yml`, the `sandbox` block in
`logback-spring.xml`, the message key in both languages, the two unit tests. The Docker image is
unchanged; the profile is chosen by `SPRING_PROFILES_ACTIVE=dev-lite,sandbox`.

## 5 · Logging and metrics

Two audiences. The owner reads `rollout.sh logs 200 backend` on the host and the deploy job's log on
GitHub. Everyone else reads Grafana Cloud: Alloy (`deploy/sandbox/alloy/config.alloy`) tails every
container's stdout through the Docker socket, parses the backend's ECS JSON (`log.level`, `log.logger`,
`correlationId`) and the frontend's JSON access log (`status`, `path`, `ms`, `correlationId`), labels them
`service`, `container`, `env=sandbox`, `level`, and pushes to Loki; it scrapes `/api/actuator/prometheus`
every 30 s and remote-writes to Grafana Cloud Metrics, where the k6 series from `ARCHITECTURE.md` already
land. One public dashboard, "checkitout sandbox"
(<https://checkitoutapp.grafana.net/public-dashboards/f48c40b8b3244bdfa019117fa9fdcbbe>, no login), shows
requests per minute and error rate from nginx,
p95 by endpoint from the backend's `http_server_requests`, JVM memory against the 1.5 GB limit, the
Liquibase reseed marker at 03:00, and a logs panel filtered `level=ERROR`. The correlation id ties one
nginx line to one backend line to one user report.

Endpoints and tokens live only in the host's `.env` (`LOKI_*`, `PROM_*`); Alloy starts only when the
`logging` compose profile is requested, which `rollout.sh` does automatically when `LOKI_URL` is set.
Nothing about logging is in GitHub secrets.

## 6 · Rollout with grace

`deploy/sandbox/rollout.sh` runs on the host as user `deploy`, bound to the deploy key by a forced
command, so the runner can say `deploy <fe-tag> <be-tag> <sha>`, `rollback`, `status`, `logs` and nothing
else; every argument is validated against a pattern before it touches Docker.

`deploy`:

1. fetches the bundle (`docker-compose.yml`, `alloy/config.alloy`) from the public repository at the
   given sha, validates it with `docker compose config`, and swaps it into `bundle/` (the previous one is
   kept as `bundle.old`);
2. writes the new `FE_TAG` / `BE_TAG` into `.env`, keeping the previous file as `.env.previous`;
3. `docker compose pull`, then `up -d --remove-orphans --wait --wait-timeout 300`: compose recreates only
   the services whose image changed and waits for their health checks (the backend's is the readiness
   group, up to 5 minutes);
4. polls `/api/actuator/health` and `/healthz` through the compose nginx;
5. on any failure restores `.env.previous` and `bundle.old` and brings the previous tags back up.

The deploy job then smokes the public URL (`deploy/sandbox/smoke.sh`: shell, health, no actuator beyond
health, OpenAPI published, persona sign-in, `/users/me`, campaigns, an unknown persona refused,
`ensure-user` closed) and runs the k6 `sandbox` profile (the persona only, one virtual user, 45 s). If
either fails the job calls `rollback` and goes red with the reason in its log.

What "grace" means on the 4 GB box: the frontend is recreated in under a second and the backend in the
20–30 s its readiness takes, during which the static shell keeps serving and `/api` answers 502 from the
compose nginx, which the app shows as its own error state. On an 8 GB box the same script runs
blue-green: two compose projects (`sandbox-blue`, `sandbox-green`) sharing the data project, the host
nginx upstream switched by rewriting one `include` and reloading after the new colour is healthy, the
old colour stopped afterwards; rollback is the reverse switch. That is the second version of
`rollout.sh`, not the first.

`reseed` (the systemd timer, 03:00 UTC): stop the backend, remove the Postgres container and its volume,
empty the uploads, start again; Liquibase recreates the schema and the seed in about 40 s.

## 7 · The host, once (owner, or Opus on the owner's word)

```bash
# Docker
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker ubuntu
# the deploy user and the tree
sudo useradd -r -m -s /bin/bash -G docker deploy
sudo install -d -o deploy -g deploy -m 750 /opt/checkitout-sandbox /opt/checkitout-sandbox/uploads
sudo install -o deploy -g deploy -m 750 rollout.sh /opt/checkitout-sandbox/rollout.sh
sudo install -o deploy -g deploy -m 600 .env /opt/checkitout-sandbox/.env        # from .env.example, with a real POSTGRES_PASSWORD
# a 2 GB cap on uploads
sudo fallocate -l 2G /opt/checkitout-sandbox/uploads.img && sudo mkfs.ext4 -q /opt/checkitout-sandbox/uploads.img
echo '/opt/checkitout-sandbox/uploads.img /opt/checkitout-sandbox/uploads ext4 loop,nosuid,nodev 0 0' | sudo tee -a /etc/fstab && sudo mount -a && sudo chown 1002:1005 /opt/checkitout-sandbox/uploads && sudo chmod 775 /opt/checkitout-sandbox/uploads
# 1002:1005 is the backend image's container user (Dockerfile CONTAINER_USER_ID/GROUP_ID): the sink must be writable by it.
# the deploy key: one line in /home/deploy/.ssh/authorized_keys
command="/opt/checkitout-sandbox/rollout.sh",no-port-forwarding,no-agent-forwarding,no-pty,no-X11-forwarding ssh-ed25519 AAAA… github-deploy-sandbox
# the nightly reseed
printf '[Unit]\nDescription=checkitout sandbox reseed\n[Service]\nType=oneshot\nUser=deploy\nExecStart=/opt/checkitout-sandbox/rollout.sh reseed\n' | sudo tee /etc/systemd/system/checkitout-sandbox-reseed.service
printf '[Unit]\nDescription=nightly\n[Timer]\nOnCalendar=*-*-* 03:00:00 UTC\nPersistent=true\n[Install]\nWantedBy=timers.target\n' | sudo tee /etc/systemd/system/checkitout-sandbox-reseed.timer
sudo systemctl enable --now checkitout-sandbox-reseed.timer
# the public name
sudo install -m 644 host/sandbox.checkitout.app.conf /etc/nginx/sites-available/ && sudo ln -s ../sites-available/sandbox.checkitout.app.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
# first rollout by hand, then the workflow takes over
sudo -u deploy /opt/checkitout-sandbox/rollout.sh deploy sandbox main main
```

Owner-side, and only the owner: the `sandbox` GitHub environment with the owner as required reviewer and
its three secrets (`SANDBOX_SSH_KEY`, the private half of the key above; `SANDBOX_HOST`;
`SANDBOX_KNOWN_HOSTS` from `ssh-keyscan`); the DNS record and the origin certificate in Cloudflare;
the public visibility of both ghcr.io packages; the Grafana Cloud tokens in the host `.env`.

## 8 · Testing the sandbox, and what is deliberately not tested against it

| When | What | Where it runs |
| --- | --- | --- |
| Every rollout | `smoke.sh` (nine checks) and the k6 `sandbox` profile with thresholds | the deploy job, from the outside |
| Daily 04:30 UTC | `contract-check.yml`: the OpenAPI document from a booted backend → codegen → compile | a runner, not the sandbox |
| Nightly | the browser tiers against a fresh dev-lite stack **in the job**, the e2e Cucumber suite, the kind run weekly | runners and kind |
| On demand | `rollout.sh status`, `logs`, the Grafana dashboard | the host |

The browser tiers do not run against the sandbox, on purpose: they mint hundreds of throw-away accounts,
which is exactly what the guard forbids, and a public host is the wrong place to measure anything. The
sandbox is verified as a deployment (it is up, it is the right build, a persona can do the journey, the
guard holds), and the code is verified where the code is verified.

## 9 · Residual risks, stated

- Two visitors share an account and see each other's changes for up to a day. Stated on the page.
- A visitor can write anything into a campaign title for up to a day. The reseed is the answer; if it
  ever is not, the reseed timer moves to every six hours, one line in the unit file.
- The mock-session endpoint is public by design and issues sessions for two accounts without a
  password. Those accounts own nothing outside the sandbox; the guard's tests are the proof it issues
  nothing else.
- Uploads are capped at 2 GB and reset nightly; the rate limits cap request volume; Cloudflare in front
  absorbs the rest.
- The first deploy has no rollback target: `rollback` restores the previous tags, and on a fresh host
  those are the same images with the same environment, so it fails the same way and says "the stack needs
  a human". The first run on gvps (2026-09-09 18:23) did exactly that: dev-lite's `LocalDatabaseInitializer`
  opens a superuser connection from its own `postgres.superuser.*` properties (default `postgres`/`admin`),
  the host's `.env` had a real password, and the backend crash-looped on "password authentication failed
  for user postgres" while the rehearsal on the dev box, with `admin` on both sides, had never shown it.
  The compose file now hands `POSTGRES_PASSWORD` to `POSTGRES_SUPERUSER_PASSWORD` too; rehearse with a
  random password, not the default.
- Overall health is stricter than readiness, and a component nobody uses can hold it DOWN: the second
  deploy (18:30) came up healthy for Compose (readiness) and red for `rollout.sh` (overall), because the
  CI-built image's upload-system indicator probed a Google bucket dev-lite never uses, through synthetic
  offline credentials. Fixed in the backend (the indicator reports the local sink that serves uploads);
  the Kubernetes probes use the readiness and liveness groups, and `rollout.sh` keeps the strict gate.
- **Cloudflare stands between CI and the sandbox.** The zone runs Bot Fight Mode (`fight_mode: true`,
  `enable_js: true`), which answers a datacentre client with 403 no matter what the origin would say. Every
  check in `smoke.sh` failed that way from a GitHub runner on 2026-09-09 while the sandbox was healthy, and
  two guard checks — which assert a 4xx — printed `ok` on the edge's 403, so the workflow rolled a good
  release back believing it had verified something. The zone is on the free plan, where Bot Fight Mode has
  no skip rule, and turning it off for the estate to please a robot is the wrong trade. CI therefore pins
  the hostname to the origin address (`SMOKE_RESOLVE`, `K6_ORIGIN_IP`, from the `SANDBOX_ORIGIN_IP` secret):
  the public name, the public certificate, the host nginx and the application all stay under test, and only
  the edge is skipped — then the public name is probed once more and reported, never asserted.
- **A check that asserts only a status code can be answered by anything.** The guard checks now require the
  application's own body (`"path":"/api/test/auth/mock-session"`), and the actuator check requires that the
  response is not Prometheus exposition. This is the lesson the 403 taught, and it is general.
- The uploads mount must belong to the container user (1002:1005), not to `deploy`: the fourth deploy
  (19:12) stayed red because the upload sink was not writable inside the container, which the fixed health
  indicator now reports honestly, and which would have failed every upload silently before. Fixed on the
  host 19:22; the §7 recipe says so.
- A red deploy leaves the previous tags running (`rollback` is automatic); a red reseed leaves the
  backend stopped and needs a human, which the timer's failure shows in `systemctl status`.

## 10 · Done criteria

- `smoke.sh https://sandbox.checkitout.app` all green, including the two guard checks.
- The deploy job green from a `workflow_dispatch`, then from a push to main, with the rollback path
  exercised once on purpose (deploy a tag that does not exist, watch the previous one come back).
- The Grafana dashboard public, with a nightly reseed visible in it.
- The entry page's card and the README rows say the sandbox exists, with the honest line.
