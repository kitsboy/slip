#!/usr/bin/env node
/**
 * The documentation gate.
 *
 * The manual is data (src/manual/entries.ts), so it can be checked like code. This script fails
 * when the manual points at a file that does not exist, when a panel on screen has no entry, or
 * when a FEATURE-MAP row names a code path that has been renamed or deleted. Run it in CI: stale
 * docs become a red build instead of a nice paragraph nobody can trust.
 *
 * Usage: node scripts/docs-audit.mjs [--strict]
 *   --strict also fails when a panel screenshot is missing (CI after `npm run manual`).
 */

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const strict = process.argv.includes('--strict');
const problems = [];
const warnings = [];

const entriesSource = readFileSync(join(ROOT, 'src/manual/entries.ts'), 'utf8');
const ids = [...entriesSource.matchAll(/^\s*id: '([a-z0-9-]+)',/gm)].map((m) => m[1]);
const codePaths = [...entriesSource.matchAll(/'((?:src|tests)\/[^']+)'/g)].map((m) => m[1]);

if (ids.length === 0) problems.push('the manual has no entries — src/manual/entries.ts did not parse');

for (const p of codePaths) {
  if (!existsSync(join(ROOT, p))) problems.push(`manual refers to a missing file: ${p}`);
}

// Every panel that renders must be documented: the attribute is the contract.
const uiDir = join(ROOT, 'src/ui');
const panels = new Set();
for (const file of readdirSync(uiDir)) {
  if (!file.endsWith('.tsx')) continue;
  const src = readFileSync(join(uiDir, file), 'utf8');
  for (const m of src.matchAll(/data-panel="([a-z0-9-]+)"/g)) panels.add(m[1]);
}
for (const panel of panels) {
  if (!ids.includes(panel)) problems.push(`panel "${panel}" is on screen but has no manual entry`);
}

// FEATURE-MAP rows must name real code.
const mapPath = join(ROOT, 'docs/FEATURE-MAP.md');
if (existsSync(mapPath)) {
  const map = readFileSync(mapPath, 'utf8');
  for (const m of map.matchAll(/`((?:src|tests)\/[^`]+)`/g)) {
    const p = m[1];
    if (!existsSync(join(ROOT, p))) problems.push(`FEATURE-MAP refers to a missing file: ${p}`);
  }
}

// Screenshots prove the manual matches what ships.
const shotsDir = join(ROOT, 'screenshots/manual');
for (const id of ids) {
  const shot = join(shotsDir, `${id}.png`);
  if (!existsSync(shot)) {
    const line = `no screenshot for "${id}" — run npm run manual`;
    if (strict) problems.push(line);
    else warnings.push(line);
  }
}

console.log(`manual entries: ${ids.length}`);
console.log(`documented panels: ${[...panels].join(', ') || 'none'}`);
if (warnings.length) {
  console.log('\nwarnings');
  for (const w of warnings) console.log(`  · ${w}`);
}
if (problems.length) {
  console.log('\nPROBLEMS');
  for (const p of problems) console.log(`  ✗ ${p}`);
  console.log(`\ndocs audit failed: ${problems.length} problem(s)`);
  process.exit(1);
}
console.log('\ndocs audit passed.');
