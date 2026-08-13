# All-Loser Carry Multiplier Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement skipped all-loser rounds with a linear carried multiplier of ×2, ×4, ×6, and so on, consumed by the next scored round and stacked multiplicatively with Multiple WITH.

**Architecture:** Keep all-loser detection and carry progression in the game-level scoring flow, where rounds are already processed chronologically. Each round result will expose immutable metadata describing whether it was skipped, the carry entering the round, and the applied multiplier. Existing per-player scoring remains responsible for normal role and modifier calculation; the game-level flow zeroes skipped rounds and applies the carried multiplier to the next scored round before cumulative totals and leaderboard calculations.

**Tech Stack:** TypeScript, Node.js, React 19, Vite, Vitest, Testing Library, existing scoring and persistence services.

## Global Constraints

- An all-loser round is valid and persisted, but every applied player score is `0`.
- A consecutive sequence carries `2 × consecutiveAllLoserCount`: ×2, ×4, ×6, and so on.
- The progression is linear, not exponential.
- The first subsequent non-all-loser round consumes the full carry exactly once, then the carry resets.
- The carried multiplier applies to all player roles and all contract sizes; there is no high-contract exception.
- The carried multiplier stacks multiplicatively with Multiple WITH.
- All-loser classification uses original estimate-versus-actual outcomes, never manual score overrides.
- No score-table column, dotted-line styling, multiplier badge, or broader UI redesign is included.
- Existing saved data without new metadata must remain readable through replay-derived defaults.

---

## File Map

- `src/scoring/types.ts`: add round-result metadata for all-loser classification and carried multiplier auditability.
- `src/services/EstimationMvpService.ts`: process rounds chronologically, detect all-loser rounds, carry/reset the multiplier, and apply zero or multiplied scores before totals.
- `src/scoring/ConfigurableScoringStrategy.ts`: remove the high-contract exclusion for the generic round multiplier path, while keeping Multiple WITH as the final independent multiplier.
- `tests/allLoserCarryMultiplier.test.ts`: focused domain/service tests for skip, accumulation, reset, high contracts, negative scores, and Multiple WITH stacking.
- `tests/browserUiShellService.test.ts`: persistence/reopen and leaderboard consistency tests.
- `src/app/screens/ScoreSheetScreen.test.tsx`: one integration test proving displayed totals stay unchanged for a skipped round and the next saved round is multiplied without adding UI columns.

### Task 1: Add round metadata and failing carry tests

**Files:**
- Modify: `src/scoring/types.ts`
- Create: `tests/allLoserCarryMultiplier.test.ts`

**Interfaces:**
- Produces on each round result:
  - `isAllLoserRound: boolean`
  - `consecutiveAllLoserCountBeforeRound: number`
  - `carriedAllLoserMultiplier: number`
  - `carryConsumed: boolean`
- Existing `RoundScoreResult.playerScores` remains the source of applied round scores.

- [ ] **Step 1: Extend round-result metadata types**

Add fields to the round-level result interface used by `MvpRoundResult` or its nested score result:

```ts
readonly isAllLoserRound: boolean;
readonly consecutiveAllLoserCountBeforeRound: number;
readonly carriedAllLoserMultiplier: number;
readonly carryConsumed: boolean;
```

Use defaults compatible with legacy single-round calculation:

```ts
isAllLoserRound: false,
consecutiveAllLoserCountBeforeRound: 0,
carriedAllLoserMultiplier: 1,
carryConsumed: false,
```

- [ ] **Step 2: Write the first failing test for one skipped round and ×2 carry**

Create `tests/allLoserCarryMultiplier.test.ts` with a helper that builds valid four-player rounds. Add a test shaped like:

```ts
test('all four losers score zero and the next scored round is multiplied by two', () => {
  const result = service.calculateGame({
    playerOrder: ['A', 'B', 'C', 'D'],
    rounds: [allLoserRound, scoredRound],
  });

  expect(result.valid).toBe(true);
  expect(result.rounds[0]?.isAllLoserRound).toBe(true);
  expect(result.rounds[0]?.playerScores.map((score) => score.score)).toEqual([0, 0, 0, 0]);
  expect(result.rounds[1]?.carriedAllLoserMultiplier).toBe(2);
  expect(result.rounds[1]?.carryConsumed).toBe(true);
  expect(result.rounds[1]?.playerScores.map((score) => score.score)).toEqual(
    expectedBaseScores.map((score) => score * 2),
  );
});
```

Use concrete bids and actual tricks whose totals are valid and whose first round makes all four players fail.

- [ ] **Step 3: Run the focused test and verify failure**

Run:

