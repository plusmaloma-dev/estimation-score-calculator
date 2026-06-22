# Validation Checklist

Use this checklist before moving any implemented backlog item from **Implemented, pending validation** to **Done**.

## Purpose

This project separates Egyptian Estimation scoring rules from UI, storage, analytics, export, and Planning Poker concepts. Validation should confirm that implementation slices remain inside their intended boundary and that changes do not accidentally alter scoring behavior.

## Required local command

Run the full validation command from a clean, updated local checkout:

```bash
git pull
npm install
npm run ci
```

`npm run ci` runs:

1. `npm run typecheck`
2. `npm test`
3. `npm run build`

## Post-MVP pending items to close after a green run

When `npm run ci` passes on the latest `main`, update `BACKLOG.md` and `PROJECT_LOG.md` to mark these items as validated:

- US-213A - Local-Storage Score-Sheet Repository Adapter
- US-213B - Browser UI Shell
- US-214 - Persistent Database Adapter
- US-215 - Rich Score-Sheet Export
- US-217A - Player Performance Analytics
- US-217B - Player Analytics Markdown Export
- US-217C - Player Analytics CSV Export
- US-218 - Score-Sheet CSV Export

## Boundary checks

Before marking validation complete, confirm:

- No Planning Poker terminology or behavior was introduced.
- `PROJECT_RULES.md` remains the source for finalized local Egyptian Estimation rules.
- Federation-rule changes are not implemented unless backed by official evidence or explicit user confirmation.
- UI/browser shell code calls service boundaries instead of duplicating scoring rules.
- Persistence adapters implement repository boundaries without importing database-specific libraries into scoring services.
- Analytics and export services consume calculated results and do not recalculate scores independently.
- CSV and Markdown exports remain deterministic for tests.

## Evidence to record

Add one timestamped `PROJECT_LOG.md` entry with:

- Command run.
- Pass/fail result.
- Test count if available.
- Any failing file or assertion if the run fails.
- Backlog items moved to **Done**, if the run passes.

## If validation fails

Do not mark pending items as **Done**. Instead:

1. Record the failing command and output summary in `PROJECT_LOG.md`.
2. Add or update a focused backlog item for the failure.
3. Fix the failure in the smallest safe slice.
4. Rerun `npm run ci` before closing the validation item.
