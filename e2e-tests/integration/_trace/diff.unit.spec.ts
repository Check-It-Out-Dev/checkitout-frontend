import { diff, renderDiffMarkdown } from './diff';
import type { CanonicalEntry } from './types';

const e = (
  method: 'GET' | 'POST',
  path: string,
  status = 200,
  body: unknown = null,
): CanonicalEntry => ({
  method,
  path,
  query: {},
  requestHeaders: {},
  requestBody: null,
  responseStatus: status,
  responseHeaders: {},
  responseBody: body,
});

describe('diff', () => {
  describe('ordered mode (default)', () => {
    it('reports equivalent for identical traces', () => {
      const t = [e('GET', '/api/me'), e('GET', '/api/list')];
      const r = diff(t, t);
      expect(r.equivalent).toBe(true);
      expect(r.added).toHaveLength(0);
      expect(r.removed).toHaveLength(0);
      expect(r.changed).toHaveLength(0);
      expect(r.reordered).toHaveLength(0);
    });

    it('reports added when actual has extra trailing entries', () => {
      const expected = [e('GET', '/api/me')];
      const actual = [e('GET', '/api/me'), e('POST', '/api/extra')];
      const r = diff(expected, actual);
      expect(r.equivalent).toBe(false);
      expect(r.added).toHaveLength(1);
      expect(r.added[0].path).toBe('/api/extra');
    });

    it('reports removed when expected has extra trailing entries', () => {
      const expected = [e('GET', '/api/me'), e('POST', '/api/extra')];
      const actual = [e('GET', '/api/me')];
      const r = diff(expected, actual);
      expect(r.equivalent).toBe(false);
      expect(r.removed).toHaveLength(1);
      expect(r.removed[0].path).toBe('/api/extra');
    });

    it('reports changed when same call has different responseStatus', () => {
      const expected = [e('GET', '/api/me', 200)];
      const actual = [e('GET', '/api/me', 401)];
      const r = diff(expected, actual);
      expect(r.equivalent).toBe(false);
      expect(r.changed).toHaveLength(1);
      expect(r.changed[0].differences[0]).toEqual({
        field: 'responseStatus',
        expected: 200,
        actual: 401,
      });
    });

    it('reports changed when responseBody differs', () => {
      const expected = [e('GET', '/api/me', 200, { name: 'A' })];
      const actual = [e('GET', '/api/me', 200, { name: 'B' })];
      const r = diff(expected, actual);
      expect(r.changed).toHaveLength(1);
      expect(r.changed[0].differences[0].field).toBe('responseBody');
    });

    it('reports reorder when same calls appear in swapped positions', () => {
      const expected = [e('GET', '/api/a'), e('GET', '/api/b')];
      const actual = [e('GET', '/api/b'), e('GET', '/api/a')];
      const r = diff(expected, actual);
      expect(r.equivalent).toBe(false);
      expect(r.reordered.length).toBeGreaterThan(0);
    });

    it('honors ignorePaths', () => {
      const expected = [e('GET', '/api/me'), e('POST', '/api/test/auth/mock-session')];
      const actual = [e('GET', '/api/me')];
      const r = diff(expected, actual, { ignorePaths: ['/api/test/auth/mock-session'] });
      expect(r.equivalent).toBe(true);
    });
  });

  describe('expectedRemoved / expectedAdded', () => {
    it('treats expectedRemoved entries as benign and surfaces them in expectedDriftRemoved', () => {
      const expected = [
        e('GET', '/api/me'),
        e('GET', '/api/public-config'),
        e('GET', '/api/notifications'),
      ];
      const actual = [e('GET', '/api/me')];
      const r = diff(expected, actual, {
        mode: 'set',
        expectedRemoved: [
          { method: 'GET', path: '/api/public-config' },
          { method: 'GET', path: '/api/notifications' },
        ],
      });
      expect(r.equivalent).toBe(true);
      expect(r.removed).toHaveLength(0);
      expect(r.expectedDriftRemoved).toHaveLength(2);
      expect(r.expectedDriftRemoved.map((e) => e.path)).toEqual([
        '/api/public-config',
        '/api/notifications',
      ]);
    });

    it('still fails when removed list contains entries NOT in expectedRemoved', () => {
      const expected = [e('GET', '/api/known'), e('GET', '/api/surprise')];
      const actual: ReturnType<typeof e>[] = [];
      const r = diff(expected, actual, {
        mode: 'set',
        expectedRemoved: [{ method: 'GET', path: '/api/known' }],
      });
      expect(r.equivalent).toBe(false);
      expect(r.removed).toHaveLength(1);
      expect(r.removed[0].path).toBe('/api/surprise');
      expect(r.expectedDriftRemoved).toHaveLength(1);
    });

    it('matches expectedRemoved per-occurrence (duplicate calls require duplicate entries)', () => {
      // Legacy hits /api/users/me twice; only one expectedRemoved entry → one stays in removed.
      const expected = [e('GET', '/api/users/me'), e('GET', '/api/users/me')];
      const actual: ReturnType<typeof e>[] = [];
      const r = diff(expected, actual, {
        mode: 'set',
        expectedRemoved: [{ method: 'GET', path: '/api/users/me' }],
      });
      expect(r.equivalent).toBe(false);
      expect(r.removed).toHaveLength(1);
      expect(r.expectedDriftRemoved).toHaveLength(1);
    });

    it('surfaces expectedAdded as benign greenfield-only calls', () => {
      const expected = [e('GET', '/api/me')];
      const actual = [e('GET', '/api/me'), e('GET', '/api/new-feature')];
      const r = diff(expected, actual, {
        mode: 'set',
        expectedAdded: [{ method: 'GET', path: '/api/new-feature' }],
      });
      expect(r.equivalent).toBe(true);
      expect(r.added).toHaveLength(0);
      expect(r.expectedDriftAdded).toHaveLength(1);
    });

    it('renderDiffMarkdown surfaces expected-drift sections even when equivalent', () => {
      const expected = [e('GET', '/api/known'), e('GET', '/api/me')];
      const actual = [e('GET', '/api/me')];
      const r = diff(expected, actual, {
        mode: 'set',
        expectedRemoved: [{ method: 'GET', path: '/api/known' }],
      });
      expect(r.equivalent).toBe(true);
      const md = renderDiffMarkdown(r);
      expect(md).toContain('🟢');
      expect(md).toContain('Equivalent');
      expect(md).toContain('Expected drift');
      expect(md).toContain('/api/known');
    });
  });

  describe('set mode', () => {
    it('matches multiset regardless of order', () => {
      const expected = [e('GET', '/api/a'), e('GET', '/api/b')];
      const actual = [e('GET', '/api/b'), e('GET', '/api/a')];
      const r = diff(expected, actual, { mode: 'set' });
      expect(r.equivalent).toBe(true);
    });

    it('detects extra calls in actual via set diff', () => {
      const expected = [e('GET', '/api/a')];
      const actual = [e('GET', '/api/a'), e('GET', '/api/b')];
      const r = diff(expected, actual, { mode: 'set' });
      expect(r.equivalent).toBe(false);
      expect(r.added).toHaveLength(1);
    });

    it('detects shape diffs across calls of same key', () => {
      const expected = [e('GET', '/api/me', 200, { v: 1 })];
      const actual = [e('GET', '/api/me', 200, { v: 2 })];
      const r = diff(expected, actual, { mode: 'set' });
      expect(r.equivalent).toBe(false);
      expect(r.changed).toHaveLength(1);
    });
  });

  describe('renderDiffMarkdown', () => {
    it('renders equivalent verdict when no drift', () => {
      const r = diff([e('GET', '/api/me')], [e('GET', '/api/me')]);
      expect(renderDiffMarkdown(r)).toContain('🟢');
      expect(renderDiffMarkdown(r)).toContain('Equivalent');
    });

    it('renders 🔴 with summary when drift present', () => {
      const r = diff([e('GET', '/api/me', 200)], [e('GET', '/api/me', 401)]);
      const md = renderDiffMarkdown(r);
      expect(md).toContain('🔴');
      expect(md).toContain('Drift detected');
      expect(md).toContain('responseStatus');
    });
  });
});
