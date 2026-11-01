/**
 * Portable Chrome path for the browser suites and screenshot scripts.
 *
 * The suites used to `find /root/.cache/ms-playwright …`, which only works on one machine. CI
 * runners keep the browser under `$HOME/.cache`, and Playwright already knows where it installed
 * its own build — so prefer an explicit CHROME_PATH, then the local cache, then Playwright.
 */
import { chromium } from 'playwright';
import { execSync } from 'node:child_process';

export function chromePath() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  try {
    const found = execSync('find "$HOME/.cache/ms-playwright" -name chrome -type f 2>/dev/null | head -1', {
      encoding: 'utf8',
    }).trim();
    if (found) return found;
  } catch {
    /* fall through to Playwright's bundled path */
  }
  return chromium.executablePath();
}
