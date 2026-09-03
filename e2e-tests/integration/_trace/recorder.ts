/**
 * Stage 5b — Playwright trace recorder.
 *
 * Hooks into a `BrowserContext`'s `request`/`response` events to build a
 * `TraceEntry[]` for the duration of a recording session. Only captures
 * requests targeted at the BE (matched by URL pattern); ignores asset
 * loads (CSS, JS chunks, fonts, images, source maps).
 *
 * Usage:
 *
 * ```ts
 * const recorder = new TraceRecorder(context, { match: '/api/' });
 * await recorder.start();
 * // ... drive the user flow ...
 * const trace = await recorder.stop();
 * ```
 *
 * The recorder is intentionally side-effect-free on the page — it observes
 * only. Auth flows that the FE itself drives (e.g. login interceptor
 * redirects) are captured as part of the natural trace.
 */

import type { BrowserContext, Request, Response } from '@playwright/test';
import type { HttpMethod, Trace, TraceEntry } from './types';

interface RecorderOptions {
  /** Substring URLs must contain to be recorded. Default `/api/`. */
  readonly match?: string;
  /** Substring URLs to skip even if they match. Default: source maps + assets. */
  readonly ignore?: readonly string[];
}

const DEFAULT_OPTIONS: Required<RecorderOptions> = {
  match: '/api/',
  ignore: ['.map', '.css', '.js', '.woff', '.woff2', '.svg', '.png', '.ico'],
};

interface PendingEntry {
  readonly request: Request;
  readonly startedAt: number;
}

export class TraceRecorder {
  private readonly opts: Required<RecorderOptions>;
  private readonly entries: TraceEntry[] = [];
  private readonly pending = new Map<Request, PendingEntry>();
  private started = false;

  constructor(
    private readonly context: BrowserContext,
    opts: RecorderOptions = {},
  ) {
    this.opts = { ...DEFAULT_OPTIONS, ...opts };
  }

  async start(): Promise<void> {
    if (this.started) throw new Error('TraceRecorder already started');
    this.started = true;
    this.context.on('request', this.onRequest);
    this.context.on('response', this.onResponse);
  }

  async stop(): Promise<Trace> {
    if (!this.started) throw new Error('TraceRecorder not started');
    this.started = false;
    this.context.off('request', this.onRequest);
    this.context.off('response', this.onResponse);
    // Wait briefly for any in-flight responses to land.
    await new Promise((resolve) => setTimeout(resolve, 100));
    return [...this.entries].sort((a, b) => a.startedAt - b.startedAt);
  }

  private readonly onRequest = (request: Request): void => {
    if (!this.shouldCapture(request.url())) return;
    this.pending.set(request, { request, startedAt: Date.now() });
  };

  private readonly onResponse = async (response: Response): Promise<void> => {
    const request = response.request();
    const pending = this.pending.get(request);
    if (!pending) return;
    this.pending.delete(request);

    const url = request.url();
    const parsed = new URL(url);
    const elapsedMs = Date.now() - pending.startedAt;
    const requestHeaders = await safeHeaders(() => request.allHeaders());
    const responseHeaders = await safeHeaders(() => response.allHeaders());
    const requestBody = await safeRequestBody(request);
    const responseBody = await safeResponseBody(response);

    this.entries.push({
      method: request.method() as HttpMethod,
      url,
      path: parsed.pathname,
      query: parseQuery(parsed.searchParams),
      requestHeaders,
      requestBody,
      responseStatus: response.status(),
      responseHeaders,
      responseBody,
      elapsedMs,
      startedAt: pending.startedAt,
    });
  };

  private shouldCapture(url: string): boolean {
    if (!url.includes(this.opts.match)) return false;
    if (this.opts.ignore.some((s) => url.endsWith(s))) return false;
    return true;
  }
}

async function safeHeaders(
  read: () => Promise<Record<string, string>>,
): Promise<Readonly<Record<string, string>>> {
  try {
    return Object.freeze(await read());
  } catch {
    return Object.freeze({});
  }
}

async function safeRequestBody(request: Request): Promise<unknown> {
  try {
    const data = request.postData();
    if (data == null || data === '') return null;
    try {
      return JSON.parse(data);
    } catch {
      return data; // form-encoded or binary; keep as string
    }
  } catch {
    return null;
  }
}

async function safeResponseBody(response: Response): Promise<unknown> {
  const ct = (response.headers()['content-type'] ?? '').toLowerCase();
  if (ct.includes('application/json')) {
    try {
      return await response.json();
    } catch {
      return null;
    }
  }
  if (ct.startsWith('text/')) {
    try {
      return await response.text();
    } catch {
      return null;
    }
  }
  return null;
}

function parseQuery(params: URLSearchParams): Readonly<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const [k, v] of params.entries()) {
    out[k] = v;
  }
  return Object.freeze(out);
}
