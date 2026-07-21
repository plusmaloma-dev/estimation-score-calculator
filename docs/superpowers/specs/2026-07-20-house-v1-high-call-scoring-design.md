# House Rules V1 High-Call Scoring Design

## Scope

Update only the `HOUSE_RULES_V1` scoring behavior for calls of 8 tricks or more. `FEDERATION_2026` scoring remains unchanged.

## Success Formula

For a successful House Rules V1 call of 8 or higher:

```text
score = call × call
```

Examples:

| Call | Score |
| ---: | ---: |
| 8 | 64 |
| 9 | 81 |
| 10 | 100 |
| 11 | 121 |
| 12 | 144 |
| 13 | 169 |

## Failure Formula

For a failed House Rules V1 call of 8 or higher:

```text
base penalty = 30 + ((call - 8) × 10)
score = -delta - base penalty
```

`delta` is the absolute difference between actual tricks and called tricks.

Examples:

| Call | Actual | Delta | Base penalty | Score |
| ---: | ---: | ---: | ---: | ---: |
| 8 | 7 | 1 | 30 | -31 |
| 9 | 7 | 2 | 40 | -42 |
| 10 | 6 | 4 | 50 | -54 |
| 11 | 9 | 2 | 60 | -62 |

## WITH Behavior

A WITH player attached to a call of 8 or higher uses the same formulas as the contract owner. The owner and WITH player are evaluated independently against each player's actual tricks.

## Existing Modifiers

After the high-call base score is calculated:

- Risk and Double Risk continue to apply normally.
- Only Winner and Only Loser continue to apply normally.
- The x2/x4 all-loser round multiplier remains excluded from high contracts.

## Compatibility

- Calls below 8 keep their existing House Rules V1 behavior.
- Dash and Dash Call remain unchanged.
- Federation 2026 Super 8/9/10 scores remain 41/42/43 with their federation failure calculation.
- Existing persisted profiles without the new House Rules V1 formula fields continue to use the legacy configurable linear high-contract behavior.

## Acceptance Criteria

1. House Rules V1 call 8 success scores 64.
2. House Rules V1 call 9 success scores 81.
3. House Rules V1 call 10 success scores 100.
4. House Rules V1 call 8 failure scores `-delta - 30`.
5. House Rules V1 call 9 failure scores `-delta - 40`.
6. House Rules V1 call 10 failure scores `-delta - 50`.
7. WITH uses the same formula independently.
8. Risk/Double Risk and Only Winner/Only Loser stack after the base result.
9. Round multiplier does not apply to high contracts.
10. Federation 2026 outputs are unchanged.
