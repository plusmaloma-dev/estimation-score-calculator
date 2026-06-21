# Project Log

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

- Continued from US-213B - Browser UI Shell.
- Added `BrowserUiShellService` as a framework-neutral TypeScript application shell for future browser/mobile components.
- The shell now supports:
  - Four-player score-sheet setup validation.
  - Draft score-sheet creation through `ScoreSheetRepository`.
  - Round preview through `EstimationMvpService` before save.
  - Valid-round save flow with updated game result and leaderboard.
  - Leaderboard retrieval for a saved score sheet.
  - JSON backup export through `ScoreSheetBackupService`.
- Exported the browser UI shell from `src/index.ts`.
- Added `tests/browserUiShellService.test.ts` covering setup validation, draft creation/listing, invalid-round preview, valid-round save/leaderboard, and backup export.
- Updated README with browser UI shell usage guidance.
- Updated `BACKLOG.md` to mark US-213B as implemented pending validation and raise post-MVP progress.
- Made no Egyptian Estimation scoring rule changes and did not introduce Planning Poker concepts.

Current item in progress:

- US-213B - Browser UI Shell is implemented but pending `npm run ci` validation.
- US-213A - Local-Storage Score-Sheet Repository Adapter is also still pending `npm run ci` validation.

Blockers:

- Local `npm run ci` needs to be run or confirmed before marking US-213A or US-213B fully Done.
- GitHub Actions/status visibility through the connector remains unavailable, so local validation evidence is still required.

Overall progress:

- MVP: 100% complete.
- Post-MVP: 22% complete.

## 2026-06-21 - Run 23

Completed:

- Continued from US-213A - Local-Storage Score-Sheet Repository Adapter.
- Added `LocalStorageScoreSheetRepository` with:
  - `ScoreSheetRepository` interface compatibility.
  - One namespaced browser storage key: `egyptian-estimation:score-sheets:v1`.
  - Injected `ScoreSheetStorageLike` dependency for browser and non-browser tests.
  - Save, update, list, get, delete, and clear behavior.
  - Safe fallback to an empty repository when stored data is missing, invalid, or corrupt.
- Exported the adapter from `src/index.ts`.
- Added repository tests covering save/get/list/update/delete, shared storage state, corrupt-data recovery, and required-field validation.
- Updated README usage examples to include required scoring profile and trump suit fields, plus local-storage adapter usage notes.
- Updated `BACKLOG.md` to mark US-213A as implemented pending validation and set US-213B - Browser UI Shell as the next Ready item.
- Checked latest commit status and workflow runs through the connector; no statuses or workflow runs were visible.
- Made no Egyptian Estimation scoring rule changes and did not introduce Planning Poker concepts.

Current item in progress:

- US-213A is implemented but still pending `npm run ci` validation.
- Next implementation-ready item after validation is US-213B - Browser UI Shell.

Blockers:

- GitHub Actions status/workflow visibility is still unavailable through the connector for the latest inspected commit.
- Local `npm run ci` still needs to be run or confirmed before marking US-213A fully Done.
