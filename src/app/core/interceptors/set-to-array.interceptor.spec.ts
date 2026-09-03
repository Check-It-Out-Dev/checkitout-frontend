import { HttpClient, provideHttpClient, withInterceptors, withXhr } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { setToArrayInterceptor } from './set-to-array.interceptor';

describe('setToArrayInterceptor', () => {
  let http: HttpClient;
  let controller: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withXhr(), withInterceptors([setToArrayInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpClient);
    controller = TestBed.inject(HttpTestingController);
  });

  afterEach(() => controller.verify());

  it('converts Sets to arrays at any depth of a JSON body (BUG-3 guard)', () => {
    http
      .post('/api/partnership-opportunity', {
        platforms: new Set([1, 2]),
        nested: { contentTypes: new Set([3]) },
        list: [{ inner: new Set([4]) }],
        scalar: 'kept',
      })
      .subscribe();

    const req = controller.expectOne('/api/partnership-opportunity');
    expect(req.request.body).toEqual({
      platforms: [1, 2],
      nested: { contentTypes: [3] },
      list: [{ inner: [4] }],
      scalar: 'kept',
    });
    // The wire-format wipe this guards against: JSON.stringify(new Set) === '{}'.
    expect(JSON.parse(JSON.stringify(req.request.body))['platforms']).toEqual([1, 2]);
    req.flush({});
  });

  it('converts Maps to plain objects, normalizing their values recursively', () => {
    http
      .post('/api/x', {
        meta: new Map<string, unknown>([
          ['counts', new Map([['a', 1]])],
          ['tags', new Set(['x', 'y'])],
        ]),
      })
      .subscribe();

    const req = controller.expectOne('/api/x');
    // Maps share Set's wire failure (JSON.stringify(new Map) === '{}').
    expect(req.request.body).toEqual({ meta: { counts: { a: 1 }, tags: ['x', 'y'] } });
    req.flush({});
  });

  it('keeps body identity when no Set is present (no clone)', () => {
    const body = { title: 'unchanged', ids: [1, 2], when: new Date('2026-09-02T00:00:00Z') };

    http.put('/api/x', body).subscribe();

    const req = controller.expectOne('/api/x');
    expect(req.request.body).toBe(body);
    req.flush({});
  });

  it('preserves Date instances while converting sibling Sets', () => {
    const when = new Date('2026-09-03T00:00:00Z');

    http.post('/api/x', { when, tags: new Set(['a']) }).subscribe();

    const req = controller.expectOne('/api/x');
    const sent = req.request.body as { when: unknown; tags: unknown };
    expect(sent.when).toBe(when);
    expect(sent.tags).toEqual(['a']);
    req.flush({});
  });

  it('leaves FormData bodies untouched', () => {
    const form = new FormData();
    form.append('file', new Blob(['x']), 'x.jpg');

    http.post('/api/upload', form).subscribe();

    const req = controller.expectOne('/api/upload');
    expect(req.request.body).toBe(form);
    req.flush({});
  });

  it('passes bodiless requests through', () => {
    http.get('/api/y').subscribe();

    const req = controller.expectOne('/api/y');
    expect(req.request.body).toBeNull();
    req.flush({});
  });

  it('leaves string bodies untouched', () => {
    http.post('/api/raw', 'plain-text').subscribe();

    const req = controller.expectOne('/api/raw');
    expect(req.request.body).toBe('plain-text');
    req.flush({});
  });
});
