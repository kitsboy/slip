/**
 * Scanning, for the two things a phone actually needs it for: a pairing code and a receipt.
 *
 * Two very different input paths are handled here, because a shop may have either:
 *  - a USB/keyboard-wedge scanner, which types characters very fast and ends with Enter. The
 *    buffer below recognises that rhythm and turns it into one scan instead of forty keystrokes
 *    landing in whatever field has focus;
 *  - a camera, via the BarcodeDetector API where the browser has one. Where it does not, the UI
 *    says so and offers paste — it never pretends to scan.
 *
 * The classifier is separate from both, so a scan of something unrelated is rejected before the
 * app silently does nothing with it.
 */

export type ScanKind = 'pair' | 'proof' | 'address' | 'invoice' | 'unknown';

export interface Classified {
  readonly kind: ScanKind;
  readonly text: string;
  /** A sentence the UI can show: what this scan is, or why it is not usable. */
  readonly description: string;
}

const PROOF_PREFIX = 'SLIP1|';
const PAIR_PREFIX = 'SLIP-WALLET-1|';

export function classifyScan(raw: string): Classified {
  const text = (raw ?? '').trim();
  if (text.startsWith(PAIR_PREFIX)) return { kind: 'pair', text, description: 'a slip wallet pairing code' };
  if (text.startsWith(PROOF_PREFIX)) return { kind: 'proof', text, description: 'a slip receipt proof' };
  if (/^(bitcoin|litecoin):/i.test(text)) return { kind: 'invoice', text, description: 'a payment request from another wallet' };
  if (/^(lnbc|lntb|lnbcrt|lnurl)/i.test(text)) return { kind: 'invoice', text, description: 'a Lightning invoice' };
  if (/^(bc1|tb1|bcrt1|ltc1|tltc1|mipc|rltc)[a-z0-9]{6,90}$/i.test(text)) {
    return { kind: 'address', text, description: 'a chain address' };
  }
  if (/^sp1[a-z0-9]{20,120}$/i.test(text)) return { kind: 'address', text, description: 'a Silent Payments address' };
  return { kind: 'unknown', text, description: 'not something slip can use' };
}

const PUBLIC_KEY = /((?:xpub|ypub|zpub|tpub|upub|vpub|Ypub|Zpub|Ltub|Mtub|ttub)[1-9A-HJ-NP-Za-km-z]{20,})/;

/**
 * A wallet QR is often the bare public code, sometimes with a label around it.
 * Returns that public code, or null when the scan is not one. Never returns a secret:
 * the caller still runs the refusal before writing the field.
 */
export function publicCodeFromScan(raw: string): string | null {
  const text = (raw ?? '').trim();
  if (!text) return null;
  const hit = text.match(PUBLIC_KEY);
  if (hit) return hit[1] ?? null;
  if (/^(wpkh|pkh|sh|tr|wsh)\(/i.test(text)) return text;
  return null;
}

/** What to say when the browser will not open the camera. Never echoes a scanned secret. */
export function cameraRefusal(error: unknown): string {
  const name = error instanceof DOMException ? error.name : '';
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'SecurityError') {
    return 'The browser blocked the camera. Allow the camera for this site in the address bar, then press camera again. Nothing is recorded.';
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') {
    return 'No camera was found. Paste the code instead.';
  }
  return 'The camera could not start. Paste the code instead.';
}

export interface ScanBuffer {
  push(char: string): string | null;
  reset(): void;
  readonly length: number;
}

/**
 * Accumulates wedged keystrokes. A scanner types each character within a few milliseconds; a
 * human cannot. The gap and length thresholds are deliberately conservative: dropping a scan is
 * recoverable (scan again), while swallowing a human's typing is not.
 */
export function createScanBuffer(opts: {
  onScan: (text: string) => void;
  gapMs?: number;
  minLength?: number;
  now?: () => number;
}): ScanBuffer {
  const gapMs = opts.gapMs ?? 90;
  const minLength = opts.minLength ?? 8;
  const now = opts.now ?? (() => Date.now());
  let buffer = '';
  let last = 0;

  return {
    push(char: string): string | null {
      const t = now();
      if (t - last > gapMs) buffer = '';
      last = t;

      if (char === 'Enter' || char === '\n') {
        const scanned = buffer;
        buffer = '';
        if (scanned.length >= minLength) {
          opts.onScan(scanned);
          return scanned;
        }
        return null;
      }
      if (char.length === 1) {
        buffer += char;
        // A runaway buffer is a stuck key, not a scan: drop it rather than grow forever.
        if (buffer.length > 2048) buffer = '';
      }
      return null;
    },
    reset() {
      buffer = '';
      last = 0;
    },
    get length() {
      return buffer.length;
    },
  };
}

/** Whether this browser can scan with a camera at all. Checked, never assumed. */
export function cameraScannerAvailable(): boolean {
  const g = globalThis as unknown as { BarcodeDetector?: unknown; isSecureContext?: boolean };
  return Boolean(g.BarcodeDetector) && g.isSecureContext === true;
}

export interface DetectedBarcode {
  rawValue: string;
}

export interface DetectorLike {
  detect(source: CanvasImageSource): Promise<DetectedBarcode[]>;
}

/** Constructs the native detector where it exists; null means "fall back to paste". */
export function createDetector(): DetectorLike | null {
  const g = globalThis as unknown as {
    BarcodeDetector?: new (opts?: { formats?: string[] }) => DetectorLike;
  };
  if (!g.BarcodeDetector) return null;
  try {
    return new g.BarcodeDetector({ formats: ['qr_code'] });
  } catch {
    return null;
  }
}
