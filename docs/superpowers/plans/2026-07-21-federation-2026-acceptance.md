# Federation 2026 Acceptance Coverage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add game-level Federation 2026 acceptance coverage, repair Federation Dash Under and all-loser behavior, and prove House Rules V1 remains unchanged.

**Architecture:** A focused acceptance test file will exercise `EstimationMvpService.calculateGame` with `MvpGameInput.ruleSet = FEDERATION_2026`. Production changes stay inside shared round evaluation/orchestration: Federation Dash Under must use its table score without an additional automatic round-risk modifier, and the shared House all-loser shortcut must not run for Federation games.

**Tech Stack:** TypeScript, Node.js built-in test runner, `node:assert/strict`, GitHub Actions, existing scoring services.

## Global Constraints

- Keep Egyptian Estimation separate from Planning Poker.
- Keep `HOUSE_RULES_V1` and `FEDERATION_2026` behavior isolated.
- Lock one selected rule set for the entire game.
- Total bids must never equal 13.
- Total actual tricks must equal 13.
- Defer Federation All-Pass, multiple WITH owners, and owner-plus-Risk stacking.
- Make no frontend changes in this slice.

---

### Task 1: Add Federation game-level acceptance scenarios

**Files:**
- Create: `tests/federation2026Acceptance.test.ts`

**Interfaces:**
- Consumes: `EstimationMvpService.calculateGame(input: MvpGameInput): MvpGameResult`, `FEDERATION_2026`, `HOUSE_RULES_V1`, and `ScoringProfile` from `src/index.ts`.
- Produces: Regression coverage for Federation scoring and House all-loser isolation.

- [ ] **Step 1: Add shared test helpers**

Create a minimal Federation profile and helpers that calculate one-round games, assert valid results, and retrieve a player score by id.

```ts
const federationProfile: ScoringProfile = {
  id: 'federation-2026',
  name: 'Federation 2026',
  type: 'standard',
  ruleSet: FEDERATION_2026,
  highContractThreshold: 8,
};

function calculateRound(round: MvpRoundInput, ruleSet = FEDERATION_2026) {
  const result = new EstimationMvpService().calculateGame({
    ruleSet,
    playerOrder: ['A', 'B', 'C', 'D'],
    rounds: [round],
  });
  assert.equal(result.valid, true, result.errors.join('; '));
  const scoredRound = result.rounds[0];
  assert.ok(scoredRound?.scoreResult);
  return scoredRound.scoreResult;
}
```

- [ ] **Step 2: Add normal, owner, and WITH tests**

Cover these expected values without Risk or Only Winner/Loser affecting the target score:

```text
Owner call 4 success = 27
Normal call 4 success = 17
Owner call 4 failure with delta 1 = -11
Normal call 4 failure with delta 1 = -1
WITH call 4 success = 27
WITH call 4 failure with delta 1 = -11
```

Assert the target roles are `bid-owner`, `other-player`, and `with-player` as applicable.

- [ ] **Step 3: Add Risk and Double Risk tests**

Use a non-owner normal player as `riskPlayerId`:

```text
Total bids 15: Risk modifier 10
Normal success call 4: 17 + 10 = 27
Normal failure delta 1: -1 - 10 = -11

Total bids 17: Double Risk modifier 20
Normal success call 4: 17 + 20 = 37
Normal failure delta 1: -1 - 20 = -21
```

Assert `isRiskTaker`, `riskModifier`, and `role === 'risk-taker'`.

- [ ] **Step 4: Add Dash Under and Over tests**

Use these Federation table expectations:

```text
Dash Under success = 23
Dash Under failure delta 1 = -11
Dash Over success = 13
Dash Over failure delta 1 = -1
```

The Dash Under test must use total bids 11 so the current automatic Risk behavior would incorrectly add or subtract 10 before the repair.

- [ ] **Step 5: Add Super 8/9/10 tests**

