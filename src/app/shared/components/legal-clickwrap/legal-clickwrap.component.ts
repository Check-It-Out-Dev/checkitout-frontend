import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  OnInit,
  Output,
  computed,
  inject,
  signal,
} from '@angular/core';
import { MatCheckboxChange, MatCheckboxModule } from '@angular/material/checkbox';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { TranslocoModule } from '@ngneat/transloco';
import type { ConsentProofDtoIn } from '../../../api/model/consent-proof-dto-in';
import type { LegalDocumentDtoOut } from '../../../api/model/legal-document-dto-out';
import { LegalDocumentType } from '../../../api/model/legal-document-type';
import { LegalApiService } from '../../../core/legal/legal-api.service';

interface ClickwrapDocument {
  readonly type: LegalDocumentType;
  /** i18n key for the inline link text. */
  readonly linkKey: string;
  /** Public URL the link opens in a new tab. */
  readonly downloadUrl: string;
  readonly version: number;
  readonly contentHash: string;
}

type CheckboxState = 'idle' | 'preparing' | 'accepted' | 'failed';

const REQUIRED_TYPES: readonly LegalDocumentType[] = [
  LegalDocumentType.TERMS_OF_SERVICE,
  LegalDocumentType.PRIVACY_POLICY,
  LegalDocumentType.COOKIE_POLICY,
];

const LINK_KEYS: Record<LegalDocumentType, string> = {
  [LegalDocumentType.TERMS_OF_SERVICE]: 'auth.legal_clickwrap.terms_link',
  [LegalDocumentType.PRIVACY_POLICY]: 'auth.legal_clickwrap.privacy_link',
  [LegalDocumentType.COOKIE_POLICY]: 'auth.legal_clickwrap.cookie_link',
  [LegalDocumentType.SUBSCRIPTION_ACTIVATION_CONSENT]: '',
  [LegalDocumentType.DATA_RETENTION_POLICY]: '',
};

const LABEL_KEYS: Record<LegalDocumentType, string> = {
  [LegalDocumentType.TERMS_OF_SERVICE]: 'auth.legal_clickwrap.terms_label',
  [LegalDocumentType.PRIVACY_POLICY]: 'auth.legal_clickwrap.privacy_label',
  [LegalDocumentType.COOKIE_POLICY]: 'auth.legal_clickwrap.cookie_label',
  [LegalDocumentType.SUBSCRIPTION_ACTIVATION_CONSENT]: '',
  [LegalDocumentType.DATA_RETENTION_POLICY]: '',
};

const CHECKBOX_IDS: Record<LegalDocumentType, string> = {
  [LegalDocumentType.TERMS_OF_SERVICE]: 'tos-checkbox',
  [LegalDocumentType.PRIVACY_POLICY]: 'pp-checkbox',
  [LegalDocumentType.COOKIE_POLICY]: 'cp-checkbox',
  [LegalDocumentType.SUBSCRIPTION_ACTIVATION_CONSENT]: '',
  [LegalDocumentType.DATA_RETENTION_POLICY]: '',
};

/**
 * 3-document clickwrap shown on every sign-up form (business +
 * influencer + future flows). Wraps the three mat-checkbox
 * (TERMS_OF_SERVICE + PRIVACY_POLICY + COOKIE_POLICY) and on each click
 * does a `POST /legal/consent/prepare` so BE has the HMAC-signed cookie
 * before the user submits the registration form.
 *
 * Without these cookies BE returns 400 with `error.consent.required` on
 * `/auth/firebase/register` — so the parent form MUST gate submit on
 * `(allAccepted)` emitting `true`.
 *
 * Click-proof bundle (`isTrusted` flag, click coords, viewport, doc
 * hash) lands in `consent_record.consent_proof` JSONB on the BE for
 * GDPR-audit defense. We capture it on `mousedown` because by `change`
 * event time the synthetic-vs-real distinction is gone.
 */
