import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { TranslocoModule } from '@ngneat/transloco';
import { AddressApi } from '../../core/address/address.service';
import { UserApiService } from '../../core/user/user.service';
import type { AddressDtoIn } from '../../api/model/address-dto-in';
import { AddressDtoInAddressTypeEnum } from '../../api/model/address-dto-in';
import type { AddressNoUserDtoOut } from '../../api/model/address-no-user-dto-out';
import type { UserDtoOut } from '../../api/model/user-dto-out';

type State = 'loading' | 'loaded' | 'error';

interface AddressForm {
  street: FormControl<string>;
  city: FormControl<string>;
  postalCode: FormControl<string>;
  country: FormControl<string>;
  state: FormControl<string>;
  additionalInfo: FormControl<string>;
  addressType: FormControl<AddressDtoInAddressTypeEnum>;
  primary: FormControl<boolean>;
}

const ADDRESS_TYPES: readonly AddressDtoInAddressTypeEnum[] = [
  AddressDtoInAddressTypeEnum.MAIN,
  AddressDtoInAddressTypeEnum.BILLING,
  AddressDtoInAddressTypeEnum.SHIPPING,
  AddressDtoInAddressTypeEnum.SECONDARY,
  AddressDtoInAddressTypeEnum.TEMPORARY,
];

/**
 * Address management at `/user/settings/addresses`. Phase 3 Stage 2 C3
 * (list + create) extended in iter-99 with edit + delete: edit reuses
 * the same inline form pre-populated from the row (ProfileView's
 * view⇄edit idiom); delete is the two-step armed-confirm strip idiom
 * (same as content-review rejection) — no dialog for a single-row
 * destructive action.
 */
@Component({
  selector: 'app-addresses',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    TranslocoModule,
  ],
  templateUrl: './addresses.component.html',
})
export class AddressesComponent implements OnInit {
  private readonly userApi = inject(UserApiService);
  private readonly addressApi = inject(AddressApi);

  readonly state = signal<State>('loading');
  readonly user = signal<UserDtoOut | null>(null);
  readonly addresses = signal<readonly AddressNoUserDtoOut[]>([]);

  readonly addingMode = signal(false);
  readonly editingId = signal<number | null>(null);
  readonly deleteArmedId = signal<number | null>(null);
  readonly saving = signal(false);
  readonly saveErrorKey = signal<string | null>(null);

  readonly addressTypes = ADDRESS_TYPES;

