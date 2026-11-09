#!/usr/bin/env node
/**
 * Enforces the v2 token rules. v1 CSS is ignored, so this passes vacuously until a
 * v2 rule breaks one. Exit 1 prints `file:line  selector  rule`.
 *
 * 1. An interactive selector must not use var(--v2-line) on a border or outline.
 * 2. var(--v2-acc) may appear only on .btn-primary, a prose link, or :focus-visible.
 * 3. color: var(--v2-ink) must never sit on background: var(--v2-acc).
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const file = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'index.css');
const raw = readFileSync(file, 'utf8');
const css = raw.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));

const INTERACTIVE =
  /(^|[\s,>+~(])(button|a|input|select|textarea|summary|\[role=(button|switch|tab|radio|checkbox)\]|\.(btn|chip|tile|key|toggle|tab)[\w-]*)(?![\w-])/;
/**
 * Where brass is allowed. The action set (primary button, prose link, focus ring), plus the few
 * marks the design deliberately draws in brass and that were agreed with the owner:
 * the drawn tile art, the current step marker, the "jump to me" ring, and the faint mark behind
 * the header word. Those are decoration on purpose; every one of them is listed here by name so a
 * new brass use still fails the gate until someone decides it belongs.
 */
const ALLOW =
  /\.(btn-primary|link)\b|\bprose a\b|:focus-visible|\.v2-tile svg|\.v2-on\b|\.v2-jump\b|body::before/;

/** @type {{ selector: string, body: string, line: number }[]} */
const rules = [];

function walk(text, lineBase) {
  let i = 0;
  while (i < text.length) {
    while (i < text.length && /[\s;]/.test(text[i])) i += 1;
    if (i >= text.length) break;
    const brace = text.indexOf('{', i);
    if (brace < 0) break;
    const header = text.slice(i, brace).trim();
    let depth = 1;
    let j = brace + 1;
    while (j < text.length && depth > 0) {
      if (text[j] === '{') depth += 1;
      else if (text[j] === '}') depth -= 1;
      j += 1;
    }
    const body = text.slice(brace + 1, j - 1);
    const line = lineBase + text.slice(0, i).split('\n').length - 1;
    if (header.startsWith('@media') || header.startsWith('@supports')) {
      walk(body, line);
    } else if (header && !header.startsWith('@') && header.includes('data-skin')) {
      rules.push({ selector: header.replace(/\s+/g, ' '), body, line });
    }
    i = j;
  }
}

walk(css, 1);

const violations = [];
for (const rule of rules) {
  if (!rule.selector.includes('v2')) continue;
  const decls = rule.body.split(';').map((d) => d.trim()).filter(Boolean);
  const usesLine = decls.some(
    (d) => /(^|[\s])(border|outline)[\w-]*\s*:/.test(d) && d.includes('var(--v2-line)'),
  );
  if (usesLine && INTERACTIVE.test(rule.selector)) {
    violations.push(`${file}:${rule.line}  ${rule.selector}  decorative token on interactive element`);
  }
  const usesAcc = rule.body.includes('var(--v2-acc)');
  if (usesAcc && !ALLOW.test(rule.selector)) {
    violations.push(`${file}:${rule.line}  ${rule.selector}  accent outside ACTION role`);
  }
  const colorInk = decls.some((d) => /color\s*:/.test(d) && !/background/.test(d) && d.includes('var(--v2-ink)'));
  const bgAcc = decls.some((d) => /background(-color)?\s*:/.test(d) && d.includes('var(--v2-acc)'));
  if (colorInk && bgAcc) {
    violations.push(`${file}:${rule.line}  ${rule.selector}  forbidden ink-on-accent pairing`);
  }
}

if (violations.length > 0) {
  for (const v of violations) console.log(v);
  process.exit(1);
}
process.exit(0);
