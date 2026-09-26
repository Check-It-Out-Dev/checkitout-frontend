import { Component, Input } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialog } from '@angular/material/dialog';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { SandboxHostComponent } from './sandbox-host.component';

/** Registry stub — the host is tested against synthetic fixtures, not the
 * real registry, so a fixture refactor cannot break these expectations. */
const mockRegistry: Record<string, unknown> = {};
jest.mock('./sandbox-registry', () => ({
  findFixture: (id: string) => mockRegistry[id],
}));

@Component({
  selector: 'app-sandbox-probe',
  template: '<p data-testid="probe">{{ label }}</p>',
})
class ProbeComponent {
  @Input() label = 'default';
}

mockRegistry['probe'] = {
  id: 'probe',
  label: 'Probe',
  component: ProbeComponent,
  inputs: { label: 'hello' },
  viewport: { width: 1280, height: 400 },
};
mockRegistry['probe-dialog'] = {
  id: 'probe-dialog',
  label: 'Probe dialog',
  component: ProbeComponent,
  frame: 'dialog',
  viewport: { width: 520, height: 360 },
  providers: [{ provide: MAT_DIALOG_DATA, useValue: { name: 'Ola' } }],
};

function setup(id: string) {
  const dialogRef = { componentInstance: {}, close: jest.fn() };
  const dialogOpen = jest.fn(() => dialogRef);
  TestBed.configureTestingModule({
    imports: [SandboxHostComponent],
    providers: [
      provideRouter([]),
      {
        provide: ActivatedRoute,
        useValue: { params: of({ id }), snapshot: { params: { id } } },
      },
      { provide: MatDialog, useValue: { open: dialogOpen } },
    ],
  });
  const fixture = TestBed.createComponent(SandboxHostComponent);
  fixture.detectChanges();
  return { fixture, dialogOpen, dialogRef };
}

describe('SandboxHostComponent', () => {
  it('renders a plain fixture in the outlet, assigns inputs and clamps the width', () => {
    const { fixture } = setup('probe');
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('[data-testid="probe"]')?.textContent).toBe('hello');
    expect(fixture.componentInstance.hostStyle()).toBe(
      'width:min(1280px,100%);height:400px;overflow:auto;',
    );
    expect(fixture.componentInstance.notFound()).toBe(false);
  });

  it('prints the missing fixture id as a string, never the params object', () => {
    const { fixture } = setup('no-such-fixture');
    const el: HTMLElement = fixture.nativeElement;
    expect(fixture.componentInstance.notFound()).toBe(true);
    expect(el.querySelector('[data-testid="sandbox-missing-id"]')?.textContent?.trim()).toBe(
      'no-such-fixture',
    );
  });

  it('opens dialog fixtures through MatDialog with the data from providers', () => {
    const { fixture, dialogOpen } = setup('probe-dialog');
    expect(dialogOpen).toHaveBeenCalledTimes(1);
    expect(dialogOpen).toHaveBeenCalledWith(
      ProbeComponent,
      expect.objectContaining({
        data: { name: 'Ola' },
        width: '520px',
        hasBackdrop: true,
        disableClose: true,
        autoFocus: false,
      }),
    );
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('[data-testid="probe"]')).toBeNull();
    expect(fixture.componentInstance.hostStyle()).toBe('');
  });

  it('closes the framed dialog when the host is destroyed', () => {
    const { fixture, dialogRef } = setup('probe-dialog');
    fixture.destroy();
    expect(dialogRef.close).toHaveBeenCalledTimes(1);
  });
});
