import { HttpInterceptorFn } from '@angular/common/http';

/**
 * Serializes `Set` and `Map` values into JSON-safe shapes anywhere in a
 * request body: Sets become arrays, Maps become plain objects.
 *
 * The generated OpenAPI client types Java `Set<>` relations as TypeScript
 * `Set<number>` (mirroring the BE schema), but `JSON.stringify(new Set([1]))`
 * is `"{}"` — a Set that reaches the wire silently wipes the collection
 * server-side (BUG-3, caught live 2026-09-02: platforms/contentTypes emptied
 * on campaign save). `Map` shares the exact `"{}"` failure mode; no generated
 * type emits one today, so its handling is pure defense-in-depth (judge-fork
 * note, same date). Call sites convert at the boundary (`toWireSet` in
 * opportunity-form); this interceptor eliminates the class app-wide so any
 * Set or Map that reaches an HTTP body — today's code or a future slice —
 * leaves in its JSON wire shape.
 *
 * Only plain objects, arrays, Sets and Maps are walked. Primitives, `Date`,
 * `FormData`, `Blob`/`File`, typed arrays and other class instances pass
 * through untouched, and a hazard-free body keeps its identity (no clone).
 * Map keys are coerced by `Object.fromEntries` exactly as JSON object keys
 * would be — non-primitive keys are a client bug either way, and a garbage
 * key surfaces louder than a silent `{}`. Bodies are DTOs — acyclic by
 * construction; a cyclic body would fail `JSON.stringify` downstream
 * regardless.
 */
export const setToArrayInterceptor: HttpInterceptorFn = (req, next) => {
  const body: unknown = req.body;
  if (body === null || body === undefined || !containsHazard(body)) {
    return next(req);
  }
  return next(req.clone({ body: normalize(body) }));
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function containsHazard(value: unknown): boolean {
  if (value instanceof Set || value instanceof Map) {
    return true;
  }
  if (Array.isArray(value)) {
    return value.some(containsHazard);
  }
  if (isPlainObject(value)) {
    return Object.values(value).some(containsHazard);
  }
  return false;
}

function normalize(value: unknown): unknown {
  if (value instanceof Set) {
    return [...value].map(normalize);
  }
  if (value instanceof Map) {
    return Object.fromEntries([...value.entries()].map(([key, val]) => [key, normalize(val)]));
  }
  if (Array.isArray(value)) {
    return value.map(normalize);
  }
  if (isPlainObject(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, val]) => [key, normalize(val)]));
  }
  return value;
}
