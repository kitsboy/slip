#!/usr/bin/env node
/**
 * One runner for the browser suites, so CI, `npm run test:e2e` and a human all run the same list.
 *
 * Usage: node tests/e2e/run-all.mjs [baseUrl]
 */
import { spawnSync } from 'node:child_process';

const BASE = process.argv[2] ?? 'http://[::1]:4181/';
const SUITES = ['till', 'features', 'ops', 'guide', 'assist', 'demo', 'polish', 'onboarding', 'states', 'watcher', 'workflow', 'info', 'offline', 'a11y', 'wizard', 'installable', 'lock', 'overpaid'];

const failed = [];
for (const s of SUITES) {
  console.log(`\n=== ${s} ===`);
  const r = spawnSync(process.execPath, [`tests/e2e/${s}.mjs`, BASE], { stdio: 'inherit' });
  if (r.status !== 0) failed.push(s);
}

if (failed.length) {
  console.error(`\nFAILED: ${failed.join(', ')}`);
  process.exit(1);
}
console.log(`\nAll ${SUITES.length} browser suites passed.`);
