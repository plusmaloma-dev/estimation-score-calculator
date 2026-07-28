# House Rules V1 Under-Round Zero-Estimate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `+10` to a successful normal zero estimate and `-10` to a failed normal zero estimate in House Rules V1 Under rounds.

**Architecture:** Implement one isolated House Rules modifier inside `ConfigurableScoringStrategy`, after normal role scoring and before existing Risk, Only Winner/Loser, carry, and Multiple WITH modifiers. Keep shared round orchestration and all-loser precedence in `ScoreCalculationService`, and verify that the existing online calculated/applied-score pipeline persists the result without override state.

**Tech Stack:** TypeScript, Node test runner, Vitest, React 19, Supabase-backed online services, Vite, Vercel.

## Global Constraints

- Apply only to `HOUSE_RULES_V1`.
- Apply only to a `normal` bid of `0` in an Under round.
- Add `+10` when actual tricks are `0`; add `-10` when actual tricks are above `0`.
- Exclude Dash Call, Dash, Over rounds, invalid exact-13 rounds, and Federation 2026.
- Apply the adjustment before existing Risk, Only Winner/Loser, carry, and Multiple WITH modifiers.
- Preserve House Rules all-loser precedence: all four scores remain `0` and carry normally.
- Do not add a UI control, persistence field, migration, override audit, or `Edited` marker.
- Keep the pull request draft and do not merge to `main`.
- Deploy and smoke-test through `https://estimation-score-calculator-uat.vercel.app`.

---

### Task 1: House Rules zero-estimate scoring modifier

**Files:**
- Create: `tests/underZeroEstimateAdjustment.test.ts`
- Modify: `src/scoring/ConfigurableScoringStrategy.ts`

**Interfaces:**
- Consumes: `ScoreContext.roundType`, `ScoreContext.playerBid`, `ScoreContext.evaluation`, and `ScoreContext.profile.ruleSet`
- Produces: `ConfigurableScoringStrategy.applyUnderZeroEstimateAdjustment(score, context, notes): number`

- [x] **Step 1: Write failing success and failure tests**

Create `tests/underZeroEstimateAdjustment.test.ts` with a helper that calls
`ScoreCalculationService.calculateRoundScore` using
`houseRulesV1ScoringProfile`.

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ScoreCalculationService,
  houseRulesV1ScoringProfile,
  type RoundScoreInput,
} from '../src/index.js';

function playerScore(input: RoundScoreInput, playerId: string) {
  const result = new ScoreCalculationService().calculateRoundScore(input);
  assert.equal(result.valid, true, result.errors.join('; '));
  const score = result.playerScores.find((candidate) => candidate.playerId === playerId);
  assert.ok(score);
  return score;
}

test('House Rules Under adds 10 to a successful normal zero estimate', () => {
  const score = playerScore({
    roundNumber: 1,
    roundType: 'under',
    bidOwnerPlayerId: 'A',
    profile: houseRulesV1ScoringProfile,
    bids: [
      { playerId: 'A', bidType: 'normal', tricks: 5, trumpSuit: 'hearts' },
      { playerId: 'B', bidType: 'normal', tricks: 3 },
      { playerId: 'C', bidType: 'normal', tricks: 2 },
      { playerId: 'D', bidType: 'normal', tricks: 0 },
    ],
    actualResults: [
      { playerId: 'A', actualTricks: 5 },
      { playerId: 'B', actualTricks: 3 },
      { playerId: 'C', actualTricks: 5 },
      { playerId: 'D', actualTricks: 0 },
    ],
  }, 'D');

  assert.equal(score.score, 20);
  assert.ok(score.notes.includes('Under zero estimate successful: +10 adjustment applied.'));
});

