# Bidding, WITH/Hold, Risk, and Score Overrides Delivery Report

**Date:** 2026-07-22  
**Branch:** `feature/react-vite-frontend-prototype`  
**Pull request:** #11 — Build React Vite frontend prototype  
**Design:** `docs/superpowers/specs/2026-07-22-bidding-with-hold-risk-and-score-overrides-design.md`  
**Plan:** `docs/superpowers/plans/2026-07-22-bidding-with-hold-risk-and-score-overrides.md`

## Delivered behavior

- Stores the bid winner/trump caller as an explicit identity instead of re-deriving ownership from equal estimates.
- Keeps trump with the original bid winner when one or more WITH players follow a raise.
- Transfers ownership only after a strict overbid and requires the new owner to select trump.
- Supports multiple active WITH players.
- Requires every active WITH player to choose Follow or Hold after the owner raises.
- Keeps a Hold player's previous estimate, displays `H`, and applies normal-player scoring.
- Excludes Hold players from the active-WITH multiplier count and the Risk-candidate sequence.
- Resolves Risk from the finalized owner-anchored sequence, not the dealer position.
- Applies the approved Risk thresholds: Under at total estimates `<= 11`; Over at total estimates `>= 15` with the candidate estimate `>= 2`.
- Applies the multiple-WITH `x2` modifier to all four players as the final scoring step, including high-contract paths.
- Persists finalized owner, trump, W/H statuses, Risk, and the multiple-WITH multiplier.
- Adds completed-round `Edit scores` with a mandatory reason.
- Preserves immutable calculated scores and stores applied scores separately.
- Appends audit records with calculated, previous-applied, new-applied, reason, timestamp, and actor.
- Supports restoring the calculated score through another audited adjustment.
- Rebuilds downstream cumulative totals, leaderboard, analytics, and reopened sessions from applied scores.
- Preserves score overrides and applied results through in-memory, local-storage, document-store, and backup export/import boundaries.
- Displays `Edited` markers and accessible calculated-versus-applied score text.
- Preserves the proportional fit-to-screen score-sheet layout without horizontal scrolling.

## TDD and CI evidence

| Slice | Red CI | Green CI |
| --- | ---: | ---: |
| Explicit bidding state | 512 | 514 |
| Reducer integration | 515 | 516 |
| Follow/Hold UI | 517 / 518 | 519 |
| Hold and multiple-WITH scoring | 521 | 527 |
| Frozen round serialization | 528 | 531 |
| Score override service | 532 | 535 |
| Override persistence | 536 | 539 |
| Browser override workflow | 540 | 541 |
| Override dialog | 542 | 544 |
| Table edit action and marker | 545 | 546 |
| Screen integration | 547 | 548 |
| Responsive and view-model regressions | — | 550 |
| Backup audit round-trip | — | 551 |

## Requirement verification

| Requirement | Evidence |
| --- | --- |
| Stable owner and trump across matching raises | `biddingState.test.ts`, `currentRoundReducer.test.ts`, `CurrentRoundRow.test.tsx` |
| Strict overbid ownership transfer | `biddingState.test.ts` |
| Multiple WITH and Follow/Hold | bidding-state, reducer, and component tests |
| Hold receives normal scoring | `roundEstimateValidation.test.ts` |
| Hold excluded from Risk and x2 count | bidding-state and current-row tests |
| Owner-based Risk sequence and thresholds | bidding-state, reducer, and screen serialization tests |
| Multiple-WITH x2 applied last | `multipleWithScoring.test.ts` |
| Frozen metadata persisted | score-sheet screen and browser-shell tests |
| Audited override and restore | `scoreOverrideService.test.ts`, `browserScoreOverride.test.ts` |
| Applied totals and rankings | score-override service and browser tests |
| Persistence and legacy compatibility | `scoreOverridePersistence.test.ts` |
| Backup/export preservation | `scoreOverrideBackup.test.ts` |
| Edit UI, reason validation, marker | dialog, table, screen, and view-model tests |
| Responsive fit-to-screen layout | `ScoreSheetTable.test.tsx` and `app.css` |

## Remaining prototype scope outside this delivery

- Federation all-pass/redeal entry controls in the React score sheet.
- Wiring the existing History and New Round header actions to their final navigation flows.
- Full export and analytics actions in the React interface.
- Final accessibility review and production release preparation.

This delivery remains on the draft frontend prototype pull request and is not merged into `main`.
