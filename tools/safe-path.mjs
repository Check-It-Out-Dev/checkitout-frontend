/**
 * The one rule both static servers in this directory follow: a URL path may only ever name a file
 * inside the directory being served.
 *
 * This existed twice - in `serve-demo.mjs` and in `lh-static-server.mjs` - with the same regex, the
 * same comment about `decodeURIComponent` throwing, and two slightly different containment checks.
 * Two implementations of a security control is one more than can be reviewed, and the servers are
 * not toys: serve-demo serves the demo build the smoothness tier measures, and lh-static-server
 * serves the pages Lighthouse scores. Both run on a developer's machine and on a runner, both bind
 * a port, and neither has any business answering a request for `../../.env`.
 *
 * Three gates, in this order, and each one catches something the next cannot:
 *
 *   1. Decoding, in a try. `decodeURIComponent` throws a URIError on a malformed escape - a bare
 *      `%` is enough - and these run inside a request handler, where an uncaught throw does not
 *      refuse one request, it takes the process down. That is not hypothetical: a single `/%`
 *      killed the demo server, and a tier whose server died mid-run reports nothing at all rather
 *      than reporting a regression.
 *   2. An allow-list per segment. Everything these servers are ever asked for is a file some build
 *      emitted - `/main-A1B2C3D4.js`, `/assets/i18n/en.json` - so a segment is unreserved
 *      characters and nothing else. A segment of that alphabet cannot be `..`, cannot hold a NUL or
 *      a backslash, and cannot name a Windows device (`CON`, `NUL`) or an alternate data stream
 *      (`file.txt:hidden`). Refusing by shape is stronger than removing by pattern, because there
 *      is no encoding of `..` left to think about once `.` and `/` are the only punctuation.
 *   3. Containment, expressed with `relative` rather than a prefix test. `startsWith(root)` is the
 *      classic bug - a sibling directory named `dist-browser-evil` begins with the characters of
 *      `dist-browser` while being entirely outside it. `relative(root, candidate)` answers the
 *      question directly: a path inside root has a relative form that neither starts with `..` nor
 *      is absolute. This is lh-static-server's version of the check, which was the better of the
 *      two this file replaces.
 *
 * It answers one question and does no filesystem work: whether a path is inside the root. What to
 * do when the file is missing, or is a directory, is each server's own policy and stays there.
 */
import { isAbsolute, join, normalize, relative } from 'node:path';

/** A path segment: unreserved characters only (RFC 3986 §2.3), which excludes `..` by construction. */
export const SAFE_SEGMENT = /^[A-Za-z0-9._~-]+$/;

/**
 * Resolve a URL path against a root directory.
 *
 * @param {string} root absolute path of the directory being served
 * @param {string} urlPath the raw request path, query and fragment included
 * @returns {string | null} the absolute path inside root, or null if it decodes badly, contains a
 *   segment outside the alphabet, or resolves anywhere else
 */
export function resolveWithin(root, urlPath) {
  let clean;
  try {
    clean = decodeURIComponent(String(urlPath).split('?')[0].split('#')[0]);
  } catch {
    return null;
  }

  const shapeIsSafe = clean
    .split('/')
    .every((seg) => seg === '' || (seg !== '..' && SAFE_SEGMENT.test(seg)));
  if (!shapeIsSafe) return null;

  const full = normalize(join(root, clean));
  const rel = relative(root, full);
  // `rel === ''` is the root directory itself, which is inside it. What each server does with a
  // directory - serve its index.html, or fall back to the shell - is the caller's policy.
  if (rel !== '' && (rel.startsWith('..') || isAbsolute(rel))) return null;
  return full;
}
