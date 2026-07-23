# Bidding, WITH/Hold, Risk, and Score Overrides Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a stable pre-round bidding workflow with explicit bid ownership, multiple WITH players, Follow/Hold decisions, Risk assignment from the finalized sequence, a whole-round multiple-WITH x2 modifier, and audited completed-round score overrides.

**Architecture:** Replace highest-estimate re-inference in the React reducer with an explicit bidding-state machine that stores the bid owner, WITH/Hold roles, pending decisions, and frozen round metadata. Extend the framework-neutral round input and persistence models only where needed, calculate the multiple-WITH multiplier through the existing scoring context, and store applied-score overrides separately from immutable calculated scores so totals and rankings can be rebuilt deterministically.

**Tech Stack:** TypeScript, React, Vite, Vitest, Testing Library, Node test runner, existing scoring and persistence services.

## Global Constraints

- Exactly four players and 13 actual tricks per completed round.
- Individual estimates are integers from 0 through 12; total estimates must not equal 13.
- Blank estimates count as zero before confirmation.
- Equal highest estimates never transfer bid ownership or trump.
- A strict overbid transfers ownership and requires a new trump selection.
- Every active WITH player must choose Follow or Hold after the owner raises.
- Hold players retain the previous estimate, receive normal scoring, remain annotated `H`, and are excluded from Risk-candidate and multiple-WITH counts.
- Risk activates only at the configured threshold; Hold alone never creates Risk.
- Two or more active WITH players apply x2 to every player's fully calculated score as the last scoring step.
- Original calculated scores and override audit records are immutable.
- Applied overrides drive cumulative totals and rankings.
- Legacy stored score sheets must continue to open.
- Use test-driven development: commit failing tests before production changes for each slice.

---

## File Map

### New files

- `src/app/scoreSheet/biddingState.ts` — explicit bidding-state transition helpers and derived rules.
- `src/app/scoreSheet/biddingState.test.ts` — state-machine tests for ownership, Follow/Hold, Risk, and multiplier.
- `src/services/ScoreOverrideService.ts` — validation and append-only override application.
- `tests/scoreOverrideService.test.ts` — domain/service override tests.
- `src/app/components/ScoreOverrideDialog.tsx` — completed-round override UI.
- `src/app/components/ScoreOverrideDialog.test.tsx` — dialog validation and submission tests.

### Modified files

- `src/app/scoreSheet/currentRoundReducer.ts` and test — delegate bidding transitions and add phases/actions.
- `src/app/components/CurrentRoundRow.tsx` and test — render owner, W, H, pending Follow/Hold controls, Risk, and multiplier.
- `src/app/screens/ScoreSheetScreen.tsx` and test — serialize frozen bidding metadata, pass x2, and open score override UI.
- `src/domain/bid.ts` — add `hold` bid type for persisted/displayed accepted estimates.
- `src/services/BidValidationService.ts` and `tests/roundEstimateValidation.test.ts` — validate Hold as normal-scoring non-WITH status.
- `src/scoring/types.ts`, `src/scoring/ScoreCalculationService.ts`, `src/scoring/ConfigurableScoringStrategy.ts`, and scoring tests — carry and apply multiple-WITH x2 last, including high contracts.
- `src/services/EstimationMvpService.ts` — carry round metadata and applied score overrides into game aggregation.
- `src/persistence/types.ts`, all repositories, and repository tests — persist round metadata and override audits backward-compatibly.
- `src/ui/BrowserUiShellService.ts` and `tests/browserUiShellService.test.ts` — expose override command and applied-score history.
- `src/services/LeaderboardService.ts` — aggregate applied scores when present.
- `src/app/scoreSheet/scoreSheetViewModel.ts` and test — display H, override markers, immutable calculated score, and applied score.
- `src/app/components/ScoreSheetTable.tsx` and test — add Edit scores entry point and override marker.
- `src/app/styles/app.css` — Follow/Hold and override dialog styling; maintain fit-to-screen table behavior.
- `src/index.ts`, `BACKLOG.md`, and `PROJECT_LOG.md` — exports and delivery evidence.

