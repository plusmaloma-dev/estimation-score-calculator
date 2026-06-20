# Project Log

## 2026-06-20 - Run 3

Completed:

- Resumed US-204 - ScoreCalculationService Shell.
- Removed Planning Poker leakage from the bid domain model.
- Added explicit contract suit support including no-trump.
- Preserved physical card suits separately from contract suits.
- Strengthened BidValidationService around Egyptian Estimation defaults: exactly 4 players and exactly 13 cards per player.
- Added round-bid validation to classify Over and Under and reject total estimates equal to 13.
- Updated HighestBidResolver to use the agreed hierarchy: no-trump > spades > hearts > diamonds > clubs.
- Added score engine types: ScoringProfile, ScoreContext, PlayerScoreResult, RoundScoreInput, RoundScoreResult, ScoringStrategy.
- Added ConfigurableScoringStrategy to isolate official/house-rule score variants.
- Added ScoreCalculationService shell.
- Added tests for configured normal scoring, pending standard scoring rules, invalid actual trick totals, and high-contract multiplier behavior.
- Exported score engine modules.

Current item in progress:

- US-205 - LeaderboardService.

Blockers:

- Final official scoring formulas still need confirmation before StandardScoringStrategy can be finalized.
- Dash and Dash Call scoring remain configurable pending confirmation.
- Tests were committed but should be verified by GitHub Actions or a local `npm install && npm test` run.

Overall progress:

- 52% complete.

## 2026-06-20 - Run 2

Completed:

- Implemented US-203 - TrickValidationService.
- Added trick domain model with trick entries, round/trick numbers, and active-player validation options.
- Added validation for positive round/trick numbers.
- Added validation to reject duplicate cards in the same trick.
- Added validation to reject duplicate player entries in the same trick.
- Added validation to reject inactive players.
- Added validation to ensure trick card count does not exceed active player count.
- Added Node test coverage for valid partial tricks, duplicate cards, duplicate player entries, excess trick cards, and inactive players.
- Added public exports for trick domain and TrickValidationService.
- Updated BACKLOG.md to mark US-203 done and move US-204 to next.

Current item in progress:

- US-204 - ScoreCalculationService Shell.

Blockers:

- Final Egyptian Estimation scoring variants still need confirmation before full score calculation is finalized.
- Selected suit ordering should remain configurable until table rules are confirmed.
- Tests were prepared but not executed in this environment; CI or local run should execute npm install then npm test.

Overall progress:

- 46% complete.

## 2026-06-20 - Run 1

Completed:

- Confirmed repository exists and is accessible.
- Confirmed repository was not code-search indexed, so direct file inspection was used.
- Found minimal bootstrap state: README, package.json, and tsconfig.json.
- Updated package.json so TypeScript tests compile before Node test execution.
- Added card domain model.
- Added bid domain model.
- Implemented BidValidationService for Egyptian Estimation bids.
- Added Node test coverage for valid bids, invalid player ids, negative bids, over-limit bids, and impossible table sizes.
- Added public exports.
- Created BACKLOG.md with progress tracker and implementation-ready backlog.
- Implemented HighestBidResolver.
- Added tests for empty input, highest trick bid, configurable suit priority, and deterministic tie reporting.
- Updated BACKLOG.md to mark US-202 done and move US-203 to next.

Current item in progress:

- US-203 - TrickValidationService.

Blockers:

- Final Egyptian Estimation scoring variants still need confirmation before full score calculation is finalized.
- Selected suit ordering should remain configurable until table rules are confirmed.
- Tests were prepared but not executed in this environment; CI or local run should execute npm install then npm test.

Overall progress:

- 36% complete.
