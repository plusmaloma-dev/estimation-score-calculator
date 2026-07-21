# Federation All-Pass Round Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve a four-pass Federation 2026 auction as a no-score redeal that retains the same dealer and round number without adding a game-history entry.

**Architecture:** Add a focused `FederationAuctionService` before the existing bidding and scoring pipeline. Expose it through `BrowserUiShellService` as a read-only application operation; the service returns auction context only and never calls scoring or writes to the score-sheet repository.

**Tech Stack:** TypeScript, Node.js built-in test runner, `node:assert/strict`, existing framework-neutral browser shell, GitHub Actions.

## Global Constraints

- Apply this behavior only to `FEDERATION_2026` score sheets.
- Four unique pass actions cancel the deal and require a redeal.
- Retain the same dealer for the replacement deal.
- Retain the same round number for the replacement deal.
- Do not play tricks or invoke scoring for the cancelled deal.
- Do not add a completed round, score, bonus, penalty, Risk, Double Risk, or multiplier.
- Do not mutate score-sheet persistence, timestamps, balances, or leaderboard.
- Keep House Rules V1 unchanged.
- Do not implement full auction turn order, bid ranking, card shuffle/deal logic, or frontend controls in this slice.

---

## File Structure

- Create `src/auction/types.ts`: Federation auction action, input, and result contracts.
- Create `src/auction/FederationAuctionService.ts`: validation and all-pass resolution only.
- Create `tests/federationAuctionService.test.ts`: focused service-level behavior and validation.
- Modify `src/ui/BrowserUiShellService.ts`: add a read-only Federation auction resolution method.
- Create `tests/browserFederationAllPass.test.ts`: score-sheet integration and no-mutation assertions.
- Modify `src/index.ts`: export the new auction API.
- Modify `README.md`, `BACKLOG.md`, and `PROJECT_LOG.md`: document completion and next project state.

---

### Task 1: Federation auction domain service

**Files:**
- Create: `src/auction/types.ts`
- Create: `src/auction/FederationAuctionService.ts`
- Create: `tests/federationAuctionService.test.ts`

**Interfaces:**
- Produces: `FederationAuctionAction`, `FederationAuctionInput`, `FederationAuctionResolution`, and `FederationAuctionService.resolve(input)`.
- Consumes: no scoring or persistence APIs.

- [ ] **Step 1: Write the failing service tests**

Create `tests/federationAuctionService.test.ts` with these imports and helpers:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FederationAuctionService,
  type FederationAuctionAction,
} from '../src/index.js';

const players = ['A', 'B', 'C', 'D'] as const;
const fourPasses: readonly FederationAuctionAction[] = players.map((playerId) => ({
  playerId,
  actionType: 'pass',
}));
```

Add tests that assert:

```ts
const result = new FederationAuctionService().resolve({
  roundNumber: 5,
  dealerPlayerId: 'A',
  playerIds: players,
  actions: fourPasses,
});
assert.equal(result.valid, true);
assert.equal(result.status, 'redeal-required');
if (result.status === 'redeal-required') {
  assert.equal(result.reason, 'all-pass');
  assert.equal(result.roundNumber, 5);
  assert.equal(result.dealerPlayerId, 'A');
  assert.equal(result.nextDealerPlayerId, 'A');
}
```

Also cover:

```text
Three passes -> continue-auction
Three passes plus one bid -> continue-auction
Duplicate player action -> invalid
Unknown action player -> invalid
Dealer outside player list -> invalid
Non-positive round number -> invalid
More than four actions -> invalid
Player list not exactly four unique non-empty ids -> invalid
```

- [ ] **Step 2: Run CI to verify the tests fail**

Run:

```bash
npm run ci
```

Expected: TypeScript compilation fails because `FederationAuctionService` and its types are not exported yet.

- [ ] **Step 3: Add the auction contracts**

Create `src/auction/types.ts`:

```ts
export type FederationAuctionActionType = 'pass' | 'bid';

export interface FederationAuctionAction {
  readonly playerId: string;
  readonly actionType: FederationAuctionActionType;
}

export interface FederationAuctionInput {
  readonly roundNumber: number;
  readonly dealerPlayerId: string;
  readonly playerIds: readonly string[];
  readonly actions: readonly FederationAuctionAction[];
}

export type FederationAuctionResolution =
  | {
      readonly valid: true;
      readonly errors: readonly [];
      readonly status: 'continue-auction';
      readonly roundNumber: number;
      readonly dealerPlayerId: string;
    }
  | {
      readonly valid: true;
      readonly errors: readonly [];
      readonly status: 'redeal-required';
      readonly reason: 'all-pass';
      readonly roundNumber: number;
      readonly dealerPlayerId: string;
      readonly nextDealerPlayerId: string;
    }
  | {
      readonly valid: false;
      readonly errors: readonly string[];
      readonly status: 'invalid';
    };
