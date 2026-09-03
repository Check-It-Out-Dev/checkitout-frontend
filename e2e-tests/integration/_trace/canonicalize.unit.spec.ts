import { canonicalize, canonicalizeBody, canonicalizePath } from './canonicalize';
import type { TraceEntry } from './types';

describe('canonicalize', () => {
  describe('canonicalizePath', () => {
    it('replaces UUID segments with :id', () => {
      const path = '/api/users/abc12345-6789-4abc-9def-0123456789ab/profile';
      expect(canonicalizePath(path)).toBe('/api/users/:id/profile');
    });

    it('replaces multi-digit numeric path segments with :id', () => {
      expect(canonicalizePath('/api/applications/42/content')).toBe(
        '/api/applications/:id/content',
      );
    });

    it('keeps single-digit segments (likely intentional, e.g. v1, page=1)', () => {
      expect(canonicalizePath('/api/v1/health')).toBe('/api/v1/health');
    });

    it('keeps non-id alphanumeric segments verbatim', () => {
      const path = '/api/partnership-opportunities/registrations';
      expect(canonicalizePath(path)).toBe('/api/partnership-opportunities/registrations');
    });
  });

  describe('canonicalizeBody', () => {
    it('sorts object keys', () => {
      const out = canonicalizeBody({ z: 1, a: 2, m: 3 }) as Record<string, unknown>;
      expect(Object.keys(out)).toEqual(['a', 'm', 'z']);
    });

    it('scrubs uuid id fields', () => {
      const out = canonicalizeBody({ id: 'abc12345-6789-4abc-9def-0123456789ab', name: 'X' });
      expect(out).toEqual({ id: ':uuid', name: 'X' });
    });

    it('scrubs numeric id fields', () => {
      const out = canonicalizeBody({ id: 42, name: 'X' });
      expect(out).toEqual({ id: ':num-id', name: 'X' });
    });

    it('scrubs ISO timestamps in *At fields', () => {
      const out = canonicalizeBody({
        createdAt: '2026-05-09T13:45:30.123Z',
        updatedAt: '2026-05-09T13:46:00Z',
      });
      expect(out).toEqual({ createdAt: ':ts', updatedAt: ':ts' });
    });

    it('scrubs token-like fields', () => {
      const out = canonicalizeBody({ token: 'eyJhbGc...', refreshToken: 'abc.def' });
      expect(out).toEqual({ refreshToken: ':token', token: ':token' });
    });

    it('drops underscore-prefixed and *RequestId fields', () => {
      const out = canonicalizeBody({ name: 'X', _internal: 'gone', someRequestId: 'gone' });
      expect(out).toEqual({ name: 'X' });
    });

    it('recurses into nested objects', () => {
      const out = canonicalizeBody({
        user: { id: 'abc12345-6789-4abc-9def-0123456789ab', email: 'a@b.test' },
      });
      expect(out).toEqual({ user: { email: 'a@b.test', id: ':uuid' } });
    });

    it('sorts arrays of objects pre-scrub by id, so equivalent traces sort the same', () => {
      // Sort happens BEFORE id-scrub: row with id='a' comes first, row with id='b' second.
      // Then scrub: both ids become :num-id, but the row order is preserved.
      // Verify via non-id field (value) that the rows are now in id-sorted order.
      const out = canonicalizeBody([
        { id: 'b', value: 2 },
        { id: 'a', value: 1 },
      ]) as Array<Record<string, unknown>>;
      expect(out.map((e) => e['value'])).toEqual([1, 2]);
      expect(out.map((e) => e['id'])).toEqual([':num-id', ':num-id']);
    });

    it('sort is stable — same input from two traces canonicalizes identically', () => {
      const traceA = canonicalizeBody([
        { id: 'aaa1', name: 'Alpha' },
        { id: 'bbb2', name: 'Beta' },
      ]);
      const traceB = canonicalizeBody([
        { id: 'bbb2', name: 'Beta' },
        { id: 'aaa1', name: 'Alpha' },
      ]);
      expect(JSON.stringify(traceA)).toBe(JSON.stringify(traceB));
    });

    it('preserves arrays of primitives in original order', () => {
      const out = canonicalizeBody([3, 1, 2]);
      expect(out).toEqual([3, 1, 2]);
    });

    it('scrubs uuid + iso strings as primitives', () => {
      expect(canonicalizeBody('abc12345-6789-4abc-9def-0123456789ab')).toBe(':uuid');
      expect(canonicalizeBody('2026-05-09T13:45:30.123Z')).toBe(':ts');
      expect(canonicalizeBody('hello')).toBe('hello');
    });
  });

  describe('canonicalize(entry)', () => {
    it('produces a canonical entry stripping volatile fields', () => {
      const entry: TraceEntry = {
        method: 'POST',
        url: 'http://localhost:4201/api/applications/abc12345-6789-4abc-9def-0123456789ab/content',
        path: '/api/applications/abc12345-6789-4abc-9def-0123456789ab/content',
        query: {
          requestId: 'abc12345-6789-4abc-9def-0123456789ab',
          page: '0',
        },
        requestHeaders: {
          'Content-Type': 'application/json',
          'X-Request-ID': 'abc-123',
          Authorization: 'Bearer eyJhbGc.foo.bar',
          'X-Step-Up-Token': 'tok123',
          'User-Agent': 'noise',
        },
        requestBody: {
          id: 'abc12345-6789-4abc-9def-0123456789ab',
          name: 'My campaign',
          createdAt: '2026-05-09T13:45:30.123Z',
        },
        responseStatus: 201,
        responseHeaders: {
          'Content-Type': 'application/json',
          Location: '/api/applications/abc12345-6789-4abc-9def-0123456789ab/content/42',
          Date: 'Fri, 9 May 2026 13:45:30 GMT',
        },
        responseBody: {
          id: 42,
          name: 'My campaign',
          updatedAt: '2026-05-09T13:46:00Z',
        },
        elapsedMs: 123,
        startedAt: 1700000000000,
      };
      const c = canonicalize(entry);
      expect(c.path).toBe('/api/applications/:id/content');
      expect(c.query).toEqual({ page: '0', requestId: ':uuid' });
      // authorization is intentionally dropped — legacy uses cookies, greenfield
      // uses Bearer; transport differs by design. Response status proves auth worked.
      expect(c.requestHeaders).toEqual({
        'content-type': 'application/json',
        'x-step-up-token': ':token',
      });
      expect(c.requestBody).toEqual({
        createdAt: ':ts',
        id: ':uuid',
        name: 'My campaign',
      });
      expect(c.responseStatus).toBe(201);
      expect(c.responseHeaders).toEqual({
        'content-type': 'application/json',
        location: '/api/applications/:id/content/:id',
      });
      expect(c.responseBody).toEqual({
        id: ':num-id',
        name: 'My campaign',
        updatedAt: ':ts',
      });
    });
  });
});
