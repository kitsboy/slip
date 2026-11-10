/**
 * The new look is the only look.
 *
 * This used to read the query string. `?skin=v1` is gone (see main.tsx): the old interface is one
 * deploy away — the tagged build `pre-v2-2026-11-10`, which passes the browser suites — and not a
 * query string away. Returning a constant lets the minifier drop the old markup from the bundle
 * instead of shipping both interfaces to every customer.
 *
 * The 102 `isSkinV2()` call sites still read naturally; their dead halves fold away at build time.
 */
export function isSkinV2(): boolean {
  return true;
}
