# Shift-log concurrency

`recordShift` queues appends per store across repository instances. A rejected append does not poison later queued work; event time and payload are captured before waiting. Independent custom stores do not share queues.

## Browser commit protocol

A browser drawer requires both Web Locks and IndexedDB. An exclusive origin-wide Web Lock covers the whole operation. Real and demo use separate lock names and separate IndexedDB records in `slip-shift-coordination-v1` / `drawers`.

Within that lock:

1. Read the durable IndexedDB witness. Once initialized, its committed value is authoritative for writes, never a renderer's localStorage cache. Only the first operation imports the existing localStorage log.
2. Construct and hash the candidate against that authoritative base.
3. Persist a `prepared` witness containing base and candidate in a strict-durability IndexedDB transaction.
4. Write the localStorage mirror through the existing failure guard. A failed write still rejects and retains its candidate in the explicit encrypted-backup/retry overlay.
5. Persist the `committed` witness in another strict-durability transaction before reporting success.

Each operation closes its database connection. No live marker lock or writer page is needed to preserve a committed tip. `retryPendingWrites` is asynchronous and follows the same lock/witness protocol for shifts. Its caller in SaveWarning and all test callers await completion. Backup restore, Settings wipe, and demo exit also coordinate replacements/deletion. Synchronous browser-store shift mutations reject rather than bypass coordination.

## Why localStorage plus a Web Lock was insufficient

Instrumented Chromium tests observed a successful write and exclusive lock release followed by another exclusive grant whose renderer still read null. A live marker could bridge that visibility gap only while its owner remained alive. The durable witness replaces that marker; there are no timing sleeps or storage-event freshness assumptions.

## Reads, recovery, and limits

- Normal synchronous reads and backup inputs remain on localStorage; no general read migration was made. A stale read can temporarily affect display, but it cannot supply the next committed append's base.
- Prepared writes are ambiguous after interruption. Ordinary appends fail closed even if the renderer appears to contain the candidate. The original failed-write overlay may retry the matching candidate. Explicit restore/wipe can deliberately replace an interrupted witness. This is not an atomic transaction spanning IndexedDB and localStorage; a crash between their commits can require recovery rather than automatically resuming.
- Missing Web Locks or unavailable IndexedDB rejects browser mutations. There is no silently unsafe browser fallback. Custom/in-memory stores retain same-realm queuing plus optimistic reread/rebase; that fallback is not an atomic cross-tab protocol.
- Noncooperating old app versions, direct developer-tools writes, selective database deletion, or external storage modification are outside the protocol. Close old versions before using the updated till. Clearing all site data removes both records; encrypted backups remain necessary.
- Hash-chain verification proves internal consistency, not that the recorded actions happened.

## Regression proof

Units cover concurrent appends, multiple repositories, independent stores, real/demo isolation, guarded failure/retry, durable successor reads after module replacement, interrupted-write rejection, explicit deletion without resurrection, and unavailable coordination.

`tests/e2e/shifts.mjs` uses production code through real UI actions in two pages. It holds hashing to overlap opens, verifies both events, closes a successful writer, forces stale localStorage reads in its successor, then exercises a quota failure and the real Retry button before closing that writer too. The final successor must retain all five events with every sequence, previous link, and SHA-256 verified. It is registered in the full browser runner.

Released as v0.31.63: implementation `0d25842`, release `6d5ca1d`, pushed to `origin/master` and deployed. Release verification: 673 unit tests passed, one opt-in live-chain test skipped; TypeScript, ESLint, build, bundle scan, docs audit and budget checks passed. The built-preview focused browser suite passed ten consecutive runs, and all 20 built-preview suites passed. The focused shifts suite and demo check also passed against the live site. Exact release CI: https://github.com/kitsboy/slip/actions/runs/43823589262 (success).

The focused suite also injects an interrupted prepared witness and drives the real Settings wipe. Wipe explicitly replaces the shift log before clearing the remaining shop settings; it does not try to append an event that the interrupted witness would reject.
