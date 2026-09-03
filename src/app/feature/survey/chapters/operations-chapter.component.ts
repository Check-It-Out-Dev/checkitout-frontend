import { Component, ChangeDetectionStrategy } from '@angular/core';
import { ChapterShellComponent } from '../ui/chapter-shell.component';
import { CicdSecureDeployShowcaseComponent } from '../showcases/cicd-secure-deploy-showcase.component';
import { AnsibleProvisioningShowcaseComponent } from '../showcases/ansible-provisioning-showcase.component';
import { ObservabilityShowcaseComponent } from '../showcases/observability-showcase.component';
import { ImmutabilityChainShowcaseComponent } from '../showcases/immutability-chain-showcase.component';
import { BackupsDrShowcaseComponent } from '../showcases/backups-dr-showcase.component';

/**
 * Chapter 4/5 — Operations ("Can they run it?").
 * How the platform ships and stays up: the secure-deploy pipeline, the Ansible
 * provisioning playbook, the observability stack, the immutability chain and
 * the backups/DR story (with its disclosed honest gap).
 *
 * Ported from the legacy demo build (feature/demo) into the greenfield
 * editorial system. Card wrapper ids are deep-link fragments (the hub's
 * "Cool stuff" strip targets `immutability`); scroll-mt-24 clears the sticky
 * marketing toolbar when the shell scrolls a fragment into view.
 */
@Component({
  selector: 'app-operations-chapter',
  imports: [
    ChapterShellComponent,
    CicdSecureDeployShowcaseComponent,
    AnsibleProvisioningShowcaseComponent,
    ObservabilityShowcaseComponent,
    ImmutabilityChainShowcaseComponent,
    BackupsDrShowcaseComponent,
  ],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <app-chapter-shell key="operations">
      <div id="cicd" class="scroll-mt-24"><app-cicd-secure-deploy-showcase /></div>
      <div id="ansible" class="scroll-mt-24"><app-ansible-provisioning-showcase /></div>
      <div id="observability" class="scroll-mt-24"><app-observability-showcase /></div>
      <div id="immutability" class="scroll-mt-24"><app-immutability-chain-showcase /></div>
      <div id="backups" class="scroll-mt-24"><app-backups-dr-showcase /></div>
    </app-chapter-shell>
  `,
})
export class OperationsChapterComponent {}