@Component({
  selector: 'app-legal-clickwrap',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatCheckboxModule, MatProgressSpinnerModule, TranslocoModule],
  template: `
    <div class="flex flex-col gap-2" data-testid="legal-clickwrap">
      @if (loading()) {
        <div class="flex items-center justify-center py-3">
          <mat-spinner diameter="20"></mat-spinner>
        </div>
      } @else if (loadError()) {
        <p class="text-sm text-red-700" role="alert" data-testid="legal-clickwrap-load-error">
          {{ 'auth.legal_clickwrap.load_error' | transloco }}
        </p>
      } @else {
        @for (doc of documents(); track doc.type) {
          <label
            class="flex items-start gap-2 text-sm"
            [attr.data-testid]="'legal-clickwrap-row-' + checkboxId(doc.type)"
          >
            <mat-checkbox
              [id]="checkboxId(doc.type)"
              [checked]="state(doc.type) === 'accepted'"
              [disabled]="state(doc.type) === 'preparing'"
              (mousedown)="captureClickProof($event, checkboxId(doc.type))"
              (change)="onCheckboxChange($event, doc)"
              color="primary"
              [attr.data-testid]="'legal-clickwrap-' + checkboxId(doc.type)"
            ></mat-checkbox>
            <span class="flex-1">
              {{ labelKey(doc.type) | transloco }}
              <a
                [href]="doc.downloadUrl"
                target="_blank"
                rel="noopener noreferrer"
                class="font-medium text-coral-600 hover:underline"
                (click)="$event.stopPropagation()"
              >
                {{ linkKey(doc.type) | transloco }}
              </a>
              @if (state(doc.type) === 'preparing') {
                <mat-spinner diameter="14" class="ml-1 inline-block"></mat-spinner>
              }
            </span>
          </label>
        }
        @if (prepareError()) {
          <p class="text-xs text-red-700" role="alert" data-testid="legal-clickwrap-prepare-error">
            {{ 'auth.legal_clickwrap.prepare_error' | transloco }}
          </p>
        }
      }
    </div>
  `,
})
export class LegalClickwrapComponent implements OnInit {
  private readonly legalApi = inject(LegalApiService);

  /** Emits `true` when all 3 required documents are accepted, `false` otherwise. */
  @Output() readonly allAccepted = new EventEmitter<boolean>();

  readonly loading = signal(true);
  readonly loadError = signal(false);
  readonly prepareError = signal(false);
  readonly documents = signal<ClickwrapDocument[]>([]);
  /** Per-document state machine. */
  private readonly checkboxState = signal<Record<LegalDocumentType, CheckboxState>>({
    [LegalDocumentType.TERMS_OF_SERVICE]: 'idle',
    [LegalDocumentType.PRIVACY_POLICY]: 'idle',
    [LegalDocumentType.COOKIE_POLICY]: 'idle',
    [LegalDocumentType.SUBSCRIPTION_ACTIVATION_CONSENT]: 'idle',
    [LegalDocumentType.DATA_RETENTION_POLICY]: 'idle',
  });

  /** True when every required doc reached `accepted`. */
  readonly isValid = computed(() =>
    REQUIRED_TYPES.every((t) => this.checkboxState()[t] === 'accepted'),
  );

  private readonly clickProof = new Map<
    string,
    { isTrusted: boolean; screenX: number; screenY: number }
  >();

