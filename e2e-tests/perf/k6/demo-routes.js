// k6 — the demo's public routes under load, with thresholds that fail the run.
//
// What this proves: the SSR shell of every public page answers, keeps answering
// under a modest concurrent load, and answers fast enough — p95 of the request
// duration per route under a budget, error rate under 1 %. It is the first
// performance gate the estate has had that is not a lab measurement by hand;
// the same script is meant to run on Kubernetes through k6-operator as a
// TestRun, where the thresholds become the pass condition of a release.
//
//   npm run perf:k6                      # smoke against the dev server (1 VU, 30 s)
//   K6_PROFILE=load npm run perf:k6      # ramp to 10 VUs for a minute
//   BASE_URL=https://checkitout.app npm run perf:k6
//   K6_P95=1 npm run perf:k6             # plant a defect: an impossible budget must fail the run
//   K6_DNS=preferIPv4 npm run perf:k6    # a dev server bound to 127.0.0.1 only
//
// Budgets are in ms and deliberately loose for the dev server (`ng serve` is
// not the production build); the workflow overrides them for the live demo.
import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.1.0/index.js';

const BASE = (__ENV.BASE_URL || 'https://localhost:4201').replace(/\/$/, '');
const PROFILE = __ENV.K6_PROFILE || 'smoke';
const P95 = Number(__ENV.K6_P95 || 1500);
const OUT = __ENV.K6_OUT_DIR || 'e2e-tests/perf/k6/results';

/** The public surface a recruiter or a crawler lands on, prerendered or SSR-on-demand. */
export const ROUTES = [
  { name: 'home', path: '/' },
  { name: 'survey-hub', path: '/technical-survey' },
  { name: 'survey-engineering', path: '/technical-survey/engineering' },
  { name: 'survey-platform', path: '/technical-survey/platform' },
  { name: 'demo', path: '/demo' },
  { name: 'codemap', path: '/codemap' },
];

const PROFILES = {
  smoke: { vus: 1, duration: '30s' },
  load: {
    stages: [
      { duration: '15s', target: 5 },
      { duration: '45s', target: 10 },
      { duration: '15s', target: 0 },
    ],
  },
};

export const options = {
  insecureSkipTLSVerify: true,
  // `ng serve` on Node 24 binds `localhost` to ::1 first; k6's resolver would
  // otherwise dial 127.0.0.1 and be refused. Override with K6_DNS=preferIPv4.
  dns: { policy: __ENV.K6_DNS || 'preferIPv6', ttl: '5m', select: 'first' },
  ...PROFILES[PROFILE],
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: [`p(95)<${P95}`],
    ...Object.fromEntries(ROUTES.map((r) => [`http_req_duration{route:${r.name}}`, [`p(95)<${P95}`]])),
    checks: ['rate>0.99'],
  },
  summaryTrendStats: ['avg', 'med', 'p(95)', 'p(99)', 'max'],
};

export default function () {
  for (const r of ROUTES) {
    group(r.name, () => {
      const res = http.get(`${BASE}${r.path}`, {
        tags: { route: r.name },
        headers: { Accept: 'text/html' },
      });
      check(res, {
        'status 200': (x) => x.status === 200,
        'html shell': (x) => typeof x.body === 'string' && x.body.includes('<app-root'),
      });
    });
    sleep(0.5);
  }
}

/** One JSON summary per run, plus the usual console table. */
export function handleSummary(data) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return {
    stdout: textSummary(data, { indent: ' ', enableColors: true }),
    [`${OUT}/${PROFILE}-${stamp}.json`]: JSON.stringify(
      {
        base: BASE,
        profile: PROFILE,
        p95Budget: P95,
        thresholds: Object.fromEntries(
          Object.entries(data.metrics)
            .filter(([, m]) => m.thresholds)
            .map(([k, m]) => [k, Object.fromEntries(Object.entries(m.thresholds).map(([t, v]) => [t, v.ok]))]),
        ),
        durations: Object.fromEntries(
          Object.entries(data.metrics)
            .filter(([k]) => k.startsWith('http_req_duration'))
            .map(([k, m]) => [k, m.values]),
        ),
        failed: data.metrics.http_req_failed?.values,
        checks: data.metrics.checks?.values,
      },
      null,
      2,
    ),
  };
}
