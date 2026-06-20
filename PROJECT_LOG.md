# Project Log

## 2026-06-20 - Run 8

Completed:

- Added `BalanceAccumulator` to eliminate manual running-balance mistakes.
- Exported `BalanceAccumulator` from the public package index.
- Added tests for:
  - Running balance accumulation across rounds.
  - Standings sorted by highest balance.
- This directly supports engine-generated score tables and reduces manual arithmetic risk.

Current item in progress:

- Acceptance dataset and table generation from engine output.

Blockers:

- Need CI/local test execution confirmation.
- Dash behavior in Over rounds is still unconfirmed.
- Dash Call formula is still unconfirmed.
- Whether With can apply to high contracts is still unconfirmed.
- Whether high-contract scores stack with Only Winner / Only Loser still needs final confirmation.
- Consecutive all-loser multiplier behavior is still unconfirmed.

Overall progress:

- 74% complete.

## 2026-06-20 - Run 7

Completed:

- Implemented US-205 - LeaderboardService.
- Added `LeaderboardService` with:
  - Round score aggregation by player.
  - Descending total-score sorting.
  - Deterministic tie ordering by first-seen player order or optional declared `playerOrder`.
  - Validation for blank player ids, non-finite scores, and duplicate player entries in the same round input.
- Exported `LeaderboardService` from the public package index.
- Added unit tests for:
  - Multi-round score aggregation.
  - Descending total-score ordering.
  - Tie stability using first-seen order.
  - Optional declared player-order tie stability.
  - Duplicate same-round player rejection.
- Cleaned the older BidValidationService tests to match the Egyptian Estimation bid model and remove the obsolete Planning Poker-style `mode` field.
- Updated `BACKLOG.md` to mark Leaderboard done, move UI/API integration to next, and raise overall progress to 72%.

Current item in progress:

- US-206 - UI/API Integration Shell.

Blockers:

- Need CI/local test execution confirmation.
- ScoreCalculationService remains partly blocked by rule confirmations:
  - Dash behavior in Over rounds.
  - Dash Call formula.
  - Whether With can apply to high contracts.
  - Whether high-contract scores stack with Only Winner / Only Loser.
  - Consecutive all-loser multiplier behavior.

Overall progress:

- 72% complete.

## 2026-06-20 - Run 6

Completed:

- Started rules-driven scoring hardening to avoid manual-table mistakes.
- Added layered score metadata to scoring types:
  - `isRiskTaker`
  - `riskModifier`
  - `isHighContract`
  - `roundMultiplier`
  - `nextRoundMultiplier`
- Updated `ConfigurableScoringStrategy` to apply scoring as layers:
  - Base win/loss
  - BO / WITH modifiers
  - Dash delta and Dash bonus/penalty
  - Risk bonus/penalty
  - Only Winner / Only Loser
  - x2 round multiplier
  - High-contract override with x2 excluded
- Updated `ScoreCalculationService` to:
  - Calculate round risk level from total bids vs 13.
  - Apply Under Dash as automatic risk.
  - Allow explicit sequence-based `riskPlayerId`.
  - Return `nextRoundMultiplier = 2` for all-loser rounds.
- Added accepted regression tests for:
  - WITH loss + Only Loser stacking.
  - Dash Under loss with delta + Dash penalty + Risk penalty + Only Loser.
  - All-loser zero round and next x2 multiplier.
  - x2 applying to normal rounds.
  - x2 not applying to high-contract rounds.
- Corrected the earlier invalid Dash example: `DASH 0/1` with all other players matching cannot total 13; the valid acceptance case is `DASH 0/2`, which scores `-32`.

Current item in progress:

- US-204 - ScoreCalculationService finalization and acceptance-suite expansion.

Blockers:

- Need CI/local test execution confirmation.
- Dash behavior in Over rounds is still unconfirmed.
- Dash Call formula is still unconfirmed.
- Whether With can apply to high contracts is still unconfirmed.
- Whether high-contract scores stack with Only Winner / Only Loser still needs final confirmation.
- Consecutive all-loser multiplier behavior is still unconfirmed.

