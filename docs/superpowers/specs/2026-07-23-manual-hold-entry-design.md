# Manual Hold Entry Design

**Date:** 2026-07-23

**Status:** Approved design amendment

**Applies to:** React/Vite score-sheet bidding entry in local-browser and online UAT modes

## 1. Purpose

The existing Hold workflow requires a player to become active WITH, followed by the bid owner raising, before the interface offers a Follow/Hold decision. Real games may resolve Hold verbally, and later estimate or trump changes can make that inferred workflow lose the intended Hold state.

Hold will therefore become an explicit user-entered flag beside each eligible estimate. The application must never infer or automatically select Hold.

This amendment changes only Hold entry and the bidding-state transitions required to preserve it. Existing Hold scoring, Risk exclusion, multiple-WITH exclusion, persistence, and score-sheet history remain unchanged.

## 2. Approved User Experience

Each estimate cell displays an `H` toggle when all of the following are true:

- the estimate belongs to a non-owner player;
- the estimate is a positive integer;
- estimates have not yet been accepted.

The toggle is unselected by default. It becomes selected only when the user explicitly clicks it. Clicking a selected toggle removes Hold.

A selected Hold displays an `H` annotation beside the estimate. A matching non-owner estimate that is not Hold displays `W` under the existing WITH rule.

The existing forced Follow/Hold decision controls are removed. Raising the winning estimate no longer blocks estimate acceptance while another player resolves a prompt.

## 3. Hold State Rules

Manual Hold is stored explicitly per player in the current bidding state.

- Entering or changing a non-owner positive estimate never selects Hold automatically.
- Changing the bid owner's estimate or trump does not clear another eligible player's manually selected Hold.
- Changing a Hold player's estimate does not clear Hold while the estimate remains positive and the player remains a non-owner.
- Clicking `H` again clears Hold.
- Clearing an estimate, changing it to zero, or making that player the bid owner clears Hold because the player is no longer eligible.
- A former owner who becomes a non-owner does not automatically become Hold.
- A player marked Hold is never also treated as active WITH, even when their estimate equals the winning estimate.

Estimate validation remains unchanged: each estimate must be an integer from 0 through 12, the total of all four estimates must not equal 13, at least one estimate must be positive, and the bid owner must select trump.

## 4. Ownership, WITH, and Acceptance

Bid ownership continues to transfer only when a player enters an estimate strictly greater than the current winning estimate. Equal estimates never transfer ownership.

For a non-owner player:

- matching the winning estimate produces `W` only when manual Hold is not selected;
- selecting `H` removes the player from active WITH without changing the estimate;
- removing `H` restores `W` automatically if the estimate still matches the winning estimate, otherwise the player returns to normal status.

Estimate acceptance depends only on the existing estimate, owner, total, and trump validation rules. There is no pending Follow/Hold state and no Hold-related blocking validation.

## 5. Risk and Multiple-WITH Behavior

The existing scoring meaning of Hold is preserved.

- Hold players receive normal other-player scoring.
- Hold players do not receive bid-owner or WITH scoring.
- Hold players do not count toward the multiple-WITH multiplier.
- Hold alone does not activate Risk.
- When the otherwise eligible final caller is marked Hold, Risk moves backward through seating order to the next eligible non-Hold player.
- Only an explicitly selected Hold changes the Risk candidate.

Risk thresholds and all scoring formulas are unchanged.

## 6. Persistence and Online Integration

No database schema or RPC signature change is required.

When a round is accepted and saved:

- manually selected Hold players serialize with `bidType: "hold"`;
- matching non-Hold players serialize with `bidType: "with"`;
- other players serialize with `bidType: "normal"`;
- Hold estimates, calculated scores, and applied scores continue through `save_game_round`;
- `get_game_snapshot` restores the persisted `hold` bid type and the score-sheet history displays `H`.

The same reducer and component behavior is used by synchronous local-browser mode and asynchronous online mode.

## 7. Component and State Boundaries

`biddingState.ts` owns the explicit Hold state and eligibility transitions.

`currentRoundReducer.ts` exposes a toggle action and derives Hold, WITH, Risk, and multiple-WITH values from the bidding state.

`CurrentRoundRow.tsx` renders the `H` toggle beside eligible estimate inputs and no longer renders forced Follow/Hold decision controls.

`ScoreSheetScreen.tsx` continues translating finalized bidding status into persisted `normal`, `with`, or `hold` bid types without introducing a second Hold model.

## 8. Error Handling

An inapplicable Hold action is ignored safely:

- bid owner;
- blank or zero estimate;
- accepted/frozen estimates.

An unknown player remains a programming error at the reducer boundary. The interface hides the `H` toggle when Hold is inapplicable, so ordinary users do not encounter an error message for these cases.

## 9. Verification

Automated tests must prove:

- positive non-owner estimates expose an unselected `H` toggle;
- Hold is selected only by an explicit user action;
- the toggle can remove Hold;
- estimate and trump changes never create Hold automatically;
- selected Hold survives owner estimate and trump changes while still eligible;
- Hold clears when its player becomes owner or changes to zero/blank;
- matching non-Hold estimates remain WITH;
- removing Hold restores WITH when the estimate still matches;
- forced Follow/Hold prompts and blocking validation are absent;
- Risk skips an explicitly selected Hold player;
- non-selected players are never skipped as Hold;
- multiple-WITH excludes Hold;
- online and local round serialization persist `bidType: "hold"`;
- score-sheet history restores and displays `H`;
- the complete CI command passes.

Live UAT must additionally verify manual Hold entry, round persistence, snapshot reload, and Risk reassignment before lifecycle smoke testing resumes.

## 10. Non-Goals

This amendment does not change:

- the 0-through-12 individual estimate range;
- the rule that total estimates cannot equal 13;
- bid-owner or trump selection rules;
- Risk activation thresholds;
- Hold scoring;
- score override behavior;
- game lifecycle, locking, membership, or authentication behavior.
