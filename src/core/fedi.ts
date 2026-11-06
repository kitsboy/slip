/**
 * Fedi — prepared, deliberately not switched on.
 *
 * The decision (recorded as D-85) is that Fedi is a **template, not a rail**. slip will never join a
 * federation: the guardians hold the sats, so joining would quietly turn "pays straight into your own
 * wallet" into "pays into somebody else's". What slip can do is accept the Lightning address of a
 * merchant's Fedi shared wallet and watch it like any other address — which is what this file
 * prepares, without rendering anything.
 *
 * Nothing here spends, joins, logs in, or talks to a federation. Every function is pure: the live
 * LNURL check happens in `providers/lnurl.ts`, over the network, only when a merchant presses a
 * button. Until the product card ships, `FEDI_CARD_ENABLED` keeps this module off every screen.
 */

import { parseLightningAddress } from './providers/lnurl';

/** Off until Cam says otherwise. The card that will use this is not built. */
export const FEDI_CARD_ENABLED = false;

/** How slip can be paid through a Fedi wallet, and how it cannot. Words, not hopes. */
export const FEDI_RAILS = [
  {
    id: 'lightning',
    label: 'Lightning',
    how: 'The customer pays your Fedi Lightning address. slip watches it and reports what it saw.',
    works: true,
  },
  {
    id: 'onchain',
    label: 'On-chain',
    how: 'Only if the same merchant also pastes an on-chain code from a wallet they control.',
    works: true,
  },
  {
    id: 'ecash',
    label: 'Fedi ecash (e-cash between Fedi users)',
    how: 'Invisible to any point-of-sale. A Fedi-to-Fedi transfer never appears on a chain or an LNURL endpoint.',
    works: false,
  },
] as const;

export interface FediCheck {
  readonly ok: boolean;
  /** Plain reason when it is not ok. Never echoes the address. */
  readonly reason: string;
}

/**
 * A syntax-level check only. It cannot tell whether the host is really Fedi, and it says so rather
 * than pretending: the honest test is a live LNURL lookup, which is a button, not a page load.
 */
export function checkFediAddress(address: string): FediCheck {
  const trimmed = address.trim();
  if (trimmed === '') return { ok: false, reason: 'Paste the Lightning address of your Fedi wallet.' };
  if (/\s/.test(trimmed)) return { ok: false, reason: 'A Lightning address has no spaces in it.' };
  const parsed = parseLightningAddress(trimmed);
  if (!parsed) return { ok: false, reason: 'That does not look like a Lightning address (name@somewhere).' };
  return {
    ok: true,
    reason: 'Looks like a Lightning address. slip still has to ask the host before it can promise anything.',
  };
}

export interface SweepNudge {
  readonly at: boolean;
  readonly sentence: string | null;
}

/**
 * The $400 question. A merchant who wants money moved out of Fedi is asking for custody, and slip
 * will never have it. So the sweep is a nudge: one sentence, computed from numbers the merchant set,
 * with no button that moves anything.
 */
export function sweepSuggestion(input: {
  readonly thresholdSats: bigint;
  readonly balanceSats: bigint | null;
  readonly label?: string;
}): SweepNudge {
  const { thresholdSats, balanceSats, label } = input;
  if (thresholdSats <= 0n || balanceSats === null) return { at: false, sentence: null };
  if (balanceSats < thresholdSats) return { at: false, sentence: null };
  const name = label?.trim() || 'your Fedi wallet';
  return {
    at: true,
    sentence: `${name} is holding more than you said you were happy with. Moving it out is done inside Fedi — slip cannot do it, and never will.`,
  };
}

/** What the eventual card will claim, kept in one place so the words can be reviewed once. */
export const FEDI_CARD_COPY = {
  title: 'Pay to my Fedi account',
  lead: 'Paste the Lightning address of the wallet inside Fedi. Customers pay it like any other Lightning address.',
  limit:
    'slip never joins the federation and cannot move money inside it. A sweep is a reminder you act on in Fedi, not a button here.',
} as const;
