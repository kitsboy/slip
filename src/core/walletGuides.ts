/**
 * Where is my wallet's public code?
 *
 * The hardest step in slip is the first one: nine people in ten do not know what an xpub is, and
 * "paste your wallet's public code" is the sentence where a stranger gives up. The answer is not
 * more explanation, it is recognition — "which app do you use?" and then the two or three taps,
 * named, for that app.
 *
 * Two honesty rules govern this file:
 *
 *  - STEPS ARE DESCRIBED, NOT GUARANTEED. Wallet menus move between releases, so each entry says
 *    what the thing is called and where it usually lives, and the UI labels it as a guide rather
 *    than as a promise about any particular version.
 *  - A WALLET THAT CANNOT GIVE A WATCH-ONLY CODE SAYS SO. A Lightning-only app cannot produce an
 *    xpub; telling someone to hunt for one wastes the one minute they were willing to give us. Those
 *    entries route to the Lightning address path instead, which slip supports just as well.
 */

export type GuideKind = 'code' | 'lightning';

export interface WalletGuide {
  readonly id: string;
  readonly name: string;
  /** What this app can hand slip. Decides which field the guide sends the person to. */
  readonly kind: GuideKind;
  /** One line, plain, about what the app is good for here. */
  readonly blurb: string;
  /** Where the code lives, in ordinary words. Described, not promised. */
  readonly steps: readonly string[];
  /** The honest caveat, when there is one. */
  readonly caveat?: string;
}

export const WALLET_GUIDES: readonly WalletGuide[] = [
  {
    id: 'bluewallet',
    name: 'BlueWallet',
    kind: 'code',
    blurb: 'Free, on iOS and Android, and the easiest place to find a code that is safe to paste.',
    steps: [
      'Open the wallet you want to be paid into (not a "watch-only" one you imported).',
      'Tap the wallet’s menu (⋯ or the three dots) and look for "Show wallet export" or "xpub".',
      'Copy the long code that starts with zpub, ypub or xpub, and paste it into slip.',
    ],
    caveat: 'If the app offers a QR instead of text, you can scan it — slip only needs the text.',
  },
  {
    id: 'sparrow',
    name: 'Sparrow',
    kind: 'code',
    blurb: 'Desktop, for people who already run their own node. Gives the cleanest code of all.',
    steps: [
      'Open your wallet, then Settings → Wallet.',
      'Copy the "Output descriptor" — or the xpub shown under it.',
      'Paste it into slip. A descriptor is the most precise thing you can give it.',
    ],
  },
  {
    id: 'electrum',
    name: 'Electrum',
    kind: 'code',
    blurb: 'Older, reliable, on every desktop. Its public code is called the master public key.',
    steps: [
      'Open your wallet and choose Wallet → Information.',
      'Copy the "Master public key" — it starts with xpub, ypub or zpub.',
      'Paste it into slip.',
    ],
    caveat: 'Never copy the seed words from the same screen. slip will refuse them.',
  },
  {
    id: 'phoenix',
    name: 'Phoenix',
    kind: 'lightning',
    blurb: 'A Lightning wallet on your phone. It has no public code to give — it has an address.',
    steps: [
      'Open Phoenix and tap Receive.',
      'Copy your Lightning address (it looks like an email: name@something).',
      'Paste it into slip’s Lightning card instead of the wallet-code field.',
    ],
    caveat: 'slip can watch a Lightning address, but it cannot see an on-chain sale through it.',
  },
  {
    id: 'strike',
    name: 'Strike',
    kind: 'lightning',
    blurb: 'Lightning address, familiar interface. Good when most customers pay by phone.',
    steps: [
      'Open Strike and find your Lightning address under Receive or your profile.',
      'Copy the address (name@strike.me or similar).',
      'Paste it into slip’s Lightning card.',
    ],
  },
  {
    id: 'cashapp',
    name: 'Cash App',
    kind: 'lightning',
    blurb: 'Widely used by customers. Gives a Lightning address, not an on-chain code.',
    steps: [
      'Open Cash App → your Bitcoin tab → Receive.',
      'Copy the Lightning address shown there.',
      'Paste it into slip’s Lightning card.',
    ],
    caveat: 'Cash App can change or limit these addresses; check one small payment first.',
  },
  {
    id: 'fedi',
    name: 'Fedi',
    kind: 'lightning',
    blurb: 'A shared wallet inside a federation. slip pays into its Lightning address.',
    steps: [
      'Open Fedi and open the wallet you want the money in.',
      'Copy its Lightning address from Receive.',
      'Paste it into slip’s Lightning card — no federation login is ever asked for.',
    ],
    caveat: 'slip never joins the federation, so it cannot move or sweep money inside it.',
  },
  {
    id: 'other',
    name: 'Something else',
    kind: 'code',
    blurb: 'Most wallets can do it — the words differ. Look for any of these in the wallet’s menu.',
    steps: [
      'Look for "Export", "Wallet info", "Public key", "xpub" or "Descriptor".',
      'Anything that starts zpub / ypub / xpub / Ltub is a public code and safe to paste.',
      'If the app only offers a receiving address, paste that one address instead — it works, but it is one sale at a time.',
    ],
    caveat: 'If the app only offers seed words or a private key, stop: that is not what slip wants.',
  },
];

export function guideById(id: string): WalletGuide | undefined {
  return WALLET_GUIDES.find((guide) => guide.id === id);
}
