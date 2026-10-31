/**
 * The one place slip mentions who made it.
 *
 * A shop's customer should see the shop, so branding is a suffix on the BIP-21 label — the field a
 * wallet already shows — never a logo stamped across a payment screen. It is also true: Give A Bit
 * did build this, and the link points at the tools rather than at a sales page.
 */

export const BRAND_NAME = 'giveabit.io';
export const BRAND_GLYPH = '\u20BF';

/** BIP-21 labels are free text; keep it short enough that a wallet does not truncate the shop away. */
export function paymentLabel(shopLabel: string, signature: string, max = 100): string {
  const shop = shopLabel.trim();
  const sig = signature.trim();
  if (!sig) return shop.slice(0, max);
  if (!shop) return sig.slice(0, max);
  return `${shop} · ${sig}`.slice(0, max);
}

export function signatureDefault(): string {
  return BRAND_NAME;
}
