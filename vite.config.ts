import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

/** Build identity — one source of truth: package.json + git. */
const pkg = JSON.parse(readFileSync(resolve(import.meta.dirname, 'package.json'), 'utf8')) as {
  version: string;
};
const VERSION = pkg.version;
const COMMIT = (() => {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch {
    return 'untracked';
  }
})();
const BUILT_AT = process.env.SOURCE_DATE_EPOCH
  ? new Date(Number(process.env.SOURCE_DATE_EPOCH) * 1000).toISOString()
  : new Date().toISOString();

const DIST = resolve(import.meta.dirname, 'dist/index.html');

/**
 * CSP is injected at BUILD time, and the inline bundle is authorised by HASH.
 *
 * Two constraints forced this shape:
 *  - a policy in the source `index.html` breaks `npm run dev` (Vite injects inline
 *    scripts, so `script-src 'self'` blanks the dev page);
 *  - a single-file build has NO external script to allow — the whole app is one
 *    inline <script>, which `script-src 'self'` blocks. `script-src 'unsafe-inline'`
 *    would work and would also re-open XSS.
 *
 * So the hashes are computed from the FINAL written HTML and baked into the policy:
 * exactly the shipped bytes execute, anything injected later does not.
 */
function cspPlugin() {
  return {
    name: 'slip-csp',
    apply: 'build' as const,
    enforce: 'post' as const,
    closeBundle() {
      let html: string;
      try {
        html = readFileSync(DIST, 'utf8');
      } catch {
        return; // build failed earlier; nothing to harden
      }

      const hashes = [
        ...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g),
      ].map((m) => `'sha256-${createHash('sha256').update(m[1] ?? '').digest('base64')}'`);

      const csp = [
        "default-src 'none'",
        `script-src 'self' ${hashes.join(' ')}`.trim(),
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob:",
        // The six explainer clips are same-origin files, never a CDN or an embed.
        "media-src 'self'",
        "font-src 'self' data:",
        // A merchant's own explorer / rate endpoints cannot be enumerated in a static
        // policy; the provider layer enforces the chosen allow-list (DECISIONS D-07).
        'connect-src https: http: ws: wss:',
        "manifest-src 'self'",
        "base-uri 'none'",
        "form-action 'none'",
        // frame-ancestors is ignored in a meta element — set as a real header in
        // public/_headers, which Cloudflare Pages serves.
      ].join('; ');

      html = html.replace(
        '</head>',
        [
          `  <meta http-equiv="Content-Security-Policy" content="${csp}" />`,
          `  <meta name="slip-version" content="${VERSION}" />`,
          `  <meta name="slip-commit" content="${COMMIT}" />`,
          `  <meta name="slip-built" content="${BUILT_AT}" />`,
          '</head>',
        ].join('\n'),
      );
      writeFileSync(DIST, html, 'utf8');
    },
  };
}

/**
 * The service worker must be named for the build it belongs to.
 *
 * A worker only reinstalls when its own bytes change. A constant `slip-v1` cache name meant
 * `sw.js` never changed between releases, so a device that installed slip early kept its
 * first-cached `index.html` forever — a merchant read v0.8 in the header while v0.25 was
 * live. Replacing `__BUILD__` with `<version>-<commit>` makes every release look new to the
 * browser, which then installs the worker and deletes the old cache on activate.
 */
function swPlugin() {
  return {
    name: 'slip-sw-version',
    apply: 'build' as const,
    enforce: 'post' as const,
    closeBundle() {
      const src = resolve(import.meta.dirname, 'public/sw.js');
      const out = resolve(import.meta.dirname, 'dist/sw.js');
      try {
        const worker = readFileSync(src, 'utf8').replaceAll(
          '__BUILD__',
          `${VERSION}-${COMMIT}`,
        );
        writeFileSync(out, worker, 'utf8');
      } catch {
        /* build failed earlier; nothing to version */
      }
    },
  };
}

/** Prints the SHA-256 of the finished artifact so merchants can verify a download. */
function hashReportPlugin() {
  return {
    name: 'slip-hash-report',
    apply: 'build' as const,
    enforce: 'post' as const,
    closeBundle() {
      try {
        const buf = readFileSync(DIST);
        const sha = createHash('sha256').update(buf).digest('hex');
        writeFileSync(
          resolve(import.meta.dirname, 'dist/SHA256SUMS'),
          `${sha}  index.html\n`,
          'utf8',
        );
        // eslint-disable-next-line no-console -- the build report IS the output here
        console.log(
          `\n  slip v${VERSION} (${COMMIT}) built ${BUILT_AT}` +
            `\n  dist/index.html  ${(buf.byteLength / 1024).toFixed(1)} KB\n  sha256           ${sha}\n`,
        );
      } catch {
        /* build failed earlier; nothing to hash */
      }
    },
  };
}

export default defineConfig({
  define: {
    __SLIP_VERSION__: JSON.stringify(VERSION),
    __SLIP_COMMIT__: JSON.stringify(COMMIT),
    __SLIP_BUILT__: JSON.stringify(BUILT_AT),
  },
  plugins: [
    react(),
    viteSingleFile({ removeViteModuleLoader: true }),
    cspPlugin(),
    swPlugin(),
    hashReportPlugin(),
  ],
  build: {
    target: 'es2022',
    cssCodeSplit: false,
    assetsInlineLimit: 100_000_000,
    reportCompressedSize: true,
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});
