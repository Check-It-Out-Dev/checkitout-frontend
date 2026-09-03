import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@ngneat/transloco';
import { AnsibleProvisioningShowcaseComponent } from '../showcases/ansible-provisioning-showcase.component';
import { CicdSecureDeployShowcaseComponent } from '../showcases/cicd-secure-deploy-showcase.component';
import { ImmutabilityChainShowcaseComponent } from '../showcases/immutability-chain-showcase.component';
import { ObservabilityShowcaseComponent } from '../showcases/observability-showcase.component';
import { OperationsChapterComponent } from './operations-chapter.component';

/**
 * Smoke-compiles the operations chapter WITH all five showcases (tsc --noEmit
 * does not compile inline templates — this spec is what proves the @if/@for
 * conversions and bindings actually render) and pins the fragment anchors the
 * hub's "Cool stuff" strip deep-links to (`immutability` is a hub target).
 */
describe('OperationsChapterComponent', () => {
  let fixture: ComponentFixture<OperationsChapterComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        OperationsChapterComponent,
        TranslocoTestingModule.forRoot({
          langs: { pl: {} },
          translocoConfig: { availableLangs: ['pl'], defaultLang: 'pl' },
        }),
      ],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(OperationsChapterComponent);
    fixture.detectChanges();
  });

  it('renders all five showcase cards behind their stable deep-link anchors', () => {
    const el: HTMLElement = fixture.nativeElement;
    for (const id of ['cicd', 'ansible', 'observability', 'immutability', 'backups']) {
      const anchor = el.querySelector(`#${id}`);
      expect(anchor).toBeTruthy();
      // scroll-mt-24 clears the sticky toolbar on hub deep-links
      expect(anchor?.classList.contains('scroll-mt-24')).toBe(true);
    }
  });

  it('advances the CI/CD pipeline one lit stage per click and replays after deploy', () => {
    const cicd = fixture.debugElement.query(
      By.directive(CicdSecureDeployShowcaseComponent),
    ).componentInstance;
    expect(cicd.step).toBe(0);
    cicd.advance();
    expect(cicd.step).toBe(1);
    expect(cicd.isLit(0)).toBe(true);
    expect(cicd.isCurrent(0)).toBe(true);
    for (let i = 0; i < 5; i++) cicd.advance();
    expect(cicd.done).toBe(true);
    fixture.detectChanges(); // renders the "deployed" badge + replay branch
    cicd.advance(); // replay resets
    expect(cicd.step).toBe(0);
    fixture.detectChanges();
  });

  it('provisions bare Ubuntu to hardened through the five Ansible phases', () => {
    const ansible = fixture.debugElement.query(
      By.directive(AnsibleProvisioningShowcaseComponent),
    ).componentInstance;
    expect(ansible.phases).toHaveLength(5);
    for (let i = 0; i < 5; i++) ansible.advance();
    expect(ansible.done).toBe(true);
    fixture.detectChanges(); // renders the "hardened" badge branch
    ansible.advance();
    expect(ansible.step).toBe(0);
  });

  it('walks a log line down the four observability hops to indexed', () => {
    const obs = fixture.debugElement.query(
      By.directive(ObservabilityShowcaseComponent),
    ).componentInstance;
    for (let i = 0; i < 4; i++) obs.advance();
    expect(obs.done).toBe(true);
    fixture.detectChanges(); // renders the "indexed" badge + lit connector branch
  });

  it('refuses all three tamper attempts against the immutability chain', () => {
    const chain = fixture.debugElement.query(
      By.directive(ImmutabilityChainShowcaseComponent),
    ).componentInstance;
    expect(chain.tamperStep).toBe(0);
    chain.attack();
    expect(chain.attackLit(0)).toBe(true);
    expect(chain.attackCurrent(0)).toBe(true);
    chain.attack();
    chain.attack();
    expect(chain.tamperDone).toBe(true);
    fixture.detectChanges(); // renders refusal badges + the "sealed" replay branch
    chain.attack(); // replay resets
    expect(chain.tamperStep).toBe(0);
  });
});
