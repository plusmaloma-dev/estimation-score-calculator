# Validation Quickstart

## Purpose

This quickstart gives a short copy/paste flow for capturing local CI evidence before closing implemented post-MVP items. It is process-only documentation and must not define or change Egyptian Estimation scoring rules or introduce Planning Poker concepts.

## Clean checkout check

Run from the repository root on `main`:

```bash
git status --short
git branch --show-current
git pull
```

Expected result:

- Branch is `main`.
- Working tree is clean before validation changes are recorded.
- Latest remote changes are pulled.

## Environment capture

Record the tool versions used for validation:

```bash
node --version
npm --version
git rev-parse HEAD
```

Prefer Node.js 22 so the local run aligns with the GitHub Actions workflow.

## Validation command

Run the full project validation command:

```bash
npm install
npm run ci
```

`npm run ci` currently runs typecheck, tests, and build through the package scripts.

## Evidence to copy into `VALIDATION_STATUS.md`

After the run finishes, capture:

- Date/time of the run.
- Commit SHA from `git rev-parse HEAD`.
- Node.js and npm versions.
- Overall result: pass or fail.
- Typecheck result.
- Test result and test count, if shown.
- Build result.
- First failing command/file/assertion, if the run fails.

Use `VALIDATION_EVIDENCE_TEMPLATE.md` for the detailed evidence format, `VALIDATION_CLOSURE_PLAN.md` for the closure sequence, and `VALIDATION_US219_ADDENDUM.md` for the US-219 compatibility-specific checks.

## Closure reminder

Only after a green `npm run ci` on the latest `main`, move these items from **Implemented, pending validation** to **Done** in `BACKLOG.md`:

- US-213A - Local-Storage Score-Sheet Repository Adapter
- US-213B - Browser UI Shell
- US-214 - Persistent Database Adapter
- US-215 - Rich Score-Sheet Export
- US-217A - Player Performance Analytics
- US-217B - Player Analytics Markdown Export
- US-217C - Player Analytics CSV Export
- US-218 - Score-Sheet CSV Export
- US-219 - Game Summary and Leaderboard Compatibility Fixes

## Boundary reminders

- Do not change scoring behavior while recording validation evidence.
- Do not mix this project with Planning Poker terminology or behavior.
- Do not implement federation-rule differences until official or user-confirmed Egyptian Estimation evidence exists.
- Keep analytics and export services dependent on calculated score results rather than recalculating scores.