---

### Task 1: Explicit Bidding State and Stable Trump Ownership

**Files:**
- Create: `src/app/scoreSheet/biddingState.ts`
- Create: `src/app/scoreSheet/biddingState.test.ts`
- Modify: `src/app/scoreSheet/currentRoundReducer.ts`
- Modify: `src/app/scoreSheet/currentRoundReducer.test.ts`

**Interfaces:**
- Produces `BiddingPlayerStatus = 'normal' | 'with' | 'hold'`.
- Produces `BiddingState`, `setBiddingEstimate`, `setBiddingTrump`, `resolveFollow`, `resolveHold`, `confirmBidding`, `resolveRiskPlayerId`, and `resolveMultipleWithMultiplier`.
- `CurrentRoundDraft` stores `bidding`, `phase: 'estimating' | 'awaiting-follow-decisions' | 'actuals'`.

- [ ] **Step 1: Write failing tests**

Add cases proving:

```ts
it('keeps P1 as owner and keeps trump when P3 follows a raise', () => {
  let state = createBiddingState(['P1', 'P2', 'P3', 'P4']);
  state = setBiddingEstimate(state, 'P1', 4);
  state = setBiddingTrump(state, 'hearts');
  state = setBiddingEstimate(state, 'P3', 4);
  state = setBiddingEstimate(state, 'P1', 5);
  expect(state.pendingDecisionPlayerIds).toEqual(['P3']);
  state = resolveFollow(state, 'P3');
  expect(state.bidOwnerPlayerId).toBe('P1');
  expect(state.trumpSuit).toBe('hearts');
  expect(state.statusByPlayerId.P3).toBe('with');
  expect(state.estimatesByPlayerId.P3).toBe(5);
});

it('marks multiple former With players Hold and assigns Risk to the remaining eligible caller', () => {
  // P1 owner; P3/P4 With; P1 raises; P3/P4 Hold; P2 is candidate.
});

it('transfers owner only on a strict overbid and clears old trump', () => {
  // P3 enters 6 above P1's 5 and becomes owner; trump becomes undefined.
});
```

- [ ] **Step 2: Run the focused tests to verify red**

Run: `npm run test:app -- --run src/app/scoreSheet/biddingState.test.ts src/app/scoreSheet/currentRoundReducer.test.ts`

Expected: FAIL because the bidding-state module and new transitions do not exist.

- [ ] **Step 3: Implement the minimal state machine**

Use an immutable state shape:

```ts
export interface BiddingState {
  readonly playerOrder: readonly string[];
  readonly estimateEntryOrder: readonly string[];
  readonly estimatesByPlayerId: Readonly<Record<string, number | undefined>>;
  readonly statusByPlayerId: Readonly<Record<string, BiddingPlayerStatus>>;
  readonly bidOwnerPlayerId?: string;
  readonly winningEstimate: number;
  readonly trumpSuit?: ContractSuit;
  readonly pendingDecisionPlayerIds: readonly string[];
  readonly previousWithEstimateByPlayerId: Readonly<Record<string, number | undefined>>;
  readonly confirmed: boolean;
}
```

Transition rules:

- First positive/highest estimate establishes owner.
- Equal current winning estimate sets non-owner status to `with` and preserves owner/trump.
- Owner increase snapshots every active WITH player's previous estimate and creates pending decisions.
- Follow sets estimate to winning estimate, keeps `with`, removes pending decision.
- Hold restores/sustains previous estimate, sets `hold`, removes pending decision.
- Strictly higher non-owner estimate becomes owner, clears trump, resets obsolete WITH/Hold links to normal unless they explicitly match/follow the new owner.
- Confirmation fails while decisions remain, trump is missing, total is 13, or no positive estimate exists.

- [ ] **Step 4: Integrate the state machine into `CurrentRoundDraft`**

