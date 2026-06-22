# CI Validation Runbook

## Purpose

This runbook defines the repeatable validation steps for closing implemented post-MVP items that are waiting for a green `npm run ci` result.

Keep this document focused on validation process only. Do not record Egyptian Estimation scoring rules here, and do not mix in Planning Poker terminology.

## Required local command

Run from a clean checkout of the latest `main` branch:

```bash
git pull
node --version
npm install
npm run ci
```

Use Node.js 22 when possible so local validation matches `.github/workflows/ci.yml`.

The `ci` script runs:

1. `npm run typecheck`
2. `npm test`
3. `npm run build`

## GitHub Actions workflow

The repository workflow is defined in `.github/workflows/ci.yml` and runs `npm run ci` on:

- pull requests targeting `main`
- pushes to `main`

If GitHub workflow runs are not visible through the available connector, local validation remains the required closure evidence.

## Evidence to capture

Use `VALIDATION_EVIDENCE_TEMPLATE.md` and record:

- branch and latest commit under test
- Node.js version
- commands executed
- pass/fail result
- test count, if available
- failing file/assertion details, if any
- backlog items closed after the run

## Closure flow

1. Pull latest `main`.
2. Confirm the local Node.js version. Prefer Node.js 22.
3. Run `npm install` if dependencies may have changed or `node_modules` is missing.
4. Run `npm run ci`.
5. If the run passes, update `VALIDATION_STATUS.md` with the evidence summary.
6. Move eligible implemented post-MVP items from **Implemented, pending validation** to **Done** in `BACKLOG.md`.
7. Add a timestamped entry to `PROJECT_LOG.md`.

## Failure flow

If validation fails:

1. Do not close pending backlog items.
2. Record the failing command, file, and assertion/error in `VALIDATION_STATUS.md`.
3. Check `VALIDATION_TROUBLESHOOTING.md` for repeatable failure patterns and safe actions.
4. Create or update a focused backlog item for the failure.
5. Avoid changing scoring rules unless the failure is tied to an already confirmed Egyptian Estimation rule decision.
