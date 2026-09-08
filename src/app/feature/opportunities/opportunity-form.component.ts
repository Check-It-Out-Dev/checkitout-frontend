import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import {
  AbstractControl,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MAT_DATE_LOCALE, provideNativeDateAdapter } from '@angular/material/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatRadioModule } from '@angular/material/radio';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoModule, TranslocoService } from '@ngneat/transloco';
import { forkJoin } from 'rxjs';
import { AddressDtoIn, AddressDtoInAddressTypeEnum } from '../../api/model/address-dto-in';
import { CompensationType } from '../../api/model/compensation-type';
import type { ContentTypeDtoOut } from '../../api/model/content-type-dto-out';
import type { CurrencyDtoOut } from '../../api/model/currency-dto-out';
import type { PartnershipOpportunityDtoIn } from '../../api/model/partnership-opportunity-dto-in';
import type { PartnershipOpportunityDtoOut } from '../../api/model/partnership-opportunity-dto-out';
import type { PartnershipOpportunityPhotoDtoIn } from '../../api/model/partnership-opportunity-photo-dto-in';

/**
 * View-model for a photo in the form. Exactly one of `id` (existing) /
 * `uploadId` (new) reaches the wire; `previewUrl` is display-only.
 */
interface PhotoRow {
  readonly id?: number;
  readonly uploadId?: string;
  readonly previewUrl: string;
  readonly orderNumber: number;
  readonly isCover: boolean;
}
import type { PlatformDto } from '../../api/model/platform-dto';
import type { ServiceTypeDtoOut } from '../../api/model/service-type-dto-out';
import { UploadType } from '../../core/api-frozen/hidden-models';
import { SessionStateService } from '../../core/auth/session-state.service';
import { OpportunityApiService } from '../../core/opportunities/opportunity.service';
import { OpportunityDictionariesApiService } from '../../core/opportunities/opportunity-dictionaries.service';
import { UploadService } from '../../core/upload/upload.service';

type Mode = 'create' | 'edit';
type LoadState = 'loading' | 'ready' | 'saving' | 'error' | 'not-found';

interface OpportunityFormShape {
  name: FormControl<string>;
  title: FormControl<string>;
  city: FormControl<string>;
  street: FormControl<string>;
  postalCode: FormControl<string>;
  country: FormControl<string>;
  details: FormControl<string>;
  requirements: FormControl<string>;
  compensationType: FormControl<CompensationType>;
  compensationAmountMin: FormControl<number | null>;
  compensationAmountMax: FormControl<number | null>;
  compensationDescription: FormControl<string>;
  currency: FormControl<number | null>;
  serviceType: FormControl<number | null>;
  platforms: FormControl<number[]>;
  contentTypes: FormControl<number[]>;
  followersMin: FormControl<number | null>;
  followersMax: FormControl<number | null>;
  startDate: FormControl<Date | null>;
  endDate: FormControl<Date | null>;
  active: FormControl<boolean>;
}

/**
 * The generated DtoIn types `platforms`/`contentTypes` as `Set<number>`,
 * mirroring the Java field — but the WIRE format is a JSON array, and
 * `JSON.stringify(new Set(...))` produces `{}` (an empty object), which
 * would silently wipe the collections on every write. The read side proves
 * the array reality (DtoOut "Sets" arrive as arrays; see
 * opportunities-list.contentTypeArray). So we keep a runtime ARRAY behind
 * the Set-typed field. Caught 2026-09-02 by a serialization ultracheck —
 * latent since iter-46 in the PATCH snapshot-preserve path.
 *
 * Defense-in-depth: `setToArrayInterceptor` (task #40) normalizes any REAL
 * Set that reaches an HTTP body app-wide, so a future slice that forgets
 * this boundary conversion still serializes correctly. This helper stays —
 * the request body should be right at the source, not rescued in transit.
 */
function toWireSet(ids: readonly number[]): Set<number> {
  return [...ids] as unknown as Set<number>;
}

