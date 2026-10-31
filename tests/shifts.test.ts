import { describe, expect, it } from 'vitest';

import {
  GENESIS_HASH,
  appendEvent,
  canonicalJson,
  computeEventHash,
  emptyLog,
  eventsForAccount,
  exportLogLines,
  lastEvent,
  staffSummary,
  verifyLog,
  type ShiftEvent,
  type ShiftEventInput,
  type ShiftLog,
} from '../src/core/shifts';

const T0 = '2026-10-30T09:00:00.000Z';
const T1 = '2026-10-30T13:30:00.000Z';
const T2 = '2026-10-30T17:45:00.000Z';
const T3 = '2026-10-30T18:00:00.000Z';

function handoff(overrides: Partial<ShiftEventInput> = {}): ShiftEventInput {
  return {
    kind: 'handoff',
    accountId: 'acct_front',
    accountLabel: 'Front counter',
    staff: 'Ana',
    at: T0,
    ...overrides,
  };
}

/** Three chained events across two counters, built by real appends. */
async function buildLog(): Promise<ShiftLog> {
  let log = emptyLog();
  log = await appendEvent(log, handoff());
  log = await appendEvent(
    log,
    handoff({ kind: 'acknowledge', staff: 'Ana', at: T1, detail: 'address matched wallet' }),
  );
  log = await appendEvent(
    log,
    handoff({
      kind: 'return',
      accountId: 'acct_truck',
      accountLabel: 'Food truck',
      staff: 'Bob',
      at: T2,
    }),
  );
  return log;
}

function withEvent(log: ShiftLog, index: number, patch: Partial<ShiftEvent>): ShiftLog {
  return {
    version: 1,
    events: log.events.map((event, i) => (i === index ? { ...event, ...patch } : event)),
  };
}

describe('appendEvent', () => {
  it('builds a chain: seq continuity and prevHash linkage', async () => {
    const log = await buildLog();

    expect(log.version).toBe(1);
    expect(log.events.map((e) => e.seq)).toEqual([0, 1, 2]);

    const first = log.events[0];
    expect(first?.prevHash).toBe(GENESIS_HASH);
    expect(first?.hash).toHaveLength(64);

    for (let i = 1; i < log.events.length; i += 1) {
      expect(log.events[i]?.prevHash).toBe(log.events[i - 1]?.hash);
    }
  });

  it('returns a new log and leaves the original untouched', async () => {
    const before = emptyLog();
    const after = await appendEvent(before, handoff());

    expect(before.events).toHaveLength(0);
    expect(after.events).toHaveLength(1);
    expect(after).not.toBe(before);
  });

  it('records the supplied timestamp verbatim and defaults otherwise', async () => {
    let log = await appendEvent(emptyLog(), handoff());
    expect(log.events[0]?.at).toBe(T0);

    log = await appendEvent(log, handoff({ at: T3 }));
    expect(log.events[1]?.at).toBe(T3);
  });

  it('refuses an unknown kind', async () => {
    const bad = { ...handoff(), kind: 'refund' } as unknown as ShiftEventInput;
    await expect(appendEvent(emptyLog(), bad)).rejects.toThrow(/unknown shift event kind/);
  });
});

describe('computeEventHash', () => {
  it('is SHA-256 hex and deterministic across identical input', async () => {
    const a = await computeEventHash(GENESIS_HASH, { seq: 0, kind: 'handoff', staff: 'Ana' });
    const b = await computeEventHash(GENESIS_HASH, { staff: 'Ana', kind: 'handoff', seq: 0 });

    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).toBe(b);
  });

  it('changes when the prevHash changes', async () => {
    const body = { seq: 1, kind: 'return', staff: 'Ana' };
    const one = await computeEventHash(GENESIS_HASH, body);
    const two = await computeEventHash('f'.repeat(64), body);
    expect(one).not.toBe(two);
  });

  it('canonical JSON sorts keys at every depth and drops undefined', () => {
    expect(canonicalJson({ b: 1, a: { d: null, c: 'x' }, u: undefined })).toBe(
      '{"a":{"c":"x","d":null},"b":1}',
    );
  });
});

