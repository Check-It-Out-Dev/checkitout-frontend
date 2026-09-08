/**
 * Notices between tabs — and between parts of one page that do not know
 * each other.
 *
 * Two moments in the product happen somewhere else: the activation link in
 * the welcome mail opens in whatever tab the mail client picks, and Stripe
 * Checkout returns wherever it returns. The page the person left behind
 * should notice, not wait for a reload. `BroadcastChannel` reaches every
 * same-origin context with the channel open — other tabs, and other objects
 * in the same document — so the demo's simulators, which live in the same
 * document as the page they act on, use exactly the same door.
 *
 * SSR-safe: without `BroadcastChannel` nothing is announced and nothing
 * listens.
 */
export const ACCOUNT_ACTIVATED = 'checkitout:account-activated';
export const SUBSCRIPTION_CHANGED = 'checkitout:subscription-changed';

export function announce(channel: string): void {
  if (typeof BroadcastChannel === 'undefined') return;
  const ch = new BroadcastChannel(channel);
  ch.postMessage({ at: Date.now() });
  ch.close();
}

/** Start listening; returns the function that stops. */
export function listen(channel: string, handler: () => void): () => void {
  if (typeof BroadcastChannel === 'undefined') return () => undefined;
  const ch = new BroadcastChannel(channel);
  ch.onmessage = () => handler();
  return () => ch.close();
}
