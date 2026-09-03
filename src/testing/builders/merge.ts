/**
 * Deep-merge helper shared by every builder. Overrides win; plain
 * objects merge recursively; arrays and class-like values REPLACE
 * (merging arrays element-wise produces surprising fixtures — a test
 * that overrides `photos` means exactly that list).
 */
export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends ReadonlyArray<unknown>
    ? T[K]
    : T[K] extends object
      ? DeepPartial<T[K]>
      : T[K];
};

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v) && v.constructor === Object;
}

export function mergeDto<T>(base: T, overrides?: DeepPartial<T>): T {
  if (overrides === undefined) return base;
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [key, value] of Object.entries(overrides as Record<string, unknown>)) {
    const prev = out[key];
    out[key] = isPlainObject(prev) && isPlainObject(value) ? mergeDto(prev, value) : value;
  }
  return out as T;
}
