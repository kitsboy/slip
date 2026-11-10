#!/usr/bin/env node
/**
 * The bundle budget, measured rather than remembered.
 *
 * The brief asks for one page under 700 KB, because slip is meant to open on a cheap phone over a
 * shop's wifi. That number was being watched by hand, which means it was not being watched.
 *
 * Two lines, deliberately:
 *   - over 700 KB  → a warning, printed with the exact figure. The page still ships.
 *   - over 800 KB  → a failure. At that size the page has grown a feature that was not paid for.
 *
 * Exit codes: 0 under the warning line, 0 between the lines (warned), 1 over the ceiling.
 */

import { readFileSync, statSync } from 'node:fs';

const FILE = 'dist/index.html';
const WARN_KB = 700;
const FAIL_KB = 800;

let bytes;
try {
  bytes = statSync(FILE).size;
} catch {
  console.error(`budget: ${FILE} does not exist — run \`npm run build\` first.`);
  process.exit(1);
}

const kb = bytes / 1024;
const line = `budget: ${FILE} is ${kb.toFixed(0)} KB (warning ${WARN_KB} KB, ceiling ${FAIL_KB} KB)`;

// A second, useful measurement: the page is one file, so a gzip figure is what the shop's phone
// actually downloads. Best-effort — the gate does not depend on it.
let gz = '';
try {
  const { gzipSync } = await import('node:zlib');
  gz = ` · ${(gzipSync(readFileSync(FILE)).length / 1024).toFixed(0)} KB over the wire (gzip)`;
} catch {
  /* zlib is always present; a failure here must not change the verdict. */
}

if (kb > FAIL_KB) {
  console.error(`${line}${gz}\nbudget: FAIL — over the ceiling by ${(kb - FAIL_KB).toFixed(0)} KB`);
  process.exit(1);
}
if (kb > WARN_KB) {
  console.log(`${line}${gz}\nbudget: WARN — ${(kb - WARN_KB).toFixed(0)} KB over the target, not over the ceiling`);
  process.exit(0);
}
console.log(`${line}${gz}\nbudget: OK`);
