# Validation Evidence Template

Use this template when recording a local validation run for implemented post-MVP items.

This file complements `VALIDATION_CHECKLIST.md`, `VALIDATION_STATUS.md`, `VALIDATION_QUICKSTART.md`, `CI_VALIDATION_RUNBOOK.md`, and `VALIDATION_CLOSURE_PLAN.md`. It is process documentation only and must not define or change Egyptian Estimation scoring rules.

## Run metadata

- Date/time:
- Branch:
- Working tree before run: clean / not clean
- Commit SHA:
- Environment:
  - Node.js version:
  - npm version:
  - OS:

## Commands

```bash
git status --short
git branch --show-current
git pull
node --version
npm --version
git rev-parse HEAD
npm install
npm run ci
```

## Result

- Overall result: Pass / Fail
- Typecheck result:
- Test result:
- Test count:
- Build result:

## Failure summary, if applicable

- Failing command:
- Failing file/test:
- Error/assertion summary:
- Suspected affected backlog item:
- Follow-up story needed:

## Backlog closure notes

Only mark pending implemented items as **Done** after a green `npm run ci` on the latest `main`.

Items currently waiting for that evidence:

- US-213A - Local-Storage Score-Sheet Repository Adapter
- US-213B - Browser UI Shell
- US-214 - Persistent Database Adapter
- US-215 - Rich Score-Sheet Export
- US-217A - Player Performance Analytics
- US-217B - Player Analytics Markdown Export
- US-217C - Player Analytics CSV Export
- US-218 - Score-Sheet CSV Export
- US-219 - Game Summary and Leaderboard Compatibility Fixes

## Boundary confirmation

Before closing the validation run, confirm:

- No Planning Poker terminology or behavior was introduced.
- No Egyptian Estimation scoring rule changed without official source evidence or explicit user confirmation.
- Analytics, export, and game-summary services consume calculated score results instead of recalculating scores.
- Persistence remains behind repository/store boundaries.
- CSV and Markdown outputs remain deterministic for tests.
- US-219 compatibility fixes preserve round identity for valid and invalid rounds without changing scoring formulas, bid validation, Dash, Dash Call, WITH, risk, all-loser, or suit/trump behavior.
