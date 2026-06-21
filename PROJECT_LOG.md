# Project Log

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

## 2026-06-21 - Run 27

Completed:

- Continued from US-215 - Rich Score-Sheet Export.
- Added `ScoreSheetMarkdownExportService` for deterministic human-readable Markdown exports.
- The service consumes existing `MvpGameInput` and `MvpGameResult` data without recalculating scores or changing Egyptian Estimation scoring rules.
- Export output now includes final standings, per-round player bid/actual/delta/score rows, status/notes, next-round multiplier notes, and validation errors for invalid unscored rounds.
- Added `tests/scoreSheetMarkdownExportService.test.ts` covering scored-round export and invalid-round validation sections.
- Exported the Markdown export service from `src/index.ts`.
- Updated README with Rich Markdown Score-Sheet Export usage notes.
- Updated `BACKLOG.md` to mark US-215 as implemented pending validation and raise post-MVP progress to 40%.
- Made no Egyptian Estimation scoring rule changes and did not introduce Planning Poker concepts.

Current item in progress:

- US-215 - Rich Score-Sheet Export is implemented but pending `npm run ci` validation.
- US-213A, US-213B, and US-214 are also still pending `npm run ci` validation.

Blockers:

- Local `npm run ci` needs to be run or confirmed before marking US-213A, US-213B, US-214, or US-215 fully Done.
- GitHub Actions/status visibility through the connector remains unavailable, so local validation evidence is still required.

Overall progress:

- MVP: 100% complete.
- Post-MVP: 40% complete.

## 2026-06-21 - Run 26

Completed:

- Continued from US-214 - Persistent Database Adapter.
- Added `DocumentScoreSheetRepository` as a database-agnostic repository adapter around a small `ScoreSheetDocumentStore` boundary.
- The adapter supports save, update, get, list, and delete while preserving the existing `ScoreSheetRepository` contract.
- Added deterministic id allocation that chooses the first available `score-sheet-N` id when creating new score sheets.
- Added tests covering save/retrieve, update metadata, sorted list metadata, delete behavior, id allocation around imported ids, and validation before store upsert.
- Exported the document repository adapter from `src/index.ts`.
- Updated README persistence documentation with the document-store adapter pattern.
- Updated `BACKLOG.md` to mark US-214 as implemented pending validation and make US-215 - Rich Score-Sheet Export the next Ready item.
- Made no Egyptian Estimation scoring rule changes and did not introduce Planning Poker concepts.

Current item in progress:

- US-214 - Persistent Database Adapter is implemented but pending `npm run ci` validation.
- US-213A and US-213B are also still pending `npm run ci` validation.

Blockers:

- Local `npm run ci` needs to be run or confirmed before marking US-213A, US-213B, or US-214 fully Done.
- GitHub Actions/status visibility through the connector remains unavailable, so local validation evidence is still required.

Overall progress:

- MVP: 100% complete.
- Post-MVP: 32% complete.

## 2026-06-21 - Run 25

Completed:

- Continued from US-213B - Browser UI Shell.
- Closed the remaining round-history acceptance gap by adding `getRoundHistory` to `BrowserUiShellService`.
- Added a `UiRoundHistoryEntry` projection for score-sheet screens with round number, Over/Under type, validation state, bid/actual rows, player scores, risk type, and next-round multiplier.
- Added test coverage proving the browser UI shell exposes saved round history and player scores.
- Updated README browser UI shell usage notes to document round-history retrieval.
- Updated `BACKLOG.md` to mark the Browser UI shell round-history boundary as Done and raise post-MVP progress.
- Made no Egyptian Estimation scoring rule changes and did not introduce Planning Poker concepts.

Current item in progress:

- US-213B - Browser UI Shell is implemented but pending `npm run ci` validation.
- US-213A - Local-Storage Score-Sheet Repository Adapter is also still pending `npm run ci` validation.

Blockers:

- Local `npm run ci` needs to be run or confirmed before marking US-213A or US-213B fully Done.
- GitHub Actions/status visibility through the connector remains unavailable, so local validation evidence is still required.

Overall progress:

- MVP: 100% complete.
- Post-MVP: 24% complete.

## 2026-06-21 - Run 24

Completed:
