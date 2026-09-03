import { CommonModule, DatePipe } from '@angular/common';
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
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslocoModule } from '@ngneat/transloco';
import { forkJoin } from 'rxjs';
import type { AppliedOpportunityContentDtoIn } from '../../api/model/applied-opportunity-content-dto-in';
import type { AppliedOpportunityContentDtoOut } from '../../api/model/applied-opportunity-content-dto-out';
import type { ContentTypeDtoOut } from '../../api/model/content-type-dto-out';
import { AppliedOpportunityContentApiService } from '../../core/applied-opportunities/applied-opportunity-content.service';

type LoadState = 'loading' | 'ready' | 'error' | 'not-found';

interface SubmissionFormShape {
  contentTypeId: FormControl<number | null>;
  contentCount: FormControl<number | null>;
  socialMediaLink: FormControl<string>;
  description: FormControl<string>;
  tags: FormControl<string>;
}

/**
 * Schemes explicitly forbidden in user-submitted URLs. `javascript:` +
 * `vbscript:` are the canonical XSS vectors when a stored URL is rendered
 * as `<a [href]>`. `data:` can ship inline HTML/script. `file:` exposes
 * local filesystem. The rest (about:, chrome:, blob:) are browser-
 * internal schemes that have no business in a campaign-content URL.
 *
 * The Angular HTML sanitizer DOES sanitize `[href]` bindings (turns
 * `javascript:...` into `unsafe:javascript:...`), so the display side has
 * a safety net. We still reject at input time for (a) better UX (immediate
 * feedback) (b) cleaner BE data + audit trail (c) defense-in-depth
 * (cookie-banner-style assumption that sanitization is the LAST line of
 * defense, not the only one).
 */
const FORBIDDEN_URL_SCHEMES: ReadonlySet<string> = new Set([
  'javascript',
  'vbscript',
  'data',
  'file',
  'about',
  'chrome',
  'blob',
  'mailto',
  'tel',
]);

/**
 * Validator for the influencer-submitted "social media link" field.
 *
 * Accepts:
 * - Empty / null / undefined (the field is optional)
 * - `http://...` and `https://...` URLs that parse via the global `URL`
 *   constructor
 *
 * Rejects (returns `{ unsafeScheme: true }` or `{ invalidUrl: true }`):
 * - `javascript:`, `data:`, `vbscript:`, `file:`, `about:`, `chrome:`,
 *   `blob:`, `mailto:`, `tel:` schemes
 * - Strings that aren't parseable as URLs
 * - URLs without a scheme (e.g. `instagram.com/foo` — ambiguous; could be
 *   treated as a relative path if rendered into `[href]`)
 *
 * Iter-47 P0 #2 fix per 10-agent audit (a8a022a). Closes the stored-XSS
 * vector where a malicious influencer could submit `javascript:alert(1)`
 * → company-side review renders `<a [href]>` → click pops a script in
 * the company-reviewer's session.
 */
export function safeHttpsUrl(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const value = (control.value ?? '').toString().trim();
    if (value === '') return null; // optional field

    let parsed: URL;
    try {
      parsed = new URL(value);
    } catch {
      return { invalidUrl: true };
    }

    // protocol includes the trailing colon (e.g. "https:"). Strip + lowercase.
    const scheme = parsed.protocol.replace(/:$/, '').toLowerCase();
    if (FORBIDDEN_URL_SCHEMES.has(scheme)) {
      return { unsafeScheme: true };
    }
    if (scheme !== 'http' && scheme !== 'https') {
      // Any other scheme (ftp, ws, gopher, custom) — reject. We only
      // expect social-media web links here.
      return { unsafeScheme: true };
    }

    return null;
  };
}

/**
 * The publication link is where the influencer posted the content — an
 * https Instagram or TikTok URL. This mirrors the backend's authoritative
 * `@SocialPostUrl` constraint on `socialMediaLink` as UX so the user sees
 * the problem before submitting; the server still enforces it. Empty is
 * valid (optional field). Hosts: instagram.com / www.instagram.com /
 * tiktok.com / www.tiktok.com / vm.tiktok.com.
 *
 * NOTE the BE's sibling `urls` field is Vimeo-only (`@VimeoUrls`) — that is
 * the raw content-video surface, distinct from this publication link. This
 * form collects only the publication link; it does not populate `urls`.
 */
