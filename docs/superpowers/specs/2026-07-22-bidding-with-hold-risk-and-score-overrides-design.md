# Bidding, WITH/Hold, Risk, Round Multiplier, and Score Override Design

**Date:** 2026-07-22  
**Status:** Approved for implementation planning  
**Branch:** `feature/react-vite-frontend-prototype`  
**Related PR:** #11 — Build React Vite frontend prototype

## 1. Purpose

This design replaces the fragile current-round estimate behavior with an explicit pre-round bidding state and adds the previously agreed completed-round score override feature.

The design must support:

- Stable bid-winner and trump ownership.
- Multiple active WITH players.
- Bid-winner raises followed by WITH players choosing Follow or Hold.
- Hold players retaining their earlier estimate and receiving normal scoring.
- Risk assignment based on the finalized bidding sequence, not the dealer position alone.
- A whole-round x2 multiplier when two or more active WITH players remain at confirmation.
- Audited manual score overrides for completed rounds.
- Responsive score-sheet layout without horizontal scrolling on standard supported screens.

## 2. Scope

### Included

1. Pre-round bidding-state model and transitions.
2. Stable bid-winner/trump-caller identity.
3. WITH, Follow, Hold, and ownership-transfer behavior.
4. Risk assignment from the finalized bidding sequence.
5. Multiple-WITH x2 scoring modifier.
6. Bid confirmation and freezing before actual tricks.
7. Completed-round manual score overrides with audit history.
8. Downstream cumulative-score and ranking recalculation.
9. Responsive score-sheet table refinements.
10. Tests covering domain rules, persistence, browser shell, and React UI.

### Excluded

1. Full event-sourced auction replay.
2. Editing estimates or actual tricks through the score-override dialog.
3. Changing the selected rule set after game creation.
4. Permanent deletion of original calculated scores or override history.
5. Background synchronization or multi-user conflict resolution.

## 3. Core Concepts

### 3.1 Bid winner / trump caller

The bid winner is the player who currently owns the highest estimate and the trump selection.

The bid winner is stored as an explicit identity. It must not be re-derived only from the latest estimate values, because equal estimates and later edits can otherwise transfer ownership incorrectly.

### 3.2 Active WITH (`W`)

A player is active WITH when their current estimate equals the current bid winner's estimate and they have elected to follow that winner.

Multiple players may be active WITH at the same time.

### 3.3 Hold (`H`)

A player becomes Hold when they were active WITH, the bid winner raises, and they choose to keep their earlier estimate instead of following the raise.

A Hold player:

- retains the earlier estimate;
- is no longer an active WITH player;
- is scored as a normal player;
- does not receive bid-owner/WITH scoring;
- does not count toward the multiple-WITH x2 condition;
- remains marked `H` in the current row and round history.

### 3.4 Risk (`R`, `2R`, `3R`)

Risk belongs to the eligible final caller in the finalized bidding sequence when the final estimate total reaches the applicable Over/Under threshold.

Risk is not assigned directly from dealer position alone.

### 3.5 Score override

A score override changes the applied score for a completed round without deleting or replacing the original calculated score.

The override is an auditable adjustment, not a re-entry of estimates or actual tricks.

## 4. Bidding-State Model

The pre-round model must explicitly contain at least:

- `playerOrder`: fixed table/seating order.
- `estimateEntryOrder`: first meaningful estimate-entry order.
- `estimatesByPlayerId`.
- `bidOwnerPlayerId`.
- `winningEstimate`.
- `trumpSuit`.
- `withPlayerIds`.
- `holdPlayerIds`.
- `riskPlayerId`.
- `phase`: bidding, awaiting-follow-decisions, confirmed, actuals, or completed.
- pending follow/hold decisions after a winner raise.
- derived Over/Under total.
- derived multiple-WITH round multiplier.

The model may store a compact transition history for audit/debugging, but a complete event-sourcing implementation is not required.

## 5. Bidding Rules

### 5.1 Initial estimates

- Blank estimates are treated as zero for totals and validation.
- Individual estimates must be integers from 0 through 12.
- An individual estimate of 13 is invalid.
- The total of all four estimates must not equal 13.
- At least one player must have a positive estimate before confirmation.

