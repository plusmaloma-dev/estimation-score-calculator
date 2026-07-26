# House Rules V1 Under-Round Zero-Estimate Adjustment

**Date:** 2026-07-26  
**Status:** Approved design  
**Scope:** House Rules V1 scoring only

## Goal

Add a House Rules V1 adjustment for a normal zero estimate in an Under round.
The adjustment rewards a successful zero estimate with `+10` and penalizes a
failed zero estimate with `-10`, on top of the player's normal score.

## Eligibility

The adjustment applies only when all of these conditions are true:

1. The game uses `HOUSE_RULES_V1`.
2. The final round type is Under, meaning total estimated tricks are less than
   13.
3. The player's accepted estimate is `0`.
4. The player's bid type is `normal`.

The adjustment does not apply to:

- Dash Call;
- Over rounds;
- rounds whose total estimates equal 13;
- Federation 2026 games.

No new declaration, toggle, or input is required.

## Scoring

For an eligible player:

- If actual tricks equal `0`, calculate the normal successful score and add
  `+10`.
- If actual tricks are above `0`, calculate the normal failed score and add
  `-10`.

Examples before later modifiers:

- Estimate `0`, actual `0`, normal score `+10`: adjusted score `+20`.
- Estimate `0`, actual `2`, normal score `-2`: adjusted score `-12`.

## Modifier Order

The zero-estimate adjustment is part of the House Rules player result before
later modifiers:

1. Calculate normal role scoring.
2. Apply the zero-estimate `+10` or `-10`.
3. Apply existing Risk and Only Winner/Only Loser modifiers in their current
   order.
4. Apply existing Multiple WITH and carried all-loser multipliers in their
   current order.

The new rule does not otherwise change modifier definitions or ordering.

## All-Loser Precedence

The existing House Rules all-loser rule has precedence. If all four players
lose:

- every player scores `0`, including a failed zero estimator;
- the existing all-loser carry is created or increased;
- the zero-estimate penalty is not persisted as the round score.

## Architecture

Implement the adjustment inside the House Rules configurable scoring strategy,
where normal player scoring and existing modifiers are composed. Keep
`ScoreCalculationService` responsible for shared round orchestration and
all-loser precedence.

The strategy should add a score note identifying whether the successful
zero-estimate bonus or failed zero-estimate penalty was applied.

The existing calculated-score pipeline remains authoritative for:

- React score history and totals;
- online round persistence and reopening;
- snapshots and applied scores;
- summaries, analytics, CSV/markdown exports, and backup/restore.

## Persistence

No database migration is required. The rule changes calculated values but adds
no new stored entity or field. Existing round bids already preserve the normal
zero estimate and bid type, while existing round scores preserve the calculated
and applied result.

System-calculated zero-estimate adjustments must not create score override audit
records or `Edited` markers.

## Test Coverage

Tests must cover:

1. House Rules Under, normal estimate `0`, actual `0`: normal score plus `10`.
2. House Rules Under, normal estimate `0`, actual above `0`: normal score minus
   `10`.
3. The adjustment precedes Risk, Only Winner/Only Loser, Multiple WITH, and
   carried all-loser multipliers.
4. Dash Call does not receive the adjustment.
5. Over and exact-13 rounds do not receive the adjustment.
6. Federation 2026 does not receive the adjustment.
7. An all-loser round still scores every player `0` and carries normally.
8. Online save and reopening preserve the adjusted calculated/applied score
   without an override audit or `Edited` marker.
9. Existing House Rules and Federation regression suites remain green.

## Acceptance Criteria

- Eligible successful zero estimates gain exactly `+10` before later
  modifiers.
- Eligible failed zero estimates lose exactly `10` before later modifiers.
- All exclusions and all-loser precedence behave as specified.
- No schema migration or UI control is introduced.
- `npm run ci` passes.
- The feature-branch UAT is deployed through the stable shared alias and
  smoke-tested before completion is reported.
