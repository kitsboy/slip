# slip development and release runbook

Use `/root/slip`, branch `master`; inspect git status and branch before edits.
Read docs/RESUME-2026-11-16.md, docs/KIMI-HANDOFF.md and the slip-product-lane skill.
Use the existing lockfile; no runtime dependency changes without a reason.

## Code release gates

Run sequentially; never rebuild while suites read dist:

```sh
npx tsc -p tsconfig.json --noEmit
npx eslint .
npx vitest run
npm run build
node scripts/docs-audit.mjs --strict
node scripts/contrast-audit.mjs --strict
node scripts/lint-tokens.mjs
node scripts/check-budget.mjs
node scripts/tap-audit.mjs
```

Start `npx vite preview --port 4181 --strictPort --host ::1` separately in a tracked
background process; run `node tests/e2e/run-all.mjs 'http://[::1]:4181/'`.
For shift changes also repeat `node tests/e2e/shifts.mjs 'http://[::1]:4181/'` at least
five times, including closure, stale successor, recovery and interrupted-witness wipe.
Storage changes require independent read-only review. Read counts from actual output.
Stop only the preview PID you started.

## Publish

Commit/push source to origin/master first. Run `bash scripts/deploy.sh patch` with
SLIP_NOTE describing the change; unset stale inherited Cloudflare variables so the
existing credential loader can work. Never print secrets. Commit/push the release bump.
Verify both origins' exact slip-version meta and live DOM, then run
`node scripts/demo-check.mjs 'https://slip.giveabit.io/'`. Watch CI on the exact pushed
head; never report a prior green run as current CI.

## Documentation closeout

Update LATEST-UPDATE, KIMI-HANDOFF, resume, architecture/privacy/merchant docs and roadmap
when their claims changed. Add a final debrief. Refresh docs/STRUCTURE-MAP.md from tracked
paths plus explicitly named new deliverables, excluding ignored/generated/sensitive files.
Run the strict docs audit, referenced-path checks and git diff --check.
Commit/push scoped files, verify the exact remote head and documentation CI.
Documentation-only closeout needs no app deploy or version bump.
