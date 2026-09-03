import { TestBed } from '@angular/core/testing';
import { ThemeService } from './theme.service';

const STORAGE_KEY = 'cio.theme';

describe('ThemeService', () => {
  let originalMatchMedia: typeof window.matchMedia | undefined;

  beforeEach(() => {
    localStorage.clear();
    originalMatchMedia = window.matchMedia;
    // Default: OS preference says light. Individual tests override.
    // matchMedia is a writable (but not configurable) property in
    // jsdom, so direct assignment works where Object.defineProperty
    // would throw "Cannot redefine property".
    (window as unknown as { matchMedia: unknown }).matchMedia = jest
      .fn()
      .mockImplementation(() => ({
        matches: false,
        media: '',
        onchange: null,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        addListener: jest.fn(),
        removeListener: jest.fn(),
        dispatchEvent: jest.fn(),
      }));
    document.documentElement.classList.remove('dark-theme');
  });

  afterEach(() => {
    if (originalMatchMedia) {
      (window as unknown as { matchMedia: typeof window.matchMedia }).matchMedia =
        originalMatchMedia;
    }
    localStorage.clear();
    document.documentElement.classList.remove('dark-theme');
  });

  function buildService(): ThemeService {
    TestBed.configureTestingModule({});
    const service = TestBed.inject(ThemeService);
    // Effects flush on the first change-detection cycle for root-scoped
    // injectables. tickEffects covers both the initial constructor
    // effect and any subsequent mutations.
    TestBed.flushEffects();
    return service;
  }

  it('defaults to "light" when no stored choice + no dark OS preference', () => {
    const service = buildService();
    expect(service.mode()).toBe('light');
    expect(document.documentElement.classList.contains('dark-theme')).toBe(false);
  });

  it('honours an explicit "dark" choice from localStorage', () => {
    localStorage.setItem(STORAGE_KEY, 'dark');
    const service = buildService();
    expect(service.mode()).toBe('dark');
    expect(document.documentElement.classList.contains('dark-theme')).toBe(true);
  });

  it('falls back to OS preference when no stored choice (prefers-color-scheme: dark)', () => {
    (window.matchMedia as jest.Mock).mockImplementation((query: string) => ({
      matches: query === '(prefers-color-scheme: dark)',
      media: query,
      onchange: null,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      addListener: jest.fn(),
      removeListener: jest.fn(),
      dispatchEvent: jest.fn(),
    }));
    const service = buildService();
    expect(service.mode()).toBe('dark');
  });

  it('toggle() flips between light and dark', () => {
    const service = buildService();
    expect(service.mode()).toBe('light');

    service.toggle();
    TestBed.flushEffects();
    expect(service.mode()).toBe('dark');
    expect(document.documentElement.classList.contains('dark-theme')).toBe(true);

    service.toggle();
    TestBed.flushEffects();
    expect(service.mode()).toBe('light');
    expect(document.documentElement.classList.contains('dark-theme')).toBe(false);
  });

  it('set(mode) writes the value verbatim', () => {
    const service = buildService();
    service.set('dark');
    TestBed.flushEffects();
    expect(service.mode()).toBe('dark');
    expect(document.documentElement.classList.contains('dark-theme')).toBe(true);

    service.set('light');
    TestBed.flushEffects();
    expect(service.mode()).toBe('light');
    expect(document.documentElement.classList.contains('dark-theme')).toBe(false);
  });

  it('persists the mode to localStorage on every change', () => {
    const service = buildService();
    expect(localStorage.getItem(STORAGE_KEY)).toBe('light');

    service.set('dark');
    TestBed.flushEffects();
    expect(localStorage.getItem(STORAGE_KEY)).toBe('dark');

    service.toggle();
    TestBed.flushEffects();
    expect(localStorage.getItem(STORAGE_KEY)).toBe('light');
  });

  it('survives a localStorage read failure on init (privacy mode)', () => {
    const getItemSpy = jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('Access denied');
    });
    try {
      const service = buildService();
      // Falls through to the OS-preference branch — default mock says
      // not-dark → 'light'.
      expect(service.mode()).toBe('light');
    } finally {
      getItemSpy.mockRestore();
    }
  });

  it('survives a localStorage write failure on set() (privacy mode)', () => {
    const service = buildService();
    const setItemSpy = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceeded');
    });
    try {
      expect(() => {
        service.set('dark');
        TestBed.flushEffects();
      }).not.toThrow();
      // Class toggle still happens despite the storage write failing.
      expect(document.documentElement.classList.contains('dark-theme')).toBe(true);
    } finally {
      setItemSpy.mockRestore();
    }
  });
});
