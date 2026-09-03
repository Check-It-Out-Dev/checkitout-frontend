/**
 * Stage 5b — canonicalization for trace-equivalence checking.
 *
 * Strips the volatile, environment-specific, and timing-sensitive parts
 * of a `TraceEntry` so that two traces from semantically-equivalent flows
 * canonicalize to the same value.
 *
 * Rules (see design doc 16-LIVE-BE-INTEGRATION-TIER.md):
 *
 * - Path: replace UUID + numeric-id segments with `:id`
 * - Query: sort keys; scrub UUIDs + timestamps in values
 * - Headers: keep only a semantic whitelist (Content-Type, Cookie name,
 *   Step-Up token presence, etc.); strip Date / X-Request-ID / etc.
 * - Bodies: recursively walk JSON; sort object keys, scrub volatile
 *   primitives (UUIDs, timestamps, base64 nonces); sort id-keyed arrays
 *   for stable ordering.
 */

import type { CanonicalEntry, TraceEntry } from './types';

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const ISO_TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?$/;
const NUMERIC_ID_PATH_SEG_RE = /^\d+$/;
const NUMERIC_ID_QUERY_RE = /^\d{2,}$/; // 2+ digits — single digits are usually pagination/intentional

/**
 * Headers we keep on the request side because they affect server behavior.
 *
 * Notably **excluded**: `authorization`, `cookie`, `accept`.
 *
 * - `authorization` + `cookie`: both apps authenticate differently (legacy =
 *   cookie session, greenfield = Bearer in `Authorization`). The transport
 *   mechanism is intentional drift; whether the BE accepted the request
 *   shows up in the response status. If greenfield breaks auth, 401s in
 *   the response diff catch it — exactly the signal we want.
 *
 * - `accept`: Angular version differences emit different default Accept
 *   header values (e.g. `application/json, text/plain, ANY` on Angular ≤17
 *   vs `ANY` on Angular 19, where ANY = star-slash-star). The BE serves
 *   JSON regardless, so this is cosmetic. If a future call genuinely needs
 *   a non-JSON accept (e.g. `application/octet-stream` for a download), it
 *   would set `responseType` and the diff would surface the responseBody
 *   change.
 *
 * `accept-language` IS kept because it switches BE response shape (locale-
 * specific labels). `x-step-up-token` is kept because it's a load-bearing
 * semantic affordance for sensitive endpoints — both apps must send it.
 */
const KEEP_REQUEST_HEADERS = new Set([
  'content-type',
  'accept-language',
  'x-step-up-token', // presence matters; value scrubbed
  'x-consent-required',
  'x-email-verification-required',
]);

/** Headers we keep on the response side because they affect FE behavior. */
const KEEP_RESPONSE_HEADERS = new Set([
  'content-type',
  'location',
  'x-rate-limit-remaining',
  'x-rate-limit-reset',
  'x-step-up-required',
  'x-consent-required',
  'x-email-verification-required',
]);

/** Field names whose values are scrubbed when they appear in JSON bodies. */
const VOLATILE_FIELD_NAMES = new Set([
  'id',
  'createdAt',
  'updatedAt',
  'deletedAt',
  'lastModifiedAt',
  // checkItOut audit-timestamp convention (the BE DTOs expose *Time, not the
  // JPA *At names above). Left unmasked, a record read twice across the
  // legacy/greenfield capture window diffs on lastUpdateTime whenever the flow
  // touches the row — a false positive in the trace-equivalence check.
  'createdTime',
  'lastUpdateTime',
  'lastModifiedTime',
  'deletedTime',
  'lastLoginTime',
  'timestamp',
  'requestId',
  'traceId',
  'sessionId',
  'token',
  'refreshToken',
  'idToken',
  'accessToken',
  'csrfToken',
  'nonce',
]);

/** Sentinels we substitute for volatile values. */
const SENTINEL_UUID = ':uuid';
const SENTINEL_TIMESTAMP = ':ts';
const SENTINEL_TOKEN = ':token';
const SENTINEL_NUMERIC_ID = ':num-id';

export function canonicalize(entry: TraceEntry): CanonicalEntry {
  return {
    method: entry.method,
    path: canonicalizePath(entry.path),
    query: canonicalizeQuery(entry.query),
    requestHeaders: filterRequestHeaders(entry.requestHeaders),
    requestBody: canonicalizeBody(entry.requestBody),
    responseStatus: entry.responseStatus,
    responseHeaders: filterResponseHeaders(entry.responseHeaders),
    responseBody: canonicalizeBody(entry.responseBody),
  };
}

export function canonicalizeTrace(entries: readonly TraceEntry[]): readonly CanonicalEntry[] {
  return entries.map(canonicalize);
}

/** UUID + numeric-id path segments → `:id`. */
export function canonicalizePath(path: string): string {
  return path
    .split('/')
    .map((seg) => {
      if (UUID_RE.test(seg)) return ':id';
      if (NUMERIC_ID_PATH_SEG_RE.test(seg) && seg.length >= 2) return ':id';
      return seg;
    })
    .join('/');
}