Keep actuals in the reducer, delegate estimate/trump/Follow/Hold transitions to `biddingState.ts`, normalize blanks to zero only during confirmation, and freeze the entire bidding state before entering actuals.

- [ ] **Step 5: Run focused and full app tests**

Run: `npm run test:app -- --run src/app/scoreSheet/biddingState.test.ts src/app/scoreSheet/currentRoundReducer.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/scoreSheet/biddingState.ts src/app/scoreSheet/biddingState.test.ts src/app/scoreSheet/currentRoundReducer.ts src/app/scoreSheet/currentRoundReducer.test.ts
git commit -m "feat: model explicit bidding ownership and hold"
```

---

### Task 2: Current-Round Follow/Hold UI and Finalized Risk

**Files:**
- Modify: `src/app/components/CurrentRoundRow.tsx`
- Modify: `src/app/components/CurrentRoundRow.test.tsx`
- Modify: `src/app/styles/app.css`

**Interfaces:**
- Consumes the Task 1 reducer actions `follow-with`, `hold-with`, `accept-estimates`.
- Emits a frozen `CurrentRoundDraft` through `onSave`.

- [ ] **Step 1: Write failing component tests**

Cover:

```tsx
expect(screen.getByLabelText('Rami trump')).toHaveValue('hearts');
expect(screen.queryByLabelText('Mona trump')).not.toBeInTheDocument();
expect(screen.getByRole('button', { name: 'Mona follow 5' })).toBeEnabled();
expect(screen.getByRole('button', { name: 'Mona hold 4' })).toBeEnabled();
```

Also prove two Hold players show `H`, the remaining eligible player shows `R` only when threshold activates, and Accept estimates remains disabled while a decision is pending.

- [ ] **Step 2: Verify red**

Run: `npm run test:app -- --run src/app/components/CurrentRoundRow.test.tsx`

Expected: FAIL because Follow/Hold controls and H annotations do not exist.

- [ ] **Step 3: Render explicit roles**

- Trump selector only in owner cell.
- `W`, `H`, and Risk annotation can coexist where rules allow.
- Pending players receive explicit Follow and Hold buttons.
- Summary shows `Multiple WITH: x2` only when two or more active WITH players remain.
- Accept estimates is disabled until all pending decisions resolve.

- [ ] **Step 4: Add compact responsive styles**

Use wrapping controls, no fixed pixel/rem table width, and compact action buttons that fit inside player subcolumns.

- [ ] **Step 5: Run component and app tests**

Run: `npm run test:app -- --run src/app/components/CurrentRoundRow.test.tsx`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/components/CurrentRoundRow.tsx src/app/components/CurrentRoundRow.test.tsx src/app/styles/app.css
git commit -m "feat: add follow and hold bidding controls"
```

---

### Task 3: Persist Hold Status and Apply Multiple-WITH x2 Last

**Files:**
- Modify: `src/domain/bid.ts`
- Modify: `src/services/BidValidationService.ts`
- Modify: `tests/roundEstimateValidation.test.ts`
- Modify: `src/scoring/types.ts`
- Modify: `src/scoring/ScoreCalculationService.ts`
- Modify: `src/scoring/ConfigurableScoringStrategy.ts`
- Modify: scoring tests under `tests/`
- Modify: `src/services/EstimationMvpService.ts`

**Interfaces:**
- Add `hold` to `BidType`.
- Add optional `multipleWithMultiplier?: 1 | 2` to `MvpRoundInput` and `RoundScoreInput`.
- Hold resolves to normal `other-player` scoring.

- [ ] **Step 1: Write failing engine tests**

Create cases proving:

```ts
assert.equal(holdPlayer.role, 'other-player');
assert.equal(holdPlayer.riskType, 'none');
assert.equal(twoWithRound.playerScores[0]?.score, expectedFullyCalculatedScore * 2);
```

Include a high-contract case to prove the multiple-WITH x2 is still applied last even though the existing carried all-loser round multiplier intentionally excludes high contracts.

- [ ] **Step 2: Verify red**

Run: `npm run test:core`

Expected: FAIL on unsupported `hold` and missing multiple-WITH modifier.

- [ ] **Step 3: Implement validation and role behavior**

- Accept `hold` only in `round-estimates` mode.
- Reject Hold when its estimate equals the final highest estimate; such a player must be WITH.
- Reject Hold as the bid owner.
- Treat Hold as `other-player` in `resolveRole` and `none` in `resolveRiskType` unless that player is the separately assigned Risk player.

- [ ] **Step 4: Apply the x2 modifier last**

Keep the existing `roundMultiplier` semantics for carried all-loser multipliers. Add a separate `multipleWithMultiplier`, pass it through `ScoreContext`, and call `applyMultipleWithMultiplier` after all existing scoring paths, including high contracts.

```ts
private applyMultipleWithMultiplier(score: number, context: ScoreContext, notes: string[]): number {
  const multiplier = context.multipleWithMultiplier ?? 1;
  if (multiplier === 1) return score;
  notes.push('Multiple With multiplier applied: x2.');
  return score * multiplier;
}
```

- [ ] **Step 5: Run core tests**

Run: `npm run test:core`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/domain/bid.ts src/services/BidValidationService.ts tests src/scoring src/services/EstimationMvpService.ts
git commit -m "feat: score hold normally and double multi-with rounds"
```