### 5.2 Establishing the bid winner

- The first player who establishes the current highest estimate becomes the bid winner and trump caller.
- That player selects the trump suit or No Trump.
- A later player who enters the same highest estimate becomes active WITH.
- Equal estimates never transfer bid ownership.

Example:

```text
P1 enters 4 and selects Hearts -> P1 is bid winner
P3 enters 4 -> P3 is WITH
```

### 5.3 Stable ownership during matching raises

When the bid winner raises and an active WITH player later matches the new estimate:

- the original bid winner remains the bid winner;
- trump remains with the original bid winner;
- the matching player remains active WITH;
- the matching action must not transfer ownership.

Example:

```text
P1: 4 Hearts, owner
P3: 4 W
P1 raises to 5
P3 follows to 5 W
Result: P1 remains owner and Hearts remains trump
```

### 5.4 Ownership transfer on a higher estimate

A player becomes the new bid winner only when they enter an estimate strictly greater than the current winning estimate.

On ownership transfer:

- the new winner must select trump;
- the former winner no longer owns trump;
- equal estimates still cannot transfer ownership;
- all affected WITH/Hold relationships must be recalculated through explicit state transitions, not inferred by simple sorting.

The detailed status of the former winner follows the normal bidding transition rules: they remain at their estimate unless they later match the new winner and elect WITH.

### 5.5 Winner raises with active WITH players

When the bid winner increases their estimate, every active WITH player must resolve a decision before confirmation:

1. **Follow**
   - Increase to the new winning estimate.
   - Remain active WITH (`W`).

2. **Hold**
   - Keep the earlier estimate.
   - Change to Hold (`H`).
   - Receive normal scoring.

The bid cannot be confirmed while any required Follow/Hold decision is unresolved.

### 5.6 Multiple Hold players

More than one active WITH player may choose Hold after the winner raises.

Each Hold player:

- keeps their own earlier estimate;
- is marked `H`;
- receives normal scoring;
- is excluded from the active WITH count;
- is excluded when identifying the eligible final caller for Risk.

## 6. Trump Rules

- The trump selector is editable only by the current bid winner.
- Active WITH players display the inherited trump but cannot change it.
- Hold players retain no trump ownership.
- Matching the highest estimate never moves the trump selector.
- Following a winner's raise never moves the trump selector.
- A strict overbid transfers bid ownership and requires a trump selection by the new winner.
- Trump is frozen when the bid is confirmed.

## 7. Final Bidding Sequence and Risk

### 7.1 Sequence origin

The finalized estimate sequence is anchored to the confirmed bid winner/trump caller, not derived only from the dealer.

The sequence proceeds through the fixed table order beginning with the bid winner.

### 7.2 Eligible final caller

The Risk candidate is the last eligible caller in the finalized sequence.

Players who became Hold after previously being WITH are skipped when determining the Risk candidate.

Examples:

#### One Hold player

```text
P1 = bid winner
P4 = WITH, then Hold
Risk candidate = P3
```

#### Two Hold players

```text
P1 = bid winner
P3 = WITH, then Hold
P4 = WITH, then Hold
Remaining eligible normal player P2 = Risk candidate
```

### 7.3 Risk activation threshold

Identifying a candidate does not automatically activate Risk.

Risk activates only when the final confirmed estimate total reaches the configured Risk threshold.

For the currently agreed House Rules behavior:

- Over Risk activates at total estimates of 15 or more (`O/U +2` or higher), with the Risk candidate's estimate meeting the existing minimum required by the rule.
- Under Risk activates at total estimates of 11 or less (`O/U -2` or lower).
- The risk level and displayed annotation (`R`, `2R`, `3R`) are derived from the existing configured risk-level rules.

Hold alone never activates Risk.

## 8. Multiple-WITH Round Multiplier

### 8.1 Activation

If the finalized confirmed bid contains two or more active WITH players, the whole round receives an x2 multiplier.

- The bid winner is not counted as a WITH player.
- Hold players are not counted.
- Exactly one active WITH player does not activate the multiplier.
- Two or three active WITH players activate the multiplier.

