# React/Vite Frontend Prototype Design

## Goal

Build a working, mobile-first browser application for the Egyptian Estimation score calculator using the existing framework-neutral scoring and browser-shell services.

The app must support live score entry around a card table while preserving the familiar Estimation score-sheet layout:

- Players are columns.
- Rounds are rows.
- Previous rounds remain visible.
- The current round is editable in place.
- The bid winner shows the selected trump beside the estimate.
- Actual tricks produce calculated round scores.
- Cumulative scores and ranking titles update after every saved or edited round.

The first prototype is bilingual, defaults to English, supports Arabic RTL through a language switch, and persists sessions in browser local storage.

## Product Decisions

### Form factor and navigation

- Mobile-first responsive web app.
- English is the default language.
- Arabic is available through an explicit language switch and uses RTL layout.
- First launch opens a session home screen rather than forcing immediate game setup.
- The home screen provides:
  - Start a new game.
  - Continue recent games.
  - Import backup.
  - Open scoring rules.

### Ranking titles

Players are ranked by current cumulative score:

1. KING — highest score.
2. Sub-King — second highest.
3. Sub-Kooz — third highest.
4. Kooz — lowest score.

The approved visual treatment uses:

- KING: gold circular badge with the KING hand icon.
- Sub-King: silver circular badge with the same hand icon.
- Sub-Kooz: beige circular badge with a dark horizontal cup/jug mark.
- Kooz: charcoal circular badge with a light horizontal cup/jug mark.

Ranking badges move automatically when cumulative totals change.

## Scope

### Included

- React and Vite application shell.
- Responsive mobile and landscape score-sheet views.
- English and Arabic translation dictionaries.
- RTL direction switching.
- Four-player score-sheet creation.
- House Rules V1 or Federation 2026 selection before game creation.
- Recent-session home screen.
- Federation auction pass/bid entry and all-pass redeal guidance.
- Round estimate entry.
- Bid-winner and trump selection.
- Risk, multiplied Risk, and With annotations.
- Actual-trick entry and validation.
- Round score calculation through the existing framework-neutral services.
- Previous-round history in the main score table.
- Running cumulative totals and ranking badges.
- Dedicated Over/Under column.
- Completed-round editing and controlled manual score overrides.
- Local-storage persistence and recovery.
- Existing summary, leaderboard, analytics, backup, and export actions exposed through the UI where supported by the browser shell.

### Outside the first prototype

- User accounts or cloud synchronization.
- Real-time multiplayer networking.
- Card dealing or shuffling simulation.
- Push notifications.
- Native iOS or Android packaging.
- Remote database storage.

## Architecture

### Application structure

Add a Vite-powered React application while preserving the existing framework-neutral TypeScript engine.

Recommended structure:

```text
src/
  app/
    App.tsx
    routes.ts
    i18n/
    state/
    components/
    screens/
      HomeScreen.tsx
      NewGameScreen.tsx
      ScoreSheetScreen.tsx
      RoundEditDialog.tsx
      AnalyticsScreen.tsx
  domain/
  scoring/
  services/
  browser/
```

The React layer must not reproduce scoring formulas. It calls the existing browser-shell boundary and renders returned validation and score results.

### State management

Use a small application store based on React context and reducer functions. A separate state library is unnecessary for this prototype.

The store owns only UI state:

- Active score-sheet id.
- Current language.
- Open dialog or drawer.
- Draft auction actions.
- Draft estimates and actual tricks.
- Pending validation messages.

Persisted game state remains owned by the existing browser repository and browser-shell services.

### Persistence

Use the existing local-storage repository implementation.

The UI must:

- Reopen the most recent game after navigation.
- List saved games on the home screen.
- Preserve the locked rule set.
- Preserve completed rounds and score overrides.
- Avoid saving incomplete current-round drafts as completed rounds.

## Main Score-Sheet Design

### Table orientation

The main table uses:

```text
Round | Player 1 | Player 2 | Player 3 | Player 4 | O/U
```

Each player column contains four subcolumns:

```text
Estimate | Actual | Round Score | Total Score
```

The round column stays visible. Player headings remain sticky. On narrow mobile screens, the player area scrolls horizontally without hiding the round number.

### Player header

Each player heading shows:

- Ranking icon and title.
- Player name.
- Current cumulative total.

### Completed round rows

Each completed round shows:

- Estimate.
- Actual tricks.
- Calculated or applied round score.
- Cumulative total after that round.
- Green upward indicator for a successful estimate.
- Red downward indicator for a failed estimate.

Only the bid winner displays the trump marker beside the estimate:

```text
5♠
4♥ 2R W
6 NT
```

Supported annotations:

- `R` — Risk.
- `2R`, `3R`, and higher — multiplied Risk.
- `W` — With.
- Combined annotations are shown together, for example `4♥ 2R W`.

### Over/Under column

A dedicated O/U column displays:

```text
total player estimates - 13
```

Examples:

- Total estimates 14 → `+1`.
- Total estimates 12 → `-1`.
- Total estimates 16 → `+3`.

`0` is invalid because total estimates must never equal 13.

### Current round row

The current round is the final highlighted row.

It shows:

- Round number.
- Current dealer.
- Editable estimates.
- Bid-winner trump beside the winning estimate.
- Risk and With annotations.
- Editable actual-trick inputs.
- Placeholder round scores until calculation.
- Existing cumulative totals until save.

After all actual tricks are entered and validated:

1. The UI calls the scoring service.
2. Round scores appear in the same row.
3. The user confirms save.
4. The row becomes read-only.
5. Cumulative totals and ranking badges update.
6. A new current-round row is created.

Dealer rotation is derived from player order and round number. For the approved sample order, Round 11 shows Rami as dealer.