---

### Task 4: Save Frozen Bidding Metadata from the Score Sheet

**Files:**
- Modify: `src/app/screens/ScoreSheetScreen.tsx`
- Modify: `src/app/screens/ScoreSheetScreen.test.tsx`
- Modify: `src/ui/BrowserUiShellService.ts`
- Modify: `tests/browserUiShellService.test.ts`

**Interfaces:**
- `UiRoundEntryInput` carries `multipleWithMultiplier` and finalized bids with `normal`, `with`, or `hold`.
- `riskPlayerId` comes from the frozen finalized state, never re-derived during save.

- [ ] **Step 1: Write failing screen and shell tests**

Prove the serialized input contains:

```ts
{
  bidOwnerPlayerId: 'P1',
  riskPlayerId: 'P2',
  multipleWithMultiplier: 2,
  bids: [
    { playerId: 'P1', bidType: 'normal', tricks: 5, trumpSuit: 'hearts' },
    { playerId: 'P2', bidType: 'normal', tricks: 1 },
    { playerId: 'P3', bidType: 'with', tricks: 5, withTargetPlayerId: 'P1' },
    { playerId: 'P4', bidType: 'with', tricks: 5, withTargetPlayerId: 'P1' },
  ],
}
```

Add another case with P3/P4 Hold and P2 Risk.

- [ ] **Step 2: Verify red**

Run: `npm run test:app -- --run src/app/screens/ScoreSheetScreen.test.tsx && npm run test:core`

Expected: FAIL because frozen statuses and multiplier are not serialized.

- [ ] **Step 3: Serialize from frozen state**

Do not call `resolveHighestEstimatePlayerId` or infer W/H during save. Read `bidOwnerPlayerId`, statuses, trump, Risk, and multiplier from the accepted `CurrentRoundDraft`.

- [ ] **Step 4: Run focused tests**

Run: `npm run test:app -- --run src/app/screens/ScoreSheetScreen.test.tsx && npm run test:core`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/screens/ScoreSheetScreen.tsx src/app/screens/ScoreSheetScreen.test.tsx src/ui/BrowserUiShellService.ts tests/browserUiShellService.test.ts
git commit -m "feat: save finalized bidding metadata"
```

---

### Task 5: Audited Score Override Domain and Persistence

**Files:**
- Create: `src/services/ScoreOverrideService.ts`
- Create: `tests/scoreOverrideService.test.ts`
- Modify: `src/persistence/types.ts`
- Modify: `src/persistence/InMemoryScoreSheetRepository.ts`
- Modify: `src/persistence/LocalStorageScoreSheetRepository.ts`
- Modify: `src/persistence/DocumentScoreSheetRepository.ts`
- Modify: repository tests
- Modify: `src/services/EstimationMvpService.ts`
- Modify: `src/services/LeaderboardService.ts`
- Modify: `src/index.ts`

**Interfaces:**

```ts
export interface ScoreOverrideAuditRecord {
  readonly id: string;
  readonly roundNumber: number;
  readonly playerId: string;
  readonly calculatedScore: number;
  readonly previousAppliedScore: number;
  readonly newAppliedScore: number;
  readonly reason: string;
  readonly changedAtIso: string;
  readonly actorId: string;
}

