import { provideHttpClient, withXhr } from '@angular/common/http';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
// Router is used by spyRouterNavigate via TestBed.inject — keeping the import.
import { TranslocoTestingModule } from '@ngneat/transloco';
import { Observable, of, throwError } from 'rxjs';
import { CompensationType } from '../../api/model/compensation-type';
import type { PartnershipOpportunityDtoIn } from '../../api/model/partnership-opportunity-dto-in';
import type { PartnershipOpportunityDtoOut } from '../../api/model/partnership-opportunity-dto-out';
import { SessionStateService } from '../../core/auth/session-state.service';
import { OpportunityApiService } from '../../core/opportunities/opportunity.service';
import { OpportunityDictionariesApiService } from '../../core/opportunities/opportunity-dictionaries.service';
import { UploadService } from '../../core/upload/upload.service';
import { OpportunityFormComponent } from './opportunity-form.component';

const STUB_USER = { id: 42, email: 'company1@e2e.test' };

function makeSessionStub(user: { id: number; email: string } | null = STUB_USER) {
  return { user: signal(user).asReadonly() } as unknown as SessionStateService;
}

const EXISTING: PartnershipOpportunityDtoOut = {
  id: 7,
  name: 'Spring Promo Internal',
  title: 'Spring promo',
  city: 'Warszawa',
  address: {
    street: 'Marszałkowska 12',
    city: 'Warszawa',
    postalCode: '00-001',
    country: 'PL',
  } as never,
  details: 'Make a reel.',
  requirements: '20k+ followers',
  compensationType: { value: CompensationType.CASH, label: 'Cash' } as never,
  compensationAmountMin: 100,
  compensationAmountMax: 500,
  compensationDescription: 'Per content piece',
  active: true,
};

class FakeDictionaries {
  platforms = () => of([{ id: 1, name: 'Instagram', active: true, contentTypes: new Set() }]);
  contentTypes = () => of([{ id: 11, name: 'Reel' }]);
  serviceTypes = () => of([{ id: 21, name: 'Product placement' }]);
  currencies = () => of([{ id: 31, name: 'Polish Złoty', isoCode: 'PLN' }]);
}

class FakeUpload {
  calls: { name: string; uploadType: string }[] = [];
  next: () => Observable<{ publicUrl: string; filePath: string; uploadId: string }> = () =>
    of({ publicUrl: 'https://cdn.example/p1.jpg', filePath: 'campaign/p1.jpg', uploadId: 'u1' });
  uploadImage = (file: File, uploadType: string) => {
    this.calls.push({ name: file.name, uploadType });
    return this.next();
  };
}

function pickFile(fixture: ComponentFixture<OpportunityFormComponent>, name = 'p1.jpg'): void {
  const file = new File(['x'], name, { type: 'image/jpeg' });
  const input = document.createElement('input');
  Object.defineProperty(input, 'files', { value: [file] });
  fixture.componentInstance.onPhotoSelected({ target: input } as unknown as Event);
}

class FakeApi {
  createCalls: PartnershipOpportunityDtoIn[] = [];
  updateCalls: { id: number; dto: PartnershipOpportunityDtoIn }[] = [];
  getById = (_id: number): Observable<PartnershipOpportunityDtoOut> => of(EXISTING);
  create = (dto: PartnershipOpportunityDtoIn): Observable<PartnershipOpportunityDtoOut> => {
    this.createCalls.push(dto);
    return of({ ...EXISTING, id: 99 });
  };
  update = (
    id: number,
    dto: PartnershipOpportunityDtoIn,
  ): Observable<PartnershipOpportunityDtoOut> => {
    this.updateCalls.push({ id, dto });
    return of({
      ...EXISTING,
      id,
      name: dto.name ?? EXISTING.name,
      title: dto.title ?? EXISTING.title,
      details: dto.details ?? EXISTING.details,
    });
  };
}