### Federation all-pass

When four players pass:

- Show `Redeal required`.
- Keep the same dealer.
- Keep the same round number.
- Do not add a score row.
- Clear the cancelled auction attempt and start a fresh auction.

## Round Editing and Manual Score Overrides

### Purpose

A completed round can be edited when a missing rule or ad-hoc table decision requires a manual score correction.

This feature must not permit direct cumulative-total editing.

### Edit flow

Each completed round row provides an Edit action. The edit dialog shows:

- Original estimates, actual tricks, trump, Risk, and With details.
- Originally calculated score for each player.
- Optional applied-score override for selected players.
- Required reason when any override differs from the calculated score.
- Save and recalculate action.
- Restore calculated score action.

Unchanged players retain their calculated scores.

### Override model

Store override metadata separately from the original calculated value:

```ts
interface PlayerRoundScoreOverride {
  readonly playerId: string;
  readonly calculatedScore: number;
  readonly appliedScore: number;
  readonly reason: string;
  readonly changedAt: string;
}
```

The applied score is used for game totals, leaderboard, analytics, and exports. The original calculated score remains available for audit and restoration.

### Recalculation

After saving an override:

1. Recompute the edited round's applied results.
2. Recompute cumulative totals for the edited round and every later round.
3. Recompute current KING, Sub-King, Sub-Kooz, and Kooz positions.
4. Refresh leaderboard and analytics.
5. Persist the override metadata and updated derived result.

Later rounds retain their own round scores; only their cumulative totals are recalculated.

### Audit visibility

An overridden round displays a visible marker. Details show:

```text
Calculated: +14
Applied: +12
Reason: Missing house rule
Changed: <timestamp>
```

CSV and backup exports must identify overridden values and preserve the reason.

## Validation and Error Handling

### New game

- Exactly four unique, non-empty player names.
- Rule set selected before creation.
- Rule set becomes locked after creation.

### Estimates

- Four estimates are required.
- Total estimates must not equal 13.
- Trump is required for the bid winner when the bid type requires it.
- Risk and With inputs follow the selected rule set.

### Actual tricks

- Four actual-trick values are required.
- Actual tricks must total 13.
- Scores are not saved until validation succeeds.

### Overrides

- Applied score must be an integer.
- A reason is required when applied score differs from calculated score.
- Empty or unchanged overrides are normalized back to the calculated score.
- Invalid edits do not modify persistence.

Errors appear inline near the affected cell and in an accessible summary above the current row or edit dialog.

## Internationalization and Accessibility

- English strings are the default.
- Arabic translations cover navigation, game setup, score sheet, validation, analytics, and exports.
- The document `dir` changes between `ltr` and `rtl`.
- Suit symbols are paired with accessible text labels.
- Ranking and success/failure information is never communicated through color alone.
- Interactive controls meet mobile touch-target sizing.
- Table headers and edit dialogs use semantic HTML and keyboard focus management.

## Responsive Behavior

### Mobile portrait

- Sticky round column.
- Horizontally scrollable player columns.
- Sticky player headings.
- Current-round controls remain reachable below the table.
- Compact labels with accessible expanded text.

### Landscape and desktop

- Full four-player score sheet visible when width permits.
- Previous rounds remain visible in one continuous table.
- Current-round action panel remains aligned with the highlighted row.

## Testing

### Component tests

Cover:

- Home screen recent-session rendering.
- Four-player setup and rule-set locking.
- Language switching and RTL direction.
- Ranking-badge ordering.
- Trump and annotation rendering.
- O/U calculation and zero rejection.
- Current-row validation states.
- Federation all-pass redeal state.
- Round-edit dialog and required reason.

### Integration tests

Cover:

- Create, save, reopen, and continue a score sheet.
- Save a valid round and display it in history.
- Recalculate totals and rankings after each round.
- Apply one-player and multi-player score overrides.
- Recalculate all following cumulative totals after an override.
- Restore calculated scores.
- Preserve override audit metadata after reload and export.
- Confirm House Rules V1 and Federation 2026 remain isolated.

### Regression verification

Run the complete project command:

```bash
npm run ci
```

The frontend build, component tests, and all existing framework-neutral scoring tests must pass.

## Delivery Slices

### Slice 1 — Application foundation

- React/Vite setup.
- English/Arabic switching and RTL.
- Local-storage session home.
- New-game setup.

### Slice 2 — Live score sheet

- Player-column/round-row table.
- Current-round estimates and actual tricks.
- Trump, Risk, With, O/U, validation, save.
- Federation all-pass handling.
- Ranking badges and cumulative totals.

### Slice 3 — Round editing and completion

- Manual score overrides and audit metadata.
- Downstream cumulative recalculation.
- Analytics and export integration.
- Responsive polish and accessibility verification.

## Acceptance Criteria

The prototype is complete when:

1. A user can create or reopen a four-player score sheet from the session home.
2. English is the default and Arabic RTL can be selected.
3. Players are columns and previous rounds remain visible as rows.
4. The current round is editable in place.
5. The bid winner displays trump beside the estimate.
6. Risk, multiplied Risk, and With annotations are displayed beside estimates.
7. The O/U column shows total estimates minus 13 and rejects zero.
8. Actual tricks calculate and save round scores through the existing scoring engine.
9. Cumulative totals and ranking badges update after every saved round.
10. Federation all-pass cancels the deal without adding a round and retains dealer and round number.
11. A completed round can receive selected-player manual score overrides with a required reason.
12. Editing a past round recalculates all later cumulative totals and rankings.
13. Original calculated scores remain auditable and restorable.
14. Local-storage recovery, backup, analytics, and exports remain compatible.
15. Existing House Rules V1 and Federation 2026 backend tests remain green.