function canonicalizeQuery(q: Readonly<Record<string, string>>): Readonly<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const k of Object.keys(q).sort()) {
    out[k] = canonicalizeQueryValue(q[k]);
  }
  return Object.freeze(out);
}

function canonicalizeQueryValue(v: string): string {
  if (UUID_RE.test(v)) return SENTINEL_UUID;
  if (ISO_TIMESTAMP_RE.test(v)) return SENTINEL_TIMESTAMP;
  if (NUMERIC_ID_QUERY_RE.test(v)) return SENTINEL_NUMERIC_ID;
  return v;
}

function filterRequestHeaders(
  headers: Readonly<Record<string, string>>,
): Readonly<Record<string, string>> {
  return filterAndScrub(headers, KEEP_REQUEST_HEADERS, scrubAuthValue);
}

function filterResponseHeaders(
  headers: Readonly<Record<string, string>>,
): Readonly<Record<string, string>> {
  return filterAndScrub(headers, KEEP_RESPONSE_HEADERS, scrubLocationValue);
}

function filterAndScrub(
  headers: Readonly<Record<string, string>>,
  keep: ReadonlySet<string>,
  scrub: (k: string, v: string) => string,
): Readonly<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const [rawK, v] of Object.entries(headers)) {
    const k = rawK.toLowerCase();
    if (!keep.has(k)) continue;
    out[k] = scrub(k, v);
  }
  return Object.freeze(out);
}

function scrubAuthValue(k: string, v: string): string {
  if (k === 'x-step-up-token') return SENTINEL_TOKEN;
  return v;
}

function scrubLocationValue(k: string, v: string): string {
  if (k === 'location') return canonicalizePath(stripQuery(v));
  return v;
}

function stripQuery(url: string): string {
  const i = url.indexOf('?');
  return i >= 0 ? url.slice(0, i) : url;
}

/**
 * Recursively canonicalize a JSON body. Sort object keys, scrub volatile
 * primitives, sort id-keyed arrays.
 */
export function canonicalizeBody(body: unknown): unknown {
  if (body == null) return body;
  if (typeof body !== 'object') return canonicalizePrimitive(body);
  if (Array.isArray(body)) return canonicalizeArray(body);
  return canonicalizeObject(body as Record<string, unknown>);
}

function canonicalizePrimitive(v: unknown): unknown {
  if (typeof v !== 'string') return v;
  if (UUID_RE.test(v)) return SENTINEL_UUID;
  if (ISO_TIMESTAMP_RE.test(v)) return SENTINEL_TIMESTAMP;
  return v;
}

function canonicalizeArray(arr: readonly unknown[]): unknown[] {
  // Sort BEFORE scrubbing if every element is an object with a stable `id`
  // primitive (common shape: paginated row lists). Two traces that fetched
  // the same set of rows in different order canonicalize to the same array.
  // If we scrubbed first, every id becomes the same `:uuid`/`:num-id` sentinel
  // and sort can't disambiguate.
  if (arr.length > 1 && arr.every(isObjectWithStableId)) {
    const sorted = [...arr].sort((a, b) =>
      stableIdString((a as { id: unknown }).id).localeCompare(
        stableIdString((b as { id: unknown }).id),
      ),
    );
    return sorted.map(canonicalizeBody);
  }
  return arr.map(canonicalizeBody);
}

function isObjectWithStableId(v: unknown): v is Record<string, unknown> & { id: unknown } {
  if (typeof v !== 'object' || v === null) return false;
  if (!('id' in (v as object))) return false;
  const id = (v as { id: unknown }).id;
  return typeof id === 'string' || typeof id === 'number';
}

function stableIdString(id: unknown): string {
  return typeof id === 'number' ? id.toString().padStart(20, '0') : String(id);
}

function canonicalizeObject(obj: Record<string, unknown>): Record<string, unknown> {
  const sorted: Record<string, unknown> = {};
  for (const k of Object.keys(obj).sort()) {
    if (k.startsWith('_')) continue; // private/internal
    if (k.endsWith('RequestId') || k.endsWith('TraceId')) continue;
    if (VOLATILE_FIELD_NAMES.has(k)) {
      sorted[k] = scrubVolatileField(k, obj[k]);
      continue;
    }
    sorted[k] = canonicalizeBody(obj[k]);
  }
  return sorted;
}

function scrubVolatileField(name: string, v: unknown): unknown {
  if (v == null) return v;
  if (name === 'id') {
    if (typeof v === 'string' && UUID_RE.test(v)) return SENTINEL_UUID;
    if (typeof v === 'number') return SENTINEL_NUMERIC_ID;
    return SENTINEL_NUMERIC_ID;
  }
  if (name.endsWith('At') || name === 'timestamp') return SENTINEL_TIMESTAMP;
  if (name.endsWith('Token') || name === 'token' || name === 'nonce') return SENTINEL_TOKEN;
  return v;
}
