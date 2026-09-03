import type { Page } from '@playwright/test';
import type { Actor } from './actor';

/**
 * `when.*` — actions taken in a scenario. Mirrors BE Cucumber `When …`
 * steps. Functions are intentionally small and composable; complex flows
 * compose them rather than adding more `when.*` overloads.
 *
 * Functions take an `Actor` (or a raw `Page` for anonymous flows) and
 * return whatever value the step produces (e.g. an ID extracted from a
 * URL, an API response). Don't return `void` if the value is observable
 * downstream — pass it back so `then.*` can assert on it.
 */
export const when = {
  /** `When <actor> visits <path>`. */
  async actorVisits(actor: Actor, path: string): Promise<void> {
    await actor.navigate(path);
  },

  /** `When the visitor visits <path>` (anonymous). */
  async anonymousVisits(page: Page, path: string): Promise<void> {
    await page.goto(path, { waitUntil: 'networkidle' });
  },

  /** `When <actor> fills the email + password and submits the sign-in form`. */
  async actorSignsInWithEmail(page: Page, email: string, password: string): Promise<void> {
    await page.getByTestId('sign-in-email').fill(email);
    await page.getByTestId('sign-in-password').fill(password);
    await page.getByTestId('sign-in-submit').click();
  },
};
