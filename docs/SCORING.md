# Scoring Model

## Status

This document defines the corrected scoring architecture for the Egyptian Estimation Score Calculator MVP.

The score engine must evaluate each player's bid, actual tricks, round role, and special state before applying formulas.

## Core Flow

1. Players enter estimates/bids.
2. System validates the round is Over or Under; total estimates must not equal 13.
3. System resolves the bid owner using contract number and suit hierarchy.
4. After the round, players enter actual tricks.
5. System validates total actual tricks = 13.
6. For each player:
   - Determine if actual tricks match estimated tricks.
   - Calculate delta = absolute value of actual - bid.
   - Assign role: bid owner, with player, normal player, dash, risk, high contract.
   - Apply the correct formula.
7. If all players lose, score zero for the current round and apply x2 multiplier to the next round.

## Display Tags

Recommended short tags for UI and test tables:

- `BO` = Bid Owner
- `WITH` = With caller
- `DASH` = Dash caller
- `RISK` = Risk taker
- `OW` = Only Winner
- `OL` = Only Loser
- `x2` = Multiplied round after all-loser round

Avoid using crown/king icon for Bid Owner to prevent confusion with card ranks or game symbols.

## Confirmed Bid Rules

- Normal bids start at 4.
- Normal bid range is 4 to 13.
- Dash and Dash Call are special bids.
- Another player may call the same contract as the bid owner; this is called With.
- With follows bid-owner scoring rules for both win and loss.

## Confirmed Bidding Sequence and Risk Taker

Risk taker identification depends on the bidding sequence, not arbitrary assignment.

After the Bid Owner is identified, bidding/estimate declarations continue from the player on the Bid Owner's right side, then continue right-side player by right-side player until all players have declared.

The risk taker is the player whose declared bid creates or accepts the risk gap in the running total.

Examples:

```text
If BO is Karim, the player to Karim's right declares first, then the next right-side player, and so on.
The risk taker is the player at the point in this ordered sequence whose bid causes or accepts Under -2 / Over +2 or Under -4 / Over +4.
```

This means risk cannot be assigned just from the final round total; the engine must store bid order.

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

A player wins if:

```text
actual tricks = estimated tricks
```

A player loses if:

```text
actual tricks != estimated tricks
```

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

Examples when winnerBaseBonus = 10:

```text
Bid 2 => 12
Bid 4 => 14
Bid 7 => 17
```

Examples when winnerBaseBonus = 13:

```text
Bid 2 => 15
Bid 4 => 17
Bid 7 => 20
```

## Confirmed Bid Owner Winner Formula

If the bid owner wins, add an extra fixed +10 bid-owner bonus.

```text
score = bid + winnerBaseBonus + 10
```

Example when winnerBaseBonus = 10:

```text
Bid owner bid 7 and wins => 7 + 10 + 10 = 27
```

## Confirmed With Formula

A With player calls the same contract/order as the bid owner.

The With player takes the same scoring treatment as the bid owner in both win and loss.

### With Win

```text
score = bid + winnerBaseBonus + 10
```

### With Loss

```text
score = -delta - 10
```

Example:

```text
P1 bid owner bids 4
P2 calls With on 4
P2 actual tricks = 3
delta = 1
P2 score = -1 -10 = -11
```

## Confirmed Normal Loser Formula

For a normal player who loses:

```text
score = -delta
```

Example:

```text
Bid 4, actual 3 => delta 1 => -1
Bid 5, actual 2 => delta 3 => -3
```

## Confirmed Bid Owner Loser Formula

If the bid owner loses, add an extra fixed -10 penalty.

```text
score = -delta - 10
```

Example:

```text
Bid owner bid 7, actual 5 => delta 2 => -12
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

## Confirmed All-Losers Round Rule

If all four players lose in the same round:

```text
current round score for all players = 0
next round multiplier = x2
```

The next round multiplier applies to the full calculated score of each player in the next round.

Example:

```text
Round 4: all players lose => P1=0, P2=0, P3=0, P4=0
Round 5: normal calculated scores are 24, -1, 14, -1
Round 5 with x2 multiplier => 48, -2, 28, -2
```

Open point: If two all-loser rounds happen consecutively, confirm whether the multiplier stays x2 or stacks.

## Confirmed Dash in Under Round

If a player calls Dash and the round type is Under, Dash is a bonus/penalty layer but still uses delta.

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

Examples:

```text
Dash actual 0 => +10
Dash actual 1 => -1 -10 = -11
Dash actual 2 => -2 -10 = -12
```

Dash Under bonus/penalty must be considered in addition to applicable risk state.

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

Examples:

```text
Under -2 risk taker wins => +10
Under -2 risk taker loses => -10
Over +2 risk taker wins => +10
Over +2 risk taker loses => -10
Under -4 risk taker wins => +20
Under -4 risk taker loses => -20
Over +4 risk taker wins => +20
Over +4 risk taker loses => -20
```

Risk is an additive layer applied after the player's normal/owner/with/high-contract/dash base calculation.

## Confirmed High Contract Winner Formula

High contract starts at 8.

Confirmed:

```text
8 win = 68
9 win = 79
```

This implies:

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

- Win: same as bid owner win.
- Loss: same as bid owner loss.
- High contract With handling still needs confirmation if With can apply to high contracts.

### Normal Player

- Win: bid + winnerBaseBonus
- Loss: -delta

### Only Winner

- Add +10 after normal winner calculation.

### Only Loser

- Add -10 after normal loser calculation.

### All Players Lose

- Current round scores are all zero.
- Next round score is multiplied by x2.

### Dash Under

- Win: +10 bonus.
- Loss: -dashDelta -10 penalty.

### Risk Taker

- Determined from bid order, not final table position alone.
- Under -2 / Over +2: +/-10 based on win/loss.
- Under -4 / Over +4: +/-20 based on win/loss.
- Risk modifier is additive and negative on loss.

## Open Confirmation Questions

The following still need confirmation:

1. Dash behavior in Over rounds.
2. Dash Call formula.
3. Whether With can apply to high contracts and whether it follows high-contract scoring.
4. Whether high contract bid owner also receives owner bonus, or high contract score fully overrides normal owner bonus.
5. Whether only-winner/only-loser bonus applies on high contract and Dash rounds.
6. Whether consecutive all-loser rounds stack the next-round multiplier or keep it at x2.

## Decision

The MVP scoring profile must be configurable before game start. The confirmed formulas above should be implemented as the default Egyptian profile, while unresolved formulas remain configurable until confirmed.
