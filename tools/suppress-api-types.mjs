#!/usr/bin/env node
// Post-processor for `npm run openapi:gen`. Two passes:
//
// 1. Prepend `// @ts-nocheck` to every generated .ts file under src/app/api
//    so the strict app tsconfig does not fail on quirks the codegen
//    produces (unused imports, polymorphic-base extends clauses that lose
//    their static-member shape, etc.).
//
// 2. Rewrite `Observable<any>` to `Observable<void>` for void-overload
//    methods. The TS-Angular codegen falls back to `<any>` whenever the
//    OpenAPI response has no content schema (true even for explicit 204
//    No Content with @Content empty) — see memory
//    feedback_codegen_void_returns_observable_any.md. Without this pass,
//    consumers calling `service.approveContent(...).subscribe(...)` get
//    back `<any>` and the type hole propagates. The detection signal is
//    `httpHeaderAccept?: undefined` on the body-overload signature: the
//    codegen acknowledging there's no content type. When that marker is
//    present and the body-overload returns Observable<any>, the next 3
//    sibling overloads + implementation line all get rewritten to <void>.
//
// Why not just relax the global tsconfig? We want strict checking on hand-
// written code; the generated client is its own concern, gated by the BE
// OpenAPI audit instead.
import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('../src/app/api/', import.meta.url).pathname.replace(/^\/(\w):/, '$1:');
const HEADER = '// @ts-nocheck\n';

let suppressed = 0;
let voidified = 0;
let blobFixed = 0;

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full);
      continue;
    }
    if (!entry.endsWith('.ts')) continue;
    let body = readFileSync(full, 'utf8');

    // Pass 2 first (rewrite signatures) — pass 1 (header) prepended after,
    // so the @ts-nocheck stays at the top regardless.
    if (entry.endsWith('.api.ts')) {
      const voidPass = rewriteVoidOverloads(body);
      if (voidPass.changed) {
        body = voidPass.body;
        voidified += voidPass.methodsRewritten;
      }
      const blobPass = rewriteResponseTypeFallback(body);
      if (blobPass.changed) {
        body = blobPass.body;
        blobFixed++;
      }
    }

    if (body.startsWith(HEADER)) {
      writeFileSync(full, body);
      continue;
    }
    writeFileSync(full, HEADER + body);
    suppressed++;
  }
}

/**
 * Find void-overload method blocks and rewrite their `<any>` returns to
 * `<void>`. A method is void-overload when its body-overload signature
 * (`observe?: 'body'`) carries `httpHeaderAccept?: undefined` and returns
 * `Observable<any>;`. The next 3 lines (sibling overloads + impl) belong
 * to the same method when they start with the same `public NAME(` prefix.
 */
function rewriteVoidOverloads(body) {
  const lines = body.split('\n');
  const out = [];
  let methodsRewritten = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Use .* not .+ — parameter-less methods like `activateTrial()` have
    // nothing between the opening `(` and `observe?: 'body'`. Greedy `.+`
    // requires at least one char and silently misses those endpoints,
    // leaking `<any>` to call sites. Caught 2026-05-10 on
    // SubscriptionPaidController.activateTrial / cancelDowngrade.
    const m = line.match(
      /^(\s*public\s+(\w+)\(.*observe\?: 'body'.*httpHeaderAccept\?: undefined.*\): )Observable<any>;$/,
    );
    if (!m) {
      out.push(line);
      continue;
    }
    const name = m[2];
    out.push(`${m[1]}Observable<void>;`);

    // Look ahead: the next 3 overload lines + implementation line should
    // all begin with `public NAME(`. Rewrite each of their `<any>` returns.
    // Stop early if a line breaks the pattern (defensive — codegen is
    // consistent in practice but the loop must be safe if it isn't).
    for (let k = 1; k <= 3 && i + k < lines.length; k++) {
      const sib = lines[i + k];
      if (!sib.match(new RegExp(`^\\s*public\\s+${name}\\(`))) {
        // not a sibling — flush remaining and break
        for (let j = k; j <= 3 && i + j < lines.length; j++) out.push(lines[i + j]);
        i += 3;
        methodsRewritten++;
        break;
      }
      out.push(rewriteSiblingLine(sib));
      if (k === 3) {
        i += 3;
        methodsRewritten++;
      }
    }
  }
  const next = out.join('\n');
  return { changed: next !== body, body: next, methodsRewritten };
}

function rewriteSiblingLine(line) {
  return line
    .replace(/Observable<HttpResponse<any>>;$/, 'Observable<HttpResponse<void>>;')
    .replace(/Observable<HttpEvent<any>>;$/, 'Observable<HttpEvent<void>>;')
    .replace(/Observable<any> \{$/, 'Observable<void> {')
    .replace(/Observable<any>;$/, 'Observable<void>;');
}

// Pass 3: fix the responseType blob-fallback bug.
//
// The TS-Angular codegen emits this pattern for every REST method:
//
//   let responseType_: 'text' | 'json' | 'blob' = 'json';
//   if (localVarHttpHeaderAcceptSelected) {
//     if (... startsWith('text')) responseType_ = 'text';
//     else if (this.configuration.isJsonMime(...)) responseType_ = 'json';
//     else responseType_ = 'blob';   // ← BUG
//   }
//
// When the BE doesn't declare `produces = "application/json"` (it commonly
// uses Spring's default which is `*/*`), the OpenAPI spec emits Accept: */*.
// `isJsonMime('*/*')` returns false, so responseType falls back to 'blob'.
// HttpClient then fetches the JSON response as a Blob; the codegen casts
// the Blob to the expected DTO type → consumers get `{}` despite the wire
// containing a 27 KB JSON payload. Silent type elision.
//
// Caught 2026-05-09 on /partnership-opportunity/paged: greenfield's
// opportunities-list rendered "No active campaigns" against a freshly
// seeded BE with 25 active campaigns. Triage:
// docs/parity-review/2026-05-09/design-critical-batch.md (P0 #132).
//
// Fix: change the fallback to 'json'. Greenfield's BE is a JSON-only REST
// API; methods that legitimately return blobs (file downloads, if any) are
// the exception and should declare `produces` on the BE side. The
// rewrite is safe for the JSON happy path; if a future blob endpoint is
// added, it'll need explicit Accept: octet-stream which won't match this
// fallback and will land in 'json' incorrectly — but that's a fix for
// then, not now.
function rewriteResponseTypeFallback(body) {
  const before = body;
  const after = body.replace(
    /(\s+} else \{\s+)responseType_ = 'blob';/g,
    "$1responseType_ = 'json'; // post-processor: assume JSON for */* (greenfield is JSON-only)",
  );
  return { changed: before !== after, body: after };
}

walk(ROOT);
console.log(
  `[suppress-api-types] @ts-nocheck on ${suppressed} file(s), void-rewrote ${voidified} method group(s), blob-fallback fixed in ${blobFixed} file(s)`,
);
