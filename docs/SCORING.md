# Scoring Model

## Status

This document defines the corrected scoring architecture for the Egyptian Estimation Score Calculator MVP.

The previous simplified model assumed one generic formula for every player. That is incorrect for the real game. The score engine must evaluate the player's role in the round and the scoring scope before applying formulas.

## Key Correction

Scoring is not only based on each player's own bid vs actual tricks.

The engine must consider:

1. Bid owner / contract owner result.
2. Other players' result against the bid owner.
3. Risk taken by any player.
4. Whether the round scoring scope is all players, winner-only, or loser-only.
5. Whether the bid owner wins or loses.
6. Whether a non-owner player caused the owner to fail.
7. Whether a player took a special risk such as Dash, Dash Call, or a high-risk contract.

## Round Roles

### Bid Owner

The bid owner is the player who wins the bidding phase and owns the round contract.

The bid owner needs separate formulas for:

- Owner wins / contract achieved.
- Owner loses / contract failed.

The owner formula may differ from formulas applied to the other three players.

### Other Players

The non-owner players are evaluated against the bid owner result and their own actions.

They may have different score formulas depending on:

- Owner wins.
- Owner loses.
- They contributed to making the owner fail.
- They took or avoided tricks according to the risk scenario.
- They had their own special risk.

### Risk Taker

A risk taker is any player who declares or is assigned a risky scoring condition.

Examples to support:

- Dash.
- Dash Call.
- High contract risk.
- Other table-defined risks.

Risk score must be applied separately from normal role scoring and may override or modify the round result.

## Scoring Scope

The score engine must support multiple scoring scopes.

### All Players Scope

All four players receive a calculated score for the round.

### Winner-Only Scope

Only the winning player or winning side receives points. Other players may receive zero unless the selected profile defines penalties.

### Loser-Only Scope

Only the losing player or losing side receives penalty points. Other players may receive zero unless the selected profile defines rewards.

## Required Score Formula Groups

The following formula groups must be represented in the scoring profile.

### 1. Bid Owner Win Formula

Applies when the bid owner achieves the contract.

Open fields:

- ownerWinBase
- ownerWinPerContract
- ownerWinRiskMultiplier
- ownerWinHighContractMultiplier
- ownerWinFixedBonus

### 2. Bid Owner Loss Formula

Applies when the bid owner fails the contract.

Open fields:

- ownerLossBase
- ownerLossPerDifference
- ownerLossPerContract
- ownerLossRiskMultiplier
- ownerLossHighContractMultiplier
- ownerLossFixedPenalty

### 3. Other Player Formula When Owner Wins

Applies to non-owner players when the bid owner succeeds.

Open fields:

- otherWhenOwnerWinsScore
- otherWhenOwnerWinsPenalty
- otherWhenOwnerWinsByTricksTaken
- otherWhenOwnerWinsByDifference

### 4. Other Player Formula When Owner Loses

Applies to non-owner players when the bid owner fails.

Open fields:

- otherWhenOwnerLosesScore
- otherWhenOwnerLosesReward
- otherWhenOwnerLosesByContribution
- otherWhenOwnerLosesByTricksTaken

### 5. Risk Formula

Applies to players with special risk conditions.

Open fields:

- riskSuccessScore
- riskFailureScore
- riskMultiplier
- riskOverridesNormalScore
- riskAddsToNormalScore

### 6. Dash Formula

Pending confirmation.

Open fields:

- dashSuccessScore
- dashFailureScore
- dashScope
- dashOverridesNormalScore
- dashCanBeMultiplePlayers

### 7. Dash Call Formula

Pending confirmation.

Open fields:

- dashCallSuccessScore
- dashCallFailureScore
- dashCallScope
- dashCallOverridesNormalScore
- dashCallTargetPlayerId

### 8. High Contract Formula

Pending confirmation.

Open fields:

- highContractThreshold
- highContractOwnerWinMultiplier
- highContractOwnerLossMultiplier
- highContractOtherPlayerMultiplier
- highContractRiskFlag

## Round Evaluation Flow

```text
1. Validate bids.
2. Classify round as Over or Under.
3. Resolve bid owner using contract number and suit hierarchy.
4. Enter actual tricks.
5. Validate total actual tricks = 13.
6. Evaluate whether the bid owner won or lost.
7. Detect risk takers.
8. Determine scoring scope.
9. Apply bid owner win/loss formula.
10. Apply other-player formula based on owner result.
11. Apply risk formula where relevant.
12. Apply winner-only or loser-only scope if selected.
13. Return per-player scores and scoring notes.
```

## Data Required for Calculation

A scoring round must include:

- Bids for all four players.
- Winning bid / bid owner.
- Trump suit or no-trump.
- Round type: Over or Under.
- Actual tricks for all four players.
- Risk declarations.
- Scoring scope.
- Scoring profile.

## Current Implementation Gap

The current score engine has a configurable strategy shell, but it still needs to be revised to include:

- Player role: bid-owner vs other-player.
- Owner win/loss result.
- Risk-taker model.
- Winner-only and loser-only scoring scope.
- Separate formula groups for owner and other players.

## Implementation Recommendation

Update the score engine types before adding any more formulas.

Required additions:

```text
RoundRole = BidOwner | OtherPlayer
OwnerRoundOutcome = OwnerWon | OwnerLost
ScoringScope = AllPlayers | WinnerOnly | LoserOnly
RiskType = None | Dash | DashCall | HighContract | Custom
RiskApplication = Override | Additive | Multiplier
```

## Open Confirmation Questions

These must be confirmed from official or player-validated rules:

1. Exact bid owner win formula.
2. Exact bid owner loss formula.
3. Score for non-owner players when owner wins.
4. Score for non-owner players when owner loses.
5. Risk scoring behavior.
6. Dash scoring.
7. Dash Call scoring.
8. High contract scoring.
9. Winner-only scope rules.
10. Loser-only scope rules.

## Decision

Until these formulas are confirmed, the app must not hardcode a single StandardScoringStrategy. The MVP should continue with a configurable scoring profile that can represent different table rules.
