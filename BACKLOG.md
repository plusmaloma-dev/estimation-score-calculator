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
| Trick validation | Done | 100% |
| Score calculation | In Progress | 86% |
| Leaderboard | Done | 100% |
| UI/API integration | Next | 0% |

Overall progress: **72%**

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

Status: **Done**

Acceptance criteria:

- Validate trick entries by player and round.
- Prevent duplicate cards in the same trick.
- Verify trick card count does not exceed active player count.
- Include unit tests.

### US-204 — ScoreCalculationService Shell

Status: **In Progress**

Acceptance criteria:

- Add clear score calculation interface and result type. **Done**
- Implement confirmed base scoring rules using actual tricks vs estimated tricks. **Done**
- Calculate and return per-player `delta`, match status, role, and risk type. **Done**
- Resolve bid owner dynamically from `bidOwnerPlayerId`, not player position. **Done**
- Apply With as bid-owner scoring treatment. **Done**
- Apply only-winner and only-loser modifiers. **Done**
- Apply all-loser zero-score round rule. **Done**
- Implement confirmed high-contract fixed score formulas. **Done**
- Implement Under Dash bonus/penalty. **Done**
- Apply round x2 multiplier for configured follow-up rounds. **Done**
- Mark unknown or variant Egyptian Estimation rules as research blockers. **Open**
- Include tests for confirmed paths. **Partial**

### US-205 — LeaderboardService

Status: **Done**

Acceptance criteria:

- Aggregate player scores across rounds. **Done**
- Sort by total score descending. **Done**
- Preserve deterministic order for ties. **Done**
- Include unit tests. **Done**

### US-206 — UI/API Integration Shell

Status: **Next**

Acceptance criteria:

- Expose an implementation-ready application service for validating bids, calculating a round score, and aggregating leaderboard totals.
- Keep the service framework-agnostic so it can be used by a future UI or API.
- Return validation and scoring errors without throwing for normal user-input mistakes.
- Include integration-style tests for a complete MVP scoring flow.

## Rule Research Backlog

- Confirm risk-taker identification rule for each bidding sequence.
- Confirm Dash behavior in Over rounds.
- Confirm Dash Call formula.
- Confirm whether With can apply to high contracts and whether it follows high-contract scoring.
- Confirm whether only-winner/only-loser modifiers apply to high-contract and Dash rounds.
- Confirm whether consecutive all-loser rounds keep x2 or stack.