test('House Rules Under subtracts 10 from a failed normal zero estimate', () => {
  const score = playerScore({
    roundNumber: 1,
    roundType: 'under',
    bidOwnerPlayerId: 'A',
    profile: houseRulesV1ScoringProfile,
    bids: [
      { playerId: 'A', bidType: 'normal', tricks: 5, trumpSuit: 'hearts' },
      { playerId: 'B', bidType: 'normal', tricks: 3 },
      { playerId: 'C', bidType: 'normal', tricks: 2 },
      { playerId: 'D', bidType: 'normal', tricks: 0 },
    ],
    actualResults: [
      { playerId: 'A', actualTricks: 5 },
      { playerId: 'B', actualTricks: 3 },
      { playerId: 'C', actualTricks: 3 },
      { playerId: 'D', actualTricks: 2 },
    ],
  }, 'D');

  assert.equal(score.score, -12);
  assert.ok(score.notes.includes('Under zero estimate failed: -10 adjustment applied.'));
});
```

- [x] **Step 2: Run the focused engine test and verify RED**

Run:

```text
npm run clean
npx tsc -p tsconfig.engine.json --outDir dist
node --test dist/tests/underZeroEstimateAdjustment.test.js
```

Expected: both assertions fail because the current scores are `10` and `-2`
and no adjustment notes exist.

- [x] **Step 3: Implement the isolated modifier**

Import `HOUSE_RULES_V1` in `ConfigurableScoringStrategy.ts` and call the new
method immediately after normal success/failure role scoring and before
`applyRisk`:

```ts
score = this.applyUnderZeroEstimateAdjustment(score, context, notes);
score = this.applyRisk(score, context, notes);
```

Add:

```ts
private applyUnderZeroEstimateAdjustment(
  score: number,
  context: ScoreContext,
  notes: string[],
): number {
  const eligible = context.profile.ruleSet === HOUSE_RULES_V1
    && context.roundType === 'under'
    && context.playerBid.bidType === 'normal'
    && context.playerBid.tricks === 0;

  if (!eligible) return score;

  const adjustment = context.evaluation.didMatchBid ? 10 : -10;
  notes.push(
    `Under zero estimate ${context.evaluation.didMatchBid ? 'successful: +10' : 'failed: -10'} adjustment applied.`,
  );
  return score + adjustment;
}
```

- [x] **Step 4: Run the focused engine test and verify GREEN**

Run the same compile/test commands. Expected: 2 tests pass and the exact notes
are present.

- [x] **Step 5: Commit the scoring unit**

```text
git add src/scoring/ConfigurableScoringStrategy.ts tests/underZeroEstimateAdjustment.test.ts
git commit -m "feat: score under-round zero estimates"
```

### Task 2: Modifier ordering, exclusions, all-loser precedence, and online persistence

**Files:**
- Modify: `tests/underZeroEstimateAdjustment.test.ts`
- Modify: `src/online/games/OnlineBrowserShellService.test.ts`

**Interfaces:**
- Consumes: the Task 1 scoring modifier through `ScoreCalculationService` and `EstimationMvpService`
- Produces: regression evidence for modifier order, exclusions, all-loser precedence, and online calculated/applied equality

- [x] **Step 1: Add modifier-order coverage**

Add a test whose normal zero estimator is the only winner, the Risk taker, and
is subject to both `roundMultiplier: 2` and `multipleWithMultiplier: 2`.

```ts
test('zero adjustment precedes Risk, Only Winner, carry, and Multiple WITH', () => {
  const score = playerScore({
    roundNumber: 2,
    roundType: 'under',
    roundMultiplier: 2,
    multipleWithMultiplier: 2,
    bidOwnerPlayerId: 'A',
    riskPlayerId: 'D',
    profile: houseRulesV1ScoringProfile,
    bids: [
      { playerId: 'A', bidType: 'normal', tricks: 4, trumpSuit: 'spades' },
      { playerId: 'B', bidType: 'normal', tricks: 3 },
      { playerId: 'C', bidType: 'normal', tricks: 2 },
      { playerId: 'D', bidType: 'normal', tricks: 0 },
    ],
    actualResults: [
      { playerId: 'A', actualTricks: 5 },
      { playerId: 'B', actualTricks: 4 },
      { playerId: 'C', actualTricks: 4 },
      { playerId: 'D', actualTricks: 0 },
    ],
  }, 'D');

  // (normal 10 + zero bonus 10 + Risk 20 + Only Winner 10) x2 x2
  assert.equal(score.score, 200);
  assert.deepEqual(score.notes.slice(-2), [
    'Round multiplier applied: x2.',
    'Multiple With multiplier applied: x2.',
  ]);
});
```

- [x] **Step 2: Add exclusion and precedence coverage**

Add separate assertions proving:

- a successful Under `dash-call` remains at its established Dash Call result
  and has no zero-estimate note;
- a successful normal `0` in an Over round retains its normal score `10`;
- an exact-13 estimate set remains invalid in `EstimationMvpService`;
- a Federation 2026 normal zero estimate retains its existing Federation score
  and has no zero-estimate note;
- when all four House Rules players lose, all four scores are `[0, 0, 0, 0]`
  and `nextRoundMultiplier` is `2`.

Use four-player fixtures whose actual tricks sum to 13. Assert both the numeric
score and the absence of notes containing `Under zero estimate` for every
excluded case.

- [x] **Step 3: Run focused engine coverage**

Run:

```text
npm run clean
npx tsc -p tsconfig.engine.json --outDir dist
node --test dist/tests/underZeroEstimateAdjustment.test.js
```

Expected: all new engine tests pass.

- [x] **Step 4: Add online save/reopen coverage**

In `OnlineBrowserShellService.test.ts`, add a mutable House Rules snapshot with
four players and no overrides. Open it to seed the service's complete-game
cache, then save an Under round containing a successful normal zero estimate.
The mocked `save_game_round` handler must store the submitted
`roundResult.scoreResult.playerScores` into both `calculated_score` and
`applied_score`, matching the existing carry test's persistence behavior.

Assert:

```ts
const savePayload = saveCall?.[1].p_round_payload as any;
const zeroScore = savePayload.roundResult.scoreResult.playerScores
  .find((score: any) => score.playerId === 'p4');
expect(zeroScore.score).toBe(20);
expect(zeroScore.notes).toContain(
  'Under zero estimate successful: +10 adjustment applied.',
);

const reopened = await service.openSession('game-zero-under');
expect(reopened.roundHistory?.[0]?.playerScores[3]?.score).toBe(20);
expect(reopened.scoreSheet?.scoreOverrides).toEqual([]);
```

Also assert that the stored p4 row has
`calculated_score === applied_score === 20`.

- [x] **Step 5: Run focused online and engine suites**

Run:

```text
npx vitest run src/online/games/OnlineBrowserShellService.test.ts src/app/scoreSheet/scoreSheetViewModel.test.ts
npm run test:engine
```

Expected: the online tests pass, all engine tests pass, and no existing carry or
override assertion regresses.

- [x] **Step 6: Commit integration coverage**

```text
git add tests/underZeroEstimateAdjustment.test.ts src/online/games/OnlineBrowserShellService.test.ts
git commit -m "test: cover under-zero rule boundaries"
```

### Task 3: Validate, publish, deploy, and smoke-test stable UAT

**Files:**
- Modify: `docs/superpowers/reports/2026-07-26-uat-round-2-delivery.md`
- Modify: `.superpowers/sdd/progress.md`

**Interfaces:**
- Consumes: final CI output, draft PR branch, Vercel deployment URL, and stable UAT observations
- Produces: traceable delivery evidence and a verified stable shared UAT

- [x] **Step 1: Run the complete CI gate**

Run:

```text
npm run ci
```

Require:

- engine and React TypeScript checks pass;
- all engine tests pass;
- all UI tests pass;
- the production Vite build passes.

Record the existing bundle-size advisory separately; it is not a test failure.

- [x] **Step 2: Review scope, migrations, and secrets**

Run:

```text
git diff --check
git status --short
git diff --name-only
```

Confirm:

- no Supabase migration changed;
- no environment file, credential, token, or generated Vercel metadata is
  staged;
- Federation and Dash Call production paths changed only through shared
  regression tests, not behavior.

- [x] **Step 3: Update delivery evidence**

Document:

- the approved Under zero-estimate rule and modifier order;
- RED results (`10` instead of `20`, `-2` instead of `-12`);
- final focused and full CI counts;
- the no-migration decision;
- the Preview deployment and stable alias target;
- live success, failure, exclusion, persistence, and no-`Edited` observations.

- [x] **Step 4: Commit and push the feature branch**

```text
git add docs/superpowers/reports/2026-07-26-uat-round-2-delivery.md .superpowers/sdd/progress.md
git commit -m "docs: record under-zero rule delivery"
git push origin fix/uat-round-2-findings
```

Keep PR #15 draft and do not merge.

- [x] **Step 5: Deploy the exact pushed branch**

Run from the worktree already linked to the existing
`estimation-score-calculator` Vercel project:

```text
npx --yes vercel@latest deploy --target=preview --yes --force
```

Require a READY deployment under
`plusmaloma-6068s-projects/estimation-score-calculator`.

- [x] **Step 6: Update and verify the stable alias**

Run:

```text
$uatPreviewHost = Read-Host 'READY Preview host printed by Step 5'
npx --yes vercel@latest alias set $uatPreviewHost estimation-score-calculator-uat.vercel.app
npx --yes vercel@latest inspect estimation-score-calculator-uat.vercel.app
```

Require the inspection output to identify the newly created READY deployment,
not an earlier Preview.

- [x] **Step 7: Smoke-test the stable UAT**

Open:

```text
$uatCommit = git rev-parse --short HEAD
https://estimation-score-calculator-uat.vercel.app/?build=$uatCommit
```

Authenticate interactively when required. In a fresh House Rules game:

1. Create an Under round with a normal estimate `0` and actual `0`; verify the
   displayed score is normal score plus `10`.
2. Create another Under round with a normal estimate `0` and actual above `0`;
   verify the displayed score is normal score minus `10`.
3. Reload after each save; verify the score and running total persist with no
   `Edited` marker.
4. Verify Dash Call still receives only its existing Dash Call score.
5. Verify an all-loser round still displays four zero scores and carries the
   multiplier.

Do not report completion until the stable alias has been opened and these
checks have passed.
