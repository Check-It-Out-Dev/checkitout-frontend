/**
 * Explicit language-choice persistence (localStorage, SSR-safe).
 *
 * iter-107 pinned boot to 'pl' because browser-language auto-detection
 * destroyed SSR hydration for EN-preferring browsers (full destructive
 * re-render, LCP ~9s). That decision stands for DEFAULTS — but it also
 * discarded a user's EXPLICIT switcher choice on every hard navigation
 * (refresh, deep link), forcing EN users to re-pick per load.
 *
 * This helper narrows the trade-off: only an explicit switcher click is
 * stored; boot prefers the stored choice; the server (no localStorage)
 * still renders 'pl', so the default path is byte-identical to iter-107.
 * A stored-EN user accepts one hydration re-render — they asked for EN.
 */
const KEY = 'cio-lang';

export type AppLang = 'en' | 'pl';

/** Persist an explicit switcher choice; silently no-ops under SSR/privacy modes. */
export function storeLangChoice(lang: AppLang): void {
  try {
    localStorage.setItem(KEY, lang);
  } catch {
    /* SSR or storage-denied — the choice just won't survive reloads */
  }
}

/** The stored explicit choice, or null (never throws; null under SSR). */
export function readLangChoice(): AppLang | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'en' || v === 'pl' ? v : null;
  } catch {
    return null;
  }
}
