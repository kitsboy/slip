/**
 * Shared navigation helper for the tabbed shell.
 *
 * slip renders all six sections and toggles the `hidden` attribute, so a panel outside the
 * active section is present but not actionable. These suites were written for the flat page;
 * rather than unhide panels (a layout the product no longer ships), we deep-link to the panel
 * and let the router do the work. `resolveHash` preserves panel identity and activates the
 * owning section before scrolling, so this exercises the same public contract a user's
 * bookmark would — and doubles as coverage for deep links landing on the exact panel.
 *
 * The developer-only panels (pairing, watchlist, silent payments, self-test) sit behind the
 * "Show the technical tools" switch, which is how a shopkeeper should meet them. A suite that
 * needs one of them turns that switch on first — the same two clicks a developer would make —
 * rather than reaching into the DOM and unhiding what the product chose to hide.
 */

/** Panels the product keeps behind the technical switch. */
const ADVANCED = new Set(['pair', 'watchlist', 'silentpay', 'selftest', 'livetest', 'wallclock']);

/** Turn the technical layer on, the way a curious person would. */
export async function showAdvanced(page) {
  const reveal = page.getByRole('button', { name: 'Show the technical tools' });
  if ((await reveal.count()) > 0 && (await reveal.first().isVisible().catch(() => false))) {
    await reveal.first().click();
  }
  await page.waitForTimeout(150);
}

/**
 * Set the hash to the given panel id and wait until that panel is actually visible.
 * `waitFor({ state: 'visible' })` resolves as soon as the section flips and the panel is
 * measurable, which removes the race the flat-page suites papered over with sleeps.
 */
export async function showPanel(page, id) {
  await page.evaluate((h) => {
    window.location.hash = h;
  }, id);

  const panel = page.locator(`[data-panel="${id}"]`);
  const visible = await panel
    .waitFor({ state: 'visible', timeout: 4000 })
    .then(() => true)
    .catch(() => false);

  if (!visible && ADVANCED.has(id)) {
    await showAdvanced(page);
    await page.evaluate((h) => {
      window.location.hash = h;
    }, id);
  }

  await panel.waitFor({ state: 'visible', timeout: 8000 });
}
