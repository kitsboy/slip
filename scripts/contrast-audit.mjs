#!/usr/bin/env node
/**
 * Verify the "quiet brass" palette actually clears WCAG AA, rather than trusting the
 * design bible's table. Computes relative-luminance contrast the same way the WCAG 2.1
 * formula does and asserts every text pair >= 4.5:1 (AA body) and every large/bold
 * non-text pair >= 3:1.
 *
 * Usage: node scripts/contrast-audit.mjs [--strict]
 *   --strict exits 1 on any failure (CI / pre-deploy gate).
 */

const has = (k) => process.argv.includes(k);
const STRICT = has('--strict');

const hex = (h) => {
  const s = h.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16));
};

const lin = (v) => {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

const lum = (h) => {
  const [r, g, b] = hex(h);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
};

const ratio = (a, b) => {
  const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
};

// Pair table: [label, fg, bg, minimum]
const PAIRS = [
  // Dark
  ['dark: ink on surface', '#f3f5f7', '#11151a', 4.5],
  ['dark: secondary on surface', '#b6c1cc', '#11151a', 4.5],
  ['dark: muted on surface', '#9aa5b1', '#11151a', 4.5],
  ['dark: brass on surface', '#f0a32a', '#11151a', 4.5],
  ['dark: button ink on brass fill', '#0d1117', '#f0a32a', 4.5],
  ['dark: good on surface', '#3dd68a', '#11151a', 4.5],
  ['dark: warn on surface', '#e6a700', '#11151a', 4.5],
  ['dark: pending on surface', '#7cb3e8', '#11151a', 4.5],
  ['dark: bad on surface', '#ec6165', '#11151a', 4.5],
  // Light
  ['light: ink on surface', '#0d1117', '#fdfdf9', 4.5],
  ['light: secondary on page', '#3f4a56', '#f6f4ee', 4.5],
  ['light: muted on surface', '#4d5763', '#fdfdf9', 4.5],
  ['light: brass on page', '#a84808', '#f6f4ee', 4.5],
  ['light: white on brass fill', '#ffffff', '#a84808', 4.5],
  ['light: good on page', '#15803d', '#f6f4ee', 4.5],
  ['light: warn on page', '#93560a', '#f6f4ee', 4.5],
  ['light: pending on page', '#3b6fa5', '#f6f4ee', 4.5],
  ['light: bad on page', '#c2262a', '#f6f4ee', 4.5],
];

let failures = 0;
for (const [label, fg, bg, min] of PAIRS) {
  const r = ratio(fg, bg);
  const ok = r >= min;
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${r.toFixed(2)}:1  (min ${min})  ${label}`);
}

console.log(`\n${PAIRS.length - failures}/${PAIRS.length} pairs clear AA.`);
if (failures > 0 && STRICT) process.exit(1);
process.exit(failures > 0 ? 0 : 0);