function create(
  api: FakeApi,
  paramId: string | null = null,
  session: SessionStateService = makeSessionStub(),
  upload: FakeUpload = new FakeUpload(),
): ComponentFixture<OpportunityFormComponent> {
  const fakeRoute = {
    snapshot: { paramMap: convertToParamMap(paramId === null ? {} : { id: paramId }) },
  } as unknown as ActivatedRoute;
  TestBed.configureTestingModule({
    imports: [
      OpportunityFormComponent,
      TranslocoTestingModule.forRoot({
        langs: { en: {} },
        translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
      }),
    ],
    providers: [
      provideHttpClient(withXhr()),
      provideAnimationsAsync(),
      provideRouter([]),
      { provide: OpportunityApiService, useValue: api },
      { provide: OpportunityDictionariesApiService, useValue: new FakeDictionaries() },
      { provide: UploadService, useValue: upload },
      { provide: ActivatedRoute, useValue: fakeRoute },
      { provide: SessionStateService, useValue: session },
    ],
  });
  const fixture = TestBed.createComponent(OpportunityFormComponent);
  fixture.detectChanges();
  return fixture;
}

function spyRouterNavigate() {
  const router = TestBed.inject(Router);
  return jest.spyOn(router, 'navigate').mockResolvedValue(true);
}

