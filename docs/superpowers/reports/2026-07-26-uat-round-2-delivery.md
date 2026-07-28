# UAT Round 2 Delivery Report

**Date:** 2026-07-26
**Branch:** `fix/uat-round-2-findings`
**Source:** `feature/react-vite-frontend-prototype` at `b84ecf3`
**Status:** House Rules zero-estimate follow-up published, deployed, and verified on stable shared UAT
**Draft PR:** https://github.com/plusmaloma-dev/estimation-score-calculator/pull/15

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

## Follow-up fixes

### Accepted-estimate suggestion

- The centered actual-tricks picker now marks the player's accepted estimate with a
  gold `Est.` suggestion state and an accessible “matches estimate” label.
- When no actual value is selected, keyboard focus starts on the accepted estimate.
- A previously selected actual remains the selected and initially focused value even
  when it differs from the estimate.
- Estimate entry continues to use the same picker without an actual-value suggestion.

### Legacy carried-score reconciliation

- Opening an online snapshot now compares stored round rows with the authoritative
  chronological engine result.
- For a round/player without an explicit override audit, the engine score is used as
  the current applied score. This repairs legacy x2/x4 rows that were stored before
  the authoritative full-game save fix.
- An explicit override remains active only while its persisted applied score differs
  from the calculated score. Restoring the calculated value retains immutable audit
  history without preserving a stale override state.
- Restored overrides retain immutable audit history but no longer show `Edited` when
  their current applied score equals the calculated score.
- No data migration is required and no audit records are synthesized.

Follow-up RED evidence:

- picker-focused tests failed three assertions before `suggestedValue` existed;
- the legacy carry snapshot test expected `[50, 28, 24, -24]` and received the
  historical unmultiplied `[25, 14, 12, -12]`.

Follow-up GREEN evidence:

- picker/current-round focused suite: 20 tests passed;
- carry reconciliation/view-model focused suite: 11 tests passed;
- full `npm run ci`: both typechecks passed, 188 engine tests passed, 100 UI tests
  passed across 24 files, and the production build passed.

The current bundle is 514.91 kB minified and 145.24 kB gzip. The existing Vite
chunk-size advisory remains non-blocking.

## House Rules Under zero-estimate adjustment

### Approved behavior

- House Rules V1 adds `+10` after normal role scoring when a player estimates
  normal `0` in an Under round and takes `0` actual tricks.
- House Rules V1 adds `-10` after normal role scoring when that player takes
  more than `0` actual tricks.
- The adjustment is applied before Risk, Only Winner/Loser, the chronological
  all-loser carry multiplier, and Multiple WITH.
- Dash Call, Dash, Over rounds, invalid exact-13 rounds, and Federation 2026
  are excluded.
- All-loser precedence remains authoritative: all four players score `0` and
  the multiplier carries to the next eligible round.
- The rule is derived from existing bids and results. It adds no UI toggle,
  schema field, migration, override audit, or `Edited` marker.

### Verification evidence

The focused RED test observed the previous normal scores of `10` instead of
`20` and `-2` instead of `-12`. After the scoring modifier was implemented,
eight focused engine cases passed, covering success, failure, modifier order,
Dash Call, Over, exact-13, Federation 2026, and all-loser precedence.

The online integration fixture persists a carried successful zero estimate as
`calculated_score === applied_score === 40`, reopens it as `40`, and creates no
override. The x4 follow-up reopens the same player at `80`. Focused online and
view-model verification passed 10 tests across two files.

Full validation:

```text
npm run ci
```

Result:

- engine typecheck: passed;
- React/app typecheck: passed;
- engine tests: 196 passed;
- UI tests: 100 passed across 24 files;
- production Vite build: passed.

The current main JS output is 515.41 kB minified and 145.40 kB gzip. The
pre-existing chunk-size advisory remains non-blocking.

No Supabase migration changed. The existing four timestamped migrations remain
in their deterministic order, and no environment file, credential, token, or
generated Vercel metadata is part of this change.

### Stable UAT evidence

- Verified source revision: `763bdaf8e3380aa54fcfc5ce30ede8b80e0765a7`.
- READY deployment: `dpl_93EfikjNX6PcmiEaJp5oAtdbDq8D`.
- Deployment URL:
  `https://estimation-score-calculator-jzhpnxr68-plusmaloma-6068s-projects.vercel.app`.
- Stable alias:
  `https://estimation-score-calculator-uat.vercel.app`.
- Authenticated test game: `UAT Under Zero 763bdaf`, House Rules V1.
- Normal Under `0`, actual `0`: displayed and persisted `+20`.
- Normal Under `0`, actual `2`: displayed and persisted `-12`.
- Under Dash Call `0`, actual `0`: displayed `+35`, proving the normal-zero
  adjustment is excluded.
- An all-loser Under round displayed four `0` scores and left running totals
  unchanged.
- The next eligible round consumed the carried x2 multiplier and displayed
  `+50`, `+26`, `+40`, and `-46`; the zero estimator's base `+20` was therefore
  multiplied to `+40`.
- Every save completed through the online RPC and reloaded the authoritative
  game snapshot. No `Edited` marker or override state appeared on any
  system-calculated row.
- Final fresh `npm run ci` result: 196 engine tests, 100 UI tests, both
  typechecks, and the production build passed.

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
- The Vite bundle remains above the default 500 kB advisory threshold:
  515.41 kB minified and 145.40 kB gzip. This predates Round 2 and does not
  block the build.
