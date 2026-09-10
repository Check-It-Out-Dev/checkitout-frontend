import { HttpErrorResponse, HttpRequest, HttpResponse } from '@angular/common/http';
import { firstValueFrom, of } from 'rxjs';
import { environment } from '../../../environments/environment';
import { DEMO_NOT_FOUND, matchDemoFixture } from './demo-fixtures';
import { demoInterceptor } from './demo.interceptor';

/**
 * The interceptor that makes the demo a demo, and the one file in core/demo with no test at all.
 *
 * It sits FIRST in the chain, so everything it decides is final: a request it passes through
 * reaches the network, and a 404 it raises never meets the error interceptor. Three of its four
 * behaviours are one-line conditions that a refactor could invert without any other test noticing
 * -- the pass-through when the build is not a demo especially, which is the one that would send a
 * real request from a page that has no backend.
 */
describe('demoInterceptor', () => {
  const wasDemo = environment.demo;

  afterEach(() => {
    (environment as { demo: boolean }).demo = wasDemo;
  });

  /** A next handler that records what reached it and answers 200. */
  function recordingNext() {
    const seen: HttpRequest<unknown>[] = [];
    const next = (req: HttpRequest<unknown>) => {
      seen.push(req);
      return of(new HttpResponse({ status: 200, body: { fromNetwork: true } }));
    };
    return { seen, next };
  }

  function get(url: string) {
    return new HttpRequest('GET', url);
  }

  describe('when the build is not a demo', () => {
    beforeEach(() => {
      (environment as { demo: boolean }).demo = false;
    });

    it('passes an API call straight through, unmodified', async () => {
      const { seen, next } = recordingNext();
      const req = get('/api/users/me');

      const res = (await firstValueFrom(demoInterceptor(req, next))) as HttpResponse<unknown>;

      expect(seen).toEqual([req]);
      expect(res.body).toEqual({ fromNetwork: true });
    });
  });

  describe('when the build IS a demo', () => {
    beforeEach(() => {
      (environment as { demo: boolean }).demo = true;
    });

    it('passes non-API traffic through — assets and i18n must still load', async () => {
      const { seen, next } = recordingNext();
      const req = get('/assets/i18n/en.json');

      await firstValueFrom(demoInterceptor(req, next));

      expect(seen).toEqual([req]);
    });

    it('answers an API call from the fixtures without touching the network', async () => {
      const { seen, next } = recordingNext();
      const url = '/api/legal/current';

      const res = (await firstValueFrom(demoInterceptor(get(url), next))) as HttpResponse<unknown>;

      expect(seen).toEqual([]);
      expect(res.status).toBe(200);
      expect(res.body).toEqual(matchDemoFixture('GET', url, null));
    });

    it('answers an unmapped API call with an empty 200 rather than an error', async () => {
      const { seen, next } = recordingNext();
      const url = '/api/nothing-is-mapped-here';
      expect(matchDemoFixture('GET', url, null)).toBeUndefined();

      const res = (await firstValueFrom(demoInterceptor(get(url), next))) as HttpResponse<unknown>;

      expect(seen).toEqual([]);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({});
    });

    it('raises a real 404 when a by-id lookup misses, so the detail screen can say so', async () => {
      const { seen, next } = recordingNext();
      // A campaign id that cannot exist: the fixture answers DEMO_NOT_FOUND rather than undefined,
      // which is the difference between "no such record" and "this route is not mapped".
      const url = '/api/partnership-opportunity/99999999';
      expect(matchDemoFixture('GET', url, null)).toBe(DEMO_NOT_FOUND);

      const err = await firstValueFrom(demoInterceptor(get(url), next)).catch((e: unknown) => e);

      expect(seen).toEqual([]);
      expect(err).toBeInstanceOf(HttpErrorResponse);
      expect((err as HttpErrorResponse).status).toBe(404);
      expect((err as HttpErrorResponse).url).toBe(url);
    });
  });
});
