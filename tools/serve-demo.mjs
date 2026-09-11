#!/usr/bin/env node
/**
 * Serves the built demo the way the VPS serves it.
 *
 * Until now "local" meant `ng serve --configuration demo`: an unminified dev
 * build, a dev-mode SSR renderer, and a compile step measured in tens of
 * seconds. Production is none of those — it is `npm run build:demo` output
 * sitting in a directory with nginx in front of it. Numbers taken against the
 * dev server were never comparable to the thing the owner looks at, and the
 * dev server also drags in a Node version requirement that has silently killed
 * a whole tier run (Angular 22's dev server calls `tls.getCACertificates`,
 * which Node 23 does not have; Playwright then aborts before a single test).
 *
 * This has no dependencies and no build step of its own. It reproduces the
 * four rules from `deployment/vps/check-it-out.pl.conf` that a browser can
 * actually tell apart:
 *
 *   • `try_files $uri /index.html` — unknown paths render the SPA shell.
 *   • `location = /index.html { expires -1 }` — the shell is never cached, so
 *     a deploy is visible immediately. (This one is load-bearing: a cached
 *     shell once served a stale build for a day.)
 *   • hashed assets get `public, immutable` for 30 days.
 *   • gzip for the text types, so transfer sizes are in the right ballpark.
 *
 * Plus the same four security headers, because they are what a page's
 * behaviour is actually subject to.
 *
 *   npm run serve:demo              → build if missing or stale, serve on 4300
 *   npm run serve:demo -- --build   → build regardless
 *   npm run serve:demo -- --port 5000 --no-build
 */
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, sep } from 'node:path';
import { createGzip } from 'node:zlib';
import { ROOT, SHELL, buildDemo, buildReason } from './demo-build.mjs';

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};

const PORT = Number(flag('port', 4300));

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.mp4': 'video/mp4',
};
const GZIP = new Set([
  'text/css; charset=utf-8',
  'text/javascript; charset=utf-8',
  'application/json; charset=utf-8',
  'image/svg+xml',
  'text/html; charset=utf-8',
]);

const log = (m) => console.log(`\x1b[36m[demo] ${m}\x1b[0m`);

if (args.includes('--no-build')) {
  if (!existsSync(SHELL)) {
    console.error(`[demo] no build at ${ROOT} — run \`npm run build:demo\` first`);
    process.exit(1);
  }
} else {
  // Missing or older than src/ — the rule lives in demo-build.mjs, shared with
  // the perf runner and the deploy, so all three agree on what "current" is.
  const reason = buildReason({ force: args.includes('--build') });
  if (reason) {
    log(`build:demo — ${reason} (about a minute)`);
    if (!buildDemo()) {
      console.error('[demo] build failed');
      process.exit(1);
    }
  }
}

// Everything this server is ever asked for is a file the Angular build emitted --
// `/main-A1B2C3D4.js`, `/assets/i18n/en.json` -- so a path segment is unreserved characters and
// nothing else. Declared next to the function that enforces it, and the same alphabet
// tools/lh-static-server.mjs uses.
const SAFE_SEGMENT = /^[A-Za-z0-9._~-]+$/;

/** Resolve a URL path to a file inside ROOT, or null if it escapes or is absent. */
function fileFor(urlPath) {
  // decodeURIComponent throws on a malformed escape -- a bare `%` is enough -- and this runs
  // inside the request handler, so an uncaught throw here does not refuse one request, it takes
  // the whole server down. That matters more than it sounds: this process serves the smoothness
  // tier, and a tier whose server died mid-run reports nothing rather than a regression.
  let clean;
  try {
    clean = decodeURIComponent(urlPath.split('?')[0].split('#')[0]);
  } catch {
    return null;
  }
  // First gate, an allow-list. A segment of that alphabet cannot be `..`, cannot hold a NUL or a
  // backslash, and cannot name a Windows device or an alternate data stream.
  const shapeIsSafe = clean
    .split('/')
    .every((seg) => seg === '' || (seg !== '..' && SAFE_SEGMENT.test(seg)));
  if (!shapeIsSafe) return null;
  // Second gate, containment. normalize() collapses `..`; refuse anything that still climbs out.
  const full = normalize(join(ROOT, clean));
  if (full !== ROOT && !full.startsWith(ROOT + sep)) return null;
  if (!existsSync(full)) return null;
  const stat = statSync(full);
  if (stat.isDirectory()) {
    const index = join(full, 'index.html');
    return existsSync(index) ? index : null;
  }
  return full;
}

const server = createServer((req, res) => {
  const target = fileFor(req.url ?? '/') ?? SHELL; // try_files $uri /index.html
  const type = TYPES[extname(target).toLowerCase()] ?? 'application/octet-stream';

  res.setHeader('Content-Type', type);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader(
    'Cache-Control',
    target === SHELL ? 'no-cache' : 'public, max-age=2592000, immutable',
  );

  const wantsGzip = /\bgzip\b/.test(req.headers['accept-encoding'] ?? '') && GZIP.has(type);
  if (wantsGzip) {
    res.setHeader('Content-Encoding', 'gzip');
    res.setHeader('Vary', 'Accept-Encoding');
  }

  if (req.method === 'HEAD') {
    res.writeHead(200).end();
    return;
  }

  res.writeHead(200);
  const body = createReadStream(target);
  body.on('error', () => res.destroy());
  if (wantsGzip) body.pipe(createGzip()).pipe(res);
  else body.pipe(res);
});

server.listen(PORT, () => {
  log(`serving ${ROOT}`);
  log(`http://localhost:${PORT}/  — built demo, production headers`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close();
    process.exit(0);
  });
}
