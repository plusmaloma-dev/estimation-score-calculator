# Mobile Landscape and Number Picker Design

**Date:** 2026-07-23

**Status:** Approved design amendment

**Applies to:** React/Vite score-sheet entry in local-browser and online UAT modes

## 1. Purpose

The score sheet is too dense for useful portrait entry on a phone, and the
mobile system keyboard obscures the table while estimates and actual tricks
are entered.

The active score sheet will therefore require landscape orientation on mobile
or touch-tablet devices. Estimate and actual-trick entry will use a compact,
centered number picker that does not summon the system keyboard.

This amendment changes only mobile score-sheet presentation and numeric entry.
All bidding, Hold, Risk, scoring, persistence, lifecycle, and locking rules
remain unchanged.

## 2. Orientation Experience

Portrait orientation remains supported for:

- sign-in;
- workspace and game lists;
- shared-player management;
- new-game setup;
- all other non-score-sheet screens.

When an active score sheet is shown on a device whose primary pointer is
coarse, portrait orientation displays a full-screen gate instructing the user
to rotate the device to landscape.

The gate:

- appears above the active score sheet and prevents interaction beneath it;
- does not attempt to rotate or lock the operating system orientation;
- does not unmount or recreate the score sheet;
- preserves unsaved estimates, actual tricks, Hold flags, and other draft
  state;
- disappears immediately when the device returns to landscape;
- closes an open number picker without changing its selected field value.

A portrait desktop browser window is not blocked because the gate applies only
when the device reports a coarse primary pointer.

## 3. Mobile Numeric Entry

On a coarse-primary-pointer device, editable estimate and actual-trick fields
are rendered as input-styled buttons. Tapping one opens the in-app number
picker and never focuses a numeric text input, so the system keyboard is not
requested.

Desktop and fine-primary-pointer devices retain the existing numeric inputs
and keyboard entry.

The picker supports both entry types:

- estimates offer the integers `0` through `12`;
- actual tricks offer the integers `0` through `13`.

The existing validation remains authoritative. In particular, individual
estimates still cannot exceed `12`, all four estimates still cannot total
`13`, and all four actual-trick values must total `13`.

## 4. Centered Picker Interaction

The picker appears in the center of the viewport as a compact dialog, no wider
than the available landscape viewport. It uses a two-row number grid where
space permits and touch targets large enough for reliable phone use.

The backdrop lightly dims the score sheet without hiding it. The dialog
heading identifies the selected player and field, for example:

`Rami — Actual tricks`

Interaction rules:

- tapping a number applies it through the existing reducer action and closes
  the picker immediately;
- **Clear** changes the field to blank and closes the picker;
- **Cancel**, tapping the backdrop, or a supported dialog-cancel action such
  as Escape or Android Back closes the picker without changing the field;
- the current value, when present, is visibly selected;
- only one picker can be open at a time;
- disabled, accepted, completed, or otherwise read-only fields cannot open
  the picker;
- accepting estimates, saving a round, changing to a read-only state, or
  leaving the score sheet closes the picker;
- no browser-history entry is added solely to manage the picker.

Trump selection remains the existing compact suit selector. The manual `H`
control remains a separate toggle beside eligible estimate fields.

## 5. Components and State Boundaries

`MobileLandscapeGate` owns only mobile portrait detection and the blocking
presentation. It wraps or overlays the active score-sheet content without
owning game state.

`NumberPickerDialog` is a reusable controlled component. It receives:

- an accessible title;
- the current value;
- the maximum allowed value (`12` or `13`);
- callbacks for selection, clearing, and cancellation.

It does not know about players, bidding, scoring, local storage, Supabase, or
game lifecycle.

`CurrentRoundRow` owns the transient identity of the field being edited:

- player ID;
- player name;
- entry type (`estimate` or `actual`);
- current value.

Picker selection and clearing dispatch the existing `set-estimate` or
`set-actual` action. This preserves one reducer and one validation path across
desktop keyboard entry, mobile picker entry, local-browser mode, and online
mode.

Mobile-entry detection is isolated behind a small media-query hook so
components and tests do not duplicate browser-query logic.

## 6. State and Data Flow

The entry flow is:

1. The user taps an editable mobile estimate or actual-trick field.
2. `CurrentRoundRow` records the target field and opens the controlled picker.
3. The user selects a number or clears the value.
4. `CurrentRoundRow` dispatches the existing reducer action.
5. The picker closes.
6. Existing bidding, validation, scoring, and save logic consume the updated
   draft exactly as they do for desktop keyboard entry.

The picker state is transient UI state only. It is never serialized to local
storage or Supabase. Saved rounds and `get_game_snapshot` require no schema,
RPC, or mapping changes.

## 7. Accessibility and Error Handling

The picker exposes dialog semantics, an accessible title, predictable focus,
and a visible focus indicator. Number buttons announce their values, the
current value exposes selected state, and **Clear** and **Cancel** have explicit
accessible names.

When opened, focus moves into the dialog. When cancelled, focus returns to the
field trigger when it still exists and remains enabled.

Picker choices prevent out-of-range entry, but reducer validation remains in
place as a safety boundary. An orientation change, lifecycle update, or
read-only transition closes the picker safely without applying a value.

If media-query APIs are unavailable, the application falls back to the
existing desktop numeric inputs and does not show the orientation gate.

## 8. Verification

Automated tests must prove:

- mobile portrait blocks only the active score sheet;
- rotating to landscape reveals the same mounted score-sheet draft;
- portrait desktop and non-score-sheet screens remain usable;
- mobile estimate fields open a centered `0`–`12` picker without focusing a
  numeric input;
- mobile actual fields open a centered `0`–`13` picker;
- selection, current-value styling, clearing, cancellation, backdrop clicks,
  and Escape behave correctly;
- disabled and read-only fields cannot open the picker;
- desktop keyboard entry remains supported;
- manual Hold, trump selection, estimate acceptance, actual validation, local
  saving, online saving, and snapshot restoration remain unchanged;
- the complete `npm run ci` command passes.

Live UAT on the stable deployment must verify:

1. portrait phone emulation shows the score-sheet rotation gate;
2. landscape phone emulation shows the score sheet;
3. estimate and actual fields use the centered picker and do not request the
   system keyboard;
4. the picker remains usable without hiding the overall score-sheet context;
5. a round entered with the picker saves and reloads through
   `get_game_snapshot`;
6. manual Hold entry continues to work beside the picker-driven estimate
   controls.

Physical-device confirmation remains advisable because desktop emulation
cannot fully reproduce every mobile browser's keyboard and orientation
behavior.

## 9. Delivery Order

The approved manual Hold amendment is implemented first. The mobile landscape
and number-picker change follows it because both touch `CurrentRoundRow`.

After both changes:

1. run the complete CI gate;
2. deploy a new Vercel Preview;
3. update the stable UAT alias;
4. smoke-test manual Hold and mobile entry;
5. resume the paused Round 18 lifecycle and edit-lock smoke tests.

## 10. Non-Goals

This amendment does not:

- force operating-system orientation or require PWA installation;
- replace text entry on sign-in, player, game, or override forms;
- change desktop numeric-entry behavior;
- change estimate or actual-trick ranges;
- change trump, Hold, WITH, Risk, scoring, lifecycle, locking, authentication,
  workspace, or membership rules;
- change database tables, migrations, RPC signatures, or online snapshot
  structure;
- redesign the historical score table.
