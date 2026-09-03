import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { TranslocoModule } from '@ngneat/transloco';
import {
  ConsentRecordDtoInActionEnum,
  ConsentRecordDtoInDocumentTypeEnum,
  type ConsentRecordDtoIn,
} from '../../api/model/consent-record-dto-in';
import type { LegalDocumentDtoOut } from '../../api/model/legal-document-dto-out';
import { LegalApiService } from '../../core/legal/legal-api.service';
import { ShellStatusService } from '../../core/shell/shell-status.service';
import { LegalClickwrapComponent } from '../../shared/components/legal-clickwrap/legal-clickwrap.component';

/**
 * Re-consent dialog for BLOCKED_DUE_TO_NOT_ACCEPTING_TERMS accounts
 * (legacy `ReconsentModalComponent` parity). Opened from the red shell
 * banner. Hosts the shared clickwrap (3 checkbox rows); the accept CTA
 * arms only when all three are checked, then POSTs the flow-B batch —
 * `/legal/consent/record-batch` with all 3 GRANTED records + click-proof
 * envelopes (the BE 400s on partial batches). On success the dialog
 * clears the shell blocked/consent state and closes with `true`; the
 * caller decides whether to re-probe the session.
 */
@Component({
  selector: 'app-reconsent-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    LegalClickwrapComponent,
    MatButtonModule,
    MatDialogModule,
    MatIconModule,
    MatProgressSpinnerModule,
    TranslocoModule,
  ],
  template: `
    <div class="max-w-lg p-1" data-testid="reconsent-dialog">
      <h2 mat-dialog-title class="!font-display !text-2xl !font-normal !text-ink">
        {{ 'legal.reconsent.title' | transloco }}
      </h2>
      <mat-dialog-content>
        <p class="text-sm text-slate2">{{ 'legal.reconsent.body' | transloco }}</p>
        @if (status.blockedDaysRemaining() !== null) {
          <p
            class="mt-2 font-mono text-[11px] uppercase tracking-[0.18em] text-amber-800"
            data-testid="reconsent-days-remaining"
          >
            {{
              'legal.reconsent.days_remaining' | transloco: { days: status.blockedDaysRemaining() }
            }}
          </p>
        }
        <div class="mt-4">
          <app-legal-clickwrap (allAccepted)="allAccepted.set($event)"></app-legal-clickwrap>
        </div>
        @if (errorKey(); as key) {
          <p role="alert" class="mt-3 text-sm text-red-700" data-testid="reconsent-error">
            {{ key | transloco }}
          </p>
        }
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-button type="button" mat-dialog-close data-testid="reconsent-cancel">
          {{ 'legal.reconsent.later' | transloco }}
        </button>
        <button
          mat-flat-button
          color="primary"
          type="button"
          [disabled]="!allAccepted() || submitting()"
          (click)="accept($event)"
          data-testid="reconsent-accept"
        >
          @if (submitting()) {
            <mat-spinner diameter="18" class="!mr-2 !inline-block"></mat-spinner>
          }
          {{ 'legal.reconsent.accept' | transloco }}
        </button>
      </mat-dialog-actions>
    </div>
  `,
})
export class ReconsentDialogComponent implements OnInit {
  private readonly legalApi = inject(LegalApiService);
  private readonly dialogRef = inject(MatDialogRef<ReconsentDialogComponent>);
  readonly status = inject(ShellStatusService);

  readonly allAccepted = signal(false);
  readonly submitting = signal(false);
  readonly errorKey = signal<string | null>(null);

  private documents: LegalDocumentDtoOut[] = [];

  ngOnInit(): void {
    // Fetch current documents for version + content-hash — the proof
    // envelope embeds the hash so the consent record pins the exact
    // document text the user saw.
    this.legalApi.getCurrentDocuments().subscribe({
      next: (docs) => {
        this.documents = docs;
      },
      error: () => {
        // The clickwrap surfaces its own load-error state; the accept CTA
        // stays disabled because allAccepted never fires.
      },
    });
  }

  accept(event: MouseEvent): void {
    if (!this.allAccepted() || this.submitting()) return;
    this.submitting.set(true);
    this.errorKey.set(null);

    const proofBase = {
      eventTrusted: event.isTrusted,
      timestamp: Date.now(),
      screenX: event.screenX,
      screenY: event.screenY,
    };
    const records: ConsentRecordDtoIn[] = [
      ConsentRecordDtoInDocumentTypeEnum.TERMS_OF_SERVICE,
      ConsentRecordDtoInDocumentTypeEnum.PRIVACY_POLICY,
      ConsentRecordDtoInDocumentTypeEnum.COOKIE_POLICY,
    ].map((documentType) => ({
      documentType,
      action: ConsentRecordDtoInActionEnum.GRANTED,
      proof: {
        ...proofBase,
        checkboxId: `reconsent-${documentType.toLowerCase()}`,
        documentHash: this.documents.find((d) => (d.type as string) === (documentType as string))
          ?.contentHash,
      },
    }));

    this.legalApi.recordConsentBatch(records).subscribe({
      next: () => {
        this.status.clearConsent();
        this.dialogRef.close(true);
      },
      error: () => {
        this.submitting.set(false);
        this.errorKey.set('legal.reconsent.error');
      },
    });
  }
}
