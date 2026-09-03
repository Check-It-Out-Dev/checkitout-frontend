import { Component, ChangeDetectionStrategy } from '@angular/core';
import { ChapterShellComponent } from '../ui/chapter-shell.component';
import { ZeroTrustArchitectureShowcaseComponent } from '../showcases/zero-trust-architecture-showcase.component';
import { NetworkPerimeterShowcaseComponent } from '../showcases/network-perimeter-showcase.component';
import { AuthDepthShowcaseComponent } from '../showcases/auth-depth-showcase.component';
import { GeoipShowcaseComponent } from '../showcases/geoip-showcase.component';
import { SecretsKmsShowcaseComponent } from '../showcases/secrets-kms-showcase.component';

/**
 * Chapter 2/5 — Security ("Can they defend it?"). Ported from the legacy demo
 * build (feature/demo) into the greenfield editorial system.
 *
 * Defence in depth, outside-in: the zero-trust capstone (the whole stack on
 * one diagram), the network perimeter, then identity — the five auth locks —
 * and the GeoIP impossible-travel deep-dive the locks reference. The
 * secrets/KMS card closes the chapter.
 *
 * Fragment ids (zero-trust, perimeter, auth-depth, geoip, secrets) are deep-
 * link targets from the hub's "Cool stuff" strip; scroll-mt-24 clears the
 * sticky toolbar when the shell jumps to them.
 */
@Component({
  selector: 'app-security-chapter',
  imports: [
    ChapterShellComponent,
    ZeroTrustArchitectureShowcaseComponent,
    NetworkPerimeterShowcaseComponent,
    AuthDepthShowcaseComponent,
    GeoipShowcaseComponent,
    SecretsKmsShowcaseComponent,
  ],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <app-chapter-shell key="security">
      <div id="zero-trust" class="scroll-mt-24"><app-zero-trust-architecture-showcase /></div>
      <div id="perimeter" class="scroll-mt-24"><app-network-perimeter-showcase /></div>
      <div id="auth-depth" class="scroll-mt-24"><app-auth-depth-showcase /></div>
      <div id="geoip" class="scroll-mt-24"><app-geoip-showcase /></div>
      <div id="secrets" class="scroll-mt-24"><app-secrets-kms-showcase /></div>
    </app-chapter-shell>
  `,
})
export class SecurityChapterComponent {}