Overall progress:

- 66% complete.

## 2026-06-20 - Run 5

Completed:

- Continued US-204 - ScoreCalculationService Shell using the newly confirmed Egyptian Estimation rules.
- Confirmed from the existing docs that score calculation must resolve the bid owner from `bidOwnerPlayerId` and suit/contract resolution, not from player order.
- Added explicit scoring metadata for `isOnlyWinner` and `isOnlyLoser`.
- Added profile configuration fields for owner loss penalty, only-loser penalty, and high-contract fixed scoring.
- Updated `ScoreCalculationService` to:
  - Resolve the bid owner dynamically from `bidOwnerPlayerId`.
  - Calculate only-winner and only-loser flags after evaluating all four players.
  - Apply the all-loser rule by returning zero scores for all players and noting that the next round should receive x2.
- Updated `ConfigurableScoringStrategy` to implement confirmed Egyptian formulas:
  - Normal win: `bid + winnerBaseBonus`.
  - Bid-owner / With win: normal win plus configured owner win bonus.
  - Normal loss: `-delta`.
  - Bid-owner / With loss: normal loss minus configured owner loss penalty.
  - Only winner: additional configured +10.
  - Only loser: additional configured -10.
  - Under Dash win/loss: configured +10 / -10.
  - High-contract win/loss fixed formulas when configured.
- Added regression tests for realistic owner rotation:
  - Bid owner is player B, not player A/player 1.
  - Bid owner is player C with a With player.
  - Only-winner scoring independent of owner position.
  - All-loser round scoring to zero.
- Updated `BACKLOG.md` to show score calculation at 82% and overall project progress at 62%.

Current item in progress:

- US-204 - ScoreCalculationService Shell finalization and remaining rule-confirmation cleanup.

Blockers:

- Risk-taker identification remains open. The docs currently state the likely rule but it needs final confirmation before implementing automatic risk bonus/penalty assignment.
- Dash behavior in Over rounds is still unconfirmed.
- Dash Call formula is still unconfirmed.
- Whether With can apply to high contracts is still unconfirmed.
- Whether only-winner/only-loser modifiers apply to high-contract and Dash rounds is still unconfirmed.
- Consecutive all-loser multiplier behavior is still unconfirmed: keep x2 or stack.
- Tests were committed but should be verified by GitHub Actions or a local `npm install && npm test` run.

Overall progress:

- 62% complete.

## 2026-06-20 - Run 4

Completed:

- Resumed US-204 - ScoreCalculationService Shell after clarifying the actual-tricks vs estimated-tricks rule.
- Wired `PlayerRoundEvaluation` into `ScoreCalculationService`.
- Added per-player `delta`, `didMatchBid`, role, and risk-type evaluation before score strategy execution.
- Added `ownerOutcome` derivation from the bid owner's actual-vs-estimate result when `bidOwnerPlayerId` is provided.
- Updated `ConfigurableScoringStrategy` so success/failure is based on `evaluation.didMatchBid` and failure penalties use `evaluation.delta`.
- Added a regression test covering exact-match winners and delta-based losers.
- Updated `BACKLOG.md` to show score calculation at 70% and overall project progress at 58%.

Current item in progress:

- US-204 - ScoreCalculationService Shell finalization and rule-confirmation cleanup.

Blockers:

- Final official Egyptian Estimation scoring formulas still need confirmation before StandardScoringStrategy can be finalized.
- Dash, Dash Call, With, and high-contract variants remain configurable pending confirmation.
- Existing older tests still reference the removed Planning Poker-style `mode` field; attempted direct test-file cleanup was blocked by the connector safety layer, so this remains a follow-up cleanup item.
- Tests were committed but should be verified by GitHub Actions or a local run.

Overall progress:

- 58% complete.

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
- Tests were committed but should be verified by GitHub Actions or a local run.

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