describe('OpportunityFormComponent', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('starts in create mode when no :id is present', () => {
    const fixture = create(new FakeApi());
    expect(fixture.componentInstance.mode()).toBe('create');
    expect(fixture.componentInstance.isEdit()).toBe(false);
  });

  describe('full DtoIn surface (audit P1 #35a)', () => {
    it('loads the four FK dictionaries on init', fakeAsync(() => {
      const fixture = create(new FakeApi());
      tick();
      expect(fixture.componentInstance.platforms().map((p) => p.id)).toEqual([1]);
      expect(fixture.componentInstance.contentTypes().map((c) => c.id)).toEqual([11]);
      expect(fixture.componentInstance.serviceTypes().map((s) => s.id)).toEqual([21]);
      expect(fixture.componentInstance.currencies().map((c) => c.id)).toEqual([31]);
    }));

    it('create payload carries classification, audience and schedule', fakeAsync(() => {
      const api = new FakeApi();
      const fixture = create(api);
      tick();
      spyRouterNavigate();
      const form = fixture.componentInstance.form;
      form.patchValue({
        name: 'N',
        title: 'T',
        city: 'Warszawa',
        street: 'S 1',
        postalCode: '00-001',
        country: 'PL',
        currency: 31,
        serviceType: 21,
        platforms: [1],
        contentTypes: [11],
        followersMin: 1000,
        followersMax: 50000,
        startDate: new Date(2026, 8, 3),
        endDate: new Date(2026, 8, 15),
      });

      fixture.componentInstance.submit();
      tick();

      const dto = api.createCalls[0];
      expect(dto.currency).toBe(31);
      expect(dto.serviceType).toBe(21);
      // Runtime ARRAYS behind the Set-typed fields — a real Set would
      // JSON.stringify to {} and silently wipe the collections on the wire.
      expect(dto.platforms).toEqual([1]);
      expect(dto.contentTypes).toEqual([11]);
      expect(dto.followersMin).toBe(1000);
      expect(dto.followersMax).toBe(50000);
      expect(dto.startDate).toBe('2026-09-03T00:00:00');
      expect(dto.endDate).toBe('2026-09-15T00:00:00');
      // Serialization guard: what HttpClient would actually send must carry
      // JSON arrays, not the {} that a Set instance serializes to.
      const wire = JSON.parse(JSON.stringify(dto)) as Record<string, unknown>;
      expect(wire['platforms']).toEqual([1]);
      expect(wire['contentTypes']).toEqual([11]);
    }));

    it('populates the new controls on edit (FK ids unwrapped, 0-followers as empty)', fakeAsync(() => {
      const api = new FakeApi();
      api.getById = () =>
        of({
          ...EXISTING,
          currency: { id: 31, isoCode: 'PLN' } as never,
          serviceType: { id: 21, name: 'Product placement' } as never,
          platforms: new Set([{ id: 1, name: 'Instagram' }]) as never,
          contentTypes: new Set([{ id: 11, name: 'Reel' }]) as never,
          followersMin: 0,
          followersMax: 20000,
          startDate: '2026-09-03T00:00:00',
        });
      const fixture = create(api, '7');
      tick();

      const form = fixture.componentInstance.form;
      expect(form.controls.currency.value).toBe(31);
      expect(form.controls.serviceType.value).toBe(21);
      expect(form.controls.platforms.value).toEqual([1]);
      expect(form.controls.contentTypes.value).toEqual([11]);
      expect(form.controls.followersMin.value).toBeNull(); // 0 = BE "not set"
      expect(form.controls.followersMax.value).toBe(20000);
      expect(form.controls.startDate.value?.getFullYear()).toBe(2026);
    }));

    it('uploading a photo appends it with CAMPAIGN_MEDIA; first photo is the cover', fakeAsync(() => {
      const api = new FakeApi();
      const upload = new FakeUpload();
      const fixture = create(api, null, makeSessionStub(), upload);
      tick();

      pickFile(fixture, 'a.jpg');
      tick();

      expect(upload.calls).toEqual([{ name: 'a.jpg', uploadType: 'CAMPAIGN_MEDIA' }]);
      // New photo carries the tracked uploadId + a display-only previewUrl.
      expect(fixture.componentInstance.photos()).toEqual([
        { uploadId: 'u1', previewUrl: 'https://cdn.example/p1.jpg', orderNumber: 0, isCover: true },
      ]);
    }));

    it('submits a new photo as {uploadId} — never a client URL (pentest 3.1)', fakeAsync(() => {
      const api = new FakeApi();
      const upload = new FakeUpload();
      const fixture = create(api, null, makeSessionStub(), upload);
      tick();
      spyRouterNavigate();
      fixture.componentInstance.form.patchValue({
        name: 'Test',
        title: 'Test public',
        city: 'Warszawa',
        street: 'Marszałkowska 12',
        postalCode: '00-001',
        country: 'PL',
      });
      pickFile(fixture, 'a.jpg');
      tick();

      fixture.componentInstance.submit();
      tick();

      const sentPhotos = api.createCalls[0]!.photos;
      expect(sentPhotos).toEqual([{ uploadId: 'u1', orderNumber: 0, isCover: true }]);
      // The previewUrl / any client URL must NOT be on the wire.
      expect(JSON.stringify(sentPhotos)).not.toContain('cdn.example');
    }));

    it('removing a photo reindexes and shifts the cover to the new first', fakeAsync(() => {
      const fixture = create(new FakeApi());
      tick();
      fixture.componentInstance.photos.set([
        { previewUrl: 'u0', orderNumber: 0, isCover: true },
        { previewUrl: 'u1', orderNumber: 1, isCover: false },
        { previewUrl: 'u2', orderNumber: 2, isCover: false },
      ]);

      fixture.componentInstance.removePhoto(0);

      expect(fixture.componentInstance.photos()).toEqual([
        { previewUrl: 'u1', orderNumber: 0, isCover: true },
        { previewUrl: 'u2', orderNumber: 1, isCover: false },
      ]);
    }));

    it('edit populates photos from the DtoOut and always sends them on PATCH', fakeAsync(() => {
      const api = new FakeApi();
      api.getById = () =>
        of({
          ...EXISTING,
          photos: [
            { id: 61, url: 'https://cdn.example/old.jpg', orderNumber: 0, isCover: true },
          ] as never,
        });
      const fixture = create(api, '7');
      tick();
      spyRouterNavigate();

      // Existing photo → kept by id; the DtoOut url is preview-only.
      expect(fixture.componentInstance.photos()).toEqual([
        { id: 61, previewUrl: 'https://cdn.example/old.jpg', orderNumber: 0, isCover: true },
      ]);

      // Remove the only photo — an emptied list must still be SENT so the
      // removal persists (undefined would mean "do not touch" under PATCH).
      fixture.componentInstance.removePhoto(0);
      fixture.componentInstance.submit();
      tick();

      expect(api.updateCalls[0]!.dto.photos).toEqual([]);
    }));

    it('a failed upload surfaces the error key and appends nothing', fakeAsync(() => {
      const api = new FakeApi();
      const upload = new FakeUpload();
      upload.next = () => throwError(() => new Error('upload.errors.too_large'));
      const fixture = create(api, null, makeSessionStub(), upload);
      tick();

      pickFile(fixture);
      tick();

      expect(fixture.componentInstance.photoErrorKey()).toBe('upload.errors.too_large');
      expect(fixture.componentInstance.photos()).toEqual([]);
    }));

    it('followers range and date order validators gate the form', fakeAsync(() => {
      const fixture = create(new FakeApi());
      tick();
      const form = fixture.componentInstance.form;

      form.patchValue({ followersMin: 5000, followersMax: 100 });
      expect(form.hasError('followersRange')).toBe(true);
      form.patchValue({ followersMax: 10000 });
      expect(form.hasError('followersRange')).toBe(false);

      form.patchValue({ startDate: new Date(2026, 9, 1), endDate: new Date(2026, 8, 1) });
      expect(form.hasError('dateOrder')).toBe(true);
      form.patchValue({ endDate: new Date(2026, 10, 1) });
      expect(form.hasError('dateOrder')).toBe(false);
    }));
  });

  it('loads the campaign and populates the form in edit mode', fakeAsync(() => {
    const api = new FakeApi();
    const fixture = create(api, '7');
    tick();
    fixture.detectChanges();
    const c = fixture.componentInstance;
    expect(c.mode()).toBe('edit');
    expect(c.editingId()).toBe(7);
    expect(c.form.controls.name.value).toBe('Spring Promo Internal');
    expect(c.form.controls.title.value).toBe('Spring promo');
    expect(c.form.controls.compensationAmountMin.value).toBe(100);
  }));

  it('marks state not-found on 404', fakeAsync(() => {
    const api = new FakeApi();
    api.getById = () => throwError(() => ({ status: 404 }));
    const fixture = create(api, '7');
    tick();
    expect(fixture.componentInstance.state()).toBe('not-found');
  }));

  it('blocks submit when required fields are empty', () => {
    const api = new FakeApi();
    const fixture = create(api);
    fixture.componentInstance.submit();
    expect(api.createCalls.length).toBe(0);
    expect(fixture.componentInstance.form.controls.name.touched).toBe(true);
  });

  it('POSTs create with the right payload and navigates to detail', fakeAsync(() => {
    const api = new FakeApi();
    const fixture = create(api);
    const navigateSpy = spyRouterNavigate();
    fixture.componentInstance.form.patchValue({
      name: 'Test',
      title: 'Test public',
      city: 'Warszawa',
      street: 'Marszałkowska 12',
      postalCode: '00-001',
      country: 'PL',
    });
    fixture.componentInstance.submit();
    tick();
    expect(api.createCalls.length).toBe(1);
    expect(api.createCalls[0]).toMatchObject({
      name: 'Test',
      title: 'Test public',
      active: true,
      address: {
        street: 'Marszałkowska 12',
        city: 'Warszawa',
        postalCode: '00-001',
        country: 'PL',
        addressType: 'MAIN',
      },
    });
    expect(navigateSpy).toHaveBeenCalledWith(['/collaborations', 99]);
  }));

  it('PATCHes when editing and navigates to detail with the same id', fakeAsync(() => {
    const api = new FakeApi();
    const fixture = create(api, '7');
    tick();
    fixture.detectChanges();
    const navigateSpy = spyRouterNavigate();
    fixture.componentInstance.form.patchValue({ details: 'Updated brief' });
    fixture.componentInstance.submit();
    tick();
    expect(api.updateCalls.length).toBe(1);
    expect(api.updateCalls[0]!.id).toBe(7);
    expect(api.updateCalls[0]!.dto.details).toBe('Updated brief');
    expect(navigateSpy).toHaveBeenCalledWith(['/collaborations', 7]);
  }));

  it('surfaces an error key when save fails', fakeAsync(() => {
    const api = new FakeApi();
    api.create = () => throwError(() => ({ status: 500 }));
    const fixture = create(api);
    fixture.componentInstance.form.patchValue({
      name: 'X',
      title: 'Y',
      city: 'Z',
      street: 'Marszałkowska 1',
      postalCode: '00-001',
      country: 'PL',
    });
    fixture.componentInstance.submit();
    tick();
    expect(fixture.componentInstance.errorKey()).toBe('opportunities.form.error.save_failed');
  }));

  // Bug-hunt regression — P1 #181: if the session expired mid-form, the
  // pre-fix code would silently submit `company: 0` → BE 404 → generic
  // "save failed" toast. The fix bails out at submit() entry and redirects
  // to /auth/sign-in with a reason=session-expired query param.
  it('redirects to /auth/sign-in when session.user() is null at submit (no silent company:0)', fakeAsync(() => {
    const api = new FakeApi();
    const navigateSpy = jest.fn().mockResolvedValue(true);
    const fixture = create(api, null, makeSessionStub(null));
    const router = TestBed.inject(Router);
    jest.spyOn(router, 'navigate').mockImplementation(navigateSpy);

    fixture.componentInstance.form.patchValue({
      name: 'Test',
      title: 'Test public',
      city: 'Warszawa',
      street: 'Marszałkowska 12',
      postalCode: '00-001',
      country: 'PL',
    });
    fixture.componentInstance.submit();
    tick();

    expect(api.createCalls.length).toBe(0);
    expect(navigateSpy).toHaveBeenCalledWith(
      ['/auth/sign-in'],
      expect.objectContaining({
        queryParams: expect.objectContaining({ reason: 'session-expired' }),
      }),
    );
  }));

  // Bug-hunt regression — P1 #181 (B): if the BE returns 404 mid-request
  // (e.g. session got recycled between guard check and POST), the error
  // handler maps it to the session-expired redirect rather than a
  // generic save-failed toast.
  // Bug-hunt regression — P1 #182: when dto.city and dto.address.city
  // diverge on the BE side (legacy records), populateForm() must prefer
  // address.city so an edit-save round-trip doesn't silently overwrite
  // the inline-address value with the partnership-level one.
  it('populateForm prefers dto.address.city over dto.city when they diverge', fakeAsync(() => {
    const api = new FakeApi();
    api.getById = () =>
      of({
        ...EXISTING,
        city: 'Warsaw',
        address: {
          street: 'Marszałkowska 12',
          city: 'Warszawa',
          postalCode: '00-001',
          country: 'PL',
        } as never,
      });
    const fixture = create(api, '7');
    tick();
    fixture.detectChanges();
    expect(fixture.componentInstance.form.controls.city.value).toBe('Warszawa');
  }));

  it('redirects to /auth/sign-in when BE returns 404 (session recycled mid-request)', fakeAsync(() => {
    const api = new FakeApi();
    api.create = () => throwError(() => ({ status: 404 }));
    const fixture = create(api);
    const router = TestBed.inject(Router);
    const navigateSpy = jest.spyOn(router, 'navigate').mockResolvedValue(true);

    fixture.componentInstance.form.patchValue({
      name: 'X',
      title: 'Y',
      city: 'Z',
      street: 'Marszałkowska 1',
      postalCode: '00-001',
      country: 'PL',
    });
    fixture.componentInstance.submit();
    tick();

    expect(navigateSpy).toHaveBeenCalledWith(
      ['/auth/sign-in'],
      expect.objectContaining({
        queryParams: expect.objectContaining({ reason: 'session-expired' }),
      }),
    );
    expect(fixture.componentInstance.errorKey()).toBeNull();
  }));

  // 10-agent audit (iter-45) — P0 #1 regression. The form is intentionally
  // minimal (13 controls), but the BE DtoIn has many more fields
  // (followersMin/Max, currency, serviceType, platforms, contentTypes,
  // startDate, endDate, addressId). Before the snapshot-spread fix, edit
  // submit() built the PATCH body from form.getRawValue() alone — server-
  // set fields were silently nulled out and the Address FK rotated on
  // every save (orphans). Memory `feedback_patch_snapshot_spread`.
  describe('snapshot-spread on PATCH (iter-46 P0 #1 fix)', () => {
    it('preserves server-set fields not in the form (followersMin/Max, dates, dictionaries)', fakeAsync(() => {
      const api = new FakeApi();
      api.getById = () =>
        of({
          ...EXISTING,
          followersMin: 5_000,
          followersMax: 100_000,
          startDate: '2026-06-01',
          endDate: '2026-09-02',
          currency: { id: 3, value: 'PLN', label: 'PLN' } as never,
          serviceType: { id: 11, value: 'FASHION', label: 'Fashion' } as never,
          platforms: new Set([
            { id: 1, value: 'INSTAGRAM', label: 'Instagram' } as never,
            { id: 2, value: 'TIKTOK', label: 'TikTok' } as never,
          ]),
          contentTypes: new Set([{ id: 5, value: 'REEL', label: 'Reel' } as never]),
          version: 4,
        });
      const fixture = create(api, '7');
      tick();
      fixture.detectChanges();
      spyRouterNavigate();

      fixture.componentInstance.form.patchValue({ details: 'Edited brief' });
      fixture.componentInstance.submit();
      tick();

      expect(api.updateCalls.length).toBe(1);
      const sent = api.updateCalls[0]!.dto;
      // Form-edited field overlays the spread:
      expect(sent.details).toBe('Edited brief');
      // Server-set fields preserved (would have been nulled pre-fix). Since
      // #35a the dates round-trip through the date pickers (populate → Date
      // control → re-serialize), so the same date comes back in the BE's
      // canonical LocalDateTime shape rather than the raw pass-through string.
      expect(sent.followersMin).toBe(5_000);
      expect(sent.followersMax).toBe(100_000);
      expect(sent.startDate).toBe('2026-06-01T00:00:00');
      expect(sent.endDate).toBe('2026-09-02T00:00:00');
      // Dictionary FKs extracted from wrapper DTOs to ids — as runtime
      // ARRAYS (a Set instance would serialize to {} and wipe them; see
      // toWireSet in the component):
      expect(sent.platforms).toEqual([1, 2]);
      expect(sent.contentTypes).toEqual([5]);
      expect(sent.currency).toBe(3);
      expect(sent.serviceType).toBe(11);
      // Serialization guard — the wire body must carry JSON arrays:
      const wire = JSON.parse(JSON.stringify(sent)) as Record<string, unknown>;
      expect(wire['platforms']).toEqual([1, 2]);
      expect(wire['contentTypes']).toEqual([5]);
      // Optimistic-locking version round-tripped:
      expect(sent.version).toBe(4);
    }));

    it('passes addressId on PATCH so the Address FK does not rotate (orphan prevention)', fakeAsync(() => {
      const api = new FakeApi();
      api.getById = () =>
        of({
          ...EXISTING,
          address: {
            id: 42,
            street: 'Marszałkowska 12',
            city: 'Warszawa',
            postalCode: '00-001',
            country: 'PL',
          } as never,
        });
      const fixture = create(api, '7');
      tick();
      fixture.detectChanges();
      spyRouterNavigate();

      fixture.componentInstance.form.patchValue({ street: 'Nowa 99' });
      fixture.componentInstance.submit();
      tick();

      expect(api.updateCalls.length).toBe(1);
      const sent = api.updateCalls[0]!.dto;
      // address.id from DtoOut must propagate as addressId
      expect(sent.addressId).toBe(42);
      expect(sent.address?.street).toBe('Nowa 99');
    }));

    it('does NOT spread DtoOut into the create() path (only PATCH uses preserved fields)', fakeAsync(() => {
      const api = new FakeApi();
      const fixture = create(api); // create mode — no :id
      spyRouterNavigate();
      fixture.componentInstance.form.patchValue({
        name: 'Brand new',
        title: 'Public title',
        city: 'Warszawa',
        street: 'Marszałkowska 1',
        postalCode: '00-001',
        country: 'PL',
      });
      fixture.componentInstance.submit();
      tick();

      expect(api.createCalls.length).toBe(1);
      const sent = api.createCalls[0]!;
      // No originalDto exists in create mode, so no preserved fields:
      expect(sent.followersMin).toBeUndefined();
      expect(sent.followersMax).toBeUndefined();
      expect(sent.currency).toBeUndefined();
      expect(sent.platforms).toBeUndefined();
      expect(sent.version).toBeUndefined();
      expect(sent.addressId).toBeUndefined();
    }));

    it('always overwrites company from session even if DtoOut.company exists (CompanyPublicProfileDto incompatible with number FK)', fakeAsync(() => {
      const api = new FakeApi();
      api.getById = () =>
        of({
          ...EXISTING,
          // DtoOut.company is a CompanyPublicProfileDto object — must NOT
          // pass-through as the DtoIn.company number FK.
          company: { id: 99, name: 'Different Company' } as never,
        });
      const fixture = create(api, '7', makeSessionStub({ id: 42, email: 'company1@e2e.test' }));
      tick();
      fixture.detectChanges();
      spyRouterNavigate();

      fixture.componentInstance.form.patchValue({ details: 'edit' });
      fixture.componentInstance.submit();
      tick();

      expect(api.updateCalls[0]!.dto.company).toBe(42);
    }));
  });
});
