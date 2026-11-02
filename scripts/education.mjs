#!/usr/bin/env node
/**
 * Build the education pack from the code.
 *
 * The manual is data and the explanations are data, so the teaching material can be generated
 * instead of maintained twice. This writes docs/EDUCATION.md: four short lessons, the exact words
 * to say, the figures worth explaining, and the questions to ask before calling a lesson done.
 *
 * Regenerate with `npm run docs:education`. `docs:audit` fails if a manual card is missing here.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const entries = readFileSync(join(ROOT, 'src/manual/entries.ts'), 'utf8');
const explainSrc = readFileSync(join(ROOT, 'src/core/explain.ts'), 'utf8');

function blockAfter(source, id) {
  const at = source.indexOf(`id: '${id}'`);
  if (at < 0) return null;
  const end = source.indexOf('\n  },', at);
  return source.slice(at, end < 0 ? undefined : end);
}

function field(block, name) {
  const m = block?.match(new RegExp(`${name}: '((?:[^'\\\\]|\\\\.)*)'`));
  return m ? m[1].replace(/\\'/g, "'") : '';
}

function list(block, name) {
  const m = block?.match(new RegExp(`${name}: \\[([\\s\\S]*?)\\]`));
  if (!m) return [];
  return [...m[1].matchAll(/'((?:[^'\\\\]|\\\\.)*)'/g)].map((x) => x[1].replace(/\\'/g, "'"));
}

const ids = [...entries.matchAll(/^\s*id: '([a-z0-9-]+)',/gm)].map((m) => m[1]);
const cards = ids.map((id) => {
  const b = blockAfter(entries, id);
  return {
    id,
    title: field(b, 'title'),
    why: field(b, 'why'),
    limit: field(b, 'limit'),
    steps: list(b, 'steps'),
    group: field(b, 'group'),
  };
});

const explains = [...explainSrc.matchAll(/^\s{2}([a-zA-Z]+): \{\n\s+title: '([^']+)',\n\s+plain:\n?\s*'([^']+)'/gm)].map(
  (m) => ({ id: m[1], title: m[2], plain: m[3] }),
);

const LESSONS = [
  {
    n: 1,
    title: 'What slip is (and is not)',
    minutes: 3,
    cards: ['wallets', 'demo-link', 'explainer', 'glossary'],
    say: [
      'slip is a till with no company behind it: no account, no server, no way to spend your money.',
      'A wallet here is only a public address slip watches. The money goes to your wallet, not to slip.',
      'If anything ever asks for a seed phrase, it is not slip.',
    ],
    check: ['They can say where the money lands.', 'They know slip cannot refund or move funds.'],
  },
  {
    n: 2,
    title: 'Take a sale, honestly',
    minutes: 4,
    cards: ['till', 'lightning', 'livetest'],
    say: [
      'Seen means the payment is still in the queue. Paid means it is inside a block.',
      'Only a mined payment produces a receipt — the app will not call a queued payment paid.',
      'Cash? Press “I have the money”. The receipt will say a human confirmed it.',
    ],
    check: ['They can explain seen vs paid without notes.', 'They know the exact-amount warning matters.'],
  },
  {
    n: 3,
    title: 'Close the day and keep proof',
    minutes: 4,
    cards: ['history', 'anchor', 'verify', 'letter'],
    say: [
      'The day close counts completed sales only, split by how the money arrived.',
      'Stamping a day gives you a digest: proof the books existed then, not proof of who wrote them.',
      'A receipt proof is a record the customer keeps; you can check one in seconds.',
    ],
    check: ['They can read a day close aloud.', 'They know stamped is not the same as confirmed.'],
  },
  {
    n: 4,
    title: 'Hand it over and keep it safe',
    minutes: 3,
    cards: ['pair', 'backup', 'assist', 'selftest'],
    say: [
      'A handover note tells the next person what is in flight.',
      'One encrypted file holds wallets, PIN, staff log and books.',
      'Anything on screen that reads as noise can be switched off in Settings → Assistance.',
    ],
    check: ['They can hand over and read the note.', 'They know where backups live and what is inside.'],
  },
];

const lines = [];
lines.push('# Education pack — slip');
lines.push('');
lines.push('_Generated from `src/manual/entries.ts` and `src/core/explain.ts`. Regenerate with `npm run docs:education`; `npm run docs:audit` fails if a card is missing here._');
lines.push('');
lines.push('## The four lessons (14 minutes total)');
lines.push('');
lines.push('| # | Lesson | Minutes | Cards used |');
lines.push('|---|---|---|---|');
for (const l of LESSONS) lines.push(`| ${l.n} | ${l.title} | ${l.minutes} | ${l.cards.join(', ')} |`);
lines.push('');

for (const l of LESSONS) {
  lines.push(`## Lesson ${l.n} — ${l.title} (${l.minutes} min)`);
  lines.push('');
  lines.push('**Say:**');
  for (const s of l.say) lines.push(`- ${s}`);
  lines.push('');
  lines.push('**Show:**');
  for (const id of l.cards) {
    const c = cards.find((x) => x.id === id);
    if (c) lines.push(`- \`${id}\` — ${c.title}: ${c.why}`);
  }
  lines.push('');
  lines.push('**Check before moving on:**');
  for (const c of l.check) lines.push(`- [ ] ${c}`);
  lines.push('');
}

lines.push('## Every card, in its own words');
lines.push('');
for (const c of cards) {
  lines.push(`### ${c.title}  \`${c.id}\``);
  lines.push('');
  lines.push(c.why);
  lines.push('');
  for (const s of c.steps) lines.push(`1. ${s}`);
  lines.push('');
  lines.push(`**Limit:** ${c.limit}`);
  lines.push('');
}

lines.push('## Figures worth explaining on camera');
lines.push('');
lines.push('| Figure | One sentence |');
lines.push('|---|---|');
for (const e of explains) lines.push(`| ${e.title} | ${e.plain} |`);
lines.push('');
lines.push('## Claims we can safely make');
lines.push('');
lines.push('- “No server, no account, no keys.”');
lines.push('- “Seen is not paid; only a mined payment becomes a receipt.”');
lines.push('- “The money goes to your wallet, not to slip.”');
lines.push('- “Stamped means the digest was submitted — the Bitcoin attestation arrives later.”');
lines.push('- “A manual line is a human\'s word, and the day close says how much of it was manual.”');
lines.push('');
lines.push('## Claims we must never make');
lines.push('');
lines.push('- That slip holds, moves, refunds or recovers money.');
lines.push('- That a mempool payment is confirmed.');
lines.push('- That a Silent Payment can be watched without the wallet\'s scan key.');
lines.push('- That a demo or a rehearsal involved real money.');
lines.push('');

writeFileSync(join(ROOT, 'docs/EDUCATION.md'), lines.join('\n'));
console.log(`docs/EDUCATION.md written — ${cards.length} cards, ${LESSONS.length} lessons, ${explains.length} figures`);