/** Cross-field: followersMin must not exceed followersMax (both optional). */
const followersRangeValidator: ValidatorFn = (group: AbstractControl): ValidationErrors | null => {
  const min = group.get('followersMin')?.value;
  const max = group.get('followersMax')?.value;
  if (min == null || max == null) return null;
  return min <= max ? null : { followersRange: true };
};

/** Cross-field: startDate must not be after endDate (both optional). */
const dateOrderValidator: ValidatorFn = (group: AbstractControl): ValidationErrors | null => {
  const start = group.get('startDate')?.value as Date | null;
  const end = group.get('endDate')?.value as Date | null;
  if (!start || !end) return null;
  return start.getTime() <= end.getTime() ? null : { dateOrder: true };
};

/**
 * Stage 4 / E5 — Campaign create + edit (company side).
 *
 * Single component handles both `/collaborations/create` (mode = 'create')
 * and `/collaborations/edit/:id` (mode = 'edit'); the `:id` route param is
 * what differentiates them. On 'edit', the existing campaign is loaded via
 * `getById` and patched on submit; on 'create', a fresh DTO is POSTed.
 *
 * Audit-P1 parity pass (task #35a) expanded the once-minimal form to the
 * full DtoIn surface: currency + service-type selects, platform +
 * content-type multi-selects (FK dictionaries via
 * OpportunityDictionariesApiService), follower range and start/end date
 * pickers. Photos stay a separate slice — the DtoOut/DtoIn photo shapes
 * differ on the upload-key field and the PATCH path preserves them
 * server-side by omission (see dtoOutToPreservedDtoIn).
 *
 * The BE auto-resolves `company` from the session for non-admin actors so
 * the form does not collect it.
 */
