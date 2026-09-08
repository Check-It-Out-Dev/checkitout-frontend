/**
 * External links used across the technical survey (ported from the legacy
 * demo build, feature/demo — content unchanged, both repos verified live).
 *
 * GRAPH_REPO_URL: the published graph-theory / Living-Documentation method
 * (theory series + worked-example proofs + MCP embedding/reranking servers).
 * BE_REPO_URL: the backend, public under MIT since 2026-06-12.
 * FE_REPO_URL: this repository's public mirror.
 */
export const GRAPH_REPO_URL = 'https://github.com/Check-It-Out-Dev/graph-theory-system-modeling';

export const BE_REPO_URL = 'https://github.com/Check-It-Out-Dev/checkitout-backend';

export const FE_REPO_URL = 'https://github.com/Check-It-Out-Dev/checkitout-frontend';

/** The organisation that holds the three repositories. */
export const GITHUB_ORG_URL = 'https://github.com/Check-It-Out-Dev';

/** The engineer behind the estate — the entry page names him once. */
export const AUTHOR_NAME = 'Norbert Marchewka';
export const AUTHOR_LINKEDIN_URL = 'https://www.linkedin.com/in/norbert-marchewka-292377129/';

/** Build a stable doc/file link into the public backend repo. */
export function beFileUrl(path: string): string {
  return `${BE_REPO_URL}/blob/main/${path.replace(/^\/+/, '')}`;
}

/** Build a stable doc/file link into the public frontend repo. */
export function feFileUrl(path: string): string {
  return `${FE_REPO_URL}/blob/main/${path.replace(/^\/+/, '')}`;
}

/** Build a stable doc/file link into the public graph-theory repo. */
export function graphFileUrl(path: string): string {
  return `${GRAPH_REPO_URL}/blob/main/${path.replace(/^\/+/, '')}`;
}
