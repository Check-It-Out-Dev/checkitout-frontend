import { resolveWithin } from './safe-path.mjs';

import { join, sep } from 'node:path';

/**
 * The two static servers in this directory answer HTTP on a port, on a developer's machine and on a
 * runner, and both used to carry their own copy of this logic. CodeQL reports the `existsSync` and
 * `createReadStream` calls downstream as js/path-injection because it cannot see a per-segment
 * allow-list as a barrier. This is the evidence that the barrier holds.
 *
 * Each case below is a real technique rather than a variation on `../`: percent-encoded traversal,
 * double encoding, a NUL byte, a backslash on a platform that treats it as a separator, a Windows
 * device name, an alternate data stream, and the sibling-prefix trick that defeats a naive
 * `startsWith` containment check.
 */
describe('resolveWithin', () => {
  const root = join(sep, 'srv', 'www');

  describe('paths a build actually emits', () => {
    it.each([
      ['/main-A1B2C3D4.js', ['main-A1B2C3D4.js']],
      ['/assets/i18n/en.json', ['assets', 'i18n', 'en.json']],
      ['/media/tour~1.mp4', ['media', 'tour~1.mp4']],
      ['/index.html?v=2', ['index.html']],
      ['/index.html#top', ['index.html']],
    ])('%s resolves inside the root', (urlPath, parts) => {
      expect(resolveWithin(root, urlPath)).toBe(join(root, ...(parts as string[])));
    });

    it('the root itself is inside the root, and the caller decides what that means', () => {
      expect(resolveWithin(root, '/')).not.toBeNull();
    });

    it('a doubled slash looks like an authority and is not one', () => {
      // `//etc/passwd` reads as protocol-relative in a browser and as an escape in a bug report.
      // Here it is two empty segments: it resolves to <root>/etc/passwd, inside the root, and
      // serving it is correct. The case is kept because writing it down is the only way to
      // distinguish "checked and fine" from "never considered".
      expect(resolveWithin(root, '//etc/passwd')).toBe(join(root, 'etc', 'passwd'));
    });

    it('a `..` that stays inside is allowed by containment but refused by shape', () => {
      // The allow-list refuses the segment before containment ever sees it. Stricter than it needs
      // to be, deliberately: nothing a build emits contains `..`, so there is no reason to reason
      // about when it would have been safe.
      expect(resolveWithin(root, '/assets/../main.js')).toBeNull();
    });
  });

  describe('traversal, in the forms it actually arrives in', () => {
    it.each([
      ['plain', '/../../etc/passwd'],
      ['percent-encoded', '/..%2F..%2Fetc%2Fpasswd'],
      ['double-encoded', '/..%252F..%252Fetc'],
      ['encoded dots', '/%2e%2e/%2e%2e/etc'],
      ['trailing traversal', '/assets/..%2f..%2f.env'],
    ])('%s is refused', (_name, urlPath) => {
      expect(resolveWithin(root, urlPath)).toBeNull();
    });
  });

  describe('characters that are not traversal but are not a filename either', () => {
    it.each([
      ['a NUL byte', '/main%00.js'],
      ['a backslash', '/assets\\..\\.env'],
      ['an alternate data stream', '/secrets.txt:hidden'],
      ['a space', '/two words.js'],
      ['a quote', "/it's.js"],
      ['a semicolon', '/a;b.js'],
    ])('%s is refused', (_name, urlPath) => {
      expect(resolveWithin(root, urlPath)).toBeNull();
    });
  });

  describe('the decoding gate', () => {
    it.each([
      ['a bare percent', '/%'],
      ['a truncated escape', '/%2'],
      ['a bad escape', '/%zz'],
    ])('%s returns null rather than throwing', (_name, urlPath) => {
      // A URIError out of a request handler does not refuse one request, it ends the process.
      // A single `/%` took the demo server down once, and the tier it was serving reported
      // nothing at all rather than reporting a regression.
      expect(() => resolveWithin(root, urlPath)).not.toThrow();
      expect(resolveWithin(root, urlPath)).toBeNull();
    });
  });

  it('a sibling directory that shares the root prefix is outside it', () => {
    // `startsWith(root)` says /srv/www-evil is inside /srv/www. It is not. This is why containment
    // is expressed with `relative` rather than a prefix test.
    const sibling = `${root}-evil`;
    expect(resolveWithin(root, '/a.js')).not.toBe(join(sibling, 'a.js'));
    expect(resolveWithin(sibling, '/a.js')).toBe(join(sibling, 'a.js'));
  });
});