```

- [ ] **Step 4: Implement minimal validation and resolution**

Create `src/auction/FederationAuctionService.ts` with:

```ts
import type {
  FederationAuctionInput,
  FederationAuctionResolution,
} from './types.js';

export class FederationAuctionService {
  resolve(input: FederationAuctionInput): FederationAuctionResolution {
    const errors: string[] = [];
    const playerIds = input.playerIds.map((playerId) => playerId.trim());
    const uniquePlayers = new Set(playerIds);

    if (!Number.isInteger(input.roundNumber) || input.roundNumber < 1) {
      errors.push('Round number must be a positive integer.');
    }

    if (playerIds.length !== 4 || uniquePlayers.size !== 4 || playerIds.some((playerId) => playerId.length === 0)) {
      errors.push('Exactly four unique players are required for a Federation auction.');
    }

    const dealerPlayerId = input.dealerPlayerId.trim();
    if (!uniquePlayers.has(dealerPlayerId)) {
      errors.push('Dealer must be one of the game players.');
    }

    if (input.actions.length > 4) {
      errors.push('A Federation auction cannot contain more than four actions.');
    }

    const actedPlayers = new Set<string>();
    for (const action of input.actions) {
      const playerId = action.playerId.trim();
      if (!uniquePlayers.has(playerId)) {
        errors.push(`Auction action player is not part of the game: ${playerId}.`);
      }
      if (actedPlayers.has(playerId)) {
        errors.push(`Player ${playerId} cannot act more than once in the same auction attempt.`);
      }
      actedPlayers.add(playerId);
    }

    if (errors.length > 0) {
      return { valid: false, errors, status: 'invalid' };
    }

    const allPlayersPassed = input.actions.length === 4 && input.actions.every((action) => action.actionType === 'pass');
    if (allPlayersPassed) {
      return {
        valid: true,
        errors: [],
        status: 'redeal-required',
        reason: 'all-pass',
        roundNumber: input.roundNumber,
        dealerPlayerId,
        nextDealerPlayerId: dealerPlayerId,
      };
    }

    return {
      valid: true,
      errors: [],
      status: 'continue-auction',
      roundNumber: input.roundNumber,
      dealerPlayerId,
    };
  }
}
```

- [ ] **Step 5: Export the auction API**

Add to `src/index.ts`:

```ts
export * from './auction/types.js';
export * from './auction/FederationAuctionService.js';
```

- [ ] **Step 6: Run the complete suite**

Run:

```bash
npm run ci
```

Expected: the new service tests and all existing tests pass.

- [ ] **Step 7: Commit the service slice**

```bash
git add src/auction/types.ts src/auction/FederationAuctionService.ts src/index.ts tests/federationAuctionService.test.ts
git commit -m "feat: resolve Federation all-pass auctions"
```

---

### Task 2: Browser-shell integration without persistence mutation

**Files:**
- Modify: `src/ui/BrowserUiShellService.ts`
- Create: `tests/browserFederationAllPass.test.ts`

**Interfaces:**
- Consumes: `FederationAuctionService.resolve`, `FederationAuctionAction`, and `FEDERATION_2026`.
- Produces: `BrowserUiShellService.resolveFederationAuction(scoreSheetId, input)`.

- [ ] **Step 1: Write failing browser integration tests**

Create `tests/browserFederationAllPass.test.ts` and build a UI with an explicit repository reference:

```ts
const repository = new InMemoryScoreSheetRepository();
const ui = new BrowserUiShellService(repository);
const created = ui.createScoreSheet({
  name: 'Federation All-Pass',
  ruleSet: FEDERATION_2026,
  players,
  nowIso: '2026-07-21T10:00:00.000Z',
});
const scoreSheetId = created.scoreSheet?.id;
assert.ok(scoreSheetId);
const before = repository.getById(scoreSheetId);
assert.ok(before);
```

Call:

```ts
const result = ui.resolveFederationAuction(scoreSheetId, {
  roundNumber: 3,
  dealerPlayerId: 'B',
  actions: [
    { playerId: 'A', actionType: 'pass' },
    { playerId: 'B', actionType: 'pass' },
    { playerId: 'C', actionType: 'pass' },
    { playerId: 'D', actionType: 'pass' },
  ],
});
```

Assert `redeal-required`, round `3`, and dealer `B`. Fetch the score sheet again and assert:

```ts
assert.deepEqual(repository.getById(scoreSheetId), before);
assert.equal(before.roundCount, 0);
assert.deepEqual(before.gameResult?.leaderboard, []);
```

Also test:

```text
House Rules V1 score sheet -> invalid with Federation-only error
Missing score sheet -> invalid with not-found error
Invalid duplicate action -> invalid and no repository mutation
Auction containing a bid -> continue-auction and no repository mutation
```

- [ ] **Step 2: Run CI to verify browser tests fail**

Run:

```bash
npm run ci
```

Expected: TypeScript compilation fails because `resolveFederationAuction` does not exist.

- [ ] **Step 3: Add browser input and method**

In `src/ui/BrowserUiShellService.ts`, import:

```ts
import {
  FederationAuctionService,
  type FederationAuctionAction,
  type FederationAuctionResolution,
} from '../auction/FederationAuctionService.js';
```

Use the correct split imports in implementation: service from `FederationAuctionService.js`, types from `types.js`.

Add:

```ts
export interface UiFederationAuctionInput {
  readonly roundNumber: number;
  readonly dealerPlayerId: string;
  readonly actions: readonly FederationAuctionAction[];
}
```

Inject the service as the final constructor dependency:

```ts
private readonly federationAuctionService = new FederationAuctionService(),
```

Add this public method before round preview/save methods:

```ts
resolveFederationAuction(
  scoreSheetId: string,
  input: UiFederationAuctionInput,
): FederationAuctionResolution {
  const scoreSheet = this.repository.getById(scoreSheetId);
  if (scoreSheet === undefined) {
    return {
      valid: false,
      errors: [`Score sheet not found: ${scoreSheetId}.`],
      status: 'invalid',
    };
  }

  if (resolveScoringRuleSetId(scoreSheet.gameInput.ruleSet) !== FEDERATION_2026) {
    return {
      valid: false,
      errors: ['Federation auction resolution is only available for FEDERATION_2026 score sheets.'],
      status: 'invalid',
    };
  }

  return this.federationAuctionService.resolve({
    roundNumber: input.roundNumber,
    dealerPlayerId: input.dealerPlayerId,
    playerIds: scoreSheet.playerOrder,
    actions: input.actions,
  });
}
```

Import `FEDERATION_2026` alongside the existing rule-set helpers.

- [ ] **Step 4: Run the complete suite**

Run:

```bash
npm run ci
```

Expected: all browser integration tests and existing tests pass; no repository write is introduced.

- [ ] **Step 5: Commit the browser integration**

```bash
git add src/ui/BrowserUiShellService.ts tests/browserFederationAllPass.test.ts
git commit -m "feat: expose Federation all-pass resolution"
```

---

### Task 3: Documentation, tracking, and final verification

**Files:**
- Modify: `README.md`
- Modify: `BACKLOG.md`
- Modify: `PROJECT_LOG.md`

**Interfaces:**
- Consumes: verified service and browser behavior.
- Produces: accurate public usage guidance and project status.

- [ ] **Step 1: Add README usage**

Document that `resolveFederationAuction` returns `redeal-required` after four passes and does not save a round. Include:

```ts
const auction = ui.resolveFederationAuction(scoreSheetId, {
  roundNumber: 5,
  dealerPlayerId: 'A',
  actions: playerIds.map((playerId) => ({ playerId, actionType: 'pass' })),
});

