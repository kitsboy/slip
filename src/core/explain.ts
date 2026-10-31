/**
 * One plain sentence, on demand.
 *
 * The rule for every explanation here: a shopkeeper must be able to read it while a customer is
 * waiting. No jargon, no "UTXO", no "mempool depth". If a term is unavoidable it is explained in
 * the same sentence, not referred to elsewhere.
 *
 * These are words, not behaviour: turning explanations off changes nothing except the words.
 */

export type ExplainId =
  | 'rate'
  | 'charge'
  | 'sats'
  | 'status'
  | 'digest'
  | 'rail'
  | 'index'
  | 'address'
  | 'proof'
  | 'refund'
  | 'net';

export interface Explanation {
  readonly title: string;
  readonly plain: string;
  /** The catch — what this number does NOT promise. */
  readonly caveat: string;
}

export const EXPLANATIONS: Readonly<Record<ExplainId, Explanation>> = {
  rate: {
    title: 'The rate you entered',
    plain: 'How many of your currency one whole bitcoin is worth right now. Every price on the till is worked out from this one number.',
    caveat: 'slip can fetch it for you, but it will never quietly use an old one: after ten minutes it asks you again.',
  },
  charge: {
    title: 'The amount to ask for',
    plain: 'The price in satoshis, rounded up so you are never short by a fraction of a coin.',
    caveat: 'Rounding up by less than a satoshi is not a fee slip takes — slip takes nothing.',
  },
  sats: {
    title: 'Satoshis',
    plain: 'The smallest unit of bitcoin: one hundred million of them make one bitcoin.',
    caveat: 'A sat is money; treat the number with the same care as a bank balance.',
  },
  status: {
    title: 'Payment status',
    plain: 'Seen means the money is in the queue. Paid means it is inside a block and cannot be taken back easily.',
    caveat: 'Only a mined payment becomes a receipt. slip will not call a queued payment paid.',
  },
  digest: {
    title: 'The day digest',
    plain: 'A fingerprint of every completed sale today. If one number in the books changed, the fingerprint would not match.',
    caveat: 'It proves the books have not changed since it was made — not who made them.',
  },
  rail: {
    title: 'How the money arrived',
    plain: 'On-chain is a normal bitcoin payment. Lightning is the instant one. Manual means a human confirmed it.',
    caveat: 'A manual line is a person\u2019s word, and the day close always says how much of the day was manual.',
  },
  index: {
    title: 'Address number',
    plain: 'Each sale gets its own numbered address, so two customers can never pay the same place by accident.',
    caveat: 'An address is used once. Paying a finished sale\u2019s address again cannot be matched to a new sale.',
  },
  address: {
    title: 'The address',
    plain: 'Where the money goes. It belongs to your wallet, not to slip — slip only watches it.',
    caveat: 'Compare the first and last few characters if you copy it by hand.',
  },
  proof: {
    title: 'The receipt proof',
    plain: 'A short line of text naming the sale, the address, the amount and the time. Anyone can keep it and check it later.',
    caveat: 'It is a record, not a signature: slip holds no key that could sign one.',
  },
  refund: {
    title: 'Refund',
    plain: 'A note that you gave money back, with the method and a reference.',
    caveat: 'slip cannot send money anywhere. The refund records what you did, not what slip did.',
  },
  net: {
    title: 'Net',
    plain: 'What you took after refunds are subtracted.',
    caveat: 'Only completed sales count. Abandoned or expired sales are not takings.',
  },
};

export function explain(id: ExplainId): Explanation {
  return EXPLANATIONS[id];
}
