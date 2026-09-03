import { Component, ChangeDetectionStrategy } from '@angular/core';
import { ChapterShellComponent } from '../ui/chapter-shell.component';
import { ConsentProofShowcaseComponent } from '../showcases/consent-proof-showcase.component';
import { GdprComplianceShowcaseComponent } from '../showcases/gdpr-compliance-showcase.component';

/**
 * Chapter 3/5 — Privacy & compliance ("Can they handle EU law?").
 * RODO/GDPR as engineering: provable consent capture, then the erasure,
 * grace-period and audit machinery behind it.
 *
 * Ported from the legacy demo build (feature/demo). Fragment ids stay stable
 * for hub deep-links; scroll-mt-24 clears the sticky toolbar (greenfield
 * chapter-shell scrolls to the fragment on load).
 */
@Component({
  selector: 'app-compliance-chapter',
  imports: [ChapterShellComponent, ConsentProofShowcaseComponent, GdprComplianceShowcaseComponent],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <app-chapter-shell key="compliance">
      <div id="consent" class="scroll-mt-24"><app-consent-proof-showcase /></div>
      <div id="gdpr" class="scroll-mt-24"><app-gdpr-compliance-showcase /></div>
    </app-chapter-shell>
  `,
})
export class ComplianceChapterComponent {}
