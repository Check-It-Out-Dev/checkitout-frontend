/**
 * The six-digit codes the demo shows as if they were real ones.
 *
 * Three places minted these independently with `Math.floor(100000 + Math.random() * 900000)` — the
 * step-up fixture, the mailbox simulation and the phone TOTP simulation — which is three copies of
 * one line and a pseudorandom generator standing in for a security code (typescript:S2245).
 *
 * Nothing in the demo depends on these being unguessable: they live in sessionStorage, the
 * interceptor accepts whatever it is handed, and the visitor is shown the code they are meant to
 * type. But a number presented to a person as a second factor should be generated the way a second
 * factor is generated, if only so that nobody reading this later has to work out whether it
 * mattered here. `crypto.getRandomValues` is available in every browser this application targets and
 * in the Node used for SSR, so there is no cost to being right.
 */

/** The demo's step-up and TOTP codes, and the only place they are made. */
export function sixDigitDemoCode(): string {
  const buffer = new Uint32Array(1);
  crypto.getRandomValues(buffer);
  // 900,000 values drawn from 2^32 leaves a modulo bias of roughly one part in 4,700 — irrelevant
  // for a demo code, and the rejection loop that would remove it would be the only complicated line
  // in this file.
  return String(100000 + ((buffer[0] ?? 0) % 900000));
}
