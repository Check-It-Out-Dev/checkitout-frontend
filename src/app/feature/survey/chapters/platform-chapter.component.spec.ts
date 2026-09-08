import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@ngneat/transloco';
import { BillingSagaShowcaseComponent } from '../showcases/billing-saga-showcase.component';
import { InstagramOauthShowcaseComponent } from '../showcases/instagram-oauth-showcase.component';
import { SubscriptionStateMachineShowcaseComponent } from '../showcases/subscription-state-machine-showcase.component';
import { PlatformChapterComponent } from './platform-chapter.component';

/**
 * Smoke-compiles the platform chapter WITH all five showcases (tsc --noEmit
 * does not compile inline templates — this spec is what proves the @if/@for
 * conversions and bindings actually render) and pins the fragment anchors the
 * hub's "Cool stuff" strip deep-links to.
 */
describe('PlatformChapterComponent', () => {
  let fixture: ComponentFixture<PlatformChapterComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        PlatformChapterComponent,
        TranslocoTestingModule.forRoot({
          langs: { pl: {} },
          translocoConfig: { availableLangs: ['pl'], defaultLang: 'pl' },
        }),
      ],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(PlatformChapterComponent);
    fixture.detectChanges();
  });

  it('renders all five showcase cards behind their stable deep-link anchors', () => {
    const el: HTMLElement = fixture.nativeElement;
    for (const id of ['stack', 'subscription-fsm', 'billing-saga', 'instagram-oauth', 'mail']) {
      const anchor = el.querySelector(`#${id}`);
      expect(anchor).toBeTruthy();
      // scroll-mt-24 clears the sticky toolbar on hub deep-links
      expect(anchor?.classList.contains('scroll-mt-24')).toBe(true);
    }
  });

  it('advances the billing saga one lit step per click and replays after completion', () => {
    const saga = fixture.debugElement.query(
      By.directive(BillingSagaShowcaseComponent),
    ).componentInstance;
    expect(saga.step).toBe(0);
    saga.advance();
    expect(saga.step).toBe(1);
    expect(saga.isLit(0)).toBe(true);
    expect(saga.isCurrent(0)).toBe(true);
    for (let i = 0; i < 5; i++) saga.advance();
    expect(saga.done).toBe(true);
    saga.advance(); // replay resets
    expect(saga.step).toBe(0);
    fixture.detectChanges(); // re-render both branch states of the stepper template
  });

  it('plays a subscription scenario (states and transitions lit in sequence)', () => {
    const fsm = fixture.debugElement.query(
      By.directive(SubscriptionStateMachineShowcaseComponent),
    ).componentInstance;
    expect(fsm.active).toBeNull();
    const terms = fsm.scenarios.find((s: { key: string }) => s.key === 'terms');
    fsm.select(terms);
    const termsNode = fsm.nodes.find((n: { key: string }) => n.key === 'TERMS_PENDING');
    expect(fsm.isNodeLit(termsNode)).toBe(true);
    // the story is told in order: ENTERPRISE first, its transition half a beat
    // later, TERMS a beat after that — there is no dot to carry it any more
    expect(
      fsm.nodeDelay(fsm.nodes.find((n: { key: string }) => n.key === 'ENTERPRISE_ACTIVE')),
    ).toBe('0.00s');
    expect(fsm.edgeDelay(fsm.edges[4])).toBe('0.28s'); // ENTERPRISE_ACTIVE>TERMS_PENDING
    expect(fsm.nodeDelay(termsNode)).toBe('0.55s');
    expect(fsm.nodeDelay(fsm.nodes.find((n: { key: string }) => n.key === 'FREE_ACTIVE'))).toBe(
      '0s',
    );
    expect(fsm.active.ghost).toBe('ENTERPRISE_ACTIVE');
    fixture.detectChanges(); // renders the ghost ring branch
  });

  it('steps the Instagram OAuth handshake through to connected', () => {
    const oauth = fixture.debugElement.query(
      By.directive(InstagramOauthShowcaseComponent),
    ).componentInstance;
    for (let i = 0; i < 4; i++) oauth.advance();
    expect(oauth.done).toBe(true);
    fixture.detectChanges(); // renders the "connected" badge branch
  });
});
