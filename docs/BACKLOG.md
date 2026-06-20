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

### EPIC-8 Domain Model and Architecture
- Define core MVP entities.
- Define ERD-style relationships.
- Define score engine class model.
- Define validation services.
- Define implementation module structure.

## Implementation-Ready User Stories

### US-201 Bid validation service
As a scorekeeper, I want the app to validate four player bids so invalid rounds are blocked before scoring.

Acceptance criteria:
- Four bids are required.
- Total estimates cannot equal 13.
- Total estimates below 13 classify the round as Under.
- Total estimates above 13 classify the round as Over.

### US-202 Highest bid resolver
As a scorekeeper, I want the app to detect the highest bid so the round contract and trump suit are clear.

Acceptance criteria:
- Higher contract number wins.
- Equal contract number is resolved by suit strength.
- Suit strength is No Trump > Spades > Hearts > Diamonds > Clubs.

### US-301 Trick validation service
As a scorekeeper, I want the app to validate actual tricks so scoring is based on a valid round result.

Acceptance criteria:
- Four actual trick values are required.
- Total actual tricks must equal 13.
- Round scoring is blocked if total actual tricks are not 13.

### US-401 Configurable scoring profile
As a scorekeeper, I want scoring rules to be configurable so official and house-rule variations can be supported.

Acceptance criteria:
- A match uses one scoring profile.
- The scoring profile is locked after the match starts.
- Dash, Dash Call, and 8+ rules can be represented as profile settings.

### US-402 Score calculation service shell
As a developer, I want a score calculation service shell so scoring formulas can be added safely once confirmed.

Acceptance criteria:
- Service accepts round, bids, actual results, and scoring profile.
- Service returns per-player score results.
- Unconfirmed scoring rules are isolated behind strategy/configuration.

### US-501 Leaderboard recalculation
As a scorekeeper, I want totals to recalculate after each round or edit so the leaderboard is always accurate.

Acceptance criteria:
- Scores accumulate by round order.
- Editing an earlier round recalculates subsequent running totals.
- Players are ranked by total score.

## Current Priority
1. Confirm scoring formulas for normal bids.
2. Confirm Dash and Dash Call behavior.
3. Confirm scoring for contracts 8 and above.
4. Implement BidValidationService and HighestBidResolver.
5. Add unit tests for bidding and validation.
6. Implement ScoreCalculationService shell.

## Completed Architecture Deliverables
- Domain model documented in `docs/DOMAIN_MODEL.md`.
- CI/CD baseline implemented with GitHub Actions.
- Initial backlog epics documented.