  ngOnInit(): void {
    this.legalApi.getCurrentDocuments().subscribe({
      next: (docs) => {
        // BE returns one doc per (type, language) — typically 6 entries
        // when both PL + EN variants exist. We only render ONE row per
        // consent type (the label is i18n-resolved, not language-tagged
        // on the doc itself). Dedupe by type, keep the first occurrence
        // per BE return order (BE sorts by `language` matching the
        // request's Accept-Language → the user's locale lands first).
        // Without this dedupe the clickwrap renders 6 checkboxes with
        // identical labels but PDF links pointing at different locales —
        // caught in R7 smoke + Stage 6g parity sweep 2026-05-13.
        const seenTypes = new Set<LegalDocumentType>();
        // The codegen splits the document-type enum per usage site
        // (LegalDocumentType vs LegalDocumentDtoOutTypeEnum) with identical
        // string members, so the two nominal enums are unrelated to TS and
        // an intersection of both collapses to `never`. Cast once at the
        // boundary (established pattern — see profile-view saveEdit).
        const docType = (doc: LegalDocumentDtoOut): LegalDocumentType | undefined =>
          doc.type as unknown as LegalDocumentType | undefined;
        const deduped = (docs ?? [])
          .filter((doc) => {
            const t = docType(doc);
            return t !== undefined && REQUIRED_TYPES.includes(t);
          })
          .filter((doc) => {
            const t = docType(doc) as LegalDocumentType;
            if (seenTypes.has(t)) return false;
            seenTypes.add(t);
            return true;
          })
          .map((doc): ClickwrapDocument => {
            const t = docType(doc) as LegalDocumentType;
            return {
              type: t,
              version: doc.version ?? 0,
              contentHash: doc.contentHash ?? '',
              downloadUrl: doc.downloadUrl ?? '',
              linkKey: LINK_KEYS[t] || '',
            };
          });

        if (deduped.length < REQUIRED_TYPES.length) {
          this.loadError.set(true);
          this.loading.set(false);
          return;
        }

        // Sort to match REQUIRED_TYPES display order.
        deduped.sort((a, b) => REQUIRED_TYPES.indexOf(a.type) - REQUIRED_TYPES.indexOf(b.type));
        this.documents.set(deduped);
        this.loading.set(false);
      },
      error: () => {
        this.loadError.set(true);
        this.loading.set(false);
      },
    });
  }

  state(type: LegalDocumentType): CheckboxState {
    return this.checkboxState()[type];
  }

  checkboxId(type: LegalDocumentType): string {
    return CHECKBOX_IDS[type];
  }

  labelKey(type: LegalDocumentType): string {
    return LABEL_KEYS[type];
  }

  linkKey(type: LegalDocumentType): string {
    return LINK_KEYS[type];
  }

  captureClickProof(event: MouseEvent, checkboxId: string): void {
    this.clickProof.set(checkboxId, {
      isTrusted: event.isTrusted,
      screenX: event.screenX,
      screenY: event.screenY,
    });
  }

  onCheckboxChange(event: MatCheckboxChange, doc: ClickwrapDocument): void {
    if (!event.checked) {
      // Uncheck — reset to idle. We don't have an "unprepare" endpoint;
      // the cookie expires after 1h or on next register attempt anyway.
      this.setState(doc.type, 'idle');
      this.emitValidity();
      return;
    }

    this.prepareError.set(false);
    this.setState(doc.type, 'preparing');

    const checkboxId = CHECKBOX_IDS[doc.type];
    const captured = this.clickProof.get(checkboxId);
    const proof: ConsentProofDtoIn = {
      timestamp: Date.now(),
      eventTrusted: captured?.isTrusted ?? false,
      screenX: captured?.screenX,
      screenY: captured?.screenY,
      checkboxId,
      documentHash: doc.contentHash,
    };

    this.legalApi
      .prepareConsentCookie({
        documentType: doc.type,
        version: doc.version,
        documentHash: doc.contentHash,
        proof,
      })
      .subscribe({
        next: () => {
          this.setState(doc.type, 'accepted');
          this.emitValidity();
        },
        error: () => {
          this.setState(doc.type, 'failed');
          this.prepareError.set(true);
          this.emitValidity();
        },
      });
  }

  private setState(type: LegalDocumentType, state: CheckboxState): void {
    this.checkboxState.update((prev) => ({ ...prev, [type]: state }));
  }

  private emitValidity(): void {
    this.allAccepted.emit(this.isValid());
  }
}
