import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { TranslocoModule } from '@ngneat/transloco';
import type { UserPreferencesDtoIn } from '../../api/model/user-preferences-dto-in';
import { UserPreferencesDtoInCommunicationFrequencyEnum } from '../../api/model/user-preferences-dto-in';
import type { UserPreferencesDtoOut } from '../../api/model/user-preferences-dto-out';
import { PreferencesApiService } from '../../core/preferences/preferences.service';

type State = 'loading' | 'loaded' | 'error';
type Frequency = UserPreferencesDtoInCommunicationFrequencyEnum;

interface PrefsForm {
  notificationEmailEnabled: FormControl<boolean>;
  notificationPushEnabled: FormControl<boolean>;
  notificationSmsEnabled: FormControl<boolean>;
  notificationPartnershipEnabled: FormControl<boolean>;
  notificationSupportEnabled: FormControl<boolean>;
  notificationSystemEnabled: FormControl<boolean>;
  notificationEmailPartnershipEnabled: FormControl<boolean>;
  notificationEmailSupportEnabled: FormControl<boolean>;
  communicationFrequency: FormControl<Frequency>;
  timezone: FormControl<string>;
  gdprMarketingConsent: FormControl<boolean>;
  sharePhoneForPayments: FormControl<boolean>;
}

/** Curated IANA zones for the select; an exotic persisted value is
 *  prepended at load so it never silently disappears from the form. */
const COMMON_TIMEZONES: readonly string[] = [
  'UTC',
  'Europe/Warsaw',
  'Europe/London',
  'Europe/Berlin',
  'America/New_York',
  'America/Los_Angeles',
  'Asia/Tokyo',
  'Australia/Sydney',
];

/**
 * Notification + GDPR preferences at `/user/settings/preferences`.
 *
 * Stage 2 slice C4 covered the base channels/categories + GDPR marketing.
 * Audit-P1 parity pass (task #35b) added the rest of what the BE persists:
 * SMS channel (UX-gated on `sharePhoneForPayments` — no phone shared, no
 * SMS), the per-channel×category email pair, communication frequency
 * (EmailFrequency enum) and timezone. Still out of scope by design:
 * 2FA toggle (security page, step-up), language (Transloco drives it
 * client-side), dark mode (shell theme toggle).
 *
 * Save semantics: every change is part of one save batch. No auto-save
 * on toggle — explicit Save keeps the BE write count predictable + lets
 * the user undo a stray click before committing.
 */
@Component({
  selector: 'app-preferences',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatDividerModule,
    MatFormFieldModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    MatSlideToggleModule,
    TranslocoModule,
  ],
  templateUrl: './preferences.component.html',
})
export class PreferencesComponent implements OnInit {
  private readonly api = inject(PreferencesApiService);

  readonly state = signal<State>('loading');
  readonly saving = signal(false);
  readonly saveErrorKey = signal<string | null>(null);
  /** Snapshot of the BE record so we can preserve unrelated fields on PATCH. */
  readonly snapshot = signal<UserPreferencesDtoOut | null>(null);

  readonly form = new FormGroup<PrefsForm>({
    notificationEmailEnabled: new FormControl(true, { nonNullable: true }),
    notificationPushEnabled: new FormControl(true, { nonNullable: true }),
    notificationSmsEnabled: new FormControl(false, { nonNullable: true }),
    notificationPartnershipEnabled: new FormControl(true, { nonNullable: true }),
    notificationSupportEnabled: new FormControl(true, { nonNullable: true }),
    notificationSystemEnabled: new FormControl(true, { nonNullable: true }),
    notificationEmailPartnershipEnabled: new FormControl(true, { nonNullable: true }),
    notificationEmailSupportEnabled: new FormControl(true, { nonNullable: true }),
    communicationFrequency: new FormControl<Frequency>(
      UserPreferencesDtoInCommunicationFrequencyEnum.WEEKLY_DIGEST,
      { nonNullable: true },
    ),
    timezone: new FormControl('UTC', { nonNullable: true }),
    gdprMarketingConsent: new FormControl(false, { nonNullable: true }),
    sharePhoneForPayments: new FormControl(false, { nonNullable: true }),
  });

  /** Frequency options for the select, in escalating-noise order. */
  readonly frequencies: readonly Frequency[] = [
    UserPreferencesDtoInCommunicationFrequencyEnum.IMMEDIATE,
    UserPreferencesDtoInCommunicationFrequencyEnum.HOURLY_DIGEST,
    UserPreferencesDtoInCommunicationFrequencyEnum.DAILY_DIGEST,
    UserPreferencesDtoInCommunicationFrequencyEnum.WEEKLY_DIGEST,
  ];

