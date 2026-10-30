#!/usr/bin/env node
/**
 * Generates src/core/currencies.ts from the published ISO 4217 data set.
 *
 * Why generated: currency minor-unit exponents (JPY has 0 decimals, KWD has 3) are
 * exactly the kind of table that looks right when typed from memory and silently
 * truncates somebody's money. Source:
 *   https://github.com/datasets/currency-codes  (data/codes-all.csv, ISO 4217)
 *
 * Usage: node scripts/make-currency-table.mjs
 */

import { writeFileSync } from 'node:fs';

const SRC = 'https://raw.githubusercontent.com/datasets/currency-codes/master/data/codes-all.csv';
const res = await fetch(SRC);
if (!res.ok) {
  console.error(`fetch failed: ${res.status}`);
  process.exit(1);
}
const csv = await res.text();

/** Minimal RFC-4180 CSV split (quoted fields, no embedded newlines in this data). */
function parseCsv(text) {
  const rows = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    const fields = [];
    let cur = '';
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (quoted) {
        if (ch === '"' && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else if (ch === '"') quoted = false;
        else cur += ch;
      } else if (ch === '"') quoted = true;
      else if (ch === ',') {
        fields.push(cur);
        cur = '';
      } else cur += ch;
    }
    fields.push(cur);
    rows.push(fields);
  }
  return rows;
}

const rows = parseCsv(csv);
const header = rows.shift();
const iCode = header.indexOf('AlphabeticCode');
const iName = header.indexOf('Currency');
const iMinor = header.indexOf('MinorUnit');
if (iCode < 0 || iMinor < 0) {
  console.error('unexpected CSV shape — refusing to generate a table');
  process.exit(1);
}

const byCode = new Map();
for (const r of rows) {
  const code = (r[iCode] ?? '').trim();
  const name = (r[iName] ?? '').trim();
  const minorRaw = (r[iMinor] ?? '').trim();
  if (!code || !/^[A-Z]{3}$/.test(code)) continue;
  if (!/^\d+$/.test(minorRaw)) continue; // blank = "not applicable" (XAU, XDR, test codes)
  if (byCode.has(code)) continue;
  byCode.set(code, { code, name, minorUnits: Number(minorRaw) });
}

const entries = [...byCode.values()].sort((a, b) => a.code.localeCompare(b.code));
const body = entries
  .map(
    (c) =>
      `  ${c.code}: { code: '${c.code}', name: ${JSON.stringify(c.name)}, minorUnits: ${c.minorUnits} },`,
  )
  .join('\n');

const out = `/**
 * ISO 4217 currency exponents — GENERATED FILE, do not hand-edit.
 *
 * Source: https://github.com/datasets/currency-codes (data/codes-all.csv)
 * Regenerate: node scripts/make-currency-table.mjs
 *
 * minorUnits is the number of decimal places the currency uses: 2 for USD,
 * 0 for JPY and KRW, 3 for KWD/BHD/OMR/JOD/TND/LYD/IQD. Getting this wrong
 * multiplies or divides a price by a power of ten, so it is generated from the
 * published register rather than typed.
 */

export interface CurrencyInfo {
  readonly code: string;
  readonly name: string;
  readonly minorUnits: number;
}

export const CURRENCIES: Readonly<Record<string, CurrencyInfo>> = {
${body}
};

export const CURRENCY_CODES = Object.keys(CURRENCIES);
`;

writeFileSync('src/core/currencies.ts', out);
console.log(`wrote src/core/currencies.ts — ${entries.length} currencies`);