```bash
npm test -- tests/allLoserCarryMultiplier.test.ts
```

Expected: FAIL because all-loser metadata and carry behavior are not implemented.

- [ ] **Step 4: Commit the red test and type contract**

```bash
git add src/scoring/types.ts tests/allLoserCarryMultiplier.test.ts
git commit -m "test: define all-loser carry multiplier behavior"
```

### Task 2: Implement chronological all-loser carry processing

**Files:**
- Modify: `src/services/EstimationMvpService.ts`
- Test: `tests/allLoserCarryMultiplier.test.ts`

**Interfaces:**
- Consumes ordinary per-round scores from `calculateRound`.
- Produces chronological round results with applied scores and carry metadata.
- The carry state is local to `calculateGame` and is rebuilt from round history on every recalculation.

- [ ] **Step 1: Add a pure all-loser predicate**

Add a private helper:

```ts
private isAllLoserRound(round: MvpRoundResult): boolean {
  return round.valid
    && round.playerScores.length === 4
    && round.playerScores.every((score) => score.outcome === 'failed');
}
```

Use the actual outcome property name from the existing player score result. Do not infer from numeric score signs.

- [ ] **Step 2: Add a pure score transformation helper**

Add a helper that returns a new round result without mutating the original:

```ts
private applyAllLoserCarry(
  round: MvpRoundResult,
  consecutiveAllLoserCountBeforeRound: number,
): MvpRoundResult {
  const isAllLoserRound = this.isAllLoserRound(round);

  if (isAllLoserRound) {
    return {
      ...round,
      isAllLoserRound: true,
      consecutiveAllLoserCountBeforeRound,
      carriedAllLoserMultiplier: 1,
      carryConsumed: false,
      playerScores: round.playerScores.map((score) => ({ ...score, score: 0 })),
    };
  }

  const carriedAllLoserMultiplier = consecutiveAllLoserCountBeforeRound === 0
    ? 1
    : consecutiveAllLoserCountBeforeRound * 2;

  return {
    ...round,
    isAllLoserRound: false,
    consecutiveAllLoserCountBeforeRound,
    carriedAllLoserMultiplier,
    carryConsumed: carriedAllLoserMultiplier > 1,
    playerScores: round.playerScores.map((score) => ({
      ...score,
      score: score.score * carriedAllLoserMultiplier,
      notes: carriedAllLoserMultiplier > 1
        ? [...score.notes, `All-loser carry multiplier applied: x${carriedAllLoserMultiplier}.`]
        : score.notes,
    })),
  };
}
```

Adjust field names to the existing score-result type exactly.

- [ ] **Step 3: Process rounds sequentially in `calculateGame`**

Replace any independent `map(calculateRound)` flow with a chronological loop:

```ts
let consecutiveAllLoserCount = 0;
const rounds: MvpRoundResult[] = [];

for (const input of gameInput.rounds) {
  const calculated = this.calculateRound(input);
  if (!calculated.valid) {
    rounds.push(calculated);
    continue;
  }

  const applied = this.applyAllLoserCarry(calculated, consecutiveAllLoserCount);
  rounds.push(applied);

  if (applied.isAllLoserRound) {
    consecutiveAllLoserCount += 1;
  } else {
    consecutiveAllLoserCount = 0;
  }
}
```

Build cumulative totals and leaderboard from the transformed `rounds`, not the pre-transform results.

- [ ] **Step 4: Run the focused test**

```bash
npm test -- tests/allLoserCarryMultiplier.test.ts
```

Expected: PASS for the single all-loser round and ×2 carry scenario.

- [ ] **Step 5: Run existing engine tests**

```bash
npm test -- tests/roundEstimateValidation.test.ts tests/multipleWithScoring.test.ts
```

Expected: PASS with no regression in bid validation or Multiple WITH.

- [ ] **Step 6: Commit the game-level carry implementation**

```bash
git add src/services/EstimationMvpService.ts tests/allLoserCarryMultiplier.test.ts
git commit -m "feat: carry all-loser multiplier across rounds"
```

### Task 3: Cover accumulation, reset, high contracts, negatives, and Multiple WITH

**Files:**
- Modify: `tests/allLoserCarryMultiplier.test.ts`
- Modify: `src/scoring/ConfigurableScoringStrategy.ts`
- Modify: `src/services/EstimationMvpService.ts`

**Interfaces:**
- `carriedAllLoserMultiplier` represents only the carry: 1, 2, 4, 6, and so on.
- `multipleWithMultiplier` remains a separate 1-or-2 multiplier.
- Final score equals ordinary calculated score × carried multiplier × Multiple WITH multiplier.

- [ ] **Step 1: Add failing accumulation and reset tests**

