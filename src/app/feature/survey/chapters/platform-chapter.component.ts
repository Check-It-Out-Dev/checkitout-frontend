import { Component, ChangeDetectionStrategy } from '@angular/core';
import { ChapterShellComponent } from '../ui/chapter-shell.component';
import { TechStackStripComponent } from '../showcases/tech-stack-strip.component';
import { SubscriptionStateMachineShowcaseComponent } from '../showcases/subscription-state-machine-showcase.component';
import { BillingSagaShowcaseComponent } from '../showcases/billing-saga-showcase.component';
import { InstagramOauthShowcaseComponent } from '../showcases/instagram-oauth-showcase.component';
import { MailNotificationsShowcaseComponent } from '../showcases/mail-notifications-showcase.component';

/**
 * Chapter 1/5 — Platform & product ("Can they build product?").
 * The marketplace itself: the stack, the event-sourced subscription engine,
 * the crash-safe billing saga, the Meta-verified Instagram OAuth and the
 * outbox-backed mail pipeline.
 * Card ids are stable deep-link anchors used by the hub's "Cool stuff" strip
 * (scroll-mt-24 clears the sticky toolbar — see ChapterShellComponent).
 */
@Component({
  selector: 'app-platform-chapter',
  imports: [
    ChapterShellComponent,
    TechStackStripComponent,
    SubscriptionStateMachineShowcaseComponent,
    BillingSagaShowcaseComponent,
    InstagramOauthShowcaseComponent,
    MailNotificationsShowcaseComponent,
  ],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <app-chapter-shell key="platform">
      <div id="stack" class="scroll-mt-24"><app-tech-stack-strip /></div>
      <div id="subscription-fsm" class="scroll-mt-24">
        <app-subscription-state-machine-showcase />
      </div>
      <div id="billing-saga" class="scroll-mt-24"><app-billing-saga-showcase /></div>
      <div id="instagram-oauth" class="scroll-mt-24"><app-instagram-oauth-showcase /></div>
      <div id="mail" class="scroll-mt-24"><app-mail-notifications-showcase /></div>
    </app-chapter-shell>
  `,
})
export class PlatformChapterComponent {}
