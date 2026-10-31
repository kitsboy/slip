/**
 * The note that changes hands with the till.
 *
 * A shift change is where a small shop loses information: two sales parked, a refund, a rate that
 * went stale, a customer told to come back. This builds three plain lines from the app's own state
 * so the next person starts oriented instead of guessing.
 *
 * It says only what the app knows. No guesses, no "probably busy" — a handover note that invents
 * context is worse than none.
 */

export interface HandoverInput {
  readonly staffName: string | null;
  readonly parkedTabs: number;
  readonly openSales: number;
  readonly refundsToday: number;
  readonly takingsToday: bigint;
  readonly rateAgeSeconds: number | null;
  readonly now?: Date;
}

export interface HandoverNote {
  readonly headline: string;
  readonly lines: readonly string[];
  readonly time: string;
}

function ageWords(seconds: number): string {
  if (seconds < 120) return 'just now';
  if (seconds < 3600) return `${Math.round(seconds / 60)} min ago`;
  return `${Math.round(seconds / 3600)} h ago`;
}

export function buildHandover(input: HandoverInput): HandoverNote {
  const now = input.now ?? new Date();
  const parts: string[] = [];

  parts.push(
    input.parkedTabs > 0
      ? `${input.parkedTabs} sale${input.parkedTabs === 1 ? '' : 's'} parked — tap the tab to resume`
      : 'no parked sales',
  );
  parts.push(
    input.openSales > 0
      ? `${input.openSales} sale${input.openSales === 1 ? '' : 's'} still waiting for payment`
      : 'nothing waiting for payment',
  );
  if (input.refundsToday > 0) parts.push(`${input.refundsToday} refund${input.refundsToday === 1 ? '' : 's'} recorded today`);
  if (input.rateAgeSeconds !== null && input.rateAgeSeconds > 600) {
    parts.push(`the rate is stale (read ${ageWords(input.rateAgeSeconds)}) — fetch it again before pricing`);
  }

  const who = input.staffName?.trim() ? input.staffName.trim() : 'the till';
  return {
    headline: `Handover from ${who}`,
    lines: parts,
    time: now.toISOString(),
  };
}

/** The note as plain text, for a printout or a message to the next person. */
export function handoverText(note: HandoverNote): string {
  return [note.headline, '', ...note.lines.map((l) => `· ${l}`)].join('\n');
}
