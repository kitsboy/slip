/**
 * Build identity: version, commit, build time.
 *
 * Every deploy carries a version so "is this the fix?" is answerable from the page
 * itself. Values are injected by vite.config.ts (define) and also exist as meta tags in
 * the built HTML, so a remote checker can grep them without running JS.
 *
 * `typeof` guards matter: the constants are undefined under vitest unless the test
 * config defines them, and a bare identifier would throw a ReferenceError at import.
 *
 * The SHA-256 of index.html is NOT here: a file cannot contain its own hash. It ships in
 * dist/SHA256SUMS beside the artifact; the About panel explains how to compare them.
 */

declare const __SLIP_VERSION__: string | undefined;
declare const __SLIP_COMMIT__: string | undefined;
declare const __SLIP_BUILT__: string | undefined;

function pick(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

export const VERSION = pick(
  typeof __SLIP_VERSION__ === 'undefined' ? undefined : __SLIP_VERSION__,
  '0.0.0-dev',
);
export const COMMIT = pick(
  typeof __SLIP_COMMIT__ === 'undefined' ? undefined : __SLIP_COMMIT__,
  'unknown',
);
export const BUILT_AT = pick(
  typeof __SLIP_BUILT__ === 'undefined' ? undefined : __SLIP_BUILT__,
  'unknown',
);

/** Short, quotable identity: "v0.4.0 · bf9f4ea". */
export function buildLabel(): string {
  return `v${VERSION} · ${COMMIT}`;
}
