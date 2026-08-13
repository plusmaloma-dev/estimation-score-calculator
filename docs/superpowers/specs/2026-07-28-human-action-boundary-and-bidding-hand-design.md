# Human Action Boundary Synchronization and Bidding Hand Visibility

Date: 2026-07-28

## Status

Approved design for the isolated online gameplay MVP on `feature/online-game-bot-mvp`.

This work remains inside draft PR #14. The PR must stay open, draft, unmerged, and must not be merged without explicit authorization.

## Problem Statement

Hosted UAT exposed two independent defects.

### Defect A: human round actions do not advance active control

A human bid or card play is committed to the authoritative gameplay round, but the corresponding active-control action boundary is not completed. The round state advances to the next seat while active control remains on the prior human seat. When the timer later evaluates that stale turn, it can issue a bot directive for a seat that is no longer authoritative in the round engine.

Observed evidence from `Solo UAT Bot Retest 4`:

- active control version 18;
- active control still on Seat 1 in `bot-processing` for a card turn;
- round version 6 already advanced to Seat 2;
- two cards persisted in the current trick;
- six accepted `BEGIN_BOT_ACTION` commands but only five accepted `COMPLETE_ACTION_BOUNDARY` commands;
- the latest accepted active-control command was `BEGIN_BOT_ACTION`;
- the round engine rejected the stale directive with `Bot directive does not match the authoritative active seat.`

### Defect B: the viewer cannot see their hand while bidding

The viewer-scoped round snapshot already contains only the authenticated viewer's hand, but the bidding UI does not render it. The hand appears only after the phase changes to `playing`, preventing the player from making an informed estimate.

## Goals

1. Keep active control synchronized with every accepted human bid and human card play.
2. Make human action completion idempotent and recoverable after retries or network interruption.
3. Preserve existing bot directive behavior and private-state isolation.
4. Show the viewer's own hand during bidding as read-only cards.
5. Avoid schema changes unless implementation evidence proves they are necessary.
6. Preserve the separate score UAT environment and deployment boundaries.

## Non-Goals

- No redesign of Estimation bidding rules.
- No change to bot policy or bot decision quality.
- No multi-round tournament flow change.
- No refresh/navigation continuity fix in this delivery.
- No score-UAT migration, Vercel deployment, or score project change.
- No exposure of other players' hands, deck order, seeds, nonces, or future cards.

## Recommended Architecture

### 1. Server-side orchestration for accepted human actions

`gameplay-round-command` remains the single browser-facing command endpoint for human bids and card plays.

For `submit-bid` and `play-card`:

1. Validate the authenticated actor and command input as today.
2. Execute the round command through `GameplayRoundApplicationService`.
3. If the round command is rejected, return the existing failure without changing active control.
4. If the round command is accepted, derive the next authoritative turn from the committed viewer-scoped round snapshot.
5. Complete the active-control action boundary through `complete_active_action_boundary`.
6. Use a deterministic completion command ID derived from the human round command ID, for example `human-complete:<round-command-id>`.
7. Return success only after the boundary is complete or an idempotent duplicate is confirmed.

This keeps round mutation and active-control advancement inside one server request. It removes the browser as the coordinator between two state machines.

### 2. Recovery and idempotency

The endpoint must tolerate a retry after the round command was committed but before its active-control boundary completed.

Required behavior:

- Reusing the same human round command ID with the same payload must reload the accepted round result rather than applying the bid or card twice.
- Reusing the deterministic boundary command ID must be accepted as an idempotent duplicate when the payload matches.
- If the round command is already committed and the boundary is still incomplete, the endpoint must complete the boundary and return the current scoped round snapshot.
- A conflicting command ID or conflicting boundary payload must remain rejected.

### 3. Next-turn derivation

The next active-control turn is derived only from the committed round snapshot:

- bidding: `nextBidSeat`, action kind `bid`;
- playing: `currentTurnSeat`, action kind `card`;
- scored: no next turn.

The generated active turn ID must continue to use the deterministic round/phase/version/seat pattern already used by bot processing.

### 4. Failure handling

If the round action commits but active-control completion fails transiently:

- return a non-terminal synchronization failure;
- do not submit another round action;
- allow the same command ID to be retried safely;
- preserve enough deterministic identity to complete the missing boundary on retry.