export interface ScoreOverrideInput {
  readonly roundNumber: number;
  readonly overridesByPlayerId: Readonly<Record<string, number>>;
  readonly reason: string;
  readonly changedAtIso?: string;
  readonly actorId?: string;
}
```

Persist `scoreOverrides?: readonly ScoreOverrideAuditRecord[]` on `PersistedScoreSheet`.

- [ ] **Step 1: Write failing service tests**

Cover integer validation, mandatory reason, at least one changed score, immutable calculated score, append-only audit, restore-original audit, and recalculated leaderboard totals from the edited round forward.

- [ ] **Step 2: Verify red**

Run: `npm run test:core`

Expected: FAIL because the service and persistence fields do not exist.

- [ ] **Step 3: Implement applied-score resolution**

`ScoreOverrideService` resolves each round/player's applied score by taking the latest audit record, falling back to the immutable calculated score. It returns a new audit list and a rebuilt `MvpGameResult`/leaderboard without mutating historical calculated score results.

- [ ] **Step 4: Extend repositories backward-compatibly**

Missing `scoreOverrides` must load as an empty list. Save the property only when non-empty or consistently normalize to `[]`; do not increment the storage key/version unless the stored envelope shape becomes incompatible.

- [ ] **Step 5: Run core tests**

Run: `npm run test:core`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/services/ScoreOverrideService.ts tests/scoreOverrideService.test.ts src/persistence src/services/EstimationMvpService.ts src/services/LeaderboardService.ts src/index.ts
git commit -m "feat: add audited score override service"
```

---

### Task 6: Browser Shell Override Command

**Files:**
- Modify: `src/ui/BrowserUiShellService.ts`
- Modify: `tests/browserUiShellService.test.ts`

**Interfaces:**

```ts
export interface UiOverrideRoundScoresInput extends ScoreOverrideInput {}
export interface UiOverrideRoundScoresResult extends UiValidationResult {
  readonly scoreSheet?: PersistedScoreSheet;
  readonly gameResult?: MvpGameResult;
}
```

Add `overrideRoundScores(scoreSheetId, input): UiOverrideRoundScoresResult`.

- [ ] **Step 1: Write failing shell tests**

Create a two-round game, override round 1 for one player, and assert:

- round 1 original calculated score is unchanged;
- applied score changes;
- round 2 cumulative total and final leaderboard reflect the override;
- audit fields contain old/new score, reason, actor, and timestamp;
- restore original creates a second record.

- [ ] **Step 2: Verify red**

Run: `npm run test:core`

Expected: FAIL because the shell command does not exist.

- [ ] **Step 3: Implement shell command**

Load the sheet, validate/apply through `ScoreOverrideService`, save the same sheet id with updated overrides and rebuilt game result, then return the saved model.

- [ ] **Step 4: Run core tests**

