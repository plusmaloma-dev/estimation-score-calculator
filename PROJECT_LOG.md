# Project Log

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

## 2026-06-21 - Run 33

Completed:

- Continued from US-217B by adding a spreadsheet-friendly player analytics export adapter.
- Added `PlayerAnalyticsCsvExportService` to format `PlayerAnalyticsSummary` as deterministic CSV rows.
- Added optional summary metadata rows for total/valid/invalid rounds, leader, and most-consistent player.
- Added CSV escaping for comma, quote, and newline cells so player IDs can be safely exported.
- Added deterministic tests for player rows, precision formatting, escaped cells, and optional summary rows.
- Exported the analytics CSV formatter from `src/index.ts`.
- Updated README usage notes and `BACKLOG.md` with US-217B/US-217C status.
- Made no Egyptian Estimation scoring rule changes and did not introduce Planning Poker concepts.

Current item in progress:

- US-217C - Player Analytics CSV Export is implemented and pending local `npm run ci` validation.

Blockers:

- Local `npm run ci` is needed before marking US-217A, US-217B, and US-217C fully Done.
- Local `npm run ci` is also still needed before marking US-213A, US-213B, US-214, and US-215 fully Done.
- US-216B and US-216C remain blocked until an official document or user-confirmed source is available.

Overall progress:

- MVP: 100% complete.
- Post-MVP: 56% complete.

## 2026-06-21 - Run 32

Completed:

- Continued from US-217A by adding a presentation adapter for player analytics.
- Added `PlayerAnalyticsMarkdownExportService` to format `PlayerAnalyticsSummary` as a human-readable Markdown report.
- Added deterministic tests for summary output, player rows, escaped table cells, generated timestamps, and empty analytics handling.
- Exported the analytics Markdown formatter from `src/index.ts`.
- Updated README usage notes for player analytics and analytics Markdown reporting.
- Made no Egyptian Estimation scoring rule changes and did not introduce Planning Poker concepts.

Current item in progress:

- US-217B - Player Analytics Markdown Export is implemented and pending local `npm run ci` validation.

Blockers:

- Local `npm run ci` is needed before marking US-217A and US-217B fully Done.
- Local `npm run ci` is also still needed before marking US-213A, US-213B, US-214, and US-215 fully Done.
- US-216B and US-216C remain blocked until an official document or user-confirmed source is available.
- BACKLOG.md update for US-217B was attempted but blocked by connector safety filtering, so backlog progress still needs a follow-up edit.

Overall progress:

- MVP: 100% complete.
- Post-MVP: 52% complete.

## 2026-06-21 - Run 31

Completed:

- Continued from the next unblocked post-MVP implementation item: US-217A - Player Performance Analytics.
- Added dashboard-ready analytics DTOs in `src/statistics/playerAnalyticsTypes.ts`.
- Added `PlayerAnalyticsService` to summarize calculated game results without recalculating scores.
- Added analytics coverage for ranking, exact-bid rate, failure rate, Dash and Dash Call success rates, bonus counters, WITH/high-contract counts, and all-loser round counts.
- Added `tests/playerAnalyticsService.test.ts` covering dashboard-ready analytics and invalid-round metadata.
- Exported player analytics APIs from `src/index.ts`.
- Updated `BACKLOG.md` with US-217A implementation status and post-MVP progress.
- Made no Egyptian Estimation scoring rule changes and did not introduce Planning Poker concepts.

Current item in progress:

- US-217A - Player Performance Analytics is implemented and pending local `npm run ci` validation.

Blockers:

- Local `npm run ci` is needed before marking US-217A fully Done.
- Local `npm run ci` is also still needed before marking US-213A, US-213B, US-214, and US-215 fully Done.
- US-216B and US-216C remain blocked until an official document or user-confirmed source is available.

Overall progress:

- MVP: 100% complete.
- Post-MVP: 50% complete.

## 2026-06-21 - Run 30

Completed:

- Continued from US-216A - Federation Source Capture.
- Re-ran official-rule searches using English and Arabic terms for federation rules, scoring, regulations, Estimation Committee, and PDF documents.
- Confirmed again that no directly usable official scoring or rules document was captured in this run.
- Updated `FEDERATION_RULE_REVIEW.md` with another source-capture log entry and clarified that no scoring/code changes should be made from unrelated false-positive sources.
- Made no Egyptian Estimation scoring rule changes and did not introduce Planning Poker concepts.

Current item in progress:

- US-216A - Federation Source Capture remains open.

Blockers:

- Detailed official federation scoring rules/documents remain unavailable through current public search.
- US-216B and US-216C remain blocked until an official document or user-confirmed source is available.
- Local `npm run ci` is still needed before marking US-213A, US-213B, US-214, and US-215 fully Done.

Overall progress:

- MVP: 100% complete.
- Post-MVP: 46% complete.

## 2026-06-21 - Run 29

Completed:

- Continued from US-216 - Federation-Rule Review into US-216A - Federation Source Capture.
- Re-ran public searches for official federation rules, regulations, PDF documents, and Arabic rule terms.
- Confirmed that no retrievable detailed official scoring document was found through available public search during this run.
- Recorded negative source-capture evidence in `FEDERATION_RULE_REVIEW.md` so future work does not accidentally infer rules from unrelated card-game results.
- Expanded the source capture log and marked US-216A as In progress.
- Updated `BACKLOG.md` to reflect US-216A progress and raise post-MVP progress to 46%.
- Made no Egyptian Estimation scoring rule changes and did not introduce Planning Poker concepts.

Current item in progress:

- US-216A - Federation Source Capture.

Blockers:

- Detailed official federation scoring rules/documents remain unavailable through the current public search path.
- US-216B - Confirm Rule Differences remains blocked until an official document or user-confirmed source is available.
- Local `npm run ci` is still needed before marking US-213A, US-213B, US-214, or US-215 fully Done.
- GitHub Actions/status visibility through the connector remains unavailable, so local validation evidence is still required.

Overall progress:

- MVP: 100% complete.
- Post-MVP: 46% complete.

## 2026-06-21 - Run 28

Completed:

- Continued from US-215 - Rich Score-Sheet Export and moved to the next unfinished backlog item, US-216 - Federation-Rule Review.
- Checked the current local rule baseline in `PROJECT_RULES.md`.
- Checked the public Egyptian Bridge Federation Estimation site for broad scope evidence: Estimation is described as a four-player 52-card trick-estimation game, and the Estimation Committee is described as responsible for officially recognized laws/rules, arbitration, tournament procedures, licensing, ranking, and player classification.
- Could not directly retrieve the public `rules.html` or `documents.html` pages through the available web fetcher during this run; detailed official scoring evidence remains pending.
- Added `FEDERATION_RULE_REVIEW.md` as a rule-audit tracker covering source notes, local baseline decisions, implementation impact, and pending evidence.
- Added follow-up stories US-216A, US-216B, and US-216C to separate source capture, rule-difference confirmation, and code changes.
- Updated `BACKLOG.md` to mark US-216 as In progress and raise post-MVP progress to 44%.
- Made no Egyptian Estimation scoring rule changes and did not introduce Planning Poker concepts.

Current item in progress:

- US-216 - Federation-Rule Review.
- Next implementation-ready slice: US-216A - Federation Source Capture.

Blockers:

- Detailed federation Rules/Documents pages were not retrievable through the available web fetcher in this run.
- Local `npm run ci` is still needed before marking US-213A, US-213B, US-214, or US-215 fully Done.
- GitHub Actions/status visibility through the connector remains unavailable, so local validation evidence is still required.

Overall progress:

- MVP: 100% complete.
- Post-MVP: 44% complete.
