// k6 — API journeys against the real backend through the frontend's nginx (dev-lite profile).
//
// Two journeys, two scenarios, tagged so thresholds and dashboards tell them apart:
//   browse   a signed-in influencer reads the catalogue: campaigns paged → one campaign's detail.
//            One session per virtual user (minted once, kept in the VU's cookie jar), a unique account per
//            VU: the backend rate-limits authenticated calls per USER (60 a minute on the standard profile),
//            so virtual users sharing one account would only measure the limiter.
//   apply    the seeded influencer applies to campaigns it has not applied to yet and qualifies for (follower
//            band), one VU, a handful of iterations: applications are one-shot per user and campaign, the
//            endpoint allows 20 an hour per user, and only accounts with a social connection may apply (a fresh
//            mock-session account is refused with 403 by design), so this journey is a functional probe with
//            latency, not load. When no campaign is left the iteration counts as `apply_skipped`, not a failure.
//
// Every request goes through BASE_URL/api like a browser would, so nginx's proxy is on the path.
//
//   npm run perf:k6:api                        # smoke, 1 VU, against https://localhost:4201 (dev-lite)
//   K6_PROFILE=load npm run perf:k6:api        # ramp browse to 5 VUs
//   BASE_URL=http://frontend.checkitout.svc    # inside the cluster (deploy/k8s/tests/k6-testrun.yaml)
//   K6_DNS_POLICY=preferIPv4                   # a server bound to 127.0.0.1 only (K6_DNS itself is reserved by k6)
//   K6_P95_BROWSE=800 K6_P95_APPLY=1500        # per-journey p95 budgets in ms
//   K6_PROFILE=sandbox K6_PERSONA_ONLY=1       # the public sandbox: only the seeded persona may sign in, 1 VU, low rate
import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Counter } from 'k6/metrics';
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.1.0/index.js';

const BASE = (__ENV.BASE_URL || 'https://localhost:4201').replace(/\/$/, '');
const API = `${BASE}/api`;
const PROFILE = __ENV.K6_PROFILE || 'smoke';
const OUT = __ENV.K6_OUT_DIR || 'e2e-tests/perf/k6/results';
const P95_BROWSE = Number(__ENV.K6_P95_BROWSE || 800);
const P95_APPLY = Number(__ENV.K6_P95_APPLY || 1500);
const RUN = __ENV.K6_RUN_ID || new Date().toISOString().replace(/[:.]/g, '-');
const SEEDED_INFLUENCER = __ENV.K6_INFLUENCER || 'test.influencer@test.com';
// The public sandbox admits only its personas (docs/ci/SANDBOX.md), so browse signs in as the seeded
// influencer too and paces itself under that one account's 60-a-minute budget.
const PERSONA_ONLY = __ENV.K6_PERSONA_ONLY === '1';

const applySkipped = new Counter('apply_skipped');

const BROWSE = {
  smoke: { executor: 'constant-vus', vus: 1, duration: '30s' },
  sandbox: { executor: 'constant-vus', vus: 1, duration: '45s' },
  load: {
    executor: 'ramping-vus',
    startVUs: 0,
    stages: [{ duration: '15s', target: 3 }, { duration: '45s', target: 5 }, { duration: '15s', target: 0 }],
    gracefulRampDown: '5s',
  },
};

// K6_ORIGIN_IP pins the public hostname to the origin address, for the same reason smoke.sh takes
// SMOKE_RESOLVE: Cloudflare's Bot Fight Mode refuses a datacentre client, and this load is ours to
// measure against our own server, not against the edge's opinion of the caller.
// k6 runs on goja, which has no WHATWG URL: take the host out of the string by hand.
const ORIGIN_IP = __ENV.K6_ORIGIN_IP;
const BASE_HOST = BASE.replace(/^[a-z]+:\/\//, '').split('/')[0].split(':')[0];
const HOST_PIN = ORIGIN_IP ? { hosts: { [BASE_HOST]: ORIGIN_IP } } : {};

export const options = {
  insecureSkipTLSVerify: true,
  ...HOST_PIN,
  // k6 empties every VU's cookie jar at the start of each iteration by default; the session minted in
  // iteration 0 must survive, otherwise every later call is anonymous (401).
  noCookiesReset: true,
  dns: { policy: __ENV.K6_DNS_POLICY || 'preferIPv6', ttl: '5m', select: 'first' },
  scenarios: {
    browse: { ...BROWSE[PROFILE], exec: 'browse', tags: { journey: 'browse' } },
    apply: { executor: 'per-vu-iterations', vus: 1, iterations: PROFILE === 'load' ? 5 : PROFILE === 'sandbox' ? 1 : 2, maxDuration: '2m', exec: 'apply', tags: { journey: 'apply' } },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    checks: ['rate>0.99'],
    'http_req_duration{journey:browse}': [`p(95)<${P95_BROWSE}`],
    'http_req_duration{journey:apply}': [`p(95)<${P95_APPLY}`],
    'http_req_duration{endpoint:mock-session}': [`p(95)<${P95_BROWSE}`],
    'http_req_duration{endpoint:apply}': [`p(95)<${P95_APPLY}`],
  },
  summaryTrendStats: ['avg', 'med', 'p(95)', 'p(99)', 'max'],
};

const JSON_HEADERS = { 'Content-Type': 'application/json' };

function signIn(email, role, journey) {
  const res = http.post(`${API}/test/auth/mock-session`, JSON.stringify({ email, role }), {
    headers: JSON_HEADERS,
    tags: { journey, endpoint: 'mock-session' },
  });
  check(res, { 'mock-session 200': (r) => r.status === 200, 'session cookie set': (r) => !!r.cookies['session'] });
  return res.status === 200;
}

function activeCampaigns(journey, size) {
  const res = http.get(`${API}/partnership-opportunity/paged?page=0&size=${size}&active=true`, {
    tags: { journey, endpoint: 'campaigns-paged' },
  });
  if (res.status !== 200) console.warn(`campaigns paged -> ${res.status} ${String(res.body).slice(0, 160)}`);
  const ok = check(res, {
    'campaigns paged 200': (r) => r.status === 200,
    'campaigns present': (r) => r.status === 200 && Array.isArray(r.json('content')) && r.json('content').length > 0,
  });
  return ok ? res.json('content') : [];
}

function campaignDetail(id, journey) {
  const res = http.get(`${API}/partnership-opportunity/${id}`, { tags: { journey, endpoint: 'campaign-detail' } });
  check(res, { 'campaign detail 200': (r) => r.status === 200 });
}

let browseSignedIn = false;

export function browse() {
  const journey = 'browse';
  group('influencer browses the catalogue', () => {
    if (!browseSignedIn) {
      browseSignedIn = signIn(PERSONA_ONLY ? SEEDED_INFLUENCER : `perf.browse.${RUN}.vu${__VU}@checkitout.app`, 'INFLUENCER', journey);
      if (!browseSignedIn) return;
    }
    const list = activeCampaigns(journey, 10);
    if (list.length) campaignDetail(list[Math.floor(Math.random() * list.length)].id, journey);
  });
  // Two requests per iteration; the per-user budget is 60 a minute, so an iteration takes ≥ 2.5 s
  // (3 s when the apply journey shares the same persona account).
  sleep(PERSONA_ONLY ? 3 : 2.5);
}

let applySignedIn = false;
let followers = 0;

// The backend validates an application against the campaign's follower band, so the journey picks only
// campaigns the influencer qualifies for (a band of 0 means "no requirement").
function me(journey) {
  const res = http.get(`${API}/users/me`, { tags: { journey, endpoint: 'me' } });
  check(res, { 'me 200': (r) => r.status === 200 });
  const connections = res.status === 200 ? res.json('socialConnections') || [] : [];
  const status = res.status === 200 ? res.json('accountStatus.value') : null;
  return { followers: connections.reduce((sum, c) => sum + (c.followersCount || 0), 0), active: status === 'ACTIVE' };
}

// The seed creates every influencer as IN_VALIDATION (awaiting the admin's check), and only an ACTIVE
// account may apply. dev-lite's test controller can flip it; the sandbox guard does the same at persona
// sign-in, so there the account is already active and this call never happens.
function activate(email, journey) {
  const res = http.post(`${API}/test/auth/set-account-status`, JSON.stringify({ email, status: 'ACTIVE' }), {
    headers: JSON_HEADERS,
    tags: { journey, endpoint: 'set-account-status' },
  });
  check(res, { 'account activated': (r) => r.status === 200 });
  return res.status === 200;
}

function qualifies(campaign, followerCount) {
  return (!campaign.followersMin || campaign.followersMin <= followerCount) && (!campaign.followersMax || campaign.followersMax >= followerCount);
}

export function apply() {
  const journey = 'apply';
  group('seeded influencer applies to a campaign', () => {
    if (!applySignedIn) {
      applySignedIn = signIn(SEEDED_INFLUENCER, 'INFLUENCER', journey);
      if (!applySignedIn) return;
      let who = me(journey);
      if (!who.active && activate(SEEDED_INFLUENCER, journey)) who = me(journey);
      followers = who.followers;
    }
    const mine = http.get(`${API}/applied-opportunity/paged?page=0&size=100`, { tags: { journey, endpoint: 'applied-paged' } });
    check(mine, { 'applied list 200': (r) => r.status === 200 });
    const already = new Set((mine.status === 200 ? mine.json('content') || [] : []).map((a) => a.partnershipOpportunity && (a.partnershipOpportunity.id || a.partnershipOpportunity)));
    const candidates = activeCampaigns(journey, 50).filter((c) => !already.has(c.id) && qualifies(c, followers));
    if (!candidates.length) {
      applySkipped.add(1);
      return;
    }
    const target = candidates[Math.floor(Math.random() * candidates.length)];
    campaignDetail(target.id, journey);
    const res = http.post(
      `${API}/applied-opportunity`,
      JSON.stringify({ partnershipOpportunity: target.id, note: `k6 ${RUN} iteration ${__ITER}` }),
      { headers: JSON_HEADERS, tags: { journey, endpoint: 'apply' } },
    );
    check(res, { 'apply 200': (r) => r.status === 200, 'application has an id': (r) => r.status === 200 && !!r.json('id') });
    if (res.status !== 200) console.warn(`apply to campaign ${target.id} -> ${res.status} ${String(res.body).slice(0, 200)}`);
  });
  sleep(1);
}

function rows(data) {
  const out = [];
  for (const [name, m] of Object.entries(data.metrics)) {
    const tag = /^http_req_duration\{(.+)\}$/.exec(name);
    if (!tag || !m.values) continue;
    out.push({ scope: tag[1], p95: m.values['p(95)'], p99: m.values['p(99)'], max: m.values.max, ok: Object.values(m.thresholds || {}).every((t) => t.ok) });
  }
  return out.sort((a, b) => a.scope.localeCompare(b.scope));
}

function html(data) {
  const reqs = data.metrics.http_reqs ? data.metrics.http_reqs.values.count : 0;
  const failed = data.metrics.http_req_failed ? data.metrics.http_req_failed.values.rate : 0;
  const checks = data.metrics.checks ? data.metrics.checks.values.rate : 0;
  const skipped = data.metrics.apply_skipped ? data.metrics.apply_skipped.values.count : 0;
  const allOk = Object.values(data.metrics).every((m) => !m.thresholds || Object.values(m.thresholds).every((t) => t.ok));
  const tr = rows(data)
    .map((r) => `<tr class="${r.ok ? 'ok' : 'bad'}"><td>${r.scope}</td><td>${r.p95.toFixed(1)}</td><td>${r.p99.toFixed(1)}</td><td>${r.max.toFixed(1)}</td><td>${r.ok ? 'within budget' : 'over budget'}</td></tr>`)
    .join('');
  return `<!doctype html><meta charset="utf-8"><title>k6 API journeys — ${PROFILE} — ${RUN}</title>
<style>body{font:14px/1.5 system-ui,sans-serif;margin:32px auto;max-width:880px;color:#1f2937}h1{font-size:20px}
table{border-collapse:collapse;width:100%}th,td{text-align:left;padding:6px 10px;border-bottom:1px solid #e5e7eb}
td:nth-child(n+2){font-variant-numeric:tabular-nums}.ok td:last-child{color:#15803d}.bad td:last-child{color:#b91c1c}
.kpi{display:flex;gap:24px;margin:16px 0}.kpi div{padding:10px 14px;border:1px solid #e5e7eb;border-radius:8px}
.kpi b{display:block;font-size:20px}</style>
<h1>k6 API journeys · ${PROFILE} profile · ${allOk ? 'thresholds green' : 'thresholds RED'}</h1>
<p>${BASE} · run ${RUN}${skipped ? ` · ${skipped} apply iteration(s) skipped: no campaign left for the seeded influencer` : ''}</p>
<div class="kpi"><div><b>${reqs}</b>requests</div><div><b>${(failed * 100).toFixed(2)} %</b>failed</div><div><b>${(checks * 100).toFixed(2)} %</b>checks passed</div></div>
<table><thead><tr><th>scope</th><th>p95 ms</th><th>p99 ms</th><th>max ms</th><th>budget</th></tr></thead><tbody>${tr}</tbody></table>`;
}

export function handleSummary(data) {
  const base = `${OUT}/api-${PROFILE}-${RUN}-${__ENV.HOSTNAME || 'local'}`;
  return {
    stdout: textSummary(data, { indent: ' ', enableColors: false }),
    [`${base}.json`]: JSON.stringify(data, null, 2),
    [`${base}.html`]: html(data),
  };
}
