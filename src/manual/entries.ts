/**
 * The manual, declared next to the code it describes.
 *
 * Every panel the merchant can see has an entry here: what it is for, the steps, the words that
 * matter, and the screenshot that proves it. The manual page is generated from this list, and
 * `npm run docs:audit` fails when an entry points at a file, a test or a screenshot that does not
 * exist — so a feature cannot quietly ship undocumented.
 *
 * Rule for writing an entry: the `why` is the reason a shopkeeper would care, never a feature
 * name. If it cannot be said in one plain sentence, the feature is not ready to document.
 */

export interface ManualEntry {
  /** Matches the panel's `data-panel` attribute, so the screenshot script can find it. */
  readonly id: string;
  readonly title: string;
  readonly why: string;
  readonly steps: readonly string[];
  /** The honest limit of the feature — the sentence that stops a merchant expecting too much. */
  readonly limit: string;
  readonly code: readonly string[];
  readonly tests: readonly string[];
  readonly group: 'start' | 'sell' | 'money' | 'trust' | 'records' | 'advanced';
  readonly status: 'live' | 'planned';
}

export const MANUAL: readonly ManualEntry[] = [
  {
    id: 'wallets',
    title: 'Your wallets',
    why: 'slip never holds money, so a wallet here is only a public address slip watches for you.',
    steps: [
      'Paste an xpub, a descriptor, a single public key or one address.',
      'Compare address 0/0 with the same address in your own wallet.',
      'Tick the box only when they match, then save.',
    ],
    limit: 'A wallet is unusable until you confirm address 0/0 yourself — slip will not do it for you.',
    code: ['src/core/accounts.ts', 'src/ui/Counters.tsx'],
    tests: ['tests/accounts.test.ts'],
    group: 'start',
    status: 'live',
  },
  {
    id: 'till',
    title: 'Take a payment',
    why: 'Ring up a sale in four taps and show a QR that pays your wallet directly.',
    steps: [
      'Pick the wallet taking this sale and enter the rate you were quoted.',
      'Tap items, or type a custom amount, or use tip jar mode.',
      'Charge. The QR names the exact amount and the reserved address.',
      'Watch the status: seen in the mempool is not paid. Paid means mined.',
    ],
    limit: 'slip can only check a payment while the payment screen is open, or at the next launch.',
    code: ['src/core/orders.ts', 'src/ui/Till.tsx'],
    tests: ['tests/till.test.ts'],
    group: 'sell',
    status: 'live',
  },
  {
    id: 'lightning',
    title: 'Lightning payments',
    why: 'Coffee-sized sales belong on Lightning, and they can still land in your own wallet.',
    steps: [
      'Enter your Lightning address (name@wallet.example).',
      'Type the amount and rate, then request an invoice.',
      'Show the QR. slip asks your wallet every five seconds whether it settled.',
    ],
    limit: 'If your wallet gives no verify link, the sale can only be confirmed by eye — and slip says so.',
    code: ['src/core/providers/lnurl.ts', 'src/ui/Lightning.tsx'],
    tests: ['tests/lnurl.test.ts'],
    group: 'sell',
    status: 'live',
  },
  {
    id: 'requests',
    title: 'Rent and standing requests',
    why: 'Money that arrives on a schedule still needs a due date and an address.',
    steps: ['Name it, choose the wallet, the amount and how often.', 'Show the request QR when it is due.', 'Mark paid to roll it forward.'],
    limit: 'A request is an ask, not a payment: only a completed invoice proves money arrived.',
    code: ['src/core/requests.ts', 'src/ui/Requests.tsx'],
    tests: ['tests/till.test.ts'],
    group: 'money',
    status: 'live',
  },
  {
    id: 'history',
    title: 'History and the day close',
    why: 'The sheet your accountant asks for, produced from the sales you actually took.',
    steps: ['Pick a day.', 'Read the split by rail, with refunds subtracted.', 'Download the CSV or print the close sheet.'],
    limit: 'Only completed sales count as takings; a manual line is stated separately from an observed one.',
    code: ['src/core/history.ts', 'src/ui/History.tsx'],
    tests: ['tests/ops.test.ts'],
    group: 'records',
    status: 'live',
  },
  {
    id: 'verify',
    title: 'Check a receipt',
    why: 'A customer can prove a sale happened without asking you for anything.',
    steps: ['Scan or paste the proof text under the receipt QR.', 'slip compares the invoice, address and amount against its own books.'],
    limit: 'A proof is a record, not a signature: it cannot prove who wrote it, only what was recorded.',
    code: ['src/core/proof.ts', 'src/ui/Verify.tsx'],
    tests: ['tests/proof.test.ts'],
    group: 'trust',
    status: 'live',
  },
  {
    id: 'anchor',
    title: 'Day book and proof',
    why: 'Stamping a day proves the books existed then, without trusting anyone.',
    steps: ['Choose the day and read the digest.', 'Press stamp to submit it to a public calendar.', 'Keep the file; re-hash later to prove nothing changed.'],
    limit: 'Stamped is not confirmed: the Bitcoin attestation arrives in the calendar’s own time.',
    code: ['src/core/anchor.ts', 'src/ui/AnchorPanel.tsx'],
    tests: ['tests/anchor.test.ts'],
    group: 'trust',
    status: 'live',
  },
  {
    id: 'watchlist',
    title: 'Watchlist',
    why: 'A supplier or a landlord, watched without being touched.',
    steps: ['Add a name, an address and its network.', 'Press check to see the balance and the moment it was read.'],
    limit: 'A watched address can never be spent from: there is no key here.',
    code: ['src/core/ledger.ts', 'src/ui/Watchlist.tsx'],
    tests: ['tests/ops.test.ts'],
    group: 'advanced',
    status: 'live',
  },
  {
    id: 'pair',
    title: 'Pair another device',
    why: 'Move a wallet to a second till with a QR, because public material needs no secrecy.',
    steps: ['Choose a wallet and show its code.', 'On the other device, scan or paste the code and import.'],
    limit: 'An imported wallet arrives UNCHECKED: that device must confirm address 0/0 before taking money.',
    code: ['src/core/pair.ts', 'src/ui/Pair.tsx'],
    tests: ['tests/pair.test.ts'],
    group: 'advanced',
    status: 'live',
  },
  {
    id: 'silentpay',
    title: 'Silent Payments',
    why: 'A private receive address your customer’s wallet can pay to a fresh one-time address.',
    steps: ['Paste your sp1 or tsp1 address.', 'Enter the amount and rate, then show the QR.', 'Record the sale as a manual confirmation.'],
    limit: 'slip cannot watch an sp1 address: detection needs your scan key, which slip will never hold.',
    code: ['src/core/silentpay.ts', 'src/ui/SilentPay.tsx'],
    tests: ['tests/ops.test.ts'],
    group: 'advanced',
    status: 'live',
  },
  {
    id: 'assist',
    title: 'Assistance switches',
    why: 'Every helper on screen can be turned off, so a busy counter can stay quiet.',
    steps: [
      'Open Settings and scroll to Assistance.',
      'Switch off anything that reads as noise — explanations, rings, the footer digest, rehearsal.',
      'Press Save settings. Nothing about how money is handled changes.',
    ],
    limit: 'Rehearsal is a practice mode: a rehearsed sale is never written to the books and never watched.',
    code: ['src/core/settings.ts', 'src/ui/Settings.tsx'],
    tests: ['tests/assist.test.ts'],
    group: 'start',
    status: 'live',
  },
  {
    id: 'selftest',
    title: 'Prove it works',
    why: 'Check that the copy of slip on this device still does its arithmetic correctly.',
    steps: ['Press run the check.', 'Read the five ticks: address, amount, sats, QR, proof.'],
    limit: 'It proves the maths has not been altered — not that the whole app is safe. slip still holds no keys.',
    code: ['src/core/selftest.ts', 'src/ui/SelfTest.tsx'],
    tests: ['tests/assist.test.ts'],
    group: 'trust',
    status: 'live',
  },
  {
    id: 'manual',
    title: 'This manual',
    why: 'Every panel explains itself here, in the same words the build checks.',
    steps: ['Search for the plain word you would use — cash, rent, proof.', 'Read the limit line before relying on a feature.'],
    limit: 'If a panel is missing from this page, it is missing from the app — the build fails otherwise.',
    code: ['src/manual/entries.ts', 'src/ui/Manual.tsx'],
    tests: ['tests/guide.test.ts'],
    group: 'start',
    status: 'live',
  },
  {
    id: 'backup',
    title: 'Backups',
    why: 'One encrypted file holds your wallets, your PIN, your staff log and your books.',
    steps: ['Choose a passphrase you will remember.', 'Export the file and keep it somewhere you would keep a bank statement.', 'To restore, preview the file first, then confirm.'],
    limit: 'The file holds public wallet material only. If you lose it, your money is still safe — only the records are lost.',
    code: ['src/core/backup.ts', 'src/ui/Backup.tsx'],
    tests: ['tests/backup.test.ts'],
    group: 'records',
    status: 'live',
  },
  {
    id: 'settings',
    title: 'Settings',
    why: 'The shop’s name, currency, tax, explorer and rate source in one place.',
    steps: ['Change a value.', 'Press save — nothing is applied until you do.'],
    limit: 'The rate endpoint is optional: leaving it empty means you type the rate, which is the safest default.',
    code: ['src/core/settings.ts', 'src/ui/Settings.tsx'],
    tests: ['tests/settings.test.ts'],
    group: 'start',
    status: 'live',
  },
];

export const MANUAL_GROUPS: ReadonlyArray<{ id: ManualEntry['group']; label: string; why: string }> = [
  { id: 'start', label: 'Start here', why: 'The two things to do before your first sale.' },
  { id: 'sell', label: 'Selling', why: 'Taking money on-chain and over Lightning.' },
  { id: 'money', label: 'Money in', why: 'Sales that arrive on a schedule.' },
  { id: 'trust', label: 'Proof', why: 'Showing that a sale, and a day, really happened.' },
  { id: 'records', label: 'Records', why: 'The books, the backups and the sheet for your accountant.' },
  { id: 'advanced', label: 'When you need more', why: 'Watching, pairing, privacy rails.' },
];

export function manualFor(id: string): ManualEntry | null {
  return MANUAL.find((e) => e.id === id) ?? null;
}

export function searchManual(query: string): ManualEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...MANUAL];
  return MANUAL.filter((e) =>
    [e.title, e.why, e.limit, ...e.steps].join(' ').toLowerCase().includes(q),
  );
}
