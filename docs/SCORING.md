# Scoring Model

## Status

This document defines the corrected scoring architecture for the Egyptian Estimation Score Calculator MVP.

## Display Tags

- `BO` = Bid Owner
- `WITH` = With caller
- `DASH` = Dash caller
- `RISK` = Risk taker
- `OW` = Only Winner
- `OL` = Only Loser
- `x2` = Multiplied round after all-loser round

Avoid using crown/king icon for Bid Owner to prevent confusion with card ranks or game symbols.

## Core Flow

1. Players enter estimates/bids.
2. Validate the round is Over or Under; total estimates must not equal 13.
3. Resolve the Bid Owner using contract number and suit hierarchy.
4. Store the bid order because risk depends on the bid sequence.
5. After the round, enter actual tricks.
6. Validate total actual tricks = 13.
7. For each player, calculate delta, win/loss status, role modifiers, risk modifiers, and final score.
8. If all players lose, score zero for the current round and apply x2 to the next non-high-contract round.

## Confirmed Bid Rules

- Normal bids start at 4.
- Normal bid range is 4 to 13.
- Dash and Dash Call are special bids.
- Another player may call the same contract as the Bid Owner; this is called With.
- With follows Bid Owner scoring rules for both win and loss.

## Confirmed Bidding Sequence and Risk Taker

Risk taker identification depends on the bidding sequence, not arbitrary assignment.

After the Bid Owner is identified, bidding/estimate declarations continue from the player on the Bid Owner's right side, then continue right-side player by right-side player until all players have declared.

The risk taker is the player whose declared bid creates or accepts the risk gap in the running total.

Example:

```text
If P1 is BO and P4 calls WITH, then P3 is the risk-taker decision point.
```

The engine must store bid order.

## Confirmed Suit Hierarchy

From strongest to weakest:

1. No Trump
2. Spades
3. Hearts
4. Diamonds
5. Clubs

## Round Type

```text
Total estimates > 13 => Over +N
Total estimates < 13 => Under -N
Total estimates = 13 => Invalid
```

Where N is the difference from 13.

## Delta

```text
delta = abs(actual tricks - estimated tricks)
```

A player wins if actual tricks equal estimated tricks. A player loses if they do not match.

Dash also uses delta. Since Dash estimate is 0:

```text
dashDelta = abs(actual tricks - 0)
```

## Configurable Match Setup

Before the match starts, players must choose the winner base bonus:

- 10
- 13

The selected value is locked once the match starts.

## Confirmed Normal Winner Formula

For a normal non-owner player who wins:

```text
score = bid + winnerBaseBonus
```

## Confirmed Bid Owner Winner Formula

If the Bid Owner wins, add an extra fixed +10 Bid Owner bonus.

```text
score = bid + winnerBaseBonus + 10
```

## Confirmed With Formula

A With player calls the same contract/order as the Bid Owner and takes the same scoring treatment as the Bid Owner.

### With Win

```text
score = bid + winnerBaseBonus + 10
```

### With Loss

```text
score = -delta - 10
```

## Confirmed Normal Loser Formula

For a normal player who loses:

```text
score = -delta
```

## Confirmed Bid Owner Loser Formula

If the Bid Owner loses, add an extra fixed -10 penalty.

```text
score = -delta - 10
```

## Confirmed Only Winner Bonus

If exactly one player wins the round, that player receives an additional fixed +10.

This bonus stays 10 even if winnerBaseBonus is configured as 13.

```text
only winner score = normal calculated winner score + 10
```

## Confirmed Only Loser Penalty

If exactly one player loses the round, that player receives an additional fixed -10.

```text
only loser score = normal calculated loser score - 10
```

This stacks with other penalties. Example for Risk + Only Loser:

```text
score = -delta - riskPenalty - onlyLoserPenalty
```

## Confirmed All-Losers Round Rule

If all four players lose in the same round:

```text
current round score for all players = 0
next round multiplier = x2
```

The next round multiplier applies to the full calculated score of each player in the next round, except high-contract rounds.

Confirmed: x2 does not apply to high-contract rounds.

Open point: If two all-loser rounds happen consecutively, confirm whether the multiplier stays x2 or stacks.

## Confirmed Dash in Under Round

If a player calls Dash and the round type is Under, Dash is a bonus/penalty layer and still uses delta.

Dash estimate is 0.

### Dash Win

```text
actual tricks = 0
dashDelta = 0
score = +10 bonus
```

### Dash Loss

```text
actual tricks > 0
dashDelta = actual tricks
score = -dashDelta - 10 penalty
```

Dash always takes the risk in an Under round. This means Under-risk bonus/penalty is added to Dash score.

Examples:

```text
Under -2 Dash actual 0 => +10 dash +10 risk = +20
Under -2 Dash actual 1 => -1 delta -10 dash -10 risk = -21
Under -4 Dash actual 0 => +10 dash +20 risk = +30
Under -4 Dash actual 1 => -1 delta -10 dash -20 risk = -31
```

## Confirmed Risk Bonus / Penalty

Risk applies when the total estimated tricks differ from 13 by at least 2.

```text
Under -2 or Over +2 => risk bonus/penalty = 10
Under -4 or Over +4 => risk bonus/penalty = 20
```

Risk sign depends on result:

```text
Risk taker wins => add positive risk bonus
Risk taker loses => add negative risk penalty
```

Risk is additive and stacks with Only Loser.

## Confirmed High Contract Winner Formula

High contract starts at 8.

```text
high contract win score = 68 + ((bid - 8) * 11)
```

Table:

```text
8  => 68
9  => 79
10 => 90
11 => 101
12 => 112
13 => 123
```

## Confirmed High Contract Loser Formula

High contract loss uses delta and a base penalty by bid.

```text
score = -delta + basePenalty
```

Base penalties:

```text
8  => -40
9  => -50
10 => -60
11 => -70
12 => -80
13 => -90
```

Example:

```text
Bid 9, actual 7 => delta 2 => -2 -50 = -52
```

## Role Summary

### Bid Owner

- Win: bid + winnerBaseBonus + 10
- Loss: -delta - 10
- High contract win/loss overrides normal owner formula.

### With Player

- Win: same as Bid Owner win.
- Loss: same as Bid Owner loss.
- High contract With handling still needs confirmation if With can apply to high contracts.

### Normal Player

- Win: bid + winnerBaseBonus
- Loss: -delta

### Only Winner

- Add +10 after normal winner calculation.

### Only Loser

- Add -10 after normal loser calculation.
- Stacks with Risk penalty.

### All Players Lose

- Current round scores are all zero.
- Next round score is multiplied by x2.
- x2 does not apply to high-contract rounds.

### Dash Under

- Win: +10 bonus, plus Under risk bonus.
- Loss: -dashDelta -10 penalty, plus Under risk penalty.
- Dash always takes risk in Under rounds.

### Risk Taker

- Determined from bid order, not final table position alone.
- Under -2 / Over +2: +/-10 based on win/loss.
- Under -4 / Over +4: +/-20 based on win/loss.
- Risk modifier is additive and negative on loss.

## Open Confirmation Questions

1. Dash behavior in Over rounds.
2. Dash Call formula.
3. Whether With can apply to high contracts and whether it follows high-contract scoring.
4. Whether high contract bid owner also receives owner bonus, or high contract score fully overrides normal owner bonus.
5. Whether only-winner/only-loser bonus applies on high contract and Dash rounds.
6. Whether consecutive all-loser rounds stack the next-round multiplier or keep it at x2.

## Decision

The MVP scoring profile must be configurable before game start. The confirmed formulas above should be implemented as the default Egyptian profile, while unresolved formulas remain configurable until confirmed.
