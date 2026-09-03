
import { Injectable, computed, effect, inject, signal, DOCUMENT } from '@angular/core';

export type ThemeMode = 'light' | 'dark';

const STORAGE_KEY = 'cio.theme';

/**
 * Light/dark theme toggle backed by a signal. Persists to localStorage so
 * the choice survives reloads. Adds/removes a `dark-theme` class on the
 * document root — Material's prebuilt indigo-pink theme will swap to a
 * proper dark variant in a later slice (Material 3 `mat.define-theme()` +
 * dark palette via `mat.color-variants-backwards-compatibility`).
 *
 * For Phase 2 the toggle just flips the class; the visual difference
 * comes in alongside the custom theme palette.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly document = inject(DOCUMENT);

  private readonly _mode = signal<ThemeMode>(this.readInitialMode());

  /** Reactive read of the current mode (`'light'` | `'dark'`). */
  readonly mode = computed(() => this._mode());

  constructor() {
    effect(() => {
      const mode = this._mode();
      try {
        localStorage.setItem(STORAGE_KEY, mode);
      } catch {
        // SSR / privacy mode — ignore.
      }
      const root = this.document.documentElement;
      root.classList.toggle('dark-theme', mode === 'dark');
    });
  }

  toggle(): void {
    this._mode.update((m) => (m === 'dark' ? 'light' : 'dark'));
  }

  set(mode: ThemeMode): void {
    this._mode.set(mode);
  }

  private readInitialMode(): ThemeMode {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === 'dark' || stored === 'light') return stored;
    } catch {
      // ignore
    }
    // Honour OS preference if no explicit stored choice.
    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return 'light';
  }
}
