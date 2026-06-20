# Egyptian Estimation Scoring Rules

This project is for the Egyptian trick-taking game Estimation.
It is not Planning Poker.

## Round Validation

- There are 13 tricks in a round.
- Total estimates must never equal 13.
- A round is Under when total estimates are less than 13.
- A round is Over when total estimates are greater than 13.

## Trump Hierarchy

Default hierarchy unless overridden by official federation rules:

1. No Trump
2. Spades
3. Hearts
4. Diamonds
5. Clubs

## Dash in Over

When a player estimates Dash / 0 in an Over round:

- Success: player takes 0 tricks and scores +10.
- Failure: player scores delta * -1.
- Delta is the difference between actual tricks and estimated tricks for the Dash player.

## Dash Call

Dash Call occurs when a player announces before bidding starts that they will take Dash.

- Success: +10 base Dash win +25 Dash Call bonus = +35.
- Failure: delta * -1 -25.
- Other granted bonuses and risks still apply.

## WITH

WITH applies using the same rule for high contracts as for normal contracts.
There is no special high-contract exception.

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
