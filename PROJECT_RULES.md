# Egyptian Estimation Scoring Rules

This project is for the Egyptian trick-taking game Estimation.
It is not Planning Poker.

The application supports multiple selectable scoring rule sets. House Rules V1 and Federation 2026 must remain isolated from each other.

## Round Validation

- There are 13 tricks in a round.
- Total estimates must never equal 13.
- A round is Under when total estimates are less than 13.
- A round is Over when total estimates are greater than 13.

## Trump Hierarchy

Default hierarchy unless overridden by the selected rule set:

1. No Trump
2. Spades
3. Hearts
4. Diamonds
5. Clubs

## House Rules V1 — Dash in Over

When a player estimates Dash / 0 in an Over round:

- Success: player takes 0 tricks and scores +10.
- Failure: player scores delta * -1.
- Delta is the absolute difference between actual tricks and estimated tricks for the Dash player.

## House Rules V1 — Dash Call

Dash Call occurs when a player announces before bidding starts that they will take Dash.

- Success: +10 base Dash win +25 Dash Call bonus = +35.
- Failure: delta * -1 -25.
- Other granted bonuses and risks still apply.

## House Rules V1 — Calls 8 and Above

A call of 8 tricks or more is a high contract.

### Success

```text
score = call × call
```

Examples:

- Call 8: +64.
- Call 9: +81.
- Call 10: +100.
- Call 11: +121.
- Call 12: +144.
- Call 13: +169.

### Failure

```text
base penalty = 30 + ((call - 8) × 10)
score = -delta - base penalty
```

Examples:

- Failed call 8 with delta 1: -31.
- Failed call 9 with delta 2: -42.
- Failed call 10 with delta 4: -54.

### WITH and Modifiers

- A WITH player attached to a high contract uses the same formula as the contract owner.
- Owner and WITH results are calculated independently from each player's actual tricks.
- Risk and Double Risk continue to add or subtract normally.
- Only Winner and Only Loser continue to add or subtract normally.
- The consecutive all-loser x2/x4 multiplier does not multiply high-contract scores.

## WITH

WITH applies using the same scoring formula as the contract owner, including calls of 8 and above.
There is no separate high-contract exception.

## Risk Taker

- The risk taker is the last player to call tricks in the contract or bidding round.
- This player's call determines whether the round is Under or Over.

## Risk and Double Risk

Risk always impacts the risk taker's score.

- Total estimates 11 or 15: Risk value is 10.
- Total estimates 9 or 17: Double Risk value is 20.
- If the risk taker succeeds, add the risk value.
- If the risk taker fails, subtract the risk value.

## Consecutive All-Loser Multiplier

- First all-loser occurrence makes the next round x2.
- If that next round is also lost, the following round becomes x4.
- This compounds while losses continue unless a future rule caps the multiplier.
- A successful or winning result resets the multiplier.
- The multiplier does not apply to high contracts.

## Federation 2026 Isolation

Federation 2026 Super 8, Super 9, and Super 10 calculations remain separate from House Rules V1. Updating House Rules V1 must not alter Federation 2026 scores or penalties.
