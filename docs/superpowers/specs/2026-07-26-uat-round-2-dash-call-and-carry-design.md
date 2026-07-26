# UAT Round 2: Dash Call and Authoritative Carry Design

**Date:** 2026-07-26
**Status:** Approved by the attached UAT Round 2 implementation request
**Source branch:** `feature/react-vite-frontend-prototype`
**Implementation branch:** `fix/uat-round-2-findings`
**Related draft PR:** #11

## Purpose

Close the two consolidated UAT Round 2 findings without redesigning the score sheet:

1. expose the existing House Rules V1 Dash Call contract in the React UAT flow and preserve its identity through every projection;
2. persist all-loser carry scores as authoritative calculated scores so they are never mistaken for manual overrides.

## Dash Call

Dash Call is a pre-bidding declaration by one player. The declared player has a zero-trick estimate and a `dash-call` bid type. It is distinct from ordinary Dash and from round Risk.

- The declaration is accepted only before any normal estimate has been entered.
- At most one player may declare Dash Call in a round.
- The declared player remains fixed at zero tricks.
- The declaration remains visible during bidding and in the saved round.
- A declaration is never silently reduced to `dash` or overwritten by `round-risk`.
- When the same player is also the round Risk taker, both `dash-call` and `round-risk` classifications are retained.

The existing scoring pipeline remains authoritative:

- success: `+35` before valid modifiers;
- failure: `-delta - 25` before valid modifiers.

The UI sends a normal round input containing `bidType: "dash-call"`; it does not calculate Dash Call scores.

## Classification Projection

`PlayerScoreResult.riskType` remains the backward-compatible primary classification. A new additive `riskTypes` projection carries all simultaneously applicable classifications. Existing documents that only contain `riskType` normalize to a one-item classification set.

For online data, the bid classification is reconstructed from `round_bids.bid_type` and combined with the persisted score `risk_type`. This avoids a destructive schema change while retaining both Dash Call and round Risk.

All history, summary, analytics, backup, and export readers use the normalized classification set. The persisted bid remains the source of truth for Dash/Dash Call identity.

## Authoritative All-Loser Carry

The game-level calculation remains the source of carry behavior:

- an all-loser round applies zero to all four players;
- one pending all-loser round applies x2 to the next eligible scored round;
- two consecutive all-loser rounds apply x4;
- the eligible scored round consumes the carry exactly once.

The online save path must calculate the complete chronological game, select the new authoritative round result, and persist that result. Both `calculated_score` and `applied_score` are initially the authoritative carried score. A row in `score_overrides` is created only after an explicit user edit.

The attached Round 2 instruction supersedes the older carry design for high contracts: existing high-contract carry exclusions remain unchanged. A high-contract round must neither display a false edit nor acquire a carry multiplier that the established House Rules tests exclude.

## Backward Compatibility

- Legacy score results without `riskTypes` normalize from `riskType` and the stored bid type.
- Existing saved inputs are replayed chronologically to derive carry metadata.
- Existing explicit score overrides remain separate and continue to produce the Edited marker and Restore Original action.
- No destructive migration is required.

## Acceptance

- Dash Call is selectable only before bidding, fixes the declared estimate at zero, scores through the existing engine, and survives save/reload/backup/export.
- Dash Call and round Risk coexist in history, summary, analytics, and exports.
- x2/x4 carry scores are persisted and reloaded as original system calculations.
- No override, audit entry, Edited marker, or Restore Original state appears without a user edit.
- Explicit manual edits retain the existing override behavior.
- High-contract exclusions remain covered.
- Focused regressions and the complete `npm run ci` command pass.
