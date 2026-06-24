# Rule Baseline v1

Status: accepted user-confirmed house-rule baseline.

This project uses the rules in `PROJECT_RULES.md` as the authoritative scoring baseline until official federation material is supplied later. The project remains focused on the Egyptian trick-taking game Estimation and must not mix in Planning Poker terminology or workflows.

## Authority Order

1. User-confirmed rule decisions captured in project conversations.
2. `PROJECT_RULES.md`.
3. Executable acceptance and regression tests.
4. README usage examples and implementation docs.

Official federation comparison is now optional future work. No scoring change should be made from unclear, incomplete, or unrelated internet sources.

## Baseline Rule Set

### Round validation

- There are 13 tricks in a round.
- Total estimates must never equal 13.
- Total estimates below 13 create an Under round.
- Total estimates above 13 create an Over round.

### Trump hierarchy

Default hierarchy:

1. No Trump
2. Spades
3. Hearts
4. Diamonds
5. Clubs

### Dash in Over

- Success: player takes 0 tricks and scores +10.
- Failure: player scores delta * -1.
- Delta is the absolute difference between actual tricks and estimated tricks.

### Dash Call

- Dash Call is announced before bidding starts.
- Success: +10 base Dash win plus +25 Dash Call bonus, total +35.
- Failure: delta * -1 -25.
- Other granted bonuses and risks still apply.

### WITH

- WITH follows the same rule for high contracts as normal contracts.
- No separate high-contract exception is applied.

### Risk taker

- The risk taker is the last player to call tricks in the bidding round.
- The risk taker's bid determines whether the round is Under or Over.

### Risk and Double Risk

- Total estimates 11 or 15: Risk value is 10.
- Total estimates 9 or 17: Double Risk value is 20.
- If the risk taker succeeds, add the risk value.
- If the risk taker fails, subtract the risk value.
- Risk always affects the risk taker's score.

### Consecutive all-loser multiplier

- First all-loser occurrence makes the next round x2.
- If the next round is also lost, the following round becomes x4.
- The multiplier continues compounding unless a later accepted rule caps it.
- A successful or winning result resets the multiplier.

## Validation Evidence

The current implementation is validated locally using `npm run ci`.

Latest accepted local evidence:

- Typecheck passed.
- Tests passed: 101 total, 101 passing, 0 failing.
- Build passed.

## Future Federation Review

Federation comparison is kept as optional future work. If official or user-provided evidence becomes available later, create a new review entry and compare it against this baseline before making any scoring changes.
