# Project Log

## 2026-06-21 - Run 19

Completed:

- Continued from US-211 - CI Validation.
- Rechecked latest known CI blocker commit `27bb10514d136989f175bf1dcc54512c22d85c92`; no GitHub Actions workflow runs were visible through the connector.
- Rechecked combined commit status for `27bb10514d136989f175bf1dcc54512c22d85c92`; no statuses were returned.
- Confirmed the project already has a consolidated `npm run ci` script and a GitHub Actions workflow aligned to that script.
- Added a README Validation section documenting `npm run ci`, the exact validation sequence, and the rule to use local `npm run ci` evidence when workflow visibility is unavailable.
- Made no Egyptian Estimation scoring changes and did not introduce Planning Poker concepts.

Current item in progress:

- US-211 - CI Validation remains in progress until a visible GitHub Actions run or local `npm run ci` confirms the package is green.

Blockers:

- GitHub connector still exposes no workflow runs for the inspected latest CI blocker commit.
- Combined commit status for the inspected commit is empty.
- Local `npm run ci` execution still needs confirmation outside the connector environment.

Overall progress:

- 99% complete.

## 2026-06-21 - Run 18

Completed:

- Continued from US-211 - CI Validation.
- Rechecked workflow visibility for recent implementation, documentation, persistence, statistics, import/export, and CI commits; the connector returned no workflow runs for each inspected commit.
- Checked combined commit status for the latest CI-related commit; no statuses were returned.
- Confirmed `package.json` contains the consolidated validation command:
  - `npm run typecheck`
  - `npm test`
  - `npm run build`
- Confirmed `.github/workflows/ci.yml` is present, runs on push/PR to `main`, uses Node.js 20, installs dependencies, and executes `npm run ci`.
- Made no Egyptian Estimation scoring changes and avoided introducing any Planning Poker concepts.

Current item in progress:

- US-211 - CI Validation remains in progress until a visible GitHub Actions run or local `npm run ci` result confirms the package is green.

Blockers:

- GitHub connector still exposes no workflow runs for inspected commits.
- Combined commit status for the latest CI-related commit is empty.
- Local `npm run ci` execution still needs confirmation outside the connector environment.

Overall progress:

- 99% complete.

## 2026-06-21 - Run 17

Completed:

- Continued from US-209 Statistics and US-210 Import/export, where the only remaining acceptance step was validation confirmation.
- Verified the previous latest commit had no associated GitHub Actions workflow runs exposed through the connector.
- Confirmed `.github/workflows/ci.yml` already exists and validates pushes/PRs on Node.js 20.
- Added a consolidated `npm run ci` script to `package.json` so local and CI validation use the same command:
  - `npm run typecheck`
  - `npm test`
  - `npm run build`
- Updated the GitHub Actions workflow to run `npm run ci` instead of duplicating package scripts in workflow YAML.
- Updated `BACKLOG.md` with US-211 - CI Validation and raised Statistics/Import-export progress now that a single validation command exists.

Current item in progress:

- US-211 - Confirm the GitHub Actions workflow run appears and passes on the latest main commit, then mark Statistics and Import/export done if green.

Blockers:

- The connector still returned no workflow runs for the inspected latest CI-related commit immediately after pushing the workflow update.
- Local `npm run ci` execution still needs confirmation outside the connector environment.

Overall progress:

- 99% complete.

## 2026-06-21 - Run 16

Completed:

- Continued after US-209 Statistics implementation and moved to the next implementation-ready backlog item, US-210 - Import/export.
- Added versioned Egyptian Estimation backup DTOs in `src/importExport/types.ts`:
  - `ScoreSheetBackupDocument`
  - `ScoreSheetBackupMetadata`
  - `ExportScoreSheetsInput`
  - `ImportScoreSheetsResult`
  - backup format/version constants
- Added `ScoreSheetBackupService` for:
  - exporting persisted score sheets into a defensive-cloned backup document,
  - validating backup format/version/metadata/score-sheet shape before import,
  - rejecting unsupported shapes such as Planning Poker-style backup formats.
- Exported import/export APIs from `src/index.ts`.
- Added `tests/scoreSheetBackupService.test.ts` covering valid export, valid import defensive clone behavior, and invalid backup rejection.
- Updated `README.md` with import/export usage notes.
- Updated `BACKLOG.md` to show Import/export in progress at 70% and Statistics at 90% pending test confirmation.

Current item in progress:

- US-210 - Confirm `npm test` / CI status for import/export and statistics, then mark the slices done if green.

Blockers:

- CI/local `npm test` execution still needs confirmation after adding import/export tests.
- No GitHub Actions status checks or workflow runs have been available in prior runs.

Overall progress:

- 99% complete.

## 2026-06-21 - Run 15

Completed:

- Started US-209 - Statistics.
- Added framework-agnostic statistics DTOs in `src/statistics/types.ts`:
  - `PlayerStatistics`
  - `GameStatisticsSummary`
- Added `StatisticsService` to summarize already-calculated `MvpGameResult` data without introducing new Egyptian Estimation scoring rules, UI coupling, or database coupling.
- Exported statistics APIs from `src/index.ts`.
- Added `tests/statisticsService.test.ts` covering:
  - Player totals, rounds played, exact-bid rate, averages, high-contract counts, Dash/Dash Call counters, and WITH participation.
  - Invalid-round metadata while excluding invalid rounds from player statistics.
- Updated `README.md` with statistics usage notes.
- Updated `BACKLOG.md` to show Statistics in progress at 80%.
- Checked latest commit status and workflow runs; no GitHub status checks or workflow runs were attached to the latest commit.

Current item in progress:

- US-209 - Confirm tests/CI for Statistics, then mark Statistics Done.

Blockers:

- CI/local `npm test` execution still needs confirmation after adding statistics tests.
- No GitHub Actions status checks or workflow runs are attached to the latest inspected commit.

Overall progress:

- 99% complete.

## 2026-06-21 - Run 14

Completed:

- Completed US-208 - Persistence documentation and usage notes.
- Updated `README.md` with:
  - Persistence boundary explanation.
  - `InMemoryScoreSheetRepository` usage example.
  - Guidance that future storage adapters should implement `ScoreSheetRepository` without coupling the scoring engine to a database.
- Updated `BACKLOG.md` to mark Persistence as Done at 100%.
- Added implementation-ready notes for the next backlog slices:
  - US-209 Statistics.
  - US-210 Import/export.
- Rechecked GitHub status for the latest known commit before this run; no status checks or workflow runs were attached.

Current item in progress:

- US-209 - Statistics output definition and first implementation slice.

Blockers:

- CI/local `npm test` execution still needs confirmation after the latest persistence tests and documentation changes.
- No GitHub Actions status checks or workflow runs are attached to the latest inspected commit.
- No production database choice has been made; current implementation intentionally keeps persistence optional and adapter-based.

Overall progress:

- 99% complete.

## 2026-06-21 - Run 13

Completed:

- Started US-208 - Persistence.
- Added framework-agnostic persistence boundary types in `src/persistence/types.ts`:
  - `PersistedScoreSheetStatus`
  - `PersistedScoreSheetMetadata`
  - `PersistedScoreSheet`
  - `SaveScoreSheetInput`
  - `ScoreSheetRepository`
- Added `InMemoryScoreSheetRepository` as an optional MVP/testing adapter without database or framework coupling.
- Exported persistence types and repository from the public package index.
- Added `tests/persistenceRepository.test.ts` covering:
  - Saving and retrieving score sheets.
  - Updating an existing score sheet while preserving creation timestamp.
  - Inferring player order when omitted.
  - Rejecting unnamed score sheets.
  - Deleting score sheets.
- Updated `BACKLOG.md` to show persistence in progress at 70%.

Current item in progress:

- US-208 - Persistence documentation and usage notes.

Blockers:

- CI/local `npm test` execution still needs confirmation after the latest persistence tests.
- No database choice has been made; current implementation intentionally keeps persistence optional and adapter-based.

Overall progress:

- 99% complete.

## 2026-06-20 - Historical Runs

Detailed run history from Runs 1-12 remains available in git history. Key completed milestones before this run:

- Repository bootstrap, TypeScript setup, and Windows-compatible test script.
- Egyptian Estimation domain model for cards, bids, tricks, suits, Over/Under validation, and the no-total-13 rule.
- Highest bid resolution using the agreed trump hierarchy: No Trump > Spades > Hearts > Diamonds > Clubs.
- Trick validation and bid validation services.
- Score calculation with finalized local Egyptian Estimation rules for normal bids, bid owner, WITH, Dash, Dash Call, Risk, Double Risk, high contracts, all-loser rounds, and next-round multipliers.
- Leaderboard aggregation and balance accumulation.
- MVP integration service for UI/API callers.
- Acceptance dataset documentation and executable acceptance tests.