### 8.2 Application order

The x2 multiplier is applied last to every player's fully calculated round score.

Calculation order:

1. Base score for the player's role and result.
2. Bid-owner or WITH bonus/penalty where applicable.
3. Risk adjustment.
4. Only Winner / Only Loser adjustment.
5. Dash, high-contract, or other applicable rule-specific modifiers.
6. Any existing applicable round modifier.
7. **Multiple-WITH x2 multiplier last.**

Example:

```text
Base and role score: 17
Risk bonus: +10
Only Winner bonus: +10
Subtotal: 37
Multiple-WITH multiplier: 37 x 2
Final applied round score: 74
```

The multiplier applies to all four players, including normal and Hold players.

## 9. Round Lifecycle

The current round follows these phases:

1. **Bidding**
   - Enter and revise estimates.
   - Establish and update bid ownership.
   - Select trump.
   - Resolve WITH relationships.

2. **Awaiting Follow/Hold decisions**
   - Triggered when the winner raises while active WITH players exist.
   - All affected players must choose Follow or Hold.

3. **Confirmed**
   - Validate all estimates and role states.
   - Validate total estimates are not 13.
   - Resolve Risk candidate and active Risk.
   - Resolve active WITH count and x2 multiplier.
   - Freeze estimates, roles, ownership, trump, Risk, and multiplier.

4. **Actuals**
   - Enable actual-trick entry.
   - Actual tricks must be integers from 0 through 13.
   - The four actual values must total 13.

5. **Completed**
   - Calculate and save scores.
   - Persist finalized bidding metadata and calculated results.
   - Refresh cumulative totals and rankings.

## 10. Persisted Round Data

Each saved round must preserve enough information to reconstruct the displayed result without re-inferring bidding roles from final estimates alone.

At minimum, persist:

- bid owner player id;
- trump suit;
- final estimates;
- final bid type/status for each player: owner, WITH, Hold, normal, or applicable special call;
- WITH target owner id where applicable;
- Hold marker where applicable;
- Risk player id and risk level;
- multiple-WITH multiplier;
- actual tricks;
- calculated player scores;
- any score overrides and audit records.

Legacy saved rounds without the new metadata must continue to open using backward-compatible defaults.

## 11. Completed-Round Score Override

### 11.1 Entry point

Each completed round provides an `Edit scores` action.

The action opens an override panel or modal for that round.

### 11.2 Display

For each player, show:

- original calculated score;
- currently applied score;
- proposed override value;
- override status.

### 11.3 Validation

- At least one player's applied score must change.
- Override values must be integers.
- A non-empty reason is mandatory.
- The original calculated score must remain immutable.
- Cancelling makes no persisted change.

### 11.4 Audit record

Every confirmed override records:

- round number;
- player id;
- original calculated score;
- previous applied score;
- new applied score;
- reason;
- timestamp;
- actor identifier when available, otherwise a stable local-user label.

Audit records are append-only.

### 11.5 Recalculation

After an override:

- recalculate cumulative totals from the edited round forward;
- recalculate leaderboard rankings;
- update all later displayed cumulative values;
- leave original calculated round results unchanged;
- use applied scores for game totals and rankings.

### 11.6 Restore original

A user may restore a player's applied score to the original calculated score.

Restoration:

- requires a reason;
- creates a new audit record;
- does not delete prior override records;
- triggers the same downstream recalculation.

### 11.7 Visibility

Overridden scores must be clearly marked in:

- score-sheet rows;
- round history;
- backup/export data;
- any audit view.

## 12. Responsive Score-Sheet Design

The score sheet must fit the available desktop/tablet viewport without horizontal scrolling at standard supported widths.

Requirements:

- Use proportional column widths through `colgroup` or equivalent layout rules.
- Remove large fixed table and player-header widths.
- Use compact subheader labels at narrower widths.
- Reduce badge, padding, font, and input sizes responsively.
- Allow estimate/trump controls and annotations to wrap within their cells.
- Preserve all four player groups, round number, and O/U on screen.
- Maintain readability and keyboard accessibility.
- Very narrow mobile layouts may use a dedicated compact presentation if the full 18-column table cannot remain usable; silent content clipping is not allowed.

