import { ChangeDetectionStrategy, Component, OnDestroy, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { TranslocoModule } from '@ngneat/transloco';
import { MarketingToolbarComponent } from '../landing/marketing-toolbar/marketing-toolbar.component';

/**
 * `/support` home — ported from legacy (iter-57, audit P0 #8; owner: port
 * all placeholder routes). Live legacy surface only: hero, contact card
 * (ticket CTA + phone + click-to-copy email), static FAQ accordion fed by
 * `landing.faq.questions`. Legacy's hidden FAQ search box, hidden
 * view-all button and commented-out backend FAQ loading are dead code and
 * are deliberately not ported. One legacy bug fixed: it displayed
 * adam_sobczyk&#64; but copied norbert_marchewka&#64; — here the copy
 * matches the displayed address.
 */
@Component({
  selector: 'app-support',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslocoModule, RouterLink, MatIconModule, MarketingToolbarComponent],
  templateUrl: './support.component.html',
})
export class SupportComponent implements OnDestroy {
  readonly supportEmail = 'adam_sobczyk@checkitout.app';
  readonly supportPhoneHref = 'tel:+48451176506';
  readonly supportPhoneDisplay = '+48 451 176 506';

  /** Inline feedback for the click-to-copy email row (legacy used a snackbar). */
  readonly copyState = signal<'idle' | 'copied' | 'failed'>('idle');

  private copyResetHandle: ReturnType<typeof setTimeout> | undefined;

  async copyEmail(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.supportEmail);
      this.copyState.set('copied');
    } catch {
      this.copyState.set('failed');
    }
    clearTimeout(this.copyResetHandle);
    this.copyResetHandle = setTimeout(() => this.copyState.set('idle'), 2500);
  }

  ngOnDestroy(): void {
    clearTimeout(this.copyResetHandle);
  }
}
