import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@ngneat/transloco';
import { SupportComponent } from './support.component';

// Iter-57 P0 #8 — /support home ported from legacy: hero + contact card
// (ticket CTA, phone, click-to-copy email) + static FAQ accordion from
// landing.faq.questions. The test langs carry a real questions array so the
// accordion assertion exercises the actual @for, not a degenerate string.
describe('SupportComponent', () => {
  let fixture: ComponentFixture<SupportComponent>;
  let host: HTMLElement;

  const FAQ = [
    { question: 'How do campaigns work?', answer: 'Companies publish, creators apply.' },
    { question: 'What does it cost?', answer: 'Free tier plus paid plans.' },
  ];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        SupportComponent,
        TranslocoTestingModule.forRoot({
          langs: { en: { landing: { faq: { questions: FAQ } } } },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
        }),
      ],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(SupportComponent);
    host = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('renders the hero and contact card copy', () => {
    expect(host.querySelector('[data-testid="support-title"]')?.textContent).toContain(
      'support.hero.title',
    );
    expect(host.textContent).toContain('support.contact.title');
    expect(host.textContent).toContain('support.contact.description');
  });

  it('links the primary CTA to the ticket form', () => {
    const cta = host.querySelector('[data-testid="support-ticket-cta"]');
    expect(cta?.getAttribute('href')).toBe('/support/tickets');
    expect(cta?.textContent).toContain('support.contact.form_button');
  });

  it('renders the phone link with the legacy tel: target', () => {
    const phone = host.querySelector('[data-testid="support-phone"]');
    expect(phone?.getAttribute('href')).toBe('tel:+48451176506');
    expect(phone?.textContent).toContain('+48 451 176 506');
  });

  // No fakeAsync here: copyEmail is a native async function, so its await
  // resume is invisible to tick(). whenStable() drains the resolved-copy
  // microtask; the 2500ms feedback-reset timer is armed in that untracked
  // resume, so whenStable does not wait for it. Fixture teardown runs
  // ngOnDestroy, which clears the timer.
  it('copies the displayed email and shows inline feedback', async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });

    (host.querySelector('[data-testid="support-email"]') as HTMLButtonElement).click();
    await fixture.whenStable();
    fixture.detectChanges();

    // Copy matches the DISPLAYED address (legacy copied a different one — bug fixed here).
    expect(writeText).toHaveBeenCalledWith('adam_sobczyk@checkitout.app');
    expect(host.querySelector('[data-testid="support-email-copied"]')?.textContent).toContain(
      'common.clipboard.email_copied',
    );
  });

  it('flags failure inline when the clipboard write fails', () => {
    // Synchronous throw (e.g. permission denial) — copyEmail's try/catch
    // covers it before the first await, so the whole path is synchronous.
    const writeText = jest.fn(() => {
      throw new Error('denied');
    });
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });

    (host.querySelector('[data-testid="support-email"]') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(writeText).toHaveBeenCalledTimes(1);
    expect(fixture.componentInstance.copyState()).toBe('failed');
    expect(host.textContent).toContain('common.clipboard.copy_failed');
  });

  it('renders one FAQ accordion entry per landing.faq.questions item', () => {
    const items = host.querySelectorAll('[data-testid^="support-faq-"]');
    expect(items.length).toBe(FAQ.length);
    expect(items[0].textContent).toContain('How do campaigns work?');
    expect(items[0].textContent).toContain('Companies publish, creators apply.');
  });
});