## 13. Error Handling

- Invalid transitions must be rejected without corrupting current state.
- Bid confirmation errors must explain the first blocking issue and retain editable state.
- Saving a round must fail atomically when validation or persistence fails.
- Score overrides must fail atomically; no partial player overrides may be persisted.
- Legacy data normalization must never overwrite stored data merely by opening a session.

## 14. Testing Strategy

### 14.1 Domain tests

Cover:

- first highest estimate establishes owner;
- equal estimate creates WITH without changing owner;
- multiple WITH players;
- winner raises and all WITH players follow;
- winner raises and one WITH player holds;
- winner raises and multiple WITH players hold;
- strict higher estimate transfers ownership;
- matching a raise never transfers ownership;
- trump remains with owner through matching raises;
- unresolved Follow/Hold blocks confirmation;
- Hold receives normal scoring;
- Hold does not count toward x2;
- two or more active WITH players produce x2 for all players;
- x2 is applied after all other modifiers;
- Risk candidate skips Hold players;
- Risk activates only at the threshold.

### 14.2 Service and persistence tests

Cover:

- save and reopen finalized role metadata;
- legacy round compatibility;
- score override creation;
- mandatory reason validation;
- downstream cumulative recalculation;
- ranking recalculation;
- restore-original audit entry;
- backup/export round trip with overrides and audit history.

### 14.3 React tests

Cover:

- trump selector remains with original owner after WITH follows a raise;
- multiple WITH annotations;
- explicit Follow/Hold controls;
- confirmation disabled while decisions are unresolved;
- Risk annotation moves to the correct eligible player;
- x2 indicator before confirmation and in completed history;
- responsive table structural classes and compact labels;
- completed-round `Edit scores` flow;
- override reason requirement;
- updated totals and override marker after save.

### 14.4 Verification

The implementation is complete only after:

- TypeScript core and app typechecks pass.
- All core tests pass.
- All React/Vitest tests pass.
- Production Vite build passes.
- GitHub Actions CI passes on the final branch commit.

## 15. Acceptance Scenarios

### Scenario A: Owner retained through matching raise

```text
P1 enters 4 and selects Hearts
P3 enters 4 -> W
P1 raises to 5
P3 follows to 5 -> W
Expected: P1 remains owner; Hearts remains trump
```

### Scenario B: One WITH becomes Hold

```text
P1 enters 4 and selects Spades
P4 enters 4 -> W
P1 raises to 5
P4 chooses Hold at 4 -> H
Expected: P4 scores normally; P3 is Risk candidate; no multiple-WITH x2
```

### Scenario C: Multiple WITH players become Hold

```text
P1 enters 4 and selects Clubs
P3 enters 4 -> W
P4 enters 4 -> W
P1 raises to 5
P3 holds at 4 -> H
P4 holds at 4 -> H
Expected: P3 and P4 score normally; P2 is Risk candidate; no x2
```

### Scenario D: Multiple active WITH players

```text
P1 enters 4 and selects No Trump
P3 enters 4 -> W
P4 enters 4 -> W
All remain at 4 through confirmation
Expected: two active WITH players; every final round score is multiplied by 2 last
```

### Scenario E: Manual score override

```text
Calculated scores: P1 27, P2 17, P3 -1, P4 -11
User overrides P3 to 0 with reason "Table correction"
Expected:
- calculated score remains -1
- applied score becomes 0
- audit record is appended
- cumulative totals and rankings recalculate from this round forward
- override marker appears
```

## 16. Implementation Boundaries

The implementation should introduce small, focused units rather than extending the existing reducer indefinitely.

Recommended boundaries:

- `BiddingState` and transition reducer/service.
- Bidding-role and Risk resolvers.
- Round-multiplier resolver.
- Persisted bidding metadata types.
- Score-override service and audit types.
- Applied-score projection for leaderboard/history.
- Follow/Hold UI controls.
- Score override dialog/panel.

Scoring formulas remain in the scoring engine. React components may display derived state but must not reproduce scoring calculations.
