# UAT Round 2 Follow-up Design

**Date:** 2026-07-26
**Status:** Approved through consolidated UAT feedback
**Branch:** `fix/uat-round-2-findings`
**Draft PR:** #15

## Objective

Close two remaining UAT gaps without changing the approved scoring rules:

1. make the player's estimate the obvious quick choice while entering actual tricks on mobile; and
2. ensure an all-loser carry result is treated as an authoritative system score, never as an edit, including for rounds stored by the earlier UAT build.

## Actual-tricks estimate suggestion

`CurrentRoundRow` will pass the selected player's accepted estimate to
`NumberPickerDialog` only when the dialog is entering actual tricks.

The matching number will:

- have a distinct suggested-value visual treatment;
- expose an accessible “matches estimate” description;
- receive initial focus when there is no existing actual value; and
- remain a suggestion only—opening the picker will not select or save it.

An existing actual value remains the selected value. If it differs from the estimate,
the existing actual and the estimate suggestion remain visually distinguishable.
Estimate-entry pickers are unchanged.

## Authoritative carry reconciliation

The online save path will continue to calculate the complete game chronologically and
send the multiplied x2/x4 result to `save_game_round`. The SQL function stores the
incoming score identically as `calculated_score` and initial `applied_score`; it does
not create an override audit row.

When opening a snapshot, the application will reconcile each stored score against the
complete-game calculation:

- if no explicit override audit exists for that round and player, the chronological
  engine result is the authoritative calculated and applied score;
- if an explicit override audit exists, the persisted `applied_score` remains the
  authoritative user-applied value while the engine result remains the original
  calculated value.

This read-time normalization repairs the user-visible history, totals, analytics,
exports, and override classification for legacy UAT rounds that stored an unmultiplied
score without an audit row. It does not manufacture an override or rewrite audit
history. Newly saved rounds must already persist the correct multiplied score.

After reconciliation, a numeric mismatch can only represent a currently applied manual
override. The score-sheet view model will continue to show Edited when the reconciled
applied value differs from the engine result. A restored override retains its immutable
audit history but no longer displays Edited or Restore Original.

## Data and migration decision

No destructive data migration will be added. The existing schema already separates
calculated scores, applied scores, and override audits. Runtime normalization is
backward-compatible and avoids guessing at historical user intent: an existing audit
row always wins as evidence of an explicit edit.

## Test strategy

RED/GREEN coverage will prove:

- the actual picker highlights and focuses the matching estimate;
- a different existing actual remains selected while the estimate remains suggested;
- estimate-entry pickers do not show a suggested actual;
- a legacy unmultiplied carry snapshot with no override audit opens with the x2/x4
  engine result and no Edited/Restore state;
- an active genuine override preserves the applied score and Edited/Restore state;
- a restored genuine override preserves its audit history without remaining Edited;
- the online save payload and SQL contract persist multiplied scores as both calculated
  and applied values without an override row; and
- the full typecheck, engine suite, UI suite, and production build remain green.

## Deployment verification

After PR #15 is updated, deploy the same branch to the existing
`estimation-score-calculator` Vercel project. Open the new preview and verify:

1. the actual-tricks picker highlights the accepted estimate;
2. a newly saved all-loser carry sequence displays x2/x4 without Edited;
3. the previously affected game opens with authoritative carry scores unless it has a
   genuine override audit; and
4. explicit manual edits still show Edited and Restore Original.
