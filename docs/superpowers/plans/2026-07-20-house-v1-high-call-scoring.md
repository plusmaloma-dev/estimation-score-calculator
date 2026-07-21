# House Rules V1 High-Call Scoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Update House Rules V1 calls of 8 or higher to score successful calls as `call²` and failed calls as `-delta - escalating penalty`, while leaving Federation 2026 unchanged.

**Architecture:** Extend `ScoringProfile` with explicit optional high-contract formula settings. `ConfigurableScoringStrategy` will use the new settings when present and retain the legacy linear formula as a backward-compatible fallback. Federation scoring remains isolated in `Federation2026ScoringStrategy`.

**Tech Stack:** TypeScript, Node.js built-in test runner, existing scoring services.

## Global Constraints

- Egyptian Estimation only; do not introduce Planning Poker concepts.
- Apply the new formula only to House Rules V1/configurable profiles that opt in.
- WITH uses the same high-contract formula independently.
- Risk/Double Risk and Only Winner/Only Loser remain unchanged.
- Do not apply the x2/x4 multiplier to high contracts.
- Do not change Federation 2026 scoring.

---

### Task 1: Add House Rules V1 high-call regression tests

**Files:**
- Modify: `tests/finalizedScoringRules.test.ts`

**Interfaces:**
- Consumes: `ScoreCalculationService.calculateRoundScore(input)`.
- Produces: regression coverage for success, failure, WITH, modifiers, multiplier exclusion, and Federation isolation.

- [ ] **Step 1: Update the House Rules test profile**

Add:

```ts
highContractSuccessFormula: 'square',
highContractFailurePenaltyBase: 30,
highContractFailurePenaltyStep: 10,
```

Keep the legacy high-contract fields temporarily so the test proves the new explicit formula takes precedence.

- [ ] **Step 2: Add failing success tests**

Cover calls 8, 9, and 10 with expected scores 64, 81, and 100.

- [ ] **Step 3: Add failing failure tests**

Cover:

```text
call 8, delta 1 => -31
call 9, delta 2 => -42
call 10, delta 4 => -54
```

- [ ] **Step 4: Add failing WITH test**

Create a call-9 owner and a WITH-9 player. Verify each is evaluated independently and receives either `81` or `-delta - 40` according to actual tricks.

- [ ] **Step 5: Add modifier and multiplier tests**

Verify Risk/Double Risk and Only Winner/Only Loser stack after the base result. Verify `roundMultiplier: 2` does not change a high-contract score.

- [ ] **Step 6: Run the focused test to verify RED**

Run:

```bash
npm test -- tests/finalizedScoringRules.test.ts
```

Expected: FAIL because the new profile fields and formulas are not implemented.

- [ ] **Step 7: Commit the failing tests**

```bash
git add tests/finalizedScoringRules.test.ts
git commit -m "test: define House V1 high-call scoring"
```

---

### Task 2: Implement configurable square success and escalating failure

**Files:**
- Modify: `src/scoring/types.ts`
- Modify: `src/scoring/ConfigurableScoringStrategy.ts`

**Interfaces:**
- Produces these optional `ScoringProfile` properties:

```ts
readonly highContractSuccessFormula?: 'linear' | 'square';
readonly highContractFailurePenaltyBase?: number;
readonly highContractFailurePenaltyStep?: number;
```

- [ ] **Step 1: Add profile fields**

Add the three optional fields next to the existing high-contract configuration.

- [ ] **Step 2: Implement successful high-contract selection**

In `calculateHighContractScore`, calculate:

```ts
const score = profile.highContractSuccessFormula === 'square'
  ? playerBid.tricks * playerBid.tricks
  : profile.highContractWinBase +
    (playerBid.tricks - highContractThreshold) * profile.highContractWinStep;
```

Retain the legacy pending/fallback behavior when neither complete configuration is available.

- [ ] **Step 3: Implement failed high-contract selection**

When both new penalty fields are configured, calculate:

```ts
const penalty =
  profile.highContractFailurePenaltyBase +
  (playerBid.tricks - highContractThreshold) * profile.highContractFailurePenaltyStep;
const score = -evaluation.delta - penalty;
```

Otherwise retain the existing signed linear loss formula.

- [ ] **Step 4: Preserve modifier order**

Continue to call `applyRisk` then `applyOnlyWinnerLoser`. Continue skipping `applyRoundMultiplier` for high contracts.

- [ ] **Step 5: Run focused tests to verify GREEN**

Run:

```bash
npm test -- tests/finalizedScoringRules.test.ts
```

Expected: PASS.

- [ ] **Step 6: Run full CI**

Run:

```bash
npm run ci
```

Expected: typecheck, all tests, and build pass.

- [ ] **Step 7: Commit implementation**

```bash
git add src/scoring/types.ts src/scoring/ConfigurableScoringStrategy.ts
git commit -m "feat: update House V1 high-call scoring"
```

---

### Task 3: Update rule documentation and project tracking

**Files:**
- Modify: `PROJECT_RULES.md`
- Modify: `RULE_BASELINE_V1.md`
- Modify: `BACKLOG.md`
- Modify: `PROJECT_LOG.md`

**Interfaces:**
- Produces the authoritative documented House Rules V1 high-call formulas.

- [ ] **Step 1: Document success and failure formulas**

Add:

```text
success = call × call
failure penalty = 30 + ((call - 8) × 10)
failure score = -delta - failure penalty
```

- [ ] **Step 2: Document WITH and modifiers**

State that WITH uses the same formula independently, modifiers stack normally, and x2/x4 remains excluded.

- [ ] **Step 3: Record Federation isolation**

State that Federation 2026 Super 8/9/10 scoring is unchanged.

- [ ] **Step 4: Update progress/log**

Mark the House Rules V1 high-call change implemented but pending CI unless a green run is available.

- [ ] **Step 5: Commit documentation**

```bash
git add PROJECT_RULES.md RULE_BASELINE_V1.md BACKLOG.md PROJECT_LOG.md
git commit -m "docs: record House V1 high-call formula"
```
