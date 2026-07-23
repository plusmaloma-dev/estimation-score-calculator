# All-Loser Carry Multiplier Design

**Date:** 2026-07-23  
**Status:** Approved for specification  
**Branch:** `feature/react-vite-frontend-prototype`  
**Related PR:** #11 — Build React Vite frontend prototype

## 1. Purpose

This design defines the corrected all-loser round behavior for the Egyptian Estimation score calculator.

The rule is independent of contract size. It applies to normal and high contracts alike.

## 2. Scope

### Included

1. Detect rounds in which all four players lose.
2. Keep such rounds in history while applying no score change.
3. Accumulate a carry multiplier across consecutive all-loser rounds.
4. Apply the accumulated multiplier to the next round that produces scores.
5. Stack the carried multiplier multiplicatively with the existing Multiple WITH multiplier.
6. Recalculate cumulative totals and leaderboard values correctly.
7. Preserve enough round metadata for reliable reopen, export, and future analytics.
8. Add automated tests across domain, service, persistence, and React integration layers.

### Excluded

1. Visual redesign of the score sheet.
2. New score-table columns.
3. Dotted-line or strike-through styling for all-loser rows.
4. Multiplier badges beside round numbers.
5. Any broader UI revamp.

The excluded visual enhancements are deferred to a later design phase.

## 3. Rule Definition

### 3.1 All-loser round

A completed round is an all-loser round when all four players fail their own estimate according to the active scoring rules.

The detection must use each player’s resolved success/failure result after estimates and actual tricks are validated. It must not depend on the winning contract number, contract category, trump suit, Risk, WITH, Hold, or Dash status.

### 3.2 Score effect

When a round is all-loser:

- the round remains valid and is persisted in game history;
- each player’s applied score for that round is `0`;
- cumulative totals do not change;
- leaderboard totals do not change;
- the round increments the consecutive all-loser carry count;
- no carried multiplier is consumed on that round.

The original calculated failure details may remain available for diagnostics and analytics, but the applied scoring effect for the round is zero for all players.

## 4. Carry Multiplier

### 4.1 Accumulation

The next scored round receives a multiplier derived from the number of immediately preceding consecutive all-loser rounds.

Formula:

```text
carriedMultiplier = 2 × consecutiveAllLoserCount
```

Examples:

```text
1 consecutive all-loser round  -> ×2
2 consecutive all-loser rounds -> ×4
3 consecutive all-loser rounds -> ×6
4 consecutive all-loser rounds -> ×8
```

The progression is linear, not exponential.

### 4.2 Consumption and reset

The carry remains pending until a round produces scores.

On the first subsequent non-all-loser round:

1. calculate each player’s score using the normal role and modifier rules;
2. apply all applicable ordinary round modifiers;
3. apply the carried all-loser multiplier;
4. apply the existing Multiple WITH multiplier last if active;
5. save the resulting applied scores;
6. reset the consecutive all-loser carry count to zero for following rounds.

A scored round consumes the full accumulated carry exactly once.

## 5. Interaction with Multiple WITH

The carried multiplier and Multiple WITH multiplier stack multiplicatively.

Example:

```text
2 consecutive all-loser rounds -> carried ×4
Multiple WITH active           -> ×2
Combined multiplier            -> ×8
```

The combined effect applies to all four players’ final round scores.

The order is conceptually:

```text
fully calculated round score × carried multiplier × Multiple WITH multiplier
```

Because multiplication is commutative, the numeric result is the same, but the implementation must keep the modifiers distinct in stored metadata and score notes for auditability.

## 6. High Contracts and Other Roles

There is no high-contract exception.

The rule applies regardless of whether the winning estimate is 7, 8, or any other permitted value.

The carried multiplier also applies regardless of player role, including:

- bid owner;
- normal player;
- WITH player;
- Hold player;
- Risk player;
- Dash-related roles where otherwise valid.

Any role-specific base score or modifier is calculated first, then the carried multiplier is applied.

## 7. Data Model

Each persisted round should expose or preserve enough metadata to distinguish:

- whether the round was all-loser;
- the consecutive all-loser count entering the round;
- the carried multiplier applied to the round;
- whether the carry was consumed by the round;
- the Multiple WITH multiplier applied to the round;
- original calculated scores;
- final applied scores.

Recommended persisted fields:

```text
isAllLoserRound: boolean
consecutiveAllLoserCountBeforeRound: number
carriedAllLoserMultiplier: number
multipleWithMultiplier: 1 | 2
calculatedScoresByPlayerId
appliedScoresByPlayerId
```

The carry should be derivable from prior completed rounds so recalculation remains correct after reopening or rebuilding a game. Persisting the resolved values on each round provides auditability and avoids ambiguity in exports and analytics.

## 8. Recalculation Behavior

Game recalculation must process rounds in chronological order.

For each round:

1. resolve whether all four players lost;
2. if all-loser, apply zero scores and increment the carry count;
3. otherwise derive the carry multiplier from the current count;
4. calculate and apply final scores;
5. reset the carry count after the scored round;
6. update cumulative totals and leaderboard state.

Recalculation must produce the same result whether performed during initial save, session reopen, backup restore, or future centralized persistence migration.

Manual score overrides affect applied scores but do not redefine whether the original round was all-loser. The all-loser classification must be based on the original estimate-versus-actual outcomes, not on manually overridden score values.

## 9. Error Handling

- Invalid rounds must still fail before all-loser evaluation.
- All-loser detection must occur only after bids and actual tricks are valid.
- A partial player result must never trigger the rule.
- The carry must not be lost when saving, reopening, exporting, or recalculating.
- A failed persistence operation must not consume or reset the carry.
- Legacy rounds without the new metadata must be normalized by replaying prior rounds rather than assuming no carry.

## 10. Testing Strategy

### 10.1 Domain and scoring tests

Cover:

- all four players lose -> all applied scores are zero;
- three players lose and one succeeds -> normal scoring, not all-loser;
- one all-loser round -> next scored round ×2;
- two consecutive all-loser rounds -> next scored round ×4;
- three consecutive all-loser rounds -> next scored round ×6;
- carry resets after the next scored round;
- an all-loser round after a scored round begins a new sequence;
- high contracts receive the same carry behavior;
- carried multiplier applies to positive and negative scores;
- carried multiplier stacks with Multiple WITH multiplicatively;
- all-loser classification ignores score overrides.

### 10.2 Service and persistence tests

Cover:

- save and reopen while a carry is pending;
- export and import preserve the resolved sequence;
- full-game recalculation reproduces the same totals;
- leaderboard totals remain unchanged for skipped rounds;
- legacy rounds are replayed correctly;
- score overrides do not corrupt carry detection or consumption.

### 10.3 React integration tests

For this phase, React tests only need to confirm that:

- saving an all-loser round results in unchanged displayed totals;
- the next scored round displays multiplied scores after save;
- no new column or visual redesign is introduced.

The deferred dotted-line and round-number badge treatments will require a separate approved UI design and test set later.

## 11. Acceptance Criteria

The change is complete when:

1. Every all-loser round is saved with zero applied score for all players.
2. Consecutive all-loser rounds accumulate ×2, ×4, ×6, and so on.
3. The next scored round consumes the accumulated multiplier exactly once.
4. The carry resets after consumption.
5. Multiple WITH stacks multiplicatively with the carried multiplier.
6. High contracts are treated exactly the same as all other contracts.
7. Cumulative totals, leaderboard, reopen, export, and recalculation remain consistent.
8. Existing UI dimensions and table columns remain unchanged.
9. Automated tests cover the defined scenarios and pass in CI.
