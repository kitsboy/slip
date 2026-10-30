/**
 * Verify this build.
 *
 * A merchant trusting a money-shaped app should be able to answer "which build am I
 * running, and can I check it?" without a terminal. The page reports its own version,
 * commit and build time — and says plainly that the SHA-256 has to be checked against
 * the published file, because a document cannot contain its own hash.
 */

import { useState } from 'react';
import { BUILT_AT, COMMIT, VERSION, buildLabel } from '../core/buildinfo';

const ORIGIN = 'https://slip-6d6.pages.dev';

export default function About() {
  const [copied, setCopied] = useState(false);

  const diagnostics = [
    `slip v${VERSION}`,
    `commit ${COMMIT}`,
    `built ${BUILT_AT}`,
    `origin ${ORIGIN}`,
    `user agent ${typeof navigator === 'undefined' ? 'n/a' : navigator.userAgent}`,
  ].join('\n');

  async function copy() {
    try {
      await navigator.clipboard?.writeText(diagnostics);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section className="mt-6 panel">
      <p className="eyebrow">This build</p>
      <h2 className="panel-title mt-1">
        <span className="figure">{buildLabel()}</span>
      </h2>

      <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-3">
        {[
          ['Version', `v${VERSION}`],
          ['Commit', COMMIT],
          ['Built', BUILT_AT.replace('T', ' ').replace(/\..*$/, ' UTC')],
        ].map(([k, v]) => (
          <div key={k} className="rounded-lg border border-line px-3 py-2">
            <dt className="text-[10px] uppercase tracking-wider text-muted">{k}</dt>
            <dd className="figure mt-0.5 text-[11px]">{v}</dd>
          </div>
        ))}
      </dl>

      <p className="mt-3 text-xs leading-relaxed text-muted">
        To check you are running the published file, compare this version with the one named
        in <code className="font-mono text-[11px]">CHANGELOG.md</code>, and compare the{' '}
        <span className="text-ink">SHA-256</span> of the downloaded{' '}
        <code className="font-mono text-[11px]">index.html</code> against{' '}
        <code className="font-mono text-[11px]">SHA256SUMS</code> released beside it. slip
        cannot show that hash inside itself — no file can contain its own fingerprint — so this
        panel is the honest half of the check.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void copy()}
          className="rounded-lg border border-line px-3 py-2 text-[11px] uppercase tracking-wider text-muted hover:text-ink"
        >
          {copied ? 'copied' : 'copy diagnostics'}
        </button>
        <span className="text-[11px] text-muted">
          Nothing is sent anywhere — this copies to your clipboard only.
        </span>
      </div>
    </section>
  );
}
