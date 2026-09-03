import { setupWorker } from 'msw/browser';
import { handlers } from './handlers';

/**
 * MSW browser worker — only started when the URL has `?mock=1` (or the
 * Playwright `test:msw` tier sets `localStorage.msw=on`). Production builds
 * don't load this file; main.ts gates the dynamic import.
 */
export const worker = setupWorker(...handlers);