Use table-driven cases:

```ts
[
  { call: 8, success: 41 },
  { call: 9, success: 42 },
  { call: 10, success: 43 },
]
```

For each call, assert a failure with delta 1 scores `-21`.

- [ ] **Step 6: Add Only Winner and Only Loser tests**

Assert:

```text
Only winning owner call 4 = 27 + 10 = 37
Only losing normal call 4 with delta 1 = -1 - 10 = -11
```

Also assert the corresponding boolean flags.

- [ ] **Step 7: Add Federation and House all-loser isolation tests**

For bids `[4, 4, 4, 0]` and actuals `[3, 3, 3, 4]`, assert Federation scores:

```text
A owner = -11
B normal = -1
C normal = -1
D Dash Under = -14
nextRoundMultiplier = undefined
```

Run the same round with `HOUSE_RULES_V1` and assert all scores are zero and `nextRoundMultiplier === 2`.

- [ ] **Step 8: Commit the failing acceptance suite**

```bash
git add tests/federation2026Acceptance.test.ts
git commit -m "test: add Federation 2026 acceptance coverage"
```

Expected CI result: failure in Dash Under expectations and Federation all-loser expectations before production repair.

---

### Task 2: Repair Federation-specific shared orchestration

**Files:**
- Modify: `src/scoring/ScoreCalculationService.ts`
- Test: `tests/federation2026Acceptance.test.ts`

**Interfaces:**
- Consumes: `ScoringProfile.ruleSet` and `FEDERATION_2026`.
- Produces: Federation rounds that retain calculated all-loser scores and avoid an extra automatic Dash Under Risk modifier.

- [ ] **Step 1: Import the Federation rule-set id**

```ts
import { FEDERATION_2026 } from './ruleSets.js';
```

- [ ] **Step 2: Restrict the all-loser shortcut**

Change the shared shortcut condition to:

```ts
const usesHouseAllLoserHandling = input.profile.ruleSet !== FEDERATION_2026;

if (errors.length === 0 && allPlayersLost && usesHouseAllLoserHandling) {
  // existing zero-score and multiplier behavior
}
```

Federation rounds will continue into `Federation2026ScoringStrategy` for each player.

- [ ] **Step 3: Prevent automatic Dash Under Risk stacking in Federation mode**

Change Dash Under automatic risk detection to:

```ts
const isDashUnderRisk =
  input.profile.ruleSet !== FEDERATION_2026 &&
  input.roundType === 'under' &&
  bid.bidType === 'dash' &&
  roundRiskLevel > 0;
```

Explicit `riskPlayerId` handling remains unchanged.

- [ ] **Step 4: Commit the minimal repair**

```bash
git add src/scoring/ScoreCalculationService.ts
git commit -m "fix: isolate Federation round scoring behavior"
```

---

### Task 3: Verify and document completion

**Files:**
- Modify: `BACKLOG.md`
- Modify: `PROJECT_LOG.md`

**Interfaces:**
- Consumes: successful acceptance and CI results.
- Produces: accurate project status with US-216D complete and US-216E next.

- [ ] **Step 1: Run the focused acceptance test**

```bash
npm test -- --test-name-pattern="Federation 2026"
```

Expected: all matching Federation acceptance tests pass.

- [ ] **Step 2: Run full verification**

```bash
npm run ci
```

Expected: typecheck passes, all tests pass with zero failures, and build passes.

- [ ] **Step 3: Update project tracking**

Mark US-216D Done, record the tested scoring categories and fixes, increase Federation support progress, and identify US-216E Federation All-Pass as next.

- [ ] **Step 4: Commit documentation**

```bash
git add BACKLOG.md PROJECT_LOG.md
git commit -m "docs: complete Federation acceptance slice"
```

- [ ] **Step 5: Re-run full verification after documentation**

```bash
npm run ci
```

Expected: typecheck, all tests, and build pass.
