#!/usr/bin/env node
/**
 * Lighthouse measurement harness (iter-107): HTTP/2 + gzip static server
 * over the production dist, matching what production nginx actually does
 * (h2 multiplexing + gzip). Measuring over `serve`/`http-server`
 * (HTTP/1.1, optionally uncompressed) inflates Lantern's simulation:
 * uncompressed HTML cost +2 s FCP, and the h1.1 six-connection limit
 * prices per-connection setup onto the font fan-out.
 *
 * Usage: node tools/lh-static-server.mjs [port] [distDir]
 * Then:  npx lighthouse https://localhost:<port> \
 *          --chrome-flags="--headless=new --ignore-certificate-errors"
 *
 * The self-signed cert is generated on the fly (requires openssl on PATH,
 * present in Git for Windows). SPA fallback: unknown paths serve
 * index.html — mirrors the nginx `try_files` cutover config.
 */
import { execFileSync } from 'node:child_process';
import { createSecureServer } from 'node:http2';
import { existsSync, mkdtempSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, isAbsolute, join, relative, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';

const port = Number(process.argv[2] ?? 4299);
const dist = process.argv[3] ?? join(import.meta.dirname, '..', 'dist', 'check-it-out-fe-greenfield', 'browser');
// Resolved once: every containment check below compares against this, not against a relative form
// that would depend on the process's working directory.
const root = resolve(dist);

const certDir = mkdtempSync(join(tmpdir(), 'lh-cert-'));
execFileSync('openssl', [
  'req', '-x509', '-newkey', 'rsa:2048', '-nodes',
  '-keyout', join(certDir, 'key.pem'), '-out', join(certDir, 'cert.pem'),
  '-days', '7', '-subj', '/CN=localhost',
], { stdio: 'ignore' });

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};
const COMPRESSIBLE = new Set(['.html', '.js', '.mjs', '.css', '.json', '.svg', '.txt']);

const server = createSecureServer({
  key: readFileSync(join(certDir, 'key.pem')),
  cert: readFileSync(join(certDir, 'cert.pem')),
  // ALPN fallback — curl health checks and older tooling speak h1.1;
  // Chrome/Lighthouse negotiate h2. h2-only refuses h1.1 at TLS setup.
  allowHTTP1: true,
});

// Compat API ('request') fires for BOTH h2 streams and ALPN-downgraded
// h1.1 requests; the raw 'stream' event only fires for h2.
server.on('request', (req, res) => {
  const reqPath = (req.url ?? '/').split('?')[0];
  const index = join(root, 'index.html');

  // Containment by `relative`, not by `startsWith`. A prefix test says a path is inside the root
  // when it merely begins with the root's characters, so a sibling directory named
  // `...-browser-something` passes it while being entirely outside (jssecurity:S8707). `relative`
  // answers the question actually being asked: a contained path never starts with `..` and is never
  // absolute. decodeURIComponent can also throw on a malformed escape, which would take the server
  // down rather than refuse one request.
  let file = index;
  try {
    const candidate = resolve(root, '.' + decodeURIComponent(reqPath));
    const rel = relative(root, candidate);
    if (rel !== '' && !rel.startsWith('..') && !isAbsolute(rel)) file = candidate;
  } catch {
    file = index;
  }
  if (!existsSync(file) || statSync(file).isDirectory()) file = index;

  const ext = extname(file).toLowerCase();
  let body = readFileSync(file);
  res.setHeader('content-type', MIME[ext] ?? 'application/octet-stream');
  // hashed bundles are immutable; html/i18n must revalidate
  res.setHeader(
    'cache-control',
    /-[A-Z0-9]{8}\./.test(file) ? 'public, max-age=31536000, immutable' : 'no-cache',
  );
  const accept = String(req.headers['accept-encoding'] ?? '');
  if (COMPRESSIBLE.has(ext) && accept.includes('gzip')) {
    body = gzipSync(body, { level: 9 });
    res.setHeader('content-encoding', 'gzip');
  }
  res.statusCode = 200;
  res.end(body);
});

server.listen(port, () => {
  console.log(`h2+gzip static server: https://localhost:${port} -> ${dist}`);
});
