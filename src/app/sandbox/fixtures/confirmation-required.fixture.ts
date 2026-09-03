import { ConfirmationRequiredComponent } from '../../feature/auth/confirmation-required/confirmation-required.component';
import type { SandboxFixture } from '../sandbox-registry';

export const CONFIRMATION_REQUIRED_FIXTURES: readonly SandboxFixture[] = [
  {
    id: 'confirmation-required-default',
    label: 'Confirmation required · post sign-up "check your email"',
    component: ConfirmationRequiredComponent,
  },
];
