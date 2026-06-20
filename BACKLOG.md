# Estimation Score Calculator Backlog

## Project Rules

- Keep Egyptian Estimation scoring/rules separate from Planning Poker estimation.
- Prefer implementation-ready slices with tests.
- Update `PROJECT_LOG.md` after each automation run.
- Use `PROJECT_RULES.md` as the working rule reference for finalized local Egyptian Estimation rules.

## Progress Tracker

| Area | Status | Progress |
| --- | --- | ---: |
| Repository bootstrap | Done | 100% |
| Test execution setup | Done | 100% |
| Card and bid domain model | Done | 100% |
| Bid validation | Done | 100% |
| Highest bid resolution | Done | 100% |
| Trick validation | Done | 100% |
| Score calculation | Done | 97% |
| Leaderboard | Done | 100% |
| UI/API integration | In Progress | 65% |
| Acceptance dataset | In Progress | 30% |
| Persistence | Backlog | 0% |
| Statistics | Backlog | 0% |
| Import/export | Backlog | 0% |

Overall progress: **97%**

## Implementation Backlog

### US-201 — BidValidationService

Status: **Done**

Acceptance criteria:

- Validate Egyptian Estimation bids independently from Planning Poker votes. **Done**
- Reject missing player ids. **Done**
- Reject invalid player/card counts. **Done**
- Reject trick bids below 0 or above cards per player. **Done**
- Reject impossible table sizes greater than the 52-card deck. **Done**
- Include automated tests. **Done**

### US-202 — HighestBidResolver

Status: **Done**

Acceptance criteria:

- Resolve the highest Egyptian Estimation bid from a list of valid bids. **Done**
- Define deterministic tie behavior. **Done**
- Use the agreed suit hierarchy unless official federation rules override it. **Done**
- Include unit tests for bid amount priority and tie behavior. **Done**

### US-203 — TrickValidationService

Status: **Done**

Acceptance criteria:

- Validate trick entries by player and round. **Done**
- Prevent duplicate cards in the same trick. **Done**
- Verify trick card count does not exceed active player count. **Done**
- Include unit tests. **Done**

### US-204 — ScoreCalculationService Shell

Status: **Done**

Acceptance criteria:

- Add clear score calculation interface and result type. **Done**
- Implement confirmed base scoring rules using actual tricks vs estimated tricks. **Done**
- Calculate and return per-player `delta`, match status, role, and risk type. **Done**
- Resolve bid owner dynamically from `bidOwnerPlayerId`, not player position. **Done**
- Apply WITH as bid-owner scoring treatment. **Done**
- Apply only-winner and only-loser modifiers. **Done**
- Apply all-loser zero-score round rule. **Done**
- Implement confirmed high-contract fixed score formulas. **Done**
- Implement Under Dash bonus/penalty. **Done**
- Implement Dash in Over: success +10, failure delta * -1. **Ready/Confirmed**
- Implement Dash Call: success +35, failure delta * -1 -25. **Ready/Confirmed**
- Apply Risk and Double Risk to the last bidder based on success/failure. **Ready/Confirmed**
- Apply round x2 multiplier for configured follow-up rounds. **Done**
- Track consecutive all-loser multiplier escalation x2 then x4 and onward unless capped. **Done**
- Include tests for confirmed paths. **Partial**

### US-205 — LeaderboardService

Status: **Done**

Acceptance criteria:

- Aggregate player scores across rounds. **Done**
- Sort by total score descending. **Done**
- Preserve deterministic order for ties. **Done**
- Include unit tests. **Done**

### US-206 — UI/API Integration Shell

Status: **In Progress**

Acceptance criteria:

- Expose an implementation-ready application service for validating bids, calculating a round score, and aggregating leaderboard totals. **Done**
- Keep the service framework-agnostic so it can be used by a future UI or API. **Done**
- Return validation and scoring errors without throwing for normal user-input mistakes. **Done**
- Include integration-style tests for a complete MVP scoring flow. **Partial**
- Add/confirm DTO support for Dash Call, Risk, Double Risk, WITH, and all-loser multiplier metadata. **Next**

### US-207 — Acceptance Dataset

Status: **In Progress**

Acceptance criteria:

- Under and Over scoring scenarios. **Next**
- WITH scenarios including high contracts. **Next**
- Dash and Dash Call scenarios. **Next**
- Risk and Double Risk scenarios. **Next**
- Consecutive all-loser multiplier scenarios. **Done**
- Mixed scenarios covering bonus and risk combinations. **Next**

### US-208 — Persistence

Status: **Backlog**

Acceptance criteria:

- Save and restore match data locally.
- Support JSON backup and restore.
- Add version metadata to exported match files.

### US-209 — Statistics

Status: **Backlog**

Acceptance criteria:

- Highest score.
- Average score.
- Contract success rate.
- Player win percentage.

### US-210 — Import / Export

Status: **Backlog**

Acceptance criteria:

- Export match history.
- Import backup files.
- Validate imported data.

## Rule Research Backlog

No scoring blockers remain after the 2026-06-20 rule clarification session.

Confirmed rules are documented in `PROJECT_RULES.md`:

- Dash in Over.
- Dash Call.
- WITH on high contracts.
- Risk and Double Risk.
- Risk taker identification.
- Consecutive all-loser multiplier escalation.
