import { Component, ChangeDetectionStrategy } from '@angular/core';
import { ChapterShellComponent } from '../ui/chapter-shell.component';
import { TestingQualityShowcaseComponent } from '../showcases/testing-quality-showcase.component';
import { GreenfieldRewriteShowcaseComponent } from '../showcases/greenfield-rewrite-showcase.component';
import { ContractPipelineShowcaseComponent } from '../showcases/contract-pipeline-showcase.component';
import { VelocityShowcaseComponent } from '../showcases/velocity-showcase.component';
import { GraphAssistedDevShowcaseComponent } from '../showcases/graph-assisted-dev-showcase.component';
import { GraphTopologyShowcaseComponent } from '../showcases/graph-topology-showcase.component';
import { DemoMetaShowcaseComponent } from '../showcases/demo-meta-showcase.component';

/**
 * Chapter 5/5 — Engineering practice ("How do they work?"). Ported from the
 * legacy demo build (feature/demo) into the greenfield editorial system.
 * The habits behind the platform: the test pyramids + quality gates, the
 * greenfield rewrite, the schema-first contract pipeline that makes drift a
 * compile error (#contract), WHY the typed-contract + AI-with-logs loop is
 * fast (#velocity), graph-assisted bug-hunting (#graph-dev), the knowledge-graph
 * NavigationMaster topology that makes the system navigable (#graph-topology)
 * and the "how this demo works" meta-card. Fragment ids (`graph-dev` +
 * `velocity` are hub deep-link targets) carry scroll-mt-24 so the shell's
 * fragment jump clears the sticky toolbar.
 */
@Component({
  selector: 'app-engineering-chapter',
  imports: [
    ChapterShellComponent,
    TestingQualityShowcaseComponent,
    GreenfieldRewriteShowcaseComponent,
    ContractPipelineShowcaseComponent,
    VelocityShowcaseComponent,
    GraphAssistedDevShowcaseComponent,
    GraphTopologyShowcaseComponent,
    DemoMetaShowcaseComponent,
  ],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <app-chapter-shell key="engineering">
      <div id="testing" class="scroll-mt-24"><app-testing-quality-showcase /></div>
      <div id="rewrite" class="scroll-mt-24"><app-greenfield-rewrite-showcase /></div>
      <div id="contract" class="scroll-mt-24"><app-contract-pipeline-showcase /></div>
      <div id="velocity" class="scroll-mt-24"><app-velocity-showcase /></div>
      <div id="graph-dev" class="scroll-mt-24"><app-graph-assisted-dev-showcase /></div>
      <div id="graph-topology" class="scroll-mt-24"><app-graph-topology-showcase /></div>
      <div id="demo-meta" class="scroll-mt-24"><app-demo-meta-showcase /></div>
    </app-chapter-shell>
  `,
})
export class EngineeringChapterComponent {}