describe('verifyLog', () => {
  it('passes on an untouched log', async () => {
    const result = await verifyLog(await buildLog());
    expect(result).toEqual({ ok: true, brokenAt: null });
  });

  it('passes on an empty log', async () => {
    expect(await verifyLog(emptyLog())).toEqual({ ok: true, brokenAt: null });
  });

  it('fails at the edited index when a staff name is changed', async () => {
    const log = await buildLog();
    const tampered = withEvent(log, 1, { staff: 'Mallory' });

    const result = await verifyLog(tampered);
    expect(result.ok).toBe(false);
    expect(result.brokenAt).toBe(1);
    expect(result.reason).toMatch(/altered/);
  });

  it('fails at the edited index when an amount-like detail is changed', async () => {
    const log = await buildLog();
    const tampered = withEvent(log, 1, { detail: 'address NOT matched' });

    expect((await verifyLog(tampered)).brokenAt).toBe(1);
  });

  it('fails when an event is deleted from the middle', async () => {
    const log = await buildLog();
    const tampered: ShiftLog = { version: 1, events: [log.events[0]!, log.events[2]!] };

    const result = await verifyLog(tampered);
    expect(result.ok).toBe(false);
    // The old #2 now sits at index 1, so seq and linkage both break there.
    expect(result.brokenAt).toBe(1);
  });

  it('fails when two events are swapped', async () => {
    const log = await buildLog();
    const [a, b, c] = log.events;
    const tampered: ShiftLog = { version: 1, events: [a!, c!, b!] };

    const result = await verifyLog(tampered);
    expect(result.ok).toBe(false);
    expect(result.brokenAt).toBe(1);
  });

  it('fails when the genesis link is cut on the first event', async () => {
    const log = await buildLog();
    const tampered = withEvent(log, 0, { prevHash: 'a'.repeat(64) });

    const result = await verifyLog(tampered);
    expect(result.brokenAt).toBe(0);
    expect(result.reason).toMatch(/genesis/);
  });

  // Documented limit, asserted so nobody "fixes" the comment later: this log is
  // tamper-EVIDENT, not tamper-proof. Dropping the tail leaves a consistent prefix.
  it('does NOT detect a truncated tail — the honest limit of a local chain', async () => {
    const log = await buildLog();
    const truncated: ShiftLog = { version: 1, events: log.events.slice(0, 2) };
    expect(await verifyLog(truncated)).toEqual({ ok: true, brokenAt: null });
  });
});

describe('staffSummary', () => {
  it('pairs a handoff with the following return for the same account', async () => {
    let log = emptyLog();
    log = await appendEvent(log, handoff({ at: T0 }));
    log = await appendEvent(log, handoff({ kind: 'return', staff: 'Ana', at: T1 }));

    expect(staffSummary(log)).toEqual([
      {
        staff: 'Ana',
        accountLabel: 'Front counter',
        startedAt: T0,
        endedAt: T1,
        events: 2,
      },
    ]);
  });

  it('leaves an unreturned shift open with endedAt null', async () => {
    let log = emptyLog();
    log = await appendEvent(log, handoff({ at: T0 }));
    log = await appendEvent(log, handoff({ kind: 'return', at: T1 }));
    log = await appendEvent(
      log,
      handoff({ staff: 'Bob', at: T2, accountLabel: 'Front counter', accountId: 'acct_front' }),
    );

    const summary = staffSummary(log);
    expect(summary).toHaveLength(2);
    expect(summary[0]?.endedAt).toBe(T1);
    expect(summary[1]).toMatchObject({ staff: 'Bob', startedAt: T2, endedAt: null });
  });

  it('does not pair a handoff with a return on a different account', async () => {
    let log = emptyLog();
    log = await appendEvent(log, handoff({ at: T0 }));
    log = await appendEvent(
      log,
      handoff({
        kind: 'return',
        accountId: 'acct_truck',
        accountLabel: 'Food truck',
        at: T1,
      }),
    );

    const summary = staffSummary(log);
    expect(summary).toHaveLength(1);
    expect(summary[0]?.endedAt).toBeNull();
  });
});

describe('eventsForAccount / lastEvent', () => {
  it('filters by account and reports the tail', async () => {
    const log = await buildLog();

    expect(eventsForAccount(log, 'acct_front').map((e) => e.seq)).toEqual([0, 1]);
    expect(eventsForAccount(log, 'acct_truck').map((e) => e.seq)).toEqual([2]);
    expect(eventsForAccount(log, 'acct_missing')).toEqual([]);
    expect(lastEvent(log)?.seq).toBe(2);
    expect(lastEvent(emptyLog())).toBeNull();
  });
});

describe('exportLogLines', () => {
  it('produces one line per event with a printable stamp and hash prefix', async () => {
    const log = await buildLog();
    const lines = exportLogLines(log);

    expect(lines).toHaveLength(log.events.length);
    for (const line of lines) {
      expect(line).not.toContain('\n');
      expect(line).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2} {2}/);
    }

    expect(lines[0]).toBe(
      `2026-10-30 09:00  ${'HANDOFF'.padEnd(13)}  Ana  Front counter  #0 ${log.events[0]?.hash.slice(0, 8)}`,
    );
    expect(lines[1]).toContain('ACKNOWLEDGE');
    expect(lines[2]).toContain('Food truck');
    expect(lines[2]).toContain('#2 ');
  });

  it('returns no lines for an empty log', () => {
    expect(exportLogLines(emptyLog())).toEqual([]);
  });
});

describe('determinism', () => {
  it('identical input produces an identical chain', async () => {
    const a = await buildLog();
    const b = await buildLog();

    expect(a.events.map((e) => e.hash)).toEqual(b.events.map((e) => e.hash));
    expect(a.events.every((e) => /^[0-9a-f]{64}$/.test(e.hash))).toBe(true);
  });

  it('a different staff name produces a different hash', async () => {
    let a = await appendEvent(emptyLog(), handoff({ staff: 'Ana' }));
    let b = await appendEvent(emptyLog(), handoff({ staff: 'Bob' }));
    expect(a.events[0]?.hash).not.toBe(b.events[0]?.hash);

    // ...and the change propagates into every later link.
    a = await appendEvent(a, handoff({ kind: 'return', at: T1 }));
    b = await appendEvent(b, handoff({ kind: 'return', at: T1 }));
    expect(a.events[1]?.hash).not.toBe(b.events[1]?.hash);
  });
});
