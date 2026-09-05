import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { DialogHeaderComponent } from './dialog-header.component';

@Component({
  imports: [DialogHeaderComponent],
  template: `
    <app-dialog-header icon="shield" tone="warn" eyebrow="Extra step" titleTestId="host-title">
      Confirm it
    </app-dialog-header>
  `,
})
class HostComponent {}

@Component({
  imports: [DialogHeaderComponent],
  template: `
    <app-dialog-header icon="lock">Plain</app-dialog-header>
  `,
})
class PlainHostComponent {}

describe('DialogHeaderComponent', () => {
  it('renders the icon tile, the projected serif title with its test id and the eyebrow', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('mat-icon')?.textContent?.trim()).toBe('shield');
    const title = el.querySelector('[data-testid="host-title"]');
    expect(title?.tagName).toBe('H2');
    expect(title?.textContent?.trim()).toBe('Confirm it');
    expect(title?.className).toContain('font-display');
    expect(el.querySelector('[data-testid="dialog-header-eyebrow"]')?.textContent?.trim()).toBe(
      'Extra step',
    );
    expect(el.querySelector('[data-testid="dialog-header-tile"]')?.className).toContain(
      'bg-red-50',
    );
  });

  it('defaults to the coral tone and omits the eyebrow when none is given', () => {
    const fixture = TestBed.createComponent(PlainHostComponent);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('[data-testid="dialog-header-tile"]')?.className).toContain(
      'bg-coral-50',
    );
    expect(el.querySelector('[data-testid="dialog-header-eyebrow"]')).toBeNull();
    expect(el.querySelector('h2')?.hasAttribute('data-testid')).toBe(false);
  });
});
