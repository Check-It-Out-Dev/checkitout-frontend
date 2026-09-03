import type { APIRequestContext } from '@playwright/test';

/**
 * Layered FE test architecture — Layer 1 (typed transport).
 *
 * The confidence pyramid the rewrite is built on (owner directive 2026-09-02):
 *   L0 Contract   — OpenAPI-generated DTOs + services (src/app/api), from the BE
 *                   greenfield branch. Single source of truth.
 *   L1 Service    — typed, transport-agnostic API services built on the L0 DTOs
 *                   (this folder). Mirrors the component-side core/** wrappers, so
 *                   BDD and components share ONE contract (DRY). Reads as docs.
 *   L2 Functional — playwright-bdd oracles drive the live BE THROUGH the L1
 *                   services (e2e-tests/bdd). Contract + behaviour confidence.
 *   L3 Component  — jest unit tests of component logic against the same DTOs.
 *   L4 Visual     — sandbox fixtures + visual-parity baselines.
 * Each layer rests on the one below; a BE contract change breaks L0 → L1 → L2
 * at compile time before it can reach production.
 *
 * `ApiHttp` is the L1 transport: a thin generic wrapper over one Playwright
 * APIRequestContext (one authenticated cookie jar — see TestSession). Every call
 * returns the parsed body AND the raw status/headers/text, so a step can assert
 * the status code and surface the server's error body when it fails.
 */

export interface ApiResult<T = unknown> {
  readonly status: number;
  readonly ok: boolean;
  readonly headers: Record<string, string>;
  readonly body: string;
  readonly json: T;
}

export type Query = Record<string, string | number | boolean | undefined>;

type Method = 'get' | 'post' | 'put' | 'patch' | 'delete';

/** JSON-safe clone: Set<number> (generated DTO fields) → the array Jackson expects. */
function toWire(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value, (_k, v) => (v instanceof Set ? Array.from(v) : v)));
}

export class ApiHttp {
  constructor(
    private readonly ctx: APIRequestContext,
    private readonly base: string = '/api',
  ) {}

  get<T = unknown>(path: string, query?: Query): Promise<ApiResult<T>> {
    return this.send<T>('get', path, { query });
  }
  post<T = unknown>(path: string, body?: unknown, query?: Query): Promise<ApiResult<T>> {
    return this.send<T>('post', path, { body, query });
  }
  put<T = unknown>(path: string, body?: unknown, query?: Query): Promise<ApiResult<T>> {
    return this.send<T>('put', path, { body, query });
  }
  patch<T = unknown>(path: string, body?: unknown, query?: Query): Promise<ApiResult<T>> {
    return this.send<T>('patch', path, { body, query });
  }

  private async send<T>(
    method: Method,
    path: string,
    opts: { body?: unknown; query?: Query },
  ): Promise<ApiResult<T>> {
    const params = opts.query
      ? Object.fromEntries(
          Object.entries(opts.query)
            .filter(([, v]) => v !== undefined)
            .map(([k, v]) => [k, String(v)]),
        )
      : undefined;

    const res = await this.ctx[method](`${this.base}${path}`, {
      ...(opts.body !== undefined ? { data: toWire(opts.body) } : {}),
      ...(params ? { params } : {}),
    });

    const body = await res.text();
    let json: T;
    try {
      json = (body ? JSON.parse(body) : {}) as T;
    } catch {
      json = {} as T;
    }
    return { status: res.status(), ok: res.ok(), headers: res.headers(), body, json };
  }
}