  /** Timezone options; an exotic persisted zone is prepended at load. */
  readonly timezones = signal<readonly string[]>(COMMON_TIMEZONES);

  constructor() {
    // No phone shared → no SMS: turning sharePhoneForPayments off force-
    // disables (and unchecks) the SMS channel; turning it on re-enables it.
    this.form.controls.sharePhoneForPayments.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.applySmsGate());
  }

  private applySmsGate(): void {
    const sms = this.form.controls.notificationSmsEnabled;
    if (this.form.controls.sharePhoneForPayments.value) {
      if (sms.disabled) sms.enable({ emitEvent: false });
    } else {
      if (sms.value) sms.setValue(false);
      if (sms.enabled) sms.disable({ emitEvent: false });
    }
  }

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.state.set('loading');
    this.api.getMine().subscribe({
      next: (dto) => {
        this.snapshot.set(dto);
        const tz = dto.timezone ?? 'UTC';
        if (!COMMON_TIMEZONES.includes(tz)) {
          this.timezones.set([tz, ...COMMON_TIMEZONES]);
        }
        this.form.reset({
          notificationEmailEnabled: dto.notificationEmailEnabled ?? true,
          notificationPushEnabled: dto.notificationPushEnabled ?? true,
          notificationSmsEnabled: dto.notificationSmsEnabled ?? false,
          notificationPartnershipEnabled: dto.notificationPartnershipEnabled ?? true,
          notificationSupportEnabled: dto.notificationSupportEnabled ?? true,
          notificationSystemEnabled: dto.notificationSystemEnabled ?? true,
          notificationEmailPartnershipEnabled: dto.notificationEmailPartnershipEnabled ?? true,
          notificationEmailSupportEnabled: dto.notificationEmailSupportEnabled ?? true,
          communicationFrequency:
            (dto.communicationFrequency as Frequency | undefined) ??
            UserPreferencesDtoInCommunicationFrequencyEnum.WEEKLY_DIGEST,
          timezone: tz,
          gdprMarketingConsent: dto.gdprMarketingConsent ?? false,
          sharePhoneForPayments: dto.sharePhoneForPayments ?? false,
        });
        this.applySmsGate();
        this.state.set('loaded');
      },
      error: () => this.state.set('error'),
    });
  }

  save(): void {
    if (this.form.invalid || this.saving()) return;

    this.saving.set(true);
    this.saveErrorKey.set(null);
    this.form.disable();

    const v = this.form.getRawValue();
    const base = this.snapshot() ?? {};
    // PATCH preserves unrelated fields from the loaded snapshot (dark mode,
    // language, 2FA — surfaces owned by other pages) while sending every
    // field this form edits.
    const dto: UserPreferencesDtoIn = {
      ...base,
      notificationEmailEnabled: v.notificationEmailEnabled,
      notificationPushEnabled: v.notificationPushEnabled,
      notificationSmsEnabled: v.notificationSmsEnabled,
      notificationPartnershipEnabled: v.notificationPartnershipEnabled,
      notificationSupportEnabled: v.notificationSupportEnabled,
      notificationSystemEnabled: v.notificationSystemEnabled,
      notificationEmailPartnershipEnabled: v.notificationEmailPartnershipEnabled,
      notificationEmailSupportEnabled: v.notificationEmailSupportEnabled,
      communicationFrequency: v.communicationFrequency,
      timezone: v.timezone,
      gdprMarketingConsent: v.gdprMarketingConsent,
      sharePhoneForPayments: v.sharePhoneForPayments,
    } as UserPreferencesDtoIn;

    this.api.patchMine(dto).subscribe({
      next: (updated) => {
        this.snapshot.set(updated);
        this.saving.set(false);
        this.form.enable();
        this.applySmsGate(); // form.enable() re-enables SMS — re-apply the gate
        this.form.markAsPristine();
      },
      error: (err: unknown) => {
        this.saving.set(false);
        this.form.enable();
        this.applySmsGate();
        this.saveErrorKey.set(this.classifyError(err));
      },
    });
  }

  private classifyError(err: unknown): string {
    if (err instanceof HttpErrorResponse) {
      if (err.status === 400) return 'preferences.error.invalid_input';
      if (err.status === 429) return 'preferences.error.rate_limited';
    }
    return 'preferences.error.save_failed';
  }
}
