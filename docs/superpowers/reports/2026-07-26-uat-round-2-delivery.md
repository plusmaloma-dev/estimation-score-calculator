# UAT Round 2 Delivery Report

**Date:** 2026-07-26
**Branch:** `fix/uat-round-2-findings`
**Source:** `feature/react-vite-frontend-prototype` at `b84ecf3`
**Status:** Local implementation and validation complete; draft PR and hosted CI pending

## Delivered behavior

### Dash Call

- Added an explicit House Rules V1-only `DC` declaration control for each player before normal estimate entry.
- A declaration is single-use, fixes the selected player's estimate at zero, and cannot be replaced by another declaration.
- After any normal bid entry, including zero, undeclared Dash Call controls are permanently unavailable even if that entry is cleared.
- Federation 2026 neither displays nor serializes Dash Call.
- The saved bid remains `dash-call`; the UI never calculates its score.
- House Rules V1 continues to use the existing scoring pipeline: success `+35`, failure `-delta-25`, then valid modifiers.
- History labels Dash Call as `DC`.
- Additive `riskTypes` metadata preserves `dash-call` and `round-risk` simultaneously while retaining the legacy primary `riskType`.
- History, game summary, statistics, player analytics, markdown, CSV, rich export, online snapshots, and backup/restore consume normalized classifications.

### Authoritative all-loser carry

- Online save previously called `calculateRound` for only the new round. That result had no prior carry context and was persisted unmultiplied.
- Reload recalculated the complete game and produced x2/x4 scores, but history still contained the unmultiplied persisted applied score.
- The view model correctly interpreted that mismatch as a manual override, causing the false Edited marker and Restore Original state.
- Online save now uses the cached/reloaded complete game input, recalculates chronologically with the new round, and persists the authoritative final round result.
- `calculated_score` and initial `applied_score` therefore match the x2/x4 system result. No override row is created.
- Existing explicit override RPC and audit behavior is unchanged.
- Existing high-contract carry exclusions remain unchanged; the carry is consumed by the eligible round while high-contract player scores are not multiplied.

## Persistence and migration decision

No migration is required.

- `round_bids.bid_type` already stores `dash-call`.
- `round_scores.risk_type` keeps the primary classification, including `round-risk`.
- Online reconstruction combines the stored bid type and score risk type into `riskTypes`.
- Existing round carry columns already store all-loser classification, prior count, multiplier, consumption, and Multiple WITH metadata.
- Existing calculated/applied score columns remain correctly separated from override audit rows.

The four timestamped migrations remain in their original deterministic order. No migration file changed. Existing schema tests cover search-path hardening, actor binding, workspace isolation, RLS, version/lock enforcement, payload validation, snapshot completeness, and credential absence.

## RED evidence

Command:

```text
npm test -- src/app/scoreSheet/biddingState.test.ts src/app/components/CurrentRoundRow.test.tsx tests/EstimationMvpService.test.ts tests/allLoserCarryMultiplier.test.ts
```

Expected failure:

```text
TS2551: Property 'riskTypes' does not exist on type 'PlayerScoreResult'.
```

Command:

```text
npm run test:ui -- src/app/screens/ScoreSheetScreen.test.tsx src/online/games/OnlineBrowserShellService.test.ts
```

Expected product failure:

```text
expected carriedAllLoserMultiplier 2; received 1
```

This reproduced the online single-round calculation defect before the production fix.

Independent review then identified two boundary regressions. New desktop/mobile and
rule-set tests failed because clearing an entered zero reopened Dash Call and Federation
still displayed its controls. Those failures were retained as regression coverage before
the production fixes.

## GREEN evidence

Focused React/online command:

```text
npm run test:ui -- src/online/games/OnlineBrowserShellService.test.ts src/app/screens/ScoreSheetScreen.test.tsx src/app/components/CurrentRoundRow.test.tsx src/app/scoreSheet/biddingState.test.ts
```

Review-focused result: 3 files and 33 tests passed.

Full validation:

```text
npm run ci
```

Result:

- engine typecheck: passed;
- React/app typecheck: passed;
- engine tests: 188 passed;
- UI tests: 98 passed across 24 files;
- production Vite build: passed.

The build retains the pre-existing chunk-size advisory. Current main JS output is 514.27 kB minified and 145.07 kB gzip.

## Regression coverage

- successful and failed Dash Call engine rules;
- pre-bidding-only declaration;
- irreversible close of the declaration window after desktop or mobile normal entry/clear;
- House Rules-only UI and serialization;
- conflicting declaration prevention;
- zero estimate enforcement;
- React save payload remains `dash-call`;
- Dash Call plus round Risk metadata;
- history and score-sheet `DC`/`R` labeling;
- summary aggregation;
- player analytics aggregation;
- markdown and CSV projection;
- backup/restore metadata;
- all-loser zero scores;
- x2 and x4 authoritative online save payloads;
- calculated/applied equality and empty override collection;
- reload history preserves carried scores;
- system scores do not set `overridden`;
- explicit manual override tests remain green;
- high-contract multiplier exclusion remains green.

## Manual UAT

1. Open a fresh House Rules V1 game.
2. Before entering any estimate, press `DC` for one player.
3. Confirm that player's estimate becomes zero, is disabled, and displays `DC`.
4. Confirm other `DC` controls disappear and the declared player cannot be changed.
5. Enter the remaining estimates and trump, accept estimates, enter actual tricks, and save.
6. Verify a successful Dash Call displays `+35` before applicable modifiers; repeat with a failed call and verify `-delta-25`.
7. Use a sequence in which the Dash Call player is also the round Risk taker. Verify history shows both `DC` and `R`, and summary/analytics/export count Dash Call.
8. Reload the browser and verify the Dash Call classification remains.
9. Save one all-loser round, then a normal eligible round. Verify x2 scores persist after reload with no Edited marker and no Restore Original action.
10. Save two consecutive all-loser rounds, then a normal eligible round. Verify x4 scores persist after reload with no override state.
11. Explicitly edit one score with a reason. Verify the Edited marker and Restore Original appear only for that genuine edit.
12. Export and re-import a backup, and export markdown/CSV. Verify Dash Call, Risk, x2/x4 scores, and totals remain consistent.
13. Repeat the carry check with a high-contract player and verify the established high-contract exclusion remains unchanged.

## Remaining risks

- The optional additive `riskTypes` field is normalized from legacy `riskType` and stored bids; old documents without bid metadata cannot recover a classification they never stored.
- The Vite bundle remains above the default 500 kB advisory threshold; this predates Round 2 and does not block the build.
- Hosted CI and manual UAT against the deployed preview remain pending until the isolated branch is pushed and the draft PR is opened.
