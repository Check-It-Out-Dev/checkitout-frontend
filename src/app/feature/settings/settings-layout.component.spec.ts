import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@ngneat/transloco';
import { SettingsLayoutComponent } from './settings-layout.component';

describe('SettingsLayoutComponent', () => {
  let fixture: ComponentFixture<SettingsLayoutComponent>;
  let host: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        SettingsLayoutComponent,
        TranslocoTestingModule.forRoot({
          langs: { pl: {} },
          translocoConfig: { availableLangs: ['pl'], defaultLang: 'pl' },
        }),
      ],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(SettingsLayoutComponent);
    host = fixture.nativeElement;
    fixture.detectChanges();
  });

  it('declares all 6 tabs in the expected order: account → addresses → security → social → preferences → plan-billing', () => {
    const component = fixture.componentInstance;
    expect(component.tabs.map((t) => t.route)).toEqual([
      'account',
      'addresses',
      'security',
      'social',
      'preferences',
      'plan-billing',
    ]);
  });

  it('each tab carries the right icon mapping (locks in the legacy parity)', () => {
    const byRoute = new Map(fixture.componentInstance.tabs.map((t) => [t.route, t]));
    expect(byRoute.get('account')?.icon).toBe('person');
    expect(byRoute.get('addresses')?.icon).toBe('location_on');
    expect(byRoute.get('security')?.icon).toBe('shield');
    expect(byRoute.get('social')?.icon).toBe('share');
    expect(byRoute.get('preferences')?.icon).toBe('tune');
    expect(byRoute.get('plan-billing')?.icon).toBe('credit_card');
  });

  it('each tab uses an i18n key (no hardcoded English labels)', () => {
    for (const tab of fixture.componentInstance.tabs) {
      expect(tab.labelKey).toMatch(/^settings\.tabs\./);
    }
  });

  it('renders a router-outlet inside the tab panel', () => {
    expect(host.querySelector('router-outlet')).not.toBeNull();
  });

  it('renders the section root with the settings-layout test hook', () => {
    expect(host.querySelector('[data-testid="settings-layout"]')).not.toBeNull();
  });
});