Add concrete tests:

```ts
test('two consecutive all-loser rounds carry x4 to the next scored round', () => {
  // Assert rounds 1 and 2 are zero; round 3 multiplier is 4.
});

test('three consecutive all-loser rounds carry x6 to the next scored round', () => {
  // Assert round 4 multiplier is 6.
});

test('carry resets after the next scored round', () => {
  // Sequence: loser, scored, scored. Assert multipliers 1, 2, 1.
});
```

Use explicit expected player scores, not snapshot-only assertions.

- [ ] **Step 2: Add a failing high-contract test**

```ts
test('a high-contract scored round consumes the same carried multiplier', () => {
  // First round all-loser; second round has winning estimate >= 8.
  // Assert its ordinary scores are doubled and no exception is applied.
});
```

- [ ] **Step 3: Remove the high-contract exclusion**

In `ConfigurableScoringStrategy.ts`, replace branches that deliberately skip `applyRoundMultiplier` for high contracts with the same modifier order used by normal contracts:

```ts
score = this.applyRisk(score, context, notes);
score = this.applyOnlyWinnerLoser(score, context, notes);
score = this.applyRoundMultiplier(score, context, notes);
score = this.applyMultipleWithMultiplier(score, context, notes);
```

Do not combine the two multiplier fields.

- [ ] **Step 4: Add failing negative-score and stacking tests**

```ts
test('carried multiplier applies to negative scores', () => {
  // Assert -5 with x2 becomes -10.
});

test('x4 carry and Multiple WITH x2 produce a total x8 effect', () => {
  // Two all-loser rounds followed by a scored round with multipleWithMultiplier: 2.
  // Assert each final score equals ordinary score * 8.
  // Assert carriedAllLoserMultiplier remains 4 in metadata.
});
```

- [ ] **Step 5: Run the focused suite**

```bash
npm test -- tests/allLoserCarryMultiplier.test.ts tests/multipleWithScoring.test.ts
```

Expected: PASS for ×2, ×4, ×6, reset, high contracts, negative scores, and ×8 stacking.

- [ ] **Step 6: Commit edge-case coverage**

```bash
git add src/scoring/ConfigurableScoringStrategy.ts src/services/EstimationMvpService.ts tests/allLoserCarryMultiplier.test.ts
git commit -m "fix: apply all-loser carry to every contract"
```

### Task 4: Verify persistence, reopen, overrides, and leaderboard consistency

**Files:**
- Modify: `tests/browserUiShellService.test.ts`
- Modify only if required by failing tests: `src/ui/BrowserUiShellService.ts`
- Modify only if required by serialization gaps: `src/persistence/types.ts`
- Modify only if required by backup gaps: `tests/scoreOverrideBackup.test.ts`

**Interfaces:**
- Reopening a score sheet recalculates or reads the same transformed game result.
- Manual score overrides change applied scores but never `isAllLoserRound` classification.
- Persisted round inputs remain the source for replay; derived result metadata may be regenerated.

- [ ] **Step 1: Add a failing save-and-reopen test**

```ts
test('browser shell preserves a pending all-loser carry across reopen', () => {
  const repository = new InMemoryScoreSheetRepository();
  const shell = new BrowserUiShellService(repository);
  const created = shell.createScoreSheet(/* four players */);

  shell.saveRound(created.scoreSheet!.id, allLoserRound);
  const reopened = shell.openSession(created.scoreSheet!.id);

  expect(reopened.gameResult?.rounds[0]?.isAllLoserRound).toBe(true);
  expect(reopened.leaderboard.map((entry) => entry.totalScore)).toEqual([0, 0, 0, 0]);

  shell.saveRound(created.scoreSheet!.id, scoredRound);
  const afterSecondReopen = shell.openSession(created.scoreSheet!.id);
  expect(afterSecondReopen.gameResult?.rounds[1]?.carriedAllLoserMultiplier).toBe(2);
});
```

- [ ] **Step 2: Add a failing override-classification test**

```ts
test('score overrides do not redefine an all-loser round', () => {
  // Save all-loser round, override one applied score, reopen.
  // Assert original round remains isAllLoserRound === true.
  // Assert later carry behavior is derived from original outcomes.
});
```

- [ ] **Step 3: Implement only the persistence normalization required by the tests**

Preferred behavior:

```ts
const calculatedGameResult = this.mvpService.calculateGame(scoreSheet.gameInput);
const appliedGameResult = this.scoreOverrideService.buildAppliedGameResult(
  calculatedGameResult,
  scoreSheet.scoreOverrides ?? [],
  scoreSheet.playerOrder,
);
```