if (auction.status === 'redeal-required') {
  // Shuffle and deal again using the same roundNumber and nextDealerPlayerId.
}
```

- [ ] **Step 2: Update backlog status**

Mark `US-216E — Federation All-Pass Round` as Done and record:

```text
Four passes cancel the deal.
Same dealer and same round number are retained.
No round history, score, leaderboard, bonus, Risk, or multiplier mutation occurs.
```

Set Federation support to 100% for the currently defined backend rules and identify `US-220 — React/Vite Frontend Prototype` as next.

- [ ] **Step 3: Update project log**

Add a new run entry with:

```text
Feature branch and PR details
Core and browser tests added
TDD red and green CI run numbers
Final CI run number
Merge status
Next item: React/Vite frontend prototype
```

Before merge, state that the PR is pending merge; after merge, append the merge commit in a separate main-branch log commit.

- [ ] **Step 4: Run final verification**

Run:

```bash
npm run ci
```

Expected: typecheck passes, every test passes, and build passes.

- [ ] **Step 5: Review the branch diff**

Verify:

```text
No scoring service changes
No persistence writes in resolveFederationAuction
No House Rules V1 behavior changes
No frontend framework dependency added
```

- [ ] **Step 6: Commit documentation**

```bash
git add README.md BACKLOG.md PROJECT_LOG.md
git commit -m "docs: complete Federation all-pass tracking"
```

- [ ] **Step 7: Open and merge the pull request after green CI**

Create a PR from `feature/federation-all-pass` to `main`, mark it ready after final CI succeeds, then merge using squash merge.
