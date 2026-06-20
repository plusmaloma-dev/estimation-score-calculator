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

## Confirmed Bid Rules

- Normal bids start at 4.
- Normal bid range is 4 to 13.
- Dash and Dash Call are special bids.
- Another player may call the same contract as the bid owner; this is called With.
- With follows bid-owner scoring rules for both win and loss.

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

## Confirmed Dash in Under Round

If a player calls Dash and the round type is Under:

```text
Dash win => +10
Dash loss => -10
```

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

### Dash Under

- Win: +10
- Loss: -10

## Open Confirmation Questions

The following still need confirmation:

1. Dash behavior in Over rounds.
2. Dash Call formula.
3. Whether With can apply to high contracts and whether it follows high-contract scoring.
4. Risk player formula in Over rounds.
5. Whether high contract bid owner also receives owner bonus, or high contract score fully overrides normal owner bonus.
6. Whether only-winner/only-loser bonus applies on high contract and Dash rounds.

## Decision

The MVP scoring profile must be configurable before game start. The confirmed formulas above should be implemented as the default Egyptian profile, while unresolved formulas remain configurable until confirmed.
