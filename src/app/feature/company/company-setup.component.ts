import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { RouterLink } from '@angular/router';
import { TranslocoModule } from '@ngneat/transloco';
import type { CompanyDataConfirmResponse } from '../../api/model/company-data-confirm-response';
import type { NipLookupResponse } from '../../api/model/nip-lookup-response';
import { CompanyRegistryService } from '../../core/registry/registry.service';

type Phase = 'checking' | 'idle' | 'looking' | 'preview' | 'confirming' | 'done' | 'confirmed';

/**
 * Company onboarding at `/company/setup` — the FE surface of the registry
 * flow the BDD oracle proves end-to-end (registry-company-flow.feature):
 * NIP lookup against GUS/KRS/CEIDG → preview the aggregated company data →
 * confirm → auto-activation when the email is verified.
 *
 * States: on init we probe `companyData()` — a company that already confirmed
 * lands in the read-only `confirmed` view (re-running setup would 409 on its
 * own NIP). Lookup errors surface the BE's translated message (400 invalid
 * NIP inline, 404 not in GUS, 409 duplicate/inactive/role). After confirm,
 * `activated=true` celebrates ACTIVE; otherwise the account stays
 * IN_VALIDATION until the email is verified (mirrors the oracle's
 * with/without-emailVerified scenarios).
 */
@Component({
    selector: 'app-company-setup',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [
        CommonModule,
        ReactiveFormsModule,
        RouterLink,
        MatButtonModule,
        MatFormFieldModule,
        MatIconModule,
        MatInputModule,
        MatProgressSpinnerModule,
        TranslocoModule,
    ],
    templateUrl: './company-setup.component.html'
})
export class CompanySetupComponent implements OnInit {
  private readonly registry = inject(CompanyRegistryService);

  readonly phase = signal<Phase>('checking');
  readonly lookup = signal<NipLookupResponse | null>(null);
  readonly confirmResult = signal<CompanyDataConfirmResponse | null>(null);
  /** BE-translated error message for the last failed lookup/confirm. */
  readonly errorMessage = signal<string | null>(null);
  /** Confirmed data when the company already completed setup earlier. */
  readonly existing = signal<Record<string, unknown> | null>(null);

  readonly nip = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.pattern(/^\d{10}$/)],
  });

  readonly activated = computed(() => this.confirmResult()?.activated === true);

  /** One-line address assembled from the lookup's GUS fields. */
  readonly addressLine = computed(() => {
    const l = this.lookup();
    if (!l) return '';
    const street = [l.street, l.buildingNumber].filter(Boolean).join(' ');
    const flat = l.apartmentNumber ? `/${l.apartmentNumber}` : '';
    return [street + flat, [l.postalCode, l.city].filter(Boolean).join(' ')]
      .filter((part) => part.trim().length > 0)
      .join(', ');
  });

  ngOnInit(): void {
    // Already-confirmed guard: setup is a one-shot flow; re-confirming the
    // same NIP would 409. Show the stored data instead.
    this.registry.companyData().subscribe({
      next: (data) => {
        const record = (data ?? {}) as Record<string, unknown>;
        if (record && record['nip']) {
          this.existing.set(record);
          this.phase.set('confirmed');
        } else {
          this.phase.set('idle');
        }
      },
      error: () => this.phase.set('idle'),
    });
  }

  verify(): void {
    if (this.nip.invalid) {
      this.nip.markAsTouched();
      return;
    }
    this.phase.set('looking');
    this.errorMessage.set(null);
    this.registry.lookup(this.nip.value).subscribe({
      next: (res) => {
        this.lookup.set(res);
        this.phase.set('preview');
      },
      error: (err: { error?: { message?: string } }) => {
        this.errorMessage.set(err.error?.message ?? null);
        this.phase.set('idle');
      },
    });
  }

  confirm(): void {
    this.phase.set('confirming');
    this.errorMessage.set(null);
    this.registry.confirm(this.nip.value).subscribe({
      next: (res) => {
        this.confirmResult.set(res);
        this.phase.set('done');
      },
      error: (err: { error?: { message?: string } }) => {
        this.errorMessage.set(err.error?.message ?? null);
        this.phase.set('preview');
      },
    });
  }

  startOver(): void {
    this.lookup.set(null);
    this.errorMessage.set(null);
    this.phase.set('idle');
  }
}
