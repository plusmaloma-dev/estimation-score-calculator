# Validation Troubleshooting

## Purpose

This guide captures repeatable troubleshooting notes for local and GitHub Actions validation. It supports the post-MVP validation closeout flow and must stay separate from Egyptian Estimation scoring rules.

Do not use this file for Planning Poker terminology or rule decisions.

## Expected baseline

Use the latest `main` branch and Node.js 22, matching `.github/workflows/ci.yml`.

```bash
git pull
node --version
npm install
npm run ci
```

The `npm run ci` script runs type checking, tests, and build validation through the package scripts.

## Common failures and actions

| Symptom | Likely cause | Action |
| --- | --- | --- |
| `node --test` cannot find compiled test files | `dist` was not rebuilt or the test command was interrupted | Run `npm test` again, which cleans and rebuilds `dist` before executing tests. |
| TypeScript errors from export services | Public DTO boundary changed or an export service referenced a field not present on calculated results | Fix the export service to consume available calculated result fields or original round input; do not recalculate scores independently. |
| Analytics assertion mismatch | Test fixture expectation does not match calculated game result metadata | Inspect the calculated result and update the fixture only when the engine output is correct under confirmed Egyptian Estimation rules. |
| GitHub Actions dependency install fails because no lockfile exists | Workflow is using a cache mode that requires a lockfile | Keep workflow install simple with `npm install` unless a lockfile is intentionally added later. |
| Local run passes but backlog remains pending | Validation evidence was not captured | Record the run in `VALIDATION_STATUS.md`, then close eligible items in `BACKLOG.md`. |

## Evidence minimum

Before moving pending implemented items to **Done**, capture:

- branch and commit under test
- Node.js version
- command executed
- pass/fail result
- test count if available
- failing command/file/assertion if failed
- backlog items closed if passed

## Boundary reminders

- Validation fixes should not change Egyptian Estimation scoring behavior unless backed by official source evidence or explicit user confirmation.
- Export and analytics services should consume already calculated score results instead of duplicating scoring logic.
- Persistence adapters should remain behind repository/store boundaries.
