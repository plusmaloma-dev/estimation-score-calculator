# US-219 Validation Addendum

Last updated: 2026-06-23

## Purpose

This addendum closes the documentation gap for US-219 until `VALIDATION_STATUS.md`, `VALIDATION_HANDOFF.md`, and related closure docs can be updated in place. It is documentation-only and must not introduce or change Egyptian Estimation scoring behavior.

## Backlog item

US-219 — Game Summary and Leaderboard Compatibility Fixes

Status: Implemented, pending validation

## Closure condition

Move US-219 from **Implemented, pending validation** to **Done** only after the latest `main` branch passes local CI:

```bash
git pull
node --version
npm --version
git rev-parse HEAD
npm install
npm run ci
```

Prefer Node.js 22 to match the GitHub Actions workflow.

## US-219 closure checks after green CI

- `MvpRoundResult` exposes `roundNumber` for both valid and invalid round calculation paths.
- Browser/game-summary DTO consumers can display round history without reaching back into input DTOs.
- Leaderboard aggregation keeps original round identity after invalid rounds are filtered out of score aggregation.
- Regression coverage for invalid-round/valid-round aggregation ordering passes.
- No score formula, bid validation rule, suit/trump hierarchy, Dash, Dash Call, WITH, risk, or all-loser behavior is changed by validation closure.

## Evidence to capture

After validation, record:

- Commit SHA tested.
- Node.js and npm versions.
- `npm run ci` result.
- Test count or failing test details.
- Whether US-219 was moved to Done.
- Any remaining blockers.

## Rule boundaries

- Keep Egyptian Estimation rules separate from Planning Poker.
- Do not modify scoring rules without official source evidence or explicit user confirmation.
- Treat this addendum as validation guidance only, not a scoring-rule source.
