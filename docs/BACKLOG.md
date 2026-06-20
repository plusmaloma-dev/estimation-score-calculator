# Backlog

## MVP Epics

### EPIC-1 Match Management
- Create a new Estimation match.
- Add exactly 4 players.
- Select 18 or 24 rounds.

### EPIC-2 Bidding Engine
- Enter bids for each player.
- Support suit hierarchy: No Trump > Spades > Hearts > Diamonds > Clubs.
- Detect highest bidder and round contract.

### EPIC-3 Validation Engine
- Validate total estimates cannot equal 13.
- Classify each round as Over or Under.
- Validate actual tricks won equals 13.

### EPIC-4 Score Engine
- Calculate score by selected scoring profile.
- Support configurable Dash, Dash Call, and 8+ contract scoring rules.

### EPIC-5 Leaderboard and History
- Show running total score.
- Show round history.
- Allow previous round edits and full recalculation.

### EPIC-6 Research and Rules Governance
- Use Egyptian Estimation Federation as the primary source.
- Document unresolved scoring variations.
- Keep Planning Poker out of scope.

### EPIC-7 CI/CD and DevOps
- Run CI on pull requests and pushes to main.
- Install dependencies.
- Run type checking.
- Run lint script.
- Run tests.
- Run build validation.
- Add deployment workflow after hosting target is selected.

## Current Priority
1. Confirm scoring formulas for normal bids.
2. Confirm Dash and Dash Call behavior.
3. Confirm scoring for contracts 8 and above.
4. Build the score engine as a configurable module.
5. Add first implementation tests for bidding and validation.