Never infer all-loser status from overridden score values.

- [ ] **Step 4: Run persistence and override tests**

```bash
npm test -- tests/browserUiShellService.test.ts tests/scoreOverridePersistence.test.ts tests/scoreOverrideBackup.test.ts
```

Expected: PASS; leaderboard remains unchanged on skipped rounds, carry survives reopen, and overrides do not alter classification.

- [ ] **Step 5: Commit persistence integration**

```bash
git add tests/browserUiShellService.test.ts src/ui/BrowserUiShellService.ts src/persistence/types.ts tests/scoreOverrideBackup.test.ts
git commit -m "test: preserve all-loser carry through persistence"
```

Only stage files actually modified.

### Task 5: Add minimal React integration coverage without redesign

**Files:**
- Modify: `src/app/screens/ScoreSheetScreen.test.tsx`
- Modify only if required by failing test: `src/app/scoreSheet/scoreSheetViewModel.ts`

**Interfaces:**
- Existing table structure remains unchanged.
- Existing round and cumulative score cells display transformed applied scores from the view model.
- No new column, badge, dotted line, or strike-through is introduced.

- [ ] **Step 1: Add a failing UI integration test**

Add a test that drives the screen through two saved rounds using a real or test shell:

```ts
it('keeps totals unchanged for an all-loser round and shows multiplied scores on the next round', async () => {
  // Save a valid all-loser round.
  // Assert all cumulative totals remain at their previous values.
  // Save the next normal scored round.
  // Assert displayed round and cumulative scores equal ordinary scores ×2.
  // Assert the table header count is unchanged.
});
```

Also assert no deferred visual marker exists:

```ts
expect(screen.queryByText(/all-loser multiplier/i)).not.toBeInTheDocument();
```

- [ ] **Step 2: Run the focused React test**

```bash
npm test -- src/app/screens/ScoreSheetScreen.test.tsx
```

Expected: FAIL only where the view model does not yet expose transformed applied scores.

- [ ] **Step 3: Apply the smallest view-model correction if necessary**

Ensure `buildScoreSheetViewModel` reads the game result supplied by `openSession` and uses each transformed player score for:

```ts
roundScore
cumulativeScore
player.totalScore
```

Do not add any new presentational fields in this phase.

- [ ] **Step 4: Run React and view-model tests**

```bash
npm test -- src/app/screens/ScoreSheetScreen.test.tsx src/app/scoreSheet/scoreSheetViewModel.test.ts
```

Expected: PASS with the existing table dimensions and columns.

- [ ] **Step 5: Commit UI integration coverage**

```bash
git add src/app/screens/ScoreSheetScreen.test.tsx src/app/scoreSheet/scoreSheetViewModel.ts
git commit -m "test: display carried all-loser scores in score sheet"
```

Only stage the view-model file when it changed.

### Task 6: Full verification and delivery record

**Files:**
- Create: `docs/superpowers/reports/2026-07-23-all-loser-carry-multiplier-delivery.md`
- Modify only if required: `BACKLOG.md`

**Interfaces:**
- No new runtime interface.
- Delivery report records test evidence, commits, scope exclusions, and any legacy-data behavior.

- [ ] **Step 1: Run the complete test suite**

```bash
npm test
```

Expected: all Vitest and Node test suites pass.

- [ ] **Step 2: Run type-check and build**

```bash
npm run typecheck
npm run build
```

Expected: both commands exit successfully with no TypeScript errors.

- [ ] **Step 3: Inspect the final diff**

```bash
git diff --stat HEAD~5..HEAD
git status --short
```

Expected: only focused scoring, tests, optional persistence/view-model corrections, and documentation changes; working tree clean after commits.

- [ ] **Step 4: Write the delivery report**

Document:

```markdown
# All-Loser Carry Multiplier Delivery

- All-loser rounds persist with zero applied scores.
- Consecutive carry verified at ×2, ×4, and ×6.
- Carry reset verified after first scored round.
- High-contract behavior verified.
- Negative scores and Multiple WITH stacking verified.
- Persistence, reopen, override isolation, leaderboard, React display, type-check, build, and full tests verified.
- Deferred UI styling remains excluded.
```

- [ ] **Step 5: Commit delivery evidence**

```bash
git add docs/superpowers/reports/2026-07-23-all-loser-carry-multiplier-delivery.md BACKLOG.md
git commit -m "docs: record all-loser carry multiplier delivery"
```

Only stage `BACKLOG.md` when it changed.

- [ ] **Step 6: Verify GitHub Actions**

Push the branch, then inspect the pull-request workflow for the new head commit. Expected: all required jobs pass before requesting review or merge.