The implementation must not silently report success while active control remains behind the round state.

### 5. Bidding hand visibility

During `bidding`, render `snapshot.ownHand` below the estimate controls.

Behavior:

- cards are visible only to the authenticated viewer through the existing viewer-scoped snapshot;
- cards are read-only during bidding;
- no card is marked legal or clickable before the `playing` phase;
- existing card-play behavior remains unchanged once play begins;
- responsive layout must remain usable on desktop and mobile.

A small reusable hand display component is preferred so bidding and playing share card naming, suit symbols, and accessibility labels without duplicating private-state logic.

## Data Flow

### Human bid

1. Browser sends `submit-bid` with table ID, expected round version, command ID, and bid.
2. Edge Function authenticates the user.
3. Round service validates and commits the bid.
4. Edge Function derives the next bid/card turn from the committed scoped snapshot.
5. Edge Function completes the active-control boundary using `human-complete:<command-id>`.
6. Edge Function returns the updated scoped round snapshot.
7. Realtime publishes round and active-control invalidations as before.

### Human card play

The same flow applies, with a card command and next card turn or scored state.

## Security and Isolation

- Service-role credentials remain server-side.
- Browser requests continue to contain only public command input plus the authenticated viewer's own bid or card choice.
- Responses remain viewer-scoped.
- No other player's hand may be returned.
- No prohibited fields may be exposed: full hands, seeds, nonces, shuffled deck, deck order, or future cards.
- Deployments must use the existing guarded wrappers and exact tested SHA.
- Supabase target must remain `stedjwppoanbmhxsfhcg`.
- JWT verification must remain enabled.
- The score UAT project and checkout remain untouched.

## Test Design

### RED tests for human boundary synchronization

Add focused tests that prove current behavior is incomplete:

1. Accepted human bid triggers deterministic `complete_active_action_boundary` with the next authoritative turn.
2. Accepted human card triggers the same boundary completion.
3. Scored round completes the boundary with no next turn.
4. Rejected round action does not complete active control.
5. Duplicate accepted round command completes a previously missing boundary without applying the round action twice.
6. Conflicting duplicate command remains rejected.
7. Boundary failure returns a retryable synchronization error and does not report success.
8. Both maintained Edge Function copies remain equivalent.

### GREEN tests for bidding hand visibility

Add UI tests that verify:

1. The viewer's hand is visible during bidding.
2. Bidding cards are disabled/read-only.
3. Only the viewer's hand is rendered.
4. Existing playing-phase legal-card interaction still works.
5. Accessible card names remain present.

### Full verification

Before any deployment:

- focused tests pass;
- `npm run ci` passes;
- `npm run ci:isolation` passes;
- GitHub CI passes on the exact pushed SHA;
- PR #14 remains draft, open, and unmerged.

## Delivery Sequence

1. Add RED regression tests for missing human action-boundary completion.
2. Implement the minimum server-side orchestration change in both maintained `gameplay-round-command` copies.
3. Run focused and full local verification.
4. Commit, push, and verify hosted CI.
5. Deploy only `gameplay-round-command` through the guarded wrapper.
6. Create a fresh hosted UAT table and verify bid-to-card synchronization.
7. Add bidding hand visibility and UI tests as a separate frontend commit.
8. Run full verification again.
9. Deploy only the gameplay Vercel project after explicit approval.
10. Resume complete solo start-to-score UAT.

## UAT Acceptance Criteria

### Synchronization

- A human bid advances both round state and active control exactly once.
- A human card play advances both state machines exactly once.
- The next bot acts automatically without stale-seat errors.
- No accepted `BEGIN_BOT_ACTION` remains unmatched because of a prior human action.
- Retrying the same human command is idempotent.

### Bidding hand

- The human player sees all 13 of their own cards while bidding.
- The cards are not clickable during bidding.
- No other private hand is visible in the UI or response payload.

## Preserved Evidence

`Solo UAT Bot Retest 4` remains untouched as diagnostic evidence. It must not be refreshed, repaired manually, reused, paused, closed, or deleted during implementation.

## Deferred Backlog

Refresh/navigation continuity remains a separate defect: the active route and table ID are held only in React state and are lost on browser reload. That work is intentionally excluded from this correction so synchronization and bidding-hand behavior can be verified independently.
