/**
 * Generic Spring `Page<T>` envelope. The generated client emits one
 * interface per content type (PagePartnershipOpportunityDtoOut, …) but
 * they share this exact structural shape, so a single generic builder
 * assigns to any of them. `sort`/`pageable` stay unset — no consumer
 * reads them and their generated types are noise.
 */
export interface PageEnvelope<T> {
  content?: Array<T>;
  totalElements?: number;
  totalPages?: number;
  size?: number;
  number?: number;
  first?: boolean;
  last?: boolean;
  numberOfElements?: number;
  empty?: boolean;
}

export function buildPage<T>(
  content: readonly T[],
  overrides: Partial<Omit<PageEnvelope<T>, 'content'>> = {},
): PageEnvelope<T> {
  const size = overrides.size ?? 20;
  const totalElements = overrides.totalElements ?? content.length;
  const number = overrides.number ?? 0;
  return {
    content: [...content],
    totalElements,
    totalPages: Math.max(1, Math.ceil(totalElements / size)),
    size,
    number,
    first: number === 0,
    last: (number + 1) * size >= totalElements,
    numberOfElements: content.length,
    empty: content.length === 0,
    ...overrides,
  };
}
