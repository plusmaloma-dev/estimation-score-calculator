# Project Log

## 2026-06-22 - Run 38

Completed:

- Continued post-MVP validation cleanup from US-218 Score-Sheet CSV Export.
- Fixed `ScoreSheetCsvExportService` so the `bidType` column is populated from the original round input instead of being left blank.
- Fixed the `runningScore` column to accumulate each player's score across valid rounds instead of repeating the per-round score.
- Added deterministic test coverage for cumulative CSV running scores across two rounds.
- Updated README and BACKLOG to document cumulative score-sheet CSV running totals.
- Made no Egyptian Estimation scoring rule changes and did not introduce Planning Poker concepts.

Current item in progress:

- Post-MVP validation cleanup for analytics/export items after US-218 merge.

Blockers:

- Local `git pull && npm test` or `npm run ci` is still needed to confirm the full suite after commits `be65cae`, `cb0280c`, `0589ff3`, and `25e6ea8`.
- US-216B and US-216C remain blocked until an official document or user-confirmed source is available.

Overall progress:

- MVP: 100% complete.
- Post-MVP: 63% complete.

## 2026-06-22 - Run 37

Completed:

- Continued post-MVP validation cleanup after US-218 merge.
- Inspected `PlayerScoreResult` and confirmed it does not expose `bidType` or `runningScore` fields.
- Fixed `ScoreSheetCsvExportService` TypeScript references by leaving the unavailable bid-type cell blank and using the per-round score for the running-score export column until cumulative running totals are added to the scoring result boundary.
- Committed the score-sheet CSV type repair with commit `39f51a3`.
- Made no Egyptian Estimation scoring rule changes and did not introduce Planning Poker concepts.

Current item in progress:

- Post-MVP validation cleanup for analytics/export items after US-218 merge.

Blockers:

- Local `git pull && npm test` or `npm run ci` is still needed to confirm the full suite after commit `39f51a3`.
- US-216B and US-216C remain blocked until an official document or user-confirmed source is available.

Overall progress:

- MVP: 100% complete.
- Post-MVP: 62% complete.

## 2026-06-21 - Run 36

Completed:

- Merged PR #1 for US-218 Score-Sheet CSV Export into `main` with squash commit `41cc1e2`.
- Reviewed the latest PR CI failure and confirmed the failing job was the Validate step for the PR head.
- Fixed the remaining player analytics assertion reported by the user's local test run: player C has one risk attempt from round 2 and zero risk success rate.
- Committed the test correction in `tests/playerAnalyticsService.test.ts` with commit `7e890dc`.
- Made no Egyptian Estimation scoring rule changes and did not introduce Planning Poker concepts.

Current item in progress:

- Post-MVP validation cleanup for analytics/export items after US-218 merge.

Blockers:

- Local `git pull && npm test` or `npm run ci` is still needed to confirm the full suite after commit `7e890dc`.
- No new GitHub Actions workflow run was visible for the direct `main` commit through the connector.
- US-216B and US-216C remain blocked until an official document or user-confirmed source is available.

Overall progress:

- MVP: 100% complete.
- Post-MVP: 61% complete.

## 2026-06-21 - Run 35

Completed:

- Continued from the next unblocked implementation-ready post-MVP item after player analytics exports.
- Added `ScoreSheetCsvExportService` to format calculated score-sheet round results as deterministic spreadsheet-friendly CSV rows.
- Added optional metadata rows for title, generated timestamp, round count, validity, and error count.
- Added per-player CSV rows covering round type, bid/actual/delta/score, status, role, risk metadata, running score, and notes.
- Added invalid-round CSV rows carrying validation notes so spreadsheet exports preserve scoring-validation failures.
- Added deterministic tests for valid rows, metadata rows, CSV escaping, and invalid-round notes.
- Exported the score-sheet CSV formatter from `src/index.ts`.
- Updated README usage notes and `BACKLOG.md` with US-218 status.
- Made no Egyptian Estimation scoring rule changes and did not introduce Planning Poker concepts.

Current item in progress:

- US-218 - Score-Sheet CSV Export is implemented and pending local `npm run ci` validation.

Blockers:

- Local `npm run ci` is needed before marking US-213A, US-213B, US-214, US-215, US-217A, US-217B, US-217C, and US-218 fully Done.
- US-216B and US-216C remain blocked until an official document or user-confirmed source is available.

Overall progress:

- MVP: 100% complete.
- Post-MVP: 60% complete.

## 2026-06-21 - Run 34

Completed:

- Reviewed local test output shared by the user: 77 passing tests and 6 failing tests.
- Confirmed the CI failure root cause shown in GitHub Actions was not a scoring-engine failure; the workflow failed because npm dependency caching expected a lockfile that was not committed.
- Updated `.github/workflows/ci.yml` to remove the npm cache lockfile requirement and move CI to Node.js 22.
- Confirmed current repository test fixtures for browser UI shell, local storage, analytics, and markdown export have already been repaired on `main`; the user should pull the latest `main` before rerunning tests locally.
- Made no Egyptian Estimation scoring rule changes and did not introduce Planning Poker concepts.

Current item in progress:

- CI stabilization verification after the workflow change.
- Post-MVP validation cleanup remains focused on making local `npm run ci` and GitHub Actions green.

Blockers:

- Need the latest GitHub Actions run or a fresh local `git pull && npm install && npm test` confirmation after commit `caa59e3026d2c303466f6fef346a5bc6ce079b90`.
- US-216B and US-216C remain blocked until an official document or user-confirmed source is available.

Overall progress:

- MVP: 100% complete.
- Post-MVP: 57% complete.
