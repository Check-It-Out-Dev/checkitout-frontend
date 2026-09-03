/**
 * External links used across the technical survey (ported from the legacy
 * demo build, feature/demo — content unchanged, both repos verified live).
 *
 * GRAPH_REPO_URL: the published graph-theory / Living-Documentation method
 * (theory series + worked-example proofs + MCP embedding/reranking servers).
 * BE_REPO_URL: the backend, public under MIT since 2026-06-12.
 */
export const GRAPH_REPO_URL = 'https://github.com/Check-It-Out-Dev/graph-theory-system-modeling';

export const BE_REPO_URL = 'https://github.com/Check-It-Out-Dev/checkitout-backend';

/** Build a stable doc/file link into the public backend repo. */
export function beFileUrl(path: string): string {
  return `${BE_REPO_URL}/blob/main/${path.replace(/^\/+/, '')}`;
}
