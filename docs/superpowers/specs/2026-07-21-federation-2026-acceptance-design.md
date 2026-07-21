# Federation 2026 Acceptance Coverage Design

Status: approved for implementation on 2026-07-21.

## Goal

Create end-to-end Federation 2026 acceptance coverage through the game-level `EstimationMvpService`, repair any behavior that contradicts the confirmed Federation scoring model, and prove that House Rules V1 remains isolated.

## Scope

The acceptance suite will cover:

- Normal player success and failure.
- Auction owner success and failure.
- WITH success and failure using the owner/WITH calculation.
- Risk and Double Risk where the risk taker is not the auction owner.
- Dash Under success and failure.
- Dash Over success and failure.
- Super 8, Super 9, and Super 10 success and failure.
- Only Winner and Only Loser modifiers.
- A round where all four players lose under Federation 2026.
- A House Rules V1 regression proving its existing all-loser zero-score and next-round multiplier behavior is unchanged.

## Confirmed Federation Scoring Baseline

The suite uses the existing `federation2026ScoringTable` values:

- Normal success: `13 + called tricks`.
- Normal failure: `-delta`.
- Auction owner and WITH success: `23 + called tricks`.
- Auction owner and WITH failure: `-10 - delta`.
- Dash Under success: `23`.
- Dash Under failure: `-10 - delta`.
- Dash Over success: `13`.
- Dash Over failure: `-delta`.
- Super 8 / 9 / 10 success: `41 / 42 / 43`.
- Super failure: `-20 - delta`.
- Risk success/failure adjustment: `+10 / -10`.
- Double Risk success/failure adjustment: `+20 / -20`.
- Only Winner bonus: `+10`.
- Only Loser penalty: `-10`.

## Federation All-Loser Behavior

When all four Federation players fail their calls:

- Each player keeps the negative score calculated by `Federation2026ScoringStrategy`.
- Scores are not replaced with zero.
- `nextRoundMultiplier` is not created.
- The House Rules V1 all-loser x2/x4 mechanism is not reused.

The current shared all-loser shortcut in `ScoreCalculationService` must therefore be restricted to non-Federation scoring.

## Architecture

A new test file, `tests/federation2026Acceptance.test.ts`, will exercise complete game inputs using `MvpGameInput.ruleSet = FEDERATION_2026`. This verifies rule selection, bid validation, evaluation roles, scoring modifiers, and game-level aggregation together.

Production changes should remain minimal. The expected repair is a rule-set guard around the all-loser shortcut in `ScoreCalculationService`; existing per-player Federation scoring remains the source of truth.

## Test Data Rules

Every acceptance round must:

- Contain exactly four bids and four actual results.
- Have total actual tricks equal to 13.
- Have total bids different from 13.
- Use explicit `bidOwnerPlayerId` where owner scoring is expected.
- Use explicit `riskPlayerId` only for Risk and Double Risk scenarios.
- Keep risk-taker and owner roles separate in this slice.
- Assert both the target player score and key metadata such as role, risk modifier, only-winner/loser flags, and next-round multiplier when relevant.

## Deferred Items

The following remain outside this slice:

- Federation All-Pass round flow.
- Multiple auction owners created through WITH.
- Stacking auction-owner and Risk roles on the same player.
- Frontend controls for Federation-specific bidding states.

## Error Handling

No new public error type is required. Existing round validation remains authoritative. The acceptance helpers will fail tests immediately when a round is invalid or the expected player result is missing.

## Completion Criteria

The slice is complete when:

- All listed Federation scenarios pass through `EstimationMvpService.calculateGame`.
- Federation all-loser scores remain negative and have no next-round multiplier.
- House Rules V1 all-loser behavior remains zero scores with a multiplier.
- `npm run ci` passes typecheck, all tests, and build.
- `BACKLOG.md` and `PROJECT_LOG.md` reflect completion and identify Federation All-Pass as the next item.
