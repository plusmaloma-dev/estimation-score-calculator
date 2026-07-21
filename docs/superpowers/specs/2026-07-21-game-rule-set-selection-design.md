# Game-Level Rule-Set Selection Design

## Status

Approved for implementation by the user on 2026-07-21.

## Goal

Allow a user to select one scoring rule set before creating a game, lock that selection for the game lifetime, automatically resolve the correct scoring strategy, and preserve the selection through persistence and backup/import flows.

## Decisions

- Supported rule sets remain `HOUSE_RULES_V1` and `FEDERATION_2026`.
- Rule-set selection is game-level, not round-level.
- A game cannot mix scoring rule sets across rounds.
- Legacy game inputs and score sheets without a stored selection default to `HOUSE_RULES_V1`.
- House Rules V1 uses the exported `houseRulesV1ScoringProfile`.
- Federation 2026 uses `Federation2026ScoringStrategy` through `ScoringStrategyFactory`.
- Existing caller-supplied round profiles remain accepted for backward compatibility, but the game-level rule set is authoritative when a game is calculated.

## Architecture

### Game input

`MvpGameInput` gains an optional `ruleSet` property. Optionality preserves source compatibility for existing data. A resolver converts a missing value to `HOUSE_RULES_V1`.

### Round calculation

`EstimationMvpService.calculateGame` resolves the game rule set once, then calculates every round using that same rule set. `calculateRound` accepts an optional rule-set override for direct round previews; when omitted it defaults to the round profile or House Rules V1.

A scoring service is created per calculation using `ScoringStrategyFactory`. House mode supplies `houseRulesV1ScoringProfile`; Federation mode preserves the round profile fields needed for threshold/evaluation while attaching `FEDERATION_2026` and using the federation strategy.

### Browser flow

`UiCreateScoreSheetInput` gains an optional `ruleSet`. The browser shell stores the resolved rule set in the newly created `MvpGameInput`. Later rounds inherit the score sheet's game-level rule set; round-entry callers do not select a different rule set.

### Persistence and backup

Repositories already persist `MvpGameInput`, so storing `ruleSet` there automatically covers in-memory, local-storage, and document-store adapters. Backup export clones the game input unchanged. Backup import normalizes legacy score sheets by inserting `HOUSE_RULES_V1` when `gameInput.ruleSet` is absent and rejects unsupported values.

### Results and summaries

`MvpGameResult` includes the resolved `ruleSet` so UI, summaries, analytics, and exports can display which rules produced the scores without recalculating.

## Compatibility

- Existing `MvpGameInput` documents without `ruleSet` remain valid and resolve to House Rules V1.
- Existing direct `calculateRound` callers remain valid.
- Existing round profiles remain structurally valid.
- Federation and House scoring remain isolated by strategy tests.

## Error handling

- Unknown rule-set values are rejected by backup import.
- Browser game creation rejects unsupported values at the service boundary.
- A stored game's rule set cannot be changed through round save operations.

## Tests

Coverage will prove:

1. Legacy games default to House Rules V1.
2. House and Federation game calculations choose different strategies automatically.
3. All rounds in one game use the game-level selection.
4. Browser-created score sheets persist the selection.
5. Saving later rounds preserves the original selection.
6. Backup export/import preserves valid selections.
7. Legacy backup import normalizes to House Rules V1.
8. Unsupported backup rule sets are rejected.
