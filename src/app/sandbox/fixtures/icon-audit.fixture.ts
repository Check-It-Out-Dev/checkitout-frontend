import { IconAuditComponent } from '../showcases/icon-audit.component';
import type { SandboxFixture } from '../sandbox-registry';

/**
 * Icon-clip audit — a regression guard for the mat-icon bottom-clip bug
 * (styles.scss `mat-icon.mat-icon { line-height: 1 }`). Renders every
 * `!h-N !w-N !text-*` sizing idiom the app uses with each glyph framed; the
 * byte-stable baseline fails if a future change re-introduces the clip.
 * Sandbox-only diagnostic — no providers needed.
 */
export const ICON_AUDIT_FIXTURES: readonly SandboxFixture[] = [
  {
    id: 'icon-audit',
    label: 'Icon audit · mat-icon sizing clip guard',
    component: IconAuditComponent,
  },
];
