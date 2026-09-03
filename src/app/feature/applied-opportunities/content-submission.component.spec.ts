import { provideHttpClient, withXhr } from '@angular/common/http';
import { ComponentFixture, TestBed, fakeAsync, flush, tick } from '@angular/core/testing';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@ngneat/transloco';
import { Observable, of, throwError } from 'rxjs';
import type { AppliedOpportunityContentDtoIn } from '../../api/model/applied-opportunity-content-dto-in';
import type { AppliedOpportunityContentDtoOut } from '../../api/model/applied-opportunity-content-dto-out';
import type { ContentTypeDtoOut } from '../../api/model/content-type-dto-out';
import { AppliedOpportunityContentApiService } from '../../core/applied-opportunities/applied-opportunity-content.service';
import { ContentSubmissionComponent } from './content-submission.component';

const TYPE_POST: ContentTypeDtoOut = { id: 1, name: 'Post', originalName: 'post' };
const TYPE_REEL: ContentTypeDtoOut = { id: 2, name: 'Reel', originalName: 'reel' };

const EXISTING: AppliedOpportunityContentDtoOut = {
  id: 501,
  contentTypeId: 1,
  contentTypeName: 'Post',
  contentCount: 1,
  socialMediaLink: 'https://instagram.com/p/abc',
  approvalStatus: 'PENDING' as never,
};

class FakeApi {
  submitted: AppliedOpportunityContentDtoIn[] = [];
  engagementCalls: Array<{ contentId: number; metrics: Record<string, number | undefined> }> = [];
  listFn: () => Observable<AppliedOpportunityContentDtoOut[]> = () => of([EXISTING]);
  typesFn: () => Observable<ContentTypeDtoOut[]> = () => of([TYPE_POST, TYPE_REEL]);
  submitFn: (dto: AppliedOpportunityContentDtoIn) => Observable<AppliedOpportunityContentDtoOut> = (
    _dto,
  ) => of({ ...EXISTING, id: 999, contentTypeId: 2, contentTypeName: 'Reel' });
  engagementFn: () => Observable<unknown> = () => of(undefined);
  listForAppliedOpportunity = (_id: number) => this.listFn();
  listContentTypes = () => this.typesFn();
  submit = (dto: AppliedOpportunityContentDtoIn) => {
    this.submitted.push(dto);
    return this.submitFn(dto);
  };
  updateEngagement = (contentId: number, metrics: Record<string, number | undefined>) => {
    this.engagementCalls.push({ contentId, metrics });
    return this.engagementFn();
  };
}

function create(
  api: FakeApi,
  paramId: string | null = '42',
): ComponentFixture<ContentSubmissionComponent> {
  const fakeRoute = {
    snapshot: { paramMap: convertToParamMap(paramId === null ? {} : { id: paramId }) },
  } as unknown as ActivatedRoute;
  TestBed.configureTestingModule({
    imports: [
      ContentSubmissionComponent,
      TranslocoTestingModule.forRoot({
        langs: { en: {} },
        translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
      }),
    ],
    providers: [
      provideHttpClient(withXhr()),
      provideAnimationsAsync(),
      provideRouter([]),
      { provide: AppliedOpportunityContentApiService, useValue: api },
      { provide: ActivatedRoute, useValue: fakeRoute },
    ],
  });
  const fixture = TestBed.createComponent(ContentSubmissionComponent);
  fixture.detectChanges();
  return fixture;
}

