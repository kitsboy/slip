import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * CSP is injected at BUILD TIME only.
 * Reason: the dev server injects inline scripts, so a strict `script-src 'self'`
 * would break `npm run dev`. Shipping a policy in the dev HTML would mean either
 * a weak policy in production or an unusable dev loop. Build-only is honest.
 *
 * connect-src cannot enumerate user-configured explorers / rate endpoints, so it
 * is constrained by scheme (https/http/ws/wss) and the provider layer enforces
 * the merchant's chosen allow-list separately (see DECISIONS.md D-07).
 */
const CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src https: http: ws: wss:",
  "manifest-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ');

function cspPlugin() {
  return {
    name: 'slip-csp',
    apply: 'build' as const,
    transformIndexHtml(html: string) {
      return html.replace(
        '</head>',
        `  <meta http-equiv="Content-Security-Policy" content="${CSP}" />\n</head>`,
      );
    },
  };
}

/** Prints the SHA-256 of dist/index.html so merchants can verify the artifact. */
function hashReportPlugin() {
  return {
    name: 'slip-hash-report',
    apply: 'build' as const,
    closeBundle() {
      const file = resolve(import.meta.dirname, 'dist/index.html');
      try {
        const buf = readFileSync(file);
        const sha = createHash('sha256').update(buf).digest('hex');
        const kb = (buf.byteLength / 1024).toFixed(1);
        writeFileSync(
          resolve(import.meta.dirname, 'dist/SHA256SUMS'),
          `${sha}  index.html\n`,
          'utf8',
        );
        console.log(`\n  dist/index.html  ${kb} KB\n  sha256           ${sha}\n`);
      } catch {
        /* build failed earlier; nothing to hash */
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), cspPlugin(), viteSingleFile({ removeViteModuleLoader: true }), hashReportPlugin()],
  build: {
    target: 'es2022',
    cssCodeSplit: false,
    assetsInlineLimit: 100_000_000,
    reportCompressedSize: true,
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});