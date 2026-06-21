# Project Log

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

Overall progress:

- MVP: 100% complete.
- Post-MVP: 15% complete.

## 2026-06-21 - Run 22

Completed:

- Continued post-MVP work from US-213 - Browser/Mobile UI Planning.
- Added `UI_PLANNING.md` with:
  - Browser/mobile screen map.
  - Round-entry validation messages.
  - UI-to-engine DTO mapping.
  - Recommended first storage direction: browser local storage for the UI prototype.
  - Implementation-ready follow-up slices US-213A and US-213B.
- Updated `BACKLOG.md` to mark US-213 as Done and make US-213A - Local-Storage Score-Sheet Repository Adapter the next Ready item.
- Made no Egyptian Estimation scoring changes and did not introduce any non-Egyptian Estimation estimation workflow.

Current item in progress:

- US-213A - Local-Storage Score-Sheet Repository Adapter.

Blockers:

- None for repository-adapter implementation.
- A full UI implementation still needs final framework direction before UI code is added.

Overall progress:

- MVP: 100% complete.
- Post-MVP: 10% complete.