export function socialPostUrl(): ValidatorFn {
  const ALLOWED_HOSTS = new Set([
    'instagram.com',
    'www.instagram.com',
    'tiktok.com',
    'www.tiktok.com',
    'vm.tiktok.com',
  ]);
  return (control: AbstractControl): ValidationErrors | null => {
    const value = (control.value ?? '').toString().trim();
    if (value === '') return null; // optional field

    let parsed: URL;
    try {
      parsed = new URL(value);
    } catch {
      return { invalidUrl: true };
    }

    const scheme = parsed.protocol.replace(/:$/, '').toLowerCase();
    if (scheme !== 'https' || !ALLOWED_HOSTS.has(parsed.hostname.toLowerCase())) {
      return { notSocialPost: true };
    }

    return null;
  };
}

/**
 * Stage 4 / E7b — Influencer-side content submission for an accepted
 * application at `/collaborations/registrations/:id/content`.
 *
 * Lists existing submissions (via `getContentByAppliedOpportunity`) and
 * shows a form to add a new one. Required fields per the BE schema:
 * `contentTypeId` (FK from /content-type dictionary). Everything else
 * is optional. After submit the row is appended to the existing list
 * without a full reload.
 *
 * The component intentionally accepts whatever applied-opportunity
 * status the parent route is at — the BE rejects a submission for an
 * application that's not yet ACCEPTED, and surfaces the error key the
 * influencer needs. We don't pre-guard in the FE; that would couple the
 * UI to a state-machine the BE owns.
 */
