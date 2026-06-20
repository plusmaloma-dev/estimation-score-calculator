# Estimation Score Calculator Backlog

## Project Rules

- Keep Egyptian Estimation scoring/rules separate from Planning Poker estimation.
- Prefer implementation-ready slices with tests.
- Update `PROJECT_LOG.md` after each automation run.

## Progress Tracker

| Area | Status | Progress |
| --- | --- | ---: |
| Repository bootstrap | Done | 100% |
| Test execution setup | Done | 100% |
| Card and bid domain model | Done | 100% |
| Bid validation | Done | 100% |
| Highest bid resolution | Done | 100% |
| Trick validation | Next | 0% |
| Score calculation | Planned | 0% |
| Leaderboard | Planned | 0% |
| UI/API integration | Planned | 0% |

Overall progress: **36%**

## Implementation Backlog

### US-201 — BidValidationService

Status: **Done**

Acceptance criteria:

- Validate Egyptian Estimation bids independently from Planning Poker votes.
- Reject missing player ids.
- Reject invalid player/card counts.
- Reject trick bids below 0 or above cards per player.
- Reject impossible table sizes greater than the 52-card deck.
- Include automated tests.

### US-202 — HighestBidResolver

Status: **Done**

Acceptance criteria:

- Resolve the highest Egyptian Estimation bid from a list of valid bids.
- Define deterministic tie behavior.
- Keep selected suit ordering configurable until final local rules are confirmed.
- Include unit tests for bid amount priority and tie behavior.

### US-203 — TrickValidationService

Status: **Next**

Acceptance criteria:

- Validate trick entries by player and round.
- Prevent duplicate cards in the same trick.
- Verify trick card count does not exceed active player count.
- Include unit tests.

### US-204 — ScoreCalculationService Shell

Status: **Planned**

Acceptance criteria:

- Add clear score calculation interface and result type.
- Implement only confirmed base scoring rules.
- Mark unknown or variant Egyptian Estimation rules as research blockers.
- Include tests for confirmed paths.

### US-205 — LeaderboardService

Status: **Planned**

Acceptance criteria:

- Aggregate player scores across rounds.
- Sort by total score descending.
- Preserve deterministic order for ties.
- Include unit tests.

## Rule Research Backlog

- Confirm Egyptian Estimation exact scoring formula.
- Confirm whether selected suit ordering is fixed or table-configurable.
- Confirm penalties and bonuses for exact bids, missed bids, and special calls.
