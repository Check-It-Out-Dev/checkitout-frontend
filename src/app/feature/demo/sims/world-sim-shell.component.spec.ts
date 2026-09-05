import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { WorldSimShellComponent } from './world-sim-shell.component';

@Component({
  imports: [WorldSimShellComponent],
  template: `
    <app-world-sim-shell [caption]="caption()" [position]="position()">
      <button type="button" data-testid="sim-cta">Otwórz</button>
    </app-world-sim-shell>
  `,
})
class HostComponent {
  readonly caption = signal('Symulacja: skrzynka odbiorcza');
  readonly position = signal<'center' | 'dock'>('center');
}

/**
 * The frame around a world simulator. The tour's own controls — the guide
 * panel and the ring's pill — live OUTSIDE it and have to stay reachable, so
 * the frame must never claim to be modal: `aria-modal` would tell assistive
 * technology that the only way forward is inert, and nothing here traps focus
 * to back that claim up.
 */
describe('WorldSimShellComponent', () => {
  const frame = (host: HTMLElement): HTMLElement =>
    host.querySelector<HTMLElement>('[role="dialog"], [role="complementary"]')!;

  const setup = async (position: 'center' | 'dock' = 'center') => {
    await TestBed.configureTestingModule({ imports: [HostComponent] }).compileComponents();
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.position.set(position);
    fixture.detectChanges();
    return fixture;
  };

  it('names the frame after its caption and never claims modality', async () => {
    const fixture = await setup('center');
    const el = frame(fixture.nativeElement as HTMLElement);

    expect(el.getAttribute('role')).toBe('dialog');
    expect(el.getAttribute('aria-label')).toBe('Symulacja: skrzynka odbiorcza');
    expect(el.hasAttribute('aria-modal')).toBe(false);
  });

  it('is complementary content when it sits beside the app', async () => {
    const fixture = await setup('dock');
    const el = frame(fixture.nativeElement as HTMLElement);

    expect(el.getAttribute('role')).toBe('complementary');
    expect(el.hasAttribute('aria-modal')).toBe(false);
  });

  it('projects the simulator inside the frame', async () => {
    const fixture = await setup();
    const host = fixture.nativeElement as HTMLElement;

    expect(host.querySelector('[data-testid="sim-cta"]')).not.toBeNull();
    expect(host.textContent).toContain('Symulacja: skrzynka odbiorcza');
  });
});
