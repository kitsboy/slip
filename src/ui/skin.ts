/**
 * The new look is the only look.
 *
 * This used to read the query string. `?skin=v1` is gone (see main.tsx): the old interface is one
 * deploy away — the tagged build `pre-v2-2026-11-10`, which passes the browser suites — and not a
 * query string away. Returning a constant lets the minifier drop the old markup from the bundle
 * instead of shipping both interfaces to every customer.
 *
 * There are no call sites left: the last two (the hero and the footer in `App.tsx`) were deleted on
 * 2026-11-11, and the function stays as the one place that records the decision. Import it only if a
 * *third* skin ever needs choosing; a branch nobody can take is not a feature.
 */
export function isSkinV2(): boolean {
  return true;
}
