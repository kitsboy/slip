/**
 * Shared navigation helper for the tabbed shell.
 *
 * slip renders all six sections and toggles the `hidden` attribute, so a panel outside the
 * active section is present but not actionable. These suites were written for the flat page;
 * rather than unhide panels (a layout the product no longer ships), we deep-link to the panel
 * and let the router do the work. `resolveHash` preserves panel identity and activates the
 * owning section before scrolling, so this exercises the same public contract a user's
 * bookmark would — and doubles as coverage for deep links landing on the exact panel.
 */

/**
 * Set the hash to the given panel id and wait until that panel is actually visible.
 * `waitFor({ state: 'visible' })` resolves as soon as the section flips and the panel is
 * measurable, which removes the race the flat-page suites papered over with sleeps.
 */
export async function showPanel(page, id) {
  await page.evaluate((h) => {
    window.location.hash = h;
  }, id);
  await page.locator(`[data-panel="${id}"]`).waitFor({ state: 'visible', timeout: 8000 });
}
