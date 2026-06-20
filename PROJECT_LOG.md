# Project Log

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