Run: `npm run test:core`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/BrowserUiShellService.ts tests/browserUiShellService.test.ts
git commit -m "feat: expose score override through browser shell"
```

---

### Task 7: Completed-Round Edit Scores UI

**Files:**
- Create: `src/app/components/ScoreOverrideDialog.tsx`
- Create: `src/app/components/ScoreOverrideDialog.test.tsx`
- Modify: `src/app/scoreSheet/scoreSheetViewModel.ts`
- Modify: `src/app/scoreSheet/scoreSheetViewModel.test.ts`
- Modify: `src/app/components/ScoreSheetTable.tsx`
- Modify: `src/app/components/ScoreSheetTable.test.tsx`
- Modify: `src/app/screens/ScoreSheetScreen.tsx`
- Modify: `src/app/screens/ScoreSheetScreen.test.tsx`
- Modify: `src/app/styles/app.css`

**Interfaces:**
- Round cells expose `calculatedScore`, `appliedScore`, and `overridden`.
- Table emits `onEditScores(roundNumber)`.
- Dialog emits integer override map plus mandatory reason.

- [ ] **Step 1: Write failing UI tests**

Prove:

- every completed row has an accessible `Edit scores for round N` button;
- dialog shows calculated and applied values;
- Save is disabled for empty reason or no changed score;
- submit calls shell override command;
- successful save closes dialog and refreshes totals;
- overridden cells have a visible `Edited` marker and accessible original-score text;
- Restore original requires a reason and submits the calculated value.

- [ ] **Step 2: Verify red**

Run: `npm run test:app -- --run src/app/components/ScoreOverrideDialog.test.tsx src/app/components/ScoreSheetTable.test.tsx src/app/screens/ScoreSheetScreen.test.tsx`

Expected: FAIL because override UI is absent.

- [ ] **Step 3: Implement view-model applied-score projection**

Use the latest audit record per round/player. Cumulative values and header totals use applied scores; `calculatedScore` remains available for the marker and dialog.

- [ ] **Step 4: Implement dialog and table entry point**

Use a semantic `dialog`, labelled fields, integer number inputs, reason textarea, Cancel, Restore, and Save controls. Do not allow editing estimates or actual tricks in this dialog.

- [ ] **Step 5: Connect screen refresh**

Extend `ScoreSheetShellPort` with `overrideRoundScores`, handle validation errors in the existing error summary pattern, and refresh after a valid result.

- [ ] **Step 6: Run app tests**

Run: `npm run test:app`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/app/components/ScoreOverrideDialog.tsx src/app/components/ScoreOverrideDialog.test.tsx src/app/scoreSheet/scoreSheetViewModel.ts src/app/scoreSheet/scoreSheetViewModel.test.ts src/app/components/ScoreSheetTable.tsx src/app/components/ScoreSheetTable.test.tsx src/app/screens/ScoreSheetScreen.tsx src/app/screens/ScoreSheetScreen.test.tsx src/app/styles/app.css
git commit -m "feat: add completed round score editing"
```

---

### Task 8: Responsive Verification, Documentation, and Full CI

**Files:**
- Modify: `src/app/styles/app.css`
- Modify: `src/app/components/ScoreSheetTable.test.tsx`
- Modify: `BACKLOG.md`
- Modify: `PROJECT_LOG.md`
- Modify: PR #11 body/comment

**Interfaces:**
- No new production API.

- [ ] **Step 1: Add layout regression assertions**

Assert the table retains the proportional colgroup, no fixed `max-content`/large `rem` width is reintroduced, and compact labels/controls remain present.

- [ ] **Step 2: Run the complete validation suite**

Run:

```bash
npm run ci
```

Expected:

- core typecheck PASS;
- app typecheck PASS;
- all Node tests PASS;
- all Vitest tests PASS;
- Vite production build PASS.

- [ ] **Step 3: Review implementation against the design**

Confirm every design requirement has at least one passing test: owner stability, strict transfer, multiple W, Follow/Hold, Risk candidate, threshold, x2-last, persistence, override reason/audit, restore, downstream totals, marker, and responsive layout.

- [ ] **Step 4: Update project records**

Record red/green CI run identifiers and update the overall prototype completion percentage.

- [ ] **Step 5: Commit**

```bash
git add src/app/styles/app.css src/app/components/ScoreSheetTable.test.tsx BACKLOG.md PROJECT_LOG.md
git commit -m "docs: record bidding and score override delivery"
```

- [ ] **Step 6: Verify the final branch commit through GitHub Actions**

Expected: pull-request workflow concludes `success` on the latest head commit.