@Component({
  selector: 'app-content-submission',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    DatePipe,
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    TranslocoModule,
  ],
  templateUrl: './content-submission.component.html',
})
export class ContentSubmissionComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(AppliedOpportunityContentApiService);

  readonly state = signal<LoadState>('loading');
  readonly appliedOpportunityId = signal<number | null>(null);
  readonly submissions = signal<AppliedOpportunityContentDtoOut[]>([]);
  readonly contentTypes = signal<ContentTypeDtoOut[]>([]);
  readonly submitting = signal<boolean>(false);
  readonly errorKey = signal<string | null>(null);

  readonly form = new FormGroup<SubmissionFormShape>({
    contentTypeId: new FormControl<number | null>(null, { validators: [Validators.required] }),
    contentCount: new FormControl<number | null>(1),
    socialMediaLink: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(1000), safeHttpsUrl(), socialPostUrl()],
    }),
    description: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(1000)],
    }),
    tags: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(500)] }),
  });

  // NOTE deliberately NOT a computed: `form.valid` is not a signal, so a
  // computed would memoize its first (pristine=false) evaluation and the
  // submit button could never enable — shipped exactly that way and caught
  // by a live click-through 2026-09-02. The button binds the zone-CD
  // template expression `submitting() || form.invalid` (opportunity-form
  // idiom) instead.
  readonly hasSubmissions = computed(() => this.submissions().length > 0);

  /** Row whose inline engagement editor is open (audit P1: the owner reports
   *  their post's likes/comments/views/shares via PATCH /engagement). */
  readonly engagementEditId = signal<number | null>(null);
  readonly engagementSaving = signal<boolean>(false);
  readonly engagementErrorKey = signal<string | null>(null);
  readonly engagementForm = new FormGroup({
    likes: new FormControl<number | null>(null, { validators: [Validators.min(0)] }),
    comments: new FormControl<number | null>(null, { validators: [Validators.min(0)] }),
    views: new FormControl<number | null>(null, { validators: [Validators.min(0)] }),
    shares: new FormControl<number | null>(null, { validators: [Validators.min(0)] }),
  });

  ngOnInit(): void {
    const idParam = this.route.snapshot.paramMap.get('id');
    const id = idParam ? Number(idParam) : NaN;
    if (!id || Number.isNaN(id)) {
      this.state.set('not-found');
      return;
    }
    this.appliedOpportunityId.set(id);
    this.load(id);
  }

  load(appliedOpportunityId: number): void {
    this.state.set('loading');
    forkJoin({
      submissions: this.api.listForAppliedOpportunity(appliedOpportunityId),
      contentTypes: this.api.listContentTypes(),
    }).subscribe({
      next: ({ submissions, contentTypes }) => {
        this.submissions.set(submissions);
        this.contentTypes.set(contentTypes);
        this.state.set('ready');
      },
      error: () => this.state.set('error'),
    });
  }

  submit(): void {
    if (this.form.invalid || this.submitting()) {
      this.form.markAllAsTouched();
      return;
    }
    const id = this.appliedOpportunityId();
    if (id == null) return;

    this.submitting.set(true);
    this.errorKey.set(null);

    const raw = this.form.getRawValue();
    const dto: AppliedOpportunityContentDtoIn = {
      appliedOpportunityId: id,
      contentTypeId: raw.contentTypeId as number,
      contentCount: raw.contentCount ?? undefined,
      // socialMediaLink is the IG/TikTok publication link; `urls` is the
      // BE's separate Vimeo-only content-video field — never populate it
      // from the publication link (they have different host allowlists).
      socialMediaLink: raw.socialMediaLink || undefined,
      description: raw.description || undefined,
      tags: raw.tags || undefined,
    };

    this.api.submit(dto).subscribe({
      next: (created) => {
        this.submissions.update((rows) => [created, ...rows]);
        this.form.reset({
          contentTypeId: null,
          contentCount: 1,
          socialMediaLink: '',
          description: '',
          tags: '',
        });
        this.submitting.set(false);
      },
      error: (err: { status?: number }) => {
        this.errorKey.set(
          err?.status === 400
            ? 'applied_opportunities.content.error.invalid_input'
            : err?.status === 409
              ? 'applied_opportunities.content.error.bad_state'
              : 'applied_opportunities.content.error.failed',
        );
        this.submitting.set(false);
      },
    });
  }

  /** Opens the inline engagement editor for a row, prefilled with the
   *  current metric values so a partial update never zeroes the rest. */
  openEngagement(row: AppliedOpportunityContentDtoOut): void {
    if (row.id == null) return;
    this.engagementEditId.set(row.id);
    this.engagementErrorKey.set(null);
    this.engagementForm.reset({
      likes: row.likesCount ?? null,
      comments: row.commentsCount ?? null,
      views: row.viewsCount ?? null,
      shares: row.sharesCount ?? null,
    });
  }

  closeEngagement(): void {
    this.engagementEditId.set(null);
    this.engagementErrorKey.set(null);
  }

  saveEngagement(): void {
    const id = this.engagementEditId();
    if (id == null || this.engagementSaving() || this.engagementForm.invalid) return;

    const raw = this.engagementForm.getRawValue();
    const metrics = {
      likes: raw.likes ?? undefined,
      comments: raw.comments ?? undefined,
      views: raw.views ?? undefined,
      shares: raw.shares ?? undefined,
    };

    this.engagementSaving.set(true);
    this.engagementErrorKey.set(null);

    this.api.updateEngagement(id, metrics).subscribe({
      next: () => {
        // BE returns void — patch the row locally with what we sent
        // (omitted fields keep their previous values, mirroring the BE).
        this.submissions.update((rows) =>
          rows.map((r) =>
            r.id === id
              ? {
                  ...r,
                  likesCount: raw.likes ?? r.likesCount,
                  commentsCount: raw.comments ?? r.commentsCount,
                  viewsCount: raw.views ?? r.viewsCount,
                  sharesCount: raw.shares ?? r.sharesCount,
                }
              : r,
          ),
        );
        this.engagementSaving.set(false);
        this.engagementEditId.set(null);
      },
      error: () => {
        this.engagementErrorKey.set('applied_opportunities.content.engagement.error');
        this.engagementSaving.set(false);
      },
    });
  }

  /** True when the row carries at least one reported metric. */
  hasMetrics(row: AppliedOpportunityContentDtoOut): boolean {
    return (
      row.likesCount != null ||
      row.commentsCount != null ||
      row.viewsCount != null ||
      row.sharesCount != null
    );
  }
}