  readonly form = new FormGroup<AddressForm>({
    street: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    city: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    postalCode: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    country: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    state: new FormControl('', { nonNullable: true }),
    additionalInfo: new FormControl('', { nonNullable: true }),
    addressType: new FormControl(AddressDtoInAddressTypeEnum.MAIN, { nonNullable: true }),
    primary: new FormControl(false, { nonNullable: true }),
  });

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.state.set('loading');
    this.userApi.getCurrent().subscribe({
      next: (dto) => {
        this.user.set(dto);
        this.addresses.set(dto.addresses ?? []);
        this.state.set('loaded');
      },
      error: () => this.state.set('error'),
    });
  }

  startAdd(): void {
    this.form.reset({
      street: '',
      city: '',
      postalCode: '',
      country: '',
      state: '',
      additionalInfo: '',
      addressType: AddressDtoInAddressTypeEnum.MAIN,
      primary: false,
    });
    this.saveErrorKey.set(null);
    this.editingId.set(null);
    this.addingMode.set(true);
  }

  startEdit(address: AddressNoUserDtoOut): void {
    if (address.id == null) return;
    this.form.reset({
      street: address.street ?? '',
      city: address.city ?? '',
      postalCode: address.postalCode ?? '',
      country: address.country ?? '',
      state: address.state ?? '',
      additionalInfo: address.additionalInfo ?? '',
      addressType:
        (address.addressType as AddressDtoInAddressTypeEnum) ?? AddressDtoInAddressTypeEnum.MAIN,
      primary: address.primary ?? false,
    });
    this.saveErrorKey.set(null);
    this.addingMode.set(false);
    this.deleteArmedId.set(null);
    this.editingId.set(address.id);
  }

  cancelAdd(): void {
    this.addingMode.set(false);
    this.editingId.set(null);
    this.saveErrorKey.set(null);
    this.form.enable();
  }

  /** Form submit dispatches by mode — edit patches, add creates. */
  save(): void {
    if (this.editingId() != null) {
      this.saveEdit();
    } else {
      this.saveNew();
    }
  }

  saveNew(): void {
    const u = this.user();
    if (!u || !u.id) {
      this.saveErrorKey.set('addresses.error.no_user');
      return;
    }
    if (this.form.invalid || this.saving()) return;

    this.saving.set(true);
    this.saveErrorKey.set(null);
    this.form.disable();

    const v = this.form.getRawValue();
    const dto: AddressDtoIn = {
      userId: u.id,
      street: v.street,
      city: v.city,
      postalCode: v.postalCode,
      country: v.country,
      state: v.state || undefined,
      additionalInfo: v.additionalInfo || undefined,
      addressType: v.addressType,
      primary: v.primary,
    };

    this.addressApi.createForUser(u.id, dto).subscribe({
      next: (created) => {
        // Append the new address to the list. The DTO from create
        // includes a `userId` field which the read view drops, but the
        // structural fields we display (street/city/etc.) are identical.
        const next: AddressNoUserDtoOut = {
          id: created.id,
          street: created.street,
          city: created.city,
          postalCode: created.postalCode,
          country: created.country,
          state: created.state,
          additionalInfo: created.additionalInfo,
          addressType: created.addressType?.toString(),
          primary: created.primary,
          createdTime: created.createdTime,
        };
        this.addresses.set([...this.addresses(), next]);
        this.saving.set(false);
        this.form.enable();
        this.addingMode.set(false);
      },
      error: (err: unknown) => {
        this.saving.set(false);
        this.form.enable();
        this.saveErrorKey.set(this.classifyError(err));
      },
    });
  }

  saveEdit(): void {
    const u = this.user();
    const id = this.editingId();
    if (!u || !u.id || id == null) return;
    if (this.form.invalid || this.saving()) return;

    this.saving.set(true);
    this.saveErrorKey.set(null);
    this.form.disable();

    const v = this.form.getRawValue();
    const dto: AddressDtoIn = {
      userId: u.id,
      street: v.street,
      city: v.city,
      postalCode: v.postalCode,
      country: v.country,
      state: v.state || undefined,
      additionalInfo: v.additionalInfo || undefined,
      addressType: v.addressType,
      primary: v.primary,
    };

    this.addressApi.patch(id, dto).subscribe({
      next: (updated) => {
        this.addresses.set(
          this.addresses().map((a) =>
            a.id === id
              ? {
                  ...a,
                  street: updated.street,
                  city: updated.city,
                  postalCode: updated.postalCode,
                  country: updated.country,
                  state: updated.state,
                  additionalInfo: updated.additionalInfo,
                  addressType: updated.addressType?.toString(),
                  primary: updated.primary,
                }
              : a,
          ),
        );
        this.saving.set(false);
        this.form.enable();
        this.editingId.set(null);
      },
      error: (err: unknown) => {
        this.saving.set(false);
        this.form.enable();
        this.saveErrorKey.set(this.classifyError(err, 'addresses.error.update_failed'));
      },
    });
  }

  armDelete(address: AddressNoUserDtoOut): void {
    if (address.id == null) return;
    this.deleteArmedId.set(address.id);
  }

  cancelDelete(): void {
    this.deleteArmedId.set(null);
  }

  confirmDelete(address: AddressNoUserDtoOut): void {
    const id = address.id;
    if (id == null || this.saving()) return;
    this.saving.set(true);
    this.saveErrorKey.set(null);
    this.addressApi.remove(id).subscribe({
      next: () => {
        this.addresses.set(this.addresses().filter((a) => a.id !== id));
        if (this.editingId() === id) this.cancelAdd();
        this.deleteArmedId.set(null);
        this.saving.set(false);
      },
      error: (err: unknown) => {
        this.deleteArmedId.set(null);
        this.saving.set(false);
        this.saveErrorKey.set(this.classifyError(err, 'addresses.error.delete_failed'));
      },
    });
  }

  private classifyError(err: unknown, fallback = 'addresses.error.create_failed'): string {
    if (err instanceof HttpErrorResponse) {
      if (err.status === 400) return 'addresses.error.invalid_input';
      if (err.status === 429) return 'addresses.error.rate_limited';
    }
    return fallback;
  }
}
