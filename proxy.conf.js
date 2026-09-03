/**
 * Dev-server proxy. Forwards `/api/*` from the greenfield FE on :4201
 * to the BE on https://localhost:8080 (self-signed cert).
 *
 * Cookie rewrites are essential for session continuity:
 *   - Domain  : BE issues with its host → rewrite to `localhost` so the
 *               browser actually stores the cookie under our origin.
 *   - SameSite: BE issues `SameSite=None` for cross-site flows; on plain
 *               localhost dev (no HTTPS termination on FE) the browser
 *               rejects None+!Secure cookies, so rewrite to `Lax`.
 *   - Path    : BE-prefixed `/api` paths flatten to `/` so the cookie is
 *               sent on every FE-side request.
 *
 * Source pattern: ported from the legacy frontend's proxy.conf.js minus the
 * verbose debug logging.
 */
// BE_PROXY_TARGET lets a caller point the dev-server at a backend on another
// port — the dev-lite wizard moves it when 8080 is taken.
const TARGET = process.env.BE_PROXY_TARGET || 'https://localhost:8080';

const PROXY_CONFIG = {
  '/api': {
    target: TARGET,
    secure: false, // BE has a self-signed dev cert
    changeOrigin: true,
    logLevel: 'warn',
    cookieDomainRewrite: 'localhost',
    cookiePathRewrite: { '/api': '/' },
    onProxyRes: (proxyRes) => {
      const setCookies = proxyRes.headers['set-cookie'];
      if (!setCookies) return;
      proxyRes.headers['set-cookie'] = setCookies.map((cookie) =>
        cookie
          .replace(/Domain=[^;]+;?\s*/gi, 'Domain=localhost; ')
          // localhost dev is HTTP, so `None` cookies would be silently dropped.
          .replace(/SameSite=None/gi, 'SameSite=Lax'),
      );
    },
  },
};

module.exports = PROXY_CONFIG;
