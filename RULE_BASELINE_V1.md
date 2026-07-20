# Rule Baseline v1

Status: accepted user-confirmed house-rule baseline.

This project uses the rules in `PROJECT_RULES.md` as the authoritative House Rules V1 scoring baseline. Federation 2026 is a separate selectable rule set and must not silently override House Rules V1 behavior.

## Authority Order

1. User-confirmed rule decisions captured in project conversations.
2. `PROJECT_RULES.md`.
3. Executable acceptance and regression tests.
4. README usage examples and implementation docs.

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

### Calls 8 and above

A call of 8 tricks or more uses the House Rules V1 high-contract formula.

Successful call:

```text
score = call × call
```

Failed call:

```text
base penalty = 30 + ((call - 8) × 10)
score = -delta - base penalty
```

Reference values:

| Call | Success | Failure base penalty |
| ---: | ---: | ---: |
| 8 | 64 | 30 |
| 9 | 81 | 40 |
| 10 | 100 | 50 |
| 11 | 121 | 60 |
| 12 | 144 | 70 |
| 13 | 169 | 80 |

### WITH

- WITH follows the same scoring formula as the contract owner.
- For calls of 8 or higher, owner and WITH use the high-contract formula independently based on each player's actual tricks.
- No separate high-contract exception is applied.

### High-contract modifiers

- Risk and Double Risk continue to apply after the base high-contract result.
- Only Winner and Only Loser continue to apply after the base high-contract result.
- The consecutive all-loser x2/x4 multiplier does not apply to high-contract scores.

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
- High contracts are excluded from multiplier application.

## Rule-Set Isolation

- House Rules V1 uses the call-squared and escalating-failure formulas above.
- Federation 2026 keeps its own Super 8/9/10 scoring table and federation failure formula.
- A scoring change in one rule set must be covered by a regression test proving the other rule set is unchanged.

## Validation Evidence

Latest branch validation for this rule update:

- GitHub Actions CI run 374 passed.
- Typecheck, tests, and build completed successfully through `npm run ci`.
- Regression coverage includes calls 8/9/10, failed calls, WITH, modifiers, multiplier exclusion, and Federation 2026 isolation.