@Component({
  selector: 'app-opportunity-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    provideNativeDateAdapter(),
    // The native adapter formats with the browser's default locale, which put
    // "9/21/2026" into a Polish form. Follow the UI language instead.
    {
      provide: MAT_DATE_LOCALE,
      useFactory: () => (inject(TranslocoService).getActiveLang() === 'pl' ? 'pl-PL' : 'en-GB'),
    },
  ],
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatDatepickerModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatRadioModule,
    MatSelectModule,
    MatSlideToggleModule,
    TranslocoModule,
  ],
  templateUrl: './opportunity-form.component.html',
})
export class OpportunityFormComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly api = inject(OpportunityApiService);
  private readonly session = inject(SessionStateService);
  private readonly dictionariesApi = inject(OpportunityDictionariesApiService);
  private readonly uploadService = inject(UploadService);

  /** FK dictionaries for the classification selects (loaded on init). */
  readonly platforms = signal<PlatformDto[]>([]);
  readonly contentTypes = signal<ContentTypeDtoOut[]>([]);
  readonly serviceTypes = signal<ServiceTypeDtoOut[]>([]);
  readonly currencies = signal<CurrencyDtoOut[]>([]);

  /** Campaign photos (task #37). A row is EITHER an existing photo (carries
   *  `id`, kept in place server-side) OR a freshly uploaded one (carries the
   *  tracked `uploadId` from the signed-URL pipeline). `previewUrl` is
   *  display-only — the BE derives the stored URL from id/uploadId and never
   *  trusts a client URL (pentest 3.1). Order/cover derive from array
   *  position at submit: index 0 is the cover. */
  readonly photos = signal<PhotoRow[]>([]);
  readonly uploadingPhoto = signal(false);
  readonly photoErrorKey = signal<string | null>(null);
  /** BE hard cap — PartnershipOpportunityService.MAX_PHOTOS. Mirrored so the
   *  add button disables instead of letting the save 400 on validation. */
  readonly MAX_PHOTOS = 6;

  readonly mode = signal<Mode>('create');
  readonly state = signal<LoadState>('ready');
  readonly editingId = signal<number | null>(null);
  readonly errorKey = signal<string | null>(null);

  /**
   * Snapshot of the loaded DtoOut on edit — used by `submit()` to preserve
   * server-set fields that the (intentionally minimal) form doesn't expose:
   * `followersMin/Max`, `currency`, `serviceType`, `platforms`,
   * `contentTypes`, `startDate`, `endDate`, `photos`, plus `address.id` for
   * FK stability. Without this snapshot the PATCH body — built from
   * `form.getRawValue()` alone — would silently null those server fields
   * on every edit and rotate the Address FK (orphans). See memory
   * `feedback_patch_snapshot_spread` for the canonical pattern.
   */
  private readonly originalDto = signal<PartnershipOpportunityDtoOut | null>(null);

  readonly compensationTypes: ReadonlyArray<CompensationType> = [
    CompensationType.CASH,
    CompensationType.BARTER,
  ];

  readonly form = new FormGroup<OpportunityFormShape>({
    name: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(255)],
    }),
    title: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(255)],
    }),
    // BE rejects POST /partnership-opportunity with NotBlank on city —
    // required for the campaign to be discoverable on the influencer
    // browse map. Free-text input for MVP; autocomplete via /api/city
    // landing later.
    city: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(120)],
    }),
    // BE Address entity is @NotNull on the partnership relation with 4 @NotBlank
    // string fields (street, address.city, postalCode, country). We reuse the
    // partnership.city control above as address.city when building the DTO in
    // submit(); the three controls below cover the remaining required fields.
    street: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(255)],
    }),
    postalCode: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(20)],
    }),
    country: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(100)],
    }),
    details: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(2000)] }),
    requirements: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(2000)],
    }),
    compensationType: new FormControl(CompensationType.CASH, {
      nonNullable: true,
      validators: [Validators.required],
    }),
    compensationAmountMin: new FormControl<number | null>(null),
    compensationAmountMax: new FormControl<number | null>(null),
    compensationDescription: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(1000)],
    }),
    currency: new FormControl<number | null>(null),
    serviceType: new FormControl<number | null>(null),
    platforms: new FormControl<number[]>([], { nonNullable: true }),
    contentTypes: new FormControl<number[]>([], { nonNullable: true }),
    followersMin: new FormControl<number | null>(null, { validators: [Validators.min(0)] }),
    followersMax: new FormControl<number | null>(null, { validators: [Validators.min(0)] }),
    startDate: new FormControl<Date | null>(null),
    endDate: new FormControl<Date | null>(null),
    active: new FormControl(true, { nonNullable: true }),
  });

  constructor() {
    this.form.addValidators([followersRangeValidator, dateOrderValidator]);
  }

  readonly isSubmitting = computed(() => this.state() === 'saving');
  readonly isEdit = computed(() => this.mode() === 'edit');

  ngOnInit(): void {
    const idParam = this.route.snapshot.paramMap.get('id');
    if (!idParam) {
      this.mode.set('create');
      this.loadDictionaries();
      return;
    }
    const id = Number(idParam);
    if (!id || Number.isNaN(id)) {
      this.state.set('not-found');
      return;
    }
    this.mode.set('edit');
    this.editingId.set(id);
    this.loadForEdit(id);
  }

  /** Loads the four FK dictionaries the classification selects need.
   *  A failure degrades gracefully: the selects render empty but the
   *  form itself stays usable (all four fields are optional). */
  private loadDictionaries(): void {
    forkJoin({
      platforms: this.dictionariesApi.platforms(),
      contentTypes: this.dictionariesApi.contentTypes(),
      serviceTypes: this.dictionariesApi.serviceTypes(),
      currencies: this.dictionariesApi.currencies(),
    }).subscribe({
      next: ({ platforms, contentTypes, serviceTypes, currencies }) => {
        this.platforms.set(platforms);
        this.contentTypes.set(contentTypes);
        this.serviceTypes.set(serviceTypes);
        this.currencies.set(currencies);
      },
      error: () => undefined,
    });
  }

  loadForEdit(id: number): void {
    this.state.set('loading');
    this.loadDictionaries();
    this.api.getById(id).subscribe({
      next: (dto) => {
        // Snapshot BEFORE populateForm — order doesn't matter functionally,
        // but doing it first makes the invariant ("originalDto is set
        // whenever editingId is set") obvious to readers.
        this.originalDto.set(dto);
        this.populateForm(dto);
        this.state.set('ready');
      },
      error: (err: { status?: number }) => {
        this.state.set(err?.status === 404 ? 'not-found' : 'error');
      },
    });
  }

  private populateForm(dto: PartnershipOpportunityDtoOut): void {
    const address = dto.address;
    // The `city` form control feeds BOTH `dto.city` AND `address.city` on
    // submit. On the BE side these can diverge (see AddressService) — older
    // records may have `dto.city="Warsaw"` while `address.city="Warszawa"`.
    // Prefer `address.city` when populating so an edit-save round-trip does
    // not silently overwrite the inline-address value with the partnership-
    // level one. Caught by ErdosPrimarch bug-hunt fork 2026-05-11.
    const resolvedCity = address?.city ?? dto.city ?? '';
    this.form.patchValue({
      name: dto.name ?? '',
      title: dto.title ?? '',
      city: resolvedCity,
      street: address?.street ?? '',
      postalCode: address?.postalCode ?? '',
      country: address?.country ?? '',
      details: dto.details ?? '',
      requirements: dto.requirements ?? '',
      compensationType:
        (dto.compensationType?.value as unknown as CompensationType) ?? CompensationType.CASH,
      compensationAmountMin: dto.compensationAmountMin ?? null,
      compensationAmountMax: dto.compensationAmountMax ?? null,
      compensationDescription: dto.compensationDescription ?? '',
      currency: dto.currency?.id ?? null,
      serviceType: dto.serviceType?.id ?? null,
      platforms: dto.platforms
        ? [...dto.platforms].map((p) => p.id).filter((id): id is number => id != null)
        : [],
      contentTypes: dto.contentTypes
        ? [...dto.contentTypes].map((c) => c.id).filter((id): id is number => id != null)
        : [],
      // BE stores 0 for "not set" on the follower bounds (primitive longs) —
      // render those as empty inputs, not a confusing 0–0 range.
      followersMin: dto.followersMin || null,
      followersMax: dto.followersMax || null,
      startDate: dto.startDate ? new Date(dto.startDate) : null,
      endDate: dto.endDate ? new Date(dto.endDate) : null,
      active: dto.active ?? true,
    });
    // Existing photos (edit): keep by `id`; the DtoOut `url` becomes the
    // preview only — it is never sent back (the BE owns the stored URL).
    this.photos.set(
      (dto.photos ?? [])
        .filter((p): p is typeof p & { url: string } => !!p.url)
        .map((p, i) => ({
          id: p.id,
          previewUrl: p.url,
          orderNumber: p.orderNumber ?? i,
          isCover: p.isCover ?? i === 0,
        })),
    );
  }

  /** Uploads a picked image via the signed-URL pipeline and appends it. */
  onPhotoSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ''; // allow re-picking the same file
    if (!file || this.uploadingPhoto() || this.photos().length >= this.MAX_PHOTOS) return;

    this.uploadingPhoto.set(true);
    this.photoErrorKey.set(null);
    this.uploadService.uploadImage(file, UploadType.CAMPAIGN_MEDIA).subscribe({
      next: (res) => {
        // New photo → carry the tracked uploadId; the BE derives the URL.
        this.photos.update((list) => [
          ...list,
          {
            uploadId: res.uploadId,
            previewUrl: res.publicUrl,
            orderNumber: list.length,
            isCover: list.length === 0,
          },
        ]);
        this.uploadingPhoto.set(false);
      },
      error: (err: unknown) => {
        const key = err instanceof Error ? err.message : '';
        this.photoErrorKey.set(key.startsWith('upload.errors.') ? key : 'upload.errors.unknown');
        this.uploadingPhoto.set(false);
      },
    });
  }

  /** Removes a photo; order + cover derive from position, so the remaining
   *  list reindexes and index 0 becomes the cover automatically. */
  removePhoto(index: number): void {
    this.photos.update((list) =>
      list
        .filter((_, i) => i !== index)
        .map((p, i) => ({ ...p, orderNumber: i, isCover: i === 0 })),
    );
  }

  /** LocalDateTime string the BE expects (date-only pickers → midnight). */
  private toLocalDateTime(d: Date | null): string | undefined {
    if (!d) return undefined;
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T00:00:00`;
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    // Session-expiry guard: if the cookie TTL elapsed while the user was
    // filling the form, `session.user()` returns null and the form would
    // silently submit `company: 0`, which the BE rejects as 404 (no User
    // with id=0). The user would see a generic "save failed" toast with
    // no hint that they need to re-authenticate. Bail out cleanly +
    // redirect to sign-in so the recovery path is obvious. Caught by
    // ErdosPrimarch bug-hunt fork 2026-05-11.
    const currentUser = this.session.user();
    if (!currentUser || currentUser.id == null) {
      this.router.navigate(['/auth/sign-in'], {
        queryParams: { reason: 'session-expired', returnTo: this.router.url },
      });
      return;
    }

    this.state.set('saving');
    this.errorKey.set(null);

    const raw = this.form.getRawValue();
    const editId = this.editingId();
    const original = this.originalDto();

    // ── Snapshot-spread (PATCH only) ──────────────────────────────────
    //
    // The form is intentionally minimal (13 controls) but the BE DTO has
    // many more (`followersMin/Max`, `currency`, `serviceType`,
    // `platforms`, `contentTypes`, `startDate`, `endDate`, `photos`).
    // Sending only the form-controlled fields on PATCH wipes the
    // server-set fields and rotates the Address FK (no `address.id` →
    // orphans). Memory `feedback_patch_snapshot_spread` codifies the
    // fix: spread the loaded DtoOut FIRST, then overlay edited fields.
    //
    // DtoOut → DtoIn conversion strips the wrapper-DTO layer for enum +
    // dictionary fields (`compensationType.value` → string;
    // `currency.id` → number FK; same for `serviceType`; `platforms` +
    // `contentTypes` sets of wrappers → sets of FK ids).
    const preserved: Partial<PartnershipOpportunityDtoIn> =
      editId != null && original != null ? this.dtoOutToPreservedDtoIn(original) : {};

    const address: AddressDtoIn = {
      // Preserve `address.id` if we have it — without this the BE
      // creates a new Address row on every save (FK rotation, orphans).
      // `address.id` is missing from AddressDtoIn (only addressId is
      // supported as a sibling field). The `id` arrives inside the
      // address-payload nested object via the DtoOut shape; we pass it
      // through addressId for stability.
      street: raw.street,
      city: raw.city,
      postalCode: raw.postalCode,
      country: raw.country,
      addressType: AddressDtoInAddressTypeEnum.MAIN,
    };

    const dto: PartnershipOpportunityDtoIn = {
      ...preserved,
      name: raw.name,
      title: raw.title,
      city: raw.city,
      address,
      ...(original?.address?.id != null ? { addressId: original.address.id } : {}),
      details: raw.details || undefined,
      requirements: raw.requirements || undefined,
      compensationType: raw.compensationType,
      compensationAmountMin: raw.compensationAmountMin ?? undefined,
      compensationAmountMax: raw.compensationAmountMax ?? undefined,
      compensationDescription: raw.compensationDescription || undefined,
      // Classification + audience + schedule (audit P1 #35a): the form now
      // owns these, overlaying whatever the snapshot preserved.
      currency: raw.currency ?? undefined,
      serviceType: raw.serviceType ?? undefined,
      platforms: raw.platforms.length > 0 ? toWireSet(raw.platforms) : undefined,
      contentTypes: raw.contentTypes.length > 0 ? toWireSet(raw.contentTypes) : undefined,
      followersMin: raw.followersMin ?? undefined,
      followersMax: raw.followersMax ?? undefined,
      startDate: this.toLocalDateTime(raw.startDate),
      endDate: this.toLocalDateTime(raw.endDate),
      // Photos (task #37): position defines order + cover. On EDIT we always
      // send the list — an emptied list must clear server-side (undefined
      // would mean "do not touch" under PATCH semantics). On CREATE an empty
      // list is simply omitted.
      photos:
        editId != null || this.photos().length > 0
          ? this.photos().map<PartnershipOpportunityPhotoDtoIn>((p, i) =>
              // Existing → {id}; new → {uploadId}. Never send previewUrl.
              p.id != null
                ? { id: p.id, orderNumber: i, isCover: i === 0 }
                : { uploadId: p.uploadId, orderNumber: i, isCover: i === 0 },
            )
          : undefined,
      active: raw.active,
      // User-as-Company model: `company` on the partnership DTO is the
      // user id of the owning COMPANY actor. Guaranteed populated here
      // by the session-expiry guard above. Always overwrite preserved
      // (CompanyPublicProfileDto would not deserialize as number).
      company: currentUser.id,
    };

    // Edit is a FULL replacement (the snapshot-spread builds a complete
    // DtoIn), so it rides PUT/update — the BE path that custom-handles
    // platforms/contentTypes/photos/address. The reflective PATCH path
    // cannot convert JSON arrays into the Set<> entity relations (500);
    // see OpportunityApiService.update.
    const request$ =
      editId != null ? this.api.update(editId, { ...dto, id: editId }) : this.api.create(dto);

    request$.subscribe({
      next: (result) => {
        this.state.set('ready');
        const targetId = result.id ?? editId;
        if (targetId != null) {
          this.router.navigate(['/collaborations', targetId]);
        } else {
          this.router.navigate(['/collaborations/list']);
        }
      },
      error: (err: { status?: number }) => {
        this.state.set('error');
        // Map BE 404 (User not found — usually means stale company id /
        // session got recycled mid-request) to the session-expired path
        // instead of the generic save-failed toast.
        if (err?.status === 404) {
          this.router.navigate(['/auth/sign-in'], {
            queryParams: { reason: 'session-expired', returnTo: this.router.url },
          });
          return;
        }
        this.errorKey.set('opportunities.form.error.save_failed');
      },
    });
  }

  /**
   * Convert a loaded DtoOut to the subset of DtoIn fields we want to
   * preserve on PATCH. Strips the wrapper-DTO layer on enum + dictionary
   * fields (DtoOut has `{value, label, originalLabel}` shapes; DtoIn
   * takes plain strings for enums and number FKs for dictionaries — see
   * memory `feedback_codegen_dto_in_out_enum_split`).
   *
   * Returns ONLY fields not in the form's control set. The caller
   * spreads this object FIRST so user-edited values overlay it.
   */
  private dtoOutToPreservedDtoIn(
    dto: PartnershipOpportunityDtoOut,
  ): Partial<PartnershipOpportunityDtoIn> {
    return {
      followersMin: dto.followersMin,
      followersMax: dto.followersMax,
      // Dictionary FKs — extract `.id` from wrapper DTOs.
      currency: dto.currency?.id,
      serviceType: dto.serviceType?.id,
      platforms: dto.platforms
        ? toWireSet([...dto.platforms].map((p) => p.id).filter((id): id is number => id != null))
        : undefined,
      contentTypes: dto.contentTypes
        ? toWireSet([...dto.contentTypes].map((c) => c.id).filter((id): id is number => id != null))
        : undefined,
      startDate: dto.startDate,
      endDate: dto.endDate,
      // photos: photos round-trip is a separate slice — DtoOut and
      // DtoIn photo shapes differ on the upload-key field. Omitting
      // photos here preserves them server-side because PATCH semantics
      // treat undefined as "do not touch". Verify with BE if changing.
      version: dto.version,
    };
  }
}