describe('ContentSubmissionComponent', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('loads existing submissions and content types on init', fakeAsync(() => {
    const api = new FakeApi();
    const fixture = create(api);
    tick();
    fixture.detectChanges();
    expect(fixture.componentInstance.state()).toBe('ready');
    expect(fixture.componentInstance.submissions().length).toBe(1);
    expect(fixture.componentInstance.contentTypes().map((t) => t.id)).toEqual([1, 2]);
  }));

  it('marks not-found if route id is missing or non-numeric', () => {
    const api = new FakeApi();
    const fixture = create(api, 'abc');
    expect(fixture.componentInstance.state()).toBe('not-found');
  });

  describe('engagement metrics (audit P1)', () => {
    it('openEngagement prefills the form from the row', fakeAsync(() => {
      const api = new FakeApi();
      api.listFn = () => of([{ ...EXISTING, likesCount: 120, viewsCount: 4000 }]);
      const fixture = create(api);
      tick();

      fixture.componentInstance.openEngagement(fixture.componentInstance.submissions()[0]);

      expect(fixture.componentInstance.engagementEditId()).toBe(501);
      expect(fixture.componentInstance.engagementForm.getRawValue()).toEqual({
        likes: 120,
        comments: null,
        views: 4000,
        shares: null,
      });
    }));

    it('saveEngagement calls the wrapper and patches the row locally', fakeAsync(() => {
      const api = new FakeApi();
      const fixture = create(api);
      tick();
      fixture.componentInstance.openEngagement(fixture.componentInstance.submissions()[0]);
      fixture.componentInstance.engagementForm.setValue({
        likes: 1500,
        comments: 250,
        views: 10000,
        shares: 75,
      });

      fixture.componentInstance.saveEngagement();
      tick();

      expect(api.engagementCalls).toEqual([
        { contentId: 501, metrics: { likes: 1500, comments: 250, views: 10000, shares: 75 } },
      ]);
      const row = fixture.componentInstance.submissions()[0];
      expect(row.likesCount).toBe(1500);
      expect(row.viewsCount).toBe(10000);
      expect(fixture.componentInstance.engagementEditId()).toBeNull();
    }));

    it('a failed save surfaces the error key and keeps the editor open', fakeAsync(() => {
      const api = new FakeApi();
      api.engagementFn = () => throwError(() => new Error('403'));
      const fixture = create(api);
      tick();
      fixture.componentInstance.openEngagement(fixture.componentInstance.submissions()[0]);
      fixture.componentInstance.engagementForm.patchValue({ likes: 10 });

      fixture.componentInstance.saveEngagement();
      tick();

      expect(fixture.componentInstance.engagementErrorKey()).toBe(
        'applied_opportunities.content.engagement.error',
      );
      expect(fixture.componentInstance.engagementEditId()).toBe(501);
    }));

    it('negative values keep the form invalid and never call the BE', fakeAsync(() => {
      const api = new FakeApi();
      const fixture = create(api);
      tick();
      fixture.componentInstance.openEngagement(fixture.componentInstance.submissions()[0]);
      fixture.componentInstance.engagementForm.patchValue({ likes: -5 });

      fixture.componentInstance.saveEngagement();
      tick();

      expect(api.engagementCalls).toHaveLength(0);
    }));
  });

  it('marks state error when load fails', fakeAsync(() => {
    const api = new FakeApi();
    api.listFn = () => throwError(() => ({ status: 500 }));
    const fixture = create(api);
    tick();
    expect(fixture.componentInstance.state()).toBe('error');
  }));

  it('submit BUTTON enables once the form is valid (regression: memoized computed kept it disabled forever)', fakeAsync(() => {
    const api = new FakeApi();
    const fixture = create(api);
    tick();
    fixture.detectChanges();
    const btn = (): HTMLButtonElement =>
      fixture.nativeElement.querySelector('[data-testid="content-form-submit"]');
    // pristine form → disabled
    expect(btn().disabled).toBe(true);
    // fill the one required control the way a user would end up with it
    fixture.componentInstance.form.controls.contentTypeId.setValue(1);
    fixture.detectChanges();
    // the template expression must re-evaluate — a computed over the
    // non-signal form.valid memoized `false` here and never recovered
    expect(btn().disabled).toBe(false);
    flush(); // drain the Material button ripple timer fakeAsync would flag
  }));

  it('blocks submit with invalid form (no contentTypeId)', fakeAsync(() => {
    const api = new FakeApi();
    const fixture = create(api);
    tick();
    fixture.componentInstance.submit();
    expect(api.submitted.length).toBe(0);
  }));

  it('submits, prepends the new row, and resets the form', fakeAsync(() => {
    const api = new FakeApi();
    const fixture = create(api);
    tick();
    fixture.componentInstance.form.patchValue({
      contentTypeId: 2,
      contentCount: 3,
      socialMediaLink: 'https://instagram.com/p/abc123',
      description: 'My reel',
      tags: '#fashion',
    });
    fixture.componentInstance.submit();
    tick();
    expect(api.submitted.length).toBe(1);
    expect(api.submitted[0]).toMatchObject({
      appliedOpportunityId: 42,
      contentTypeId: 2,
      contentCount: 3,
      socialMediaLink: 'https://instagram.com/p/abc123',
    });
    expect(fixture.componentInstance.submissions()[0]?.id).toBe(999);
    expect(fixture.componentInstance.form.controls.contentTypeId.value).toBe(null);
  }));

  it('surfaces invalid_input on 400', fakeAsync(() => {
    const api = new FakeApi();
    api.submitFn = () => throwError(() => ({ status: 400 }));
    const fixture = create(api);
    tick();
    fixture.componentInstance.form.patchValue({ contentTypeId: 1 });
    fixture.componentInstance.submit();
    tick();
    expect(fixture.componentInstance.errorKey()).toBe(
      'applied_opportunities.content.error.invalid_input',
    );
  }));

  it('surfaces bad_state on 409', fakeAsync(() => {
    const api = new FakeApi();
    api.submitFn = () => throwError(() => ({ status: 409 }));
    const fixture = create(api);
    tick();
    fixture.componentInstance.form.patchValue({ contentTypeId: 1 });
    fixture.componentInstance.submit();
    tick();
    expect(fixture.componentInstance.errorKey()).toBe(
      'applied_opportunities.content.error.bad_state',
    );
  }));

  // Iter-47 P0 #2 regression — stored-XSS via socialMediaLink. Before
  // the fix, the FormControl had only maxLength(1000); influencer could
  // submit "javascript:alert(1)" → company-side review rendered
  // <a [href]="row.socialMediaLink"> → XSS on click. Angular's HTML
  // sanitizer protects [href] bindings, but defense-in-depth + cleaner
  // BE data + better UX = reject at input time.
  describe('socialMediaLink URL+scheme validation (iter-47 P0 #2 fix + pentest 3.5 host allowlist)', () => {
    it.each([
      ['https://instagram.com/p/abc123', true],
      ['https://www.instagram.com/reel/xyz', true],
      ['https://tiktok.com/@user/video/1', true],
      ['https://www.tiktok.com/@user/video/1', true],
      ['https://vm.tiktok.com/ZM123/', true],
      ['', true], // optional field — empty is valid
      ['   ', true], // whitespace-only trimmed to empty
    ])('accepts %s as valid (valid=%s)', (input, _valid) => {
      const api = new FakeApi();
      const fixture = create(api);
      fixture.componentInstance.form.controls.socialMediaLink.setValue(input);
      expect(fixture.componentInstance.form.controls.socialMediaLink.valid).toBe(true);
    });

    it.each([
      ['javascript:alert(1)', 'unsafeScheme'],
      ['JavaScript:alert(1)', 'unsafeScheme'], // case-insensitive scheme
      ['data:text/html,<script>alert(1)</script>', 'unsafeScheme'],
      ['vbscript:msgbox', 'unsafeScheme'],
      ['file:///etc/passwd', 'unsafeScheme'],
      ['about:blank', 'unsafeScheme'],
      ['chrome://settings', 'unsafeScheme'],
      ['blob:https://example.com/abc', 'unsafeScheme'],
      ['mailto:hi@example.com', 'unsafeScheme'],
      ['tel:+48123', 'unsafeScheme'],
      ['ftp://example.com/file', 'unsafeScheme'], // not http(s)
      ['not a url', 'invalidUrl'],
      ['instagram.com/foo', 'invalidUrl'], // no scheme — treated as path otherwise
      // pentest 3.5 — the publication link must be Instagram/TikTok
      // (Vimeo belongs to the separate `urls` field; non-social https rejected):
      ['https://vimeo.com/123456789', 'notSocialPost'],
      ['https://example.com/path?q=1#frag', 'notSocialPost'],
      ['https://youtube.com/watch?v=abc', 'notSocialPost'],
      ['http://instagram.com/p/abc', 'notSocialPost'], // right host but not https
      ['https://instagram.com.attacker.com/1', 'notSocialPost'], // subdomain trick
    ])('rejects %s with %s error', (input, errorKey) => {
      const api = new FakeApi();
      const fixture = create(api);
      fixture.componentInstance.form.controls.socialMediaLink.setValue(input);
      expect(fixture.componentInstance.form.controls.socialMediaLink.valid).toBe(false);
      expect(fixture.componentInstance.form.controls.socialMediaLink.hasError(errorKey)).toBe(true);
    });

    it('blocks submit when socialMediaLink contains javascript: scheme', fakeAsync(() => {
      const api = new FakeApi();
      const fixture = create(api);
      tick();

      fixture.componentInstance.form.patchValue({
        contentTypeId: 1,
        socialMediaLink: 'javascript:alert(1)',
      });
      fixture.componentInstance.submit();
      tick();

      // Did NOT submit:
      expect(api.submitted.length).toBe(0);
      // Form is marked touched so mat-error surfaces:
      expect(fixture.componentInstance.form.controls.socialMediaLink.touched).toBe(true);
    }));

    it('form.invalid is true when socialMediaLink is malicious — template mat-error will render', () => {
      const api = new FakeApi();
      const fixture = create(api);
      fixture.componentInstance.form.controls.socialMediaLink.setValue('javascript:alert(1)');
      fixture.componentInstance.form.controls.socialMediaLink.markAsTouched();
      expect(fixture.componentInstance.form.controls.socialMediaLink.hasError('unsafeScheme')).toBe(
        true,
      );
      expect(fixture.componentInstance.form.controls.socialMediaLink.touched).toBe(true);
      // The (hasError + touched) conjunction is what gates the
      // mat-error block in the template. DOM-rendering assertion is
      // handled by the sandbox + Playwright visual specs.
    });
  });
});
