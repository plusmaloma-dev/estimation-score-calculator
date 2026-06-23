# Validation Status

Last updated: 2026-06-24

## Purpose

This file tracks validation evidence for implemented post-MVP items that are waiting for a green local CI run. It complements `VALIDATION_CHECKLIST.md`, `VALIDATION_QUICKSTART.md`, `VALIDATION_EVIDENCE_TEMPLATE.md`, `CI_VALIDATION_RUNBOOK.md`, `VALIDATION_TROUBLESHOOTING.md`, `VALIDATION_CLOSURE_PLAN.md`, and `VALIDATION_US219_ADDENDUM.md`; it should not contain Egyptian Estimation scoring rules.

## Current status

GitHub status checks and pull-request-triggered workflow runs are not visible for the inspected commits through the available connector. The latest inspected commit for this status refresh is `05054b0679973fd52a01250352d4d5fc9301952e`; the connector returned no workflow runs for it. The repository does have a GitHub Actions workflow at `.github/workflows/ci.yml` that runs `npm run ci` for pushes and pull requests targeting `main`, but local validation evidence is still required before moving implemented post-MVP backlog items from **Implemented, pending validation** to **Done**.

Required command:

```bash
git pull
node --version
npm --version
git rev-parse HEAD
npm install
npm run ci
```

Prefer Node.js 22 locally so the run matches `.github/workflows/ci.yml`.

## Evidence capture

Use `VALIDATION_QUICKSTART.md` for the short copy/paste local validation flow. Use `VALIDATION_EVIDENCE_TEMPLATE.md` to record the local validation result before closing pending implemented items. Use `CI_VALIDATION_RUNBOOK.md` for the repeatable validation and closure flow. Use `VALIDATION_TROUBLESHOOTING.md` if validation fails and a focused, safe triage path is needed. Use `VALIDATION_CLOSURE_PLAN.md` for the final pending-item closure sequence after a green run. Use `VALIDATION_US219_ADDENDUM.md` for the US-219 compatibility-specific checks. Keep the captured evidence focused on commands, pass/fail status, test count, failures, and backlog closure notes.

## Items waiting for validation

- US-213A - Local-Storage Score-Sheet Repository Adapter
- US-213B - Browser UI Shell
- US-214 - Persistent Database Adapter
- US-215 - Rich Score-Sheet Export
- US-217A - Player Performance Analytics
- US-217B - Player Analytics Markdown Export
- US-217C - Player Analytics CSV Export
- US-218 - Score-Sheet CSV Export
- US-219 - Game Summary and Leaderboard Compatibility Fixes

## Closure matrix

Only move an item from **Implemented, pending validation** to **Done** when the latest `main` branch passes `npm run ci` and the item-specific checks below are still true.

| Backlog item | Closure checks after green CI |
| --- | --- |
| US-213A - Local-Storage Score-Sheet Repository Adapter | Local-storage adapter tests pass; corrupt or missing stored data remains safe; no browser-global dependency is required by tests. |
| US-213B - Browser UI Shell | UI shell tests pass; invalid rounds show validation messages before save; JSON backup export stays wired through the backup service. |
| US-214 - Persistent Database Adapter | Document-store adapter contract tests pass for save, update, list, get, and delete; database libraries remain behind repository/store boundaries. |
| US-215 - Rich Score-Sheet Export | Markdown export tests pass; final standings and per-round tables remain deterministic; invalid-round validation sections are preserved. |
| US-217A - Player Performance Analytics | Analytics service tests pass; dashboard DTOs consume calculated game results without recalculating scores. |
| US-217B - Player Analytics Markdown Export | Markdown analytics export tests pass; ranking and percentage outputs remain deterministic. |
| US-217C - Player Analytics CSV Export | CSV analytics export tests pass; metadata rows and quote/comma/newline escaping remain deterministic. |
| US-218 - Score-Sheet CSV Export | Score-sheet CSV export tests pass; `bidType` is populated from original round input; `runningScore` remains cumulative across valid rounds; invalid-round rows preserve validation notes. |
| US-219 - Game Summary and Leaderboard Compatibility Fixes | Compatibility regression tests pass; `MvpRoundResult.roundNumber` is present for valid and invalid rounds; leaderboard aggregation keeps original round identity after invalid rounds are filtered out; no Egyptian Estimation scoring behavior changes. |

## Evidence needed

Record the following after the command runs:

- Command run.
- Commit SHA.
- Node.js version.
- npm version.
- Pass/fail result.
- Test count if available.
- Any failing file or assertion if the run fails.
- Backlog items moved to **Done**, if the run passes.

## Boundary reminders

- Do not add Planning Poker terminology or behavior.
- Do not change Egyptian Estimation scoring rules without official source evidence or explicit user confirmation.
- Export, analytics, summary, and compatibility services must consume or present calculated score results instead of recalculating scores independently.
- Persistence adapters must stay behind repository/store boundaries.
