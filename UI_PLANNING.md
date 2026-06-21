# Browser and Mobile UI Planning

Status: planning artifact for US-213.

The MVP scoring engine is complete. This document defines the smallest useful browser or mobile score-sheet experience around the validated Egyptian Estimation services.

## Scope

The UI is a score-calculation app for Egyptian Estimation. It is not a full gameplay app and does not simulate tricks or cards. It should help players enter bids, actual tricks, optional scoring roles, and then view round scores, balances, leaderboard, statistics, and backups.

## Screen Map

### 1. Game Setup

Purpose: create a score sheet.

Inputs:

- Score-sheet name.
- Four player names.
- Optional scoring profile selection.

Outputs:

- Empty score sheet ready for round entry.

Validation:

- Exactly four players are required.
- Player names must be non-empty and unique.

### 2. Round Entry

Purpose: capture one Egyptian Estimation round.

Inputs:

- Round number.
- Bid owner.
- Bid order or risk taker.
- Optional round multiplier carried from a prior all-loser round.
- For each player:
  - Bid type: normal, Dash, Dash Call, WITH.
  - Estimated tricks.
  - Trump suit for normal/WITH contracts.
  - WITH target when bid type is WITH.
  - Actual tricks.

Immediate validation:

- Exactly four bids and four actual results are required.
- Total estimates must not equal 13.
- Total estimates below 13 produce Under.
- Total estimates above 13 produce Over.
- Actual tricks must total 13.
- Dash and Dash Call estimates must be 0.
- Normal and WITH contracts must be between 4 and 13.
- Normal and WITH bids require a valid trump suit.
- WITH must reference the bid owner.

### 3. Round Result

Purpose: explain calculated scores before saving the round.

Outputs:

- Round type: Under or Over.
- Per-player score.
- Delta between estimate and actual tricks.
- Success or failure.
- Role metadata: bid owner, WITH player, risk taker.
- Risk type and risk modifier.
- Next-round multiplier when all players lose.
- Human-readable notes from the scoring engine.

Actions:

- Save round.
- Edit round.
- Cancel.

### 4. Score Sheet / Round History

Purpose: show the running game state.

Outputs:

- All saved rounds.
- Per-round scores.
- Running balances.
- Current leaderboard.
- Indicators for Dash, Dash Call, WITH, Risk, Double Risk, and all-loser multiplier.

Actions:

- Add next round.
- Edit existing round.
- Delete round with confirmation.
- Finalize score sheet.

### 5. Statistics

Purpose: summarize player performance.

Outputs:

- Rounds played.
- Successful and failed rounds.
- Exact bid rate.
- Average score.
- Highest and lowest score.
- Dash successes and failures.
- Dash Call successes and failures.
- WITH rounds.
- High-contract rounds.

### 6. Import and Export

Purpose: backup and restore score sheets.

Actions:

- Export JSON backup using the existing backup service.
- Import JSON backup through validation before accepting.
- Show import validation errors clearly.

## UI to Engine DTO Mapping

### Round Entry to `MvpRoundInput`

- UI round number maps to `roundNumber`.
- UI player bid rows map to `bids`.
- UI actual trick rows map to `actualResults`.
- UI scoring profile maps to `profile`.
- UI carried multiplier maps to `roundMultiplier`.
- UI risk taker maps to `riskPlayerId`.
- UI bid owner maps to `bidOwnerPlayerId`.

### Game State to `MvpGameInput`

- UI player order maps to `playerOrder`.
- Saved rounds map to `rounds`.

### Saved Score Sheet to Persistence DTO

- UI score-sheet title maps to `name`.
- UI game input maps to `gameInput`.
- Calculated result maps to `gameResult`.
- Status maps to draft or finalized.

## Recommended First Storage Choice

Start with browser local storage for a browser/mobile prototype.

Reasoning:

- The repository already has an in-memory boundary.
- A local-storage adapter can satisfy the same score-sheet repository contract.
- No database or API is required for the first usable UI.
- Export/import already provides backup and restore.

## Proposed Next Implementation Slice

US-213A: Local-storage score-sheet repository adapter.

Acceptance criteria:

- Implements the existing `ScoreSheetRepository` interface.
- Uses one namespaced local-storage key.
- Supports save, update, list, get, and delete.
- Handles missing or corrupt stored data safely.
- Includes tests using an injected storage-like object instead of browser globals.

US-213B: Browser UI shell.

Acceptance criteria:

- Can create a four-player score sheet.
- Can enter a valid round and calculate results using `EstimationMvpService`.
- Shows validation messages before saving invalid rounds.
- Can show leaderboard and round history.
- Can export a JSON backup.

## Out of Scope for First UI Slice

- Full card gameplay simulation.
- Real-time multiplayer.
- Authentication.
- Server database.
- Any non-Egyptian Estimation estimation workflow.
